# Contributing to UADP

Thank you for your interest in the Universal AI Discovery Protocol!

## How to Contribute

### Spec Changes
1. Open an issue describing the proposed change
2. Fork the repo and create a branch
3. Update `spec/README.md` (the normative spec) and `spec/openapi.yaml`
4. Update JSON schemas in `spec/schemas/` if data models change
5. Update SDK implementations to match
6. Submit a merge request

### SDK Contributions
- TypeScript: `sdk/typescript/`
- Python: `sdk/python/`
- Go: `sdk/go/`
- New language SDKs welcome — follow the existing pattern

### Conformance Tests
Each SDK includes a conformance test runner (`uadp-test` CLI) that validates
a live UADP node against the spec. Contributions that improve test coverage
are especially valued.

## Code of Conduct

Be respectful. Be constructive. Focus on the protocol, not the person.

## License

By contributing, you agree that your contributions will be licensed under
the Apache License 2.0.

## Building a UADP Node

The simplest UADP node is two static JSON files — see Section 10 of the spec.
If you build a UADP node in a new framework or language, please open an issue
so we can list it as a reference implementation.
