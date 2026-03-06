package uadp

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

// UadpError is returned when a UADP request fails.
type UadpError struct {
	Message    string
	StatusCode int
}

func (e *UadpError) Error() string {
	if e.StatusCode > 0 {
		return fmt.Sprintf("uadp: HTTP %d: %s", e.StatusCode, e.Message)
	}
	return fmt.Sprintf("uadp: %s", e.Message)
}

// ClientOption configures the UADP client.
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

// Client discovers and queries a UADP node.
type Client struct {
	BaseURL    string
	httpClient *http.Client
	timeout    time.Duration
	headers    map[string]string
	token      string
	manifest   *UadpManifest
}

// NewClient creates a new UADP client for the given base URL.
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

// Discover fetches /.well-known/uadp.json and caches the manifest.
func (c *Client) Discover(ctx context.Context) (*UadpManifest, error) {
	u := c.BaseURL + "/.well-known/uadp.json"
	var manifest UadpManifest
	if err := c.doGet(ctx, u, &manifest); err != nil {
		return nil, fmt.Errorf("discovery failed: %w", err)
	}
	c.manifest = &manifest
	return &manifest, nil
}

// GetManifest returns the cached manifest or discovers it.
func (c *Client) GetManifest(ctx context.Context) (*UadpManifest, error) {
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

// ListSkills queries GET /uadp/v1/skills.
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

// GetSkill fetches GET /uadp/v1/skills/{name}.
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

// PublishSkill sends POST /uadp/v1/skills.
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

// ListAgents queries GET /uadp/v1/agents.
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

// GetAgent fetches GET /uadp/v1/agents/{name}.
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

// PublishAgent sends POST /uadp/v1/agents.
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

// ListTools queries GET /uadp/v1/tools.
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

// GetTool fetches GET /uadp/v1/tools/{name}.
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

// PublishTool sends POST /uadp/v1/tools.
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

// --- Generic Publish ---

// Publish sends POST /uadp/v1/publish for any OSSA resource.
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

// GetFederation queries GET /uadp/v1/federation.
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

// RegisterAsPeer sends POST /uadp/v1/federation to register.
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

// Validate sends POST /uadp/v1/validate.
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

// GetGovernance queries GET /uadp/v1/governance.
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

// GetResourceRisk queries GET /uadp/v1/governance/risk/{gaid}.
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

// GetAuditLog queries GET /uadp/v1/governance/audit.
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

// GetProvenance queries GET /uadp/v1/provenance/{gaid}.
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

// GetRevocations queries GET /uadp/v1/revocations.
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

// FederationSync queries GET /uadp/v1/federation/sync.
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

// SubscribeWebhook sends POST /uadp/v1/events/subscribe.
func (c *Client) SubscribeWebhook(ctx context.Context, sub *WebhookSubscription) error {
	endpoint, err := c.resolveEndpoint(ctx, "Events")
	if err != nil {
		return err
	}
	body, _ := json.Marshal(sub)
	return c.doPost(ctx, endpoint+"/subscribe", string(body), nil)
}

// --- Agent Identity ---

// GetAgentIdentity queries GET /uadp/v1/identity/{gaid}.
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
	}
	if endpoint == "" {
		return "", &UadpError{Message: fmt.Sprintf("node does not expose a %s endpoint", strings.ToLower(name))}
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
		return &UadpError{Message: string(body), StatusCode: resp.StatusCode}
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
		return &UadpError{Message: string(respBody), StatusCode: resp.StatusCode}
	}

	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// ResolveGaid parses a GAID URI and returns a client, kind, and name.
//
//	client, kind, name := uadp.ResolveGaid("agent://skills.sh/skills/web-search")
//	skill, _ := client.GetSkill(ctx, name)
func ResolveGaid(gaid string, opts ...ClientOption) (*Client, string, string, error) {
	re := regexp.MustCompile(`^agent://([^/]+)/([^/]+)/(.+)$`)
	m := re.FindStringSubmatch(gaid)
	if m == nil {
		return nil, "", "", &UadpError{Message: "invalid GAID: " + gaid}
	}
	client := NewClient("https://"+m[1], opts...)
	return client, m[2], m[3], nil
}
