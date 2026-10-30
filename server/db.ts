import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { metrics } from "./game/metrics";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── M3 — métricas de DB (staging SRE) ───────────────────────────────────────
// Samplers do pool (lidos no scrape; custo zero fora dele) + histograma de
// duração por query via wrapper no pool.query (o drizzle usa o mesmo pool).

metrics.gaugeSampler("khaaos_db_pool", { state: "total" }, () => pool.totalCount);
metrics.gaugeSampler("khaaos_db_pool", { state: "idle" }, () => pool.idleCount);
metrics.gaugeSampler("khaaos_db_pool", { state: "waiting" }, () => pool.waitingCount);

const originalQuery = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;
(pool as unknown as { query: (...args: unknown[]) => Promise<unknown> }).query = (
  ...args: unknown[]
): Promise<unknown> => {
  const started = process.hrtime.bigint();
  const result = originalQuery(...args);
  Promise.resolve(result)
    .catch(() => undefined)
    .finally(() => {
      metrics.observe("khaaos_db_query_duration_seconds", Number(process.hrtime.bigint() - started) / 1e9);
    });
  return result;
};

export const db = drizzle(pool, { schema });
