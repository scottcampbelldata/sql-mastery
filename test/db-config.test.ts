import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_DATABASES,
  buildClientConfig,
  getDatabaseNames,
  isAllowedDatabase,
  resolveDatabaseName
} from '../src/db-config';

test('defaults to the three owned curriculum databases', () => {
  assert.deepEqual(DEFAULT_DATABASES, [
    'aperture',
    'sideline',
    'rove'
  ]);

  assert.deepEqual(getDatabaseNames({}), DEFAULT_DATABASES);
});

test('allows overriding the visible database list through SQL_MASTERY_DATABASES', () => {
  const env = { SQL_MASTERY_DATABASES: 'aperture, sideline , rove' };

  assert.deepEqual(getDatabaseNames(env), ['aperture', 'sideline', 'rove']);
});

test('builds local PostgreSQL config for the selected database', () => {
  const config = buildClientConfig('aperture', {
    PGHOST: '127.0.0.1',
    PGPORT: '5433',
    PGUSER: 'scott',
    PGPASSWORD: 'secret'
  });

  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 5433);
  assert.equal(config.user, 'scott');
  assert.equal(config.password, 'secret');
  assert.equal(config.database, 'aperture');
});

test('keeps password as a string when no password is configured', () => {
  const config = buildClientConfig('sideline', {});

  assert.equal(config.password, '');
});

test('validates database names against the configured list', () => {
  const env = { SQL_MASTERY_DATABASES: 'aperture,sideline' };

  assert.equal(isAllowedDatabase('aperture', env), true);
  assert.equal(isAllowedDatabase('rove', env), false);
});

test('resolves visible database names to local physical database names', () => {
  const env = {
    SQL_MASTERY_DATABASE_ALIASES: 'aperture=aperture_local, sideline=sideline_local, rove=rove_local'
  };

  assert.equal(resolveDatabaseName('aperture', env), 'aperture_local');
  assert.equal(resolveDatabaseName('sideline', env), 'sideline_local');
  assert.equal(resolveDatabaseName('custom', env), 'custom');
});

test('builds client config with the resolved physical database name', () => {
  const config = buildClientConfig('rove', {
    SQL_MASTERY_DATABASE_ALIASES: 'rove=rove_local'
  });

  assert.equal(config.database, 'rove_local');
});
