require('dotenv').config();

const { createApp } = require('./src/app');
const { createQueryService } = require('./src/query-service');

const queryService = createQueryService();
const app = createApp({ queryService });
const preferredPort = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

function listen(port) {
  const server = app.listen(port, host, () => {
    const address = server.address();
    console.log(`SQL Mastery Path running at http://${address.address}:${address.port}`);
  });

  server.on('error', (error) => {
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
