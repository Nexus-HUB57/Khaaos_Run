import { db } from "./db";
import {
  playerStats, bankAccounts, items, loans, transactions, zoneSessions,
  type PlayerStats, type BankAccount, type Item, type Loan, type Transaction, type ZoneSession,
  type DepositRequest, type TransferRequest, type LoanRequest, type CreateItemRequest,
  PatenteKR, KRC_TO_USD, Rarity, ItemType
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";

export interface IStorage {
  // Player
  getPlayerStats(userId: string): Promise<PlayerStats>;
  updatePlayerStats(userId: string, updates: Partial<PlayerStats>): Promise<PlayerStats>;
  
  // Bank
  getBankAccount(userId: string): Promise<BankAccount>;
  updateBankAccount(userId: string, updates: Partial<BankAccount>): Promise<BankAccount>;
  createTransaction(transaction: Partial<Transaction> & { userId: string, type: string, amountKrc: string }): Promise<Transaction>;
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
  
  // Zone Session (BP_SafeZone)
  getActiveZoneSession(): Promise<ZoneSession | undefined>;
  createZoneSession(centerX: number, centerY: number): Promise<ZoneSession>;
  updateZoneSession(id: number, updates: Partial<ZoneSession>): Promise<ZoneSession>;
  stopAllZoneSessions(): Promise<void>;
  applyZoneDamage(userId: string, damage: number): Promise<PlayerStats>;
  healPlayer(userId: string, amount: number): Promise<PlayerStats>;
  
  // Initialization
  initializeUser(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async initializeUser(userId: string) {
    const [stats] = await db.select().from(playerStats).where(eq(playerStats.userId, userId));
    if (!stats) {
      await db.insert(playerStats).values({ userId });
    }
    const [bank] = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
    if (!bank) {
      await db.insert(bankAccounts).values({ userId });
    }
  }

  // Player
  async getPlayerStats(userId: string): Promise<PlayerStats> {
    await this.initializeUser(userId);
    const [stats] = await db.select().from(playerStats).where(eq(playerStats.userId, userId));
    return stats;
  }

  async updatePlayerStats(userId: string, updates: Partial<PlayerStats>): Promise<PlayerStats> {
    const [updated] = await db.update(playerStats)
      .set(updates)
      .where(eq(playerStats.userId, userId))
      .returning();
    return updated;
  }

  // Bank
  async getBankAccount(userId: string): Promise<BankAccount> {
    await this.initializeUser(userId);
    const [bank] = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId));
    return bank;
  }

  async updateBankAccount(userId: string, updates: Partial<BankAccount>): Promise<BankAccount> {
    const [updated] = await db.update(bankAccounts)
      .set(updates)
      .where(eq(bankAccounts.userId, userId))
      .returning();
    return updated;
  }

  async createTransaction(transaction: Partial<Transaction> & { userId: string, type: string, amountKrc: string }): Promise<Transaction> {
    const [newTx] = await db.insert(transactions).values(transaction as any).returning();
    return newTx;
  }

  async getTransactions(userId: string): Promise<Transaction[]> {
    return await db.select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.timestamp))
      .limit(50);
  }

  // Loans
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

  // Items
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

  // === ZONE SESSION (BP_SafeZone) ===

  async getActiveZoneSession(): Promise<ZoneSession | undefined> {
    const [session] = await db.select()
      .from(zoneSessions)
      .where(eq(zoneSessions.isActive, true))
      .orderBy(desc(zoneSessions.createdAt))
      .limit(1);
    return session;
  }

  async createZoneSession(centerX: number, centerY: number): Promise<ZoneSession> {
    // Stop any existing active sessions first
    await this.stopAllZoneSessions();
    const [session] = await db.insert(zoneSessions).values({
      isActive: true,
      currentPhase: 1,
      phaseStartedAt: new Date(),
      isShrinking: false,
      centerX,
      centerY,
    }).returning();
    return session;
  }

  async updateZoneSession(id: number, updates: Partial<ZoneSession>): Promise<ZoneSession> {
    const [updated] = await db.update(zoneSessions)
      .set(updates)
      .where(eq(zoneSessions.id, id))
      .returning();
    return updated;
  }

  async stopAllZoneSessions(): Promise<void> {
    await db.update(zoneSessions).set({ isActive: false }).where(eq(zoneSessions.isActive, true));
  }

  // Apply zone damage to player (equivalent to Apply Damage node in Unreal)
  async applyZoneDamage(userId: string, damage: number): Promise<PlayerStats> {
    const stats = await this.getPlayerStats(userId);
    const newHealth = Math.max(0, stats.health - damage);
    return await this.updatePlayerStats(userId, { health: newHealth });
  }

  // Heal player (for testing / respawn)
  async healPlayer(userId: string, amount: number): Promise<PlayerStats> {
    const stats = await this.getPlayerStats(userId);
    const newHealth = Math.min(stats.maxHealth, stats.health + amount);
    return await this.updatePlayerStats(userId, { health: newHealth });
  }
}

export const storage = new DatabaseStorage();
