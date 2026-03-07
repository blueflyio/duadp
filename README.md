# Decentralized Universal AI Discovery Protocol (DUADP)

**Decentralized, federated discovery and publishing for AI Agents, Skills, Tools, and Marketplaces.**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Spec Version](https://img.shields.io/badge/spec-v0.2.0-green.svg)](spec/README.md)
[![npm](https://img.shields.io/npm/v/@bluefly/duadp)](https://www.npmjs.com/package/@bluefly/duadp)
[![Website](https://img.shields.io/badge/website-duadp.org-blue)](https://duadp.org)

> **[duadp.org](https://duadp.org)** — Website coming soon. See **[openstandardagents.org/duadp](https://openstandardagents.org/duadp/)** for protocol details and the **[OSSA ecosystem](https://openstandardagents.org)**.

## What is DUADP?

DUADP is an open protocol that lets any system discover, publish, and exchange AI capabilities across organizational boundaries. Like DNS for websites or ActivityPub for social networks, DUADP provides a standard way for AI registries, marketplaces, and tools to find each other.

**DUADP is THE API.** Your Skills API, Marketplace API, Tool Registry — they all speak DUADP. Consumers don't need to know what platform powers a node. A Drupal marketplace, a Flask registry, a static JSON site, and a Kubernetes operator all expose the same endpoints.

**Any system that implements a few HTTP endpoints is a DUADP node.** There is no required language, framework, or database. Agents are distributed using the `.ajson` / `.jsona` (Agent JSON) payload format.

```
              DNS TXT: _uadp.skills.sh → "v=uadp1 url=..."

Your App                              skills.sh (DUADP node)
  |                                          |
  |  GET /.well-known/duadp.json              |
  |----------------------------------------->|
  |  { endpoints: { skills, tools, ... } }   |
  |<-----------------------------------------|
  |                                          |
  |  GET /api/v1/tools?protocol=mcp         |
  |----------------------------------------->|
  |  { data: [...], meta: {...} }            |
  |<-----------------------------------------|
  |                                          |
  |  POST /api/v1/publish (auth required)   |
  |  { kind: "Skill", metadata: {...} }      |
  |----------------------------------------->|
  |  201 { success: true, resource: {...} }  |
  |<-----------------------------------------|
```

## Quick Start

### Consume a DUADP node

**TypeScript:**
```typescript
import { DuadpClient, resolveGaid } from '@bluefly/duadp';

const client = new DuadpClient('https://skills.sh');
const skills = await client.listSkills({ search: 'code review' });
const tools = await client.listTools({ protocol: 'mcp' });

// Resolve a GAID from anywhere
const { client: c, name } = resolveGaid('agent://skills.sh/skills/web-search');
const skill = await c.getSkill(name);
```

**Python:**
```python
from duadp import DuadpClient, resolve_gaid

async with DuadpClient("https://skills.sh") as client:
    skills = await client.list_skills(search="code review")
    tools = await client.list_tools(protocol="mcp")

    # Publish (requires token)
    await client.publish_skill(my_skill)
```

**Go:**
```go
client := duadp.NewClient("https://skills.sh")
skills, _ := client.ListSkills(ctx, &duadp.ListParams{Search: "code review"})
tools, _ := client.ListTools(ctx, &duadp.ToolListParams{Protocol: "mcp"})

// Resolve a GAID
c, kind, name, _ := duadp.ResolveGaid("agent://skills.sh/tools/web-search")
tool, _ := c.GetTool(ctx, name)
```

### Build a DUADP node

The simplest node is two static JSON files:

```
your-site.com/
  .well-known/duadp.json     <- discovery manifest
  duadp/v1/skills             <- skills list (static JSON)
```

Optional DNS TXT record for zero-configuration discovery:
```
_uadp.your-site.com. IN TXT "v=uadp1 url=https://your-site.com/.well-known/duadp.json"
```

Or use an SDK to build a dynamic node with publishing, federation, and tools:

**TypeScript (Express):**
```typescript
import { createUadpRouter } from '@bluefly/duadp/server';

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
  README.md              # DUADP v0.2.0 spec document
  openapi.yaml           # OpenAPI 3.1 definition
  schemas/               # JSON Schema validation files
sdk/
  typescript/            # @bluefly/duadp npm package
  python/                # duadp (PyPI)
  go/                    # duadp-go module
```

### DUADP Core File Suite

| File | Role in DUADP | What goes inside? | Why it's best |
| --- | --- | --- | --- |
| **`ai.json`** | **the manifest** | protocol version, capabilities, ipfs/cid pointers. | machine-readable identity for automated "handshakes" between agents. |
| **`llms.txt`** | **the digest** | h1 title, project summary, and links to secondary docs. | the standard entry point for crawlers to "map" the project's purpose. |
| **`agents.md`** | **the manual** | build/test commands, file map, and architectural "no-go" zones. | provides context injection so agents don't hallucinate your project structure. |
| **`mcp.json`** | **the toolkit** | tool definitions, resource uris, and prompt templates. | defines the "hands" of the agent via the model context protocol. |
| **`data.md`** | **the ledger** | dataset provenance, training licenses, and hash verification. | ensures decentralized data integrity and legal/ethical compliance. |
| **`contract.md`** | **the protocol** | on-chain addresses, tokenomics, and api pricing/access. | defines how an autonomous agent "pays" or authenticates for services. |
| **`.cursorrules`** | **the guardrail** | project-specific coding logic and "always/never" instructions. | hardcodes your technical standards directly into the agent's reasoning loop. |
| **`prompts/`** | **the brain** | a directory of specific system instructions for sub-modules. | standardizes how agents behave when interacting with your demo's components. |

## Protocol Endpoints

| Endpoint | Method | Required | Description |
|----------|--------|----------|-------------|
| `/.well-known/duadp.json` | GET | MUST | Node discovery manifest |
| `/.well-known/webfinger` | GET | SHOULD | Resolve GAID to resource links |
| `/api/v1/skills` | GET | MUST* | List OSSA-formatted skills |
| `/api/v1/skills/{name}` | GET | MAY | Get single skill by name |
| `/api/v1/agents` | GET | MUST* | List OSSA-formatted agents |
| `/api/v1/tools` | GET | MUST* | List tools (MCP, A2A, etc.) |
| `/api/v1/publish` | POST | MAY | Publish any resource (auth) |
| `/api/v1/skills` | POST | MAY | Publish a skill (auth) |
| `/api/v1/federation` | GET | SHOULD | Peer node list |
| `/api/v1/federation` | POST | SHOULD | Register as peer (gossip) |
| `/api/v1/validate` | POST | MAY | Validate a manifest |
| `/api/v1/health` | GET | SHOULD | Node health status |
| `/api/v1/search` | GET | MAY | Unified cross-resource search |
| `/api/v1/index/{gaid}` | GET | MAY | Agent JSON index card |
| `/api/v1/context/negotiate` | POST | MAY | Context negotiation |
| `/api/v1/analytics/tokens` | POST | MAY | Report token usage |
| `/api/v1/analytics/tokens/{agentId}` | GET | MAY | Token analytics for agent |
| `/api/v1/feedback` | POST | MAY | Submit 360 feedback |
| `/api/v1/feedback/{agentId}` | GET | MAY | Get agent feedback |
| `/api/v1/reputation/{agentId}` | GET | MAY | Agent reputation score |
| `/api/v1/rewards` | POST | MAY | Record reward event |
| `/api/v1/attestations` | POST | MAY | Submit outcome attestation |
| `/api/v1/delegate` | POST | MAY | Multi-agent delegation |
| `/api/v1/orchestration` | POST | MAY | Create orchestration plan |
| `/api/v1/publish/batch` | POST | MAY | Atomic batch publish (CI/CD) |
| `/api/v1/validate/batch` | POST | MAY | Batch validation |
| `/api/v1/agents/{name}/card` | GET | MAY | A2A Agent Card (Google A2A interop) |
| `/api/v1/tools/mcp-manifest` | GET | MAY | MCP Server Manifest |
| `/.well-known/mcp` | GET | MAY | MCP well-known discovery |
| `/api/v1/query` | POST | MAY | Structured query with compound filters |

*At least one of skills, agents, or tools MUST be implemented.

## Key Features (v0.2)

- **Tools as first-class resources** — MCP servers, A2A tools, function-calling tools alongside skills and agents
- **Publishing API** — Authenticated write operations for community contributions
- **DNS TXT discovery** — `_uadp.<domain>` for zero-configuration node finding
- **WebFinger resolution** — Resolve any GAID URI (like `duadp://`) to its DUADP endpoint
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

**Try it now** — the hosted reference node is live at [`discover.duadp.org`](https://discover.duadp.org/.well-known/duadp.json):

```bash
# Discovery manifest
curl https://discover.duadp.org/.well-known/duadp.json

# Browse skills, agents, tools
curl https://discover.duadp.org/api/v1/skills
curl https://discover.duadp.org/api/v1/agents
curl https://discover.duadp.org/api/v1/tools

# Health check
curl https://discover.duadp.org/api/v1/health

# Governance (NIST AI RMF)
curl https://discover.duadp.org/api/v1/governance

# Search across all resources
curl "https://discover.duadp.org/api/v1/search?q=code+review"

# Agent reputation
curl "https://discover.duadp.org/api/v1/reputation/agent%3A%2F%2Fagents%2Forchestrator"

# Publish a resource (POST)
curl -X POST https://discover.duadp.org/api/v1/publish \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"apiVersion":"ossa/v0.5","kind":"Skill","metadata":{"name":"my-skill","description":"My custom skill"}}'
```

Node ID: `did:web:discover.duadp.org` | Protocol: DUADP v0.2.0 | 5 skills, 3 agents, 3 tools seeded

## Run the Reference Node Locally

```bash
# 1. Install reference node dependencies (SDK is on npm)
cd reference-node && npm ci

# 2. Seed the database
npx tsx src/seed.ts

# 3. Start the node
npx tsx src/index.ts
# → DUADP Reference Node "OSSA Reference Node" running at http://localhost:4200
# → Discovery: http://localhost:4200/.well-known/duadp.json

# 4. Verify
curl http://localhost:4200/.well-known/duadp.json
curl http://localhost:4200/api/v1/health
curl http://localhost:4200/api/v1/skills
curl http://localhost:4200/api/v1/agents
curl http://localhost:4200/api/v1/tools
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
| `DUADP_BASE_URL` | `http://localhost:4200` | Public base URL |
| `DUADP_NODE_NAME` | `OSSA Reference Node` | Human-readable node name |
| `DUADP_NODE_ID` | `did:web:localhost` | DID identifier for this node |
| `DB_PATH` | `./data/duadp.db` | SQLite database path |

## Verified Endpoint Status

All endpoints tested and passing (reference node v0.2.0):

| Endpoint | Method | Status | Description |
|----------|--------|--------|-------------|
| `/.well-known/duadp.json` | GET | **Verified** | Discovery manifest with all endpoints |
| `/.well-known/webfinger` | GET | **Verified** | GAID resolution (agent:// URIs) |
| `/api/v1/skills` | GET | **Verified** | List skills (5 seeded), paginated |
| `/api/v1/skills/:name` | GET | **Verified** | Get single skill by name |
| `/api/v1/agents` | GET | **Verified** | List agents (3 seeded), paginated |
| `/api/v1/agents/:name` | GET | **Verified** | Get single agent by name |
| `/api/v1/tools` | GET | **Verified** | List tools (3 seeded), with `?protocol=` filter |
| `/api/v1/tools/:name` | GET | **Verified** | Get single tool by name |
| `/api/v1/publish` | POST | **Verified** | Publish any resource (auth required) |
| `/api/v1/skills` | POST | **Verified** | Publish a skill (auth required) |
| `/api/v1/skills/:name` | PUT | **Verified** | Update a skill (auth required) |
| `/api/v1/skills/:name` | DELETE | **Verified** | Delete a skill (auth required) |
| `/api/v1/validate` | POST | **Verified** | Validate OSSA manifest JSON |
| `/api/v1/federation` | GET | **Verified** | List federation peers |
| `/api/v1/federation` | POST | **Verified** | Register as peer (gossip) |
| `/api/v1/health` | GET | **Verified** | Node health + resource counts |
| `/api/v1/search` | GET | **Verified** | Cross-resource search with facets |
| `/api/v1/governance` | GET | **Verified** | NIST AI RMF governance config |
| `/api/v1/feedback` | POST | **Verified** | Submit 360 feedback |
| `/api/v1/feedback/:agentId` | GET | **Verified** | Get agent feedback history |
| `/api/v1/reputation/:agentId` | GET | **Verified** | Computed reputation score |
| `/api/v1/analytics/tokens` | POST | **Verified** | Report token usage |
| `/api/v1/analytics/tokens/:agentId` | GET | **Verified** | Token analytics per agent |
| `/api/v1/attestations` | POST | **Verified** | Submit outcome attestation |
| `/api/v1/attestations/:agentId` | GET | **Verified** | Get agent attestations |
| `/api/v1/audit` | GET | **Verified** | Audit log with filters |

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
| [OSSA Reference Node](https://discover.duadp.org/.well-known/duadp.json) | **Live** | SQLite-backed reference node ([`reference-node/`](reference-node/)) |
| Drupal Agent Marketplace | Production | Full DUADP node with federation (Drupal module) |
| [`@bluefly/duadp`](https://www.npmjs.com/package/@bluefly/duadp) TypeScript SDK | **136 tests passing** | Client + Express server ([`sdk/typescript/`](sdk/typescript/)) |
| [`duadp`](https://pypi.org/project/duadp/) Python SDK | Available | Client + FastAPI server |
| DUADP Go SDK | Available | Client + net/http handler |
| Static JSON template | Planned | GitHub Pages starter |

## Also Available

| Language | Package | Registry |
|----------|---------|----------|
| TypeScript | [`@bluefly/duadp`](https://www.npmjs.com/package/@bluefly/duadp) | npm |
| Python | [`duadp`](https://pypi.org/project/duadp/) | PyPI |
| Go | `github.com/blueflyio/duadp/sdk/go` | Go modules |

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
