import cors from 'cors';
import express from 'express';
import type { Request, Response } from 'express';
import type { UadpManifest, FederationResponse } from '@bluefly/duadp';
import { initDb } from './db.js';
import { createGovernanceRouter } from './governance.js';
import { createMcpRouter } from './mcp.js';
import { createSqliteProvider } from './provider.js';

const PORT = parseInt(process.env.PORT || '4200');
const DB_PATH = process.env.DB_PATH || process.env.DUADP_DB_PATH || './data/duadp.db';
const BASE_URL = process.env.BASE_URL || process.env.DUADP_BASE_URL || `http://localhost:${PORT}`;
const NODE_NAME = process.env.NODE_NAME || process.env.DUADP_NODE_NAME || 'OSSA Reference Node';
const NODE_ID = process.env.NODE_ID || process.env.DUADP_NODE_ID || 'did:web:localhost';

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
  const manifest: UadpManifest = {
    protocol_version: '0.2.0',
    node_id: config.nodeId,
    node_name: config.nodeName,
    endpoints: {
      skills: `${config.baseUrl}/api/v1/skills`,
      agents: `${config.baseUrl}/api/v1/agents`,
      tools: `${config.baseUrl}/api/v1/tools`,
      federation: `${config.baseUrl}/api/v1/federation`,
      validate: `${config.baseUrl}/api/v1/validate`,
      publish: `${config.baseUrl}/api/v1/publish`,
      search: `${config.baseUrl}/api/v1/search`,
      health: `${config.baseUrl}/api/v1/health`,
    },
    capabilities: ['skills', 'agents', 'tools', 'federation', 'validation', 'publishing'],
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
  const skill = await provider.getSkill!(req.params.name);
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
  const agent = await provider.getAgent!(req.params.name);
  if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
  res.json(agent);
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
  const tool = await provider.getTool!(req.params.name);
  if (!tool) { res.status(404).json({ error: 'Tool not found' }); return; }
  res.json(tool);
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
    const result = await provider.updateResource!(kind, req.params.name, req.body, token);
    res.json(result);
  });

  app.delete(`/api/v1/${kind}/:name`, async (req: Request, res: Response) => {
    const token = getToken(req);
    if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }
    const deleted = await provider.deleteResource!(kind, req.params.name, token);
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
