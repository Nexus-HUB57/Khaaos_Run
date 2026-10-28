CREATE TABLE IF NOT EXISTS "discord_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"discord_id" varchar(32) NOT NULL,
	"discord_username" varchar(64) DEFAULT 'Unknown' NOT NULL,
	"eos_id" varchar(64) NOT NULL,
	"player_name" varchar(64) DEFAULT 'Unknown' NOT NULL,
	"has_beta_role" boolean DEFAULT false NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "economy_2pc_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_transaction_id" text,
	"actor_id" text NOT NULL,
	"player_id" integer,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"amount_krc" numeric NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"item_id" text,
	"destination_account" text DEFAULT 'system.item_sales' NOT NULL,
	"status" text DEFAULT 'PREPARED' NOT NULL,
	"coordinator_node_id" text,
	"prepare_operation_id" uuid,
	"commit_operation_id" uuid,
	"abort_operation_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"committed_at" timestamp,
	"aborted_at" timestamp,
	"abort_reason" text,
	CONSTRAINT "economy_2pc_key_format" CHECK ("economy_2pc_transactions"."idempotency_key" ~ '^[A-Za-z0-9._~-]{16,128}$'),
	CONSTRAINT "economy_2pc_hash_sha256" CHECK (length("economy_2pc_transactions"."request_hash") = 64),
	CONSTRAINT "economy_2pc_status_valid" CHECK ("economy_2pc_transactions"."status" IN ('PREPARED', 'COMMITTED', 'ABORTED')),
	CONSTRAINT "economy_2pc_amount_positive" CHECK ("economy_2pc_transactions"."amount_krc" > 0),
	CONSTRAINT "economy_2pc_destination_valid" CHECK ("economy_2pc_transactions"."destination_account" IN ('system.item_sales', 'system.item_repairs', 'external.deposit'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"price_brl_minor" numeric(12, 0) NOT NULL,
	"krc_minor_units" numeric(20, 0) NOT NULL,
	"currency" text DEFAULT 'brl' NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"stripe_session_id" text,
	"checkout_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	"fulfilled_at" timestamp,
	CONSTRAINT "payment_orders_provider_valid" CHECK ("payment_orders"."provider" = 'stripe'),
	CONSTRAINT "payment_orders_currency_brl" CHECK ("payment_orders"."currency" = 'brl'),
	CONSTRAINT "payment_orders_status_valid" CHECK ("payment_orders"."status" IN ('created', 'pending', 'fulfilled', 'failed', 'expired', 'rejected')),
	CONSTRAINT "payment_orders_price_positive" CHECK ("payment_orders"."price_brl_minor" >= 50),
	CONSTRAINT "payment_orders_krc_positive" CHECK ("payment_orders"."krc_minor_units" > 0),
	CONSTRAINT "payment_orders_request_hash_sha256" CHECK (length("payment_orders"."request_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload_hash" text NOT NULL,
	"order_id" uuid,
	"status" text DEFAULT 'received' NOT NULL,
	"error_code" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	CONSTRAINT "payment_webhook_events_provider_valid" CHECK ("payment_webhook_events"."provider" = 'stripe'),
	CONSTRAINT "payment_webhook_events_status_valid" CHECK ("payment_webhook_events"."status" IN ('received', 'processed', 'ignored', 'rejected')),
	CONSTRAINT "payment_webhook_events_payload_hash_sha256" CHECK (length("payment_webhook_events"."payload_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tournaments" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"state" varchar(32) DEFAULT 'registration' NOT NULL,
	"registered_count" integer DEFAULT 0 NOT NULL,
	"max_participants" integer DEFAULT 64 NOT NULL,
	"current_round" integer DEFAULT 0 NOT NULL,
	"rounds" integer DEFAULT 6 NOT NULL,
	"min_elo" integer DEFAULT 0 NOT NULL,
	"prize_pool" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "economy_ledger_entries" DROP CONSTRAINT IF EXISTS "economy_ledger_account_valid";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_discord_links_discord_id" ON "discord_links" USING btree ("discord_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_discord_links_eos_id" ON "discord_links" USING btree ("eos_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "economy_2pc_actor_key_unique" ON "economy_2pc_transactions" USING btree ("actor_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "economy_2pc_client_tx_unique" ON "economy_2pc_transactions" USING btree ("client_transaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "economy_2pc_status_expires_idx" ON "economy_2pc_transactions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_user_idempotency_unique" ON "payment_orders" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_orders_stripe_session_unique" ON "payment_orders" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_orders_user_created_idx" ON "payment_orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_webhook_events_provider_event_unique" ON "payment_webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_webhook_events_order_idx" ON "payment_webhook_events" USING btree ("order_id","received_at");--> statement-breakpoint
ALTER TABLE "economy_ledger_entries" ADD CONSTRAINT "economy_ledger_account_valid" CHECK ("economy_ledger_entries"."account_code" IN ('wallet.weapons', 'wallet.bonus', 'wallet.fbm', 'external.deposit', 'system.loan_receivable', 'system.loan_interest_income', 'system.item_sales', 'system.item_repairs', 'system.salary_expense', 'system.2pc_escrow', 'equity.opening_balance'));