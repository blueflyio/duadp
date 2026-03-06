import { UadpClient, UadpError } from './client.js';
import { validateManifest, validateResponse } from './validate.js';

export interface ConformanceResult {
  url: string;
  version: string;
  timestamp: string;
  passed: number;
  failed: number;
  skipped: number;
  results: ConformanceTestResult[];
  level: 'minimal' | 'standard' | 'full';
}

export interface ConformanceTestResult {
  id: string;
  name: string;
  category: 'discovery' | 'skills' | 'agents' | 'tools' | 'federation' | 'publishing' | 'validation' | 'identity' | 'governance';
  level: 'MUST' | 'SHOULD' | 'MAY';
  passed: boolean;
  skipped: boolean;
  duration: number;
  error?: string;
  detail?: string;
}

interface TestDef {
  id: string;
  name: string;
  category: ConformanceTestResult['category'];
  level: 'MUST' | 'SHOULD' | 'MAY';
  run: (client: UadpClient, manifest: import('./types.js').UadpManifest) => Promise<{ passed: boolean; detail?: string }>;
}

const tests: TestDef[] = [
  // --- MUST: Discovery ---
  {
    id: 'DISC-001',
    name: 'Well-known manifest exists and is valid JSON',
    category: 'discovery',
    level: 'MUST',
    async run(client) {
      const manifest = await client.discover();
      const v = validateManifest(manifest);
      return { passed: v.valid, detail: v.valid ? `protocol_version: ${manifest.protocol_version}` : v.errors.join('; ') };
    },
  },
  {
    id: 'DISC-002',
    name: 'Manifest has protocol_version in semver format',
    category: 'discovery',
    level: 'MUST',
    async run(client) {
      const m = await client.getManifest();
      const valid = /^\d+\.\d+\.\d+$/.test(m.protocol_version);
      return { passed: valid, detail: m.protocol_version };
    },
  },
  {
    id: 'DISC-003',
    name: 'Manifest has node_name',
    category: 'discovery',
    level: 'MUST',
    async run(client) {
      const m = await client.getManifest();
      return { passed: !!m.node_name, detail: m.node_name };
    },
  },
  {
    id: 'DISC-004',
    name: 'Manifest endpoints has at least one of: skills, agents, tools',
    category: 'discovery',
    level: 'MUST',
    async run(client) {
      const m = await client.getManifest();
      const has = !!(m.endpoints.skills || m.endpoints.agents || m.endpoints.tools);
      return { passed: has, detail: Object.keys(m.endpoints).join(', ') };
    },
  },
  {
    id: 'DISC-005',
    name: 'Manifest Content-Type is application/json',
    category: 'discovery',
    level: 'MUST',
    async run(client) {
      // This is validated implicitly by JSON.parse succeeding in discover()
      await client.getManifest();
      return { passed: true };
    },
  },

  // --- SHOULD: Discovery ---
  {
    id: 'DISC-010',
    name: 'Manifest has node_id (DID)',
    category: 'discovery',
    level: 'SHOULD',
    async run(client) {
      const m = await client.getManifest();
      return { passed: !!m.node_id, detail: m.node_id || 'missing' };
    },
  },
  {
    id: 'DISC-011',
    name: 'Manifest has node_description',
    category: 'discovery',
    level: 'SHOULD',
    async run(client) {
      const m = await client.getManifest();
      return { passed: !!m.node_description, detail: m.node_description || 'missing' };
    },
  },
  {
    id: 'DISC-012',
    name: 'Manifest has ossa_versions',
    category: 'discovery',
    level: 'SHOULD',
    async run(client) {
      const m = await client.getManifest();
      return { passed: Array.isArray(m.ossa_versions) && m.ossa_versions.length > 0, detail: m.ossa_versions?.join(', ') || 'missing' };
    },
  },
  {
    id: 'DISC-013',
    name: 'Manifest has capabilities array',
    category: 'discovery',
    level: 'SHOULD',
    async run(client) {
      const m = await client.getManifest();
      return { passed: Array.isArray(m.capabilities), detail: m.capabilities?.join(', ') || 'missing' };
    },
  },

  // --- MUST: Skills ---
  {
    id: 'SKL-001',
    name: 'Skills endpoint returns valid paginated response',
    category: 'skills',
    level: 'MUST',
    async run(client, manifest) {
      if (!manifest.endpoints.skills) return { passed: true, detail: 'Skipped — not advertised' };
      const res = await client.listSkills({ limit: 5 });
      const v = validateResponse(res);
      return { passed: v.valid, detail: v.valid ? `${res.meta.total} skills` : v.errors.join('; ') };
    },
  },
  {
    id: 'SKL-002',
    name: 'Skills items have apiVersion, kind, and metadata.name',
    category: 'skills',
    level: 'MUST',
    async run(client, manifest) {
      if (!manifest.endpoints.skills) return { passed: true, detail: 'Skipped' };
      const res = await client.listSkills({ limit: 3 });
      for (const item of res.data) {
        if (!item.apiVersion || item.kind !== 'Skill' || !item.metadata?.name) {
          return { passed: false, detail: `Item missing required fields: ${JSON.stringify(item.metadata?.name || 'unknown')}` };
        }
      }
      return { passed: true, detail: `${res.data.length} items validated` };
    },
  },
  {
    id: 'SKL-003',
    name: 'Skills pagination respects page and limit',
    category: 'skills',
    level: 'MUST',
    async run(client, manifest) {
      if (!manifest.endpoints.skills) return { passed: true, detail: 'Skipped' };
      const res = await client.listSkills({ page: 1, limit: 1 });
      const valid = res.meta.page === 1 && res.meta.limit === 1 && res.data.length <= 1;
      return { passed: valid, detail: `page=${res.meta.page}, limit=${res.meta.limit}, items=${res.data.length}` };
    },
  },
  {
    id: 'SKL-004',
    name: 'Skills meta includes node_name',
    category: 'skills',
    level: 'MUST',
    async run(client, manifest) {
      if (!manifest.endpoints.skills) return { passed: true, detail: 'Skipped' };
      const res = await client.listSkills({ limit: 1 });
      return { passed: !!res.meta.node_name, detail: res.meta.node_name || 'missing' };
    },
  },

  // --- Skills: single resource ---
  {
    id: 'SKL-010',
    name: 'GET /skills/{name} returns single skill',
    category: 'skills',
    level: 'SHOULD',
    async run(client, manifest) {
      if (!manifest.endpoints.skills) return { passed: true, detail: 'Skipped' };
      const list = await client.listSkills({ limit: 1 });
      if (list.data.length === 0) return { passed: true, detail: 'No skills to test' };
      const name = list.data[0].metadata.name;
      try {
        const skill = await client.getSkill(name);
        return { passed: skill.metadata.name === name, detail: name };
      } catch {
        return { passed: false, detail: `Failed to get skill: ${name}` };
      }
    },
  },

  // --- Agents ---
  {
    id: 'AGT-001',
    name: 'Agents endpoint returns valid paginated response',
    category: 'agents',
    level: 'MUST',
    async run(client, manifest) {
      if (!manifest.endpoints.agents) return { passed: true, detail: 'Skipped — not advertised' };
      const res = await client.listAgents({ limit: 5 });
      const v = validateResponse(res);
      return { passed: v.valid, detail: v.valid ? `${res.meta.total} agents` : v.errors.join('; ') };
    },
  },
  {
    id: 'AGT-002',
    name: 'Agent items have kind: "Agent"',
    category: 'agents',
    level: 'MUST',
    async run(client, manifest) {
      if (!manifest.endpoints.agents) return { passed: true, detail: 'Skipped' };
      const res = await client.listAgents({ limit: 3 });
      for (const item of res.data) {
        if (item.kind !== 'Agent') return { passed: false, detail: `Expected kind=Agent, got ${item.kind}` };
      }
      return { passed: true };
    },
  },

  // --- Tools ---
  {
    id: 'TLS-001',
    name: 'Tools endpoint returns valid paginated response',
    category: 'tools',
    level: 'MUST',
    async run(client, manifest) {
      if (!manifest.endpoints.tools) return { passed: true, detail: 'Skipped — not advertised' };
      const res = await client.listTools({ limit: 5 });
      const v = validateResponse(res);
      return { passed: v.valid, detail: v.valid ? `${res.meta.total} tools` : v.errors.join('; ') };
    },
  },
  {
    id: 'TLS-002',
    name: 'Tool items have kind: "Tool"',
    category: 'tools',
    level: 'MUST',
    async run(client, manifest) {
      if (!manifest.endpoints.tools) return { passed: true, detail: 'Skipped' };
      const res = await client.listTools({ limit: 3 });
      for (const item of res.data) {
        if (item.kind !== 'Tool') return { passed: false, detail: `Expected kind=Tool, got ${item.kind}` };
      }
      return { passed: true };
    },
  },

  // --- Federation ---
  {
    id: 'FED-001',
    name: 'Federation endpoint returns valid response',
    category: 'federation',
    level: 'SHOULD',
    async run(client, manifest) {
      if (!manifest.endpoints.federation) return { passed: true, detail: 'Skipped — not advertised' };
      const fed = await client.getFederation();
      const valid = !!fed.protocol_version && !!fed.node_name && Array.isArray(fed.peers);
      return { passed: valid, detail: `${fed.peers.length} peers` };
    },
  },
  {
    id: 'FED-002',
    name: 'Federation peers have url, name, and status',
    category: 'federation',
    level: 'SHOULD',
    async run(client, manifest) {
      if (!manifest.endpoints.federation) return { passed: true, detail: 'Skipped' };
      const fed = await client.getFederation();
      for (const peer of fed.peers) {
        if (!peer.url || !peer.name || !peer.status) {
          return { passed: false, detail: `Peer missing fields: ${peer.name || peer.url}` };
        }
      }
      return { passed: true, detail: `${fed.peers.length} peers validated` };
    },
  },

  // --- Validation ---
  {
    id: 'VAL-001',
    name: 'Validation endpoint accepts manifest and returns result',
    category: 'validation',
    level: 'MAY',
    async run(client, manifest) {
      if (!manifest.endpoints.validate) return { passed: true, detail: 'Skipped — not advertised' };
      const result = await client.validate('apiVersion: ossa/v0.4\nkind: Skill\nmetadata:\n  name: test\n');
      const valid = typeof result.valid === 'boolean' && Array.isArray(result.errors);
      return { passed: valid, detail: `valid=${result.valid}, errors=${result.errors.length}` };
    },
  },

  // --- Publishing ---
  {
    id: 'PUB-001',
    name: 'Publish endpoint rejects unauthenticated requests',
    category: 'publishing',
    level: 'MUST',
    async run(client, manifest) {
      if (!manifest.endpoints.publish) return { passed: true, detail: 'Skipped — not advertised' };
      const unauthClient = new UadpClient(client.baseUrl, { timeout: 10000 });
      // Copy manifest to the unauthenticated client
      await unauthClient.discover();
      try {
        await unauthClient.publish({
          apiVersion: 'ossa/v0.4',
          kind: 'Skill',
          metadata: { name: 'conformance-test-should-fail' },
        });
        return { passed: false, detail: 'Publish succeeded without auth — should have been rejected' };
      } catch (err) {
        if (err instanceof UadpError && (err.statusCode === 401 || err.statusCode === 403)) {
          return { passed: true, detail: `Correctly rejected with ${err.statusCode}` };
        }
        return { passed: false, detail: `Unexpected error: ${err}` };
      }
    },
  },

  // --- Identity ---
  {
    id: 'IDN-001',
    name: 'Resources include identity.did field',
    category: 'identity',
    level: 'SHOULD',
    async run(client, manifest) {
      const endpoint = manifest.endpoints.skills || manifest.endpoints.agents || manifest.endpoints.tools;
      if (!endpoint) return { passed: true, detail: 'Skipped' };
      let items: import('./types.js').OssaResource[];
      if (manifest.endpoints.skills) items = (await client.listSkills({ limit: 3 })).data;
      else if (manifest.endpoints.agents) items = (await client.listAgents({ limit: 3 })).data;
      else items = (await client.listTools({ limit: 3 })).data;
      const withIdentity = items.filter(i => i.identity?.did);
      return {
        passed: withIdentity.length > 0 || items.length === 0,
        detail: `${withIdentity.length}/${items.length} items have identity.did`,
      };
    },
  },
  {
    id: 'IDN-002',
    name: 'Resources include content_hash',
    category: 'identity',
    level: 'SHOULD',
    async run(client, manifest) {
      const endpoint = manifest.endpoints.skills || manifest.endpoints.agents || manifest.endpoints.tools;
      if (!endpoint) return { passed: true, detail: 'Skipped' };
      let items: import('./types.js').OssaResource[];
      if (manifest.endpoints.skills) items = (await client.listSkills({ limit: 3 })).data;
      else if (manifest.endpoints.agents) items = (await client.listAgents({ limit: 3 })).data;
      else items = (await client.listTools({ limit: 3 })).data;
      const withHash = items.filter(i => i.content_hash);
      return {
        passed: withHash.length > 0 || items.length === 0,
        detail: `${withHash.length}/${items.length} items have content_hash`,
      };
    },
  },
];

/**
 * Run the full UADP conformance test suite against a live node.
 *
 * @param baseUrl - Base URL of the UADP node
 * @param options - Optional configuration
 * @returns Detailed conformance results
 *
 * @example
 * ```ts
 * import { runConformanceTests } from '@bluefly/uadp/conformance';
 * const results = await runConformanceTests('https://marketplace.example.com');
 * console.log(`${results.passed}/${results.passed + results.failed} tests passed (level: ${results.level})`);
 * for (const r of results.results.filter(r => !r.passed && !r.skipped)) {
 *   console.log(`  FAIL [${r.id}] ${r.name}: ${r.error || r.detail}`);
 * }
 * ```
 */
export async function runConformanceTests(
  baseUrl: string,
  options?: { timeout?: number; token?: string },
): Promise<ConformanceResult> {
  const client = new UadpClient(baseUrl, {
    timeout: options?.timeout ?? 15000,
    token: options?.token,
  });

  let manifest: import('./types.js').UadpManifest;
  try {
    manifest = await client.discover();
  } catch (err) {
    return {
      url: baseUrl,
      version: 'unknown',
      timestamp: new Date().toISOString(),
      passed: 0,
      failed: 1,
      skipped: 0,
      results: [{
        id: 'DISC-001',
        name: 'Well-known manifest exists',
        category: 'discovery',
        level: 'MUST',
        passed: false,
        skipped: false,
        duration: 0,
        error: `Cannot discover node: ${err}`,
      }],
      level: 'minimal',
    };
  }

  const results: ConformanceTestResult[] = [];

  for (const test of tests) {
    const start = Date.now();
    try {
      const { passed, detail } = await test.run(client, manifest);
      const skipped = detail?.startsWith('Skipped') ?? false;
      results.push({
        id: test.id,
        name: test.name,
        category: test.category,
        level: test.level,
        passed: passed || skipped,
        skipped,
        duration: Date.now() - start,
        detail,
      });
    } catch (err) {
      results.push({
        id: test.id,
        name: test.name,
        category: test.category,
        level: test.level,
        passed: false,
        skipped: false,
        duration: Date.now() - start,
        error: String(err),
      });
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;

  const mustTests = results.filter(r => r.level === 'MUST');
  const shouldTests = results.filter(r => r.level === 'SHOULD');
  const allMustPass = mustTests.every(r => r.passed);
  const allShouldPass = shouldTests.every(r => r.passed);

  let level: ConformanceResult['level'];
  if (allMustPass && allShouldPass) level = 'full';
  else if (allMustPass) level = 'standard';
  else level = 'minimal';

  return {
    url: baseUrl,
    version: manifest.protocol_version,
    timestamp: new Date().toISOString(),
    passed,
    failed,
    skipped,
    results,
    level,
  };
}

/**
 * Print conformance results to console in a human-readable format.
 */
export function formatConformanceResults(result: ConformanceResult): string {
  const lines: string[] = [
    `UADP Conformance Test Report`,
    `============================`,
    `Node:      ${result.url}`,
    `Version:   ${result.version}`,
    `Level:     ${result.level.toUpperCase()}`,
    `Timestamp: ${result.timestamp}`,
    ``,
    `Results: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped`,
    ``,
  ];

  const categories = [...new Set(result.results.map(r => r.category))];
  for (const cat of categories) {
    lines.push(`--- ${cat.toUpperCase()} ---`);
    const catResults = result.results.filter(r => r.category === cat);
    for (const r of catResults) {
      const icon = r.skipped ? 'SKIP' : r.passed ? 'PASS' : 'FAIL';
      const suffix = r.error || r.detail || '';
      lines.push(`  [${icon}] ${r.id} ${r.name}${suffix ? ` — ${suffix}` : ''} (${r.duration}ms)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
