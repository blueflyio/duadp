# Decentralized Universal Agent Discovery Protocol (DUADP)

**Decentralized, federated discovery and publishing for AI Agents, Skills, Tools, and Marketplaces.**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Spec Version](https://img.shields.io/badge/spec-v0.2.0-green.svg)](spec/README.md)

## What is DUADP?

DUADP is an open protocol that lets any system discover, publish, and exchange AI capabilities across organizational boundaries. Like DNS for websites or ActivityPub for social networks, DUADP provides a standard way for AI registries, marketplaces, and tools to find each other.

**DUADP is THE API.** Your Skills API, Marketplace API, Tool Registry — they all speak DUADP. Consumers don't need to know what platform powers a node. A Drupal marketplace, a Flask registry, a static JSON site, and a Kubernetes operator all expose the same endpoints.

**Any system that implements a few HTTP endpoints is a DUADP node.** There is no required language, framework, or database. Agents are distributed using the `.ajson` / `.jsona` (Agent JSON) payload format.

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
| `/uadp/v1/health` | GET | SHOULD | Node health status |
| `/uadp/v1/search` | GET | MAY | Unified cross-resource search |
| `/uadp/v1/index/{gaid}` | GET | MAY | Agent JSON index card |
| `/uadp/v1/context/negotiate` | POST | MAY | Context negotiation |
| `/uadp/v1/analytics/tokens` | POST | MAY | Report token usage |
| `/uadp/v1/analytics/tokens/{agentId}` | GET | MAY | Token analytics for agent |
| `/uadp/v1/feedback` | POST | MAY | Submit 360 feedback |
| `/uadp/v1/feedback/{agentId}` | GET | MAY | Get agent feedback |
| `/uadp/v1/reputation/{agentId}` | GET | MAY | Agent reputation score |
| `/uadp/v1/rewards` | POST | MAY | Record reward event |
| `/uadp/v1/attestations` | POST | MAY | Submit outcome attestation |
| `/uadp/v1/delegate` | POST | MAY | Multi-agent delegation |
| `/uadp/v1/orchestration` | POST | MAY | Create orchestration plan |
| `/uadp/v1/publish/batch` | POST | MAY | Atomic batch publish (CI/CD) |
| `/uadp/v1/validate/batch` | POST | MAY | Batch validation |
| `/uadp/v1/agents/{name}/card` | GET | MAY | A2A Agent Card (Google A2A interop) |
| `/uadp/v1/tools/mcp-manifest` | GET | MAY | MCP Server Manifest |
| `/.well-known/mcp` | GET | MAY | MCP well-known discovery |
| `/uadp/v1/query` | POST | MAY | Structured query with compound filters |

*At least one of skills, agents, or tools MUST be implemented.

## Key Features (v0.2)

- **Tools as first-class resources** — MCP servers, A2A tools, function-calling tools alongside skills and agents
- **Publishing API** — Authenticated write operations for community contributions
- **DNS TXT discovery** — `_uadp.<domain>` for zero-configuration node finding
- **WebFinger resolution** — Resolve any GAID URI (like `uadp://`) to its DUADP endpoint
- **Gossip federation** — Automatic peer propagation with hop limits
- **DID-based identity** — `did:web:` and `did:key:` with DIF standard resolvers
- **Resource signatures** — Ed25519 cryptographic signatures with RFC 8785 canonicalization
- **Federated search** — `?federated=true` queries peers and merges results
- **Extensible kinds** — `Skill`, `Agent` (via `.ajson`), `Tool`, or any custom resource type
- **Context negotiation** — Layered context delivery with priority tiers and knowledge graph sources
- **Token analytics** — Per-execution and aggregate tracking with efficiency scoring
- **360 feedback** — Multi-source feedback (human, agent, system, automated-test) with structured dimensions
- **Agent rewards** — Reputation boosts, capability unlocks, token credits, and badges
- **Outcome attestations** — Signed, verifiable task outcome records for portable reputation
- **Multi-agent orchestration** — DAG/parallel/sequential/adaptive execution across OSSA agent types
- **Capability fingerprints** — Empirical performance data by domain, task type, and model affinity
- **Batch operations** — Atomic batch publish/validate for CI/CD pipelines with dry-run support
- **A2A Agent Card** — Google A2A protocol interop via `/agents/{name}/card`
- **MCP Server Manifest** — Expose tools as MCP-compatible server at `/.well-known/mcp`
- **Structured query** — Compound filters, sort, field projection, cursor-based pagination
- **OAuth2/OIDC** — Authorization code + client credentials flows for secure agent auth

## Design Principles

1. **Decentralized** — No central registry. Any domain can be a DUADP node. DNS TXT records enable zero-config discovery.
2. **Federated** — Gossip protocol propagates peers automatically. No coordinator needed.
3. **Simple** — Two static JSON files = valid DUADP node. Complexity is optional.
4. **Open** — Apache 2.0 license. No vendor lock-in. Community-governed spec.
5. **DUADP IS the API** — No separate "marketplace API" or "skills API". Everything speaks DUADP.
6. **Interoperable** — Built on the `.ajson` payload format, works with any AI framework.
7. **Secure** — Trust tiers, DID-based identity, cryptographic signatures, circuit breakers.

## Relationship to OSSA

DUADP is the **transport, discovery, and publishing layer**. [OSSA](https://openstandardagents.org) provides the semantic **payload format** (via `.ajson`).

- DUADP defines HOW to find, publish, and exchange AI capabilities
- The OSSA `.ajson` specification defines WHAT those capabilities look like (apiVersion, kind, metadata, spec)
- You can use `.ajson` without DUADP (local manifests)
- You can use DUADP with any payload format (but `.ajson` is recommended)

## Live Reference Node

**Try it now** — the OSSA Reference Node is live at [`uadp.blueflyagents.com`](https://uadp.blueflyagents.com/.well-known/uadp.json):

```bash
# Discovery manifest
curl https://uadp.blueflyagents.com/.well-known/uadp.json

# Browse skills, agents, tools
curl https://uadp.blueflyagents.com/uadp/v1/skills
curl https://uadp.blueflyagents.com/uadp/v1/agents
curl https://uadp.blueflyagents.com/uadp/v1/tools

# Health check
curl https://uadp.blueflyagents.com/uadp/v1/health

# Governance (NIST AI RMF)
curl https://uadp.blueflyagents.com/uadp/v1/governance

# Search across all resources
curl "https://uadp.blueflyagents.com/uadp/v1/search?q=code+review"

# Agent reputation
curl "https://uadp.blueflyagents.com/uadp/v1/reputation/agent%3A%2F%2Fagents%2Forchestrator"

# Publish a resource (POST)
curl -X POST https://uadp.blueflyagents.com/uadp/v1/publish \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"apiVersion":"ossa/v0.5","kind":"Skill","metadata":{"name":"my-skill","description":"My custom skill"}}'
```

Node ID: `did:web:uadp.blueflyagents.com` | Protocol: UADP v0.2.0 | 5 skills, 3 agents, 3 tools seeded

## Run the Reference Node Locally

```bash
# 1. Build the SDK
cd sdk/typescript && npm ci && npm run build && cd ../..

# 2. Install reference node dependencies
cd reference-node && npm ci

# 3. Seed the database
npx tsx src/seed.ts

# 4. Start the node
npx tsx src/index.ts
# → UADP Reference Node "OSSA Reference Node" running at http://localhost:4200
# → Discovery: http://localhost:4200/.well-known/uadp.json

# 5. Verify
curl http://localhost:4200/.well-known/uadp.json
curl http://localhost:4200/uadp/v1/health
curl http://localhost:4200/uadp/v1/skills
curl http://localhost:4200/uadp/v1/agents
curl http://localhost:4200/uadp/v1/tools
```

### Docker

```bash
cd reference-node
docker compose up --build
# → Runs on port 4200 with persistent SQLite volume
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4200` | HTTP port |
| `UADP_BASE_URL` | `http://localhost:4200` | Public base URL |
| `UADP_NODE_NAME` | `OSSA Reference Node` | Human-readable node name |
| `UADP_NODE_ID` | `did:web:localhost` | DID identifier for this node |
| `DB_PATH` | `./data/uadp.db` | SQLite database path |

## Verified Endpoint Status

All endpoints tested and passing (reference node v0.2.0):

| Endpoint | Method | Status | Description |
|----------|--------|--------|-------------|
| `/.well-known/uadp.json` | GET | **Verified** | Discovery manifest with all endpoints |
| `/.well-known/webfinger` | GET | **Verified** | GAID resolution (agent:// URIs) |
| `/uadp/v1/skills` | GET | **Verified** | List skills (5 seeded), paginated |
| `/uadp/v1/skills/:name` | GET | **Verified** | Get single skill by name |
| `/uadp/v1/agents` | GET | **Verified** | List agents (3 seeded), paginated |
| `/uadp/v1/agents/:name` | GET | **Verified** | Get single agent by name |
| `/uadp/v1/tools` | GET | **Verified** | List tools (3 seeded), with `?protocol=` filter |
| `/uadp/v1/tools/:name` | GET | **Verified** | Get single tool by name |
| `/uadp/v1/publish` | POST | **Verified** | Publish any resource (auth required) |
| `/uadp/v1/skills` | POST | **Verified** | Publish a skill (auth required) |
| `/uadp/v1/skills/:name` | PUT | **Verified** | Update a skill (auth required) |
| `/uadp/v1/skills/:name` | DELETE | **Verified** | Delete a skill (auth required) |
| `/uadp/v1/validate` | POST | **Verified** | Validate OSSA manifest JSON |
| `/uadp/v1/federation` | GET | **Verified** | List federation peers |
| `/uadp/v1/federation` | POST | **Verified** | Register as peer (gossip) |
| `/uadp/v1/health` | GET | **Verified** | Node health + resource counts |
| `/uadp/v1/search` | GET | **Verified** | Cross-resource search with facets |
| `/uadp/v1/governance` | GET | **Verified** | NIST AI RMF governance config |
| `/uadp/v1/feedback` | POST | **Verified** | Submit 360 feedback |
| `/uadp/v1/feedback/:agentId` | GET | **Verified** | Get agent feedback history |
| `/uadp/v1/reputation/:agentId` | GET | **Verified** | Computed reputation score |
| `/uadp/v1/analytics/tokens` | POST | **Verified** | Report token usage |
| `/uadp/v1/analytics/tokens/:agentId` | GET | **Verified** | Token analytics per agent |
| `/uadp/v1/attestations` | POST | **Verified** | Submit outcome attestation |
| `/uadp/v1/attestations/:agentId` | GET | **Verified** | Get agent attestations |
| `/uadp/v1/audit` | GET | **Verified** | Audit log with filters |

## SDK Test Suite

The TypeScript SDK includes 136 tests across 7 test files:

```
 ✓ circuit-breaker.test.ts   (12 tests)
 ✓ validate.test.ts          (22 tests)
 ✓ dedup.test.ts              (7 tests)
 ✓ crypto.test.ts            (24 tests)
 ✓ did.test.ts               (11 tests)
 ✓ e2e-crypto.test.ts        (24 tests)
 ✓ integration.test.ts       (36 tests)
 ────────────────────────────────────────
   7 passed | 136 tests | ~500ms
```

Run tests:
```bash
cd sdk/typescript && npm test
```

## Reference Implementations

| Platform | Status | Description |
|----------|--------|-------------|
| [OSSA Reference Node](https://uadp.blueflyagents.com/.well-known/uadp.json) | **Live** | SQLite-backed reference node ([`reference-node/`](reference-node/)) |
| [Drupal Agent Marketplace](https://gitlab.com/blueflyio/agent-platform/drupal/ai_agents_marketplace) | Production | Full DUADP node with federation |
| `@ossa/uadp` TypeScript SDK | **136 tests passing** | Client + Express server ([`sdk/typescript/`](sdk/typescript/)) |
| `ossa-uadp` Python SDK | Available | Client + FastAPI server |
| `uadp-go` Go SDK | Available | Client + net/http handler |
| Static JSON template | Planned | GitHub Pages starter |

## Seeded Data

The reference node seeds with realistic OSSA-formatted resources:

| Kind | Count | Examples |
|------|-------|---------|
| Skills | 5 | `web-search`, `code-review`, `text-summarizer`, `data-analyzer`, `image-classifier` |
| Agents | 3 | `orchestrator` (multi-agent), `code-reviewer` (worker), `security-auditor` (specialist) |
| Tools | 3 | `mcp-filesystem` (MCP), `a2a-email` (A2A), `openapi-weather` (REST) |
| Audit Log | 10 | Resource creation, updates, federation sync, auth events |
| Feedback | 5 | Human, agent, and system feedback with structured dimensions |
| Token Usage | 5 | Per-agent token tracking with model and cost data |
| Attestations | 3 | Signed outcome records with metrics |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributions welcome — spec changes, new SDKs, reference implementations, conformance tests.

## License

Apache License 2.0 - see [LICENSE](LICENSE).
