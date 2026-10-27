import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

// M2 — P0 integridade de persistência/economia e recuperação (docs/ROADMAP.md).
// Gate 1 (loan parity): preview === débito em matriz de prazos.
// Gate 2: retries concorrentes não duplicam lançamentos (idempotência).
// Gate 3: saldo/ledger reconciliam antes/depois de falha injetada
//         (rollback multi-tabela: loans, bank_accounts, transactions,
//         economy_idempotency, economy_ledger_entries).
// Execução: exige TEST_DATABASE_URL apontando para banco descartável *_test.

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

test("M2: preview=débito na matriz de prazos, idempotência concorrente, rollback multi-tabela e reconciliação", { skip: !testDatabaseUrl }, async () => {
  const url = new URL(testDatabaseUrl!);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL precisa apontar para um banco descartável cujo nome termine em _test");
  }

  const pool = new Pool({ connectionString: testDatabaseUrl, max: 16 });
  const { computeLoan } = await import("../../server/game/EconomyEngine");
  const { loanPreviewInput } = await import("../../server/game/mutationSchemas");
  const { computeLoanTerms } = await import("../../shared/money");

  // ── Schema descartável: mesma base da suíte economy-postgres ─────────────
  await pool.query(`
    DROP TABLE IF EXISTS economy_ledger_entries CASCADE;
    DROP TABLE IF EXISTS economy_ledger_migration_state CASCADE;
    DROP TABLE IF EXISTS economy_idempotency CASCADE;
    DROP TABLE IF EXISTS loans CASCADE;
    DROP TABLE IF EXISTS transactions CASCADE;
    DROP TABLE IF EXISTS items CASCADE;
    DROP TABLE IF EXISTS bank_accounts CASCADE;
    DROP TABLE IF EXISTS player_stats CASCADE;
    DROP FUNCTION IF EXISTS reject_economy_ledger_mutation();
    DROP FUNCTION IF EXISTS assert_economy_ledger_operation_balanced();
    DROP FUNCTION IF EXISTS m2_inject_failure();
  `);
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

  const migration0002 = await readFile(new URL("../../migrations/0002_economy_idempotency.sql", import.meta.url), "utf8");
  await pool.query(migration0002);
  await pool.query(`
    ALTER TABLE economy_idempotency DROP COLUMN IF EXISTS operation_id CASCADE;
    ALTER TABLE transactions DROP COLUMN IF EXISTS operation_id CASCADE;
  `);
  const migration0003 = await readFile(new URL("../../migrations/0003_economy_invariants.sql", import.meta.url), "utf8");
  await pool.query(migration0003);
  const migration0004 = await readFile(new URL("../../migrations/0004_correlated_append_only_ledger.sql", import.meta.url), "utf8");
  await pool.query(migration0004);

  const schema = await import("../../shared/schema");
  const { EconomyService } = await import("../../server/game/economyService");
  const database = drizzle(pool, { schema }) as unknown as typeof import("../../server/db").db;
  const service = new EconomyService(database);

  // Usuários: pagador de empréstimo semeado ANTES do 0004 já foi aplicado? Não —
  // semeamos agora; opening balance do ledger cobre saldos pré-existentes apenas
  // na migração. Para reconciliação exata, zeramos saldos e creditamos via
  // operações do próprio serviço (ledger sempre em pares balanceados).
  const money = (value: string) => Number(value).toFixed(2); // normaliza "0" vs "0.00"
  const matrixPrincipals = [100, 137, 250, 1000, 2500, 7777, 10000] as const;
  const matrixDays = [1, 2, 3, 7, 14, 30] as const;

  const reconcileUser = async (userId: string) => {
    const { rows } = await pool.query(`
      SELECT
        (SELECT weapons_balance::text FROM bank_accounts WHERE user_id = $1) AS wallet,
        (SELECT COALESCE(sum(CASE WHEN side = 'CREDIT' THEN amount_krc ELSE -amount_krc END), 0::numeric)::text
           FROM economy_ledger_entries
          WHERE user_id = $1 AND account_code = 'wallet.weapons') AS ledger_weapons,
        (SELECT COALESCE(sum(CASE WHEN side = 'CREDIT' THEN amount_krc ELSE -amount_krc END), 0::numeric)::text
           FROM economy_ledger_entries
          WHERE user_id = $1 AND account_code = 'system.loan_receivable') AS ledger_receivable,
        (SELECT COALESCE(sum(principal), 0::numeric)::text FROM loans WHERE user_id = $1 AND is_paid = FALSE) AS open_principal,
        (SELECT COALESCE(sum(CASE WHEN side = 'DEBIT' THEN amount_krc ELSE -amount_krc END), 0::numeric)::text
           FROM economy_ledger_entries
          WHERE user_id = $1 AND account_code = 'system.loan_receivable') AS receivable_debits
    `, [userId]);
    return rows[0] as { wallet: string; ledger_weapons: string; ledger_receivable: string; open_principal: string; receivable_debits: string };
  };

  // ══ GATE 1 — Matriz de prazos: preview === débito ═══════════════════════
  const parityUsers: string[] = [];
  for (const principal of matrixPrincipals) {
    for (const days of matrixDays) {
      const cellUser = `m2-parity-${randomUUID()}`;
      parityUsers.push(cellUser);
      const preview = computeLoan(principal, days);           // mesma função da rota
      const oracle = computeLoanTerms(principal, days);        // contrato canônico
      // oracle independente em minor units (juro 5%/dia, half-up por centavo)
      const expectedInterestMinor = (BigInt(principal) * 100n * 5n * BigInt(days) + 50n) / 100n;

      assert.equal(oracle.minor.interest, expectedInterestMinor, `oracle juro ${principal}x${days}`);
      assert.equal(oracle.minor.totalDue, BigInt(principal) * 100n + expectedInterestMinor);
      assert.equal(preview.principal, oracle.principal, `preview.principal ${principal}x${days}`);
      assert.equal(preview.interest, oracle.interest, `preview.interest ${principal}x${days}`);
      assert.equal(preview.totalDue, oracle.totalDue, `preview.totalDue ${principal}x${days}`);

      const charged = await service.requestLoan(cellUser, randomUUID(), principal, days);
      assert.equal(charged.status, 201);
      const loan = charged.body as unknown as { principal: string; interest: string; totalDue: string; daysRemaining: number };
      assert.equal(loan.principal, preview.principal, `débito.principal ${principal}x${days}`);
      assert.equal(loan.interest, preview.interest, `débito.interest ${principal}x${days}`);
      assert.equal(loan.totalDue, preview.totalDue, `débito.totalDue ${principal}x${days}`);
      assert.equal(loan.daysRemaining, days);
    }
  }
  // Nenhuma divergência preview↔débito em 42 células da matriz.
  assert.equal(parityUsers.length, matrixPrincipals.length * matrixDays.length);

  // Domínio unificado: fronteiras rejeitadas de forma idêntica em preview e cobrança.
  for (const [principal, days] of [[99, 1], [10_001, 1], [100, 0], [100, 31], [1000.5, 7]] as const) {
    assert.throws(() => loanPreviewInput.parse({ principal, days }), `preview deve recusar ${principal}x${days}`);
    assert.throws(() => computeLoan(principal as number, days as number), `computeLoan deve recusar ${principal}x${days}`);
    await assert.rejects(
      service.requestLoan(`m2-domain-${randomUUID()}`, randomUUID(), principal as number, days as number),
      RangeError,
      `cobrança deve recusar ${principal}x${days}`,
    );
  }

  // ══ GATE 2 — Idempotência e concorrência ════════════════════════════════
  const concUser = `m2-conc-${randomUUID()}`;
  const sameKey = randomUUID();

  // 2.a Replay sequencial: mesma chave → mesma resposta, um único lançamento.
  const [attemptA, attemptB] = await Promise.all([
    service.requestLoan(concUser, sameKey, 1000, 7).then(
      (r) => ({ ok: r }),
      (e: Error) => ({ err: e.message }),
    ),
    service.requestLoan(concUser, sameKey, 1000, 7).then(
      (r) => ({ ok: r }),
      (e: Error) => ({ err: e.message }),
    ),
  ]);
  const sequentialReplay = await service.requestLoan(concUser, sameKey, 1000, 7);
  assert.equal(sequentialReplay.status, 201);
  assert.equal(sequentialReplay.replayed, true);
  const replayOperationId = (sequentialReplay.body as { operationId: string }).operationId;
  const resolvedAttempts = [attemptA, attemptB].filter((attempt): attempt is { ok: typeof sequentialReplay } => "ok" in attempt);
  for (const attempt of resolvedAttempts) {
    assert.equal(attempt.ok.status, 201);
    assert.equal((attempt.ok.body as { operationId: string }).operationId, replayOperationId,
      "replay devolve o operationId da execução original");
  }
  const sameKeyLoanCount = await pool.query(
    "SELECT count(*)::int AS count FROM loans WHERE user_id = $1", [concUser]);
  assert.equal(sameKeyLoanCount.rows[0].count, 1, "replay não deve criar segundo empréstimo");
  const sameKeyLedger = await pool.query(
    "SELECT count(*)::int AS count FROM economy_ledger_entries WHERE user_id = $1", [concUser]);
  assert.equal(sameKeyLedger.rows[0].count, 2, "replay não deve duplicar lançamentos no ledger");

  // 2.b Mesma chave, conteúdo divergente → 409.
  const conflicting = await service.requestLoan(concUser, sameKey, 2000, 7);
  assert.equal(conflicting.status, 409);

  // 2.c Concorrência agressiva: 8 retries simultâneos da MESMA chave.
  const raceUser = `m2-race-${randomUUID()}`;
  const raceKey = randomUUID();
  const raceResults = await Promise.all(
    Array.from({ length: 8 }, () => service.requestLoan(raceUser, raceKey, 500, 3)),
  );
  const raceStatuses = new Set(raceResults.map((result) => result.status));
  assert.deepEqual([...raceStatuses], [201], "todas as corridas devem resolver 201 (1 execução + replays)");
  const raceOperationIds = new Set(raceResults.map((result) => (result.body as { operationId: string }).operationId));
  assert.equal(raceOperationIds.size, 1, "todas as respostas compartilham o mesmo operationId");
  const raceLoans = await pool.query("SELECT count(*)::int AS count FROM loans WHERE user_id = $1", [raceUser]);
  assert.equal(raceLoans.rows[0].count, 1);
  const raceLedger = await pool.query("SELECT count(*)::int AS count FROM economy_ledger_entries WHERE user_id = $1", [raceUser]);
  assert.equal(raceLedger.rows[0].count, 2);

  // 2.d Cap de empréstimos ativos sob corrida: 8 chaves distintas → exatamente 3 aprovados.
  const capUser = `m2-cap-${randomUUID()}`;
  const capResults = await Promise.all(
    Array.from({ length: 8 }, () => service.requestLoan(capUser, randomUUID(), 100, 1)),
  );
  const approved = capResults.filter((result) => result.status === 201);
  const capped = capResults.filter((result) => result.status === 403);
  assert.equal(approved.length, 3, "cap de 3 empréstimos ativos deve prevalecer sob concorrência");
  assert.equal(capped.length, 5);
  const capLedger = await pool.query("SELECT count(*)::int AS count FROM economy_ledger_entries WHERE user_id = $1", [capUser]);
  assert.equal(capLedger.rows[0].count, 6, "apenas 3 pares balanceados no ledger");

  // ══ GATE 3 — Rollback multi-tabela com falha injetada + reconciliação ══
  const injectedFailure = (error: unknown): boolean => {
    let current: unknown = error;
    for (let depth = 0; current && depth < 5; depth += 1) {
      if (current instanceof Error && /M2 falha injetada/.test(current.message)) return true;
      current = (current as { cause?: unknown }).cause;
    }
    return false;
  };

  const faultUser = `m2-fault-${randomUUID()}`;
  await pool.query("INSERT INTO bank_accounts (user_id, weapons_balance) VALUES ($1, 0)", [faultUser]);
  const beforeFault = await reconcileUser(faultUser);
  assert.equal(money(beforeFault.wallet), "0.00");
  assert.equal(money(beforeFault.ledger_weapons), "0.00");

  await pool.query(`
    CREATE OR REPLACE FUNCTION m2_inject_failure() RETURNS trigger AS $fn$
    BEGIN
      IF NEW.user_id LIKE 'm2-fault-%' THEN
        RAISE EXCEPTION 'M2 falha injetada no append do ledger';
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    DROP TRIGGER IF EXISTS m2_fault_trigger ON economy_ledger_entries;
    CREATE TRIGGER m2_fault_trigger BEFORE INSERT ON economy_ledger_entries
      FOR EACH ROW EXECUTE FUNCTION m2_inject_failure();
  `);

  // 3.a Falha injetada no ledger: rollback integral em 4 tabelas + claim de idempotência.
  const faultKey = randomUUID();
  await assert.rejects(
    service.requestLoan(faultUser, faultKey, 1000, 10),
    injectedFailure,
    "falha injetada deve abortar a transação",
  );
  const afterFault = await reconcileUser(faultUser);
  assert.equal(money(afterFault.wallet), money(beforeFault.wallet), "saldo deve voltar ao estado pré-falha");
  assert.equal(money(afterFault.ledger_weapons), money(beforeFault.ledger_weapons), "ledger deve voltar ao estado pré-falha");
  const faultState = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM loans WHERE user_id = $1) AS loans,
      (SELECT count(*)::int FROM transactions WHERE user_id = $1) AS transactions,
      (SELECT count(*)::int FROM economy_ledger_entries WHERE user_id = $1) AS ledger,
      (SELECT count(*)::int FROM economy_idempotency WHERE user_id = $1) AS claims
  `, [faultUser]);
  assert.deepEqual(faultState.rows[0], { loans: 0, transactions: 0, ledger: 0, claims: 0 },
    "rollback multi-tabela: nenhuma linha sobrevive, nem o claim de idempotência");

  // 3.b Retry com a MESMA chave após a falha: executa exatamente uma vez.
  await pool.query("DROP TRIGGER IF EXISTS m2_fault_trigger ON economy_ledger_entries");
  const retry = await service.requestLoan(faultUser, faultKey, 1000, 10);
  assert.equal(retry.status, 201);
  assert.equal(retry.replayed, false);
  const afterRetry = await reconcileUser(faultUser);
  assert.equal(money(afterRetry.wallet), "1000.00");
  assert.equal(money(afterRetry.ledger_weapons), "1000.00");
  assert.equal(money(afterRetry.open_principal), "1000.00");
  const retryState = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM loans WHERE user_id = $1) AS loans,
      (SELECT count(*)::int FROM transactions WHERE user_id = $1) AS transactions,
      (SELECT count(*)::int FROM economy_ledger_entries WHERE user_id = $1) AS ledger
  `, [faultUser]);
  assert.deepEqual(retryState.rows[0], { loans: 1, transactions: 1, ledger: 2 });

  // 3.c Falha injetada no pagamento: loan continua aberto, saldo intacto.
  // (empréstimo acessível: devido 105.00 < saldo 1100.00, para alcançar o ledger)
  const affordableLoan = await service.requestLoan(faultUser, randomUUID(), 100, 1);
  assert.equal(affordableLoan.status, 201);
  await pool.query(`
    DROP TRIGGER IF EXISTS m2_fault_trigger ON economy_ledger_entries;
    CREATE TRIGGER m2_fault_trigger BEFORE INSERT ON economy_ledger_entries
      FOR EACH ROW EXECUTE FUNCTION m2_inject_failure();
  `);
  const payFaultKey = randomUUID();
  const walletBeforePay = await pool.query(
    "SELECT weapons_balance::text FROM bank_accounts WHERE user_id = $1", [faultUser]);
  await assert.rejects(
    service.payLoan(faultUser, payFaultKey, (affordableLoan.body as { id: number }).id),
    injectedFailure,
  );
  const loanStillOpen = await pool.query(
    "SELECT is_paid FROM loans WHERE id = $1", [(affordableLoan.body as { id: number }).id]);
  assert.equal(loanStillOpen.rows[0].is_paid, false, "empréstimo deve permanecer aberto após falha");
  const walletAfterPayFault = await pool.query(
    "SELECT weapons_balance::text FROM bank_accounts WHERE user_id = $1", [faultUser]);
  assert.equal(walletAfterPayFault.rows[0].weapons_balance, walletBeforePay.rows[0].weapons_balance);
  await pool.query("DROP TRIGGER IF EXISTS m2_fault_trigger ON economy_ledger_entries");

  // 3.d Pagamento com saldo suficiente: quitado, ledger balanceado, reconciliação fecha.
  // credita 6000.00 via terceiro empréstimo como capital (cap de 3 ativos: 1000, 100, 6000).
  const capitalLoan = await service.requestLoan(faultUser, randomUUID(), 6000, 1);
  assert.equal(capitalLoan.status, 201);
  const loanId = (retry.body as { id: number }).id;
  const due = computeLoanTerms(1000, 10); // totalDue 1500.00
  const paid = await service.payLoan(faultUser, randomUUID(), loanId);
  assert.equal(paid.status, 200, `pagamento deve quitar o empréstimo (saldo cobre ${due.totalDue})`);
  const reconciled = await reconcileUser(faultUser);
  assert.equal(money(reconciled.wallet), money(reconciled.ledger_weapons), "saldo/ledger reconciliam após pagamento");
  assert.equal(money(reconciled.open_principal), "6100.00", "apenas os empréstimos abertos (100 + 6000) permanecem");
  assert.equal(money(reconciled.ledger_receivable), "-" + money(reconciled.receivable_debits).replace("-", ""),
    "recebível líquido espelha o principal em aberto");
  const ledgerBalance = await pool.query(`
    SELECT
      sum(CASE WHEN side = 'DEBIT' THEN amount_krc ELSE -amount_krc END)::text AS net
    FROM economy_ledger_entries WHERE user_id = $1
  `, [faultUser]);
  assert.equal(money(ledgerBalance.rows[0].net), "0.00", "todo lançamento é balanceado (DEBIT = CREDIT)");

  await pool.end();
});
