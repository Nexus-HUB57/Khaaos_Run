// ==============================================================================
// KHAAOS RUN - Economy 2PC Server
// Database connection via Drizzle ORM
//   - Produção: postgres.js (TCP) — DATABASE_URL=postgres://...
//   - Testes:   PGlite WASM embutido em-processo — DATABASE_URL=pglite:memory
//               (zero Docker/psql; o guard do repo proíbe vitest na raiz, e
//               suítes locais precisam rodar sem serviço Postgres externo)
// ==============================================================================

import { createRequire } from "node:module";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL ?? "postgres://localhost:5432/khaaos_economy";

// require síncrono p/ CJS interop estável — base = cwd do processo (economy-server
// quando roda npm test/build). createRequire(process.cwd()+"/") evita import.meta
// (que o build tsc NodeNext→CJS rejeita) mantendo o pacote PGlite fora do grafo
// de dependências de produção.
const nodeRequire = createRequire(process.cwd() + "/");

function createDb(): PostgresJsDatabase<typeof schema> {
  // ── Modo PGlite embutido (testes): Postgres WASM em-processo ─────────────
  if (connectionString.startsWith("pglite:")) {
    const { PGlite } = nodeRequire("@electric-sql/pglite");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle: drizzlePglite } = nodeRequire("drizzle-orm/pglite");
    const client = connectionString.includes("pglite:memory")
      ? new PGlite()
      : new PGlite(connectionString.replace("pglite:", ""));
    // Mesma API fluente de queries do driver postgres-js — cast seguro em runtime
    return drizzlePglite(client, { schema }) as unknown as PostgresJsDatabase<typeof schema>;
  }

  // ── Modo produção: postgres.js via TCP ────────────────────────────────────
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export const db = createDb();

export type Database = PostgresJsDatabase<typeof schema>;
