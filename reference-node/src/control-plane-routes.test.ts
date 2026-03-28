import assert from 'node:assert/strict';
import test from 'node:test';
import { ControlPlaneAuthorizeRequest } from './control-plane-schemas.js';
import { extractValidationDetails } from './control-plane-routes.js';

test('extractValidationDetails returns Zod 4 issues for invalid authorize requests', () => {
  const result = ControlPlaneAuthorizeRequest.safeParse({});

  assert.equal(result.success, false);
  assert.deepEqual(extractValidationDetails(result.error), result.error.issues);
  assert.equal(result.error.issues.length > 0, true);
});
