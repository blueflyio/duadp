import { describe, it, expect } from 'vitest';
import { validateManifest, validateResponse, isDuadpManifest } from '../validate.js';

function validManifest() {
  return {
    protocol_version: '0.1.0',
    node_name: 'test-node',
    node_description: 'A test node',
    endpoints: {
      skills: '/api/v1/skills',
      agents: '/api/v1/agents',
    },
    ossa_versions: ['0.3.0'],
  };
}

function validResponse() {
  return {
    data: [
      {
        apiVersion: 'ossa/v1',
        kind: 'Skill',
        metadata: { name: 'my-skill' },
      },
    ],
    meta: {
      total: 1,
      page: 1,
      limit: 20,
      node_name: 'test-node',
    },
  };
}

describe('validateManifest', () => {
  it('valid manifest passes', () => {
    const result = validateManifest(validManifest());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('missing protocol_version fails', () => {
    const m = validManifest();
    delete (m as any).protocol_version;
    const result = validateManifest(m);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('protocol_version'))).toBe(true);
  });

  it('invalid protocol_version format fails', () => {
    const m = { ...validManifest(), protocol_version: 'v1' };
    const result = validateManifest(m);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('semver'))).toBe(true);
  });

  it('missing node_name fails', () => {
    const m = validManifest();
    delete (m as any).node_name;
    const result = validateManifest(m);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('node_name'))).toBe(true);
  });

  it('missing endpoints fails', () => {
    const m = validManifest();
    delete (m as any).endpoints;
    const result = validateManifest(m);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('endpoints'))).toBe(true);
  });

  it('empty endpoints (no skills or agents) fails', () => {
    const m = { ...validManifest(), endpoints: {} };
    const result = validateManifest(m);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('skills') || e.includes('agents'))).toBe(true);
  });

  it('non-string endpoint values fail', () => {
    const m = { ...validManifest(), endpoints: { skills: 123 } };
    const result = validateManifest(m);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('string URL'))).toBe(true);
  });

  it('missing node_description produces warning', () => {
    const m = validManifest();
    delete (m as any).node_description;
    const result = validateManifest(m);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('node_description'))).toBe(true);
  });

  it('missing ossa_versions produces warning', () => {
    const m = validManifest();
    delete (m as any).ossa_versions;
    const result = validateManifest(m);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('ossa_versions'))).toBe(true);
  });

  it('null input fails', () => {
    const result = validateManifest(null);
    expect(result.valid).toBe(false);
  });

  it('non-object input fails', () => {
    const result = validateManifest('not an object');
    expect(result.valid).toBe(false);
  });
});

describe('validateResponse', () => {
  it('valid paginated response passes', () => {
    const result = validateResponse(validResponse());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('missing data array fails', () => {
    const r = validResponse();
    delete (r as any).data;
    const result = validateResponse(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('data'))).toBe(true);
  });

  it('data items without apiVersion fail', () => {
    const r = {
      ...validResponse(),
      data: [{ kind: 'Skill', metadata: { name: 'x' } }],
    };
    const result = validateResponse(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('apiVersion'))).toBe(true);
  });

  it('data items without kind fail', () => {
    const r = {
      ...validResponse(),
      data: [{ apiVersion: 'ossa/v1', metadata: { name: 'x' } }],
    };
    const result = validateResponse(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('kind'))).toBe(true);
  });

  it('data items without metadata.name fail', () => {
    const r = {
      ...validResponse(),
      data: [{ apiVersion: 'ossa/v1', kind: 'Skill', metadata: {} }],
    };
    const result = validateResponse(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('metadata.name'))).toBe(true);
  });

  it('missing meta object fails', () => {
    const r = validResponse();
    delete (r as any).meta;
    const result = validateResponse(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('meta'))).toBe(true);
  });

  it('meta.total not a number fails', () => {
    const r = {
      ...validResponse(),
      meta: { ...validResponse().meta, total: 'many' },
    };
    const result = validateResponse(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('meta.total'))).toBe(true);
  });

  it('meta.page not a number fails', () => {
    const r = {
      ...validResponse(),
      meta: { ...validResponse().meta, page: 'first' },
    };
    const result = validateResponse(r);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('meta.page'))).toBe(true);
  });

  it('null input fails', () => {
    const result = validateResponse(null);
    expect(result.valid).toBe(false);
  });
});

describe('isDuadpManifest', () => {
  it('returns true for valid manifest', () => {
    expect(isDuadpManifest(validManifest())).toBe(true);
  });

  it('returns false for invalid input', () => {
    expect(isDuadpManifest({})).toBe(false);
    expect(isDuadpManifest(null)).toBe(false);
    expect(isDuadpManifest('string')).toBe(false);
    expect(isDuadpManifest({ protocol_version: '0.1.0' })).toBe(false);
  });
});
