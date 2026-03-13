/**
 * Publisher Signature Verification — DUADP runtime enforcement
 *
 * Verifies Ed25519 signatures on published resources using DID-resolved public keys.
 * Rejects unsigned or improperly signed resources with 403.
 */

import { verifyResourceIdentity, canonicalize } from '@bluefly/duadp';
import * as crypto from 'node:crypto';

export interface SignatureVerificationResult {
  verified: boolean;
  trustLevel: 'full' | 'partial' | 'none';
  checks: Array<{ check: string; passed: boolean; detail?: string }>;
  requiresSignature: boolean;
}

// Minimal base58btc decoder for did:key (z...)
function decodeBase58Btc(str: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
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

interface SignatureVerifierDeps {
  verifyIdentity?: typeof verifyResourceIdentity;
}

/**
 * Verify the signature on a published resource.
 *
 * Enforcement rules:
 * - Resources with trust_tier >= 3 (verified/certified) MUST have valid signatures
 * - Resources with identity.did SHOULD have valid signatures
 * - Resources without identity are allowed (tier_1, community submissions)
 */
export async function verifyPublisherSignature(
  resource: Record<string, unknown>,
  deps: SignatureVerifierDeps = {},
): Promise<SignatureVerificationResult> {
  const identity = resource.identity as
    | Record<string, unknown>
    | undefined;
  const metadata = resource.metadata as
    | Record<string, unknown>
    | undefined;
  const trustTier = metadata?.trust_tier as string | undefined;

  // Determine if signature is required based on trust tier
  const tier = parseTier(trustTier);
  const requiresSignature = tier >= 3;

  // No identity = community submission, skip verification
  if (!identity || !identity.did) {
    return {
      verified: !requiresSignature,
      trustLevel: 'none',
      checks: [
        {
          check: 'identity_present',
          passed: false,
          detail: 'No identity/DID — signature verification skipped',
        },
      ],
      requiresSignature,
    };
  }

  // Handle did:key locally (self-verifying Ed25519)
  const did = identity.did as string;
  console.log(`[signature-verifier] Checking DID: ${did}`);
  if (did.startsWith('did:key:z') && resource.signature) {
    const sigBlock = resource.signature as Record<string, string>;
    console.log(`[signature-verifier] Found did:key:z and signature. Algorithm: ${sigBlock.algorithm}`);
    if (sigBlock.algorithm === 'Ed25519' && sigBlock.value) {
      try {
        // Parse multicodec ed25519-pub (0xed01)
        const multicodec = decodeBase58Btc(did.replace('did:key:z', ''));
        console.log(`[signature-verifier] Multicodec bytes: ${multicodec[0].toString(16)} ${multicodec[1].toString(16)}`);
        if (multicodec[0] === 0xed && multicodec[1] === 0x01) {
          const rawPubKey = multicodec.slice(2);
          
          // Recreate canonical payload (strip signature and content_hash, which are added post-signing)
          const payload = { ...resource };
          delete payload.signature;
          delete payload.content_hash;
          
          const canonicalStr = canonicalize(payload as any);
          const canonicalData = Buffer.from(canonicalStr);

          // Verify with Node crypto
          const keyObject = crypto.createPublicKey({
            key: Buffer.concat([
              Buffer.from('302a300506032b6570032100', 'hex'), // SubjectPublicKeyInfo prefix for Ed25519
              rawPubKey
            ]),
            format: 'der',
            type: 'spki'
          });

          // sigBlock.value is base64url encoded. Node.js Buffer.from('...', 'base64') 
          // supports base64url automatically in recent versions.
          const verified = crypto.verify(null, canonicalData, keyObject, Buffer.from(sigBlock.value, 'base64'));
          
          return {
            verified,
            trustLevel: verified ? 'full' : 'none',
            requiresSignature,
            checks: [
              { check: 'identity_present', passed: true, detail: 'did:key parsed' },
              { check: 'signature_valid', passed: verified, detail: verified ? 'Valid Ed25519 signature' : 'Invalid signature for payload' }
            ]
          };
        }
      } catch (err) {
        console.warn('Local did:key verification failed', err);
      }
    }
  }

  // Run the full verification chain from the SDK
  const verifyIdentity = deps.verifyIdentity ?? verifyResourceIdentity;

  // Create a copy of the resource and remove content_hash before verification
  // The SDK's verifyResourceIdentity function handles stripping the signature internally.
  const resourceForVerification = { ...resource };
  delete resourceForVerification.content_hash;

  const result = await verifyIdentity(resourceForVerification as any, {
    skipLifecycle: false,
  });

  // Basic Trust List enforcement
  const trustedDids = (process.env.TRUSTED_DIDS || '').split(',').filter(Boolean);
  if (result.verified && trustedDids.length > 0) {
    if (trustedDids.includes(identity.did as string)) {
      result.trustLevel = 'full';
      result.checks.push({ check: 'trusted_did_list', passed: true, detail: 'DID is in the trusted list' });
    } else {
      result.trustLevel = 'partial';
      result.checks.push({ check: 'trusted_did_list', passed: false, detail: 'DID not found in trusted list' });
    }
  }

  return {
    verified: result.verified,
    trustLevel: result.trustLevel,
    checks: result.checks,
    requiresSignature,
  };
}

function parseTier(tier?: string): number {
  if (!tier) return 1;

  const named: Record<string, number> = {
    community: 1,
    signed: 2,
    'verified-signature': 3,
    verified: 4,
    official: 5,
    certified: 5,
  };
  if (named[tier] !== undefined) return named[tier];

  const match = tier.match(/tier_(\d)/);
  return match ? parseInt(match[1]) : 1;
}
