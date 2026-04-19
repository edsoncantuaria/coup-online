import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['engine/**/*.test.ts', 'campaign/**/*.test.ts'],
    /** Simulações longas (várias sementes × jogadores). */
    testTimeout: 30_000,
    hookTimeout: 15_000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: false },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['engine/**/*.ts'],
      exclude: [
        'engine/**/__tests__/**',
        'engine/**/*.test.ts',
        /** Orquestração de bots — foco da cobertura é `CoupEngine`. */
        'engine/BotManager.ts',
      ],
    },
  },
});
