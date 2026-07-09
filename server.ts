import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import { createApp } from './src/app';
import { createQueryService } from './src/query-service';
import { createProgressStore } from './src/progress-store';
import { createUserStore } from './src/user-store';
import { createAuthService } from './src/auth-service';
import { computeSnapshotHash } from './src/snapshot';
import { assertServedSnapshotsMatch, readRecordedSnapshot } from './src/snapshot-guard';

if (!process.env.SQL_MASTERY_SESSION_SECRET) {
  throw new Error('SQL_MASTERY_SESSION_SECRET is required. Set it in .env before starting the server.');
}

const queryService = createQueryService();
const dataDir = process.env.SQL_MASTERY_DATA_DIR || path.resolve(process.cwd(), 'data');
const progressStore = createProgressStore({ dir: path.join(dataDir, 'progress') });
const userStore = createUserStore({ dir: path.join(dataDir, 'users') });
const authService = createAuthService();

const preferredPort = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const app = createApp({ queryService, progressStore, userStore, authService });

function listen(port: number) {
  const server = app.listen(port, host, () => {
    const address = server.address() as any;
    console.log(`SQL Mastery Path running at http://${address.address}:${address.port}`);
  });

  server.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE' && port < preferredPort + 20) {
      listen(port + 1);
      return;
    }

    console.error(error);
    process.exitCode = 1;
  });

  async function shutdown() {
    server.close();
    await queryService.close();
    process.exit(0);
  }

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

async function bootstrap() {
  if (process.env.SQL_MASTERY_SKIP_SNAPSHOT_CHECK === 'true') {
    console.warn('SQL_MASTERY_SKIP_SNAPSHOT_CHECK=true: serving without the snapshot-identity guard.');
  } else {
    await assertServedSnapshotsMatch({
      databases: queryService.listDatabases(),
      computeHash: (database: string) => computeSnapshotHash(database, { service: queryService }),
      readRecorded: readRecordedSnapshot
    });
  }

  listen(preferredPort);
}

bootstrap().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  try {
    await queryService.close();
  } catch (closeError) {
    console.error(closeError);
  }
  process.exitCode = 1;
});
