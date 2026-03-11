import type { DuadpManifest, FederationResponse } from '@bluefly/duadp';
import cors from 'cors';
import type { Request, Response } from 'express';
import express from 'express';
import { evaluateCedar, evaluateManifestCedar, type CedarEvaluationRequest } from './cedar-evaluator.js';
import { confidenceGate, extractConfidenceScore } from './confidence-gate.js';
import { createContentStore, type ContentStore } from './content-store.js';
import { createCRDTRegistry, type CRDTRegistry } from './crdt-registry.js';
import { initDb } from './db.js';
import {
    deduplicateByGaid,
    federatedFetch,
    registerEnvPeers,
    resolveGaidFromPeers,
    resolveGaidLocally,
    startHealthChecks,
} from './federation.js';
import { createGovernanceRouter } from './governance.js';
import { createMcpRouter } from './mcp.js';
import { createP2PNode, type P2PNode } from './p2p.js';
import { createSqliteProvider } from './provider.js';
import { isNameRevoked, isRevoked, listRevocations, propagateRevocation, storeRevocation } from './revocation.js';
import { verifyPublisherSignature } from './signature-verifier.js';
import { verifyTrustTier } from './trust.js';

const PORT = parseInt(process.env.PORT || '4200');
const DB_PATH = process.env.DB_PATH || process.env.DUADP_DB_PATH || './data/duadp.db';
const BASE_URL = process.env.BASE_URL || process.env.DUADP_BASE_URL || `http://localhost:${PORT}`;
const NODE_NAME = process.env.NODE_NAME || process.env.DUADP_NODE_NAME || 'OSSA Reference Node';
const NODE_ID = process.env.NODE_ID || process.env.DUADP_NODE_ID || 'did:web:localhost';

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

const parseListParams = (req: Request) => ({
  search: (req.query as Record<string, string>).search,
  category: (req.query as Record<string, string>).category,
  tag: (req.query as Record<string, string>).tag,
  trust_tier: (req.query as Record<string, string>).trust_tier,
  federated: (req.query as Record<string, string>).federated === 'true',
  page: Math.max(1, parseInt((req.query as Record<string, string>).page) || 1),
  limit: Math.min(100, parseInt((req.query as Record<string, string>).limit || '50', 10)),
});

const config = {
  nodeName: NODE_NAME,
  nodeId: NODE_ID,
  baseUrl: BASE_URL,
  federation: { gossip: true, max_hops: 3 },
};

// /.well-known/duadp.json
app.get('/.well-known/duadp.json', (_req: Request, res: Response) => {
  const manifest: DuadpManifest = {
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
      publish: `${config.baseUrl}/api/v1/publish`,
      search: `${config.baseUrl}/api/v1/search`,
      health: `${config.baseUrl}/api/v1/health`,
    },
    capabilities: ['skills', 'agents', 'tools', 'policies', 'federation', 'validation', 'publishing', 'trust-verification', 'revocations', 'cedar-authorization'],
    ossa_versions: ['v0.4', 'v0.5'],
    federation: config.federation,
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
    version: '0.1.3',
  });
});

// Skills
app.get('/api/v1/skills', async (req: Request, res: Response) => {
  const params = parseListParams(req);
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
  const token = getToken(req);
  const resource = req.body;
  const resourceName = resource?.metadata?.name;
  const gaid = resource?.identity?.gaid || (resourceName ? `agent://${resourceName}` : null);

  // Block re-registration of revoked resources
  if (gaid && isRevoked(db, gaid)) {
    res.status(403).json({ error: 'Resource has been revoked and cannot be re-registered', gaid });
    return;
  }
  if (resourceName && isNameRevoked(db, resourceName)) {
    res.status(403).json({ error: 'Resource name has been revoked and cannot be re-registered', name: resourceName });
    return;
  }

  // Verify publisher signature (enforced for tier_3+ resources)
  const sigVerification = await verifyPublisherSignature(resource);
  if (sigVerification.requiresSignature && !sigVerification.verified) {
    res.status(403).json({
      error: 'Publisher signature verification failed',
      detail: 'Resources with trust_tier >= 3 must have a valid Ed25519 signature verifiable via DID resolution',
      signature_verification: sigVerification,
    });
    return;
  }

  // Cedar pre-authorization via Compliance service (compliance.blueflyagents.com/evaluate)
  const principalId = token || 'anonymous';
  const cedarResult = await evaluateManifestCedar(
    resource,
    { type: 'DUADP::Principal', id: principalId },
    { type: 'DUADP::Action', id: 'publish' },
    { type: 'DUADP::Resource', id: resourceName || 'unknown' },
  );
  if (cedarResult && cedarResult.decision === 'Deny') {
    res.status(403).json({
      error: 'Cedar policy denied publication',
      cedar_decision: cedarResult,
    });
    return;
  }

  // Confidence gate — three-tier routing (≥90 auto, 50-89 review, <50 reject)
  const confidenceScore = extractConfidenceScore(resource);
  const trustTier = resource?.metadata?.trust_tier || 'community';
  const validationPassed = !!(resource?.metadata?.validation_passed);
  const verdict = confidenceGate(confidenceScore, trustTier, validationPassed);

  if (verdict.action === 'reject') {
    res.status(403).json({
      error: 'Confidence gate rejected publication',
      confidence_verdict: verdict,
      hint: 'Improve model confidence score (≥50) or ensure schema validation passes before publishing.',
    });
    return;
  }

  if (verdict.action === 'human_review') {
    // Downgrade trust tier while queuing for review
    if (verdict.degraded_tier && resource.metadata) {
      resource.metadata.trust_tier = verdict.degraded_tier;
    }
    // Return a 202 Accepted — resource published at degraded tier, pending review
    const reviewResult = await provider.publishResource!(resource, token);
    res.status(202).json({
      ...reviewResult,
      confidence_verdict: verdict,
      message: 'Resource published at degraded trust tier, pending human review.',
    });
    return;
  }

  // Verify trust tier before publishing
  const verification = await verifyTrustTier(resource);
  if (verification.downgraded) {
    // Override claimed tier with verified tier
    if (resource.metadata) {
      resource.metadata.trust_tier = verification.verified_tier;
    }
  }

  const result = await provider.publishResource!(resource, token);
  res.status(result.success ? 201 : 400).json({
    ...result,
    trust_verification: verification,
    signature_verification: sigVerification,
  });
});

for (const kind of ['skills', 'agents', 'tools']) {
  app.post(`/api/v1/${kind}`, async (req: Request, res: Response) => {
    const token = getToken(req);
    const result = await provider.publishResource!(req.body, token);
    res.status(result.success ? 201 : 400).json(result);
  });

  app.put(`/api/v1/${kind}/:name`, async (req: Request, res: Response) => {
    const token = getToken(req);
    if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }
    const result = await provider.updateResource!(kind, req.params.name as string, req.body, token);
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
      revoked_by: token ? `token:${token.slice(0, 8)}...` : 'system',
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
app.use(createGovernanceRouter(db, NODE_NAME));

// MCP Streaming
app.use('/mcp', createMcpRouter(BASE_URL));

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
