package uadp

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

// Canonicalize returns the canonical JSON serialization of a resource
// (excluding the signature field), with keys sorted deterministically.
func Canonicalize(resource OssaResource) (string, error) {
	// Marshal to generic map, remove signature, sort keys, remarshal
	data, err := json.Marshal(resource)
	if err != nil {
		return "", fmt.Errorf("marshal: %w", err)
	}
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		return "", fmt.Errorf("unmarshal: %w", err)
	}
	delete(m, "signature")
	sorted := sortMapKeys(m)
	canonical, err := json.Marshal(sorted)
	if err != nil {
		return "", fmt.Errorf("remarshal: %w", err)
	}
	return string(canonical), nil
}

func sortMapKeys(v any) any {
	switch val := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(val))
		for k := range val {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		sorted := make(map[string]any, len(val))
		for _, k := range keys {
			sorted[k] = sortMapKeys(val[k])
		}
		return sorted
	case []any:
		for i, item := range val {
			val[i] = sortMapKeys(item)
		}
		return val
	default:
		return v
	}
}

// ContentHash computes the SHA-256 hash of a resource's canonical form.
func ContentHash(resource OssaResource) (string, error) {
	canonical, err := Canonicalize(resource)
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256([]byte(canonical))
	return fmt.Sprintf("%x", hash), nil
}

// SignResource signs an OSSA resource with Ed25519.
func SignResource(resource OssaResource, privateKey ed25519.PrivateKey, signer string) (OssaResource, error) {
	canonical, err := Canonicalize(resource)
	if err != nil {
		return resource, err
	}

	sig := ed25519.Sign(privateKey, []byte(canonical))
	sigValue := base64URLEncode(sig)

	hash, err := ContentHash(resource)
	if err != nil {
		return resource, err
	}

	resource.Signature = &ResourceSignature{
		Algorithm: "Ed25519",
		Value:     sigValue,
		Signer:    signer,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}
	resource.ContentHash = hash
	return resource, nil
}

// VerifySignature verifies an Ed25519 signature on an OSSA resource.
func VerifySignature(resource OssaResource, publicKey ed25519.PublicKey) (bool, error) {
	if resource.Signature == nil || resource.Signature.Algorithm != "Ed25519" {
		return false, nil
	}

	canonical, err := Canonicalize(resource)
	if err != nil {
		return false, err
	}

	sigBytes, err := base64URLDecode(resource.Signature.Value)
	if err != nil {
		return false, fmt.Errorf("decode signature: %w", err)
	}

	return ed25519.Verify(publicKey, []byte(canonical), sigBytes), nil
}

// GenerateKeyPair generates an Ed25519 key pair for signing UADP resources.
func GenerateKeyPair() (ed25519.PublicKey, ed25519.PrivateKey, error) {
	pub, priv, err := ed25519.GenerateKey(nil)
	return pub, priv, err
}

// ToMultibase encodes raw bytes as multibase (z-prefix, base64url).
func ToMultibase(raw []byte) string {
	return "z" + base64URLEncode(raw)
}

// FromMultibase decodes a multibase-encoded value.
func FromMultibase(multibase string) ([]byte, error) {
	if !strings.HasPrefix(multibase, "z") {
		return nil, fmt.Errorf("only z-prefix (base64url) multibase supported")
	}
	return base64URLDecode(multibase[1:])
}

func base64URLEncode(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

func base64URLDecode(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(s)
}
