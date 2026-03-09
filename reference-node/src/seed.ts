import { readFileSync, existsSync } from 'node:fs';
import { initDb } from './db.js';
import platformAgents from './platform-agents-seed.json' with { type: 'json' };

const DB_PATH = process.env.DB_PATH || './data/duadp.db';
const SEED_DOMAIN = process.env.DUADP_SEED_DOMAIN || 'example.duadp.dev';
const SEED_FILE = process.env.DUADP_SEED_FILE;
const db = initDb(DB_PATH);

// --- External seed file support ---
if (SEED_FILE && existsSync(SEED_FILE)) {
  console.log(`Seeding from external file: ${SEED_FILE}`);
  const insertResource = db.prepare('INSERT OR REPLACE INTO resources (kind, name, data) VALUES (?, ?, ?)');
  const seedData = JSON.parse(readFileSync(SEED_FILE, 'utf-8'));
  let count = 0;

  for (const kind of ['agents', 'skills', 'tools']) {
    for (const item of seedData[kind] ?? []) {
      insertResource.run(item.kind, item.metadata.name, JSON.stringify(item));
      count++;
    }
  }

  // Insert governance config
  db.prepare('INSERT OR REPLACE INTO governance (id, data) VALUES (1, ?)').run(
    JSON.stringify({ compliance_frameworks: ['NIST AI RMF 1.0', 'ISO/IEC 42001'], risk_tolerance: 'moderate', data_classification: 'internal' }),
  );

  console.log(`Seeded ${count} resources from ${SEED_FILE}`);
  process.exit(0);
}

console.log(`Seeding DUADP reference database (domain: ${SEED_DOMAIN})...`);

// Helper to insert a resource
const insertResource = db.prepare(
  'INSERT OR REPLACE INTO resources (kind, name, data) VALUES (?, ?, ?)',
);

// Helper to insert audit log
const insertAudit = db.prepare(
  'INSERT INTO audit_log (event_type, gaid, actor, detail, created_at) VALUES (?, ?, ?, ?, ?)',
);

// Helper to insert feedback
const insertFeedback = db.prepare(
  'INSERT INTO feedback (target_gaid, source, source_id, dimensions, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
);

// Helper to insert token usage
const insertTokenUsage = db.prepare(
  'INSERT INTO token_usage (agent_gaid, input_tokens, output_tokens, total_tokens, model, task_type, success, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
);

// Helper to insert attestation
const insertAttestation = db.prepare(
  'INSERT INTO attestations (agent_gaid, task_id, outcome, attestor, attestor_did, signature, metrics, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
);

// ============================================================
// SKILLS (5)
// ============================================================

const skills = [
  {
    apiVersion: 'ossa/v0.5',
    kind: 'Skill',
    metadata: {
      name: 'web-search',
      version: '1.2.0',
      description: 'Search the web for real-time information using multiple search engines',
      category: 'information-retrieval',
      trust_tier: 'verified-signature',
      tags: ['search', 'web', 'real-time', 'information'],
      created: '2026-01-15T10:00:00Z',
      updated: '2026-02-20T14:30:00Z',
    },
    identity: {
      gaid: 'agent://skills/web-search',
      did: `did:web:${SEED_DOMAIN}:skills:web-search`,
    },
    spec: {
      input_schema: { type: 'object', properties: { query: { type: 'string' }, max_results: { type: 'number', default: 10 } } },
      output_schema: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' }, snippet: { type: 'string' } } } },
      execution_model: 'stateless',
      avg_latency_ms: 1200,
      cost_per_call_usd: 0.001,
    },
    risk: { level: 'low', autonomy_level: 'advisory', data_sensitivity: 'public' },
  },
  {
    apiVersion: 'ossa/v0.5',
    kind: 'Skill',
    metadata: {
      name: 'code-review',
      version: '2.0.1',
      description: 'Automated code review with security vulnerability detection and style analysis',
      category: 'development',
      trust_tier: 'official',
      tags: ['code', 'review', 'security', 'quality', 'static-analysis'],
      created: '2025-11-01T08:00:00Z',
      updated: '2026-03-01T09:15:00Z',
    },
    identity: {
      gaid: 'agent://skills/code-review',
      did: `did:web:${SEED_DOMAIN}:skills:code-review`,
    },
    spec: {
      input_schema: { type: 'object', properties: { code: { type: 'string' }, language: { type: 'string' }, context: { type: 'string' } } },
      output_schema: { type: 'object', properties: { issues: { type: 'array' }, score: { type: 'number' }, suggestions: { type: 'array' } } },
      execution_model: 'stateless',
      supported_languages: ['typescript', 'python', 'go', 'rust', 'java', 'php'],
    },
    risk: { level: 'low', autonomy_level: 'advisory', data_sensitivity: 'internal' },
  },
  {
    apiVersion: 'ossa/v0.5',
    kind: 'Skill',
    metadata: {
      name: 'text-summarizer',
      version: '1.5.0',
      description: 'Summarize long documents into concise overviews with key point extraction',
      category: 'nlp',
      trust_tier: 'signed',
      tags: ['nlp', 'summarization', 'text', 'documents'],
      created: '2025-12-10T12:00:00Z',
      updated: '2026-02-15T16:00:00Z',
    },
    identity: {
      gaid: 'agent://skills/text-summarizer',
      did: `did:web:${SEED_DOMAIN}:skills:text-summarizer`,
    },
    spec: {
      input_schema: { type: 'object', properties: { text: { type: 'string' }, max_length: { type: 'number' }, style: { type: 'string', enum: ['bullet', 'paragraph', 'executive'] } } },
      output_schema: { type: 'object', properties: { summary: { type: 'string' }, key_points: { type: 'array' }, word_count: { type: 'number' } } },
      execution_model: 'stateless',
      max_input_tokens: 128000,
    },
    risk: { level: 'minimal', autonomy_level: 'advisory', data_sensitivity: 'internal' },
  },
  {
    apiVersion: 'ossa/v0.5',
    kind: 'Skill',
    metadata: {
      name: 'data-analyzer',
      version: '1.0.0',
      description: 'Statistical analysis and visualization of structured datasets',
      category: 'analytics',
      trust_tier: 'community',
      tags: ['data', 'analytics', 'statistics', 'visualization'],
      created: '2026-01-20T09:00:00Z',
      updated: '2026-02-28T11:45:00Z',
    },
    identity: {
      gaid: 'agent://skills/data-analyzer',
      did: `did:web:${SEED_DOMAIN}:skills:data-analyzer`,
    },
    spec: {
      input_schema: { type: 'object', properties: { data: { type: 'array' }, columns: { type: 'array' }, analysis_type: { type: 'string' } } },
      output_schema: { type: 'object', properties: { statistics: { type: 'object' }, charts: { type: 'array' }, insights: { type: 'array' } } },
      execution_model: 'stateful',
      supported_formats: ['csv', 'json', 'parquet'],
    },
    risk: { level: 'low', autonomy_level: 'supervised', data_sensitivity: 'confidential' },
  },
  {
    apiVersion: 'ossa/v0.5',
    kind: 'Skill',
    metadata: {
      name: 'image-classifier',
      version: '3.1.0',
      description: 'Classify images using state-of-the-art vision models with confidence scores',
      category: 'vision',
      trust_tier: 'verified-signature',
      tags: ['vision', 'image', 'classification', 'ml'],
      created: '2025-10-05T07:30:00Z',
      updated: '2026-03-03T13:00:00Z',
    },
    identity: {
      gaid: 'agent://skills/image-classifier',
      did: `did:web:${SEED_DOMAIN}:skills:image-classifier`,
    },
    spec: {
      input_schema: { type: 'object', properties: { image_url: { type: 'string' }, top_k: { type: 'number', default: 5 } } },
      output_schema: { type: 'object', properties: { predictions: { type: 'array' }, model_used: { type: 'string' }, processing_time_ms: { type: 'number' } } },
      execution_model: 'stateless',
      models: ['clip-vit-large-patch14', 'efficientnet-v2'],
    },
    risk: { level: 'moderate', autonomy_level: 'supervised', data_sensitivity: 'public' },
  },
];

// ============================================================
// AGENTS (3)
// ============================================================

const agents = [
  {
    apiVersion: 'ossa/v0.5',
    kind: 'Agent',
    metadata: {
      name: 'orchestrator',
      version: '2.0.0',
      description: 'Multi-agent orchestrator that coordinates complex tasks across specialized agents',
      category: 'orchestration',
      trust_tier: 'official',
      tags: ['orchestrator', 'multi-agent', 'coordination', 'planning'],
      created: '2025-09-01T06:00:00Z',
      updated: '2026-03-05T10:00:00Z',
    },
    identity: {
      gaid: 'agent://agents/orchestrator',
      did: `did:web:${SEED_DOMAIN}:agents:orchestrator`,
      operational: {
        endpoint: `https://agents.${SEED_DOMAIN}/orchestrator`,
        protocol: 'a2a',
        transport: 'https',
        health_check: `https://agents.${SEED_DOMAIN}/orchestrator/health`,
        rate_limit: { requests_per_minute: 60, concurrent_sessions: 10 },
      },
      relationships: {
        skills: ['agent://skills/web-search', 'agent://skills/code-review', 'agent://skills/text-summarizer'],
        delegates_to: ['agent://agents/code-reviewer', 'agent://agents/security-auditor'],
      },
    },
    spec: {
      agent_type: 'orchestrator',
      model: 'claude-opus-4-6',
      max_context_tokens: 200000,
      skills: ['web-search', 'code-review', 'text-summarizer'],
      delegation_strategy: 'adaptive',
      max_delegation_depth: 3,
    },
    risk: { level: 'moderate', autonomy_level: 'supervised', data_sensitivity: 'internal' },
  },
  {
    apiVersion: 'ossa/v0.5',
    kind: 'Agent',
    metadata: {
      name: 'code-reviewer',
      version: '1.3.0',
      description: 'Specialized code review agent with deep understanding of security patterns and best practices',
      category: 'development',
      trust_tier: 'verified-signature',
      tags: ['code-review', 'security', 'best-practices', 'worker'],
      created: '2025-10-15T11:00:00Z',
      updated: '2026-02-25T15:30:00Z',
    },
    identity: {
      gaid: 'agent://agents/code-reviewer',
      did: `did:web:${SEED_DOMAIN}:agents:code-reviewer`,
      operational: {
        endpoint: `https://agents.${SEED_DOMAIN}/code-reviewer`,
        protocol: 'mcp',
        transport: 'sse',
        health_check: `https://agents.${SEED_DOMAIN}/code-reviewer/health`,
      },
      relationships: {
        parent_agent: 'agent://agents/orchestrator',
        skills: ['agent://skills/code-review'],
        tools: ['agent://tools/mcp-filesystem'],
      },
    },
    spec: {
      agent_type: 'worker',
      model: 'claude-sonnet-4-20250514',
      max_context_tokens: 100000,
      skills: ['code-review'],
      supported_languages: ['typescript', 'python', 'go', 'rust'],
    },
    risk: { level: 'low', autonomy_level: 'human-in-the-loop', data_sensitivity: 'internal' },
  },
  {
    apiVersion: 'ossa/v0.5',
    kind: 'Agent',
    metadata: {
      name: 'security-auditor',
      version: '1.1.0',
      description: 'Security audit agent that performs vulnerability scanning, dependency analysis, and compliance checks',
      category: 'security',
      trust_tier: 'official',
      tags: ['security', 'audit', 'vulnerability', 'compliance', 'specialist'],
      created: '2025-11-20T14:00:00Z',
      updated: '2026-03-04T08:00:00Z',
    },
    identity: {
      gaid: 'agent://agents/security-auditor',
      did: `did:web:${SEED_DOMAIN}:agents:security-auditor`,
      operational: {
        endpoint: `https://agents.${SEED_DOMAIN}/security-auditor`,
        protocol: 'a2a',
        transport: 'https',
        health_check: `https://agents.${SEED_DOMAIN}/security-auditor/health`,
      },
      relationships: {
        parent_agent: 'agent://agents/orchestrator',
        skills: ['agent://skills/code-review'],
      },
      compliance: {
        nist_controls: ['SI-7', 'CM-3', 'AU-2', 'AU-3'],
        safety: {
          human_oversight: 'required',
          max_autonomy_level: 'human-in-loop',
          restricted_actions: ['deploy', 'delete', 'modify-production'],
        },
      },
    },
    spec: {
      agent_type: 'specialist',
      model: 'claude-opus-4-6',
      max_context_tokens: 200000,
      capabilities: ['sast', 'dependency-scan', 'secret-detection', 'compliance-check'],
      frameworks: ['NIST AI RMF 1.0', 'OWASP Top 10', 'CWE Top 25'],
    },
    risk: { level: 'moderate', autonomy_level: 'human-in-the-loop', data_sensitivity: 'confidential' },
  },
];

// ============================================================
// TOOLS (3)
// ============================================================

const tools = [
  {
    apiVersion: 'ossa/v0.5',
    kind: 'Tool',
    metadata: {
      name: 'mcp-filesystem',
      version: '1.0.0',
      description: 'MCP-compatible filesystem tool for reading, writing, and searching files',
      category: 'filesystem',
      trust_tier: 'official',
      tags: ['mcp', 'filesystem', 'read', 'write', 'search'],
      created: '2025-12-01T10:00:00Z',
      updated: '2026-02-10T12:00:00Z',
    },
    identity: {
      gaid: 'agent://tools/mcp-filesystem',
      did: `did:web:${SEED_DOMAIN}:tools:mcp-filesystem`,
      operational: {
        endpoint: `https://tools.${SEED_DOMAIN}/mcp-filesystem`,
        protocol: 'mcp',
        transport: 'stdio',
      },
    },
    spec: {
      protocol: 'mcp',
      transport: 'stdio',
      tools: [
        { name: 'read_file', description: 'Read a file from the filesystem' },
        { name: 'write_file', description: 'Write content to a file' },
        { name: 'search_files', description: 'Search files by pattern' },
        { name: 'list_directory', description: 'List directory contents' },
      ],
    },
    risk: { level: 'moderate', autonomy_level: 'supervised', data_sensitivity: 'internal' },
  },
  {
    apiVersion: 'ossa/v0.5',
    kind: 'Tool',
    metadata: {
      name: 'a2a-email',
      version: '1.1.0',
      description: 'Agent-to-agent email composition and sending tool using the A2A protocol',
      category: 'communication',
      trust_tier: 'signed',
      tags: ['a2a', 'email', 'communication', 'messaging'],
      created: '2026-01-05T09:00:00Z',
      updated: '2026-02-28T14:00:00Z',
    },
    identity: {
      gaid: 'agent://tools/a2a-email',
      did: `did:web:${SEED_DOMAIN}:tools:a2a-email`,
      operational: {
        endpoint: `https://tools.${SEED_DOMAIN}/a2a-email`,
        protocol: 'a2a',
        transport: 'https',
      },
    },
    spec: {
      protocol: 'a2a',
      transport: 'https',
      methods: [
        { name: 'compose', description: 'Compose an email draft' },
        { name: 'send', description: 'Send a composed email' },
        { name: 'list_drafts', description: 'List saved drafts' },
      ],
    },
    risk: { level: 'moderate', autonomy_level: 'human-in-the-loop', data_sensitivity: 'confidential' },
  },
  {
    apiVersion: 'ossa/v0.5',
    kind: 'Tool',
    metadata: {
      name: 'openapi-weather',
      version: '2.0.0',
      description: 'Weather data API tool using OpenAPI spec for current conditions and forecasts',
      category: 'data',
      trust_tier: 'community',
      tags: ['openapi', 'rest', 'weather', 'api', 'data'],
      created: '2025-11-15T08:00:00Z',
      updated: '2026-01-30T10:00:00Z',
    },
    identity: {
      gaid: 'agent://tools/openapi-weather',
      did: `did:web:${SEED_DOMAIN}:tools:openapi-weather`,
      operational: {
        endpoint: `https://tools.${SEED_DOMAIN}/openapi-weather`,
        protocol: 'rest',
        transport: 'https',
      },
    },
    spec: {
      protocol: 'rest',
      transport: 'https',
      openapi_spec_url: `https://tools.${SEED_DOMAIN}/openapi-weather/openapi.json`,
      endpoints: [
        { path: '/current', method: 'GET', description: 'Get current weather conditions' },
        { path: '/forecast', method: 'GET', description: 'Get 7-day forecast' },
        { path: '/alerts', method: 'GET', description: 'Get active weather alerts' },
      ],
    },
    risk: { level: 'minimal', autonomy_level: 'advisory', data_sensitivity: 'public' },
  },
];

// ============================================================
// Seed transaction
// ============================================================

const seedAll = db.transaction(() => {
  // Clear existing data
  db.prepare('DELETE FROM resources').run();
  db.prepare('DELETE FROM audit_log').run();
  db.prepare('DELETE FROM feedback').run();
  db.prepare('DELETE FROM token_usage').run();
  db.prepare('DELETE FROM attestations').run();
  db.prepare('DELETE FROM governance').run();
  db.prepare('DELETE FROM peers').run();

  // Insert skills
  for (const skill of skills) {
    insertResource.run('Skill', skill.metadata.name, JSON.stringify(skill));
    console.log(`  + Skill: ${skill.metadata.name}`);
  }

  // Insert agents (reference)
  for (const agent of agents) {
    insertResource.run('Agent', agent.metadata.name, JSON.stringify(agent));
    console.log(`  + Agent: ${agent.metadata.name}`);
  }

  // Insert platform agents (from platform-agents repo manifests)
  for (const agent of platformAgents) {
    const a = agent as { metadata: { name: string } };
    insertResource.run('Agent', a.metadata.name, JSON.stringify(agent));
    console.log(`  + Platform Agent: ${a.metadata.name}`);
  }
  console.log(`  = ${platformAgents.length} platform agents inserted`);

  // Insert tools
  for (const tool of tools) {
    insertResource.run('Tool', tool.metadata.name, JSON.stringify(tool));
    console.log(`  + Tool: ${tool.metadata.name}`);
  }

  // Governance config
  db.prepare('INSERT INTO governance (id, data) VALUES (1, ?)').run(
    JSON.stringify({
      compliance_frameworks: ['NIST AI RMF 1.0', 'ISO/IEC 42001'],
      risk_tolerance: 'moderate',
      data_classification: 'internal',
      review_policy: 'hybrid',
      audit_retention_days: 365,
    }),
  );
  console.log('  + Governance config');

  // Audit log entries (10)
  const auditEntries = [
    { event_type: 'resource.created', gaid: 'agent://skills/web-search', actor: 'admin', detail: { kind: 'Skill', name: 'web-search' }, created_at: '2026-01-15T10:00:00Z' },
    { event_type: 'resource.created', gaid: 'agent://agents/orchestrator', actor: 'admin', detail: { kind: 'Agent', name: 'orchestrator' }, created_at: '2025-09-01T06:00:00Z' },
    { event_type: 'resource.updated', gaid: 'agent://skills/code-review', actor: 'ci-bot', detail: { kind: 'Skill', name: 'code-review', version: '2.0.1' }, created_at: '2026-03-01T09:15:00Z' },
    { event_type: 'peer.added', gaid: null, actor: 'system', detail: { url: `https://node2.${SEED_DOMAIN}`, name: 'OSSA Node 2' }, created_at: '2026-02-10T12:00:00Z' },
    { event_type: 'resource.created', gaid: 'agent://tools/mcp-filesystem', actor: 'admin', detail: { kind: 'Tool', name: 'mcp-filesystem' }, created_at: '2025-12-01T10:00:00Z' },
    { event_type: 'auth.failed', gaid: null, actor: 'unknown', detail: { reason: 'invalid_token', ip: '192.168.1.100' }, created_at: '2026-02-20T03:45:00Z' },
    { event_type: 'resource.created', gaid: 'agent://agents/code-reviewer', actor: 'admin', detail: { kind: 'Agent', name: 'code-reviewer' }, created_at: '2025-10-15T11:00:00Z' },
    { event_type: 'resource.updated', gaid: 'agent://agents/orchestrator', actor: 'admin', detail: { kind: 'Agent', name: 'orchestrator', version: '2.0.0' }, created_at: '2026-03-05T10:00:00Z' },
    { event_type: 'federation.sync', gaid: null, actor: 'system', detail: { peer: `https://node2.${SEED_DOMAIN}`, resources_synced: 12 }, created_at: '2026-03-04T00:00:00Z' },
    { event_type: 'resource.created', gaid: 'agent://agents/security-auditor', actor: 'admin', detail: { kind: 'Agent', name: 'security-auditor' }, created_at: '2025-11-20T14:00:00Z' },
  ];

  for (const entry of auditEntries) {
    insertAudit.run(entry.event_type, entry.gaid, entry.actor, JSON.stringify(entry.detail), entry.created_at);
  }
  console.log(`  + ${auditEntries.length} audit log entries`);

  // Feedback entries (5)
  const feedbackEntries = [
    { target_gaid: 'agent://agents/orchestrator', source: 'human', source_id: 'user:alice', dimensions: { accuracy: 0.92, efficiency: 0.85, quality: 0.90, helpfulness: 0.95, reliability: 0.88 }, comment: 'Excellent coordination of multi-step tasks', created_at: '2026-03-01T14:30:00Z' },
    { target_gaid: 'agent://agents/code-reviewer', source: 'agent', source_id: 'agent://agents/orchestrator', dimensions: { accuracy: 0.95, efficiency: 0.78, quality: 0.93, helpfulness: 0.90, reliability: 0.92 }, comment: 'Thorough review but sometimes slow on large PRs', created_at: '2026-03-02T09:00:00Z' },
    { target_gaid: 'agent://agents/security-auditor', source: 'human', source_id: 'user:bob', dimensions: { accuracy: 0.98, efficiency: 0.70, quality: 0.96, helpfulness: 0.85, reliability: 0.94 }, comment: 'Found critical vulnerability others missed', created_at: '2026-03-03T11:15:00Z' },
    { target_gaid: 'agent://agents/orchestrator', source: 'system', source_id: 'automated-test-suite', dimensions: { accuracy: 0.88, efficiency: 0.92, quality: 0.87, helpfulness: 0.90, reliability: 0.91 }, comment: 'Automated evaluation: passed 44/50 test cases', created_at: '2026-03-04T06:00:00Z' },
    { target_gaid: 'agent://agents/code-reviewer', source: 'human', source_id: 'user:charlie', dimensions: { accuracy: 0.91, efficiency: 0.82, quality: 0.89, helpfulness: 0.93, reliability: 0.87 }, comment: 'Good suggestions but missed a race condition', created_at: '2026-03-05T08:30:00Z' },
  ];

  for (const entry of feedbackEntries) {
    insertFeedback.run(entry.target_gaid, entry.source, entry.source_id, JSON.stringify(entry.dimensions), entry.comment, entry.created_at);
  }
  console.log(`  + ${feedbackEntries.length} feedback entries`);

  // Token usage entries (5)
  const tokenEntries = [
    { agent_gaid: 'agent://agents/orchestrator', input_tokens: 45000, output_tokens: 8500, total_tokens: 53500, model: 'claude-opus-4-6', task_type: 'code-review-orchestration', success: 1, cost_usd: 0.425, created_at: '2026-03-01T10:00:00Z' },
    { agent_gaid: 'agent://agents/code-reviewer', input_tokens: 32000, output_tokens: 5200, total_tokens: 37200, model: 'claude-sonnet-4-20250514', task_type: 'pull-request-review', success: 1, cost_usd: 0.112, created_at: '2026-03-01T10:05:00Z' },
    { agent_gaid: 'agent://agents/security-auditor', input_tokens: 85000, output_tokens: 12000, total_tokens: 97000, model: 'claude-opus-4-6', task_type: 'security-audit', success: 1, cost_usd: 0.770, created_at: '2026-03-02T14:30:00Z' },
    { agent_gaid: 'agent://agents/orchestrator', input_tokens: 28000, output_tokens: 4200, total_tokens: 32200, model: 'claude-opus-4-6', task_type: 'task-planning', success: 1, cost_usd: 0.256, created_at: '2026-03-03T09:00:00Z' },
    { agent_gaid: 'agent://agents/code-reviewer', input_tokens: 15000, output_tokens: 2800, total_tokens: 17800, model: 'claude-sonnet-4-20250514', task_type: 'pull-request-review', success: 0, cost_usd: 0.053, created_at: '2026-03-04T16:00:00Z' },
  ];

  for (const entry of tokenEntries) {
    insertTokenUsage.run(entry.agent_gaid, entry.input_tokens, entry.output_tokens, entry.total_tokens, entry.model, entry.task_type, entry.success, entry.cost_usd, entry.created_at);
  }
  console.log(`  + ${tokenEntries.length} token usage entries`);

  // Attestation entries (3)
  const attestationEntries = [
    {
      agent_gaid: 'agent://agents/orchestrator',
      task_id: 'task-2026-03-01-001',
      outcome: 'success',
      attestor: 'user:alice',
      attestor_did: 'did:web:alice.dev',
      signature: null,
      metrics: { duration_ms: 45000, tokens_used: 53500, quality_score: 0.92 },
      created_at: '2026-03-01T10:30:00Z',
    },
    {
      agent_gaid: 'agent://agents/code-reviewer',
      task_id: 'task-2026-03-02-005',
      outcome: 'success',
      attestor: 'agent://agents/orchestrator',
      attestor_did: `did:web:${SEED_DOMAIN}:agents:orchestrator`,
      signature: null,
      metrics: { duration_ms: 28000, tokens_used: 37200, quality_score: 0.95 },
      created_at: '2026-03-02T11:00:00Z',
    },
    {
      agent_gaid: 'agent://agents/security-auditor',
      task_id: 'task-2026-03-02-010',
      outcome: 'partial',
      attestor: 'user:bob',
      attestor_did: 'did:web:bob.dev',
      signature: null,
      metrics: { duration_ms: 120000, tokens_used: 97000, quality_score: 0.78 },
      created_at: '2026-03-02T16:00:00Z',
    },
  ];

  for (const entry of attestationEntries) {
    insertAttestation.run(entry.agent_gaid, entry.task_id, entry.outcome, entry.attestor, entry.attestor_did, entry.signature, JSON.stringify(entry.metrics), entry.created_at);
  }
  console.log(`  + ${attestationEntries.length} attestation entries`);
});

seedAll();

console.log('\nSeed complete. Database ready at:', DB_PATH);
