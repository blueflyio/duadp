/**
 * USIE Adapter barrel export
 * All public adapter + engine exports from sdk/typescript/src/adapters/
 */

export type {
  SkillBundle,
  UpstreamMetadata,
  McpServerConfig,
  GitRepoAdapterConfig,
  RegistryAdapter,
} from './registry-adapter.js';

export {
  VERIFIED_VENDORS,
  buildSkillGaid,
  inferTrustTier,
  nowIso,
} from './registry-adapter.js';

export { KiroPowersAdapter } from './kiro-powers-adapter.js';
export type {} from './kiro-powers-adapter.js';

export { SkillsShAdapter } from './skills-sh-adapter.js';
export type { SkillsShAdapterOptions } from './skills-sh-adapter.js';

export { GitRepoAdapter } from './git-repo-adapter.js';

export { SyncEngine } from './sync-engine.js';
export type { SyncEngineOptions, SyncResult, SyncReport } from './sync-engine.js';
