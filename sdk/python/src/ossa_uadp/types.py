"""UADP protocol types as Pydantic models."""
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field

TrustTier = Literal["official", "verified-signature", "signed", "community", "experimental"]
PeerStatus = Literal["healthy", "degraded", "unreachable"]


class NodeIdentity(BaseModel):
    did: str | None = None
    public_key: str | None = None


class FederationConfig(BaseModel):
    gossip: bool | None = None
    max_hops: int | None = None


class UadpEndpoints(BaseModel):
    skills: str | None = None
    agents: str | None = None
    tools: str | None = None
    federation: str | None = None
    validate: str | None = None
    publish: str | None = None

    class Config:
        extra = "allow"


class UadpManifest(BaseModel):
    protocol_version: str
    node_id: str | None = None
    node_name: str
    node_description: str | None = None
    contact: str | None = None
    endpoints: UadpEndpoints
    capabilities: list[str] | None = None
    identity: NodeIdentity | None = None
    public_key: str | None = None  # deprecated, use identity.public_key
    ossa_versions: list[str] | None = None
    federation: FederationConfig | None = None


class OssaMetadata(BaseModel):
    name: str
    version: str | None = None
    description: str | None = None
    uri: str | None = None
    category: str | None = None
    trust_tier: TrustTier | None = None
    tags: list[str] | None = None
    created: str | None = None
    updated: str | None = None

    class Config:
        extra = "allow"


class ResourceSignature(BaseModel):
    algorithm: Literal["Ed25519", "ES256"]
    value: str
    signer: str
    timestamp: str | None = None


class OssaResource(BaseModel):
    """Generic OSSA resource — base for Skill, Agent, Tool, and custom kinds."""
    apiVersion: str = Field(alias="apiVersion")
    kind: str
    metadata: OssaMetadata
    spec: dict | None = None
    signature: ResourceSignature | None = None

    class Config:
        populate_by_name = True
        extra = "allow"


class OssaSkill(OssaResource):
    kind: Literal["Skill"] = "Skill"


class OssaAgent(OssaResource):
    kind: Literal["Agent"] = "Agent"


class OssaTool(OssaResource):
    kind: Literal["Tool"] = "Tool"


class FederatedSource(BaseModel):
    node_id: str | None = None
    node_name: str | None = None
    count: int


class PaginationMeta(BaseModel):
    total: int
    page: int
    limit: int
    node_name: str
    node_id: str | None = None
    federated: bool | None = None
    sources: list[FederatedSource] | None = None


class PaginatedResponse[T](BaseModel):
    data: list[T]
    meta: PaginationMeta


class Peer(BaseModel):
    url: str
    node_id: str | None = None
    name: str
    status: PeerStatus = "healthy"
    last_synced: str | None = None
    capabilities: list[str] | None = None
    skill_count: int | None = None
    agent_count: int | None = None
    tool_count: int | None = None


class FederationResponse(BaseModel):
    protocol_version: str
    node_id: str | None = None
    node_name: str
    gossip: bool | None = None
    max_hops: int | None = None
    peers: list[Peer]


class PublishResponse(BaseModel):
    success: bool
    resource: OssaResource | None = None


class ValidationResult(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ListParams(BaseModel):
    search: str | None = None
    category: str | None = None
    trust_tier: TrustTier | None = None
    tag: str | None = None
    federated: bool | None = None
    page: int = 1
    limit: int = 20


class ToolListParams(ListParams):
    protocol: Literal["mcp", "a2a", "function", "rest"] | None = None


class WebFingerLink(BaseModel):
    rel: str
    type: str | None = None
    href: str


class WebFingerResponse(BaseModel):
    subject: str
    links: list[WebFingerLink]
    properties: dict[str, str] | None = None


class PeerRegistration(BaseModel):
    url: str
    name: str
    node_id: str | None = None
    hop: int = 0
