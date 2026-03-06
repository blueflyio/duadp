import { createUadpRouter } from '@ossa/uadp/server';
import cors from 'cors';
import express from 'express';
import { initDb } from './db.js';
import { createGovernanceRouter } from './governance.js';
import { createSqliteProvider } from './provider.js';

const PORT = parseInt(process.env.PORT || '4200');
const DB_PATH = process.env.DB_PATH || process.env.UADP_DB_PATH || './data/uadp.db';
const BASE_URL = process.env.BASE_URL || process.env.UADP_BASE_URL || `http://localhost:${PORT}`;
const NODE_NAME = process.env.NODE_NAME || process.env.UADP_NODE_NAME || 'OSSA Reference Node';
const NODE_ID = process.env.NODE_ID || process.env.UADP_NODE_ID || 'did:web:localhost';

const db = initDb(DB_PATH);
const provider = createSqliteProvider(db);

const app = express();
app.use(cors());
app.use(express.json());

// Mount UADP protocol router
app.use(createUadpRouter({
  nodeName: NODE_NAME,
  nodeId: NODE_ID,
  baseUrl: BASE_URL,
  federation: { gossip: true, max_hops: 3 },
}, provider));

// Mount governance/analytics/feedback routes
app.use(createGovernanceRouter(db, NODE_NAME));

app.listen(PORT, () => {
  console.log(`UADP Reference Node "${NODE_NAME}" running at ${BASE_URL}`);
  console.log(`Discovery: ${BASE_URL}/.well-known/uadp.json`);
  console.log(`Health:    ${BASE_URL}/uadp/v1/health`);
});
