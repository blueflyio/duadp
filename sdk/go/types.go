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
}

// UadpEndpoints maps capability names to URLs (relative or absolute).
type UadpEndpoints struct {
	Skills     string `json:"skills,omitempty"`
	Agents     string `json:"agents,omitempty"`
	Tools      string `json:"tools,omitempty"`
	Federation string `json:"federation,omitempty"`
	Validate   string `json:"validate,omitempty"`
	Publish    string `json:"publish,omitempty"`
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

// OssaResource is the generic base for all OSSA resources.
type OssaResource struct {
	APIVersion string             `json:"apiVersion"`
	Kind       string             `json:"kind"`
	Metadata   OssaMetadata       `json:"metadata"`
	Spec       map[string]any     `json:"spec,omitempty"`
	Signature  *ResourceSignature `json:"signature,omitempty"`
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
	Protocol string // mcp, a2a, function, rest
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
