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
 * Generate an Ed25519 key pair for signing UADP resources.
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
 * Encode raw public key as multibase (z-prefix, base64url).
 */
export function toMultibase(raw: Uint8Array): string {
  return 'z' + base64url(raw);
}

/**
 * Decode a multibase-encoded public key.
 */
export function fromMultibase(multibase: string): Uint8Array {
  if (!multibase.startsWith('z')) throw new Error('Only z-prefix (base64url) multibase supported');
  return base64urlDecode(multibase.slice(1));
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
