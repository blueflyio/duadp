# DUADP Agent Operations Manual

This document provides context for AI coding agents operating on the DUADP reference node.

## Architecture
- **Framework**: Express 5 + TypeScript
- **Database**: SQLite via `better-sqlite3` (`/data/duadp.db` in containers, `./data/duadp.db` locally by default)
- **Protocol**: REST over HTTP, WebFinger discovery, DID-based identity, Cedar authorization, federation, and revocation
- **Runtime**: `reference-node/src/index.ts`

## Build / Test CLI
- `npm run dev`: Starts the local dev server.
- `npm run build`: Compiles TypeScript.
- `npm test`: Runs reference-node unit tests (`src/*.test.ts`).
- `npm run seed`: Seeds the local SQLite database.
- `npm run test:integration:publish`: Manual signed-publish integration flow.
- `npm run test:integration:p2p`: Manual multi-node P2P integration flow.

## Guardrails (No-Go Zones)
- Do **NOT** store raw bearer tokens or token fragments in logs, audit records, or revocation records.
- Do **NOT** bypass signature validation in `/api/v1/validate`.
- Do **NOT** bypass Cedar authorization or revocation checks on mutating endpoints.
- Keep unit tests beside the reference node (`src/*.test.ts`). Keep multi-process/manual flows in `src/integration/*.integration.ts`.

## Sub-modules
Check the `PROMPTS/` directory for specific instructions on modifying the discovery, federation, or governance modules.
