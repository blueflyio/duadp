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
