# @ossa/uadp — TypeScript SDK

**UADP client and server SDK for Node.js and TypeScript.**

[![npm](https://img.shields.io/npm/v/@ossa/uadp)](https://www.npmjs.com/package/@ossa/uadp)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../LICENSE)

## Install

```bash
npm install @ossa/uadp
# or
pnpm add @ossa/uadp
```

## Quick Start — Client

```typescript
import { UadpClient, resolveGaid } from '@ossa/uadp';

const client = new UadpClient('https://skills.sh');

// Discovery
const manifest = await client.getManifest();
const skills = await client.listSkills({ search: 'code review' });
const tools = await client.listTools({ protocol: 'mcp' });
const agents = await client.listAgents();

// Resolve a GAID URI from any node
const { client: c, name } = resolveGaid('agent://skills.sh/skills/web-search');
const skill = await c.getSkill(name);

// Publish (requires auth token)
const published = await client.publishSkill(mySkill, 'Bearer token...');
```

## Quick Start — Server

Build a UADP node with Express:

```typescript
import express from 'express';
import { createUadpRouter } from '@ossa/uadp/server';

const app = express();
app.use(createUadpRouter({
  nodeName: 'My AI Hub',
  nodeId: 'did:web:my-hub.com',
  baseUrl: 'https://my-hub.com',
  federation: { gossip: true, max_hops: 3 },
}, {
  listSkills: async (params) => { /* query your store */ },
  listTools: async (params) => { /* query your store */ },
  publishResource: async (resource, token) => { /* validate + save */ },
}));

app.listen(3000);
```

## CLI

```bash
npx @ossa/uadp discover https://skills.sh
npx @ossa/uadp conformance https://your-node.com
```

## Features

### Core Discovery
- **Client** — `UadpClient` with automatic manifest discovery, circuit breaker, deduplication
- **Server** — `createUadpRouter()` Express middleware for building UADP nodes
- **GAID resolution** — `resolveGaid('agent://host/kind/name')` for cross-node lookups
- **WebFinger** — Standard resource resolution with protocol-specific links

### Identity & Security
- **DID resolution** — `did:web:` and `did:key:` via DIF standard resolvers (`did-resolver`, `web-did-resolver`, `key-did-resolver`)
- **Cryptographic signatures** — Ed25519 signing/verification with Web Crypto API
- **RFC 8785 canonicalization** — Deterministic JSON via the `canonicalize` npm package
- **Resource identity verification** — Full chain: DID resolve -> extract key -> verify signature -> check lifecycle

### Context & Analytics
- **Context negotiation** — `client.negotiateContext()` for layered context delivery with priority tiers
- **Token analytics** — `client.reportTokenUsage()` / `client.getTokenAnalytics()` for per-execution tracking
- **Capability fingerprints** — `client.getCapabilityFingerprint()` for empirical performance data

### Feedback & Rewards
- **360 feedback** — `client.submitFeedback()` with multi-source dimensions (quality, efficiency, reliability, creativity, collaboration)
- **Agent reputation** — `client.getAgentReputation()` with composite scoring
- **Reward events** — `client.recordReward()` for reputation boosts, capability unlocks, token credits, badges
- **Outcome attestations** — `client.submitAttestation()` for signed, verifiable task outcome records

### Multi-Agent Orchestration
- **Delegation** — `client.delegate()` with compressed context transfer, budget constraints, depth limits
- **Orchestration plans** — `client.createOrchestrationPlan()` for DAG/parallel/sequential/adaptive execution
- **OSSA agent types** — `orchestrator | worker | specialist | critic | monitor | gateway`

### Batch & Interop
- **Batch publish** — `client.batchPublish()` for atomic multi-resource publish with dry-run support
- **A2A Agent Card** — `client.getA2ACard()` for Google A2A protocol interop
- **MCP Server Manifest** — `client.getMcpManifest()` to expose tools as MCP-compatible
- **Structured query** — `client.query()` with compound filters, sort, field projection, cursor pagination

### Validation & Conformance
- **Manifest validation** — `validateManifest()` / `validateResponse()` for UADP payloads
- **Conformance testing** — `runConformanceTests()` against any UADP node endpoint
- **OSSA schema validation** — Validates against OSSA `.ajson` format

## Exports

```typescript
// Main entry point
import { UadpClient, resolveGaid, CircuitBreaker, deduplicateResources } from '@ossa/uadp';

// Sub-path exports
import { createUadpRouter } from '@ossa/uadp/server';
import { validateManifest, validateResponse } from '@ossa/uadp/validate';
import { canonicalize, signResource, verifySignature, generateKeyPair } from '@ossa/uadp/crypto';
import { resolveDID, buildDidWeb, verifyResourceIdentity } from '@ossa/uadp/did';
import { runConformanceTests, formatConformanceResults } from '@ossa/uadp/conformance';

// All types
import type { OssaResource, UadpManifest, ContextNegotiation, TokenAnalytics,
  AgentFeedback, RewardEvent, DelegationRequest, OrchestrationPlan } from '@ossa/uadp';
```

## Dependencies

| Package | Purpose |
|---------|---------|
| [`canonicalize`](https://www.npmjs.com/package/canonicalize) | RFC 8785 JSON Canonicalization Scheme |
| [`did-resolver`](https://www.npmjs.com/package/did-resolver) | DIF standard DID resolution framework |
| [`web-did-resolver`](https://www.npmjs.com/package/web-did-resolver) | `did:web` method resolver |
| [`key-did-resolver`](https://www.npmjs.com/package/key-did-resolver) | `did:key` method resolver (Ed25519, secp256k1) |
| `express` (peer, optional) | Only needed for `createUadpRouter()` server mode |

## Building

```bash
npm run build    # TypeScript compilation
npm test         # Vitest test suite
```

## License

Apache License 2.0
