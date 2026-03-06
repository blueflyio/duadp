import { describe, it, expect } from 'vitest';
import {
  canonicalize,
  contentHash,
  signResource,
  verifySignature,
  generateKeyPair,
  exportPublicKey,
  importPublicKey,
  toMultibase,
  fromMultibase,
} from '../crypto.js';
import { buildDidWeb, didWebToUrl } from '../did.js';
import type { OssaResource, ResourceIdentity } from '../types.js';
import { mockResource, mockIdentity } from './helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a well-typed OssaResource with optional overrides. */
function resource(overrides: Partial<OssaResource> = {}): OssaResource {
  return mockResource(overrides);
}

/** Build a resource with full identity block. */
function resourceWithIdentity(
  identityOverrides: Partial<ResourceIdentity> = {},
  resourceOverrides: Partial<OssaResource> = {},
): OssaResource {
  return resource({
    ...resourceOverrides,
    identity: mockIdentity(identityOverrides),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E Cryptographic Signing & Identity Pipeline', () => {
  // ── Full signing pipeline ───────────────────────────────────────────────

  describe('full signing pipeline', () => {
    it('signs a resource and verifies the signature', async () => {
      const kp = await generateKeyPair();
      const res = resource();
      const signed = await signResource(res, kp.privateKey, 'did:web:acme.com');

      expect(signed.signature).toBeDefined();
      expect(signed.signature!.algorithm).toBe('Ed25519');
      expect(signed.signature!.signer).toBe('did:web:acme.com');
      expect(signed.signature!.timestamp).toBeDefined();
      expect(signed.content_hash).toBeDefined();

      const valid = await verifySignature(signed, kp.publicKey);
      expect(valid).toBe(true);
    });

    it('fails verification when the resource is tampered with', async () => {
      const kp = await generateKeyPair();
      const res = resource();
      const signed = await signResource(res, kp.privateKey, 'did:web:acme.com');

      // Tamper with the description
      const tampered: OssaResource = {
        ...signed,
        metadata: { ...signed.metadata, description: 'TAMPERED' },
      };

      const valid = await verifySignature(tampered, kp.publicKey);
      expect(valid).toBe(false);
    });
  });

  // ── Key round-trip ──────────────────────────────────────────────────────

  describe('key round-trip (export -> multibase -> import)', () => {
    it('re-imported key verifies signatures from the original private key', async () => {
      const kp = await generateKeyPair();

      // Export -> multibase -> bytes -> import
      const rawBytes = await exportPublicKey(kp.publicKey);
      const multibase = toMultibase(rawBytes);
      expect(multibase.startsWith('z')).toBe(true);

      const decodedBytes = fromMultibase(multibase);
      expect(decodedBytes).toEqual(rawBytes);

      const reimported = await importPublicKey(decodedBytes);

      // Sign with original, verify with re-imported
      const res = resource();
      const signed = await signResource(res, kp.privateKey, 'did:web:roundtrip.com');
      const valid = await verifySignature(signed, reimported);
      expect(valid).toBe(true);
    });
  });

  // ── Content hash consistency ────────────────────────────────────────────

  describe('content hash consistency', () => {
    it('produces the same hash for identical resources', async () => {
      const a = resource({ metadata: { name: 'hash-test', description: 'same' } });
      const b = resource({ metadata: { name: 'hash-test', description: 'same' } });

      const hashA = await contentHash(a);
      const hashB = await contentHash(b);
      expect(hashA).toBe(hashB);
    });

    it('produces different hashes when resources differ', async () => {
      const a = resource({ metadata: { name: 'hash-test', description: 'alpha' } });
      const b = resource({ metadata: { name: 'hash-test', description: 'bravo' } });

      const hashA = await contentHash(a);
      const hashB = await contentHash(b);
      expect(hashA).not.toBe(hashB);
    });
  });

  // ── Canonicalization determinism ────────────────────────────────────────

  describe('canonicalization determinism', () => {
    it('produces identical output regardless of key order', () => {
      const a = { z: 1, a: 2, m: 3 };
      const b = { a: 2, m: 3, z: 1 };

      const resA: OssaResource = {
        apiVersion: 'ossa/v1',
        kind: 'Tool',
        metadata: { name: 'canon-test', ...a },
      };
      const resB: OssaResource = {
        apiVersion: 'ossa/v1',
        kind: 'Tool',
        metadata: { name: 'canon-test', ...b },
      };

      const cA = canonicalize(resA);
      const cB = canonicalize(resB);
      expect(cA).toBe(cB);
    });

    it('returns valid JSON', () => {
      const res = resource();
      const canonical = canonicalize(res);
      expect(() => JSON.parse(canonical)).not.toThrow();
    });

    it('sorts nested objects', () => {
      const res: OssaResource = {
        apiVersion: 'ossa/v1',
        kind: 'Agent',
        metadata: { name: 'nested' },
        spec: { z_key: { b: 2, a: 1 }, a_key: 'first' },
      };
      const canonical = canonicalize(res);
      const parsed = JSON.parse(canonical);

      // In canonical JSON, keys should be sorted
      const specKeys = Object.keys(parsed.spec);
      expect(specKeys).toEqual([...specKeys].sort());

      const nestedKeys = Object.keys(parsed.spec.z_key);
      expect(nestedKeys).toEqual([...nestedKeys].sort());
    });

    it('strips the signature field before canonicalization', () => {
      const res: OssaResource = {
        apiVersion: 'ossa/v1',
        kind: 'Skill',
        metadata: { name: 'sig-strip' },
        signature: {
          algorithm: 'Ed25519',
          value: 'fakesig',
          signer: 'did:web:test.com',
          timestamp: '2025-01-01T00:00:00Z',
        },
      };
      const canonical = canonicalize(res);
      const parsed = JSON.parse(canonical);
      expect(parsed.signature).toBeUndefined();
    });
  });

  // ── Multiple signatures (different key pairs) ──────────────────────────

  describe('multiple signatures', () => {
    it('verifies only with the correct key pair', async () => {
      const kpA = await generateKeyPair();
      const kpB = await generateKeyPair();
      const res = resource();

      // Sign with A
      const signedA = await signResource(res, kpA.privateKey, 'did:web:alice.com');
      expect(await verifySignature(signedA, kpA.publicKey)).toBe(true);
      expect(await verifySignature(signedA, kpB.publicKey)).toBe(false);

      // Sign with B (from the original unsigned resource)
      const signedB = await signResource(res, kpB.privateKey, 'did:web:bob.com');
      expect(await verifySignature(signedB, kpB.publicKey)).toBe(true);
      expect(await verifySignature(signedB, kpA.publicKey)).toBe(false);
    });
  });

  // ── DID utility functions ──────────────────────────────────────────────

  describe('DID utility functions', () => {
    describe('buildDidWeb', () => {
      it('builds a root DID from a domain', () => {
        expect(buildDidWeb('acme.com')).toBe('did:web:acme.com');
      });

      it('builds a DID with path segments', () => {
        expect(buildDidWeb('acme.com', 'agents', 'security-auditor')).toBe(
          'did:web:acme.com:agents:security-auditor',
        );
      });

      it('encodes domain with port', () => {
        const did = buildDidWeb('localhost:3000');
        expect(did).toContain('did:web:');
        expect(did).toContain('3000');
      });
    });

    describe('didWebToUrl', () => {
      it('resolves root domain to .well-known/did.json', () => {
        expect(didWebToUrl('did:web:acme.com')).toBe('https://acme.com/.well-known/did.json');
      });

      it('resolves DID with path', () => {
        expect(didWebToUrl('did:web:acme.com:agents:security-auditor')).toBe(
          'https://acme.com/agents/security-auditor/did.json',
        );
      });
    });

    describe('DID round-trip', () => {
      it('builds a DID then converts to URL consistently', () => {
        const did = buildDidWeb('example.org', 'nodes', 'primary');
        expect(did).toBe('did:web:example.org:nodes:primary');

        const url = didWebToUrl(did);
        expect(url).toBe('https://example.org/nodes/primary/did.json');
      });
    });
  });

  // ── Resource identity structure ────────────────────────────────────────

  describe('resource identity structure', () => {
    it('preserves identity after signing and sets content_hash + signature', async () => {
      const kp = await generateKeyPair();
      const res = resourceWithIdentity(
        {
          gaid: 'agent://acme.com/security-auditor',
          did: 'did:web:acme.com:agents:security-auditor',
          lifecycle: { status: 'active' },
        },
        {
          metadata: { name: 'security-auditor', version: '2.0.0', description: 'Audits security' },
        },
      );

      const signed = await signResource(res, kp.privateKey, 'did:web:acme.com');

      // Identity survives signing
      expect(signed.identity).toBeDefined();
      expect(signed.identity!.gaid).toBe('agent://acme.com/security-auditor');
      expect(signed.identity!.did).toBe('did:web:acme.com:agents:security-auditor');
      expect(signed.identity!.lifecycle!.status).toBe('active');

      // content_hash and signature are set
      expect(signed.content_hash).toBeDefined();
      expect(typeof signed.content_hash).toBe('string');
      expect(signed.content_hash!.length).toBeGreaterThan(0);

      expect(signed.signature).toBeDefined();
      expect(signed.signature!.value).toBeDefined();
      expect(signed.signature!.value.length).toBeGreaterThan(0);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles resource with no spec (minimal resource)', async () => {
      const kp = await generateKeyPair();
      const res: OssaResource = {
        apiVersion: 'ossa/v1',
        kind: 'Skill',
        metadata: { name: 'minimal' },
      };

      const signed = await signResource(res, kp.privateKey, 'did:web:minimal.com');
      expect(await verifySignature(signed, kp.publicKey)).toBe(true);
    });

    it('handles resource with deeply nested objects', async () => {
      const kp = await generateKeyPair();
      const res: OssaResource = {
        apiVersion: 'ossa/v1',
        kind: 'Agent',
        metadata: { name: 'deep-nest' },
        spec: {
          level1: {
            level2: {
              level3: {
                level4: { value: 'deep' },
              },
            },
          },
        },
      };

      const signed = await signResource(res, kp.privateKey, 'did:web:deep.com');
      expect(await verifySignature(signed, kp.publicKey)).toBe(true);

      // Tamper deep inside
      const tampered: OssaResource = {
        ...signed,
        spec: {
          level1: {
            level2: {
              level3: {
                level4: { value: 'CHANGED' },
              },
            },
          },
        },
      };
      expect(await verifySignature(tampered, kp.publicKey)).toBe(false);
    });

    it('handles resource with array values', async () => {
      const kp = await generateKeyPair();
      const res: OssaResource = {
        apiVersion: 'ossa/v1',
        kind: 'Tool',
        metadata: { name: 'array-test', tags: ['alpha', 'bravo', 'charlie'] },
        spec: {
          protocols: ['mcp', 'a2a', 'rest'],
          nested: [{ a: 1 }, { b: 2 }],
        },
      };

      const signed = await signResource(res, kp.privateKey, 'did:web:arrays.com');
      expect(await verifySignature(signed, kp.publicKey)).toBe(true);
    });

    it('handles resource with null values', async () => {
      const kp = await generateKeyPair();
      const res: OssaResource = {
        apiVersion: 'ossa/v1',
        kind: 'Skill',
        metadata: { name: 'null-test', description: undefined },
        spec: { optional_field: null },
      };

      const signed = await signResource(res, kp.privateKey, 'did:web:nulls.com');
      expect(await verifySignature(signed, kp.publicKey)).toBe(true);
    });

    it('handles resource with unicode strings in metadata', async () => {
      const kp = await generateKeyPair();
      const res: OssaResource = {
        apiVersion: 'ossa/v1',
        kind: 'Agent',
        metadata: {
          name: 'unicode-test',
          description: 'Handles CJK: \u4F60\u597D\u4E16\u754C, emoji: \u{1F916}\u{1F512}, accents: caf\u00E9 r\u00E9sum\u00E9',
        },
        spec: { greeting: '\u{1F44B} Hello \u4E16\u754C' },
      };

      const signed = await signResource(res, kp.privateKey, 'did:web:unicode.com');
      expect(await verifySignature(signed, kp.publicKey)).toBe(true);
    });

    it('handles resource with empty metadata.description', async () => {
      const kp = await generateKeyPair();
      const res: OssaResource = {
        apiVersion: 'ossa/v1',
        kind: 'Skill',
        metadata: { name: 'empty-desc', description: '' },
      };

      const signed = await signResource(res, kp.privateKey, 'did:web:empty.com');
      expect(await verifySignature(signed, kp.publicKey)).toBe(true);
    });

    it('returns false for a resource with no signature', async () => {
      const kp = await generateKeyPair();
      const res = resource();
      const valid = await verifySignature(res, kp.publicKey);
      expect(valid).toBe(false);
    });
  });
});
