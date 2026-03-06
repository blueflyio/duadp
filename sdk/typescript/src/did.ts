/**
 * DID resolution for UADP identity verification.
 *
 * Supports:
 * - did:web — resolves via HTTPS to /.well-known/did.json or /path/did.json
 * - did:key — self-contained key material (Ed25519 only)
 */

export interface DIDDocument {
  '@context': string | string[];
  id: string;
  controller?: string | string[];
  verificationMethod?: VerificationMethod[];
  authentication?: (string | VerificationMethod)[];
  assertionMethod?: (string | VerificationMethod)[];
  keyAgreement?: (string | VerificationMethod)[];
  service?: ServiceEndpoint[];
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: Record<string, string>;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string | string[] | Record<string, string>;
}

export interface DIDResolutionResult {
  document: DIDDocument;
  publicKeys: Array<{
    id: string;
    type: string;
    publicKeyMultibase?: string;
    purpose: string[];
  }>;
  uadpEndpoint?: string;
}

/**
 * Resolve a DID to its DID Document and extract verification keys.
 *
 * @param did - The DID to resolve (e.g., "did:web:acme.com:agents:my-agent")
 * @param fetchFn - Optional custom fetch implementation
 * @returns The resolved DID document with extracted public keys
 */
export async function resolveDID(
  did: string,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<DIDResolutionResult> {
  const [, method] = did.split(':');

  switch (method) {
    case 'web':
      return resolveDidWeb(did, fetchFn);
    case 'key':
      return resolveDidKey(did);
    default:
      throw new Error(`Unsupported DID method: ${method}. Supported: did:web, did:key`);
  }
}

/**
 * Resolve did:web by fetching the DID document over HTTPS.
 *
 * did:web:example.com → https://example.com/.well-known/did.json
 * did:web:example.com:path:to:doc → https://example.com/path/to/doc/did.json
 */
async function resolveDidWeb(
  did: string,
  fetchFn: typeof fetch,
): Promise<DIDResolutionResult> {
  const parts = did.split(':').slice(2); // Remove "did:web:"
  if (parts.length === 0) throw new Error(`Invalid did:web: ${did}`);

  const domain = decodeURIComponent(parts[0]);
  const path = parts.slice(1).map(decodeURIComponent);

  let url: string;
  if (path.length === 0) {
    url = `https://${domain}/.well-known/did.json`;
  } else {
    url = `https://${domain}/${path.join('/')}/did.json`;
  }

  const res = await fetchFn(url, {
    headers: { 'Accept': 'application/did+json, application/json' },
  });

  if (!res.ok) {
    throw new Error(`Failed to resolve ${did}: HTTP ${res.status} from ${url}`);
  }

  const document = await res.json() as DIDDocument;
  return extractKeys(document);
}

/**
 * Resolve did:key — self-contained, no network request needed.
 * Only Ed25519 (z6Mk prefix in multibase) is supported.
 */
function resolveDidKey(did: string): DIDResolutionResult {
  const parts = did.split(':');
  if (parts.length !== 3) throw new Error(`Invalid did:key: ${did}`);
  const multibase = parts[2];

  const verificationMethod: VerificationMethod = {
    id: `${did}#${multibase}`,
    type: 'Ed25519VerificationKey2020',
    controller: did,
    publicKeyMultibase: multibase,
  };

  const document: DIDDocument = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: did,
    verificationMethod: [verificationMethod],
    authentication: [`${did}#${multibase}`],
    assertionMethod: [`${did}#${multibase}`],
  };

  return extractKeys(document);
}

function extractKeys(document: DIDDocument): DIDResolutionResult {
  const publicKeys: DIDResolutionResult['publicKeys'] = [];

  const authIds = new Set(
    (document.authentication ?? []).map(a => typeof a === 'string' ? a : a.id)
  );
  const assertIds = new Set(
    (document.assertionMethod ?? []).map(a => typeof a === 'string' ? a : a.id)
  );

  for (const vm of document.verificationMethod ?? []) {
    const purpose: string[] = [];
    if (authIds.has(vm.id)) purpose.push('authentication');
    if (assertIds.has(vm.id)) purpose.push('assertionMethod');
    if (purpose.length === 0) purpose.push('verification');

    publicKeys.push({
      id: vm.id,
      type: vm.type,
      publicKeyMultibase: vm.publicKeyMultibase,
      purpose,
    });
  }

  // Also extract inline verification methods from auth/assertion arrays
  for (const arr of [document.authentication, document.assertionMethod]) {
    if (!arr) continue;
    for (const item of arr) {
      if (typeof item !== 'string' && !publicKeys.find(k => k.id === item.id)) {
        publicKeys.push({
          id: item.id,
          type: item.type,
          publicKeyMultibase: item.publicKeyMultibase,
          purpose: ['verification'],
        });
      }
    }
  }

  // Find UADP service endpoint
  let uadpEndpoint: string | undefined;
  for (const svc of document.service ?? []) {
    if (svc.type === 'UadpNode' || svc.type === 'UadpResource') {
      uadpEndpoint = typeof svc.serviceEndpoint === 'string'
        ? svc.serviceEndpoint
        : undefined;
      break;
    }
  }

  return { document, publicKeys, uadpEndpoint };
}

/**
 * Build a did:web DID from a domain and optional path segments.
 *
 * @example
 * buildDidWeb('acme.com') // → "did:web:acme.com"
 * buildDidWeb('acme.com', 'agents', 'security-auditor') // → "did:web:acme.com:agents:security-auditor"
 */
export function buildDidWeb(domain: string, ...path: string[]): string {
  const encoded = [encodeURIComponent(domain), ...path.map(encodeURIComponent)];
  return `did:web:${encoded.join(':')}`;
}

/**
 * Extract the HTTPS URL where a did:web document should be hosted.
 */
export function didWebToUrl(did: string): string {
  const parts = did.split(':').slice(2);
  const domain = decodeURIComponent(parts[0]);
  const path = parts.slice(1).map(decodeURIComponent);
  if (path.length === 0) {
    return `https://${domain}/.well-known/did.json`;
  }
  return `https://${domain}/${path.join('/')}/did.json`;
}

/**
 * Full identity verification chain for a UADP resource.
 *
 * 1. Extract DID from resource identity
 * 2. Resolve DID document
 * 3. Extract public key
 * 4. Verify signature
 * 5. Check lifecycle status
 *
 * @returns Verification result with trust level
 */
export async function verifyResourceIdentity(
  resource: import('./types.js').OssaResource,
  options?: {
    fetchFn?: typeof fetch;
    skipSignature?: boolean;
    skipLifecycle?: boolean;
  },
): Promise<{
  verified: boolean;
  checks: Array<{ check: string; passed: boolean; detail?: string }>;
  trustLevel: 'full' | 'partial' | 'none';
}> {
  const checks: Array<{ check: string; passed: boolean; detail?: string }> = [];
  const fetchFn = options?.fetchFn ?? globalThis.fetch.bind(globalThis);

  // Check 1: Resource has identity
  if (!resource.identity) {
    checks.push({ check: 'identity_present', passed: false, detail: 'No identity object on resource' });
    return { verified: false, checks, trustLevel: 'none' };
  }
  checks.push({ check: 'identity_present', passed: true });

  // Check 2: DID is present
  if (!resource.identity.did) {
    checks.push({ check: 'did_present', passed: false, detail: 'No DID in identity' });
    return { verified: false, checks, trustLevel: 'none' };
  }
  checks.push({ check: 'did_present', passed: true, detail: resource.identity.did });

  // Check 3: Resolve DID document
  let resolution: DIDResolutionResult;
  try {
    resolution = await resolveDID(resource.identity.did, fetchFn);
    checks.push({ check: 'did_resolution', passed: true, detail: `Resolved ${resolution.publicKeys.length} keys` });
  } catch (err) {
    checks.push({ check: 'did_resolution', passed: false, detail: String(err) });
    return { verified: false, checks, trustLevel: 'none' };
  }

  // Check 4: Verify signature (if present and not skipped)
  if (!options?.skipSignature && resource.signature) {
    if (resolution.publicKeys.length > 0 && resolution.publicKeys[0].publicKeyMultibase) {
      try {
        const { fromMultibase, importPublicKey, verifySignature } = await import('./crypto.js');
        const rawKey = fromMultibase(resolution.publicKeys[0].publicKeyMultibase);
        const pubKey = await importPublicKey(rawKey);
        const valid = await verifySignature(resource, pubKey);
        checks.push({ check: 'signature_valid', passed: valid, detail: valid ? 'Ed25519 signature verified' : 'Signature verification failed' });
      } catch (err) {
        checks.push({ check: 'signature_valid', passed: false, detail: String(err) });
      }
    } else {
      checks.push({ check: 'signature_valid', passed: false, detail: 'No public key in DID document for verification' });
    }
  } else if (!resource.signature) {
    checks.push({ check: 'signature_valid', passed: false, detail: 'Resource has no signature' });
  }

  // Check 5: Lifecycle status
  if (!options?.skipLifecycle && resource.identity.lifecycle) {
    const status = resource.identity.lifecycle.status;
    const active = status === 'active';
    checks.push({
      check: 'lifecycle_active',
      passed: active,
      detail: active ? 'Resource is active' : `Resource status: ${status}`,
    });

    if (resource.identity.lifecycle.expires) {
      const expires = new Date(resource.identity.lifecycle.expires);
      const notExpired = expires > new Date();
      checks.push({
        check: 'not_expired',
        passed: notExpired,
        detail: notExpired ? `Expires: ${resource.identity.lifecycle.expires}` : 'Resource has expired',
      });
    }
  }

  const passCount = checks.filter(c => c.passed).length;
  const totalCount = checks.length;
  let trustLevel: 'full' | 'partial' | 'none';
  if (passCount === totalCount) trustLevel = 'full';
  else if (passCount > totalCount / 2) trustLevel = 'partial';
  else trustLevel = 'none';

  return { verified: passCount === totalCount, checks, trustLevel };
}
