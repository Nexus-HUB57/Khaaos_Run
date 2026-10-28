// KHAAOS RUN — Economy 2PC (Two-Phase Commit) Service
// =====================================================
// Implementação server-side do protocolo consumido por
// UKhaaosEconomyBridge2PC (Unreal/KhaaosRun/.../KhaaosEconomyBridge2PC.cpp).
//
// Contrato UE5 (payloads exatos enviados pelo cliente):
//   POST /api/economy/2pc/prepare
//     { transactionId, idempotencyKey, amountKrc:int, playerId:int,
//       itemId, description, coordinatorNodeId, expiryTimestamp }
//     → resposta exige campo booleano `prepared`.
//   POST /api/economy/2pc/commit  { transactionId }            → HTTP 2xx = committed
//   POST /api/economy/2pc/abort   { transactionId, reason }    → HTTP 2xx = aborted
//
// Semântica financeira (double-entry, mesmo ledger de economyService):
//   PREPARE : wallet.weapons DEBIT  /  system.2pc_escrow CREDIT   (linhas 1-2)
//   COMMIT  : system.2pc_escrow DEBIT  /  <destination> CREDIT    (linhas 3-4)
//   ABORT   : system.2pc_escrow DEBIT  /  wallet.weapons CREDIT   (linhas 5-6)
//
// Idempotência: unique (actorId, idempotencyKey) na tabela de escrow;
// replay com payload diferente → 409 (requestHash SHA-256).
// GC: escrows PREPARED expirados são abortados e reembolsados (TTL 60s padrão,
// varredura 15s) — recoverExpired().

import { randomUUID } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  bankAccounts,
  economy2pcTransactions,
  economyLedgerEntries,
  transactions,
  type Economy2PCTransaction,
} from "@shared/schema";
import { fromMinorUnits, hashEconomicRequest, isValidIdempotencyKey, toMinorUnits } from "./economyMoney";
import {
  economy2pcMetrics,
  phaseResultFromResponse,
  type Economy2PCPhaseName,
} from "./metricsRegistry";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ResponseBody = Record<string, unknown>;

export interface Economy2PCResponse {
  status: number;
  body: ResponseBody;
  replayed: boolean;
}

export interface Prepare2PCInput {
  idempotencyKey: string;
  amountKrc: number;
  transactionId?: string | undefined;
  playerId?: number | undefined;
  itemId?: string | undefined;
  description?: string | undefined;
  coordinatorNodeId?: string | undefined;
  destinationAccount?: string | undefined;
  /** Aceito do cliente (expiryTimestamp) mas o TTL autoritativo é do servidor. */
  expiryTimestamp?: string | undefined;
  ttlSeconds?: number | undefined;
}

// ─── Constantes do protocolo ────────────────────────────────────────────────

export const ECONOMY_2PC_DEFAULT_TTL_SECONDS = 60;
export const ECONOMY_2PC_MIN_TTL_SECONDS = 10;
export const ECONOMY_2PC_MAX_TTL_SECONDS = 300;
export const ECONOMY_2PC_MAX_AMOUNT_MINOR = 100_000_000n; // 1.000.000,00 KRC
export const ECONOMY_2PC_TRANSACTION_ID_RE = /^[A-Za-z0-9._~-]{8,64}$/;
export const ECONOMY_2PC_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ECONOMY_2PC_DESTINATIONS = ["system.item_sales", "system.item_repairs", "external.deposit"] as const;

const OPERATION = "economy.2pc.prepare";

/** Números de linha do ledger por fase (mesma chave de idempotência). */
export const ECONOMY_2PC_LEDGER_LINES = { prepare: [1, 2], commit: [3, 4], abort: [5, 6] } as const;
const LEDGER_LINES = ECONOMY_2PC_LEDGER_LINES;

function sanitizeText(value: string | undefined, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLen);
}

export class Economy2PCService {
  constructor(
    private readonly database: typeof db = db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ─── Phase 1: PREPARE (escrow) ─────────────────────────────────────────────

  /** Wrapper instrumentado (Prometheus): duração + resultado por fase. */
  private async instrumentPhase(
    phase: Economy2PCPhaseName,
    run: () => Promise<Economy2PCResponse>,
  ): Promise<Economy2PCResponse> {
    const timer = economy2pcMetrics.startPhase(phase);
    try {
      const response = await run();
      timer.end(phaseResultFromResponse(phase, response));
      return response;
    } catch (err) {
      economy2pcMetrics.phaseError(phase);
      throw err;
    }
  }

  async prepare(actorId: string, input: Prepare2PCInput): Promise<Economy2PCResponse> {
    return this.instrumentPhase("prepare", () => this.prepareImpl(actorId, input));
  }

  private async prepareImpl(actorId: string, input: Prepare2PCInput): Promise<Economy2PCResponse> {
    if (typeof actorId !== "string" || !actorId.trim()) throw new Error("Actor ID is required");
    if (!isValidIdempotencyKey(input.idempotencyKey)) throw new RangeError("Chave de idempotência inválida");
    if (!Number.isSafeInteger(input.amountKrc) || input.amountKrc <= 0) {
      throw new RangeError("Valor da transação inválido");
    }

    const amountMinor = toMinorUnits(String(input.amountKrc));
    if (amountMinor <= 0n || amountMinor > ECONOMY_2PC_MAX_AMOUNT_MINOR) {
      throw new RangeError("Valor monetário fora da faixa permitida");
    }
    const amount = fromMinorUnits(amountMinor);

    const destination = ECONOMY_2PC_DESTINATIONS.includes(
      (input.destinationAccount ?? "system.item_sales") as (typeof ECONOMY_2PC_DESTINATIONS)[number],
    )
      ? (input.destinationAccount ?? "system.item_sales")
      : "system.item_sales";

    const ttl = Math.min(
      ECONOMY_2PC_MAX_TTL_SECONDS,
      Math.max(ECONOMY_2PC_MIN_TTL_SECONDS, input.ttlSeconds ?? ECONOMY_2PC_DEFAULT_TTL_SECONDS),
    );

    const requestHash = hashEconomicRequest(OPERATION, {
      amountKrc: input.amountKrc,
      itemId: input.itemId ?? null,
      destinationAccount: destination,
      playerId: input.playerId ?? null,
    });

    // GC preventivo: limpa escrows expirados do próprio actor antes de travar saldo.
    await this.recoverExpired(actorId);

    return this.database.transaction(async (tx) => {
      const now = this.now();
      const expiresAt = new Date(now.getTime() + ttl * 1000);

      const clientTxId = input.transactionId && ECONOMY_2PC_TRANSACTION_ID_RE.test(input.transactionId)
        ? input.transactionId
        : null;
      // Se o cliente enviou um UUID canônico, usamos como PK; senão geramos o nosso.
      const serverId = clientTxId && ECONOMY_2PC_UUID_RE.test(clientTxId) ? clientTxId.toLowerCase() : randomUUID();

      // Colisão de transactionId: mesmo dono+chave → replay; dono+chave com payload
      // diferente → IDEMPOTENCY_KEY_REUSED; dono diferente → TRANSACTION_ID_CONFLICT.
      if (clientTxId) {
        const [idOwner] = await tx.select().from(economy2pcTransactions)
          .where(eq(economy2pcTransactions.id, serverId)).limit(1);
        if (idOwner) {
          if (idOwner.actorId === actorId && idOwner.idempotencyKey === input.idempotencyKey) {
            if (idOwner.requestHash === requestHash) {
              return this.replayResponse(idOwner);
            }
            return {
              status: 409,
              body: {
                prepared: false,
                code: "IDEMPOTENCY_KEY_REUSED",
                message: "Esta chave de idempotência já foi usada com outro conteúdo.",
                transactionId: idOwner.id,
                status: idOwner.status,
              },
              replayed: false,
            };
          }
          return {
            status: 409,
            body: {
              prepared: false,
              code: "TRANSACTION_ID_CONFLICT",
              message: "transactionId já registrado por outra transação",
              transactionId: idOwner.id,
            },
            replayed: false,
          };
        }
      }

      // 1) Claim idempotente via unique (actorId, idempotencyKey).
      const [claim] = await tx.insert(economy2pcTransactions).values({
        id: serverId,
        clientTransactionId: clientTxId,
        actorId,
        playerId: typeof input.playerId === "number" && Number.isSafeInteger(input.playerId) ? input.playerId : null,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        amountKrc: amount,
        description: sanitizeText(input.description, 256),
        itemId: input.itemId ? sanitizeText(input.itemId, 128) : null,
        destinationAccount: destination,
        status: "PREPARED",
        coordinatorNodeId: input.coordinatorNodeId ? sanitizeText(input.coordinatorNodeId, 128) : null,
        expiresAt,
      }).onConflictDoNothing({
        target: [economy2pcTransactions.actorId, economy2pcTransactions.idempotencyKey],
      }).returning();

      if (!claim) {
        const [existing] = await tx.select().from(economy2pcTransactions).where(and(
          eq(economy2pcTransactions.actorId, actorId),
          eq(economy2pcTransactions.idempotencyKey, input.idempotencyKey),
        )).limit(1);
        if (!existing) throw new Error("2PC escrow claim disappeared during transaction");
        if (existing.requestHash !== requestHash) {
          return {
            status: 409,
            body: {
              prepared: false,
              code: "IDEMPOTENCY_KEY_REUSED",
              message: "Esta chave de idempotência já foi usada com outro conteúdo.",
              transactionId: existing.id,
              status: existing.status,
            },
            replayed: false,
          };
        }
        return this.replayResponse(existing);
      }

      // 2) Bloqueia a conta e debita o escrow (debito condicional).
      await tx.insert(bankAccounts).values({ userId: actorId }).onConflictDoNothing();
      const [account] = await tx.select().from(bankAccounts)
        .where(eq(bankAccounts.userId, actorId)).for("update");
      if (!account) throw new Error("Bank account could not be initialized");

      const [debited] = await tx.update(bankAccounts).set({
        weaponsBalance: sql`round(${bankAccounts.weaponsBalance} - ${amount}::numeric, 2)`,
      }).where(and(
        eq(bankAccounts.userId, actorId),
        sql`${bankAccounts.weaponsBalance} >= ${amount}::numeric`,
      )).returning();

      if (!debited) {
        // Sem saldo: aborta a claim recém-criada (mantém trilha de auditoria).
        await tx.update(economy2pcTransactions).set({
          status: "ABORTED",
          abortedAt: now,
          updatedAt: now,
          abortReason: "insufficient-funds-at-prepare",
        }).where(eq(economy2pcTransactions.id, claim.id));
        return {
          status: 402,
          body: {
            prepared: false,
            code: "INSUFFICIENT_FUNDS",
            message: "Saldo insuficiente para preparar a transação",
            required: amount,
            available: String(account.weaponsBalance),
            transactionId: claim.id,
          },
          replayed: false,
        };
      }

      // 3) Ledger double-entry: wallet → escrow (linhas 1-2).
      const prepareOperationId = randomUUID();
      await tx.insert(economyLedgerEntries).values([
        {
          operationId: prepareOperationId,
          idempotencyKey: input.idempotencyKey,
          userId: actorId,
          lineNumber: LEDGER_LINES.prepare[0],
          accountCode: "wallet.weapons",
          side: "DEBIT",
          amountKrc: amount,
          description: `2PC escrow lock ${claim.id}`,
        },
        {
          operationId: prepareOperationId,
          idempotencyKey: input.idempotencyKey,
          userId: actorId,
          lineNumber: LEDGER_LINES.prepare[1],
          accountCode: "system.2pc_escrow",
          side: "CREDIT",
          amountKrc: amount,
          description: `2PC escrow pending ${claim.id}`,
        },
      ]);
      await tx.update(economy2pcTransactions).set({
        prepareOperationId,
        updatedAt: now,
      }).where(eq(economy2pcTransactions.id, claim.id));

      await tx.insert(transactions).values({
        userId: actorId,
        type: "2PC_PREPARE",
        amountKrc: amount,
        operationId: prepareOperationId,
        description: `2PC prepare ${claim.id}${claim.itemId ? ` item ${claim.itemId}` : ""}`,
      });

      return {
        status: 201,
        body: {
          prepared: true,
          transactionId: claim.id,
          status: "PREPARED",
          amountKrc: amount,
          expiresAt: expiresAt.toISOString(),
          operationId: prepareOperationId,
        },
        replayed: false,
      };
    });
  }

  // ─── Phase 2a: COMMIT (finalize) ───────────────────────────────────────────

  async commit(actorId: string | null, transactionId: string): Promise<Economy2PCResponse> {
    return this.instrumentPhase("commit", () => this.commitImpl(actorId, transactionId));
  }

  private async commitImpl(actorId: string | null, transactionId: string): Promise<Economy2PCResponse> {
    if (!ECONOMY_2PC_TRANSACTION_ID_RE.test(transactionId)) {
      return { status: 400, body: { committed: false, message: "transactionId inválido" }, replayed: false };
    }
    return this.database.transaction(async (tx) => {
      const [escrow] = await tx.select().from(economy2pcTransactions)
        .where(this.transactionIdFilter(transactionId)).for("update");
      if (!escrow) {
        return { status: 404, body: { committed: false, message: "Transação não encontrada" }, replayed: false };
      }
      if (actorId && escrow.actorId !== actorId) {
        return { status: 403, body: { committed: false, message: "Transação pertence a outro ator" }, replayed: false };
      }

      const now = this.now();

      if (escrow.status === "COMMITTED") {
        return {
          status: 200,
          body: {
            committed: true,
            transactionId: escrow.id,
            status: "COMMITTED",
            amountKrc: escrow.amountKrc,
            replayed: true,
          },
          replayed: true,
        };
      }
      if (escrow.status === "ABORTED") {
        return {
          status: 409,
          body: {
            committed: false,
            code: "ALREADY_ABORTED",
            message: "Transação foi abortada e não pode ser confirmada",
            transactionId: escrow.id,
            abortReason: escrow.abortReason,
          },
          replayed: false,
        };
      }
      if (escrow.expiresAt.getTime() <= now.getTime()) {
        // Escrow expirado durante o commit: aborta e reporta.
        await this.abortWithinTx(tx, escrow, now, "expired-during-commit");
        return {
          status: 409,
          body: {
            committed: false,
            code: "ESCROW_EXPIRED",
            message: "Escrow expirado antes do commit; transação abortada e reembolsada",
            transactionId: escrow.id,
            aborted: true,
          },
          replayed: false,
        };
      }

      const amount = escrow.amountKrc;
      const commitOperationId = randomUUID();
      await tx.insert(economyLedgerEntries).values([
        {
          operationId: commitOperationId,
          idempotencyKey: escrow.idempotencyKey,
          userId: escrow.actorId,
          lineNumber: LEDGER_LINES.commit[0],
          accountCode: "system.2pc_escrow",
          side: "DEBIT",
          amountKrc: amount,
          description: `2PC escrow release ${escrow.id}`,
        },
        {
          operationId: commitOperationId,
          idempotencyKey: escrow.idempotencyKey,
          userId: escrow.actorId,
          lineNumber: LEDGER_LINES.commit[1],
          accountCode: escrow.destinationAccount,
          side: "CREDIT",
          amountKrc: amount,
          description: `2PC commit ${escrow.id}${escrow.itemId ? ` item ${escrow.itemId}` : ""}`,
        },
      ]);
      await tx.insert(transactions).values({
        userId: escrow.actorId,
        type: "2PC_COMMIT",
        amountKrc: amount,
        operationId: commitOperationId,
        description: `2PC commit ${escrow.id}`,
      });
      await tx.update(economy2pcTransactions).set({
        status: "COMMITTED",
        committedAt: now,
        updatedAt: now,
        commitOperationId,
      }).where(eq(economy2pcTransactions.id, escrow.id));

      return {
        status: 200,
        body: {
          committed: true,
          transactionId: escrow.id,
          status: "COMMITTED",
          amountKrc: amount,
          operationId: commitOperationId,
        },
        replayed: false,
      };
    });
  }

  // ─── Phase 2b: ABORT (release + refund) ────────────────────────────────────

  async abort(actorId: string | null, transactionId: string, reason?: string): Promise<Economy2PCResponse> {
    return this.instrumentPhase("abort", () => this.abortImpl(actorId, transactionId, reason));
  }

  private async abortImpl(actorId: string | null, transactionId: string, reason?: string): Promise<Economy2PCResponse> {
    if (!ECONOMY_2PC_TRANSACTION_ID_RE.test(transactionId)) {
      return { status: 400, body: { aborted: false, message: "transactionId inválido" }, replayed: false };
    }
    return this.database.transaction(async (tx) => {
      const [escrow] = await tx.select().from(economy2pcTransactions)
        .where(this.transactionIdFilter(transactionId)).for("update");
      if (!escrow) {
        return { status: 404, body: { aborted: false, message: "Transação não encontrada" }, replayed: false };
      }
      if (actorId && escrow.actorId !== actorId) {
        return { status: 403, body: { aborted: false, message: "Transação pertence a outro ator" }, replayed: false };
      }

      const now = this.now();

      if (escrow.status === "ABORTED") {
        return {
          status: 200,
          body: {
            aborted: true,
            transactionId: escrow.id,
            status: "ABORTED",
            amountKrc: escrow.amountKrc,
            replayed: true,
          },
          replayed: true,
        };
      }
      if (escrow.status === "COMMITTED") {
        return {
          status: 409,
          body: {
            aborted: false,
            code: "ALREADY_COMMITTED",
            message: "Transação já confirmada; abort não é permitido",
            transactionId: escrow.id,
          },
          replayed: false,
        };
      }

      await this.abortWithinTx(tx, escrow, now, sanitizeText(reason, 256) || "client-abort");
      return {
        status: 200,
        body: {
          aborted: true,
          transactionId: escrow.id,
          status: "ABORTED",
          amountKrc: escrow.amountKrc,
          refund: escrow.amountKrc,
          reason: sanitizeText(reason, 256) || "client-abort",
        },
        replayed: false,
      };
    });
  }

  // ─── GC: recuperação de escrows expirados ──────────────────────────────────

  private recoveryTimer: NodeJS.Timeout | null = null;

  /**
   * Inicia o loop de GC (default: varredura a cada 15s, TTL padrão 60s).
   * timer.unref() para não segurar o processo em shutdown.
   */
  startRecoveryLoop(intervalMs = 15_000): void {
    if (this.recoveryTimer) return;
    this.recoveryTimer = setInterval(() => {
      void this.recoverExpired().catch((err) => {
        console.error("[Economy2PC] GC recoverExpired falhou:", err);
      });
    }, intervalMs);
    this.recoveryTimer.unref();
  }

  stopRecoveryLoop(): void {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  /** Aborta e reembolsa todos os escrows PREPARED expirados. Retorna a quantidade. */
  async recoverExpired(actorId?: string): Promise<number> {
    const now = this.now();
    const conditions = [
      eq(economy2pcTransactions.status, "PREPARED"),
      lt(economy2pcTransactions.expiresAt, now),
    ];
    if (actorId) conditions.push(eq(economy2pcTransactions.actorId, actorId));

    const expired = await this.database.select({ id: economy2pcTransactions.id })
      .from(economy2pcTransactions)
      .where(and(...conditions))
      .limit(100);

    let recovered = 0;
    for (const row of expired) {
      const result = await this.database.transaction(async (tx) => {
        const [escrow] = await tx.select().from(economy2pcTransactions)
          .where(eq(economy2pcTransactions.id, row.id)).for("update");
        if (!escrow || escrow.status !== "PREPARED") return false;
        await this.abortWithinTx(tx, escrow, this.now(), "gc-expired");
        return true;
      });
      if (result) recovered += 1;
    }
    economy2pcMetrics.gcRecovered(recovered);
    return recovered;
  }

  // ─── Consultas ─────────────────────────────────────────────────────────────

  async getTransaction(actorId: string | null, transactionId: string): Promise<Economy2PCResponse> {
    if (!ECONOMY_2PC_TRANSACTION_ID_RE.test(transactionId)) {
      return { status: 400, body: { message: "transactionId inválido" }, replayed: false };
    }
    const [escrow] = await this.database.select().from(economy2pcTransactions)
      .where(this.transactionIdFilter(transactionId)).limit(1);
    if (!escrow) {
      return { status: 404, body: { message: "Transação não encontrada" }, replayed: false };
    }
    if (actorId && escrow.actorId !== actorId) {
      return { status: 403, body: { message: "Transação pertence a outro ator" }, replayed: false };
    }
    return {
      status: 200,
      body: {
        transactionId: escrow.id,
        status: escrow.status,
        amountKrc: escrow.amountKrc,
        destinationAccount: escrow.destinationAccount,
        createdAt: escrow.createdAt.toISOString(),
        expiresAt: escrow.expiresAt.toISOString(),
        committedAt: escrow.committedAt?.toISOString() ?? null,
        abortedAt: escrow.abortedAt?.toISOString() ?? null,
        abortReason: escrow.abortReason,
      },
      replayed: false,
    };
  }

  async health(): Promise<ResponseBody> {
    const rows = await this.database.select({
      status: economy2pcTransactions.status,
      count: sql<number>`count(*)::int`,
    }).from(economy2pcTransactions).groupBy(economy2pcTransactions.status);

    const counts: Record<string, number> = { PREPARED: 0, COMMITTED: 0, ABORTED: 0 };
    for (const row of rows) counts[row.status] = row.count;

    const [oldest] = await this.database.select({
      oldest: sql<string | null>`min(${economy2pcTransactions.createdAt})::text`,
    }).from(economy2pcTransactions).where(eq(economy2pcTransactions.status, "PREPARED"));

    return {
      service: "economy-2pc",
      healthy: true,
      escrows: counts,
      oldestPreparedAt: oldest?.oldest ?? null,
    };
  }

  // ─── Internos ──────────────────────────────────────────────────────────────

  /** Resolve transactionId: primeiro como PK uuid, depois como clientTransactionId. */
  private transactionIdFilter(transactionId: string) {
    if (ECONOMY_2PC_UUID_RE.test(transactionId)) {
      return eq(economy2pcTransactions.id, transactionId.toLowerCase());
    }
    return eq(economy2pcTransactions.clientTransactionId, transactionId);
  }

  private replayResponse(escrow: Economy2PCTransaction): Economy2PCResponse {
    if (escrow.status === "ABORTED") {
      return {
        status: 409,
        body: {
          prepared: false,
          code: "ESCROW_ABORTED",
          message: "Transação anterior com esta chave foi abortada",
          transactionId: escrow.id,
          status: "ABORTED",
        },
        replayed: true,
      };
    }
    return {
      status: escrow.status === "COMMITTED" ? 200 : 201,
      body: {
        prepared: true,
        transactionId: escrow.id,
        status: escrow.status,
        amountKrc: escrow.amountKrc,
        expiresAt: escrow.expiresAt.toISOString(),
        replayed: true,
      },
      replayed: true,
    };
  }

  /** Refund + ledger de abort DENTRO de uma transação existente (caller faz FOR UPDATE). */
  private async abortWithinTx(
    tx: DbTransaction,
    escrow: Economy2PCTransaction,
    now: Date,
    reason: string,
  ): Promise<void> {
    const amount = escrow.amountKrc;
    const abortOperationId = randomUUID();
    await tx.insert(economyLedgerEntries).values([
      {
        operationId: abortOperationId,
        idempotencyKey: escrow.idempotencyKey,
        userId: escrow.actorId,
        lineNumber: LEDGER_LINES.abort[0],
        accountCode: "system.2pc_escrow",
        side: "DEBIT",
        amountKrc: amount,
        description: `2PC escrow refund ${escrow.id}`,
      },
      {
        operationId: abortOperationId,
        idempotencyKey: escrow.idempotencyKey,
        userId: escrow.actorId,
        lineNumber: LEDGER_LINES.abort[1],
        accountCode: "wallet.weapons",
        side: "CREDIT",
        amountKrc: amount,
        description: `2PC abort refund ${escrow.id} (${reason})`,
      },
    ]);
    await tx.update(bankAccounts).set({
      weaponsBalance: sql`round(${bankAccounts.weaponsBalance} + ${amount}::numeric, 2)`,
    }).where(eq(bankAccounts.userId, escrow.actorId));
    await tx.insert(transactions).values({
      userId: escrow.actorId,
      type: "2PC_ABORT",
      amountKrc: "0.00",
      operationId: abortOperationId,
      description: `2PC abort ${escrow.id} (${reason})`,
    });
    await tx.update(economy2pcTransactions).set({
      status: "ABORTED",
      abortedAt: now,
      updatedAt: now,
      abortReason: reason,
      abortOperationId,
    }).where(eq(economy2pcTransactions.id, escrow.id));
  }
}

export const economy2pcService = new Economy2PCService();
