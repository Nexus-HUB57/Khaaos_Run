// KHAAOS RUN — Taxa de alistamento via Stripe: fulfillment real (Task 44)
// ========================================================================
// Suíte PostgreSQL REAL (pula sem TEST_DATABASE_URL) para o ciclo completo
// do gateway da taxa U$1:
//
//   1. Webhook `checkout.session.completed` (metadata.kind=enrollment_fee)
//      → ledger double-entry REAL (fee: external.deposit→system.item_sales;
//      bonus: equity.opening_balance→wallet.bonus + bank_accounts +500) e
//      sessão COMPLETED — na ordem ledger→sessão do guard financeiro
//   2. Re-entrega do mesmo evento → duplicate, ZERO linhas novas
//   3. Auditoria (reconciliação SSOT): relatório clean com as seções novas
//      (ledgerGlobalDrift, paidEnrollmentSessionsWithoutLedger); sessão paga
//      sem par no ledger → needs_attention específico; ΣDEBIT≠ΣCREDIT
//      global → ledgerGlobalDrift

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool, type QueryResult } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

let testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) {
  const { useSuiteDatabase } = await import("../helpers/suite-database.ts");
  const suite = await useSuiteDatabase(testDatabaseUrl, "enrollment_fee_stripe");
  process.env.TEST_DATABASE_URL = suite.databaseUrl;
  process.env.DATABASE_URL = suite.databaseUrl;
  testDatabaseUrl = suite.databaseUrl;
}

test("taxa de alistamento via Stripe: fulfillment real, idempotência e reconciliação", { skip: !testDatabaseUrl }, async () => {
  const url = new URL(testDatabaseUrl!);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL precisa apontar para um banco descartável cujo nome termine em _test");
  }

  const pool = new Pool({ connectionString: testDatabaseUrl, max: 6 });
  const userId = `enroll-fee-test-${randomUUID()}`;

  try {
    // ─── Bootstrap: shapes mínimas fiéis às migrations 0003/0004/0011 ────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id SERIAL PRIMARY KEY, user_id TEXT NOT NULL UNIQUE,
        weapons_balance NUMERIC NOT NULL DEFAULT 0,
        bonus_balance NUMERIC NOT NULL DEFAULT 0,
        fbm_balance NUMERIC NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS economy_ledger_entries (
        id SERIAL PRIMARY KEY,
        operation_id UUID NOT NULL,
        idempotency_key TEXT NOT NULL,
        user_id TEXT NOT NULL,
        line_number INTEGER NOT NULL,
        account_code TEXT NOT NULL,
        side TEXT NOT NULL CHECK (side IN ('DEBIT', 'CREDIT')),
        amount_krc NUMERIC NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT economy_ledger_unique UNIQUE (user_id, idempotency_key, line_number)
      );
      CREATE TABLE IF NOT EXISTS payment_webhook_events (
        id BIGSERIAL PRIMARY KEY,
        provider TEXT NOT NULL DEFAULT 'stripe',
        event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        order_id UUID,
        status TEXT NOT NULL DEFAULT 'received',
        error_code TEXT,
        received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        processed_at TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS payment_webhook_events_provider_event_unique
        ON payment_webhook_events (provider, event_id);
      CREATE TABLE IF NOT EXISTS enrollment_sessions (
        "user_id" text PRIMARY KEY,
        "protocol" varchar(32) NOT NULL UNIQUE,
        "step" text DEFAULT 'AWAITING_DATA' NOT NULL,
        "data" jsonb,
        "terms" jsonb,
        "fee" jsonb,
        "bonus_krc_credited" numeric DEFAULT '0' NOT NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL,
        "updated_at" timestamptz DEFAULT now() NOT NULL
      );
      -- a auditoria de reconciliação consulta também estas superfícies
      -- (transactionWithoutLedger / incompleteClaims / snapshot state)
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
        amount_krc NUMERIC NOT NULL, amount_usd NUMERIC,
        operation_id UUID, description TEXT, timestamp TIMESTAMP DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS economy_idempotency (
        id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE, request_hash TEXT,
        operation_id UUID, response_status INTEGER, response_body JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS economy_ledger_migration_state (
        migration_key TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const { createPostgresEnrollmentStore } = await import("../../server/game/enrollmentStore.postgres.ts");
    const { createEnrollmentFeePaymentService } = await import("../../server/payments/enrollmentFeePayment.ts");
    const { createEconomyAuditReport } = await import("../../server/game/economyAudit.ts");

    const store = createPostgresEnrollmentStore();
    const database = drizzle(pool);

    const service = createEnrollmentFeePaymentService({ store, database: database as never });

    // sessão AWAITING_FEE real (store postgres)
    await store.put({
      protocol: "KR-REG-4FEE001",
      userId,
      step: "AWAITING_FEE",
      data: { displayName: "Operador Fee", birthDate: "1991-02-02", country: "BR" },
      terms: { version: "KR-TERMS-2026-11", acceptedAt: new Date().toISOString() },
      fee: null,
      bonusKrcCredited: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const payloadHash = "7".repeat(64);
    const paidEvent = {
      id: `evt_${randomUUID()}`,
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: `cs_${randomUUID()}`,
          object: "checkout.session",
          mode: "payment",
          currency: "usd",
          amount_total: 100,
          livemode: false,
          status: "complete",
          payment_status: "paid",
          metadata: {
            kind: "enrollment_fee",
            userId,
            protocol: "KR-REG-4FEE001",
            clientIdempotencyKey: "idem-fee-postgres-0001",
          },
        },
      },
    } as never;

    const result = await service.processEvent(paidEvent, payloadHash);
    assert.equal(result, "processed");

    // sessão concluída com o mesmo contrato do caminho mock
    const stored = await store.get(userId);
    assert.equal(stored?.step, "COMPLETED");
    assert.equal(stored?.fee?.idempotencyKey, "idem-fee-postgres-0001");
    assert.equal(stored?.bonusKrcCredited, 500);

    // ledger REAL: 2 operações × 2 linhas balanceadas
    const ledger = await pool.query<{ account_code: string; side: string; amount_krc: string; idempotency_key: string }>(
      "SELECT account_code, side, amount_krc, idempotency_key FROM economy_ledger_entries WHERE user_id = $1 ORDER BY id",
      [userId],
    );
    assert.equal(ledger.rowCount, 4);
    const byKey = new Map<string, { debits: number; credits: number }>();
    for (const row of ledger.rows) {
      const bucket = byKey.get(row.idempotency_key) ?? { debits: 0, credits: 0 };
      if (row.side === "DEBIT") bucket.debits += Number(row.amount_krc);
      else bucket.credits += Number(row.amount_krc);
      byKey.set(row.idempotency_key, bucket);
    }
    assert.equal(byKey.size, 2, "taxa e bônus com chaves de idempotência distintas");
    for (const [key, sums] of byKey) {
      assert.equal(sums.debits, sums.credits, `operação ${key} balanceada`);
    }
    const wallet = await pool.query<{ bonus_balance: string }>(
      "SELECT bonus_balance FROM bank_accounts WHERE user_id = $1",
      [userId],
    );
    assert.equal(Number(wallet.rows[0]?.bonus_balance), 500);

    // re-entrega do MESMO evento → duplicate, nenhuma linha nova
    const duplicate = await service.processEvent(paidEvent, payloadHash);
    assert.equal(duplicate, "duplicate");
    const ledgerAfterDuplicate = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM economy_ledger_entries WHERE user_id = $1",
      [userId],
    );
    assert.equal(ledgerAfterDuplicate.rows[0].count, "4");
    const walletAfterDuplicate = await pool.query<{ bonus_balance: string }>(
      "SELECT bonus_balance FROM bank_accounts WHERE user_id = $1",
      [userId],
    );
    assert.equal(Number(walletAfterDuplicate.rows[0].bonus_balance), 500, "bônus único: replay não credita de novo");

    // ─── Reconciliação SSOT (seções novas da Task 44) ────────────────────
    const cleanReport = await createEconomyAuditReport(pool as never);
    assert.equal(cleanReport.status, "clean");
    assert.equal(cleanReport.counts.paidEnrollmentSessionsWithoutLedger, 0);
    assert.equal(cleanReport.counts.ledgerGlobalDrift, 0);
    assert.ok(cleanReport.ledgerGlobalConservation);
    assert.equal(Number(cleanReport.ledgerGlobalConservation.difference_krc), 0);

    // caso negativo 1: sessão paga SEM par no ledger → needs_attention
    await pool.query("DELETE FROM economy_ledger_entries WHERE user_id = $1", [userId]);
    const driftReport = await createEconomyAuditReport(pool as never);
    assert.equal(driftReport.status, "needs_attention");
    assert.equal(driftReport.counts.paidEnrollmentSessionsWithoutLedger, 1);
    assert.deepEqual(
      driftReport.paidEnrollmentSessionsWithoutLedger.map((row) => row.protocol),
      ["KR-REG-4FEE001"],
    );

    // caso negativo 2: ΣDEBIT ≠ ΣCREDIT GLOBAL → ledgerGlobalDrift
    const protocol = "KR-REG-4FEE001";
    await pool.query(
      `INSERT INTO economy_ledger_entries (operation_id, idempotency_key, user_id, line_number, account_code, side, amount_krc, description)
       VALUES ($1, $2, $3, 1, 'system.item_sales', 'CREDIT', 100, 'Enrollment fee U$1.00 (' || $4 || ')')`,
      [randomUUID(), "tampered-global-entry-0001", userId, protocol],
    );
    const globalDriftReport = await createEconomyAuditReport(pool as never);
    assert.equal(globalDriftReport.counts.ledgerGlobalDrift, 1);
    assert.ok(Number(globalDriftReport.ledgerGlobalConservation!.difference_krc) !== 0);
  } finally {
    await pool.end();
  }
});
