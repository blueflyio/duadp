/** UADP Node Discovery Manifest (/.well-known/uadp.json) */
export interface UadpManifest {
  protocol_version: string;
  node_id?: string;
  node_name: string;
  node_description?: string;
  contact?: string;
  endpoints: {
    skills?: string;
    agents?: string;
    tools?: string;
    federation?: string;
    validate?: string;
    publish?: string;
    [key: string]: string | undefined;
  };
  capabilities?: string[];
  identity?: NodeIdentity;
  /** @deprecated Use identity.public_key instead */
  public_key?: string;
  ossa_versions?: string[];
  federation?: FederationConfig;
  governance?: NodeGovernance;
}

/** Node identity for DID-based verification */
export interface NodeIdentity {
  did?: string;
  public_key?: string;
}

/** Federation configuration in manifest */
export interface FederationConfig {
  gossip?: boolean;
  max_hops?: number;
}

/** Trust tiers for resources */
export type TrustTier = 'official' | 'verified-signature' | 'signed' | 'community' | 'experimental';

/** Peer status in federation */
export type PeerStatus = 'healthy' | 'degraded' | 'unreachable';

/** OSSA metadata common to all resources */
export interface OssaMetadata {
  name: string;
  version?: string;
  description?: string;
  uri?: string;
  category?: string;
  trust_tier?: TrustTier;
  tags?: string[];
  created?: string;
  updated?: string;
  [key: string]: unknown;
}

/** Cryptographic signature on a resource */
export interface ResourceSignature {
  algorithm: 'Ed25519' | 'ES256';
  value: string;
  signer: string;
  timestamp?: string;
}

/** Comprehensive agent/resource identity */
export interface ResourceIdentity {
  /** W3C DID for this resource */
  did: string;
  /** Global Agent Identifier (agent:// URI) */
  gaid: string;
  /** DNS binding */
  dns?: {
    record: string;
    verified?: boolean;
  };
  /** Cryptographic keys */
  keys?: {
    signing: {
      id: string;
      type: string;
      public_key_multibase: string;
    };
    encryption?: {
      id: string;
      type: string;
      public_key_multibase: string;
    };
    rotation?: {
      next_key_hash?: string;
      rotation_policy?: string;
    };
  };
  /** Service account for autonomous operations */
  service_account?: {
    id: string;
    type: 'bot' | 'service' | 'system';
    provider?: string;
    scopes: string[];
    token_endpoint?: string;
    client_id?: string;
  };
  /** Supply chain provenance */
  provenance?: {
    creator?: string;
    publisher: string;
    created: string;
    published: string;
    source_repository?: string;
    commit_hash?: string;
    build_system?: string;
    attestations?: Array<{ type: string; uri: string }>;
  };
  /** Lifecycle management */
  lifecycle?: {
    status: 'draft' | 'active' | 'suspended' | 'deprecated' | 'revoked';
    activated?: string;
    expires?: string | null;
    suspended?: string | null;
    revoked?: string | null;
    deprecation?: string | null;
    successor?: string | null;
  };
  /** Operational context */
  operational?: {
    endpoint?: string;
    protocol?: 'mcp' | 'a2a' | 'openai' | 'langchain' | 'crewai' | 'autogen' | 'rest' | 'grpc' | 'websocket';
    transport?: 'https' | 'sse' | 'stdio' | 'websocket';
    health_check?: string;
    rate_limit?: {
      requests_per_minute?: number;
      concurrent_sessions?: number;
    };
    availability?: {
      sla?: string;
      regions?: string[];
    };
  };
  /** Relationships to other resources */
  relationships?: {
    parent_agent?: string;
    skills?: string[];
    tools?: string[];
    depends_on?: string[];
    delegates_to?: string[];
    registered_nodes?: string[];
  };
  /** Compliance and safety */
  compliance?: {
    nist_controls?: string[];
    safety?: {
      human_oversight?: 'none' | 'optional' | 'recommended' | 'required';
      max_autonomy_level?: 'autonomous' | 'supervised' | 'human-in-loop' | 'view-only';
      restricted_actions?: string[];
      safety_policy?: string;
    };
    data_handling?: {
      pii_access?: boolean;
      data_retention?: 'none' | 'session' | '30d' | '365d' | 'permanent';
      data_residency?: string[];
      encryption_at_rest?: boolean;
      encryption_in_transit?: boolean;
    };
    audit?: {
      log_endpoint?: string;
      log_format?: 'OTEL' | 'CEF' | 'JSON' | 'syslog';
      retention_days?: number;
    };
  };
  /** Reputation and trust */
  reputation?: {
    trust_tier?: TrustTier;
    verification_date?: string;
    verified_by?: string;
    attestations_count?: number;
    usage_count?: number;
    nodes_registered?: number;
    community_rating?: number;
    incidents?: number;
  };
}

/** Generic OSSA resource — base for Skill, Agent, Tool, and custom kinds */
export interface OssaResource {
  apiVersion: string;
  kind: string;
  metadata: OssaMetadata;
  identity?: ResourceIdentity;
  spec?: Record<string, unknown>;
  signature?: ResourceSignature;
  provenance?: ResourceProvenance;
  risk?: ResourceRisk;
  content_hash?: string;
}

/** OSSA Skill payload */
export interface OssaSkill extends OssaResource {
  kind: 'Skill';
}

/** OSSA Agent payload */
export interface OssaAgent extends OssaResource {
  kind: 'Agent';
}

/** OSSA Tool payload (MCP, A2A, function-calling, REST) */
export interface OssaTool extends OssaResource {
  kind: 'Tool';
}

/** Pagination metadata */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  node_name: string;
  node_id?: string;
  federated?: boolean;
  sources?: FederatedSource[];
}

/** Source attribution for federated search */
export interface FederatedSource {
  node_id?: string;
  node_name?: string;
  count: number;
}

/** Paginated response envelope */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Federation peer */
export interface Peer {
  url: string;
  node_id?: string;
  name: string;
  status: PeerStatus;
  last_synced?: string | null;
  capabilities?: string[];
  skill_count?: number;
  agent_count?: number;
  tool_count?: number;
}

/** Federation response */
export interface FederationResponse {
  protocol_version: string;
  node_id?: string;
  node_name: string;
  gossip?: boolean;
  max_hops?: number;
  peers: Peer[];
}

/** Publish response */
export interface PublishResponse {
  success: boolean;
  resource?: OssaResource;
}

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Query parameters for list endpoints */
export interface ListParams {
  search?: string;
  category?: string;
  trust_tier?: TrustTier;
  tag?: string;
  federated?: boolean;
  page?: number;
  limit?: number;
}

/** Query parameters for tools (extends ListParams with protocol filter) */
export interface ToolListParams extends ListParams {
  protocol?: 'mcp' | 'a2a' | 'openai' | 'function' | 'langchain' | 'crewai' | 'autogen' | 'rest' | 'grpc';
}

/** WebFinger response */
export interface WebFingerResponse {
  subject: string;
  links: WebFingerLink[];
  properties?: Record<string, string>;
}

/** WebFinger link */
export interface WebFingerLink {
  rel: string;
  type?: string;
  href: string;
}

/** Peer registration request */
export interface PeerRegistration {
  url: string;
  name: string;
  node_id?: string;
  hop?: number;
}

/** Peer registration response (includes peer list for gossip) */
export interface PeerRegistrationResponse {
  success: boolean;
  peer?: Peer;
  peers?: Peer[];
}

/** DNS TXT record fields */
export interface DnsTxtRecord {
  v: string;
  url: string;
  name?: string;
  cap?: string;
}

// ─── NIST AI RMF Aligned Types ──────────────────────────────

/** Node governance declarations (NIST GOVERN function) */
export interface NodeGovernance {
  compliance_frameworks?: string[];
  risk_tolerance?: 'strict' | 'moderate' | 'permissive';
  data_classification?: 'public' | 'internal' | 'confidential' | 'restricted';
  review_policy?: 'manual' | 'automated' | 'hybrid';
  audit_retention_days?: number;
}

/** Supply chain provenance (NIST SP 800-218A) */
export interface ResourceProvenance {
  publisher?: ProvenancePublisher;
  build?: BuildInfo;
  sbom?: SBOM;
  attestations?: Attestation[];
}

/** Publisher identity */
export interface ProvenancePublisher {
  name: string;
  url?: string;
  organization?: string;
  verified?: boolean;
}

/** SLSA-style build provenance */
export interface BuildInfo {
  builder?: string;
  source_repo?: string;
  commit_sha?: string;
  build_time?: string;
  reproducible?: boolean;
}

/** Software Bill of Materials */
export interface SBOM {
  format?: 'spdx' | 'cyclonedx';
  components?: SBOMComponent[];
}

/** Single component in an SBOM */
export interface SBOMComponent {
  name: string;
  version?: string;
  type?: 'model' | 'library' | 'framework' | 'tool' | 'dataset' | 'runtime';
  supplier?: string;
  license?: string;
  hash?: string;
}

/** Third-party attestation (NIST GOVERN 1.7) */
export interface Attestation {
  type: 'security-audit' | 'compliance-review' | 'performance-test' | 'safety-evaluation' | 'red-team';
  issuer: string;
  issued_at?: string;
  expires_at?: string;
  result: 'pass' | 'conditional-pass' | 'fail';
  details_url?: string;
}

/** Risk level */
export type RiskLevel = 'critical' | 'high' | 'moderate' | 'low' | 'minimal';

/** Autonomy level (NIST GOVERN 1.3) */
export type AutonomyLevel = 'fully-autonomous' | 'supervised' | 'human-in-the-loop' | 'advisory';

/** NIST AI RMF risk assessment (MAP 5.1, MEASURE 1.1) */
export interface ResourceRisk {
  level?: RiskLevel;
  impact?: {
    people?: RiskLevel | 'none';
    organizations?: RiskLevel | 'none';
    ecosystems?: RiskLevel | 'none';
  };
  autonomy_level?: AutonomyLevel;
  data_sensitivity?: 'public' | 'internal' | 'confidential' | 'restricted';
  known_limitations?: string[];
  mitigations?: string[];
  nist_controls?: NISTControl[];
}

/** NIST SP 800-53 control mapping */
export interface NISTControl {
  control_id: string;
  status: 'implemented' | 'partially-implemented' | 'planned' | 'not-applicable';
  evidence?: string;
}

/** Revoked resource (NIST SI-7, CM-3) */
export interface Revocation {
  gaid: string;
  resource_name?: string;
  reason: 'security-vulnerability' | 'policy-violation' | 'publisher-request' | 'expired' | 'superseded';
  severity?: 'critical' | 'high' | 'moderate' | 'low';
  revoked_at: string;
  revoked_by?: string;
  superseded_by?: string;
}

/** Audit event (NIST AU-2, AU-3) */
export interface AuditEvent {
  event_id?: string;
  event_type: 'publish' | 'revoke' | 'update' | 'peer_added' | 'peer_removed' | 'access' | 'validation' | 'risk_change';
  timestamp: string;
  actor?: string;
  gaid?: string;
  details?: Record<string, unknown>;
}

/** Single change in incremental sync */
export interface SyncChange {
  action: 'created' | 'updated' | 'revoked' | 'deleted';
  resource_type: 'skill' | 'agent' | 'tool';
  gaid: string;
  timestamp: string;
  content_hash?: string;
  resource?: OssaResource;
}

/** Incremental sync response */
export interface SyncResponse {
  changes: SyncChange[];
  sync_token?: string;
  has_more?: boolean;
}

/** Webhook subscription */
export interface WebhookSubscription {
  callback_url: string;
  events: ('resource.published' | 'resource.updated' | 'resource.revoked' | 'peer.added' | 'peer.removed')[];
  secret?: string;
  filter?: {
    resource_types?: ('skill' | 'agent' | 'tool')[];
    trust_tiers?: TrustTier[];
  };
}

/** Agent identity record */
export interface AgentIdentity {
  gaid: string;
  did: string;
  dns_record?: {
    domain: string;
    record_name: string;
    record_value: string;
  };
  service_account?: {
    type: 'bot' | 'service-account' | 'machine-identity';
    provider: string;
    username?: string;
    scopes?: string[];
  };
  keys?: AgentKey[];
  verification_methods?: string[];
}

/** Cryptographic key for an agent */
export interface AgentKey {
  id: string;
  type: 'Ed25519' | 'ES256' | 'RSA';
  public_key: string;
  purpose: 'signing' | 'authentication' | 'encryption';
  created?: string;
  expires?: string;
}
