export { UadpClient, UadpError, resolveGaid, type UadpClientOptions } from './client.js';
export { createUadpRouter, type UadpDataProvider, type UadpNodeConfig } from './server.js';
export * from './types.js';
export { isUadpManifest, validateManifest, validateResponse } from './validate.js';
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
