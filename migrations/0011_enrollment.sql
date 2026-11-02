-- Sprint 1.1/T1.1 follow-up (Fase 47.1) — Persistência PostgreSQL do alistamento
-- ===============================================================================
-- O PR #252 portou o fluxo E2E do alistamento (3 etapas + taxa U$1 idempotente
-- + bônus 500 KRC) com `EnrollmentStore` PLUGÁVEL — default em memória do
-- processo (perde sessões no restart, sem trilha auditável).
--
-- Esta migration cria a tabela que materializa a interface `EnrollmentStore`
-- (get/put) para a store PostgreSQL: a MESMA shape de sessão do #252,
-- persistida e única por usuário.
--
-- O LEDGER double-entry (economy_ledger_entries) NÃO vive aqui: a taxa do
-- #252 é server-authoritative simulada; a integração financeira real é feita
-- em server/game/enrollmentLedger.ts (mesma escola do 2PC/Stripe), usando as
-- contas canônicas já whitelisted (0010) — nenhuma mudança de constraint aqui.

CREATE TABLE "enrollment_sessions" (
	"user_id" text PRIMARY KEY,
	"protocol" varchar(32) NOT NULL UNIQUE,
	"step" text DEFAULT 'AWAITING_DATA' NOT NULL,
	"data" jsonb,
	"terms" jsonb,
	"fee" jsonb,
	"bonus_krc_credited" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	"updated_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "enrollment_sessions_step_valid" CHECK ("enrollment_sessions"."step" IN ('AWAITING_DATA', 'AWAITING_TERMS', 'AWAITING_FEE', 'COMPLETED')),
	CONSTRAINT "enrollment_sessions_protocol_format" CHECK ("enrollment_sessions"."protocol" ~ '^KR-REG-[0-9A-Z]{8}$'),
	CONSTRAINT "enrollment_sessions_bonus_nonnegative" CHECK ("enrollment_sessions"."bonus_krc_credited" >= 0)
);
--> statement-breakpoint

CREATE INDEX "enrollment_sessions_step_idx" ON "enrollment_sessions" USING btree ("step");
--> statement-breakpoint

CREATE INDEX "enrollment_sessions_protocol_idx" ON "enrollment_sessions" USING btree ("protocol");
