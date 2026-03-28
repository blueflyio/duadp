#!/usr/bin/env tsx
/**
 * seed-adapters.ts — npm run seed:adapters
 *
 * Seeds the DUADP reference node database from all configured USIE adapters
 * by calling the /api/v1/ingest endpoint with each known source.
 *
 * Usage:
 *   DUADP_NODE=http://localhost:4200 DUADP_TOKEN=... npm run seed:adapters
 *
 * The seeds are safe to re-run (idempotent via GAID dedup in provider.publishResource).
 */

const NODE = process.env.DUADP_NODE ?? 'http://localhost:4200';
const TOKEN = process.env.DUADP_TOKEN ?? process.env.INTERNAL_API_KEY ?? '';
const SNAPSHOT_DIR = new URL('../seeds', import.meta.url).pathname;

interface SeedSource {
  id: string;
  url: string;
  adapter: 'kiro' | 'skills-sh' | 'auto';
  label: string;
}

const SOURCES: SeedSource[] = [
  {
    id: 'kiro-powers',
    url: 'https://github.com/kirodotdev/powers',
    adapter: 'kiro',
    label: '⚡ Kiro Powers',
  },
  {
    id: 'skills-sh',
    url: 'https://github.com/skills-sh/skills',
    adapter: 'skills-sh',
    label: '🎯 skills.sh',
  },
];

async function ingest(source: SeedSource): Promise<{ ok: boolean; gaid?: string; error?: string }> {
  if (!TOKEN) {
    console.warn(`  ⚠️  No DUADP_TOKEN — skipping ${source.id}`);
    return { ok: false, error: 'no token' };
  }
  try {
    const res = await fetch(`${NODE}/api/v1/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ url: source.url, adapter: source.adapter }),
    });
    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) throw new Error(JSON.stringify(data));
    return { ok: true, gaid: data['gaid'] as string };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function loadSnapshot(id: string): Promise<Record<string, unknown>[] | null> {
  const p = `${SNAPSHOT_DIR}/${id}.snapshot.json`;
  try {
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(p, 'utf8');
    return JSON.parse(raw) as Record<string, unknown>[];
  } catch {
    return null;
  }
}

async function publishFromSnapshot(
  snapshot: Record<string, unknown>[],
  sourceId: string,
): Promise<{ published: number; skipped: number }> {
  let published = 0;
  let skipped = 0;
  for (const skill of snapshot) {
    // Annotate source before publishing
    if (typeof (skill as any).metadata === 'object') {
      (skill as any).metadata.annotations = {
        ...(skill as any).metadata.annotations,
        'usie.source': sourceId,
        'usie.seeded_at': new Date().toISOString(),
      };
    }
    try {
      const res = await fetch(`${NODE}/api/v1/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(skill),
      });
      const data = await res.json() as Record<string, unknown>;
      if (res.ok && data['success']) { published++; } else { skipped++; }
    } catch {
      skipped++;
    }
  }
  return { published, skipped };
}

async function main() {
  console.log(`\n🌱 USIE Seed Adapters — targeting ${NODE}\n`);

  for (const source of SOURCES) {
    process.stdout.write(`  ${source.label} (${source.url}) ... `);

    // Try live ingest first
    const result = await ingest(source);
    if (result.ok) {
      console.log(`✅ ingested → ${result.gaid}`);
      continue;
    }

    // Fall back to snapshot seed
    const snapshot = await loadSnapshot(source.id);
    if (!snapshot) {
      console.log(`❌ ${result.error ?? 'failed'} (no snapshot fallback)`);
      continue;
    }

    process.stdout.write(`(snapshot fallback: ${snapshot.length} skills) `);
    const { published, skipped } = await publishFromSnapshot(snapshot, source.id);
    console.log(`✅ ${published} published, ${skipped} skipped`);
  }

  console.log('\n  Done.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
