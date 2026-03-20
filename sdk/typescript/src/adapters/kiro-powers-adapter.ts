/**
 * KiroPowersAdapter
 *
 * Ingests Kiro "powers" from https://github.com/kirodotdev/powers
 * Format per directory:
 *   POWER.md         — YAML frontmatter (name, displayName, description, keywords, author)
 *                      + markdown instruction body
 *   mcp.json         — { mcpServers: { <name>: McpServerConfig } }
 *   steering/*.md    — additional behavioral guidelines (optional)
 */

import type { OssaSkill } from '../types.js';
import {
  type RegistryAdapter,
  type SkillBundle,
  type McpServerConfig,
  buildSkillGaid,
  inferTrustTier,
  nowIso,
} from './registry-adapter.js';

const KIRO_REPO = 'kirodotdev/powers';
const KIRO_BRANCH = 'main';
const GITHUB_API = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';

// Frontmatter blocks: ---\n...\n---
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/** Minimal YAML key:value parser (handles only scalar values and arrays) */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let currentKey = '';
  let inArray = false;

  for (const raw of yaml.split('\n')) {
    const line = raw.startsWith('  ') ? raw.slice(2) : raw;
    const arrayItem = line.match(/^- (.+)$/);
    const kvMatch = line.match(/^(\w[\w-]*): ?(.*)$/);

    if (arrayItem && inArray && currentKey) {
      (out[currentKey] as string[]).push(arrayItem[1].replace(/^["']|["']$/g, ''));
    } else if (kvMatch) {
      inArray = false;
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === '') {
        out[currentKey] = [];
        inArray = true;
      } else if (val === 'true') {
        out[currentKey] = true;
      } else if (val === 'false') {
        out[currentKey] = false;
      } else {
        out[currentKey] = val.replace(/^["']|["']$/g, '');
      }
    }
  }
  return out;
}

function parsePowerMd(content: string): { meta: Record<string, unknown>; body: string } {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { meta: {}, body: content };
  return { meta: parseSimpleYaml(match[1]), body: match[2].trim() };
}

interface GithubTreeItem {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
}

interface KiroPowersAdapterOptions {
  /** GitHub PAT for unauthenticated rate-limit bypass (optional) */
  githubToken?: string;
}

export class KiroPowersAdapter implements RegistryAdapter<KiroPowersAdapterOptions> {
  readonly id = 'kiro-powers';
  readonly label = 'Kiro Powers';
  readonly source_url = `https://github.com/${KIRO_REPO}`;
  readonly trust_tier_default = 'community' as const;
  readonly config: KiroPowersAdapterOptions;

  constructor(options: KiroPowersAdapterOptions = {}) {
    this.config = options;
  }

  private get headers(): HeadersInit {
    return this.config.githubToken
      ? { Authorization: `Bearer ${this.config.githubToken}`, 'User-Agent': 'bluefly-duadp/usie' }
      : { 'User-Agent': 'bluefly-duadp/usie' };
  }

  async fetch(): Promise<SkillBundle[]> {
    // 1. Fetch the flat git tree
    const treeUrl = `${GITHUB_API}/repos/${KIRO_REPO}/git/trees/${KIRO_BRANCH}?recursive=1`;
    const treeRes = await fetch(treeUrl, { headers: this.headers });
    if (!treeRes.ok) {
      throw new Error(`KiroPowersAdapter: GitHub tree fetch failed ${treeRes.status}`);
    }
    const treeData = await treeRes.json() as { tree: GithubTreeItem[]; sha: string };
    const commitSha = treeData.sha;

    // 2. Group blobs by top-level directory (= one power per dir)
    const powerDirs = new Map<string, GithubTreeItem[]>();
    for (const item of treeData.tree) {
      if (item.type !== 'blob') continue;
      const parts = item.path.split('/');
      if (parts.length < 2) continue; // root-level files, skip
      const dir = parts[0];
      if (dir.startsWith('.')) continue; // .kiro/, .github/, etc.
      if (!powerDirs.has(dir)) powerDirs.set(dir, []);
      powerDirs.get(dir)!.push(item);
    }

    // 3. For each dir, fetch POWER.md + mcp.json + steering/*.md concurrently
    const bundles = await Promise.all(
      [...powerDirs.entries()].map(([dir, files]) =>
        this.fetchPowerBundle(dir, files, commitSha),
      ),
    );

    return bundles.filter((b): b is SkillBundle => b !== null);
  }

  private async fetchPowerBundle(
    dir: string,
    files: GithubTreeItem[],
    commitSha: string,
  ): Promise<SkillBundle | null> {
    const hasPower = files.some((f) => f.path === `${dir}/POWER.md`);
    if (!hasPower) return null;

    const rawUrl = (path: string) =>
      `${RAW_BASE}/${KIRO_REPO}/${KIRO_BRANCH}/${path}`;

    const [powerMdText, mcpJsonText] = await Promise.all([
      fetch(rawUrl(`${dir}/POWER.md`), { headers: this.headers }).then((r) =>
        r.ok ? r.text() : '',
      ),
      files.some((f) => f.path === `${dir}/mcp.json`)
        ? fetch(rawUrl(`${dir}/mcp.json`), { headers: this.headers }).then((r) =>
            r.ok ? r.text() : '{}',
          )
        : Promise.resolve('{}'),
    ]);

    const { meta, body } = parsePowerMd(powerMdText);

    // mcp.json
    let mcpServers: Record<string, McpServerConfig> | undefined;
    try {
      const parsed = JSON.parse(mcpJsonText) as { mcpServers?: Record<string, McpServerConfig> };
      mcpServers = parsed.mcpServers;
    } catch {
      // malformed mcp.json — skip mcp_servers
    }

    // steering files
    const steeringFiles = files.filter((f) =>
      f.path.startsWith(`${dir}/steering/`) && f.path.endsWith('.md'),
    );
    const steeringContent = await Promise.all(
      steeringFiles.map((f) =>
        fetch(rawUrl(f.path), { headers: this.headers }).then((r) =>
          r.ok ? r.text() : '',
        ),
      ),
    );

    return {
      instruction_content: body,
      steering_content: steeringContent.filter(Boolean),
      mcp_servers: mcpServers,
      raw_metadata: {
        name: String(meta.name ?? dir),
        displayName: meta.displayName as string | undefined,
        description: meta.description as string | undefined,
        author: meta.author as string | undefined,
        keywords: meta.keywords as string[] | undefined,
        tags: meta.keywords as string[] | undefined,
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

    return {
      apiVersion: 'ossa/v0.5',
      kind: 'Skill',
      metadata: {
        name: skillName,
        version: '1.0.0',
        description: meta.description as string | undefined,
        uri: gaid,
        category: 'context-pack',
        trust_tier: trustTier,
        tags: (meta.keywords ?? meta.tags ?? []) as string[],
        created: now,
        updated: now,
        annotations: {
          displayName: meta.displayName,
          source_adapter: this.id,
          source_url: `${this.source_url}/tree/main/${skillName}`,
          skill_class: 'context-pack',
        },
      },
      spec: {
        instruction_content: bundle.instruction_content,
        steering_content: bundle.steering_content ?? [],
        mcp_servers: bundle.mcp_servers ?? {},
        skill_class: 'context-pack',
      },
      provenance: {
        publisher: {
          name: (meta.author as string) ?? 'Kiro (Amazon)',
          url: this.source_url,
          organization: 'Amazon / Kiro',
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
