# AGENTS.md - DUADP

## Project Overview

**DUADP** (Decentralized Universal AI Discovery Protocol) — federated discovery, publishing, and federation of AI agents, skills, and tools.

## Architecture

- **Spec**: `spec/` — normative protocol specification (v0.2.0), OpenAPI 3.1, JSON Schemas
- **TypeScript SDK**: `sdk/typescript/` — `@bluefly/duadp` npm package (client, server, crypto, DID, validation, conformance)
- **Python SDK**: `sdk/python/` — `duadp` PyPI package (client, models)
- **Reference Node**: `reference-node/` — Express 5.0 + SQLite, all protocol endpoints, Docker-ready

## Build / Test

```bash
# TypeScript SDK
cd sdk/typescript && npm ci && npm test    # 136 tests, ~500ms

# Reference Node
cd reference-node && npm ci
npx tsx src/seed.ts && npx tsx src/index.ts  # Port 4200

# Python SDK
cd sdk/python && pip install -e ".[dev]" && pytest
```

## Key Directories

```
spec/
  README.md              # DUADP v0.2.0 specification
  openapi.yaml           # OpenAPI 3.1 definition
  schemas/               # JSON Schema validation files
sdk/
  typescript/            # @bluefly/duadp (npm)
  python/                # duadp (PyPI)
reference-node/
  src/                   # Express server, routes, seed data
  data/                  # SQLite database (gitignored)
```

## Live Deployment

- **Reference Node**: https://discover.duadp.org (Oracle Cloud, PM2 + Cloudflare Tunnel)
- **Website**: https://duadp.org (GitLab Pages)

## Related Repos

- `openstandardagents` — OSSA specification and npm package
- `duadp.org` — Protocol website (Next.js)
- `ossa-studio` — Visual Composer, Agent Catalog
- `ossa-deploy` — CI/CD deployment pipeline

## Guardrails

- Do NOT break the reference node seeded data format
- All API changes must update `spec/openapi.yaml` first
- SDK changes must maintain backward compatibility with existing DUADP nodes
- Every repo MUST have: README.md, AGENTS.md, llms.txt, CLAUDE.md
