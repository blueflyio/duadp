# @bluefly/uadp

**The official TypeScript SDK for [DUADP](https://openstandardagents.org/uadp/) (Decentralized Universal AI Discovery Protocol).**

DUADP is an open protocol for decentralized discovery, publishing, and federation of AI agents, skills, and tools. It provides a standard HTTP interface that any system can implement — turning isolated AI registries into an interoperable, federated network. Think DNS for AI capabilities: any node that serves a few standard endpoints becomes discoverable by every other node in the mesh.

The protocol addresses a fundamental problem in the AI ecosystem: **there is no standard way to find, publish, or verify AI capabilities across organizational boundaries.** Marketplaces, tool registries, and agent platforms are siloed. DUADP solves this with:

- **Decentralized discovery** via `/.well-known/uadp.json` and DNS TXT records
- **Federated search** across peer nodes with gossip-based propagation
- **Cryptographic trust** using Ed25519 signatures and W3C DIDs (`did:web`, `did:key`)
- **OSSA-native payloads** in `.ajson` format with trust tiers, GAID identifiers, and governance metadata
- **Protocol interop** bridging MCP tool servers and Google A2A agent cards into a unified registry

This SDK provides both a **client** for consuming any DUADP node and a **server router** for turning your Express app into a fully compliant DUADP node — with validation, cryptographic signing, DID resolution, and conformance testing built in.

[![npm](https://img.shields.io/npm/v/@bluefly/uadp)](https://www.npmjs.com/package/@bluefly/uadp)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://gitlab.com/blueflyio/ossa/lab/duadp/-/blob/main/LICENSE)

> **[openstandardagents.org/uadp](https://openstandardagents.org/uadp/)** | **[duadp.org](https://duadp.org)** (coming soon) | **[Full Spec](https://gitlab.com/blueflyio/ossa/lab/duadp/-/blob/main/spec/README.md)**

---

## Install

```bash
npm install @bluefly/uadp
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Your App   │     │  DUADP Node │     │  DUADP Node │
│  (client)   │────>│  (skills.sh)│<───>│  (Acme Corp)│
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │ federation
                    ┌──────┴──────┐
                    │  DUADP Node │
                    │  (your org) │
                    └─────────────┘

This SDK provides 15 core protocol endpoints:
  GET  /.well-known/uadp.json         Discovery manifest
  GET  /.well-known/webfinger          WebFinger resolution
  GET  /uadp/v1/skills                 Paginated skill registry
  GET  /uadp/v1/skills/:name           Single skill detail
  GET  /uadp/v1/agents                 Paginated agent registry
  GET  /uadp/v1/agents/:name           Single agent detail
  GET  /uadp/v1/tools                  Paginated tool registry
  GET  /uadp/v1/tools/:name            Single tool detail
  POST /uadp/v1/publish                Publish any resource
  POST /uadp/v1/{kind}                 Create resource by kind
  PUT  /uadp/v1/{kind}/:name           Update resource
  DELETE /uadp/v1/{kind}/:name         Delete resource
  POST /uadp/v1/validate               Validate OSSA manifest
  GET  /uadp/v1/federation             Peer node directory
  POST /uadp/v1/federation             Register as peer
```

## Quick Start

### Client — consume any DUADP node

```typescript
import { UadpClient } from '@bluefly/uadp/client';

const client = new UadpClient('https://your-uadp-node.example.com');

// Discover the node's capabilities
const manifest = await client.discover();
console.log(manifest.node_name, manifest.protocol_version);

// Search for skills across the node and its federation peers
const skills = await client.listSkills({ search: 'code review', limit: 10 });

// Browse agents by category
const agents = await client.listAgents({ category: 'security' });

// Find MCP-compatible tools
const tools = await client.listTools({ protocol: 'mcp' });
```

### Server — make your app a DUADP node

```typescript
import express from 'express';
import { createUadpRouter } from '@bluefly/uadp/server';

const app = express();

// Mount all 15 DUADP protocol endpoints with one call
const router = createUadpRouter({
  nodeName: 'My Registry',
  nodeId: 'did:web:registry.example.com',
  baseUrl: 'https://registry.example.com',
  federation: { gossip: true, max_hops: 3 },
}, myDataProvider);   // implement UadpDataProvider interface

app.use(router);
app.listen(4200);
// Your app now serves /.well-known/uadp.json and all /uadp/v1/* routes
```

### Validate OSSA resource manifests

```typescript
import { validateResource } from '@bluefly/uadp/validate';

const result = validateResource(skillManifest);
if (!result.valid) console.error(result.errors);
```

### Cryptographic signing and verification

```typescript
import { generateKeyPair, signResource, verifyResource } from '@bluefly/uadp/crypto';

const keys = await generateKeyPair();                        // Ed25519
const signed = await signResource(resource, keys.privateKey);
const verified = await verifyResource(signed, keys.publicKey); // true/false
```

### DID resolution

```typescript
import { resolveDid } from '@bluefly/uadp/did';

const doc = await resolveDid('did:web:example.com');    // W3C DID Document
const doc2 = await resolveDid('did:key:z6Mkf5rG...');   // did:key support
```

## Subpath Exports

| Import | Description |
|--------|-------------|
| `@bluefly/uadp` | Core types — `UadpManifest`, `OssaResource`, `OssaSkill`, `OssaAgent`, `OssaTool`, `PaginatedResponse`, `Peer`, and 40+ more |
| `@bluefly/uadp/client` | `UadpClient` — typed HTTP client for any DUADP node with discovery, search, pagination, federation |
| `@bluefly/uadp/server` | `createUadpRouter(config, provider)` — Express router mounting all 15 core protocol endpoints |
| `@bluefly/uadp/validate` | `validateResource()` — OSSA manifest validation against the spec |
| `@bluefly/uadp/crypto` | `generateKeyPair()`, `signResource()`, `verifyResource()` — Ed25519 cryptographic operations |
| `@bluefly/uadp/did` | `resolveDid()` — W3C Decentralized Identifier resolution (`did:web`, `did:key`) |
| `@bluefly/uadp/conformance` | `runConformanceTests(url)` — automated protocol compliance test suite |

## Key Concepts

| Concept | Description |
|---------|-------------|
| **DUADP Node** | Any HTTP server implementing `/.well-known/uadp.json` and `/uadp/v1/*` endpoints |
| **GAID** | Global Agent Identifier — `agent://namespace/kind/name` URI scheme for cross-registry resolution |
| **DID** | W3C Decentralized Identifier — `did:web:example.com` for node and resource identity |
| **Trust Tier** | `official` > `verified-signature` > `signed` > `community` > `experimental` |
| **Federation** | Gossip-based peer discovery with circuit breakers and configurable hop limits |
| **OSSA** | Open Standard for Agent Systems — the payload format (`.ajson`) for skills, agents, and tools |

## Reference Node

A complete reference implementation using this SDK ships in the same repository: [`reference-node/`](https://gitlab.com/blueflyio/ossa/lab/duadp/-/tree/main/reference-node) — Express + SQLite, all protocol endpoints (15 SDK + 11 governance), Docker-ready, seeded with demo data.

```bash
cd reference-node
cp .env.example .env
npx tsx src/seed.ts && npx tsx src/index.ts
# Node running at http://localhost:4200
```

## Tests

```bash
npm test
# 136 tests across 7 suites: crypto, DID, validation, circuit-breaker, dedup, e2e-crypto, integration
```

## Also Available

| Language | Package | Registry |
|----------|---------|----------|
| Python | `bluefly-uadp` | PyPI |
| Go | `github.com/openstandardagents/uadp-go` | Go modules |

## License

Apache-2.0 — See [LICENSE](https://gitlab.com/blueflyio/ossa/lab/duadp/-/blob/main/LICENSE)
