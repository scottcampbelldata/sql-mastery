import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './src/app';
import { createQueryService } from './src/query-service';

const queryService = createQueryService();
const app = createApp({ queryService });
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
