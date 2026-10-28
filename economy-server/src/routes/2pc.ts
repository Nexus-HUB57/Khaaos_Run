// ==============================================================================
// KHAAOS RUN - Economy 2PC Server
// Rotas HTTP para Two-Phase Commit: /api/economy/2pc/prepare|commit|abort
//
// Protocolo:
//   POST /api/economy/2pc/prepare  → Lock KRC no saldo do jogador
//   POST /api/economy/2pc/commit   → Finalizar débito (debit KRC, unlock)
//   POST /api/economy/2pc/abort    → Release lock + refund
// ==============================================================================

import { Router, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { twoPcTransactions, krcBalances, krcLedger } from "../db/schema.js";
import { z } from "zod";

export const twoPcRouter = Router();

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const PrepareSchema = z.object({
  transactionId:  z.string().uuid(),
  idempotencyKey: z.string().min(1).max(128),
  amountKrc:      z.number().int().positive(),
  playerId:       z.number().int().positive(),
  itemId:         z.string().optional(),
  description:    z.string().optional(),
  coordinatorNodeId: z.string().optional(),
  expiryTimestamp:z.string().optional(),
});

const CommitSchema = z.object({
  transactionId: z.string().uuid(),
  playerId:      z.number().int().positive(),
});

const AbortSchema = z.object({
  transactionId: z.string().uuid(),
  playerId:      z.number().int().positive(),
  reason:        z.string().optional(),
});

// ─── POST /api/economy/2pc/prepare ────────────────────────────────────────────

twoPcRouter.post("/prepare", async (req: Request, res: Response) => {
  try {
    const body = PrepareSchema.parse(req.body);
    const { transactionId, idempotencyKey, amountKrc, playerId } = body;

    // Verificar idempotency — se já existe, retornar estado atual
    const existing = await db.select()
      .from(twoPcTransactions)
      .where(eq(twoPcTransactions.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      const tx = existing[0]!;
      // Se já committed, retornar sucesso
      if (tx.status === "committed") {
        return res.json({ prepared: true, transactionId: tx.transactionId, duplicate: true });
      }
      // Se abortada, retornar falha
      if (tx.status === "aborted" || tx.status === "timeout") {
        return res.status(409).json({
          prepared: false,
          code: "IDEMPOTENCY_CONFLICT",
          message: `Transação com chave ${idempotencyKey} já foi ${tx.status}`,
        });
      }
      // Se em preparação/commit, retornar estado
      return res.json({ prepared: tx.status === "prepared", transactionId: tx.transactionId });
    }

    // Verificar saldo do jogador — precisa ter (balance - locked) >= amount
    const balanceRow = await db.select()
      .from(krcBalances)
      .where(eq(krcBalances.playerId, playerId))
      .limit(1);

    if (balanceRow.length === 0) {
      return res.status(404).json({
        prepared: false,
        code: "PLAYER_NOT_FOUND",
        message: `Jogador ${playerId} não encontrado`,
      });
    }

    const balance = balanceRow[0]!;
    const availableKrc = balance.balanceKrc - balance.lockedKrc;

    if (availableKrc < amountKrc) {
      return res.status(402).json({
        prepared: false,
        code: "INSUFFICIENT_FUNDS",
        message: `Saldo insuficiente: disponível=${availableKrc} KRC, necessário=${amountKrc} KRC`,
      });
    }

    // ── PREPARE: Lock KRC ────────────────────────────────────────────────────
    // 1. Criar registro de transação
    await db.insert(twoPcTransactions).values({
      transactionId,
      idempotencyKey,
      playerId,
      amountKrc,
      itemId: body.itemId ?? null,
      description: body.description ?? null,
      coordinatorNodeId: body.coordinatorNodeId ?? "unknown",
      phase: "prepare",
      status: "prepared",
    });

    // 2. Incrementar lockedKrc no saldo
    await db.update(krcBalances)
      .set({
        lockedKrc: balance.lockedKrc + amountKrc,
        updatedAt: new Date(),
      })
      .where(eq(krcBalances.playerId, playerId));

    // 3. Registrar no ledger
    await db.insert(krcLedger).values({
      transactionId,
      playerId,
      amountKrc: -amountKrc, // Negativo = lock/débito
      type: "lock",
    });

    return res.json({ prepared: true, transactionId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ prepared: false, code: "VALIDATION_ERROR", errors: error.errors });
    }
    console.error("[2PC] Prepare error:", error);
    return res.status(500).json({ prepared: false, code: "INTERNAL_ERROR", message: "Erro interno no servidor" });
  }
});

// ─── POST /api/economy/2pc/commit ────────────────────────────────────────────

twoPcRouter.post("/commit", async (req: Request, res: Response) => {
  try {
    const body = CommitSchema.parse(req.body);
    const { transactionId, playerId } = body;

    // Buscar transação
    const txRows = await db.select()
      .from(twoPcTransactions)
      .where(eq(twoPcTransactions.transactionId, transactionId))
      .limit(1);

    if (txRows.length === 0) {
      return res.status(404).json({ code: "NOT_FOUND", message: "Transação não encontrada" });
    }

    const tx = txRows[0]!;

    // Verificar status — deve estar em "prepared"
    if (tx.status !== "prepared") {
      return res.status(409).json({
        code: "INVALID_STATUS",
        message: `Transação em status ${tx.status}, esperado "prepared"`,
      });
    }

    // Verificar playerId (segurança)
    if (tx.playerId !== playerId) {
      return res.status(403).json({ code: "FORBIDDEN", message: "playerId não corresponde ao da transação" });
    }

    // ── COMMIT: Finalizar débito ────────────────────────────────────────────
    const amount = tx.amountKrc;

    // 1. Atualizar transação para committed
    await db.update(twoPcTransactions)
      .set({ phase: "commit", status: "committed", updatedAt: new Date() })
      .where(eq(twoPcTransactions.transactionId, transactionId));

    // 2. Debitar saldo e liberar lock (atomicamente)
    const balanceRow = await db.select()
      .from(krcBalances)
      .where(eq(krcBalances.playerId, playerId))
      .limit(1);

    if (balanceRow.length > 0) {
      const balance = balanceRow[0]!;
      await db.update(krcBalances)
        .set({
          balanceKrc: balance.balanceKrc - amount,  // Debitar
          lockedKrc: Math.max(0, balance.lockedKrc - amount),  // Liberar lock
          updatedAt: new Date(),
        })
        .where(eq(krcBalances.playerId, playerId));
    }

    // 3. Registrar no ledger
    await db.insert(krcLedger).values({
      transactionId,
      playerId,
      amountKrc: -amount,
      type: "commit",
    });

    return res.json({ committed: true, transactionId, amountKrc: amount });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ code: "VALIDATION_ERROR", errors: error.errors });
    }
    console.error("[2PC] Commit error:", error);
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Erro interno no servidor" });
  }
});

// ─── POST /api/economy/2pc/abort ─────────────────────────────────────────────

twoPcRouter.post("/abort", async (req: Request, res: Response) => {
  try {
    const body = AbortSchema.parse(req.body);
    const { transactionId, playerId, reason } = body;

    // Buscar transação
    const txRows = await db.select()
      .from(twoPcTransactions)
      .where(eq(twoPcTransactions.transactionId, transactionId))
      .limit(1);

    if (txRows.length === 0) {
      return res.status(404).json({ code: "NOT_FOUND", message: "Transação não encontrada" });
    }

    const tx = txRows[0]!;

    // Não pode abortar se já committed
    if (tx.status === "committed") {
      return res.status(409).json({ code: "ALREADY_COMMITTED", message: "Transação já foi committed — não pode abortar" });
    }

    // Verificar playerId
    if (tx.playerId !== playerId) {
      return res.status(403).json({ code: "FORBIDDEN", message: "playerId não corresponde ao da transação" });
    }

    // ── ABORT: Release lock + refund ────────────────────────────────────────
    const amount = tx.amountKrc;

    // 1. Atualizar transação para aborted
    await db.update(twoPcTransactions)
      .set({
        phase: "abort",
        status: "aborted",
        abortReason: reason ?? "Client abort",
        updatedAt: new Date(),
      })
      .where(eq(twoPcTransactions.transactionId, transactionId));

    // 2. Liberar lock (refund) se estava prepared
    if (tx.status === "prepared" || tx.status === "preparing") {
      const balanceRow = await db.select()
        .from(krcBalances)
        .where(eq(krcBalances.playerId, playerId))
        .limit(1);

      if (balanceRow.length > 0) {
        const balance = balanceRow[0]!;
        await db.update(krcBalances)
          .set({
            lockedKrc: Math.max(0, balance.lockedKrc - amount),  // Liberar lock
            updatedAt: new Date(),
          })
          .where(eq(krcBalances.playerId, playerId));
      }
    }

    // 3. Registrar no ledger
    await db.insert(krcLedger).values({
      transactionId,
      playerId,
      amountKrc: amount,  // Positivo = refund
      type: "refund",
    });

    return res.json({ aborted: true, transactionId, refundKrc: amount });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ code: "VALIDATION_ERROR", errors: error.errors });
    }
    console.error("[2PC] Abort error:", error);
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Erro interno no servidor" });
  }
});

// ─── GET /api/economy/2pc/status/:transactionId ──────────────────────────────

twoPcRouter.get("/status/:transactionId", async (req: Request, res: Response) => {
  const { transactionId } = req.params;

  const txRows = await db.select()
    .from(twoPcTransactions)
    .where(eq(twoPcTransactions.transactionId, transactionId))
    .limit(1);

  if (txRows.length === 0) {
    return res.status(404).json({ code: "NOT_FOUND" });
  }

  return res.json(txRows[0]);
});
