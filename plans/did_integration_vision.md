# DID Integration Vision for Dragonfly and Compliance Engine

Building decentralized identity (`did:key`) into the core orchestration and compliance tools radically scales automation across the DUADP stack by adding mathematically verifiable trust.

Here is how `did:key` capabilities from the new SDK can be incorporated into Dragonfly and the Cedar Compliance Engine:

## 1. Dragonfly (The Auditor & Orchestrator)

Dragonfly serves as the CI/CD and runtime orchestration layer for testing Agents against NIST standards.

*   **Cryptographic Attestations:** Dragonfly can generate a permanent, secure `did:key` representing its system identity. Whenever it runs a test suite against an Agent, it doesn't just record the outcome; it wraps the results in a DUADP `Attestation` resource and digitally signs it using `signWithDidKey`.
*   **Zero-Touch Trust Tier Upgrades:** When Dragonfly publishes its signed `Attestation` to the DUADP Reference Node, the node mathematically verifies the signature. If valid, the Reference Node can instantly upgrade the target Agent's `trust_tier` (e.g., to `certified` or `official`) without requiring a human administrator to click "approve."
*   **Secure Sub-Agent Spawning:** When an orchestrator workflow spawns new sub-agents, Dragonfly can sign the delegation payload. The sub-agent can verify the signature to ensure it is executing commands from an authorized parent orchestrator rather than a malicious actor.

## 2. Compliance Engine (The Policy Authority)

The Compliance Engine is currently the authority on Cedar policy evaluation. Identity expands its capabilities from simple boolean checks to signed certificates.

*   **Digital Compliance Certificates:** Instead of just returning a `decision: 'Permit'` payload, the engine can issue a **Signed Compliance Certificate** (a DUADP Resource) stating that an Agent fulfills a specific framework (like NIST AI RMF).
*   **Verification at the Gates:** The Reference Node's `/publish` endpoint can be configured to check for this certificate. If an incoming Agent payload has a valid signature from the Compliance Engine's known `did:key`, the node accepts it. If the signature is missing or altered, publication is blocked.
*   **Identity-Bound Cedar Policies:** Currently, policies might authorize actions based on broad roles. With DID integration, Cedar policies can be strictly evaluated against Cryptographic Identities. The `principal` in a Cedar evaluation becomes `principal == "did:key:z6M..."`, ensuring that only the specific entity possessing the private key can invoke a high-risk tool or action.

### Implementation Next Steps

1.  **Inject the SDK:** Add `@bluefly/duadp` to `Dragonfly` and the `Compliance Engine` to unlock `generateDidKeyIdentity` and `signWithDidKey`.
2.  **Key Management:** Establish a secure way (e.g., Vault or environment variables) for Dragonfly and the Compliance Engine to store and load their permanent private keys.
3.  **Wire the Signatures:** Intercept the final output steps of these tools (e.g., right before publishing results or issuing evaluations) to run the payload through the DUADP SDK signer.
4.  **Reference Node Trust Lists:** Configure the Reference Node with a list of "Trusted DIDs" representing Dragonfly and the Compliance Engine, so it knows which signatures map to elevated privileges.
