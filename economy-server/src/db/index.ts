// ==============================================================================
// KHAAOS RUN - Economy 2PC Server
// Database connection via Drizzle ORM + postgres.js
// ==============================================================================

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL ?? "postgres://localhost:5432/khaaos_economy";

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export type Database = typeof db;
