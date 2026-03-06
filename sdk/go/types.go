// Package duadp provides types and client for the Universal AI Discovery Protocol.
package duadp

// UadpManifest is the discovery manifest served at /.well-known/duadp.json.
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
	Identity     string `json:"identity,omitempty"`
	Context      string `json:"context,omitempty"`
	Analytics    string `json:"analytics,omitempty"`
	Feedback     string `json:"feedback,omitempty"`
	Attestations string `json:"attestations,omitempty"`
	Delegate     string `json:"delegate,omitempty"`
	Health       string `json:"health,omitempty"`
	Search       string `json:"search,omitempty"`
	Index        string `json:"index,omitempty"`
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
	Sources    []FederatedSource `json:"sources,omitempty"`
	NextCursor string            `json:"next_cursor,omitempty"`
	PrevCursor string            `json:"prev_cursor,omitempty"`
}

// SkillsResponse for GET /api/v1/skills.
type SkillsResponse struct {
	Data []OssaSkill    `json:"data"`
	Meta PaginationMeta `json:"meta"`
}

// AgentsResponse for GET /api/v1/agents.
type AgentsResponse struct {
	Data []OssaAgent    `json:"data"`
	Meta PaginationMeta `json:"meta"`
}

// ToolsResponse for GET /api/v1/tools.
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

// FederationResponse for GET /api/v1/federation.
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

// ValidationResult from POST /api/v1/validate.
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

// PeerRegistration for POST /api/v1/federation.
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

// SyncResponse for GET /api/v1/federation/sync.
type SyncResponse struct {
	Changes   []SyncChange `json:"changes"`
	SyncToken string       `json:"sync_token,omitempty"`
	HasMore   bool         `json:"has_more,omitempty"`
}

// WebhookSubscription for POST /api/v1/events/subscribe.
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

// ─── Node Health & Search ────────────────────────────────────

// NodeHealth is the response from GET /api/v1/health.
type NodeHealth struct {
	Status     string            `json:"status"` // healthy, degraded, unhealthy
	Version    string            `json:"version,omitempty"`
	Uptime     int               `json:"uptime,omitempty"`
	Checks     map[string]string `json:"checks,omitempty"`
	Skills     *int              `json:"skills,omitempty"`
	Agents     *int              `json:"agents,omitempty"`
	Tools      *int              `json:"tools,omitempty"`
	Peers      *int              `json:"peers,omitempty"`
	LastSync   string            `json:"last_sync,omitempty"`
}

// SearchFacets are returned alongside unified search results.
type SearchFacets struct {
	Categories    map[string]int `json:"categories,omitempty"`
	TrustTiers    map[string]int `json:"trust_tiers,omitempty"`
	ResourceTypes map[string]int `json:"resource_types,omitempty"`
	Tags          map[string]int `json:"tags,omitempty"`
}

// SearchResponse is the unified search response.
type SearchResponse struct {
	Data   []OssaResource `json:"data"`
	Meta   PaginationMeta `json:"meta"`
	Facets *SearchFacets  `json:"facets,omitempty"`
}

// ProtocolEndpoints maps protocol names to their endpoint URLs.
type ProtocolEndpoints struct {
	DUADP    string `json:"duadp,omitempty"`
	A2A     string `json:"a2a,omitempty"`
	MCP     string `json:"mcp,omitempty"`
	OpenAI  string `json:"openai,omitempty"`
	REST    string `json:"rest,omitempty"`
	GRPC    string `json:"grpc,omitempty"`
}

// PricingInfo describes an agent's pricing model.
type PricingInfo struct {
	Model        string   `json:"model"` // free, per_request, subscription, token_based, custom
	Currency     string   `json:"currency,omitempty"`
	PricePerCall *float64 `json:"price_per_call,omitempty"`
	FreeTier     *int     `json:"free_tier,omitempty"`
	Details      string   `json:"details,omitempty"`
}

// SLAInfo describes service level agreements.
type SLAInfo struct {
	UptimePercent  *float64 `json:"uptime_percent,omitempty"`
	ResponseTimeMs *int     `json:"response_time_ms,omitempty"`
	SupportTier    string   `json:"support_tier,omitempty"` // community, standard, premium, enterprise
	SLADocument    string   `json:"sla_document,omitempty"`
}

// AgentIndexRecord is the .ajson index card for an agent.
type AgentIndexRecord struct {
	GAID        string             `json:"gaid"`
	Name        string             `json:"name"`
	Kind        string             `json:"kind"` // Skill, Agent, Tool
	Description string             `json:"description,omitempty"`
	Version     string             `json:"version,omitempty"`
	TrustTier   TrustTier          `json:"trust_tier,omitempty"`
	Category    string             `json:"category,omitempty"`
	Tags        []string           `json:"tags,omitempty"`
	Endpoints   *ProtocolEndpoints `json:"endpoints,omitempty"`
	Pricing     *PricingInfo       `json:"pricing,omitempty"`
	SLA         *SLAInfo           `json:"sla,omitempty"`
	Status      string             `json:"status,omitempty"` // active, deprecated, suspended
	SunsetDate  string             `json:"sunset_date,omitempty"`
	ContentHash string             `json:"content_hash,omitempty"`
	NodeName    string             `json:"node_name,omitempty"`
	NodeID      string             `json:"node_id,omitempty"`
	Updated     string             `json:"updated,omitempty"`
}

// ─── Context Awareness & Token Efficiency ────────────────────

// ContextNegotiation describes how an agent receives work context.
type ContextNegotiation struct {
	MaxContextTokens int               `json:"max_context_tokens,omitempty"`
	DeliveryMode     string            `json:"delivery_mode,omitempty"` // layered, flat, streaming
	Layers           []ContextLayer    `json:"layers,omitempty"`
	KnowledgeSources []KnowledgeSource `json:"knowledge_sources,omitempty"`
	CacheRefs        []ContextCacheRef `json:"cache_refs,omitempty"`
}

// ContextLayer is a single context layer with priority.
type ContextLayer struct {
	Name        string `json:"name"`
	Priority    int    `json:"priority"`
	MaxTokens   *int   `json:"max_tokens,omitempty"`
	ContentType string `json:"content_type,omitempty"` // code, documentation, schema, config, embedding, summary
	Required    bool   `json:"required,omitempty"`
}

// KnowledgeSource is a queryable knowledge source.
type KnowledgeSource struct {
	Type                string `json:"type"` // qdrant, neo4j, weaviate, pinecone, meilisearch, elasticsearch, custom
	Endpoint            string `json:"endpoint"`
	Collection          string `json:"collection,omitempty"`
	Auth                string `json:"auth,omitempty"` // bearer, api-key, none
	EmbeddingModel      string `json:"embedding_model,omitempty"`
	EmbeddingDimensions *int   `json:"embedding_dimensions,omitempty"`
}

// ContextCacheRef enables skip-if-unchanged context delivery.
type ContextCacheRef struct {
	CacheID     string `json:"cache_id"`
	Domain      string `json:"domain"`
	ContentHash string `json:"content_hash"`
	ComputedAt  string `json:"computed_at"`
	TTL         *int   `json:"ttl,omitempty"`
}

// ─── Token Analytics ─────────────────────────────────────────

// TokenAnalytics tracks token usage for an execution.
type TokenAnalytics struct {
	TotalTokens        int     `json:"total_tokens"`
	InputTokens        int     `json:"input_tokens"`
	OutputTokens       int     `json:"output_tokens"`
	CostUSD            *float64 `json:"cost_usd,omitempty"`
	Model              string  `json:"model,omitempty"`
	TaskCompleted      bool    `json:"task_completed"`
	DurationMs         *int    `json:"duration_ms,omitempty"`
	EfficiencyScore    *float64 `json:"efficiency_score,omitempty"`
	ContextUtilization *float64 `json:"context_utilization,omitempty"`
	Timestamp          string  `json:"timestamp"`
}

// TokenAnalyticsAggregate aggregates token analytics over a period.
type TokenAnalyticsAggregate struct {
	GAID               string             `json:"gaid"`
	Period             string             `json:"period"` // hour, day, week, month, all_time
	ExecutionCount     int                `json:"execution_count"`
	AvgTokensPerTask   int                `json:"avg_tokens_per_task"`
	MedianTokens       *int               `json:"median_tokens_per_task,omitempty"`
	P95Tokens          *int               `json:"p95_tokens_per_task,omitempty"`
	AvgCostPerTask     *float64           `json:"avg_cost_per_task_usd,omitempty"`
	TotalCost          *float64           `json:"total_cost_usd,omitempty"`
	SuccessRate        float64            `json:"success_rate"`
	AvgEfficiency      *float64           `json:"avg_efficiency_score,omitempty"`
	ByTaskType         map[string]TaskTypeStat `json:"by_task_type,omitempty"`
	ByDomain           map[string]DomainStat   `json:"by_domain,omitempty"`
}

// TaskTypeStat is per-task-type breakdown in analytics.
type TaskTypeStat struct {
	Count       int      `json:"count"`
	AvgTokens   int      `json:"avg_tokens"`
	SuccessRate float64  `json:"success_rate"`
	AvgCost     *float64 `json:"avg_cost_usd,omitempty"`
}

// DomainStat is per-domain breakdown in analytics.
type DomainStat struct {
	Count       int     `json:"count"`
	AvgTokens   int     `json:"avg_tokens"`
	SuccessRate float64 `json:"success_rate"`
}

// ─── Feedback & Rewards ──────────────────────────────────────

// FeedbackSource identifies who provided feedback.
type FeedbackSource struct {
	Type string `json:"type"` // human, agent, system, automated-test
	ID   string `json:"id"`
	Role string `json:"role,omitempty"` // user, reviewer, peer-agent, supervisor-agent, qa, admin
}

// FeedbackDimensions are structured quality ratings.
type FeedbackDimensions struct {
	Accuracy            *float64           `json:"accuracy,omitempty"`
	Efficiency          *float64           `json:"efficiency,omitempty"`
	InstructionFollowing *float64          `json:"instruction_following,omitempty"`
	Quality             *float64           `json:"quality,omitempty"`
	Helpfulness         *float64           `json:"helpfulness,omitempty"`
	ScopeAdherence      *float64           `json:"scope_adherence,omitempty"`
	Custom              map[string]float64 `json:"custom,omitempty"`
}

// AgentFeedback is feedback on an agent's execution.
type AgentFeedback struct {
	FeedbackID  string              `json:"feedback_id"`
	AgentGAID   string              `json:"agent_gaid"`
	TaskRef     string              `json:"task_ref,omitempty"`
	Source      FeedbackSource      `json:"source"`
	Type        string              `json:"type"` // rating, correction, reward, penalty, observation
	Rating      *float64            `json:"rating,omitempty"`
	RatingScale string              `json:"rating_scale,omitempty"` // 1-5, 0-1, percentage
	Comment     string              `json:"comment,omitempty"`
	Dimensions  *FeedbackDimensions `json:"dimensions,omitempty"`
	Timestamp   string              `json:"timestamp"`
	Signature   *ResourceSignature  `json:"signature,omitempty"`
}

// RewardEvent tracks incentives for agent behavior.
type RewardEvent struct {
	RewardID  string `json:"reward_id"`
	AgentGAID string `json:"agent_gaid"`
	Trigger   string `json:"trigger"` // task_completion, quality_threshold, efficiency_bonus, streak, peer_endorsement, manual
	Type      string `json:"type"`    // reputation_boost, priority_increase, capability_unlock, token_credit, badge
	Value     *float64 `json:"value,omitempty"`
	Badge     string `json:"badge,omitempty"`
	Timestamp string `json:"timestamp"`
	TaskRef   string `json:"task_ref,omitempty"`
}

// AgentReputation is the aggregate reputation computed from feedback.
type AgentReputation struct {
	AgentGAID        string              `json:"agent_gaid"`
	OverallScore     float64             `json:"overall_score"`
	FeedbackCount    int                 `json:"feedback_count"`
	FeedbackSummary  FeedbackSummary     `json:"feedback_summary"`
	DimensionAverages *FeedbackDimensions `json:"dimension_averages,omitempty"`
	RewardCount      int                 `json:"reward_count"`
	Badges           []string            `json:"badges,omitempty"`
	Trend            string              `json:"trend,omitempty"` // improving, stable, declining
	ComputedAt       string              `json:"computed_at"`
}

// FeedbackSummary breaks down feedback counts.
type FeedbackSummary struct {
	Positive int `json:"positive"`
	Neutral  int `json:"neutral"`
	Negative int `json:"negative"`
}

// ─── Capability Fingerprint ──────────────────────────────────

// CapabilityFingerprint is computed from actual execution data.
type CapabilityFingerprint struct {
	AgentGAID     string                        `json:"agent_gaid"`
	Domains       map[string]DomainPerformance  `json:"domains,omitempty"`
	TaskTypes     map[string]TaskTypePerformance `json:"task_types,omitempty"`
	ModelAffinity map[string]ModelAffinityScore  `json:"model_affinity,omitempty"`
	SampleSize    int                           `json:"sample_size"`
	UpdatedAt     string                        `json:"updated_at"`
}

// DomainPerformance tracks performance in a specific domain.
type DomainPerformance struct {
	Accuracy   float64  `json:"accuracy"`
	AvgTokens  int      `json:"avg_tokens"`
	SampleSize int      `json:"sample_size"`
	AvgCost    *float64 `json:"avg_cost_usd,omitempty"`
}

// TaskTypePerformance tracks performance for a specific task type.
type TaskTypePerformance struct {
	Accuracy   float64  `json:"accuracy"`
	AvgCost    *float64 `json:"avg_cost_usd,omitempty"`
	AvgTokens  int      `json:"avg_tokens"`
	SampleSize int      `json:"sample_size"`
	AvgDuration *int    `json:"avg_duration_ms,omitempty"`
}

// ModelAffinityScore rates how well a model works for an agent.
type ModelAffinityScore struct {
	Efficiency float64 `json:"efficiency"`
	Quality    float64 `json:"quality"`
}

// ─── Outcome Attestation ─────────────────────────────────────

// OutcomeAttestationMetrics are the metrics within an attestation.
type OutcomeAttestationMetrics struct {
	TokensUsed    int      `json:"tokens_used"`
	DurationMs    int      `json:"duration_ms"`
	CostUSD       *float64 `json:"cost_usd,omitempty"`
	HumanOverride bool     `json:"human_override"`
	Confidence    *float64 `json:"confidence,omitempty"`
}

// OutcomeAttestation is a signed attestation of a task outcome.
type OutcomeAttestation struct {
	AttestationID string                    `json:"attestation_id"`
	AgentGAID     string                    `json:"agent_gaid"`
	TaskHash      string                    `json:"task_hash"`
	Outcome       string                    `json:"outcome"` // success, partial_success, failure, timeout
	Metrics       OutcomeAttestationMetrics `json:"metrics"`
	Attester      string                    `json:"attester"`
	Timestamp     string                    `json:"timestamp"`
	Signature     *ResourceSignature        `json:"signature,omitempty"`
}

// ─── Multi-Agent Delegation & Orchestration ──────────────────

// DelegationTask is the task being delegated.
type DelegationTask struct {
	Type           string         `json:"type"`
	Description    string         `json:"description,omitempty"`
	Scope          []string       `json:"scope,omitempty"`
	Inputs         map[string]any `json:"inputs,omitempty"`
	ExpectedOutput string         `json:"expected_output,omitempty"`
	Priority       string         `json:"priority,omitempty"` // critical, high, normal, low
	Deadline       string         `json:"deadline,omitempty"`
}

// ContextTransfer is compressed context passed during delegation.
type ContextTransfer struct {
	CompressedState string            `json:"compressed_state,omitempty"`
	Encoding        string            `json:"encoding,omitempty"` // base64, gzip+base64, json
	TokensUsedSoFar *int              `json:"tokens_used_so_far,omitempty"`
	Findings        []Finding         `json:"findings,omitempty"`
	CacheRefs       []ContextCacheRef `json:"cache_refs,omitempty"`
	KnowledgeAccess []KnowledgeSource `json:"knowledge_access,omitempty"`
}

// Finding is a partial result from a parent agent.
type Finding struct {
	Type       string   `json:"type"`
	Content    string   `json:"content"`
	Confidence *float64 `json:"confidence,omitempty"`
}

// TaskBudget constrains delegation resources.
type TaskBudget struct {
	MaxTokens          *int     `json:"max_tokens,omitempty"`
	MaxCostUSD         *float64 `json:"max_cost_usd,omitempty"`
	MaxDurationMs      *int     `json:"max_duration_ms,omitempty"`
	MaxDelegationDepth *int     `json:"max_delegation_depth,omitempty"`
}

// DelegationRequest hands off work to another agent.
type DelegationRequest struct {
	FromAgent       string           `json:"from_agent"`
	ToAgent         string           `json:"to_agent"`
	Task            DelegationTask   `json:"task"`
	ContextTransfer *ContextTransfer `json:"context_transfer,omitempty"`
	Budget          *TaskBudget      `json:"budget,omitempty"`
	CallbackURL     string           `json:"callback_url,omitempty"`
	Depth           *int             `json:"depth,omitempty"`
	MaxDepth        *int             `json:"max_depth,omitempty"`
}

// DelegationChainEntry tracks a sub-delegation in the chain.
type DelegationChainEntry struct {
	AgentGAID  string `json:"agent_gaid"`
	TaskType   string `json:"task_type"`
	TokensUsed int    `json:"tokens_used"`
	Status     string `json:"status"`
}

// DelegationResult is returned by the delegate agent.
type DelegationResult struct {
	Status           string                 `json:"status"` // completed, failed, partial, timeout, rejected
	Result           map[string]any         `json:"result,omitempty"`
	Analytics        *TokenAnalytics        `json:"analytics,omitempty"`
	DelegateFeedback string                 `json:"delegate_feedback,omitempty"`
	DelegationChain  []DelegationChainEntry `json:"delegation_chain,omitempty"`
}

// OrchestrationStep is a single step in an orchestration plan.
type OrchestrationStep struct {
	StepID    string            `json:"step_id"`
	Name      string            `json:"name"`
	AgentType string            `json:"agent_type,omitempty"` // orchestrator, worker, specialist, critic, monitor, gateway
	AgentGAID string            `json:"agent_gaid,omitempty"`
	Task      DelegationTask    `json:"task"`
	DependsOn []string          `json:"depends_on,omitempty"`
	Budget    *TaskBudget       `json:"budget,omitempty"`
	Status    string            `json:"status,omitempty"` // pending, running, completed, failed, skipped
	Result    *DelegationResult `json:"result,omitempty"`
}

// OrchestrationPlan describes how an orchestrator distributes work.
type OrchestrationPlan struct {
	PlanID           string              `json:"plan_id"`
	OrchestratorGAID string             `json:"orchestrator_gaid"`
	Task             DelegationTask      `json:"task"`
	Steps            []OrchestrationStep `json:"steps"`
	Strategy         string              `json:"strategy"` // sequential, parallel, dag, adaptive
	Budget           *TaskBudget         `json:"budget,omitempty"`
	Status           string              `json:"status"` // planning, executing, completed, failed, cancelled
	CreatedAt        string              `json:"created_at"`
	UpdatedAt        string              `json:"updated_at,omitempty"`
}

// ─── Batch Operations ────────────────────────────────────────

// BatchPublishRequest for POST /api/v1/publish/batch.
type BatchPublishRequest struct {
	Resources []OssaResource `json:"resources"`
	Atomic    bool           `json:"atomic,omitempty"`
}

// BatchPublishResult is a single result in a batch publish response.
type BatchPublishResult struct {
	Index    int           `json:"index"`
	Success  bool          `json:"success"`
	Resource *OssaResource `json:"resource,omitempty"`
	Error    string        `json:"error,omitempty"`
}

// BatchPublishResponse for POST /api/v1/publish/batch.
type BatchPublishResponse struct {
	Total     int                  `json:"total"`
	Succeeded int                  `json:"succeeded"`
	Failed    int                  `json:"failed"`
	Results   []BatchPublishResult `json:"results"`
}

// ─── Protocol Compatibility ──────────────────────────────────

// A2AAgentCard is a Google A2A-compatible Agent Card.
type A2AAgentCard struct {
	Name           string              `json:"name"`
	Description    string              `json:"description,omitempty"`
	URL            string              `json:"url"`
	Version        string              `json:"version,omitempty"`
	Provider       *A2AProvider        `json:"provider,omitempty"`
	Capabilities   *A2ACapabilities    `json:"capabilities,omitempty"`
	Authentication *A2AAuthentication  `json:"authentication,omitempty"`
	Skills         []A2ASkill          `json:"skills,omitempty"`
	DefaultInputModes  []string        `json:"defaultInputModes,omitempty"`
	DefaultOutputModes []string        `json:"defaultOutputModes,omitempty"`
	UadpExtensions *A2AUadpExtensions  `json:"_uadp,omitempty"`
}

// A2AProvider in an Agent Card.
type A2AProvider struct {
	Organization string `json:"organization,omitempty"`
	URL          string `json:"url,omitempty"`
}

// A2ACapabilities in an Agent Card.
type A2ACapabilities struct {
	Streaming              bool `json:"streaming,omitempty"`
	PushNotifications      bool `json:"pushNotifications,omitempty"`
	StateTransitionHistory bool `json:"stateTransitionHistory,omitempty"`
}

// A2AAuthentication in an Agent Card.
type A2AAuthentication struct {
	Schemes []string `json:"schemes,omitempty"`
}

// A2ASkill in an Agent Card.
type A2ASkill struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	Examples    []string `json:"examples,omitempty"`
}

// A2AUadpExtensions are DUADP-specific extensions in an Agent Card.
type A2AUadpExtensions struct {
	GAID        string `json:"gaid,omitempty"`
	TrustTier   string `json:"trust_tier,omitempty"`
	ContentHash string `json:"content_hash,omitempty"`
	NodeName    string `json:"node_name,omitempty"`
}

// McpTool is a single tool in an MCP server manifest.
type McpTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	InputSchema map[string]any `json:"inputSchema,omitempty"`
	Uadp        *McpToolUadp   `json:"_uadp,omitempty"`
}

// McpToolUadp are DUADP extensions on an MCP tool.
type McpToolUadp struct {
	GAID        string `json:"gaid,omitempty"`
	TrustTier   string `json:"trust_tier,omitempty"`
	ContentHash string `json:"content_hash,omitempty"`
}

// McpServerManifest is an MCP-compatible server manifest.
type McpServerManifest struct {
	Name        string    `json:"name"`
	Version     string    `json:"version"`
	Description string    `json:"description,omitempty"`
	Tools       []McpTool `json:"tools"`
}

// ─── Structured Query ────────────────────────────────────────

// QueryFilter is a single filter in a structured query.
type QueryFilter struct {
	Field    string `json:"field"`
	Operator string `json:"operator"` // eq, ne, gt, gte, lt, lte, in, contains, exists, not_exists
	Value    any    `json:"value"`
}

// QuerySort is a sort specification in a structured query.
type QuerySort struct {
	Field string `json:"field"`
	Order string `json:"order,omitempty"` // asc, desc
}

// StructuredQuery for POST /api/v1/query.
type StructuredQuery struct {
	Filters   []QueryFilter `json:"filters,omitempty"`
	Sort      []QuerySort   `json:"sort,omitempty"`
	Fields    []string      `json:"fields,omitempty"`
	Kinds     []string      `json:"kinds,omitempty"` // Skill, Agent, Tool
	Federated bool          `json:"federated,omitempty"`
	Page      int           `json:"page,omitempty"`
	Limit     int           `json:"limit,omitempty"`
	Cursor    string        `json:"cursor,omitempty"`
}
