import type { DuadpManifest, FederationResponse } from '@bluefly/duadp';
import cors from 'cors';
import type { Request, Response } from 'express';
import express from 'express';
import { evaluateCedar, type CedarEvaluationRequest } from './cedar-evaluator.js';
import { confidenceGate, extractConfidenceScore } from './confidence-gate.js';
import { createContentStore, type ContentStore } from './content-store.js';
import { createCRDTRegistry, type CRDTRegistry } from './crdt-registry.js';
import { initDb } from './db.js';
import { Server } from 'node:http';
import { createControlPlaneRouter } from './control-plane-routes.js';
import { actorFromToken } from './auth-actor.js';
import {
  deduplicateByGaid,
  federatedFetch,
  registerEnvPeers,
  resolveGaidFromPeers,
  resolveGaidLocally,
  resolveResourceFromPeers,
  startHealthChecks,
} from './federation.js';
import { createGovernanceRouter } from './governance.js';
import { buildInspectorResponse } from './inspector.js';
import { createMcpRouter } from './mcp.js';
import { createP2PNode, type P2PNode } from './p2p.js';
import { authorizePublish } from './publish-authorization.js';
import { createSqliteProvider } from './provider.js';
import { getRevocationRecord, isNameRevoked, isRevoked, listRevocations, propagateRevocation, storeRevocation } from './revocation.js';
import { verifyPublisherSignature } from './signature-verifier.js';
import { verifyTrustTier } from './trust.js';
import { handleIngest, fanOut, type IngestRequest } from './ingest-handler.js';

const PORT = parseInt(process.env.PORT || '4200');
const DB_PATH = process.env.DB_PATH || process.env.DUADP_DB_PATH || './data/duadp.db';
const BASE_URL = process.env.BASE_URL || process.env.DUADP_BASE_URL || `http://localhost:${PORT}`;
const NODE_NAME = process.env.NODE_NAME || process.env.DUADP_NODE_NAME || 'OSSA Reference Node';
const NODE_ID = process.env.NODE_ID || process.env.DUADP_NODE_ID || 'did:web:localhost';
const REFERENCE_NODE_VERSION = '0.1.5';

const COMPLIANCE_ENGINE_URL = process.env.COMPLIANCE_ENGINE_URL || process.env.COMPLIANCE_API_URL || 'https://compliance.blueflyagents.com';
// Note: COMPLIANCE_ENGINE_URL is passed to cedar-evaluator.ts via process.env — no local Cedar runs here.

const P2P_PORT = parseInt(process.env.P2P_PORT || '4201');
const P2P_ENABLED = process.env.DUADP_P2P !== 'false'; // opt-out via DUADP_P2P=false
const P2P_BOOTSTRAP_PEERS = (process.env.DUADP_P2P_PEERS || '').split(',').filter(Boolean);

const db = initDb(DB_PATH);

// Decentralization layer state (initialized in listen callback)
let p2pNode: P2PNode | null = null;
let contentStore: ContentStore | null = null;
let crdtRegistry: CRDTRegistry | null = null;
const provider = createSqliteProvider(db);
const providerAny = provider as typeof provider & {
  getAgentCard?: (gaid: string) => Promise<unknown | null>;
};

const app = express();
app.use(cors());
app.use(express.json());

// --- Helper ---
const getToken = (req: Request): string | undefined => {
  const auth = req.headers.authorization;
  return auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
};

async function publishResourceWithChecks(req: Request, res: Response, resource: Record<string, unknown>) {
  const token = getToken(req);
  const resourceName = (resource as any)?.metadata?.name;
  const gaid = (resource as any)?.identity?.gaid || (resourceName ? `agent://${resourceName}` : null);

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (gaid && isRevoked(db, gaid)) {
    res.status(403).json({ error: 'Resource has been revoked and cannot be re-registered', gaid });
    return;
  }
  if (resourceName && isNameRevoked(db, resourceName)) {
    res.status(403).json({ error: 'Resource name has been revoked and cannot be re-registered', name: resourceName });
    return;
  }

  const sigVerification = await verifyPublisherSignature(resource);
  if (sigVerification.requiresSignature && !sigVerification.verified) {
    res.status(403).json({
      error: 'Publisher signature verification failed',
      detail: 'Resources with trust_tier >= 3 must have a valid Ed25519 signature verifiable via DID resolution',
      signature_verification: sigVerification,
    });
    return;
  }

  const policyOutcome = await authorizePublish(resource, actorFromToken(token));
  if (policyOutcome.effective_decision === 'Deny') {
    res.status(403).json({
      error: 'Publish policy denied publication',
      policy_outcome: policyOutcome,
    });
    return;
  }

  const confidenceScore = extractConfidenceScore(resource);
  const trustTier = (resource as any)?.metadata?.trust_tier || 'community';
  const validationPassed = !!((resource as any)?.metadata?.validation_passed);
  const verdict = confidenceGate(confidenceScore, trustTier, validationPassed);

  if (verdict.action === 'reject') {
    res.status(403).json({
      error: 'Confidence gate rejected publication',
      confidence_verdict: verdict,
      hint: 'Improve model confidence score (>=50) or ensure schema validation passes before publishing.',
    });
    return;
  }

  if (verdict.action === 'human_review') {
    if ((resource as any).metadata && verdict.degraded_tier) {
      (resource as any).metadata.trust_tier = verdict.degraded_tier;
    }
    const reviewResult = await provider.publishResource!(resource as any, token);
    res.status(202).json({
      ...reviewResult,
      policy_outcome: policyOutcome,
      confidence_verdict: verdict,
      message: 'Resource published at degraded trust tier, pending human review.',
    });
    return;
  }

  const verification = await verifyTrustTier(resource as any);
  if (verification.downgraded && (resource as any).metadata) {
    (resource as any).metadata.trust_tier = verification.verified_tier;
  }

  const result = await provider.publishResource!(resource as any, token);

  if (result.success && p2pNode) {
    p2pNode.publishAgent(resource).catch(console.error);
    const kind = (resource as any)?.kind || 'Agent';
    crdtRegistry?.put(kind, resourceName || 'unknown', resource);
    contentStore?.put(resource).catch(console.error);
  }

  res.status(result.success ? 201 : 400).json({
    ...result,
    policy_outcome: policyOutcome,
    trust_verification: verification,
    signature_verification: sigVerification,
  });
}

const parseListParams = (req: Request) => ({
  search: (req.query as Record<string, string>).search,
  category: (req.query as Record<string, string>).category,
  tag: (req.query as Record<string, string>).tag,
  trust_tier: (req.query as Record<string, string>).trust_tier,
  federated: (req.query as Record<string, string>).federated === 'true',
  page: Math.max(1, parseInt((req.query as Record<string, string>).page) || 1),
  limit: Math.min(100, parseInt((req.query as Record<string, string>).limit || '50', 10)),
});

const parseJsonQuery = <T>(value: string | undefined, fallback: T): T => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const parseGitLabListQuery = (req: Request) => ({
  runtime: (req.query as Record<string, string>).runtime,
  action: (req.query as Record<string, string>).action,
  project_path: (req.query as Record<string, string>).project_path,
  group_path: (req.query as Record<string, string>).group_path,
  frameworks: ((req.query as Record<string, string>).frameworks || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  security_attributes: parseJsonQuery<Record<string, unknown>>(
    (req.query as Record<string, string>).security_attributes,
    {},
  ),
});

const extractGitLabHosts = (resource: Record<string, any>): string[] => {
  const candidates = [
    resource?.spec?.endpoint,
    resource?.identity?.operational?.endpoint,
  ].filter((candidate: unknown): candidate is string => typeof candidate === 'string' && candidate.length > 0);

  return [...new Set(candidates.map((candidate) => {
    try {
      return new URL(candidate).hostname;
    } catch {
      return '';
    }
  }).filter(Boolean))];
};

const extractResourceFrameworks = (resource: Record<string, any>): string[] => {
  const metadataFrameworks = Array.isArray(resource?.metadata?.compliance_frameworks)
    ? resource.metadata.compliance_frameworks
    : [];
  const gitlabFrameworks = Array.isArray(resource?.gitlab?.frameworks)
    ? resource.gitlab.frameworks
    : [];

  return [...new Set([...metadataFrameworks, ...gitlabFrameworks].filter((value) => typeof value === 'string'))];
};

const attachGitLabMetadata = (resource: Record<string, any>, gitlabQuery: ReturnType<typeof parseGitLabListQuery>) => ({
  ...resource,
  gitlab: {
    component: resource?.gitlab?.component ?? resource?.metadata?.name,
    stage: resource?.gitlab?.stage ?? (resource?.kind === 'Tool' ? '.pipeline-policy-pre' : '.pipeline-policy-post'),
    required_variables: resource?.gitlab?.required_variables ?? [
      'BLUEFLY_FRAMEWORKS',
      'BLUEFLY_FRAMEWORKS_JSON',
      'BLUEFLY_SECURITY_ATTRIBUTES_JSON',
    ],
    external_status_check: resource?.gitlab?.external_status_check ?? (gitlabQuery.action?.includes('merge') ? 'DUADP Cedar Authorization' : undefined),
    external_control: resource?.gitlab?.external_control ?? (gitlabQuery.frameworks.length > 0 ? 'DUADP Cedar Authorization' : undefined),
    allowed_hosts: resource?.gitlab?.allowed_hosts ?? extractGitLabHosts(resource),
    frameworks: resource?.gitlab?.frameworks ?? extractResourceFrameworks(resource),
    actions: resource?.gitlab?.actions ?? (gitlabQuery.action ? [gitlabQuery.action] : []),
  },
});

const filterGitLabCatalog = (
  resources: Array<Record<string, any>>,
  gitlabQuery: ReturnType<typeof parseGitLabListQuery>,
) => {
  if (gitlabQuery.runtime !== 'gitlab') {
    return resources;
  }

  return resources
    .map((resource) => attachGitLabMetadata(resource, gitlabQuery))
    .filter((resource) => {
      if (gitlabQuery.frameworks.length === 0) {
        return true;
      }

      const resourceFrameworks = Array.isArray(resource.gitlab?.frameworks)
        ? resource.gitlab.frameworks
        : [];

      return resourceFrameworks.length === 0 ||
        gitlabQuery.frameworks.some((framework) => resourceFrameworks.includes(framework));
    });
};

const config = {
  nodeName: NODE_NAME,
  nodeId: NODE_ID,
  baseUrl: BASE_URL,
  federation: { gossip: true, max_hops: 3 },
};

// /.well-known/duadp.json
app.get('/.well-known/duadp.json', (_req: Request, res: Response) => {
  const manifest: DuadpManifest & {
    profiles: {
      gitlab: {
        discovery_did: string;
        runtime: string;
        authorization_endpoint: string;
        required_checks: string[];
      };
    };
  } = {
    protocol_version: '0.1.3',
    node_id: config.nodeId,
    node_name: config.nodeName,
    endpoints: {
      skills: `${config.baseUrl}/api/v1/skills`,
      agents: `${config.baseUrl}/api/v1/agents`,
      tools: `${config.baseUrl}/api/v1/tools`,
      policies: `${config.baseUrl}/api/v1/policies`,
      federation: `${config.baseUrl}/api/v1/federation`,
      validate: `${config.baseUrl}/api/v1/validate`,
      verify: `${config.baseUrl}/api/v1/verify`,
      publish: `${config.baseUrl}/api/v1/publish`,
      search: `${config.baseUrl}/api/v1/search`,
      resolve: `${config.baseUrl}/api/v1/resolve`,
      inspect: `${config.baseUrl}/api/v1/inspect`,
      governance: `${config.baseUrl}/api/v1/governance`,
      control_plane: `${config.baseUrl}/api/v1/control-plane`,
      revocations: `${config.baseUrl}/api/v1/revocations`,
      health: `${config.baseUrl}/api/v1/health`,
    },
    capabilities: ['skills', 'agents', 'tools', 'policies', 'federation', 'validation', 'publishing', 'trust-verification', 'revocations', 'cedar-authorization', 'gitlab-profile', 'control-plane'],
    ossa_versions: ['v0.4', 'v0.5'],
    federation: config.federation,
    profiles: {
      gitlab: {
        discovery_did: 'did:web:discover.duadp.org',
        runtime: 'gitlab',
        authorization_endpoint: `${config.baseUrl}/api/v1/control-plane/authorize`,
        required_checks: ['duadp_cedar_authorization', 'framework_evidence', 'external_status_check', 'external_control_report'],
      },
    },
  };
  res.json(manifest);
});

// WebFinger (with federated fallback)
app.get('/.well-known/webfinger', async (req: Request, res: Response) => {
  const resource = (req.query as Record<string, string>).resource;
  if (!resource) { res.status(400).json({ error: 'Missing resource parameter' }); return; }
  const result = await provider.resolveWebFinger!(resource);
  if (result) { res.type('application/jrd+json').json(result); return; }

  // Federated fallback — try peers
  const peerResult = await resolveGaidFromPeers(db, resource, NODE_ID);
  if (peerResult) {
    const peerResource = (peerResult.resource && typeof peerResult.resource === 'object')
      ? (peerResult.resource as Record<string, unknown>)
      : { resource: peerResult.resource };
    res.type('application/jrd+json').json({ ...peerResource, _source_node: peerResult.source_node });
    return;
  }
  res.status(404).json({ error: 'Resource not found' });
});

// Health
app.get('/api/v1/health', (_req: Request, res: Response) => {
  const resourceCount = (db.prepare('SELECT COUNT(*) as cnt FROM resources').get() as { cnt: number }).cnt;
  const peerCount = (db.prepare('SELECT COUNT(*) as cnt FROM peers').get() as { cnt: number }).cnt;
  res.json({
    status: 'healthy',
    node_name: NODE_NAME,
    node_id: NODE_ID,
    uptime: process.uptime(),
    resources: resourceCount,
    policies: 'dynamic',
    peers: peerCount,
    version: REFERENCE_NODE_VERSION,
  });
});

// Skills
app.get('/api/v1/skills', async (req: Request, res: Response) => {
  const params = parseListParams(req);
  const gitlabQuery = parseGitLabListQuery(req);
  const result = await provider.listSkills!(params);
  result.meta.node_name = NODE_NAME;
  result.meta.node_id = NODE_ID;

  if (params.federated) {
    const { search, category, tag, trust_tier, limit } = params;
    const qp: Record<string, string> = {};
    if (search) qp.search = search;
    if (category) qp.category = category;
    if (tag) qp.tag = tag;
    if (trust_tier) qp.trust_tier = trust_tier;
    qp.limit = String(limit);
    const { results: remote, peerMeta } = await federatedFetch(db, '/api/v1/skills', qp, NODE_ID);
    result.data = deduplicateByGaid(result.data, remote as any);
    result.meta.total = result.data.length;
    (result.meta as any).federated = true;
    (result.meta as any).peers_queried = peerMeta;
  }

  result.data = filterGitLabCatalog(result.data as Array<Record<string, any>>, gitlabQuery) as any;
  result.meta.total = result.data.length;
  res.json(result);
});

app.get('/api/v1/skills/:name', async (req: Request, res: Response) => {
  const skill = await provider.getSkill!(req.params.name as string);
  if (!skill) { res.status(404).json({ error: 'Skill not found' }); return; }
  res.json(skill);
});

// Agents
app.get('/api/v1/agents', async (req: Request, res: Response) => {
  const params = parseListParams(req);
  const result = await provider.listAgents!(params);
  result.meta.node_name = NODE_NAME;
  result.meta.node_id = NODE_ID;

  if (params.federated) {
    const { search, category, tag, trust_tier, limit } = params;
    const qp: Record<string, string> = {};
    if (search) qp.search = search;
    if (category) qp.category = category;
    if (tag) qp.tag = tag;
    if (trust_tier) qp.trust_tier = trust_tier;
    qp.limit = String(limit);
    const { results: remote, peerMeta } = await federatedFetch(db, '/api/v1/agents', qp, NODE_ID);
    result.data = deduplicateByGaid(result.data, remote as any);
    result.meta.total = result.data.length;
    (result.meta as any).federated = true;
    (result.meta as any).peers_queried = peerMeta;
  }

  res.json(result);
});

app.get('/api/v1/agents/:name', async (req: Request, res: Response) => {
  const agent = await provider.getAgent!(req.params.name as string);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  res.json(agent);
});

app.get('/api/v1/agents/:gaid/card', async (req: Request, res: Response) => {
  if (!providerAny.getAgentCard) { res.status(501).json({ error: 'Agent Cards not supported by provider' }); return; }
  const card = await providerAny.getAgentCard(req.params.gaid as string);
  if (!card) { res.status(404).json({ error: 'Agent Card not found' }); return; }
  res.type('application/agent-card+json').json(card);
});

// Tools
app.get('/api/v1/tools', async (req: Request, res: Response) => {
  const params = {
    ...parseListParams(req),
    protocol: (req.query as Record<string, string>).protocol,
  };
  const gitlabQuery = parseGitLabListQuery(req);
  const result = await provider.listTools!(params);
  result.meta.node_name = NODE_NAME;
  result.meta.node_id = NODE_ID;

  if (params.federated) {
    const { search, category, tag, trust_tier, limit } = params;
    const qp: Record<string, string> = {};
    if (search) qp.search = search;
    if (category) qp.category = category;
    if (tag) qp.tag = tag;
    if (trust_tier) qp.trust_tier = trust_tier;
    if ((params as any).protocol) qp.protocol = (params as any).protocol;
    qp.limit = String(limit);
    const { results: remote, peerMeta } = await federatedFetch(db, '/api/v1/tools', qp, NODE_ID);
    result.data = deduplicateByGaid(result.data, remote as any);
    result.meta.total = result.data.length;
    (result.meta as any).federated = true;
    (result.meta as any).peers_queried = peerMeta;
  }

  result.data = filterGitLabCatalog(result.data as Array<Record<string, any>>, gitlabQuery) as any;
  result.meta.total = result.data.length;
  res.json(result);
});

app.get('/api/v1/tools/:name', async (req: Request, res: Response) => {
  const tool = await provider.getTool!(req.params.name as string);
  if (!tool) { res.status(404).json({ error: 'Tool not found' }); return; }
  res.json(tool);
});

// Policies (Proxy from Compliance Engine)
app.get('/api/v1/policies', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt((req.query as Record<string, string>).page) || 1);
  const perPage = Math.min(100, parseInt((req.query as Record<string, string>).per_page || '20', 10));
  const tag = (req.query as Record<string, string>).tag;
  const search = (req.query as Record<string, string>).search;
  const framework = (req.query as Record<string, string>).framework;

  try {
    const engineRes = await fetch(`${COMPLIANCE_ENGINE_URL}/api/v1/cedar/policies`);
    if (!engineRes.ok) throw new Error(`Engine returned ${engineRes.status}`);
    const engineData = await engineRes.json();
    let filtered = engineData.data || [];

    if (tag) {
      filtered = filtered.filter((p: any) => p.tags && p.tags.includes(tag));
    }
    if (framework) {
      filtered = filtered.filter((p: any) => p.complianceFrameworks && p.complianceFrameworks.includes(framework));
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (p: any) => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
      );
    }

    const total = filtered.length;
    const pages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;
    const paged = filtered.slice(offset, offset + perPage);

    res.json({
      data: paged.map((p: any) => ({
        kind: 'Policy',
        metadata: {
          name: p.name,
          version: p.version || '1.0.0',
          description: p.description,
          tags: p.tags || [],
          complianceFrameworks: p.complianceFrameworks || [],
          classification: p.category || 'standard',
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        },
        spec: {
          format: 'cedar',
          cedarSource: p.policyText,
          statementCount: (p.policyText && typeof p.policyText === 'string')
            ? (p.policyText.match(/^(permit|forbid)\s*\(/gm) || []).length
            : 0
        },
      })),
      pagination: { total, page, per_page: perPage, pages },
    });
  } catch (err) {
    console.error('Failed to proxy policies:', err);
    res.status(502).json({ error: 'Failed to proxy policies from compliance engine' });
  }
});

app.get('/api/v1/policies/:name', async (req: Request, res: Response) => {
  try {
    const engineRes = await fetch(`${COMPLIANCE_ENGINE_URL}/api/v1/cedar/policies`);
    if (!engineRes.ok) throw new Error(`Engine returned ${engineRes.status}`);
    const engineData = await engineRes.json();
    const policies = engineData.data || [];
    const p = policies.find((x: any) => x.name === req.params.name || x.id === req.params.name);

    if (!p) {
      res.status(404).json({ error: 'Policy not found' });
      return;
    }

    res.json({
      kind: 'Policy',
      metadata: {
        name: p.name,
        version: p.version || '1.0.0',
        description: p.description,
        tags: p.tags || [],
        complianceFrameworks: p.complianceFrameworks || [],
        classification: p.category || 'standard',
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      },
      spec: {
        format: 'cedar',
        cedarSource: p.policyText,
        statementCount: (p.policyText && typeof p.policyText === 'string')
          ? (p.policyText.match(/^(permit|forbid)\s*\(/gm) || []).length
          : 0
      },
    });
  } catch (err) {
    console.error('Failed to fetch policy:', err);
    res.status(502).json({ error: 'Failed to proxy policy from compliance engine' });
  }
});

// Cedar Policy Evaluation — proxies to compliance.blueflyagents.com/evaluate
app.post('/api/v1/policies/evaluate', async (req: Request, res: Response) => {
  const body = req.body as CedarEvaluationRequest;
  if (!body.principal || !body.action || !body.resource) {
    res.status(400).json({ error: 'Missing required fields: principal, action, resource' });
    return;
  }
  const result = await evaluateCedar(body);
  res.json(result);
});

// Search (unified across all types)
app.get('/api/v1/search', async (req: Request, res: Response) => {
  const q = (req.query as Record<string, string>).q || '';
  const params = parseListParams(req);
  params.search = q;

  const [skills, agents, tools] = await Promise.all([
    provider.listSkills!({ ...params }),
    provider.listAgents!({ ...params }),
    provider.listTools!({ ...params }),
  ]);

  let allData = [
    ...skills.data.map(r => ({ ...r, _kind: 'Skill' })),
    ...agents.data.map(r => ({ ...r, _kind: 'Agent' })),
    ...tools.data.map(r => ({ ...r, _kind: 'Tool' })),
  ];

  const facets: Record<string, number> = {
    skills: skills.meta.total,
    agents: agents.meta.total,
    tools: tools.meta.total,
  };

  let peerMeta: Array<{ url: string; total: number; ms: number }> = [];

  if (params.federated) {
    const qp: Record<string, string> = {};
    if (q) qp.q = q;
    qp.limit = String(params.limit);
    const { results: remote, peerMeta: pm } = await federatedFetch(db, '/api/v1/search', qp, NODE_ID);
    peerMeta = pm;
    // Remote search results have _kind set by the remote node
    allData = deduplicateByGaid(allData, remote as any);
  }

  res.json({
    data: allData,
    meta: {
      total: allData.length,
      page: params.page,
      limit: params.limit,
      node_name: NODE_NAME,
      facets,
      ...(params.federated ? { federated: true, peers_queried: peerMeta } : {}),
    },
  });
});

// Trust Verification
app.post('/api/v1/verify', async (req: Request, res: Response) => {
  const resource = req.body;
  if (!resource?.apiVersion || !resource?.kind) {
    res.status(400).json({ error: 'Invalid resource: missing apiVersion or kind' });
    return;
  }
  const result = await verifyTrustTier(resource);
  res.json(result);
});

// Publishing (with trust verification + revocation check + Cedar pre-auth)
app.post('/api/v1/publish', async (req: Request, res: Response) => {
  await publishResourceWithChecks(req, res, req.body);
});

// ── POST /api/v1/ingest — "Ingest Anything" ────────────────────────────────
// Demo: POST { "url": "https://github.com/someone/repo", "adapter": "auto" }
// Auto-detects: POWER.md → kiro, SKILL.md → skills-sh, else → git-repo
// Runs full auth/Cedar/trust/revocation pipeline, then fans out to
// brain (Qdrant), gkg, n8n, and a2a-stream — all fire-and-forget.
app.post('/api/v1/ingest', async (req: Request, res: Response) => {
  const body = req.body as IngestRequest;
  if (!body?.url) {
    res.status(400).json({ error: 'Missing required field: url (must be a GitHub repository URL)' });
    return;
  }

  // 1. Fetch + normalize via auto-detected USIE adapter
  let skill: Awaited<ReturnType<typeof handleIngest>>['skill'];
  let adapterUsed: string;
  try {
    ({ skill, adapterUsed } = await handleIngest(body));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ingest] fetch/normalize error:', msg);
    res.status(422).json({ error: 'Failed to ingest repository', detail: msg });
    return;
  }

  const resource = skill as unknown as Record<string, unknown>;
  const token = getToken(req);

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // 2. Revocation check
  const gaid = (skill.identity?.gaid) ?? `agent://skills.openstandardagents.org/${adapterUsed}/${skill.metadata.name}`;
  const resourceName = skill.metadata.name;
  if (isRevoked(db, gaid)) {
    res.status(403).json({ error: 'Resource has been revoked and cannot be re-registered', gaid });
    return;
  }
  if (isNameRevoked(db, resourceName)) {
    res.status(403).json({ error: 'Resource name has been revoked', name: resourceName });
    return;
  }

  // 3. Signature verification
  const sigVerification = await verifyPublisherSignature(resource);
  if (sigVerification.requiresSignature && !sigVerification.verified) {
    res.status(403).json({ error: 'Publisher signature verification failed', signature_verification: sigVerification });
    return;
  }

  // 4. Cedar authorization
  const policyOutcome = await authorizePublish(resource, actorFromToken(token));
  if (policyOutcome.effective_decision === 'Deny') {
    res.status(403).json({ error: 'Publish policy denied', policy_outcome: policyOutcome });
    return;
  }

  // 5. Confidence gate
  const confidenceScore = extractConfidenceScore(resource);
  const trustTier = (resource as any)?.metadata?.trust_tier || 'community';
  const validationPassed = !!((resource as any)?.metadata?.validation_passed);
  const verdict = confidenceGate(confidenceScore, trustTier, validationPassed);
  if (verdict.action === 'reject') {
    res.status(403).json({ error: 'Confidence gate rejected publication', confidence_verdict: verdict });
    return;
  }
  if (verdict.action === 'human_review' && verdict.degraded_tier) {
    (resource as any).metadata.trust_tier = verdict.degraded_tier;
  }

  // 6. Trust tier verification
  const verification = await verifyTrustTier(resource as any);
  if (verification.downgraded && (resource as any).metadata) {
    (resource as any).metadata.trust_tier = verification.verified_tier;
  }

  // 7. Publish to DUADP node
  const result = await provider.publishResource!(resource as any, token);

  if (result.success) {
    // P2P gossip + CRDT + content store
    if (p2pNode) {
      p2pNode.publishAgent(resource).catch(console.error);
      crdtRegistry?.put('Skill', resourceName, resource);
      contentStore?.put(resource).catch(console.error);
    }

    // 8. Fire-and-forget fan-out to all downstream services
    const marketplaceUrl = `${process.env.MARKETPLACE_URL || 'https://marketplace.blueflyagents.com'}/skills/${encodeURIComponent(resourceName)}`;
    fanOut(skill).catch((err) => console.warn('[ingest] fanOut error:', err));
    console.info(`[ingest] ✅ ${gaid} via ${adapterUsed} → brain, gkg, n8n, a2a`);

    res.status(201).json({
      ...result,
      gaid,
      name: resourceName,
      adapter_used: adapterUsed,
      trust_tier: (resource as any)?.metadata?.trust_tier || 'community',
      marketplace_url: marketplaceUrl,
      policy_outcome: policyOutcome,
      trust_verification: verification,
      signature_verification: sigVerification,
    });
  } else {
    res.status(400).json({ ...result, policy_outcome: policyOutcome });
  }
});


for (const kind of ['skills', 'agents', 'tools']) {
  app.post(`/api/v1/${kind}`, async (req: Request, res: Response) => {
    await publishResourceWithChecks(req, res, req.body);
  });

  app.put(`/api/v1/${kind}/:name`, async (req: Request, res: Response) => {
    const token = getToken(req);
    if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }
    const result = await provider.updateResource!(kind, req.params.name as string, req.body, token);
    if (result.success && p2pNode) {
      p2pNode.publishAgent(req.body).catch(console.error);
      const resourceKind = req.body?.kind || (kind === 'skills' ? 'Skill' : kind === 'agents' ? 'Agent' : 'Tool');
      crdtRegistry?.put(resourceKind, req.params.name as string, req.body);
      contentStore?.put(req.body).catch(console.error);
    }
    res.json(result);
  });

  app.delete(`/api/v1/${kind}/:name`, async (req: Request, res: Response) => {
    const token = getToken(req);
    if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }
    const name = req.params.name as string;
    const reason = (req.query as Record<string, string>).reason || (req.body as any)?.reason || 'unspecified';

    // Get resource data before deletion for GAID
    const existing = kind === 'skills' ? await provider.getSkill!(name)
      : kind === 'agents' ? await provider.getAgent!(name)
      : await provider.getTool!(name);
    const gaid = (existing as any)?.identity?.gaid || `agent://${name}`;

    const deleted = await provider.deleteResource!(kind, name, token);
    if (!deleted) { res.status(404).json({ error: 'Resource not found' }); return; }

    // Store revocation and propagate via federation gossip
    const revocationRecord = {
      gaid,
      kind: kind === 'skills' ? 'Skill' : kind === 'agents' ? 'Agent' : 'Tool',
      name,
      reason,
      revoked_by: actorFromToken(token),
      origin_node: NODE_ID,
    };
    storeRevocation(db, revocationRecord);
    const propagation = await propagateRevocation(db, revocationRecord, NODE_ID);

    res.json({
      revoked: true,
      gaid,
      reason,
      propagation: { peers_notified: propagation.propagated, peers_failed: propagation.failed },
    });
  });
}

// Validation
app.post('/api/v1/validate', async (req: Request, res: Response) => {
  const { manifest } = req.body ?? {};
  if (!manifest) {
    res.status(400).json({ valid: false, errors: ['Missing manifest field'] });
    return;
  }
  const result = await provider.validateManifest!(manifest);
  res.json(result);
});

// Federation
app.get('/api/v1/federation', async (_req: Request, res: Response) => {
  const peers = await provider.listPeers!();
  const response: FederationResponse = {
    protocol_version: '0.1.3',
    node_id: config.nodeId,
    node_name: config.nodeName,
    gossip: config.federation.gossip,
    max_hops: config.federation.max_hops,
    peers,
  };
  res.json(response);
});

app.get('/api/v1/federation/peers', async (_req: Request, res: Response) => {
  const peers = await provider.listPeers!();
  res.json({ peers });
});

app.post('/api/v1/federation', async (req: Request, res: Response) => {
  const { url, name, node_id, hop, peers: incomingPeers } = req.body ?? {};
  if (!url || !name) {
    res.status(400).json({ error: 'Missing required fields: url, name' });
    return;
  }

  // Reject if hop exceeds max
  const currentHop = hop ?? 0;
  if (currentHop > config.federation.max_hops) {
    res.status(400).json({ error: `Hop count ${currentHop} exceeds max_hops ${config.federation.max_hops}` });
    return;
  }

  const result = await provider.addPeer!(url, name, node_id, currentHop);

  // Gossip: accept incoming peer list and register new ones
  if (Array.isArray(incomingPeers)) {
    for (const p of incomingPeers) {
      if (p.url && p.name && p.url !== BASE_URL) {
        const peerHop = (p.hop ?? currentHop) + 1;
        if (peerHop <= config.federation.max_hops) {
          try { await provider.addPeer!(p.url, p.name, p.node_id, peerHop); } catch { /* dedup */ }
        }
      }
    }
  }

  // Share our peer list back for gossip
  const allPeers = await provider.listPeers!();
  res.status(result.success ? 201 : 200).json({ ...result, peers: allPeers });
});

// Revocation endpoints
app.get('/api/v1/revocations', (_req: Request, res: Response) => {
  const limit = Math.min(100, parseInt((_req.query as Record<string, string>).limit || '50', 10));
  const page = Math.max(1, parseInt((_req.query as Record<string, string>).page || '1', 10));
  const result = listRevocations(db, limit, (page - 1) * limit);
  res.json({ ...result, meta: { page, limit, node_name: NODE_NAME } });
});

app.get('/api/v1/revocations/:name', (req: Request, res: Response) => {
  const name = req.params.name as string;
  const revoked = isNameRevoked(db, name);
  res.json({ name, revoked });
});

// Federation revocation gossip receiver
app.post('/api/v1/federation/revocations', (req: Request, res: Response) => {
  const { gaid, kind, name, reason, revoked_by, origin_node } = req.body ?? {};
  if (!gaid || !name) {
    res.status(400).json({ error: 'Missing required fields: gaid, name' });
    return;
  }

  // Don't re-process revocations we already have
  if (isRevoked(db, gaid)) {
    res.json({ accepted: true, already_known: true });
    return;
  }

  // Store the revocation
  storeRevocation(db, { gaid, kind: kind || 'unknown', name, reason: reason || 'unspecified', revoked_by, origin_node });

  // Delete the resource locally if it exists
  const row = db.prepare('SELECT id FROM resources WHERE name = ?').get(name);
  if (row) {
    db.prepare('DELETE FROM resources WHERE name = ?').run(name);
    db.prepare('INSERT INTO audit_log (event_type, gaid, actor, detail) VALUES (?, ?, ?, ?)').run(
      'resource.revoked_by_peer', gaid, origin_node || 'federation', JSON.stringify({ reason, origin_node }),
    );
  }

  res.status(201).json({ accepted: true, resource_deleted: !!row });
});

// GAID Resolution (cross-node) — RegExp route avoids path-to-regexp v8 wildcard breaking change
app.get(/^\/api\/v1\/resolve\/(.+)$/, async (req: Request, res: Response) => {
  const gaid = (req.params as any)[0] as string;

  // Try local first
  const local = resolveGaidLocally(db, gaid);
  if (local) {
    res.json({ resource: local, source_node: NODE_NAME, resolved: true });
    return;
  }

  // Try peers
  const peerResult = await resolveGaidFromPeers(db, gaid, NODE_ID);
  if (peerResult) {
    res.json({ ...peerResult, resolved: true });
    return;
  }

  res.status(404).json({ error: 'GAID not found', gaid, resolved: false });
});

// Inspector — aggregate GAID resolution, DID state, trust, signature, provenance, revocation, and policy outcomes
app.get('/api/v1/inspect', async (req: Request, res: Response) => {
  const gaid = (req.query as Record<string, string>).gaid;
  if (!gaid) {
    res.status(400).json({ error: 'Missing required query parameter: gaid' });
    return;
  }

  const resolutionTrace: Array<{ step: string; status: 'passed' | 'failed'; detail: string }> = [];

  const local = resolveGaidLocally(db, gaid);
  if (local) {
    resolutionTrace.push({ step: 'local_lookup', status: 'passed', detail: 'Resolved from the local resources table' });
    const localResource = local as Record<string, unknown>;
    const revocation = getRevocationRecord(db, gaid, (localResource as any)?.metadata?.name);
    const inspection = await buildInspectorResponse({
      gaid,
      resource: localResource,
      sourceNode: NODE_NAME,
      resolvedVia: 'local',
      baseUrl: BASE_URL,
      revocationRecord: revocation,
    });
    res.json({ ...inspection, resolution_trace: resolutionTrace });
    return;
  }

  resolutionTrace.push({ step: 'local_lookup', status: 'failed', detail: 'No local resource matched the requested GAID' });

  const peerResult = await resolveResourceFromPeers(db, gaid, NODE_ID);
  if (peerResult) {
    resolutionTrace.push({ step: 'peer_lookup', status: 'passed', detail: `Resolved from peer node ${peerResult.source_node}` });
    const peerResource = peerResult.resource as Record<string, unknown>;
    const revocation = getRevocationRecord(db, gaid, (peerResource as any)?.metadata?.name);
    const inspection = await buildInspectorResponse({
      gaid,
      resource: peerResource,
      sourceNode: peerResult.source_node,
      resolvedVia: 'peer',
      baseUrl: peerResult.source_url,
      revocationRecord: revocation,
    });
    res.json({ ...inspection, resolution_trace: resolutionTrace });
    return;
  }

  resolutionTrace.push({ step: 'peer_lookup', status: 'failed', detail: 'No healthy peer resolved the requested GAID' });
  res.status(404).json({ error: 'GAID not found', gaid, resolved: false, resolution_trace: resolutionTrace });
});

// P2P Status endpoint
app.get('/api/v1/p2p/status', (_req: Request, res: Response) => {
  if (!p2pNode) {
    res.json({
      enabled: false,
      message: P2P_ENABLED ? 'P2P node starting...' : 'P2P disabled (set DUADP_P2P=true to enable)',
    });
    return;
  }
  res.json({
    enabled: true,
    peer_id: p2pNode.getPeerId(),
    multiaddrs: p2pNode.getMultiaddrs(),
    connected_peers: p2pNode.getPeerCount(),
    content_store: contentStore?.stats() ?? null,
    crdt_registry: crdtRegistry?.stats() ?? null,
  });
});

// Governance & analytics
app.use(createGovernanceRouter(db, NODE_NAME, REFERENCE_NODE_VERSION));

// MCP Streaming
app.use('/mcp', createMcpRouter(BASE_URL));
app.use('/api/v1/control-plane', createControlPlaneRouter({
  listTools: provider.listTools?.bind(provider),
  listSkills: provider.listSkills?.bind(provider),
  rolloutMode: process.env.DUADP_GITLAB_ROLLOUT_MODE === 'blocking' ? 'blocking' : 'advisory',
}));

app.listen(PORT, async () => {
  console.log(`DUADP Reference Node "${NODE_NAME}" running at ${BASE_URL}`);
  console.log(`Discovery: ${BASE_URL}/.well-known/duadp.json`);
  console.log(`Health:    ${BASE_URL}/api/v1/health`);
  console.log(`MCP Tool:  ${BASE_URL}/mcp`);

  // Auto-register peers from DUADP_PEERS env var
  await registerEnvPeers(db, NODE_ID, NODE_NAME);

  // Start background health checks (every 60s)
  startHealthChecks(db, NODE_ID);
  console.log(`Federation: health checks started (60s interval)`);

  // --- Decentralization layer ---
  if (P2P_ENABLED) {
    try {
      // Initialize CRDT registry
      crdtRegistry = createCRDTRegistry();
      console.log(`CRDT: Yjs registry initialized`);

      // Initialize content-addressable storage
      contentStore = await createContentStore();
      console.log(`Content Store: ${contentStore.stats().storedCount} manifests`);

      // Start libp2p P2P node
      p2pNode = await createP2PNode({
        port: P2P_PORT,
        bootstrapPeers: P2P_BOOTSTRAP_PEERS,
      });

      // Wire: incoming gossip → CRDT registry + content store
      p2pNode.onAgentPublished(async (manifest, peerId) => {
        const name = (manifest as any)?.metadata?.name || 'unknown';
        const kind = (manifest as any)?.kind || 'Agent';
        console.log(`P2P: received ${kind} "${name}" from peer ${peerId}`);

        // Store in CRDT
        crdtRegistry?.put(kind, name, manifest);

        // Store CID in content store
        const cid = await contentStore?.put(manifest);
        if (cid) console.log(`  → CID: ${cid}`);
      });

      console.log(`P2P: libp2p node started`);
      console.log(`  Peer ID:  ${p2pNode.getPeerId()}`);
      console.log(`  Listen:   /ip4/0.0.0.0/tcp/${P2P_PORT}`);
      console.log(`  P2P Status: ${BASE_URL}/api/v1/p2p/status`);
    } catch (err) {
      console.warn(`P2P: failed to start (non-fatal):`, (err as Error).message);
      console.warn(`  Node continues with HTTP federation only.`);
    }
  }
});
