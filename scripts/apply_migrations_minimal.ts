#!/usr/bin/env node
// KHAAOS RUN — Mini-migrador standalone (desenvolvimento/rehearsal local)
// =======================================================================
// Aplica migrations/*.sql em ordem (split por --> statement-breakpoint)
// rastreando em _test_migrations_applied — mesma lógica do bootstrap das
// suítes tests/integration/*.test.ts, empacotada para uso fora do teste
// (ex.: subir o servidor de produção contra o PGlite socket local sem
// drizzle-kit, que exige journal/meta completo).
//
// Uso:
//   DATABASE_URL='postgresql://test:test@127.0.0.1:54329/postgres' \
//     node --import tsx scripts/apply_migrations_minimal.ts

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("DATABASE_URL é obrigatório.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 1 });

await pool.query(
  "CREATE TABLE IF NOT EXISTS _test_migrations_applied (tag text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
);
const { rows } = await pool.query<{ tag: string }>("SELECT tag FROM _test_migrations_applied");
const applied = new Set(rows.map((r) => r.tag));

const migrationsDir = join(process.cwd(), "migrations");
const files = readdirSync(migrationsDir)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();

for (const file of files) {
  if (applied.has(file)) {
    console.log(`  = ${file} (já aplicada)`);
    continue;
  }
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await pool.query(statement);
  }
  await pool.query("INSERT INTO _test_migrations_applied (tag) VALUES ($1)", [file]);
  console.log(`  + ${file} (${statements.length} statements)`);
}

console.log("Migrações aplicadas.");
await pool.end();
