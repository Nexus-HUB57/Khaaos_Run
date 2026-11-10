import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { and, eq, ne, sql } from "drizzle-orm";

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
}

export class AuthStorage implements IAuthStorage {
  constructor(private readonly database: typeof db = db) {}

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await this.database.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const userId = userData.id;
    if (!userId) throw new Error("OIDC subject is required");
    const normalizedEmail = userData.email?.normalize("NFKC").trim().toLowerCase() || null;
    return this.database.transaction(async (tx) => {
      if (normalizedEmail) {
        // Use the same transaction advisory lock as local registration so a
        // first-time OIDC upsert cannot race a local account with case variants.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${normalizedEmail}, 0))`);
        const [existing] = await tx.select({ id: users.id }).from(users).where(and(
          sql`lower(btrim(${users.email})) = ${normalizedEmail}`,
          ne(users.id, userId),
        )).limit(1);
        if (existing) throw new Error("Email is already associated with another authentication identity");
      }

      const normalizedUserData = { ...userData, email: normalizedEmail };
      const [user] = await tx
        .insert(users)
        .values(normalizedUserData)
        .onConflictDoUpdate({
          target: users.id,
          set: {
            ...normalizedUserData,
            updatedAt: new Date(),
          },
        })
        .returning();
      return user;
    });
  }
}

export const authStorage = new AuthStorage();
