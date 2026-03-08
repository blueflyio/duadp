import type { DuadpManifest, FederationResponse } from '@bluefly/duadp';
import cors from 'cors';
import type { Request, Response } from 'express';
import express from 'express';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from './db.js';
import { createGovernanceRouter } from './governance.js';
import { createMcpRouter } from './mcp.js';
import { createSqliteProvider } from './provider.js';

const PORT = parseInt(process.env.PORT || '4200');
const DB_PATH = process.env.DB_PATH || process.env.DUADP_DB_PATH || './data/duadp.db';
const BASE_URL = process.env.BASE_URL || process.env.DUADP_BASE_URL || `http://localhost:${PORT}`;
const NODE_NAME = process.env.NODE_NAME || process.env.DUADP_NODE_NAME || 'OSSA Reference Node';
const NODE_ID = process.env.NODE_ID || process.env.DUADP_NODE_ID || 'did:web:localhost';

const CEDAR_CATALOG_PATH =
  process.env.CEDAR_CATALOG_PATH ||
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'cedar-policies', 'catalog.json');

// Load Cedar policy catalog (static JSON served at /api/v1/policies)
interface CedarCatalogEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  tags: string[];
  classification: string;
  complianceFrameworks: string[];
  authors: string[];
  approvers: string[];
  cedarFile: string;
  statementCount: number;
  dependsOn: string[];
  createdAt: string;
  updatedAt: string;
}

interface CedarCatalog {
  version: string;
  generatedAt: string;
  policies: CedarCatalogEntry[];
  totalPolicies: number;
  tags: string[];
}

let cedarCatalog: CedarCatalog;
try {
  cedarCatalog = JSON.parse(readFileSync(CEDAR_CATALOG_PATH, 'utf-8'));
} catch {
  console.warn(`Cedar policy catalog not found at ${CEDAR_CATALOG_PATH}, using empty catalog`);
  cedarCatalog = { version: '0.0.0', generatedAt: new Date().toISOString(), policies: [], totalPolicies: 0, tags: [] };
}

const CEDAR_POLICIES_BASE_URL = 'https://gitlab.com/blueflyio/cedar-policies/-/raw/main/policies';

const db = initDb(DB_PATH);
const provider = createSqliteProvider(db);

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
    protocol_version: '0.2.0',
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
    capabilities: ['skills', 'agents', 'tools', 'policies', 'federation', 'validation', 'publishing'],
    ossa_versions: ['v0.4', 'v0.5'],
    federation: config.federation,
  };
  res.json(manifest);
});

// WebFinger
app.get('/.well-known/webfinger', async (req: Request, res: Response) => {
  const resource = (req.query as Record<string, string>).resource;
  if (!resource) { res.status(400).json({ error: 'Missing resource parameter' }); return; }
  const result = await provider.resolveWebFinger!(resource);
  if (!result) { res.status(404).json({ error: 'Resource not found' }); return; }
  res.type('application/jrd+json').json(result);
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
    policies: cedarCatalog.totalPolicies,
    peers: peerCount,
    version: '0.2.0',
  });
});

// Skills
app.get('/api/v1/skills', async (req: Request, res: Response) => {
  const result = await provider.listSkills!(parseListParams(req));
  result.meta.node_name = NODE_NAME;
  result.meta.node_id = NODE_ID;
  res.json(result);
});

app.get('/api/v1/skills/:name', async (req: Request, res: Response) => {
  const skill = await provider.getSkill!(req.params.name as string);
  if (!skill) { res.status(404).json({ error: 'Skill not found' }); return; }
  res.json(skill);
});

// Agents
app.get('/api/v1/agents', async (req: Request, res: Response) => {
  const result = await provider.listAgents!(parseListParams(req));
  result.meta.node_name = NODE_NAME;
  result.meta.node_id = NODE_ID;
  res.json(result);
});

app.get('/api/v1/agents/:name', async (req: Request, res: Response) => {
  const agent = await provider.getAgent!(req.params.name as string);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  res.json(agent);
});

app.get('/api/v1/agents/:gaid/card', async (req: Request, res: Response) => {
  if (!provider.getAgentCard) { res.status(501).json({ error: 'Agent Cards not supported by provider' }); return; }
  const card = await provider.getAgentCard(req.params.gaid as string);
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
  res.json(result);
});

app.get('/api/v1/tools/:name', async (req: Request, res: Response) => {
  const tool = await provider.getTool!(req.params.name as string);
  if (!tool) { res.status(404).json({ error: 'Tool not found' }); return; }
  res.json(tool);
});

// Policies (Cedar policy catalog)
app.get('/api/v1/policies', (req: Request, res: Response) => {
  const page = Math.max(1, parseInt((req.query as Record<string, string>).page) || 1);
  const perPage = Math.min(100, parseInt((req.query as Record<string, string>).per_page || '20', 10));
  const tag = (req.query as Record<string, string>).tag;
  const search = (req.query as Record<string, string>).search;
  const framework = (req.query as Record<string, string>).framework;

  let filtered = cedarCatalog.policies;

  if (tag) {
    filtered = filtered.filter((p) => p.tags.includes(tag));
  }
  if (framework) {
    filtered = filtered.filter((p) => p.complianceFrameworks.includes(framework));
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }

  const total = filtered.length;
  const pages = Math.ceil(total / perPage);
  const offset = (page - 1) * perPage;
  const paged = filtered.slice(offset, offset + perPage);

  res.json({
    data: paged.map((p) => ({
      kind: 'Policy',
      metadata: {
        name: p.id,
        version: p.version,
        description: p.description,
        tags: p.tags,
        complianceFrameworks: p.complianceFrameworks,
        classification: p.classification,
        authors: p.authors,
        approvers: p.approvers,
        dependsOn: p.dependsOn,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      },
      spec: {
        format: 'cedar',
        statementCount: p.statementCount,
        url: `${CEDAR_POLICIES_BASE_URL}/${p.cedarFile}`,
      },
    })),
    pagination: { total, page, per_page: perPage, pages },
  });
});

app.get('/api/v1/policies/:name', (req: Request, res: Response) => {
  const policy = cedarCatalog.policies.find((p) => p.id === req.params.name);
  if (!policy) {
    res.status(404).json({ error: 'Policy not found' });
    return;
  }
  res.json({
    kind: 'Policy',
    metadata: {
      name: policy.id,
      version: policy.version,
      description: policy.description,
      tags: policy.tags,
      complianceFrameworks: policy.complianceFrameworks,
      classification: policy.classification,
      authors: policy.authors,
      approvers: policy.approvers,
      dependsOn: policy.dependsOn,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    },
    spec: {
      format: 'cedar',
      statementCount: policy.statementCount,
      url: `${CEDAR_POLICIES_BASE_URL}/${policy.cedarFile}`,
    },
  });
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

  const allData = [
    ...skills.data.map(r => ({ ...r, _kind: 'Skill' })),
    ...agents.data.map(r => ({ ...r, _kind: 'Agent' })),
    ...tools.data.map(r => ({ ...r, _kind: 'Tool' })),
  ];

  res.json({
    data: allData,
    meta: {
      total: skills.meta.total + agents.meta.total + tools.meta.total,
      page: params.page,
      limit: params.limit,
      node_name: NODE_NAME,
      facets: {
        skills: skills.meta.total,
        agents: agents.meta.total,
        tools: tools.meta.total,
      },
    },
  });
});

// Publishing
app.post('/api/v1/publish', async (req: Request, res: Response) => {
  const token = getToken(req);
  const result = await provider.publishResource!(req.body, token);
  res.status(result.success ? 201 : 400).json(result);
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
    const deleted = await provider.deleteResource!(kind, req.params.name as string, token);
    if (!deleted) { res.status(404).json({ error: 'Resource not found' }); return; }
    res.status(204).end();
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
    protocol_version: '0.2.0',
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
  const { url, name, node_id, hop } = req.body ?? {};
  if (!url || !name) {
    res.status(400).json({ error: 'Missing required fields: url, name' });
    return;
  }
  const result = await provider.addPeer!(url, name, node_id, hop ?? 0);
  res.status(result.success ? 201 : 400).json(result);
});

// Governance & analytics
app.use(createGovernanceRouter(db, NODE_NAME));

// MCP Streaming
app.use('/mcp', createMcpRouter(BASE_URL));

app.listen(PORT, () => {
  console.log(`DUADP Reference Node "${NODE_NAME}" running at ${BASE_URL}`);
  console.log(`Discovery: ${BASE_URL}/.well-known/duadp.json`);
  console.log(`Health:    ${BASE_URL}/api/v1/health`);
  console.log(`MCP Tool:  ${BASE_URL}/mcp`);
});
