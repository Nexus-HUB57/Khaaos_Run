/**
 * KHAAOS RUN — Serviço de Alistamento Canônico (Sprint 1.1 / T1.1)
 * ================================================================
 * Porta do fluxo validado E2E no console web (README "Console Web + Mundos
 * canônicos, 2026-11-02") para o app canônico server-authoritative:
 *
 *   ETAPA 1/3 — inscrição:  protocolo `KR-REG-<base36>` gerado server-side
 *   ETAPA 2/3 — taxa U$1:   100 KRC liquidadas no ledger (server-authoritative)
 *                           DEBIT external.deposit / CREDIT system.item_sales
 *   ETAPA 3/3 — alistamento: WELCOME_BONUS 500 KRC creditado SOMENTE APÓS a
 *                           taxa DEBIT equity.opening_balance / CREDIT wallet.bonus
 *
 * Idempotência (contrato README): a 2ª chamada para o mesmo username retorna
 * `alreadyPaid: true` SEM duplicar cobrança — o serviço reutiliza as chaves
 * determinísticas `enrollment.fee.<protocol>` / `enrollment.bonus.<protocol>`
 * (o unique (user_id, idempotency_key, line_number) do ledger barra replay
 * mesmo sob corrida).
 *
 * Segurança: modo sandbox (taxa auto-liquidada, sem gateway real) — a
 * habilitação de valor real é a trilha T1.2 (PIX/Cartão + webhook +
 * reconciliação) e exige decisão de compliance (T5).
 */

import { randomUUID, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  bankAccounts,
  enrollments,
  economyLedgerEntries,
  transactions,
  users,
} from "@shared/schema";

// ─── Constantes canônicas (README) ───────────────────────────────────────────

export const ENROLLMENT_FEE_USD = "1.00";
export const ENROLLMENT_FEE_KRC = "100";
export const ENROLLMENT_WELCOME_BONUS_KRC = "500";

export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,24}$/;
export const PROTOCOL_PATTERN = /^KR-REG-[A-Z0-9]{10}$/;

const IDP_KEY_MAX = 128; // ^[A-Za-z0-9._~-]{16,128}$ (check do ledger)
const LEDGER_FEE = { debit: "external.deposit", credit: "system.item_sales" } as const;
const LEDGER_BONUS = { debit: "equity.opening_balance", credit: "wallet.bonus" } as const;

// ─── Tipos públicos ──────────────────────────────────────────────────────────

export interface EnrollmentResult {
  status: 201 | 200;
  body: {
    username: string;
    protocol: string;
    enrollmentPaid: boolean;
    alreadyPaid: boolean;
    fee: { usd: string; krc: string };
    welcomeBonusKrc: string;
    wallet: { bonus: string };
    enlistedAt: string;
  };
}

export class EnrollmentError extends Error {
  constructor(
    public readonly code: "INVALID_USERNAME" | "PROTOCOL_EXHAUSTED" | "ENROLLMENT_UNAVAILABLE",
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
    this.name = "EnrollmentError";
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Gera o protocolo canônico `KR-REG-<base36>` (10 chars, A-Z0-9, crypto-safe). */
export function generateEnrollmentProtocol(): string {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(10);
  let protocol = "KR-REG-";
  for (const byte of bytes) {
    protocol += ALPHABET[byte % ALPHABET.length];
  }
  return protocol;
}

function feeIdempotencyKey(protocol: string): string {
  const key = `enrollment.fee.${protocol}`;
  if (key.length > IDP_KEY_MAX) throw new EnrollmentError("ENROLLMENT_UNAVAILABLE", "chave de idempotência excede o limite do ledger", 500);
  return key;
}

function bonusIdempotencyKey(protocol: string): string {
  const key = `enrollment.bonus.${protocol}`;
  if (key.length > IDP_KEY_MAX) throw new EnrollmentError("ENROLLMENT_UNAVAILABLE", "chave de idempotência excede o limite do ledger", 500);
  return key;
}

// ─── Serviço ─────────────────────────────────────────────────────────────────

export class EnrollmentService {
  /**
   * Alista o operador (idempotente). Fluxo atômico em uma transação:
   * usuario → enrollment → ledger (fee + bonus) → bank → transactions.
   */
  async enroll(rawUsername: string): Promise<EnrollmentResult> {
    const username = rawUsername.trim();
    if (!USERNAME_PATTERN.test(username)) {
      throw new EnrollmentError(
        "INVALID_USERNAME",
        "username inválido: use 3–24 caracteres entre letras, números, hífen ou underline",
      );
    }

    return db.transaction(async (tx) => {
      // 1) Idempotência por username (linha travada para corrida concorrente).
      const [existing] = await tx
        .select()
        .from(enrollments)
        .where(eq(enrollments.username, username))
        .for("update")
        .limit(1);

      if (existing) {
        const [wallet] = await tx.select().from(bankAccounts)
          .where(eq(bankAccounts.userId, existing.userId)).limit(1);
        return {
          status: 200 as const,
          body: {
            username: existing.username,
            protocol: existing.protocol,
            enrollmentPaid: existing.status === "enlisted",
            alreadyPaid: true,
            fee: { usd: ENROLLMENT_FEE_USD, krc: existing.feeAmountKrc },
            welcomeBonusKrc: existing.bonusAmountKrc,
            wallet: { bonus: wallet?.bonusBalance ?? "0" },
            enlistedAt: existing.enlistedAt.toISOString(),
          },
        };
      }

      // 2) Usuário canônico (sem Replit auth no fluxo sandbox; o console de
      // produção amarra via T1.3 KYC). users.id tem default gen_random_uuid().
      const [user] = await tx.insert(users).values({ firstName: username }).returning();

      // 3) Protocolo único (retry contra colisão do random).
      let protocol = generateEnrollmentProtocol();
      for (let attempt = 0; attempt < 5; attempt++) {
        const [clash] = await tx.select({ id: enrollments.id }).from(enrollments)
          .where(eq(enrollments.protocol, protocol)).limit(1);
        if (!clash) break;
        if (attempt === 4) throw new EnrollmentError("PROTOCOL_EXHAUSTED", "não foi possível gerar protocolo único", 500);
        protocol = generateEnrollmentProtocol();
      }

      // 4) Carteira (linha única por usuário) — bônus cai em wallet.bonus.
      await tx.insert(bankAccounts).values({ userId: user.id }).onConflictDoNothing();
      const [account] = await tx.select().from(bankAccounts)
        .where(eq(bankAccounts.userId, user.id)).for("update").limit(1);
      if (!account) throw new EnrollmentError("ENROLLMENT_UNAVAILABLE", "carteira não pôde ser travada", 500);

      // 5) ETAPA 2/3 — taxa U$1 = 100 KRC (server-authoritative, modo sandbox:
      //    liquidação direta; T1.2 substitui pelo webhook do gateway).
      const feeOperationId = randomUUID();
      const feeKey = feeIdempotencyKey(protocol);
      await tx.insert(economyLedgerEntries).values([
        {
          operationId: feeOperationId,
          idempotencyKey: feeKey,
          userId: user.id,
          lineNumber: 1,
          accountCode: LEDGER_FEE.debit,
          side: "DEBIT",
          amountKrc: ENROLLMENT_FEE_KRC,
          description: `Enrollment fee U$${ENROLLMENT_FEE_USD} for ${protocol}`,
        },
        {
          operationId: feeOperationId,
          idempotencyKey: feeKey,
          userId: user.id,
          lineNumber: 2,
          accountCode: LEDGER_FEE.credit,
          side: "CREDIT",
          amountKrc: ENROLLMENT_FEE_KRC,
          description: `Enrollment fee revenue for ${protocol}`,
        },
      ]);

      // 6) ETAPA 3/3 — WELCOME_BONUS 500 KRC SOMENTE APÓS a taxa (mesma
      //    transação: taxa falhou ⇒ nada é creditado).
      const bonusOperationId = randomUUID();
      const bonusKey = bonusIdempotencyKey(protocol);
      await tx.insert(economyLedgerEntries).values([
        {
          operationId: bonusOperationId,
          idempotencyKey: bonusKey,
          userId: user.id,
          lineNumber: 1,
          accountCode: LEDGER_BONUS.debit,
          side: "DEBIT",
          amountKrc: ENROLLMENT_WELCOME_BONUS_KRC,
          description: `Welcome bonus funding for ${protocol}`,
        },
        {
          operationId: bonusOperationId,
          idempotencyKey: bonusKey,
          userId: user.id,
          lineNumber: 2,
          accountCode: LEDGER_BONUS.credit,
          side: "CREDIT",
          amountKrc: ENROLLMENT_WELCOME_BONUS_KRC,
          description: `Welcome bonus credited for ${protocol}`,
        },
      ]);

      await tx.update(bankAccounts).set({
        bonusBalance: `${ENROLLMENT_WELCOME_BONUS_KRC}`,
      }).where(eq(bankAccounts.userId, user.id));

      // 7) Trilha humana (consultas do console/bank).
      await tx.insert(transactions).values([
        {
          userId: user.id,
          type: "ENROLLMENT_FEE",
          amountKrc: ENROLLMENT_FEE_KRC,
          amountUsd: ENROLLMENT_FEE_USD,
          operationId: feeOperationId,
          description: `Taxa de alistamento U$${ENROLLMENT_FEE_USD} (${protocol})`,
        },
        {
          userId: user.id,
          type: "WELCOME_BONUS",
          amountKrc: ENROLLMENT_WELCOME_BONUS_KRC,
          operationId: bonusOperationId,
          description: `Bônus de boas-vindas após alistamento (${protocol})`,
        },
      ]);

      // 8) Registro do alistamento.
      const [enrollment] = await tx.insert(enrollments).values({
        userId: user.id,
        username,
        protocol,
        status: "enlisted",
        feeAmountKrc: ENROLLMENT_FEE_KRC,
        bonusAmountKrc: ENROLLMENT_WELCOME_BONUS_KRC,
        feeOperationId,
        bonusOperationId,
      }).returning();

      console.log(`[enrollment] ${username} alistado — protocolo ${protocol} (fee ${ENROLLMENT_FEE_KRC} KRC + bonus ${ENROLLMENT_WELCOME_BONUS_KRC} KRC)`);

      return {
        status: 201 as const,
        body: {
          username: enrollment.username,
          protocol: enrollment.protocol,
          enrollmentPaid: true,
          alreadyPaid: false,
          fee: { usd: ENROLLMENT_FEE_USD, krc: ENROLLMENT_FEE_KRC },
          welcomeBonusKrc: ENROLLMENT_WELCOME_BONUS_KRC,
          wallet: { bonus: ENROLLMENT_WELCOME_BONUS_KRC },
          enlistedAt: enrollment.enlistedAt.toISOString(),
        },
      };
    });
  }

  /** Retomada de sessão (GET) — reconhece alistado sem repetir inscrição. */
  async getStatus(rawUsername: string): Promise<{
    username: string;
    enlisted: boolean;
    enrollmentPaid: boolean;
    protocol: string | null;
    wallet: { bonus: string };
  } | null> {
    const username = rawUsername.trim();
    if (!USERNAME_PATTERN.test(username)) {
      throw new EnrollmentError("INVALID_USERNAME", "username inválido");
    }
    const [enrollment] = await db.select().from(enrollments)
      .where(and(eq(enrollments.username, username), eq(enrollments.status, "enlisted")))
      .limit(1);
    if (!enrollment) return null;
    const [wallet] = await db.select().from(bankAccounts)
      .where(eq(bankAccounts.userId, enrollment.userId)).limit(1);
    return {
      username: enrollment.username,
      enlisted: true,
      enrollmentPaid: true,
      protocol: enrollment.protocol,
      wallet: { bonus: wallet?.bonusBalance ?? "0" },
    };
  }
}

export const enrollmentService = new EnrollmentService();
