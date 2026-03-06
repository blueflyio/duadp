"""Universal AI Discovery Protocol (UADP) SDK for Python."""
from .types import (
    UadpManifest, NodeIdentity, FederationConfig, UadpEndpoints,
    OssaSkill, OssaAgent, OssaTool, OssaResource, OssaMetadata, ResourceSignature,
    ResourceIdentity,
    PaginationMeta, FederatedSource, PaginatedResponse,
    Peer, FederationResponse,
    PublishResponse, ValidationResult,
    ListParams, ToolListParams,
    TrustTier, PeerStatus,
    WebFingerResponse, WebFingerLink,
    PeerRegistration,
)
from .client import UadpClient, UadpError, resolve_gaid
from .validate import validate_manifest, validate_response

__version__ = "0.2.0"
__all__ = [
    "UadpClient", "UadpError", "resolve_gaid",
    "UadpManifest", "NodeIdentity", "FederationConfig", "UadpEndpoints",
    "OssaSkill", "OssaAgent", "OssaTool", "OssaResource", "OssaMetadata", "ResourceSignature",
    "ResourceIdentity",
    "PaginationMeta", "FederatedSource", "PaginatedResponse",
    "Peer", "FederationResponse",
    "PublishResponse", "ValidationResult",
    "ListParams", "ToolListParams",
    "TrustTier", "PeerStatus",
    "WebFingerResponse", "WebFingerLink",
    "PeerRegistration",
    "validate_manifest", "validate_response",
]
