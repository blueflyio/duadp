import type { OssaResource, ResourceIdentity } from '../types.js';

/**
 * Build a mock OssaResource with sensible defaults.
 * Override any field by passing partial data.
 */
export function mockResource(overrides: Partial<OssaResource> = {}): OssaResource {
  return {
    apiVersion: 'ossa/v1',
    kind: 'Skill',
    metadata: {
      name: 'test-skill',
      version: '1.0.0',
      description: 'A test skill',
      uri: 'ossa://test-node/skills/test-skill',
      category: 'testing',
      tags: ['test'],
      ...overrides.metadata,
    },
    spec: {
      input: { type: 'string' },
      output: { type: 'string' },
      ...overrides.spec,
    },
    ...overrides,
    // Re-apply metadata after spread so nested overrides win
    metadata: {
      name: 'test-skill',
      version: '1.0.0',
      description: 'A test skill',
      uri: 'ossa://test-node/skills/test-skill',
      category: 'testing',
      tags: ['test'],
      ...overrides.metadata,
    },
  };
}

/**
 * Build a mock ResourceIdentity.
 */
export function mockIdentity(overrides: Partial<ResourceIdentity> = {}): ResourceIdentity {
  return {
    did: 'did:web:acme.com:agents:test',
    gaid: 'agent://acme.com/test',
    lifecycle: {
      status: 'active',
      activated: '2025-01-01T00:00:00Z',
      expires: '2030-01-01T00:00:00Z',
    },
    ...overrides,
  };
}
