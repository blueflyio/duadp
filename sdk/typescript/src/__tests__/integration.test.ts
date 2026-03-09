import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createDuadpRouter } from '../server.js';
import type { DuadpDataProvider } from '../server.js';
import { DuadpClient, DuadpError } from '../client.js';
import type {
  OssaSkill,
  OssaAgent,
  OssaTool,
  Peer,
  PaginatedResponse,
} from '../types.js';

// ── Helpers ──────────────────────────────────────────────────────

function makeSkill(name: string, overrides?: Partial<OssaSkill>): OssaSkill {
  return {
    apiVersion: 'ossa/v0.4',
    kind: 'Skill',
    metadata: { name, version: '1.0.0', description: `${name} skill` },
    spec: { capabilities: ['test'] },
    ...overrides,
  };
}

function makeAgent(name: string, overrides?: Partial<OssaAgent>): OssaAgent {
  return {
    apiVersion: 'ossa/v0.4',
    kind: 'Agent',
    metadata: { name, version: '1.0.0', description: `${name} agent` },
    spec: { role: 'Test agent', type: 'worker' },
    ...overrides,
  };
}

function makeTool(name: string, protocol?: string, overrides?: Partial<OssaTool>): OssaTool {
  return {
    apiVersion: 'ossa/v0.4',
    kind: 'Tool',
    metadata: { name, version: '1.0.0', description: `${name} tool` },
    spec: { protocol: protocol || 'mcp', endpoint: `https://example.com/${name}` },
    ...overrides,
  };
}

// ── In-memory provider ──────────────────────────────────────────

function createInMemoryProvider(
  skills: Map<string, OssaSkill>,
  agents: Map<string, OssaAgent>,
  tools: Map<string, OssaTool>,
  peers: Map<string, Peer>,
): DuadpDataProvider {
  return {
    listSkills: async (params) => {
      let items = [...skills.values()];
      if (params.search) {
        const q = params.search.toLowerCase();
        items = items.filter(
          (s) =>
            s.metadata.name.toLowerCase().includes(q) ||
            (s.metadata.description?.toLowerCase().includes(q) ?? false),
        );
      }
      const total = items.length;
      const start = (params.page - 1) * params.limit;
      return {
        data: items.slice(start, start + params.limit),
        meta: { total, page: params.page, limit: params.limit, node_name: '' },
      };
    },

    getSkill: async (name) => skills.get(name) || null,

    listAgents: async (params) => {
      let items = [...agents.values()];
      if (params.search) {
        const q = params.search.toLowerCase();
        items = items.filter(
          (a) =>
            a.metadata.name.toLowerCase().includes(q) ||
            (a.metadata.description?.toLowerCase().includes(q) ?? false),
        );
      }
      const total = items.length;
      const start = (params.page - 1) * params.limit;
      return {
        data: items.slice(start, start + params.limit),
        meta: { total, page: params.page, limit: params.limit, node_name: '' },
      };
    },

    getAgent: async (name) => agents.get(name) || null,

    listTools: async (params) => {
      let items = [...tools.values()];
      if (params.search) {
        const q = params.search.toLowerCase();
        items = items.filter(
          (t) =>
            t.metadata.name.toLowerCase().includes(q) ||
            (t.metadata.description?.toLowerCase().includes(q) ?? false),
        );
      }
      if (params.protocol) {
        items = items.filter((t) => (t.spec as Record<string, unknown>)?.protocol === params.protocol);
      }
      const total = items.length;
      const start = (params.page - 1) * params.limit;
      return {
        data: items.slice(start, start + params.limit),
        meta: { total, page: params.page, limit: params.limit, node_name: '' },
      };
    },

    getTool: async (name) => tools.get(name) || null,

    publishResource: async (resource, token) => {
      if (!token) throw new Error('Unauthorized');
      const name = resource.metadata.name;
      switch (resource.kind) {
        case 'Skill':
          skills.set(name, resource as OssaSkill);
          break;
        case 'Agent':
          agents.set(name, resource as OssaAgent);
          break;
        case 'Tool':
          tools.set(name, resource as OssaTool);
          break;
      }
      return { success: true, resource };
    },

    updateResource: async (kind, name, resource, token) => {
      if (!token) throw new Error('Unauthorized');
      switch (kind) {
        case 'skills':
          skills.set(name, resource as OssaSkill);
          break;
        case 'agents':
          agents.set(name, resource as OssaAgent);
          break;
        case 'tools':
          tools.set(name, resource as OssaTool);
          break;
      }
      return { success: true, resource };
    },

    deleteResource: async (kind, name, token) => {
      if (!token) throw new Error('Unauthorized');
      switch (kind) {
        case 'skills':
          return skills.delete(name);
        case 'agents':
          return agents.delete(name);
        case 'tools':
          return tools.delete(name);
      }
      return false;
    },

    listPeers: async () => [...peers.values()],

    addPeer: async (url, name, nodeId, hop) => {
      const peer: Peer = {
        url,
        name,
        node_id: nodeId,
        status: 'healthy',
        last_synced: null,
        capabilities: [],
        skill_count: 0,
        agent_count: 0,
        tool_count: 0,
      };
      if (hop !== undefined) {
        // Store hop info on the peer object for testing (not in Peer type but harmless)
        (peer as Record<string, unknown>).hop = hop;
      }
      peers.set(url, peer);
      return { success: true, peer, peers: [...peers.values()] };
    },

    validateManifest: async (manifest) => {
      try {
        JSON.parse(manifest);
        return { valid: true, errors: [], warnings: [] };
      } catch {
        return { valid: false, errors: ['Invalid JSON'], warnings: [] };
      }
    },
  };
}

// ── Test suite ──────────────────────────────────────────────────

describe('DUADP SDK integration (client + server)', () => {
  let server: Server;
  let port: number;
  let baseUrl: string;
  let client: DuadpClient;
  let authedClient: DuadpClient;

  // Data stores
  const skillsMap = new Map<string, OssaSkill>();
  const agentsMap = new Map<string, OssaAgent>();
  const toolsMap = new Map<string, OssaTool>();
  const peersMap = new Map<string, Peer>();

  const NODE_NAME = 'integration-test-node';
  const NODE_ID = 'did:web:test.example.com';
  const AUTH_TOKEN = 'test-token-12345';

  beforeAll(async () => {
    // Seed data
    skillsMap.set('web-search', makeSkill('web-search'));
    skillsMap.set('code-review', makeSkill('code-review'));
    skillsMap.set('data-analysis', makeSkill('data-analysis'));

    agentsMap.set('assistant-alpha', makeAgent('assistant-alpha'));
    agentsMap.set('worker-beta', makeAgent('worker-beta'));

    toolsMap.set('github-tool', makeTool('github-tool', 'mcp'));
    toolsMap.set('rest-api-tool', makeTool('rest-api-tool', 'rest'));

    const provider = createInMemoryProvider(skillsMap, agentsMap, toolsMap, peersMap);

    const app = express();
    app.use(express.json());

    // We need the port first for baseUrl in the router config, so listen on 0 first
    // then create the router. Actually, the router needs baseUrl for manifest endpoints.
    // We'll start server, get port, then re-mount. Or use a workaround.
    // Simplest: start listening, get port, then mount.

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as AddressInfo;
        port = addr.port;
        baseUrl = `http://localhost:${port}`;

        const router = createDuadpRouter(
          {
            nodeName: NODE_NAME,
            nodeId: NODE_ID,
            nodeDescription: 'Test node for integration tests',
            baseUrl,
            contact: 'test@example.com',
            ossaVersions: ['v0.4', 'v0.5'],
            federation: { gossip: true, max_hops: 3 },
          },
          provider,
        );

        app.use(router);
        resolve();
      });
    });

    client = new DuadpClient(baseUrl, { timeout: 5000 });
    authedClient = new DuadpClient(baseUrl, { timeout: 5000, token: AUTH_TOKEN });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ── Discovery ────────────────────────────────────────────────

  describe('Discovery', () => {
    it('GET /.well-known/duadp.json returns valid manifest', async () => {
      const manifest = await client.discover();
      expect(manifest).toBeDefined();
      expect(manifest.protocol_version).toBe('0.2.0');
      expect(manifest.node_name).toBe(NODE_NAME);
      expect(manifest.node_id).toBe(NODE_ID);
    });

    it('manifest includes correct endpoints', async () => {
      const manifest = await client.discover();
      expect(manifest.endpoints.skills).toBe(`${baseUrl}/api/v1/skills`);
      expect(manifest.endpoints.agents).toBe(`${baseUrl}/api/v1/agents`);
      expect(manifest.endpoints.tools).toBe(`${baseUrl}/api/v1/tools`);
      expect(manifest.endpoints.federation).toBe(`${baseUrl}/api/v1/federation`);
      expect(manifest.endpoints.validate).toBe(`${baseUrl}/api/v1/validate`);
      expect(manifest.endpoints.publish).toBe(`${baseUrl}/api/v1/publish`);
    });

    it('manifest includes correct capabilities', async () => {
      const manifest = await client.discover();
      expect(manifest.capabilities).toContain('skills');
      expect(manifest.capabilities).toContain('agents');
      expect(manifest.capabilities).toContain('tools');
      expect(manifest.capabilities).toContain('federation');
      expect(manifest.capabilities).toContain('validation');
      expect(manifest.capabilities).toContain('publishing');
    });

    it('client.getManifest() caches the manifest', async () => {
      const m1 = await client.getManifest();
      const m2 = await client.getManifest();
      // Should be the exact same object reference (cached)
      expect(m1).toBe(m2);
    });
  });

  // ── Skills CRUD ──────────────────────────────────────────────

  describe('Skills CRUD', () => {
    it('listSkills() returns seeded skills', async () => {
      const result = await client.listSkills();
      expect(result.data).toHaveLength(3);
      expect(result.meta.total).toBe(3);
      expect(result.meta.node_name).toBe(NODE_NAME);
      const names = result.data.map((s) => s.metadata.name);
      expect(names).toContain('web-search');
      expect(names).toContain('code-review');
      expect(names).toContain('data-analysis');
    });

    it('listSkills({ search }) filters correctly', async () => {
      const result = await client.listSkills({ search: 'web' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].metadata.name).toBe('web-search');
    });

    it('listSkills({ limit: 1 }) returns only 1 result', async () => {
      const result = await client.listSkills({ limit: 1 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.limit).toBe(1);
      expect(result.meta.total).toBe(3);
    });

    it('listSkills({ page: 2, limit: 1 }) returns second page', async () => {
      const page1 = await client.listSkills({ page: 1, limit: 1 });
      const page2 = await client.listSkills({ page: 2, limit: 1 });
      expect(page2.data).toHaveLength(1);
      expect(page2.meta.page).toBe(2);
      // Should be a different skill than page 1
      expect(page2.data[0].metadata.name).not.toBe(page1.data[0].metadata.name);
    });

    it('getSkill(existing) returns the skill', async () => {
      const skill = await client.getSkill('web-search');
      expect(skill.metadata.name).toBe('web-search');
      expect(skill.kind).toBe('Skill');
      expect(skill.apiVersion).toBe('ossa/v0.4');
    });

    it('getSkill(nonexistent) throws DuadpError with 404', async () => {
      await expect(client.getSkill('nonexistent-skill')).rejects.toThrow(DuadpError);
      try {
        await client.getSkill('nonexistent-skill');
      } catch (err) {
        expect(err).toBeInstanceOf(DuadpError);
        expect((err as DuadpError).statusCode).toBe(404);
      }
    });

    it('publishSkill() with token creates and returns 201', async () => {
      const newSkill = makeSkill('new-published-skill');
      const result = await authedClient.publishSkill(newSkill);
      expect(result.success).toBe(true);
      expect(result.resource?.metadata.name).toBe('new-published-skill');

      // Verify it now exists
      const fetched = await client.getSkill('new-published-skill');
      expect(fetched.metadata.name).toBe('new-published-skill');
    });

    it('publishSkill() without token returns 401', async () => {
      const noAuthClient = new DuadpClient(baseUrl, { timeout: 5000 });
      // Force manifest cache
      await noAuthClient.discover();
      const newSkill = makeSkill('should-fail');
      await expect(noAuthClient.publishSkill(newSkill)).rejects.toThrow(DuadpError);
      try {
        await noAuthClient.publishSkill(newSkill);
      } catch (err) {
        expect((err as DuadpError).statusCode).toBe(401);
      }
    });

    it('updateSkill() updates correctly', async () => {
      const updated = makeSkill('web-search', {
        spec: { capabilities: ['test', 'updated'] },
      });
      const result = await authedClient.updateSkill('web-search', updated);
      expect(result.success).toBe(true);

      const fetched = await client.getSkill('web-search');
      expect((fetched.spec as Record<string, unknown>)?.capabilities).toContain('updated');
    });

    it('deleteSkill() removes the skill', async () => {
      // Publish a skill to delete
      const toDelete = makeSkill('to-be-deleted');
      await authedClient.publishSkill(toDelete);

      // Verify it exists
      const before = await client.getSkill('to-be-deleted');
      expect(before.metadata.name).toBe('to-be-deleted');

      // Delete it
      await authedClient.deleteSkill('to-be-deleted');

      // Verify it's gone
      await expect(client.getSkill('to-be-deleted')).rejects.toThrow(DuadpError);
      try {
        await client.getSkill('to-be-deleted');
      } catch (err) {
        expect((err as DuadpError).statusCode).toBe(404);
      }
    });
  });

  // ── Agents CRUD ──────────────────────────────────────────────

  describe('Agents CRUD', () => {
    it('listAgents() returns seeded agents', async () => {
      const result = await client.listAgents();
      expect(result.data.length).toBeGreaterThanOrEqual(2);
      const names = result.data.map((a) => a.metadata.name);
      expect(names).toContain('assistant-alpha');
      expect(names).toContain('worker-beta');
    });

    it('getAgent(existing) returns agent', async () => {
      const agent = await client.getAgent('assistant-alpha');
      expect(agent.metadata.name).toBe('assistant-alpha');
      expect(agent.kind).toBe('Agent');
    });

    it('getAgent(nonexistent) throws DuadpError with 404', async () => {
      await expect(client.getAgent('nonexistent-agent')).rejects.toThrow(DuadpError);
    });

    it('publishAgent() creates agent', async () => {
      const newAgent = makeAgent('new-agent');
      const result = await authedClient.publishAgent(newAgent);
      expect(result.success).toBe(true);

      const fetched = await client.getAgent('new-agent');
      expect(fetched.metadata.name).toBe('new-agent');
    });
  });

  // ── Tools CRUD ───────────────────────────────────────────────

  describe('Tools CRUD', () => {
    it('listTools() returns seeded tools', async () => {
      const result = await client.listTools();
      expect(result.data.length).toBeGreaterThanOrEqual(2);
      const names = result.data.map((t) => t.metadata.name);
      expect(names).toContain('github-tool');
      expect(names).toContain('rest-api-tool');
    });

    it('listTools({ protocol: "mcp" }) filters by protocol', async () => {
      const result = await client.listTools({ protocol: 'mcp' });
      expect(result.data.length).toBeGreaterThanOrEqual(1);
      for (const tool of result.data) {
        expect((tool.spec as Record<string, unknown>)?.protocol).toBe('mcp');
      }
    });

    it('listTools({ protocol: "rest" }) returns only rest tools', async () => {
      const result = await client.listTools({ protocol: 'rest' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].metadata.name).toBe('rest-api-tool');
    });

    it('getTool(existing) returns tool', async () => {
      const tool = await client.getTool('github-tool');
      expect(tool.metadata.name).toBe('github-tool');
      expect(tool.kind).toBe('Tool');
    });

    it('getTool(nonexistent) throws DuadpError with 404', async () => {
      await expect(client.getTool('nonexistent-tool')).rejects.toThrow(DuadpError);
    });
  });

  // ── Federation ───────────────────────────────────────────────

  describe('Federation', () => {
    it('getFederation() returns federation response', async () => {
      const fed = await client.getFederation();
      expect(fed).toBeDefined();
      expect(fed.protocol_version).toBe('0.2.0');
      expect(fed.node_name).toBe(NODE_NAME);
      expect(fed.node_id).toBe(NODE_ID);
      expect(Array.isArray(fed.peers)).toBe(true);
    });

    it('federation response includes gossip and max_hops', async () => {
      const fed = await client.getFederation();
      expect(fed.gossip).toBe(true);
      expect(fed.max_hops).toBe(3);
    });

    it('registerAsPeer() registers and returns 201', async () => {
      const result = await client.registerAsPeer({
        url: 'https://peer-node.example.com',
        name: 'peer-node',
        node_id: 'did:web:peer-node.example.com',
      });
      expect(result.success).toBe(true);
      expect(result.peer).toBeDefined();
      expect(result.peer?.url).toBe('https://peer-node.example.com');
      expect(result.peer?.name).toBe('peer-node');
      expect(result.peers).toBeDefined();
      expect(Array.isArray(result.peers)).toBe(true);
    });

    it('registered peer appears in getFederation()', async () => {
      const fed = await client.getFederation();
      const peerUrls = fed.peers.map((p) => p.url);
      expect(peerUrls).toContain('https://peer-node.example.com');
    });
  });

  // ── Validation ───────────────────────────────────────────────

  describe('Validation', () => {
    it('validate(valid JSON) returns { valid: true }', async () => {
      const result = await client.validate(JSON.stringify({ test: true }));
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validate(invalid JSON) returns { valid: false, errors }', async () => {
      const result = await client.validate('not valid json {{{');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ── Generic Publishing ───────────────────────────────────────

  describe('Generic Publishing', () => {
    it('publish() via /api/v1/publish creates resource', async () => {
      const skill = makeSkill('generic-published');
      const result = await authedClient.publish(skill);
      expect(result.success).toBe(true);

      // Verify it appears in list
      const listed = await client.listSkills({ search: 'generic-published' });
      expect(listed.data).toHaveLength(1);
      expect(listed.data[0].metadata.name).toBe('generic-published');
    });

    it('published agent appears in subsequent list queries', async () => {
      const agent = makeAgent('published-via-generic');
      await authedClient.publish(agent);

      const listed = await client.listAgents({ search: 'published-via-generic' });
      expect(listed.data).toHaveLength(1);
      expect(listed.data[0].metadata.name).toBe('published-via-generic');
    });

    it('published tool appears in subsequent list queries', async () => {
      const tool = makeTool('published-tool-generic', 'mcp');
      await authedClient.publish(tool);

      const listed = await client.listTools({ search: 'published-tool-generic' });
      expect(listed.data).toHaveLength(1);
    });
  });

  // ── Error Handling ───────────────────────────────────────────

  describe('Error handling', () => {
    it('non-existent resource returns 404', async () => {
      try {
        await client.getSkill('absolutely-does-not-exist');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DuadpError);
        expect((err as DuadpError).statusCode).toBe(404);
      }
    });

    it('DuadpError contains status code and message', async () => {
      try {
        await client.getAgent('no-such-agent');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DuadpError);
        const duadpErr = err as DuadpError;
        expect(duadpErr.statusCode).toBe(404);
        expect(duadpErr.message).toContain('404');
      }
    });

    it('publish without auth returns 401', async () => {
      try {
        await client.publish(makeSkill('no-auth'));
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DuadpError);
        expect((err as DuadpError).statusCode).toBe(401);
      }
    });

    it('delete without auth returns 401', async () => {
      try {
        await client.deleteSkill('web-search');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(DuadpError);
        expect((err as DuadpError).statusCode).toBe(401);
      }
    });
  });
});
