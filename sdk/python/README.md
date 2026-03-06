# DUADP — Python SDK

**The official Python SDK for [DUADP](https://openstandardagents.org/duadp/) (Decentralized Universal AI Discovery Protocol).**

[![PyPI](https://img.shields.io/pypi/v/uadp)](https://pypi.org/project/uadp/)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../LICENSE)

> **[openstandardagents.org/duadp](https://openstandardagents.org/duadp/)** | **[duadp.org](https://duadp.org)** (coming soon) | **[Full Spec](https://gitlab.com/blueflyio/ossa/lab/duadp/-/blob/main/spec/README.md)**

## Install

```bash
pip install uadp
# or
uv add uadp
```

## Quick Start — Client

```python
from bluefly_duadp import DuadpClient, resolve_gaid

async with DuadpClient("https://skills.sh", token="my-api-key") as client:
    # Discovery
    manifest = await client.discover()
    skills = await client.list_skills(search="code review")
    tools = await client.list_tools(protocol="mcp")
    agents = await client.list_agents()

    # Unified search across all resource types
    results = await client.search(q="code review", facets=True)

    # Health check
    health = await client.get_health()

    # Publish (requires auth token)
    await client.publish_skill(my_skill)

# Resolve a GAID URI from any node
client, kind, name = resolve_gaid("agent://skills.sh/skills/web-search")
skill = await client.get_skill(name)
```

## Features

### Core Discovery
- **Client** — Async `DuadpClient` with automatic manifest discovery and caching
- **Server** — FastAPI router for building DUADP nodes
- **GAID resolution** — `resolve_gaid()` supports both `agent://` and `duadp://` schemes
- **WebFinger** — `resolve_gaid()` for standard resource resolution
- **Unified search** — `search()` with faceted results across all types
- **Health** — `get_health()` for node status monitoring
- **Agent index** — `get_agent_index()` for `.ajson` index cards

### Identity & Security
- **DID resolution** — `did:web:` and `did:key:` support
- **Cryptographic signatures** — Ed25519 signing/verification
- **Resource identity verification** — Full chain: DID resolve -> extract key -> verify signature -> check lifecycle

### NIST AI RMF Governance
- **Governance** — `get_governance()` for node compliance frameworks, risk tolerance, data classification
- **Risk assessment** — `get_resource_risk()` for NIST MAP 5.1 risk impact
- **Audit trail** — `get_audit_log()` with event type, GAID, and time filters (NIST AU-2, AU-3)
- **Provenance** — `get_provenance()` for SLSA-style build info, SBOM, attestations (NIST SP 800-218A)
- **Revocations** — `get_revocations()` for revoked resources (NIST SI-7, CM-3)
- **Agent identity** — `get_agent_identity()` with DID, DNS records, service accounts, cryptographic keys

### Context & Analytics
- **Context negotiation** — `negotiate_context()` for layered context delivery with priority tiers
- **Context summary** — `get_context_summary()` for cached domain context
- **Token analytics** — `report_token_usage()` / `get_token_analytics()` with per-execution tracking
- **Capability fingerprints** — `get_capability_fingerprint()` for empirical performance data

### Feedback & Rewards
- **360 feedback** — `submit_feedback()` with multi-source dimensions (accuracy, efficiency, quality, helpfulness)
- **Agent reputation** — `get_agent_reputation()` with composite scoring and trend
- **Reward events** — `record_reward()` for reputation boosts, capability unlocks, badges
- **Outcome attestations** — `submit_attestation()` / `get_attestations()` for signed task outcome records

### Multi-Agent Orchestration
- **Delegation** — `delegate()` with compressed context transfer, budget constraints, depth limits
- **Orchestration plans** — `create_orchestration_plan()` / `get_orchestration_plan()` for DAG/parallel/sequential/adaptive
- **OSSA agent types** — orchestrator, worker, specialist, critic, monitor, gateway

### Federation
- **Peer discovery** — `get_federation()` for peer node listing
- **Peer registration** — `register_as_peer()` with gossip propagation
- **Incremental sync** — `federation_sync()` with sync tokens and cursors
- **Webhooks** — `subscribe_webhook()` for real-time event notifications

## Client API

```python
async with DuadpClient("https://skills.sh", token="...") as client:

    # Core
    await client.discover()                          # Fetch manifest
    await client.get_manifest()                      # Get cached manifest
    await client.resolve_gaid(gaid)                  # WebFinger lookup
    await client.get_health()                        # Node health
    await client.search(q="...", facets=True)         # Cross-type search
    await client.get_agent_index(gaid)               # .ajson index card

    # Resources
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

    # Governance (NIST AI RMF)
    await client.get_governance()                    # Node governance
    await client.get_resource_risk(gaid)             # Risk assessment
    await client.get_audit_log(event_type=..., gaid=..., since=...)
    await client.get_provenance(gaid)                # Supply chain provenance
    await client.get_revocations(severity=..., since=...)
    await client.get_agent_identity(gaid)            # Agent identity

    # Context & Analytics
    await client.negotiate_context(gaid, task)       # Context negotiation
    await client.get_context_summary(domain, task_type)
    await client.report_token_usage(analytics)       # Report usage
    await client.get_token_analytics(gaid, period)   # Get analytics
    await client.get_capability_fingerprint(gaid)    # Performance data

    # Feedback & Rewards
    await client.submit_feedback(feedback)           # Submit feedback
    await client.get_agent_feedback(gaid, type=..., since=...)
    await client.get_agent_reputation(gaid)          # Get reputation
    await client.record_reward(reward)               # Record reward
    await client.submit_attestation(attestation)     # Submit attestation
    await client.get_attestations(gaid, outcome=..., since=...)

    # Delegation & Orchestration
    await client.delegate(request)                   # Delegate task
    await client.create_orchestration_plan(plan)     # Create plan
    await client.get_orchestration_plan(plan_id)     # Get plan

    # Batch Operations (CI/CD)
    await client.batch_publish(resources, atomic=True, dry_run=False)

    # Protocol Interop
    await client.get_a2a_card(agent_name)            # A2A Agent Card
    await client.get_mcp_manifest()                  # MCP Server Manifest

    # Structured Query
    await client.query({"filters": [...], "sort": [...], "limit": 50})

    # Federation
    await client.get_federation()                    # List peers
    await client.register_as_peer(registration)      # Register as peer
    await client.federation_sync(since=..., sync_token=...)
    await client.subscribe_webhook(subscription)     # Subscribe webhook
```

## Types

The SDK exports 103 Pydantic models covering:

- **Core**: `UadpManifest`, `OssaResource`, `OssaSkill`, `OssaAgent`, `OssaTool`, `ResourceIdentity`
- **Discovery**: `WebFingerResponse`, `NodeHealth`, `AgentIndexRecord`, `ProtocolEndpoints`
- **NIST RMF**: `NodeGovernance`, `ResourceRisk`, `ResourceProvenance`, `Attestation`, `Revocation`, `AuditEvent`
- **Context**: `ContextNegotiation`, `ContextLayer`, `KnowledgeSource`, `ContextCacheRef`
- **Analytics**: `TokenAnalytics`, `TokenAnalyticsAggregate`, `CapabilityFingerprint`
- **Feedback**: `AgentFeedback`, `FeedbackDimensions`, `AgentReputation`, `RewardEvent`
- **Attestations**: `OutcomeAttestation`, `OutcomeAttestationMetrics`
- **Orchestration**: `DelegationRequest`, `DelegationResult`, `OrchestrationPlan`, `OrchestrationStep`
- **Federation**: `Peer`, `FederationResponse`, `SyncResponse`, `WebhookSubscription`
- **Pricing**: `PricingInfo`, `SLAInfo`
- **Batch**: `BatchPublishResult`, `BatchPublishResponse`
- **A2A Interop**: `A2AAgentCard`, `A2ASkill`, `A2ACapabilities`, `A2AProvider`
- **MCP Interop**: `McpServerManifest`
- **Query**: `StructuredQuery`, `QueryFilter`, `QuerySort`

## Modules

```python
from bluefly_duadp.client import DuadpClient, DuadpError, resolve_gaid
from bluefly_duadp.server import create_uadp_router
from bluefly_duadp.crypto import sign_resource, verify_signature, generate_key_pair
from bluefly_duadp.did import resolve_did, build_did_web, verify_resource_identity
from bluefly_duadp.validate import validate_manifest, validate_response
from bluefly_duadp.conformance import run_conformance_tests
from bluefly_duadp.types import (
    OssaResource, UadpManifest, ContextNegotiation, TokenAnalytics,
    AgentFeedback, RewardEvent, DelegationRequest, OrchestrationPlan,
    CapabilityFingerprint, OutcomeAttestation, AgentReputation,
    NodeHealth, AgentIndexRecord, ProtocolEndpoints, PricingInfo, SLAInfo,
)
```

## Also Available

| Language | Package | Registry |
|----------|---------|----------|
| TypeScript | [`@bluefly/duadp`](https://www.npmjs.com/package/@bluefly/duadp) | npm |
| Go | `github.com/blueflyio/uapd/sdk/go` | Go modules |

## License

Apache-2.0 — See [LICENSE](https://gitlab.com/blueflyio/ossa/lab/duadp/-/blob/main/LICENSE)
