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

/** Generic OSSA resource — base for Skill, Agent, Tool, and custom kinds */
export interface OssaResource {
  apiVersion: string;
  kind: string;
  metadata: OssaMetadata;
  spec?: Record<string, unknown>;
  signature?: ResourceSignature;
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
  protocol?: 'mcp' | 'a2a' | 'function' | 'rest';
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
