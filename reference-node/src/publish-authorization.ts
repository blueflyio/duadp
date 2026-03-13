import type { OssaResource } from '@bluefly/duadp';
import { evaluateCedar, evaluateManifestCedar, type CedarEvaluationResult } from './cedar-evaluator.js';
import { extractConfidenceScore } from './confidence-gate.js';

export interface PublishAuthorizationResult {
  principal_id: string;
  context: Record<string, unknown>;
  global_policy: CedarEvaluationResult;
  manifest_policy: CedarEvaluationResult | null;
  effective_decision: 'Allow' | 'Deny';
}

interface PublishAuthorizationDeps {
  evaluateCedarFn?: typeof evaluateCedar;
  evaluateManifestCedarFn?: typeof evaluateManifestCedar;
}

export function buildPublishContext(resource: OssaResource | Record<string, unknown>): Record<string, unknown> {
  const metadata = (resource as Record<string, any>).metadata ?? {};
  const identity = (resource as Record<string, any>).identity ?? {};
  const signature = (resource as Record<string, any>).signature ?? {};

  return {
    trust_tier: metadata.trust_tier ?? 'community',
    has_signature: Boolean(signature.value),
    has_did: Boolean(identity.did),
    confidence_score: extractConfidenceScore(resource as Record<string, unknown>),
    validation_passed: Boolean(metadata.validation_passed),
  };
}

export async function authorizePublish(
  resource: OssaResource | Record<string, unknown>,
  principalId: string,
  deps: PublishAuthorizationDeps = {},
): Promise<PublishAuthorizationResult> {
  const evaluateCedarFn = deps.evaluateCedarFn ?? evaluateCedar;
  const evaluateManifestCedarFn = deps.evaluateManifestCedarFn ?? evaluateManifestCedar;
  const resourceName = (resource as Record<string, any>)?.metadata?.name || 'unknown';
  const context = buildPublishContext(resource);

  const globalPolicy = await evaluateCedarFn({
    principal: { type: 'DUADP::Principal', id: principalId },
    action: { type: 'DUADP::Action', id: 'publish' },
    resource: { type: 'DUADP::Resource', id: resourceName },
    context,
  });

  const manifestPolicy = await evaluateManifestCedarFn(
    resource as Record<string, unknown>,
    { type: 'DUADP::Principal', id: principalId },
    { type: 'DUADP::Action', id: 'publish' },
    { type: 'DUADP::Resource', id: resourceName },
    context,
  );

  const effectiveDecision =
    globalPolicy.decision === 'Allow' &&
    (!manifestPolicy || manifestPolicy.decision === 'Allow')
      ? 'Allow'
      : 'Deny';

  return {
    principal_id: principalId,
    context,
    global_policy: globalPolicy,
    manifest_policy: manifestPolicy,
    effective_decision: effectiveDecision,
  };
}
