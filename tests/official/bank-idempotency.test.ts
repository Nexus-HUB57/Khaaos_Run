import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { after, test } from "node:test";
import express from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

const [{ registerApiRoutes }, { storage }] = await Promise.all([
  import("../../server/routes.ts"),
  import("../../server/storage.ts"),
]);

// ─── Harness HTTP (padrão routes-ownership) ──────────────────────────────────

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = req.get("x-test-user-id");
  (req as any).isAuthenticated = () => Boolean(userId);
  if (userId) {
    (req as any).user = {
      claims: { sub: userId },
      expires_at: Math.floor(Date.now() / 1000) + 60,
    };
  }
  next();
});

registerApiRoutes(app);

const server = createServer(app);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Porta de teste indisponível");
const baseUrl = `http://127.0.0.1:${address.port}`;

after(() => {
  server.close();
});

async function post(path: string, userId: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user-id": userId, ...headers },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, json };
}

// ─── 1) Enforcement uniforme do header em POST /api/bank/* (sem PG) ─────────

test("bank idempotência: deposit sem Idempotency-Key é rejeitado com 400 canônico", async () => {
  const { status, json } = await post("/api/bank/deposit", "player-bank-1", { amountUsd: "50.00" });
  assert.equal(status, 400);
  assert.match(String(json.message), /Idempotency-Key ausente ou inválido/);
});

test("bank idempotência: deposit com chave válida mantém o contrato de pagamentos congelado", async () => {
  const { status, json } = await post(
    "/api/bank/deposit",
    "player-bank-1",
    { amountUsd: "50.00" },
    { "Idempotency-Key": randomUUID() },
  );
  assert.equal(status, 503);
  assert.equal(json.code, "PAYMENTS_NOT_CONFIGURED");
});

test("bank idempotência: transfer sem Idempotency-Key é rejeitado com 400 canônico", async () => {
  const { status, json } = await post("/api/bank/transfer", "player-bank-1", { amountKrc: "10", destination: "bonus" });
  assert.equal(status, 400);
  assert.match(String(json.message), /Idempotency-Key ausente ou inválido/);
});

test("bank idempotência: Idempotency-Key com formato inválido (curto) é rejeitado", async () => {
  const { status } = await post(
    "/api/bank/transfer",
    "player-bank-1",
    { amountKrc: "10", destination: "bonus" },
    { "Idempotency-Key": "abc" },
  );
  assert.equal(status, 400);
});

// ─── 2) Replay/409/ledger contra PostgreSQL real (skip sem TEST_DATABASE_URL) ──

test(
  "bank idempotência PostgreSQL: replay devolve a MESMA resposta e o ledger não duplica",
  { skip: !testDatabaseUrl },
  async () => {
    const { Pool } = await import("pg");
    const url = new URL(testDatabaseUrl!);
    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!databaseName.endsWith("_test")) {
      throw new Error("TEST_DATABASE_URL precisa apontar para um banco descartável cujo nome termine em _test");
    }
    const pool = new Pool({ connectionString: testDatabaseUrl, max: 4 });
    const userId = `bank-idem-${randomUUID()}`;

    try {
      const baseTables = await readFile(new URL("../../tests/official/economy-postgres.test.ts", import.meta.url), "utf8");
      void baseTables; // DDL reutilizado via migrations abaixo
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bank_accounts (
          id SERIAL PRIMARY KEY, user_id TEXT NOT NULL UNIQUE,
          weapons_balance NUMERIC NOT NULL DEFAULT 0,
          bonus_balance NUMERIC NOT NULL DEFAULT 0,
          fbm_balance NUMERIC NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS transactions (
          id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
          amount_krc NUMERIC NOT NULL, amount_usd NUMERIC,
          description TEXT, timestamp TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS loans (
          id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, principal NUMERIC NOT NULL,
          interest NUMERIC NOT NULL, total_due NUMERIC NOT NULL,
          days_remaining INTEGER NOT NULL, is_paid BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS items (
          id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
          type TEXT NOT NULL, rarity TEXT NOT NULL DEFAULT 'COMUM',
          durability NUMERIC NOT NULL DEFAULT 100, max_durability NUMERIC NOT NULL DEFAULT 100,
          is_equipped BOOLEAN DEFAULT FALSE, stats JSONB, image_url TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS player_stats (
          id SERIAL PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, rank TEXT NOT NULL DEFAULT 'ZHEERS',
          specialization_id TEXT,
          xp INTEGER NOT NULL DEFAULT 0, health INTEGER NOT NULL DEFAULT 100,
          max_health INTEGER NOT NULL DEFAULT 100, energy INTEGER NOT NULL DEFAULT 100,
          max_energy INTEGER NOT NULL DEFAULT 100, status TEXT NOT NULL DEFAULT 'VIVO',
          kills INTEGER NOT NULL DEFAULT 0, deaths INTEGER NOT NULL DEFAULT 0,
          last_salary_date TIMESTAMP, rating INTEGER NOT NULL DEFAULT 1000,
          matches_played INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0,
          top5 INTEGER NOT NULL DEFAULT 0, season_kills INTEGER NOT NULL DEFAULT 0
        );
      `);
      await pool.query(await readFile(new URL("../../migrations/0002_economy_idempotency.sql", import.meta.url), "utf8"));
      await pool.query(await readFile(new URL("../../migrations/0003_economy_invariants.sql", import.meta.url), "utf8"));
      await pool.query(
        "INSERT INTO bank_accounts (user_id, weapons_balance) VALUES ($1, 100) ON CONFLICT (user_id) DO UPDATE SET weapons_balance = 100",
        [userId],
      );

      const idempotencyKey = randomUUID();
      const body = { amountKrc: "25.50", destination: "bonus" };

      const first = await post("/api/bank/transfer", userId, body, { "Idempotency-Key": idempotencyKey });
      assert.equal(first.status, 200);
      const operationId = first.json.operationId;
      assert.ok(typeof operationId === "string" && operationId.length > 0);

      // Replay EXATO (mesma chave + mesmo corpo): resposta idêntica, sem nova execução.
      const replay = await post("/api/bank/transfer", userId, body, { "Idempotency-Key": idempotencyKey });
      assert.equal(replay.status, 200);
      assert.deepEqual(replay.json, first.json);

      // Mesma chave com CORPO DIFERENTE: 409 (conflito de idempotência).
      const conflict = await post("/api/bank/transfer", userId, { amountKrc: "99", destination: "fbm" }, { "Idempotency-Key": idempotencyKey });
      assert.equal(conflict.status, 409);

      // O ledger registra UM par balanceado (débito/crédito), não duplicado.
      const ledger = await pool.query(
        "SELECT account_code, side, amount_krc FROM economy_ledger_entries WHERE user_id = $1 ORDER BY account_code",
        [userId],
      );
      assert.equal(ledger.rowCount, 2);
      const debit = ledger.rows.find((row) => row.side === "DEBIT");
      const credit = ledger.rows.find((row) => row.side === "CREDIT");
      assert.ok(debit && credit);
      assert.equal(String(debit.amount_krc), String(credit.amount_krc));
      assert.equal(debit.account_code, "wallet.weapons");
      assert.equal(credit.account_code, "wallet.bonus");

      // Saldo descontado exatamente UMA vez.
      const account = await pool.query("SELECT weapons_balance::text, bonus_balance::text FROM bank_accounts WHERE user_id = $1", [userId]);
      assert.equal(account.rows[0].weapons_balance, "74.50");
      assert.equal(account.rows[0].bonus_balance, "25.50");
    } finally {
      await pool.end();
    }
  },
);
