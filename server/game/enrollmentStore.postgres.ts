/**
 * KHAAOS RUN — Enrollment Store PostgreSQL (Fase 47.1)
 * ====================================================
 * Materializa a interface `EnrollmentStore` do alistamento canônico (#252)
 * sobre PostgreSQL/Drizzle: as sessões sobrevivem a restarts e ganham trilha
 * auditável (migrations/0011_enrollment.sql — enrollment_sessions).
 *
 * Contrato preservado: get(userId) → sessão idêntica à que foi `put` (round-
 * trip JSONB); put é UPSERT (start → insert; steps → update). Único por
 * usuário (PK user_id) e protocolo único (unique) — a retomada de sessão do
 * #252 funciona idêntica com a store trocada.
 *
 * Wiring (server/routes.ts): `ENROLLMENT_STORE=postgres` ativa esta store;
 * o default do #252 (memória do processo) permanece para dev/testes herméticos.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { enrollmentSessions } from "@shared/schema";
import type { EnrollmentSession, EnrollmentStore } from "../routes/enrollment";

function rowToSession(row: typeof enrollmentSessions.$inferSelect): EnrollmentSession {
  return {
    protocol: row.protocol,
    userId: row.userId,
    step: row.step as EnrollmentSession["step"],
    data: (row.data as EnrollmentSession["data"]) ?? null,
    terms: (row.terms as EnrollmentSession["terms"]) ?? null,
    fee: (row.fee as EnrollmentSession["fee"]) ?? null,
    bonusKrcCredited: Number(row.bonusKrcCredited),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createPostgresEnrollmentStore(): EnrollmentStore {
  return {
    async get(userId: string): Promise<EnrollmentSession | undefined> {
      const [row] = await db
        .select()
        .from(enrollmentSessions)
        .where(eq(enrollmentSessions.userId, userId))
        .limit(1);
      return row ? rowToSession(row) : undefined;
    },

    async put(session: EnrollmentSession): Promise<void> {
      const values = {
        userId: session.userId,
        protocol: session.protocol,
        step: session.step,
        data: session.data ?? null,
        terms: session.terms ?? null,
        fee: session.fee ?? null,
        bonusKrcCredited: String(session.bonusKrcCredited ?? 0),
        updatedAt: new Date(),
      };
      await db
        .insert(enrollmentSessions)
        .values({ ...values, createdAt: new Date() })
        .onConflictDoUpdate({
          target: enrollmentSessions.userId,
          set: {
            step: values.step,
            data: values.data,
            terms: values.terms,
            fee: values.fee,
            bonusKrcCredited: values.bonusKrcCredited,
            updatedAt: values.updatedAt,
          },
        });
    },
  };
}
