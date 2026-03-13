# Protocol Contract and Governance

## The OSSA Contract Layer
This DUADP node enforces the Open Standard Agents (OSSA) compliance specifications:
1. **Tier 1 (Basic)**: valid JSON schema structure.
2. **Tier 2 (Standard)**: Resolvable WebFinger/DID identity.
3. **Tier 3 (Verified)**: Valid cryptographic signature matching the DID public key.

## Federation Rules
- Node accepts peer registrations and gossip through `/api/v1/federation` and lists the current peer set at `/api/v1/federation/peers`.
- Federation payloads that exceed `max_hops` or omit required fields are rejected and not persisted.
- Revocations propagate through `/api/v1/federation/revocations`.

## Licensing
Apache-2.0. This is public infrastructure.
