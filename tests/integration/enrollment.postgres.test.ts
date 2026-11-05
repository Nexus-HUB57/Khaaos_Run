// KHAAOS RUN — Enrollment PostgreSQL + Ledger Integration Tests (Fase 47.1)
// ===========================================================================
// Complemento E2E ao port canônico do #252 (fluxo 3 etapas + taxa U$1
// idempotente): persistência REAL (store PostgreSQL, migration 0011) e
// ledger double-entry de verdade (economy_ledger_entries + bank_accounts).
//
//   1. Fluxo completo → ledger BALANCEADO por operação (fee + bonus) e
//      carteira bônus creditada (+500) em bank_accounts
//   2. Replay da MESMA Idempotency-Key → mesma resposta, ZERO linhas novas
//      no ledger, carteira intacta (crédito único garantido pelo unique)
//   3. Chave DIFERENTE pós-COMPLETED → 409 (não paga duas vezes)
//   4. Persistência: NOVA instância da store reconstrói a sessão COMPLETED
//      (sobrevive a restart do processo)
//   5. Ledger falho → 503 e a sessão PERMANECE AWAITING_FEE (guard financeiro
//      antes de marcar pagamento)
//   6. Invariante: ΣDEBIT = ΣCREDIT por operationId (trigger 0004 de reserva)
//
// Requisitos: TEST_DATABASE_URL (PostgreSQL *_test local ou PGlite socket).

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL é obrigatório para a suíte de enrollment; nenhum teste será executado sem um DB de teste explícito.");
}

let parsedDatabaseUrl: URL;
try {
  parsedDatabaseUrl = new URL(testDatabaseUrl);
} catch {
  throw new Error("TEST_DATABASE_URL não é uma URL PostgreSQL válida.");
}
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\//, ""));
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (parsedDatabaseUrl.protocol !== "postgres:" && parsedDatabaseUrl.protocol !== "postgresql:") {
  throw new Error("TEST_DATABASE_URL precisa usar o protocolo postgres:// ou postgresql://.");
}
if (!databaseName.endsWith("_test") || !allowedHosts.has(parsedDatabaseUrl.hostname)) {
  throw new Error("Proteção de segurança: testes PostgreSQL aceitam somente host local e database com sufixo _test.");
}
if (process.env.NODE_ENV === "production") {
  throw new Error("A suíte PostgreSQL não pode ser executada com NODE_ENV=production.");
}

// server/db.ts lê DATABASE_URL na inicialização do módulo.
process.env.DATABASE_URL = testDatabaseUrl;

const [{ pool }, { createPostgresEnrollmentStore }, { recordEnrollmentFeeLedger, getBonusBalance }, { createEnrollmentRouter }] = await Promise.all([
  import("../../server/db.ts"),
  import("../../server/game/enrollmentStore.postgres.ts"),
  import("../../server/game/enrollmentLedger.ts"),
  import("../../server/routes/enrollment.ts"),
]);

// ─── Bootstrap: mini-migrador idempotente (mesma escola da suíte 2PC) ──────

async function applyMigrations(): Promise<void> {
  const LOCK_KEY = 778833; // khaaos_enrollment_ledger_test_migrations
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    try {
      await client.query(
        "CREATE TABLE IF NOT EXISTS _test_migrations_applied (tag text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
      );
      const { rows } = await client.query<{ tag: string }>("SELECT tag FROM _test_migrations_applied");
      const applied = new Set(rows.map((r) => r.tag));

      const migrationsDir = join(process.cwd(), "migrations");
      const files = readdirSync(migrationsDir)
        .filter((f) => /^\d{4}_.*\.sql$/.test(f))
        .sort();

      if (applied.size === 0) {
        const pre = await client.query<{ t: string | null }>(
          "SELECT to_regclass('public.bank_accounts') AS t",
        );
        if (pre.rows[0]?.t) {
          for (const file of files) {
            await client.query(
              "INSERT INTO _test_migrations_applied (tag) VALUES ($1) ON CONFLICT DO NOTHING",
              [file],
            );
          }
          return;
        }
      }

      for (const file of files) {
        if (applied.has(file)) continue;
        const sql = readFileSync(join(migrationsDir, file), "utf8");
        const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
        for (const statement of statements) {
          await client.query(statement);
        }
        await client.query("INSERT INTO _test_migrations_applied (tag) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

// ─── App de teste (auth fake por header, store/ledger REAIS) ───────────────

const fakeAuth = (req: Request, _res: Response, next: NextFunction) => {
  (req as Request & { user?: unknown }).user = {
    claims: { sub: req.get("x-test-user") ?? "op-test" },
  };
  next();
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(createEnrollmentRouter({
    authenticate: fakeAuth,
    store: createPostgresEnrollmentStore(),
    ledger: { recordEnrollmentFeeLedger },
    // Somente esta suíte contra PostgreSQL *_test simula a confirmação do provedor.
    allowSimulatedFeeForTests: true,
  }));
  return app;
}

async function enrollThroughTerms(app: Express, userId: string): Promise<string> {
  const start = await fetch(`${app}/api/enrollment/start`, { method: "POST", headers: { "x-test-user": userId } });
  assert.equal(start.status, 201);
  const { protocol } = (await start.json()) as { protocol: string };
  await fetch(`${app}/api/enrollment/steps/data`, {
    method: "POST",
    headers: { "x-test-user": userId, "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: "Operadora Teste", birthDate: "1995-06-15", country: "BR" }),
  });
  await fetch(`${app}/api/enrollment/steps/terms`, {
    method: "POST",
    headers: { "x-test-user": userId, "Content-Type": "application/json" },
    body: JSON.stringify({ accepted: true }),
  });
  return protocol;
}

const FEE_KEY = "fee-key-0123456789abcdef";

test.before(applyMigrations);

test.after(async () => {
  await pool.end();
});

test("fluxo completo com ledger real: operações balanceadas + carteira bônus +500", async () => {
  const expressApp = buildApp();
  const server = expressApp.listen(0);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const userId = `op-${randomUUID()}`;

  try {
    const protocol = await enrollThroughTerms(base, userId);

    const feeRes = await fetch(`${base}/api/enrollment/fee`, {
      method: "POST",
      headers: { "x-test-user": userId, "Content-Type": "application/json", "Idempotency-Key": FEE_KEY },
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(feeRes.status, 200);
    const feeBody = await feeRes.json();
    assert.equal(feeBody.step, "COMPLETED");
    assert.equal(feeBody.bonusKrcCredited, 500);

    // Ledger: 4 linhas (fee 2 + bonus 2), 2 operações, TODAS balanceadas.
    const { rows: ledger } = await pool.query<{ operation_id: string; account_code: string; side: string; amount_krc: string }>(
      `SELECT operation_id, account_code, side, amount_krc
         FROM economy_ledger_entries
        WHERE user_id = $1 AND idempotency_key LIKE 'enroll-%'
        ORDER BY id`,
      [userId],
    );
    assert.equal(ledger.length, 4, `esperadas 4 linhas de ledger, veio ${ledger.length}`);

    const balances = new Map<string, { debit: number; credit: number }>();
    for (const row of ledger) {
      const op = balances.get(row.operation_id) ?? { debit: 0, credit: 0 };
      if (row.side === "DEBIT") op.debit += Number(row.amount_krc);
      else op.credit += Number(row.amount_krc);
      balances.set(row.operation_id, op);
    }
    assert.equal(balances.size, 2, "devem ser exatamente 2 operações (fee + bonus)");
    for (const [opId, sums] of balances) {
      assert.equal(sums.debit, sums.credit, `operação ${opId} não balanceada`);
    }

    const accounts = ledger.map((r) => `${r.side}:${r.account_code}`).sort();
    assert.deepEqual(accounts, [
      "CREDIT:system.item_sales",
      "CREDIT:wallet.bonus",
      "DEBIT:equity.opening_balance",
      "DEBIT:external.deposit",
    ]);

    // Carteira real: bônus 500 creditado.
    assert.equal(await getBonusBalance(userId), "500");

    // Sessão persistida com step COMPLETED.
    const { rows: sessions } = await pool.query<{ step: string; protocol: string }>(
      "SELECT step, protocol FROM enrollment_sessions WHERE user_id = $1",
      [userId],
    );
    assert.equal(sessions[0]?.step, "COMPLETED");
    assert.equal(sessions[0]?.protocol, protocol);
  } finally {
    server.close();
  }
});

test("replay da MESMA Idempotency-Key: mesma resposta, ZERO linhas novas, carteira intacta", async () => {
  const expressApp = buildApp();
  const server = expressApp.listen(0);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const userId = `op-${randomUUID()}`;

  try {
    await enrollThroughTerms(base, userId);
    const first = await fetch(`${base}/api/enrollment/fee`, {
      method: "POST",
      headers: { "x-test-user": userId, "Content-Type": "application/json", "Idempotency-Key": FEE_KEY },
      body: JSON.stringify({ confirm: true }),
    });
    const firstBody = await first.json();

    const { rows: before } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM economy_ledger_entries WHERE user_id = $1", [userId],
    );
    const bonusBefore = await getBonusBalance(userId);

    const replay = await fetch(`${base}/api/enrollment/fee`, {
      method: "POST",
      headers: { "x-test-user": userId, "Content-Type": "application/json", "Idempotency-Key": FEE_KEY },
      body: JSON.stringify({ confirm: true }),
    });
    const replayBody = await replay.json();
    assert.equal(replay.status, 200);
    assert.deepEqual(replayBody, firstBody, "replay deve devolver a resposta original");

    const { rows: afterRows } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM economy_ledger_entries WHERE user_id = $1", [userId],
    );
    assert.equal(afterRows[0].n, before[0].n, "ledger duplicou no replay");
    assert.equal(await getBonusBalance(userId), bonusBefore, "carteira duplicou no replay");
  } finally {
    server.close();
  }
});

test("chave DIFERENTE após COMPLETED: 409 e nenhum novo movimento financeiro", async () => {
  const expressApp = buildApp();
  const server = expressApp.listen(0);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const userId = `op-${randomUUID()}`;

  try {
    await enrollThroughTerms(base, userId);
    await fetch(`${base}/api/enrollment/fee`, {
      method: "POST",
      headers: { "x-test-user": userId, "Content-Type": "application/json", "Idempotency-Key": FEE_KEY },
      body: JSON.stringify({ confirm: true }),
    });

    const { rows: before } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM economy_ledger_entries WHERE user_id = $1", [userId],
    );

    const secondKey = "fee-key-fedcba9876543210";
    const res = await fetch(`${base}/api/enrollment/fee`, {
      method: "POST",
      headers: { "x-test-user": userId, "Content-Type": "application/json", "Idempotency-Key": secondKey },
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(res.status, 409, "segunda taxa com chave nova deve ser recusada");

    const { rows: afterRows } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM economy_ledger_entries WHERE user_id = $1", [userId],
    );
    assert.equal(afterRows[0].n, before[0].n, "ledger ganhou linhas após 409");
  } finally {
    server.close();
  }
});

test("persistência: NOVA instância da store reconstrói a sessão COMPLETED", async () => {
  const expressApp = buildApp();
  const server = expressApp.listen(0);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const userId = `op-${randomUUID()}`;

  try {
    const protocol = await enrollThroughTerms(base, userId);
    await fetch(`${base}/api/enrollment/fee`, {
      method: "POST",
      headers: { "x-test-user": userId, "Content-Type": "application/json", "Idempotency-Key": FEE_KEY },
      body: JSON.stringify({ confirm: true }),
    });
    server.close();

    // "Restart": app novo, store NOVA apontando para o MESMO banco.
    const expressApp2 = buildApp();
    const server2 = expressApp2.listen(0);
    const base2 = `http://127.0.0.1:${(server2.address() as { port: number }).port}`;
    try {
      // start em sessão existente → retomada (200, mesmo protocolo, sem reset)
      const resumed = await fetch(`${base2}/api/enrollment/start`, {
        method: "POST", headers: { "x-test-user": userId },
      });
      assert.equal(resumed.status, 200);
      const body = await resumed.json();
      assert.equal(body.resumed, true);
      assert.equal(body.protocol, protocol);
      assert.equal(body.step, "COMPLETED");
      assert.equal(body.fee.krcCredited, 100);

      const status = await fetch(`${base2}/api/enrollment/status`, { headers: { "x-test-user": userId } });
      assert.equal(status.status, 200);
      assert.equal((await status.json()).step, "COMPLETED");
    } finally {
      server2.close();
    }
  } finally {
    void base;
  }
});

test("ledger falho → 503 e a sessão permanece AWAITING_FEE (guard financeiro)", async () => {
  const failingLedger = {
    async recordEnrollmentFeeLedger(): Promise<{ feeRecorded: boolean; bonusRecorded: boolean }> {
      throw new Error("postgres indisponível (fixture)");
    },
  };
  const app = express();
  app.use(express.json());
  app.use(createEnrollmentRouter({
    authenticate: fakeAuth,
    store: createPostgresEnrollmentStore(),
    ledger: failingLedger,
    allowSimulatedFeeForTests: true,
  }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const userId = `op-${randomUUID()}`;

  try {
    await enrollThroughTerms(base, userId);
    const res = await fetch(`${base}/api/enrollment/fee`, {
      method: "POST",
      headers: { "x-test-user": userId, "Content-Type": "application/json", "Idempotency-Key": FEE_KEY },
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(res.status, 503);

    const status = await fetch(`${base}/api/enrollment/status`, { headers: { "x-test-user": userId } });
    assert.equal((await status.json()).step, "AWAITING_FEE", "sessão não pode marcar pagamento com ledger falho");

    const { rows } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM economy_ledger_entries WHERE user_id = $1", [userId],
    );
    assert.equal(rows[0].n, 0, "nenhuma linha de ledger pode existir após falha");
  } finally {
    server.close();
  }
});
