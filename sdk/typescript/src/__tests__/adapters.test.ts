/**
 * USIE Adapter Unit Tests
 *
 * Tests normalize() output for each adapter using mock SkillBundle inputs.
 * fetch() is NOT tested here (that is integration testing against live GitHub).
 */

import { test, expect } from 'vitest';
import { KiroPowersAdapter } from '../adapters/kiro-powers-adapter.js';
import { SkillsShAdapter } from '../adapters/skills-sh-adapter.js';
import { GitRepoAdapter } from '../adapters/git-repo-adapter.js';
import { buildSkillGaid, inferTrustTier } from '../adapters/registry-adapter.js';
import type { SkillBundle } from '../adapters/registry-adapter.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const kiroPowerBundle: SkillBundle = {
  instruction_content: '# Datadog Power\n\nConnect to Datadog observability.',
  steering_content: ['## Steering\nUse metric queries first.'],
  mcp_servers: {
    datadog: { type: 'http', url: 'https://mcp.datadoghq.com/api/unstable/mcp-server/mcp' },
  },
  raw_metadata: {
    name: 'datadog',
    displayName: 'Datadog Observability',
    description: 'Query logs, metrics, traces and incidents from Datadog.',
    author: 'Datadog',
    keywords: ['datadog', 'observability', 'monitoring'],
  },
  source_commit: 'abc1234',
};

const skillsShBundle: SkillBundle = {
  instruction_content: '# Web Search\n\nSearch the web for real-time information.',
  steering_content: [],
  raw_metadata: {
    name: 'web-search',
    description: 'Search the web for real-time information.',
    version: '1.2.0',
    author: 'skills-sh/web-search',
    tags: ['search', 'web', 'real-time'],
    _github_url: 'https://github.com/skills-sh/web-search',
  },
};

const gitRepoBundle: SkillBundle = {
  instruction_content: '# Custom Skill\n\nA company-internal skill.',
  scripts: { 'run.py': 'print("hello")' },
  raw_metadata: {
    name: 'custom-internal',
    description: 'Internal automation skill.',
    author: 'Acme Corp',
  },
};

// ── GAID helpers ──────────────────────────────────────────────────────────────

test('buildSkillGaid produces correct pattern', () => {
  const gaid = buildSkillGaid('kiro-powers', 'datadog');
  expect(gaid).toBe('agent://skills.openstandardagents.org/kiro-powers/datadog');
});

test('buildSkillGaid sanitizes names with special chars', () => {
  const gaid = buildSkillGaid('skills-sh', 'My Skill!');
  expect(gaid).toMatch(/\/my-skill/);
});

// ── Trust tier ────────────────────────────────────────────────────────────────

test('inferTrustTier returns verified-signature for known vendor', () => {
  expect(inferTrustTier('Datadog', 'community')).toBe('verified-signature');
  expect(inferTrustTier('AWS Infrastructure', 'community')).toBe('verified-signature');
  expect(inferTrustTier('Stripe Inc', 'community')).toBe('verified-signature');
});

test('inferTrustTier returns default for unknown author', () => {
  expect(inferTrustTier('unknown-author', 'community')).toBe('community');
  expect(inferTrustTier(undefined, 'community')).toBe('community');
});

// ── KiroPowersAdapter ─────────────────────────────────────────────────────────

test('KiroPowersAdapter.normalize produces valid OssaSkill', () => {
  const adapter = new KiroPowersAdapter();
  const skill = adapter.normalize(kiroPowerBundle);

  expect(skill.apiVersion).toBe('ossa/v0.5');
  expect(skill.kind).toBe('Skill');
  expect(skill.metadata.name).toBe('datadog');
  expect(skill.metadata.uri).toMatch(/^agent:\/\/skills\.openstandardagents\.org\/kiro-powers\//);
  expect(skill.metadata.trust_tier).toBe('verified-signature');
  expect(skill.metadata.tags).toEqual(['datadog', 'observability', 'monitoring']);
  expect(skill.metadata.category).toBe('context-pack');
});

test('KiroPowersAdapter.normalize preserves mcp_servers', () => {
  const adapter = new KiroPowersAdapter();
  const skill = adapter.normalize(kiroPowerBundle);
  const spec = skill.spec as Record<string, unknown>;

  expect(spec.mcp_servers).toBeTruthy();
  expect('datadog' in (spec.mcp_servers as Record<string, unknown>)).toBe(true);
});

test('KiroPowersAdapter.normalize includes instruction_content', () => {
  const adapter = new KiroPowersAdapter();
  const skill = adapter.normalize(kiroPowerBundle);
  const spec = skill.spec as Record<string, unknown>;

  expect(typeof spec.instruction_content).toBe('string');
  expect(spec.instruction_content as string).toContain('Datadog');
});

test('KiroPowersAdapter.normalize populates provenance', () => {
  const adapter = new KiroPowersAdapter();
  const skill = adapter.normalize(kiroPowerBundle);

  expect(skill.provenance?.publisher?.name).toContain('Datadog');
  expect(skill.provenance?.build?.commit_sha).toBe('abc1234');
});

// ── SkillsShAdapter ───────────────────────────────────────────────────────────

test('SkillsShAdapter.normalize produces valid OssaSkill', () => {
  const adapter = new SkillsShAdapter();
  const skill = adapter.normalize(skillsShBundle);

  expect(skill.apiVersion).toBe('ossa/v0.5');
  expect(skill.kind).toBe('Skill');
  expect(skill.metadata.name).toBe('web-search');
  expect(skill.metadata.uri).toMatch(/^agent:\/\/skills\.openstandardagents\.org\/skills-sh\//);
  expect(skill.metadata.version).toBe('1.2.0');
  expect(skill.metadata.tags).toEqual(['search', 'web', 'real-time']);
});

test('SkillsShAdapter.normalize assigns instruction-skill class when no scripts', () => {
  const adapter = new SkillsShAdapter();
  const skill = adapter.normalize(skillsShBundle);
  const spec = skill.spec as Record<string, unknown>;

  expect(spec.skill_class).toBe('instruction-skill');
});

// ── GitRepoAdapter ────────────────────────────────────────────────────────────

test('GitRepoAdapter.normalize produces valid OssaSkill', () => {
  const adapter = new GitRepoAdapter({
    id: 'acme-skills',
    label: 'Acme Corp Skills',
    repo_url: 'https://github.com/acme/agent-skills',
    trust_tier: 'community',
  });
  const skill = adapter.normalize(gitRepoBundle);

  expect(skill.apiVersion).toBe('ossa/v0.5');
  expect(skill.kind).toBe('Skill');
  expect(skill.metadata.name).toBe('custom-internal');
  expect(skill.metadata.uri).toMatch(/^agent:\/\/skills\.openstandardagents\.org\/acme-skills\//);
});

test('GitRepoAdapter.normalize assigns scripted-skill class when scripts present', () => {
  const adapter = new GitRepoAdapter({
    id: 'acme-skills',
    label: 'Acme',
    repo_url: 'https://github.com/acme/skills',
    trust_tier: 'community',
  });
  const skill = adapter.normalize(gitRepoBundle);
  const spec = skill.spec as Record<string, unknown>;

  expect(spec.skill_class).toBe('scripted-skill');
});

test('GitRepoAdapter uses configured id, label, source_url', () => {
  const adapter = new GitRepoAdapter({
    id: 'my-adapter',
    label: 'My Label',
    repo_url: 'https://github.com/test/repo',
  });

  expect(adapter.id).toBe('my-adapter');
  expect(adapter.label).toBe('My Label');
  expect(adapter.source_url).toBe('https://github.com/test/repo');
});
