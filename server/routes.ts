import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { api } from "@shared/routes";
import { z } from "zod";
import * as schema from "@shared/schema";
import { ZONE_PHASES, PlayerStatus } from "@shared/schema";
import type { ZoneStatus } from "@shared/schema";
import { roomManager } from "./game/RoomManager";
import { quoteItem, probeEconomyHealth, computeLoan, rollRarity } from "./game/EconomyEngine";
import { generateMatchContent, generateLootField } from "./game/ProceduralGenerator";
import { runMonteCarlo, runMonteCarloBatch } from "./game/MonteCarloEconomy";
import { createWsAccessToken } from "./replit_integrations/auth/ws-token";
import { createZoneOperatorGuard, isZoneOperator } from "./game/zoneAuthorization";
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

  // ── REAL-TIME ROOM SYSTEM (highest systemic impact) ──────────────────────
  roomManager.attach(httpServer);

  const getUserId = (req: any): string => {
    if (!req.user?.claims?.sub) throw new Error("Unauthorized");
    return req.user.claims.sub as string;
  };

  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    next();
  };

  const requireZoneOperator = createZoneOperatorGuard();

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

  // ── BANK ─────────────────────────────────────────────────────────────────

  app.get(api.bank.get.path, requireAuth, async (req, res) => {
    res.json(await storage.getBankAccount(getUserId(req)));
  });

  app.post(api.bank.deposit.path, requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { amountUsd } = api.bank.deposit.input.parse(req.body);
      const bank = await storage.getBankAccount(userId);
      const amountKrc = amountUsd * schema.KRC_TO_USD;
      await storage.updateBankAccount(userId, {
        weaponsBalance: (Number(bank.weaponsBalance) + amountKrc).toString(),
        bonusBalance: (Number(bank.bonusBalance) + amountKrc).toString(),
      });
      const tx = await storage.createTransaction({ userId, type: "DEPOSITO", amountKrc: amountKrc.toString(), amountUsd: amountUsd.toString(), description: `Deposit $${amountUsd}` });
      res.json({ newBalance: (Number(bank.weaponsBalance) + amountKrc).toString(), transactionId: tx.id });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.bank.transfer.path, requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const input = api.bank.transfer.input.parse(req.body);
      const bank = await storage.getBankAccount(userId);
      if (Number(bank.weaponsBalance) < input.amountKrc) return res.status(402).json({ message: "Saldo insuficiente", required: input.amountKrc, available: Number(bank.weaponsBalance) });
      const updates: any = { weaponsBalance: (Number(bank.weaponsBalance) - input.amountKrc).toString() };
      if (input.destination === "fbm") updates.fbmBalance = (Number(bank.fbmBalance) + input.amountKrc).toString();
      else updates.bonusBalance = (Number(bank.bonusBalance) + input.amountKrc).toString();
      await storage.updateBankAccount(userId, updates);
      await storage.createTransaction({ userId, type: "TRANSFERENCIA", amountKrc: input.amountKrc.toString(), description: `Transfer to ${input.destination}` });
      res.json({ message: "Transferência realizada", newBalance: updates.weaponsBalance });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
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
      const userId = getUserId(req);
      const input = api.loans.request.input.parse(req.body);
      const active = (await storage.getLoans(userId)).filter(l => !l.isPaid);
      if (active.length >= 3) return res.status(403).json({ message: "Limite de 3 empréstimos ativos atingido" });
      const interest = input.amountKrc * 0.05 * input.days;
      const loan = await storage.createLoan({ userId, principal: input.amountKrc.toString(), interest: interest.toString(), totalDue: (input.amountKrc + interest).toString(), daysRemaining: input.days });
      const bank = await storage.getBankAccount(userId);
      await storage.updateBankAccount(userId, { weaponsBalance: (Number(bank.weaponsBalance) + input.amountKrc).toString() });
      await storage.createTransaction({ userId, type: "EMPRESTIMO", amountKrc: input.amountKrc.toString(), description: `Loan for ${input.days} days` });
      res.status(201).json(loan);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.loans.pay.path, requireAuth, async (req, res) => {
    try {
      if (!parseMutationBody(req, res, emptyMutationInput)) return;
      const userId = getUserId(req);
      const id = parseRouteId(req.params.id);
      if (id === null) return res.status(400).json({ message: "ID de empréstimo inválido" });
      const loan = await storage.getLoanForUser(id, userId);
      if (!loan) return res.status(404).json({ message: "Empréstimo não encontrado" });
      if (loan.isPaid) return res.status(409).json({ message: "Empréstimo já pago" });
      const bank = await storage.getBankAccount(userId);
      const due = Number(loan.totalDue);
      if (Number(bank.weaponsBalance) < due) return res.status(402).json({ message: "Saldo insuficiente", required: due, available: Number(bank.weaponsBalance) });
      await storage.updateBankAccount(userId, { weaponsBalance: (Number(bank.weaponsBalance) - due).toString() });
      const updatedLoan = await storage.updateLoanForUser(loan.id, userId, { isPaid: true });
      if (!updatedLoan) return res.status(404).json({ message: "Empréstimo não encontrado" });
      await storage.createTransaction({ userId, type: "PAGAMENTO_EMPRESTIMO", amountKrc: due.toString(), description: `Repaid loan #${loan.id}` });
      res.json({ message: "Empréstimo pago" });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
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
      const userId = getUserId(req);
      const input = api.items.purchase.input.parse(req.body);
      const prices: Record<string, number> = { ARMA: 500, DEFESA: 300, CURATIVO: 150, UTILIDADE: 200 };
      const price = prices[input.type] || 500;
      const bank = await storage.getBankAccount(userId);
      if (Number(bank.weaponsBalance) < price) return res.status(402).json({ message: "Saldo insuficiente", required: price, available: Number(bank.weaponsBalance) });
      await storage.updateBankAccount(userId, { weaponsBalance: (Number(bank.weaponsBalance) - price).toString() });
      const item = await storage.createItem({ userId, name: input.name, type: input.type });
      await storage.createTransaction({ userId, type: "COMPRA", amountKrc: price.toString(), description: `Purchased ${input.name}` });
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
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
      const userId = getUserId(req);
      const input = api.items.repair.input.parse(req.body);
      const id = parseRouteId(req.params.id);
      if (id === null) return res.status(400).json({ message: "ID de item inválido" });
      const item = await storage.getItemForUser(id, userId);
      if (!item) return res.status(404).json({ message: "Item não encontrado" });
      const bank = await storage.getBankAccount(userId);
      if (Number(bank.weaponsBalance) < input.amountKrc) return res.status(402).json({ message: "Saldo insuficiente", required: input.amountKrc, available: Number(bank.weaponsBalance) });
      const newDur = Math.min(Number(item.maxDurability), Number(item.durability) + input.amountKrc * 0.5);
      await storage.updateBankAccount(userId, { weaponsBalance: (Number(bank.weaponsBalance) - input.amountKrc).toString() });
      const updatedItem = await storage.updateItemForUser(item.id, userId, { durability: newDur.toString() });
      if (!updatedItem) return res.status(404).json({ message: "Item não encontrado" });
      await storage.createTransaction({ userId, type: "REPARO", amountKrc: input.amountKrc.toString(), description: `Repaired ${item.name}` });
      res.json({ message: `Reparado ${item.name}`, newDurability: updatedItem.durability });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── PLAYER ───────────────────────────────────────────────────────────────

  app.get(api.player.me.path, requireAuth, async (req, res) => {
    const stats = await storage.getPlayerStats(getUserId(req));
    res.json({ stats, user: req.user });
  });

  app.post(api.player.daily.path, requireAuth, async (req, res) => {
    if (!parseMutationBody(req, res, emptyMutationInput)) return;
    const userId = getUserId(req);
    const stats = await storage.getPlayerStats(userId);
    const now = new Date();
    const last = stats.lastSalaryDate ? new Date(stats.lastSalaryDate) : null;
    if (last && (now.getTime() - last.getTime()) < 24 * 60 * 60 * 1000) return res.status(400).json({ message: "Salário já recebido hoje" });
    const salaries: Record<string, number> = { ZHEERS: 100, ONITH: 200, SKEETW: 500, HURAN: 800, VENEX: 1200, KHAEL: 2000, MALAKOR: 3500, OVERLORD: 5000 };
    const salary = salaries[stats.rank || "ZHEERS"] || 100;
    await storage.updatePlayerStats(userId, { lastSalaryDate: now });
    const bank = await storage.getBankAccount(userId);
    await storage.updateBankAccount(userId, { bonusBalance: (Number(bank.bonusBalance) + salary).toString() });
    await storage.createTransaction({ userId, type: "SALARY", amountKrc: salary.toString(), description: "Daily Salary" });
    res.json({ message: "Salário recebido", amount: salary });
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

  app.post("/api/zone/start", requireZoneOperator, async (req, res) => {
    try {
      const input = parseMutationBody(req, res, zoneStartInput);
      if (!input) return;
      const session = await storage.createZoneSession(input.centerX, input.centerY);
      await storage.spawnLootPresets(session.id);
      res.json({ message: "Zona Segura + Loot ativados", sessionId: session.id });
    } catch { res.status(500).json({ message: "Erro ao iniciar zona" }); }
  });

  app.post("/api/zone/stop", requireZoneOperator, async (req, res) => {
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

  app.post("/api/zone/heal", requireZoneOperator, async (req, res) => {
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

  app.post("/api/loot/spawn", requireZoneOperator, async (req, res) => {
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
    const summary = roomManager.getRoomSummary(req.params.id);
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

  return httpServer;
}
