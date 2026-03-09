import pytest

from duadp.client import DuadpClient, DuadpError, resolve_gaid
from duadp.types import DuadpManifest


@pytest.mark.asyncio
async def test_resolve_endpoint_supports_validate_alias() -> None:
    client = DuadpClient("https://node.example")
    try:
        client._manifest = DuadpManifest.model_validate(
            {
                "protocol_version": "v1",
                "node_name": "test-node",
                "endpoints": {
                    "skills": "/api/v1/skills",
                    "validate": "/api/v1/validate",
                },
            }
        )

        skills_endpoint = await client._resolve_endpoint("skills")
        validate_endpoint = await client._resolve_endpoint("validate")

        assert skills_endpoint == "https://node.example/api/v1/skills"
        assert validate_endpoint == "https://node.example/api/v1/validate"
    finally:
        await client._client.aclose()


def test_resolve_gaid_parses_duadp_scheme() -> None:
    client, kind, name = resolve_gaid("duadp://discover.duadp.org/skills/code-review")
    assert client.base_url == "https://discover.duadp.org"
    assert kind == "skills"
    assert name == "code-review"


def test_resolve_gaid_rejects_invalid_uri() -> None:
    with pytest.raises(DuadpError):
        resolve_gaid("not-a-gaid")
