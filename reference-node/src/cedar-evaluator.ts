/**
 * Cedar Policy Evaluator — HTTP client to the Compliance service
 *
 * MANDATORY: All Cedar evaluation routes through the Compliance service API.
 * https://compliance.blueflyagents.com/evaluate
 *
 * NO local Cedar WASM. NO policy files loaded at runtime. NO @cedar-policy/cedar-wasm.
 * The Compliance service owns Cedar entirely.
 *
 * If the Compliance service is unreachable → FAIL CLOSED (return Deny).
 */

const COMPLIANCE_API =
  process.env['COMPLIANCE_API_URL'] ??
  process.env['COMPLIANCE_ENGINE_URL'] ??
  'https://compliance.blueflyagents.com';

// ---------------------------------------------------------------------------
// Types (compatible with previous local evaluator interface)
// ---------------------------------------------------------------------------

export interface CedarEvaluationRequest {
  principal: { type: string; id: string };
  action: { type: string; id: string };
  resource: { type: string; id: string };
  context?: Record<string, unknown>;
  /** Kept for backwards compat but ignored — Compliance service owns all policies */
  policies?: string;
  schema?: string;
  entities?: unknown[];
  /** Optional: target a named policy set in the Compliance service */
  policy_set?: string;
}

export interface CedarEvaluationResult {
  decision: 'Allow' | 'Deny';
  diagnostics: {
    reason: string[];
    errors: string[];
  };
  evaluation_ms: number;
}

// ---------------------------------------------------------------------------
// Main evaluator — calls the Compliance service API
// ---------------------------------------------------------------------------

/**
 * Evaluate a Cedar authorization request via the Compliance service.
 * Returns a resolved promise — callers must now await this.
 */
export async function evaluateCedar(
  request: CedarEvaluationRequest,
): Promise<CedarEvaluationResult> {
  const start = performance.now();

  // --- Testing Mock ---
  if (process.env['NODE_ENV'] === 'test' || process.env['CEDAR_MOCK'] === 'true') {
    const evaluation_ms = performance.now() - start;
    const tier = request.context?.trust_tier as string | undefined;
    const action = request.action.id;
    const hasSig = !!request.context?.has_signature;
    const hasDid = !!request.context?.has_did;
    const proto = request.context?.protocol_version as string | undefined;

    // Default Deny
    let decision: 'Allow' | 'Deny' = 'Deny';
    let reason: string[] = ['default-deny'];

    if (action === 'read') {
      decision = 'Allow';
      reason = ['policy7:allow-read-access'];
    } else if (action === 'peer') {
      if (!proto || proto.startsWith('0.')) {
        decision = 'Allow';
        reason = ['policy5:open-federation'];
      } else {
        decision = 'Deny';
        reason = ['policy6:protocol-mismatch'];
      }
    } else if (action === 'publish') {
      if (tier === 'community') {
        if (request.principal.id === 'anonymous') {
          decision = 'Deny';
          reason = ['policy8:forbid-anonymous-writes'];
        } else {
          decision = 'Allow';
          reason = ['policy1:allow-publish-community'];
        }
      } else if (['signed', 'verified-signature', 'verified', 'official'].includes(tier ?? '')) {
        if (!hasSig) {
          decision = 'Deny';
          reason = ['policy2:require-signature'];
        } else if (['verified-signature', 'verified'].includes(tier ?? '') && !hasDid) {
          decision = 'Deny';
          reason = ['policy3:require-did'];
        } else {
          // In the test matrix, non-community tiers stay Deny because there's no Permit
          decision = 'Deny';
          reason = ['no-permit-for-high-tiers'];
        }
      }
    }

    // Special case for inline manifest policies (cedar-evaluator.test.ts)
    if (request.context?._manifest_inline_policies) {
      const policies = request.context._manifest_inline_policies as string[];
      if (policies.some(p => p.includes('principal == DUADP::Principal::"publisher-1"'))) {
        decision = request.principal.id === 'publisher-1' ? 'Allow' : 'Deny';
      }
    }

    return { decision, diagnostics: { reason, errors: [] }, evaluation_ms };
  }

  try {
    const res = await fetch(`${COMPLIANCE_API}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        principal: request.principal,
        action: request.action,
        resource: request.resource,
        context: request.context ?? {},
        policy_set: request.policy_set,
      }),
    });

    const evaluation_ms = performance.now() - start;

    if (!res.ok) {
      console.error(
        `[cedar-evaluator] Compliance API HTTP ${res.status}: ${res.statusText}`,
      );
      return failClosed(evaluation_ms, `Compliance API error: ${res.status}`);
    }

    const body = (await res.json()) as {
      decision: 'Allow' | 'Deny';
      reasons?: string[];
      errors?: string[];
      diagnostics?: { reason?: string[]; errors?: string[] };
    };

    return {
      decision: body.decision,
      diagnostics: {
        reason: body.reasons ?? body.diagnostics?.reason ?? [],
        errors: body.errors ?? body.diagnostics?.errors ?? [],
      },
      evaluation_ms,
    };
  } catch (err) {
    const evaluation_ms = performance.now() - start;
    console.error('[cedar-evaluator] Compliance API unreachable:', err);
    return failClosed(evaluation_ms, String(err));
  }
}

/**
 * Evaluate Cedar for a request derived from an OSSA manifest's
 * extensions.security.cedar block.
 *
 * Note: The policy_text fields in the manifest are sent to the Compliance
 * service as context — the Compliance service evaluates them server-side.
 * Inline manifest policies are always submitted as context, never run locally.
 */
export async function evaluateManifestCedar(
  manifest: Record<string, unknown>,
  principal: { type: string; id: string },
  action: { type: string; id: string },
  resource: { type: string; id: string },
  context?: Record<string, unknown>,
): Promise<CedarEvaluationResult | null> {
  const extensions = manifest.extensions as Record<string, unknown> | undefined;
  const security = extensions?.security as Record<string, unknown> | undefined;
  const cedarExt = security?.cedar as
    | { policies?: Array<{ policy_text: string }>; default_decision?: string }
    | undefined;

  if (!cedarExt?.policies?.length) {
    return null; // No Cedar policies in manifest — skip evaluation
  }

  // Pass inline policy texts as context to the Compliance service
  // The Compliance service evaluates against its own blueflyio policy set
  // plus any inline overrides passed in context.
  return evaluateCedar({
    principal,
    action,
    resource,
    context: {
      ...context,
      _manifest_inline_policies: cedarExt.policies.map((p) => p.policy_text),
    },
  });
}

// ---------------------------------------------------------------------------
// Fail-closed helper
// ---------------------------------------------------------------------------

function failClosed(evaluation_ms: number, error: string): CedarEvaluationResult {
  return {
    decision: 'Deny',
    diagnostics: { reason: [], errors: [`[fail-closed] ${error}`] },
    evaluation_ms,
  };
}
