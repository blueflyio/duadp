"""Cryptographic signing, verification, and content hashing for DUADP resources."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PublicFormat,
)
import base64


def _sort_keys(obj: Any) -> Any:
    """Recursively sort dictionary keys for canonical JSON."""
    if isinstance(obj, dict):
        return {k: _sort_keys(v) for k, v in sorted(obj.items())}
    if isinstance(obj, list):
        return [_sort_keys(item) for item in obj]
    return obj


def canonicalize(resource: dict) -> str:
    """Canonical JSON serialization of a resource (excluding signature field)."""
    filtered = {k: v for k, v in resource.items() if k != "signature"}
    return json.dumps(_sort_keys(filtered), separators=(",", ":"), ensure_ascii=False)


def content_hash(resource: dict) -> str:
    """Compute SHA-256 content hash of a resource in canonical form."""
    canonical = canonicalize(resource)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def sign_resource(
    resource: dict,
    private_key: Ed25519PrivateKey,
    signer: str,
) -> dict:
    """Sign an OSSA resource with Ed25519.

    Args:
        resource: The OSSA resource dict to sign.
        private_key: Ed25519 private key.
        signer: DID of the signer (e.g., "did:web:acme.com").

    Returns:
        New dict with `signature` and `content_hash` fields added.
    """
    canonical = canonicalize(resource)
    sig_bytes = private_key.sign(canonical.encode("utf-8"))
    sig_value = base64.urlsafe_b64encode(sig_bytes).rstrip(b"=").decode("ascii")

    result = dict(resource)
    result["signature"] = {
        "algorithm": "Ed25519",
        "value": sig_value,
        "signer": signer,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    result["content_hash"] = content_hash(resource)
    return result


def verify_signature(resource: dict, public_key: Ed25519PublicKey) -> bool:
    """Verify an Ed25519 signature on an OSSA resource.

    Args:
        resource: The signed OSSA resource dict.
        public_key: Ed25519 public key.

    Returns:
        True if signature is valid, False otherwise.
    """
    sig = resource.get("signature")
    if not sig or sig.get("algorithm") != "Ed25519":
        return False

    canonical = canonicalize(resource)
    sig_value = sig["value"]
    # Re-pad base64url
    padding = 4 - len(sig_value) % 4
    if padding != 4:
        sig_value += "=" * padding
    sig_bytes = base64.urlsafe_b64decode(sig_value)

    try:
        public_key.verify(sig_bytes, canonical.encode("utf-8"))
        return True
    except Exception:
        return False


def generate_key_pair() -> tuple[Ed25519PrivateKey, Ed25519PublicKey]:
    """Generate an Ed25519 key pair for signing DUADP resources."""
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    return private_key, public_key


def export_public_key(public_key: Ed25519PublicKey) -> bytes:
    """Export a public key to raw bytes (32 bytes for Ed25519)."""
    return public_key.public_bytes(Encoding.Raw, PublicFormat.Raw)


def import_public_key(raw: bytes) -> Ed25519PublicKey:
    """Import a raw Ed25519 public key (32 bytes)."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey as PK
    return PK.from_public_bytes(raw)


def to_multibase(raw: bytes) -> str:
    """Encode raw bytes as multibase (z-prefix, base64url)."""
    encoded = base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")
    return f"z{encoded}"


def from_multibase(multibase: str) -> bytes:
    """Decode a multibase-encoded value (z-prefix, base64url)."""
    if not multibase.startswith("z"):
        raise ValueError("Only z-prefix (base64url) multibase supported")
    value = multibase[1:]
    padding = 4 - len(value) % 4
    if padding != 4:
        value += "=" * padding
    return base64.urlsafe_b64decode(value)
