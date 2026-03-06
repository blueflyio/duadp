#!/usr/bin/env node
/**
 * UADP CLI — conformance testing and node discovery.
 *
 * Usage:
 *   npx @bluefly/duadp conformance https://node.example.com
 *   npx @bluefly/duadp discover https://node.example.com
 *   npx @bluefly/duadp verify agent://acme.com/agents/my-agent
 */

import { UadpClient } from './client.js';
import { runConformanceTests, formatConformanceResults } from './conformance.js';
import { resolveDID, didWebToUrl } from './did.js';
import { resolveGaid } from './client.js';

const [,, command, target, ...flags] = process.argv;

async function main() {
  if (!command || command === '--help' || command === '-h') {
    console.log(`
UADP CLI — Universal AI Discovery Protocol

Commands:
  conformance <url>    Run conformance tests against a UADP node
  discover <url>       Discover a UADP node and show its manifest
  resolve <gaid>       Resolve a GAID URI to node + resource
  did <did>            Resolve a DID document
  search <url> <q>     Search skills/agents/tools on a node

Examples:
  npx @bluefly/duadp conformance https://marketplace.example.com
  npx @bluefly/duadp discover https://skills.sh
  npx @bluefly/duadp resolve agent://acme.com/skills/code-review
  npx @bluefly/duadp did did:web:acme.com
  npx @bluefly/duadp search https://skills.sh "code review"
`);
    process.exit(0);
  }

  switch (command) {
    case 'conformance':
    case 'test': {
      if (!target) { console.error('Usage: uadp conformance <url>'); process.exit(1); }
      console.log(`Running UADP conformance tests against ${target}...\n`);
      const token = flags.find(f => f.startsWith('--token='))?.split('=')[1];
      const result = await runConformanceTests(target, { token });
      console.log(formatConformanceResults(result));
      process.exit(result.failed > 0 ? 1 : 0);
      break;
    }

    case 'discover': {
      if (!target) { console.error('Usage: uadp discover <url>'); process.exit(1); }
      const client = new UadpClient(target, { timeout: 10000 });
      const manifest = await client.discover();
      console.log(JSON.stringify(manifest, null, 2));
      break;
    }

    case 'resolve': {
      if (!target) { console.error('Usage: uadp resolve <gaid>'); process.exit(1); }
      const { client, kind, name } = resolveGaid(target);
      console.log(`Domain: ${new URL(client.baseUrl).hostname}`);
      console.log(`Kind:   ${kind}`);
      console.log(`Name:   ${name}`);
      console.log(`\nDiscovering node...`);
      const manifest = await client.discover();
      console.log(`Node:   ${manifest.node_name}`);
      console.log(`\nFetching resource...`);
      let resource;
      if (kind === 'skills') resource = await client.getSkill(name);
      else if (kind === 'agents') resource = await client.getAgent(name);
      else if (kind === 'tools') resource = await client.getTool(name);
      if (resource) console.log(JSON.stringify(resource, null, 2));
      else console.log('Resource not found');
      break;
    }

    case 'did': {
      if (!target) { console.error('Usage: uadp did <did>'); process.exit(1); }
      console.log(`Resolving ${target}...`);
      console.log(`URL: ${didWebToUrl(target)}`);
      const result = await resolveDID(target);
      console.log(`\nDID Document:`);
      console.log(JSON.stringify(result.document, null, 2));
      console.log(`\nPublic Keys: ${result.publicKeys.length}`);
      for (const key of result.publicKeys) {
        console.log(`  ${key.id} (${key.type}) — ${key.purpose.join(', ')}`);
      }
      if (result.uadpEndpoint) console.log(`\nUADP Endpoint: ${result.uadpEndpoint}`);
      break;
    }

    case 'search': {
      if (!target) { console.error('Usage: uadp search <url> <query>'); process.exit(1); }
      const query = flags[0] || '';
      const client = new UadpClient(target, { timeout: 10000 });
      await client.discover();
      const manifest = await client.getManifest();

      if (manifest.endpoints.skills) {
        const skills = await client.listSkills({ search: query, limit: 10 });
        console.log(`\n--- Skills (${skills.meta.total} total) ---`);
        for (const s of skills.data) {
          console.log(`  ${s.metadata.name} — ${s.metadata.description || '(no description)'}`);
        }
      }
      if (manifest.endpoints.agents) {
        const agents = await client.listAgents({ search: query, limit: 10 });
        console.log(`\n--- Agents (${agents.meta.total} total) ---`);
        for (const a of agents.data) {
          console.log(`  ${a.metadata.name} — ${a.metadata.description || '(no description)'}`);
        }
      }
      if (manifest.endpoints.tools) {
        const tools = await client.listTools({ search: query, limit: 10 });
        console.log(`\n--- Tools (${tools.meta.total} total) ---`);
        for (const t of tools.data) {
          console.log(`  ${t.metadata.name} — ${t.metadata.description || '(no description)'}`);
        }
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}. Run 'uadp --help' for usage.`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`Error: ${err.message || err}`);
  process.exit(1);
});
