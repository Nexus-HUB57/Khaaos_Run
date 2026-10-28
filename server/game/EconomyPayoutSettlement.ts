/**
 * KHAAOS RUN — Match Payout Settlement (2PC persistente — auditoria Fase 2)
 * ==========================================================================
 * O EconomyMatchBridge calcula prêmios in-memory; o KRC REAL só entra no
 * ledger aqui, no fim da partida, com duas garantias de nível bancário:
 *
 *  1. IDEMPOTÊNCIA por chave determinística: payout.<roomId>.<userId>.
 *     Retries, re-execução pós-crash e concorrência convergem para UM único
 *     crédito por (partida, jogador) — enforced por unique indexes no banco
 *     (match_payout_room_user_unique + economy_ledger_user_key_line_unique).
 *
 *  2. TWO-PHASE COMMIT persistente (padrão ZEX da auditoria):
 *       FASE 1 (PREPARE)  — transação própria grava a claim PREPARED e as
 *                           linhas DEBIT treasury.match_rewards /
 *                           CREDIT payout.in_transit (fundo reservado, visível
 *                           e auditável no ledger). Durable: crash após o
 *                           prepare mantém a reserva íntegra.
 *       FASE 2 (COMMIT)   — transação própria (por payout) credita a wallet
 *                           (DEBIT payout.in_transit / CREDIT wallet.weapons)
 *                           e marca a claim COMMITTED.
 *       ABORT             — devolve a reserva (DEBIT payout.in_transit /
 *                           CREDIT treasury.match_rewards) e marca ABORTED.
 *       RECOVERY          — claims PREPARED órfãs (crash entre fases) são
 *                           concluídas por commit-forward: o jogador ganhou o
 *                           prêmio na partida; a reserva já saiu da treasury.
 *
 * Cada fase é uma operação PRÓPRIA no ledger (o trigger
 * economy_ledger_operation_balanced é DEFERRABLE INITIALLY DEFERRED e valida
 * o balanço por transação — fases compartilhando operation_id quebrariam o
 * estado intermediário). Falha de settlement NUNCA propaga para o fluxo da
 * partida: o recoverStaleMatchPayouts cobre o resíduo.
 */

import { randomUUID } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { db as defaultDb } from "../db";
import { bankAccounts, economyLedgerEntries, matchPayoutClaims } from "@shared/schema";

type Db = typeof defaultDb;
type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const PAYOUT_KEY_PREFIX = "payout";
export const MAX_PAYOUT_KRC = 25_000; // parity com EconomyMatchConfig.maxKillReward

/** Chave determinística de idempotência por (partida, jogador, fase). */
export function payoutIdempotencyKey(roomId: string, userId: string, phase: "claim" | "prep" | "cmt" | "abt"): string {
  const raw = `${PAYOUT_KEY_PREFIX}.${roomId}.${userId}.${phase}`;
  if (!/^[A-Za-z0-9._~-]{16,128}$/.test(raw)) {
    throw new RangeError(`Chave de idempotência de payout fora do formato canônico: ${raw.slice(0, 24)}…`);
  }
  return raw;
}

// ─── Fórmula determinística de payout (fim de partida) ───────────────────────

export interface PayoutParticipant {
  userId: string;
  kills: number;
  placement: number;
  totalPlayers: number;
}

export interface MatchPayout {
  userId: string;
  krcAmount: number;
}

export const MATCH_PAYOUT_CONFIG = {
  perKillKrc: 150, // parity com EconomyMatchConfig.baseKillReward
  firstPlaceKrc: 500,
  podiumKrc: 250, // 2º–3º
  topHalfKrc: 100,
  floorKrc: 25,
} as const;

/** Puro e determinístico: a mesma partida produz sempre os mesmos payouts. */
export function computeMatchPayouts(participants: PayoutParticipant[]): MatchPayout[] {
  const payouts: MatchPayout[] = [];
  for (const p of participants) {
    const kills = Math.max(0, Math.round(p.kills || 0));
    const placement = Math.max(1, Math.round(p.placement || 1));
    const totalPlayers = Math.max(1, Math.round(p.totalPlayers || 1));

    let placementKrc: number;
    if (placement === 1) placementKrc = MATCH_PAYOUT_CONFIG.firstPlaceKrc;
    else if (placement <= 3) placementKrc = MATCH_PAYOUT_CONFIG.podiumKrc;
    else if (placement <= Math.ceil(totalPlayers / 2)) placementKrc = MATCH_PAYOUT_CONFIG.topHalfKrc;
    else placementKrc = MATCH_PAYOUT_CONFIG.floorKrc;

    const total = Math.min(MAX_PAYOUT_KRC, kills * MATCH_PAYOUT_CONFIG.perKillKrc + placementKrc);
    if (total <= 0) continue;
    payouts.push({ userId: p.userId, krcAmount: total });
  }
  return payouts;
}

// ─── Tipos de resultado ──────────────────────────────────────────────────────

export type ClaimStatus = "PREPARED" | "COMMITTED" | "ABORTED";

export interface SettledPayout {
  userId: string;
  krcAmount: number;
  /** COMMITTED = pago nesta chamada; ALREADY_COMMITTED = replay idempotente;
   *  PREPARED = reserva feita mas commit não concluído (recovery conclui);
   *  ABORTED_SKIPPED = claim abortada anteriormente (não se revive). */
  status: "COMMITTED" | "ALREADY_COMMITTED" | "PREPARED" | "ABORTED_SKIPPED";
}

export interface SettlementSummary {
  roomId: string;
  settled: SettledPayout[];
  totalKrcCommitted: number;
}

// ─── Fase 1: PREPARE (batch atômico — um tx para todos os payouts) ───────────

async function prepareClaims(
  tx: DbTransaction,
  roomId: string,
  payouts: MatchPayout[],
): Promise<Map<string, { status: ClaimStatus; krcAmount: number; amountMismatch: boolean }>> {
  const states = new Map<string, { status: ClaimStatus; krcAmount: number; amountMismatch: boolean }>();

  for (const payout of payouts) {
    if (!Number.isSafeInteger(payout.krcAmount) || payout.krcAmount <= 0 || payout.krcAmount > MAX_PAYOUT_KRC) {
      throw new RangeError(`Payout inválido para ${payout.userId}: ${payout.krcAmount}`);
    }
    const key = payoutIdempotencyKey(roomId, payout.userId, "claim");
    const prepareOp = randomUUID();
    const amount = String(payout.krcAmount);

    // Claim: ganha quem inserir; perdedor lê o estado vencedor (convergência).
    const [claim] = await tx.insert(matchPayoutClaims).values({
      roomId,
      userId: payout.userId,
      idempotencyKey: key,
      krcAmount: amount,
      status: "PREPARED",
      prepareOperationId: prepareOp,
    }).onConflictDoNothing({
      target: [matchPayoutClaims.roomId, matchPayoutClaims.userId],
    }).returning();

    if (!claim) {
      const [existing] = await tx.select().from(matchPayoutClaims).where(and(
        eq(matchPayoutClaims.roomId, roomId),
        eq(matchPayoutClaims.userId, payout.userId),
      )).limit(1);
      if (!existing) throw new Error(`Claim de payout sumiu durante o prepare (${roomId}/${payout.userId})`);
      const mismatch = Number(existing.krcAmount) !== payout.krcAmount;
      states.set(payout.userId, { status: existing.status as ClaimStatus, krcAmount: Number(existing.krcAmount), amountMismatch: mismatch });
      if (mismatch) {
        // Mesma partida/jogador com valor divergente é bug de fórmula: nunca
        // paga o segundo valor — o primeiro venceu (determinismo).
        console.warn("[Payouts] claim existente com valor divergente; primeiro vence", {
          roomId, userId: payout.userId, prepared: existing.krcAmount, attempted: payout.krcAmount,
        });
      }
      continue;
    }

    // Reserva no ledger: treasury → in_transit (operação própria e balanceada).
    const prepKey = payoutIdempotencyKey(roomId, payout.userId, "prep");
    await tx.insert(economyLedgerEntries).values([
      {
        operationId: prepareOp,
        idempotencyKey: prepKey,
        userId: payout.userId,
        lineNumber: 1,
        accountCode: "treasury.match_rewards",
        side: "DEBIT",
        amountKrc: amount,
        description: `Match payout reserved for ${payout.userId} (room ${roomId})`,
      },
      {
        operationId: prepareOp,
        idempotencyKey: prepKey,
        userId: payout.userId,
        lineNumber: 2,
        accountCode: "payout.in_transit",
        side: "CREDIT",
        amountKrc: amount,
        description: `Match payout in transit (room ${roomId})`,
      },
    ]);
    states.set(payout.userId, { status: "PREPARED", krcAmount: payout.krcAmount, amountMismatch: false });
  }

  return states;
}

// ─── Fase 2: COMMIT (uma transação por payout — progresso durável) ───────────

async function commitClaim(tx: DbTransaction, roomId: string, userId: string): Promise<SettledPayout["status"]> {
  // FOR UPDATE: serializa commits concorrentes da mesma claim.
  const [claim] = await tx.select().from(matchPayoutClaims).where(and(
    eq(matchPayoutClaims.roomId, roomId),
    eq(matchPayoutClaims.userId, userId),
  )).for("update");
  if (!claim) throw new Error(`Claim ausente no commit (${roomId}/${userId})`);
  if (claim.status === "COMMITTED") return "ALREADY_COMMITTED";
  if (claim.status === "ABORTED") return "ABORTED_SKIPPED";

  const amount = claim.krcAmount;
  const resolveOp = randomUUID();
  const cmtKey = payoutIdempotencyKey(roomId, userId, "cmt");

  // Crédito no ledger: in_transit → wallet (operação própria e balanceada).
  await tx.insert(economyLedgerEntries).values([
    {
      operationId: resolveOp,
      idempotencyKey: cmtKey,
      userId,
      lineNumber: 1,
      accountCode: "payout.in_transit",
      side: "DEBIT",
      amountKrc: amount,
      description: `Match payout committed (room ${roomId})`,
    },
    {
      operationId: resolveOp,
      idempotencyKey: cmtKey,
      userId,
      lineNumber: 2,
      accountCode: "wallet.weapons",
      side: "CREDIT",
      amountKrc: amount,
      description: `Match payout credited (room ${roomId})`,
    },
  ]);

  // Wallet do jogador (conta criada se ausente; crédito incremental).
  await tx.insert(bankAccounts).values({ userId }).onConflictDoNothing();
  await tx.update(bankAccounts).set({
    weaponsBalance: sql`round(${bankAccounts.weaponsBalance} + ${amount}::numeric, 2)`,
  }).where(eq(bankAccounts.userId, userId));

  await tx.update(matchPayoutClaims).set({
    status: "COMMITTED",
    resolveOperationId: resolveOp,
    resolvedAt: new Date(),
  }).where(eq(matchPayoutClaims.id, claim.id));

  return "COMMITTED";
}

/** ABORT explícito: devolve a reserva de uma claim PREPARED. */
async function abortClaim(tx: DbTransaction, roomId: string, userId: string, reason: string): Promise<boolean> {
  const [claim] = await tx.select().from(matchPayoutClaims).where(and(
    eq(matchPayoutClaims.roomId, roomId),
    eq(matchPayoutClaims.userId, userId),
  )).for("update");
  if (!claim || claim.status !== "PREPARED") return false;

  const resolveOp = randomUUID();
  const abtKey = payoutIdempotencyKey(roomId, userId, "abt");
  await tx.insert(economyLedgerEntries).values([
    {
      operationId: resolveOp,
      idempotencyKey: abtKey,
      userId,
      lineNumber: 1,
      accountCode: "payout.in_transit",
      side: "DEBIT",
      amountKrc: claim.krcAmount,
      description: `Match payout aborted (room ${roomId})`,
    },
    {
      operationId: resolveOp,
      idempotencyKey: abtKey,
      userId,
      lineNumber: 2,
      accountCode: "treasury.match_rewards",
      side: "CREDIT",
      amountKrc: claim.krcAmount,
      description: `Match payout returned to treasury (room ${roomId})`,
    },
  ]);
  await tx.update(matchPayoutClaims).set({
    status: "ABORTED",
    resolveOperationId: resolveOp,
    resolvedAt: new Date(),
    reason: reason.slice(0, 256),
  }).where(eq(matchPayoutClaims.id, claim.id));
  return true;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Liquida os payouts de uma partida (2PC): PREPARE atômico em lote, depois
 * COMMIT individual por jogador. Idempotente: reexecutar converge.
 */
export async function settleMatchPayouts(
  roomId: string,
  payouts: MatchPayout[],
  options?: { database?: Db },
): Promise<SettlementSummary> {
  const database = options?.database ?? defaultDb;
  const settled: SettledPayout[] = [];
  if (payouts.length === 0) {
    return { roomId, settled, totalKrcCommitted: 0 };
  }

  // FASE 1 — PREPARE (uma transação; falha aborta o lote inteiro sem efeito).
  const states = await database.transaction(async (tx) => prepareClaims(tx, roomId, payouts));

  // FASE 2 — COMMIT por payout (transações separadas: crash no meio deixa
  // claims PREPARED que o recovery conclui por commit-forward).
  for (const payout of payouts) {
    const state = states.get(payout.userId);
    if (!state) continue;
    if (state.amountMismatch) {
      // Valor divergente: a claim original (primeira) é a válida.
      if (state.status === "PREPARED") {
        const status = await database.transaction((tx) => commitClaim(tx, roomId, payout.userId));
        settled.push({ userId: payout.userId, krcAmount: state.krcAmount, status });
      } else if (state.status === "COMMITTED") {
        settled.push({ userId: payout.userId, krcAmount: state.krcAmount, status: "ALREADY_COMMITTED" });
      } else {
        settled.push({ userId: payout.userId, krcAmount: state.krcAmount, status: "ABORTED_SKIPPED" });
      }
      continue;
    }
    const status = await database.transaction((tx) => commitClaim(tx, roomId, payout.userId));
    settled.push({ userId: payout.userId, krcAmount: payout.krcAmount, status });
  }

  const totalKrcCommitted = settled
    .filter((s) => s.status === "COMMITTED" || s.status === "ALREADY_COMMITTED")
    .reduce((sum, s) => sum + s.krcAmount, 0);
  return { roomId, settled, totalKrcCommitted };
}

/** Aborta todas as claims PREPARED de uma sala (compensação administrativa). */
export async function abortMatchPayouts(
  roomId: string,
  reason: string,
  options?: { database?: Db },
): Promise<number> {
  const database = options?.database ?? defaultDb;
  const pending = await database.select().from(matchPayoutClaims).where(and(
    eq(matchPayoutClaims.roomId, roomId),
    eq(matchPayoutClaims.status, "PREPARED"),
  ));
  let aborted = 0;
  for (const claim of pending) {
    const ok = await database.transaction((tx) => abortClaim(tx, roomId, claim.userId, reason));
    if (ok) aborted += 1;
  }
  return aborted;
}

/**
 * Recovery 2PC (commit-forward): claims PREPARED mais velhas que maxAgeMs
 * tiveram a reserva debitada da treasury — o prêmio é devido. Idempotente.
 */
export async function recoverStaleMatchPayouts(
  maxAgeMs = 15 * 60 * 1000,
  options?: { database?: Db; now?: Date },
): Promise<{ roomId: string; userId: string; krcAmount: number }[]> {
  const database = options?.database ?? defaultDb;
  const cutoff = options?.now ?? new Date(Date.now() - maxAgeMs);
  const stale = await database.select().from(matchPayoutClaims).where(and(
    eq(matchPayoutClaims.status, "PREPARED"),
    lt(matchPayoutClaims.preparedAt, cutoff),
  ));
  const recovered: { roomId: string; userId: string; krcAmount: number }[] = [];
  for (const claim of stale) {
    try {
      const status = await database.transaction((tx) => commitClaim(tx, claim.roomId, claim.userId));
      if (status === "COMMITTED" || status === "ALREADY_COMMITTED") {
        recovered.push({ roomId: claim.roomId, userId: claim.userId, krcAmount: Number(claim.krcAmount) });
      }
    } catch (error) {
      console.error("[Payouts] recovery falhou para claim", claim.roomId, claim.userId, error);
    }
  }
  return recovered;
}

/** Invariante para testes/auditoria: toda operação do ledger está balanceada. */
export async function ledgerOperationsBalanced(options?: { database?: Db }): Promise<boolean> {
  const database = options?.database ?? defaultDb;
  const rows = await database.execute(sql`
    SELECT operation_id,
           COALESCE(SUM(amount_krc) FILTER (WHERE side = 'DEBIT'), 0) AS debits,
           COALESCE(SUM(amount_krc) FILTER (WHERE side = 'CREDIT'), 0) AS credits
    FROM economy_ledger_entries
    GROUP BY operation_id
    HAVING COALESCE(SUM(amount_krc) FILTER (WHERE side = 'DEBIT'), 0)
       <> COALESCE(SUM(amount_krc) FILTER (WHERE side = 'CREDIT'), 0)
  `);
  const rowsAny = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
  return Array.isArray(rowsAny) && rowsAny.length === 0;
}
