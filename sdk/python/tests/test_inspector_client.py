from urllib.parse import quote

import httpx
import pytest

from duadp.client import DuadpClient
from duadp.types import DuadpManifest


@pytest.mark.asyncio
async def test_resolve_resource_uses_manifest_endpoint() -> None:
    gaid = "agent://discover.duadp.org/agents/test-agent"
    expected_url = f"https://discover.duadp.org/api/v1/resolve/{quote(gaid, safe='')}"

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/.well-known/duadp.json":
            return httpx.Response(
                200,
                json={
                    "protocol_version": "v0.1.4",
                    "node_name": "DUADP Discovery Node",
                    "endpoints": {
                        "skills": "/api/v1/skills",
                        "resolve": "/api/v1/resolve",
                    },
                },
            )

        if str(request.url) == expected_url:
            return httpx.Response(
                200,
                json={
                    "resource": {
                        "apiVersion": "ossa/v0.5",
                        "kind": "Agent",
                        "metadata": {"name": "test-agent"},
                    },
                    "source_node": "DUADP Discovery Node",
                    "resolved": True,
                },
            )

        raise AssertionError(f"Unexpected request URL: {request.url}")

    client = DuadpClient("https://discover.duadp.org")
    await client._client.aclose()
    client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    try:
        result = await client.resolve_resource(gaid)
        assert result.source_node == "DUADP Discovery Node"
        assert result.resolved is True
    finally:
        await client._client.aclose()


@pytest.mark.asyncio
async def test_inspect_gaid_falls_back_without_manifest_endpoint() -> None:
    gaid = "agent://discover.duadp.org/agents/test-agent"

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/inspect":
            assert request.url.params["gaid"] == gaid
            return httpx.Response(
                200,
                json={
                    "gaid": gaid,
                    "resolved": True,
                    "resolved_via": "local",
                    "source_node": "DUADP Discovery Node",
                    "resource_kind": "Agent",
                    "resource_name": "test-agent",
                    "resource": {
                        "apiVersion": "ossa/v0.5",
                        "kind": "Agent",
                        "metadata": {"name": "test-agent"},
                    },
                    "did": {
                        "value": "did:web:discover.duadp.org",
                        "method": "web",
                        "resolved": True,
                        "self_verifying": False,
                        "verification_method_count": 1,
                    },
                    "trust_verification": {
                        "verified_tier": "community",
                        "claimed_tier": "community",
                        "checks": [],
                        "passed": True,
                        "downgraded": False,
                    },
                    "signature_verification": {
                        "verified": False,
                        "trustLevel": "none",
                        "checks": [],
                        "requiresSignature": False,
                    },
                    "revocation": {
                        "revoked": False,
                        "record": None,
                    },
                    "provenance": {
                        "links": [],
                    },
                    "policy": {
                        "anonymous_publish": {
                            "principal_id": "anonymous",
                            "context": {},
                            "global_policy": {
                                "decision": "Deny",
                                "diagnostics": {"reason": ["policy8"], "errors": []},
                                "evaluation_ms": 1,
                            },
                            "manifest_policy": None,
                            "effective_decision": "Deny",
                        },
                        "claimed_publisher_publish": {
                            "principal_id": "did:web:discover.duadp.org",
                            "context": {},
                            "global_policy": {
                                "decision": "Allow",
                                "diagnostics": {"reason": ["policy1"], "errors": []},
                                "evaluation_ms": 1,
                            },
                            "manifest_policy": None,
                            "effective_decision": "Allow",
                        },
                    },
                    "resolution_trace": [
                        {
                            "step": "local_lookup",
                            "status": "passed",
                            "detail": "Resolved from the local resources table",
                        }
                    ],
                },
            )

        raise AssertionError(f"Unexpected request URL: {request.url}")

    client = DuadpClient("https://discover.duadp.org")
    client._manifest = DuadpManifest.model_validate(
        {
            "protocol_version": "v0.1.4",
            "node_name": "DUADP Discovery Node",
            "endpoints": {
                "skills": "/api/v1/skills",
            },
        }
    )
    await client._client.aclose()
    client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

    try:
        result = await client.inspect_gaid(gaid)
        assert result.policy.anonymous_publish.effective_decision == "Deny"
        assert result.resolution_trace is not None
        assert result.resolution_trace[0].step == "local_lookup"
    finally:
        await client._client.aclose()
