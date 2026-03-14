import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublishAuthorizationResult } from './publish-authorization.js';
import { buildInspectorResponse } from './inspector.js';

test('buildInspectorResponse aggregates DID, provenance, revocation, and policy evidence', async () => {
  const resource = {
    apiVersion: 'ossa/v0.5',
    kind: 'Agent',
    metadata: {
      name: 'inspector-agent',
      trust_tier: 'community',
    },
    identity: {
      gaid: 'agent://discover.duadp.org/agents/inspector-agent',
      did: 'did:web:discover.duadp.org',
      operational: {
        endpoint: 'https://discover.duadp.org/api/v1/agents/inspector-agent',
      },
    },
    provenance: {
      publisher: { name: 'BlueFly', url: 'https://bluefly.io' },
      license: 'Apache-2.0',
      source_url: 'https://gitlab.com/blueflyio/duadp/duadp',
    },
  };

  const policyFor = (principalId: string): PublishAuthorizationResult => ({
    principal_id: principalId,
    context: { trust_tier: 'community', has_signature: false, has_did: true, confidence_score: 0, validation_passed: false },
    global_policy: {
      decision: principalId === 'anonymous' ? 'Deny' : 'Allow',
      diagnostics: { reason: [principalId === 'anonymous' ? 'policy8' : 'policy1'], errors: [] },
      evaluation_ms: 1,
    },
    manifest_policy: null,
    effective_decision: principalId === 'anonymous' ? 'Deny' : 'Allow',
  });

  const response = await buildInspectorResponse({
    gaid: 'agent://discover.duadp.org/agents/inspector-agent',
    resource,
    sourceNode: 'DUADP Discovery Node',
    resolvedVia: 'local',
    baseUrl: 'https://discover.duadp.org',
    revocationRecord: {
      gaid: 'agent://discover.duadp.org/agents/inspector-agent',
      kind: 'Agent',
      name: 'inspector-agent',
      reason: 'superseded',
      revoked_by: 'auth:1234567890ab',
      origin_node: 'did:web:discover.duadp.org',
      created_at: '2026-03-13T12:00:00Z',
    },
    fetchFn: async () =>
      new Response(JSON.stringify({
        id: 'did:web:discover.duadp.org',
        verificationMethod: [{ id: '#key-1' }, { id: '#key-2' }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    verifyTrustTierFn: async () => ({
      verified_tier: 'community',
      claimed_tier: 'community',
      checks: [],
      passed: true,
      downgraded: false,
    }),
    verifySignatureFn: async () => ({
      verified: false,
      trustLevel: 'none',
      requiresSignature: false,
      checks: [{ check: 'identity_present', passed: true }],
    }),
    authorizePublishFn: async (inputResource, principalId) => {
      assert.equal(inputResource, resource);
      return policyFor(principalId);
    },
  });

  assert.equal(response.did.resolved, true);
  assert.equal(response.did.verification_method_count, 2);
  assert.equal(response.revocation.revoked, true);
  assert.equal(response.policy.anonymous_publish.effective_decision, 'Deny');
  assert.equal(response.policy.claimed_publisher_publish.effective_decision, 'Allow');
  assert.equal(response.provenance.license, 'Apache-2.0');
  assert.ok(response.provenance.links.some((link) => link.rel === 'publisher'));
  assert.ok(response.provenance.links.some((link) => link.rel === 'resource'));
});
