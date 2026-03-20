// DUADP Resolver — canonical data models
// Reflects the DuadpNode, DuadpResolutionRequest, DuadpResolutionResult
// shapes from the DUADP authority DAG spec.

export type SeedType = 'domain' | 'gaid' | 'manifest_url' | 'mcp_endpoint';
export type FederationSource = 'direct' | 'registry' | 'peer';
export type ResolutionStatus = 'resolved' | 'partial' | 'failed';

/** Well-known discovery document at /.well-known/duadp.json */
export interface WellKnownDoc {
  protocol_version?: string;
  gaid?: string;
  canonical_domain?: string;
  endpoint?: string;
  mcp_endpoint?: string;
  ossa_manifest_url?: string;
  capabilities?: string[];
  trust?: {
    contractplane_url?: string;
    ossa_version?: string;
  };
  federation?: {
    peers?: string[];
    registry_url?: string;
  };
  [key: string]: unknown;
}

/** Fully-resolved DUADP node */
export interface DuadpNode {
  gaid?: string;
  canonical_domain?: string;
  well_known_url?: string;
  endpoint?: string;
  mcp_endpoint?: string;
  ossa_manifest_url?: string;
  capabilities: string[];
  trust: {
    contractplane_url?: string;
    ossa_version?: string;
  };
  federation: {
    source: FederationSource;
    freshness_ts: string;
    cache_ttl_s: number;
  };
}

/** Minimal OSSA manifest surface extracted during resolution */
export interface OssaManifestSurface {
  kind?: string;
  name?: string;
  version?: string;
  description?: string;
  capabilities?: string[];
  mcp_endpoint?: string;
  trust?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Input to the resolution pipeline */
export interface DuadpResolutionRequest {
  seed_type: SeedType;
  seed_value: string;
  need_mcp?: boolean;
  need_ossa?: boolean;
  need_trust_refs?: boolean;
}

/** Output of the resolution pipeline */
export interface DuadpResolutionResult {
  status: ResolutionStatus;
  node?: DuadpNode;
  ossa_manifest?: OssaManifestSurface;
  diagnostics: {
    source?: string;
    cache_hit: boolean;
    verification?: string;
    error?: string;
    phases_completed: string[];
  };
}
