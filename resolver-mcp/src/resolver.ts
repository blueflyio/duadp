// DUADP Resolver — implements the 6-phase federated discovery pipeline
//
// Phase 1: Validate and classify the seed
// Phase 2: Fetch the discovery document (well-known or registry)
// Phase 3: Parse the advertised surface
// Phase 4: Load the OSSA contract (optional)
// Phase 5: Select execution channel (returned in result)
// Phase 6: Cache and sync (freshness metadata)

import axios from 'axios';
import type {
  SeedType,
  WellKnownDoc,
  DuadpNode,
  OssaManifestSurface,
  DuadpResolutionRequest,
  DuadpResolutionResult,
  FederationSource,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CACHE_TTL_S = 3_600;

const http = axios.create({ timeout: DEFAULT_TIMEOUT_MS });

// ── Phase 1: Classify seed ────────────────────────────────────────────────────

export function classifySeed(value: string): SeedType {
  if (value.startsWith('gaid:') || value.startsWith('agent://') || value.startsWith('duadp://')) {
    return 'gaid';
  }
  if (value.startsWith('https://') || value.startsWith('http://')) {
    if (value.includes('manifest') || value.endsWith('.yaml') || value.endsWith('.json')) {
      return 'manifest_url';
    }
    if (value.includes('/mcp') || value.includes('/sse')) {
      return 'mcp_endpoint';
    }
    return 'manifest_url';
  }
  return 'domain';
}

// ── Phase 2: Fetch discovery document ────────────────────────────────────────

export async function fetchWellKnown(domain: string): Promise<{
  doc: WellKnownDoc;
  url: string;
  source: FederationSource;
}> {
  const base = domain.startsWith('http') ? domain : `https://${domain}`;
  const url = `${base.replace(/\/$/, '')}/.well-known/duadp.json`;

  const resp = await http.get<WellKnownDoc>(url, {
    headers: { Accept: 'application/json' },
    validateStatus: (s) => s === 200,
  });

  return { doc: resp.data, url, source: 'direct' };
}

export async function fetchOssaManifest(manifestUrl: string): Promise<OssaManifestSurface> {
  const resp = await http.get<OssaManifestSurface>(manifestUrl, {
    headers: { Accept: 'application/json, application/yaml, */*' },
    validateStatus: (s) => s === 200,
  });
  return resp.data;
}

export async function resolveDomainFromGaid(gaid: string): Promise<string | null> {
  // GAID format: gaid:<namespace>:<id> or agent://<domain>/...
  if (gaid.startsWith('agent://')) {
    const match = gaid.match(/^agent:\/\/([^/]+)/);
    return match?.[1] ?? null;
  }
  // gaid:<namespace>:<id> — namespace is often the domain
  const parts = gaid.split(':');
  if (parts.length >= 2) {
    const ns = parts[1];
    if (ns.includes('.')) return ns;
  }
  return null;
}

// ── Phase 3–6: Full pipeline ──────────────────────────────────────────────────

export async function resolve(req: DuadpResolutionRequest): Promise<DuadpResolutionResult> {
  const phases: string[] = [];
  const seedType = req.seed_type;
  const seedValue = req.seed_value;

  let wellKnownUrl: string | undefined;
  let doc: WellKnownDoc | undefined;
  let source: FederationSource = 'direct';

  try {
    phases.push('phase1:seed-classified');

    // Phase 2: get well-known doc based on seed type
    if (seedType === 'domain') {
      const result = await fetchWellKnown(seedValue);
      doc = result.doc;
      wellKnownUrl = result.url;
      source = result.source;
      phases.push('phase2:well-known-fetched');
    } else if (seedType === 'gaid') {
      const domain = await resolveDomainFromGaid(seedValue);
      if (domain) {
        const result = await fetchWellKnown(domain);
        doc = result.doc;
        wellKnownUrl = result.url;
        source = result.source;
        phases.push('phase2:gaid-resolved-via-domain');
      } else {
        phases.push('phase2:gaid-domain-extraction-failed');
      }
    } else if (seedType === 'manifest_url') {
      // Try fetching as OSSA manifest directly
      const manifest = await fetchOssaManifest(seedValue);
      phases.push('phase2:manifest-fetched-directly');

      // Build a partial node from the manifest
      const node: DuadpNode = {
        ossa_manifest_url: seedValue,
        mcp_endpoint: manifest.mcp_endpoint,
        capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities : [],
        trust: {},
        federation: { source: 'direct', freshness_ts: new Date().toISOString(), cache_ttl_s: DEFAULT_CACHE_TTL_S },
      };

      return {
        status: 'partial',
        node,
        ossa_manifest: manifest,
        diagnostics: { source: 'manifest-url', cache_hit: false, verification: 'manifest-loaded', phases_completed: phases },
      };
    } else if (seedType === 'mcp_endpoint') {
      // We know the MCP endpoint; build minimal node
      const node: DuadpNode = {
        mcp_endpoint: seedValue,
        capabilities: [],
        trust: {},
        federation: { source: 'direct', freshness_ts: new Date().toISOString(), cache_ttl_s: DEFAULT_CACHE_TTL_S },
      };
      phases.push('phase2:mcp-endpoint-direct');
      return {
        status: 'partial',
        node,
        diagnostics: { source: 'mcp-endpoint', cache_hit: false, phases_completed: phases },
      };
    }

    // Phase 3: Parse advertised surface from well-known doc
    if (!doc) {
      return {
        status: 'failed',
        diagnostics: { error: 'No discovery document available', cache_hit: false, phases_completed: phases },
      };
    }
    phases.push('phase3:surface-parsed');

    const node: DuadpNode = {
      gaid: doc.gaid,
      canonical_domain: doc.canonical_domain ?? (seedType === 'domain' ? seedValue : undefined),
      well_known_url: wellKnownUrl,
      endpoint: doc.endpoint,
      mcp_endpoint: doc.mcp_endpoint,
      ossa_manifest_url: doc.ossa_manifest_url,
      capabilities: Array.isArray(doc.capabilities) ? doc.capabilities : [],
      trust: {
        contractplane_url: doc.trust?.contractplane_url,
        ossa_version: doc.trust?.ossa_version,
      },
      federation: {
        source,
        freshness_ts: new Date().toISOString(),
        cache_ttl_s: DEFAULT_CACHE_TTL_S,
      },
    };

    // Phase 4: Optionally load OSSA contract
    let ossaManifest: OssaManifestSurface | undefined;
    if (req.need_ossa && node.ossa_manifest_url) {
      try {
        ossaManifest = await fetchOssaManifest(node.ossa_manifest_url);
        phases.push('phase4:ossa-manifest-loaded');
        // Merge capabilities from manifest if not in well-known
        if (ossaManifest.capabilities && node.capabilities.length === 0) {
          node.capabilities = Array.isArray(ossaManifest.capabilities) ? ossaManifest.capabilities : [];
        }
      } catch {
        phases.push('phase4:ossa-manifest-unavailable');
      }
    } else {
      phases.push('phase4:ossa-skipped');
    }

    phases.push('phase5:channel-selected');
    phases.push('phase6:cached');

    return {
      status: 'resolved',
      node,
      ossa_manifest: ossaManifest,
      diagnostics: {
        source: source === 'direct' ? 'well-known' : source,
        cache_hit: false,
        verification: ossaManifest ? 'manifest-linked' : 'well-known-only',
        phases_completed: phases,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'failed',
      diagnostics: { error: message, cache_hit: false, phases_completed: phases },
    };
  }
}
