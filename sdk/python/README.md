# DUADP — Python SDK

**Decentralized Universal AI Discovery Protocol.** The missing DNS layer for AI agents.

MCP connects tools. A2A connects agents. But how do agents *find* each other across organizational boundaries? There is no standard way to discover, publish, or verify AI capabilities on the open web. DUADP fills that gap.

[![PyPI](https://img.shields.io/pypi/v/uadp)](https://pypi.org/project/uadp/)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../LICENSE)
[![Live Node](https://img.shields.io/badge/live-discover.duadp.org-brightgreen)](https://discover.duadp.org/.well-known/duadp.json)

> **[duadp.org](https://duadp.org)** | **[Live Discovery Node](https://discover.duadp.org)** | **[Full Spec](https://gitlab.com/blueflyio/ossa/lab/duadp/-/blob/main/spec/README.md)** | **[OSSA](https://openstandardagents.org)**

---

## Install

```bash
pip install uadp
# or
uv add uadp
```

## Architecture

```
                    /.well-known/duadp.json
                           |
    +-------------+   +----v--------+   +-------------+
    |  Your App   |-->| DUADP Node  |<->| DUADP Node  |
    |  (client)   |   | (skills.sh) |   | (Acme Corp) |
    +-------------+   +------+------+   +-------------+
                             | gossip federation
                      +------v------+
                      | DUADP Node  |
                      | (your org)  |
                      +-------------+

Any domain that serves /.well-known/duadp.json becomes a discovery node.
Nodes find each other via DNS TXT records and gossip protocol.
Publish once, discover everywhere.
```

The protocol surface is small and complete:

```
GET  /.well-known/duadp.json          Node discovery manifest
GET  /api/v1/agents                   Paginated agent registry
GET  /api/v1/skills                   Paginated skill registry
GET  /api/v1/tools                    Paginated tool registry
GET  /api/v1/search?q=...&facets=true Unified cross-type search
POST /api/v1/publish                  Publish any OSSA resource
POST /api/v1/validate                 Validate manifest against spec
GET  /api/v1/federation               Peer node directory
POST /api/v1/federation               Register as federation peer
GET  /api/v1/governance               NIST AI RMF governance policies
GET  /api/v1/health                   Node health and resource count
```

## Quick Start

### Client -- discover any node

```python
from duadp import DuadpClient, resolve_gaid

async with DuadpClient("https://discover.duadp.org") as client:
    # Discovery
    manifest = await client.discover()
    print(f"{manifest.node_name} — {manifest.protocol_version}")
    # => "DUADP Discovery Node — 0.2.0"

    # Browse resources
    agents = await client.list_agents()              # 57 agents
    skills = await client.list_skills()              # 5 skills
    tools = await client.list_tools(protocol="mcp")  # MCP-compatible tools

    # Unified search across all types
    results = await client.search(q="security", facets=True)

    # Publish (requires auth token)
    await client.publish_skill(my_skill_manifest)

# Resolve a GAID URI from any node on the web
client, kind, name = resolve_gaid("agent://skills.sh/skills/web-search")
skill = await client.get_skill(name)
```

### Server -- turn your FastAPI app into a DUADP node

```python
from fastapi import FastAPI
from duadp.server import create_uadp_router

app = FastAPI()
router = create_uadp_router(
    node_name="My Registry",
    node_id="did:web:registry.example.com",
    base_url="https://registry.example.com",
    federation={"gossip": True, "max_hops": 3},
    provider=my_data_provider,  # implement DuadpDataProvider
)
app.include_router(router)
# Now serves /.well-known/duadp.json and all /api/v1/* routes
```

### Validate OSSA manifests

```python
from duadp.validate import validate_manifest

result = validate_manifest(skill_json)
if not result.valid:
    print(result.errors)
```

### Cryptographic signing

```python
from duadp.crypto import generate_key_pair, sign_resource, verify_signature

keys = generate_key_pair()                               # Ed25519
signed = sign_resource(resource, keys.private_key)
verified = verify_signature(signed, keys.public_key)     # True/False
```

### DID resolution

```python
from duadp.did import resolve_did, build_did_web

doc = await resolve_did("did:web:example.com")       # W3C DID Document
doc = await resolve_did("did:key:z6Mkf5rG...")       # did:key support
```

## Full Client API

```python
async with DuadpClient("https://discover.duadp.org", token="...") as client:

    # Core Discovery
    await client.discover()                          # Fetch manifest
    await client.get_health()                        # Node health + resource count
    await client.search(q="...", facets=True)        # Cross-type search
    await client.resolve_gaid(gaid)                  # WebFinger lookup
    await client.get_agent_index(gaid)               # .ajson index card

    # Resources — full CRUD
    await client.list_skills(search="...", category="...", tag="...")
    await client.get_skill(name)
    await client.publish_skill(skill)
    await client.update_skill(name, skill)
    await client.delete_skill(name)
    await client.list_agents(...)
    await client.get_agent(name)
    await client.publish_agent(agent)
    await client.list_tools(protocol="mcp")
    await client.get_tool(name)
    await client.publish_tool(tool)
    await client.publish(resource)                   # Generic publish
    await client.validate(manifest_str)              # Validate manifest

    # NIST AI RMF Governance
    await client.get_governance()                    # Compliance frameworks
    await client.get_resource_risk(gaid)             # NIST MAP 5.1 risk
    await client.get_audit_log(event_type=..., gaid=..., since=...)
    await client.get_provenance(gaid)                # SLSA provenance + SBOM
    await client.get_revocations(severity=..., since=...)
    await client.get_agent_identity(gaid)            # DID + DNS + keys

    # Context and Analytics
    await client.negotiate_context(gaid, task)       # Layered context delivery
    await client.get_context_summary(domain, task_type)
    await client.report_token_usage(analytics)       # Per-execution tracking
    await client.get_token_analytics(gaid, period)
    await client.get_capability_fingerprint(gaid)    # Empirical performance

    # Feedback and Reputation
    await client.submit_feedback(feedback)           # Multi-dimension feedback
    await client.get_agent_reputation(gaid)          # Composite score + trend
    await client.record_reward(reward)               # Reputation boosts, badges
    await client.submit_attestation(attestation)     # Signed outcome records
    await client.get_attestations(gaid, outcome=..., since=...)

    # Multi-Agent Orchestration
    await client.delegate(request)                   # Context transfer + budget
    await client.create_orchestration_plan(plan)     # DAG/parallel/sequential
    await client.get_orchestration_plan(plan_id)

    # Batch Operations
    await client.batch_publish(resources, atomic=True, dry_run=False)

    # Protocol Interop
    await client.get_a2a_card(agent_name)            # Google A2A Agent Card
    await client.get_mcp_manifest()                  # MCP Server Manifest

    # Federation
    await client.get_federation()                    # List peers
    await client.register_as_peer(registration)      # Join the mesh
    await client.federation_sync(since=..., sync_token=...)
    await client.subscribe_webhook(subscription)     # Real-time events
```

## Key Concepts

| Concept | What it is |
|---------|------------|
| **DUADP Node** | Any HTTP server implementing `/.well-known/duadp.json` and `/api/v1/*` endpoints |
| **GAID** | Global Agent Identifier -- `agent://domain/kind/name` URI for cross-registry resolution |
| **DID** | W3C Decentralized Identifier -- `did:web:example.com` for cryptographic node identity |
| **Trust Tier** | `official` > `verified-signature` > `signed` > `community` > `experimental` |
| **Federation** | Gossip-based peer discovery with circuit breakers and configurable hop limits |
| **OSSA** | Open Standard for Agent Systems -- the payload format for skills, agents, and tools |

## Types

103 Pydantic models covering:

- **Core**: `DuadpManifest`, `OssaResource`, `OssaSkill`, `OssaAgent`, `OssaTool`, `ResourceIdentity`
- **Discovery**: `WebFingerResponse`, `NodeHealth`, `AgentIndexRecord`, `ProtocolEndpoints`
- **NIST RMF**: `NodeGovernance`, `ResourceRisk`, `ResourceProvenance`, `Attestation`, `Revocation`, `AuditEvent`
- **Context**: `ContextNegotiation`, `ContextLayer`, `KnowledgeSource`, `ContextCacheRef`
- **Analytics**: `TokenAnalytics`, `TokenAnalyticsAggregate`, `CapabilityFingerprint`
- **Feedback**: `AgentFeedback`, `FeedbackDimensions`, `AgentReputation`, `RewardEvent`
- **Orchestration**: `DelegationRequest`, `DelegationResult`, `OrchestrationPlan`, `OrchestrationStep`
- **Federation**: `Peer`, `FederationResponse`, `SyncResponse`, `WebhookSubscription`
- **Interop**: `A2AAgentCard`, `McpServerManifest`
- **Query**: `StructuredQuery`, `QueryFilter`, `QuerySort`

## Modules

```python
from duadp import DuadpClient, DuadpError, resolve_gaid
from duadp.server import create_uadp_router
from duadp.crypto import sign_resource, verify_signature, generate_key_pair
from duadp.did import resolve_did, build_did_web, verify_resource_identity
from duadp.validate import validate_manifest, validate_response
from duadp.conformance import run_conformance_tests
from duadp.types import (
    DuadpManifest, OssaResource, OssaSkill, OssaAgent, OssaTool,
    NodeHealth, ContextNegotiation, TokenAnalytics, AgentFeedback,
    DelegationRequest, OrchestrationPlan, AgentReputation,
)
```

## Try It Now

The reference node is live at [discover.duadp.org](https://discover.duadp.org) with 65 resources (57 agents, 5 skills, 3 tools).

```bash
# Discover the node
curl https://discover.duadp.org/.well-known/duadp.json

# List agents
curl https://discover.duadp.org/api/v1/agents

# Search
curl "https://discover.duadp.org/api/v1/search?q=security&facets=true"
```

## Also Available

| Language | Package | Registry |
|----------|---------|----------|
| TypeScript | [`@duadp/sdk`](https://www.npmjs.com/package/@bluefly/duadp) | npm |
| Go | `github.com/duadp/sdk-go` | Go modules |

## License

Apache-2.0
