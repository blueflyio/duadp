import type {
    FederationResponse,
    ListParams,
    OssaAgent,
    OssaResource,
    OssaSkill,
    OssaTool,
    PaginatedResponse,
    PeerRegistration, PeerRegistrationResponse,
    PublishResponse,
    ToolListParams,
    UadpManifest,
    ValidationResult,
    WebFingerResponse,
    NodeGovernance,
    ResourceRisk,
    ResourceProvenance,
    AuditEvent,
    Revocation,
    SyncResponse,
    WebhookSubscription,
    AgentIdentity,
    PeerStatus
} from './types.js';

// --- Circuit Breaker ---

export interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  status: PeerStatus;
}

export class CircuitBreaker {
  private states = new Map<string, CircuitBreakerState>();

  constructor(
    private maxFailures: number = 3,
    private resetTimeout: number = 24 * 60 * 60 * 1000, // 24 hours
  ) {}

  canRequest(url: string): boolean {
    const state = this.states.get(url);
    if (!state) return true;
    if (state.status === 'healthy') return true;
    if (state.status === 'unreachable') return false;
    // degraded: check if backoff period expired
    if (Date.now() - state.lastFailure > this.resetTimeout) {
      state.status = 'healthy';
      state.failures = 0;
      return true;
    }
    return false;
  }

  recordSuccess(url: string): void {
    this.states.set(url, { failures: 0, lastFailure: 0, status: 'healthy' });
  }

  recordFailure(url: string): void {
    const state = this.states.get(url) ?? { failures: 0, lastFailure: 0, status: 'healthy' as PeerStatus };
    state.failures++;
    state.lastFailure = Date.now();
    if (state.failures >= this.maxFailures) {
      state.status = 'degraded';
    }
    this.states.set(url, state);
  }

  getStatus(url: string): PeerStatus {
    return this.states.get(url)?.status ?? 'healthy';
  }

  reset(url: string): void {
    this.states.delete(url);
  }
}

// --- Federated Dedup ---

/**
 * Deduplicate resources from federated search by content_hash or GAID.
 * Prefers resources from the first source (local node).
 */
export function deduplicateResources<T extends OssaResource>(resources: T[]): T[] {
  const seen = new Map<string, T>();
  for (const r of resources) {
    const key = r.content_hash || r.identity?.gaid || r.metadata.uri || `${r.kind}:${r.metadata.name}`;
    if (!seen.has(key)) {
      seen.set(key, r);
    }
  }
  return [...seen.values()];
}

export interface UadpClientOptions {
  /** Custom fetch implementation (defaults to global fetch) */
  fetch?: typeof fetch;
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
  /** Bearer token for authenticated operations (publish, update, delete) */
  token?: string;
}

export class UadpClient {
  private manifest: UadpManifest | null = null;
  private fetchFn: typeof fetch;
  private timeout: number;
  private headers: Record<string, string>;
  private token?: string;

  constructor(
    /** Base URL of the UADP node (e.g., "https://marketplace.example.com") */
    public readonly baseUrl: string,
    options: UadpClientOptions = {},
  ) {
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeout = options.timeout ?? 10000;
    this.headers = options.headers ?? {};
    this.token = options.token;
  }

  // --- Discovery ---

  /** Discover the node by fetching /.well-known/uadp.json */
  async discover(): Promise<UadpManifest> {
    const url = new URL('/.well-known/uadp.json', this.baseUrl);
    const res = await this.request(url.toString());
    this.manifest = res as UadpManifest;
    return this.manifest;
  }

  /** Get the cached manifest, or discover if not yet fetched */
  async getManifest(): Promise<UadpManifest> {
    if (!this.manifest) await this.discover();
    return this.manifest!;
  }

  /** Resolve a GAID via WebFinger */
  async resolveGaid(gaid: string): Promise<WebFingerResponse> {
    const url = new URL('/.well-known/webfinger', this.baseUrl);
    url.searchParams.set('resource', gaid);
    return this.request(url.toString()) as Promise<WebFingerResponse>;
  }

  // --- Skills ---

  /** List skills from the node */
  async listSkills(params?: ListParams): Promise<PaginatedResponse<OssaSkill>> {
    const endpoint = await this.resolveEndpoint('skills');
    const url = this.buildUrl(endpoint, params);
    return this.request(url) as Promise<PaginatedResponse<OssaSkill>>;
  }

  /** Get a single skill by name */
  async getSkill(name: string): Promise<OssaSkill> {
    const endpoint = await this.resolveEndpoint('skills');
    return this.request(`${endpoint}/${encodeURIComponent(name)}`) as Promise<OssaSkill>;
  }

  /** Publish a skill (requires authentication) */
  async publishSkill(skill: OssaSkill): Promise<PublishResponse> {
    const endpoint = await this.resolveEndpoint('skills');
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(skill),
    }) as Promise<PublishResponse>;
  }

  /** Update a skill (requires authentication) */
  async updateSkill(name: string, skill: OssaSkill): Promise<PublishResponse> {
    const endpoint = await this.resolveEndpoint('skills');
    return this.request(`${endpoint}/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify(skill),
    }) as Promise<PublishResponse>;
  }

  /** Delete a skill (requires authentication) */
  async deleteSkill(name: string): Promise<void> {
    const endpoint = await this.resolveEndpoint('skills');
    await this.request(`${endpoint}/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }

  // --- Agents ---

  /** List agents from the node */
  async listAgents(params?: ListParams): Promise<PaginatedResponse<OssaAgent>> {
    const endpoint = await this.resolveEndpoint('agents');
    const url = this.buildUrl(endpoint, params);
    return this.request(url) as Promise<PaginatedResponse<OssaAgent>>;
  }

  /** Get a single agent by name */
  async getAgent(name: string): Promise<OssaAgent> {
    const endpoint = await this.resolveEndpoint('agents');
    return this.request(`${endpoint}/${encodeURIComponent(name)}`) as Promise<OssaAgent>;
  }

  /** Publish an agent (requires authentication) */
  async publishAgent(agent: OssaAgent): Promise<PublishResponse> {
    const endpoint = await this.resolveEndpoint('agents');
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(agent),
    }) as Promise<PublishResponse>;
  }

  // --- Tools ---

  /** List tools from the node */
  async listTools(params?: ToolListParams): Promise<PaginatedResponse<OssaTool>> {
    const endpoint = await this.resolveEndpoint('tools');
    const url = this.buildUrl(endpoint, params);
    if (params?.protocol) {
      const u = new URL(url);
      u.searchParams.set('protocol', params.protocol);
      return this.request(u.toString()) as Promise<PaginatedResponse<OssaTool>>;
    }
    return this.request(url) as Promise<PaginatedResponse<OssaTool>>;
  }

  /** Get a single tool by name */
  async getTool(name: string): Promise<OssaTool> {
    const endpoint = await this.resolveEndpoint('tools');
    return this.request(`${endpoint}/${encodeURIComponent(name)}`) as Promise<OssaTool>;
  }

  /** Publish a tool (requires authentication) */
  async publishTool(tool: OssaTool): Promise<PublishResponse> {
    const endpoint = await this.resolveEndpoint('tools');
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(tool),
    }) as Promise<PublishResponse>;
  }

  // --- Generic Publishing ---

  /** Publish any OSSA resource via the generic publish endpoint */
  async publish(resource: OssaResource): Promise<PublishResponse> {
    const endpoint = await this.resolveEndpoint('publish');
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(resource),
    }) as Promise<PublishResponse>;
  }

  // --- Federation ---

  /** Get federation peers */
  async getFederation(): Promise<FederationResponse> {
    const endpoint = await this.resolveEndpoint('federation');
    return this.request(endpoint) as Promise<FederationResponse>;
  }

  /** Register as a federation peer */
  async registerAsPeer(registration: PeerRegistration): Promise<PeerRegistrationResponse> {
    const endpoint = await this.resolveEndpoint('federation');
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(registration),
    }) as Promise<PeerRegistrationResponse>;
  }

  // --- Validation ---

  /** Validate a manifest against the node's validation service */
  async validate(manifest: string): Promise<ValidationResult> {
    const endpoint = await this.resolveEndpoint('validate');
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify({ manifest }),
    }) as Promise<ValidationResult>;
  }

  // --- Governance (NIST AI RMF) ---

  /** Get node governance declarations */
  async getGovernance(): Promise<NodeGovernance> {
    const endpoint = await this.resolveEndpoint('governance');
    return this.request(endpoint) as Promise<NodeGovernance>;
  }

  /** Get risk assessment for a resource by GAID */
  async getResourceRisk(gaid: string): Promise<ResourceRisk> {
    const endpoint = await this.resolveEndpoint('governance');
    return this.request(`${endpoint}/risk/${encodeURIComponent(gaid)}`) as Promise<ResourceRisk>;
  }

  /** Get audit log entries */
  async getAuditLog(params?: {
    event_type?: string;
    gaid?: string;
    since?: string;
    page?: number;
    limit?: number;
  }): Promise<AuditEvent[]> {
    let endpoint: string;
    try {
      endpoint = await this.resolveEndpoint('audit_log');
    } catch {
      endpoint = (await this.resolveEndpoint('governance')) + '/audit';
    }
    const url = new URL(endpoint);
    if (params?.event_type) url.searchParams.set('event_type', params.event_type);
    if (params?.gaid) url.searchParams.set('gaid', params.gaid);
    if (params?.since) url.searchParams.set('since', params.since);
    if (params?.page) url.searchParams.set('page', String(params.page));
    if (params?.limit) url.searchParams.set('limit', String(params.limit));
    return this.request(url.toString()) as Promise<AuditEvent[]>;
  }

  // --- Provenance (NIST SP 800-218A) ---

  /** Get supply chain provenance for a resource */
  async getProvenance(gaid: string): Promise<ResourceProvenance> {
    const endpoint = await this.resolveEndpoint('provenance');
    return this.request(`${endpoint}/${encodeURIComponent(gaid)}`) as Promise<ResourceProvenance>;
  }

  // --- Revocations (NIST SI-7, CM-3) ---

  /** Get list of revoked resources */
  async getRevocations(params?: {
    severity?: string;
    since?: string;
    page?: number;
    limit?: number;
  }): Promise<Revocation[]> {
    const endpoint = await this.resolveEndpoint('revocations');
    const url = new URL(endpoint);
    if (params?.severity) url.searchParams.set('severity', params.severity);
    if (params?.since) url.searchParams.set('since', params.since);
    if (params?.page) url.searchParams.set('page', String(params.page));
    if (params?.limit) url.searchParams.set('limit', String(params.limit));
    return this.request(url.toString()) as Promise<Revocation[]>;
  }

  // --- Federation Sync ---

  /** Get incremental changes since a timestamp or sync token */
  async federationSync(params?: {
    since?: string;
    sync_token?: string;
    limit?: number;
  }): Promise<SyncResponse> {
    const endpoint = await this.resolveEndpoint('federation');
    const url = new URL(`${endpoint}/sync`);
    if (params?.since) url.searchParams.set('since', params.since);
    if (params?.sync_token) url.searchParams.set('sync_token', params.sync_token);
    if (params?.limit) url.searchParams.set('limit', String(params.limit));
    return this.request(url.toString()) as Promise<SyncResponse>;
  }

  // --- Events (Webhooks) ---

  /** Subscribe to webhook events */
  async subscribeWebhook(subscription: WebhookSubscription): Promise<void> {
    const endpoint = await this.resolveEndpoint('events');
    await this.request(`${endpoint}/subscribe`, {
      method: 'POST',
      body: JSON.stringify(subscription),
    });
  }

  // --- Agent Identity ---

  /** Get agent identity record by GAID */
  async getAgentIdentity(gaid: string): Promise<AgentIdentity> {
    const endpoint = await this.resolveEndpoint('identity');
    return this.request(`${endpoint}/${encodeURIComponent(gaid)}`) as Promise<AgentIdentity>;
  }

  // --- Internals ---

  private async resolveEndpoint(name: string): Promise<string> {
    const manifest = await this.getManifest();
    const endpoint = manifest.endpoints[name];
    if (!endpoint) throw new UadpError(`Node does not expose a ${name} endpoint`);
    // Handle relative URLs
    if (endpoint.startsWith('/')) {
      return new URL(endpoint, this.baseUrl).toString();
    }
    return endpoint;
  }

  private buildUrl(base: string, params?: ListParams): string {
    const url = new URL(base);
    if (params?.search) url.searchParams.set('search', params.search);
    if (params?.category) url.searchParams.set('category', params.category);
    if (params?.trust_tier) url.searchParams.set('trust_tier', params.trust_tier);
    if (params?.tag) url.searchParams.set('tag', params.tag);
    if (params?.federated) url.searchParams.set('federated', 'true');
    if (params?.page) url.searchParams.set('page', String(params.page));
    if (params?.limit) url.searchParams.set('limit', String(params.limit));
    return url.toString();
  }

  private async request(url: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...this.headers,
      };
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      const res = await this.fetchFn(url, {
        ...init,
        signal: controller.signal,
        headers: {
          ...headers,
          ...init?.headers as Record<string, string>,
        },
      });
      if (res.status === 204) return undefined;
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new UadpError(`HTTP ${res.status}: ${body}`, res.status);
      }
      return res.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

export class UadpError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'UadpError';
  }
}

/**
 * Resolve a GAID URI to a UADP client and resource path.
 *
 * Example:
 * ```ts
 * const { client, kind, name } = resolveGaid('agent://skills.sh/skills/web-search');
 * const skill = await client.getSkill(name);
 * ```
 */
export function resolveGaid(gaid: string, options?: UadpClientOptions): {
  client: UadpClient;
  kind: string;
  name: string;
} {
  const match = gaid.match(/^(?:agent|uadp):\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!match) throw new UadpError(`Invalid GAID: ${gaid}. Expected format: agent://domain/kind/name or uadp://domain/kind/name`);
  const [, domain, kind, name] = match;
  const client = new UadpClient(`https://${domain}`, options);
  return { client, kind, name };
}
