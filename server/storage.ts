import { db } from "./db";
import {
  playerStats, bankAccounts, items, loans, transactions, zoneSessions, lootItems, eliminations, matchResults, users,
  type PlayerStats, type BankAccount, type Item, type Loan, type Transaction,
  type ZoneSession, type LootItem, type Elimination, type MatchResult,
  PatenteKR, Rarity, ItemType, PlayerStatus, LOOT_PRESETS, rankFromXp,
} from "@shared/schema";
import { eq, desc, and, isNull, gt, sql } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";

export interface IStorage {
  // Player
  getPlayerStats(userId: string): Promise<PlayerStats>;
  updatePlayerStats(userId: string, updates: Partial<PlayerStats>): Promise<PlayerStats>;
  // Bank
  getBankAccount(userId: string): Promise<BankAccount>;
  updateBankAccount(userId: string, updates: Partial<BankAccount>): Promise<BankAccount>;
  createTransaction(tx: Partial<Transaction> & { userId: string; type: string; amountKrc: string }): Promise<Transaction>;
  transferFunds(userId: string, amountKrc: string, destination: "fbm" | "weapons"): Promise<{ bank: BankAccount; transaction: Transaction }>;
  getTransactions(userId: string): Promise<Transaction[]>;
  // Loans
  getLoans(userId: string): Promise<Loan[]>;
  getLoan(id: number): Promise<Loan | undefined>;
  getLoanForUser(id: number, userId: string): Promise<Loan | undefined>;
  requestLoanAtomic(userId: string, amountKrc: string, days: number): Promise<Loan>;
  payLoanAtomic(userId: string, loanId: number): Promise<{ bank: BankAccount; loan: Loan; transaction: Transaction }>;
  // Items
  getItems(userId: string): Promise<Item[]>;
  getEquippedItems(userId: string): Promise<Item[]>;
  getItem(id: number): Promise<Item | undefined>;
  getItemForUser(id: number, userId: string): Promise<Item | undefined>;
  consumeItemDurability(id: number, userId: string, amount: number): Promise<Item | undefined>;
  createItem(item: Partial<Item> & { userId: string }): Promise<Item>;
  updateItem(id: number, updates: Partial<Item>): Promise<Item>;
  updateItemForUser(id: number, userId: string, updates: Partial<Item>): Promise<Item | undefined>;
  setItemEquipped(id: number, userId: string, isEquipped: boolean): Promise<Item | undefined>;
  purchaseItemAtomic(userId: string, name: string, type: string): Promise<{ bank: BankAccount; item: Item; transaction: Transaction }>;
  repairItemAtomic(userId: string, itemId: number, amountKrc: string): Promise<{ bank: BankAccount; item: Item; transaction: Transaction }>;
  // Zone
  getActiveZoneSession(): Promise<ZoneSession | undefined>;
  createZoneSession(centerX: number, centerY: number): Promise<ZoneSession>;
  updateZoneSession(id: number, updates: Partial<ZoneSession>): Promise<ZoneSession>;
  stopAllZoneSessions(): Promise<void>;
  applyZoneDamage(userId: string, damage: number, userName?: string): Promise<PlayerStats>;
  healPlayer(userId: string, amount: number): Promise<PlayerStats>;
  // Loot (BP_LootBase / ST_ItemData)
  getLootItems(): Promise<LootItem[]>;
  getLootItem(id: number): Promise<LootItem | undefined>;
  spawnLootPresets(sessionId?: number): Promise<LootItem[]>;
  clearLoot(): Promise<void>;
  pickupLoot(lootId: number, userId: string, userName?: string): Promise<{ loot: LootItem; item: Item }>;
  // Elimination (BP_Character death)
  eliminatePlayer(userId: string, cause: string, userName?: string, sessionId?: number): Promise<PlayerStats>;
  respawnPlayer(userId: string): Promise<PlayerStats>;
  getEliminations(limit?: number): Promise<Elimination[]>;
  logElimination(data: Partial<Elimination> & { eliminatedUserId: string; cause: string }): Promise<Elimination>;
  // Ranking
  createMatchResult(data: {
    roomId: string; userId: string; placement: number; kills: number;
    damageDealt: number; survivedMs: number; ratingBefore: number; ratingAfter: number; xpGained: number;
  }): Promise<MatchResult>;
  getLeaderboard(limit?: number): Promise<PlayerStats[]>;
  getMatchHistory(userId: string, limit?: number): Promise<MatchResult[]>;
  addKill(userId: string): Promise<void>;
  claimDailySalaryAtomic(userId: string, salary: number): Promise<{ bank: BankAccount; stats: PlayerStats; transaction: Transaction }>;
  // Init
  initializeUser(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async initializeUser(userId: string) {
    const [stats] = await db.select().from(playerStats).where(eq(playerStats.userId, userId));
    if (!stats) await db.insert(playerStats).values({ userId });
    const [bank] = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
    if (!bank) await db.insert(bankAccounts).values({ userId });
  }

  async getPlayerStats(userId: string): Promise<PlayerStats> {
    await this.initializeUser(userId);
    const [stats] = await db.select().from(playerStats).where(eq(playerStats.userId, userId));
    return { ...stats, rank: rankFromXp(stats.xp ?? 0) };
  }

  async updatePlayerStats(userId: string, updates: Partial<PlayerStats>): Promise<PlayerStats> {
    const [updated] = await db.update(playerStats).set(updates).where(eq(playerStats.userId, userId)).returning();
    return { ...updated, rank: rankFromXp(updated.xp ?? 0) };
  }

  async getBankAccount(userId: string): Promise<BankAccount> {
    await this.initializeUser(userId);
    const [bank] = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
    return bank;
  }

  async updateBankAccount(userId: string, updates: Partial<BankAccount>): Promise<BankAccount> {
    const [updated] = await db.update(bankAccounts).set(updates).where(eq(bankAccounts.userId, userId)).returning();
    return updated;
  }

  async createTransaction(tx: Partial<Transaction> & { userId: string; type: string; amountKrc: string }): Promise<Transaction> {
    const [newTx] = await db.insert(transactions).values(tx as any).returning();
    return newTx;
  }

  private async lockBankAccount(tx: any, userId: string): Promise<BankAccount> {
    await tx.insert(bankAccounts).values({ userId }).onConflictDoNothing({ target: bankAccounts.userId });
    const [bank] = await tx.select().from(bankAccounts).where(eq(bankAccounts.userId, userId)).for("update");
    if (!bank) throw new Error("Conta bancária não encontrada");
    return bank;
  }

  async transferFunds(userId: string, amountKrc: string, destination: "fbm" | "weapons") {
    return db.transaction(async (tx) => {
      const bank = await this.lockBankAccount(tx, userId);
      const amount = Number(amountKrc);
      const available = Number(bank.weaponsBalance);
      if (available < amount) {
        const error = new Error("Saldo insuficiente");
        (error as any).code = "INSUFFICIENT_FUNDS";
        (error as any).required = amount;
        (error as any).available = available;
        throw error;
      }
      const target = destination === "fbm" ? bankAccounts.fbmBalance : bankAccounts.bonusBalance;
      const [updatedBank] = await tx.update(bankAccounts).set({
        weaponsBalance: sql`${bankAccounts.weaponsBalance} - ${amountKrc}::numeric`,
        [destination === "fbm" ? "fbmBalance" : "bonusBalance"]: sql`${target} + ${amountKrc}::numeric`,
      }).where(eq(bankAccounts.userId, userId)).returning();
      const [transaction] = await tx.insert(transactions).values({
        userId, type: "TRANSFERENCIA", amountKrc, description: `Transfer to ${destination}`,
      }).returning();
      return { bank: updatedBank, transaction };
    });
  }

  async requestLoanAtomic(userId: string, amountKrc: string, days: number) {
    return db.transaction(async (tx) => {
      await this.lockBankAccount(tx, userId);
      const activeLoans = await tx.select({ id: loans.id }).from(loans)
        .where(and(eq(loans.userId, userId), eq(loans.isPaid, false))).for("update");
      if (activeLoans.length >= 3) {
        const error = new Error("Limite de 3 empréstimos ativos atingido");
        (error as any).code = "LOAN_LIMIT";
        throw error;
      }
      const amount = Number(amountKrc);
      const interest = amount * 0.05 * days;
      const [loan] = await tx.insert(loans).values({
        userId, principal: amountKrc, interest: interest.toString(), totalDue: (amount + interest).toString(), daysRemaining: days,
      }).returning();
      await tx.update(bankAccounts).set({
        weaponsBalance: sql`${bankAccounts.weaponsBalance} + ${amountKrc}::numeric`,
      }).where(eq(bankAccounts.userId, userId));
      await tx.insert(transactions).values({ userId, type: "EMPRESTIMO", amountKrc, description: `Loan for ${days} days` });
      return loan;
    });
  }

  async payLoanAtomic(userId: string, loanId: number) {
    return db.transaction(async (tx) => {
      const bank = await this.lockBankAccount(tx, userId);
      const [loan] = await tx.select().from(loans).where(and(eq(loans.id, loanId), eq(loans.userId, userId))).for("update");
      if (!loan) throw new Error("Empréstimo não encontrado");
      if (loan.isPaid) throw new Error("Empréstimo já pago");
      const due = Number(loan.totalDue);
      const available = Number(bank.weaponsBalance);
      if (available < due) {
        const error = new Error("Saldo insuficiente");
        (error as any).code = "INSUFFICIENT_FUNDS";
        (error as any).required = due;
        (error as any).available = available;
        throw error;
      }
      const [updatedBank] = await tx.update(bankAccounts).set({
        weaponsBalance: sql`${bankAccounts.weaponsBalance} - ${loan.totalDue}::numeric`,
      }).where(eq(bankAccounts.userId, userId)).returning();
      const [updatedLoan] = await tx.update(loans).set({ isPaid: true }).where(eq(loans.id, loanId)).returning();
      const [transaction] = await tx.insert(transactions).values({
        userId, type: "PAGAMENTO_EMPRESTIMO", amountKrc: loan.totalDue, description: `Repaid loan #${loanId}`,
      }).returning();
      return { bank: updatedBank, loan: updatedLoan, transaction };
    });
  }

  async purchaseItemAtomic(userId: string, name: string, type: string) {
    return db.transaction(async (tx) => {
      const bank = await this.lockBankAccount(tx, userId);
      const prices: Record<string, number> = { ARMA: 500, DEFESA: 300, CURATIVO: 150, UTILIDADE: 200 };
      const price = prices[type] ?? 500;
      if (Number(bank.weaponsBalance) < price) {
        const error = new Error("Saldo insuficiente");
        (error as any).code = "INSUFFICIENT_FUNDS";
        (error as any).required = price;
        (error as any).available = Number(bank.weaponsBalance);
        throw error;
      }
      const [updatedBank] = await tx.update(bankAccounts).set({
        weaponsBalance: sql`${bankAccounts.weaponsBalance} - ${price}::numeric`,
      }).where(eq(bankAccounts.userId, userId)).returning();
      const [item] = await tx.insert(items).values({ userId, name, type }).returning();
      const [transaction] = await tx.insert(transactions).values({
        userId, type: "COMPRA", amountKrc: price.toString(), description: `Purchased ${name}`,
      }).returning();
      return { bank: updatedBank, item, transaction };
    });
  }

  async repairItemAtomic(userId: string, itemId: number, amountKrc: string) {
    return db.transaction(async (tx) => {
      const bank = await this.lockBankAccount(tx, userId);
      const [item] = await tx.select().from(items).where(and(eq(items.id, itemId), eq(items.userId, userId))).for("update");
      if (!item) throw new Error("Item não encontrado");
      const amount = Number(amountKrc);
      if (Number(bank.weaponsBalance) < amount) {
        const error = new Error("Saldo insuficiente");
        (error as any).code = "INSUFFICIENT_FUNDS";
        (error as any).required = amount;
        (error as any).available = Number(bank.weaponsBalance);
        throw error;
      }
      const newDurability = Math.min(Number(item.maxDurability), Number(item.durability) + amount * 0.5);
      const [updatedBank] = await tx.update(bankAccounts).set({
        weaponsBalance: sql`${bankAccounts.weaponsBalance} - ${amountKrc}::numeric`,
      }).where(eq(bankAccounts.userId, userId)).returning();
      const [updatedItem] = await tx.update(items).set({ durability: newDurability.toString() }).where(eq(items.id, itemId)).returning();
      const [transaction] = await tx.insert(transactions).values({
        userId, type: "REPARO", amountKrc, description: `Repaired ${item.name}`,
      }).returning();
      return { bank: updatedBank, item: updatedItem, transaction };
    });
  }

  async claimDailySalaryAtomic(userId: string, salary: number) {
    return db.transaction(async (tx) => {
      const bank = await this.lockBankAccount(tx, userId);
      const [stats] = await tx.select().from(playerStats).where(eq(playerStats.userId, userId)).for("update");
      if (!stats) throw new Error("Estatísticas do jogador não encontradas");
      const now = new Date();
      if (stats.lastSalaryDate && now.getTime() - new Date(stats.lastSalaryDate).getTime() < 24 * 60 * 60 * 1000) {
        const error = new Error("Salário já recebido hoje");
        (error as any).code = "SALARY_ALREADY_CLAIMED";
        throw error;
      }
      const [updatedBank] = await tx.update(bankAccounts).set({
        weaponsBalance: sql`${bankAccounts.weaponsBalance} + ${salary}::numeric`,
      }).where(eq(bankAccounts.userId, userId)).returning();
      const [updatedStats] = await tx.update(playerStats).set({ lastSalaryDate: now }).where(eq(playerStats.userId, userId)).returning();
      const [transaction] = await tx.insert(transactions).values({
        userId, type: "SALARIO", amountKrc: salary.toString(), description: "Daily salary",
      }).returning();
      return { bank: updatedBank, stats: updatedStats, transaction };
    });
  }

  async getTransactions(userId: string): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.timestamp)).limit(50);
  }

  async getLoans(userId: string): Promise<Loan[]> {
    return await db.select().from(loans).where(eq(loans.userId, userId)).orderBy(desc(loans.createdAt));
  }

  async getLoan(id: number): Promise<Loan | undefined> {
    const [loan] = await db.select().from(loans).where(eq(loans.id, id));
    return loan;
  }

  async getLoanForUser(id: number, userId: string): Promise<Loan | undefined> {
    const [loan] = await db.select().from(loans).where(and(eq(loans.id, id), eq(loans.userId, userId)));
    return loan;
  }

  async getItems(userId: string): Promise<Item[]> {
    return await db.select().from(items).where(eq(items.userId, userId));
  }

  async getEquippedItems(userId: string): Promise<Item[]> {
    return await db.select().from(items)
      .where(and(eq(items.userId, userId), eq(items.isEquipped, true)));
  }

  async getItem(id: number): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id));
    return item;
  }

  async getItemForUser(id: number, userId: string): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(and(eq(items.id, id), eq(items.userId, userId)));
    return item;
  }

  async consumeItemDurability(id: number, userId: string, amount: number): Promise<Item | undefined> {
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(amount) || amount <= 0) return undefined;
    const [updated] = await db.update(items)
      .set({ durability: sql`GREATEST(0, ${items.durability} - ${amount})` })
      .where(and(eq(items.id, id), eq(items.userId, userId), gt(items.durability, "0")))
      .returning();
    return updated;
  }

  async createItem(item: Partial<Item> & { userId: string }): Promise<Item> {
    const [newItem] = await db.insert(items).values(item as any).returning();
    return newItem;
  }

  async updateItem(id: number, updates: Partial<Item>): Promise<Item> {
    const [updated] = await db.update(items).set(updates).where(eq(items.id, id)).returning();
    return updated;
  }

  async updateItemForUser(id: number, userId: string, updates: Partial<Item>): Promise<Item | undefined> {
    const [updated] = await db.update(items).set(updates)
      .where(and(eq(items.id, id), eq(items.userId, userId)))
      .returning();
    return updated;
  }

  async setItemEquipped(id: number, userId: string, isEquipped: boolean): Promise<Item | undefined> {
    const [updated] = await db.update(items)
      .set({ isEquipped })
      .where(and(eq(items.id, id), eq(items.userId, userId)))
      .returning();
    return updated;
  }

  // === ZONE ===

  async getActiveZoneSession(): Promise<ZoneSession | undefined> {
    const [session] = await db.select().from(zoneSessions).where(eq(zoneSessions.isActive, true)).orderBy(desc(zoneSessions.createdAt)).limit(1);
    return session;
  }

  async createZoneSession(centerX: number, centerY: number): Promise<ZoneSession> {
    await this.stopAllZoneSessions();
    const [session] = await db.insert(zoneSessions).values({
      isActive: true, currentPhase: 1, phaseStartedAt: new Date(), isShrinking: false, centerX, centerY,
    }).returning();
    return session;
  }

  async updateZoneSession(id: number, updates: Partial<ZoneSession>): Promise<ZoneSession> {
    const [updated] = await db.update(zoneSessions).set(updates).where(eq(zoneSessions.id, id)).returning();
    return updated;
  }

  async stopAllZoneSessions(): Promise<void> {
    await db.update(zoneSessions).set({ isActive: false }).where(eq(zoneSessions.isActive, true));
  }

  async applyZoneDamage(userId: string, damage: number, userName?: string): Promise<PlayerStats> {
    const stats = await this.getPlayerStats(userId);
    if (stats.status !== PlayerStatus.VIVO) return stats; // already dead
    const newHealth = Math.max(0, stats.health - damage);
    if (newHealth <= 0) {
      // Death — Event Any Damage => health <= 0 => Disable Movement + Eliminate
      return await this.eliminatePlayer(userId, "ZONA", userName);
    }
    return await this.updatePlayerStats(userId, { health: newHealth });
  }

  async healPlayer(userId: string, amount: number): Promise<PlayerStats> {
    const stats = await this.getPlayerStats(userId);
    const newHealth = Math.min(stats.maxHealth, stats.health + amount);
    return await this.updatePlayerStats(userId, { health: newHealth });
  }

  // === LOOT (BP_LootBase Server_PickupItem equivalent) ===

  async getLootItems(): Promise<LootItem[]> {
    return await db.select().from(lootItems).orderBy(lootItems.id);
  }

  async getLootItem(id: number): Promise<LootItem | undefined> {
    const [item] = await db.select().from(lootItems).where(eq(lootItems.id, id));
    return item;
  }

  async spawnLootPresets(sessionId?: number): Promise<LootItem[]> {
    await this.clearLoot();
    const values = LOOT_PRESETS.map(p => ({
      name: p.name,
      type: p.type,
      rarity: p.rarity,
      posX: p.posX,
      posY: p.posY,
      stats: p.stats,
      sessionId: sessionId ?? null,
      isPickedUp: false,
    }));
    const spawned = await db.insert(lootItems).values(values as any).returning();
    return spawned;
  }

  async clearLoot(): Promise<void> {
    await db.delete(lootItems);
  }

  // Server_PickupItem RPC equivalent — runs on server, validates, grants item, destroys loot actor
  async pickupLoot(lootId: number, userId: string, userName?: string): Promise<{ loot: LootItem; item: Item }> {
    return db.transaction(async (tx) => {
      const [loot] = await tx.select().from(lootItems).where(eq(lootItems.id, lootId)).for("update");
      if (!loot) throw new Error("Item de loot não encontrado");
      if (loot.isPickedUp) throw new Error("Item já foi coletado por outro operativo");

      await tx.insert(playerStats).values({ userId }).onConflictDoNothing();
      const [stats] = await tx.select().from(playerStats).where(eq(playerStats.userId, userId)).for("update");
      if (!stats) throw new Error("Player stats could not be initialized");
      if (stats.status !== PlayerStatus.VIVO) throw new Error("Operativo eliminado não pode coletar itens");

      const [updatedLoot] = await tx.update(lootItems)
        .set({ isPickedUp: true, pickedUpBy: userId, pickedUpAt: new Date() })
        .where(and(eq(lootItems.id, lootId), eq(lootItems.isPickedUp, false)))
        .returning();
      if (!updatedLoot) throw new Error("Conflito: item já coletado");

      const [item] = await tx.insert(items).values({
        userId,
        name: loot.name,
        type: loot.type,
        rarity: loot.rarity,
        stats: loot.stats ?? {},
        durability: "100",
        maxDurability: "100",
      }).returning();
      if (!item) throw new Error("Não foi possível adicionar o loot ao inventário");

      const heal = loot.stats?.heal;
      if (loot.type === "CURATIVO" && typeof heal === "number" && Number.isFinite(heal) && heal > 0) {
        const [healedStats] = await tx.update(playerStats)
          .set({ health: Math.min(stats.maxHealth, stats.health + heal) })
          .where(eq(playerStats.userId, userId))
          .returning();
        if (!healedStats) throw new Error("Não foi possível aplicar a cura do loot");
      }

      return { loot: updatedLoot, item };
    });
  }

  // === ELIMINATION (BP_Character Event Any Damage death logic) ===

  async eliminatePlayer(userId: string, cause: string, userName?: string, sessionId?: number): Promise<PlayerStats> {
    const stats = await this.getPlayerStats(userId);
    // Disable Movement + Set Collision No Collision → status = ELIMINADO
    const updated = await this.updatePlayerStats(userId, {
      health: 0,
      status: PlayerStatus.ELIMINADO,
      deaths: stats.deaths + 1,
    });

    // Log elimination
    const session = await this.getActiveZoneSession();
    await this.logElimination({
      eliminatedUserId: userId,
      eliminatedName: userName,
      cause,
      sessionId: sessionId ?? session?.id,
    });

    return updated;
  }

  async respawnPlayer(userId: string): Promise<PlayerStats> {
    const stats = await this.getPlayerStats(userId);
    // Spawn Spectator → Possess (respawn equivalent)
    return await this.updatePlayerStats(userId, {
      health: stats.maxHealth,
      status: PlayerStatus.VIVO,
    });
  }

  async getEliminations(limit = 20): Promise<Elimination[]> {
    return await db.select().from(eliminations).orderBy(desc(eliminations.timestamp)).limit(limit);
  }

  async logElimination(data: Partial<Elimination> & { eliminatedUserId: string; cause: string }): Promise<Elimination> {
    const [elim] = await db.insert(eliminations).values(data as any).returning();
    return elim;
  }

  async createMatchResult(data: {
    roomId: string; userId: string; placement: number; kills: number;
    damageDealt: number; survivedMs: number; ratingBefore: number; ratingAfter: number; xpGained: number;
  }): Promise<MatchResult> {
    const [row] = await db.insert(matchResults).values(data as any).returning();
    return row;
  }

  async getLeaderboard(limit = 50): Promise<(PlayerStats & { displayName?: string })[]> {
    const rows = await db
      .select({
        id: playerStats.id,
        userId: playerStats.userId,
        rank: playerStats.rank,
        xp: playerStats.xp,
        health: playerStats.health,
        maxHealth: playerStats.maxHealth,
        energy: playerStats.energy,
        maxEnergy: playerStats.maxEnergy,
        status: playerStats.status,
        kills: playerStats.kills,
        deaths: playerStats.deaths,
        lastSalaryDate: playerStats.lastSalaryDate,
        rating: playerStats.rating,
        matchesPlayed: playerStats.matchesPlayed,
        wins: playerStats.wins,
        top5: playerStats.top5,
        seasonKills: playerStats.seasonKills,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(playerStats)
      .leftJoin(users, eq(playerStats.userId, users.id))
      .orderBy(desc(playerStats.rating))
      .limit(limit);

    return rows.map((r) => ({
      ...r,
      rank: rankFromXp(r.xp ?? 0),
      displayName: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.userId.slice(0, 8),
    })) as any;
  }

  async getMatchHistory(userId: string, limit = 20): Promise<MatchResult[]> {
    return await db.select().from(matchResults)
      .where(eq(matchResults.userId, userId))
      .orderBy(desc(matchResults.createdAt))
      .limit(limit);
  }

  async addKill(userId: string): Promise<void> {
    const stats = await this.getPlayerStats(userId);
    await this.updatePlayerStats(userId, { kills: stats.kills + 1 });
  }
}

export const storage = new DatabaseStorage();
