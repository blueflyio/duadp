#!/usr/bin/env node
import { startServer } from './server.js';

startServer().catch((err) => {
  console.error('[duadp-resolver-mcp] Fatal:', err);
  process.exit(1);
});
