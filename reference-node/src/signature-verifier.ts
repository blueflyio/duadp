/**
 * Publisher Signature Verification — DUADP runtime enforcement
 *
 * Verifies Ed25519 signatures on published resources using DID-resolved public keys.
 * Rejects unsigned or improperly signed resources with 403.
 */

import { verifyResourceIdentity } from '@bluefly/duadp';

export interface SignatureVerificationResult {
  verified: boolean;
  trustLevel: 'full' | 'partial' | 'none';
  checks: Array<{ check: string; passed: boolean; detail?: string }>;
  requiresSignature: boolean;
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

  // Run the full verification chain from the SDK
  const verifyIdentity = deps.verifyIdentity ?? verifyResourceIdentity;
  const result = await verifyIdentity(resource as any, {
    skipLifecycle: false,
  });

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
