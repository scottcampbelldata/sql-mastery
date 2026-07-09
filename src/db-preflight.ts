function missingDatabaseConfig(env: Partial<Pick<NodeJS.ProcessEnv, 'PGUSER' | 'PGPASSWORD'>> = process.env): string[] {
  const missing: string[] = [];
  if (!env.PGUSER) missing.push('PGUSER');
  if (!env.PGPASSWORD) missing.push('PGPASSWORD');
  return missing;
}

export {
  missingDatabaseConfig
};
