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

// === SAFE ZONE (ZONA SEGURA) PHASE CONFIG ===
// Translates: Unreal Blueprint BP_SafeZone Timeline + Set Timer by Event
export const ZONE_PHASES = [
  { phase: 1, radiusPct: 75, waitSeconds: 30, shrinkSeconds: 15, damagePerTick: 5 },
  { phase: 2, radiusPct: 55, waitSeconds: 25, shrinkSeconds: 12, damagePerTick: 10 },
  { phase: 3, radiusPct: 35, waitSeconds: 20, shrinkSeconds: 10, damagePerTick: 18 },
  { phase: 4, radiusPct: 18, waitSeconds: 15, shrinkSeconds: 8, damagePerTick: 28 },
  { phase: 5, radiusPct: 5, waitSeconds: 10, shrinkSeconds: 6, damagePerTick: 45 },
] as const;

export type ZonePhaseConfig = typeof ZONE_PHASES[number];

// === TABLE DEFINITIONS ===

export const playerStats = pgTable("player_stats", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
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
  type: text("type").notNull(),
  amountKrc: numeric("amount_krc").notNull(),
  amountUsd: numeric("amount_usd"),
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
  type: text("type").notNull(),
  rarity: text("rarity").notNull().default(Rarity.COMUM),
  durability: numeric("durability").notNull().default("100"),
  maxDurability: numeric("max_durability").notNull().default("100"),
  isEquipped: boolean("is_equipped").default(false),
  stats: jsonb("stats").$type<Record<string, number>>(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === ZONE SESSION (BP_SafeZone equivalent) ===
// Tracks the current active Safe Zone circle state
export const zoneSessions = pgTable("zone_sessions", {
  id: serial("id").primaryKey(),
  isActive: boolean("is_active").notNull().default(false),
  currentPhase: integer("current_phase").notNull().default(1),
  phaseStartedAt: timestamp("phase_started_at").notNull().defaultNow(),
  isShrinking: boolean("is_shrinking").notNull().default(false),
  centerX: integer("center_x").notNull().default(50),
  centerY: integer("center_y").notNull().default(50),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ZoneSession = typeof zoneSessions.$inferSelect;

// === RELATIONS ===
export const playerStatsRelations = relations(playerStats, ({ one }) => ({
  user: one(users, { fields: [playerStats.userId], references: [users.id] }),
}));

export const bankAccountsRelations = relations(bankAccounts, ({ one }) => ({
  user: one(users, { fields: [bankAccounts.userId], references: [users.id] }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
}));

export const loansRelations = relations(loans, ({ one }) => ({
  user: one(users, { fields: [loans.userId], references: [users.id] }),
}));

export const itemsRelations = relations(items, ({ one }) => ({
  user: one(users, { fields: [items.userId], references: [users.id] }),
}));

// === BASE SCHEMAS ===
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, timestamp: true });
export const insertLoanSchema = createInsertSchema(loans).omit({ id: true, createdAt: true, isPaid: true });
export const insertItemSchema = createInsertSchema(items).omit({ id: true, createdAt: true });

// === EXPLICIT API CONTRACT TYPES ===

export type BankAccount = typeof bankAccounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Loan = typeof loans.$inferSelect;

export interface DepositRequest { amountUsd: number; }
export interface TransferRequest { amountKrc: number; destination: "fbm" | "weapons" | "bonus"; }
export interface LoanRequest { amountKrc: number; days: number; }

export type Item = typeof items.$inferSelect;
export interface CreateItemRequest { name: string; type: keyof typeof ItemType; rarity?: keyof typeof Rarity; }

export type PlayerStats = typeof playerStats.$inferSelect;
export type Rank = keyof typeof PatenteKR;

// Zone status computed response
export interface ZoneStatus {
  isActive: boolean;
  sessionId: number | null;
  currentPhase: number;
  totalPhases: number;
  isShrinking: boolean;
  currentRadiusPct: number;
  targetRadiusPct: number;
  prevRadiusPct: number;
  waitTimeRemaining: number;
  shrinkTimeRemaining: number;
  shrinkProgress: number;
  damagePerTick: number;
  centerX: number;
  centerY: number;
}
