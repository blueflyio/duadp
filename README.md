# Universal AI Discovery Protocol (UADP)

**Decentralized, federated discovery for AI Agents, Skills, Tools, and Marketplaces.**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Spec Version](https://img.shields.io/badge/spec-v0.1.0-green.svg)](spec/README.md)

## What is UADP?

UADP is an open protocol that lets any system discover and exchange AI capabilities across organizational boundaries. Like DNS for websites or ActivityPub for social networks, UADP provides a standard way for AI registries, marketplaces, and tools to find each other.

**Any system that implements a few HTTP endpoints is a UADP node.** There is no required language, framework, or database.

```
Your AI Platform                    Another AI Platform
     |                                      |
     |  GET /.well-known/uadp.json          |
     |------------------------------------->|
     |  { endpoints: { skills: "..." } }    |
     |<-------------------------------------|
     |                                      |
     |  GET /uadp/v1/skills?search=code     |
     |------------------------------------->|
     |  { data: [...], meta: {...} }        |
     |<-------------------------------------|
```

## Quick Start

### Consume a UADP node

**TypeScript:**
```typescript
import { UadpClient } from '@ossa/uadp';

const client = new UadpClient('https://skills.sh');
const manifest = await client.discover();
const skills = await client.listSkills({ search: 'code review' });
```

**Python:**
```python
from ossa_uadp import UadpClient

async with UadpClient("https://skills.sh") as client:
    manifest = await client.discover()
    skills = await client.list_skills(search="code review")
```

**Go:**
```go
client := uadp.NewClient("https://skills.sh")
manifest, _ := client.Discover(ctx)
skills, _ := client.ListSkills(ctx, &uadp.ListParams{Search: "code review"})
```

### Build a UADP node

The simplest node is two static JSON files:

```
your-site.com/
  .well-known/uadp.json     <- discovery manifest
  uadp/v1/skills             <- skills list (static JSON)
```

Or use an SDK to build a dynamic node:

**TypeScript (Express):**
```typescript
import { createUadpRouter } from '@ossa/uadp/server';

app.use(createUadpRouter({
  nodeName: 'My Skills Hub',
  listSkills: async (params) => { /* query your database */ },
}));
```

**Python (FastAPI):**
```python
from ossa_uadp.server import create_uadp_router

app.include_router(create_uadp_router(
    node_name="My Skills Hub",
    data_provider=MyProvider(),
))
```

## Repository Structure

```
spec/                    # The normative specification
  README.md              # UADP v0.1.0 spec document
  openapi.yaml           # OpenAPI 3.1 definition
  schemas/               # JSON Schema files
sdk/
  typescript/            # @ossa/uadp npm package
  python/                # ossa-uadp PyPI package
  go/                    # uadp-go module
```

## Protocol Endpoints

| Endpoint | Method | Required | Description |
|----------|--------|----------|-------------|
| `/.well-known/uadp.json` | GET | MUST | Node discovery manifest |
| `/uadp/v1/skills` | GET | MUST* | List OSSA-formatted skills |
| `/uadp/v1/agents` | GET | MUST* | List OSSA-formatted agents |
| `/uadp/v1/federation` | GET | SHOULD | Peer node list |
| `/uadp/v1/federation` | POST | SHOULD | Register as peer |
| `/uadp/v1/skills/validate` | POST | MAY | Validate a manifest |

*At least one of skills or agents MUST be implemented.

## Design Principles

1. **Decentralized** - No central registry. Any domain can be a UADP node.
2. **Federated** - Nodes discover and sync with peers automatically.
3. **Simple** - Two static JSON files = valid UADP node.
4. **Open** - Apache 2.0 license. No vendor lock-in.
5. **Interoperable** - Built on OSSA payload format, works with any AI framework.
6. **Secure** - Trust tiers, cryptographic signatures, circuit breakers.

## Relationship to OSSA

UADP is the **transport and discovery layer**. [OSSA](https://openstandardagents.org) is the **payload format**.

- UADP defines HOW to find and exchange AI capabilities
- OSSA defines WHAT those capabilities look like (apiVersion, kind, metadata, spec)
- You can use OSSA without UADP (local manifests)
- You can use UADP with any payload format (but OSSA is recommended)

## Reference Implementations

| Platform | Status | Description |
|----------|--------|-------------|
| [Drupal Agent Marketplace](https://gitlab.com/blueflyio/agent-platform/drupal/ai_agents_marketplace) | Production | Full UADP node with federation |
| Static JSON | Planned | GitHub Pages template |
| Express | Planned | Node.js reference server |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributions welcome.

## License

Apache License 2.0 - see [LICENSE](LICENSE).
