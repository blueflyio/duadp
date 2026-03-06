import { describe, it, expect } from 'vitest';
import {
  canonicalize,
  contentHash,
  generateKeyPair,
  signResource,
  verifySignature,
  exportPublicKey,
  importPublicKey,
  toMultibase,
  fromMultibase,
} from '../crypto.js';
import { mockResource } from './helpers.js';

describe('canonicalize', () => {
  it('produces deterministic output for same input', () => {
    const resource = mockResource();
    const a = canonicalize(resource);
    const b = canonicalize(resource);
    expect(a).toBe(b);
  });

  it('strips signature field before canonicalizing', () => {
    const resource = mockResource();
    const withSig = {
      ...resource,
      signature: {
        algorithm: 'Ed25519' as const,
        value: 'fakesig',
        signer: 'did:web:acme.com',
        timestamp: '2025-01-01T00:00:00Z',
      },
    };
    const withoutSig = canonicalize(resource);
    const withSigCanon = canonicalize(withSig);
    expect(withSigCanon).toBe(withoutSig);
  });

  it('handles nested objects with unsorted keys', () => {
    const a = mockResource({ spec: { z: 1, a: 2, m: { b: 3, a: 1 } } });
    const b = mockResource({ spec: { a: 2, m: { a: 1, b: 3 }, z: 1 } });
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('handles arrays, nulls, numbers, booleans', () => {
    const resource = mockResource({
      spec: {
        arr: [3, 1, 2],
        nothing: null,
        count: 42,
        flag: true,
        nested: { deep: false },
      },
    });
    const result = canonicalize(resource);
    expect(typeof result).toBe('string');
    expect(result).toContain('"arr":[3,1,2]');
    expect(result).toContain('"nothing":null');
    expect(result).toContain('"count":42');
    expect(result).toContain('"flag":true');
  });

  it('throws on undefined input', () => {
    expect(() => canonicalize(undefined as unknown as any)).toThrow();
  });
});

describe('contentHash', () => {
  it('returns hex string', async () => {
    const resource = mockResource();
    const hash = await contentHash(resource);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('same resource produces same hash', async () => {
    const resource = mockResource();
    const h1 = await contentHash(resource);
    const h2 = await contentHash(resource);
    expect(h1).toBe(h2);
  });

  it('different resources produce different hashes', async () => {
    const r1 = mockResource({ metadata: { name: 'skill-a' } });
    const r2 = mockResource({ metadata: { name: 'skill-b' } });
    const h1 = await contentHash(r1);
    const h2 = await contentHash(r2);
    expect(h1).not.toBe(h2);
  });
});

describe('generateKeyPair', () => {
  it('returns CryptoKeyPair', async () => {
    const kp = await generateKeyPair();
    expect(kp).toHaveProperty('privateKey');
    expect(kp).toHaveProperty('publicKey');
  });

  it('private key is extractable', async () => {
    const kp = await generateKeyPair();
    expect(kp.privateKey.extractable).toBe(true);
  });

  it('public key is extractable', async () => {
    const kp = await generateKeyPair();
    expect(kp.publicKey.extractable).toBe(true);
  });
});

describe('signResource', () => {
  it('adds signature field to resource', async () => {
    const kp = await generateKeyPair();
    const resource = mockResource();
    const signed = await signResource(resource, kp.privateKey, 'did:web:acme.com');
    expect(signed.signature).toBeDefined();
    expect(signed.signature!.algorithm).toBe('Ed25519');
    expect(signed.signature!.signer).toBe('did:web:acme.com');
    expect(typeof signed.signature!.timestamp).toBe('string');
  });

  it('adds content_hash field', async () => {
    const kp = await generateKeyPair();
    const resource = mockResource();
    const signed = await signResource(resource, kp.privateKey, 'did:web:acme.com');
    expect(signed.content_hash).toBeDefined();
    expect(signed.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signature value is a string', async () => {
    const kp = await generateKeyPair();
    const resource = mockResource();
    const signed = await signResource(resource, kp.privateKey, 'did:web:acme.com');
    expect(typeof signed.signature!.value).toBe('string');
    expect(signed.signature!.value.length).toBeGreaterThan(0);
  });

  it('signing same resource twice produces same content_hash', async () => {
    const kp = await generateKeyPair();
    const resource = mockResource();
    const s1 = await signResource(resource, kp.privateKey, 'did:web:acme.com');
    const s2 = await signResource(resource, kp.privateKey, 'did:web:acme.com');
    expect(s1.content_hash).toBe(s2.content_hash);
  });
});

describe('verifySignature', () => {
  it('returns true for valid signature', async () => {
    const kp = await generateKeyPair();
    const resource = mockResource();
    const signed = await signResource(resource, kp.privateKey, 'did:web:acme.com');
    const valid = await verifySignature(signed, kp.publicKey);
    expect(valid).toBe(true);
  });

  it('returns false for tampered resource', async () => {
    const kp = await generateKeyPair();
    const resource = mockResource();
    const signed = await signResource(resource, kp.privateKey, 'did:web:acme.com');
    // Tamper with metadata.name after signing
    const tampered = {
      ...signed,
      metadata: { ...signed.metadata, name: 'tampered-name' },
    };
    const valid = await verifySignature(tampered, kp.publicKey);
    expect(valid).toBe(false);
  });

  it('returns false for wrong key', async () => {
    const kp1 = await generateKeyPair();
    const kp2 = await generateKeyPair();
    const resource = mockResource();
    const signed = await signResource(resource, kp1.privateKey, 'did:web:acme.com');
    const valid = await verifySignature(signed, kp2.publicKey);
    expect(valid).toBe(false);
  });

  it('returns false for resource without signature', async () => {
    const kp = await generateKeyPair();
    const resource = mockResource();
    const valid = await verifySignature(resource, kp.publicKey);
    expect(valid).toBe(false);
  });
});

describe('exportPublicKey / importPublicKey', () => {
  it('round-trip: export then import produces equivalent key', async () => {
    const kp = await generateKeyPair();
    const raw = await exportPublicKey(kp.publicKey);
    const imported = await importPublicKey(raw);

    // Verify that the imported key can verify signatures made with the original private key
    const resource = mockResource();
    const signed = await signResource(resource, kp.privateKey, 'did:web:acme.com');
    const valid = await verifySignature(signed, imported);
    expect(valid).toBe(true);
  });

  it('exported key is Uint8Array of 32 bytes', async () => {
    const kp = await generateKeyPair();
    const raw = await exportPublicKey(kp.publicKey);
    expect(raw).toBeInstanceOf(Uint8Array);
    expect(raw.length).toBe(32);
  });
});

describe('toMultibase / fromMultibase', () => {
  it('round-trip: encode then decode returns original bytes', async () => {
    const kp = await generateKeyPair();
    const raw = await exportPublicKey(kp.publicKey);
    const encoded = toMultibase(raw);
    const decoded = fromMultibase(encoded);
    expect(decoded).toEqual(raw);
  });

  it('uses z prefix (base64url multibase)', async () => {
    const kp = await generateKeyPair();
    const raw = await exportPublicKey(kp.publicKey);
    const encoded = toMultibase(raw);
    expect(encoded.startsWith('z')).toBe(true);
  });

  it('fromMultibase throws on non-z prefix', () => {
    expect(() => fromMultibase('m' + 'AAAA')).toThrow('Only z-prefix');
  });
});
