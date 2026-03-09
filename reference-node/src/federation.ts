/**
 * Federation module — cross-node federated search, GAID resolution, peer health monitoring, gossip protocol.
 */
import type Database from 'better-sqlite3';

// --- Types ---

interface PeerRow {
  id: number;
  url: string;
  name: string;
  node_id: string | null;
  status: string;
  last_synced: string | null;
  hop: number;
}

interface FederatedResult<T = unknown> {
  data: Array<T & { _source_node?: string }>;
  meta: { total: number; page: number; limit: number; node_name?: string; node_id?: string; facets?: Record<string, number> };
}

// --- Helpers ---

function auditLog(db: Database.Database, eventType: string, gaid?: string, actor?: string, detail?: Record<string, unknown>) {
  db.prepare('INSERT INTO audit_log (event_type, gaid, actor, detail) VALUES (?, ?, ?, ?)').run(
    eventType, gaid ?? null, actor ?? 'system', detail ? JSON.stringify(detail) : null,
  );
}

/** Fetch from a peer with timeout and X-DUADP-Node-ID header */
async function fetchPeer(url: string, nodeId: string, timeoutMs = 3000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { 'X-DUADP-Node-ID': nodeId, Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// --- Exports ---

export function getHealthyPeers(db: Database.Database): PeerRow[] {
  return db.prepare("SELECT * FROM peers WHERE status != 'unreachable' ORDER BY id ASC").all() as PeerRow[];
}

export function updatePeerStatus(db: Database.Database, url: string, status: 'healthy' | 'degraded' | 'unreachable') {
  db.prepare("UPDATE peers SET status = ?, last_synced = datetime('now') WHERE url = ?").run(status, url);
}

/** Query all healthy peers for a given API path, merge results with source_node tagging */
export async function federatedFetch<T>(
  db: Database.Database,
  path: string,
  queryParams: Record<string, string>,
  nodeId: string,
): Promise<{ results: Array<T & { _source_node?: string }>; peerMeta: Array<{ url: string; total: number; ms: number }> }> {
  const peers = getHealthyPeers(db);
  if (peers.length === 0) return { results: [], peerMeta: [] };

  const peerMeta: Array<{ url: string; total: number; ms: number }> = [];
  const results: Array<T & { _source_node?: string }> = [];

  const fetches = peers.map(async (peer) => {
    const qs = new URLSearchParams({ ...queryParams, federated: 'false' }).toString();
    const url = `${peer.url}${path}?${qs}`;
    const start = Date.now();
    try {
      const resp = await fetchPeer(url, nodeId);
      if (!resp.ok) {
        updatePeerStatus(db, peer.url, 'degraded');
        return;
      }
      const json = await resp.json() as FederatedResult<T>;
      const ms = Date.now() - start;
      updatePeerStatus(db, peer.url, 'healthy');
      peerMeta.push({ url: peer.url, total: json.meta?.total ?? json.data?.length ?? 0, ms });

      for (const item of json.data ?? []) {
        (item as any)._source_node = peer.name || peer.url;
        results.push(item as T & { _source_node?: string });
      }
    } catch {
      updatePeerStatus(db, peer.url, 'unreachable');
    }
  });

  await Promise.allSettled(fetches);
  return { results, peerMeta };
}

/** Deduplicate resources by GAID (identity.gaid), keeping local entries first */
export function deduplicateByGaid<T>(local: T[], remote: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const item of local) {
    const gaid = (item as any)?.identity?.gaid || (item as any)?.metadata?.name;
    if (gaid) seen.add(gaid);
    out.push(item);
  }

  for (const item of remote) {
    const gaid = (item as any)?.identity?.gaid || (item as any)?.metadata?.name;
    if (gaid && seen.has(gaid)) continue;
    if (gaid) seen.add(gaid);
    out.push(item);
  }

  return out;
}

/** Resolve a GAID from peers — returns first successful match */
export async function resolveGaidFromPeers(
  db: Database.Database,
  gaid: string,
  nodeId: string,
): Promise<{ resource: unknown; source_node: string } | null> {
  const peers = getHealthyPeers(db);
  if (peers.length === 0) return null;

  // Try WebFinger on each peer in parallel
  const results = await Promise.allSettled(
    peers.map(async (peer) => {
      const url = `${peer.url}/.well-known/webfinger?resource=${encodeURIComponent(gaid)}`;
      const resp = await fetchPeer(url, nodeId);
      if (!resp.ok) return null;
      const data = await resp.json();
      return { resource: data, source_node: peer.name || peer.url };
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) return result.value;
  }
  return null;
}

/** Resolve a GAID locally — check resources table by GAID, name, or DID */
export function resolveGaidLocally(db: Database.Database, gaid: string): unknown | null {
  // Extract the name part from various GAID formats
  let name: string | null = null;
  if (gaid.startsWith('agent://')) {
    const parts = gaid.replace('agent://', '').split('/');
    name = parts[parts.length - 1]; // last segment is the name
  } else if (gaid.startsWith('acct:')) {
    name = gaid.replace('acct:', '').split('@')[0];
  } else {
    name = gaid;
  }
  if (!name) return null;

  const row = db.prepare(
    "SELECT data FROM resources WHERE name = ? OR json_extract(data, '$.identity.gaid') = ?",
  ).get(name, gaid) as { data: string } | undefined;

  return row ? JSON.parse(row.data) : null;
}

/** Start periodic health checks for all peers */
export function startHealthChecks(db: Database.Database, nodeId: string, intervalMs = 60_000): NodeJS.Timeout {
  const check = async () => {
    const peers = db.prepare('SELECT * FROM peers ORDER BY id ASC').all() as PeerRow[];
    for (const peer of peers) {
      try {
        const resp = await fetchPeer(`${peer.url}/api/v1/health`, nodeId, 5000);
        const newStatus = resp.ok ? 'healthy' : 'degraded';
        if (peer.status !== newStatus) {
          auditLog(db, 'federation.health_change', undefined, 'system', {
            peer_url: peer.url, old_status: peer.status, new_status: newStatus,
          });
        }
        updatePeerStatus(db, peer.url, newStatus as 'healthy' | 'degraded');
      } catch {
        if (peer.status !== 'unreachable') {
          auditLog(db, 'federation.health_change', undefined, 'system', {
            peer_url: peer.url, old_status: peer.status, new_status: 'unreachable',
          });
        }
        updatePeerStatus(db, peer.url, 'unreachable');
      }
    }
  };

  // Run immediately, then on interval
  check().catch(() => {});
  return setInterval(() => { check().catch(() => {}); }, intervalMs);
}

/** Register peers from DUADP_PEERS env var (comma-separated URLs) */
export async function registerEnvPeers(db: Database.Database, nodeId: string, nodeName: string) {
  const peersEnv = process.env.DUADP_PEERS;
  if (!peersEnv) return;

  const urls = peersEnv.split(',').map((u) => u.trim()).filter(Boolean);
  for (const url of urls) {
    try {
      // Check if already registered
      const existing = db.prepare('SELECT id FROM peers WHERE url = ?').get(url);
      if (existing) continue;

      // Try to get peer info
      let peerName = url;
      let peerNodeId: string | undefined;
      try {
        const resp = await fetchPeer(`${url}/api/v1/health`, nodeId, 5000);
        if (resp.ok) {
          const health = await resp.json() as { node_name?: string; node_id?: string };
          peerName = health.node_name || url;
          peerNodeId = health.node_id;
        }
      } catch { /* use url as name */ }

      db.prepare('INSERT OR IGNORE INTO peers (url, name, node_id, hop) VALUES (?, ?, ?, ?)').run(
        url, peerName, peerNodeId ?? null, 0,
      );
      auditLog(db, 'peer.auto_registered', undefined, 'system', { url, name: peerName });
      console.log(`  Registered peer: ${peerName} (${url})`);

      // Reciprocal registration — tell the peer about us
      try {
        await fetchPeer(`${url}/api/v1/federation`, nodeId, 5000).then(() =>
          fetch(`${url}/api/v1/federation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-DUADP-Node-ID': nodeId },
            body: JSON.stringify({ url: process.env.DUADP_BASE_URL || process.env.BASE_URL, name: nodeName, node_id: nodeId }),
          }),
        );
      } catch { /* peer may not be up yet */ }
    } catch (err) {
      console.warn(`  Failed to register peer ${url}:`, err);
    }
  }
}
