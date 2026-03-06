import { createUadpRouter } from '@bluefly/duadp/server';
import cors from 'cors';
import express from 'express';
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

// Mount DUADP protocol router
app.use(createUadpRouter({
  nodeName: NODE_NAME,
  nodeId: NODE_ID,
  baseUrl: BASE_URL,
  federation: { gossip: true, max_hops: 3 },
}, provider));

// Mount governance/analytics/feedback routes
app.use(createGovernanceRouter(db, NODE_NAME));

// Mount the MCP Streaming Server for GitLab duo compatibility
app.use('/mcp', createMcpRouter(BASE_URL));

app.listen(PORT, () => {
  console.log(`DUADP Reference Node "${NODE_NAME}" running at ${BASE_URL}`);
  console.log(`Discovery: ${BASE_URL}/.well-known/duadp.json`);
  console.log(`Health:    ${BASE_URL}/api/v1/health`);
  console.log(`MCP Tool:  ${BASE_URL}/mcp`);
});
