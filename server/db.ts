import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

export let pool: pg.Pool | null = null;
export let db: any = null;

const isLocalhostDb =
  !process.env.DATABASE_URL ||
  process.env.DATABASE_URL.includes("localhost") ||
  process.env.DATABASE_URL.includes("127.0.0.1");

if (process.env.DATABASE_URL && !isLocalhostDb) {
  try {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
  } catch (err) {
    console.warn("[AI Studio] Failed to connect to PostgreSQL — using in-memory mock", err);
  }
}

if (!db) {
  console.warn("[AI Studio] Database not connected — in-memory fallback active");
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: any) => d?.data ?? {},
    update: async (d: any) => d?.data ?? {},
    delete: async () => ({}),
  };
  const createChainable = (): any =>
    new Proxy(() => {}, {
      apply: () => createChainable(),
      get: (_, prop) => {
        if (prop === "then") return (resolve: any) => resolve([]);
        if (prop === "catch") return () => createChainable();
        return createChainable();
      },
    });

  db = new Proxy({}, {
    get: (_, prop) => {
      if (prop === "query") return new Proxy({}, { get: () => noOp });
      if (prop === "transaction") return async (fn: any) => fn(db);
      if (["select", "insert", "update", "delete"].includes(String(prop))) {
        return () => createChainable();
      }
      return createChainable();
    },
  });
}
