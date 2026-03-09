export { DuadpClient, DuadpError, resolveGaid, verifyDuadpDns, verifyAgentDns, CircuitBreaker, deduplicateResources, type DuadpClientOptions } from './client.js';
export { createDuadpRouter, type DuadpDataProvider, type DuadpNodeConfig } from './server.js';
export * from './types.js';
export { isDuadpManifest, validateManifest, validateResponse } from './validate.js';
export {
  canonicalize, contentHash,
  signResource, verifySignature,
  generateKeyPair, exportPublicKey, importPublicKey,
  toMultibase, fromMultibase,
} from './crypto.js';
export {
  resolveDID, buildDidWeb, didWebToUrl, verifyResourceIdentity,
  type DIDDocument, type VerificationMethod, type ServiceEndpoint, type DIDResolutionResult,
} from './did.js';
export {
  runConformanceTests, formatConformanceResults,
  type ConformanceResult, type ConformanceTestResult,
} from './conformance.js';
