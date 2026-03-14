import { describe, expect, it } from 'vitest';
import { DuadpClient } from '../client.js';

function jsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('DuadpClient inspector surface', () => {
  it('resolveResource uses the manifest resolve endpoint when present', async () => {
    const gaid = 'agent://discover.duadp.org/agents/test-agent';
    const expectedResolveUrl = `https://discover.duadp.org/api/v1/resolve/${encodeURIComponent(gaid)}`;
    const requests: string[] = [];

    const client = new DuadpClient('https://discover.duadp.org', {
      fetch: async (input) => {
        const url = String(input);
        requests.push(url);

        if (url === 'https://discover.duadp.org/.well-known/duadp.json') {
          return jsonResponse({
            protocol_version: 'v0.1.4',
            node_name: 'DUADP Discovery Node',
            endpoints: {
              skills: '/api/v1/skills',
              resolve: '/api/v1/resolve',
            },
          });
        }

        if (url === expectedResolveUrl) {
          return jsonResponse({
            resource: {
              apiVersion: 'ossa/v0.5',
              kind: 'Agent',
              metadata: { name: 'test-agent' },
            },
            source_node: 'DUADP Discovery Node',
            resolved: true,
          });
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
    });

    const result = await client.resolveResource(gaid);

    expect(result.source_node).toBe('DUADP Discovery Node');
    expect(result.resolved).toBe(true);
    expect(requests).toContain(expectedResolveUrl);
  });

  it('inspectGaid falls back to the default endpoint when the manifest omits inspect', async () => {
    const gaid = 'agent://discover.duadp.org/agents/test-agent';

    const client = new DuadpClient('https://discover.duadp.org', {
      fetch: async (input) => {
        const url = new URL(String(input));

        if (url.origin === 'https://discover.duadp.org' && url.pathname === '/.well-known/duadp.json') {
          return jsonResponse({
            protocol_version: 'v0.1.4',
            node_name: 'DUADP Discovery Node',
            endpoints: {
              skills: '/api/v1/skills',
            },
          });
        }

        if (url.origin === 'https://discover.duadp.org' && url.pathname === '/api/v1/inspect') {
          expect(url.searchParams.get('gaid')).toBe(gaid);
          return jsonResponse({
            gaid,
            resolved: true,
            resolved_via: 'local',
            source_node: 'DUADP Discovery Node',
            resource_kind: 'Agent',
            resource_name: 'test-agent',
            resource: {
              apiVersion: 'ossa/v0.5',
              kind: 'Agent',
              metadata: { name: 'test-agent' },
            },
            did: {
              value: 'did:web:discover.duadp.org',
              method: 'web',
              resolved: true,
              self_verifying: false,
              verification_method_count: 1,
            },
            trust_verification: {
              verified_tier: 'community',
              claimed_tier: 'community',
              checks: [],
              passed: true,
              downgraded: false,
            },
            signature_verification: {
              verified: false,
              trustLevel: 'none',
              checks: [],
              requiresSignature: false,
            },
            revocation: {
              revoked: false,
              record: null,
            },
            provenance: {
              links: [],
            },
            policy: {
              anonymous_publish: {
                principal_id: 'anonymous',
                context: {},
                global_policy: {
                  decision: 'Deny',
                  diagnostics: { reason: ['policy8'], errors: [] },
                  evaluation_ms: 1,
                },
                manifest_policy: null,
                effective_decision: 'Deny',
              },
              claimed_publisher_publish: {
                principal_id: 'did:web:discover.duadp.org',
                context: {},
                global_policy: {
                  decision: 'Allow',
                  diagnostics: { reason: ['policy1'], errors: [] },
                  evaluation_ms: 1,
                },
                manifest_policy: null,
                effective_decision: 'Allow',
              },
            },
            resolution_trace: [
              {
                step: 'local_lookup',
                status: 'passed',
                detail: 'Resolved from the local resources table',
              },
            ],
          });
        }

        throw new Error(`Unexpected URL: ${url.toString()}`);
      },
    });

    const result = await client.inspectGaid(gaid);

    expect(result.gaid).toBe(gaid);
    expect(result.policy.anonymous_publish.effective_decision).toBe('Deny');
    expect(result.resolution_trace?.[0]?.step).toBe('local_lookup');
  });
});
