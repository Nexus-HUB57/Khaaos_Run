import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { api, KRC_TO_USD, PatenteKR, Rarity, ItemType } from "@shared/routes"; // Note: shared imports might need to be adjusted based on actual exports
import { z } from "zod";
import * as schema from "@shared/schema"; // Import schema for types

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth Setup
  await setupAuth(app);
  registerAuthRoutes(app);

  // Helper to get User ID from request (assuming auth middleware populates req.user)
  const getUserId = (req: any) => {
    if (!req.user || !req.user.claims || !req.user.claims.sub) {
      throw new Error("Unauthorized");
    }
    return req.user.claims.sub as string;
  };

  // Middleware to ensure auth for all API routes (except maybe status)
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
      
      // Bonus (Cashback 100%)
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

      res.json({
        newBalance: newWeaponsBalance.toString(),
        transactionId: tx.id
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.bank.transfer.path, requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const input = api.bank.transfer.input.parse(req.body);
      const bank = await storage.getBankAccount(userId);

      const amount = input.amountKrc;
      const currentWeapons = Number(bank.weaponsBalance);

      if (currentWeapons < amount) {
        return res.status(402).json({ 
          message: "Insufficient funds in Weapons Account",
          required: amount,
          available: currentWeapons
        });
      }

      if (input.destination === "fbm") {
        await storage.updateBankAccount(userId, {
          weaponsBalance: (currentWeapons - amount).toString(),
          fbmBalance: (Number(bank.fbmBalance) + amount).toString()
        });
        
        await storage.createTransaction({
          userId,
          type: "FBM_TRANSFER",
          amountKrc: amount.toString(),
          description: "Transfer to FBM"
        });
      }

      const updatedBank = await storage.getBankAccount(userId);
      res.json({
        message: "Transfer successful",
        newBalance: updatedBank.weaponsBalance
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
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
    const loans = await storage.getLoans(userId);
    res.json(loans);
  });

  app.post(api.loans.request.path, requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const input = api.loans.request.input.parse(req.body);
      
      const activeLoans = (await storage.getLoans(userId)).filter(l => !l.isPaid);
      if (activeLoans.length >= 3) {
        return res.status(403).json({ message: "Max loans reached (3)" });
      }

      const interestRate = 0.05; // 5% daily
      const interest = input.amountKrc * interestRate * input.days;
      const totalDue = input.amountKrc + interest;

      const loan = await storage.createLoan({
        userId,
        principal: input.amountKrc.toString(),
        interest: interest.toString(),
        totalDue: totalDue.toString(),
        daysRemaining: input.days,
        isPaid: false
      });

      // Credit the user
      const bank = await storage.getBankAccount(userId);
      await storage.updateBankAccount(userId, {
        weaponsBalance: (Number(bank.weaponsBalance) + input.amountKrc).toString()
      });

      await storage.createTransaction({
        userId,
        type: "LOAN_RECEIVED",
        amountKrc: input.amountKrc.toString(),
        description: `Loan #${loan.id} received`
      });

      res.status(201).json(loan);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.loans.pay.path, requireAuth, async (req, res) => {
    const userId = getUserId(req);
    const loanId = Number(req.params.id);
    const loan = await storage.getLoan(loanId);

    if (!loan || loan.userId !== userId) {
      return res.status(404).json({ message: "Loan not found" });
    }
    if (loan.isPaid) {
      return res.status(400).json({ message: "Loan already paid" });
    }

    const bank = await storage.getBankAccount(userId);
    const amountDue = Number(loan.totalDue);
    const currentBalance = Number(bank.weaponsBalance);

    if (currentBalance < amountDue) {
       return res.status(402).json({ 
          message: "Insufficient funds",
          required: amountDue,
          available: currentBalance
        });
    }

    await storage.updateBankAccount(userId, {
      weaponsBalance: (currentBalance - amountDue).toString()
    });

    await storage.updateLoan(loanId, { isPaid: true });

    await storage.createTransaction({
      userId,
      type: "LOAN_REPAYMENT",
      amountKrc: (-amountDue).toString(),
      description: `Repaid Loan #${loanId}`
    });

    res.json({ message: "Loan repaid successfully" });
  });

  // === ITEM ROUTES ===

  app.get(api.items.list.path, requireAuth, async (req, res) => {
    const userId = getUserId(req);
    const items = await storage.getItems(userId);
    res.json(items);
  });

  app.post(api.items.purchase.path, requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const input = api.items.purchase.input.parse(req.body);
      
      // Simple mock prices for MVP
      const prices: Record<string, number> = {
        "ARMA": 500,
        "DEFESA": 300,
        "CURATIVO": 50,
        "UTILIDADE": 100
      };
      
      const cost = prices[input.type] || 100;
      
      const bank = await storage.getBankAccount(userId);
      const balance = Number(bank.weaponsBalance);

      if (balance < cost) {
        return res.status(402).json({
          message: "Insufficient funds",
          required: cost,
          available: balance
        });
      }

      await storage.updateBankAccount(userId, {
        weaponsBalance: (balance - cost).toString()
      });

      const newItem = await storage.createItem({
        userId,
        name: input.name,
        type: input.type,
        rarity: "COMUM",
        durability: "100",
        maxDurability: "100",
        stats: { value: 10 } // simplified stats
      });

      await storage.createTransaction({
        userId,
        type: "PURCHASE",
        amountKrc: (-cost).toString(),
        description: `Bought ${input.name}`
      });

      res.status(201).json(newItem);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.items.use.path, requireAuth, async (req, res) => {
    const userId = getUserId(req);
    const itemId = Number(req.params.id);
    const item = await storage.getItem(itemId);

    if (!item || item.userId !== userId) {
      return res.status(404).json({ message: "Item not found" });
    }

    const currentDurability = Number(item.durability);
    if (currentDurability <= 0) {
      return res.status(400).json({ message: "Item is broken" });
    }

    const newDurability = Math.max(0, currentDurability - 5);
    await storage.updateItem(itemId, { durability: newDurability.toString() });

    res.json({
      message: `Used ${item.name}`,
      newDurability: newDurability.toString(),
      effect: item.stats
    });
  });

  app.post(api.items.repair.path, requireAuth, async (req, res) => {
    const userId = getUserId(req);
    const itemId = Number(req.params.id);
    const input = api.items.repair.input.parse(req.body);
    
    const item = await storage.getItem(itemId);
    if (!item || item.userId !== userId) {
      return res.status(404).json({ message: "Item not found" });
    }

    const bank = await storage.getBankAccount(userId);
    const balance = Number(bank.weaponsBalance);

    if (balance < input.amountKrc) {
      return res.status(402).json({
        message: "Insufficient funds",
        required: input.amountKrc,
        available: balance
      });
    }

    // 10 KRC = 2% repair logic from python script
    const repairAmount = (input.amountKrc / 10) * 2;
    const currentDurability = Number(item.durability);
    const maxDurability = Number(item.maxDurability);
    const newDurability = Math.min(maxDurability, currentDurability + repairAmount);

    await storage.updateBankAccount(userId, {
      weaponsBalance: (balance - input.amountKrc).toString()
    });

    await storage.updateItem(itemId, { durability: newDurability.toString() });

    await storage.createTransaction({
      userId,
      type: "REPAIR",
      amountKrc: (-input.amountKrc).toString(),
      description: `Repaired ${item.name}`
    });

    res.json({
      message: `Repaired ${item.name}`,
      newDurability: newDurability.toString()
    });
  });

  // === PLAYER ROUTES ===

  app.get(api.player.me.path, requireAuth, async (req, res) => {
    const userId = getUserId(req);
    const stats = await storage.getPlayerStats(userId);
    // The auth user info is already in the auth module, but we can return merged view if needed
    // or frontend can fetch auth info separately.
    res.json({ stats, user: req.user });
  });

  app.post(api.player.daily.path, requireAuth, async (req, res) => {
    const userId = getUserId(req);
    const stats = await storage.getPlayerStats(userId);
    
    const now = new Date();
    const last = stats.lastSalaryDate ? new Date(stats.lastSalaryDate) : null;
    
    // Check if 24h passed
    if (last && (now.getTime() - last.getTime()) < 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: "Salary already claimed today" });
    }

    // Calculate salary based on rank (simplified)
    const salaries: Record<string, number> = {
      "ZHEERS": 100,
      "ONITH": 200,
      "SKEETW": 500,
      // ... others
    };
    const salary = salaries[stats.rank || "ZHEERS"] || 100;

    await storage.updatePlayerStats(userId, { lastSalaryDate: now });
    
    const bank = await storage.getBankAccount(userId);
    await storage.updateBankAccount(userId, {
      bonusBalance: (Number(bank.bonusBalance) + salary).toString()
    });

    await storage.createTransaction({
      userId,
      type: "SALARY",
      amountKrc: salary.toString(),
      description: "Daily Salary"
    });

    res.json({ message: "Salary claimed", amount: salary });
  });

  return httpServer;
}
