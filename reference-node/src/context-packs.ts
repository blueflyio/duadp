/**
 * context-packs.ts — GET /api/v1/context_packs
 *
 * A "context pack" is a named bundle of related skills from a single source adapter.
 * This endpoint groups skills by their source adapter (kiro-powers, skills-sh, git-repo)
 * and returns them as curated packs consumable by agents and the marketplace.
 *
 * SOD: Discovery logic lives here in duadp. Consumers (marketplace, CLI) call this endpoint.
 */

import Database from 'better-sqlite3';

export interface ContextPack {
  id: string;
  source: string;         // adapter id: 'kiro-powers' | 'skills-sh' | 'git-repo'
  label: string;
  description: string;
  icon: string;           // emoji shorthand for UI
  skills: ContextPackSkill[];
  meta: {
    count: number;
    last_updated: string;
    trust_tier_distribution: Record<string, number>;
  };
}

export interface ContextPackSkill {
  gaid: string;
  name: string;
  description: string;
  trust_tier: string;
  skill_class: string;
  tags: string[];
}

const SOURCE_LABELS: Record<string, { label: string; description: string; icon: string }> = {
  'kiro-powers': {
    label: 'Kiro Powers',
    description: 'AI-native skills from kirodotdev/powers — steering, MCP, and workflow primitives',
    icon: '⚡',
  },
  'skills-sh': {
    label: 'skills.sh Registry',
    description: 'Community skills from the skills.sh open registry',
    icon: '🎯',
  },
  'git-repo': {
    label: 'Community (Git)',
    description: 'Skills ingested directly from GitHub repositories via USIE auto-detection',
    icon: '🔧',
  },
};

/**
 * Build context packs from the skills table, grouped by source adapter annotation.
 * Falls back to 'git-repo' if annotation is missing.
 */
export function buildContextPacks(db: Database.Database): ContextPack[] {
  const rows = db.prepare(`
    SELECT name, data FROM resources
    WHERE kind = 'Skill'
    ORDER BY updated_at DESC
  `).all() as Array<{ name: string; data: string }>;

  const grouped: Map<string, ContextPackSkill[]> = new Map();

  for (const row of rows) {
    let resource: Record<string, any>;
    try {
      resource = JSON.parse(row.data);
    } catch {
      continue;
    }

    const annotations = resource?.metadata?.annotations as Record<string, unknown> ?? {};
    const source = (annotations['usie.source'] as string) || 'git-repo';
    const gaid = resource?.identity?.gaid || `agent://${row.name}`;
    const skill: ContextPackSkill = {
      gaid,
      name: resource?.metadata?.name || row.name,
      description: resource?.metadata?.description || '',
      trust_tier: resource?.metadata?.trust_tier || 'community',
      skill_class: (annotations['usie.skill_class'] as string) || 'general',
      tags: Array.isArray(resource?.metadata?.tags) ? resource.metadata.tags : [],
    };

    const existing = grouped.get(source) ?? [];
    existing.push(skill);
    grouped.set(source, existing);
  }

  const packs: ContextPack[] = [];
  for (const [source, skills] of grouped.entries()) {
    const meta = SOURCE_LABELS[source] ?? { label: source, description: '', icon: '📦' };
    const tierDist: Record<string, number> = {};
    for (const s of skills) {
      tierDist[s.trust_tier] = (tierDist[s.trust_tier] ?? 0) + 1;
    }
    packs.push({
      id: source,
      source,
      label: meta.label,
      description: meta.description,
      icon: meta.icon,
      skills,
      meta: {
        count: skills.length,
        last_updated: new Date().toISOString(),
        trust_tier_distribution: tierDist,
      },
    });
  }

  // Canonical order: kiro-powers → skills-sh → git-repo → others
  const order = ['kiro-powers', 'skills-sh', 'git-repo'];
  return packs.sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai === -1 && bi === -1) return a.id.localeCompare(b.id);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

/**
 * Build a single skill's full bundle (manifest + all metadata).
 * Called by GET /api/v1/skills/:gaid/bundle
 */
export function getSkillBundle(db: Database.Database, gaid: string): Record<string, unknown> | null {
  const encoded = gaid.startsWith('agent://') ? gaid : `agent://${gaid}`;
  const row = db.prepare(`
    SELECT name, data FROM resources
    WHERE kind = 'Skill'
    AND (json_extract(data, '$.identity.gaid') = ? OR name = ?)
    LIMIT 1
  `).get(encoded, gaid) as { name: string; data: string } | undefined;

  if (!row) return null;

  let resource: Record<string, unknown>;
  try {
    resource = JSON.parse(row.data);
  } catch {
    return null;
  }

  return {
    ...resource,
    bundle: {
      gaid: encoded,
      source_url: (resource?.metadata as any)?.annotations?.['usie.source_url'],
      adapter: (resource?.metadata as any)?.annotations?.['usie.source'] ?? 'git-repo',
      ingested_at: (resource?.metadata as any)?.annotations?.['usie.ingested_at'],
    },
  };
}
