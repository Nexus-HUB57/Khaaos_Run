// ==============================================================================
// KHAAOS RUN - Economy 2PC Server
// Drizzle ORM schema para PostgreSQL — transações 2PC de KRC
// ==============================================================================

import { pgTable, uuid, varchar, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";

/** Tabela de transações 2PC */
export const twoPcTransactions = pgTable("two_pc_transactions", {
  transactionId:    uuid("transaction_id").primaryKey().defaultRandom(),
  idempotencyKey:   varchar("idempotency_key", { length: 128 }).notNull().unique(),
  playerId:         integer("player_id").notNull(),
  amountKrc:        integer("amount_krc").notNull(),
  itemId:           varchar("item_id", { length: 64 }),
  description:      varchar("description", { length: 256 }),
  coordinatorNodeId:varchar("coordinator_node_id", { length: 64 }).notNull(),

  phase:      varchar("phase", { length: 16 }).notNull().default("none"),   // none|prepare|commit|abort
  status:     varchar("status", { length: 16 }).notNull().default("idle"),  // idle|preparing|prepared|committing|committed|aborting|aborted|timeout

  expiryTimestamp:  timestamp("expiry_timestamp", { withTimezone: true }),
  abortReason:      varchar("abort_reason", { length: 512 }),

  createdAt:        timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Tabela de saldos KRC por jogador */
export const krcBalances = pgTable("krc_balances", {
  playerId:       integer("player_id").primaryKey(),
  balanceKrc:     integer("balance_krc").notNull().default(0),
  lockedKrc:      integer("locked_krc").notNull().default(0),  // KRC locked em 2PC prepare
  updatedAt:      timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Tabela de ledger (histórico imutável) */
export const krcLedger = pgTable("krc_ledger", {
  id:              uuid("id").primaryKey().defaultRandom(),
  transactionId:   uuid("transaction_id").notNull(),
  playerId:        integer("player_id").notNull(),
  amountKrc:       integer("amount_krc").notNull(),   // negativo = débito
  type:            varchar("type", { length: 16 }).notNull(), // lock|commit|refund
  createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
