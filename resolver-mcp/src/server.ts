// DUADP Resolver MCP Server
// Standalone server implementing the federated discovery pipeline as MCP tools.
// Transport: stdio (invoked as a subprocess by MCP clients).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  resolve,
  classifySeed,
  fetchWellKnown,
  fetchOssaManifest,
  resolveDomainFromGaid,
} from './resolver.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'duadp-resolver',
    version: '0.1.0',
  });

  // ── Tool 1: duadp_resolve ─────────────────────────────────────────────────
  // Full 6-phase pipeline. Given any seed, returns a resolved DuadpNode.
  server.registerTool(
    'duadp_resolve',
    {
      description:
        'Resolve any seed (domain, GAID, manifest URL, or MCP endpoint) through the full DUADP discovery pipeline. Returns a DuadpNode with canonical endpoint, MCP endpoint, OSSA manifest URL, capabilities, and trust bootstrap references.',
      inputSchema: {
        seed: z.string().describe('The seed to resolve: a domain (bluefly.io), a GAID (gaid:bluefly:xxx or agent://...), an OSSA manifest URL (https://...manifest.json), or an MCP endpoint (https://.../mcp)'),
        seed_type: z.enum(['domain', 'gaid', 'manifest_url', 'mcp_endpoint']).optional().describe('Seed type. Omit to auto-detect.'),
        need_ossa: z.boolean().optional().describe('Also fetch and include the OSSA manifest. Default: false.'),
        need_trust_refs: z.boolean().optional().describe('Ensure trust bootstrap refs are returned. Default: false.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ seed, seed_type, need_ossa, need_trust_refs }) => {
      const detectedType = seed_type ?? classifySeed(seed);
      const result = await resolve({
        seed_type: detectedType,
        seed_value: seed,
        need_ossa: need_ossa ?? false,
        need_trust_refs: need_trust_refs ?? false,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: result.status === 'failed',
      };
    }
  );

  // ── Tool 2: duadp_fetch_well_known ────────────────────────────────────────
  // Fetch the raw /.well-known/duadp.json from a domain without full resolution.
  server.registerTool(
    'duadp_fetch_well_known',
    {
      description:
        'Fetch the raw DUADP discovery document at /.well-known/duadp.json from a domain. Returns the unparsed discovery record including GAID, endpoint, MCP endpoint, OSSA manifest URL, capabilities, and trust references.',
      inputSchema: {
        domain: z.string().describe('Domain to fetch (e.g. bluefly.io or https://bluefly.io)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ domain }) => {
      try {
        const { doc, url } = await fetchWellKnown(domain);
        return {
          content: [{ type: 'text', text: JSON.stringify({ url, doc }, null, 2) }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Failed to fetch well-known: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool 3: duadp_fetch_ossa_manifest ────────────────────────────────────
  // Fetch and parse an OSSA manifest from a URL.
  server.registerTool(
    'duadp_fetch_ossa_manifest',
    {
      description:
        'Fetch and parse an OSSA agent manifest from a URL. Returns the capability contract: kind, name, version, capabilities, MCP endpoint, and trust metadata. Use after duadp_resolve to load the full agent contract.',
      inputSchema: {
        manifest_url: z.string().describe('URL of the OSSA manifest (JSON or YAML)'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ manifest_url }) => {
      try {
        const manifest = await fetchOssaManifest(manifest_url);
        return {
          content: [{ type: 'text', text: JSON.stringify(manifest, null, 2) }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: `Failed to fetch manifest: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // ── Tool 4: duadp_classify_seed ──────────────────────────────────────────
  // Classify a seed value without making network requests.
  server.registerTool(
    'duadp_classify_seed',
    {
      description:
        'Classify a seed value into its DUADP seed type (domain, gaid, manifest_url, or mcp_endpoint) without making any network requests. Useful for validating seed format before resolution.',
      inputSchema: {
        seed: z.string().describe('The seed value to classify'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ seed }) => {
      const type = classifySeed(seed);
      return {
        content: [{ type: 'text', text: JSON.stringify({ seed, seed_type: type }, null, 2) }],
      };
    }
  );

  // ── Tool 5: duadp_extract_domain_from_gaid ───────────────────────────────
  // Extract a resolvable domain from a GAID URI.
  server.registerTool(
    'duadp_extract_domain_from_gaid',
    {
      description:
        'Attempt to extract a resolvable domain from a GAID URI (gaid:<namespace>:<id> or agent://<domain>/...). The returned domain can then be used with duadp_fetch_well_known.',
      inputSchema: {
        gaid: z.string().describe('The GAID URI (e.g. gaid:bluefly:agent-123 or agent://bluefly.io/agents/foo)'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ gaid }) => {
      const domain = await resolveDomainFromGaid(gaid);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ gaid, domain, resolvable: domain !== null }, null, 2),
          },
        ],
      };
    }
  );

  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
