import { startServer } from './server.js';

const server = await startServer();
console.log(`Server running on port ${server.port} (dados em ${server.dataDir})`);

// Encerra as conexões e fecha o banco antes de sair; se travar, sai assim mesmo.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    setTimeout(() => process.exit(0), 3000).unref();
    server.close().finally(() => process.exit(0));
  });
}
