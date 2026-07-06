import { db } from "./db";
import {
  playerStats, bankAccounts, items, loans, transactions, zoneSessions, lootItems, eliminations,
  type PlayerStats, type BankAccount, type Item, type Loan, type Transaction,
  type ZoneSession, type LootItem, type Elimination,
  PatenteKR, KRC_TO_USD, Rarity, ItemType, PlayerStatus, LOOT_PRESETS,
} from "@shared/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";

export interface IStorage {
  // Player
  getPlayerStats(userId: string): Promise<PlayerStats>;
  updatePlayerStats(userId: string, updates: Partial<PlayerStats>): Promise<PlayerStats>;
  // Bank
  getBankAccount(userId: string): Promise<BankAccount>;
  updateBankAccount(userId: string, updates: Partial<BankAccount>): Promise<BankAccount>;
  createTransaction(tx: Partial<Transaction> & { userId: string; type: string; amountKrc: string }): Promise<Transaction>;
  getTransactions(userId: string): Promise<Transaction[]>;
  // Loans
  getLoans(userId: string): Promise<Loan[]>;
  getLoan(id: number): Promise<Loan | undefined>;
  createLoan(loan: Partial<Loan> & { userId: string }): Promise<Loan>;
  updateLoan(id: number, updates: Partial<Loan>): Promise<Loan>;
  // Items
  getItems(userId: string): Promise<Item[]>;
  getItem(id: number): Promise<Item | undefined>;
  createItem(item: Partial<Item> & { userId: string }): Promise<Item>;
  updateItem(id: number, updates: Partial<Item>): Promise<Item>;
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
    return stats;
  }

  async updatePlayerStats(userId: string, updates: Partial<PlayerStats>): Promise<PlayerStats> {
    const [updated] = await db.update(playerStats).set(updates).where(eq(playerStats.userId, userId)).returning();
    return updated;
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

  async createLoan(loan: Partial<Loan> & { userId: string }): Promise<Loan> {
    const [newLoan] = await db.insert(loans).values(loan as any).returning();
    return newLoan;
  }

  async updateLoan(id: number, updates: Partial<Loan>): Promise<Loan> {
    const [updated] = await db.update(loans).set(updates).where(eq(loans.id, id)).returning();
    return updated;
  }

  async getItems(userId: string): Promise<Item[]> {
    return await db.select().from(items).where(eq(items.userId, userId));
  }

  async getItem(id: number): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id));
    return item;
  }

  async createItem(item: Partial<Item> & { userId: string }): Promise<Item> {
    const [newItem] = await db.insert(items).values(item as any).returning();
    return newItem;
  }

  async updateItem(id: number, updates: Partial<Item>): Promise<Item> {
    const [updated] = await db.update(items).set(updates).where(eq(items.id, id)).returning();
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
    const loot = await this.getLootItem(lootId);
    if (!loot) throw new Error("Item de loot não encontrado");
    if (loot.isPickedUp) throw new Error("Item já foi coletado por outro operativo");

    const stats = await this.getPlayerStats(userId);
    if (stats.status !== PlayerStatus.VIVO) throw new Error("Operativo eliminado não pode coletar itens");

    // Mark as picked up (Destroy Actor equivalent — removes from map)
    const [updatedLoot] = await db.update(lootItems)
      .set({ isPickedUp: true, pickedUpBy: userId, pickedUpAt: new Date() })
      .where(and(eq(lootItems.id, lootId), eq(lootItems.isPickedUp, false)))
      .returning();

    if (!updatedLoot) throw new Error("Conflito: item já coletado");

    // Add to Inventory (Add to Inventory node equivalent)
    const item = await this.createItem({
      userId,
      name: loot.name,
      type: loot.type,
      rarity: loot.rarity,
      stats: loot.stats ?? {},
      durability: "100",
      maxDurability: "100",
    });

    // Heal if curativo
    if (loot.type === "CURATIVO" && loot.stats?.heal) {
      await this.healPlayer(userId, loot.stats.heal);
    }

    return { loot: updatedLoot, item };
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
}

export const storage = new DatabaseStorage();
