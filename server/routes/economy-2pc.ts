// KHAAOS RUN — Economy 2PC Routes (Express)
// ===========================================
// Endpoints do protocolo Two-Phase Commit consumidos por
// UKhaaosEconomyBridge2PC (UE5.8) e por servidores de jogo confiáveis.
//
//   POST /api/economy/2pc/prepare            → escrow (fase 1)
//   POST /api/economy/2pc/commit             → finalize (fase 2a)
//   POST /api/economy/2pc/abort              → release + refund (fase 2b)
//   GET  /api/economy/2pc/transactions/:id   → status query
//   GET  /api/economy/2pc/health             → diagnóstico
//
// Autenticação (em ordem de precedência):
//   1. Header `x-2pc-node-secret` === ECONOMY_2PC_NODE_SECRET (env) → nó confiável;
//      pode atuar em nome de `userId` (texto) do body.
//   2. Sessão web autenticada (req.user.claims.sub) → ator é o usuário.
//   3. Nenhum dos dois → ator sintético "ue5-player-<playerId>" (modo dev).
//      Quando ECONOMY_2PC_NODE_SECRET está definido, o modo dev é RECUSADO (401).
//
// Respostas compatíveis com o parser UE5:
//   prepare → { prepared: boolean, ... }   (cliente lê GetBoolField("prepared"))
//   commit  → { committed: boolean, ... }  (HTTP 2xx = sucesso)
//   abort   → { aborted: boolean, ... }    (HTTP 2xx = sucesso)

import type { Express, Request } from "express";
import { z } from "zod";
import {
  ECONOMY_2PC_DEFAULT_TTL_SECONDS,
  ECONOMY_2PC_MAX_TTL_SECONDS,
  ECONOMY_2PC_MIN_TTL_SECONDS,
  ECONOMY_2PC_TRANSACTION_ID_RE,
  economy2pcService,
} from "../game/economy2pcService";

const NODE_SECRET_ENV = "ECONOMY_2PC_NODE_SECRET";

export const prepareSchema = z.object({
  // Contrato UE5 (KhaaosEconomyBridge2PC.cpp): transactionId, idempotencyKey,
  // amountKrc (int), playerId (int), itemId, description, coordinatorNodeId, expiryTimestamp.
  transactionId: z.string().regex(ECONOMY_2PC_TRANSACTION_ID_RE).optional(),
  idempotencyKey: z.string().min(16).max(128).regex(/^[A-Za-z0-9._~-]+$/),
  amountKrc: z.number().int().positive().max(1_000_000),
  playerId: z.number().int().min(0).max(2_147_483_647).optional(),
  userId: z.string().trim().min(1).max(128).optional(),
  itemId: z.string().max(128).optional(),
  description: z.string().max(256).optional(),
  coordinatorNodeId: z.string().max(128).optional(),
  destinationAccount: z.enum(["system.item_sales", "system.item_repairs", "external.deposit"]).optional(),
  expiryTimestamp: z.string().max(40).optional(), // aceito, TTL autoritativo é do servidor
  ttlSeconds: z.number().int().min(ECONOMY_2PC_MIN_TTL_SECONDS).max(ECONOMY_2PC_MAX_TTL_SECONDS)
    .optional(),
});

export const commitSchema = z.object({
  transactionId: z.string().regex(ECONOMY_2PC_TRANSACTION_ID_RE),
  // UE5 (KhaaosEconomyBridge2PC.cpp) envia playerId em TODAS as fases: em modo
  // dev o ator sintético ue5-player-<playerId> precisa casar com o escrow.
  playerId: z.number().int().min(0).max(2_147_483_647).optional(),
});

export const abortSchema = z.object({
  transactionId: z.string().regex(ECONOMY_2PC_TRANSACTION_ID_RE),
  playerId: z.number().int().min(0).max(2_147_483_647).optional(),
  reason: z.string().max(256).optional(),
});

export interface TwoPCActor {
  actorId: string;
  trusted: boolean;
}

export function resolve2PCActor(req: Request): TwoPCActor | { error: { status: number; body: Record<string, unknown> } } {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const nodeSecret = process.env[NODE_SECRET_ENV];
  const sessionClaims = (req.user as { claims?: { sub?: unknown } } | undefined)?.claims;

  if (nodeSecret) {
    const provided = req.get("x-2pc-node-secret");
    if (provided !== nodeSecret && typeof sessionClaims?.sub !== "string") {
      return {
        error: {
          status: 401,
          body: { message: "ECONOMY_2PC_NODE_SECRET configurado: requer header x-2pc-node-secret ou sessão autenticada" },
        },
      };
    }
  }

  // 1) Nó confiável pode atuar em nome de um userId textual.
  if (nodeSecret && req.get("x-2pc-node-secret") === nodeSecret) {
    if (typeof body.userId === "string" && body.userId.trim()) {
      return { actorId: body.userId.trim().slice(0, 128), trusted: true };
    }
  }

  // 2) Sessão web autenticada.
  const sessionUser = sessionClaims?.sub;
  if (typeof sessionUser === "string" && sessionUser.trim()) {
    return { actorId: sessionUser.trim(), trusted: true };
  }

  // 3) Modo dev (sem segredo configurado): ator sintético por playerId.
  const playerId = typeof body.playerId === "number" && Number.isSafeInteger(body.playerId)
    ? Math.max(0, Math.floor(body.playerId))
    : 0;
  return { actorId: `ue5-player-${playerId}`, trusted: false };
}

function parseBody(req: Request, res: any, schema: z.ZodTypeAny): Record<string, unknown> | null {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.errors[0]?.message ?? "Payload inválido",
      issues: parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
    });
    return null;
  }
  return parsed.data as Record<string, unknown>;
}

function sendFinancialError(res: any, err: unknown): void {
  if (err instanceof RangeError) {
    res.status(400).json({ message: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("não encontrado")) {
    res.status(404).json({ message });
    return;
  }
  res.status(500).json({ message: "Erro interno do serviço 2PC" });
}

/**
 * Registra as rotas 2PC. Deve ser chamado ANTES de registerApiRoutes para que
 * as respostas 401/400 ownadas não dependam da sessão OIDC.
 */
export function registerEconomy2PCRoutes(app: Express): void {
  const service = economy2pcService;

  app.post("/api/economy/2pc/prepare", async (req: Request, res: any) => {
    try {
      const actor = resolve2PCActor(req);
      if ("error" in actor) return res.status(actor.error.status).json(actor.error.body);
      const input = parseBody(req, res, prepareSchema);
      if (!input) return;
      const result = await service.prepare(actor.actorId, input as never);
      return res.status(result.status).json(result.body);
    } catch (err) {
      return sendFinancialError(res, err);
    }
  });

  app.post("/api/economy/2pc/commit", async (req: Request, res: any) => {
    try {
      const actor = resolve2PCActor(req);
      if ("error" in actor) return res.status(actor.error.status).json(actor.error.body);
      const input = parseBody(req, res, commitSchema);
      if (!input) return;
      const result = await service.commit(actor.actorId, String(input.transactionId));
      return res.status(result.status).json(result.body);
    } catch (err) {
      return sendFinancialError(res, err);
    }
  });

  app.post("/api/economy/2pc/abort", async (req: Request, res: any) => {
    try {
      const actor = resolve2PCActor(req);
      if ("error" in actor) return res.status(actor.error.status).json(actor.error.body);
      const input = parseBody(req, res, abortSchema);
      if (!input) return;
      const result = await service.abort(actor.actorId, String(input.transactionId), input.reason as string | undefined);
      return res.status(result.status).json(result.body);
    } catch (err) {
      return sendFinancialError(res, err);
    }
  });

  app.get("/api/economy/2pc/transactions/:id", async (req: Request, res: any) => {
    try {
      const actor = resolve2PCActor(req);
      if ("error" in actor) return res.status(actor.error.status).json(actor.error.body);
      const result = await service.getTransaction(actor.actorId, String(req.params.id ?? ""));
      return res.status(result.status).json(result.body);
    } catch (err) {
      return sendFinancialError(res, err);
    }
  });

  app.get("/api/economy/2pc/health", async (_req: Request, res: any) => {
    try {
      const health = await service.health();
      return res.status(200).json(health);
    } catch (err) {
      return sendFinancialError(res, err);
    }
  });
}

export const ECONOMY_2PC_DEFAULT_TTL = ECONOMY_2PC_DEFAULT_TTL_SECONDS;
