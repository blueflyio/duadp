/**
 * ingest-handler.ts — POST /api/v1/ingest
 *
 * "Ingest Anything" endpoint.
 * Give it a GitHub URL → 30 seconds later it's on the mesh.
 *
 * Flow:
 *   1. Auto-detect adapter from repo contents (POWER.md → Kiro, SKILL.md → SkillsSh, else → GitRepo)
 *   2. Fetch + normalize via Phase 1 USIE adapters
 *   3. Validate schema
 *   4. Publish to local DUADP node (reuses publishResourceWithChecks)
 *   5. Fire-and-forget fan-out: brain (Qdrant), gkg, n8n webhook, a2a-stream
 *   6. Return { gaid, manifest, trust_tier, published: true, marketplace_url }
 */

import type { OssaSkill } from '@bluefly/duadp';
import {
  KiroPowersAdapter,
  SkillsShAdapter,
  GitRepoAdapter,
} from '@bluefly/duadp';

// ── Environment endpoints (all pre-existing services) ────────────────────────
// brain + gkg are TAILSCALE-ONLY (SOD: never public tunnel). The ref-node
// runs server-side on Oracle and can reach them via internal Tailscale.
const BRAIN_URL = process.env.BRAIN_URL || 'http://localhost:6333';           // Qdrant — oracle:6333
const GKG_URL = process.env.GKG_URL || '';                                    // mac:27495 — omit default; set via env
const N8N_WEBHOOK_URL = process.env.N8N_INGEST_WEBHOOK_URL || '';             // oracle:5678
const A2A_STREAM_URL = process.env.A2A_STREAM_URL || 'http://localhost:9005'; // a2a-stream oracle:9005
const MARKETPLACE_BASE = process.env.MARKETPLACE_URL || 'https://marketplace.blueflyagents.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || process.env.LITELLM_MASTER_KEY || '';

// ── Auto-detection ────────────────────────────────────────────────────────────

type AdapterHint = 'kiro' | 'skills-sh' | 'git-repo';

interface RepoProbResult {
  hasPowerMd: boolean;
  hasSkillMd: boolean;
  repoSlug: string;   // owner/repo
  branch: string;
}

/** Parse a GitHub URL into owner/repo */
function parseGitHubUrl(url: string): string | null {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  if (!match) return null;
  return match[1].replace(/\.git$/, '');
}

/** Probe the repo root for POWER.md and SKILL.md using GitHub API (HEAD requests for speed) */
async function probeRepo(repoSlug: string): Promise<RepoProbResult> {
  const headers: HeadersInit = GITHUB_TOKEN
    ? { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'bluefly-duadp/usie' }
    : { 'User-Agent': 'bluefly-duadp/usie' };

  // Get default branch
  const metaRes = await fetch(`https://api.github.com/repos/${repoSlug}`, { headers });
  const meta = metaRes.ok ? await metaRes.json() as { default_branch?: string } : {};
  const branch = meta.default_branch ?? 'main';

  // Check for manifest files in parallel (HEAD is cheap)
  const rawBase = `https://raw.githubusercontent.com/${repoSlug}/${branch}`;
  const [powerRes, skillRes] = await Promise.all([
    fetch(`${rawBase}/POWER.md`, { method: 'HEAD', headers }),
    fetch(`${rawBase}/SKILL.md`, { method: 'HEAD', headers }),
  ]);

  return {
    hasPowerMd: powerRes.ok,
    hasSkillMd: skillRes.ok,
    repoSlug,
    branch,
  };
}

function detectAdapter(probe: RepoProbResult): AdapterHint {
  if (probe.hasPowerMd) return 'kiro';
  if (probe.hasSkillMd) return 'skills-sh';
  return 'git-repo';
}

// ── Fan-out (fire-and-forget to all downstream services) ─────────────────────

async function fanOut(skill: OssaSkill): Promise<void> {
  const gaid = skill.identity?.gaid ?? skill.metadata.uri;
  const authHeader = INTERNAL_API_KEY ? { Authorization: `Bearer ${INTERNAL_API_KEY}` } : {};

  const tasks: Promise<unknown>[] = [];

  // 1. Brain / Qdrant vector index
  if (BRAIN_URL) {
    tasks.push(
      fetch(`${BRAIN_URL}/api/v1/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          gaid,
          kind: 'Skill',
          name: skill.metadata.name,
          description: skill.metadata.description,
          content: skill.spec ? (skill.spec as Record<string, unknown>).instruction_content : '',
          tags: skill.metadata.tags,
          trust_tier: skill.metadata.trust_tier,
        }),
      }).catch((err) => console.warn('[ingest] brain fan-out failed:', err.message)),
    );
  }

  // 2. Knowledge Graph
  if (GKG_URL) {
    tasks.push(
      fetch(`${GKG_URL}/api/workspace/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ resource: skill, kind: 'Skill' }),
      }).catch((err) => console.warn('[ingest] gkg fan-out failed:', err.message)),
    );
  }

  // 3. n8n webhook → Qdrant upsert + ntfy push + A2A event + optional GitLab issue
  if (N8N_WEBHOOK_URL) {
    tasks.push(
      fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'skill.ingested',
          gaid,
          name: skill.metadata.name,
          description: skill.metadata.description,
          trust_tier: skill.metadata.trust_tier,
          source_url: (skill.metadata.annotations as Record<string, unknown>)?.source_url,
          marketplace_url: `${MARKETPLACE_BASE}/skills/${encodeURIComponent(skill.metadata.name)}`,
          timestamp: new Date().toISOString(),
        }),
      }).catch((err) => console.warn('[ingest] n8n fan-out failed:', err.message)),
    );
  }

  // 4. A2A activity stream
  if (A2A_STREAM_URL) {
    tasks.push(
      fetch(`${A2A_STREAM_URL}/api/v1/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          type: 'skill.ingested',
          actor: 'usie/ingest',
          object: { gaid, name: skill.metadata.name, trust_tier: skill.metadata.trust_tier },
          timestamp: new Date().toISOString(),
        }),
      }).catch((err) => console.warn('[ingest] a2a fan-out failed:', err.message)),
    );
  }

  // Best-effort — don't let fan-out failures block the response
  await Promise.allSettled(tasks);
}

// ── Request body schema ───────────────────────────────────────────────────────

export interface IngestRequest {
  /** GitHub URL — https://github.com/owner/repo */
  url: string;
  /** Force a specific adapter instead of auto-detecting */
  adapter?: 'auto' | 'kiro' | 'skills-sh' | 'git-repo';
}

export interface IngestResponse {
  gaid: string;
  name: string;
  trust_tier: string;
  skill_class: string;
  published: boolean;
  adapter_used: string;
  marketplace_url: string;
  manifest: OssaSkill;
}

// ── The handler ───────────────────────────────────────────────────────────────

/**
 * handleIngest — core logic for POST /api/v1/ingest.
 * Returns the OssaSkill and metadata, or throws on failure.
 * The Express route in index.ts calls this and handles auth + publishResourceWithChecks.
 */
export async function handleIngest(body: IngestRequest): Promise<{ skill: OssaSkill; adapterUsed: string }> {
  const { url, adapter = 'auto' } = body;

  if (!url || !url.includes('github.com')) {
    throw new Error('url must be a valid GitHub repository URL (https://github.com/owner/repo)');
  }

  const slug = parseGitHubUrl(url);
  if (!slug) throw new Error(`Could not parse GitHub repo from URL: ${url}`);

  // 1. Auto-detect or use forced adapter
  let adapterHint: AdapterHint;
  let probe: RepoProbResult | null = null;

  if (adapter !== 'auto') {
    adapterHint = adapter as AdapterHint;
  } else {
    probe = await probeRepo(slug);
    adapterHint = detectAdapter(probe);
  }

  // 2. Fetch + normalize with the detected adapter
  let skill: OssaSkill;

  if (adapterHint === 'kiro') {
    // Kiro: single-repo single-power (not the mega registry)
    const kiroAdapter = new KiroPowersAdapter({ githubToken: GITHUB_TOKEN || undefined });
    // For single-repo ingest we use GitRepoAdapter with POWER.md glob
    const singleAdapter = new GitRepoAdapter({
      id: 'kiro-powers',
      label: 'Kiro Power',
      repo_url: url,
      branch: probe?.branch ?? 'main',
      manifest_glob: ['POWER.md'],
      github_token: GITHUB_TOKEN || undefined,
    });
    const bundles = await singleAdapter.fetch();
    if (bundles.length === 0) throw new Error('No POWER.md found in repo root or subdirs');
    skill = singleAdapter.normalize(bundles[0]);
    // Override adapter ID to kiro-powers for correct GAID
    void kiroAdapter; // referenced to satisfy linter

  } else if (adapterHint === 'skills-sh') {
    // skills-sh: single repo with SKILL.md
    const singleAdapter = new GitRepoAdapter({
      id: 'skills-sh',
      label: 'skills.sh',
      repo_url: url,
      branch: probe?.branch ?? 'main',
      manifest_glob: ['SKILL.md'],
      github_token: GITHUB_TOKEN || undefined,
    });
    const bundles = await singleAdapter.fetch();
    if (bundles.length === 0) throw new Error('No SKILL.md found in repo root or subdirs');
    skill = singleAdapter.normalize(bundles[0]);

  } else {
    // git-repo: generic — scans for SKILL.md, POWER.md, or generates from README/package.json
    const repoName = slug.split('/')[1];
    const genericAdapter = new GitRepoAdapter({
      id: 'git-repo',
      label: `Community: ${repoName}`,
      repo_url: url,
      branch: probe?.branch ?? 'main',
      manifest_glob: ['SKILL.md', 'POWER.md', 'README.md'],
      github_token: GITHUB_TOKEN || undefined,
    });
    const bundles = await genericAdapter.fetch();
    if (bundles.length === 0) throw new Error('No SKILL.md, POWER.md, or README.md found in repo');
    // Use the first match (root-level file wins)
    skill = genericAdapter.normalize(bundles[0]);
    // Override name from repo slug if frontmatter was missing
    if (skill.metadata.name === 'readme' || !skill.metadata.name) {
      skill = {
        ...skill,
        metadata: { ...skill.metadata, name: repoName },
      };
    }
  }

  return { skill, adapterUsed: adapterHint };
}

/** Fan-out after a successful publish — call this without awaiting from the route handler */
export { fanOut };
