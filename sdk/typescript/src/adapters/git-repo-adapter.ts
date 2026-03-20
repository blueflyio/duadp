/**
 * GitRepoAdapter — Generic config-driven adapter for any Git repo.
 *
 * Add new skill sources with zero code changes:
 *
 *   const adapter = new GitRepoAdapter({
 *     id: 'my-company-skills',
 *     label: 'Acme Corp Skills',
 *     repo_url: 'https://github.com/acme/agent-skills',
 *     branch: 'main',
 *     manifest_glob: ['SKILL.md', 'POWER.md'],
 *     trust_tier: 'internal',
 *   });
 *
 * Works with any public GitHub repo containing SKILL.md or POWER.md files
 * at any nesting depth.
 */

import type { OssaSkill, TrustTier } from '../types.js';
import {
  type RegistryAdapter,
  type SkillBundle,
  type GitRepoAdapterConfig,
  type McpServerConfig,
  buildSkillGaid,
  inferTrustTier,
  nowIso,
} from './registry-adapter.js';

const GITHUB_API = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let currentKey = '';
  let inArray = false;

  for (const raw of yaml.split('\n')) {
    const line = raw.startsWith('  ') ? raw.slice(2) : raw;
    const arrayItem = line.match(/^- (.+)$/);
    const kvMatch = line.match(/^([\w][\w-]*): ?(.*)$/);

    if (arrayItem && inArray && currentKey) {
      (out[currentKey] as string[]).push(arrayItem[1].replace(/^["']|["']$/g, ''));
    } else if (kvMatch) {
      inArray = false;
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === '') {
        out[currentKey] = [];
        inArray = true;
      } else {
        out[currentKey] = val.replace(/^["']|["']$/g, '');
      }
    }
  }
  return out;
}

function parseManifestMd(content: string): { meta: Record<string, unknown>; body: string } {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { meta: {}, body: content };
  return { meta: parseSimpleYaml(match[1]), body: match[2].trim() };
}

/** Extract 'owner/repo' from a GitHub HTTPS URL */
function repoSlug(url: string): string {
  return url.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
}

interface GithubTreeItem {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
}

export class GitRepoAdapter implements RegistryAdapter<GitRepoAdapterConfig> {
  readonly id: string;
  readonly label: string;
  readonly source_url: string;
  readonly trust_tier_default: TrustTier;
  readonly config: GitRepoAdapterConfig;

  constructor(config: GitRepoAdapterConfig) {
    this.config = config;
    this.id = config.id;
    this.label = config.label;
    this.source_url = config.repo_url;
    this.trust_tier_default = config.trust_tier ?? 'community';
  }

  private get headers(): HeadersInit {
    return this.config.github_token
      ? {
          Authorization: `Bearer ${this.config.github_token}`,
          'User-Agent': 'bluefly-duadp/usie',
        }
      : { 'User-Agent': 'bluefly-duadp/usie' };
  }

  async fetch(): Promise<SkillBundle[]> {
    const slug = repoSlug(this.config.repo_url);
    const branch = this.config.branch ?? 'main';
    const manifestGlob = this.config.manifest_glob ?? ['SKILL.md', 'POWER.md'];

    // Fetch flat tree
    const treeUrl = `${GITHUB_API}/repos/${slug}/git/trees/${branch}?recursive=1`;
    const treeRes = await fetch(treeUrl, { headers: this.headers });
    if (!treeRes.ok) {
      throw new Error(`GitRepoAdapter(${this.id}): GitHub tree fetch failed ${treeRes.status}`);
    }
    const treeData = await treeRes.json() as { tree: GithubTreeItem[]; sha: string };
    const commitSha = treeData.sha;

    // Find all manifest files matching the glob
    const manifestPaths = treeData.tree
      .filter((item) => {
        if (item.type !== 'blob') return false;
        const filename = item.path.split('/').pop() ?? '';
        return manifestGlob.includes(filename);
      })
      .map((item) => item.path);

    if (manifestPaths.length === 0) return [];

    const rawUrl = (path: string) =>
      `${RAW_BASE}/${slug}/${branch}/${path}`;

    const bundles = await Promise.all(
      manifestPaths.map((manifestPath) =>
        this.fetchSkillBundle(manifestPath, treeData.tree, rawUrl, commitSha),
      ),
    );

    return bundles.filter((b): b is SkillBundle => b !== null);
  }

  private async fetchSkillBundle(
    manifestPath: string,
    allFiles: GithubTreeItem[],
    rawUrl: (p: string) => string,
    commitSha: string,
  ): Promise<SkillBundle | null> {
    const dir = manifestPath.includes('/')
      ? manifestPath.slice(0, manifestPath.lastIndexOf('/'))
      : '';

    const [manifestText, mcpJsonText] = await Promise.all([
      fetch(rawUrl(manifestPath), { headers: this.headers }).then((r) =>
        r.ok ? r.text() : '',
      ),
      // Try mcp.json next to the manifest
      (() => {
        const mcpPath = dir ? `${dir}/mcp.json` : 'mcp.json';
        const hasMcp = allFiles.some((f) => f.path === mcpPath);
        return hasMcp
          ? fetch(rawUrl(mcpPath), { headers: this.headers }).then((r) =>
              r.ok ? r.text() : '{}',
            )
          : Promise.resolve('{}');
      })(),
    ]);

    if (!manifestText) return null;
    const { meta, body } = parseManifestMd(manifestText);

    // mcp_servers
    let mcpServers: Record<string, unknown> | undefined;
    try {
      const parsed = JSON.parse(mcpJsonText) as { mcpServers?: Record<string, unknown> };
      mcpServers = parsed.mcpServers;
    } catch {
      // ignore
    }

    // Gather steering / reference files
    const steeringPrefixes = [`${dir}/steering/`, `${dir}/references/`].filter(
      (p) => !p.startsWith('/'),
    );
    const steeringPaths = allFiles
      .filter(
        (f) =>
          f.type === 'blob' &&
          steeringPrefixes.some((prefix) => f.path.startsWith(prefix)) &&
          f.path.endsWith('.md'),
      )
      .map((f) => f.path);

    const steeringContent = await Promise.all(
      steeringPaths.map((p) =>
        fetch(rawUrl(p), { headers: this.headers }).then((r) =>
          r.ok ? r.text() : '',
        ),
      ),
    );

    // Gather scripts
    const scriptPrefix = dir ? `${dir}/scripts/` : 'scripts/';
    const scriptPaths = allFiles
      .filter((f) => f.type === 'blob' && f.path.startsWith(scriptPrefix))
      .map((f) => f.path);

    const scriptEntries = await Promise.all(
      scriptPaths.map(async (p) => [
        p.replace(scriptPrefix, ''),
        await fetch(rawUrl(p), { headers: this.headers }).then((r) =>
          r.ok ? r.text() : '',
        ),
      ] as [string, string]),
    );
    const scripts = Object.fromEntries(scriptEntries.filter(([, v]) => v));

    return {
      instruction_content: body,
      steering_content: steeringContent.filter(Boolean),
      scripts: Object.keys(scripts).length > 0 ? scripts : undefined,
      mcp_servers: mcpServers as Record<string, McpServerConfig> | undefined,
      raw_metadata: {
        name: String(meta.name ?? dir.split('/').pop() ?? manifestPath),
        description: meta.description as string | undefined,
        version: meta.version as string | undefined,
        author: meta.author as string | undefined,
        tags: (meta.tags ?? meta.keywords ?? []) as string[],
        ...meta,
      },
      source_commit: commitSha,
    };
  }

  normalize(bundle: SkillBundle): OssaSkill {
    const { raw_metadata: meta } = bundle;
    const skillName = String(meta.name);
    const gaid = buildSkillGaid(this.id, skillName);
    const trustTier = inferTrustTier(meta.author as string | undefined, this.trust_tier_default);
    const now = nowIso();

    const hasMcp = bundle.mcp_servers && Object.keys(bundle.mcp_servers).length > 0;
    const hasScripts = bundle.scripts && Object.keys(bundle.scripts).length > 0;
    const skillClass = hasMcp ? 'context-pack' : hasScripts ? 'scripted-skill' : 'instruction-skill';

    return {
      apiVersion: 'ossa/v0.5',
      kind: 'Skill',
      metadata: {
        name: skillName,
        version: (meta.version as string) ?? '1.0.0',
        description: meta.description as string | undefined,
        uri: gaid,
        category: (meta.category as string) ?? 'general',
        trust_tier: trustTier,
        tags: (meta.tags ?? []) as string[],
        created: now,
        updated: now,
        annotations: {
          source_adapter: this.id,
          source_url: this.source_url,
          skill_class: skillClass,
        },
      },
      spec: {
        instruction_content: bundle.instruction_content,
        steering_content: bundle.steering_content ?? [],
        scripts: bundle.scripts,
        mcp_servers: bundle.mcp_servers,
        skill_class: skillClass,
      },
      provenance: {
        publisher: {
          name: (meta.author as string) ?? this.label,
          url: this.source_url,
          verified: trustTier === 'verified-signature',
        },
        build: {
          source_repo: this.source_url,
          commit_sha: bundle.source_commit,
          build_time: now,
        },
      },
      identity: {
        gaid,
        did: `did:web:skills.openstandardagents.org:${this.id}:${skillName}`,
      },
    };
  }
}
