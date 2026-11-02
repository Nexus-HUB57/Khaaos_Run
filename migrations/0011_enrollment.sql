-- Sprint 1.1 / T1.1 — Alistamento canônico (console web ↔ repo)
-- ================================================================
-- Registro de alistamento ("enrollment") do operador no campanha:
--   ETAPA 1/3 inscrição  → POST /api/enrollment gera protocolo KR-REG-<base36>
--   ETAPA 2/3 taxa U$1   → liquidação server-authoritative (100 KRC):
--                          ledger DEBIT external.deposit / CREDIT system.item_sales
--   ETAPA 3/3 alistamento→ WELCOME_BONUS 500 KRC creditado SOMENTE APÓS a taxa:
--                          ledger DEBIT equity.opening_balance / CREDIT wallet.bonus
--
-- Idempotência: username único — 2ª chamada retorna alreadyPaid:true sem
-- duplicar ledger (o serviço reutiliza o mesmo idempotencyKey derivado do
-- protocolo; o unique(user_id,idempotency_key,line_number) do ledger barra
-- replay mesmo sob corrida).
--
-- Contrato canônico: README "Desenvolvimento recente — Console Web +
-- Mundos canônicos (2026-11-02)" — taxa U$1 (= 100 KRC) server-authoritative,
-- transações ENROLLMENT_FEE e WELCOME_BONUS persistidas, retomada de sessão
-- via GET /api/enrollment?username=.

CREATE TABLE "enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL UNIQUE,
	"username" varchar(24) NOT NULL UNIQUE,
	"protocol" varchar(32) NOT NULL UNIQUE,
	"status" text DEFAULT 'enlisted' NOT NULL,
	"fee_amount_krc" numeric DEFAULT '100' NOT NULL,
	"bonus_amount_krc" numeric DEFAULT '500' NOT NULL,
	"fee_operation_id" uuid,
	"bonus_operation_id" uuid,
	"enlisted_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "enrollments_status_valid" CHECK ("enrollments"."status" IN ('pending', 'enlisted')),
	CONSTRAINT "enrollments_protocol_format" CHECK ("enrollments"."protocol" ~ '^KR-REG-[A-Z0-9]{10}$'),
	CONSTRAINT "enrollments_fee_positive" CHECK ("enrollments"."fee_amount_krc" > 0),
	CONSTRAINT "enrollments_bonus_nonnegative" CHECK ("enrollments"."bonus_amount_krc" >= 0)
);
--> statement-breakpoint

CREATE INDEX "enrollments_username_idx" ON "enrollments" USING btree ("username");
--> statement-breakpoint

CREATE INDEX "enrollments_enlisted_at_idx" ON "enrollments" USING btree ("enlisted_at");
