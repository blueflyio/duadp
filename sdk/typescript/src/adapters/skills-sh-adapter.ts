/**
 * SkillsShAdapter
 *
 * Ingests skills from https://skills.sh — a global GitHub-hosted registry.
 * Each skill is a GitHub repo directory containing:
 *   SKILL.md          — YAML frontmatter (name, description, version, author, tags)
 *                       + markdown instruction body
 *   references/       — supplementary docs loaded into steering_content
 *   scripts/          — executable scripts (shell, python, etc.)
 *
 * Fetch strategy:
 *   1. Parse the public skills.sh index (GitHub org: skills-sh, or topic: agent-skill)
 *   2. For each repo, fetch the skill directory tree and pull SKILL.md + supporting files
 *
 * NOTE: skills.sh does not expose a machine-readable index yet — we use the
 * GitHub search API with topic 'agent-skill' as the discovery mechanism.
 */

import type { OssaSkill } from '../types.js';
import {
  type RegistryAdapter,
  type SkillBundle,
  buildSkillGaid,
  inferTrustTier,
  nowIso,
} from './registry-adapter.js';

const GITHUB_API = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';

// skills.sh publishes skills as GitHub repos with the 'agent-skill' topic.
// We also check repos explicitly listed in the skills.sh public index.
const SKILLS_SH_TOPIC = 'agent-skill';
const SKILLS_SH_ORG = 'skills-sh'; // official org (if one exists)

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

function parseSkillMd(content: string): { meta: Record<string, unknown>; body: string } {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { meta: {}, body: content };
  return { meta: parseSimpleYaml(match[1]), body: match[2].trim() };
}

interface GithubRepoSearchItem {
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  owner: { login: string };
}

interface GithubTreeItem {
  path: string;
  type: 'blob' | 'tree';
}

export interface SkillsShAdapterOptions {
  /** GitHub PAT for higher rate limits */
  githubToken?: string;
  /**
   * Maximum number of repos to fetch (default: 100).
   * skills.sh has hundreds of skills — cap prevents runaway requests.
   */
  maxRepos?: number;
}

export class SkillsShAdapter implements RegistryAdapter<SkillsShAdapterOptions> {
  readonly id = 'skills-sh';
  readonly label = 'skills.sh';
  readonly source_url = 'https://skills.sh';
  readonly trust_tier_default = 'community' as const;
  readonly config: SkillsShAdapterOptions;

  constructor(options: SkillsShAdapterOptions = {}) {
    this.config = options;
  }

  private get headers(): HeadersInit {
    return this.config.githubToken
      ? { Authorization: `Bearer ${this.config.githubToken}`, 'User-Agent': 'bluefly-duadp/usie' }
      : { 'User-Agent': 'bluefly-duadp/usie' };
  }

  async fetch(): Promise<SkillBundle[]> {
    const maxRepos = this.config.maxRepos ?? 100;
    const repos = await this.discoverRepos(maxRepos);
    const bundles = await Promise.all(repos.map((r) => this.fetchRepoBundle(r)));
    return bundles.filter((b): b is SkillBundle => b !== null);
  }

  private async discoverRepos(max: number): Promise<GithubRepoSearchItem[]> {
    // Try org repos first, fall back to topic search
    const results: GithubRepoSearchItem[] = [];

    // Strategy 1: GitHub topic search for 'agent-skill'
    const perPage = Math.min(max, 100);
    const searchUrl = `${GITHUB_API}/search/repositories?q=topic:${SKILLS_SH_TOPIC}&sort=stars&per_page=${perPage}`;
    const res = await fetch(searchUrl, { headers: this.headers });
    if (res.ok) {
      const data = await res.json() as { items: GithubRepoSearchItem[] };
      results.push(...data.items.slice(0, max));
    }

    // Strategy 2: Explicit org repos (if skills-sh org exists on GitHub)
    if (results.length < max) {
      const orgUrl = `${GITHUB_API}/orgs/${SKILLS_SH_ORG}/repos?per_page=100&type=public`;
      const orgRes = await fetch(orgUrl, { headers: this.headers });
      if (orgRes.ok) {
        const orgData = await orgRes.json() as GithubRepoSearchItem[];
        for (const repo of orgData) {
          if (!results.find((r) => r.full_name === repo.full_name)) {
            results.push(repo);
          }
        }
      }
    }

    return results.slice(0, max);
  }

  private async fetchRepoBundle(repo: GithubRepoSearchItem): Promise<SkillBundle | null> {
    const branch = repo.default_branch ?? 'main';
    const rawUrl = (path: string) =>
      `${RAW_BASE}/${repo.full_name}/${branch}/${path}`;

    // Fetch SKILL.md from repo root
    const skillMdRes = await fetch(rawUrl('SKILL.md'), { headers: this.headers });
    if (!skillMdRes.ok) return null; // not a skill repo

    const skillMdText = await skillMdRes.text();
    const { meta, body } = parseSkillMd(skillMdText);

    // Fetch tree to discover references/ and scripts/
    const treeUrl = `${GITHUB_API}/repos/${repo.full_name}/git/trees/${branch}?recursive=1`;
    const treeRes = await fetch(treeUrl, { headers: this.headers });
    let referenceFiles: string[] = [];
    let scriptFiles: Record<string, string> = {};

    if (treeRes.ok) {
      const treeData = await treeRes.json() as { tree: GithubTreeItem[] };
      const refPaths = treeData.tree
        .filter((f) => f.type === 'blob' && f.path.startsWith('references/'))
        .map((f) => f.path);
      const scriptPaths = treeData.tree
        .filter((f) => f.type === 'blob' && f.path.startsWith('scripts/'))
        .map((f) => f.path);

      // Fetch references (steering content)
      const refs = await Promise.all(
        refPaths.map((p) =>
          fetch(rawUrl(p), { headers: this.headers }).then((r) =>
            r.ok ? r.text() : '',
          ),
        ),
      );
      referenceFiles = refs.filter(Boolean);

      // Fetch scripts
      const scriptEntries = await Promise.all(
        scriptPaths.map(async (p) => {
          const content = await fetch(rawUrl(p), { headers: this.headers }).then((r) =>
            r.ok ? r.text() : '',
          );
          return [p, content] as [string, string];
        }),
      );
      scriptFiles = Object.fromEntries(scriptEntries.filter(([, v]) => v));
    }

    return {
      instruction_content: body,
      steering_content: referenceFiles,
      scripts: Object.keys(scriptFiles).length > 0 ? scriptFiles : undefined,
      raw_metadata: {
        name: String(meta.name ?? repo.full_name.split('/').pop() ?? 'unknown'),
        description: (meta.description as string) ?? repo.description ?? undefined,
        version: meta.version as string | undefined,
        author: meta.author as string | undefined,
        tags: meta.tags as string[] | undefined,
        ...meta,
        // Enrich with repo metadata
        _github_repo: repo.full_name,
        _github_url: repo.html_url,
      },
    };
  }

  normalize(bundle: SkillBundle): OssaSkill {
    const { raw_metadata: meta } = bundle;
    const skillName = String(meta.name);
    const gaid = buildSkillGaid(this.id, skillName);
    const trustTier = inferTrustTier(meta.author as string | undefined, this.trust_tier_default);
    const now = nowIso();

    const skillClass = bundle.scripts && Object.keys(bundle.scripts).length > 0
      ? 'scripted-skill'
      : 'instruction-skill';

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
          source_url: (meta._github_url as string) ?? this.source_url,
          skill_class: skillClass,
        },
      },
      spec: {
        instruction_content: bundle.instruction_content,
        steering_content: bundle.steering_content ?? [],
        scripts: bundle.scripts,
        skill_class: skillClass,
      },
      provenance: {
        publisher: {
          name: (meta.author as string) ?? 'skills.sh community',
          url: (meta._github_url as string) ?? this.source_url,
          verified: trustTier === 'verified-signature',
        },
        build: {
          source_repo: (meta._github_url as string) ?? this.source_url,
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
