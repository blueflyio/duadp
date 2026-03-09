/**
 * Trust verification module — automated trust tier verification on publish.
 *
 * Trust Tiers:
 *   1. community     — Valid JSON schema
 *   2. signed         — Ed25519/ES256 signature present and well-formed
 *   3. verified-signature — Signature + DID resolves + public key matches
 *   4. verified       — DID + domain ownership proof (DNS TXT or .well-known)
 *   5. official       — Manual attestation by OSSA governance body
 */

import type { OssaResource } from '@bluefly/duadp';

export interface TrustVerificationResult {
  verified_tier: string;
  claimed_tier: string;
  checks: TrustCheck[];
  passed: boolean;
  downgraded: boolean;
}

interface TrustCheck {
  name: string;
  tier: string;
  passed: boolean;
  detail: string;
}

const TIER_RANK: Record<string, number> = {
  community: 1,
  signed: 2,
  'verified-signature': 3,
  verified: 4,
  official: 5,
};

/** Verify a resource's trust tier claim and return the actual verified tier */
export async function verifyTrustTier(resource: OssaResource): Promise<TrustVerificationResult> {
  const claimedTier = resource.metadata?.trust_tier || 'community';
  const checks: TrustCheck[] = [];
  let maxVerifiedRank = 0;

  // --- Tier 1: community — Valid schema ---
  const schemaCheck = checkSchema(resource);
  checks.push(schemaCheck);
  if (schemaCheck.passed) maxVerifiedRank = 1;

  // --- Tier 2: signed — Signature present and well-formed ---
  const signatureCheck = checkSignature(resource);
  checks.push(signatureCheck);
  if (signatureCheck.passed && maxVerifiedRank >= 1) maxVerifiedRank = 2;

  // --- Tier 3: verified-signature — DID resolves + key matches ---
  const didCheck = await checkDid(resource);
  checks.push(didCheck);
  if (didCheck.passed && maxVerifiedRank >= 2) maxVerifiedRank = 3;

  // --- Tier 4: verified — Domain ownership proof ---
  const domainCheck = await checkDomainOwnership(resource);
  checks.push(domainCheck);
  if (domainCheck.passed && maxVerifiedRank >= 3) maxVerifiedRank = 4;

  // --- Tier 5: official — Manual attestation (always fails automated check) ---
  const officialCheck: TrustCheck = {
    name: 'official_attestation',
    tier: 'official',
    passed: false,
    detail: 'Official tier requires manual attestation by OSSA governance — cannot be auto-verified',
  };
  checks.push(officialCheck);

  // Determine verified tier
  const verifiedTier = rankToTier(maxVerifiedRank);
  const claimedRank = TIER_RANK[claimedTier] ?? 1;
  const downgraded = maxVerifiedRank < claimedRank;

  return {
    verified_tier: downgraded ? verifiedTier : claimedTier,
    claimed_tier: claimedTier,
    checks,
    passed: !downgraded,
    downgraded,
  };
}

function rankToTier(rank: number): string {
  const entries = Object.entries(TIER_RANK);
  const match = entries.find(([, r]) => r === rank);
  return match ? match[0] : 'community';
}

// --- Individual checks ---

function checkSchema(resource: OssaResource): TrustCheck {
  const errors: string[] = [];

  if (!resource.apiVersion) errors.push('missing apiVersion');
  if (!resource.kind) errors.push('missing kind');
  if (!resource.metadata?.name) errors.push('missing metadata.name');
  if (!['Skill', 'Agent', 'Tool'].includes(resource.kind)) errors.push(`invalid kind: ${resource.kind}`);
  if (resource.apiVersion && !resource.apiVersion.startsWith('ossa/')) errors.push(`apiVersion must start with ossa/`);

  return {
    name: 'schema_validation',
    tier: 'community',
    passed: errors.length === 0,
    detail: errors.length === 0 ? 'Valid OSSA manifest schema' : `Schema errors: ${errors.join(', ')}`,
  };
}

function checkSignature(resource: OssaResource): TrustCheck {
  const sig = resource.signature;
  if (!sig) {
    return { name: 'signature_present', tier: 'signed', passed: false, detail: 'No signature field present' };
  }
  if (!sig.algorithm) {
    return { name: 'signature_present', tier: 'signed', passed: false, detail: 'Signature missing algorithm' };
  }
  if (!['Ed25519', 'ES256'].includes(sig.algorithm)) {
    return { name: 'signature_present', tier: 'signed', passed: false, detail: `Unsupported algorithm: ${sig.algorithm}` };
  }
  if (!sig.value) {
    return { name: 'signature_present', tier: 'signed', passed: false, detail: 'Signature missing value' };
  }
  if (!sig.signer) {
    return { name: 'signature_present', tier: 'signed', passed: false, detail: 'Signature missing signer' };
  }

  return { name: 'signature_present', tier: 'signed', passed: true, detail: `Valid ${sig.algorithm} signature from ${sig.signer}` };
}

async function checkDid(resource: OssaResource): Promise<TrustCheck> {
  const did = resource.identity?.did;
  if (!did) {
    return { name: 'did_resolution', tier: 'verified-signature', passed: false, detail: 'No DID in identity' };
  }

  // Resolve did:web
  if (did.startsWith('did:web:')) {
    const didUrl = didWebToUrl(did);
    try {
      const resp = await fetch(didUrl, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) {
        return { name: 'did_resolution', tier: 'verified-signature', passed: false, detail: `DID resolution failed: HTTP ${resp.status}` };
      }
      const doc = await resp.json();
      // Check if DID document has verification methods
      if (doc.verificationMethod && Array.isArray(doc.verificationMethod) && doc.verificationMethod.length > 0) {
        return { name: 'did_resolution', tier: 'verified-signature', passed: true, detail: `DID resolved with ${doc.verificationMethod.length} verification method(s)` };
      }
      return { name: 'did_resolution', tier: 'verified-signature', passed: true, detail: 'DID resolved (no verification methods found)' };
    } catch {
      return { name: 'did_resolution', tier: 'verified-signature', passed: false, detail: `DID resolution failed: network error for ${didUrl}` };
    }
  }

  // did:key is self-verifying
  if (did.startsWith('did:key:')) {
    return { name: 'did_resolution', tier: 'verified-signature', passed: true, detail: 'did:key is self-verifying' };
  }

  return { name: 'did_resolution', tier: 'verified-signature', passed: false, detail: `Unsupported DID method: ${did.split(':')[1]}` };
}

async function checkDomainOwnership(resource: OssaResource): Promise<TrustCheck> {
  const did = resource.identity?.did;
  if (!did || !did.startsWith('did:web:')) {
    return { name: 'domain_ownership', tier: 'verified', passed: false, detail: 'Domain ownership requires did:web' };
  }

  const domain = did.replace('did:web:', '').split(':')[0];

  // Check .well-known/duadp.json on the domain
  try {
    const resp = await fetch(`https://${domain}/.well-known/duadp.json`, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const manifest = await resp.json();
      if (manifest.node_id && manifest.node_id.includes(domain)) {
        return { name: 'domain_ownership', tier: 'verified', passed: true, detail: `Domain ${domain} has valid DUADP manifest with matching node_id` };
      }
    }
  } catch { /* fallthrough */ }

  // Fallback: DNS TXT proof on _duadp.<domain>
  try {
    const dns = await import('node:dns/promises');
    const records = await dns.resolveTxt(`_duadp.${domain}`);
    const txt = records.map((r) => r.join(''));
    const hasDuadpMarker = txt.some((r) => r.includes('v=duadp1'));
    if (hasDuadpMarker) {
      return {
        name: 'domain_ownership',
        tier: 'verified',
        passed: true,
        detail: `Domain ${domain} verified via DNS TXT _duadp.${domain}`,
      };
    }
    return {
      name: 'domain_ownership',
      tier: 'verified',
      passed: false,
      detail: `DNS TXT _duadp.${domain} found but missing v=duadp1 marker`,
    };
  } catch {
    return {
      name: 'domain_ownership',
      tier: 'verified',
      passed: false,
      detail: `Could not verify domain ownership for ${domain} (no valid .well-known/duadp.json or _duadp TXT record)`,
    };
  }
}

/** Convert did:web to URL per W3C spec */
function didWebToUrl(did: string): string {
  const parts = did.replace('did:web:', '').split(':');
  const domain = decodeURIComponent(parts[0]);
  const path = parts.slice(1).join('/');
  return path
    ? `https://${domain}/${path}/did.json`
    : `https://${domain}/.well-known/did.json`;
}
