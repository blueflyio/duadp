#!/usr/bin/env npx tsx
/**
 * DUADP MCP Client Demo — Proof of Concept
 *
 * Connects to a running DUADP reference node's MCP endpoint and demonstrates:
 *  1. Discovering the node (duadp_discover)
 *  2. Searching for agents (duadp_search_agents)
 *  3. Checking governance policies (duadp_governance) — NIST AI RMF
 *  4. Looking up agent reputation (duadp_agent_reputation)
 *  5. Submitting feedback (duadp_submit_feedback)
 *  6. Querying the audit log (duadp_audit_log)
 *
 * Usage:
 *   npx tsx src/demo-mcp-client.ts [base-url]
 *   npx tsx src/demo-mcp-client.ts https://duadp.duadp.org
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const BASE_URL = process.argv[2] || 'http://localhost:4200';
const MCP_URL = `${BASE_URL}/mcp`;

function header(text: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${text}`);
  console.log(`${'='.repeat(60)}`);
}

function result(data: unknown) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  console.log(text);
}

async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as Array<{ type: string; text: string }>;
  const text = content?.[0]?.text || '(empty)';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  header('DUADP MCP Client — Proof of Concept');
  console.log(`Connecting to: ${MCP_URL}`);

  const transport = new SSEClientTransport(new URL(MCP_URL));
  const client = new Client({ name: 'duadp-demo', version: '1.0.0' });
  await client.connect(transport);

  // List all available tools
  const tools = await client.listTools();
  console.log(`\nConnected. ${tools.tools.length} tools available:`);
  for (const t of tools.tools) {
    console.log(`  - ${t.name}: ${t.description}`);
  }

  // 1. Discover
  header('1. duadp_discover — Node Manifest');
  const manifest = await callTool(client, 'duadp_discover');
  result(manifest);

  // 2. Search agents
  header('2. duadp_search_agents — Browse Registry');
  const agents = await callTool(client, 'duadp_search_agents', { limit: 5 });
  result(agents);

  const firstAgent = agents?.data?.[0];
  const agentGaid = firstAgent?.gaid || firstAgent?.name || 'demo-agent';
  console.log(`\nUsing agent GAID for next steps: ${agentGaid}`);

  // 3. Governance
  header('3. duadp_governance — NIST AI RMF Policies');
  const governance = await callTool(client, 'duadp_governance');
  result(governance);

  // 4. Reputation
  header('4. duadp_agent_reputation — Trust Score');
  const reputation = await callTool(client, 'duadp_agent_reputation', { agent_gaid: agentGaid });
  result(reputation);

  // 5. Submit feedback
  header('5. duadp_submit_feedback — Multi-Dimensional Trust');
  const feedback = await callTool(client, 'duadp_submit_feedback', {
    target_gaid: agentGaid,
    source: 'duadp-demo-client',
    dimensions: { safety: 5, quality: 4, reliability: 4.5, helpfulness: 4 },
    comment: 'Automated POC feedback from MCP client demo'
  });
  result(feedback);

  // 6. Audit log
  header('6. duadp_audit_log — Immutable Event Trail');
  const audit = await callTool(client, 'duadp_audit_log', { limit: 5 });
  result(audit);

  // 7. Health
  header('7. duadp_health — Node Status');
  const health = await callTool(client, 'duadp_health');
  result(health);

  header('DEMO COMPLETE');
  console.log(`
What you just saw:
  1. An MCP client connected to a DUADP node
  2. Discovered agents on the federated network
  3. Queried NIST AI RMF governance policies
  4. Checked agent reputation (multi-dimensional trust)
  5. Submitted verifiable feedback
  6. Queried the immutable audit trail
  7. Verified node health

This is what GitLab Duo agents get when DUADP MCP is configured:
  .gitlab/duo/mcp.json -> duadp.duadp.org/mcp -> 17 tools

No other protocol provides federated discovery + governance + trust
scoring + audit trails, all as standard MCP tools.
`);

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Demo failed:', err.message);
  process.exit(1);
});
