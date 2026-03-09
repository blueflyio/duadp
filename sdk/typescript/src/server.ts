import type { Request, Response, Router } from 'express';
import { createRequire } from 'node:module';
import type {
    AgentCard,
    DuadpManifest,
    FederationResponse,
    OssaAgent,
    OssaResource,
    OssaSkill,
    OssaTool,
    PaginatedResponse,
    Peer, PublishResponse,
    ValidationResult,
    WebFingerResponse
} from './types.js';

export interface DuadpNodeConfig {
  /** Human-readable node name */
  nodeName: string;
  /** Optional DID for this node (e.g., did:web:example.com) */
  nodeId?: string;
  /** Optional description */
  nodeDescription?: string;
  /** Base URL where this node is hosted */
  baseUrl: string;
  /** Contact info */
  contact?: string;
  /** Node identity for signature verification */
  identity?: { did?: string; public_key?: string };
  /** Supported OSSA versions */
  ossaVersions?: string[];
  /** Federation config */
  federation?: { gossip?: boolean; max_hops?: number };
}

export interface DuadpDataProvider {
  /** Return paginated skills. Called on GET /api/v1/skills */
  listSkills?(params: { search?: string; category?: string; tag?: string; trust_tier?: string; federated?: boolean; page: number; limit: number }): Promise<PaginatedResponse<OssaSkill>>;
  /** Get single skill by name. Called on GET /api/v1/skills/:name */
  getSkill?(name: string): Promise<OssaSkill | null>;
  /** Return paginated agents. Called on GET /api/v1/agents */
  listAgents?(params: { search?: string; category?: string; tag?: string; trust_tier?: string; federated?: boolean; page: number; limit: number }): Promise<PaginatedResponse<OssaAgent>>;
  /** Get single agent by name */
  getAgent?(name: string): Promise<OssaAgent | null>;
  /** Get a universally compatible Agent Card by GAID or UUID. Called on GET /api/v1/agents/:gaid/card */
  getAgentCard?(gaid: string): Promise<AgentCard | null>;
  /** Return paginated tools. Called on GET /api/v1/tools */
  listTools?(params: { search?: string; category?: string; tag?: string; protocol?: string; federated?: boolean; page: number; limit: number }): Promise<PaginatedResponse<OssaTool>>;
  /** Get single tool by name */
  getTool?(name: string): Promise<OssaTool | null>;
  /** Publish a resource. Called on POST /api/v1/publish or POST /api/v1/{type} */
  publishResource?(resource: OssaResource, token?: string): Promise<PublishResponse>;
  /** Update a resource. Called on PUT /api/v1/{type}/:name */
  updateResource?(kind: string, name: string, resource: OssaResource, token?: string): Promise<PublishResponse>;
  /** Delete a resource. Called on DELETE /api/v1/{type}/:name */
  deleteResource?(kind: string, name: string, token?: string): Promise<boolean>;
  /** Return federation peers. Called on GET /api/v1/federation */
  listPeers?(): Promise<Peer[]>;
  /** Handle incoming peer registration. Called on POST /api/v1/federation */
  addPeer?(url: string, name: string, nodeId?: string, hop?: number): Promise<{ success: boolean; peer?: Peer; peers?: Peer[] }>;
  /** Validate a manifest. Called on POST /api/v1/validate */
  validateManifest?(manifest: string): Promise<ValidationResult>;
  /** Resolve a GAID via WebFinger. Called on GET /.well-known/webfinger */
  resolveWebFinger?(resource: string): Promise<WebFingerResponse | null>;
}

/**
 * Mount DUADP protocol endpoints on an Express router.
 *
 * Usage:
 * ```ts
 * import express from 'express';
 * import { createDuadpRouter } from '@bluefly/duadp/server';
 *
 * const app = express();
 * app.use(createDuadpRouter(config, myProvider));
 * ```
 */
export function createDuadpRouter(config: DuadpNodeConfig, provider: DuadpDataProvider): Router {
  // Dynamic import to keep express as optional peer dep
  // Use createRequire for ESM/CJS compatibility
  const esmRequire = createRequire(import.meta.url);
  const { Router: ExpressRouter } = esmRequire('express') as typeof import('express');
  const router = ExpressRouter();

  const capabilities: string[] = [];
  if (provider.listSkills) capabilities.push('skills');
  if (provider.listAgents) capabilities.push('agents');
  if (provider.listTools) capabilities.push('tools');
  if (provider.listPeers) capabilities.push('federation');
  if (provider.validateManifest) capabilities.push('validation');
  if (provider.publishResource) capabilities.push('publishing');

  // Helper to extract bearer token
  const getToken = (req: Request): string | undefined => {
    const auth = req.headers.authorization;
    return auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  };

  // Helper to parse list params
  const parseListParams = (req: Request) => ({
    start: ((((req.query as any)).start as string) && new Date(((req.query as any)).start as string)) || undefined,
    search: ((req.query as any)).search as string | undefined,
    category: ((req.query as any)).category as string | undefined,
    tag: ((req.query as any)).tag as string | undefined,
    trust_tier: ((req.query as any)).trust_tier as string | undefined,
    federated: ((req.query as any)).federated === 'true',
    page: Math.max(1, parseInt(((req.query as any)).page as string) || 1),
    limit: Math.min(100, parseInt((((req.query as any)).limit as string) || '50', 10)),
  });

  // /.well-known/duadp.json
  router.get('/.well-known/duadp.json', (_req: Request, res: Response) => {
    const manifest: DuadpManifest = {
      protocol_version: '0.2.0',
      node_id: config.nodeId,
      node_name: config.nodeName,
      node_description: config.nodeDescription,
      contact: config.contact,
      endpoints: {
        ...(provider.listSkills ? { skills: `${config.baseUrl}/api/v1/skills` } : {}),
        ...(provider.listAgents ? { agents: `${config.baseUrl}/api/v1/agents` } : {}),
        ...(provider.listTools ? { tools: `${config.baseUrl}/api/v1/tools` } : {}),
        ...(provider.listPeers ? { federation: `${config.baseUrl}/api/v1/federation` } : {}),
        ...(provider.validateManifest ? { validate: `${config.baseUrl}/api/v1/validate` } : {}),
        ...(provider.publishResource ? { publish: `${config.baseUrl}/api/v1/publish` } : {}),
      },
      capabilities,
      identity: config.identity,
      ossa_versions: config.ossaVersions ?? ['v0.4', 'v0.5'],
      federation: config.federation,
    };
    res.json(manifest);
  });

  // WebFinger
  if (provider.resolveWebFinger) {
    router.get('/.well-known/webfinger', async (req: Request, res: Response) => {
      try {
        const resource = ((req.query as any)).resource as string;
        const includeGaid = (((req.query as any)).include_gaid as string) === 'true';
        if (!resource) { res.status(400).json({ error: 'Missing resource parameter' }); return; }
        const result = await provider.resolveWebFinger!(resource);
        if (!result) { res.status(404).json({ error: 'Resource not found' }); return; }
        res.type('application/jrd+json').json(result);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
  }

  // --- Skills ---
  if (provider.listSkills) {
    router.get('/api/v1/skills', async (req: Request, res: Response) => {
      try {
        const result = await provider.listSkills!(parseListParams(req));
        result.meta.node_name = config.nodeName;
        if (config.nodeId) result.meta.node_id = config.nodeId;
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
  }
  if (provider.getSkill) {
    router.get('/api/v1/skills/:name', async (req: Request, res: Response) => {
      try {
        const skill = await provider.getSkill!(req.params.name as string);
        if (!skill) { res.status(404).json({ error: 'Skill not found' }); return; }
        res.json(skill);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
  }

  // --- Agents ---
  if (provider.listAgents) {
    router.get('/api/v1/agents', async (req: Request, res: Response) => {
      try {
        const result = await provider.listAgents!(parseListParams(req));
        result.meta.node_name = config.nodeName;
        if (config.nodeId) result.meta.node_id = config.nodeId;
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
  }
  if (provider.getAgent) {
    router.get('/api/v1/agents/:name', async (req: Request, res: Response) => {
      try {
        const agent = await provider.getAgent!(req.params.name as string);
        if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
        res.json(agent);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
  }
  if (provider.getAgentCard) {
    router.get('/api/v1/agents/:gaid/card', async (req: Request, res: Response) => {
      try {
        const card = await provider.getAgentCard!(req.params.gaid as string);
        if (!card) { res.status(404).json({ error: 'Agent Card not found' }); return; }
        res.type('application/agent-card+json').json(card);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
  }

  // --- Tools ---
  if (provider.listTools) {
    router.get('/api/v1/tools', async (req: Request, res: Response) => {
      try {
        const params = {
          ...parseListParams(req),
          protocol: ((req.query as any)).protocol as string | undefined,
        };
        const result = await provider.listTools!(params);
        result.meta.node_name = config.nodeName;
        if (config.nodeId) result.meta.node_id = config.nodeId;
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
  }
  if (provider.getTool) {
    router.get('/api/v1/tools/:name', async (req: Request, res: Response) => {
      try {
        const tool = await provider.getTool!(req.params.name as string);
        if (!tool) { res.status(404).json({ error: 'Tool not found' }); return; }
        res.json(tool);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
  }

  // --- Publishing ---
  if (provider.publishResource) {
    // Generic publish
    router.post('/api/v1/publish', async (req: Request, res: Response) => {
      try {
        const token = getToken(req);
        if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }
        const result = await provider.publishResource!(req.body, token);
        res.status(result.success ? 201 : 400).json(result);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    // Type-specific publish
    for (const kind of ['skills', 'agents', 'tools']) {
      router.post(`/api/v1/${kind}`, async (req: Request, res: Response) => {
        try {
          const token = getToken(req);
          if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }
          const result = await provider.publishResource!(req.body, token);
          res.status(result.success ? 201 : 400).json(result);
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });
    }
  }

  // Update
  if (provider.updateResource) {
    for (const kind of ['skills', 'agents', 'tools']) {
      router.put(`/api/v1/${kind}/:name`, async (req: Request, res: Response) => {
        try {
          const token = getToken(req);
          if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }
          const result = await provider.updateResource!(kind, req.params.name as string, req.body, token);
          res.json(result);
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });
    }
  }

  // Delete
  if (provider.deleteResource) {
    for (const kind of ['skills', 'agents', 'tools']) {
      router.delete(`/api/v1/${kind}/:name`, async (req: Request, res: Response) => {
        try {
          const token = getToken(req);
          if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }
          const deleted = await provider.deleteResource!(kind, req.params.name as string, token);
          if (!deleted) { res.status(404).json({ error: 'Resource not found' }); return; }
          res.status(204).end();
        } catch (err) {
          res.status(500).json({ error: String(err) });
        }
      });
    }
  }

  // --- Validation ---
  if (provider.validateManifest) {
    router.post('/api/v1/validate', async (req: Request, res: Response) => {
      try {
        const { manifest } = req.body ?? {};
        if (!manifest) {
          res.status(400).json({ valid: false, errors: ['Missing manifest field'] });
          return;
        }
        const result = await provider.validateManifest!(manifest);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
  }

  // --- Federation ---
  if (provider.listPeers) {
    router.get('/api/v1/federation', async (_req: Request, res: Response) => {
      try {
        const peers = await provider.listPeers!();
        const response: FederationResponse = {
          protocol_version: '0.2.0',
          node_id: config.nodeId,
          node_name: config.nodeName,
          gossip: config.federation?.gossip,
          max_hops: config.federation?.max_hops,
          peers,
        };
        res.json(response);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
  }

  if (provider.addPeer) {
    router.post('/api/v1/federation', async (req: Request, res: Response) => {
      try {
        const { url, name, node_id, hop } = req.body ?? {};
        if (!url || !name) {
          res.status(400).json({ error: 'Missing required fields: url, name' });
          return;
        }
        const result = await provider.addPeer!(url, name, node_id, hop ?? 0);
        res.status(result.success ? 201 : 400).json(result);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
  }

  return router;
}
