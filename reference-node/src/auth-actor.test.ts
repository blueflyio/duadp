import assert from 'node:assert/strict';
import test from 'node:test';
import { actorFromHeaders, actorFromToken } from './auth-actor.js';

test('actorFromToken hashes bearer tokens instead of returning token material', () => {
  const actor = actorFromToken('super-secret-token');

  assert.match(actor, /^auth:[a-f0-9]{12}$/);
  assert.equal(actor.includes('super-secret-token'), false);
});

test('actorFromToken falls back when no token is present', () => {
  assert.equal(actorFromToken(undefined, 'anonymous'), 'anonymous');
  assert.equal(actorFromToken(undefined), 'system');
});

test('actorFromHeaders maps GitLab webhook tokens to gitlab:webhook actors', () => {
  const actor = actorFromHeaders({
    'x-gitlab-token': 'shared-secret',
  });

  assert.equal(actor.actorType, 'gitlab-webhook');
  assert.equal(actor.source, 'gitlab-webhook');
  assert.match(actor.actorId, /^gitlab:webhook:[a-f0-9]{12}$/);
});

test('actorFromHeaders derives GitLab job identity from JWT-like bearer tokens', () => {
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'job_123',
      project_path: 'blueflyio/platform',
      namespace_path: 'blueflyio',
    }),
  ).toString('base64url');
  const token = `header.${payload}.signature`;

  const actor = actorFromHeaders({
    authorization: `Bearer ${token}`,
  });

  assert.equal(actor.actorType, 'gitlab-job');
  assert.equal(actor.source, 'gitlab-jwt');
  assert.equal(actor.projectPath, 'blueflyio/platform');
  assert.equal(actor.groupPath, 'blueflyio');
  assert.equal(actor.subject, 'job_123');
});

test('actorFromHeaders falls back to generic bearer token hashing when JWT claims are absent', () => {
  const actor = actorFromHeaders({
    authorization: 'Bearer not-a-jwt',
  });

  assert.equal(actor.actorType, 'token');
  assert.equal(actor.source, 'bearer');
  assert.match(actor.actorId, /^auth:[a-f0-9]{12}$/);
});
