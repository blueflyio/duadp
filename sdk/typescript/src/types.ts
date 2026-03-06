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
  next_cursor?: string;
  prev_cursor?: string;
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

// ─── Node Health & Search ────────────────────────────────────────

/** Node health status from GET /uadp/v1/health */
export interface NodeHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version?: string;
  uptime?: number;
  checks?: Record<string, string>;
  skills?: number;
  agents?: number;
  tools?: number;
  peers?: number;
  last_sync?: string;
}

/** Facets returned alongside unified search results */
export interface SearchFacets {
  categories?: Record<string, number>;
  trust_tiers?: Record<string, number>;
  resource_types?: Record<string, number>;
  tags?: Record<string, number>;
}

/** Unified search response */
export interface SearchResponse {
  data: OssaResource[];
  meta: PaginationMeta;
  facets?: SearchFacets;
}

/** Multi-protocol endpoint map for an agent */
export interface ProtocolEndpoints {
  uadp?: string;
  a2a?: string;
  mcp?: string;
  openai?: string;
  rest?: string;
  grpc?: string;
}

/** Agent pricing model */
export interface PricingInfo {
  model: 'free' | 'per_request' | 'subscription' | 'token_based' | 'custom';
  currency?: string;
  price_per_call?: number;
  free_tier?: number;
  details?: string;
}

/** Service level agreement */
export interface SLAInfo {
  uptime_percent?: number;
  response_time_ms?: number;
  support_tier?: 'community' | 'standard' | 'premium' | 'enterprise';
  sla_document?: string;
}

/** .ajson index card for an agent — lightweight cross-registry format */
export interface AgentIndexRecord {
  gaid: string;
  name: string;
  kind: 'Skill' | 'Agent' | 'Tool';
  description?: string;
  version?: string;
  trust_tier?: TrustTier;
  category?: string;
  tags?: string[];
  endpoints?: ProtocolEndpoints;
  pricing?: PricingInfo;
  sla?: SLAInfo;
  status?: 'active' | 'deprecated' | 'suspended';
  sunset_date?: string;
  content_hash?: string;
  node_name?: string;
  node_id?: string;
  updated?: string;
}

// ─── OSSA Agent Types (aligned with openstandardagents spec) ─────

/** OSSA agent type classification */
export type AgentType = 'orchestrator' | 'worker' | 'specialist' | 'critic' | 'monitor' | 'gateway';

/** Agent operational status */
export type AgentStatus = 'registered' | 'active' | 'inactive' | 'suspended' | 'deprecated';

// ─── Context Awareness & Token Efficiency ────────────────────────

/** Context negotiation — how an agent receives work context from a UADP node */
export interface ContextNegotiation {
  /** Maximum tokens this agent should receive as context */
  max_context_tokens?: number;
  /** Preferred context delivery: layered (priority tiers) or flat (single blob) */
  delivery_mode?: 'layered' | 'flat' | 'streaming';
  /** Context layers in priority order — node serves highest priority first */
  layers?: ContextLayer[];
  /** Knowledge graph sources the agent can query for domain context */
  knowledge_sources?: KnowledgeSource[];
  /** Cached context references — skip re-fetching if hash unchanged */
  cache_refs?: ContextCacheRef[];
}

/** Single context layer with priority and token budget */
export interface ContextLayer {
  /** Layer name (e.g., "diff", "architecture", "conventions") */
  name: string;
  /** Priority: lower number = higher priority. Layer 0 always delivered. */
  priority: number;
  /** Maximum tokens for this layer */
  max_tokens?: number;
  /** Content type hint for the node */
  content_type?: 'code' | 'documentation' | 'schema' | 'config' | 'embedding' | 'summary';
  /** If true, this layer must be included (not optional) */
  required?: boolean;
}

/** Knowledge source the agent can query for contextual information */
export interface KnowledgeSource {
  /** Source type */
  type: 'qdrant' | 'neo4j' | 'weaviate' | 'pinecone' | 'meilisearch' | 'elasticsearch' | 'custom';
  /** Endpoint URL */
  endpoint: string;
  /** Collection/index name */
  collection?: string;
  /** Authentication method */
  auth?: 'bearer' | 'api-key' | 'none';
  /** Embedding model used (for vector stores) */
  embedding_model?: string;
  /** Embedding dimensions */
  embedding_dimensions?: number;
}

/** Cached context reference — enables skip-if-unchanged semantics */
export interface ContextCacheRef {
  /** Cache identifier */
  cache_id: string;
  /** Domain this cache covers */
  domain: string;
  /** Content hash — if unchanged, agent can skip re-reading */
  content_hash: string;
  /** When this cache was last computed */
  computed_at: string;
  /** Time-to-live in seconds */
  ttl?: number;
}

// ─── Token Analytics & Cost Tracking ─────────────────────────────

/** Token usage analytics for an agent or task execution */
export interface TokenAnalytics {
  /** Total tokens consumed (input + output) */
  total_tokens: number;
  /** Input/context tokens */
  input_tokens: number;
  /** Output/generation tokens */
  output_tokens: number;
  /** Cost in USD */
  cost_usd?: number;
  /** Model used */
  model?: string;
  /** Task completion: did the agent finish successfully? */
  task_completed: boolean;
  /** Duration in milliseconds */
  duration_ms?: number;
  /** Efficiency score: task_quality / tokens_used (higher = better) */
  efficiency_score?: number;
  /** Context tokens that were actually used vs delivered */
  context_utilization?: number;
  /** Timestamp */
  timestamp: string;
}

/** Aggregate token analytics across multiple executions */
export interface TokenAnalyticsAggregate {
  /** Agent or resource GAID */
  gaid: string;
  /** Time period */
  period: 'hour' | 'day' | 'week' | 'month' | 'all_time';
  /** Number of executions in this period */
  execution_count: number;
  /** Average tokens per task */
  avg_tokens_per_task: number;
  /** Median tokens per task */
  median_tokens_per_task?: number;
  /** P95 tokens per task */
  p95_tokens_per_task?: number;
  /** Average cost per task in USD */
  avg_cost_per_task_usd?: number;
  /** Total cost in this period */
  total_cost_usd?: number;
  /** Success rate (0.0 to 1.0) */
  success_rate: number;
  /** Average efficiency score */
  avg_efficiency_score?: number;
  /** Breakdown by task type */
  by_task_type?: Record<string, {
    count: number;
    avg_tokens: number;
    success_rate: number;
    avg_cost_usd?: number;
  }>;
  /** Breakdown by domain */
  by_domain?: Record<string, {
    count: number;
    avg_tokens: number;
    success_rate: number;
  }>;
}

// ─── Feedback & Reward Systems ───────────────────────────────────

/** Feedback on an agent's task execution — 360-degree from multiple sources */
export interface AgentFeedback {
  /** Unique feedback ID */
  feedback_id: string;
  /** Agent that received the feedback */
  agent_gaid: string;
  /** Task or execution this feedback relates to */
  task_ref?: string;
  /** Who gave the feedback */
  source: FeedbackSource;
  /** Feedback type */
  type: 'rating' | 'correction' | 'reward' | 'penalty' | 'observation';
  /** Numeric rating (1-5 or 0.0-1.0 depending on scale) */
  rating?: number;
  /** Rating scale */
  rating_scale?: '1-5' | '0-1' | 'percentage';
  /** Qualitative feedback */
  comment?: string;
  /** Structured dimensions */
  dimensions?: FeedbackDimensions;
  /** Timestamp */
  timestamp: string;
  /** Cryptographic signature of the feedback (verifiable) */
  signature?: ResourceSignature;
}

/** Who provided the feedback */
export interface FeedbackSource {
  /** Source type */
  type: 'human' | 'agent' | 'system' | 'automated-test';
  /** Identifier (DID, user ID, or agent GAID) */
  id: string;
  /** Role of the feedback provider */
  role?: 'user' | 'reviewer' | 'peer-agent' | 'supervisor-agent' | 'qa' | 'admin';
}

/** Structured feedback across multiple quality dimensions */
export interface FeedbackDimensions {
  /** Was the output accurate/correct? */
  accuracy?: number;
  /** Was it completed in reasonable time/tokens? */
  efficiency?: number;
  /** Did it follow instructions? */
  instruction_following?: number;
  /** Code quality, safety, security */
  quality?: number;
  /** Was the output useful to the requester? */
  helpfulness?: number;
  /** Did it stay within scope? */
  scope_adherence?: number;
  /** Custom dimensions */
  custom?: Record<string, number>;
}

/** Reward event — tracks incentives for agent behavior */
export interface RewardEvent {
  /** Reward ID */
  reward_id: string;
  /** Agent receiving the reward */
  agent_gaid: string;
  /** What triggered the reward */
  trigger: 'task_completion' | 'quality_threshold' | 'efficiency_bonus' | 'streak' | 'peer_endorsement' | 'manual';
  /** Reward type */
  type: 'reputation_boost' | 'priority_increase' | 'capability_unlock' | 'token_credit' | 'badge';
  /** Numeric value of the reward */
  value?: number;
  /** Badge or achievement name */
  badge?: string;
  /** Timestamp */
  timestamp: string;
  /** Task reference */
  task_ref?: string;
}

/** Aggregate reputation score computed from feedback + rewards */
export interface AgentReputation {
  /** Agent GAID */
  agent_gaid: string;
  /** Overall reputation score (0.0 to 1.0) */
  overall_score: number;
  /** Total feedback count */
  feedback_count: number;
  /** Feedback breakdown */
  feedback_summary: {
    positive: number;
    neutral: number;
    negative: number;
  };
  /** Dimension averages */
  dimension_averages?: Partial<FeedbackDimensions>;
  /** Reward count */
  reward_count: number;
  /** Badges earned */
  badges?: string[];
  /** Trend: improving, stable, declining */
  trend?: 'improving' | 'stable' | 'declining';
  /** Computed at */
  computed_at: string;
}

// ─── Multi-Agent Orchestration ───────────────────────────────────

/** Delegation request — one agent hands off work to another */
export interface DelegationRequest {
  /** Delegating agent */
  from_agent: string;
  /** Target agent */
  to_agent: string;
  /** Task description */
  task: DelegationTask;
  /** Compressed context state from the delegating agent */
  context_transfer?: ContextTransfer;
  /** Budget constraints */
  budget?: TaskBudget;
  /** Callback URL for status updates */
  callback_url?: string;
  /** Delegation chain depth (prevents infinite delegation) */
  depth?: number;
  /** Maximum allowed depth */
  max_depth?: number;
}

/** Task being delegated */
export interface DelegationTask {
  /** Task type */
  type: string;
  /** Human-readable description */
  description?: string;
  /** Scope constraint (e.g., file paths, modules) */
  scope?: string[];
  /** Input data or references */
  inputs?: Record<string, unknown>;
  /** Expected output format */
  expected_output?: string;
  /** Priority */
  priority?: 'critical' | 'high' | 'normal' | 'low';
  /** Deadline (ISO 8601) */
  deadline?: string;
}

/** Compressed context passed between agents during delegation */
export interface ContextTransfer {
  /** Compressed state blob (agent-specific format) */
  compressed_state?: string;
  /** Encoding of the compressed state */
  encoding?: 'base64' | 'gzip+base64' | 'json';
  /** Tokens used so far in the parent agent's execution */
  tokens_used_so_far?: number;
  /** Partial findings/results from parent */
  findings?: Array<{
    type: string;
    content: string;
    confidence?: number;
  }>;
  /** Context cache references the delegate can use */
  cache_refs?: ContextCacheRef[];
  /** Knowledge source access granted to delegate */
  knowledge_access?: KnowledgeSource[];
}

/** Token and cost budget for a delegated task */
export interface TaskBudget {
  /** Maximum tokens */
  max_tokens?: number;
  /** Maximum cost in USD */
  max_cost_usd?: number;
  /** Maximum duration in milliseconds */
  max_duration_ms?: number;
  /** Maximum delegation depth (prevent recursive delegation) */
  max_delegation_depth?: number;
}

/** Delegation result returned by the delegate agent */
export interface DelegationResult {
  /** Status */
  status: 'completed' | 'failed' | 'partial' | 'timeout' | 'rejected';
  /** Result data */
  result?: Record<string, unknown>;
  /** Token analytics for this delegation */
  analytics?: TokenAnalytics;
  /** Feedback from the delegate about the task */
  delegate_feedback?: string;
  /** If the delegate further delegated, the chain */
  delegation_chain?: Array<{
    agent_gaid: string;
    task_type: string;
    tokens_used: number;
    status: string;
  }>;
}

/** Orchestration plan — how an orchestrator agent distributes work */
export interface OrchestrationPlan {
  /** Plan ID */
  plan_id: string;
  /** Orchestrator agent */
  orchestrator_gaid: string;
  /** Overall task */
  task: DelegationTask;
  /** Steps in the plan */
  steps: OrchestrationStep[];
  /** Execution strategy */
  strategy: 'sequential' | 'parallel' | 'dag' | 'adaptive';
  /** Total budget across all steps */
  budget?: TaskBudget;
  /** Plan status */
  status: 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled';
  /** Created at */
  created_at: string;
  /** Updated at */
  updated_at?: string;
}

/** Single step in an orchestration plan */
export interface OrchestrationStep {
  /** Step ID */
  step_id: string;
  /** Step name */
  name: string;
  /** Agent type required (from OSSA taxonomy) */
  agent_type?: AgentType;
  /** Specific agent to use (GAID), or null for best-available routing */
  agent_gaid?: string;
  /** Task for this step */
  task: DelegationTask;
  /** Steps this depends on (DAG edges) */
  depends_on?: string[];
  /** Step budget */
  budget?: TaskBudget;
  /** Step status */
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  /** Result of this step */
  result?: DelegationResult;
}

// ─── Agent Capability Fingerprint ────────────────────────────────

/** Empirical capability fingerprint — computed from actual execution data */
export interface CapabilityFingerprint {
  /** Agent GAID */
  agent_gaid: string;
  /** Domain-specific performance */
  domains?: Record<string, DomainPerformance>;
  /** Task-type-specific performance */
  task_types?: Record<string, TaskTypePerformance>;
  /** Model affinity — which LLM backend works best for this agent */
  model_affinity?: Record<string, { efficiency: number; quality: number }>;
  /** Sample size (total executions) */
  sample_size: number;
  /** Last updated */
  updated_at: string;
}

/** Performance in a specific domain */
export interface DomainPerformance {
  /** Success rate (0.0 to 1.0) */
  accuracy: number;
  /** Average tokens per task */
  avg_tokens: number;
  /** Number of executions */
  sample_size: number;
  /** Average cost per task */
  avg_cost_usd?: number;
}

/** Performance for a specific task type */
export interface TaskTypePerformance {
  /** Success rate (0.0 to 1.0) */
  accuracy: number;
  /** Average cost per task */
  avg_cost_usd?: number;
  /** Average tokens per task */
  avg_tokens: number;
  /** Number of executions */
  sample_size: number;
  /** Average duration in ms */
  avg_duration_ms?: number;
}

// ─── Outcome Attestation ─────────────────────────────────────────

/** Signed attestation of a task outcome — builds verifiable track record */
export interface OutcomeAttestation {
  /** Attestation ID */
  attestation_id: string;
  /** Agent that performed the work */
  agent_gaid: string;
  /** Task hash (SHA-256 of task description + inputs) */
  task_hash: string;
  /** Outcome */
  outcome: 'success' | 'partial_success' | 'failure' | 'timeout';
  /** Metrics */
  metrics: {
    tokens_used: number;
    duration_ms: number;
    cost_usd?: number;
    /** Whether a human overrode the agent's output */
    human_override: boolean;
    /** Agent's self-assessed confidence */
    confidence?: number;
  };
  /** Who attested (node DID, user DID, or peer agent DID) */
  attester: string;
  /** Timestamp */
  timestamp: string;
  /** Cryptographic signature */
  signature?: ResourceSignature;
}

// ─── Batch Operations ────────────────────────────────────────────

/** Batch publish request */
export interface BatchPublishRequest {
  resources: OssaResource[];
  atomic?: boolean;
}

/** Single result in a batch publish response */
export interface BatchPublishResult {
  index: number;
  success: boolean;
  resource?: OssaResource;
  error?: string;
}

/** Batch publish response */
export interface BatchPublishResponse {
  total: number;
  succeeded: number;
  failed: number;
  results: BatchPublishResult[];
}

// ─── Protocol Compatibility ──────────────────────────────────────

/** Google A2A-compatible Agent Card */
export interface A2AAgentCard {
  name: string;
  description?: string;
  url: string;
  version?: string;
  provider?: { organization?: string; url?: string };
  capabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
  authentication?: { schemes?: string[] };
  skills?: Array<{
    id: string;
    name: string;
    description?: string;
    tags?: string[];
    examples?: string[];
  }>;
  defaultInputModes?: ('text' | 'file' | 'data')[];
  defaultOutputModes?: ('text' | 'file' | 'data')[];
  _uadp?: {
    gaid?: string;
    trust_tier?: string;
    content_hash?: string;
    node_name?: string;
  };
}

/** MCP-compatible server manifest */
export interface McpServerManifest {
  name: string;
  version: string;
  description?: string;
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    _uadp?: {
      gaid?: string;
      trust_tier?: string;
      content_hash?: string;
    };
  }>;
}

// ─── Structured Query ────────────────────────────────────────────

/** Filter in a structured query */
export interface QueryFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'exists' | 'not_exists';
  value: unknown;
}

/** Sort specification in a structured query */
export interface QuerySort {
  field: string;
  order?: 'asc' | 'desc';
}

/** Structured query request */
export interface StructuredQuery {
  filters?: QueryFilter[];
  sort?: QuerySort[];
  fields?: string[];
  kinds?: ('Skill' | 'Agent' | 'Tool')[];
  federated?: boolean;
  page?: number;
  limit?: number;
  cursor?: string;
}
