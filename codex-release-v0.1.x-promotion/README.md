# DUADP (Decentralized Universal AI Discovery Protocol)

Implements the Decentralized Universal AI Discovery Protocol for federated discovery of AI agents, skills, and tools. Exposes a `.well-known/duadp.json` manifest for automatic node discovery and provides REST API endpoints for querying the local agent registry and managing peer federation.

## Features

- Well-known manifest endpoint (`/.well-known/duadp.json`) with protocol version, node identity, endpoint URLs, capabilities, supported OSSA versions, and optional public key for identity verification
- Agent registry endpoint listing published agents in OSSA manifest format (apiVersion, kind, metadata, spec with role/taxonomy/model/tools/autonomy)
- Skills registry endpoint for listing available skills
- Federation API for listing known peers and registering new ones via manifest validation
- Peer registration with automatic DUADP manifest discovery and health tracking
- CORS-enabled responses for cross-origin discovery
- Pagination support with page/limit parameters and total count metadata
- DUADP-specific routing metadata with `duadp://` URIs and trust tier classification (official/community)
- Agents sourced from `agent_marketplace_entry` entities with full OSSA field mapping

## Architecture

### Controllers

- `DuadpManifestController` -- Serves the `/.well-known/duadp.json` discovery manifest. Returns protocol version, node name/description, contact email, endpoint URLs, capabilities list, supported OSSA versions, and optional public key.
- `DuadpRegistryController` -- Serves `/api/v1/skills` and `/api/v1/agents`. The agents endpoint queries `agent_marketplace_entry` entities and maps them to full OSSA manifest format including metadata labels/annotations, spec taxonomy, LLM model config, tools, and autonomy settings.
- `DuadpFederationController` -- Serves `/api/v1/federation`. Lists known peers (GET) and accepts peer registration requests (POST) by validating the remote node's DUADP manifest.

### Services

- `DuadpFederationService` -- Handles peer discovery and gossip communication. Validates peer registration by fetching the remote `/.well-known/duadp.json` manifest, checking for a valid `protocol_version`, and recording peer health status and capabilities.

## Requirements

- Drupal 10.3 or 11
- drupal/node
- drupal/ai
- ai_agents
- ai_agents_ossa

## Installation

1. Ensure the AI Agents and AI Agents OSSA modules are installed and configured.
2. Enable the module: `drush en duadp`
3. Configure node identity at the settings page.

## Configuration

- Settings: configured via `duadp.settings` config object
- Node name, description, and public key are set in module configuration
- The manifest endpoint is publicly accessible at `/.well-known/duadp.json`
- Federation and registry endpoints are publicly accessible under `/api/v1/`
