"""UADP protocol types as Pydantic models."""
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field

TrustTier = Literal["official", "verified-signature", "signed", "community", "experimental"]
PeerStatus = Literal["healthy", "degraded", "unreachable"]


class NodeIdentity(BaseModel):
    did: str | None = None
    public_key: str | None = None


class FederationConfig(BaseModel):
    gossip: bool | None = None
    max_hops: int | None = None


class UadpEndpoints(BaseModel):
    skills: str | None = None
    agents: str | None = None
    tools: str | None = None
    federation: str | None = None
    validate: str | None = None
    publish: str | None = None
    governance: str | None = None
    provenance: str | None = None
    revocations: str | None = None
    audit_log: str | None = None
    events: str | None = None
    identity: str | None = None
    context: str | None = None
    analytics: str | None = None
    feedback: str | None = None
    attestations: str | None = None
    delegate: str | None = None
    health: str | None = None
    search: str | None = None
    index: str | None = None

    class Config:
        extra = "allow"


class UadpManifest(BaseModel):
    protocol_version: str
    node_id: str | None = None
    node_name: str
    node_description: str | None = None
    contact: str | None = None
    endpoints: UadpEndpoints
    capabilities: list[str] | None = None
    identity: NodeIdentity | None = None
    public_key: str | None = None  # deprecated, use identity.public_key
    ossa_versions: list[str] | None = None
    federation: FederationConfig | None = None
    governance: "NodeGovernance | None" = None


class OssaMetadata(BaseModel):
    name: str
    version: str | None = None
    description: str | None = None
    uri: str | None = None
    category: str | None = None
    trust_tier: TrustTier | None = None
    tags: list[str] | None = None
    created: str | None = None
    updated: str | None = None

    class Config:
        extra = "allow"


class ResourceSignature(BaseModel):
    algorithm: Literal["Ed25519", "ES256"]
    value: str
    signer: str
    timestamp: str | None = None


class ResourceIdentityDNS(BaseModel):
    """DNS binding for resource identity."""
    record: str
    verified: bool | None = None


class ResourceIdentitySigningKey(BaseModel):
    """Signing key in resource identity."""
    id: str
    type: str
    public_key_multibase: str


class ResourceIdentityEncryptionKey(BaseModel):
    """Encryption key in resource identity."""
    id: str
    type: str
    public_key_multibase: str


class ResourceIdentityKeyRotation(BaseModel):
    """Key rotation policy."""
    next_key_hash: str | None = None
    rotation_policy: str | None = None


class ResourceIdentityKeys(BaseModel):
    """Cryptographic keys for resource identity."""
    signing: ResourceIdentitySigningKey
    encryption: ResourceIdentityEncryptionKey | None = None
    rotation: ResourceIdentityKeyRotation | None = None


class ResourceIdentityServiceAccount(BaseModel):
    """Service account for autonomous operations."""
    id: str
    type: Literal["bot", "service", "system"]
    provider: str | None = None
    scopes: list[str]
    token_endpoint: str | None = None
    client_id: str | None = None


class ResourceIdentityProvenanceAttestation(BaseModel):
    """Attestation reference in provenance."""
    type: str
    uri: str


class ResourceIdentityProvenance(BaseModel):
    """Supply chain provenance in identity."""
    creator: str | None = None
    publisher: str
    created: str
    published: str
    source_repository: str | None = None
    commit_hash: str | None = None
    build_system: str | None = None
    attestations: list[ResourceIdentityProvenanceAttestation] | None = None


class ResourceIdentityLifecycle(BaseModel):
    """Lifecycle management for resource identity."""
    status: Literal["draft", "active", "suspended", "deprecated", "revoked"]
    activated: str | None = None
    expires: str | None = None
    suspended: str | None = None
    revoked: str | None = None
    deprecation: str | None = None
    successor: str | None = None


class ResourceIdentityRateLimit(BaseModel):
    """Rate limiting configuration."""
    requests_per_minute: int | None = None
    concurrent_sessions: int | None = None


class ResourceIdentityAvailability(BaseModel):
    """Availability configuration."""
    sla: str | None = None
    regions: list[str] | None = None


class ResourceIdentityOperational(BaseModel):
    """Operational context for resource identity."""
    endpoint: str | None = None
    protocol: Literal["mcp", "a2a", "rest", "grpc", "websocket"] | None = None
    transport: Literal["https", "sse", "stdio", "websocket"] | None = None
    health_check: str | None = None
    rate_limit: ResourceIdentityRateLimit | None = None
    availability: ResourceIdentityAvailability | None = None


class ResourceIdentityRelationships(BaseModel):
    """Relationships to other resources."""
    parent_agent: str | None = None
    skills: list[str] | None = None
    tools: list[str] | None = None
    depends_on: list[str] | None = None
    delegates_to: list[str] | None = None
    registered_nodes: list[str] | None = None


class ResourceIdentitySafety(BaseModel):
    """Safety configuration."""
    human_oversight: Literal["none", "optional", "recommended", "required"] | None = None
    max_autonomy_level: Literal["autonomous", "supervised", "human-in-loop", "view-only"] | None = None
    restricted_actions: list[str] | None = None
    safety_policy: str | None = None


class ResourceIdentityDataHandling(BaseModel):
    """Data handling configuration."""
    pii_access: bool | None = None
    data_retention: Literal["none", "session", "30d", "365d", "permanent"] | None = None
    data_residency: list[str] | None = None
    encryption_at_rest: bool | None = None
    encryption_in_transit: bool | None = None


class ResourceIdentityAudit(BaseModel):
    """Audit configuration."""
    log_endpoint: str | None = None
    log_format: Literal["OTEL", "CEF", "JSON", "syslog"] | None = None
    retention_days: int | None = None


class ResourceIdentityCompliance(BaseModel):
    """Compliance and safety for resource identity."""
    nist_controls: list[str] | None = None
    safety: ResourceIdentitySafety | None = None
    data_handling: ResourceIdentityDataHandling | None = None
    audit: ResourceIdentityAudit | None = None


class ResourceIdentityReputation(BaseModel):
    """Reputation and trust for resource identity."""
    trust_tier: TrustTier | None = None
    verification_date: str | None = None
    verified_by: str | None = None
    attestations_count: int | None = None
    usage_count: int | None = None
    nodes_registered: int | None = None
    community_rating: float | None = None
    incidents: int | None = None


class ResourceIdentity(BaseModel):
    """Comprehensive agent/resource identity."""
    did: str
    gaid: str
    dns: ResourceIdentityDNS | None = None
    keys: ResourceIdentityKeys | None = None
    service_account: ResourceIdentityServiceAccount | None = None
    provenance: ResourceIdentityProvenance | None = None
    lifecycle: ResourceIdentityLifecycle | None = None
    operational: ResourceIdentityOperational | None = None
    relationships: ResourceIdentityRelationships | None = None
    compliance: ResourceIdentityCompliance | None = None
    reputation: ResourceIdentityReputation | None = None


class OssaResource(BaseModel):
    """Generic OSSA resource — base for Skill, Agent, Tool, and custom kinds."""
    apiVersion: str = Field(alias="apiVersion")
    kind: str
    metadata: OssaMetadata
    identity: ResourceIdentity | None = None
    spec: dict | None = None
    signature: ResourceSignature | None = None
    provenance: "ResourceProvenance | None" = None
    risk: "ResourceRisk | None" = None
    content_hash: str | None = None

    class Config:
        populate_by_name = True
        extra = "allow"


class OssaSkill(OssaResource):
    kind: Literal["Skill"] = "Skill"


class OssaAgent(OssaResource):
    kind: Literal["Agent"] = "Agent"


class OssaTool(OssaResource):
    kind: Literal["Tool"] = "Tool"


class FederatedSource(BaseModel):
    node_id: str | None = None
    node_name: str | None = None
    count: int


class PaginationMeta(BaseModel):
    total: int
    page: int
    limit: int
    node_name: str
    node_id: str | None = None
    federated: bool | None = None
    sources: list[FederatedSource] | None = None
    next_cursor: str | None = None
    prev_cursor: str | None = None


class PaginatedResponse[T](BaseModel):
    data: list[T]
    meta: PaginationMeta


class Peer(BaseModel):
    url: str
    node_id: str | None = None
    name: str
    status: PeerStatus = "healthy"
    last_synced: str | None = None
    capabilities: list[str] | None = None
    skill_count: int | None = None
    agent_count: int | None = None
    tool_count: int | None = None


class FederationResponse(BaseModel):
    protocol_version: str
    node_id: str | None = None
    node_name: str
    gossip: bool | None = None
    max_hops: int | None = None
    peers: list[Peer]


class PublishResponse(BaseModel):
    success: bool
    resource: OssaResource | None = None


class ValidationResult(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ListParams(BaseModel):
    search: str | None = None
    category: str | None = None
    trust_tier: TrustTier | None = None
    tag: str | None = None
    federated: bool | None = None
    page: int = 1
    limit: int = 20


class ToolListParams(ListParams):
    protocol: Literal["mcp", "a2a", "openai", "function", "langchain", "crewai", "autogen", "rest", "grpc"] | None = None


class WebFingerLink(BaseModel):
    rel: str
    type: str | None = None
    href: str


class WebFingerResponse(BaseModel):
    subject: str
    links: list[WebFingerLink]
    properties: dict[str, str] | None = None


class PeerRegistration(BaseModel):
    url: str
    name: str
    node_id: str | None = None
    hop: int = 0


class PeerRegistrationResponse(BaseModel):
    success: bool
    peer: Peer | None = None
    peers: list[Peer] | None = None


class ErrorResponse(BaseModel):
    error: str
    code: str | None = None


# ─── NIST AI RMF Aligned Types ──────────────────────────────

RiskLevel = Literal["critical", "high", "moderate", "low", "minimal"]
AutonomyLevel = Literal["fully-autonomous", "supervised", "human-in-the-loop", "advisory"]
DataClassification = Literal["public", "internal", "confidential", "restricted"]
RiskTolerance = Literal["strict", "moderate", "permissive"]
ReviewPolicy = Literal["manual", "automated", "hybrid"]


class NodeGovernance(BaseModel):
    """Node governance declarations (NIST GOVERN function)."""
    compliance_frameworks: list[str] | None = None
    risk_tolerance: RiskTolerance | None = None
    data_classification: DataClassification | None = None
    review_policy: ReviewPolicy | None = None
    audit_retention_days: int | None = None


class ProvenancePublisher(BaseModel):
    """Publisher identity."""
    name: str
    url: str | None = None
    organization: str | None = None
    verified: bool | None = None


class BuildInfo(BaseModel):
    """SLSA-style build provenance."""
    builder: str | None = None
    source_repo: str | None = None
    commit_sha: str | None = None
    build_time: str | None = None
    reproducible: bool | None = None


class SBOMComponent(BaseModel):
    """Single component in an SBOM."""
    name: str
    version: str | None = None
    type: Literal["model", "library", "framework", "tool", "dataset", "runtime"] | None = None
    supplier: str | None = None
    license: str | None = None
    hash: str | None = None


class SBOM(BaseModel):
    """Software Bill of Materials."""
    format: Literal["spdx", "cyclonedx"] | None = None
    components: list[SBOMComponent] | None = None


class Attestation(BaseModel):
    """Third-party attestation (NIST GOVERN 1.7)."""
    type: Literal["security-audit", "compliance-review", "performance-test", "safety-evaluation", "red-team"]
    issuer: str
    issued_at: str | None = None
    expires_at: str | None = None
    result: Literal["pass", "conditional-pass", "fail"]
    details_url: str | None = None


class ResourceProvenance(BaseModel):
    """Supply chain provenance (NIST SP 800-218A)."""
    publisher: ProvenancePublisher | None = None
    build: BuildInfo | None = None
    sbom: SBOM | None = None
    attestations: list[Attestation] | None = None


class RiskImpact(BaseModel):
    """NIST MAP 5.1 impact categories."""
    people: RiskLevel | Literal["none"] | None = None
    organizations: RiskLevel | Literal["none"] | None = None
    ecosystems: RiskLevel | Literal["none"] | None = None


class NISTControl(BaseModel):
    """NIST SP 800-53 control mapping."""
    control_id: str
    status: Literal["implemented", "partially-implemented", "planned", "not-applicable"]
    evidence: str | None = None


class ResourceRisk(BaseModel):
    """NIST AI RMF risk assessment (MAP 5.1, MEASURE 1.1)."""
    level: RiskLevel | None = None
    impact: RiskImpact | None = None
    autonomy_level: AutonomyLevel | None = None
    data_sensitivity: DataClassification | None = None
    known_limitations: list[str] | None = None
    mitigations: list[str] | None = None
    nist_controls: list[NISTControl] | None = None


class Revocation(BaseModel):
    """Revoked resource (NIST SI-7, CM-3)."""
    gaid: str
    resource_name: str | None = None
    reason: Literal["security-vulnerability", "policy-violation", "publisher-request", "expired", "superseded"]
    severity: Literal["critical", "high", "moderate", "low"] | None = None
    revoked_at: str
    revoked_by: str | None = None
    superseded_by: str | None = None


class AuditEvent(BaseModel):
    """Audit event (NIST AU-2, AU-3)."""
    event_id: str | None = None
    event_type: Literal["publish", "revoke", "update", "peer_added", "peer_removed", "access", "validation", "risk_change"]
    timestamp: str
    actor: str | None = None
    gaid: str | None = None
    details: dict | None = None


class SyncChange(BaseModel):
    """Single change in incremental sync."""
    action: Literal["created", "updated", "revoked", "deleted"]
    resource_type: Literal["skill", "agent", "tool"]
    gaid: str
    timestamp: str
    content_hash: str | None = None
    resource: OssaResource | None = None


class SyncResponse(BaseModel):
    """Incremental sync response."""
    changes: list[SyncChange]
    sync_token: str | None = None
    has_more: bool | None = None


class WebhookFilter(BaseModel):
    """Webhook event filter."""
    resource_types: list[Literal["skill", "agent", "tool"]] | None = None
    trust_tiers: list[TrustTier] | None = None


class WebhookSubscription(BaseModel):
    """Webhook subscription for POST /uadp/v1/events/subscribe."""
    callback_url: str
    events: list[Literal["resource.published", "resource.updated", "resource.revoked", "peer.added", "peer.removed"]]
    secret: str | None = None
    filter: WebhookFilter | None = None


class AgentDNSRecord(BaseModel):
    """DNS TXT record tying agent identity to a domain."""
    domain: str
    record_name: str
    record_value: str


class AgentServiceAcct(BaseModel):
    """Bot/service account for authenticated operations."""
    type: Literal["bot", "service-account", "machine-identity"]
    provider: str
    username: str | None = None
    scopes: list[str] | None = None


class AgentKey(BaseModel):
    """Cryptographic key associated with an agent."""
    id: str
    type: Literal["Ed25519", "ES256", "RSA"]
    public_key: str
    purpose: Literal["signing", "authentication", "encryption"]
    created: str | None = None
    expires: str | None = None


class AgentIdentity(BaseModel):
    """Agent identity record."""
    gaid: str
    did: str
    dns_record: AgentDNSRecord | None = None
    service_account: AgentServiceAcct | None = None
    keys: list[AgentKey] | None = None
    verification_methods: list[str] | None = None


# ─── Node Health & Search ────────────────────────────────────

class NodeHealth(BaseModel):
    """Node health status from GET /uadp/v1/health."""
    status: Literal["healthy", "degraded", "unhealthy"]
    version: str | None = None
    uptime: int | None = None
    checks: dict[str, str] | None = None
    skills: int | None = None
    agents: int | None = None
    tools: int | None = None
    peers: int | None = None
    last_sync: str | None = None


class SearchFacets(BaseModel):
    """Facets returned alongside unified search results."""
    categories: dict[str, int] | None = None
    trust_tiers: dict[str, int] | None = None
    resource_types: dict[str, int] | None = None
    tags: dict[str, int] | None = None


class ProtocolEndpoints(BaseModel):
    """Multi-protocol endpoint map for an agent."""
    uadp: str | None = None
    a2a: str | None = None
    mcp: str | None = None
    openai: str | None = None
    rest: str | None = None
    grpc: str | None = None


class PricingInfo(BaseModel):
    """Agent pricing model."""
    model: Literal["free", "per_request", "subscription", "token_based", "custom"]
    currency: str | None = None
    price_per_call: float | None = None
    free_tier: int | None = None
    details: str | None = None


class SLAInfo(BaseModel):
    """Service level agreement."""
    uptime_percent: float | None = None
    response_time_ms: int | None = None
    support_tier: Literal["community", "standard", "premium", "enterprise"] | None = None
    sla_document: str | None = None


class AgentIndexRecord(BaseModel):
    """.ajson index card for an agent — lightweight cross-registry format."""
    gaid: str
    name: str
    kind: Literal["Skill", "Agent", "Tool"]
    description: str | None = None
    version: str | None = None
    trust_tier: TrustTier | None = None
    category: str | None = None
    tags: list[str] | None = None
    endpoints: ProtocolEndpoints | None = None
    pricing: PricingInfo | None = None
    sla: SLAInfo | None = None
    status: Literal["active", "deprecated", "suspended"] | None = None
    sunset_date: str | None = None
    content_hash: str | None = None
    node_name: str | None = None
    node_id: str | None = None
    updated: str | None = None


# ─── Context Awareness & Token Efficiency ────────────────────

class ContextLayer(BaseModel):
    """Single context layer with priority and token budget."""
    name: str
    priority: int
    max_tokens: int | None = None
    content_type: Literal["code", "documentation", "schema", "config", "embedding", "summary"] | None = None
    required: bool | None = None


class KnowledgeSource(BaseModel):
    """Queryable knowledge source for domain context."""
    type: Literal["qdrant", "neo4j", "weaviate", "pinecone", "meilisearch", "elasticsearch", "custom"]
    endpoint: str
    collection: str | None = None
    auth: Literal["bearer", "api-key", "none"] | None = None
    embedding_model: str | None = None
    embedding_dimensions: int | None = None


class ContextCacheRef(BaseModel):
    """Cached context reference — enables skip-if-unchanged semantics."""
    cache_id: str
    domain: str
    content_hash: str
    computed_at: str
    ttl: int | None = None


class ContextNegotiation(BaseModel):
    """Context negotiation — how an agent receives work context."""
    max_context_tokens: int | None = None
    delivery_mode: Literal["layered", "flat", "streaming"] | None = None
    layers: list[ContextLayer] | None = None
    knowledge_sources: list[KnowledgeSource] | None = None
    cache_refs: list[ContextCacheRef] | None = None


# ─── Token Analytics ─────────────────────────────────────────

class TokenAnalytics(BaseModel):
    """Token usage analytics for an execution."""
    total_tokens: int
    input_tokens: int
    output_tokens: int
    cost_usd: float | None = None
    model: str | None = None
    task_completed: bool
    duration_ms: int | None = None
    efficiency_score: float | None = None
    context_utilization: float | None = None
    timestamp: str


class TaskTypeStat(BaseModel):
    """Per-task-type breakdown in analytics."""
    count: int
    avg_tokens: int
    success_rate: float
    avg_cost_usd: float | None = None


class DomainStat(BaseModel):
    """Per-domain breakdown in analytics."""
    count: int
    avg_tokens: int
    success_rate: float


class TokenAnalyticsAggregate(BaseModel):
    """Aggregate token analytics over a period."""
    gaid: str
    period: Literal["hour", "day", "week", "month", "all_time"]
    execution_count: int
    avg_tokens_per_task: int
    median_tokens_per_task: int | None = None
    p95_tokens_per_task: int | None = None
    avg_cost_per_task_usd: float | None = None
    total_cost_usd: float | None = None
    success_rate: float
    avg_efficiency_score: float | None = None
    by_task_type: dict[str, TaskTypeStat] | None = None
    by_domain: dict[str, DomainStat] | None = None


# ─── Feedback & Rewards ──────────────────────────────────────

class FeedbackSource(BaseModel):
    """Who provided the feedback."""
    type: Literal["human", "agent", "system", "automated-test"]
    id: str
    role: Literal["user", "reviewer", "peer-agent", "supervisor-agent", "qa", "admin"] | None = None


class FeedbackDimensions(BaseModel):
    """Structured feedback across quality dimensions."""
    accuracy: float | None = None
    efficiency: float | None = None
    instruction_following: float | None = None
    quality: float | None = None
    helpfulness: float | None = None
    scope_adherence: float | None = None
    custom: dict[str, float] | None = None


class AgentFeedback(BaseModel):
    """Feedback on an agent's task execution."""
    feedback_id: str
    agent_gaid: str
    task_ref: str | None = None
    source: FeedbackSource
    type: Literal["rating", "correction", "reward", "penalty", "observation"]
    rating: float | None = None
    rating_scale: Literal["1-5", "0-1", "percentage"] | None = None
    comment: str | None = None
    dimensions: FeedbackDimensions | None = None
    timestamp: str
    signature: ResourceSignature | None = None


class RewardEvent(BaseModel):
    """Reward event — tracks incentives for agent behavior."""
    reward_id: str
    agent_gaid: str
    trigger: Literal["task_completion", "quality_threshold", "efficiency_bonus", "streak", "peer_endorsement", "manual"]
    type: Literal["reputation_boost", "priority_increase", "capability_unlock", "token_credit", "badge"]
    value: float | None = None
    badge: str | None = None
    timestamp: str
    task_ref: str | None = None


class FeedbackSummary(BaseModel):
    """Feedback count breakdown."""
    positive: int
    neutral: int
    negative: int


class AgentReputation(BaseModel):
    """Aggregate reputation computed from feedback + rewards."""
    agent_gaid: str
    overall_score: float
    feedback_count: int
    feedback_summary: FeedbackSummary
    dimension_averages: FeedbackDimensions | None = None
    reward_count: int
    badges: list[str] | None = None
    trend: Literal["improving", "stable", "declining"] | None = None
    computed_at: str


# ─── Capability Fingerprint ──────────────────────────────────

class DomainPerformance(BaseModel):
    """Performance in a specific domain."""
    accuracy: float
    avg_tokens: int
    sample_size: int
    avg_cost_usd: float | None = None


class TaskTypePerformance(BaseModel):
    """Performance for a specific task type."""
    accuracy: float
    avg_cost_usd: float | None = None
    avg_tokens: int
    sample_size: int
    avg_duration_ms: int | None = None


class ModelAffinityScore(BaseModel):
    """How well a model works for an agent."""
    efficiency: float
    quality: float


class CapabilityFingerprint(BaseModel):
    """Empirical capability fingerprint from execution data."""
    agent_gaid: str
    domains: dict[str, DomainPerformance] | None = None
    task_types: dict[str, TaskTypePerformance] | None = None
    model_affinity: dict[str, ModelAffinityScore] | None = None
    sample_size: int
    updated_at: str


# ─── Outcome Attestation ─────────────────────────────────────

class OutcomeAttestationMetrics(BaseModel):
    """Metrics within an outcome attestation."""
    tokens_used: int
    duration_ms: int
    cost_usd: float | None = None
    human_override: bool
    confidence: float | None = None


class OutcomeAttestation(BaseModel):
    """Signed attestation of a task outcome."""
    attestation_id: str
    agent_gaid: str
    task_hash: str
    outcome: Literal["success", "partial_success", "failure", "timeout"]
    metrics: OutcomeAttestationMetrics
    attester: str
    timestamp: str
    signature: ResourceSignature | None = None


# ─── Multi-Agent Delegation & Orchestration ──────────────────

class DelegationTask(BaseModel):
    """Task being delegated."""
    type: str
    description: str | None = None
    scope: list[str] | None = None
    inputs: dict | None = None
    expected_output: str | None = None
    priority: Literal["critical", "high", "normal", "low"] | None = None
    deadline: str | None = None


class Finding(BaseModel):
    """Partial result from a parent agent."""
    type: str
    content: str
    confidence: float | None = None


class ContextTransfer(BaseModel):
    """Compressed context passed during delegation."""
    compressed_state: str | None = None
    encoding: Literal["base64", "gzip+base64", "json"] | None = None
    tokens_used_so_far: int | None = None
    findings: list[Finding] | None = None
    cache_refs: list[ContextCacheRef] | None = None
    knowledge_access: list[KnowledgeSource] | None = None


class TaskBudget(BaseModel):
    """Token and cost budget for a delegated task."""
    max_tokens: int | None = None
    max_cost_usd: float | None = None
    max_duration_ms: int | None = None
    max_delegation_depth: int | None = None


class DelegationRequest(BaseModel):
    """Delegation request — one agent hands off work to another."""
    from_agent: str
    to_agent: str
    task: DelegationTask
    context_transfer: ContextTransfer | None = None
    budget: TaskBudget | None = None
    callback_url: str | None = None
    depth: int | None = None
    max_depth: int | None = None


class DelegationChainEntry(BaseModel):
    """Sub-delegation in the chain."""
    agent_gaid: str
    task_type: str
    tokens_used: int
    status: str


class DelegationResult(BaseModel):
    """Result from a delegated task."""
    status: Literal["completed", "failed", "partial", "timeout", "rejected"]
    result: dict | None = None
    analytics: TokenAnalytics | None = None
    delegate_feedback: str | None = None
    delegation_chain: list[DelegationChainEntry] | None = None


class OrchestrationStep(BaseModel):
    """Single step in an orchestration plan."""
    step_id: str
    name: str
    agent_type: Literal["orchestrator", "worker", "specialist", "critic", "monitor", "gateway"] | None = None
    agent_gaid: str | None = None
    task: DelegationTask
    depends_on: list[str] | None = None
    budget: TaskBudget | None = None
    status: Literal["pending", "running", "completed", "failed", "skipped"] | None = None
    result: DelegationResult | None = None


class OrchestrationPlan(BaseModel):
    """Orchestration plan — how an orchestrator distributes work."""
    plan_id: str
    orchestrator_gaid: str
    task: DelegationTask
    steps: list[OrchestrationStep]
    strategy: Literal["sequential", "parallel", "dag", "adaptive"]
    budget: TaskBudget | None = None
    status: Literal["planning", "executing", "completed", "failed", "cancelled"]
    created_at: str
    updated_at: str | None = None


# ─── Batch Operations ────────────────────────────────────────

class BatchPublishResult(BaseModel):
    """Single result in a batch publish response."""
    index: int
    success: bool
    resource: OssaResource | None = None
    error: str | None = None


class BatchPublishResponse(BaseModel):
    """Batch publish response."""
    total: int
    succeeded: int
    failed: int
    results: list[BatchPublishResult]


# ─── Protocol Compatibility ──────────────────────────────────

class A2AProvider(BaseModel):
    """Provider in an A2A Agent Card."""
    organization: str | None = None
    url: str | None = None


class A2ACapabilities(BaseModel):
    """Capabilities in an A2A Agent Card."""
    streaming: bool | None = None
    pushNotifications: bool | None = None
    stateTransitionHistory: bool | None = None


class A2ASkill(BaseModel):
    """Skill in an A2A Agent Card."""
    id: str
    name: str
    description: str | None = None
    tags: list[str] | None = None
    examples: list[str] | None = None


class A2AUadpExtensions(BaseModel):
    """UADP-specific extensions in an Agent Card."""
    gaid: str | None = None
    trust_tier: str | None = None
    content_hash: str | None = None
    node_name: str | None = None


class A2AAgentCard(BaseModel):
    """Google A2A-compatible Agent Card."""
    name: str
    description: str | None = None
    url: str
    version: str | None = None
    provider: A2AProvider | None = None
    capabilities: A2ACapabilities | None = None
    authentication: dict | None = None
    skills: list[A2ASkill] | None = None
    defaultInputModes: list[Literal["text", "file", "data"]] | None = None
    defaultOutputModes: list[Literal["text", "file", "data"]] | None = None
    _uadp: A2AUadpExtensions | None = None


class McpToolUadp(BaseModel):
    """UADP extensions on an MCP tool."""
    gaid: str | None = None
    trust_tier: str | None = None
    content_hash: str | None = None


class McpTool(BaseModel):
    """Single tool in an MCP server manifest."""
    name: str
    description: str | None = None
    inputSchema: dict | None = None
    _uadp: McpToolUadp | None = None


class McpServerManifest(BaseModel):
    """MCP-compatible server manifest."""
    name: str
    version: str
    description: str | None = None
    tools: list[McpTool]


# ─── Structured Query ────────────────────────────────────────

class QueryFilter(BaseModel):
    """Single filter in a structured query."""
    field: str
    operator: Literal["eq", "ne", "gt", "gte", "lt", "lte", "in", "contains", "exists", "not_exists"]
    value: object


class QuerySort(BaseModel):
    """Sort specification in a structured query."""
    field: str
    order: Literal["asc", "desc"] = "asc"


class StructuredQuery(BaseModel):
    """Structured query for advanced resource discovery."""
    filters: list[QueryFilter] | None = None
    sort: list[QuerySort] | None = None
    fields: list[str] | None = None
    kinds: list[Literal["Skill", "Agent", "Tool"]] | None = None
    federated: bool = False
    page: int = 1
    limit: int = 20
    cursor: str | None = None
