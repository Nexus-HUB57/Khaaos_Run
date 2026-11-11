import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Local credentials are separate from the public/OIDC user row so secret
// hashes and verification state can never leak through the existing user API.
export const localAuthCredentials = pgTable("local_auth_credentials", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  emailNormalized: varchar("email_normalized").notNull().unique(),
  passwordHash: varchar("password_hash").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const localAuthTokens = pgTable("local_auth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  purpose: varchar("purpose", { length: 32 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("local_auth_tokens_user_purpose_idx").on(table.userId, table.purpose, table.createdAt),
  check("local_auth_tokens_purpose_check", sql`${table.purpose} in ('verify_email', 'password_reset')`),
]);

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
