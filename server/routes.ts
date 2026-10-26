import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { api } from "@shared/routes";
import { z } from "zod";
import {
  ZONE_PHASES,
  PlayerStatus,
  EP555_SPECIALIZATIONS,
  canUnlockSpecialization,
} from "@shared/schema";
import type { ZoneStatus } from "@shared/schema";
import { roomManager } from "./game/RoomManager";
import { quoteItem, probeEconomyHealth, computeLoan, rollRarity } from "./game/EconomyEngine";
import { generateMatchContent, generateLootField } from "./game/ProceduralGenerator";
import { runMonteCarlo, runMonteCarloBatch } from "./game/MonteCarloEconomy";
import { createWsAccessToken } from "./replit_integrations/auth/ws-token";
import { createZoneOperatorGuard, isZoneOperator } from "./game/zoneAuthorization";
import { distributedState } from "./game/DistributedState";
import { registerMarshalConsoleRoutes } from "./game/marshalConsole";
import { economyService } from "./game/economyService";
import { isValidIdempotencyKey } from "./game/economyMoney";
import { canUseItemOutsideMatch } from "@shared/war-i";
import Stripe from "stripe";
import { getStripeTestConfig, parseKrcPackCatalog } from "./payments/stripeConfig";
import { sha256Payload, stripePaymentService } from "./payments/stripePaymentService";
import {
  emptyMutationInput,
  zoneStartInput,
  zoneDamageInput,
  zoneHealInput,
  loanPreviewInput,
  economySimulationInput,
  economyBatchSimulationInput,
} from "./game/mutationSchemas";
import { registerDiscordApiV1Routes } from "./game/discordApiV1";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);
  await distributedState.connect();

  // ── REAL-TIME ROOM SYSTEM (highest systemic impact) ──────────────────────
  roomManager.attach(httpServer);
  registerApiRoutes(app, { recoverPendingCouncils: true });
  return httpServer;
}

// Kept separate from OIDC setup so HTTP authorization boundaries can be tested
// without discovery, session storage, or a live identity provider.
export function registerApiRoutes(app: Express, options: { recoverPendingCouncils?: boolean } = {}): void {
  const getUserId = (req: any): string => {
    if (!req.user?.claims?.sub) throw new Error("Unauthorized");
    return req.user.claims.sub as string;
  };

  const csrfGuard = (req: any, res: any, next: any) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
    if (req.get("sec-fetch-site") === "cross-site") return res.status(403).json({ message: "Cross-site request blocked" });
    const origin = req.get("origin");
    if (!origin) return next();
    try {
      const expected = process.env.PUBLIC_ORIGIN
        ? new URL(process.env.PUBLIC_ORIGIN).origin
        : `${req.protocol}://${req.get("host")}`;
      if (new URL(origin).origin !== expected) return res.status(403).json({ message: "Origin not allowed" });
    } catch {
      return res.status(403).json({ message: "Origin not allowed" });
    }
    return next();
  };

  app.use("/api", csrfGuard);

  app.use("/api", (req: any, res: any, next: any) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
    const actor = req.user?.claims?.sub ?? `ip:${req.ip}`;
    void Promise.all([
      distributedState.rateLimit(`http:ip:${req.ip}`, 600, 60_000),
      distributedState.rateLimit(`http:actor:${actor}`, 180, 60_000),
    ]).then(([ipLimit, actorLimit]) => {
      const limit = !ipLimit.allowed ? ipLimit : actorLimit;
      if (!limit.allowed) return res.status(429).set("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000))).json({ message: "Too many requests" });
      next();
    }).catch(() => res.status(503).json({ message: "Rate limiting unavailable" }));
  });

  const requireAuth = isAuthenticated;
  const requireZoneOperator = [isAuthenticated, createZoneOperatorGuard()] as const;
  registerMarshalConsoleRoutes(app, { recoverPending: options.recoverPendingCouncils });

  // ── Discord Bot API v1 (API-key auth, not session-based) ──────────────
  registerDiscordApiV1Routes(app);

  app.get("/api/auth/ws-token", isAuthenticated, (req, res) => {
    const userId = getUserId(req);
    void distributedState.rateLimit(`auth:ws-token:${userId}:${req.ip}`, 20, 60_000).then((limit) => {
      if (!limit.allowed) return res.status(429).set("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000))).json({ message: "Too many WebSocket token requests" });
      try {
        res.setHeader("Cache-Control", "no-store");
        res.json(createWsAccessToken(userId, undefined, req.sessionID));
      } catch {
        res.status(503).json({ message: "Autenticação WebSocket indisponível" });
      }
    }).catch(() => res.status(503).json({ message: "Autenticação WebSocket indisponível" }));
  });

  app.get("/api/zone/permissions", requireAuth, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ canManageZone: isZoneOperator(getUserId(req)) });
  });

  const parseRouteId = (value: string | string[]): number | null => {
    const rawValue = Array.isArray(value) ? value[0] : value;
    if (!rawValue || !/^\d+$/.test(rawValue)) return null;
    const id = Number(rawValue);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  };

  const parseMutationBody = <T extends z.ZodTypeAny>(req: any, res: any, inputSchema: T): z.infer<T> | null => {
    const parsed = inputSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Entrada inválida" });
      return null;
    }
    return parsed.data;
  };

  const readIdempotencyKey = (req: any, res: any): string | null => {
    const key = req.get("Idempotency-Key");
    if (!isValidIdempotencyKey(key)) {
      res.status(400).json({ message: "Cabeçalho Idempotency-Key ausente ou inválido" });
      return null;
    }
    return key;
  };

  // Stripe sends this endpoint server-to-server; it intentionally does not use
  // the browser session or the /api CSRF middleware. Signature verification
  // uses the untouched bytes captured by express.json({ verify }).
  app.post("/webhooks/stripe", async (req, res) => {
    const config = getStripeTestConfig();
    if (!config) return res.status(503).json({ message: "Webhook de pagamentos não configurado" });
    const rawBody = req.rawBody;
    const signature = req.get("stripe-signature");
    if (!Buffer.isBuffer(rawBody) || !signature) {
      return res.status(400).json({ message: "Webhook inválido" });
    }

    const stripe = new Stripe(config.secretKey);
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret);
    } catch {
      return res.status(400).json({ message: "Assinatura de webhook inválida" });
    }

    try {
      await stripePaymentService.processEvent(event, sha256Payload(rawBody));
      return res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("Stripe webhook processing failed", { name: error?.name, code: error?.code });
      return res.status(500).json({ message: "Webhook temporariamente indisponível" });
    }
  });

  const sendFinancialError = (res: any, error: any) => {
    if (error instanceof RangeError) return res.status(400).json({ message: error.message });
    if (error?.code === "INSUFFICIENT_FUNDS") {
      return res.status(402).json({ message: "Saldo insuficiente", required: error.required, available: error.available });
    }
    if (error?.code === "LOAN_LIMIT") return res.status(403).json({ message: error.message });
    if (error?.code === "SALARY_ALREADY_CLAIMED") return res.status(400).json({ message: error.message });
    if (error?.message === "Empréstimo não encontrado" || error?.message === "Item não encontrado") {
      return res.status(404).json({ message: error.message });
    }
    if (error?.message === "Empréstimo já pago") return res.status(409).json({ message: error.message });
    console.error("Financial operation failed", { code: error?.code, message: error?.message });
    return res.status(500).json({ message: "Internal server error" });
  };

  app.get("/api/payments/stripe/catalog", requireAuth, (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const config = getStripeTestConfig();
    if (!config) return res.json({ enabled: false, testMode: true, currency: "BRL", paymentMethodTypes: [], packs: [] });
    try {
      const packs = parseKrcPackCatalog(process.env.STRIPE_KRC_PACKS_JSON);
      if (packs.length === 0) return res.json({ enabled: false, testMode: true, currency: "BRL", paymentMethodTypes: [], packs: [] });
      return res.json({ enabled: true, testMode: true, currency: "BRL", paymentMethodTypes: config.paymentMethodTypes, packs });
    } catch {
      console.error("Stripe package catalog configuration is invalid");
      return res.status(503).json({ message: "Catálogo de pagamentos indisponível" });
    }
  });

  app.post("/api/payments/stripe/checkout", requireAuth, async (req, res) => {
    const config = getStripeTestConfig();
    if (!config) return res.status(503).json({ message: "Checkout de teste não configurado" });
    const parsed = z.object({
      productId: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/),
    }).strict().safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "Pacote inválido" });
    const key = readIdempotencyKey(req, res);
    if (!key) return;

    let packs;
    try {
      packs = parseKrcPackCatalog(process.env.STRIPE_KRC_PACKS_JSON);
    } catch {
      return res.status(503).json({ message: "Catálogo de pagamentos indisponível" });
    }
    const pack = packs.find((candidate) => candidate.id === parsed.data.productId);
    if (!pack) return res.status(404).json({ message: "Pacote não encontrado" });

    try {
      const stripe = new Stripe(config.secretKey, { maxNetworkRetries: 2 });
      const result = await stripePaymentService.createCheckout(getUserId(req), key, pack, stripe, config);
      if (result.kind === "idempotency_conflict") {
        return res.status(409).json({ message: "Esta chave já foi usada para outro pacote" });
      }
      if (result.kind === "order_closed") {
        return res.status(409).json({ message: "Esta ordem não pode ser reutilizada; inicie uma nova compra" });
      }
      return res.status(200).json({ orderId: result.orderId, checkoutUrl: result.checkoutUrl });
    } catch (error: any) {
      console.error("Stripe Checkout session creation failed", { name: error?.name, code: error?.code, type: error?.type });
      return res.status(502).json({ message: "Não foi possível iniciar o checkout de teste" });
    }
  });

  app.get("/api/payments/stripe/orders/:id", requireAuth, async (req, res) => {
    try {
      const order = await stripePaymentService.getOrderForUser(getUserId(req), String(req.params.id));
      if (!order) return res.status(404).json({ message: "Ordem não encontrada" });
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        ...order,
        currency: "BRL",
        priceBrlMinor: String(order.priceBrlMinor),
        krcMinorUnits: String(order.krcMinorUnits),
        createdAt: order.createdAt.toISOString(),
        paidAt: order.paidAt?.toISOString() ?? null,
        fulfilledAt: order.fulfilledAt?.toISOString() ?? null,
      });
    } catch (error: any) {
      console.error("Payment order status query failed", { name: error?.name, code: error?.code });
      return res.status(500).json({ message: "Não foi possível consultar a ordem" });
    }
  });

  // ── BANK ─────────────────────────────────────────────────────────────────

  app.get(api.bank.get.path, requireAuth, async (req, res) => {
    res.json(await storage.getBankAccount(getUserId(req)));
  });

  app.post(api.bank.deposit.path, requireAuth, (_req, res) => {
    res.status(503).json({
      code: "PAYMENTS_NOT_CONFIGURED",
      message: "Depósitos estão temporariamente indisponíveis. Nenhum KRC foi creditado.",
    });
  });

  app.post(api.bank.transfer.path, requireAuth, async (req, res) => {
    try {
      const input = parseMutationBody(req, res, api.bank.transfer.input);
      if (!input) return;
      const key = readIdempotencyKey(req, res);
      if (!key) return;
      const userId = getUserId(req);
      const result = await economyService.transfer(userId, key, input.amountKrc, input.destination);
      res.status(result.status).json(result.body);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      return sendFinancialError(res, err);
    }
  });

  app.get(api.bank.transactions.path, requireAuth, async (req, res) => {
    res.json(await storage.getTransactions(getUserId(req)));
  });

  // ── LOANS ────────────────────────────────────────────────────────────────

  app.get(api.loans.list.path, requireAuth, async (req, res) => {
    res.json(await storage.getLoans(getUserId(req)));
  });

  app.post(api.loans.request.path, requireAuth, async (req, res) => {
    try {
      const input = parseMutationBody(req, res, api.loans.request.input);
      if (!input) return;
      const key = readIdempotencyKey(req, res);
      if (!key) return;
      const userId = getUserId(req);
      const result = await economyService.requestLoan(userId, key, input.amountKrc, input.days);
      res.status(result.status).json(result.body);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      return sendFinancialError(res, err);
    }
  });

  app.post(api.loans.pay.path, requireAuth, async (req, res) => {
    try {
      if (!parseMutationBody(req, res, emptyMutationInput)) return;
      const id = parseRouteId(req.params.id);
      if (id === null) return res.status(400).json({ message: "ID de empréstimo inválido" });
      const key = readIdempotencyKey(req, res);
      if (!key) return;
      const result = await economyService.payLoan(getUserId(req), key, id);
      res.status(result.status).json(result.body);
    } catch (err) {
      return sendFinancialError(res, err);
    }
  });

  // ── ITEMS ────────────────────────────────────────────────────────────────

  app.get(api.items.list.path, requireAuth, async (req, res) => {
    res.json(await storage.getItems(getUserId(req)));
  });

  app.post(api.items.equip.path, requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseRouteId(req.params.id);
      if (id === null) return res.status(400).json({ message: "ID de item inválido" });
      const { isEquipped } = api.items.equip.input.parse(req.body);
      if (roomManager.isInLiveMatch(userId)) {
        return res.status(409).json({ message: "Loadout congelado: altere a PackBack antes de iniciar o countdown." });
      }
      const item = await storage.setItemEquipped(id, userId, isEquipped);
      if (!item) return res.status(404).json({ message: "Item não encontrado" });
      res.json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.items.purchase.path, requireAuth, async (req, res) => {
    try {
      const input = parseMutationBody(req, res, api.items.purchase.input);
      if (!input) return;
      const key = readIdempotencyKey(req, res);
      if (!key) return;
      const userId = getUserId(req);
      const result = await economyService.purchaseItem(userId, key, { name: input.name, type: input.type });
      res.status(result.status).json(result.body);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      return sendFinancialError(res, err);
    }
  });

  app.post(api.items.use.path, requireAuth, async (req, res) => {
    try {
      if (!parseMutationBody(req, res, api.items.use.input)) return;
      const userId = getUserId(req);
      if (roomManager.isInLiveMatch(userId)) {
        return res.status(409).json({ message: "Durante a partida, use os itens pelos controles da PackBack." });
      }
      const id = parseRouteId(req.params.id);
      if (id === null) return res.status(400).json({ message: "ID de item inválido" });
      const item = await storage.getItemForUser(id, userId);
      if (!item) return res.status(404).json({ message: "Item não encontrado" });
      if (!canUseItemOutsideMatch(item.type, item.stats)) {
        return res.status(409).json({ message: "Este item não possui uso legado fora do combate." });
      }
      if (!Number.isFinite(Number(item.durability)) || Number(item.durability) <= 0) {
        return res.status(409).json({ message: "Item sem durabilidade disponível." });
      }
      const healAmount = Math.min(100, Math.max(1, Math.floor(Number(item.stats?.heal))));
      const result = await storage.useItemAndHealAtomic(id, userId, 10, healAmount);
      if (!result) return res.status(409).json({ message: "Item sem durabilidade disponível." });
      res.json({ message: `${item.name} usado`, newDurability: result.item.durability, effect: { healed: result.healed } });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.items.repair.path, requireAuth, async (req, res) => {
    try {
      const input = parseMutationBody(req, res, api.items.repair.input);
      if (!input) return;
      const userId = getUserId(req);
      const id = parseRouteId(req.params.id);
      if (id === null) return res.status(400).json({ message: "ID de item inválido" });
      const key = readIdempotencyKey(req, res);
      if (!key) return;
      const result = await economyService.repairItem(userId, key, id, input.amountKrc);
      res.status(result.status).json(result.body);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      return sendFinancialError(res, err);
    }
  });

  // ── PLAYER ───────────────────────────────────────────────────────────────

  app.get(api.player.me.path, requireAuth, async (req, res) => {
    const stats = await storage.getPlayerStats(getUserId(req));
    const claims = (req.user as any)?.claims ?? {};
    res.json({
      stats,
      user: {
        id: claims.sub,
        email: claims.email,
        firstName: claims.first_name,
        lastName: claims.last_name,
        profileImageUrl: claims.profile_image_url,
      },
    });
  });

  app.post(api.player.specialization.path, requireAuth, async (req, res) => {
    const parsed = api.player.specialization.input.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Especialização inválida" });
    }

    try {
      const userId = getUserId(req);
      const stats = await storage.getPlayerStats(userId);
      const specialization = EP555_SPECIALIZATIONS.find(({ id }) => id === parsed.data.specializationId);
      if (!specialization) return res.status(400).json({ message: "Especialização inválida" });
      if (!canUnlockSpecialization(specialization, stats.xp ?? 0, stats.kills ?? 0)) {
        return res.status(403).json({ message: "Requisitos de patente e Morth ainda não atingidos" });
      }

      const updated = await storage.updatePlayerStats(userId, {
        specializationId: specialization.id,
      });
      res.json({ specializationId: updated.specializationId ?? specialization.id });
    } catch {
      res.status(500).json({ message: "Não foi possível registrar a especialização" });
    }
  });

  app.post(api.player.daily.path, requireAuth, async (req, res) => {
    if (!parseMutationBody(req, res, emptyMutationInput)) return;
    try {
      const key = readIdempotencyKey(req, res);
      if (!key) return;
      const userId = getUserId(req);
      const result = await economyService.claimDailySalary(userId, key);
      res.status(result.status).json(result.body);
    } catch (err) {
      return sendFinancialError(res, err);
    }
  });

  // ── SAFE ZONE ────────────────────────────────────────────────────────────

  app.get("/api/zone/status", requireAuth, async (req, res) => {
    try {
      const session = await storage.getActiveZoneSession();
      const totalPhases = ZONE_PHASES.length;

      if (!session) {
        return res.json({ isActive: false, sessionId: null, currentPhase: 1, totalPhases, isShrinking: false, currentRadiusPct: 100, targetRadiusPct: ZONE_PHASES[0].radiusPct, prevRadiusPct: 100, waitTimeRemaining: 0, shrinkTimeRemaining: 0, shrinkProgress: 0, damagePerTick: ZONE_PHASES[0].damagePerTick, centerX: 50, centerY: 50 } as ZoneStatus);
      }

      const phaseIdx = Math.min(session.currentPhase - 1, totalPhases - 1);
      const phaseConfig = ZONE_PHASES[phaseIdx];
      const prevRadius = phaseIdx === 0 ? 100 : ZONE_PHASES[phaseIdx - 1].radiusPct;
      const elapsedSeconds = (Date.now() - new Date(session.phaseStartedAt).getTime()) / 1000;

      let currentRadiusPct: number;
      let isShrinking = session.isShrinking;
      let waitTimeRemaining = 0, shrinkTimeRemaining = 0, shrinkProgress = 0;

      if (isShrinking) {
        shrinkProgress = Math.min(elapsedSeconds / phaseConfig.shrinkSeconds, 1);
        currentRadiusPct = prevRadius + (phaseConfig.radiusPct - prevRadius) * shrinkProgress;
        shrinkTimeRemaining = Math.max(0, phaseConfig.shrinkSeconds - elapsedSeconds);
        if (shrinkProgress >= 1) {
          const next = session.currentPhase + 1;
          if (next <= totalPhases) await storage.updateZoneSession(session.id, { currentPhase: next, isShrinking: false, phaseStartedAt: new Date() });
          currentRadiusPct = phaseConfig.radiusPct;
        }
      } else {
        currentRadiusPct = prevRadius;
        waitTimeRemaining = Math.max(0, phaseConfig.waitSeconds - elapsedSeconds);
        if (waitTimeRemaining <= 0) {
          await storage.updateZoneSession(session.id, { isShrinking: true, phaseStartedAt: new Date() });
          isShrinking = true;
          shrinkTimeRemaining = phaseConfig.shrinkSeconds;
        }
      }

      res.json({ isActive: true, sessionId: session.id, currentPhase: session.currentPhase, totalPhases, isShrinking, currentRadiusPct, targetRadiusPct: phaseConfig.radiusPct, prevRadiusPct: prevRadius, waitTimeRemaining, shrinkTimeRemaining, shrinkProgress, damagePerTick: phaseConfig.damagePerTick, centerX: session.centerX, centerY: session.centerY } as ZoneStatus);
    } catch {
      res.status(500).json({ message: "Erro ao calcular estado da zona" });
    }
  });

  app.post("/api/zone/start", ...requireZoneOperator, async (req, res) => {
    try {
      const input = parseMutationBody(req, res, zoneStartInput);
      if (!input) return;
      const session = await storage.createZoneSession(input.centerX, input.centerY);
      await storage.spawnLootPresets(session.id);
      res.json({ message: "Zona Segura + Loot ativados", sessionId: session.id });
    } catch { res.status(500).json({ message: "Erro ao iniciar zona" }); }
  });

  app.post("/api/zone/stop", ...requireZoneOperator, async (req, res) => {
    if (!parseMutationBody(req, res, emptyMutationInput)) return;
    try { await storage.stopAllZoneSessions(); res.json({ message: "Zona desativada" }); }
    catch { res.status(500).json({ message: "Erro" }); }
  });

  app.post("/api/zone/damage", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const userName = (req.user as any)?.claims?.first_name ?? undefined;
      const input = parseMutationBody(req, res, zoneDamageInput);
      if (!input) return;
      const damage = input.damage;
      const stats = await storage.applyZoneDamage(userId, damage, userName);
      res.json({ newHealth: stats.health, maxHealth: stats.maxHealth, damageTaken: damage, status: stats.status });
    } catch { res.status(500).json({ message: "Erro ao aplicar dano" }); }
  });

  app.post("/api/zone/heal", ...requireZoneOperator, async (req, res) => {
    try {
      const input = parseMutationBody(req, res, zoneHealInput);
      if (!input) return;
      const stats = await storage.healPlayer(getUserId(req), input.amount);
      res.json({ newHealth: stats.health, maxHealth: stats.maxHealth });
    } catch { res.status(500).json({ message: "Erro ao curar" }); }
  });

  // ── LOOT (BP_LootBase / Server_PickupItem RPC) ────────────────────────────

  app.get("/api/loot", requireAuth, async (_req, res) => {
    try { res.json(await storage.getLootItems()); }
    catch { res.status(500).json({ message: "Erro ao buscar loot" }); }
  });

  app.post("/api/loot/spawn", ...requireZoneOperator, async (req, res) => {
    try {
      if (!parseMutationBody(req, res, emptyMutationInput)) return;
      const items = await storage.spawnLootPresets();
      res.json({ message: `${items.length} itens spawnou no mapa`, count: items.length });
    } catch { res.status(500).json({ message: "Erro ao spawnar loot" }); }
  });

  // Server_PickupItem — validates server-side, grants item, destroys loot actor
  app.post("/api/loot/:id/pickup", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!parseMutationBody(req, res, emptyMutationInput)) return;
      if (roomManager.isInLiveMatch(userId)) return res.status(409).json({ message: "Durante a partida, colete loot pelos controles autoritativos do combate." });
      const lootId = parseRouteId(req.params.id);
      if (lootId === null) return res.status(400).json({ message: "ID de loot inválido" });
      const userName = (req.user as any)?.claims?.first_name ?? undefined;
      const { loot, item } = await storage.pickupLoot(lootId, userId, userName);
      res.json({ message: `${loot.name} coletado!`, loot, item });
    } catch (err: any) {
      if (err.message?.includes("coletado") || err.message?.includes("Conflito")) return res.status(409).json({ message: err.message });
      if (err.message?.includes("eliminado")) return res.status(403).json({ message: err.message });
      res.status(500).json({ message: err.message || "Erro ao coletar item" });
    }
  });

  // ── ELIMINATION (BP_Character death system) ───────────────────────────────

  app.get("/api/eliminations", requireAuth, async (_req, res) => {
    try { res.json(await storage.getEliminations(30)); }
    catch { res.status(500).json({ message: "Erro ao buscar eliminações" }); }
  });

  // Respawn (Spawn Spectator → Possess → back to game)
  app.post("/api/player/respawn", requireAuth, async (req, res) => {
    try {
      if (!parseMutationBody(req, res, emptyMutationInput)) return;
      const stats = await storage.respawnPlayer(getUserId(req));
      res.json({ message: "Operativo respawnado", newHealth: stats.health, status: stats.status });
    } catch { res.status(500).json({ message: "Erro ao respawnar" }); }
  });

  // ── BATTLE ROOMS (REST discovery) ─────────────────────────────────────────
  app.get("/api/rooms", requireAuth, (_req, res) => {
    res.json(roomManager.listLobbies());
  });

  app.get("/api/rooms/:id", requireAuth, (req, res) => {
    const roomId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const summary = roomManager.getRoomSummary(roomId);
    if (!summary) return res.status(404).json({ message: "Room not found" });
    res.json(summary);
  });

  // ── ECONOMY ENGINE (formal market quotes + health) ───────────────────────
  app.get("/api/economy/quote", requireAuth, (req, res) => {
    try {
      const type = String(req.query.type || "ARMA");
      const rarity = String(req.query.rarity || "COMUM");
      const circulating = parseInt(String(req.query.circulating || "0"), 10);
      res.json(quoteItem(type, rarity, circulating));
    } catch {
      res.status(400).json({ message: "Invalid quote params" });
    }
  });

  app.get("/api/economy/health", requireAuth, async (_req, res) => {
    // Lightweight probe — production would aggregate from DB
    res.json(
      probeEconomyHealth({
        totalWeaponsBalance: 0,
        totalBonusBalance: 0,
        activePlayers: 10,
        purchasesLast24h: 25,
        avgPurchaseKrc: 150,
      }),
    );
  });

  app.post("/api/economy/loan-preview", requireAuth, (req, res) => {
    try {
      const input = parseMutationBody(req, res, loanPreviewInput);
      if (!input) return;
      res.json(computeLoan(input.principal, input.days));
    } catch {
      res.status(400).json({ message: "Invalid loan params" });
    }
  });

  // ── PROCEDURAL PREVIEW (debug / design tools) ────────────────────────────
  app.get("/api/procgen/loot", requireAuth, (req, res) => {
    const seed = String(req.query.seed || "preview");
    const count = parseInt(String(req.query.count || "16"), 10);
    res.json(generateLootField(seed, count));
  });

  app.get("/api/procgen/match", requireAuth, (req, res) => {
    const roomId = String(req.query.roomId || "preview_room");
    res.json(generateMatchContent(roomId));
  });

  // ── MATCHMAKING ──────────────────────────────────────────────────────────
  app.get("/api/matchmaking/status", requireAuth, (req, res) => {
    try {
      const userId = getUserId(req);
      const status = roomManager.getMatchmakingStatus(userId);
      res.json({
        queued: !!status,
        queueSize: roomManager.getMatchmakingQueueSize(),
        ...(status ?? {}),
      });
    } catch {
      res.status(500).json({ message: "Failed to read matchmaking status" });
    }
  });

  app.get("/api/matchmaking/queue-size", requireAuth, (_req, res) => {
    res.json({ queueSize: roomManager.getMatchmakingQueueSize() });
  });

  // ── PERSISTENT RANKING / LEADERBOARD ─────────────────────────────────────
  app.get("/api/ranking/leaderboard", requireAuth, async (req, res) => {
    try {
      const limit = Math.min(100, parseInt(String(req.query.limit || "50"), 10));
      res.json(await storage.getLeaderboard(limit));
    } catch {
      res.status(500).json({ message: "Failed to load leaderboard" });
    }
  });

  app.get("/api/ranking/history", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const limit = Math.min(50, parseInt(String(req.query.limit || "20"), 10));
      res.json(await storage.getMatchHistory(userId, limit));
    } catch {
      res.status(500).json({ message: "Failed to load match history" });
    }
  });

  app.get("/api/ranking/me", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getPlayerStats(getUserId(req));
      res.json({
        rating: stats.rating,
        rank: stats.rank,
        xp: stats.xp,
        matchesPlayed: stats.matchesPlayed,
        wins: stats.wins,
        top5: stats.top5,
        seasonKills: stats.seasonKills,
        kills: stats.kills,
        deaths: stats.deaths,
      });
    } catch {
      res.status(500).json({ message: "Failed to load ranking" });
    }
  });

  // ── MONTE-CARLO ECONOMY SIMULATION ───────────────────────────────────────
  app.post("/api/economy/simulate", requireAuth, (req, res) => {
    try {
      const input = parseMutationBody(req, res, economySimulationInput);
      if (!input) return;
      const result = runMonteCarlo({ ...input, seed: input.seed ?? Date.now() });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Simulation failed" });
    }
  });

  app.post("/api/economy/simulate-batch", requireAuth, (req, res) => {
    try {
      const input = parseMutationBody(req, res, economyBatchSimulationInput);
      if (!input) return;
      const { runs, ...simulation } = input;
      const result = runMonteCarloBatch(runs, simulation);
      // Don't send full per-run daily arrays to keep payload small
      res.json({
        runs: result.runs.map((r) => ({
          finalHealth: r.finalHealth,
          wealthPercentiles: r.wealthPercentiles,
          rarityDistribution: r.rarityDistribution,
          recommendation: r.recommendation,
          lastDay: r.daily[r.daily.length - 1],
        })),
        aggregateRecommendation: result.aggregateRecommendation,
        meanFinalKrc: result.meanFinalKrc,
        meanGini: result.meanGini,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Batch simulation failed" });
    }
  });
}
