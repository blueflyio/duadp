import type {
    OssaAgent,
    OssaResource,
    OssaSkill,
    OssaTool,
    PaginatedResponse,
    Peer,
    PublishResponse,
    ValidationResult,
    WebFingerResponse,
} from '@bluefly/duadp';
import type { DuadpDataProvider } from '@bluefly/duadp/server';
import type Database from 'better-sqlite3';

type ExtendedDuadpDataProvider = DuadpDataProvider & {
  getAgentCard?: (gaid: string) => Promise<Record<string, unknown> | null>;
};

// Map plural route names to singular Kind values
const PLURAL_TO_KIND: Record<string, string> = {
  skills: 'Skill',
  agents: 'Agent',
  tools: 'Tool',
};

function kindFromPlural(plural: string): string {
  return PLURAL_TO_KIND[plural] ?? plural;
}

function auditLog(
  db: Database.Database,
  eventType: string,
  gaid?: string,
  actor?: string,
  detail?: Record<string, unknown>,
) {
  db.prepare(
    'INSERT INTO audit_log (event_type, gaid, actor, detail) VALUES (?, ?, ?, ?)',
  ).run(eventType, gaid ?? null, actor ?? 'system', detail ? JSON.stringify(detail) : null);
}

export function createSqliteProvider(db: Database.Database): ExtendedDuadpDataProvider {
  // Generic list helper
  function listResources<T extends OssaResource>(
    kind: string,
    params: {
      search?: string;
      category?: string;
      tag?: string;
      trust_tier?: string;
      protocol?: string;
      federated?: boolean;
      page: number;
      limit: number;
    },
  ): PaginatedResponse<T> {
    const conditions: string[] = ['kind = ?'];
    const binds: unknown[] = [kind];

    if (params.search) {
      conditions.push("(name LIKE ? OR json_extract(data, '$.metadata.description') LIKE ?)");
      const pattern = `%${params.search}%`;
      binds.push(pattern, pattern);
    }

    if (params.category) {
      conditions.push("json_extract(data, '$.metadata.category') = ?");
      binds.push(params.category);
    }

    if (params.tag) {
      conditions.push("json_extract(data, '$.metadata.tags') LIKE ?");
      binds.push(`%"${params.tag}"%`);
    }

    if (params.trust_tier) {
      conditions.push("json_extract(data, '$.metadata.trust_tier') = ?");
      binds.push(params.trust_tier);
    }

    if (params.protocol && kind === 'Tool') {
      conditions.push(
        "(json_extract(data, '$.spec.protocol') = ? OR json_extract(data, '$.identity.operational.protocol') = ?)",
      );
      binds.push(params.protocol, params.protocol);
    }

    const where = conditions.join(' AND ');
    const countRow = db
      .prepare(`SELECT COUNT(*) as cnt FROM resources WHERE ${where}`)
      .get(...binds) as { cnt: number };
    const total = countRow.cnt;

    const offset = (params.page - 1) * params.limit;
    const rows = db
      .prepare(`SELECT data FROM resources WHERE ${where} ORDER BY id ASC LIMIT ? OFFSET ?`)
      .all(...binds, params.limit, offset) as { data: string }[];

    return {
      data: rows.map((r) => JSON.parse(r.data) as T),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        node_name: '', // filled in by the router
      },
    };
  }

  function getResource<T extends OssaResource>(kind: string, name: string): T | null {
    const row = db
      .prepare('SELECT data FROM resources WHERE kind = ? AND name = ?')
      .get(kind, name) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as T) : null;
  }

  return {
    async listSkills(params) {
      return listResources<OssaSkill>('Skill', params);
    },

    async getSkill(name) {
      return getResource<OssaSkill>('Skill', name);
    },

    async listAgents(params) {
      return listResources<OssaAgent>('Agent', params);
    },

    async getAgent(name) {
      return getResource<OssaAgent>('Agent', name);
    },

    async getAgentCard(gaid: string) {
      // Find the agent by gaid (in identity), uuid, or name
      const row = db.prepare(
        "SELECT data FROM resources WHERE kind = 'Agent' AND (json_extract(data, '$.identity.gaid') = ? OR json_extract(data, '$.identity.uuid') = ? OR name = ?)"
      ).get(gaid, gaid, gaid) as { data: string } | undefined;

      if (!row) return null;

      const agent = JSON.parse(row.data) as OssaAgent;

      // Transform into a universally compatible Agent Card
      return {
        uuid: (agent.identity as any)?.uuid || agent.metadata.name,
        gaid: agent.identity?.gaid || `agent://${agent.metadata.name}`,
        name: agent.metadata.name,
        description: agent.metadata.description,
        trust_tier: agent.metadata.trust_tier || 'experimental',
        capabilities: (agent.spec as any)?.capabilities || [],
        publisher: {
          name: agent.provenance?.publisher?.name,
          url: agent.provenance?.publisher?.url,
        },
        signature: agent.signature?.value,
        endpoints: {
          a2a: (agent.identity?.operational as any)?.a2a,
          mcp: (agent.identity?.operational as any)?.mcp || agent.identity?.operational?.endpoint
        }
      };
    },


    async listTools(params) {
      return listResources<OssaTool>('Tool', params);
    },

    async getTool(name) {
      return getResource<OssaTool>('Tool', name);
    },

    async publishResource(resource: OssaResource, token?: string): Promise<PublishResponse> {
      if (!resource.apiVersion || !resource.kind || !resource.metadata?.name) {
        return { success: false };
      }

      const kind = resource.kind;
      const name = resource.metadata.name;
      const data = JSON.stringify(resource);

      try {
        db.prepare(
          'INSERT INTO resources (kind, name, data) VALUES (?, ?, ?)',
        ).run(kind, name, data);

        const gaid = resource.identity?.gaid ?? `agent://${name}`;
        auditLog(db, 'resource.created', gaid, token ? `token:${token.slice(0, 8)}...` : 'system', {
          kind,
          name,
        });

        return { success: true, resource };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        // Duplicate name
        if (message.includes('UNIQUE constraint')) {
          return { success: false };
        }
        throw err;
      }
    },

    async updateResource(
      kindPlural: string,
      name: string,
      resource: OssaResource,
      token?: string,
    ): Promise<PublishResponse> {
      const kind = kindFromPlural(kindPlural);
      const data = JSON.stringify(resource);

      const result = db
        .prepare(
          "UPDATE resources SET data = ?, updated_at = datetime('now') WHERE kind = ? AND name = ?",
        )
        .run(data, kind, name);

      if (result.changes === 0) {
        return { success: false };
      }

      const gaid = resource.identity?.gaid ?? `agent://${name}`;
      auditLog(db, 'resource.updated', gaid, token ? `token:${token.slice(0, 8)}...` : 'system', {
        kind,
        name,
      });

      return { success: true, resource };
    },

    async deleteResource(kindPlural: string, name: string, token?: string): Promise<boolean> {
      const kind = kindFromPlural(kindPlural);

      const result = db
        .prepare('DELETE FROM resources WHERE kind = ? AND name = ?')
        .run(kind, name);

      if (result.changes === 0) {
        return false;
      }

      auditLog(db, 'resource.deleted', `agent://${name}`, token ? `token:${token.slice(0, 8)}...` : 'system', {
        kind,
        name,
      });

      return true;
    },

    async listPeers(): Promise<Peer[]> {
      const rows = db.prepare('SELECT * FROM peers ORDER BY id ASC').all() as Array<{
        url: string;
        name: string;
        node_id: string | null;
        status: string;
        last_synced: string | null;
      }>;

      return rows.map((r) => ({
        url: r.url,
        name: r.name,
        node_id: r.node_id ?? undefined,
        status: (r.status ?? 'healthy') as 'healthy' | 'degraded' | 'unreachable',
        last_synced: r.last_synced,
      }));
    },

    async addPeer(
      url: string,
      name: string,
      nodeId?: string,
      hop?: number,
    ): Promise<{ success: boolean; peer?: Peer; peers?: Peer[] }> {
      try {
        db.prepare(
          'INSERT INTO peers (url, name, node_id, hop) VALUES (?, ?, ?, ?)',
        ).run(url, name, nodeId ?? null, hop ?? 0);

        auditLog(db, 'peer.added', undefined, 'system', { url, name, nodeId });

        const peer: Peer = {
          url,
          name,
          node_id: nodeId,
          status: 'healthy',
          last_synced: null,
        };

        // Return all peers for gossip
        const allPeers = await this.listPeers!();
        return { success: true, peer, peers: allPeers };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('UNIQUE constraint')) {
          return { success: false };
        }
        throw err;
      }
    },

    async validateManifest(manifest: string): Promise<ValidationResult> {
      const errors: string[] = [];
      const warnings: string[] = [];

      let parsed: unknown;
      try {
        parsed = typeof manifest === 'string' ? JSON.parse(manifest) : manifest;
      } catch {
        return { valid: false, errors: ['Invalid JSON'], warnings: [] };
      }

      if (!parsed || typeof parsed !== 'object') {
        return { valid: false, errors: ['Manifest must be a JSON object'], warnings: [] };
      }

      const m = parsed as Record<string, unknown>;

      if (!m.apiVersion || typeof m.apiVersion !== 'string') {
        errors.push('apiVersion is required and must be a string');
      }

      if (!m.kind || typeof m.kind !== 'string') {
        errors.push('kind is required and must be a string');
      }

      if (!m.metadata || typeof m.metadata !== 'object') {
        errors.push('metadata is required and must be an object');
      } else {
        const meta = m.metadata as Record<string, unknown>;
        if (!meta.name || typeof meta.name !== 'string') {
          errors.push('metadata.name is required and must be a string');
        }
      }

      if (!m.spec) {
        warnings.push('spec is recommended');
      }

      return { valid: errors.length === 0, errors, warnings };
    },

    async resolveWebFinger(resource: string): Promise<WebFingerResponse | null> {
      // Try to find by GAID or name
      // resource could be "agent://name" or "acct:name@domain"
      let name: string | null = null;

      if (resource.startsWith('agent://')) {
        name = resource.replace('agent://', '').split('/')[0];
      } else if (resource.startsWith('acct:')) {
        name = resource.replace('acct:', '').split('@')[0];
      } else {
        name = resource;
      }

      if (!name) return null;

      const row = db
        .prepare('SELECT data FROM resources WHERE name = ?')
        .get(name) as { data: string } | undefined;

      if (!row) return null;

      const res = JSON.parse(row.data) as OssaResource;

      return {
        subject: resource,
        links: [
          {
            rel: 'self',
            type: 'application/json',
            href: `agent://${res.metadata.name}`,
          },
          {
            rel: 'describedby',
            type: 'application/json',
            href: `/api/v1/${res.kind.toLowerCase()}s/${res.metadata.name}`,
          },
        ],
        properties: {
          'urn:ossa:kind': res.kind,
          'urn:ossa:version': res.metadata.version ?? '0.1.0',
        },
      };
    },
  };
}
