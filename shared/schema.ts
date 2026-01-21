import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

// Re-export auth models
export * from "./models/auth";

// === CONSTANTS ===
export const KRC_TO_USD = 100;

export const PatenteKR = {
  ZHEERS: "ZHEERS",
  ONITH: "ONITH",
  SKEETW: "SKEETW",
  HURAN: "HURAN",
  VENEX: "VENEX",
  KHAEL: "KHAEL",
  MALAKOR: "MALAKOR",
  OVERLORD: "OVERLORD",
} as const;

export const Rarity = {
  COMUM: "COMUM",
  RARO: "RARO",
  EPICO: "EPICO",
  LENDARIO: "LENDARIO",
  MITICO: "MITICO",
} as const;

export const ItemType = {
  ARMA: "ARMA",
  DEFESA: "DEFESA",
  CURATIVO: "CURATIVO",
  UTILIDADE: "UTILIDADE",
  RECURSO: "RECURSO",
} as const;

// === TABLE DEFINITIONS ===

// Extend user profile with game stats
export const playerStats = pgTable("player_stats", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(), // Link to auth.users
  rank: text("rank").notNull().default(PatenteKR.ZHEERS),
  xp: integer("xp").notNull().default(0),
  health: integer("health").notNull().default(100),
  maxHealth: integer("max_health").notNull().default(100),
  energy: integer("energy").notNull().default(100),
  maxEnergy: integer("max_energy").notNull().default(100),
  lastSalaryDate: timestamp("last_salary_date"),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  weaponsBalance: numeric("weapons_balance").notNull().default("0"),
  bonusBalance: numeric("bonus_balance").notNull().default("0"),
  fbmBalance: numeric("fbm_balance").notNull().default("0"),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(), // DEPOSITO, SALARIO, FBM_TRANSFER, etc.
  amountKrc: numeric("amount_krc").notNull(),
  amountUsd: numeric("amount_usd"), // Optional
  description: text("description"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  principal: numeric("principal").notNull(),
  interest: numeric("interest").notNull(),
  totalDue: numeric("total_due").notNull(),
  daysRemaining: integer("days_remaining").notNull(),
  isPaid: boolean("is_paid").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // ARMA, DEFESA, etc.
  rarity: text("rarity").notNull().default(Rarity.COMUM),
  durability: numeric("durability").notNull().default("100"),
  maxDurability: numeric("max_durability").notNull().default("100"),
  isEquipped: boolean("is_equipped").default(false),
  stats: jsonb("stats").$type<Record<string, number>>(), // { damage: 10, accuracy: 80 }
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===
export const playerStatsRelations = relations(playerStats, ({ one }) => ({
  user: one(users, {
    fields: [playerStats.userId],
    references: [users.id],
  }),
}));

export const bankAccountsRelations = relations(bankAccounts, ({ one }) => ({
  user: one(users, {
    fields: [bankAccounts.userId],
    references: [users.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
}));

export const loansRelations = relations(loans, ({ one }) => ({
  user: one(users, {
    fields: [loans.userId],
    references: [users.id],
  }),
}));

export const itemsRelations = relations(items, ({ one }) => ({
  user: one(users, {
    fields: [items.userId],
    references: [users.id],
  }),
}));

// === BASE SCHEMAS ===
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, timestamp: true });
export const insertLoanSchema = createInsertSchema(loans).omit({ id: true, createdAt: true, isPaid: true });
export const insertItemSchema = createInsertSchema(items).omit({ id: true, createdAt: true });

// === EXPLICIT API CONTRACT TYPES ===

// Bank
export type BankAccount = typeof bankAccounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Loan = typeof loans.$inferSelect;

export interface DepositRequest {
  amountUsd: number;
}

export interface TransferRequest {
  amountKrc: number;
  destination: "fbm" | "weapons" | "bonus";
}

export interface LoanRequest {
  amountKrc: number;
  days: number;
}

// Items
export type Item = typeof items.$inferSelect;
export interface CreateItemRequest {
  name: string;
  type: keyof typeof ItemType;
  rarity?: keyof typeof Rarity;
}

// Player
export type PlayerStats = typeof playerStats.$inferSelect;
export type Rank = keyof typeof PatenteKR;

