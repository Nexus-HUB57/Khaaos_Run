import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { createEconomyAuditReport } from "../../server/game/economyAudit";
import { pruneEconomyIdempotencyClaims } from "../../server/game/economyRetention";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

test("economia PostgreSQL: concorrência, replay idempotente e rollback integral", { skip: !testDatabaseUrl }, async () => {
  const url = new URL(testDatabaseUrl!);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL precisa apontar para um banco descartável cujo nome termine em _test");
  }

  const pool = new Pool({ connectionString: testDatabaseUrl, max: 8 });
  const userIds = Array.from({ length: 8 }, () => `economy-test-${randomUUID()}`);
  const [transferUser, purchaseUser, payLoanUser, salaryUser, rollbackUser, loanCapUser, legacyUser, repairUser] = userIds;

  try {
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
    const migration = await readFile(new URL("../../migrations/0002_economy_idempotency.sql", import.meta.url), "utf8");
    await pool.query(migration);
    await pool.query(`
      DROP TABLE IF EXISTS economy_ledger_entries CASCADE;
      DROP TABLE IF EXISTS economy_ledger_migration_state CASCADE;
      ALTER TABLE economy_idempotency DROP COLUMN IF EXISTS operation_id CASCADE;
      ALTER TABLE transactions DROP COLUMN IF EXISTS operation_id CASCADE;
      DROP FUNCTION IF EXISTS reject_economy_ledger_mutation();
      DROP FUNCTION IF EXISTS assert_economy_ledger_operation_balanced();
    `);
    const priorCheck = await pool.query(`
      SELECT convalidated FROM pg_constraint
      WHERE conname = 'bank_weapons_nonnegative'
        AND conrelid = 'bank_accounts'::regclass
    `);
    const simulateLegacyInvalidRow = priorCheck.rowCount === 0;
    if (simulateLegacyInvalidRow) {
      await pool.query("INSERT INTO bank_accounts (user_id, weapons_balance) VALUES ($1, -1)", [legacyUser]);
    }
    const invariants = await readFile(new URL("../../migrations/0003_economy_invariants.sql", import.meta.url), "utf8");
    await pool.query(invariants);
    if (simulateLegacyInvalidRow) {
      const legacyBalance = await pool.query("SELECT weapons_balance::text FROM bank_accounts WHERE user_id = $1", [legacyUser]);
      assert.equal(legacyBalance.rows[0].weapons_balance, "-1");
      await assert.rejects(
        pool.query("UPDATE bank_accounts SET bonus_balance = 1 WHERE user_id = $1", [legacyUser]),
        /bank_weapons_nonnegative/,
      );
      await pool.query("UPDATE bank_accounts SET weapons_balance = 40, bonus_balance = 12, fbm_balance = 3 WHERE user_id = $1", [legacyUser]);
    } else {
      await pool.query("INSERT INTO bank_accounts (user_id, weapons_balance, bonus_balance, fbm_balance) VALUES ($1, 40, 12, 3)", [legacyUser]);
    }
    await assert.rejects(
      pool.query("INSERT INTO bank_accounts (user_id, weapons_balance) VALUES ($1, -1)", [`negative-${randomUUID()}`]),
      /bank_weapons_nonnegative/,
    );
    await assert.rejects(
      pool.query("INSERT INTO loans (user_id, principal, interest, total_due, days_remaining, is_paid) VALUES ($1, 100, 0, 100, 1, NULL)", [`invalid-${randomUUID()}`]),
      /loans_is_paid_present/,
    );
    await assert.rejects(
      pool.query("INSERT INTO items (user_id, name, type, durability, max_durability) VALUES ($1, 'Broken', 'ARMA', 101, 100)", [`invalid-${randomUUID()}`]),
      /items_durability_within_maximum/,
    );

    await pool.query(`
      INSERT INTO bank_accounts (user_id, weapons_balance, bonus_balance, fbm_balance) VALUES
        ($1, 100, 0, 0), ($2, 500, 0, 0), ($3, 100, 0, 0),
        ($4, 0, 0, 0), ($5, 0, 0, 0), ($6, 500, 0, 0), ($7, 50, 0, 0)
    `, [transferUser, purchaseUser, payLoanUser, salaryUser, loanCapUser, rollbackUser, repairUser]);
    const legacySuccessKey = `legacy-success-${randomUUID()}`;
    await pool.query(`
      INSERT INTO economy_idempotency (user_id, idempotency_key, request_hash, response_status, response_body, created_at)
      VALUES ($1, $2, $3, 200, '{"ok":true}'::jsonb, TIMESTAMP '2000-01-01')
    `, [legacyUser, legacySuccessKey, "d".repeat(64)]);

    const ledgerMigration = await readFile(new URL("../../migrations/0004_correlated_append_only_ledger.sql", import.meta.url), "utf8");
    await pool.query(ledgerMigration);
    const openingSnapshot = await pool.query(
      "SELECT account_code, side, amount_krc::text FROM economy_ledger_entries WHERE user_id = $1",
      [legacyUser],
    );
    assert.equal(openingSnapshot.rowCount, 6);
    assert.deepEqual(openingSnapshot.rows.map((row) => `${row.account_code}:${row.side}:${row.amount_krc}`).sort(), [
      "wallet.weapons:CREDIT:40", "equity.opening_balance:DEBIT:40",
      "wallet.bonus:CREDIT:12", "equity.opening_balance:DEBIT:12",
      "wallet.fbm:CREDIT:3", "equity.opening_balance:DEBIT:3",
    ].sort());
    await pool.query(ledgerMigration);
    const openingSnapshotAfterReplay = await pool.query("SELECT count(*)::int AS count FROM economy_ledger_entries WHERE user_id = $1", [legacyUser]);
    assert.equal(openingSnapshotAfterReplay.rows[0].count, 6);

    const schema = await import("../../shared/schema");
    const { EconomyService } = await import("../../server/game/economyService");
    const database = drizzle(pool, { schema }) as unknown as typeof import("../../server/db").db;
    const service = new EconomyService(database);

    const transferKey = randomUUID();
    const transferResults = await Promise.all([
      service.transfer(transferUser, transferKey, "10.00", "fbm"),
      service.transfer(transferUser, transferKey, "10.00", "fbm"),
    ]);
    assert.deepEqual(transferResults.map((result) => result.status), [200, 200]);
    assert.equal(transferResults[0].body.newBalance, transferResults[1].body.newBalance);
    assert.equal(transferResults[0].body.operationId, transferResults[1].body.operationId);
    const transferBalance = await pool.query("SELECT weapons_balance::text, fbm_balance::text FROM bank_accounts WHERE user_id = $1", [transferUser]);
    assert.equal(transferBalance.rows[0].weapons_balance, "90.00");
    assert.equal(transferBalance.rows[0].fbm_balance, "10.00");
    const transferLedger = await pool.query("SELECT count(*)::int AS count FROM transactions WHERE user_id = $1 AND type = 'TRANSFERENCIA'", [transferUser]);
    assert.equal(transferLedger.rows[0].count, 1);
    const correlatedTransfer = await pool.query(`
      SELECT t.operation_id::text AS event_operation, count(e.id)::int AS entry_count,
        sum(e.amount_krc) FILTER (WHERE e.side = 'DEBIT')::text AS debits,
        sum(e.amount_krc) FILTER (WHERE e.side = 'CREDIT')::text AS credits
      FROM transactions t JOIN economy_ledger_entries e ON e.operation_id = t.operation_id
      WHERE t.user_id = $1 AND t.type = 'TRANSFERENCIA'
      GROUP BY t.operation_id
    `, [transferUser]);
    assert.equal(correlatedTransfer.rowCount, 1);
    assert.equal(correlatedTransfer.rows[0].event_operation, transferResults[0].body.operationId);
    assert.equal(correlatedTransfer.rows[0].entry_count, 2);
    assert.equal(correlatedTransfer.rows[0].debits, correlatedTransfer.rows[0].credits);
    await assert.rejects(
      pool.query("UPDATE economy_ledger_entries SET description = 'tampered' WHERE operation_id = $1", [transferResults[0].body.operationId]),
      /append-only/,
    );
    await assert.rejects(
      pool.query("DELETE FROM economy_ledger_entries WHERE operation_id = $1", [transferResults[0].body.operationId]),
      /append-only/,
    );
    await assert.rejects(pool.query("TRUNCATE economy_ledger_entries"), /append-only/);
    const conflictingReplay = await service.transfer(transferUser, transferKey, "11.00", "fbm");
    assert.equal(conflictingReplay.status, 409);
    const depositKey = randomUUID();
    const deposits = await Promise.all([
      service.deposit(transferUser, depositKey, "1.23"),
      service.deposit(transferUser, depositKey, "1.23"),
    ]);
    assert.deepEqual(deposits.map((result) => result.status), [200, 200]);
    const depositedBalance = await pool.query("SELECT weapons_balance::text, bonus_balance::text FROM bank_accounts WHERE user_id = $1", [transferUser]);
    assert.equal(depositedBalance.rows[0].weapons_balance, "213.00");
    assert.equal(depositedBalance.rows[0].bonus_balance, "123.00");

    const purchases = await Promise.all([
      service.purchaseItem(purchaseUser, randomUUID(), { type: "ARMA", name: "Compra A" }),
      service.purchaseItem(purchaseUser, randomUUID(), { type: "ARMA", name: "Compra B" }),
    ]);
    assert.deepEqual(purchases.map((result) => result.status).sort(), [201, 402]);
    const purchaseState = await pool.query(`
      SELECT b.weapons_balance::text AS balance,
        (SELECT count(*)::int FROM items WHERE user_id = $1) AS items,
        (SELECT count(*)::int FROM transactions WHERE user_id = $1 AND type = 'COMPRA') AS ledger
      FROM bank_accounts b WHERE b.user_id = $1
    `, [purchaseUser]);
    assert.equal(purchaseState.rows[0].balance, "0.00");
    assert.equal(purchaseState.rows[0].items, 1);
    assert.equal(purchaseState.rows[0].ledger, 1);

    const [repairableItem] = (await pool.query(
      "INSERT INTO items (user_id, name, type, durability, max_durability) VALUES ($1, 'Item para reparar', 'ARMA', 50, 100) RETURNING id",
      [repairUser],
    )).rows;
    const repair = await service.repairItem(repairUser, randomUUID(), repairableItem.id, "10.00");
    assert.equal(repair.status, 200);
    assert.equal(repair.body.newDurability, "55.00");
    assert.equal(typeof repair.body.operationId, "string");
    const repairState = await pool.query(`
      SELECT b.weapons_balance::text AS balance,
        (SELECT count(*)::int FROM transactions WHERE user_id = $1 AND type = 'REPARO') AS events
      FROM bank_accounts b WHERE b.user_id = $1
    `, [repairUser]);
    assert.equal(repairState.rows[0].balance, "40.00");
    assert.equal(repairState.rows[0].events, 1);

    const [loanRow] = (await pool.query(
      "INSERT INTO loans (user_id, principal, interest, total_due, days_remaining) VALUES ($1, 90, 10, 100, 7) RETURNING id",
      [payLoanUser],
    )).rows;
    const payResults = await Promise.all([
      service.payLoan(payLoanUser, randomUUID(), loanRow.id),
      service.payLoan(payLoanUser, randomUUID(), loanRow.id),
    ]);
    assert.deepEqual(payResults.map((result) => result.status).sort(), [200, 409]);
    const paidState = await pool.query(`
      SELECT b.weapons_balance::text AS balance,
        (SELECT count(*)::int FROM transactions WHERE user_id = $1 AND type = 'PAGAMENTO_EMPRESTIMO') AS ledger,
        (SELECT is_paid FROM loans WHERE user_id = $1 LIMIT 1) AS is_paid
      FROM bank_accounts b WHERE b.user_id = $1
    `, [payLoanUser]);
    assert.equal(paidState.rows[0].balance, "0.00");
    assert.equal(paidState.rows[0].ledger, 1);
    assert.equal(paidState.rows[0].is_paid, true);

    const loanRequests = await Promise.all(Array.from({ length: 4 }, (_, index) =>
      service.requestLoan(loanCapUser, randomUUID(), 100, 1),
    ));
    assert.deepEqual(loanRequests.map((result) => result.status).sort(), [201, 201, 201, 403]);
    const loanCapState = await pool.query(`
      SELECT b.weapons_balance::text AS balance,
        (SELECT count(*)::int FROM loans WHERE user_id = $1 AND is_paid = FALSE) AS active_loans,
        (SELECT count(*)::int FROM transactions WHERE user_id = $1 AND type = 'EMPRESTIMO') AS ledger
      FROM bank_accounts b WHERE b.user_id = $1
    `, [loanCapUser]);
    assert.equal(loanCapState.rows[0].balance, "300.00");
    assert.equal(loanCapState.rows[0].active_loans, 3);
    assert.equal(loanCapState.rows[0].ledger, 3);

    const salaryNow = new Date("2026-10-12T12:00:00.000Z");
    const salaryResults = await Promise.all([
      service.claimDailySalary(salaryUser, randomUUID(), salaryNow),
      service.claimDailySalary(salaryUser, randomUUID(), salaryNow),
    ]);
    assert.deepEqual(salaryResults.map((result) => result.status).sort(), [200, 400]);
    const salaryState = await pool.query(`
      SELECT b.bonus_balance::text AS balance,
        (SELECT count(*)::int FROM transactions WHERE user_id = $1 AND type = 'SALARY') AS ledger
      FROM bank_accounts b WHERE b.user_id = $1
    `, [salaryUser]);
    assert.equal(salaryState.rows[0].balance, "100.00");
    assert.equal(salaryState.rows[0].ledger, 1);

    const missingCorrelation = await pool.query(`
      SELECT t.id
      FROM transactions t
      LEFT JOIN economy_idempotency i
        ON i.user_id = t.user_id AND i.operation_id = t.operation_id
      LEFT JOIN economy_ledger_entries e ON e.operation_id = t.operation_id
      WHERE t.user_id = ANY($1::text[])
      GROUP BY t.id, t.operation_id, i.id
      HAVING t.operation_id IS NULL OR i.id IS NULL OR count(e.id) < 2
    `, [[transferUser, purchaseUser, payLoanUser, salaryUser, loanCapUser, repairUser]]);
    assert.equal(missingCorrelation.rowCount, 0, "each successful event must correlate to its idempotency claim and ledger entries");

    const entriesBeforeMigrationReplay = await pool.query("SELECT count(*)::int AS count FROM economy_ledger_entries");
    await pool.query(ledgerMigration);
    const entriesAfterMigrationReplay = await pool.query("SELECT count(*)::int AS count FROM economy_ledger_entries");
    assert.equal(entriesAfterMigrationReplay.rows[0].count, entriesBeforeMigrationReplay.rows[0].count);

    const recon = await pool.query(`
      SELECT b.user_id,
        (COALESCE(SUM(e.amount_krc) FILTER (WHERE e.account_code = 'wallet.weapons' AND e.side = 'CREDIT'), 0) -
         COALESCE(SUM(e.amount_krc) FILTER (WHERE e.account_code = 'wallet.weapons' AND e.side = 'DEBIT'), 0))::text AS ledger_weapons,
        (COALESCE(SUM(e.amount_krc) FILTER (WHERE e.account_code = 'wallet.bonus' AND e.side = 'CREDIT'), 0) -
         COALESCE(SUM(e.amount_krc) FILTER (WHERE e.account_code = 'wallet.bonus' AND e.side = 'DEBIT'), 0))::text AS ledger_bonus,
        (COALESCE(SUM(e.amount_krc) FILTER (WHERE e.account_code = 'wallet.fbm' AND e.side = 'CREDIT'), 0) -
         COALESCE(SUM(e.amount_krc) FILTER (WHERE e.account_code = 'wallet.fbm' AND e.side = 'DEBIT'), 0))::text AS ledger_fbm,
        b.weapons_balance::text AS weapons,
        b.bonus_balance::text AS bonus,
        b.fbm_balance::text AS fbm
      FROM bank_accounts b LEFT JOIN economy_ledger_entries e ON e.user_id = b.user_id
      WHERE b.user_id = ANY($1::text[])
      GROUP BY b.user_id, b.weapons_balance, b.bonus_balance, b.fbm_balance
    `, [[transferUser, purchaseUser, payLoanUser, salaryUser, loanCapUser, legacyUser, repairUser]]);
    for (const row of recon.rows) {
      assert.equal(String(row.ledger_weapons), String(row.weapons), `weapons ledger must reconcile for ${row.user_id}`);
      assert.equal(String(row.ledger_bonus), String(row.bonus), `bonus ledger must reconcile for ${row.user_id}`);
      assert.equal(String(row.ledger_fbm), String(row.fbm), `fbm ledger must reconcile for ${row.user_id}`);
    }

    const unbalancedClient = await pool.connect();
    const invalidOperationId = randomUUID();
    try {
      await unbalancedClient.query("BEGIN");
      await unbalancedClient.query(`
        INSERT INTO economy_ledger_entries
          (operation_id, idempotency_key, user_id, line_number, account_code, side, amount_krc, description)
        VALUES ($1, $2, $3, 1, 'wallet.weapons', 'DEBIT', 1, 'unbalanced test')
      `, [invalidOperationId, `unbalanced-${randomUUID()}`, rollbackUser]);
      await assert.rejects(unbalancedClient.query("COMMIT"), /not balanced/);
      await unbalancedClient.query("ROLLBACK").catch(() => undefined);
    } finally {
      unbalancedClient.release();
    }

    await pool.query(`
      CREATE OR REPLACE FUNCTION fail_test_purchase_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.user_id = '${rollbackUser}' AND NEW.type = 'COMPRA' THEN RAISE EXCEPTION 'injected ledger failure'; END IF;
        RETURN NEW;
      END $$;
      DROP TRIGGER IF EXISTS fail_test_purchase_ledger_trigger ON transactions;
      CREATE TRIGGER fail_test_purchase_ledger_trigger BEFORE INSERT ON transactions
      FOR EACH ROW EXECUTE FUNCTION fail_test_purchase_ledger();
    `);
    const rollbackKey = randomUUID();
    await assert.rejects(service.purchaseItem(rollbackUser, rollbackKey, { type: "ARMA", name: "Falha injetada" }), /injected ledger failure/);
    const rollbackState = await pool.query(`
      SELECT b.weapons_balance::text AS balance,
        (SELECT count(*)::int FROM items WHERE user_id = $1) AS items,
        (SELECT count(*)::int FROM economy_idempotency WHERE user_id = $1 AND idempotency_key = $2) AS key_records,
        (SELECT count(*)::int FROM economy_ledger_entries WHERE user_id = $1 AND idempotency_key = $2) AS ledger_entries
      FROM bank_accounts b WHERE b.user_id = $1
    `, [rollbackUser, rollbackKey]);
    assert.equal(rollbackState.rows[0].balance, "500");
    assert.equal(rollbackState.rows[0].items, 0);
    assert.equal(rollbackState.rows[0].key_records, 0);
    assert.equal(rollbackState.rows[0].ledger_entries, 0);

    for (const [table, constraint] of [
      ["bank_accounts", "bank_weapons_nonnegative"],
      ["bank_accounts", "bank_bonus_nonnegative"],
      ["bank_accounts", "bank_fbm_nonnegative"],
      ["transactions", "transactions_amount_krc_nonnegative"],
      ["transactions", "transactions_amount_usd_nonnegative"],
      ["loans", "loans_principal_nonnegative"],
      ["loans", "loans_interest_nonnegative"],
      ["loans", "loans_total_due_nonnegative"],
      ["loans", "loans_days_remaining_nonnegative"],
      ["loans", "loans_is_paid_present"],
      ["items", "items_durability_nonnegative"],
      ["items", "items_max_durability_nonnegative"],
      ["items", "items_durability_within_maximum"],
      ["economy_idempotency", "economy_idem_hash_sha256"],
      ["economy_idempotency", "economy_idem_response_status_valid"],
    ] as const) {
      await pool.query(`ALTER TABLE ${table} VALIDATE CONSTRAINT ${constraint}`);
    }

    const cleanAudit = await createEconomyAuditReport(pool);
    assert.equal(cleanAudit.status, "clean");
    assert.equal(cleanAudit.counts.walletDrifts, 0);
    assert.equal(cleanAudit.counts.unbalancedOperations, 0);
    assert.equal(cleanAudit.counts.transactionsWithoutLedger, 0);
    assert.equal(cleanAudit.counts.successfulClaimsWithoutLedger, 0);
    assert.equal(cleanAudit.counts.incompleteIdempotencyClaims, 0);

    await pool.query("UPDATE bank_accounts SET bonus_balance = bonus_balance + 1 WHERE user_id = $1", [salaryUser]);
    const [orphanEvent] = (await pool.query(`
      INSERT INTO transactions (user_id, type, amount_krc, operation_id, description)
      VALUES ($1, 'AUDIT_TEST', 1, $2, 'event without ledger') RETURNING id
    `, [salaryUser, randomUUID()])).rows;
    const orphanClaimKey = `audit-claim-${randomUUID()}`;
    await pool.query(`
      INSERT INTO economy_idempotency (user_id, idempotency_key, request_hash, response_status, response_body)
      VALUES ($1, $2, $3, 200, '{"ok":true}'::jsonb)
    `, [salaryUser, orphanClaimKey, "c".repeat(64)]);
    const driftAudit = await createEconomyAuditReport(pool);
    assert.equal(driftAudit.status, "needs_attention");
    assert.equal(driftAudit.counts.walletDrifts, 1);
    assert.equal(driftAudit.walletDrifts[0].account_code, "wallet.bonus");
    assert.equal(driftAudit.walletDrifts[0].difference_krc, "1.00");
    assert.equal(driftAudit.counts.transactionsWithoutLedger, 1);
    assert.equal(driftAudit.counts.successfulClaimsWithoutLedger, 1);
    const stillDrifted = await pool.query("SELECT bonus_balance::text FROM bank_accounts WHERE user_id = $1", [salaryUser]);
    assert.equal(stillDrifted.rows[0].bonus_balance, "101.00", "audit reports drift without silently changing balances");
    await pool.query("DELETE FROM transactions WHERE id = $1", [orphanEvent.id]);
    await pool.query("DELETE FROM economy_idempotency WHERE idempotency_key = $1", [orphanClaimKey]);
    await pool.query("UPDATE bank_accounts SET bonus_balance = bonus_balance - 1 WHERE user_id = $1", [salaryUser]);
    assert.equal((await createEconomyAuditReport(pool)).status, "clean");

    await pool.query("UPDATE economy_idempotency SET created_at = TIMESTAMP '2000-01-01' WHERE user_id = $1 AND idempotency_key = $2", [transferUser, transferKey]);
    const completeExpiredKey = `retention-complete-${randomUUID()}`;
    const incompleteExpiredKey = `retention-incomplete-${randomUUID()}`;
    await pool.query(`
      INSERT INTO economy_idempotency (user_id, idempotency_key, request_hash, response_status, response_body, created_at)
      VALUES ($1, $2, $3, 400, '{"message":"rejected"}'::jsonb, TIMESTAMP '2000-01-01')
    `, [salaryUser, completeExpiredKey, "a".repeat(64)]);
    await pool.query(`
      INSERT INTO economy_idempotency (user_id, idempotency_key, request_hash, response_status, response_body, created_at)
      VALUES ($1, $2, $3, NULL, NULL, TIMESTAMP '2000-01-01')
    `, [salaryUser, incompleteExpiredKey, "b".repeat(64)]);
    await assert.rejects(pruneEconomyIdempotencyClaims(pool, { retentionDays: 90 }), /maior que a janela de retry/);
    const dryRun = await pruneEconomyIdempotencyClaims(pool, { retentionDays: 365, batchSize: 1 });
    assert.equal(dryRun.mode, "dry_run");
    assert.equal(dryRun.eligibleClaimsAtStart, 2);
    assert.equal(dryRun.incompleteClaimsNotDeleted, 1);
    assert.equal(dryRun.successfulClaimsWithoutLedgerNotDeleted, 1);
    assert.equal(dryRun.deletedClaims, 0);
    const eligibleAfterDryRun = await pool.query(`
      SELECT count(*)::int AS count FROM economy_idempotency
      WHERE created_at < TIMESTAMP '2025-01-01' AND response_status IS NOT NULL AND response_body IS NOT NULL
        AND idempotency_key IN ($1, $2)
    `, [transferKey, completeExpiredKey]);
    assert.equal(eligibleAfterDryRun.rows[0].count, 2, "dry-run must not delete eligible claims");
    const pruned = await pruneEconomyIdempotencyClaims(pool, { retentionDays: 365, batchSize: 1, execute: true });
    assert.equal(pruned.mode, "executed");
    assert.equal(pruned.deletedClaims, 2);
    assert.equal(pruned.batches, 2);
    assert.equal(pruned.successfulClaimsWithoutLedgerNotDeleted, 1);
    const remainingIncomplete = await pool.query(
      "SELECT count(*)::int AS count FROM economy_idempotency WHERE idempotency_key = $1",
      [incompleteExpiredKey],
    );
    assert.equal(remainingIncomplete.rows[0].count, 1, "incomplete claims are never deleted by retention cleanup");
    const remainingLegacySuccess = await pool.query(
      "SELECT count(*)::int AS count FROM economy_idempotency WHERE idempotency_key = $1",
      [legacySuccessKey],
    );
    assert.equal(remainingLegacySuccess.rows[0].count, 1, "pre-ledger successful claims retain their dedupe protection until manual review");

    const balanceBeforeExpiredRetry = await pool.query("SELECT weapons_balance::text FROM bank_accounts WHERE user_id = $1", [transferUser]);
    const ledgerBeforeExpiredRetry = await pool.query(
      "SELECT count(*)::int AS count FROM economy_ledger_entries WHERE user_id = $1 AND idempotency_key = $2",
      [transferUser, transferKey],
    );
    const expiredRetry = await service.transfer(transferUser, transferKey, "10.00", "fbm");
    assert.equal(expiredRetry.status, 409);
    assert.equal(expiredRetry.body.code, "IDEMPOTENCY_KEY_EXPIRED");
    assert.equal(expiredRetry.body.operationId, transferResults[0].body.operationId);
    const balanceAfterExpiredRetry = await pool.query("SELECT weapons_balance::text FROM bank_accounts WHERE user_id = $1", [transferUser]);
    const ledgerAfterExpiredRetry = await pool.query(
      "SELECT count(*)::int AS count FROM economy_ledger_entries WHERE user_id = $1 AND idempotency_key = $2",
      [transferUser, transferKey],
    );
    assert.equal(balanceAfterExpiredRetry.rows[0].weapons_balance, balanceBeforeExpiredRetry.rows[0].weapons_balance);
    assert.equal(ledgerAfterExpiredRetry.rows[0].count, ledgerBeforeExpiredRetry.rows[0].count);
    await pool.query("DELETE FROM economy_idempotency WHERE idempotency_key = $1", [incompleteExpiredKey]);
    await pool.query("DELETE FROM economy_idempotency WHERE idempotency_key = $1", [legacySuccessKey]);
    assert.equal((await createEconomyAuditReport(pool)).status, "clean");
  } finally {
    await pool.query("DROP TRIGGER IF EXISTS fail_test_purchase_ledger_trigger ON transactions").catch(() => undefined);
    await pool.query("DROP FUNCTION IF EXISTS fail_test_purchase_ledger()").catch(() => undefined);
    if (userIds.length) {
      await pool.query("DELETE FROM transactions WHERE user_id = ANY($1::text[])", [userIds]).catch(() => undefined);
      await pool.query("DELETE FROM economy_idempotency WHERE user_id = ANY($1::text[])", [userIds]).catch(() => undefined);
      await pool.query("DELETE FROM items WHERE user_id = ANY($1::text[])", [userIds]).catch(() => undefined);
      await pool.query("DELETE FROM loans WHERE user_id = ANY($1::text[])", [userIds]).catch(() => undefined);
      await pool.query("DELETE FROM player_stats WHERE user_id = ANY($1::text[])", [userIds]).catch(() => undefined);
      await pool.query("DELETE FROM bank_accounts WHERE user_id = ANY($1::text[])", [userIds]).catch(() => undefined);
    }
    await pool.end();
  }
});
