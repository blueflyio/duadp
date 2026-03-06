# ossa-uadp — Python SDK

**UADP client and server SDK for Python.**

[![PyPI](https://img.shields.io/pypi/v/ossa-uadp)](https://pypi.org/project/ossa-uadp/)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../LICENSE)

## Install

```bash
pip install ossa-uadp
# or
uv add ossa-uadp
```

## Quick Start — Client

```python
from ossa_uadp import UadpClient, resolve_gaid

async with UadpClient("https://skills.sh") as client:
    # Discovery
    manifest = await client.get_manifest()
    skills = await client.list_skills(search="code review")
    tools = await client.list_tools(protocol="mcp")

    # Publish (requires auth token)
    await client.publish_skill(my_skill, token="Bearer ...")

# Resolve a GAID URI
client, kind, name = resolve_gaid("agent://skills.sh/skills/web-search")
```

## Quick Start — Server

Build a UADP node with FastAPI:

```python
from ossa_uadp.server import create_uadp_router

router = create_uadp_router(
    node_name="My AI Hub",
    node_id="did:web:my-hub.com",
    base_url="https://my-hub.com",
    list_skills=my_list_skills_fn,
    list_tools=my_list_tools_fn,
)

app.include_router(router)
```

## Features

- **Client** — Async `UadpClient` with automatic manifest discovery
- **Server** — FastAPI router for building UADP nodes
- **DID resolution** — `did:web:` and `did:key:` support
- **Cryptographic signatures** — Ed25519 signing/verification
- **Conformance testing** — Test any UADP node endpoint
- **GAID resolution** — Cross-node resource lookups
- **OSSA validation** — Validates against OSSA `.ajson` format

## Modules

```python
from ossa_uadp.client import UadpClient
from ossa_uadp.server import create_uadp_router
from ossa_uadp.crypto import sign_resource, verify_signature, generate_key_pair
from ossa_uadp.did import resolve_did, build_did_web, verify_resource_identity
from ossa_uadp.validate import validate_manifest, validate_response
from ossa_uadp.conformance import run_conformance_tests
from ossa_uadp.types import OssaResource, UadpManifest
```

## License

Apache License 2.0
