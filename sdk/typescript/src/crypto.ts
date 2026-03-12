import canonicalizeRFC8785 from 'canonicalize';
import type { OssaResource, ResourceSignature } from './types.js';

/**
 * Canonical JSON serialization for signing.
 * Uses RFC 8785 JSON Canonicalization Scheme (JCS) via the `canonicalize` package.
 * Strips the `signature` field before canonicalization.
 */
export function canonicalize(resource: OssaResource): string {
  const { signature: _, content_hash: _h, ...rest } = resource as OssaResource & { signature?: unknown; content_hash?: unknown };
  const result = canonicalizeRFC8785(rest);
  if (!result) throw new Error('Failed to canonicalize resource');
  return result;
}

/**
 * Compute SHA-256 content hash of a resource (canonical form).
 * Works in Node.js and browsers with Web Crypto API.
 */
export async function contentHash(resource: OssaResource): Promise<string> {
  const canonical = canonicalize(resource);
  const encoded = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sign a resource with Ed25519.
 *
 * @param resource - The OSSA resource to sign
 * @param privateKey - Ed25519 private key (CryptoKey from Web Crypto)
 * @param signer - DID of the signer (e.g., "did:web:acme.com")
 * @returns The resource with a `signature` field attached
 */
export async function signResource(
  resource: OssaResource,
  privateKey: CryptoKey,
  signer: string,
): Promise<OssaResource> {
  const canonical = canonicalize(resource);
  const encoded = new TextEncoder().encode(canonical);
  const sigBuffer = await crypto.subtle.sign('Ed25519', privateKey, encoded as BufferSource);
  const sigBytes = new Uint8Array(sigBuffer);
  const value = base64url(sigBytes);

  const signature: ResourceSignature = {
    algorithm: 'Ed25519',
    value,
    signer,
    timestamp: new Date().toISOString(),
  };

  return { ...resource, signature, content_hash: await contentHash(resource) };
}

/**
 * Verify an Ed25519 signature on a resource.
 *
 * @param resource - The signed OSSA resource
 * @param publicKey - Ed25519 public key (CryptoKey from Web Crypto)
 * @returns true if signature is valid
 */
export async function verifySignature(
  resource: OssaResource,
  publicKey: CryptoKey,
): Promise<boolean> {
  if (!resource.signature) return false;
  if (resource.signature.algorithm !== 'Ed25519') return false;

  const canonical = canonicalize(resource);
  const encoded = new TextEncoder().encode(canonical);
  const sigBytes = base64urlDecode(resource.signature.value);

  return crypto.subtle.verify('Ed25519', publicKey, sigBytes.buffer as ArrayBuffer, encoded as BufferSource);
}

/**
 * Generate an Ed25519 key pair for signing DUADP resources.
 */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
}

/**
 * Export a public key to raw bytes (32 bytes for Ed25519).
 */
export async function exportPublicKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
}

/**
 * Import a raw Ed25519 public key (32 bytes).
 */
export async function importPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw.buffer as ArrayBuffer, 'Ed25519', true, ['verify']);
}

/**
 * Encode raw public key as multibase standard `did:key`.
 * For Ed25519, we prepend the multicodec prefix `0xed01` (two bytes)
 * and encode the result using base58btc prefixed with 'z'.
 */
export function toMultibase(raw: Uint8Array): string {
  if (raw.length !== 32) {
    throw new Error('Ed25519 public key must be exactly 32 bytes');
  }
  const prefixed = new Uint8Array(2 + raw.length);
  prefixed[0] = 0xed;
  prefixed[1] = 0x01;
  prefixed.set(raw, 2);
  return 'z' + encodeBase58Btc(prefixed);
}

/**
 * Decode a multibase-encoded public key.
 * Expected format: z + base58btc(0xed01 + 32-byte-raw)
 */
export function fromMultibase(multibase: string): Uint8Array {
  if (!multibase.startsWith('z')) {
    throw new Error('Only z-prefix (base58btc) multibase supported');
  }
  const decoded = decodeBase58Btc(multibase.slice(1));
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error('Invalid or unsupported multicodec prefix (expected 0xed01 for Ed25519)');
  }
  return decoded.slice(2);
}

/**
 * High-level utility to generate a new did:key identity.
 */
export async function generateDidKeyIdentity(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyRaw: Uint8Array;
  did: string;
}> {
  const keyPair = await generateKeyPair();
  const publicKeyRaw = await exportPublicKey(keyPair.publicKey);
  const did = `did:key:${toMultibase(publicKeyRaw)}`;
  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeyRaw,
    did,
  };
}

/**
 * High-level utility to sign a resource and automatically attach the DID.
 */
export async function signWithDidKey(
  resource: OssaResource,
  privateKey: CryptoKey,
  did: string
): Promise<OssaResource> {
  const resourceToSign = { ...resource };
  
  // Ensure the identity.did matches the signer before signing
  if (!resourceToSign.identity) {
    resourceToSign.identity = { 
      gaid: `agent://${resourceToSign.metadata?.name || 'unknown'}`,
      did,
    };
  } else if (!resourceToSign.identity.did) {
    resourceToSign.identity.did = did;
  }
  
  return signResource(resourceToSign, privateKey, did);
}

// --- Base64url helpers ---

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- Base58btc helpers ---

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58Btc(source: Uint8Array): string {
  if (source.length === 0) return '';
  let digits = [0];
  for (let i = 0; i < source.length; ++i) {
    for (let j = 0; j < digits.length; ++j) digits[j] <<= 8;
    digits[0] += source[i];
    let carry = 0;
    for (let j = 0; j < digits.length; ++j) {
      digits[j] += carry;
      carry = (digits[j] / 58) | 0;
      digits[j] %= 58;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = '';
  // Deal with leading zeros
  for (let i = 0; i < source.length && source[i] === 0; ++i) {
    str += '1';
  }
  for (let i = digits.length - 1; i >= 0; --i) {
    str += ALPHABET[digits[i]];
  }
  return str;
}

function decodeBase58Btc(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (!(ALPHABET.includes(c))) throw new Error('Non-base58 character');
    for (let j = 0; j < bytes.length; j++) bytes[j] *= 58;
    bytes[0] += ALPHABET.indexOf(c);
    let carry = 0;
    for (let j = 0; j < bytes.length; j++) {
      bytes[j] += carry;
      carry = bytes[j] >> 8;
      bytes[j] &= 0xff;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length && str[i] === '1'; i++) bytes.push(0);
  return new Uint8Array(bytes.reverse());
}
