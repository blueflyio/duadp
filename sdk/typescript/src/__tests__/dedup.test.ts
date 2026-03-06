import { describe, it, expect } from 'vitest';
import { deduplicateResources } from '../client.js';
import { mockResource, mockIdentity } from './helpers.js';
import type { OssaResource } from '../types.js';

describe('deduplicateResources', () => {
  it('removes exact duplicates by content_hash', () => {
    const r1 = mockResource({ content_hash: 'abc123', metadata: { name: 'skill-a' } });
    const r2 = mockResource({ content_hash: 'abc123', metadata: { name: 'skill-a-copy' } });
    const result = deduplicateResources([r1, r2]);
    expect(result).toHaveLength(1);
    expect(result[0].metadata.name).toBe('skill-a');
  });

  it('removes duplicates by GAID', () => {
    const r1 = mockResource({
      metadata: { name: 'skill-a' },
      identity: mockIdentity({ gaid: 'agent://acme.com/skill-a' }),
    });
    const r2 = mockResource({
      metadata: { name: 'skill-a-v2' },
      identity: mockIdentity({ gaid: 'agent://acme.com/skill-a' }),
    });
    const result = deduplicateResources([r1, r2]);
    expect(result).toHaveLength(1);
    expect(result[0].metadata.name).toBe('skill-a');
  });

  it('removes duplicates by URI', () => {
    const r1 = mockResource({
      metadata: { name: 'skill-a', uri: 'ossa://node/skills/a' },
    });
    const r2 = mockResource({
      metadata: { name: 'skill-a-copy', uri: 'ossa://node/skills/a' },
    });
    const result = deduplicateResources([r1, r2]);
    expect(result).toHaveLength(1);
    expect(result[0].metadata.name).toBe('skill-a');
  });

  it('removes duplicates by kind:name fallback', () => {
    const r1 = mockResource({ metadata: { name: 'unique-skill' } });
    const r2 = mockResource({ metadata: { name: 'unique-skill' } });
    // Both have same kind ('Skill') and name, no content_hash, no gaid, no uri
    // We need to remove uri to test the fallback
    delete (r1.metadata as any).uri;
    delete (r2.metadata as any).uri;
    const result = deduplicateResources([r1, r2]);
    expect(result).toHaveLength(1);
  });

  it('preserves first occurrence (prefers local)', () => {
    const local = mockResource({
      content_hash: 'same-hash',
      metadata: { name: 'local-version', description: 'local' },
    });
    const remote = mockResource({
      content_hash: 'same-hash',
      metadata: { name: 'remote-version', description: 'remote' },
    });
    const result = deduplicateResources([local, remote]);
    expect(result).toHaveLength(1);
    expect(result[0].metadata.description).toBe('local');
  });

  it('returns empty array for empty input', () => {
    const result = deduplicateResources([]);
    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  it('preserves unique resources', () => {
    const r1 = mockResource({
      content_hash: 'hash-1',
      metadata: { name: 'skill-1' },
    });
    const r2 = mockResource({
      content_hash: 'hash-2',
      metadata: { name: 'skill-2' },
    });
    const r3 = mockResource({
      content_hash: 'hash-3',
      metadata: { name: 'skill-3' },
    });
    const result = deduplicateResources([r1, r2, r3]);
    expect(result).toHaveLength(3);
  });
});
