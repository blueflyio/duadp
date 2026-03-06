// Package uadp provides types and client for the Universal AI Discovery Protocol.
package uadp

// UadpManifest is the discovery manifest served at /.well-known/uadp.json.
type UadpManifest struct {
	ProtocolVersion string            `json:"protocol_version"`
	NodeID          string            `json:"node_id,omitempty"`
	NodeName        string            `json:"node_name"`
	NodeDescription string            `json:"node_description,omitempty"`
	Contact         string            `json:"contact,omitempty"`
	Endpoints       UadpEndpoints     `json:"endpoints"`
	Capabilities    []string          `json:"capabilities,omitempty"`
	Identity        *NodeIdentity     `json:"identity,omitempty"`
	PublicKey       string            `json:"public_key,omitempty"` // deprecated
	OssaVersions    []string          `json:"ossa_versions,omitempty"`
	Federation      *FederationConfig `json:"federation,omitempty"`
	Governance      *NodeGovernance   `json:"governance,omitempty"`
}

// UadpEndpoints maps capability names to URLs (relative or absolute).
type UadpEndpoints struct {
	Skills      string `json:"skills,omitempty"`
	Agents      string `json:"agents,omitempty"`
	Tools       string `json:"tools,omitempty"`
	Federation  string `json:"federation,omitempty"`
	Validate    string `json:"validate,omitempty"`
	Publish     string `json:"publish,omitempty"`
	Governance  string `json:"governance,omitempty"`
	Provenance  string `json:"provenance,omitempty"`
	Revocations string `json:"revocations,omitempty"`
	AuditLog    string `json:"audit_log,omitempty"`
	Events      string `json:"events,omitempty"`
	Identity    string `json:"identity,omitempty"`
}

// NodeIdentity contains DID-based identity for signature verification.
type NodeIdentity struct {
	DID       string `json:"did,omitempty"`
	PublicKey string `json:"public_key,omitempty"`
}

// FederationConfig in the manifest.
type FederationConfig struct {
	Gossip  bool `json:"gossip,omitempty"`
	MaxHops int  `json:"max_hops,omitempty"`
}

// TrustTier represents the trust level of a resource.
type TrustTier string

const (
	TrustOfficial          TrustTier = "official"
	TrustVerifiedSignature TrustTier = "verified-signature"
	TrustSigned            TrustTier = "signed"
	TrustCommunity         TrustTier = "community"
	TrustExperimental      TrustTier = "experimental"
)

// PeerStatus represents the health of a federation peer.
type PeerStatus string

const (
	PeerHealthy     PeerStatus = "healthy"
	PeerDegraded    PeerStatus = "degraded"
	PeerUnreachable PeerStatus = "unreachable"
)

// OssaMetadata is common metadata for all OSSA resources.
type OssaMetadata struct {
	Name        string    `json:"name"`
	Version     string    `json:"version,omitempty"`
	Description string    `json:"description,omitempty"`
	URI         string    `json:"uri,omitempty"`
	Category    string    `json:"category,omitempty"`
	TrustTier   TrustTier `json:"trust_tier,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
	Created     string    `json:"created,omitempty"`
	Updated     string    `json:"updated,omitempty"`
}

// ResourceSignature for cryptographic verification.
type ResourceSignature struct {
	Algorithm string `json:"algorithm"`
	Value     string `json:"value"`
	Signer    string `json:"signer"`
	Timestamp string `json:"timestamp,omitempty"`
}

// ResourceIdentityDNS is the DNS binding for a resource.
type ResourceIdentityDNS struct {
	Record   string `json:"record"`
	Verified bool   `json:"verified,omitempty"`
}

// ResourceIdentitySigningKey holds signing key material.
type ResourceIdentitySigningKey struct {
	ID                 string `json:"id"`
	Type               string `json:"type"`
	PublicKeyMultibase string `json:"public_key_multibase"`
}

// ResourceIdentityEncryptionKey holds encryption key material.
type ResourceIdentityEncryptionKey struct {
	ID                 string `json:"id"`
	Type               string `json:"type"`
	PublicKeyMultibase string `json:"public_key_multibase"`
}

// ResourceIdentityKeyRotation holds key rotation policy.
type ResourceIdentityKeyRotation struct {
	NextKeyHash    string `json:"next_key_hash,omitempty"`
	RotationPolicy string `json:"rotation_policy,omitempty"`
}

// ResourceIdentityKeys holds all cryptographic keys.
type ResourceIdentityKeys struct {
	Signing    ResourceIdentitySigningKey     `json:"signing"`
	Encryption *ResourceIdentityEncryptionKey `json:"encryption,omitempty"`
	Rotation   *ResourceIdentityKeyRotation   `json:"rotation,omitempty"`
}

// ResourceIdentityServiceAccount for autonomous operations.
type ResourceIdentityServiceAccount struct {
	ID            string   `json:"id"`
	Type          string   `json:"type"`          // bot, service, system
	Provider      string   `json:"provider,omitempty"`
	Scopes        []string `json:"scopes"`
	TokenEndpoint string   `json:"token_endpoint,omitempty"`
	ClientID      string   `json:"client_id,omitempty"`
}

// ResourceIdentityProvenanceAttestation is an attestation reference.
type ResourceIdentityProvenanceAttestation struct {
	Type string `json:"type"`
	URI  string `json:"uri"`
}

// ResourceIdentityProvenance tracks supply chain provenance.
type ResourceIdentityProvenance struct {
	Creator          string                                  `json:"creator,omitempty"`
	Publisher        string                                  `json:"publisher"`
	Created          string                                  `json:"created"`
	Published        string                                  `json:"published"`
	SourceRepository string                                  `json:"source_repository,omitempty"`
	CommitHash       string                                  `json:"commit_hash,omitempty"`
	BuildSystem      string                                  `json:"build_system,omitempty"`
	Attestations     []ResourceIdentityProvenanceAttestation `json:"attestations,omitempty"`
}

// ResourceIdentityLifecycle tracks resource lifecycle state.
type ResourceIdentityLifecycle struct {
	Status      string  `json:"status"` // draft, active, suspended, deprecated, revoked
	Activated   string  `json:"activated,omitempty"`
	Expires     *string `json:"expires,omitempty"`
	Suspended   *string `json:"suspended,omitempty"`
	Revoked     *string `json:"revoked,omitempty"`
	Deprecation *string `json:"deprecation,omitempty"`
	Successor   *string `json:"successor,omitempty"`
}

// ResourceIdentityRateLimit configures rate limiting.
type ResourceIdentityRateLimit struct {
	RequestsPerMinute  *int `json:"requests_per_minute,omitempty"`
	ConcurrentSessions *int `json:"concurrent_sessions,omitempty"`
}

// ResourceIdentityAvailability configures availability.
type ResourceIdentityAvailability struct {
	SLA     string   `json:"sla,omitempty"`
	Regions []string `json:"regions,omitempty"`
}

// ResourceIdentityOperational holds operational context.
type ResourceIdentityOperational struct {
	Endpoint     string                         `json:"endpoint,omitempty"`
	Protocol     string                         `json:"protocol,omitempty"`  // mcp, a2a, rest, grpc, websocket
	Transport    string                         `json:"transport,omitempty"` // https, sse, stdio, websocket
	HealthCheck  string                         `json:"health_check,omitempty"`
	RateLimit    *ResourceIdentityRateLimit     `json:"rate_limit,omitempty"`
	Availability *ResourceIdentityAvailability  `json:"availability,omitempty"`
}

// ResourceIdentityRelationships maps relationships to other resources.
type ResourceIdentityRelationships struct {
	ParentAgent     string   `json:"parent_agent,omitempty"`
	Skills          []string `json:"skills,omitempty"`
	Tools           []string `json:"tools,omitempty"`
	DependsOn       []string `json:"depends_on,omitempty"`
	DelegatesTo     []string `json:"delegates_to,omitempty"`
	RegisteredNodes []string `json:"registered_nodes,omitempty"`
}

// ResourceIdentitySafety holds safety configuration.
type ResourceIdentitySafety struct {
	HumanOversight    string   `json:"human_oversight,omitempty"`     // none, optional, recommended, required
	MaxAutonomyLevel  string   `json:"max_autonomy_level,omitempty"` // autonomous, supervised, human-in-loop, view-only
	RestrictedActions []string `json:"restricted_actions,omitempty"`
	SafetyPolicy      string   `json:"safety_policy,omitempty"`
}

// ResourceIdentityDataHandling configures data handling.
type ResourceIdentityDataHandling struct {
	PIIAccess          bool     `json:"pii_access,omitempty"`
	DataRetention      string   `json:"data_retention,omitempty"` // none, session, 30d, 365d, permanent
	DataResidency      []string `json:"data_residency,omitempty"`
	EncryptionAtRest   bool     `json:"encryption_at_rest,omitempty"`
	EncryptionInTransit bool    `json:"encryption_in_transit,omitempty"`
}

// ResourceIdentityAudit configures audit logging.
type ResourceIdentityAudit struct {
	LogEndpoint  string `json:"log_endpoint,omitempty"`
	LogFormat    string `json:"log_format,omitempty"` // OTEL, CEF, JSON, syslog
	RetentionDays *int  `json:"retention_days,omitempty"`
}

// ResourceIdentityCompliance holds compliance and safety configuration.
type ResourceIdentityCompliance struct {
	NISTControls []string                       `json:"nist_controls,omitempty"`
	Safety       *ResourceIdentitySafety        `json:"safety,omitempty"`
	DataHandling *ResourceIdentityDataHandling  `json:"data_handling,omitempty"`
	Audit        *ResourceIdentityAudit         `json:"audit,omitempty"`
}

// ResourceIdentityReputation tracks reputation and trust.
type ResourceIdentityReputation struct {
	TrustTier         TrustTier `json:"trust_tier,omitempty"`
	VerificationDate  string    `json:"verification_date,omitempty"`
	VerifiedBy        string    `json:"verified_by,omitempty"`
	AttestationsCount *int      `json:"attestations_count,omitempty"`
	UsageCount        *int      `json:"usage_count,omitempty"`
	NodesRegistered   *int      `json:"nodes_registered,omitempty"`
	CommunityRating   *float64  `json:"community_rating,omitempty"`
	Incidents         *int      `json:"incidents,omitempty"`
}

// ResourceIdentity is the comprehensive identity for an agent/resource.
type ResourceIdentity struct {
	DID            string                          `json:"did"`
	GAID           string                          `json:"gaid"`
	DNS            *ResourceIdentityDNS            `json:"dns,omitempty"`
	Keys           *ResourceIdentityKeys           `json:"keys,omitempty"`
	ServiceAccount *ResourceIdentityServiceAccount `json:"service_account,omitempty"`
	Provenance     *ResourceIdentityProvenance     `json:"provenance,omitempty"`
	Lifecycle      *ResourceIdentityLifecycle      `json:"lifecycle,omitempty"`
	Operational    *ResourceIdentityOperational    `json:"operational,omitempty"`
	Relationships  *ResourceIdentityRelationships  `json:"relationships,omitempty"`
	Compliance     *ResourceIdentityCompliance     `json:"compliance,omitempty"`
	Reputation     *ResourceIdentityReputation     `json:"reputation,omitempty"`
}

// OssaResource is the generic base for all OSSA resources.
type OssaResource struct {
	APIVersion  string              `json:"apiVersion"`
	Kind        string              `json:"kind"`
	Metadata    OssaMetadata        `json:"metadata"`
	Identity    *ResourceIdentity   `json:"identity,omitempty"`
	Spec        map[string]any      `json:"spec,omitempty"`
	Signature   *ResourceSignature  `json:"signature,omitempty"`
	Provenance  *ResourceProvenance `json:"provenance,omitempty"`
	Risk        *ResourceRisk       `json:"risk,omitempty"`
	ContentHash string              `json:"content_hash,omitempty"`
}

// OssaSkill is an OSSA Skill resource.
type OssaSkill = OssaResource

// OssaAgent is an OSSA Agent resource.
type OssaAgent = OssaResource

// OssaTool is an OSSA Tool resource (MCP, A2A, function-calling, REST).
type OssaTool = OssaResource

// FederatedSource tracks which node contributed to a federated search.
type FederatedSource struct {
	NodeID   string `json:"node_id,omitempty"`
	NodeName string `json:"node_name,omitempty"`
	Count    int    `json:"count"`
}

// PaginationMeta for list responses.
type PaginationMeta struct {
	Total     int               `json:"total"`
	Page      int               `json:"page"`
	Limit     int               `json:"limit"`
	NodeName  string            `json:"node_name"`
	NodeID    string            `json:"node_id,omitempty"`
	Federated bool              `json:"federated,omitempty"`
	Sources   []FederatedSource `json:"sources,omitempty"`
}

// SkillsResponse for GET /uadp/v1/skills.
type SkillsResponse struct {
	Data []OssaSkill    `json:"data"`
	Meta PaginationMeta `json:"meta"`
}

// AgentsResponse for GET /uadp/v1/agents.
type AgentsResponse struct {
	Data []OssaAgent    `json:"data"`
	Meta PaginationMeta `json:"meta"`
}

// ToolsResponse for GET /uadp/v1/tools.
type ToolsResponse struct {
	Data []OssaTool     `json:"data"`
	Meta PaginationMeta `json:"meta"`
}

// Peer in federation.
type Peer struct {
	URL          string     `json:"url"`
	NodeID       string     `json:"node_id,omitempty"`
	Name         string     `json:"name"`
	Status       PeerStatus `json:"status"`
	LastSynced   *string    `json:"last_synced,omitempty"`
	Capabilities []string   `json:"capabilities,omitempty"`
	SkillCount   *int       `json:"skill_count,omitempty"`
	AgentCount   *int       `json:"agent_count,omitempty"`
	ToolCount    *int       `json:"tool_count,omitempty"`
}

// FederationResponse for GET /uadp/v1/federation.
type FederationResponse struct {
	ProtocolVersion string `json:"protocol_version"`
	NodeID          string `json:"node_id,omitempty"`
	NodeName        string `json:"node_name"`
	Gossip          bool   `json:"gossip,omitempty"`
	MaxHops         int    `json:"max_hops,omitempty"`
	Peers           []Peer `json:"peers"`
}

// PublishResponse from POST publish endpoints.
type PublishResponse struct {
	Success  bool          `json:"success"`
	Resource *OssaResource `json:"resource,omitempty"`
}

// ValidationResult from POST /uadp/v1/validate.
type ValidationResult struct {
	Valid    bool     `json:"valid"`
	Errors   []string `json:"errors"`
	Warnings []string `json:"warnings"`
}

// ListParams for querying skills/agents/tools.
type ListParams struct {
	Search    string
	Category  string
	TrustTier TrustTier
	Tag       string
	Federated bool
	Page      int
	Limit     int
}

// ToolListParams extends ListParams with a protocol filter.
type ToolListParams struct {
	ListParams
	Protocol string // mcp, a2a, openai, function, langchain, crewai, autogen, rest, grpc
}

// WebFingerLink in a WebFinger response.
type WebFingerLink struct {
	Rel  string `json:"rel"`
	Type string `json:"type,omitempty"`
	Href string `json:"href"`
}

// WebFingerResponse from /.well-known/webfinger.
type WebFingerResponse struct {
	Subject    string            `json:"subject"`
	Links      []WebFingerLink   `json:"links"`
	Properties map[string]string `json:"properties,omitempty"`
}

// PeerRegistration for POST /uadp/v1/federation.
type PeerRegistration struct {
	URL    string `json:"url"`
	Name   string `json:"name"`
	NodeID string `json:"node_id,omitempty"`
	Hop    int    `json:"hop,omitempty"`
}

// PeerRegistrationResponse includes the peer list for gossip propagation.
type PeerRegistrationResponse struct {
	Success bool   `json:"success"`
	Peer    *Peer  `json:"peer,omitempty"`
	Peers   []Peer `json:"peers,omitempty"`
}

// ErrorResponse for error responses.
type ErrorResponse struct {
	Error string `json:"error"`
	Code  string `json:"code,omitempty"`
}

// ─── NIST AI RMF Aligned Types ──────────────────────────────

// NodeGovernance declares governance policies (NIST GOVERN function).
type NodeGovernance struct {
	ComplianceFrameworks []string `json:"compliance_frameworks,omitempty"`
	RiskTolerance        string   `json:"risk_tolerance,omitempty"`        // strict, moderate, permissive
	DataClassification   string   `json:"data_classification,omitempty"`   // public, internal, confidential, restricted
	ReviewPolicy         string   `json:"review_policy,omitempty"`         // manual, automated, hybrid
	AuditRetentionDays   int      `json:"audit_retention_days,omitempty"`
}

// ResourceProvenance tracks supply chain provenance (NIST SP 800-218A).
type ResourceProvenance struct {
	Publisher    *ProvenancePublisher `json:"publisher,omitempty"`
	Build        *BuildInfo          `json:"build,omitempty"`
	SBOM         *SBOM               `json:"sbom,omitempty"`
	Attestations []Attestation       `json:"attestations,omitempty"`
}

// ProvenancePublisher identifies who published a resource.
type ProvenancePublisher struct {
	Name         string `json:"name"`
	URL          string `json:"url,omitempty"`
	Organization string `json:"organization,omitempty"`
	Verified     bool   `json:"verified,omitempty"`
}

// BuildInfo provides SLSA-style build provenance.
type BuildInfo struct {
	Builder      string `json:"builder,omitempty"`
	SourceRepo   string `json:"source_repo,omitempty"`
	CommitSHA    string `json:"commit_sha,omitempty"`
	BuildTime    string `json:"build_time,omitempty"`
	Reproducible bool   `json:"reproducible,omitempty"`
}

// SBOM is a Software Bill of Materials.
type SBOM struct {
	Format     string          `json:"format,omitempty"` // spdx, cyclonedx
	Components []SBOMComponent `json:"components,omitempty"`
}

// SBOMComponent is a single component in an SBOM.
type SBOMComponent struct {
	Name     string `json:"name"`
	Version  string `json:"version,omitempty"`
	Type     string `json:"type,omitempty"` // model, library, framework, tool, dataset, runtime
	Supplier string `json:"supplier,omitempty"`
	License  string `json:"license,omitempty"`
	Hash     string `json:"hash,omitempty"`
}

// Attestation is a third-party assessment (NIST GOVERN 1.7).
type Attestation struct {
	Type       string `json:"type"`       // security-audit, compliance-review, performance-test, safety-evaluation, red-team
	Issuer     string `json:"issuer"`
	IssuedAt   string `json:"issued_at,omitempty"`
	ExpiresAt  string `json:"expires_at,omitempty"`
	Result     string `json:"result"`     // pass, conditional-pass, fail
	DetailsURL string `json:"details_url,omitempty"`
}

// ResourceRisk is a NIST AI RMF risk assessment (MAP 5.1, MEASURE 1.1).
type ResourceRisk struct {
	Level            string          `json:"level,omitempty"` // critical, high, moderate, low, minimal
	Impact           *RiskImpact     `json:"impact,omitempty"`
	AutonomyLevel    string          `json:"autonomy_level,omitempty"` // fully-autonomous, supervised, human-in-the-loop, advisory
	DataSensitivity  string          `json:"data_sensitivity,omitempty"`
	KnownLimitations []string        `json:"known_limitations,omitempty"`
	Mitigations      []string        `json:"mitigations,omitempty"`
	NISTControls     []NISTControl   `json:"nist_controls,omitempty"`
}

// RiskImpact maps to NIST MAP 5.1 impact categories.
type RiskImpact struct {
	People        string `json:"people,omitempty"`
	Organizations string `json:"organizations,omitempty"`
	Ecosystems    string `json:"ecosystems,omitempty"`
}

// NISTControl maps a NIST SP 800-53 control to its implementation status.
type NISTControl struct {
	ControlID string `json:"control_id"` // e.g., AC-6, SA-4, SR-3
	Status    string `json:"status"`     // implemented, partially-implemented, planned, not-applicable
	Evidence  string `json:"evidence,omitempty"`
}

// Revocation represents a revoked resource (NIST SI-7, CM-3).
type Revocation struct {
	GAID         string `json:"gaid"`
	ResourceName string `json:"resource_name,omitempty"`
	Reason       string `json:"reason"`     // security-vulnerability, policy-violation, publisher-request, expired, superseded
	Severity     string `json:"severity,omitempty"` // critical, high, moderate, low
	RevokedAt    string `json:"revoked_at"`
	RevokedBy    string `json:"revoked_by,omitempty"`
	SupersededBy string `json:"superseded_by,omitempty"`
}

// AuditEvent is a governance-relevant audit trail entry (NIST AU-2, AU-3).
type AuditEvent struct {
	EventID   string         `json:"event_id,omitempty"`
	EventType string         `json:"event_type"` // publish, revoke, update, peer_added, peer_removed, access, validation, risk_change
	Timestamp string         `json:"timestamp"`
	Actor     string         `json:"actor,omitempty"`
	GAID      string         `json:"gaid,omitempty"`
	Details   map[string]any `json:"details,omitempty"`
}

// SyncChange represents a single change in incremental sync.
type SyncChange struct {
	Action       string        `json:"action"`        // created, updated, revoked, deleted
	ResourceType string        `json:"resource_type"`  // skill, agent, tool
	GAID         string        `json:"gaid"`
	Timestamp    string        `json:"timestamp"`
	ContentHash  string        `json:"content_hash,omitempty"`
	Resource     *OssaResource `json:"resource,omitempty"`
}

// SyncResponse for GET /uadp/v1/federation/sync.
type SyncResponse struct {
	Changes   []SyncChange `json:"changes"`
	SyncToken string       `json:"sync_token,omitempty"`
	HasMore   bool         `json:"has_more,omitempty"`
}

// WebhookSubscription for POST /uadp/v1/events/subscribe.
type WebhookSubscription struct {
	CallbackURL string              `json:"callback_url"`
	Events      []string            `json:"events"`
	Secret      string              `json:"secret,omitempty"`
	Filter      *WebhookFilter      `json:"filter,omitempty"`
}

// WebhookFilter restricts which events are delivered.
type WebhookFilter struct {
	ResourceTypes []string `json:"resource_types,omitempty"`
	TrustTiers    []string `json:"trust_tiers,omitempty"`
}

// AgentIdentity is the identity record for an agent.
type AgentIdentity struct {
	GAID                string             `json:"gaid"`
	DID                 string             `json:"did"`
	DNSRecord           *AgentDNSRecord    `json:"dns_record,omitempty"`
	ServiceAccount      *AgentServiceAcct  `json:"service_account,omitempty"`
	Keys                []AgentKey         `json:"keys,omitempty"`
	VerificationMethods []string           `json:"verification_methods,omitempty"`
}

// AgentDNSRecord ties agent identity to a domain.
type AgentDNSRecord struct {
	Domain      string `json:"domain"`
	RecordName  string `json:"record_name"`
	RecordValue string `json:"record_value"`
}

// AgentServiceAcct is a bot/service account for authenticated operations.
type AgentServiceAcct struct {
	Type     string   `json:"type"`     // bot, service-account, machine-identity
	Provider string   `json:"provider"` // gitlab, github, entra-id, okta
	Username string   `json:"username,omitempty"`
	Scopes   []string `json:"scopes,omitempty"`
}

// AgentKey is a cryptographic key associated with an agent.
type AgentKey struct {
	ID        string `json:"id"`
	Type      string `json:"type"`      // Ed25519, ES256, RSA
	PublicKey string `json:"public_key"`
	Purpose   string `json:"purpose"`   // signing, authentication, encryption
	Created   string `json:"created,omitempty"`
	Expires   string `json:"expires,omitempty"`
}
