// KHAAOS RUN — Enrollment Integration Tests (PostgreSQL end-to-end)
// ===================================================================
// Suíte E2E do alistamento canônico (Sprint 1.1/T1.1 — contrato README
// "Console Web + Mundos canônicos, 2026-11-02"):
//
//   1. Alistamento feliz: POST → protocolo KR-REG-<base36>, taxa 100 KRC
//      (DEBIT external.deposit / CREDIT system.item_sales) + bônus 500 KRC
//      (DEBIT equity.opening_balance / CREDIT wallet.bonus) + carteira 500
//   2. Idempotência: 2ª chamada → alreadyPaid:true, NENHUMA linha nova no
//      ledger, NENHUM usuário novo (não duplica cobrança)
//   3. Corrida: dois POSTs concorrentes para o mesmo username convergem
//      para UM alistamento
//   4. Bônus só após taxa: as duas operações existem juntas; fee sem bonus
//      é impossível por construção (mesma transação) — e o ledger fica
//      BALANCEADO por operação (trigger 0004)
//   5. Retomada de sessão: getStatus reconhece alistado; GET em username
//      novo → 404
//   6. Username inválido → 400 (padrão de caracteres respeitado)
//
// Requisitos: TEST_DATABASE_URL (PostgreSQL local *_test ou PGlite socket).
// Bootstrap: mini-migrador idempotente (mesma escola da suíte 2PC).

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

const [{ pool }, { EnrollmentService, ENROLLMENT_FEE_KRC, ENROLLMENT_WELCOME_BONUS_KRC }] = await Promise.all([
  import("../../server/db.ts"),
  import("../../server/game/enrollmentService.ts"),
]);

// ─── Bootstrap: mini-migrador idempotente (mesma escola da suíte 2PC) ──────

async function applyMigrations(): Promise<void> {
  const LOCK_KEY = 778822; // khaaos_enrollment_test_migrations
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

// ─── Suite ───────────────────────────────────────────────────────────────────

const service = new EnrollmentService();

function uniqueUsername(): string {
  // 3–24 chars, [a-zA-Z0-9_-]: prefixo + sufixo uuid curto.
  return `op-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

test.before(applyMigrations);

test.after(async () => {
  await pool.end();
});

test("alistamento feliz: protocolo KR-REG-<base36>, taxa 100 KRC e bônus 500 KRC após a taxa", async () => {
  const username = uniqueUsername();
  const result = await service.enroll(username);

  assert.equal(result.status, 201);
  assert.equal(result.body.enrollmentPaid, true);
  assert.equal(result.body.alreadyPaid, false);
  assert.match(result.body.protocol, /^KR-REG-[A-Z0-9]{10}$/);
  assert.equal(result.body.fee.usd, "1.00");
  assert.equal(result.body.fee.krc, ENROLLMENT_FEE_KRC);
  assert.equal(result.body.welcomeBonusKrc, ENROLLMENT_WELCOME_BONUS_KRC);
  assert.equal(result.body.wallet.bonus, ENROLLMENT_WELCOME_BONUS_KRC);

  // Ledger: exatamente 2 operações, 2 linhas cada, TODAS balanceadas.
  const { rows: ledger } = await pool.query<{ operation_id: string; account_code: string; side: string; amount_krc: string }>(
    `SELECT l.operation_id, l.account_code, l.side, l.amount_krc
       FROM economy_ledger_entries l
       JOIN enrollments e ON (l.idempotency_key = 'enrollment.fee.' || e.protocol OR l.idempotency_key = 'enrollment.bonus.' || e.protocol)
      WHERE e.username = $1
      ORDER BY l.id`,
    [username],
  );
  assert.equal(ledger.length, 4, `esperadas 4 linhas de ledger (fee + bonus), veio ${ledger.length}`);

  const byOperation = new Map<string, { debit: number; credit: number }>();
  for (const row of ledger) {
    const op = byOperation.get(row.operation_id) ?? { debit: 0, credit: 0 };
    if (row.side === "DEBIT") op.debit += Number(row.amount_krc);
    else op.credit += Number(row.amount_krc);
    byOperation.set(row.operation_id, op);
  }
  assert.equal(byOperation.size, 2, "devem ser exatamente 2 operações (fee e bonus)");
  for (const [opId, sums] of byOperation) {
    assert.equal(sums.debit, sums.credit, `operação ${opId} não balanceada (trigger 0004 deveria ter barrado)`);
  }

  // Contas canônicas: fee external.deposit→system.item_sales; bonus equity→wallet.bonus.
  const accounts = ledger.map((r) => `${r.side}:${r.account_code}`).sort();
  assert.deepEqual(accounts.sort(), [
    "CREDIT:system.item_sales",
    "CREDIT:wallet.bonus",
    "DEBIT:equity.opening_balance",
    "DEBIT:external.deposit",
  ].sort());

  // Carteira: bônus creditado em bank_accounts.bonus_balance.
  const { rows: wallet } = await pool.query<{ bonus_balance: string }>(
    `SELECT ba.bonus_balance FROM bank_accounts ba JOIN enrollments e ON e.user_id = ba.user_id WHERE e.username = $1`,
    [username],
  );
  assert.equal(wallet[0]?.bonus_balance, "500");
});

test("idempotência: 2ª chamada → alreadyPaid:true SEM novas linhas de ledger nem usuários", async () => {
  const username = uniqueUsername();
  const first = await service.enroll(username);
  assert.equal(first.status, 201);

  const { rows: ledgerBefore } = await pool.query(
    "SELECT count(*)::int AS n FROM economy_ledger_entries WHERE idempotency_key IN ($1, $2)",
    [`enrollment.fee.${first.body.protocol}`, `enrollment.bonus.${first.body.protocol}`],
  );
  const { rows: usersBefore } = await pool.query<{ first_name: string; n: number }>(
    "SELECT first_name, count(*)::int AS n FROM users WHERE first_name = $1 GROUP BY first_name",
    [username],
  );
  const { rows: txBefore } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM transactions t JOIN users u ON u.id = t.user_id WHERE u.first_name = $1`,
    [username],
  );

  const second = await service.enroll(username);
  assert.equal(second.status, 200);
  assert.equal(second.body.alreadyPaid, true);
  assert.equal(second.body.protocol, first.body.protocol, "protocolo deve ser o mesmo");
  assert.equal(second.body.enrollmentPaid, true);
  assert.equal(second.body.wallet.bonus, ENROLLMENT_WELCOME_BONUS_KRC, "carteira retomada sem duplicar");

  const { rows: ledgerAfter } = await pool.query(
    "SELECT count(*)::int AS n FROM economy_ledger_entries WHERE idempotency_key IN ($1, $2)",
    [`enrollment.fee.${first.body.protocol}`, `enrollment.bonus.${first.body.protocol}`],
  );
  const { rows: usersAfter } = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM users WHERE first_name = $1",
    [username],
  );
  const { rows: txAfter } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM transactions t JOIN users u ON u.id = t.user_id WHERE u.first_name = $1`,
    [username],
  );

  assert.equal(ledgerAfter[0].n, ledgerBefore[0].n, "ledger duplicou na 2ª chamada");
  assert.equal(usersAfter[0].n, 1, "usuário duplicado na 2ª chamada");
  assert.equal(usersBefore[0].n, 1);
  assert.equal(txAfter[0].n, txBefore[0].n, "transações duplicadas na 2ª chamada");
});

test("corrida: dois POSTs concorrentes para o mesmo username convergem para UM alistamento", async () => {
  const username = uniqueUsername();
  const [a, b] = await Promise.allSettled([service.enroll(username), service.enroll(username)]);

  // Exatamente um 201; o outro 200 (replay) — ou ambos 200 se a transação
  // serializou (FOR UPDATE no SELECT). De qualquer forma: UM alistamento.
  const fulfilled = [a, b].filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof service.enroll>>>).value);
  assert.equal(fulfilled.length, 2, "nenhum dos POSTs pode falhar");
  const created = fulfilled.filter((r) => r.status === 201);
  assert.ok(created.length <= 1, "dois alistamentos criados para o mesmo username");

  const { rows } = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM enrollments WHERE username = $1",
    [username],
  );
  assert.equal(rows[0].n, 1, "corrida criou mais de um alistamento");

  // Protocolos idênticos e ledger sem duplicata.
  const { rows: ledger } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM economy_ledger_entries l
       JOIN enrollments e ON l.idempotency_key IN ('enrollment.fee.' || e.protocol, 'enrollment.bonus.' || e.protocol)
      WHERE e.username = $1`,
    [username],
  );
  assert.equal(ledger[0].n, 4, "corrida duplicou linhas de ledger");
});

test("retomada de sessão: getStatus reconhece alistado; username novo → null", async () => {
  const username = uniqueUsername();
  const created = await service.enroll(username);

  const resumed = await service.getStatus(username);
  assert.ok(resumed);
  assert.equal(resumed.enlisted, true);
  assert.equal(resumed.enrollmentPaid, true);
  assert.equal(resumed.protocol, created.body.protocol);
  assert.equal(resumed.wallet.bonus, ENROLLMENT_WELCOME_BONUS_KRC);

  const unknown = await service.getStatus(uniqueUsername());
  assert.equal(unknown, null, "username não alistado deveria retornar null");
});

test("username inválido é recusado ANTES de tocar o banco", async () => {
  const { rows: before } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM enrollments");
  for (const bad of ["ab", "tem espaço", "çedilha", "a".repeat(25), ""]) {
    await assert.rejects(
      () => service.enroll(bad),
      (error: Error) => error.name === "EnrollmentError",
      `username "${bad}" deveria ser recusado`,
    );
  }
  const { rows: afterRows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM enrollments");
  assert.equal(afterRows[0].n, before[0].n, "username inválido criou alistamento");
});
