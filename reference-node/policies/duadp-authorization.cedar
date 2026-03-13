// DUADP Authorization Policies
// Enforced at runtime by the reference node's Cedar evaluator.
// Version: 2.0.0 — adds confidence scoring, quality gates, and entity-based anonymous blocking.

// =============================================================================
// PUBLISH AUTHORIZATION — who can register agents/skills/tools
// =============================================================================

// Policy 1: Allow authenticated principals to publish community-tier resources
@id("allow-publish-community")
permit(
  principal is DUADP::Principal,
  action == DUADP::Action::"publish",
  resource is DUADP::Resource
) when {
  context has trust_tier &&
  context.trust_tier == "community" &&
  principal != DUADP::Principal::"anonymous"
};

// Policy 1b: Low-confidence community publishes still require ≥50 score or validation_passed
@id("require-confidence-for-publish")
forbid(
  principal is DUADP::Principal,
  action == DUADP::Action::"publish",
  resource is DUADP::Resource
) when {
  context has confidence_score &&
  context.confidence_score > 0 &&
  context.confidence_score < 50 &&
  !(context has validation_passed && context.validation_passed)
};

// Policy 2: Require signed identity for signed-tier publishing
@id("require-signed-for-signed-tier")
forbid(
  principal is DUADP::Principal,
  action == DUADP::Action::"publish",
  resource is DUADP::Resource
) when {
  context has trust_tier &&
  (context.trust_tier == "signed" ||
   context.trust_tier == "verified-signature" ||
   context.trust_tier == "verified" ||
   context.trust_tier == "official") &&
  !(context has has_signature && context.has_signature)
};

// Policy 3: Require DID for verified-tier publishing
@id("require-did-for-verified-tier")
forbid(
  principal is DUADP::Principal,
  action == DUADP::Action::"publish",
  resource is DUADP::Resource
) when {
  context has trust_tier &&
  (context.trust_tier == "verified-signature" ||
   context.trust_tier == "verified") &&
  !(context has has_did && context.has_did)
};

// =============================================================================
// REVOCATION AUTHORIZATION — who can revoke resources
// =============================================================================

// Policy 4: Only the original publisher or governance admins can revoke
@id("restrict-revocation")
forbid(
  principal is DUADP::Principal,
  action == DUADP::Action::"revoke",
  resource is DUADP::Resource
) unless {
  (context has is_publisher && context.is_publisher) ||
  (context has is_governance_admin && context.is_governance_admin)
};

// =============================================================================
// FEDERATION AUTHORIZATION — who can peer with this node
// =============================================================================

// Policy 5: Allow any node to request peering (open federation by default)
@id("allow-federation-peering")
permit(
  principal is DUADP::Principal,
  action == DUADP::Action::"peer",
  resource is DUADP::Resource
);

// Policy 6: Forbid peering from nodes with mismatched protocol versions
@id("forbid-protocol-mismatch")
forbid(
  principal is DUADP::Principal,
  action == DUADP::Action::"peer",
  resource is DUADP::Resource
) when {
  context has protocol_version &&
  !(context.protocol_version like "0.*")
};

// =============================================================================
// QUERY AUTHORIZATION — access control for search/read
// =============================================================================

// Policy 7: Allow read access to all principals (including anonymous)
@id("allow-read-access")
permit(
  principal is DUADP::Principal,
  action == DUADP::Action::"read",
  resource is DUADP::Resource
);

// Policy 8: Forbid anonymous access to write operations
// Compare the principal entity directly so enforcement works without entity attributes.
@id("forbid-anonymous-writes")
forbid(
  principal is DUADP::Principal,
  action in [
    DUADP::Action::"publish",
    DUADP::Action::"revoke",
    DUADP::Action::"update"
  ],
  resource is DUADP::Resource
) when {
  principal == DUADP::Principal::"anonymous"
};

// =============================================================================
// QUALITY GATE POLICIES — CI/CD deployment decisions
// Evaluates Cedar context built from CI artifact metrics.
// =============================================================================

// Policy 9: Production requires high confidence, coverage, security, zero vulns
@id("require-high-confidence-for-production")
permit(
  principal is DUADP::Principal,
  action == DUADP::Action::"deploy",
  resource is DUADP::Environment
) when {
  resource.name == "production" &&
  context.confidence_score >= 90 &&
  context.test_coverage >= 80 &&
  context.security_score >= 85 &&
  context.vulnerability_count == 0
};

// Policy 10: Staging allows lower thresholds — still needs basic quality bar
@id("allow-staging-deploy-lower-threshold")
permit(
  principal is DUADP::Principal,
  action == DUADP::Action::"deploy",
  resource is DUADP::Environment
) when {
  resource.name == "staging" &&
  context.confidence_score >= 70 &&
  context.test_coverage >= 60 &&
  context.vulnerability_count <= 5
};

// Policy 11: Development has minimal gates (blocks only critical issues)
@id("allow-dev-deploy-minimal-gate")
permit(
  principal is DUADP::Principal,
  action == DUADP::Action::"deploy",
  resource is DUADP::Environment
) when {
  resource.name == "development" &&
  context.confidence_score >= 50
};

// Policy 12: Block weekend production deployments without explicit approval
@id("forbid-weekend-production-deploy")
forbid(
  principal is DUADP::Principal,
  action == DUADP::Action::"deploy",
  resource is DUADP::Environment
) when {
  resource.name == "production" &&
  (context.day_of_week == "Saturday" || context.day_of_week == "Sunday") &&
  !(context.human_approved)
};

// Policy 13: Block any deploy with critical unfixed vulnerabilities
@id("forbid-critical-vulnerabilities")
forbid(
  principal is DUADP::Principal,
  action == DUADP::Action::"deploy",
  resource is DUADP::Environment
) when {
  resource.name == "production" &&
  context.vulnerability_count > 0
};
