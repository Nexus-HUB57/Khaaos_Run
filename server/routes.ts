import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { api, KRC_TO_USD, PatenteKR, Rarity, ItemType } from "@shared/routes";
import { z } from "zod";
import * as schema from "@shared/schema";
import { ZONE_PHASES, type ZoneStatus } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  const getUserId = (req: any) => {
    if (!req.user || !req.user.claims || !req.user.claims.sub) {
      throw new Error("Unauthorized");
    }
    return req.user.claims.sub as string;
  };

  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };

  // === BANK ROUTES ===

  app.get(api.bank.get.path, requireAuth, async (req, res) => {
    const userId = getUserId(req);
    const bank = await storage.getBankAccount(userId);
    res.json(bank);
  });

  app.post(api.bank.deposit.path, requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const input = api.bank.deposit.input.parse(req.body);
      const bank = await storage.getBankAccount(userId);
      const amountKrc = input.amountUsd * schema.KRC_TO_USD;
      const newWeaponsBalance = Number(bank.weaponsBalance) + amountKrc;
      const newBonusBalance = Number(bank.bonusBalance) + amountKrc;
      await storage.updateBankAccount(userId, {
        weaponsBalance: newWeaponsBalance.toString(),
        bonusBalance: newBonusBalance.toString()
      });
      const tx = await storage.createTransaction({
        userId,
        type: "DEPOSITO",
        amountKrc: amountKrc.toString(),
        amountUsd: input.amountUsd.toString(),
        description: `Deposit $${input.amountUsd}`
      });
      res.json({ newBalance: newWeaponsBalance.toString(), transactionId: tx.id });
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
      if (Number(bank.weaponsBalance) < input.amountKrc) {
        return res.status(402).json({ message: "Saldo insuficiente", required: input.amountKrc, available: Number(bank.weaponsBalance) });
      }
      const updates: any = { weaponsBalance: (Number(bank.weaponsBalance) - input.amountKrc).toString() };
      if (input.destination === "fbm") updates.fbmBalance = (Number(bank.fbmBalance) + input.amountKrc).toString();
      else if (input.destination === "weapons") updates.weaponsBalance = (Number(bank.weaponsBalance)).toString();
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
    const userId = getUserId(req);
    const txs = await storage.getTransactions(userId);
    res.json(txs);
  });

  // === LOAN ROUTES ===

  app.get(api.loans.list.path, requireAuth, async (req, res) => {
    const userId = getUserId(req);
    res.json(await storage.getLoans(userId));
  });

  app.post(api.loans.request.path, requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const input = api.loans.request.input.parse(req.body);
      const activeLoans = (await storage.getLoans(userId)).filter(l => !l.isPaid);
      if (activeLoans.length >= 3) return res.status(403).json({ message: "Limite de 3 empréstimos ativos atingido" });
      const interest = input.amountKrc * 0.05 * input.days;
      const loan = await storage.createLoan({
        userId,
        principal: input.amountKrc.toString(),
        interest: interest.toString(),
        totalDue: (input.amountKrc + interest).toString(),
        daysRemaining: input.days,
      });
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
      const userId = getUserId(req);
      const loanId = parseInt(req.params.id);
      const loan = await storage.getLoan(loanId);
      if (!loan) return res.status(404).json({ message: "Empréstimo não encontrado" });
      const bank = await storage.getBankAccount(userId);
      const totalDue = Number(loan.totalDue);
      if (Number(bank.weaponsBalance) < totalDue) {
        return res.status(402).json({ message: "Saldo insuficiente", required: totalDue, available: Number(bank.weaponsBalance) });
      }
      await storage.updateBankAccount(userId, { weaponsBalance: (Number(bank.weaponsBalance) - totalDue).toString() });
      await storage.updateLoan(loanId, { isPaid: true });
      await storage.createTransaction({ userId, type: "PAGAMENTO_EMPRESTIMO", amountKrc: totalDue.toString(), description: `Repaid loan #${loanId}` });
      res.json({ message: "Empréstimo pago com sucesso" });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === ITEM ROUTES ===

  app.get(api.items.list.path, requireAuth, async (req, res) => {
    const userId = getUserId(req);
    res.json(await storage.getItems(userId));
  });

  app.post(api.items.purchase.path, requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const input = api.items.purchase.input.parse(req.body);
      const prices: Record<string, number> = { ARMA: 500, DEFESA: 300, CURATIVO: 150, UTILIDADE: 200 };
      const price = prices[input.type] || 500;
      const bank = await storage.getBankAccount(userId);
      if (Number(bank.weaponsBalance) < price) {
        return res.status(402).json({ message: "Saldo insuficiente", required: price, available: Number(bank.weaponsBalance) });
      }
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
      const userId = getUserId(req);
      const item = await storage.getItem(parseInt(req.params.id));
      if (!item) return res.status(404).json({ message: "Item não encontrado" });
      const newDurability = Math.max(0, Number(item.durability) - 10);
      let effect: any = {};
      if (item.type === "CURATIVO") {
        await storage.healPlayer(userId, 25);
        effect = { healed: 25 };
      }
      await storage.updateItem(item.id, { durability: newDurability.toString() });
      res.json({ message: `${item.name} usado`, newDurability: newDurability.toString(), effect });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.items.repair.path, requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const input = api.items.repair.input.parse(req.body);
      const item = await storage.getItem(parseInt(req.params.id));
      if (!item) return res.status(404).json({ message: "Item não encontrado" });
      const bank = await storage.getBankAccount(userId);
      if (Number(bank.weaponsBalance) < input.amountKrc) {
        return res.status(402).json({ message: "Saldo insuficiente", required: input.amountKrc, available: Number(bank.weaponsBalance) });
      }
      const repairAmount = input.amountKrc * 0.5;
      const newDurability = Math.min(Number(item.maxDurability), Number(item.durability) + repairAmount);
      await storage.updateBankAccount(userId, { weaponsBalance: (Number(bank.weaponsBalance) - input.amountKrc).toString() });
      await storage.updateItem(item.id, { durability: newDurability.toString() });
      await storage.createTransaction({ userId, type: "REPARO", amountKrc: input.amountKrc.toString(), description: `Repaired ${item.name}` });
      res.json({ message: `Reparado ${item.name}`, newDurability: newDurability.toString() });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === PLAYER ROUTES ===

  app.get(api.player.me.path, requireAuth, async (req, res) => {
    const userId = getUserId(req);
    const stats = await storage.getPlayerStats(userId);
    res.json({ stats, user: req.user });
  });

  app.post(api.player.daily.path, requireAuth, async (req, res) => {
    const userId = getUserId(req);
    const stats = await storage.getPlayerStats(userId);
    const now = new Date();
    const last = stats.lastSalaryDate ? new Date(stats.lastSalaryDate) : null;
    if (last && (now.getTime() - last.getTime()) < 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: "Salário já recebido hoje" });
    }
    const salaries: Record<string, number> = {
      ZHEERS: 100, ONITH: 200, SKEETW: 500, HURAN: 800, VENEX: 1200, KHAEL: 2000, MALAKOR: 3500, OVERLORD: 5000,
    };
    const salary = salaries[stats.rank || "ZHEERS"] || 100;
    await storage.updatePlayerStats(userId, { lastSalaryDate: now });
    const bank = await storage.getBankAccount(userId);
    await storage.updateBankAccount(userId, { bonusBalance: (Number(bank.bonusBalance) + salary).toString() });
    await storage.createTransaction({ userId, type: "SALARY", amountKrc: salary.toString(), description: "Daily Salary" });
    res.json({ message: "Salário recebido", amount: salary });
  });

  // === SAFE ZONE ROUTES (BP_SafeZone equivalent) ===

  // GET /api/zone/status — compute live zone state (like reading from BP_SafeZone actor)
  app.get("/api/zone/status", requireAuth, async (req, res) => {
    try {
      const session = await storage.getActiveZoneSession();
      const totalPhases = ZONE_PHASES.length;

      if (!session) {
        // No active zone — return idle state at full radius
        const status: ZoneStatus = {
          isActive: false,
          sessionId: null,
          currentPhase: 1,
          totalPhases,
          isShrinking: false,
          currentRadiusPct: 100,
          targetRadiusPct: ZONE_PHASES[0].radiusPct,
          prevRadiusPct: 100,
          waitTimeRemaining: 0,
          shrinkTimeRemaining: 0,
          shrinkProgress: 0,
          damagePerTick: ZONE_PHASES[0].damagePerTick,
          centerX: 50,
          centerY: 50,
        };
        return res.json(status);
      }

      const phaseIdx = Math.min(session.currentPhase - 1, totalPhases - 1);
      const phaseConfig = ZONE_PHASES[phaseIdx];
      const prevRadius = phaseIdx === 0 ? 100 : ZONE_PHASES[phaseIdx - 1].radiusPct;
      const targetRadius = phaseConfig.radiusPct;

      const elapsedMs = Date.now() - new Date(session.phaseStartedAt).getTime();
      const elapsedSeconds = elapsedMs / 1000;

      let currentRadiusPct: number;
      let isShrinking = session.isShrinking;
      let waitTimeRemaining = 0;
      let shrinkTimeRemaining = 0;
      let shrinkProgress = 0;

      if (isShrinking) {
        // Timeline Lerp: interpolate radius from prevRadius → targetRadius
        shrinkProgress = Math.min(elapsedSeconds / phaseConfig.shrinkSeconds, 1);
        currentRadiusPct = prevRadius + (targetRadius - prevRadius) * shrinkProgress;
        shrinkTimeRemaining = Math.max(0, phaseConfig.shrinkSeconds - elapsedSeconds);

        // Shrink complete — auto-advance to next phase
        if (shrinkProgress >= 1) {
          const nextPhase = session.currentPhase + 1;
          if (nextPhase <= totalPhases) {
            await storage.updateZoneSession(session.id, {
              currentPhase: nextPhase,
              isShrinking: false,
              phaseStartedAt: new Date(),
            });
            isShrinking = false;
            currentRadiusPct = targetRadius;
          } else {
            // Final phase reached — zone is at minimum
            currentRadiusPct = targetRadius;
          }
        }
      } else {
        // Waiting phase — radius stays at prevRadius until shrink starts
        currentRadiusPct = prevRadius;
        waitTimeRemaining = Math.max(0, phaseConfig.waitSeconds - elapsedSeconds);

        // Auto-trigger shrink when wait time expires (like Set Timer by Event)
        if (waitTimeRemaining <= 0) {
          await storage.updateZoneSession(session.id, {
            isShrinking: true,
            phaseStartedAt: new Date(),
          });
          isShrinking = true;
          shrinkTimeRemaining = phaseConfig.shrinkSeconds;
        }
      }

      const status: ZoneStatus = {
        isActive: true,
        sessionId: session.id,
        currentPhase: session.currentPhase,
        totalPhases,
        isShrinking,
        currentRadiusPct,
        targetRadiusPct: targetRadius,
        prevRadiusPct: prevRadius,
        waitTimeRemaining,
        shrinkTimeRemaining,
        shrinkProgress,
        damagePerTick: phaseConfig.damagePerTick,
        centerX: session.centerX,
        centerY: session.centerY,
      };

      res.json(status);
    } catch (err) {
      res.status(500).json({ message: "Erro ao calcular estado da zona" });
    }
  });

  // POST /api/zone/start — start a new Safe Zone session
  app.post("/api/zone/start", requireAuth, async (req, res) => {
    try {
      const centerX = req.body.centerX ?? 50;
      const centerY = req.body.centerY ?? 50;
      const session = await storage.createZoneSession(centerX, centerY);
      res.json({ message: "Zona Segura ativada", sessionId: session.id });
    } catch (err) {
      res.status(500).json({ message: "Erro ao iniciar zona" });
    }
  });

  // POST /api/zone/stop — deactivate the Safe Zone
  app.post("/api/zone/stop", requireAuth, async (req, res) => {
    try {
      await storage.stopAllZoneSessions();
      res.json({ message: "Zona Segura desativada" });
    } catch (err) {
      res.status(500).json({ message: "Erro ao parar zona" });
    }
  });

  // POST /api/zone/damage — apply zone damage to player (called by frontend timer)
  // Equivalent to: Apply Damage node triggered by Set Timer by Event
  app.post("/api/zone/damage", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const damage = parseInt(req.body.damage) || 5;
      const stats = await storage.applyZoneDamage(userId, damage);
      res.json({ newHealth: stats.health, maxHealth: stats.maxHealth, damageTaken: damage });
    } catch (err) {
      res.status(500).json({ message: "Erro ao aplicar dano da zona" });
    }
  });

  // POST /api/zone/heal — restore player HP (respawn / heal item)
  app.post("/api/zone/heal", requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const amount = parseInt(req.body.amount) || 100;
      const stats = await storage.healPlayer(userId, amount);
      res.json({ newHealth: stats.health, maxHealth: stats.maxHealth });
    } catch (err) {
      res.status(500).json({ message: "Erro ao curar jogador" });
    }
  });

  return httpServer;
}
