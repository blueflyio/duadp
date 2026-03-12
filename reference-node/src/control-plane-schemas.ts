import { z } from 'zod';

export const AgentId = z.string().uuid();

export const OssAManifestJson = z.record(z.string(), z.any());

export const AgentCreateRequest = z.object({
  ossa_manifest: OssAManifestJson,
});

export const RunCreateRequest = z.object({
  kind: z.enum(['agent_task', 'workflow']),
  input: z.record(z.string(), z.any()),
  workspace_id: z.string().uuid().optional(),
});

// Normalized tool result envelope
export const NormalizedResultEnvelope = z.object({
  tool_name: z.string(),
  ok: z.boolean(),
  result: z.unknown(),
  cache: z
    .object({
      tags: z.array(z.string()).default([]),
      contexts: z.array(z.string()).default([]),
      max_age: z.number().int().nonnegative().default(0),
    })
    .default({ tags: [], contexts: [], max_age: 0 }),
  audit: z.object({
    source: z.enum(['platform_api', 'mcp', 'cli']),
    started_at: z.string().datetime(),
    finished_at: z.string().datetime(),
  }),
});

// Exports for schemas
export type AgentCreateRequest = z.infer<typeof AgentCreateRequest>;
export type RunCreateRequest = z.infer<typeof RunCreateRequest>;
export type NormalizedResultEnvelope = z.infer<typeof NormalizedResultEnvelope>;
