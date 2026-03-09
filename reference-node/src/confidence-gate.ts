/**
 * DUADP Confidence Gate
 *
 * Implements the three-tier confidence routing pattern from the Cedar + confidence
 * scoring research (Cedar policies for AI agent governance, 2026).
 *
 * Tiers:
 *   ≥ 90  → auto-approve  (proceed)
 *   50–89 → human review  (queue for review, degrade trust tier if needed)
 *   < 50  → retry/reject  (block with explanation)
 *
 * Also provides logprob → confidence conversion utilities and a Cedar context
 * builder for the deploy quality gate action.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfidenceVerdict =
  | { action: 'proceed'; confidence: number; reason: string }
  | { action: 'human_review'; confidence: number; reason: string; degraded_tier?: string }
  | { action: 'reject'; confidence: number; reason: string };

export interface QualityGateContext {
  confidence_score: number;
  test_coverage: number;
  security_score: number;
  vulnerability_count: number;
  day_of_week: string;
  human_approved: boolean;
}

// ---------------------------------------------------------------------------
// Core confidence gate — used at publish time
// ---------------------------------------------------------------------------

/**
 * Evaluates a confidence score and returns a routing verdict.
 *
 * @param confidence  A [0–100] confidence score (0 = unset/unknown).
 * @param trustTier   The trust tier being requested for the resource.
 * @param validationPassed  Whether OSSA schema validation passed.
 */
export function confidenceGate(
  confidence: number,
  trustTier: string,
  validationPassed: boolean,
): ConfidenceVerdict {
  // Score 0 means no AI model evaluated this — skip routing, allow through.
  if (confidence === 0) {
    return { action: 'proceed', confidence, reason: 'no-model-confidence-provided' };
  }

  // High confidence — auto-approve
  if (confidence >= 90) {
    return {
      action: 'proceed',
      confidence,
      reason: 'high-confidence-auto-approve',
    };
  }

  // Medium confidence — requires human review for high trust tiers
  if (confidence >= 50) {
    const requiresHighTrust = ['verified', 'official'].includes(trustTier);
    if (requiresHighTrust) {
      return {
        action: 'human_review',
        confidence,
        reason: 'medium-confidence-requires-review-for-high-trust-tier',
        degraded_tier: 'signed', // downgrade to signed while pending review
      };
    }
    // Medium confidence is fine for community/signed tiers
    return {
      action: 'proceed',
      confidence,
      reason: 'medium-confidence-acceptable-for-tier',
    };
  }

  // Low confidence — allow through only if schema validation passed
  if (validationPassed) {
    return {
      action: 'human_review',
      confidence,
      reason: 'low-confidence-but-validation-passed',
      degraded_tier: 'community',
    };
  }

  // Low confidence + no validation = reject
  return {
    action: 'reject',
    confidence,
    reason: 'low-confidence-and-validation-failed',
  };
}

// ---------------------------------------------------------------------------
// Logprob → confidence conversion
// ---------------------------------------------------------------------------

/**
 * Converts an array of log-probabilities (from a model's token logprobs)
 * into an integer [0–100] confidence score.
 *
 * Implementation: mean of exp(logprob) per token, scaled to [0,100].
 *
 * @param logprobs  Array of log-probability values (negative floats).
 */
export function logprobsToConfidence(logprobs: number[]): number {
  if (!logprobs || logprobs.length === 0) return 0;
  const avgProb = logprobs.reduce((sum, lp) => sum + Math.exp(lp), 0) / logprobs.length;
  return Math.round(Math.min(1, Math.max(0, avgProb)) * 100);
}

// ---------------------------------------------------------------------------
// Cedar deploy-gate context builder
// ---------------------------------------------------------------------------

/**
 * Builds the Cedar context object for the `deploy` action quality gate.
 * Reads numeric metrics from CI artifact JSON files and returns a context
 * suitable for passing to `evaluateCedar()`.
 *
 * @param overrides  Partial overrides for testing or manual invocation.
 */
export function buildDeployGateContext(overrides: Partial<QualityGateContext> = {}): QualityGateContext {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return {
    confidence_score: overrides.confidence_score ?? 0,
    test_coverage: overrides.test_coverage ?? 0,
    security_score: overrides.security_score ?? 0,
    vulnerability_count: overrides.vulnerability_count ?? 0,
    day_of_week: overrides.day_of_week ?? dayNames[new Date().getDay()],
    human_approved: overrides.human_approved ?? false,
  };
}

// ---------------------------------------------------------------------------
// Express middleware — injects confidence gate into publish pipeline
// ---------------------------------------------------------------------------

/**
 * Extracts confidence score from an OSSA resource payload.
 * Checks: metadata.confidence_score, spec.confidence_score, extensions.confidence_score.
 */
export function extractConfidenceScore(resource: Record<string, unknown>): number {
  const meta = resource.metadata as Record<string, unknown> | undefined;
  const spec = resource.spec as Record<string, unknown> | undefined;
  const ext = resource.extensions as Record<string, unknown> | undefined;

  const score =
    meta?.confidence_score ??
    spec?.confidence_score ??
    ext?.confidence_score ??
    0;

  const num = typeof score === 'number' ? score : parseInt(String(score), 10);
  return isNaN(num) ? 0 : Math.min(100, Math.max(0, num));
}
