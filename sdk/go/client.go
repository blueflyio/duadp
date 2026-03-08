package duadp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// DuadpError is returned when a DUADP request fails.
type DuadpError struct {
	Message    string
	StatusCode int
}

func (e *DuadpError) Error() string {
	if e.StatusCode > 0 {
		return fmt.Sprintf("duadp: HTTP %d: %s", e.StatusCode, e.Message)
	}
	return fmt.Sprintf("duadp: %s", e.Message)
}

// ClientOption configures the DUADP client.
type ClientOption func(*Client)

// WithHTTPClient sets a custom HTTP client.
func WithHTTPClient(c *http.Client) ClientOption {
	return func(client *Client) { client.httpClient = c }
}

// WithTimeout sets the request timeout.
func WithTimeout(d time.Duration) ClientOption {
	return func(client *Client) { client.timeout = d }
}

// WithHeaders sets custom headers for all requests.
func WithHeaders(h map[string]string) ClientOption {
	return func(client *Client) { client.headers = h }
}

// WithToken sets a bearer token for authenticated operations.
func WithToken(token string) ClientOption {
	return func(client *Client) { client.token = token }
}

// Client discovers and queries a DUADP node.
type Client struct {
	BaseURL    string
	httpClient *http.Client
	timeout    time.Duration
	headers    map[string]string
	token      string
	manifest   *DuadpManifest
}

// NewClient creates a new DUADP client for the given base URL.
func NewClient(baseURL string, opts ...ClientOption) *Client {
	c := &Client{
		BaseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: http.DefaultClient,
		timeout:    10 * time.Second,
		headers:    map[string]string{},
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// --- Discovery ---

// Discover fetches /.well-known/duadp.json and caches the manifest.
func (c *Client) Discover(ctx context.Context) (*DuadpManifest, error) {
	u := c.BaseURL + "/.well-known/duadp.json"
	var manifest DuadpManifest
	if err := c.doGet(ctx, u, &manifest); err != nil {
		return nil, fmt.Errorf("discovery failed: %w", err)
	}
	c.manifest = &manifest
	return &manifest, nil
}

// GetManifest returns the cached manifest or discovers it.
func (c *Client) GetManifest(ctx context.Context) (*DuadpManifest, error) {
	if c.manifest != nil {
		return c.manifest, nil
	}
	return c.Discover(ctx)
}

// ResolveWebFinger queries /.well-known/webfinger for a GAID.
func (c *Client) ResolveWebFinger(ctx context.Context, gaid string) (*WebFingerResponse, error) {
	u := c.BaseURL + "/.well-known/webfinger?resource=" + url.QueryEscape(gaid)
	var resp WebFingerResponse
	if err := c.doGet(ctx, u, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// --- Skills ---

// ListSkills queries GET /api/v1/skills.
func (c *Client) ListSkills(ctx context.Context, params *ListParams) (*SkillsResponse, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Skills")
	if err != nil {
		return nil, err
	}
	u := c.buildURL(endpoint, params)
	var resp SkillsResponse
	if err := c.doGet(ctx, u, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// GetSkill fetches GET /api/v1/skills/{name}.
func (c *Client) GetSkill(ctx context.Context, name string) (*OssaSkill, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Skills")
	if err != nil {
		return nil, err
	}
	var skill OssaSkill
	if err := c.doGet(ctx, endpoint+"/"+url.PathEscape(name), &skill); err != nil {
		return nil, err
	}
	return &skill, nil
}

// PublishSkill sends POST /api/v1/skills.
func (c *Client) PublishSkill(ctx context.Context, skill *OssaSkill) (*PublishResponse, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Skills")
	if err != nil {
		return nil, err
	}
	body, _ := json.Marshal(skill)
	var resp PublishResponse
	if err := c.doPost(ctx, endpoint, string(body), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// --- Agents ---

// ListAgents queries GET /api/v1/agents.
func (c *Client) ListAgents(ctx context.Context, params *ListParams) (*AgentsResponse, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Agents")
	if err != nil {
		return nil, err
	}
	u := c.buildURL(endpoint, params)
	var resp AgentsResponse
	if err := c.doGet(ctx, u, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// GetAgent fetches GET /api/v1/agents/{name}.
func (c *Client) GetAgent(ctx context.Context, name string) (*OssaAgent, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Agents")
	if err != nil {
		return nil, err
	}
	var agent OssaAgent
	if err := c.doGet(ctx, endpoint+"/"+url.PathEscape(name), &agent); err != nil {
		return nil, err
	}
	return &agent, nil
}

// PublishAgent sends POST /api/v1/agents.
func (c *Client) PublishAgent(ctx context.Context, agent *OssaAgent) (*PublishResponse, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Agents")
	if err != nil {
		return nil, err
	}
	body, _ := json.Marshal(agent)
	var resp PublishResponse
	if err := c.doPost(ctx, endpoint, string(body), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// --- Tools ---

// ListTools queries GET /api/v1/tools.
func (c *Client) ListTools(ctx context.Context, params *ToolListParams) (*ToolsResponse, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Tools")
	if err != nil {
		return nil, err
	}
	u := c.buildURL(endpoint, &params.ListParams)
	if params.Protocol != "" {
		parsed, _ := url.Parse(u)
		q := parsed.Query()
		q.Set("protocol", params.Protocol)
		parsed.RawQuery = q.Encode()
		u = parsed.String()
	}
	var resp ToolsResponse
	if err := c.doGet(ctx, u, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// GetTool fetches GET /api/v1/tools/{name}.
func (c *Client) GetTool(ctx context.Context, name string) (*OssaTool, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Tools")
	if err != nil {
		return nil, err
	}
	var tool OssaTool
	if err := c.doGet(ctx, endpoint+"/"+url.PathEscape(name), &tool); err != nil {
		return nil, err
	}
	return &tool, nil
}

// PublishTool sends POST /api/v1/tools.
func (c *Client) PublishTool(ctx context.Context, tool *OssaTool) (*PublishResponse, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Tools")
	if err != nil {
		return nil, err
	}
	body, _ := json.Marshal(tool)
	var resp PublishResponse
	if err := c.doPost(ctx, endpoint, string(body), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// --- Policies (Cedar) ---

// ListPolicies queries GET /api/v1/policies.
func (c *Client) ListPolicies(ctx context.Context, params *PolicyListParams) (*PoliciesResponse, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Policies")
	if err != nil {
		return nil, err
	}
	parsed, _ := url.Parse(endpoint)
	q := parsed.Query()
	if params != nil {
		if params.Tag != "" {
			q.Set("tag", params.Tag)
		}
		if params.Framework != "" {
			q.Set("framework", params.Framework)
		}
		if params.Search != "" {
			q.Set("search", params.Search)
		}
		if params.Page > 0 {
			q.Set("page", fmt.Sprintf("%d", params.Page))
		}
		if params.Limit > 0 {
			q.Set("limit", fmt.Sprintf("%d", params.Limit))
		}
	}
	parsed.RawQuery = q.Encode()
	var resp PoliciesResponse
	if err := c.doGet(ctx, parsed.String(), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// GetPolicy fetches GET /api/v1/policies/{name}.
func (c *Client) GetPolicy(ctx context.Context, name string) (*CedarPolicy, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Policies")
	if err != nil {
		return nil, err
	}
	var policy CedarPolicy
	if err := c.doGet(ctx, endpoint+"/"+url.PathEscape(name), &policy); err != nil {
		return nil, err
	}
	return &policy, nil
}

// --- Generic Publish ---

// Publish sends POST /api/v1/publish for any OSSA resource.
func (c *Client) Publish(ctx context.Context, resource *OssaResource) (*PublishResponse, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Publish")
	if err != nil {
		return nil, err
	}
	body, _ := json.Marshal(resource)
	var resp PublishResponse
	if err := c.doPost(ctx, endpoint, string(body), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// --- Federation ---

// GetFederation queries GET /api/v1/federation.
func (c *Client) GetFederation(ctx context.Context) (*FederationResponse, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Federation")
	if err != nil {
		return nil, err
	}
	var resp FederationResponse
	if err := c.doGet(ctx, endpoint, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// RegisterAsPeer sends POST /api/v1/federation to register.
func (c *Client) RegisterAsPeer(ctx context.Context, reg *PeerRegistration) (*PeerRegistrationResponse, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Federation")
	if err != nil {
		return nil, err
	}
	body, _ := json.Marshal(reg)
	var resp PeerRegistrationResponse
	if err := c.doPost(ctx, endpoint, string(body), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// --- Validation ---

// Validate sends POST /api/v1/validate.
func (c *Client) Validate(ctx context.Context, manifest string) (*ValidationResult, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Validate")
	if err != nil {
		return nil, err
	}
	body := fmt.Sprintf(`{"manifest":%q}`, manifest)
	var result ValidationResult
	if err := c.doPost(ctx, endpoint, body, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// --- Governance (NIST AI RMF) ---

// GetGovernance queries GET /api/v1/governance.
func (c *Client) GetGovernance(ctx context.Context) (*NodeGovernance, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Governance")
	if err != nil {
		return nil, err
	}
	var gov NodeGovernance
	if err := c.doGet(ctx, endpoint, &gov); err != nil {
		return nil, err
	}
	return &gov, nil
}

// GetResourceRisk queries GET /api/v1/governance/risk/{gaid}.
func (c *Client) GetResourceRisk(ctx context.Context, gaid string) (*ResourceRisk, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Governance")
	if err != nil {
		return nil, err
	}
	var risk ResourceRisk
	if err := c.doGet(ctx, endpoint+"/risk/"+url.PathEscape(gaid), &risk); err != nil {
		return nil, err
	}
	return &risk, nil
}

// AuditParams for querying audit logs.
type AuditParams struct {
	EventType string
	GAID      string
	Since     string
	Page      int
	Limit     int
}

// GetAuditLog queries GET /api/v1/governance/audit.
func (c *Client) GetAuditLog(ctx context.Context, params *AuditParams) ([]AuditEvent, error) {
	endpoint, err := c.resolveEndpoint(ctx, "AuditLog")
	if err != nil {
		// Fallback: try governance + /audit
		govEndpoint, govErr := c.resolveEndpoint(ctx, "Governance")
		if govErr != nil {
			return nil, err
		}
		endpoint = govEndpoint + "/audit"
	}
	u, _ := url.Parse(endpoint)
	q := u.Query()
	if params != nil {
		if params.EventType != "" {
			q.Set("event_type", params.EventType)
		}
		if params.GAID != "" {
			q.Set("gaid", params.GAID)
		}
		if params.Since != "" {
			q.Set("since", params.Since)
		}
		if params.Page > 0 {
			q.Set("page", strconv.Itoa(params.Page))
		}
		if params.Limit > 0 {
			q.Set("limit", strconv.Itoa(params.Limit))
		}
	}
	u.RawQuery = q.Encode()
	var events []AuditEvent
	if err := c.doGet(ctx, u.String(), &events); err != nil {
		return nil, err
	}
	return events, nil
}

// --- Provenance (NIST SP 800-218A) ---

// GetProvenance queries GET /api/v1/provenance/{gaid}.
func (c *Client) GetProvenance(ctx context.Context, gaid string) (*ResourceProvenance, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Provenance")
	if err != nil {
		return nil, err
	}
	var prov ResourceProvenance
	if err := c.doGet(ctx, endpoint+"/"+url.PathEscape(gaid), &prov); err != nil {
		return nil, err
	}
	return &prov, nil
}

// --- Revocations (NIST SI-7, CM-3) ---

// RevocationParams for querying revocations.
type RevocationParams struct {
	Severity string
	Since    string
	Page     int
	Limit    int
}

// GetRevocations queries GET /api/v1/revocations.
func (c *Client) GetRevocations(ctx context.Context, params *RevocationParams) ([]Revocation, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Revocations")
	if err != nil {
		return nil, err
	}
	u, _ := url.Parse(endpoint)
	q := u.Query()
	if params != nil {
		if params.Severity != "" {
			q.Set("severity", params.Severity)
		}
		if params.Since != "" {
			q.Set("since", params.Since)
		}
		if params.Page > 0 {
			q.Set("page", strconv.Itoa(params.Page))
		}
		if params.Limit > 0 {
			q.Set("limit", strconv.Itoa(params.Limit))
		}
	}
	u.RawQuery = q.Encode()
	var revocations []Revocation
	if err := c.doGet(ctx, u.String(), &revocations); err != nil {
		return nil, err
	}
	return revocations, nil
}

// --- Federation Sync ---

// SyncParams for incremental sync.
type SyncParams struct {
	Since     string
	SyncToken string
	Limit     int
}

// FederationSync queries GET /api/v1/federation/sync.
func (c *Client) FederationSync(ctx context.Context, params *SyncParams) (*SyncResponse, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Federation")
	if err != nil {
		return nil, err
	}
	u, _ := url.Parse(endpoint + "/sync")
	q := u.Query()
	if params != nil {
		if params.Since != "" {
			q.Set("since", params.Since)
		}
		if params.SyncToken != "" {
			q.Set("sync_token", params.SyncToken)
		}
		if params.Limit > 0 {
			q.Set("limit", strconv.Itoa(params.Limit))
		}
	}
	u.RawQuery = q.Encode()
	var resp SyncResponse
	if err := c.doGet(ctx, u.String(), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// --- Events (Webhooks) ---

// SubscribeWebhook sends POST /api/v1/events/subscribe.
func (c *Client) SubscribeWebhook(ctx context.Context, sub *WebhookSubscription) error {
	endpoint, err := c.resolveEndpoint(ctx, "Events")
	if err != nil {
		return err
	}
	body, _ := json.Marshal(sub)
	return c.doPost(ctx, endpoint+"/subscribe", string(body), nil)
}

// --- Agent Identity ---

// GetAgentIdentity queries GET /api/v1/identity/{gaid}.
func (c *Client) GetAgentIdentity(ctx context.Context, gaid string) (*AgentIdentity, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Identity")
	if err != nil {
		return nil, err
	}
	var identity AgentIdentity
	if err := c.doGet(ctx, endpoint+"/"+url.PathEscape(gaid), &identity); err != nil {
		return nil, err
	}
	return &identity, nil
}

// --- Batch Operations ---

// BatchPublish sends POST /api/v1/publish/batch.
func (c *Client) BatchPublish(ctx context.Context, req *BatchPublishRequest) (*BatchPublishResponse, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Publish")
	if err != nil {
		return nil, err
	}
	body, _ := json.Marshal(req)
	var resp BatchPublishResponse
	if err := c.doPost(ctx, endpoint+"/batch", string(body), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// --- Protocol Compatibility (A2A, MCP) ---

// GetA2ACard queries GET /api/v1/agents/{name}/card.
func (c *Client) GetA2ACard(ctx context.Context, name string) (*A2AAgentCard, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Agents")
	if err != nil {
		return nil, err
	}
	var card A2AAgentCard
	if err := c.doGet(ctx, endpoint+"/"+url.PathEscape(name)+"/card", &card); err != nil {
		return nil, err
	}
	return &card, nil
}

// GetMcpManifest queries GET /api/v1/tools/mcp-manifest.
func (c *Client) GetMcpManifest(ctx context.Context) (*McpServerManifest, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Tools")
	if err != nil {
		return nil, err
	}
	var manifest McpServerManifest
	if err := c.doGet(ctx, endpoint+"/mcp-manifest", &manifest); err != nil {
		return nil, err
	}
	return &manifest, nil
}

// --- Structured Query ---

// Query sends POST /api/v1/query.
func (c *Client) Query(ctx context.Context, q *StructuredQuery) (*SearchResponse, error) {
	body, _ := json.Marshal(q)
	var resp SearchResponse
	if err := c.doPost(ctx, c.BaseURL+"/api/v1/query", string(body), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// --- Health ---

// GetHealth queries GET /api/v1/health.
func (c *Client) GetHealth(ctx context.Context) (*NodeHealth, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Health")
	if err != nil {
		// Fallback to base URL + /api/v1/health
		endpoint = c.BaseURL + "/api/v1/health"
	}
	var health NodeHealth
	if err := c.doGet(ctx, endpoint, &health); err != nil {
		return nil, err
	}
	return &health, nil
}

// --- Unified Search ---

// SearchParams for unified search.
type SearchParams struct {
	Query        string
	Kind         string // skill, agent, tool (empty = all)
	Category     string
	TrustTier    TrustTier
	Tag          string
	Federated    bool
	Page         int
	Limit        int
	IncludeFacets bool
}

// UnifiedSearch queries GET /api/v1/search.
func (c *Client) UnifiedSearch(ctx context.Context, params *SearchParams) (*SearchResponse, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Search")
	if err != nil {
		return nil, err
	}
	u, _ := url.Parse(endpoint)
	q := u.Query()
	if params != nil {
		if params.Query != "" {
			q.Set("q", params.Query)
		}
		if params.Kind != "" {
			q.Set("kind", params.Kind)
		}
		if params.Category != "" {
			q.Set("category", params.Category)
		}
		if params.TrustTier != "" {
			q.Set("trust_tier", string(params.TrustTier))
		}
		if params.Tag != "" {
			q.Set("tag", params.Tag)
		}
		if params.Federated {
			q.Set("federated", "true")
		}
		if params.Page > 0 {
			q.Set("page", strconv.Itoa(params.Page))
		}
		if params.Limit > 0 {
			q.Set("limit", strconv.Itoa(params.Limit))
		}
		if params.IncludeFacets {
			q.Set("facets", "true")
		}
	}
	u.RawQuery = q.Encode()
	var resp SearchResponse
	if err := c.doGet(ctx, u.String(), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// --- Agent Index (.ajson) ---

// GetAgentIndex queries GET /api/v1/index/{gaid}.
func (c *Client) GetAgentIndex(ctx context.Context, gaid string) (*AgentIndexRecord, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Index")
	if err != nil {
		return nil, err
	}
	var record AgentIndexRecord
	if err := c.doGet(ctx, endpoint+"/"+url.PathEscape(gaid), &record); err != nil {
		return nil, err
	}
	return &record, nil
}

// --- Context Negotiation ---

// NegotiateContext sends POST /api/v1/context/negotiate.
func (c *Client) NegotiateContext(ctx context.Context, agentGAID string, task *DelegationTask) (*ContextNegotiation, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Context")
	if err != nil {
		return nil, err
	}
	payload := map[string]any{"agent_gaid": agentGAID, "task": task}
	body, _ := json.Marshal(payload)
	var result ContextNegotiation
	if err := c.doPost(ctx, endpoint+"/negotiate", string(body), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// GetContextSummary queries GET /api/v1/context/summary.
func (c *Client) GetContextSummary(ctx context.Context, domain, taskType string) (*ContextNegotiation, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Context")
	if err != nil {
		return nil, err
	}
	u, _ := url.Parse(endpoint + "/summary")
	q := u.Query()
	q.Set("domain", domain)
	if taskType != "" {
		q.Set("task_type", taskType)
	}
	u.RawQuery = q.Encode()
	var result ContextNegotiation
	if err := c.doGet(ctx, u.String(), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// --- Token Analytics ---

// ReportTokenUsage sends POST /api/v1/analytics/tokens.
func (c *Client) ReportTokenUsage(ctx context.Context, analytics *TokenAnalytics) error {
	endpoint, err := c.resolveEndpoint(ctx, "Analytics")
	if err != nil {
		return err
	}
	body, _ := json.Marshal(analytics)
	return c.doPost(ctx, endpoint+"/tokens", string(body), nil)
}

// GetTokenAnalytics queries GET /api/v1/analytics/tokens/{gaid}.
func (c *Client) GetTokenAnalytics(ctx context.Context, agentGAID, period string) (*TokenAnalyticsAggregate, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Analytics")
	if err != nil {
		return nil, err
	}
	u, _ := url.Parse(endpoint + "/tokens/" + url.PathEscape(agentGAID))
	if period != "" {
		q := u.Query()
		q.Set("period", period)
		u.RawQuery = q.Encode()
	}
	var result TokenAnalyticsAggregate
	if err := c.doGet(ctx, u.String(), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// --- Capability Fingerprint ---

// GetCapabilityFingerprint queries GET /api/v1/analytics/fingerprint/{gaid}.
func (c *Client) GetCapabilityFingerprint(ctx context.Context, agentGAID string) (*CapabilityFingerprint, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Analytics")
	if err != nil {
		return nil, err
	}
	var result CapabilityFingerprint
	if err := c.doGet(ctx, endpoint+"/fingerprint/"+url.PathEscape(agentGAID), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// --- Feedback & Rewards ---

// SubmitFeedback sends POST /api/v1/feedback.
func (c *Client) SubmitFeedback(ctx context.Context, feedback *AgentFeedback) (*AgentFeedback, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Feedback")
	if err != nil {
		return nil, err
	}
	body, _ := json.Marshal(feedback)
	var result AgentFeedback
	if err := c.doPost(ctx, endpoint, string(body), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// FeedbackParams for querying agent feedback.
type FeedbackParams struct {
	Type  string
	Since string
	Limit int
}

// GetAgentFeedback queries GET /api/v1/feedback/{gaid}.
func (c *Client) GetAgentFeedback(ctx context.Context, agentGAID string, params *FeedbackParams) ([]AgentFeedback, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Feedback")
	if err != nil {
		return nil, err
	}
	u, _ := url.Parse(endpoint + "/" + url.PathEscape(agentGAID))
	q := u.Query()
	if params != nil {
		if params.Type != "" {
			q.Set("type", params.Type)
		}
		if params.Since != "" {
			q.Set("since", params.Since)
		}
		if params.Limit > 0 {
			q.Set("limit", strconv.Itoa(params.Limit))
		}
	}
	u.RawQuery = q.Encode()
	var feedbacks []AgentFeedback
	if err := c.doGet(ctx, u.String(), &feedbacks); err != nil {
		return nil, err
	}
	return feedbacks, nil
}

// GetAgentReputation queries GET /api/v1/feedback/{gaid}/reputation.
func (c *Client) GetAgentReputation(ctx context.Context, agentGAID string) (*AgentReputation, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Feedback")
	if err != nil {
		return nil, err
	}
	var result AgentReputation
	if err := c.doGet(ctx, endpoint+"/"+url.PathEscape(agentGAID)+"/reputation", &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// RecordReward sends POST /api/v1/feedback/rewards.
func (c *Client) RecordReward(ctx context.Context, reward *RewardEvent) (*RewardEvent, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Feedback")
	if err != nil {
		return nil, err
	}
	body, _ := json.Marshal(reward)
	var result RewardEvent
	if err := c.doPost(ctx, endpoint+"/rewards", string(body), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// --- Outcome Attestations ---

// SubmitAttestation sends POST /api/v1/attestations.
func (c *Client) SubmitAttestation(ctx context.Context, attestation *OutcomeAttestation) (*OutcomeAttestation, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Attestations")
	if err != nil {
		return nil, err
	}
	body, _ := json.Marshal(attestation)
	var result OutcomeAttestation
	if err := c.doPost(ctx, endpoint, string(body), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// AttestationParams for querying attestations.
type AttestationParams struct {
	Outcome string // success, partial_success, failure, timeout
	Since   string
	Limit   int
}

// GetAttestations queries GET /api/v1/attestations/{gaid}.
func (c *Client) GetAttestations(ctx context.Context, agentGAID string, params *AttestationParams) ([]OutcomeAttestation, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Attestations")
	if err != nil {
		return nil, err
	}
	u, _ := url.Parse(endpoint + "/" + url.PathEscape(agentGAID))
	q := u.Query()
	if params != nil {
		if params.Outcome != "" {
			q.Set("outcome", params.Outcome)
		}
		if params.Since != "" {
			q.Set("since", params.Since)
		}
		if params.Limit > 0 {
			q.Set("limit", strconv.Itoa(params.Limit))
		}
	}
	u.RawQuery = q.Encode()
	var attestations []OutcomeAttestation
	if err := c.doGet(ctx, u.String(), &attestations); err != nil {
		return nil, err
	}
	return attestations, nil
}

// --- Multi-Agent Delegation ---

// Delegate sends POST /api/v1/delegate.
func (c *Client) Delegate(ctx context.Context, request *DelegationRequest) (*DelegationResult, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Delegate")
	if err != nil {
		return nil, err
	}
	body, _ := json.Marshal(request)
	var result DelegationResult
	if err := c.doPost(ctx, endpoint, string(body), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// GetOrchestrationPlan queries GET /api/v1/delegate/plans/{planId}.
func (c *Client) GetOrchestrationPlan(ctx context.Context, planID string) (*OrchestrationPlan, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Delegate")
	if err != nil {
		return nil, err
	}
	var plan OrchestrationPlan
	if err := c.doGet(ctx, endpoint+"/plans/"+url.PathEscape(planID), &plan); err != nil {
		return nil, err
	}
	return &plan, nil
}

// CreateOrchestrationPlan sends POST /api/v1/delegate/plans.
func (c *Client) CreateOrchestrationPlan(ctx context.Context, plan *OrchestrationPlan) (*OrchestrationPlan, error) {
	endpoint, err := c.resolveEndpoint(ctx, "Delegate")
	if err != nil {
		return nil, err
	}
	body, _ := json.Marshal(plan)
	var result OrchestrationPlan
	if err := c.doPost(ctx, endpoint+"/plans", string(body), &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// --- Internals ---

func (c *Client) resolveEndpoint(ctx context.Context, name string) (string, error) {
	m, err := c.GetManifest(ctx)
	if err != nil {
		return "", err
	}
	var endpoint string
	switch name {
	case "Skills":
		endpoint = m.Endpoints.Skills
	case "Agents":
		endpoint = m.Endpoints.Agents
	case "Tools":
		endpoint = m.Endpoints.Tools
	case "Federation":
		endpoint = m.Endpoints.Federation
	case "Validate":
		endpoint = m.Endpoints.Validate
	case "Publish":
		endpoint = m.Endpoints.Publish
	case "Governance":
		endpoint = m.Endpoints.Governance
	case "Provenance":
		endpoint = m.Endpoints.Provenance
	case "Revocations":
		endpoint = m.Endpoints.Revocations
	case "AuditLog":
		endpoint = m.Endpoints.AuditLog
	case "Events":
		endpoint = m.Endpoints.Events
	case "Identity":
		endpoint = m.Endpoints.Identity
	case "Context":
		endpoint = m.Endpoints.Context
	case "Analytics":
		endpoint = m.Endpoints.Analytics
	case "Feedback":
		endpoint = m.Endpoints.Feedback
	case "Attestations":
		endpoint = m.Endpoints.Attestations
	case "Delegate":
		endpoint = m.Endpoints.Delegate
	case "Health":
		endpoint = m.Endpoints.Health
	case "Search":
		endpoint = m.Endpoints.Search
	case "Index":
		endpoint = m.Endpoints.Index
	case "Policies":
		endpoint = m.Endpoints.Policies
	}
	if endpoint == "" {
		return "", &DuadpError{Message: fmt.Sprintf("node does not expose a %s endpoint", strings.ToLower(name))}
	}
	// Handle relative URLs
	if strings.HasPrefix(endpoint, "/") {
		return c.BaseURL + endpoint, nil
	}
	return endpoint, nil
}

func (c *Client) buildURL(base string, params *ListParams) string {
	if params == nil {
		return base
	}
	u, err := url.Parse(base)
	if err != nil {
		return base
	}
	q := u.Query()
	if params.Search != "" {
		q.Set("search", params.Search)
	}
	if params.Category != "" {
		q.Set("category", params.Category)
	}
	if params.TrustTier != "" {
		q.Set("trust_tier", string(params.TrustTier))
	}
	if params.Tag != "" {
		q.Set("tag", params.Tag)
	}
	if params.Federated {
		q.Set("federated", "true")
	}
	if params.Page > 0 {
		q.Set("page", strconv.Itoa(params.Page))
	}
	if params.Limit > 0 {
		q.Set("limit", strconv.Itoa(params.Limit))
	}
	u.RawQuery = q.Encode()
	return u.String()
}

func (c *Client) doGet(ctx context.Context, u string, out interface{}) error {
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	for k, v := range c.headers {
		req.Header.Set(k, v)
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return &DuadpError{Message: string(body), StatusCode: resp.StatusCode}
	}

	return json.NewDecoder(resp.Body).Decode(out)
}

func (c *Client) doPost(ctx context.Context, u string, body string, out interface{}) error {
	ctx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader([]byte(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	for k, v := range c.headers {
		req.Header.Set(k, v)
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return &DuadpError{Message: string(respBody), StatusCode: resp.StatusCode}
	}

	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// ResolveGaid parses a GAID URI and returns a client, kind, and name.
//
//	client, kind, name := duadp.ResolveGaid("agent://skills.sh/skills/web-search")
//	skill, _ := client.GetSkill(ctx, name)
func ResolveGaid(gaid string, opts ...ClientOption) (*Client, string, string, error) {
	re := regexp.MustCompile(`^(?:agent|duadp)://([^/]+)/([^/]+)/(.+)$`)
	m := re.FindStringSubmatch(gaid)
	if m == nil {
		return nil, "", "", &DuadpError{Message: "invalid GAID: " + gaid}
	}
	client := NewClient("https://"+m[1], opts...)
	return client, m[2], m[3], nil
}
