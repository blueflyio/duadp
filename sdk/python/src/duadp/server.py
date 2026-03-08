"""FastAPI router for serving DUADP endpoints."""
from __future__ import annotations
from typing import Protocol
from .types import (
    DuadpManifest, DuadpEndpoints, OssaSkill, OssaAgent,
    PaginatedResponse, PaginationMeta, FederationResponse,
    ValidationResult, Peer,
)


class DuadpDataProvider(Protocol):
    """Interface for providing data to DUADP endpoints."""

    async def list_skills(self, search: str | None, category: str | None, page: int, limit: int) -> PaginatedResponse[OssaSkill]: ...
    async def list_agents(self, search: str | None, page: int, limit: int) -> PaginatedResponse[OssaAgent]: ...
    async def list_peers(self) -> list[Peer]: ...
    async def add_peer(self, url: str, name: str) -> dict: ...
    async def validate_manifest(self, manifest: str) -> ValidationResult: ...


def create_duadp_router(
    *,
    node_name: str,
    base_url: str,
    provider: DuadpDataProvider,
    node_description: str | None = None,
    contact: str | None = None,
    public_key: str | None = None,
    ossa_versions: list[str] | None = None,
):
    """Create a FastAPI APIRouter with DUADP protocol endpoints.

    Usage::

        from fastapi import FastAPI
        from ossa_duadp.server import create_duadp_router

        app = FastAPI()
        router = create_duadp_router(
            node_name="My Node",
            base_url="https://my-node.com",
            provider=my_data_provider,
        )
        app.include_router(router)
    """
    from fastapi import APIRouter, Query
    from fastapi.responses import JSONResponse

    router = APIRouter()

    @router.get("/.well-known/duadp.json")
    async def well_known():
        manifest = DuadpManifest(
            protocol_version="0.1.0",
            node_name=node_name,
            node_description=node_description,
            contact=contact,
            endpoints=DuadpEndpoints(
                skills=f"{base_url}/api/v1/skills",
                agents=f"{base_url}/api/v1/agents",
                federation=f"{base_url}/api/v1/federation",
                validate=f"{base_url}/api/v1/skills/validate",
            ),
            capabilities=["skills", "agents", "federation", "validation"],
            public_key=public_key,
            ossa_versions=ossa_versions or ["v0.4"],
        )
        return manifest.model_dump(exclude_none=True)

    @router.get("/api/v1/skills")
    async def list_skills(
        search: str | None = Query(None),
        category: str | None = Query(None),
        page: int = Query(1, ge=1),
        limit: int = Query(20, ge=1, le=100),
    ):
        result = await provider.list_skills(search, category, page, limit)
        return result.model_dump()

    @router.get("/api/v1/agents")
    async def list_agents(
        search: str | None = Query(None),
        page: int = Query(1, ge=1),
        limit: int = Query(20, ge=1, le=100),
    ):
        result = await provider.list_agents(search, page, limit)
        return result.model_dump()

    @router.get("/api/v1/federation")
    async def federation_list():
        peers = await provider.list_peers()
        response = FederationResponse(
            protocol_version="0.1.0",
            node_name=node_name,
            peers=peers,
        )
        return response.model_dump()

    @router.post("/api/v1/federation", status_code=201)
    async def federation_register(body: dict):
        url = body.get("url")
        name = body.get("name")
        if not url or not name:
            return JSONResponse({"error": "Missing required fields: url, name"}, status_code=400)
        result = await provider.add_peer(url, name)
        return result

    @router.post("/api/v1/skills/validate")
    async def validate_skill(body: dict):
        manifest = body.get("manifest")
        if not manifest:
            return JSONResponse({"valid": False, "errors": ["Missing manifest field"]}, status_code=400)
        result = await provider.validate_manifest(manifest)
        return result.model_dump()

    return router
