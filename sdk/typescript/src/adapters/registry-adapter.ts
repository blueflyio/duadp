/**
 * USIE — Universal Skills Ingestion Engine
 * Core adapter interface for normalizing upstream skill registries into DUADP.
 *
 * Each upstream registry (Kiro powers, skills.sh, custom Git repos, etc.)
 * implements RegistryAdapter. The SyncEngine accepts any array of adapters
 * and runs them against any DUADP node.
 */

import type { OssaSkill, TrustTier } from '../types.js';

// ── Vendor allowlist for auto-assigning verified-signature trust tier ─────────

export const VERIFIED_VENDORS: ReadonlySet<string> = new Set([
  'Datadog', 'AWS', 'Amazon', 'Stripe', 'GitHub', 'Microsoft', 'Azure',
  'Google', 'HashiCorp', 'Terraform', 'Figma', 'Postman', 'Twilio', 'Neon',
  'Dynatrace', 'Vercel',
]);

/**
 * The raw content fetched from an upstream skill directory.
 * Adapters parse upstream formats into this normalized bundle
 * before normalization into OssaSkill.
 */
export interface SkillBundle {
  /** Primary markdown content (SKILL.md body / POWER.md body) */
  instruction_content: string;

  /** Additional behavioral guidance files (steering/*.md, references/*.md) */
  steering_content?: string[];

  /** Executable scripts keyed by filename (scripts/ directory) */
  scripts?: Record<string, string>;

  /** MCP server configurations from mcp.json (Kiro powers) */
  mcp_servers?: Record<string, McpServerConfig>;

  /** Original frontmatter fields, verbatim */
  raw_metadata: UpstreamMetadata;

  /** Git commit SHA this bundle was fetched at */
  source_commit?: string;
}

/** Parsed frontmatter metadata from any upstream skill format */
export interface UpstreamMetadata {
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  author?: string;
  keywords?: string[];
  tags?: string[];
  requires?: string[];
  category?: string;
  [key: string]: unknown;
}

/** MCP server configuration (from mcp.json .mcpServers entries) */
export interface McpServerConfig {
  type?: 'http' | 'stdio' | 'sse';
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  [key: string]: unknown;
}

/** Config for the generic GitRepoAdapter (YAML-driven, no code changes needed) */
export interface GitRepoAdapterConfig {
  /** Unique identifier for this adapter instance */
  id: string;
  /** Human-readable name */
  label: string;
  /** Git repo HTTPS URL */
  repo_url: string;
  /** Branch to read from (default: 'main') */
  branch?: string;
  /**
   * Glob(s) matching the manifest file inside each skill directory.
   * Adapter picks up the first match per directory.
   * Default: ['SKILL.md', 'POWER.md']
   */
  manifest_glob?: string[];
  /** Default trust tier for resources from this repo */
  trust_tier?: TrustTier;
  /** Optional GitHub API token for private repos */
  github_token?: string;
}

/**
 * The core pluggable contract all registry adapters must implement.
 *
 * S — Adapter-specific config type (e.g. GitRepoAdapterConfig)
 */
export interface RegistryAdapter<S = unknown> {
  /** Stable lowercase-hyphen identifier (e.g. 'kiro-powers', 'skills-sh') */
  readonly id: string;

  /** Human-readable name */
  readonly label: string;

  /** Canonical upstream URL */
  readonly source_url: string;

  /** Default trust tier for resources from this adapter */
  readonly trust_tier_default: TrustTier;

  /** Adapter-specific config */
  readonly config: S;

  /**
   * Fetch all skill bundles from the upstream registry.
   * Must be idempotent and safe to call repeatedly.
   */
  fetch(): Promise<SkillBundle[]>;

  /**
   * Convert a single SkillBundle into a DUADP-compliant OssaSkill.
   * Must produce a valid object per duadp-skills-response.schema.json.
   */
  normalize(bundle: SkillBundle): OssaSkill;
}

// ── Shared helper: GAID construction ─────────────────────────────────────────

/**
 * Build a canonical Global Agent Identifier for an ingested skill.
 * Pattern: agent://skills.openstandardagents.org/<adapter-id>/<skill-name>
 */
export function buildSkillGaid(adapterId: string, skillName: string): string {
  const safeName = skillName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `agent://skills.openstandardagents.org/${adapterId}/${safeName}`;
}

/**
 * Infer trust tier: verified-signature if author is a known vendor, else community.
 * Falls back to the adapter's default.
 */
export function inferTrustTier(
  author: string | undefined,
  defaultTier: TrustTier,
): TrustTier {
  if (!author) return defaultTier;
  const isVerifiedVendor = [...VERIFIED_VENDORS].some(
    (v) => author.toLowerCase().includes(v.toLowerCase()),
  );
  return isVerifiedVendor ? 'verified-signature' : defaultTier;
}

/** ISO-8601 timestamp for now */
export function nowIso(): string {
  return new Date().toISOString();
}
