import test from 'node:test';
import assert from 'node:assert/strict';

import { missingDatabaseConfig } from '../src/db-preflight';

test('missingDatabaseConfig requires explicit DB user and password', () => {
  assert.deepEqual(missingDatabaseConfig({}), ['PGUSER', 'PGPASSWORD']);
  assert.deepEqual(missingDatabaseConfig({ PGUSER: 'postgres' }), ['PGPASSWORD']);
  assert.deepEqual(missingDatabaseConfig({ PGPASSWORD: 'secret' }), ['PGUSER']);
  assert.deepEqual(missingDatabaseConfig({ PGUSER: 'postgres', PGPASSWORD: 'secret' }), []);
});
