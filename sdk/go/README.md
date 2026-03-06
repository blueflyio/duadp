# uadp-go — Go SDK

**UADP client and server SDK for Go.**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../LICENSE)

## Install

```bash
go get github.com/openstandardagents/uadp-go
```

## Quick Start — Client

```go
package main

import (
    "context"
    "fmt"
    uadp "github.com/openstandardagents/uadp-go"
)

func main() {
    ctx := context.Background()
    client := uadp.NewClient("https://skills.sh")

    // Discovery
    manifest, _ := client.GetManifest(ctx)
    skills, _ := client.ListSkills(ctx, &uadp.ListParams{Search: "code review"})
    tools, _ := client.ListTools(ctx, &uadp.ToolListParams{Protocol: "mcp"})

    // Resolve a GAID
    c, kind, name, _ := uadp.ResolveGaid("agent://skills.sh/tools/web-search")
    tool, _ := c.GetTool(ctx, name)

    fmt.Printf("Found %d skills, %d tools\n", len(skills), len(tools))
}
```

## Quick Start — Server

Build a UADP node with `net/http`:

```go
handler := uadp.NewHandler(uadp.HandlerConfig{
    NodeName: "My AI Hub",
    NodeID:   "did:web:my-hub.com",
    BaseURL:  "https://my-hub.com",
}, uadp.DataProvider{
    ListSkills: myListSkillsFn,
    ListTools:  myListToolsFn,
})

http.Handle("/", handler)
http.ListenAndServe(":3000", nil)
```

## Features

- **Client** — `Client` with automatic manifest discovery
- **Server** — `net/http` handler for building UADP nodes
- **DID resolution** — `did:web:` and `did:key:` support
- **Cryptographic signatures** — Ed25519 signing/verification
- **GAID resolution** — Cross-node resource lookups
- **Validation** — Manifest and response validation

## Packages

```go
import uadp "github.com/openstandardagents/uadp-go"

// Types
uadp.OssaResource
uadp.UadpManifest
uadp.ListParams
uadp.ToolListParams

// Client
uadp.NewClient(baseURL string) *Client
uadp.ResolveGaid(gaid string) (*Client, string, string, error)

// Server
uadp.NewHandler(config, provider) http.Handler

// Crypto
uadp.SignResource(resource, privateKey) error
uadp.VerifySignature(resource, publicKey) (bool, error)

// DID
uadp.ResolveDID(did string) (*DIDResolutionResult, error)
uadp.BuildDidWeb(domain string, path ...string) string
```

## License

Apache License 2.0
