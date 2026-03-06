# Universal AI Discovery Protocol (UADP)

**Decentralized, federated discovery and publishing for AI Agents, Skills, Tools, and Marketplaces.**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Spec Version](https://img.shields.io/badge/spec-v0.2.0-green.svg)](spec/README.md)

## What is UADP?

UADP is an open protocol that lets any system discover, publish, and exchange AI capabilities across organizational boundaries. Like DNS for websites or ActivityPub for social networks, UADP provides a standard way for AI registries, marketplaces, and tools to find each other.

**UADP is THE API.** Your Skills API, Marketplace API, Tool Registry — they all speak UADP. Consumers don't need to know what platform powers a node. A Drupal marketplace, a Flask registry, a static JSON site, and a Kubernetes operator all expose the same endpoints.

**Any system that implements a few HTTP endpoints is a UADP node.** There is no required language, framework, or database.

```
              DNS TXT: _uadp.skills.sh → "v=uadp1 url=..."

Your App                              skills.sh (UADP node)
  |                                          |
  |  GET /.well-known/uadp.json              |
  |----------------------------------------->|
  |  { endpoints: { skills, tools, ... } }   |
  |<-----------------------------------------|
  |                                          |
  |  GET /uadp/v1/tools?protocol=mcp         |
  |----------------------------------------->|
  |  { data: [...], meta: {...} }            |
  |<-----------------------------------------|
  |                                          |
  |  POST /uadp/v1/publish (auth required)   |
  |  { kind: "Skill", metadata: {...} }      |
  |----------------------------------------->|
  |  201 { success: true, resource: {...} }  |
  |<-----------------------------------------|
```

## Quick Start

### Consume a UADP node

**TypeScript:**
```typescript
import { UadpClient, resolveGaid } from '@ossa/uadp';

const client = new UadpClient('https://skills.sh');
const skills = await client.listSkills({ search: 'code review' });
const tools = await client.listTools({ protocol: 'mcp' });

// Resolve a GAID from anywhere
const { client: c, name } = resolveGaid('agent://skills.sh/skills/web-search');
const skill = await c.getSkill(name);
```

**Python:**
```python
from ossa_uadp import UadpClient, resolve_gaid

async with UadpClient("https://skills.sh") as client:
    skills = await client.list_skills(search="code review")
    tools = await client.list_tools(protocol="mcp")

    # Publish (requires token)
    await client.publish_skill(my_skill)
```

**Go:**
```go
client := uadp.NewClient("https://skills.sh")
skills, _ := client.ListSkills(ctx, &uadp.ListParams{Search: "code review"})
tools, _ := client.ListTools(ctx, &uadp.ToolListParams{Protocol: "mcp"})

// Resolve a GAID
c, kind, name, _ := uadp.ResolveGaid("agent://skills.sh/tools/web-search")
tool, _ := c.GetTool(ctx, name)
```

### Build a UADP node

The simplest node is two static JSON files:

```
your-site.com/
  .well-known/uadp.json     <- discovery manifest
  uadp/v1/skills             <- skills list (static JSON)
```

Optional DNS TXT record for zero-configuration discovery:
```
_uadp.your-site.com. IN TXT "v=uadp1 url=https://your-site.com/.well-known/uadp.json"
```

Or use an SDK to build a dynamic node with publishing, federation, and tools:

**TypeScript (Express):**
```typescript
import { createUadpRouter } from '@ossa/uadp/server';

app.use(createUadpRouter({
  nodeName: 'My AI Hub',
  nodeId: 'did:web:my-hub.com',
  baseUrl: 'https://my-hub.com',
  federation: { gossip: true, max_hops: 3 },
}, {
  listSkills: async (params) => { /* query your store */ },
  listTools: async (params) => { /* query your store */ },
  publishResource: async (resource, token) => { /* save + return */ },
}));
```

## Repository Structure

```
spec/                    # The normative specification
  README.md              # UADP v0.2.0 spec document
  openapi.yaml           # OpenAPI 3.1 definition
  schemas/               # JSON Schema validation files
sdk/
  typescript/            # @ossa/uadp npm package
  python/                # ossa-uadp PyPI package
  go/                    # uadp-go module
```

## Protocol Endpoints

| Endpoint | Method | Required | Description |
|----------|--------|----------|-------------|
| `/.well-known/uadp.json` | GET | MUST | Node discovery manifest |
| `/.well-known/webfinger` | GET | SHOULD | Resolve GAID to resource links |
| `/uadp/v1/skills` | GET | MUST* | List OSSA-formatted skills |
| `/uadp/v1/skills/{name}` | GET | MAY | Get single skill by name |
| `/uadp/v1/agents` | GET | MUST* | List OSSA-formatted agents |
| `/uadp/v1/tools` | GET | MUST* | List tools (MCP, A2A, etc.) |
| `/uadp/v1/publish` | POST | MAY | Publish any resource (auth) |
| `/uadp/v1/skills` | POST | MAY | Publish a skill (auth) |
| `/uadp/v1/federation` | GET | SHOULD | Peer node list |
| `/uadp/v1/federation` | POST | SHOULD | Register as peer (gossip) |
| `/uadp/v1/validate` | POST | MAY | Validate a manifest |

*At least one of skills, agents, or tools MUST be implemented.

## Key Features (v0.2)

- **Tools as first-class resources** — MCP servers, A2A tools, function-calling tools alongside skills and agents
- **Publishing API** — Authenticated write operations for community contributions
- **DNS TXT discovery** — `_uadp.<domain>` for zero-configuration node finding
- **WebFinger resolution** — Resolve any GAID URI to its UADP endpoint
- **Gossip federation** — Automatic peer propagation with hop limits
- **DID-based identity** — `did:web:` for verifiable, decentralized node identity
- **Resource signatures** — Ed25519/ES256 cryptographic signatures on resources
- **Federated search** — `?federated=true` queries peers and merges results
- **Extensible kinds** — `Skill`, `Agent`, `Tool`, or any custom resource type

## Design Principles

1. **Decentralized** — No central registry. Any domain can be a UADP node. DNS TXT records enable zero-config discovery.
2. **Federated** — Gossip protocol propagates peers automatically. No coordinator needed.
3. **Simple** — Two static JSON files = valid UADP node. Complexity is optional.
4. **Open** — Apache 2.0 license. No vendor lock-in. Community-governed spec.
5. **UADP IS the API** — No separate "marketplace API" or "skills API". Everything speaks UADP.
6. **Interoperable** — Built on OSSA payload format, works with any AI framework.
7. **Secure** — Trust tiers, DID-based identity, cryptographic signatures, circuit breakers.

## Relationship to OSSA

UADP is the **transport, discovery, and publishing layer**. [OSSA](https://openstandardagents.org) is the **payload format**.

- UADP defines HOW to find, publish, and exchange AI capabilities
- OSSA defines WHAT those capabilities look like (apiVersion, kind, metadata, spec)
- You can use OSSA without UADP (local manifests)
- You can use UADP with any payload format (but OSSA is recommended)

## Reference Implementations

| Platform | Status | Description |
|----------|--------|-------------|
| [Drupal Agent Marketplace](https://gitlab.com/blueflyio/agent-platform/drupal/ai_agents_marketplace) | Production | Full UADP node with federation |
| `@ossa/uadp` TypeScript SDK | Available | Client + Express server |
| `ossa-uadp` Python SDK | Available | Client + FastAPI server |
| `uadp-go` Go SDK | Available | Client + net/http handler |
| Static JSON template | Planned | GitHub Pages starter |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributions welcome — spec changes, new SDKs, reference implementations, conformance tests.

## License

Apache License 2.0 - see [LICENSE](LICENSE).
