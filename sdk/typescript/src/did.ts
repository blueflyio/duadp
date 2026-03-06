/**
 * DID resolution for UADP identity verification.
 *
 * Uses DIF (Decentralized Identity Foundation) standard libraries:
 * - did-resolver — core resolution framework
 * - web-did-resolver — did:web method
 * - key-did-resolver — did:key method (Ed25519, secp256k1, etc.)
 */

import { Resolver } from 'did-resolver';
import type {
  DIDDocument as DIFDIDDocument,
  VerificationMethod as DIFVerificationMethod,
  Service as DIFService,
} from 'did-resolver';
import { getResolver as getWebResolver } from 'web-did-resolver';
import { getResolver as getKeyResolver } from 'key-did-resolver';

// Re-export types compatible with our SDK's API surface
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

// Singleton resolver instance — supports did:web and did:key out of the box
const resolver = new Resolver({
  ...getWebResolver(),
  ...getKeyResolver(),
});

/**
 * Resolve a DID to its DID Document and extract verification keys.
 * Delegates to DIF's did-resolver with web + key method support.
 *
 * @param did - The DID to resolve (e.g., "did:web:acme.com:agents:my-agent")
 * @param _fetchFn - Deprecated, kept for API compatibility. web-did-resolver uses cross-fetch internally.
 * @returns The resolved DID document with extracted public keys
 */
export async function resolveDID(
  did: string,
  _fetchFn?: typeof fetch,
): Promise<DIDResolutionResult> {
  const result = await resolver.resolve(did);

  if (result.didResolutionMetadata.error) {
    throw new Error(`DID resolution failed for ${did}: ${result.didResolutionMetadata.error}`);
  }

  if (!result.didDocument) {
    throw new Error(`No DID document returned for ${did}`);
  }

  const document = convertDocument(result.didDocument);
  return extractKeys(document);
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
 * 2. Resolve DID document (via DIF resolver)
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
    resolveDID?: typeof resolveDID;
  },
): Promise<{
  verified: boolean;
  checks: Array<{ check: string; passed: boolean; detail?: string }>;
  trustLevel: 'full' | 'partial' | 'none';
}> {
  const checks: Array<{ check: string; passed: boolean; detail?: string }> = [];

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

  // Check 3: Resolve DID document via DIF resolver
  let resolution: DIDResolutionResult;
  try {
    const resolver = options?.resolveDID ?? resolveDID;
    resolution = await resolver(resource.identity.did);
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

// --- Internal helpers ---

/**
 * Convert DIF's DIDDocument type to our SDK's DIDDocument interface.
 */
function convertDocument(doc: DIFDIDDocument): DIDDocument {
  return {
    '@context': doc['@context'] as string | string[],
    id: doc.id,
    controller: doc.controller as string | string[] | undefined,
    verificationMethod: doc.verificationMethod?.map(convertVM),
    authentication: doc.authentication?.map(convertVMRef),
    assertionMethod: doc.assertionMethod?.map(convertVMRef),
    keyAgreement: doc.keyAgreement?.map(convertVMRef),
    service: doc.service?.map(convertService),
  };
}

function convertVM(vm: DIFVerificationMethod): VerificationMethod {
  return {
    id: vm.id,
    type: vm.type,
    controller: vm.controller,
    publicKeyMultibase: vm.publicKeyMultibase,
    publicKeyJwk: vm.publicKeyJwk as Record<string, string> | undefined,
  };
}

function convertVMRef(ref: string | DIFVerificationMethod): string | VerificationMethod {
  if (typeof ref === 'string') return ref;
  return convertVM(ref);
}

function convertService(svc: DIFService): ServiceEndpoint {
  return {
    id: svc.id,
    type: svc.type,
    serviceEndpoint: svc.serviceEndpoint as string | string[] | Record<string, string>,
  };
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
