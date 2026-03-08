// DUADP Authorization Policies
// Enforced at runtime by the reference node's Cedar evaluator.
// Version: 1.0.0

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
  context.trust_tier == "community"
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
// QUERY AUTHORIZATION — rate limiting and access control for search
// =============================================================================

// Policy 7: Allow read access to all authenticated users
@id("allow-read-access")
permit(
  principal is DUADP::Principal,
  action == DUADP::Action::"read",
  resource is DUADP::Resource
);

// Policy 8: Forbid anonymous access to write operations
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
  principal.id == "anonymous"
};
