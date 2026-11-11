import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL é obrigatório; use somente um PostgreSQL descartável *_test.");
const parsedUrl = new URL(testDatabaseUrl);
const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ""));
if (!(["postgres:", "postgresql:"].includes(parsedUrl.protocol)) || !databaseName.endsWith("_test") || !["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)) {
  throw new Error("Proteção: teste local-auth aceita somente PostgreSQL local com database cujo nome termina em _test.");
}
if (process.env.NODE_ENV === "production") throw new Error("Teste PostgreSQL não pode executar com NODE_ENV=production.");
process.env.DATABASE_URL = testDatabaseUrl;

const [{ pool }, { PostgresLocalAuthRepository }, { AuthStorage }] = await Promise.all([
  import("../../server/db.ts"),
  import("../../server/replit_integrations/auth/localAuthStore.postgres.ts"),
  import("../../server/replit_integrations/auth/storage.ts"),
]);
const repository = new PostgresLocalAuthRepository();
const oidcAuthStorage = new AuthStorage();
const userIds: string[] = [];

async function applyMigrations(): Promise<void> {
  const lockKey = 662901; // khaaos_local_auth_test_migrations
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [lockKey]);
    await client.query("CREATE TABLE IF NOT EXISTS _test_migrations_applied (tag text PRIMARY KEY, applied_at timestamptz DEFAULT now())");
    const { rows } = await client.query<{ tag: string }>("SELECT tag FROM _test_migrations_applied");
    const applied = new Set(rows.map((row) => row.tag));
    const migrationsDir = join(process.cwd(), "migrations");
    const files = readdirSync(migrationsDir).filter((file) => /^\d{4}_.*\.sql$/.test(file)).sort();

    if (applied.size === 0) {
      const existing = await client.query<{ table: string | null }>("SELECT to_regclass('public.bank_accounts') AS table");
      if (existing.rows[0]?.table) {
        for (const file of files) {
          await client.query("INSERT INTO _test_migrations_applied (tag) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
        }
        applied.clear();
        files.forEach((file) => applied.add(file));
      }
    }

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
        await client.query(statement);
      }
      await client.query("INSERT INTO _test_migrations_applied (tag) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
      applied.add(file);
    }

    // Older disposable test databases may already have the marker table but
    // predate this feature; ensure the newly-added auth tables really exist.
    const authTables = await client.query<{ credentials: string | null }>("SELECT to_regclass('public.local_auth_credentials') AS credentials");
    if (!authTables.rows[0]?.credentials) {
      const sql = readFileSync(join(migrationsDir, "0013_local-auth.sql"), "utf8");
      for (const statement of sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) await client.query(statement);
      await client.query("INSERT INTO _test_migrations_applied (tag) VALUES ($1) ON CONFLICT DO NOTHING", ["0013_local-auth.sql"]);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [lockKey]).catch(() => undefined);
    client.release();
  }
}

before(async () => {
  await applyMigrations();
});

after(async () => {
  const sessionIds = userIds.map((userId) => `local-auth-${userId}`);
  if (sessionIds.length) await pool.query("DELETE FROM sessions WHERE sid = ANY($1::varchar[])", [sessionIds]);
  if (userIds.length) await pool.query("DELETE FROM users WHERE id = ANY($1::varchar[])", [userIds]);
  await pool.end();
});

test("local auth PostgreSQL: concorrência cria no máximo uma identidade por email", async () => {
  const userIdA = randomUUID();
  const userIdB = randomUUID();
  const email = `auth-${randomUUID()}@example.test`;
  userIds.push(userIdA, userIdB);
  const results = await Promise.all([
    repository.createPendingAccount({ userId: userIdA, email, firstName: "Auth", lastName: null, passwordHash: "scrypt-hash-a", tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000) }),
    repository.createPendingAccount({ userId: userIdB, email, firstName: "Auth", lastName: null, passwordHash: "scrypt-hash-b", tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000) }),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  const result = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM local_auth_credentials WHERE email_normalized = $1", [email]);
  assert.equal(result.rows[0].count, "1");
});

test("local auth PostgreSQL: verificação e reset são transacionais e tokens one-time", async () => {
  const userId = randomUUID();
  userIds.push(userId);
  const email = `verify-${randomUUID()}@example.test`;
  const verificationHash = randomUUID().replaceAll("-", "").padEnd(64, "a").slice(0, 64);
  const created = await repository.createPendingAccount({
    userId, email, firstName: "Verify", lastName: "Player", passwordHash: "scrypt$stored-hash",
    tokenHash: verificationHash, expiresAt: new Date(Date.now() + 60_000),
  });
  assert.equal(created, true);
  assert.equal((await repository.findByEmail(email))?.emailVerifiedAt, null);
  assert.equal(await repository.consumeEmailVerificationToken(verificationHash, new Date()), true);
  assert.equal(await repository.consumeEmailVerificationToken(verificationHash, new Date()), false);
  assert.ok((await repository.findByEmail(email))?.emailVerifiedAt);

  const recipient = await repository.createPasswordResetToken(email, "b".repeat(64), new Date(Date.now() + 60_000));
  assert.equal(recipient?.email, email);
  await pool.query("INSERT INTO sessions (sid, sess, expire) VALUES ($1, $2::jsonb, now() + interval '1 day')", [
    `local-auth-${userId}`,
    JSON.stringify({ passport: { user: { localAuth: true, claims: { sub: userId } } } }),
  ]);
  assert.equal(await repository.consumePasswordResetToken("b".repeat(64), "scrypt$new-hash", new Date()), true);
  assert.equal(await repository.consumePasswordResetToken("b".repeat(64), "scrypt$replay", new Date()), false);
  assert.equal((await pool.query("SELECT sid FROM sessions WHERE sid = $1", [`local-auth-${userId}`])).rowCount, 0);
  assert.equal((await repository.findByEmail(email))?.passwordHash, "scrypt$new-hash");
});

test("local auth PostgreSQL: email já usado por usuário OIDC não é associado nem cria credencial local", async () => {
  const oidcUserId = randomUUID();
  const localUserId = randomUUID();
  userIds.push(oidcUserId, localUserId);
  const email = `oidc-${randomUUID()}@example.test`;
  await pool.query("INSERT INTO users (id, email, first_name) VALUES ($1, $2, 'OIDC')", [oidcUserId, email]);
  const created = await repository.createPendingAccount({
    userId: localUserId, email: email.toUpperCase(), firstName: "Local", lastName: null,
    passwordHash: "scrypt$hash", tokenHash: "c".repeat(64), expiresAt: new Date(Date.now() + 60_000),
  });
  assert.equal(created, false);
  assert.equal((await pool.query("SELECT user_id FROM local_auth_credentials WHERE email_normalized = lower($1)", [email])).rowCount, 0);
});

test("local auth PostgreSQL: cadastro local e primeiro upsert OIDC serializam email com capitalização diferente", async () => {
  const localUserId = randomUUID();
  const oidcUserId = randomUUID();
  userIds.push(localUserId, oidcUserId);
  const email = `race-${randomUUID()}@example.test`;
  const localPromise = repository.createPendingAccount({
    userId: localUserId, email, firstName: "Local", lastName: null,
    passwordHash: "scrypt$local", tokenHash: randomUUID().replaceAll("-", "").padEnd(64, "a").slice(0, 64),
    expiresAt: new Date(Date.now() + 60_000),
  });
  const oidcPromise = oidcAuthStorage.upsertUser({
    id: oidcUserId, email: email.toUpperCase(), firstName: "OIDC", lastName: "Player", profileImageUrl: null,
  });
  const [localResult, oidcResult] = await Promise.allSettled([localPromise, oidcPromise]);
  const localWon = localResult.status === "fulfilled" && localResult.value;
  const oidcWon = oidcResult.status === "fulfilled";
  assert.notEqual(localWon, oidcWon, "somente um provider pode criar a identidade para o email normalizado");
  const identities = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM users WHERE lower(btrim(email)) = $1", [email]);
  assert.equal(identities.rows[0].count, "1");
  const localCredentials = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM local_auth_credentials WHERE email_normalized = $1", [email]);
  assert.equal(localCredentials.rows[0].count, localWon ? "1" : "0");
});
