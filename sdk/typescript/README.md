# @bluefly/uadp

TypeScript SDK for the **[Decentralized Universal Agent Discovery Protocol (DUADP)](https://duadp.org)** — discover, publish, and federate AI agents, skills, and tools across decentralized registries.

> **[duadp.org](https://duadp.org)** — Website coming soon. See **[openstandardagents.org](https://openstandardagents.org)** for more on the OSSA ecosystem.

## Install

```bash
npm install @bluefly/uadp
```

## Quick Start

### Client — discover resources from any UADP node

```typescript
import { UadpClient } from '@bluefly/uadp/client';

const client = new UadpClient('https://your-uadp-node.example.com');

// Discover the node
const manifest = await client.discover();
console.log(manifest.node_name, manifest.protocol_version);

// List skills
const skills = await client.listSkills({ limit: 10 });
console.log(skills.data);

// Search agents
const agents = await client.listAgents({ search: 'orchestrator' });
```

### Server — add UADP endpoints to your Express app

```typescript
import express from 'express';
import { createUadpRouter } from '@bluefly/uadp/server';

const app = express();

const router = createUadpRouter({
  nodeName: 'My Node',
  nodeId: 'did:web:mynode.example.com',
  baseUrl: 'https://mynode.example.com',
}, myDataProvider);

app.use(router);
app.listen(4200);
```

### Validate OSSA manifests

```typescript
import { validateResource } from '@bluefly/uadp/validate';

const result = validateResource(skillManifest);
if (!result.valid) console.error(result.errors);
```

### Cryptographic signing & verification

```typescript
import { generateKeyPair, signResource, verifyResource } from '@bluefly/uadp/crypto';

const keys = await generateKeyPair();
const signed = await signResource(resource, keys.privateKey);
const verified = await verifyResource(signed, keys.publicKey);
```

### DID resolution

```typescript
import { resolveDid } from '@bluefly/uadp/did';

const doc = await resolveDid('did:web:example.com');
```

## Subpath Exports

| Import | Description |
|--------|-------------|
| `@bluefly/uadp` | Types and core exports |
| `@bluefly/uadp/client` | `UadpClient` for consuming UADP nodes |
| `@bluefly/uadp/server` | `createUadpRouter` Express middleware |
| `@bluefly/uadp/validate` | OSSA manifest validation |
| `@bluefly/uadp/crypto` | Ed25519 signing & verification |
| `@bluefly/uadp/did` | DID resolution (did:web, did:key) |
| `@bluefly/uadp/conformance` | Protocol conformance test suite |

## Reference Node

A complete reference implementation using this SDK is at [`reference-node/`](https://gitlab.com/blueflyio/ossa/lab/openstandard-uadp/-/tree/main/reference-node) — Express + SQLite with all 26 UADP endpoints.

## Tests

```bash
npm test   # 136 tests across 7 test files
```

## License

Apache-2.0
