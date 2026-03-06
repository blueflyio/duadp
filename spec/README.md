# Universal AI Discovery Protocol (UADP)

**Version:** 0.2.0
**Status:** Draft
**Spec URI:** `https://openstandardagents.org/spec/uadp/v0.2`

## 1. Overview

The Universal AI Discovery Protocol (UADP) is a decentralized, hybrid-federated protocol for the discovery, validation, publishing, and exchange of AI Agents, Skills, Tools, and Marketplaces. Built on top of the [Open Standard for Agent Systems (OSSA)](https://openstandardagents.org), UADP allows any organization, department, or individual to host a "UADP Node" that acts as an API-first microservice registry for any AI capability.

Drawing inspiration from ActivityPub, WebFinger, and DNS, UADP ensures that AI resources built on one platform can seamlessly discover and securely utilize capabilities hosted on an entirely different platform. Whether it's an agent marketplace, a skills registry, an MCP tool directory, or an enterprise AI hub — if it speaks UADP, it's discoverable.

**UADP is THE API.** Any system that implements the endpoints below is a UADP node — and its consumers don't need to know what platform powers it. A Drupal marketplace, a Flask skills registry, a static JSON site, and a Kubernetes operator all expose the same UADP endpoints. Consumers talk UADP, not vendor APIs.

**Any system that implements the endpoints below is a UADP node.** There is no required language, framework, or database.

## 2. Conformance

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT", and "MAY" in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

A conforming UADP node:
- MUST serve `GET /.well-known/uadp.json` (Section 3)
- MUST serve at least one of: `GET /uadp/v1/skills`, `GET /uadp/v1/agents`, or `GET /uadp/v1/tools` (Section 4)
- SHOULD serve `GET /uadp/v1/federation` (Section 6)
- SHOULD respond to WebFinger queries for hosted resources (Section 7)
- MUST return `Content-Type: application/json` for all UADP endpoints
- MUST return OSSA-formatted payloads (`apiVersion: ossa/v0.4` or later)

## 3. Discovery Layer

### 3.1 Well-Known Endpoint

Every UADP node MUST publish a JSON document at:

```
GET /.well-known/uadp.json
```

**Response** (`UadpManifest`):

```json
{
  "protocol_version": "0.2.0",
  "node_id": "did:web:acme.com",
  "node_name": "Acme Corp AI Hub",
  "node_description": "Enterprise AI skills, tools, and agents",
  "contact": "admin@acme.com",
  "endpoints": {
    "skills": "/uadp/v1/skills",
    "agents": "/uadp/v1/agents",
    "tools": "/uadp/v1/tools",
    "federation": "/uadp/v1/federation",
    "validate": "/uadp/v1/validate",
    "publish": "/uadp/v1/publish"
  },
  "capabilities": ["skills", "agents", "tools", "federation", "validation", "publishing"],
  "identity": {
    "did": "did:web:acme.com",
    "public_key": "-----BEGIN PUBLIC KEY-----\n..."
  },
  "ossa_versions": ["v0.4", "v0.5"],
  "federation": {
    "gossip": true,
    "max_hops": 3
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `protocol_version` | string | MUST | Semver. Current: `"0.2.0"` |
| `node_id` | string | SHOULD | DID or URI uniquely identifying this node |
| `node_name` | string | MUST | Human-readable node name |
| `node_description` | string | SHOULD | Short description of the node |
| `contact` | string | SHOULD | Admin contact (email or URL) |
| `endpoints` | object | MUST | Map of capability name to relative or absolute URL |
| `endpoints.skills` | string | MUST* | Skills listing endpoint |
| `endpoints.agents` | string | MUST* | Agents listing endpoint |
| `endpoints.tools` | string | MUST* | Tools listing endpoint |
| `endpoints.federation` | string | SHOULD | Federation/peering endpoint |
| `endpoints.validate` | string | MAY | Manifest validation endpoint |
| `endpoints.publish` | string | MAY | Resource publishing endpoint |
| `capabilities` | string[] | SHOULD | List of supported capabilities |
| `identity` | object | SHOULD | Node identity for signature verification |
| `identity.did` | string | SHOULD | Decentralized Identifier (`did:web:` recommended) |
| `identity.public_key` | string | MAY | PEM-encoded public key |
| `ossa_versions` | string[] | SHOULD | Supported OSSA spec versions |
| `federation.gossip` | boolean | MAY | Whether this node supports gossip protocol |
| `federation.max_hops` | integer | MAY | Max peer propagation depth (default: 2) |

*At least one of `endpoints.skills`, `endpoints.agents`, or `endpoints.tools` MUST be present.

Endpoint values MAY be relative paths (resolved against the node's base URL) or absolute URLs.

### 3.2 DNS TXT Discovery

UADP nodes MAY advertise themselves via DNS TXT records for zero-configuration discovery:

```
_uadp.example.com. IN TXT "v=uadp1 url=https://example.com/.well-known/uadp.json"
```

| Field | Required | Description |
|-------|----------|-------------|
| `v` | MUST | Version tag. Current: `uadp1` |
| `url` | MUST | Absolute URL to the UADP manifest |
| `name` | MAY | Human-readable node name |
| `cap` | MAY | Comma-separated capabilities (e.g., `skills,agents,tools`) |

Clients resolving a domain SHOULD check for a `_uadp` TXT record before attempting the well-known URL. This enables discovery of UADP nodes hosted on subdomains or non-standard paths.

Multiple TXT records on the same domain indicate multiple UADP nodes (e.g., one for skills, one for agents).

### 3.3 WebFinger Resolution

UADP nodes SHOULD respond to WebFinger queries for individual resources hosted on the node:

```
GET /.well-known/webfinger?resource=agent://acme.com/skills/code-review
```

**Response:**

```json
{
  "subject": "agent://acme.com/skills/code-review",
  "links": [
    {
      "rel": "self",
      "type": "application/json",
      "href": "https://acme.com/uadp/v1/skills/code-review"
    },
    {
      "rel": "describedby",
      "type": "application/json",
      "href": "https://acme.com/.well-known/uadp.json"
    }
  ],
  "properties": {
    "https://uadp.openstandardagents.org/ns/kind": "Skill",
    "https://uadp.openstandardagents.org/ns/trust_tier": "verified-signature"
  }
}
```

This enables cross-registry resolution: given `agent://skills.sh/skills/web-search`, a client can query `skills.sh/.well-known/webfinger?resource=agent://skills.sh/skills/web-search` to get the direct API URL.

### 3.4 Discovery Flow

```
Client                          UADP Node
  |                                 |
  |  DNS TXT _uadp.example.com     |
  |  (optional, zero-config)        |
  |                                 |
  |  GET /.well-known/uadp.json     |
  |-------------------------------->|
  |  200 OK { endpoints: {...} }    |
  |<--------------------------------|
  |                                 |
  |  GET /uadp/v1/skills?search=... |
  |-------------------------------->|
  |  200 OK { data: [...], meta }   |
  |<--------------------------------|
  |                                 |
  |  WebFinger for specific GAID:   |
  |  GET /.well-known/webfinger     |
  |    ?resource=agent://...        |
  |-------------------------------->|
  |  200 OK { subject, links }      |
  |<--------------------------------|
```

## 4. Resource Endpoints (Read)

### 4.1 Skills Endpoint

```
GET /uadp/v1/skills
```

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `search` | string | `""` | Full-text search across name + description |
| `category` | string | — | Filter by category |
| `capability` | string | — | Filter by capability tag |
| `trust_tier` | string | — | Filter: `official`, `verified-signature`, `signed`, `community`, `experimental` |
| `tag` | string | — | Filter by tag (comma-separated for multiple) |
| `page` | integer | `1` | Page number (1-indexed) |
| `limit` | integer | `20` | Items per page (max 100) |

**Response** (`UadpSkillsResponse`):

```json
{
  "data": [
    {
      "apiVersion": "ossa/v0.4",
      "kind": "Skill",
      "metadata": {
        "name": "code-review",
        "version": "1.2.0",
        "description": "Reviews code for quality, security, and best practices",
        "uri": "agent://acme.com/skills/code-review",
        "category": "development",
        "trust_tier": "verified-signature",
        "tags": ["analysis", "security", "code-quality"],
        "created": "2026-01-15T10:30:00Z",
        "updated": "2026-02-20T14:00:00Z"
      },
      "spec": {
        "capabilities": ["analysis", "security"],
        "inputs": { "code": { "type": "string", "required": true } },
        "outputs": { "review": { "type": "string" } }
      },
      "signature": {
        "algorithm": "Ed25519",
        "value": "base64-encoded-signature",
        "signer": "did:web:acme.com"
      }
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "node_name": "Acme Corp AI Hub",
    "node_id": "did:web:acme.com"
  }
}
```

#### 4.1.1 Single Skill by Name

```
GET /uadp/v1/skills/{name}
```

Returns a single skill by name. Response is the skill object directly (not wrapped in `data[]`).

### 4.2 Agents Endpoint

```
GET /uadp/v1/agents
GET /uadp/v1/agents/{name}
```

Same query parameters and response shape as Skills, with `kind: "Agent"`.

### 4.3 Tools Endpoint

```
GET /uadp/v1/tools
GET /uadp/v1/tools/{name}
```

Returns OSSA-formatted tool manifests. Tools include MCP servers, A2A tools, function-calling tools, and any other invocable capability.

```json
{
  "data": [
    {
      "apiVersion": "ossa/v0.5",
      "kind": "Tool",
      "metadata": {
        "name": "web-search",
        "version": "2.0.0",
        "description": "Search the web using multiple engines",
        "uri": "agent://skills.sh/tools/web-search",
        "category": "search",
        "trust_tier": "verified-signature",
        "tags": ["search", "web", "research"]
      },
      "spec": {
        "protocol": "mcp",
        "transport": "sse",
        "endpoint": "https://mcp.skills.sh/web-search",
        "inputs": {
          "query": { "type": "string", "required": true },
          "max_results": { "type": "integer", "default": 10 }
        },
        "outputs": {
          "results": { "type": "array" }
        },
        "authentication": {
          "type": "bearer",
          "required": true
        }
      }
    }
  ],
  "meta": {
    "total": 87,
    "page": 1,
    "limit": 20,
    "node_name": "Skills.sh"
  }
}
```

### 4.4 Validation Endpoint

```
POST /uadp/v1/validate
Content-Type: application/json

{
  "manifest": "apiVersion: ossa/v0.4\nkind: Skill\nmetadata:\n  name: my-skill\n..."
}
```

**Response:**

```json
{
  "valid": true,
  "errors": [],
  "warnings": ["metadata.version is recommended"]
}
```

### 4.5 Common Response Envelope

All list endpoints MUST return:

```json
{
  "data": [ ... ],
  "meta": {
    "total": <integer>,
    "page": <integer>,
    "limit": <integer>,
    "node_name": <string>,
    "node_id": <string>
  }
}
```

Single-resource endpoints (GET by name) return the resource directly.

Error responses MUST use standard HTTP status codes with:

```json
{
  "error": "<human-readable message>",
  "code": "<machine-readable error code>"
}
```

## 5. Publishing Endpoints (Write)

Nodes that support publishing MUST expose `POST` endpoints for resource creation. Publishing enables any UADP node to be a registry that accepts contributions from authenticated users.

### 5.1 Publish a Resource

```
POST /uadp/v1/publish
Content-Type: application/json
Authorization: Bearer <token>

{
  "apiVersion": "ossa/v0.5",
  "kind": "Skill",
  "metadata": {
    "name": "my-custom-skill",
    "version": "1.0.0",
    "description": "A custom skill for document analysis",
    "category": "analysis",
    "tags": ["documents", "nlp"]
  },
  "spec": {
    "inputs": { "document": { "type": "string", "required": true } },
    "outputs": { "summary": { "type": "string" } }
  }
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "resource": {
    "apiVersion": "ossa/v0.5",
    "kind": "Skill",
    "metadata": {
      "name": "my-custom-skill",
      "version": "1.0.0",
      "uri": "agent://acme.com/skills/my-custom-skill",
      "trust_tier": "community",
      "created": "2026-03-06T10:00:00Z"
    }
  }
}
```

The publish endpoint:
- MUST require authentication (bearer token, API key, or other)
- MUST validate the payload against the OSSA schema
- MUST assign a GAID (`uri` field) based on the node's namespace
- SHOULD assign `trust_tier: "community"` for unsigned submissions
- SHOULD assign `trust_tier: "signed"` if the payload includes a valid signature
- MAY auto-assign `trust_tier: "verified-signature"` for known/verified publishers

### 5.2 Update a Resource

```
PUT /uadp/v1/skills/{name}
Authorization: Bearer <token>
```

Same payload as publish. The node MUST verify the authenticated user is the original publisher or has admin permissions.

### 5.3 Delete a Resource

```
DELETE /uadp/v1/skills/{name}
Authorization: Bearer <token>
```

Returns `204 No Content` on success.

### 5.4 Type-Specific Publishing (Alternative)

Nodes MAY also accept direct POST to type-specific endpoints:

```
POST /uadp/v1/skills      (publish a skill)
POST /uadp/v1/agents      (publish an agent)
POST /uadp/v1/tools       (publish a tool)
```

These are equivalent to using `/uadp/v1/publish` with the corresponding `kind`.

## 6. Federation

### 6.1 Federation Endpoint

```
GET /uadp/v1/federation
```

Returns this node's peer list and federation metadata:

```json
{
  "protocol_version": "0.2.0",
  "node_id": "did:web:acme.com",
  "node_name": "Acme Corp AI Hub",
  "gossip": true,
  "max_hops": 3,
  "peers": [
    {
      "url": "https://skills.sh",
      "node_id": "did:web:skills.sh",
      "name": "Skills.sh",
      "status": "healthy",
      "last_synced": "2026-03-05T12:00:00Z",
      "capabilities": ["skills", "tools"],
      "skill_count": 150,
      "tool_count": 45
    }
  ]
}
```

### 6.2 Peer Registration

```
POST /uadp/v1/federation
Content-Type: application/json

{
  "url": "https://my-node.example.com",
  "name": "My UADP Node",
  "node_id": "did:web:my-node.example.com"
}
```

The receiving node SHOULD:
1. Fetch `{url}/.well-known/uadp.json` to validate the peer
2. If valid, add to its peer list
3. Return `201 Created` with the peer record

The receiving node MAY require authentication for peer registration.

### 6.3 Gossip Protocol

Nodes that set `gossip: true` in their manifest participate in peer propagation:

1. When Node A peers with Node B, Node B responds with its peer list
2. Node A MAY automatically peer with Node B's peers (up to `max_hops` depth)
3. Each gossip hop decrements the remaining hop count
4. Nodes MUST NOT propagate beyond `max_hops` to prevent flooding
5. Nodes SHOULD deduplicate peers by `node_id` or `url`

**Gossip flow:**

```
Node A                    Node B                    Node C
  |                         |                         |
  | POST /federation        |                         |
  | { url: "node-a.com" }   |                         |
  |------------------------>|                         |
  |                         |                         |
  | 201 { peer, peers: [    |                         |
  |   { url: "node-c.com" } |                         |
  | ]}                      |                         |
  |<------------------------|                         |
  |                         |                         |
  | (gossip: auto-peer)     |                         |
  | POST /federation        |                         |
  | { url: "node-a.com",    |                         |
  |   hop: 1 }              |                         |
  |-------------------------------------------------->|
  |                         |                         |
  | 201 { peer }            |                         |
  |<--------------------------------------------------|
```

The `hop` field in peer registration indicates gossip depth. Nodes SHOULD reject registrations where `hop >= max_hops`.

### 6.4 Circuit Breaker

Implementations SHOULD implement a circuit breaker for peer health:
- Track consecutive fetch failures per peer
- After N failures (recommended: 3), mark peer as `degraded`
- Stop active fetching from degraded peers
- Retry after a backoff period (recommended: 24 hours)
- On successful fetch, reset failure count and mark `healthy`

Peer status values: `healthy`, `degraded`, `unreachable`

### 6.5 Federated Search

Nodes that support federation SHOULD support federated search — forwarding queries to peers and merging results:

```
GET /uadp/v1/skills?search=code+review&federated=true
```

When `federated=true`:
1. The node queries its own store
2. Concurrently queries all `healthy` peers
3. Merges and deduplicates results (by GAID or name+node_id)
4. Returns unified response with `meta.sources` indicating which nodes contributed

```json
{
  "data": [ ... ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "node_name": "Acme Corp AI Hub",
    "federated": true,
    "sources": [
      { "node_id": "did:web:acme.com", "count": 12 },
      { "node_id": "did:web:skills.sh", "count": 30 }
    ]
  }
}
```

## 7. Identity and Trust

### 7.1 Decentralized Identifiers (DIDs)

Nodes SHOULD identify themselves using W3C Decentralized Identifiers (DIDs). The recommended DID method is `did:web`, which uses existing DNS infrastructure:

```
did:web:acme.com           → resolves to https://acme.com/.well-known/did.json
did:web:skills.sh           → resolves to https://skills.sh/.well-known/did.json
```

Nodes MAY also use:
- `did:key` — self-sovereign, no DNS dependency
- `did:pkh` — based on blockchain public key hashes

The DID document SHOULD include the node's UADP manifest URL as a service endpoint:

```json
{
  "id": "did:web:acme.com",
  "service": [{
    "id": "did:web:acme.com#uadp",
    "type": "UadpNode",
    "serviceEndpoint": "https://acme.com/.well-known/uadp.json"
  }]
}
```

### 7.2 Trust Tiers

UADP defines five trust tiers for resources:

| Tier | Badge | Description |
|------|-------|-------------|
| `official` | Shield (gold) | Published by the OSSA project or node operator |
| `verified-signature` | Shield (blue) | Cryptographically signed + verified identity |
| `signed` | Shield (green) | Cryptographically signed (identity not verified) |
| `community` | Shield (gray) | Published by authenticated user, no signature |
| `experimental` | Shield (orange) | Unreviewed, use at own risk |

Nodes SHOULD include `trust_tier` in resource metadata. Consuming nodes SHOULD display trust badges to users.

### 7.3 Resource Signatures

Resources MAY include a `signature` object for cryptographic verification:

```json
{
  "signature": {
    "algorithm": "Ed25519",
    "value": "base64url-encoded-signature",
    "signer": "did:web:acme.com",
    "timestamp": "2026-03-06T10:00:00Z"
  }
}
```

The signature is computed over the canonical JSON serialization of the resource (excluding the `signature` field itself). Consuming nodes SHOULD verify signatures by resolving the signer's DID and extracting the public key.

## 8. Agent Identifiers (GAID)

Skills, agents, and tools MAY include a Global Agent Identifier (GAID) using the `agent://` URI scheme:

```
agent://<namespace>/<type>/<name>
```

Examples:
- `agent://acme.com/skills/code-review`
- `agent://marketplace.openstandardagents.org/agents/security-auditor`
- `agent://skills.sh/tools/web-search`

### 8.1 GAID Resolution

Given a GAID, a client resolves it through this chain:

1. Extract the namespace (domain): `acme.com`
2. Check DNS TXT record: `_uadp.acme.com`
3. If no TXT, try well-known: `https://acme.com/.well-known/uadp.json`
4. From the manifest, find the appropriate endpoint (skills/agents/tools)
5. Query `GET /uadp/v1/{type}/{name}` for the specific resource

Alternatively, use WebFinger:
```
GET https://acme.com/.well-known/webfinger?resource=agent://acme.com/skills/code-review
```

## 9. OSSA Integration

UADP is the transport and discovery layer; OSSA is the payload format.

- All items in `data[]` arrays MUST include `apiVersion` (e.g., `ossa/v0.4`) and `kind` (`Skill`, `Agent`, or `Tool`)
- All items MUST include a `metadata` object with at least `name`
- Items SHOULD include a `spec` object with the OSSA specification body
- Consumers SHOULD validate incoming payloads against the OSSA schema before importing
- The `kind` field is extensible — nodes MAY define custom kinds (e.g., `Marketplace`, `Workflow`, `Dataset`)

Because OSSA enforces explicit `safety` guardrails declaratively, a downstream node can statically validate an upstream tool's safety requirements *before* importing it.

## 10. Security Considerations

- Nodes SHOULD serve all endpoints over HTTPS
- Write endpoints (POST publish, POST federation) MUST require authentication
- Read endpoints (GET skills, agents, tools, federation) SHOULD be publicly accessible
- Nodes MUST NOT execute code from discovered resources without explicit user consent
- Signature verification using DID-resolved public keys is RECOMMENDED for high-trust deployments
- Rate limiting on all endpoints is RECOMMENDED
- Gossip protocol MUST respect `max_hops` to prevent amplification attacks
- Federated search MUST implement timeouts per peer (recommended: 5 seconds)

## 11. Implementing a Minimal UADP Node

The simplest possible UADP node is two static JSON files:

```
your-domain.com/
  .well-known/uadp.json     <- discovery manifest
  uadp/v1/skills             <- skills list (can be static JSON)
```

A more complete implementation adds:
- Database-backed skill/agent/tool storage
- Publishing API for community contributions
- Federation with gossip and peer discovery
- Authentication for write operations
- Manifest validation service
- WebFinger resolution
- DNS TXT record

Reference implementations:
- **Drupal**: `ai_agents_marketplace` module (PHP)
- **TypeScript SDK**: `@ossa/uadp` with Express server helper
- **Python SDK**: `ossa-uadp` with FastAPI server helper
- **Go SDK**: `uadp-go` with `net/http` handler
- **Static**: GitHub Pages with JSON files — planned

## Appendix A: JSON Schemas

See `schemas/` directory:
- `uadp-manifest.schema.json` — `/.well-known/uadp.json` validation
- `uadp-skills-response.schema.json` — `/uadp/v1/skills` response
- `uadp-agents-response.schema.json` — `/uadp/v1/agents` response
- `uadp-tools-response.schema.json` — `/uadp/v1/tools` response
- `uadp-federation-response.schema.json` — `/uadp/v1/federation` response
- `uadp-publish-request.schema.json` — `/uadp/v1/publish` request
- `uadp-webfinger-response.schema.json` — WebFinger response

## Appendix B: OpenAPI Specification

See `openapi.yaml` for the complete OpenAPI 3.1 definition of all UADP endpoints.

## Appendix C: Changelog

### 0.2.0 (2026-03-06)
- Tools endpoint (`/uadp/v1/tools`) — MCP tools, A2A tools as first-class resources
- Publishing API (`POST /uadp/v1/publish`) — write operations for resource creation
- WebFinger resolution for individual resource lookup by GAID
- DNS TXT record discovery (`_uadp.<domain>`) for zero-configuration
- Gossip protocol for automatic peer propagation
- DID-based identity (`did:web:`, `did:key:`) for verifiable node identity
- Resource signatures with Ed25519
- Federated search (`?federated=true`) with source attribution
- Single resource lookup by name (`GET /uadp/v1/skills/{name}`)
- `node_id` field using DIDs
- `tags` field on metadata for flexible categorization
- `Tool` kind for MCP/A2A/function-calling tools
- Extensible `kind` — nodes may define custom resource types

### 0.1.0 (2026-03-06)
- Initial draft specification
- Discovery layer (`/.well-known/uadp.json`)
- Skills and Agents endpoints with OSSA payloads
- Federation with peer registration and circuit breaker
- Trust tiers and GAID identifiers
- Validation endpoint
