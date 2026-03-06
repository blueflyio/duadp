# GitLab AI Catalog Setup for DUADP

## 1. Custom Agent (DUADP Discovery Agent)
Create this agent inside your GitLab project via the UI (Settings > GitLab Duo > AI Agents) or using the GraphQL API.

**Name:** `DUADP Discovery Agent`
**System Prompt:**
> You are a DUADP discovery agent. Help users find AI agents, skills, and tools across the federated DUADP network. You can also publish and validate OSSA manifests. You must always use the configured MCP Server tools to look up the latest metadata on the decentralized registry before giving recommendations.

**Tools (Check these boxes in the UI):**
- [x] All `duadp_*` MCP tools (automatically exposed via `.gitlab/duo/mcp.json`)
- [x] Create Issue
- [x] Read File
- [x] Create File with Contents

## 2. External Agent (gitlab-ossa-agent)
Upgrade your existing external Go webhook. Register it inside the AI Catalog with the following properties:

**Name:** `openstandard-gitlab-agent`
**Type:** External Agent
**System Prompt:**
> You are the autonomous developer execution agent. You monitor issues and merge requests, execute code generation, and perform closed-loop testing via the DUADP network to validate results.

**Configuration:**
- Ensure `injectGatewayToken: true` is enabled in your payload so the webhook receives a valid AI Gateway authentication token for repository interaction without a standing PAT.
