/**
 * Cedar Policy Evaluator — Runtime authorization enforcement
 *
 * DUADP owns runtime Cedar evaluation. OSSA owns schema + offline validation.
 * This module wraps @cedar-policy/cedar-wasm for request-time authorization.
 */

import {
  checkParsePolicySet,
  isAuthorized,
  type AuthorizationCall,
  type CedarValueJson,
  type EntityJson,
  type TypeAndId,
} from '@cedar-policy/cedar-wasm';

export interface CedarEvaluationRequest {
  principal: TypeAndId;
  action: TypeAndId;
  resource: TypeAndId;
  context?: Record<string, CedarValueJson>;
  policies: string;
  schema?: string;
  entities?: EntityJson[];
}

export interface CedarEvaluationResult {
  decision: 'Allow' | 'Deny';
  diagnostics: {
    reason: string[];
    errors: string[];
  };
  evaluation_ms: number;
}

/**
 * Evaluate a Cedar authorization request.
 */
export function evaluateCedar(
  request: CedarEvaluationRequest,
): CedarEvaluationResult {
  const start = performance.now();

  // Validate policies parse first
  const parseCheck = checkParsePolicySet({
    staticPolicies: request.policies,
  });
  if (parseCheck.type === 'failure') {
    return {
      decision: 'Deny',
      diagnostics: {
        reason: [],
        errors: parseCheck.errors.map(
          (e) => e.message ?? JSON.stringify(e),
        ),
      },
      evaluation_ms: performance.now() - start,
    };
  }

  const call: AuthorizationCall = {
    principal: request.principal,
    action: request.action,
    resource: request.resource,
    context: request.context ?? {},
    policies: {
      staticPolicies: request.policies,
    },
    entities: request.entities ?? [],
  };

  if (request.schema) {
    call.schema = request.schema;
  }

  const answer = isAuthorized(call);

  if (answer.type === 'failure') {
    return {
      decision: 'Deny',
      diagnostics: {
        reason: [],
        errors: answer.errors.map((e) => e.message ?? JSON.stringify(e)),
      },
      evaluation_ms: performance.now() - start,
    };
  }

  return {
    decision: answer.response.decision === 'allow' ? 'Allow' : 'Deny',
    diagnostics: {
      reason: answer.response.diagnostics.reason,
      errors: answer.response.diagnostics.errors.map(
        (e) => e.error.message ?? JSON.stringify(e.error),
      ),
    },
    evaluation_ms: performance.now() - start,
  };
}

/**
 * Build Cedar evaluation from an OSSA manifest's extensions.security.cedar
 * and an incoming request context.
 */
export function evaluateManifestCedar(
  manifest: Record<string, unknown>,
  principal: TypeAndId,
  action: TypeAndId,
  resource: TypeAndId,
  context?: Record<string, CedarValueJson>,
): CedarEvaluationResult | null {
  const extensions = manifest.extensions as
    | Record<string, unknown>
    | undefined;
  const security = extensions?.security as Record<string, unknown> | undefined;
  const cedarExt = security?.cedar as
    | {
        policies: Array<{ policy_text: string }>;
        schema_text?: string;
        default_decision?: string;
      }
    | undefined;

  if (!cedarExt || !cedarExt.policies || cedarExt.policies.length === 0) {
    return null; // No Cedar policies — skip evaluation
  }

  // Concatenate all policy texts
  const combinedPolicies = cedarExt.policies
    .map((p) => p.policy_text)
    .join('\n');

  return evaluateCedar({
    principal,
    action,
    resource,
    context,
    policies: combinedPolicies,
    schema: cedarExt.schema_text,
  });
}
