# DUADP Vision: The Agent Internet Stack

## The Problem

Today's AI agent ecosystem has a critical gap: **agents can't find each other**.

- **MCP** lets agents access tools — but assumes you already know which tool server to connect to
- **A2A** lets agents talk to each other — but assumes you already have the other agent's URL
- **OSSA** defines what an agent is — but doesn't say where to find one

This is like having HTTP without DNS. You can load any webpage — if someone gives you the IP address.

## The Solution: Three-Layer Agent Internet Stack

```
┌──────────────────────────────────────────────────────┐
│                    RUNTIME LAYER                      │
│    Execution: Docker, Kubernetes, Vast.ai, NAS       │
│    Protocols: MCP (tools), A2A (agent-to-agent)      │
├──────────────────────────────────────────────────────┤
│                  DEFINITION LAYER                     │
│    OSSA: Vendor-neutral agent manifests               │
│    Schema-validated, portable, security-aware         │
├──────────────────────────────────────────────────────┤
│                 DISCOVERY LAYER                       │
│    DUADP: Decentralized agent discovery               │
│    DNS TXT, WebFinger, gossip federation              │
└──────────────────────────────────────────────────────┘
```

| Web Stack | Agent Stack | Purpose |
|-----------|-------------|---------|
| DNS | **DUADP** | Find things on the network |
| OpenAPI | **OSSA** | Define what a service/agent does |
| HTTP/REST | **MCP + A2A** | Communicate and execute |

## How Discovery Works

DUADP can be as simple as **two static JSON files**:

1. **DNS TXT record**: `_duadp.example.com TXT "v=duadp1 node=https://example.com"`
2. **`.well-known/duadp.json`**: Lists your agents and their OSSA manifests

For dynamic discovery, DUADP reference nodes form a **gossip mesh**:
- Publish an agent to any node → it propagates to all nodes
- Query any node → it searches the entire mesh
- No central registry, no single point of failure

## Identity: DIDs, Not URLs

Every agent gets a **Decentralized Identifier (DID)**:

```
did:web:duadp.org:agents:drupal-contributor
```

- `did:web:` — domain-verified identity (like HTTPS certificates)
- `did:key:` — self-certifying identity (no domain needed, works offline)

DIDs enable:
- **Cryptographic signatures** on agent manifests
- **Trust tiers** (community → signed → verified → official)
- **Revocation** when agents are compromised

## The Pipeline: From Idea to Discoverable Agent

```
Developer                    OSSA                      DUADP
    │                          │                          │
    ├─ writes manifest ───────►│                          │
    │     (.ossa.yaml)         │                          │
    │                          ├─ validates ──────────────│
    │                          ├─ scores (0-100) ────────│
    │                          ├─ exports (22 platforms) ─│
    │                          │                          │
    │                          ├─ lifecycle ──────────────│
    │                          │  (draft→review→approved) │
    │                          │                          │
    │                          ├─ registers ─────────────►│
    │                          │                          ├─ gossip propagation
    │                          │                          ├─ WebFinger resolution
    │                          │                          └─ DNS TXT discovery
```

## Trust Without Central Authority

DUADP's 5-tier trust model:

| Tier | Name | Verification |
|------|------|-------------|
| 1 | Community | Valid OSSA schema |
| 2 | Signed | Ed25519/ES256 signature present |
| 3 | Verified-Signature | DID resolves + public key matches |
| 4 | Verified | Domain ownership proof (DNS TXT or .well-known) |
| 5 | Official | Manual attestation by OSSA governance |

Trust is **additive and automated** — publish a manifest and it starts at tier 1. Sign it and you're tier 2. Resolve your DID and you're tier 3. Add a DNS record and you're tier 4.

## Decentralization Roadmap

The reference node today uses HTTP for gossip and SQLite for storage. The roadmap upgrades to production-grade decentralized infrastructure:

| Component | Current | Next |
|-----------|---------|------|
| Gossip | HTTP fan-out | **libp2p GossipSub** |
| Storage | SQLite | **Helia/IPFS** (content-addressed) |
| Peer Discovery | Env var bootstrap | **Kademlia DHT** |
| Identity | `did:web:` only | **`did:key`** (serverless) |
| State Sync | Query-time federation | **Yjs CRDTs** |

## Ecosystem

- **[OSSA CLI](https://www.npmjs.com/package/openstandardagents)** — `ossa validate`, `ossa export`, `ossa wizard`
- **[DUADP Reference Node](https://discover.duadp.org)** — Live discovery mesh
- **[DUADP TypeScript SDK](https://www.npmjs.com/package/@bluefly/duadp)** — Client library
- **[DUADP Python SDK](https://pypi.org/project/duadp/)** — Python client
- **[Compliance Engine](https://compliance.blueflyagents.com)** — Cedar policy evaluation
- **[Agent Marketplace](https://marketplace.blueflyagents.com)** — Drupal-powered marketplace

## Get Started

### Publish an agent in 30 seconds

```bash
# 1. Write a manifest
cat > my-agent.ossa.yaml <<EOF
apiVersion: ossa/v0.4.7
kind: Agent
metadata:
  name: my-agent
  version: 1.0.0
  description: My first OSSA agent
spec:
  role: You are a helpful assistant.
  llm:
    provider: anthropic
    model: claude-sonnet-4-20250514
EOF

# 2. Validate
npx openstandardagents validate my-agent.ossa.yaml

# 3. Register with DUADP
curl -X POST https://discover.duadp.org/api/v1/agents \
  -H "Content-Type: application/json" \
  -d @my-agent.ossa.yaml
```

### Run a DUADP node

```bash
git clone https://gitlab.com/blueflyio/duadp/duadp.git
cd duadp/reference-node
npm install && npm run seed && npm run dev
# Node running at http://localhost:4200
```

### Discover agents

```bash
# Search
curl https://discover.duadp.org/api/v1/search?q=drupal

# WebFinger
curl "https://discover.duadp.org/.well-known/webfinger?resource=agent://agents/drupal-contributor"

# A2A Agent Card
curl https://discover.duadp.org/api/v1/agents/drupal-contributor/card
```

## License

MIT — Because open standards must be open.
