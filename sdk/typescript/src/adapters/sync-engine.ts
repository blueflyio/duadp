/**
 * SyncEngine
 *
 * Orchestrates one or more RegistryAdapters against a DUADP node.
 * - Fetches all bundles from each adapter in parallel
 * - Normalizes to OssaSkill
 * - Deduplicates by GAID
 * - Diffs against what already exists in the node (content hash)
 * - Publishes only changed or new skills via POST /api/v1/publish
 */

import type { OssaSkill } from '../types.js';
import { contentHash } from '../crypto.js';
import { type RegistryAdapter } from './registry-adapter.js';

export interface SyncEngineOptions {
  /** DUADP node base URL (e.g. https://discover.duadp.org) */
  nodeUrl: string;

  /** DID or API key for publish authentication */
  publishToken?: string;

  /** If true, run adapters sequentially rather than in parallel (default: false) */
  sequential?: boolean;

  /** Custom logger (default: console) */
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
}

export interface SyncResult {
  adapter_id: string;
  fetched: number;
  new: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface SyncReport {
  started_at: string;
  finished_at: string;
  results: SyncResult[];
  total_published: number;
  total_errors: number;
}

export class SyncEngine {
  private readonly opts: SyncEngineOptions;
  private readonly log: Pick<Console, 'log' | 'warn' | 'error'>;

  constructor(opts: SyncEngineOptions) {
    this.opts = opts;
    this.log = opts.logger ?? console;
  }

  /**
   * Run all supplied adapters and sync their skills to the DUADP node.
   */
  async syncAll(adapters: RegistryAdapter[]): Promise<SyncReport> {
    const started_at = new Date().toISOString();

    const runAdapter = (adapter: RegistryAdapter) => this.syncAdapter(adapter);

    const results: SyncResult[] = this.opts.sequential
      ? await adapters.reduce<Promise<SyncResult[]>>(
          async (acc, adapter) => [...(await acc), await runAdapter(adapter)],
          Promise.resolve([]),
        )
      : await Promise.all(adapters.map(runAdapter));

    const finished_at = new Date().toISOString();
    return {
      started_at,
      finished_at,
      results,
      total_published: results.reduce((s, r) => s + r.new + r.updated, 0),
      total_errors: results.reduce((s, r) => s + r.errors.length, 0),
    };
  }

  private async syncAdapter(adapter: RegistryAdapter): Promise<SyncResult> {
    const result: SyncResult = {
      adapter_id: adapter.id,
      fetched: 0,
      new: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    this.log.log(`[usie] syncing adapter: ${adapter.id}`);

    let bundles;
    try {
      bundles = await adapter.fetch();
    } catch (err) {
      result.errors.push(`fetch failed: ${String(err)}`);
      return result;
    }

    result.fetched = bundles.length;

    // Normalize + deduplicate by GAID
    const byGaid = new Map<string, OssaSkill>();
    for (const bundle of bundles) {
      try {
        const skill = adapter.normalize(bundle);
        const gaid = skill.metadata.uri;
        if (!gaid) {
          result.errors.push(`skill ${skill.metadata.name} has no GAID — skipping`);
          continue;
        }
        if (!byGaid.has(gaid)) byGaid.set(gaid, skill);
      } catch (err) {
        result.errors.push(`normalize failed for ${JSON.stringify(bundle.raw_metadata.name)}: ${String(err)}`);
      }
    }

    // Fetch existing skills from node to diff
    const existingHashes = await this.fetchExistingHashes(adapter.id);

    // Publish changed or new skills
    for (const [gaid, skill] of byGaid) {
      const hash = await contentHash(skill);
      if (existingHashes.get(gaid) === hash) {
        result.skipped++;
        continue;
      }
      const isNew = !existingHashes.has(gaid);
      try {
        await this.publish(skill);
        if (isNew) result.new++;
        else result.updated++;
      } catch (err) {
        result.errors.push(`publish failed for ${gaid}: ${String(err)}`);
      }
    }

    this.log.log(
      `[usie] ${adapter.id}: fetched=${result.fetched} new=${result.new} updated=${result.updated} skipped=${result.skipped} errors=${result.errors.length}`,
    );

    return result;
  }

  private async fetchExistingHashes(adapterId: string): Promise<Map<string, string>> {
    const hashes = new Map<string, string>();
    try {
      const url = `${this.opts.nodeUrl}/api/v1/skills?source=${adapterId}&limit=500`;
      const res = await fetch(url);
      if (!res.ok) return hashes;
      const data = await res.json() as { data: Array<{ metadata: { uri?: string }; content_hash?: string }> };
      for (const skill of data.data) {
        if (skill.metadata.uri && skill.content_hash) {
          hashes.set(skill.metadata.uri, skill.content_hash);
        }
      }
    } catch {
      // If the node is unreachable, treat all as new
    }
    return hashes;
  }

  private async publish(skill: OssaSkill): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.opts.publishToken) {
      headers['Authorization'] = `Bearer ${this.opts.publishToken}`;
    }
    const res = await fetch(`${this.opts.nodeUrl}/api/v1/publish`, {
      method: 'POST',
      headers,
      body: JSON.stringify(skill),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
  }
}
