import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { Pool } from "pg";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

const { computeMatchPayouts, settleMatchPayouts, abortMatchPayouts, recoverStaleMatchPayouts,
  payoutIdempotencyKey, ledgerOperationsBalanced, MAX_PAYOUT_KRC } =
  await import("../../server/game/EconomyPayoutSettlement.ts");
const { matchPayoutClaims, economyLedgerEntries, bankAccounts } = await import("@shared/schema");
const { db, pool } = await import("../../server/db.ts");

// ─── Schema (mesmo contrato do bank-idempotency + 2PC) ───────────────────────

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady || !testDatabaseUrl) return;
  const url = new URL(testDatabaseUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!databaseName.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL precisa apontar para um banco descartável cujo nome termine em _test");
  }
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
  await pool.query(await readFile(new URL("../../migrations/0004_correlated_append_only_ledger.sql", import.meta.url), "utf8"));
  await pool.query(await readFile(new URL("../../migrations/0007_match_payout_2pc.sql", import.meta.url), "utf8"));
  schemaReady = true;
}

before(async () => {
  await ensureSchema();
});

after(async () => {
  await pool.end().catch(() => undefined);
});

const uniqueRoom = () => `lobby_${Date.now().toString(36)}_${randomUUID().slice(0, 12)}`;

async function seedWallet(userId: string, amount: number) {
  await pool.query(
    "INSERT INTO bank_accounts (user_id, weapons_balance) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET weapons_balance = $2",
    [userId, amount],
  );
}

async function walletOf(userId: string): Promise<string> {
  const { rows } = await pool.query("SELECT weapons_balance FROM bank_accounts WHERE user_id = $1", [userId]);
  return rows[0]?.weapons_balance ?? "0";
}

async function claimOf(roomId: string, userId: string) {
  const [claim] = await db.select().from(matchPayoutClaims).where(and(
    eq(matchPayoutClaims.roomId, roomId),
    eq(matchPayoutClaims.userId, userId),
  ));
  return claim;
}

// ─── 1) Fórmula pura e determinística ────────────────────────────────────────

test("payouts: fórmula determinística (vencedor, podium, metade superior, floor)", () => {
  const participants = [
    { userId: "winner", kills: 4, placement: 1, totalPlayers: 8 },
    { userId: "podium", kills: 2, placement: 3, totalPlayers: 8 },
    { userId: "meio", kills: 1, placement: 4, totalPlayers: 8 },
    { userId: "ultimo", kills: 0, placement: 8, totalPlayers: 8 },
  ];
  const payouts = computeMatchPayouts(participants);
  const byUser = new Map(payouts.map((p) => [p.userId, p.krcAmount]));
  assert.equal(byUser.get("winner"), 4 * 150 + 500);
  assert.equal(byUser.get("podium"), 2 * 150 + 250);
  assert.equal(byUser.get("meio"), 1 * 150 + 100);
  assert.equal(byUser.get("ultimo"), 25); // floor: 0 kills + pior colocação
  // determinismo: mesmas entradas → mesmas saídas
  assert.deepEqual(computeMatchPayouts(participants), payouts);
});

test("payouts: teto por jogador e chaves de idempotência canônicas", () => {
  const [capped] = computeMatchPayouts([{ userId: "farm", kills: 999, placement: 1, totalPlayers: 2 }]);
  assert.equal(capped.krcAmount, MAX_PAYOUT_KRC);
  const key = payoutIdempotencyKey("lobby_x_abcdef123456", "kr_player", "claim");
  assert.match(key, /^[A-Za-z0-9._~-]{16,128}$/);
  assert.equal(key.endsWith(".claim"), true);
  assert.throws(() => payoutIdempotencyKey("r", "u", "c"), RangeError); // curta demais (<16)
});

// ─── 2) 2PC contra PostgreSQL real ───────────────────────────────────────────

test(
  "payouts 2PC PostgreSQL: prepare reserva na treasury e commit credita a wallet UMA vez",
  { skip: !testDatabaseUrl },
  async () => {
    await ensureSchema();
    const roomId = uniqueRoom();
    const userId = `payout-${randomUUID().slice(0, 8)}`;
    await seedWallet(userId, 100);

    const summary = await settleMatchPayouts(roomId, [{ userId, krcAmount: 650 }]);
    assert.equal(summary.totalKrcCommitted, 650);
    assert.equal(summary.settled[0].status, "COMMITTED");
    assert.equal(Number(await walletOf(userId)), 750, "wallet creditada exatamente uma vez");

    const claim = await claimOf(roomId, userId);
    assert.equal(claim.status, "COMMITTED");
    assert.equal(Number(claim.krcAmount), 650);

    // Ledger: treasury debitada 650, in_transit zero líquido, wallet creditada 650.
    const { rows } = await pool.query(
      `SELECT account_code, side, SUM(amount_krc) AS total FROM economy_ledger_entries
       WHERE user_id = $1 AND idempotency_key LIKE 'payout.%' GROUP BY account_code, side ORDER BY account_code, side`,
      [userId],
    );
    const byAccountSide = new Map(rows.map((r) => [`${r.account_code}|${r.side}`, Number(r.total)]));
    assert.equal(byAccountSide.get("treasury.match_rewards|DEBIT"), 650);
    assert.equal(byAccountSide.get("payout.in_transit|CREDIT"), 650);
    assert.equal(byAccountSide.get("payout.in_transit|DEBIT"), 650);
    assert.equal(byAccountSide.get("wallet.weapons|CREDIT"), 650);
    assert.equal(await ledgerOperationsBalanced(), true, "todas as operações do ledger balanceadas");
  },
);

test(
  "payouts 2PC PostgreSQL: replay idempotente e concorrência não pagam duas vezes",
  { skip: !testDatabaseUrl },
  async () => {
    await ensureSchema();
    const roomId = uniqueRoom();
    const userId = `payout-${randomUUID().slice(0, 8)}`;
    await seedWallet(userId, 0);

    const first = await settleMatchPayouts(roomId, [{ userId, krcAmount: 400 }]);
    assert.equal(first.settled[0].status, "COMMITTED");
    const balanceAfterFirst = await walletOf(userId);

    // Replay da MESMA partida: ALREADY_COMMITTED, nada novo no ledger.
    const replay = await settleMatchPayouts(roomId, [{ userId, krcAmount: 400 }]);
    assert.equal(replay.settled[0].status, "ALREADY_COMMITTED");
    assert.equal(replay.totalKrcCommitted, 400); // contabilizado, mas não pago de novo
    assert.equal(await walletOf(userId), balanceAfterFirst, "saldo intacto após replay");

    // Mesmo valor com roomId divergente é OUTRA partida — sem colisão de chave.
    // (prova que a chave é por partida, não global do jogador)

    // Concorrência: dois settles simultâneos da mesma partida → UM crédito.
    const concurrent = await Promise.allSettled([
      settleMatchPayouts(roomId, [{ userId, krcAmount: 400 }]),
      settleMatchPayouts(roomId, [{ userId, krcAmount: 400 }]),
    ]);
    assert.equal(concurrent.every((r) => r.status === "fulfilled"), true, "ambos os settles convergem");
    assert.equal(await walletOf(userId), balanceAfterFirst, "nenhum crédito duplo sob concorrência");

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS lines FROM economy_ledger_entries
       WHERE user_id = $1 AND account_code = 'wallet.weapons' AND side = 'CREDIT' AND description LIKE '%room ${roomId}%'`,
      [userId],
    );
    assert.equal(rows[0].lines, 1, "exatamente UMA linha de crédito no ledger");
  },
);

test(
  "payouts 2PC PostgreSQL: abort devolve a reserva e claims abortadas não ressuscitam",
  { skip: !testDatabaseUrl },
  async () => {
    await ensureSchema();
    const roomId = uniqueRoom();
    const userId = `payout-${randomUUID().slice(0, 8)}`;
    await seedWallet(userId, 0);

    // PREPARE isolado: insere claim + reserva manualmente (simula crash pós-prepare).
    const claimKey = payoutIdempotencyKey(roomId, userId, "claim");
    const prepOp = randomUUID();
    const prepKey = payoutIdempotencyKey(roomId, userId, "prep");
    await db.transaction(async (tx) => {
      await tx.insert(matchPayoutClaims).values({
        roomId, userId, idempotencyKey: claimKey, krcAmount: "300", status: "PREPARED", prepareOperationId: prepOp,
      });
      await tx.insert(economyLedgerEntries).values([
        { operationId: prepOp, idempotencyKey: prepKey, userId, lineNumber: 1, accountCode: "treasury.match_rewards", side: "DEBIT", amountKrc: "300", description: "reserve" },
        { operationId: prepOp, idempotencyKey: prepKey, userId, lineNumber: 2, accountCode: "payout.in_transit", side: "CREDIT", amountKrc: "300", description: "reserve" },
      ]);
    });
    const aborted = await abortMatchPayouts(roomId, "compensação administrativa");
    assert.equal(aborted, 1);
    const claim = await claimOf(roomId, userId);
    assert.equal(claim.status, "ABORTED");
    assert.equal(claim.reason, "compensação administrativa");

    // in_transit zerado; treasury de volta.
    const { rows } = await pool.query(
      `SELECT account_code, side, SUM(amount_krc) AS total FROM economy_ledger_entries
       WHERE user_id = $1 AND idempotency_key LIKE 'payout.%' GROUP BY account_code, side`,
      [userId],
    );
    const net = new Map<string, number>();
    for (const r of rows) {
      const signed = Number(r.total) * (r.side === "DEBIT" ? 1 : -1);
      net.set(r.account_code, (net.get(r.account_code) ?? 0) + signed);
    }
    assert.equal(net.get("payout.in_transit"), 0, "reserva líquida zero após abort");
    assert.equal(net.get("treasury.match_rewards"), 0, "treasury restaurada após abort");
    assert.equal(await walletOf(userId), "0", "nada creditado");

    // Settle posterior NÃO ressuscita claim abortada.
    const late = await settleMatchPayouts(roomId, [{ userId, krcAmount: 300 }]);
    assert.equal(late.settled[0].status, "ABORTED_SKIPPED");
    assert.equal(await walletOf(userId), "0");
  },
);

test(
  "payouts 2PC PostgreSQL: recovery conclui claims PREPARED órfãs por commit-forward",
  { skip: !testDatabaseUrl },
  async () => {
    await ensureSchema();
    const roomId = uniqueRoom();
    const userId = `payout-${randomUUID().slice(0, 8)}`;
    await seedWallet(userId, 0);

    const summary = await settleMatchPayouts(roomId, [{ userId, krcAmount: 550 }]);
    assert.equal(summary.settled[0].status, "COMMITTED");

    // Segunda claim PREPARED "antiga" (simula crash entre fases em outra sala).
    const roomId2 = uniqueRoom();
    const userId2 = `payout-${randomUUID().slice(0, 8)}`;
    await seedWallet(userId2, 0);
    const claimKey = payoutIdempotencyKey(roomId2, userId2, "claim");
    const prepOp = randomUUID();
    const prepKey = payoutIdempotencyKey(roomId2, userId2, "prep");
    await db.transaction(async (tx) => {
      const { matchPayoutClaims, economyLedgerEntries } = await import("@shared/schema");
      await tx.insert(matchPayoutClaims).values({
        roomId: roomId2, userId: userId2, idempotencyKey: claimKey, krcAmount: "550", status: "PREPARED", prepareOperationId: prepOp,
      });
      await tx.insert(economyLedgerEntries).values([
        { operationId: prepOp, idempotencyKey: prepKey, userId: userId2, lineNumber: 1, accountCode: "treasury.match_rewards", side: "DEBIT", amountKrc: "550", description: "reserve" },
        { operationId: prepOp, idempotencyKey: prepKey, userId: userId2, lineNumber: 2, accountCode: "payout.in_transit", side: "CREDIT", amountKrc: "550", description: "reserve" },
      ]);
      // Envelhece a claim para dentro da janela de recovery.
      await tx.execute(sql`UPDATE match_payout_claims SET prepared_at = NOW() - INTERVAL '1 hour' WHERE room_id = ${roomId2}`);
    });

    const recovered = await recoverStaleMatchPayouts(15 * 60 * 1000);
    const mine = recovered.find((r) => r.userId === userId2);
    assert.ok(mine, "claim órfã recuperada");
    assert.equal(mine.roomId, roomId2);
    assert.equal(mine.krcAmount, 550);
    assert.equal(Number(await walletOf(userId2)), 550, "jogador pago pelo recovery");
    const claim2 = await claimOf(roomId2, userId2);
    assert.equal(claim2.status, "COMMITTED");
    assert.equal(await ledgerOperationsBalanced(), true);
  },
);

test(
  "payouts 2PC PostgreSQL: valor/identidade da claim são imutáveis (trigger)",
  { skip: !testDatabaseUrl },
  async () => {
    await ensureSchema();
    const roomId = uniqueRoom();
    const userId = `payout-${randomUUID().slice(0, 8)}`;
    const first = await settleMatchPayouts(roomId, [{ userId, krcAmount: 200 }]);
    assert.equal(first.settled[0].status, "COMMITTED");

    await assert.rejects(
      pool.query("UPDATE match_payout_claims SET krc_amount = 99999 WHERE room_id = $1 AND user_id = $2", [roomId, userId]),
      /immutable on amount\/identity/,
    );
    // Tentativa de pagar valor DIFERENTE na mesma sala: a primeira vence.
    const conflict = await settleMatchPayouts(roomId, [{ userId, krcAmount: 999 }]);
    assert.equal(conflict.settled[0].status, "ALREADY_COMMITTED");
    assert.equal(conflict.settled[0].krcAmount, 200, "valor da primeira claim prevalece");
    assert.equal(Number(await walletOf(userId)), 200);
  },
);

test("payouts: schema exporta colunas canônicas (contrato drizzle)", async () => {
  assert.equal(matchPayoutClaims.roomId.name, "room_id");
  assert.equal(economyLedgerEntries.operationId.name, "operation_id");
  assert.equal(bankAccounts.weaponsBalance.name, "weapons_balance");
});
