/**
 * Reads platform-agent OSSA manifests and generates a DUADP-compatible seed JSON.
 * Run: npx tsx scripts/generate-platform-agents-seed.ts
 * Output: src/platform-agents-seed.json
 */
import { readFileSync, readdirSync, writeFileSync, statSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AGENTS_DIR = resolve(
  process.env.PLATFORM_AGENTS_DIR ||
    join(__dirname, '../../.agents/@ossa'),
);
const OUTPUT = resolve(__dirname, '../src/platform-agents-seed.json');

interface OssaManifest {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    version?: string;
    namespace?: string;
    description?: string;
    labels?: Record<string, string>;
    uuid?: string;
    machine_name?: string;
  };
  spec?: {
    capabilities?: Array<{ name: string; description?: string; category?: string }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface DuadpAgent {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    version: string;
    description: string;
    category: string;
    trust_tier: string;
    tags: string[];
    created: string;
    updated: string;
  };
  identity: {
    gaid: string;
    did: string;
  };
  spec: {
    agent_type: string;
    capabilities: string[];
    namespace: string;
  };
  risk: {
    level: string;
    autonomy_level: string;
    data_sensitivity: string;
  };
}

function manifestToDuadpAgent(manifest: OssaManifest): DuadpAgent | null {
  const meta = manifest.metadata;
  if (!meta?.name) return null;

  const labels = meta.labels ?? {};
  const capabilities = (manifest.spec?.capabilities ?? []).map(
    (c) => c.name ?? String(c),
  );
  const description =
    typeof meta.description === 'string'
      ? meta.description.trim().split('\n')[0].trim()
      : `${meta.name} agent`;

  const autonomyLevel = labels.autonomy ?? 'supervised';
  const riskMap: Record<string, string> = {
    orchestrator: 'moderate',
    worker: 'low',
    specialist: 'low',
  };

  return {
    apiVersion: 'ossa/v0.5',
    kind: 'Agent',
    metadata: {
      name: meta.name,
      version: meta.version ?? '1.0.0',
      description,
      category: labels.domain ?? labels['use-case'] ?? 'platform',
      trust_tier: 'official',
      tags: [
        labels.domain,
        labels.tier,
        labels['use-case'],
        'platform-agent',
      ].filter(Boolean) as string[],
      created: '2026-01-01T00:00:00Z',
      updated: '2026-03-06T00:00:00Z',
    },
    identity: {
      gaid: `agent://agents/${meta.name}`,
      did: `did:web:example.duadp.dev:agents:${meta.name}`,
    },
    spec: {
      agent_type: labels.tier ?? 'worker',
      capabilities,
      namespace: meta.namespace ?? 'blueflyio',
    },
    risk: {
      level: riskMap[labels.tier ?? 'worker'] ?? 'low',
      autonomy_level: autonomyLevel === 'fully_autonomous' ? 'autonomous' : autonomyLevel,
      data_sensitivity: 'internal',
    },
  };
}

// Scan directories
const entries = readdirSync(AGENTS_DIR).filter((e) => {
  const full = join(AGENTS_DIR, e);
  return statSync(full).isDirectory() && !e.startsWith('.') && e !== 'node_modules';
});

const agents: DuadpAgent[] = [];

for (const dir of entries) {
  const manifestPath = join(AGENTS_DIR, dir, 'manifest.ossa.yaml');
  if (!existsSync(manifestPath)) continue;

  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    // Replace env var placeholders so yaml parser doesn't choke
    const cleaned = raw.replace(/\$\{[^}]+\}/g, (match) => {
      const def = match.match(/:-(.+)\}/);
      return def ? def[1] : 'default';
    });
    const manifest = parse(cleaned) as OssaManifest;
    const agent = manifestToDuadpAgent(manifest);
    if (agent) agents.push(agent);
  } catch (err) {
    console.warn(`  ! Skipped ${dir}: ${(err as Error).message}`);
  }
}

writeFileSync(OUTPUT, JSON.stringify(agents, null, 2));
console.log(`Generated ${agents.length} platform agents → ${OUTPUT}`);
