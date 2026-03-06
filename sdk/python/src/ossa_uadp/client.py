"""UADP client for discovering and querying any UADP node."""
from __future__ import annotations
from urllib.parse import urljoin, urlencode
import httpx
from .types import (
    UadpManifest, OssaSkill, OssaAgent, OssaTool, OssaResource,
    PaginatedResponse, FederationResponse, ValidationResult,
    ListParams, ToolListParams, PublishResponse, PeerRegistration,
    WebFingerResponse, NodeGovernance, ResourceRisk, ResourceProvenance,
    AuditEvent, Revocation, SyncResponse, WebhookSubscription,
    AgentIdentity,
)


class UadpError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class UadpClient:
    """Client for discovering and querying a UADP node.

    Usage::

        async with UadpClient("https://marketplace.example.com") as client:
            manifest = await client.discover()
            skills = await client.list_skills(search="code-review")
            tools = await client.list_tools(protocol="mcp")
            await client.publish_skill(my_skill)
    """

    def __init__(
        self,
        base_url: str,
        *,
        timeout: float = 10.0,
        headers: dict[str, str] | None = None,
        token: str | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        auth_headers = {"Accept": "application/json", **(headers or {})}
        if token:
            auth_headers["Authorization"] = f"Bearer {token}"
        self._client = httpx.AsyncClient(timeout=timeout, headers=auth_headers)
        self._manifest: UadpManifest | None = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        await self._client.aclose()

    # --- Discovery ---

    async def discover(self) -> UadpManifest:
        """Fetch /.well-known/uadp.json and cache the manifest."""
        url = f"{self.base_url}/.well-known/uadp.json"
        resp = await self._client.get(url)
        if resp.status_code != 200:
            raise UadpError(f"Discovery failed: HTTP {resp.status_code}", resp.status_code)
        self._manifest = UadpManifest.model_validate(resp.json())
        return self._manifest

    async def get_manifest(self) -> UadpManifest:
        """Return cached manifest or discover."""
        if not self._manifest:
            await self.discover()
        return self._manifest  # type: ignore[return-value]

    async def resolve_gaid(self, gaid: str) -> WebFingerResponse:
        """Resolve a GAID via WebFinger."""
        url = f"{self.base_url}/.well-known/webfinger?resource={gaid}"
        resp = await self._client.get(url)
        resp.raise_for_status()
        return WebFingerResponse.model_validate(resp.json())

    # --- Skills ---

    async def list_skills(self, params: ListParams | None = None, **kwargs) -> PaginatedResponse[OssaSkill]:
        """List skills from the node."""
        endpoint = await self._resolve_endpoint("skills")
        p = params or ListParams(**kwargs)
        resp = await self._client.get(endpoint, params=self._build_params(p))
        resp.raise_for_status()
        return PaginatedResponse[OssaSkill].model_validate(resp.json())

    async def get_skill(self, name: str) -> OssaSkill:
        """Get a single skill by name."""
        endpoint = await self._resolve_endpoint("skills")
        resp = await self._client.get(f"{endpoint}/{name}")
        resp.raise_for_status()
        return OssaSkill.model_validate(resp.json())

    async def publish_skill(self, skill: OssaSkill) -> PublishResponse:
        """Publish a skill (requires authentication)."""
        endpoint = await self._resolve_endpoint("skills")
        resp = await self._client.post(endpoint, json=skill.model_dump(by_alias=True))
        resp.raise_for_status()
        return PublishResponse.model_validate(resp.json())

    async def update_skill(self, name: str, skill: OssaSkill) -> PublishResponse:
        """Update a skill (requires authentication)."""
        endpoint = await self._resolve_endpoint("skills")
        resp = await self._client.put(f"{endpoint}/{name}", json=skill.model_dump(by_alias=True))
        resp.raise_for_status()
        return PublishResponse.model_validate(resp.json())

    async def delete_skill(self, name: str) -> None:
        """Delete a skill (requires authentication)."""
        endpoint = await self._resolve_endpoint("skills")
        resp = await self._client.delete(f"{endpoint}/{name}")
        resp.raise_for_status()

    # --- Agents ---

    async def list_agents(self, params: ListParams | None = None, **kwargs) -> PaginatedResponse[OssaAgent]:
        """List agents from the node."""
        endpoint = await self._resolve_endpoint("agents")
        p = params or ListParams(**kwargs)
        resp = await self._client.get(endpoint, params=self._build_params(p))
        resp.raise_for_status()
        return PaginatedResponse[OssaAgent].model_validate(resp.json())

    async def get_agent(self, name: str) -> OssaAgent:
        """Get a single agent by name."""
        endpoint = await self._resolve_endpoint("agents")
        resp = await self._client.get(f"{endpoint}/{name}")
        resp.raise_for_status()
        return OssaAgent.model_validate(resp.json())

    async def publish_agent(self, agent: OssaAgent) -> PublishResponse:
        """Publish an agent (requires authentication)."""
        endpoint = await self._resolve_endpoint("agents")
        resp = await self._client.post(endpoint, json=agent.model_dump(by_alias=True))
        resp.raise_for_status()
        return PublishResponse.model_validate(resp.json())

    # --- Tools ---

    async def list_tools(self, params: ToolListParams | None = None, **kwargs) -> PaginatedResponse[OssaTool]:
        """List tools from the node."""
        endpoint = await self._resolve_endpoint("tools")
        p = params or ToolListParams(**kwargs)
        query = self._build_params(p)
        if p.protocol:
            query["protocol"] = p.protocol
        resp = await self._client.get(endpoint, params=query)
        resp.raise_for_status()
        return PaginatedResponse[OssaTool].model_validate(resp.json())

    async def get_tool(self, name: str) -> OssaTool:
        """Get a single tool by name."""
        endpoint = await self._resolve_endpoint("tools")
        resp = await self._client.get(f"{endpoint}/{name}")
        resp.raise_for_status()
        return OssaTool.model_validate(resp.json())

    async def publish_tool(self, tool: OssaTool) -> PublishResponse:
        """Publish a tool (requires authentication)."""
        endpoint = await self._resolve_endpoint("tools")
        resp = await self._client.post(endpoint, json=tool.model_dump(by_alias=True))
        resp.raise_for_status()
        return PublishResponse.model_validate(resp.json())

    # --- Generic Publishing ---

    async def publish(self, resource: OssaResource) -> PublishResponse:
        """Publish any OSSA resource via the generic publish endpoint."""
        endpoint = await self._resolve_endpoint("publish")
        resp = await self._client.post(endpoint, json=resource.model_dump(by_alias=True))
        resp.raise_for_status()
        return PublishResponse.model_validate(resp.json())

    # --- Federation ---

    async def get_federation(self) -> FederationResponse:
        """Get federation peers."""
        endpoint = await self._resolve_endpoint("federation")
        resp = await self._client.get(endpoint)
        resp.raise_for_status()
        return FederationResponse.model_validate(resp.json())

    async def register_as_peer(self, registration: PeerRegistration) -> dict:
        """Register this node as a federation peer."""
        endpoint = await self._resolve_endpoint("federation")
        resp = await self._client.post(endpoint, json=registration.model_dump())
        resp.raise_for_status()
        return resp.json()

    # --- Validation ---

    async def validate(self, manifest_str: str) -> ValidationResult:
        """Validate a manifest using the node's validation service."""
        endpoint = await self._resolve_endpoint("validate")
        resp = await self._client.post(endpoint, json={"manifest": manifest_str})
        resp.raise_for_status()
        return ValidationResult.model_validate(resp.json())

    # --- Governance (NIST AI RMF) ---

    async def get_governance(self) -> NodeGovernance:
        """Get node governance declarations."""
        endpoint = await self._resolve_endpoint("governance")
        resp = await self._client.get(endpoint)
        resp.raise_for_status()
        return NodeGovernance.model_validate(resp.json())

    async def get_resource_risk(self, gaid: str) -> ResourceRisk:
        """Get risk assessment for a resource by GAID."""
        endpoint = await self._resolve_endpoint("governance")
        resp = await self._client.get(f"{endpoint}/risk/{gaid}")
        resp.raise_for_status()
        return ResourceRisk.model_validate(resp.json())

    async def get_audit_log(
        self,
        *,
        event_type: str | None = None,
        gaid: str | None = None,
        since: str | None = None,
        page: int | None = None,
        limit: int | None = None,
    ) -> list[AuditEvent]:
        """Get audit log entries."""
        try:
            endpoint = await self._resolve_endpoint("audit_log")
        except UadpError:
            endpoint = (await self._resolve_endpoint("governance")) + "/audit"
        params: dict[str, str] = {}
        if event_type:
            params["event_type"] = event_type
        if gaid:
            params["gaid"] = gaid
        if since:
            params["since"] = since
        if page:
            params["page"] = str(page)
        if limit:
            params["limit"] = str(limit)
        resp = await self._client.get(endpoint, params=params)
        resp.raise_for_status()
        return [AuditEvent.model_validate(e) for e in resp.json()]

    # --- Provenance (NIST SP 800-218A) ---

    async def get_provenance(self, gaid: str) -> ResourceProvenance:
        """Get supply chain provenance for a resource."""
        endpoint = await self._resolve_endpoint("provenance")
        resp = await self._client.get(f"{endpoint}/{gaid}")
        resp.raise_for_status()
        return ResourceProvenance.model_validate(resp.json())

    # --- Revocations (NIST SI-7, CM-3) ---

    async def get_revocations(
        self,
        *,
        severity: str | None = None,
        since: str | None = None,
        page: int | None = None,
        limit: int | None = None,
    ) -> list[Revocation]:
        """Get list of revoked resources."""
        endpoint = await self._resolve_endpoint("revocations")
        params: dict[str, str] = {}
        if severity:
            params["severity"] = severity
        if since:
            params["since"] = since
        if page:
            params["page"] = str(page)
        if limit:
            params["limit"] = str(limit)
        resp = await self._client.get(endpoint, params=params)
        resp.raise_for_status()
        return [Revocation.model_validate(r) for r in resp.json()]

    # --- Federation Sync ---

    async def federation_sync(
        self,
        *,
        since: str | None = None,
        sync_token: str | None = None,
        limit: int | None = None,
    ) -> SyncResponse:
        """Get incremental changes since a timestamp or sync token."""
        endpoint = await self._resolve_endpoint("federation")
        params: dict[str, str] = {}
        if since:
            params["since"] = since
        if sync_token:
            params["sync_token"] = sync_token
        if limit:
            params["limit"] = str(limit)
        resp = await self._client.get(f"{endpoint}/sync", params=params)
        resp.raise_for_status()
        return SyncResponse.model_validate(resp.json())

    # --- Events (Webhooks) ---

    async def subscribe_webhook(self, subscription: WebhookSubscription) -> None:
        """Subscribe to webhook events."""
        endpoint = await self._resolve_endpoint("events")
        resp = await self._client.post(
            f"{endpoint}/subscribe",
            json=subscription.model_dump(),
        )
        resp.raise_for_status()

    # --- Agent Identity ---

    async def get_agent_identity(self, gaid: str) -> AgentIdentity:
        """Get agent identity record by GAID."""
        endpoint = await self._resolve_endpoint("identity")
        resp = await self._client.get(f"{endpoint}/{gaid}")
        resp.raise_for_status()
        return AgentIdentity.model_validate(resp.json())

    # --- Internals ---

    async def _resolve_endpoint(self, name: str) -> str:
        manifest = await self.get_manifest()
        endpoint = getattr(manifest.endpoints, name, None)
        if not endpoint:
            raise UadpError(f"Node does not expose a {name} endpoint")
        # Handle relative URLs
        if endpoint.startswith("/"):
            return f"{self.base_url}{endpoint}"
        return endpoint

    @staticmethod
    def _build_params(p: ListParams) -> dict[str, str]:
        params: dict[str, str] = {}
        if p.search:
            params["search"] = p.search
        if p.category:
            params["category"] = p.category
        if p.trust_tier:
            params["trust_tier"] = p.trust_tier
        if p.tag:
            params["tag"] = p.tag
        if p.federated:
            params["federated"] = "true"
        if p.page != 1:
            params["page"] = str(p.page)
        if p.limit != 20:
            params["limit"] = str(p.limit)
        return params


def resolve_gaid(gaid: str, **client_kwargs) -> tuple[UadpClient, str, str]:
    """Resolve a GAID URI to a UadpClient, kind, and name.

    Example::

        client, kind, name = resolve_gaid("agent://skills.sh/skills/web-search")
        skill = await client.get_skill(name)
    """
    import re
    match = re.match(r"^agent://([^/]+)/([^/]+)/(.+)$", gaid)
    if not match:
        raise UadpError(f"Invalid GAID: {gaid}")
    domain, kind, name = match.groups()
    client = UadpClient(f"https://{domain}", **client_kwargs)
    return client, kind, name
