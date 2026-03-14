# CLAUDE.md - DUADP

## Project

DUADP (Decentralized Universal AI Discovery Protocol) — the federated discovery layer for AI agents.

## Quick Reference

- **SDK Test**: `cd sdk/typescript && npm test` (155 tests)
- **Reference Node**: `cd reference-node && npx tsx src/index.ts` (port 4200)
- **Remote**: https://gitlab.com/blueflyio/duadp/duadp
- **npm**: https://www.npmjs.com/package/@bluefly/duadp
- **PyPI**: https://pypi.org/project/duadp/

## Critical

- API changes MUST update `spec/openapi.yaml` first (API-first)
- Reference node uses Express 5.0 + SQLite (`reference-node/data/duadp.db`)
- SDK publishes to npmjs.org via `npm publish` (not GitLab registry)
- Python SDK publishes to PyPI
- Every repo MUST have: README.md, AGENTS.md, llms.txt, CLAUDE.md

## Standard Files (REQUIRED in every repo)

- README.md - Project overview
- AGENTS.md - AI assistant context
- CLAUDE.md - This file
- llms.txt - LLM-readable project summary
