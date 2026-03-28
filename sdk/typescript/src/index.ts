export { DuadpClient, DuadpError, resolveGaid, verifyDuadpDns, verifyAgentDns, CircuitBreaker, deduplicateResources, type DuadpClientOptions } from './client.js';
export { createDuadpRouter, type DuadpDataProvider, type DuadpNodeConfig } from './server.js';
export * from './types.js';
export { isDuadpManifest, validateManifest, validateResponse } from './validate.js';
export {
  canonicalize, contentHash,
  signResource, verifySignature,
  generateKeyPair, exportPublicKey, importPublicKey,
  toMultibase, fromMultibase,
  generateDidKeyIdentity, signWithDidKey,
} from './crypto.js';
export {
  resolveDID, buildDidWeb, didWebToUrl, verifyResourceIdentity,
  type DIDDocument, type VerificationMethod, type ServiceEndpoint, type DIDResolutionResult,
} from './did.js';
export {
  runConformanceTests, formatConformanceResults,
  type ConformanceResult, type ConformanceTestResult,
} from './conformance.js';

// ── USIE — Universal Skills Ingestion Engine ─────────────────────────────────
export {
  KiroPowersAdapter,
  SkillsShAdapter,
  GitRepoAdapter,
  SyncEngine,
  VERIFIED_VENDORS,
  buildSkillGaid,
  inferTrustTier,
  type RegistryAdapter,
  type SkillBundle,
  type UpstreamMetadata,
  type McpServerConfig,
  type GitRepoAdapterConfig,
  type SkillsShAdapterOptions,
  type SyncEngineOptions,
  type SyncResult,
  type SyncReport,
} from './adapters/index.js';
