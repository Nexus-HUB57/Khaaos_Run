import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb, uniqueIndex, index, check, uuid, bigserial } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
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

export type Rank = keyof typeof PatenteKR;

/** Canonical EP555 command ladder. Keep the same cutoffs in the UE5 config. */
export const EP555_RANKS = [
  { id: "ZHEERS", xpRequired: 0, designation: "Unidade de Infantaria de Base" },
  { id: "ONITH", xpRequired: 15_000, designation: "Operador Tático de Incursão" },
  { id: "SKEETW", xpRequired: 45_000, designation: "SubOficial de Operações" },
  { id: "HURAN", xpRequired: 100_000, designation: "Líder de Esquadrão" },
  { id: "VENEX", xpRequired: 250_000, designation: "Comandante de Regimento" },
  { id: "KHAEL", xpRequired: 500_000, designation: "Estrategista de Divisão" },
  { id: "MALAKOR", xpRequired: 1_000_000, designation: "Alto Comissário de Guerra" },
  { id: "OVERLORD", xpRequired: 5_000_000, designation: "General Supremo do Khaaos" },
] as const satisfies readonly { id: Rank; xpRequired: number; designation: string }[];

export const RANK_XP_THRESHOLDS = Object.fromEntries(
  EP555_RANKS.map(({ id, xpRequired }) => [id, xpRequired]),
) as Record<Rank, number>;

export interface RankProgress {
  rank: Rank;
  currentXp: number;
  currentThreshold: number;
  nextRank: Rank | null;
  nextThreshold: number | null;
  xpToNext: number;
  progressPct: number;
}

export function getRankProgress(xp: number): RankProgress {
  const currentXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let currentIndex = 0;
  for (let index = 1; index < EP555_RANKS.length; index += 1) {
    if (currentXp < EP555_RANKS[index].xpRequired) break;
    currentIndex = index;
  }

  const current = EP555_RANKS[currentIndex];
  const next = EP555_RANKS[currentIndex + 1] ?? null;
  const span = next ? next.xpRequired - current.xpRequired : 0;

  return {
    rank: current.id,
    currentXp,
    currentThreshold: current.xpRequired,
    nextRank: next?.id ?? null,
    nextThreshold: next?.xpRequired ?? null,
    xpToNext: next ? Math.max(0, next.xpRequired - currentXp) : 0,
    progressPct: next
      ? Math.min(100, Math.max(0, ((currentXp - current.xpRequired) / span) * 100))
      : 100,
  };
}

export function rankFromXp(xp: number): Rank {
  return getRankProgress(xp).rank;
}

export const SPECIALIZATION_IDS = [
  "INFANTARIA",
  "FUZILEIROS",
  "RASTREADORES",
  "COMUNICACOES_HACKER",
  "PILOTO_AERONAVES",
  "SNIPER",
  "ENGENHARIA_TATICA",
  "COMANDOS_SELVA",
  "MOTORISTA_PESADOS",
  "PARAQUEDISTAS",
  "ANTI_BOMBAS",
  "MEDICO_COMBATE",
] as const;

export type SpecializationId = typeof SPECIALIZATION_IDS[number];

/** EP555 minimum rank and Morth requirements; Morth currently maps to confirmed PvP kills. */
export const EP555_SPECIALIZATIONS = [
  { id: "INFANTARIA", name: "Infantaria", callsign: "Uuivo", rank: "ZHEERS", morthRequired: 25, focus: "Combate corpo a corpo" },
  { id: "FUZILEIROS", name: "Fuzileiros", callsign: "Avalanche", rank: "ZHEERS", morthRequired: 50, focus: "Operações táticas" },
  { id: "RASTREADORES", name: "Rastreadores", callsign: "Ferro", rank: "ZHEERS", morthRequired: 50, focus: "Exploração e adaptação" },
  { id: "COMUNICACOES_HACKER", name: "Comunicações / Hacker", callsign: "Abismo", rank: "ZHEERS", morthRequired: 75, focus: "IA e espionagem avançada" },
  { id: "PILOTO_AERONAVES", name: "Piloto de Aeronaves", callsign: "Asa", rank: "ONITH", morthRequired: 100, focus: "Ataques aéreos" },
  { id: "SNIPER", name: "Sniper de Elite", callsign: "Mira", rank: "SKEETW", morthRequired: 150, focus: "Precisão de longo alcance" },
  { id: "ENGENHARIA_TATICA", name: "Engenharia Tática", callsign: "Névoa", rank: "HURAN", morthRequired: 200, focus: "Ações estratégicas" },
  { id: "COMANDOS_SELVA", name: "Comandos Selva", callsign: "ComNoes", rank: "VENEX", morthRequired: 250, focus: "Perímetros e emboscadas" },
  { id: "MOTORISTA_PESADOS", name: "Motorista de Pesados", callsign: "Couraça", rank: "VENEX", morthRequired: 300, focus: "Blindados e logística" },
  { id: "PARAQUEDISTAS", name: "Paraquedistas", callsign: "Raio", rank: "KHAEL", morthRequired: 500, focus: "Ação secreta e infiltração" },
  { id: "ANTI_BOMBAS", name: "Anti-Bombas", callsign: "Nulo", rank: "MALAKOR", morthRequired: 750, focus: "Explosivos e demolição" },
  { id: "MEDICO_COMBATE", name: "Médico de Combate", callsign: "Égide", rank: "OVERLORD", morthRequired: 1_000, focus: "Salvamento e suporte" },
] as const satisfies readonly {
  id: SpecializationId;
  name: string;
  callsign: string;
  rank: Rank;
  morthRequired: number;
  focus: string;
}[];

export function canUnlockSpecialization(
  specialization: typeof EP555_SPECIALIZATIONS[number],
  xp: number,
  morth: number,
): boolean {
  const currentRankIndex = EP555_RANKS.findIndex(({ id }) => id === rankFromXp(xp));
  const requiredRankIndex = EP555_RANKS.findIndex(({ id }) => id === specialization.rank);
  return currentRankIndex >= requiredRankIndex && morth >= specialization.morthRequired;
}

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
  specializationId: text("specialization_id"),
  // Persistent competitive ranking
  rating: integer("rating").notNull().default(1000), // ELO-like
  matchesPlayed: integer("matches_played").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  top5: integer("top5").notNull().default(0),
  seasonKills: integer("season_kills").notNull().default(0),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  weaponsBalance: numeric("weapons_balance").notNull().default("0"),
  bonusBalance: numeric("bonus_balance").notNull().default("0"),
  fbmBalance: numeric("fbm_balance").notNull().default("0"),
}, (table) => ({
  weaponsNonnegative: check("bank_weapons_nonnegative", sql`${table.weaponsBalance} >= 0`),
  bonusNonnegative: check("bank_bonus_nonnegative", sql`${table.bonusBalance} >= 0`),
  fbmNonnegative: check("bank_fbm_nonnegative", sql`${table.fbmBalance} >= 0`),
}));

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  amountKrc: numeric("amount_krc").notNull(),
  amountUsd: numeric("amount_usd"),
  description: text("description"),
  operationId: uuid("operation_id"),
  timestamp: timestamp("timestamp").defaultNow(),
}, (table) => ({
  amountKrcNonnegative: check("transactions_amount_krc_nonnegative", sql`${table.amountKrc} >= 0`),
  amountUsdNonnegative: check("transactions_amount_usd_nonnegative", sql`${table.amountUsd} IS NULL OR ${table.amountUsd} >= 0`),
}));

export const economyIdempotency = pgTable("economy_idempotency", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  responseStatus: integer("response_status"),
  responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
  operationId: uuid("operation_id").notNull().defaultRandom(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userKeyUnique: uniqueIndex("economy_idempotency_user_key_unique").on(table.userId, table.idempotencyKey),
  operationIdUnique: uniqueIndex("economy_idempotency_operation_id_unique").on(table.operationId),
  createdAtIndex: index("economy_idempotency_created_at_idx").on(table.createdAt),
  idempotencyKeyFormat: check("economy_idem_key_format", sql`${table.idempotencyKey} ~ '^[A-Za-z0-9._~-]{16,128}$'`),
  requestHashSha256: check("economy_idem_hash_sha256", sql`length(${table.requestHash}) = 64`),
  responseStatusValid: check("economy_idem_response_status_valid", sql`${table.responseStatus} IS NULL OR ${table.responseStatus} BETWEEN 100 AND 599`),
}));

export const economyLedgerEntries = pgTable("economy_ledger_entries", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  operationId: uuid("operation_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  userId: text("user_id").notNull(),
  lineNumber: integer("line_number").notNull(),
  accountCode: text("account_code").notNull(),
  side: text("side").notNull(),
  amountKrc: numeric("amount_krc").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  operationLineUnique: uniqueIndex("economy_ledger_operation_line_unique").on(table.operationId, table.lineNumber),
  userKeyLineUnique: uniqueIndex("economy_ledger_user_key_line_unique").on(table.userId, table.idempotencyKey, table.lineNumber),
  userAccountTime: index("economy_ledger_user_account_time_idx").on(table.userId, table.accountCode, table.createdAt, table.id),
  idempotencyKeyFormat: check("economy_ledger_key_format", sql`${table.idempotencyKey} ~ '^[A-Za-z0-9._~-]{16,128}$'`),
  positiveLineNumber: check("economy_ledger_line_number_positive", sql`${table.lineNumber} > 0`),
  validSide: check("economy_ledger_side_valid", sql`${table.side} IN ('DEBIT', 'CREDIT')`),
  positiveAmount: check("economy_ledger_amount_positive", sql`${table.amountKrc} > 0`),
  validAccount: check("economy_ledger_account_valid", sql`${table.accountCode} IN ('wallet.weapons', 'wallet.bonus', 'wallet.fbm', 'external.deposit', 'system.loan_receivable', 'system.loan_interest_income', 'system.item_sales', 'system.item_repairs', 'system.salary_expense', 'equity.opening_balance')`),
}));

export const loans = pgTable("loans", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  principal: numeric("principal").notNull(),
  interest: numeric("interest").notNull(),
  totalDue: numeric("total_due").notNull(),
  daysRemaining: integer("days_remaining").notNull(),
  isPaid: boolean("is_paid").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  principalNonnegative: check("loans_principal_nonnegative", sql`${table.principal} >= 0`),
  interestNonnegative: check("loans_interest_nonnegative", sql`${table.interest} >= 0`),
  totalDueNonnegative: check("loans_total_due_nonnegative", sql`${table.totalDue} >= 0`),
  daysRemainingNonnegative: check("loans_days_remaining_nonnegative", sql`${table.daysRemaining} >= 0`),
  isPaidPresent: check("loans_is_paid_present", sql`${table.isPaid} IS NOT NULL`),
}));

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
}, (table) => ({
  durabilityNonnegative: check("items_durability_nonnegative", sql`${table.durability} >= 0`),
  maxDurabilityNonnegative: check("items_max_durability_nonnegative", sql`${table.maxDurability} >= 0`),
  durabilityWithinMaximum: check("items_durability_within_maximum", sql`${table.durability} <= ${table.maxDurability}`),
}));

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

// Match results for ranking history / leaderboard
export const matchResults = pgTable("match_results", {
  id: serial("id").primaryKey(),
  roomId: text("room_id").notNull(),
  userId: text("user_id").notNull(),
  placement: integer("placement").notNull(), // 1 = winner
  kills: integer("kills").notNull().default(0),
  damageDealt: integer("damage_dealt").notNull().default(0),
  survivedMs: integer("survived_ms").notNull().default(0),
  ratingBefore: integer("rating_before").notNull(),
  ratingAfter: integer("rating_after").notNull(),
  xpGained: integer("xp_gained").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
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
export type EconomyIdempotency = typeof economyIdempotency.$inferSelect;
export type Loan = typeof loans.$inferSelect;
export type Item = typeof items.$inferSelect;
export type PlayerStats = typeof playerStats.$inferSelect;
export type ZoneSession = typeof zoneSessions.$inferSelect;
export type LootItem = typeof lootItems.$inferSelect;
export type Elimination = typeof eliminations.$inferSelect;
export type MatchResult = typeof matchResults.$inferSelect;
export interface DepositRequest { amountUsd: number | string; }
export interface TransferRequest { amountKrc: number | string; destination: "fbm" | "bonus"; }
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
