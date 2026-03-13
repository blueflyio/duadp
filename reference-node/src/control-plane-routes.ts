import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Request } from 'express';
import type { OssaResource } from '@bluefly/duadp';
import { actorFromHeaders } from './auth-actor.js';
import { evaluateCedar } from './cedar-evaluator.js';
import {
  AgentCreateRequest,
  ApprovedCatalogEntrySchema,
  ControlPlaneAuthorizeRequest,
  type GitLabRequestContext,
  RunCreateRequest,
} from './control-plane-schemas.js';

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    node_name?: string;
  };
}

interface ControlPlaneDeps {
  listTools?: (params: {
    search?: string;
    category?: string;
    tag?: string;
    trust_tier?: string;
    protocol?: string;
    page: number;
    limit: number;
  }) => Promise<PaginatedResponse<OssaResource>>;
  listSkills?: (params: {
    search?: string;
    category?: string;
    tag?: string;
    trust_tier?: string;
    page: number;
    limit: number;
  }) => Promise<PaginatedResponse<OssaResource>>;
  rolloutMode?: 'advisory' | 'blocking';
}

function extractHosts(resource: OssaResource): string[] {
  const candidates = [
    (resource.spec as Record<string, unknown> | undefined)?.endpoint,
    resource.identity?.operational?.endpoint,
  ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);

  return [...new Set(candidates.map((candidate) => {
    try {
      return new URL(candidate).hostname;
    } catch {
      return '';
    }
  }).filter(Boolean))];
}

function extractFrameworks(resource: OssaResource): string[] {
  const metadata = resource.metadata as Record<string, unknown>;
  const gitlabBlock = (resource as OssaResource & { gitlab?: { frameworks?: string[] } }).gitlab;
  const compliance =
    metadata.compliance_frameworks && Array.isArray(metadata.compliance_frameworks)
      ? metadata.compliance_frameworks
      : [];

  return [...new Set([...(gitlabBlock?.frameworks ?? []), ...compliance.filter((value): value is string => typeof value === 'string')])];
}

function matchesContext(resource: OssaResource, context: GitLabRequestContext): boolean {
  if (context.frameworks.length === 0) {
    return true;
  }

  const resourceFrameworks = extractFrameworks(resource);
  if (resourceFrameworks.length === 0) {
    return true;
  }

  return context.frameworks.some((framework) => resourceFrameworks.includes(framework));
}

function buildGitLabEntry(resource: OssaResource, context: GitLabRequestContext, kind: 'Skill' | 'Tool') {
  const frameworks = extractFrameworks(resource);
  const entry = {
    name: resource.metadata.name,
    kind,
    description: resource.metadata.description,
    gitlab: {
      component: kind === 'Tool' ? resource.metadata.name : undefined,
      stage: kind === 'Tool' ? '.pipeline-policy-pre' : '.pipeline-policy-post',
      required_variables: [
        'BLUEFLY_FRAMEWORKS',
        'BLUEFLY_FRAMEWORKS_JSON',
        'BLUEFLY_SECURITY_ATTRIBUTES_JSON',
      ],
      external_status_check: context.action.includes('merge') ? 'DUADP Cedar Authorization' : undefined,
      external_control: context.frameworks.length > 0 ? 'DUADP Cedar Authorization' : undefined,
      allowed_hosts: extractHosts(resource),
      frameworks,
      actions: [context.action],
    },
  };

  return ApprovedCatalogEntrySchema.parse(entry);
}

function buildRequiredChecks(context: GitLabRequestContext, rolloutMode: 'advisory' | 'blocking') {
  const regulated = context.frameworks.some((framework) =>
    /hipaa|fedramp|nist|soc2|iso|pci|cmmc|dora|nis2|csa|cyber|ossa/.test(framework),
  );

  const checks = [
    {
      id: 'duadp_cedar_authorization',
      mode: rolloutMode,
      description: 'Cedar authorization result for the GitLab runtime context.',
    },
  ];

  if (context.action.includes('merge')) {
    checks.push({
      id: 'external_status_check',
      mode: rolloutMode,
      description: 'Mirror the authorization result to GitLab external status checks.',
    });
  }

  if (regulated) {
    checks.push({
      id: 'framework_evidence',
      mode: rolloutMode,
      description: 'Produce framework evidence from the authorization decision.',
    });
    checks.push({
      id: 'external_control_report',
      mode: rolloutMode,
      description: 'Report the result to GitLab Compliance Center external controls.',
    });
  }

  return checks;
}

function buildEvidenceObligations(context: GitLabRequestContext) {
  return context.frameworks.map((framework) => ({
    id: `evidence:${framework}`,
    framework,
    required: true,
    description: `Attach DUADP authorization and GitLab evidence for ${framework}.`,
  }));
}

async function resolveCatalogEntries(
  deps: ControlPlaneDeps,
  context: GitLabRequestContext,
) {
  const [tools, skills] = await Promise.all([
    deps.listTools
      ? deps.listTools({
          page: 1,
          limit: 100,
          protocol: 'mcp',
        })
      : Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 100 } }),
    deps.listSkills
      ? deps.listSkills({
          page: 1,
          limit: 100,
        })
      : Promise.resolve({ data: [], meta: { total: 0, page: 1, limit: 100 } }),
  ]);

  const approvedTools = tools.data
    .filter((resource) => matchesContext(resource, context))
    .map((resource) => buildGitLabEntry(resource, context, 'Tool'));
  const approvedSkills = skills.data
    .filter((resource) => matchesContext(resource, context))
    .map((resource) => buildGitLabEntry(resource, context, 'Skill'));

  const allowedHosts = [
    ...new Set(approvedTools.flatMap((tool) => tool.gitlab.allowed_hosts)),
  ];

  return {
    approvedTools,
    approvedSkills,
    allowedHosts,
  };
}

function actorFromRequest(req: Request, requestActor?: { id: string }) {
  if (requestActor?.id) {
    return requestActor.id;
  }

  return actorFromHeaders(req.headers as Record<string, string | string[] | undefined>).actorId;
}

export function createControlPlaneRouter(deps: ControlPlaneDeps = {}) {
  const router = express.Router();
  const rolloutMode = deps.rolloutMode ?? 'advisory';

  router.post('/agents', (req, res) => {
    try {
      const validated = AgentCreateRequest.parse(req.body);
      const manifest = validated.ossa_manifest as { metadata?: { name?: string } };
      res.status(201).json({
        id: randomUUID(),
        name: typeof manifest.metadata?.name === 'string' ? manifest.metadata.name : 'unnamed-agent',
        ossa_manifest: validated.ossa_manifest,
        drupal_config_entity: null,
        status: 'enabled',
        created_at: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
  });

  router.get('/agents', (_req, res) => {
    res.status(200).json({
      data: [],
      meta: { count: 0 },
    });
  });

  router.post('/runs', (req, res) => {
    try {
      RunCreateRequest.parse(req.body);
      res.status(202).json({
        id: randomUUID(),
        status: 'queued',
        workflow_id: null,
        agent_id: null,
        created_at: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
  });

  router.post('/authorize', async (req, res) => {
    try {
      const validated = ControlPlaneAuthorizeRequest.parse(req.body);
      const actor = actorFromRequest(req, validated.actor);
      const catalog = await resolveCatalogEntries(deps, validated);
      const cedarResult = await evaluateCedar({
        principal: { type: 'GitLab::Principal', id: actor },
        action: { type: 'GitLab::Action', id: validated.action },
        resource: { type: 'GitLab::Project', id: validated.project_path },
        context: {
          runtime: validated.runtime,
          project_path: validated.project_path,
          group_path: validated.group_path,
          frameworks: validated.frameworks,
          security_attributes: validated.security_attributes,
          source_branch: validated.source_branch,
          target_branch: validated.target_branch,
          pipeline_source: validated.pipeline_source,
        },
        policy_set: 'gitlab',
      });

      const decision = cedarResult.decision === 'Allow' ? 'Allow' : 'Deny';

      res.status(200).json({
        decision,
        decision_id: randomUUID(),
        actor,
        frameworks: validated.frameworks,
        approved_tools: decision === 'Allow' ? catalog.approvedTools : [],
        approved_skills: decision === 'Allow' ? catalog.approvedSkills : [],
        allowed_hosts: decision === 'Allow' ? catalog.allowedHosts : [],
        required_checks: buildRequiredChecks(validated, rolloutMode),
        evidence_obligations: buildEvidenceObligations(validated),
        cedar: {
          decision: cedarResult.decision,
          reasons: cedarResult.diagnostics.reason,
          errors: cedarResult.diagnostics.errors,
          evaluation_ms: cedarResult.evaluation_ms,
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: 'Validation failed', details: err.errors ?? err.message });
    }
  });

  return router;
}
