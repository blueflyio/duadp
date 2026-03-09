"""DID resolution for DUADP identity verification."""
from __future__ import annotations

from dataclasses import dataclass, field
from urllib.parse import unquote
from typing import Any

import httpx


@dataclass
class VerificationMethod:
    id: str
    type: str
    controller: str
    public_key_multibase: str | None = None
    public_key_jwk: dict[str, str] | None = None


@dataclass
class ServiceEndpoint:
    id: str
    type: str
    service_endpoint: str | list[str] | dict[str, str]


@dataclass
class DIDDocument:
    id: str
    context: str | list[str] = ""
    controller: str | list[str] | None = None
    verification_method: list[VerificationMethod] = field(default_factory=list)
    authentication: list[str] = field(default_factory=list)
    assertion_method: list[str] = field(default_factory=list)
    key_agreement: list[Any] = field(default_factory=list)
    service: list[ServiceEndpoint] = field(default_factory=list)


@dataclass
class ResolvedKey:
    id: str
    type: str
    public_key_multibase: str | None
    purpose: list[str]


@dataclass
class DIDResolutionResult:
    document: DIDDocument
    public_keys: list[ResolvedKey]
    duadp_endpoint: str | None = None


def did_web_to_url(did: str) -> str:
    """Convert a did:web DID to its HTTPS resolution URL."""
    parts = did.split(":")[2:]  # Remove "did:web:"
    if not parts:
        raise ValueError(f"Invalid did:web: {did}")
    domain = unquote(parts[0])
    path = [unquote(p) for p in parts[1:]]
    if not path:
        return f"https://{domain}/.well-known/did.json"
    return f"https://{domain}/{'/'.join(path)}/did.json"


def build_did_web(domain: str, *path: str) -> str:
    """Build a did:web DID from a domain and optional path segments."""
    parts = [domain, *path]
    return "did:web:" + ":".join(parts)


async def resolve_did(
    did: str,
    client: httpx.AsyncClient | None = None,
) -> DIDResolutionResult:
    """Resolve a DID to its DID Document and extract verification keys.

    Supports did:web and did:key methods.
    """
    method = did.split(":")[1] if ":" in did else ""

    if method == "web":
        return await _resolve_did_web(did, client)
    elif method == "key":
        return _resolve_did_key(did)
    else:
        raise ValueError(f"Unsupported DID method: {method}. Supported: did:web, did:key")


async def _resolve_did_web(
    did: str,
    client: httpx.AsyncClient | None = None,
) -> DIDResolutionResult:
    url = did_web_to_url(did)
    should_close = client is None
    if client is None:
        client = httpx.AsyncClient()
    try:
        resp = await client.get(url, headers={"Accept": "application/did+json, application/json"})
        resp.raise_for_status()
        doc_data = resp.json()
    finally:
        if should_close:
            await client.aclose()

    document = _parse_did_document(doc_data)
    return _extract_keys(document)


def _resolve_did_key(did: str) -> DIDResolutionResult:
    parts = did.split(":")
    if len(parts) != 3:
        raise ValueError(f"Invalid did:key: {did}")
    multibase = parts[2]

    vm = VerificationMethod(
        id=f"{did}#{multibase}",
        type="Ed25519VerificationKey2020",
        controller=did,
        public_key_multibase=multibase,
    )
    document = DIDDocument(
        id=did,
        context=["https://www.w3.org/ns/did/v1"],
        verification_method=[vm],
        authentication=[f"{did}#{multibase}"],
        assertion_method=[f"{did}#{multibase}"],
    )
    return _extract_keys(document)


def _parse_did_document(data: dict) -> DIDDocument:
    vms = []
    for vm_data in data.get("verificationMethod", []):
        vms.append(VerificationMethod(
            id=vm_data["id"],
            type=vm_data.get("type", ""),
            controller=vm_data.get("controller", ""),
            public_key_multibase=vm_data.get("publicKeyMultibase"),
            public_key_jwk=vm_data.get("publicKeyJwk"),
        ))

    services = []
    for svc_data in data.get("service", []):
        services.append(ServiceEndpoint(
            id=svc_data["id"],
            type=svc_data.get("type", ""),
            service_endpoint=svc_data.get("serviceEndpoint", ""),
        ))

    auth = [
        a if isinstance(a, str) else a.get("id", "")
        for a in data.get("authentication", [])
    ]
    assertion = [
        a if isinstance(a, str) else a.get("id", "")
        for a in data.get("assertionMethod", [])
    ]

    return DIDDocument(
        id=data["id"],
        context=data.get("@context", ""),
        controller=data.get("controller"),
        verification_method=vms,
        authentication=auth,
        assertion_method=assertion,
        key_agreement=data.get("keyAgreement", []),
        service=services,
    )


def _extract_keys(document: DIDDocument) -> DIDResolutionResult:
    auth_ids = set(document.authentication)
    assert_ids = set(document.assertion_method)
    public_keys: list[ResolvedKey] = []

    for vm in document.verification_method:
        purpose: list[str] = []
        if vm.id in auth_ids:
            purpose.append("authentication")
        if vm.id in assert_ids:
            purpose.append("assertionMethod")
        if not purpose:
            purpose.append("verification")
        public_keys.append(ResolvedKey(
            id=vm.id,
            type=vm.type,
            public_key_multibase=vm.public_key_multibase,
            purpose=purpose,
        ))

    duadp_endpoint = None
    for svc in document.service:
        if svc.type in ("DuadpNode", "DuadpResource"):
            if isinstance(svc.service_endpoint, str):
                duadp_endpoint = svc.service_endpoint
            break

    return DIDResolutionResult(
        document=document,
        public_keys=public_keys,
        duadp_endpoint=duadp_endpoint,
    )
