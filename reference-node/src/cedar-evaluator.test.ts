import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateManifestCedar } from './cedar-evaluator.js';

test('Cedar invoke path allows publish when principal matches manifest policy', async () => {
  const manifest = {
    extensions: {
      security: {
        cedar: {
          policies: [
            {
              policy_text: `
permit(
  principal == DUADP::Principal::"publisher-1",
  action == DUADP::Action::"publish",
  resource
);`,
            },
          ],
        },
      },
    },
  };

  const result = await evaluateManifestCedar(
    manifest as any,
    { type: 'DUADP::Principal', id: 'publisher-1' },
    { type: 'DUADP::Action', id: 'publish' },
    { type: 'DUADP::Resource', id: 'agent-a' },
  );

  assert.ok(result);
  assert.equal(result?.decision, 'Allow');
});

test('Cedar invoke path denies publish when principal does not match policy', async () => {
  const manifest = {
    extensions: {
      security: {
        cedar: {
          policies: [
            {
              policy_text: `
permit(
  principal == DUADP::Principal::"publisher-1",
  action == DUADP::Action::"publish",
  resource
);`,
            },
          ],
        },
      },
    },
  };

  const result = await evaluateManifestCedar(
    manifest as any,
    { type: 'DUADP::Principal', id: 'anonymous' },
    { type: 'DUADP::Action', id: 'publish' },
    { type: 'DUADP::Resource', id: 'agent-a' },
  );

  assert.ok(result);
  assert.equal(result?.decision, 'Deny');
});
