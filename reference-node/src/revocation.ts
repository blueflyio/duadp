/**
 * Revocation module — revocation propagation via federation gossip.
 *
 * When a resource is revoked (DELETE + reason), the revocation is:
 *   1. Stored locally in the revocations table
 *   2. Propagated to all healthy peers via POST /api/v1/federation/revocations
 *   3. Peers store the revocation and block re-registration of the GAID
 */
import type Database from 'better-sqlite3';

export interface RevocationRecord {
  gaid: string;
  kind: string;
  name: string;
  reason: string;
  revoked_by?: string;
  origin_node?: string;
  created_at?: string;
}

interface PeerRow {
  url: string;
  name: string;
  node_id: string | null;
  status: string;
}

/** Store a revocation locally */
export function storeRevocation(
  db: Database.Database,
  record: RevocationRecord,
): void {
  db.prepare(
    'INSERT INTO revocations (gaid, kind, name, reason, revoked_by, origin_node) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    record.gaid,
    record.kind,
    record.name,
    record.reason,
    record.revoked_by ?? null,
    record.origin_node ?? null,
  );
}

/** Check if a GAID has been revoked */
export function isRevoked(db: Database.Database, gaid: string): boolean {
  const row = db.prepare('SELECT id FROM revocations WHERE gaid = ? LIMIT 1').get(gaid);
  return !!row;
}

/** Check if a name has been revoked */
export function isNameRevoked(db: Database.Database, name: string): boolean {
  const row = db.prepare('SELECT id FROM revocations WHERE name = ? LIMIT 1').get(name);
  return !!row;
}

/** Get all revocations */
export function listRevocations(
  db: Database.Database,
  limit = 50,
  offset = 0,
): { data: RevocationRecord[]; total: number } {
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM revocations').get() as { cnt: number };
  const rows = db.prepare(
    'SELECT * FROM revocations ORDER BY id DESC LIMIT ? OFFSET ?',
  ).all(limit, offset) as Array<{
    gaid: string;
    kind: string;
    name: string;
    reason: string;
    revoked_by: string | null;
    origin_node: string | null;
    created_at: string;
  }>;

  return {
    data: rows.map((r) => ({
      gaid: r.gaid,
      kind: r.kind,
      name: r.name,
      reason: r.reason,
      revoked_by: r.revoked_by ?? undefined,
      origin_node: r.origin_node ?? undefined,
      created_at: r.created_at,
    })),
    total: countRow.cnt,
  };
}

/** Propagate a revocation to all healthy peers via gossip */
export async function propagateRevocation(
  db: Database.Database,
  record: RevocationRecord,
  nodeId: string,
): Promise<{ propagated: number; failed: number }> {
  const peers = db.prepare("SELECT * FROM peers WHERE status != 'unreachable' ORDER BY id ASC").all() as PeerRow[];
  let propagated = 0;
  let failed = 0;

  const fetches = peers.map(async (peer) => {
    try {
      const resp = await fetch(`${peer.url}/api/v1/federation/revocations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DUADP-Node-ID': nodeId,
        },
        body: JSON.stringify({
          ...record,
          origin_node: record.origin_node || nodeId,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        propagated++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  });

  await Promise.allSettled(fetches);

  // Mark as propagated
  db.prepare('UPDATE revocations SET propagated = 1 WHERE gaid = ?').run(record.gaid);

  return { propagated, failed };
}
