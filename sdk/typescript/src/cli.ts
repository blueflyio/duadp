#!/usr/bin/env node
/**
 * DUADP CLI — conformance testing and node discovery.
 *
 * Usage:
 *   npx @bluefly/duadp conformance https://node.example.com
 *   npx @bluefly/duadp discover https://node.example.com
 *   npx @bluefly/duadp verify agent://acme.com/agents/my-agent
 */

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { DuadpClient, resolveGaid } from './client.js';
import { formatConformanceResults, runConformanceTests } from './conformance.js';
import { didWebToUrl, resolveDID } from './did.js';

const [,, command, target, ...flags] = process.argv;

async function main() {
  if (!command || command === '--help' || command === '-h') {
    console.log(`
DUADP CLI — Universal AI Discovery Protocol

Commands:
  conformance <url>    Run conformance tests against a DUADP node
  discover <url>       Discover a DUADP node and show its manifest
  resolve <gaid>       Resolve a GAID URI to node + resource
  did <did>            Resolve a DID document
  search <url> <q>     Search skills/agents/tools on a node
  init                 Scaffold .agents/ossa.config.yaml in the current directory
  publish <dir>        Scan directory for OSSA manifests and publish to a node

Examples:
  npx @bluefly/duadp conformance https://marketplace.example.com
  npx @bluefly/duadp discover https://skills.sh
  npx @bluefly/duadp search https://skills.sh "code review"
  npx @bluefly/duadp init
  npx @bluefly/duadp publish .agents/ --node=https://blueflyagents.com --token=myToken
`);
    process.exit(0);
  }

  switch (command) {
    case 'conformance':
    case 'test': {
      if (!target) { console.error('Usage: duadp conformance <url>'); process.exit(1); }
      console.log(`Running DUADP conformance tests against ${target}...\n`);
      const token = flags.find(f => f.startsWith('--token='))?.split('=')[1];
      const result = await runConformanceTests(target, { token });
      console.log(formatConformanceResults(result));
      process.exit(result.failed > 0 ? 1 : 0);
      break;
    }

    case 'discover': {
      if (!target) { console.error('Usage: duadp discover <url>'); process.exit(1); }
      const client = new DuadpClient(target, { timeout: 10000 });
      const manifest = await client.discover();
      console.log(JSON.stringify(manifest, null, 2));
      break;
    }

    case 'resolve': {
      if (!target) { console.error('Usage: duadp resolve <gaid>'); process.exit(1); }
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
      if (!target) { console.error('Usage: duadp did <did>'); process.exit(1); }
      console.log(`Resolving ${target}...`);
      console.log(`URL: ${didWebToUrl(target)}`);
      const result = await resolveDID(target);
      console.log(`\nDID Document:`);
      console.log(JSON.stringify(result.document, null, 2));
      console.log(`\nPublic Keys: ${result.publicKeys.length}`);
      for (const key of result.publicKeys) {
        console.log(`  ${key.id} (${key.type}) — ${key.purpose.join(', ')}`);
      }
      if (result.uadpEndpoint) console.log(`\nDUADP Endpoint: ${result.uadpEndpoint}`);
      break;
    }

    case 'search': {
      if (!target) { console.error('Usage: duadp search <url> <query>'); process.exit(1); }
      const query = flags[0] || '';
      const client = new DuadpClient(target, { timeout: 10000 });
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

    case 'init': {
      const dir = target || '.agents';
      const configPath = path.join(dir, 'ossa.config.yaml');
      if (fs.existsSync(configPath)) {
        console.error(`Error: ${configPath} already exists.`);
        process.exit(1);
      }
      fs.mkdirSync(dir, { recursive: true });
      const config = {
        apiVersion: 'ossa/v0.4.3',
        kind: 'ProjectConfiguration',
        spec: {
          duadp: {
            publish_to: ['https://duadp.blueflyagents.com'],
            discover_from: ['https://duadp.blueflyagents.com'],
            auto_publish: true,
            identity: 'did:web:example.com'
          }
        }
      };
      fs.writeFileSync(configPath, yaml.dump(config));
      console.log(`Created DUADP configuration at ${configPath}`);
      break;
    }

    case 'publish': {
      const dir = target || '.agents';
      const nodeUrl = flags.find(f => f.startsWith('--node='))?.split('=')[1];
      const token = flags.find(f => f.startsWith('--token='))?.split('=')[1] || '';

      if (!nodeUrl) {
        console.error('Usage: duadp publish <dir> --node=<url> [--token=<token>]');
        process.exit(1);
      }
      if (!fs.existsSync(dir)) {
        console.error(`Error: Directory ${dir} does not exist.`);
        process.exit(1);
      }

      console.log(`Scanning ${dir} for OSSA manifests...`);
      const files = fs.readdirSync(dir);
      const manifests = files.filter(f => f.endsWith('.ossa.yaml') || f.endsWith('.ossa.json'));

      if (manifests.length === 0) {
        console.log(`No OSSA manifests found in ${dir}.`);
        process.exit(0);
      }

      const client = new DuadpClient(nodeUrl, { token, timeout: 15000 });
      console.log(`Publishing to node: ${nodeUrl}`);

      let successCount = 0;
      let failCount = 0;

      for (const file of manifests) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        let resource: any;
        try {
          if (file.endsWith('.yaml')) {
             resource = yaml.load(content);
          } else {
             resource = JSON.parse(content);
          }
        } catch (e: any) {
          console.error(`Error parsing ${file}: ${e.message}`);
          failCount++;
          continue;
        }

        if (!resource || !resource.kind || !resource.metadata) {
          console.error(`Skipping ${file}: Invalid OSSA manifest structure.`);
          failCount++;
          continue;
        }

        try {
           console.log(`Publishing ${resource.kind} '${resource.metadata.name}'...`);
           const res = await client.publish(resource);
           console.log(`  -> Success! URI: ${res.resource?.metadata?.uri || 'Published'}`);
           successCount++;
        } catch (e: any) {
           console.error(`  -> Failed to publish ${resource.metadata.name}: ${e.message}`);
           failCount++;
        }
      }
      console.log(`\nPublish complete. Success: ${successCount}, Failed: ${failCount}`);
      break;
    }

    default:
      console.error(`Unknown command: ${command}. Run 'duadp --help' for usage.`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error(`Error: ${err.message || err}`);
  process.exit(1);
});
