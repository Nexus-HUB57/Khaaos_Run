import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export * from "./models/auth";

// === CONSTANTS ===
export const KRC_TO_USD = 100;

export const PatenteKR = {
  ZHEERS: "ZHEERS", ONITH: "ONITH", SKEETW: "SKEETW", HURAN: "HURAN",
  VENEX: "VENEX", KHAEL: "KHAEL", MALAKOR: "MALAKOR", OVERLORD: "OVERLORD",
} as const;

export const Rarity = {
  COMUM: "COMUM", RARO: "RARO", EPICO: "EPICO", LENDARIO: "LENDARIO", MITICO: "MITICO",
} as const;

export const ItemType = {
  ARMA: "ARMA", DEFESA: "DEFESA", CURATIVO: "CURATIVO", UTILIDADE: "UTILIDADE", RECURSO: "RECURSO",
} as const;

// Player status (BP_Character equivalent states)
export const PlayerStatus = {
  VIVO: "VIVO",
  ELIMINADO: "ELIMINADO",
  ESPECTADOR: "ESPECTADOR",
} as const;

export type PlayerStatusType = keyof typeof PlayerStatus;

// === SAFE ZONE PHASES (BP_SafeZone Timeline config) ===
export const ZONE_PHASES = [
  { phase: 1, radiusPct: 75, waitSeconds: 30, shrinkSeconds: 15, damagePerTick: 5 },
  { phase: 2, radiusPct: 55, waitSeconds: 25, shrinkSeconds: 12, damagePerTick: 10 },
  { phase: 3, radiusPct: 35, waitSeconds: 20, shrinkSeconds: 10, damagePerTick: 18 },
  { phase: 4, radiusPct: 18, waitSeconds: 15, shrinkSeconds: 8, damagePerTick: 28 },
  { phase: 5, radiusPct: 5, waitSeconds: 10, shrinkSeconds: 6, damagePerTick: 45 },
] as const;

export type ZonePhaseConfig = typeof ZONE_PHASES[number];

// === LOOT SPAWN PRESETS (ST_ItemData struct equivalent) ===
// Positions are % of map (0-100). Matches BP_LootBase spawn locations.
export const LOOT_PRESETS = [
  { posX: 15, posY: 20, type: "ARMA",     rarity: "RARO",     name: "Fuzil Khaaos-47",         stats: { damage: 35, accuracy: 72, ammo: 30 } },
  { posX: 30, posY: 45, type: "CURATIVO", rarity: "COMUM",    name: "Kit Médico I",             stats: { heal: 25 } },
  { posX: 60, posY: 25, type: "ARMA",     rarity: "EPICO",    name: "Sniper Malakor",           stats: { damage: 80, accuracy: 90, ammo: 5 } },
  { posX: 75, posY: 60, type: "DEFESA",   rarity: "RARO",     name: "Colete Khaaos",           stats: { defense: 40 } },
  { posX: 20, posY: 70, type: "UTILIDADE",rarity: "EPICO",    name: "Granada Zheers",           stats: { damage: 60, radius: 5 } },
  { posX: 50, posY: 50, type: "ARMA",     rarity: "LENDARIO", name: "Espada do Overlord",      stats: { damage: 120, accuracy: 85 } },
  { posX: 85, posY: 35, type: "CURATIVO", rarity: "RARO",     name: "Seringa Venex",           stats: { heal: 50 } },
  { posX: 40, posY: 80, type: "ARMA",     rarity: "COMUM",    name: "Pistola Onith",           stats: { damage: 18, accuracy: 60, ammo: 12 } },
  { posX: 65, posY: 75, type: "DEFESA",   rarity: "EPICO",    name: "Escudo Khael",            stats: { defense: 65 } },
  { posX: 10, posY: 50, type: "UTILIDADE",rarity: "COMUM",    name: "Mochila Tática",          stats: { capacity: 20 } },
  { posX: 90, posY: 15, type: "ARMA",     rarity: "MITICO",   name: "Canhão Khaaos Prime",     stats: { damage: 200, accuracy: 95, ammo: 2 } },
  { posX: 55, posY: 15, type: "CURATIVO", rarity: "COMUM",    name: "Bandagem",                stats: { heal: 10 } },
  { posX: 35, posY: 35, type: "ARMA",     rarity: "COMUM",    name: "Faca Skeetw",             stats: { damage: 12, accuracy: 99 } },
  { posX: 80, posY: 80, type: "DEFESA",   rarity: "LENDARIO", name: "Armadura Huran",          stats: { defense: 90 } },
  { posX: 25, posY: 15, type: "UTILIDADE",rarity: "RARO",     name: "Drone de Reconhecimento", stats: { vision: 80 } },
  { posX: 70, posY: 45, type: "ARMA",     rarity: "RARO",     name: "SMG Huran",               stats: { damage: 22, accuracy: 65, ammo: 25 } },
  { posX: 45, posY: 20, type: "CURATIVO", rarity: "EPICO",    name: "Adrenalina Khael",        stats: { heal: 75, speed: 20 } },
  { posX: 18, posY: 85, type: "DEFESA",   rarity: "COMUM",    name: "Capacete Simples",        stats: { defense: 15 } },
] as const;

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
  // BP_Character death system fields
  status: text("status").notNull().default(PlayerStatus.VIVO),
  kills: integer("kills").notNull().default(0),
  deaths: integer("deaths").notNull().default(0),
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

// BP_SafeZone Actor equivalent
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

// BP_LootBase / ST_ItemData equivalent — items spawned on the map ground
export const lootItems = pgTable("loot_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  rarity: text("rarity").notNull().default(Rarity.COMUM),
  posX: integer("pos_x").notNull(),
  posY: integer("pos_y").notNull(),
  isPickedUp: boolean("is_picked_up").notNull().default(false),
  pickedUpBy: text("picked_up_by"),
  pickedUpAt: timestamp("picked_up_at"),
  stats: jsonb("stats").$type<Record<string, number>>(),
  sessionId: integer("session_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Elimination log (BP_Character death event equivalent)
export const eliminations = pgTable("eliminations", {
  id: serial("id").primaryKey(),
  eliminatedUserId: text("eliminated_user_id").notNull(),
  eliminatedName: text("eliminated_name"),
  eliminatorUserId: text("eliminator_user_id"),
  eliminatorName: text("eliminator_name"),
  cause: text("cause").notNull().default("ZONA"), // ZONA | PVP | QUEDA
  sessionId: integer("session_id"),
  timestamp: timestamp("timestamp").defaultNow(),
});

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

// === TYPES ===
export type BankAccount = typeof bankAccounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Loan = typeof loans.$inferSelect;
export type Item = typeof items.$inferSelect;
export type PlayerStats = typeof playerStats.$inferSelect;
export type ZoneSession = typeof zoneSessions.$inferSelect;
export type LootItem = typeof lootItems.$inferSelect;
export type Elimination = typeof eliminations.$inferSelect;
export type Rank = keyof typeof PatenteKR;

export interface DepositRequest { amountUsd: number; }
export interface TransferRequest { amountKrc: number; destination: "fbm" | "weapons" | "bonus"; }
export interface LoanRequest { amountKrc: number; days: number; }
export interface CreateItemRequest { name: string; type: keyof typeof ItemType; rarity?: keyof typeof Rarity; }

// Zone computed response
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
