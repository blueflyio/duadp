# DUADP Agent Operations Manual

This document provides context for AI coding agents operating on the DUADP reference node.

## Architecture
- **Framework**: Express.js + TypeScript
- **Database**: In-memory Map (for reference implementation)
- **Protocol**: REST over HTTP, DID-based identity

## Build / Test CLI
- `npm run dev`: Starts the local dev server.
- `npm run build`: Compiles TypeScript.
- `npm run start`: Runs the production build.

## Guardrails (No-Go Zones)
- Do **NOT** persistently store PII or sensitive keys in the in-memory database.
- Do **NOT** bypass signature validation in `/api/v1/validate`.
- Do **NOT** use `any` in TypeScript for API responses.

## Sub-modules
Check the `PROMPTS/` directory for specific instructions on modifying the discovery, federation, or governance modules.
