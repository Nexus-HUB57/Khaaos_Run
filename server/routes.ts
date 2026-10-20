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
import {
  emptyMutationInput,
  zoneStartInput,
  zoneDamageInput,
  zoneHealInput,
  loanPreviewInput,
  economySimulationInput,
  economyBatchSimulationInput,
} from "./game/mutationSchemas";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);
  await distributedState.connect();

  // ── REAL-TIME ROOM SYSTEM (highest systemic impact) ──────────────────────
  roomManager.attach(httpServer);
  registerApiRoutes(app);
  return httpServer;
}

// Kept separate from OIDC setup so HTTP authorization boundaries can be tested
// without discovery, session storage, or a live identity provider.
export function registerApiRoutes(app: Express): void {
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

  const requireAuth = isAuthenticated;
  const requireZoneOperator = [isAuthenticated, createZoneOperatorGuard()] as const;
  registerMarshalConsoleRoutes(app);

  app.get("/api/auth/ws-token", isAuthenticated, (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(createWsAccessToken(getUserId(req)));
    } catch {
      res.status(503).json({ message: "Autenticação WebSocket indisponível" });
    }
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

  // ── BANK ─────────────────────────────────────────────────────────────────

  app.get(api.bank.get.path, requireAuth, async (req, res) => {
    res.json(await storage.getBankAccount(getUserId(req)));
  });

  app.post(api.bank.deposit.path, requireAuth, async (req, res) => {
    try {
      const input = parseMutationBody(req, res, api.bank.deposit.input);
      if (!input) return;
      const key = readIdempotencyKey(req, res);
      if (!key) return;
      const userId = getUserId(req);
      const result = await economyService.deposit(userId, key, input.amountUsd);
      res.status(result.status).json(result.body);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      return sendFinancialError(res, err);
    }
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
      const consumed = await storage.consumeItemDurability(id, userId, 10);
      if (!consumed) return res.status(409).json({ message: "Item sem durabilidade disponível." });
      const healAmount = Math.min(100, Math.max(1, Math.floor(Number(item.stats?.heal))));
      const before = await storage.getPlayerStats(userId);
      const stats = await storage.healPlayer(userId, healAmount);
      res.json({ message: `${item.name} usado`, newDurability: consumed.durability, effect: { healed: stats.health - before.health } });
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

  // ── ECONOMY ENGINE (formal market quotes + health + EconomyBridge) ────────
  app.get("/api/economy/prices", requireAuth, (_req, res) => {
    try {
      const types = ["Arma", "Defesa", "Curativo", "Utilidade", "Recurso"];
      const rarities = ["COMUM", "INCOMUM", "RARO", "EPICO", "LENDARIO", "MITICO"];
      const prices = [];
      for (const itemType of types) {
        for (const rarity of rarities) {
          const quote = quoteItem(itemType.toUpperCase(), rarity, 50);
          prices.push({
            itemName: `${rarity} ${itemType}`,
            itemType,
            rarity,
            baseKrc: quote.baseKrc,
            supplyAdjustedKrc: quote.supplyAdjustedKrc,
            burnAmount: quote.burnAmount,
            netMint: quote.netMint,
          });
        }
      }
      res.json({ prices });
    } catch {
      res.status(500).json({ message: "Failed to generate market prices" });
    }
  });

  app.get("/api/economy/health-check", requireAuth, async (_req, res) => {
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

  // Direct EconomyBridge KRC transaction endpoints
  app.post("/api/economy/buy", requireAuth, async (req, res) => {
    try {
      const key = readIdempotencyKey(req, res);
      if (!key) return;
      const type = String(req.body?.type || "ARMA").toUpperCase();
      const name = String(req.body?.name || "Equipment").trim();
      if (!["ARMA", "DEFESA", "CURATIVO", "UTILIDADE"].includes(type)) {
        return res.status(400).json({ message: "Tipo de item inválido" });
      }
      const userId = getUserId(req);
      const result = await economyService.purchaseItem(userId, key, { name, type });
      res.status(result.status).json(result.body);
    } catch (err) {
      return sendFinancialError(res, err);
    }
  });

  app.post("/api/economy/sell", requireAuth, async (req, res) => {
    try {
      const key = readIdempotencyKey(req, res);
      if (!key) return;
      const valueKrc = Number(req.body?.valueKrc ?? 50);
      if (!Number.isFinite(valueKrc) || valueKrc <= 0) {
        return res.status(400).json({ message: "Valor KRC inválido" });
      }
      const userId = getUserId(req);
      const result = await economyService.deposit(userId, key, (valueKrc / 10).toFixed(2));
      res.status(result.status).json({
        message: "Item vendido com sucesso",
        amountKrc: valueKrc,
        ...result.body,
      });
    } catch (err) {
      return sendFinancialError(res, err);
    }
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

  // ── END-TO-END MULTI-WORLD PROGRESSION & TELEMETRY (CIGKV -> ARUKHEEA) ───
  app.get("/api/worlds", async (req, res) => {
    try {
      const { KHAAOS_WORLDS, WORLD_ORDER } = await import("@shared/worlds");
      const { worldProgressionService } = await import("./game/worldProgression");
      const playerId = (req.query.playerId as string) || "OP-KHAAOS-01";
      const progression = worldProgressionService.getPlayerState(playerId);

      res.json({
        worlds: WORLD_ORDER.map((id) => KHAAOS_WORLDS[id]),
        progression,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to load worlds" });
    }
  });

  app.post("/api/worlds/select", async (req, res) => {
    try {
      const { worldProgressionService } = await import("./game/worldProgression");
      const playerId = req.body?.playerId || "OP-KHAAOS-01";
      const worldId = req.body?.worldId;
      const updated = worldProgressionService.selectActiveWorld(playerId, worldId);
      res.json({ ok: true, progression: updated });
    } catch (err: any) {
      res.status(400).json({ ok: false, message: err?.message || "Falha ao selecionar mundo" });
    }
  });

  app.post("/api/worlds/simulate", async (req, res) => {
    try {
      const { worldProgressionService } = await import("./game/worldProgression");
      const playerId = req.body?.playerId || "OP-KHAAOS-01";
      const worldId = req.body?.worldId || "CIGKV";
      const extractionType = req.body?.extractionType || "ZEX";
      const kills = typeof req.body?.kills === "number" ? req.body.kills : undefined;

      const simulation = worldProgressionService.recordWorldRun(playerId, worldId, {
        extractionType,
        kills,
      });

      res.json({ ok: true, simulation });
    } catch (err: any) {
      res.status(400).json({ ok: false, message: err?.message || "Falha na simulação de mundo" });
    }
  });

  app.post("/api/worlds/unlock-all", async (req, res) => {
    try {
      const { worldProgressionService } = await import("./game/worldProgression");
      const playerId = req.body?.playerId || "OP-KHAAOS-01";
      const progression = worldProgressionService.fastForwardUnlockAll(playerId);
      res.json({ ok: true, progression });
    } catch (err: any) {
      res.status(400).json({ ok: false, message: err?.message || "Falha ao desbloquear mundos" });
    }
  });

  // ── CHARACTER & SKIN LIVE-ACTION STUDIO (MALE & FEMALE OPERATIVES) ───────
  app.get("/api/characters/studio", async (req, res) => {
    try {
      const {
        KHAAOS_OPERATIVE_ARCHETYPES,
        SYNCED_HIGH_TECH_TOOLS,
        CANONICAL_BASE_PROMPTS,
        KHAAOS_VIDEO_TIMELINE_10S,
        QUICK_PRODUCTION_TIPS,
        buildOperativePromptBundle,
      } = await import("@shared/character-studio");

      const archetypeId = typeof req.query.archetypeId === "string" ? req.query.archetypeId : undefined;
      const gender = req.query.gender === "FEMININO" || req.query.gender === "MASCULINO" ? req.query.gender : undefined;
      const worldId = typeof req.query.worldId === "string" ? (req.query.worldId as any) : undefined;
      const framing = typeof req.query.framing === "string" ? (req.query.framing as any) : undefined;

      res.json({
        archetypes: KHAAOS_OPERATIVE_ARCHETYPES,
        syncedTools: SYNCED_HIGH_TECH_TOOLS,
        canonicalBasePrompts: CANONICAL_BASE_PROMPTS,
        timelineKeyframes: KHAAOS_VIDEO_TIMELINE_10S,
        quickTips: QUICK_PRODUCTION_TIPS,
        defaultBundle: buildOperativePromptBundle({ archetypeId, gender, worldId, framing }),
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Falha ao carregar estúdio de personagens" });
    }
  });

  app.post("/api/characters/compile-prompt", async (req, res) => {
    try {
      const { buildOperativePromptBundle } = await import("@shared/character-studio");
      const bundle = buildOperativePromptBundle({
        archetypeId: req.body?.archetypeId,
        gender: req.body?.gender,
        worldId: req.body?.worldId,
        framing: req.body?.framing,
        skinRarity: req.body?.skinRarity,
        includeBiomechanicalClause:
          typeof req.body?.includeBiomechanicalClause === "boolean"
            ? req.body.includeBiomechanicalClause
            : true,
      });
      res.json({ ok: true, bundle });
    } catch (err: any) {
      res.status(400).json({ ok: false, message: err?.message || "Falha ao compilar prompt de personagem" });
    }
  });

  // ── MULTI-DEV REPO PR & CONSOLE PROTECTION SHIELD ────────────────────────
  app.get("/api/repo/pr-safety-status", async (_req, res) => {
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const {
        PROTECTED_CONSOLE_PATHS,
        TRACKED_REPO_PRS,
        validatePRPathsSafety,
      } = await import("@shared/repo-pr-coordination");

      const rootDir = process.cwd();
      const consoleIntegrity = PROTECTED_CONSOLE_PATHS.map((rule) => {
        const absPath = path.resolve(rootDir, rule.pathPattern);
        const exists = fs.existsSync(absPath);
        return {
          ...rule,
          exists,
        };
      });

      const allConsoleFilesIntact = consoleIntegrity.every((item) => item.exists);

      res.json({
        repository: "Nexus-HUB57/Khaaos_Run",
        allConsoleFilesIntact,
        consoleIntegrity,
        trackedPRs: TRACKED_REPO_PRS,
        defaultValidation: validatePRPathsSafety({
          modifiedFiles: [
            "shared/character-studio.ts",
            "shared/repo-pr-coordination.ts",
            "client/src/components/character-prompt-studio.tsx",
            "scripts/khaaos_workflow.sh",
            ".github/workflows/dev-coordination.yml",
            ".github/workflows/pr-checks.yml",
          ],
          deletedFiles: [],
          allowConsoleTouch: false,
          allowDeletions: false,
        }),
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Falha ao verificar integridade de PRs e Console" });
    }
  });

  app.post("/api/repo/validate-pr-paths", async (req, res) => {
    try {
      const { validatePRPathsSafety } = await import("@shared/repo-pr-coordination");
      const modifiedFiles = Array.isArray(req.body?.modifiedFiles) ? req.body.modifiedFiles.map(String) : [];
      const deletedFiles = Array.isArray(req.body?.deletedFiles) ? req.body.deletedFiles.map(String) : [];
      const allowConsoleTouch = Boolean(req.body?.allowConsoleTouch);
      const allowDeletions = Boolean(req.body?.allowDeletions);

      const validation = validatePRPathsSafety({
        modifiedFiles,
        deletedFiles,
        allowConsoleTouch,
        allowDeletions,
      });

      res.json({ ok: true, validation });
    } catch (err: any) {
      res.status(400).json({ ok: false, message: err?.message || "Falha ao validar caminhos de PR" });
    }
  });

  // ── UE5.8 COMPILATION, 3D MAPS/NIAGARA & EAC SDK BINARY HUB ──────────────
  app.get("/api/ue5/readiness-status", async (_req, res) => {
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const crypto = await import("node:crypto");
      const {
        KHAAOS_NIAGARA_SYSTEMS,
        KHAAOS_WORLD_3D_BUNDLES,
      } = await import("@shared/ue5-engineering-hub");

      const rootDir = process.cwd();
      const ueRoot = path.resolve(rootDir, "Unreal", "KhaaosRun");

      const worldIds = ["CIGKV", "Barburhen", "Priadus", "Ckesalth", "Arukheea"] as const;
      const worldPackages = worldIds.map((w) => {
        const bundle = KHAAOS_WORLD_3D_BUNDLES[w];
        const objExists = fs.existsSync(path.resolve(rootDir, bundle.objMeshPath));
        const gltfExists = fs.existsSync(path.resolve(rootDir, bundle.gltfMeshPath));
        const pointsCsvExists = fs.existsSync(path.resolve(rootDir, bundle.mapPointsCsvPath));
        const configCsvExists = fs.existsSync(path.resolve(rootDir, bundle.worldConfigCsvPath));
        const svgExists = fs.existsSync(path.resolve(rootDir, bundle.topDownSvgPath));
        return {
          worldId: w,
          ready: objExists && gltfExists && pointsCsvExists && configCsvExists && svgExists,
          objExists,
          gltfExists,
          pointsCsvExists,
          configCsvExists,
          svgExists,
          bundle,
        };
      });

      const eacLinuxServer = path.resolve(
        ueRoot,
        "ThirdParty",
        "EasyAntiCheat",
        "Binaries",
        "Linux",
        "libeasyanticheat_server.so"
      );
      const eacWinClient = path.resolve(
        ueRoot,
        "ThirdParty",
        "EasyAntiCheat",
        "Binaries",
        "Win64",
        "EasyAntiCheat_x64.dll"
      );
      const eacBridgeHeader = path.resolve(
        ueRoot,
        "ThirdParty",
        "EasyAntiCheat",
        "include",
        "eos_anticheat_bridge.h"
      );

      const shaPrefix = (p: string) =>
        fs.existsSync(p)
          ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 16)
          : null;

      res.json({
        ok: true,
        ue5Build: {
          engineVersion: "5.8",
          cppStandard: "C++20",
          totalModules: 2,
          runtimeModule: "KhaaosRun",
          editorModule: "KhaaosRunEditor",
          commandlet: "UKhaaosWorldAssetBuilderCommandlet",
          macroStatus: "KHAAOSRUN_API_VERIFIED",
          dockerBuilderImage: "ghcr.io/epicgames/unreal-engine:dev-slim-5.8",
          cliCommands: {
            checkEnv: "bash scripts/setup_ue5_editor.sh --check",
            generateMapsCommandlet: "bash scripts/setup_ue5_editor.sh --generate-maps",
            buildDedicatedServer: "bash scripts/build-server.sh --release --docker",
            auditReadiness: "node scripts/verify_ue5_build_readiness.mjs",
          },
        },
        worldPackages,
        niagaraSystems: KHAAOS_NIAGARA_SYSTEMS,
        eacSdk: {
          bridgeHeaderPresent: fs.existsSync(eacBridgeHeader),
          linuxServerBinaryPresent: fs.existsSync(eacLinuxServer),
          linuxServerSha256Prefix: shaPrefix(eacLinuxServer),
          win64ClientBinaryPresent: fs.existsSync(eacWinClient),
          win64ClientSha256Prefix: shaPrefix(eacWinClient),
          strikePolicy: "Informational=0 · Minor=1 · Major=2 · Critical=3 (Auto-Kick)",
        },
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err?.message || "Falha ao consultar status UE5.8" });
    }
  });

  app.post("/api/ue5/eac-simulate-check", async (req, res) => {
    try {
      const { simulateEACViolationEvaluation } = await import("@shared/ue5-engineering-hub");
      const playerId = Number(req.body?.playerId ?? 77);
      const clientHandle = String(req.body?.clientHandle || "EAC-ZHEERS-SESSION-9901");
      const violationCode = String(req.body?.violationCode || "minor_suspicious_firerate");
      const description = String(req.body?.description || "Telemetria de cadência acima do limiar nominal");
      const priorStrikes = Number(req.body?.priorStrikes ?? 0);

      const evaluation = simulateEACViolationEvaluation({
        playerId,
        clientHandle,
        violationCode,
        description,
        priorStrikes,
      });

      res.json({ ok: true, evaluation });
    } catch (err: any) {
      res.status(400).json({ ok: false, message: err?.message || "Falha ao simular verificação EAC" });
    }
  });

  // ── GAME HIERARCHY END-TO-END (EP555 + 12 SPECS + WORLD DAG + SUBMUNDO KR + UE5 TREE) ─
  app.get("/api/hierarchy/overview", async (req: any, res) => {
    try {
      const {
        getFullGameHierarchyOverview,
        evaluateOperativeHierarchyProfile,
      } = await import("@shared/game-hierarchy");
      const { worldProgressionService } = await import("./game/worldProgression");

      let xp = 0;
      let morth = 0;
      let specializationId: string | null = null;
      let playerId = "OP-KHAAOS-01";

      if (req.user?.claims?.sub) {
        playerId = String(req.user.claims.sub);
        try {
          const stats = await storage.getPlayerStats(playerId);
          xp = stats?.xp ?? 0;
          morth = stats?.kills ?? 0;
          specializationId = stats?.specializationId ?? null;
        } catch {
          // Fallback to default operative values if DB not seeded for test user
        }
      }

      const worldState = worldProgressionService.getPlayerState(playerId);
      const unlockedWorlds = {
        CIGKV: worldState.worlds.CIGKV?.unlocked ?? true,
        Barburhen: worldState.worlds.Barburhen?.unlocked ?? true,
        Priadus: worldState.worlds.Priadus?.unlocked ?? false,
        Ckesalth: worldState.worlds.Ckesalth?.unlocked ?? false,
        Arukheea: worldState.worlds.Arukheea?.unlocked ?? false,
      };

      res.json({
        ok: true,
        hierarchy: getFullGameHierarchyOverview(),
        operativeEvaluation: evaluateOperativeHierarchyProfile({
          xp,
          morth,
          specializationId,
          unlockedWorlds,
        }),
        worldProgressionState: worldState,
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        message: err?.message || "Falha ao carregar Hierarquia do Jogo",
      });
    }
  });

  app.post("/api/hierarchy/simulate-ep555", async (req, res) => {
    try {
      const { computeEp555MatchReward } = await import("@shared/game-hierarchy");
      const validWorlds = new Set(["CIGKV", "Barburhen", "Priadus", "Ckesalth", "Arukheea"]);
      const worldId = validWorlds.has(req.body?.worldId) ? req.body.worldId : "Barburhen";
      const validZuVariants = new Set(["ZU1", "ZU2", "ZU3"]);
      const zuVariant = validZuVariants.has(req.body?.zuVariant) ? req.body.zuVariant : "ZU1";
      const validActions = new Set(["APERTAR_CINTO", "SALTAR_AGORA", "ATIVAR_MASCARA_O2"]);
      const zuActionChosen = validActions.has(req.body?.zuActionChosen)
        ? req.body.zuActionChosen
        : "APERTAR_CINTO";

      const result = computeEp555MatchReward({
        worldId,
        placement: Number(req.body?.placement ?? 1),
        totalPlayers: Number(req.body?.totalPlayers ?? 50),
        pvpKills: Number(req.body?.pvpKills ?? 4),
        zexExtractions: Number(req.body?.zexExtractions ?? 2),
        zuVariant,
        zuActionChosen,
        dataCoresCaptured: Number(req.body?.dataCoresCaptured ?? 1),
        pulsoKhaaosSurvived: Number(req.body?.pulsoKhaaosSurvived ?? 1),
        giantsChallengeTop50: Boolean(req.body?.giantsChallengeTop50),
        currentXp: Number(req.body?.currentXp ?? 0),
        currentMorth: Number(req.body?.currentMorth ?? 0),
      });

      res.json({ ok: true, simulation: result });
    } catch (err: any) {
      res.status(400).json({
        ok: false,
        message: err?.message || "Falha ao simular evento EP555",
      });
    }
  });

  app.post("/api/hierarchy/evaluate-operative", async (req, res) => {
    try {
      const { evaluateOperativeHierarchyProfile } = await import("@shared/game-hierarchy");
      const evaluation = evaluateOperativeHierarchyProfile({
        xp: Number(req.body?.xp ?? 0),
        morth: Number(req.body?.morth ?? 0),
        specializationId: typeof req.body?.specializationId === "string" ? req.body.specializationId : null,
        unlockedWorlds: req.body?.unlockedWorlds,
      });
      res.json({ ok: true, evaluation });
    } catch (err: any) {
      res.status(400).json({
        ok: false,
        message: err?.message || "Falha ao avaliar perfil na hierarquia",
      });
    }
  });
}


