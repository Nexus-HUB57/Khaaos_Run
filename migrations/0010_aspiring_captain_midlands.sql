CREATE TABLE "player_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"material_id" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "player_materials_quantity_nonnegative" CHECK ("player_materials"."quantity" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "player_materials_owner_material_uq" ON "player_materials" USING btree ("user_id","material_id");
--> statement-breakpoint
CREATE INDEX "player_materials_owner_idx" ON "player_materials" USING btree ("user_id","material_id");
--> statement-breakpoint
ALTER TABLE economy_ledger_entries DROP CONSTRAINT IF EXISTS economy_ledger_account_valid;
--> statement-breakpoint
ALTER TABLE economy_ledger_entries ADD CONSTRAINT economy_ledger_account_valid CHECK (account_code IN (
  'wallet.weapons', 'wallet.bonus', 'wallet.fbm', 'external.deposit',
  'system.loan_receivable', 'system.loan_interest_income',
  'system.item_sales', 'system.item_repairs', 'system.armorer_fees', 'system.salary_expense',
  'system.2pc_escrow', 'equity.opening_balance', 'treasury.match_rewards', 'payout.in_transit'
));
