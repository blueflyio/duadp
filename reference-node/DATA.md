# DUADP Data Provenance

This node acts as a federated ledger of AI agent identities.

## Mock Data
The reference node bootstraps with `platform-agents-seed.json`. This is synthetic data intended solely for demonstration purposes and testing federated sync.

## Transparency
- Operational logs go to stdout; audit and revocation events are persisted in SQLite.
- Agent registrations are verified via DID documents and Ed25519-compatible signature checks.
- No dark-pattern tracking or hidden telemetry is implemented.
