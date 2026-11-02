/**
 * KHAAOS RUN — Ledger real do alistamento (Fase 47.1)
 * ===================================================
 * No #252 a taxa U$1 é server-authoritative SIMULADA: a sessão marca
 * `fee.paidAt` e `bonusKrcCredited`, mas nenhum KRC real se move — o ledger
 * e a carteira ficam intocados. Aqui entra a camada financeira de verdade,
 * na MESMA escola do 2PC e do Stripe (double-entry em economy_ledger_entries
 * + bank_accounts), com idempotência dura do banco:
 *
 *   TAXA (U$1 = 100 KRC)   DEBIT external.deposit      / CREDIT system.item_sales
 *   BÔNUS (500 KRC)        DEBIT equity.opening_balance / CREDIT wallet.bonus
 *                          (+ bank_accounts.bonus_balance += 500)
 *
 * Contas já whitelisted (migrations 0010 — nenhuma constraint nova).
 *
 * Idempotência: chave determinística derivada de sha256(protocol|headerKey)
 * — `enroll-fee-<hex32>` / `enroll-bonus-<hex32>` (≤ 43 chars, dentro do
 * check ^[A-Za-z0-9._~-]{16,128}$). O unique (user_id, idempotency_key,
 * line_number) do ledger garante crédito ÚNICO mesmo sob corrida/retry —
 * mesma garantia da taxa do #252, agora materializada no banco.
 *
 * Ordem de falha (o guard financeiro é crítico): o handler da taxa chama
 * recordEnrollmentFeeLedger ANTES de marcar a sessão como paga; se o ledger
 * falhar, a sessão permanece AWAITING_FEE e o cliente reenvia a MESMA
 * Idempotency-Key — o replay cai no unique e a sessão progride sem pagar
 * duas vezes.
 */

import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { bankAccounts, economyLedgerEntries } from "@shared/schema";
import { ENROLLMENT_BONUS_KRC, ENROLLMENT_FEE_KRC } from "../routes/enrollment";

export interface EnrollmentLedgerResult {
  feeRecorded: boolean;
  bonusRecorded: boolean;
}

function ledgerKey(kind: "fee" | "bonus", protocol: string, clientKey: string): string {
  const digest = createHash("sha256").update(`${protocol}|${clientKey}`).digest("hex").slice(0, 32);
  return `enroll-${kind}-${digest}`;
}

async function insertBalancedOperation(input: {
  idempotencyKey: string;
  userId: string;
  debitAccount: string;
  creditAccount: string;
  amountKrc: string;
  description: string;
}): Promise<boolean> {
  // UMA operação = UM operationId para as DUAS linhas (o trigger 0004
  // DEFERRED valida ΣDEBIT=ΣCREDIT por operation_id no commit).
  const operationId = randomUUID();
  const rows = [
    {
      operationId,
      idempotencyKey: input.idempotencyKey,
      userId: input.userId,
      lineNumber: 1,
      accountCode: input.debitAccount,
      side: "DEBIT",
      amountKrc: input.amountKrc,
      description: input.description,
    },
    {
      operationId,
      idempotencyKey: input.idempotencyKey,
      userId: input.userId,
      lineNumber: 2,
      accountCode: input.creditAccount,
      side: "CREDIT",
      amountKrc: input.amountKrc,
      description: input.description,
    },
  ];
  const inserted = await db
    .insert(economyLedgerEntries)
    .values(rows)
    .onConflictDoNothing({ target: [economyLedgerEntries.userId, economyLedgerEntries.idempotencyKey, economyLedgerEntries.lineNumber] })
    .returning({ id: economyLedgerEntries.id });
  return inserted.length === 2;
}

/**
 * Registra a taxa + o bônus do alistamento no ledger real e credita a
 * carteira bônus. Idempotente por (protocol, clientKey) — reenvios com a
 * mesma Idempotency-Key do #252 NÃO duplicam nada.
 */
export async function recordEnrollmentFeeLedger(input: {
  userId: string;
  protocol: string;
  idempotencyKey: string;
}): Promise<EnrollmentLedgerResult> {
  const feeKey = ledgerKey("fee", input.protocol, input.idempotencyKey);
  const bonusKey = ledgerKey("bonus", input.protocol, input.idempotencyKey);

  // 1) Taxa U$1 = 100 KRC: dinheiro externo → receita (a taxa NÃO entra em
  //    carteira — vai direta para system.item_sales, contrapartida external.deposit).
  const feeRecorded = await insertBalancedOperation({
    idempotencyKey: feeKey,
    userId: input.userId,
    debitAccount: "external.deposit",
    creditAccount: "system.item_sales",
    amountKrc: String(ENROLLMENT_FEE_KRC),
    description: `Enrollment fee U$1.00 (${input.protocol})`,
  });

  // 2) Bônus único de 500 KRC SOMENTE após a taxa: equity → wallet.bonus
  //    (+ bank_accounts). Crédito idempotente pela mesma chave-cliente.
  let bonusRecorded = false;
  if (feeRecorded || (await ledgerOperationExists(bonusKey, input.userId))) {
    bonusRecorded = await insertBalancedOperation({
      idempotencyKey: bonusKey,
      userId: input.userId,
      debitAccount: "equity.opening_balance",
      creditAccount: "wallet.bonus",
      amountKrc: String(ENROLLMENT_BONUS_KRC),
      description: `Welcome bonus after enrollment fee (${input.protocol})`,
    });

    if (bonusRecorded) {
      // Carteira real: bonus_balance += 500 (upsert da linha da conta).
      await db
        .insert(bankAccounts)
        .values({ userId: input.userId, bonusBalance: String(ENROLLMENT_BONUS_KRC) })
        .onConflictDoUpdate({
          target: bankAccounts.userId,
          set: {
            bonusBalance: sql`round(${bankAccounts.bonusBalance} + ${String(ENROLLMENT_BONUS_KRC)}::numeric, 2)`,
          },
        });
    }
  }

  return { feeRecorded, bonusRecorded };
}

async function ledgerOperationExists(idempotencyKey: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: economyLedgerEntries.id })
    .from(economyLedgerEntries)
    .where(sql`${economyLedgerEntries.idempotencyKey} = ${idempotencyKey} and ${economyLedgerEntries.userId} = ${userId}`)
    .limit(1);
  return Boolean(row);
}

/** Consulta o saldo bônus real da carteira (para testes e /status futuro). */
export async function getBonusBalance(userId: string): Promise<string> {
  const [row] = await db
    .select({ bonusBalance: bankAccounts.bonusBalance })
    .from(bankAccounts)
    .where(eq(bankAccounts.userId, userId))
    .limit(1);
  return row?.bonusBalance ?? "0";
}
