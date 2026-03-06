package duadp

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// DIDDocument represents a W3C DID Document.
type DIDDocument struct {
	Context            any                  `json:"@context"`
	ID                 string               `json:"id"`
	Controller         any                  `json:"controller,omitempty"`
	VerificationMethod []DIDVerificationMethod `json:"verificationMethod,omitempty"`
	Authentication     []any                `json:"authentication,omitempty"`
	AssertionMethod    []any                `json:"assertionMethod,omitempty"`
	KeyAgreement       []any                `json:"keyAgreement,omitempty"`
	Service            []DIDService         `json:"service,omitempty"`
}

// DIDVerificationMethod is a key in a DID document.
type DIDVerificationMethod struct {
	ID                 string            `json:"id"`
	Type               string            `json:"type"`
	Controller         string            `json:"controller"`
	PublicKeyMultibase string            `json:"publicKeyMultibase,omitempty"`
	PublicKeyJwk       map[string]string `json:"publicKeyJwk,omitempty"`
}

// DIDService is a service endpoint in a DID document.
type DIDService struct {
	ID              string `json:"id"`
	Type            string `json:"type"`
	ServiceEndpoint any    `json:"serviceEndpoint"`
}

// ResolvedKey is an extracted key from a DID document.
type ResolvedKey struct {
	ID                 string   `json:"id"`
	Type               string   `json:"type"`
	PublicKeyMultibase string   `json:"public_key_multibase,omitempty"`
	Purpose            []string `json:"purpose"`
}

// DIDResolutionResult contains the resolved DID document and extracted keys.
type DIDResolutionResult struct {
	Document     DIDDocument  `json:"document"`
	PublicKeys   []ResolvedKey `json:"public_keys"`
	UadpEndpoint string       `json:"uadp_endpoint,omitempty"`
}

// DidWebToURL converts a did:web DID to its HTTPS resolution URL.
func DidWebToURL(did string) (string, error) {
	parts := strings.Split(did, ":")[2:] // Remove "did:web:"
	if len(parts) == 0 {
		return "", fmt.Errorf("invalid did:web: %s", did)
	}
	domain, err := url.PathUnescape(parts[0])
	if err != nil {
		return "", fmt.Errorf("invalid domain in did:web: %w", err)
	}
	if len(parts) == 1 {
		return fmt.Sprintf("https://%s/.well-known/did.json", domain), nil
	}
	path := make([]string, len(parts)-1)
	for i, p := range parts[1:] {
		decoded, err := url.PathUnescape(p)
		if err != nil {
			return "", err
		}
		path[i] = decoded
	}
	return fmt.Sprintf("https://%s/%s/did.json", domain, strings.Join(path, "/")), nil
}

// BuildDidWeb constructs a did:web DID from a domain and optional path segments.
func BuildDidWeb(domain string, path ...string) string {
	parts := []string{domain}
	parts = append(parts, path...)
	return "did:web:" + strings.Join(parts, ":")
}

// ResolveDID resolves a DID to its DID Document and extracts verification keys.
func ResolveDID(did string, httpClient *http.Client) (*DIDResolutionResult, error) {
	method := ""
	parts := strings.SplitN(did, ":", 3)
	if len(parts) >= 2 {
		method = parts[1]
	}

	switch method {
	case "web":
		return resolveDidWeb(did, httpClient)
	case "key":
		return resolveDidKey(did)
	default:
		return nil, fmt.Errorf("unsupported DID method: %s. Supported: did:web, did:key", method)
	}
}

func resolveDidWeb(did string, httpClient *http.Client) (*DIDResolutionResult, error) {
	u, err := DidWebToURL(did)
	if err != nil {
		return nil, err
	}
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/did+json, application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("resolve %s: %w", did, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("resolve %s: HTTP %d from %s", did, resp.StatusCode, u)
	}
	var doc DIDDocument
	if err := json.NewDecoder(resp.Body).Decode(&doc); err != nil {
		return nil, fmt.Errorf("decode DID document: %w", err)
	}
	return extractKeys(doc), nil
}

func resolveDidKey(did string) (*DIDResolutionResult, error) {
	parts := strings.Split(did, ":")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid did:key: %s", did)
	}
	multibase := parts[2]
	vm := DIDVerificationMethod{
		ID:                 fmt.Sprintf("%s#%s", did, multibase),
		Type:               "Ed25519VerificationKey2020",
		Controller:         did,
		PublicKeyMultibase: multibase,
	}
	doc := DIDDocument{
		Context:            []string{"https://www.w3.org/ns/did/v1"},
		ID:                 did,
		VerificationMethod: []DIDVerificationMethod{vm},
		Authentication:     []any{fmt.Sprintf("%s#%s", did, multibase)},
		AssertionMethod:    []any{fmt.Sprintf("%s#%s", did, multibase)},
	}
	return extractKeys(doc), nil
}

func extractKeys(doc DIDDocument) *DIDResolutionResult {
	authIDs := map[string]bool{}
	for _, a := range doc.Authentication {
		if s, ok := a.(string); ok {
			authIDs[s] = true
		}
	}
	assertIDs := map[string]bool{}
	for _, a := range doc.AssertionMethod {
		if s, ok := a.(string); ok {
			assertIDs[s] = true
		}
	}

	var keys []ResolvedKey
	for _, vm := range doc.VerificationMethod {
		var purpose []string
		if authIDs[vm.ID] {
			purpose = append(purpose, "authentication")
		}
		if assertIDs[vm.ID] {
			purpose = append(purpose, "assertionMethod")
		}
		if len(purpose) == 0 {
			purpose = []string{"verification"}
		}
		keys = append(keys, ResolvedKey{
			ID:                 vm.ID,
			Type:               vm.Type,
			PublicKeyMultibase: vm.PublicKeyMultibase,
			Purpose:            purpose,
		})
	}

	var uadpEndpoint string
	for _, svc := range doc.Service {
		if svc.Type == "UadpNode" || svc.Type == "UadpResource" {
			if s, ok := svc.ServiceEndpoint.(string); ok {
				uadpEndpoint = s
			}
			break
		}
	}

	return &DIDResolutionResult{
		Document:     doc,
		PublicKeys:   keys,
		UadpEndpoint: uadpEndpoint,
	}
}
