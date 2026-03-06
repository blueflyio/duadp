# uadp-go — Go SDK

**The official Go SDK for [DUADP](https://openstandardagents.org/uadp/) (Decentralized Universal AI Discovery Protocol).**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../LICENSE)

> **[openstandardagents.org/uadp](https://openstandardagents.org/uadp/)** | **[duadp.org](https://duadp.org)** (coming soon) | **[Full Spec](https://gitlab.com/blueflyio/ossa/lab/duadp/-/blob/main/spec/README.md)**

## Install

```bash
go get github.com/blueflyio/duadp/sdk/go
```

## Quick Start — Client

```go
package main

import (
    "context"
    "fmt"
    uadp "github.com/blueflyio/duadp/sdk/go"
)

func main() {
    ctx := context.Background()
    client := uadp.NewClient("https://skills.sh", uadp.WithToken("my-api-key"))

    // Discovery
    manifest, _ := client.Discover(ctx)
    fmt.Printf("Node: %s (%d capabilities)\n", manifest.NodeName, len(manifest.Capabilities))

    // List resources
    skills, _ := client.ListSkills(ctx, &uadp.ListParams{Search: "code review"})
    tools, _ := client.ListTools(ctx, &uadp.ToolListParams{Protocol: "mcp"})
    agents, _ := client.ListAgents(ctx, nil)

    // Resolve a GAID URI from any node
    c, kind, name, _ := uadp.ResolveGaid("agent://skills.sh/tools/web-search")
    tool, _ := c.GetTool(ctx, name)

    // Unified search across all resource types
    results, _ := client.UnifiedSearch(ctx, &uadp.SearchParams{
        Query: "code review", IncludeFacets: true,
    })

    // Health check
    health, _ := client.GetHealth(ctx)
    fmt.Printf("Status: %s, Skills: %d\n", health.Status, *health.Skills)
}
```

## Features

### Core Discovery
- **Client** — `Client` with automatic manifest discovery and caching
- **Server** — `net/http` handler for building UADP nodes
- **GAID resolution** — `ResolveGaid()` supports both `agent://` and `uadp://` schemes
- **WebFinger** — Standard resource resolution at `/.well-known/webfinger`
- **Unified search** — `UnifiedSearch()` with faceted results across all types
- **Health** — `GetHealth()` for node status monitoring
- **Agent index** — `GetAgentIndex()` for `.ajson` index cards

### Identity & Security
- **DID resolution** — `did:web:` and `did:key:` support
- **Cryptographic signatures** — Ed25519 signing/verification
- **Resource signatures** — `SignResource()` / `VerifySignature()`

### NIST AI RMF Governance
- **Governance** — `GetGovernance()` for node compliance frameworks, risk tolerance, data classification
- **Risk assessment** — `GetResourceRisk()` for NIST MAP 5.1 risk impact (people, organizations, ecosystems)
- **Audit trail** — `GetAuditLog()` with event type, GAID, and time filters (NIST AU-2, AU-3)
- **Provenance** — `GetProvenance()` for SLSA-style build info, SBOM, attestations (NIST SP 800-218A)
- **Revocations** — `GetRevocations()` for revoked resources (NIST SI-7, CM-3)
- **Agent identity** — `GetAgentIdentity()` with DID, DNS records, service accounts, cryptographic keys

### Context & Analytics
- **Context negotiation** — `NegotiateContext()` for layered context delivery with priority tiers
- **Context summary** — `GetContextSummary()` for cached domain context
- **Token analytics** — `ReportTokenUsage()` / `GetTokenAnalytics()` with per-execution tracking
- **Capability fingerprints** — `GetCapabilityFingerprint()` for empirical performance data

### Feedback & Rewards
- **360 feedback** — `SubmitFeedback()` with multi-source dimensions (accuracy, efficiency, quality, helpfulness)
- **Agent reputation** — `GetAgentReputation()` with composite scoring and trend
- **Reward events** — `RecordReward()` for reputation boosts, capability unlocks, badges
- **Outcome attestations** — `SubmitAttestation()` / `GetAttestations()` for signed task outcome records

### Multi-Agent Orchestration
- **Delegation** — `Delegate()` with compressed context transfer, budget constraints, depth limits
- **Orchestration plans** — `CreateOrchestrationPlan()` / `GetOrchestrationPlan()` for DAG/parallel/sequential/adaptive
- **OSSA agent types** — orchestrator, worker, specialist, critic, monitor, gateway

### Federation
- **Peer discovery** — `GetFederation()` for peer node listing
- **Peer registration** — `RegisterAsPeer()` with gossip propagation
- **Incremental sync** — `FederationSync()` with sync tokens and cursors
- **Webhooks** — `SubscribeWebhook()` for real-time event notifications

## Client API

```go
// Core
client := uadp.NewClient(baseURL, opts...)
client.Discover(ctx)                    // Fetch manifest
client.GetManifest(ctx)                 // Get cached manifest
client.ResolveWebFinger(ctx, gaid)      // WebFinger lookup
client.GetHealth(ctx)                   // Node health
client.UnifiedSearch(ctx, params)       // Cross-type search
client.GetAgentIndex(ctx, gaid)         // .ajson index card

// Resources
client.ListSkills(ctx, params)          // List skills
client.GetSkill(ctx, name)              // Get skill
client.PublishSkill(ctx, skill)         // Publish skill
client.ListAgents(ctx, params)          // List agents
client.GetAgent(ctx, name)              // Get agent
client.PublishAgent(ctx, agent)         // Publish agent
client.ListTools(ctx, params)           // List tools
client.GetTool(ctx, name)              // Get tool
client.PublishTool(ctx, tool)           // Publish tool
client.Publish(ctx, resource)           // Generic publish
client.Validate(ctx, manifest)          // Validate manifest

// Governance (NIST AI RMF)
client.GetGovernance(ctx)               // Node governance
client.GetResourceRisk(ctx, gaid)       // Risk assessment
client.GetAuditLog(ctx, params)         // Audit trail
client.GetProvenance(ctx, gaid)         // Supply chain provenance
client.GetRevocations(ctx, params)      // Revoked resources
client.GetAgentIdentity(ctx, gaid)      // Agent identity

// Context & Analytics
client.NegotiateContext(ctx, gaid, task) // Context negotiation
client.GetContextSummary(ctx, domain, taskType) // Context summary
client.ReportTokenUsage(ctx, analytics)  // Report usage
client.GetTokenAnalytics(ctx, gaid, period) // Get analytics
client.GetCapabilityFingerprint(ctx, gaid) // Performance data

// Feedback & Rewards
client.SubmitFeedback(ctx, feedback)     // Submit feedback
client.GetAgentFeedback(ctx, gaid, params) // Get feedback
client.GetAgentReputation(ctx, gaid)     // Get reputation
client.RecordReward(ctx, reward)         // Record reward
client.SubmitAttestation(ctx, attestation) // Submit attestation
client.GetAttestations(ctx, gaid, params) // Get attestations

// Delegation & Orchestration
client.Delegate(ctx, request)            // Delegate task
client.CreateOrchestrationPlan(ctx, plan) // Create plan
client.GetOrchestrationPlan(ctx, planID) // Get plan

// Batch Operations (CI/CD)
client.BatchPublish(ctx, resources, atomic, dryRun) // Atomic batch

// Protocol Interop
client.GetA2ACard(ctx, agentName)        // A2A Agent Card
client.GetMcpManifest(ctx)               // MCP Server Manifest

// Structured Query
client.Query(ctx, query)                 // Compound filters + sort

// Federation
client.GetFederation(ctx)               // List peers
client.RegisterAsPeer(ctx, reg)         // Register as peer
client.FederationSync(ctx, params)      // Incremental sync
client.SubscribeWebhook(ctx, sub)       // Subscribe webhook
```

## Client Options

```go
client := uadp.NewClient("https://skills.sh",
    uadp.WithToken("my-bearer-token"),
    uadp.WithTimeout(30 * time.Second),
    uadp.WithHTTPClient(customClient),
    uadp.WithHeaders(map[string]string{
        "X-Custom-Header": "value",
    }),
)
```

## Types

The SDK exports 80+ types covering:

- **Core**: `UadpManifest`, `OssaResource`, `OssaSkill`, `OssaAgent`, `OssaTool`, `ResourceIdentity`
- **Discovery**: `WebFingerResponse`, `NodeHealth`, `SearchResponse`, `AgentIndexRecord`
- **NIST RMF**: `NodeGovernance`, `ResourceRisk`, `ResourceProvenance`, `Attestation`, `Revocation`, `AuditEvent`
- **Context**: `ContextNegotiation`, `ContextLayer`, `KnowledgeSource`, `ContextCacheRef`
- **Analytics**: `TokenAnalytics`, `TokenAnalyticsAggregate`, `CapabilityFingerprint`
- **Feedback**: `AgentFeedback`, `FeedbackDimensions`, `AgentReputation`, `RewardEvent`
- **Attestations**: `OutcomeAttestation`, `OutcomeAttestationMetrics`
- **Orchestration**: `DelegationRequest`, `DelegationResult`, `OrchestrationPlan`, `OrchestrationStep`
- **Federation**: `Peer`, `FederationResponse`, `SyncResponse`, `WebhookSubscription`
- **Batch**: `BatchPublishRequest`, `BatchPublishResponse`
- **A2A Interop**: `A2AAgentCard`, `A2ASkill`, `A2ACapability`, `A2AProvider`
- **MCP Interop**: `McpServerManifest`
- **Query**: `StructuredQuery`, `QueryFilter`, `QuerySort`

## Also Available

| Language | Package | Registry |
|----------|---------|----------|
| TypeScript | [`@bluefly/duadp`](https://www.npmjs.com/package/@bluefly/duadp) | npm |
| Python | `bluefly-duadp` | PyPI |

## License

Apache-2.0 — See [LICENSE](https://gitlab.com/blueflyio/ossa/lab/duadp/-/blob/main/LICENSE)
