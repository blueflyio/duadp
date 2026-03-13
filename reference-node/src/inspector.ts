import type { OssaResource } from '@bluefly/duadp';
import type { PublishAuthorizationResult } from './publish-authorization.js';
import { authorizePublish } from './publish-authorization.js';
import type { RevocationRecord } from './revocation.js';
import type { SignatureVerificationResult } from './signature-verifier.js';
import { verifyPublisherSignature } from './signature-verifier.js';
import type { TrustVerificationResult } from './trust.js';
import { verifyTrustTier } from './trust.js';

export interface InspectorDidState {
  value?: string;
  method?: string;
  resolved: boolean;
  self_verifying: boolean;
  document_url?: string;
  document?: Record<string, unknown>;
  verification_method_count: number;
  error?: string;
}

export interface InspectorResponse {
  gaid: string;
  resolved: boolean;
  resolved_via: 'local' | 'peer';
  source_node: string;
  source_url?: string;
  resource_kind: string;
  resource_name: string;
  resource_url?: string;
  resource: OssaResource | Record<string, unknown>;
  did: InspectorDidState;
  trust_verification: TrustVerificationResult;
  signature_verification: SignatureVerificationResult;
  revocation: {
    revoked: boolean;
    record: RevocationRecord | null;
  };
  provenance: {
    publisher?: Record<string, unknown>;
    license?: string;
    source_url?: string;
    links: Array<{ rel: string; href: string; label?: string }>;
  };
  policy: {
    anonymous_publish: PublishAuthorizationResult;
    claimed_publisher_publish: PublishAuthorizationResult;
  };
}

interface InspectorDeps {
  fetchFn?: typeof fetch;
  verifyTrustTierFn?: typeof verifyTrustTier;
  verifySignatureFn?: typeof verifyPublisherSignature;
  authorizePublishFn?: typeof authorizePublish;
}

interface InspectorOptions extends InspectorDeps {
  gaid: string;
  resource: OssaResource | Record<string, unknown>;
  sourceNode: string;
  resolvedVia: 'local' | 'peer';
  baseUrl?: string;
  revocationRecord?: RevocationRecord | null;
}

export async function buildInspectorResponse(options: InspectorOptions): Promise<InspectorResponse> {
  const fetchFn = options.fetchFn ?? fetch;
  const verifyTrustTierFn = options.verifyTrustTierFn ?? verifyTrustTier;
  const verifySignatureFn = options.verifySignatureFn ?? verifyPublisherSignature;
  const authorizePublishFn = options.authorizePublishFn ?? authorizePublish;
  const resource = options.resource;
  const metadata = (resource as Record<string, any>).metadata ?? {};
  const identity = (resource as Record<string, any>).identity ?? {};
  const signature = (resource as Record<string, any>).signature ?? {};
  const resourceName = metadata.name || 'unknown';
  const resourceKind = (resource as Record<string, any>).kind || 'Unknown';
  const gaid = options.gaid || identity.gaid || `agent://${resourceName}`;

  const [didState, trustVerification, signatureVerification, anonymousPublish] = await Promise.all([
    resolveDidState(identity.did, fetchFn),
    verifyTrustTierFn(resource as OssaResource),
    verifySignatureFn(resource as Record<string, unknown>),
    authorizePublishFn(resource, 'anonymous'),
  ]);

  const claimedPublisherId = identity.did || signature.signer || gaid;
  const claimedPublisherPublish = await authorizePublishFn(resource, claimedPublisherId);
  const provenance = extractProvenance(resource, options.baseUrl);
  const resourcePath = resourceKindToPath(resourceKind, resourceName);

  return {
    gaid,
    resolved: true,
    resolved_via: options.resolvedVia,
    source_node: options.sourceNode,
    source_url: options.baseUrl,
    resource_kind: resourceKind,
    resource_name: resourceName,
    resource_url: resourcePath && options.baseUrl ? `${options.baseUrl}${resourcePath}` : resourcePath || undefined,
    resource,
    did: didState,
    trust_verification: trustVerification,
    signature_verification: signatureVerification,
    revocation: {
      revoked: Boolean(options.revocationRecord),
      record: options.revocationRecord ?? null,
    },
    provenance,
    policy: {
      anonymous_publish: anonymousPublish,
      claimed_publisher_publish: claimedPublisherPublish,
    },
  };
}

function extractProvenance(
  resource: OssaResource | Record<string, unknown>,
  baseUrl?: string,
): InspectorResponse['provenance'] {
  const typed = resource as Record<string, any>;
  const provenance = typed.provenance ?? {};
  const identity = typed.identity ?? {};
  const links: Array<{ rel: string; href: string; label?: string }> = [];

  if (identity.gaid) {
    links.push({ rel: 'gaid', href: identity.gaid, label: 'Global Agent ID' });
  }
  if (identity.did) {
    links.push({ rel: 'did', href: identity.did, label: 'Decentralized Identifier' });
  }
  if (provenance.publisher?.url) {
    links.push({ rel: 'publisher', href: provenance.publisher.url, label: provenance.publisher.name || 'Publisher' });
  }
  if (provenance.source_url) {
    links.push({ rel: 'source', href: provenance.source_url, label: 'Source repository' });
  }
  if (identity.operational?.endpoint) {
    links.push({ rel: 'endpoint', href: identity.operational.endpoint, label: 'Operational endpoint' });
  }
  if (identity.operational?.mcp) {
    links.push({ rel: 'mcp', href: identity.operational.mcp, label: 'MCP endpoint' });
  }
  if (baseUrl) {
    const resourcePath = resourceKindToPath(typed.kind, typed.metadata?.name);
    if (resourcePath) {
      links.push({ rel: 'resource', href: `${baseUrl}${resourcePath}`, label: 'Resource JSON' });
    }
  }

  return {
    publisher: provenance.publisher,
    license: provenance.license,
    source_url: provenance.source_url,
    links,
  };
}

async function resolveDidState(did: string | undefined, fetchFn: typeof fetch): Promise<InspectorDidState> {
  if (!did) {
    return {
      resolved: false,
      self_verifying: false,
      verification_method_count: 0,
      error: 'No DID present on the resource identity',
    };
  }

  if (did.startsWith('did:key:')) {
    return {
      value: did,
      method: 'key',
      resolved: true,
      self_verifying: true,
      verification_method_count: 1,
    };
  }

  if (did.startsWith('did:web:')) {
    const documentUrl = didWebToUrl(did);
    try {
      const response = await fetchFn(documentUrl, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        return {
          value: did,
          method: 'web',
          resolved: false,
          self_verifying: false,
          document_url: documentUrl,
          verification_method_count: 0,
          error: `DID resolution failed with HTTP ${response.status}`,
        };
      }

      const document = (await response.json()) as Record<string, unknown>;
      const verificationMethods = Array.isArray(document.verificationMethod)
        ? document.verificationMethod.length
        : 0;

      return {
        value: did,
        method: 'web',
        resolved: true,
        self_verifying: false,
        document_url: documentUrl,
        document,
        verification_method_count: verificationMethods,
      };
    } catch (error) {
      return {
        value: did,
        method: 'web',
        resolved: false,
        self_verifying: false,
        document_url: documentUrl,
        verification_method_count: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    value: did,
    method: did.split(':')[1],
    resolved: false,
    self_verifying: false,
    verification_method_count: 0,
    error: `Unsupported DID method: ${did.split(':')[1]}`,
  };
}

function didWebToUrl(did: string): string {
  const parts = did.replace('did:web:', '').split(':');
  const domain = decodeURIComponent(parts[0]);
  const path = parts.slice(1).join('/');
  return path
    ? `https://${domain}/${path}/did.json`
    : `https://${domain}/.well-known/did.json`;
}

function resourceKindToPath(kind: string | undefined, name: string | undefined): string | null {
  if (!kind || !name) return null;

  if (kind === 'Skill') return `/api/v1/skills/${encodeURIComponent(name)}`;
  if (kind === 'Agent') return `/api/v1/agents/${encodeURIComponent(name)}`;
  if (kind === 'Tool') return `/api/v1/tools/${encodeURIComponent(name)}`;
  return null;
}
