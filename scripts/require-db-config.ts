import { missingDatabaseConfig } from '../src/db-preflight';

const missing = missingDatabaseConfig();

if (missing.length > 0) {
  console.error(`Database-backed commands require ${missing.join(', ')}. Set local PostgreSQL credentials and retry.`);
  process.exit(1);
}
