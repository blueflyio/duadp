# AGENTS.md

## Cursor Cloud specific instructions

This is a **Drupal custom module** (DUADP) that must be installed into a Drupal 11 site to function. The module itself has no `composer.json` -- the host Drupal site provides all dependencies.

### Drupal Host Site

The development Drupal site is at `/home/ubuntu/drupal-site` (Drupal 11.3, MariaDB, standard profile). The module is symlinked from `/workspace` into `/home/ubuntu/drupal-site/web/modules/custom/duadp`.

- **Admin login**: `admin` / `admin`
- **Database**: MariaDB, database `drupal`, user `drupal`, password `drupal`

### Starting the Dev Server

```bash
sudo service mariadb start
cd /home/ubuntu/drupal-site && ./vendor/bin/drush runserver 0.0.0.0:8080
```

`drush runserver` is required (not plain `php -S`) because the PHP built-in server blocks `.well-known/*` dotfile paths before they reach Drupal's router.

### DUADP Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/.well-known/duadp.json` | GET | Node discovery manifest |
| `/api/v1/skills` | GET | Skills registry (empty until search_api is configured) |
| `/api/v1/agents` | GET | Agent registry (requires `agent_marketplace_entry` entity type) |
| `/api/v1/federation` | GET | List known federation peers |
| `/api/v1/federation` | POST | Register a new peer (body: `{"url":"..."}`) |

### Linting

```bash
cd /home/ubuntu/drupal-site && ./vendor/bin/phpcs --standard=Drupal,DrupalPractice --extensions=php,module,inc,install,test,info,yml /workspace/src/ /workspace/duadp.routing.yml /workspace/duadp.services.yml /workspace/duadp.info.yml
```

### Known Issues

- The `/api/v1/agents` endpoint returns a 500 error because `agent_marketplace_entry` entity type is provided by `ai_agents_marketplace`, a module not yet published on drupal.org. This is expected for the current development state.
- The module has no automated tests (`tests/` directory does not exist).
- `DuadpRegistryController` originally used `protected readonly EntityTypeManagerInterface $entityTypeManager` via constructor promotion, which conflicts with Drupal core's `ControllerBase::$entityTypeManager` (non-readonly). A minimal fix was applied to use standard property assignment instead.
- The `duadp.info.yml` references a `configure: duadp.settings` route that was not defined in the original routing file. A placeholder route was added to allow module installation.
- The POST federation route (`duadp.federation.register`) is shadowed by the GET route (`duadp.federation.peers`) because the GET route lacks an explicit `methods: [GET]` restriction.

### Broader Platform Context

This DUADP Drupal module is one component of the **BlueFly.io Agent Platform**. The full platform includes multiple MCP servers and services that are relevant when working on DUADP features:

| Server | Purpose |
|---|---|
| `bluefly-mcp` | Primary platform MCP at `https://mcp.blueflyagents.com/api/mcp/sse` -- agents, mesh, brain, router, compliance, workflow, tracer |
| `bluefly-gkg` | Global Knowledge Graph at `https://gkg.blueflyagents.com/mcp` -- semantic search across platform knowledge |
| `skills` | 95 platform skills (9 shared + 86 agent-specific) from `platform-agents` |
| `duadp-registry` | DUADP discovery -- resolve `agent://` GAIDs, publish agents to the decentralized network |
| `ossa` | OSSA spec tools -- validate, generate, query agent manifests |
| `glab` | GitLab CLI -- issues, MRs, pipelines, wiki |
| `wikis` | 63 GitLab wiki repos -- semantic search across technical docs |
| `filesystem` | File system access across workspace and NAS |

The DUADP module specifically implements the **discovery and federation** layer. Its two MCP tools are:
- `duadp_resolve_gaid` -- resolve an `agent://` or `duadp://` URI into a concrete endpoint + identity
- `duadp_publish_agent` -- publish an OSSA-compliant manifest to the DUADP network

These MCP servers are configured locally via `~/.cursor/mcp.json` on developer machines (not in the cloud VM). The `duadp-registry` MCP server is built from a separate `dist/mcp-server/index.js` entrypoint that does not exist in this Drupal module repo.

---

## Branch Policy

- Local default branch is `release/v*.x`, never `main`.
- Feature and bugfix branches are created from the active `release/v*.x` branch.
- `main` is protected and must stay read-only for local development.
- Only `release/v*.x` may be merged into `main`.

### If A Local `main` Branch Exists
- Stop and do not make any new commits on `main`.
- Inspect divergence between `main` and the active `release/v*.x` branch before changing anything.
- Preserve both sides first by creating local backup branches.
- Move unique work from `main` back onto `release/v*.x` with a merge or cherry-picks (no reset --hard, rebase, or force push).
- After verifying `release/v*.x` contains the needed work, delete the local `main` branch.
