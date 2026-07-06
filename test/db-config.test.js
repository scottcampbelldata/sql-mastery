const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_DATABASES,
  buildClientConfig,
  getDatabaseNames,
  isAllowedDatabase,
  resolveDatabaseName
} = require('../src/db-config');

test('defaults to the two curriculum databases', () => {
  assert.deepEqual(DEFAULT_DATABASES, [
    'chinook',
    'stackoverflow'
  ]);

  assert.deepEqual(getDatabaseNames({}), DEFAULT_DATABASES);
});

test('allows overriding the visible database list through SQL_MASTERY_DATABASES', () => {
  const env = { SQL_MASTERY_DATABASES: 'northwind, analytics , chinook' };

  assert.deepEqual(getDatabaseNames(env), ['northwind', 'analytics', 'chinook']);
});

test('builds local PostgreSQL config for the selected database', () => {
  const config = buildClientConfig('northwind', {
    PGHOST: '127.0.0.1',
    PGPORT: '5433',
    PGUSER: 'scott',
    PGPASSWORD: 'secret'
  });

  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 5433);
  assert.equal(config.user, 'scott');
  assert.equal(config.password, 'secret');
  assert.equal(config.database, 'northwind');
});

test('keeps password as a string when no password is configured', () => {
  const config = buildClientConfig('northwind', {});

  assert.equal(config.password, '');
});

test('validates database names against the configured list', () => {
  const env = { SQL_MASTERY_DATABASES: 'northwind,chinook' };

  assert.equal(isAllowedDatabase('northwind', env), true);
  assert.equal(isAllowedDatabase('stackoverflow', env), false);
});

test('resolves lesson database names to local physical database names', () => {
  const env = {
    SQL_MASTERY_DATABASE_ALIASES: 'chinook=chinook_serial, nyctaxi=nyc_taxi, stackoverflow=stackoverflow_dba'
  };

  assert.equal(resolveDatabaseName('chinook', env), 'chinook_serial');
  assert.equal(resolveDatabaseName('nyctaxi', env), 'nyc_taxi');
  assert.equal(resolveDatabaseName('northwind', env), 'northwind');
});

test('builds client config with the resolved physical database name', () => {
  const config = buildClientConfig('stackoverflow', {
    SQL_MASTERY_DATABASE_ALIASES: 'stackoverflow=stackoverflow_dba'
  });

  assert.equal(config.database, 'stackoverflow_dba');
});
