import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.KR_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('KR_DATABASE_URL ou DATABASE_URL é obrigatório');

const migrationDir = path.resolve(new URL('.', import.meta.url).pathname, '..', 'migrations');
const client = new Client({ connectionString, connectionTimeoutMillis: 5_000 });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('CREATE TABLE IF NOT EXISTS runtime_schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const files = (await fs.readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort();
  for (const name of files) {
    const applied = await client.query('SELECT 1 FROM runtime_schema_migrations WHERE name = $1', [name]);
    if (applied.rowCount) continue;
    await client.query(await fs.readFile(path.join(migrationDir, name), 'utf8'));
    await client.query('INSERT INTO runtime_schema_migrations (name) VALUES ($1)', [name]);
    console.log(`applied ${name}`);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
