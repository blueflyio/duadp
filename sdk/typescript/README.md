# DUADP — TypeScript SDK

**The official TypeScript SDK for [DUADP](https://openstandardagents.org/duadp/) (Decentralized Universal AI Discovery Protocol).**

DUADP is an open protocol for decentralized discovery, publishing, and federation of AI agents, skills, and tools. It provides a standard HTTP interface that any system can implement — turning isolated AI registries into an interoperable, federated network. Think DNS for AI capabilities: any node that serves a few standard endpoints becomes discoverable by every other node in the mesh.

The protocol addresses a fundamental problem in the AI ecosystem: **there is no standard way to find, publish, or verify AI capabilities across organizational boundaries.** Marketplaces, tool registries, and agent platforms are siloed. DUADP solves this with:

- **Decentralized discovery** via `/.well-known/duadp.json` and DNS TXT records
- **Federated search** across peer nodes with gossip-based propagation
- **Cryptographic trust** using Ed25519 signatures and W3C DIDs (`did:web`, `did:key`)
- **OSSA-native payloads** in `.ajson` format with trust tiers, GAID identifiers, and governance metadata
- **Protocol interop** bridging MCP tool servers and Google A2A agent cards into a unified registry

This SDK provides both a **client** for consuming any DUADP node and a **server router** for turning your Express app into a fully compliant DUADP node — with validation, cryptographic signing, DID resolution, conformance testing, and a consolidated GAID inspector built in.

[![npm](https://img.shields.io/npm/v/@bluefly/duadp)](https://www.npmjs.com/package/@bluefly/duadp)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://gitlab.com/blueflyio/duadp/duadp/-/blob/main/LICENSE)

> **[openstandardagents.org/duadp](https://openstandardagents.org/duadp/)** | **[duadp.org](https://duadp.org)** | **[Full Spec](https://gitlab.com/blueflyio/duadp/duadp/-/blob/main/spec/README.md)**

---

## Install

```bash
npm install @bluefly/duadp
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

This SDK provides the core protocol endpoints, including GAID resolution and inspection:
  GET  /.well-known/duadp.json         Discovery manifest
  GET  /.well-known/webfinger          WebFinger resolution
  GET  /api/v1/skills                 Paginated skill registry
  GET  /api/v1/skills/:name           Single skill detail
  GET  /api/v1/agents                 Paginated agent registry
  GET  /api/v1/agents/:name           Single agent detail
  GET  /api/v1/tools                  Paginated tool registry
  GET  /api/v1/tools/:name            Single tool detail
  POST /api/v1/publish                Publish any resource
  GET  /api/v1/resolve/:gaid          Resolve a GAID to a resource
  GET  /api/v1/inspect                Consolidated trust/policy inspection
  POST /api/v1/{kind}                 Create resource by kind
  PUT  /api/v1/{kind}/:name           Update resource
  DELETE /api/v1/{kind}/:name         Delete resource
  POST /api/v1/validate               Validate OSSA manifest
  GET  /api/v1/federation             Peer node directory
  POST /api/v1/federation             Register as peer
```

## Quick Start

### Client — consume any DUADP node

```typescript
import { DuadpClient } from '@bluefly/duadp/client';

const client = new DuadpClient('https://your-duadp-node.example.com');

// Discover the node's capabilities
const manifest = await client.discover();
console.log(manifest.node_name, manifest.protocol_version);

// Search for skills across the node and its federation peers
const skills = await client.listSkills({ search: 'code review', limit: 10 });

// Browse agents by category
const agents = await client.listAgents({ category: 'security' });

// Find MCP-compatible tools
const tools = await client.listTools({ protocol: 'mcp' });

// Resolve and inspect a GAID with evidence-first output
const resolved = await client.resolveResource('agent://discover.duadp.org/agents/code-reviewer');
const inspection = await client.inspectGaid('agent://discover.duadp.org/agents/code-reviewer');
console.log(resolved.source_node, inspection.trust_verification.verified_tier);
```

### Server — make your app a DUADP node

```typescript
import express from 'express';
import { createDuadpRouter } from '@bluefly/duadp/server';

const app = express();

// Mount all 15 DUADP protocol endpoints with one call
const router = createDuadpRouter({
  nodeName: 'My Registry',
  nodeId: 'did:web:registry.example.com',
  baseUrl: 'https://registry.example.com',
  federation: { gossip: true, max_hops: 3 },
}, myDataProvider);   // implement DuadpDataProvider interface

app.use(router);
app.listen(4200);
// Your app now serves /.well-known/duadp.json and all /api/v1/* routes
```

### Validate OSSA resource manifests

```typescript
import { validateManifest } from '@bluefly/duadp/validate';

const result = validateManifest(skillManifest);
if (!result.valid) console.error(result.errors);
```

### Cryptographic signing and verification

```typescript
import { generateKeyPair, signResource, verifySignature } from '@bluefly/duadp/crypto';

const keys = await generateKeyPair();                        // Ed25519
const signed = await signResource(resource, keys.privateKey);
const verified = await verifySignature(signed, keys.publicKey); // true/false
```

### DID resolution

```typescript
import { resolveDID } from '@bluefly/duadp/did';

const doc = await resolveDID('did:web:example.com');    // W3C DID Document
const doc2 = await resolveDID('did:key:z6Mkf5rG...');   // did:key support
```

## Subpath Exports

| Import | Description |
|--------|-------------|
| `@bluefly/duadp` | Core types — `DuadpManifest`, `OssaResource`, `OssaSkill`, `OssaAgent`, `OssaTool`, `PaginatedResponse`, `Peer`, and 40+ more |
| `@bluefly/duadp/client` | `DuadpClient` — typed HTTP client for discovery, search, GAID resolution, inspection, pagination, and federation |
| `@bluefly/duadp/server` | `createDuadpRouter(config, provider)` — Express router mounting all 15 core protocol endpoints |
| `@bluefly/duadp/validate` | `validateManifest()` — OSSA manifest validation against the spec |
| `@bluefly/duadp/crypto` | `generateKeyPair()`, `signResource()`, `verifySignature()` — Ed25519 cryptographic operations |
| `@bluefly/duadp/did` | `resolveDID()` — W3C Decentralized Identifier resolution (`did:web`, `did:key`) |
| `@bluefly/duadp/conformance` | `runConformanceTests(url)` — automated protocol compliance test suite |

## Key Concepts

| Concept | Description |
|---------|-------------|
| **DUADP Node** | Any HTTP server implementing `/.well-known/duadp.json` and `/api/v1/*` endpoints |
| **GAID** | Global Agent Identifier — `agent://namespace/kind/name` URI scheme for cross-registry resolution |
| **DID** | W3C Decentralized Identifier — `did:web:example.com` for node and resource identity |
| **Trust Tier** | `official` > `verified-signature` > `signed` > `community` > `experimental` |
| **Federation** | Gossip-based peer discovery with circuit breakers and configurable hop limits |
| **OSSA** | Open Standard for Agent Systems — the payload format (`.ajson`) for skills, agents, and tools |

## Reference Node

A complete reference implementation using this SDK ships in the same repository: [`reference-node/`](https://gitlab.com/blueflyio/duadp/duadp/-/tree/main/reference-node) — Express + SQLite, all protocol endpoints (17 SDK + governance), Docker-ready, seeded with demo data.

```bash
cd reference-node
cp .env.example .env
npx tsx src/seed.ts && npx tsx src/index.ts
# Node running at http://localhost:4200
```

## Tests

```bash
npm test
# 157 tests across 10 suites, including the inspector client surface
```

## Also Available

| Language | Package | Registry |
|----------|---------|----------|
| Python | [`duadp`](https://pypi.org/project/duadp/) | PyPI |

## License

Apache-2.0 — See [LICENSE](https://gitlab.com/blueflyio/duadp/duadp/-/blob/main/LICENSE)
