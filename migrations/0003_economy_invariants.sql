-- Priority 0.2: enforce invariants on new/changed rows while allowing a separate audit
-- and VALIDATE CONSTRAINT rollout for legacy records.
DO $$ BEGIN
  ALTER TABLE bank_accounts ADD CONSTRAINT bank_weapons_nonnegative
    CHECK (weapons_balance >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


DO $$ BEGIN
  ALTER TABLE bank_accounts ADD CONSTRAINT bank_bonus_nonnegative
    CHECK (bonus_balance >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


DO $$ BEGIN
  ALTER TABLE bank_accounts ADD CONSTRAINT bank_fbm_nonnegative
    CHECK (fbm_balance >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


DO $$ BEGIN
  ALTER TABLE transactions ADD CONSTRAINT transactions_amount_krc_nonnegative
    CHECK (amount_krc >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


DO $$ BEGIN
  ALTER TABLE transactions ADD CONSTRAINT transactions_amount_usd_nonnegative
    CHECK (amount_usd IS NULL OR amount_usd >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


DO $$ BEGIN
  ALTER TABLE loans ADD CONSTRAINT loans_principal_nonnegative
    CHECK (principal >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


DO $$ BEGIN
  ALTER TABLE loans ADD CONSTRAINT loans_interest_nonnegative
    CHECK (interest >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


DO $$ BEGIN
  ALTER TABLE loans ADD CONSTRAINT loans_total_due_nonnegative
    CHECK (total_due >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


DO $$ BEGIN
  ALTER TABLE loans ADD CONSTRAINT loans_days_remaining_nonnegative
    CHECK (days_remaining >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


DO $$ BEGIN
  ALTER TABLE loans ADD CONSTRAINT loans_is_paid_present
    CHECK (is_paid IS NOT NULL) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


DO $$ BEGIN
  ALTER TABLE items ADD CONSTRAINT items_durability_nonnegative
    CHECK (durability >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


DO $$ BEGIN
  ALTER TABLE items ADD CONSTRAINT items_max_durability_nonnegative
    CHECK (max_durability >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


DO $$ BEGIN
  ALTER TABLE items ADD CONSTRAINT items_durability_within_maximum
    CHECK (durability <= max_durability) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


DO $$ BEGIN
  ALTER TABLE economy_idempotency ADD CONSTRAINT economy_idem_hash_sha256
    CHECK (length(request_hash) = 64) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


DO $$ BEGIN
  ALTER TABLE economy_idempotency ADD CONSTRAINT economy_idem_response_status_valid
    CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
