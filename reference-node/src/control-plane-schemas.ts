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

export const GitLabSecurityAttributesSchema = z
  .object({
    business_impact: z.string().optional(),
    application: z.string().optional(),
    business_unit: z.string().optional(),
    internet_exposure: z.string().optional(),
    location: z.string().optional(),
  })
  .catchall(z.union([z.string(), z.array(z.string())]));

export const GitLabRequestContextSchema = z.object({
  runtime: z.literal('gitlab'),
  action: z.string().min(1),
  project_path: z.string().min(1),
  group_path: z.string().optional(),
  project_id: z.union([z.string(), z.number()]).optional(),
  merge_request_iid: z.number().int().nonnegative().nullable().optional(),
  pipeline_id: z.union([z.string(), z.number()]).optional(),
  sha: z.string().optional(),
  source_branch: z.string().optional(),
  target_branch: z.string().optional(),
  pipeline_source: z.string().optional(),
  labels: z.array(z.string()).default([]),
  frameworks: z.array(z.string()).default([]),
  security_attributes: GitLabSecurityAttributesSchema.default({}),
});

export const GitLabToolMetadataSchema = z.object({
  component: z.string().optional(),
  stage: z.string().optional(),
  required_variables: z.array(z.string()).default([]),
  external_status_check: z.string().optional(),
  external_control: z.string().optional(),
  allowed_hosts: z.array(z.string()).default([]),
  frameworks: z.array(z.string()).default([]),
  actions: z.array(z.string()).default([]),
});

export const AuthorizationCheckSchema = z.object({
  id: z.string(),
  mode: z.enum(['advisory', 'blocking']),
  description: z.string(),
});

export const EvidenceObligationSchema = z.object({
  id: z.string(),
  framework: z.string().optional(),
  required: z.boolean(),
  description: z.string(),
});

export const ApprovedCatalogEntrySchema = z.object({
  name: z.string(),
  kind: z.enum(['Skill', 'Tool']),
  description: z.string().optional(),
  gitlab: GitLabToolMetadataSchema,
});

export const ControlPlaneAuthorizeRequest = GitLabRequestContextSchema.extend({
  actor: z
    .object({
      id: z.string(),
      type: z.enum(['token', 'gitlab-job', 'gitlab-webhook', 'system']).default('system'),
    })
    .optional(),
});

export const ControlPlaneAuthorizeResponse = z.object({
  decision: z.enum(['Allow', 'Deny']),
  decision_id: z.string(),
  actor: z.string(),
  frameworks: z.array(z.string()).default([]),
  approved_tools: z.array(ApprovedCatalogEntrySchema).default([]),
  approved_skills: z.array(ApprovedCatalogEntrySchema).default([]),
  allowed_hosts: z.array(z.string()).default([]),
  required_checks: z.array(AuthorizationCheckSchema).default([]),
  evidence_obligations: z.array(EvidenceObligationSchema).default([]),
  cedar: z.object({
    decision: z.enum(['Allow', 'Deny']),
    reasons: z.array(z.string()).default([]),
    errors: z.array(z.string()).default([]),
    evaluation_ms: z.number(),
  }),
});

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

export type AgentCreateRequest = z.infer<typeof AgentCreateRequest>;
export type RunCreateRequest = z.infer<typeof RunCreateRequest>;
export type GitLabRequestContext = z.infer<typeof GitLabRequestContextSchema>;
export type GitLabToolMetadata = z.infer<typeof GitLabToolMetadataSchema>;
export type ControlPlaneAuthorizeRequest = z.infer<typeof ControlPlaneAuthorizeRequest>;
export type ControlPlaneAuthorizeResponse = z.infer<typeof ControlPlaneAuthorizeResponse>;
export type NormalizedResultEnvelope = z.infer<typeof NormalizedResultEnvelope>;
