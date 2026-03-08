import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPublisherSignature } from './signature-verifier.js';

test('signature matrix: low-trust tiers do not require signatures when identity is missing', async () => {
  const lowTrustTiers = ['community', 'signed', 'tier_1_read', 'tier_2_publish'];

  for (const trustTier of lowTrustTiers) {
    const result = await verifyPublisherSignature({
      metadata: { trust_tier: trustTier },
    });

    assert.equal(result.requiresSignature, false, `expected no signature requirement for ${trustTier}`);
    assert.equal(result.verified, true, `expected auto-verified result for ${trustTier} without identity`);
  }
});

test('signature matrix: high-trust tiers require signatures when identity is missing', async () => {
  const highTrustTiers = ['verified-signature', 'verified', 'official', 'certified', 'tier_3_publish', 'tier_4_publish'];

  for (const trustTier of highTrustTiers) {
    const result = await verifyPublisherSignature({
      metadata: { trust_tier: trustTier },
    });

    assert.equal(result.requiresSignature, true, `expected signature requirement for ${trustTier}`);
    assert.equal(result.verified, false, `expected verification failure for ${trustTier} without identity`);
  }
});

test('signature matrix: verification result is delegated to SDK identity verifier when identity exists', async () => {
  let called = 0;
  const result = await verifyPublisherSignature(
    {
      metadata: { trust_tier: 'verified-signature' },
      identity: { did: 'did:web:example.com' },
    },
    {
      verifyIdentity: async () => {
        called += 1;
        return {
          verified: true,
          trustLevel: 'full',
          checks: [{ check: 'signature_valid', passed: true }],
        };
      },
    },
  );

  assert.equal(called, 1);
  assert.equal(result.requiresSignature, true);
  assert.equal(result.verified, true);
  assert.equal(result.trustLevel, 'full');
  assert.deepEqual(result.checks, [{ check: 'signature_valid', passed: true }]);
});
