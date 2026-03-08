#!/usr/bin/env node
/**
 * DUADP CLI — register, verify, search, and manage agents across federated nodes.
 *
 * Commands:
 *   duadp init              — Scaffold an ai.json (OSSA manifest) interactively
 *   duadp publish [file]    — Publish agent/skill/tool to a DUADP node
 *   duadp verify [file]     — Verify manifest trust tier
 *   duadp search <query>    — Federated search across all nodes
 *   duadp status            — Show registered agents and trust tiers
 *   duadp revocations       — List revoked resources
 *   duadp peers             — Show federation peers
 *   duadp health            — Check node health
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_NODE = process.env.DUADP_NODE || 'http://localhost:4200';
const args = process.argv.slice(2);
const command = args[0];

// --- Helpers ---

async function fetchNode(path: string, options?: RequestInit): Promise<Response> {
  const node = getNodeUrl();
  return fetch(`${node}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options?.headers,
    },
  });
}

function getNodeUrl(): string {
  const nodeFlag = args.indexOf('--node');
  if (nodeFlag !== -1 && args[nodeFlag + 1]) return args[nodeFlag + 1];
  return DEFAULT_NODE;
}

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

function printTable(headers: string[], rows: string[][]) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || '').length)),
  );
  const sep = widths.map((w) => '-'.repeat(w + 2)).join('+');
  const fmtRow = (row: string[]) =>
    row.map((cell, i) => ` ${(cell || '').padEnd(widths[i])} `).join('|');

  console.log(fmtRow(headers));
  console.log(sep);
  for (const row of rows) console.log(fmtRow(row));
}

// --- Commands ---

async function cmdInit() {
  const outFile = getFlag('output') || 'ai.json';

  if (existsSync(outFile) && !hasFlag('force')) {
    console.error(`${outFile} already exists. Use --force to overwrite.`);
    process.exit(1);
  }

  const manifest = {
    apiVersion: 'ossa/v0.5',
    kind: 'Agent',
    metadata: {
      name: 'my-agent',
      version: '0.1.0',
      description: 'A DUADP-registered agent',
      tags: ['ai', 'automation'],
      trust_tier: 'community',
      category: 'general',
    },
    identity: {
      gaid: 'agent://localhost/agents/my-agent',
      did: 'did:web:localhost',
      operational: {
        protocol: 'rest',
        endpoint: 'http://localhost:3000',
      },
    },
    spec: {
      capabilities: ['text-generation'],
      inputSchema: { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: {} },
    },
    provenance: {
      publisher: {
        name: 'Your Organization',
        url: 'https://example.com',
      },
      license: 'MIT',
      source_url: 'https://github.com/example/my-agent',
    },
  };

  writeFileSync(outFile, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Created ${outFile}`);
  console.log('Edit the manifest, then run: duadp publish');
}

async function cmdPublish() {
  const file = args[1] || 'ai.json';
  const filePath = resolve(file);

  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    console.error('Run `duadp init` to create a manifest.');
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(filePath, 'utf-8'));
  console.log(`Publishing ${manifest.kind} "${manifest.metadata?.name}" to ${getNodeUrl()}...`);

  const resp = await fetchNode('/api/v1/publish', {
    method: 'POST',
    body: JSON.stringify(manifest),
    headers: {
      'Content-Type': 'application/json',
      ...(getFlag('token') ? { Authorization: `Bearer ${getFlag('token')}` } : {}),
    },
  });

  const result = await resp.json();

  if (!resp.ok) {
    console.error(`Publish failed (${resp.status}):`, JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(`Published successfully!`);
  if (result.trust_verification) {
    const tv = result.trust_verification;
    const icon = tv.passed ? '✓' : tv.downgraded ? '⚠' : '✗';
    console.log(`Trust: ${icon} claimed=${tv.claimed_tier}, verified=${tv.verified_tier}${tv.downgraded ? ' (DOWNGRADED)' : ''}`);
    for (const check of tv.checks || []) {
      console.log(`  ${check.passed ? '✓' : '✗'} ${check.name}: ${check.detail}`);
    }
  }
}

async function cmdVerify() {
  const file = args[1] || 'ai.json';
  const filePath = resolve(file);

  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(filePath, 'utf-8'));
  console.log(`Verifying ${manifest.kind} "${manifest.metadata?.name}"...`);

  const resp = await fetchNode('/api/v1/verify', {
    method: 'POST',
    body: JSON.stringify(manifest),
  });

  const result = await resp.json();

  if (!resp.ok) {
    console.error(`Verification failed (${resp.status}):`, JSON.stringify(result, null, 2));
    process.exit(1);
  }

  const icon = result.passed ? '✓' : '⚠';
  console.log(`\n${icon} Trust Tier: ${result.verified_tier} (claimed: ${result.claimed_tier})`);
  if (result.downgraded) console.log('  ⚠ Tier was DOWNGRADED from claimed level');
  console.log('');

  for (const check of result.checks || []) {
    console.log(`  ${check.passed ? '✓' : '✗'} [${check.tier}] ${check.name}: ${check.detail}`);
  }

  process.exit(result.passed ? 0 : 1);
}

async function cmdSearch() {
  const query = args[1];
  if (!query) {
    console.error('Usage: duadp search <query>');
    process.exit(1);
  }

  const federated = hasFlag('federated') || hasFlag('f');
  const qs = new URLSearchParams({ q: query, ...(federated ? { federated: 'true' } : {}) });

  console.log(`Searching "${query}"${federated ? ' (federated)' : ''}...`);

  const resp = await fetchNode(`/api/v1/search?${qs}`);
  const result = await resp.json();

  if (!resp.ok) {
    console.error(`Search failed:`, result.error);
    process.exit(1);
  }

  if (result.data?.length === 0) {
    console.log('No results found.');
    return;
  }

  console.log(`\nFound ${result.meta?.total || result.data.length} results:\n`);

  const rows = (result.data as any[]).map((item: any) => [
    item._kind || item.kind || '?',
    item.metadata?.name || item.name || '?',
    (item.metadata?.description || '').slice(0, 60),
    item.metadata?.trust_tier || '-',
    item._source_node || 'local',
  ]);

  printTable(['Kind', 'Name', 'Description', 'Trust', 'Node'], rows);

  if (result.meta?.facets) {
    console.log(`\nFacets: ${Object.entries(result.meta.facets).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  if (result.meta?.peers_queried) {
    console.log(`Peers queried: ${(result.meta.peers_queried as any[]).length}`);
  }
}

async function cmdStatus() {
  console.log(`Node: ${getNodeUrl()}\n`);

  const resp = await fetchNode('/api/v1/health');
  if (!resp.ok) {
    console.error('Node unreachable');
    process.exit(1);
  }

  const health = await resp.json();
  console.log(`Status:   ${health.status}`);
  console.log(`Name:     ${health.node_name}`);
  console.log(`Node ID:  ${health.node_id}`);
  console.log(`Version:  ${health.version}`);
  console.log(`Uptime:   ${Math.floor(health.uptime)}s`);
  console.log(`Resources: ${health.resources}`);
  console.log(`Policies: ${health.policies}`);
  console.log(`Peers:    ${health.peers}`);

  // Show agents with trust tiers
  console.log('\n--- Agents ---\n');
  const agentsResp = await fetchNode('/api/v1/agents?limit=100');
  const agents = await agentsResp.json();

  if (agents.data?.length > 0) {
    const rows = (agents.data as any[]).map((a: any) => [
      a.metadata?.name || '?',
      a.metadata?.trust_tier || '-',
      a.identity?.gaid || '-',
      (a.metadata?.description || '').slice(0, 50),
    ]);
    printTable(['Name', 'Trust', 'GAID', 'Description'], rows);
  } else {
    console.log('No agents registered.');
  }
}

async function cmdPeers() {
  const resp = await fetchNode('/api/v1/federation');
  if (!resp.ok) {
    console.error('Failed to get federation info');
    process.exit(1);
  }

  const fed = await resp.json();
  console.log(`Federation: ${fed.node_name} (${fed.node_id})`);
  console.log(`Protocol:   v${fed.protocol_version}`);
  console.log(`Gossip:     ${fed.gossip ? 'enabled' : 'disabled'}`);
  console.log(`Max hops:   ${fed.max_hops}`);

  if (fed.peers?.length > 0) {
    console.log(`\n--- Peers (${fed.peers.length}) ---\n`);
    const rows = (fed.peers as any[]).map((p: any) => [
      p.name || '?',
      p.url,
      p.status || '?',
      p.node_id || '-',
      p.last_synced || 'never',
    ]);
    printTable(['Name', 'URL', 'Status', 'Node ID', 'Last Sync'], rows);
  } else {
    console.log('\nNo peers registered.');
  }
}

async function cmdRevocations() {
  const resp = await fetchNode('/api/v1/revocations');
  if (!resp.ok) {
    console.error('Failed to get revocations');
    process.exit(1);
  }

  const result = await resp.json();
  if (result.data?.length === 0) {
    console.log('No revocations.');
    return;
  }

  console.log(`Revocations (${result.total}):\n`);
  const rows = (result.data as any[]).map((r: any) => [
    r.name,
    r.kind,
    r.reason,
    r.origin_node || '-',
    r.created_at || '-',
  ]);
  printTable(['Name', 'Kind', 'Reason', 'Origin Node', 'Revoked At'], rows);
}

async function cmdHealth() {
  const resp = await fetchNode('/api/v1/health');
  if (!resp.ok) {
    console.error(`Node at ${getNodeUrl()} is unreachable (HTTP ${resp.status})`);
    process.exit(1);
  }
  const health = await resp.json();
  console.log(JSON.stringify(health, null, 2));
}

// --- Main ---

const COMMANDS: Record<string, () => Promise<void>> = {
  init: cmdInit,
  publish: cmdPublish,
  verify: cmdVerify,
  search: cmdSearch,
  status: cmdStatus,
  peers: cmdPeers,
  revocations: cmdRevocations,
  health: cmdHealth,
};

function printHelp() {
  console.log(`
DUADP CLI v0.1.0 — Decentralized Universal AI Discovery Protocol

Usage: duadp <command> [options]

Commands:
  init                Scaffold an ai.json manifest
  publish [file]      Publish agent/skill/tool to node
  verify [file]       Verify manifest trust tier
  search <query>      Search across nodes (--federated for cross-node)
  status              Show node status and registered agents
  peers               Show federation peers
  revocations         List revoked resources
  health              Check node health (JSON)

Options:
  --node <url>        Target node (default: $DUADP_NODE or http://localhost:4200)
  --token <token>     Authentication token
  --federated, -f     Enable federated (cross-node) search
  --force             Overwrite existing files
  --output <file>     Output file for init (default: ai.json)
  --help              Show this help
`);
}

async function main() {
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    process.exit(0);
  }

  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }

  try {
    await handler();
  } catch (err) {
    if (err instanceof TypeError && (err as any).cause?.code === 'ECONNREFUSED') {
      console.error(`Cannot connect to ${getNodeUrl()}. Is the DUADP node running?`);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
