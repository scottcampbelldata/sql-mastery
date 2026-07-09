const DEFAULT_DATABASES = Object.freeze([
  'aperture',
  'sideline',
  'rove'
]);

function splitDatabaseList(value: string | undefined): string[] {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getDatabaseNames(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = splitDatabaseList(env.SQL_MASTERY_DATABASES);
  return configured.length ? configured : Array.from(DEFAULT_DATABASES);
}

function getDatabaseAliases(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return splitDatabaseList(env.SQL_MASTERY_DATABASE_ALIASES).reduce((aliases: Record<string, string>, pair) => {
    const equalsIndex = pair.indexOf('=');
    if (equalsIndex === -1) return aliases;

    const logicalName = pair.slice(0, equalsIndex).trim();
    const physicalName = pair.slice(equalsIndex + 1).trim();
    if (logicalName && physicalName) aliases[logicalName] = physicalName;
    return aliases;
  }, {});
}

function resolveDatabaseName(database: string, env: NodeJS.ProcessEnv = process.env): string {
  const aliases = getDatabaseAliases(env);
  return aliases[database] || database;
}

function isAllowedDatabase(database: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return getDatabaseNames(env).includes(database);
}

function readPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildClientConfig(database: string, env: NodeJS.ProcessEnv = process.env): any {
  const config: any = {
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

export {
  DEFAULT_DATABASES,
  buildClientConfig,
  getDatabaseNames,
  isAllowedDatabase,
  resolveDatabaseName
};
