import { startServer } from './server.js';

const server = await startServer();
console.log(`Server running on port ${server.port} (dados em ${server.dataDir})`);

// Grava contas e denúncias pendentes antes de sair.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    try {
      server.flush();
    } finally {
      process.exit(0);
    }
  });
}
