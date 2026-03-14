import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizePublish, buildPublishContext } from './publish-authorization.js';

test('buildPublishContext extracts trust and verification signals from a resource', () => {
  const context = buildPublishContext({
    metadata: { trust_tier: 'verified', validation_passed: true, confidence_score: 91 },
    identity: { did: 'did:web:example.com' },
    signature: { value: 'abc123' },
  });

  assert.equal(context.trust_tier, 'verified');
  assert.equal(context.has_signature, true);
  assert.equal(context.has_did, true);
  assert.equal(context.validation_passed, true);
});

test('authorizePublish denies anonymous community publish and allows an authenticated publisher', async () => {
  const resource = {
    apiVersion: 'ossa/v0.5',
    kind: 'Agent',
    metadata: { name: 'inspector-agent', trust_tier: 'community' },
  };

  const anonymous = await authorizePublish(resource, 'anonymous');
  const authenticated = await authorizePublish(resource, 'publisher-1');

  assert.equal(anonymous.effective_decision, 'Deny');
  assert.equal(anonymous.global_policy.decision, 'Deny');
  assert.equal(authenticated.effective_decision, 'Allow');
  assert.equal(authenticated.global_policy.decision, 'Allow');
});

test('authorizePublish respects inline manifest policies in addition to the global policy set', async () => {
  const resource = {
    apiVersion: 'ossa/v0.5',
    kind: 'Agent',
    metadata: { name: 'policy-locked-agent', trust_tier: 'community' },
    extensions: {
      security: {
        cedar: {
          policies: [
            {
              policy_text: `
permit(
  principal == DUADP::Principal::"publisher-1",
  action == DUADP::Action::"publish",
  resource
);`,
            },
          ],
        },
      },
    },
  };

  const denied = await authorizePublish(resource, 'publisher-2');
  const allowed = await authorizePublish(resource, 'publisher-1');

  assert.equal(denied.global_policy.decision, 'Allow');
  assert.equal(denied.manifest_policy?.decision, 'Deny');
  assert.equal(denied.effective_decision, 'Deny');
  assert.equal(allowed.manifest_policy?.decision, 'Allow');
  assert.equal(allowed.effective_decision, 'Allow');
});
