import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import { createApp } from './src/app';
import { createQueryService } from './src/query-service';
import { createProgressStore } from './src/progress-store';
import { createUserStore } from './src/user-store';
import { createAuthService } from './src/auth-service';

const queryService = createQueryService();
const dataDir = process.env.SQL_MASTERY_DATA_DIR || path.resolve(process.cwd(), 'data');
const progressStore = createProgressStore({ dir: path.join(dataDir, 'progress') });
const userStore = createUserStore({ dir: path.join(dataDir, 'users') });
const authService = createAuthService();

const app = createApp({ queryService, progressStore, userStore, authService });
const preferredPort = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

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

listen(preferredPort);
