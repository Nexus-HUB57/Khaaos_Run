// Khaaos Run — config vitest LOCAL do economy-server (2PC KRC).
// Sem este arquivo, o vitest sobe a árvore e carrega o vitest.config.ts da
// raiz do repo — onde o vitest é proibido pelo guard anti-reversão
// (tests/test-suite-guard.json) e não está instalado, quebrando o startup
// com ERR_MODULE_NOT_FOUND. Este config ancora a raiz do test runner AQUI.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
    // PGlite embutido (Postgres WASM em-processo) — sem Docker/psql externo.
    // O DDL das tabelas é aplicado no beforeAll da suíte (src/db/ddl.ts).
    env: {
      DATABASE_URL: 'pglite:memory',
    },
    testTimeout: 30000,
    reporters: ['default'],
  },
});
