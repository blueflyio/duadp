# Protocol Contract and Governance

## The OSSA Contract Layer
This DUADP node enforces the Open Standard Agents (OSSA) compliance specifications:
1. **Tier 1 (Basic)**: valid JSON schema structure.
2. **Tier 2 (Standard)**: Resolvable WebFinger/DID identity.
3. **Tier 3 (Verified)**: Valid cryptographic signature matching the DID public key.

## Federation Rules
- Node accepts gossip packets from peers listed in `/api/v1/federation/peers`.
- Malicious payloads trigger an immediate peer ban.

## Licensing
Apache-2.0. This is public infrastructure.
