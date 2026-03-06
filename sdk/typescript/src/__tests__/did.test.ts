import { describe, it, expect, vi } from 'vitest';
import { buildDidWeb, didWebToUrl, verifyResourceIdentity } from '../did.js';
import { mockResource, mockIdentity } from './helpers.js';

describe('buildDidWeb', () => {
  it('domain only produces did:web:<domain>', () => {
    expect(buildDidWeb('acme.com')).toBe('did:web:acme.com');
  });

  it('with path segments', () => {
    expect(buildDidWeb('acme.com', 'agents', 'bot')).toBe('did:web:acme.com:agents:bot');
  });

  it('encodes special characters in domain', () => {
    const result = buildDidWeb('example.com:8080');
    expect(result).toBe('did:web:example.com%3A8080');
  });

  it('encodes special characters in path segments', () => {
    const result = buildDidWeb('acme.com', 'my agent', 'v1/beta');
    expect(result).toContain('my%20agent');
    expect(result).toContain('v1%2Fbeta');
  });
});

describe('didWebToUrl', () => {
  it('root DID resolves to .well-known/did.json', () => {
    expect(didWebToUrl('did:web:acme.com')).toBe('https://acme.com/.well-known/did.json');
  });

  it('path DID resolves to path/did.json', () => {
    expect(didWebToUrl('did:web:acme.com:agents:bot')).toBe('https://acme.com/agents/bot/did.json');
  });

  it('decodes encoded characters', () => {
    const url = didWebToUrl('did:web:example.com%3A8080');
    expect(url).toBe('https://example.com:8080/.well-known/did.json');
  });

  it('decodes encoded path segments', () => {
    const url = didWebToUrl('did:web:acme.com:my%20agent');
    expect(url).toBe('https://acme.com/my agent/did.json');
  });
});

describe('verifyResourceIdentity', () => {
  it('resource without identity returns trustLevel none', async () => {
    const resource = mockResource(); // no identity field
    const result = await verifyResourceIdentity(resource);
    expect(result.trustLevel).toBe('none');
    expect(result.verified).toBe(false);
    expect(result.checks.some(c => c.check === 'identity_present' && !c.passed)).toBe(true);
  });

  it('resource without DID returns trustLevel none', async () => {
    const resource = mockResource({
      identity: {
        gaid: 'agent://acme.com/bot',
      } as any, // force missing did
    });
    const result = await verifyResourceIdentity(resource);
    expect(result.trustLevel).toBe('none');
    expect(result.verified).toBe(false);
    expect(result.checks.some(c => c.check === 'did_present' && !c.passed)).toBe(true);
  });

  it('resource with expired lifecycle returns appropriate check failure', async () => {
    const mockResolveDID = async () => ({
      document: {
        '@context': 'https://www.w3.org/ns/did/v1',
        id: 'did:web:acme.com',
      },
      publicKeys: [],
      uadpEndpoint: undefined,
    });

    const resource = mockResource({
      identity: mockIdentity({
        lifecycle: {
          status: 'active',
          activated: '2020-01-01T00:00:00Z',
          expires: '2020-06-01T00:00:00Z', // expired in the past
        },
      }),
    });

    const result = await verifyResourceIdentity(resource, {
      skipSignature: true,
      resolveDID: mockResolveDID as any,
    });
    const expiryCheck = result.checks.find(c => c.check === 'not_expired');
    expect(expiryCheck).toBeDefined();
    expect(expiryCheck!.passed).toBe(false);
    expect(expiryCheck!.detail).toContain('expired');
  });
});
