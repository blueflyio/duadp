# Contributing to UADP

Thank you for your interest in contributing to the Universal Agent Discovery Protocol (UADP).

## Getting Started

```bash
git clone <this-repo>
cd openstandard-uadp

# Build SDK
cd sdk/typescript && npm install && npm run build && cd ../..

# Run reference node
cd reference-node && npm install
cp .env.example .env          # customize if needed
npx tsx src/seed.ts            # seed sample data
npx tsx src/index.ts           # starts on PORT (default 4200)
```

## Project Structure

```
spec/           UADP protocol specification
sdk/typescript/ TypeScript SDK (@bluefly/uadp)
reference-node/ Express + SQLite reference implementation
```

## Making Changes

### Protocol Spec Changes

1. Open an issue describing the proposed change
2. Update `spec/README.md` (and `spec/openapi.yaml` if endpoints change)
3. Ensure the reference node and SDK stay in sync with spec changes
4. Submit a pull/merge request linking the issue

### SDK Changes

1. Write tests first — run with `cd sdk/typescript && npm test`
2. Ensure all 136+ existing tests still pass
3. Export new types/functions from the appropriate subpath (`./client`, `./server`, `./validate`, etc.)

### Reference Node Changes

1. The reference node implements the spec — changes here should reflect spec updates
2. Test locally: `cd reference-node && npx tsx src/index.ts`
3. Verify endpoints with curl or the SDK client

## Code Style

- TypeScript strict mode
- No hardcoded URLs or domain names — use environment variables
- All configuration via `.env` (see `reference-node/.env.example`)
- Seed data uses generic OSSA domain references for demonstration purposes

## Environment Variables

All configurable values must be exposed as environment variables. See `reference-node/.env.example` for the reference node. Never commit `.env` files.

## Pull Request Process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes with tests
4. Ensure CI passes (lint, test, build)
5. Submit a merge/pull request with a clear description

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
