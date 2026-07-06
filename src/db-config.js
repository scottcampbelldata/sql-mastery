const DEFAULT_DATABASES = Object.freeze([
  'northwind',
  'chinook',
  'adventureworks',
  'stackoverflow',
  'nyctaxi',
  'olist'
]);

function splitDatabaseList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getDatabaseNames(env = process.env) {
  const configured = splitDatabaseList(env.SQL_MASTERY_DATABASES);
  return configured.length ? configured : Array.from(DEFAULT_DATABASES);
}

function getDatabaseAliases(env = process.env) {
  return splitDatabaseList(env.SQL_MASTERY_DATABASE_ALIASES).reduce((aliases, pair) => {
    const equalsIndex = pair.indexOf('=');
    if (equalsIndex === -1) return aliases;

    const lessonName = pair.slice(0, equalsIndex).trim();
    const physicalName = pair.slice(equalsIndex + 1).trim();
    if (lessonName && physicalName) aliases[lessonName] = physicalName;
    return aliases;
  }, {});
}

function resolveDatabaseName(database, env = process.env) {
  const aliases = getDatabaseAliases(env);
  return aliases[database] || database;
}

function isAllowedDatabase(database, env = process.env) {
  return getDatabaseNames(env).includes(database);
}

function readPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildClientConfig(database, env = process.env) {
  const config = {
    host: env.PGHOST || 'localhost',
    port: readPositiveInteger(env.PGPORT, 5432),
    database: resolveDatabaseName(database, env),
    application_name: env.PGAPPNAME || 'sql-mastery-runner',
    statement_timeout: readPositiveInteger(env.SQL_MASTERY_STATEMENT_TIMEOUT_MS, 60000)
  };

  if (env.PGUSER) config.user = env.PGUSER;
  config.password = env.PGPASSWORD || '';

  if (env.PGSSLMODE && env.PGSSLMODE !== 'disable') {
    config.ssl = env.PGSSLMODE === 'require'
      ? { rejectUnauthorized: false }
      : true;
  }

  return config;
}

module.exports = {
  DEFAULT_DATABASES,
  buildClientConfig,
  getDatabaseNames,
  isAllowedDatabase,
  resolveDatabaseName
};
