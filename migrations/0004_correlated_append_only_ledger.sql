-- Priority 0.3: introduce correlated double-entry records without rewriting the
-- legacy event history. Apply after 0002_economy_idempotency.sql and
-- 0003_economy_invariants.sql.

ALTER TABLE economy_idempotency
  ADD COLUMN IF NOT EXISTS operation_id UUID;
--> statement-breakpoint

UPDATE economy_idempotency SET operation_id = gen_random_uuid() WHERE operation_id IS NULL;
--> statement-breakpoint

ALTER TABLE economy_idempotency ALTER COLUMN operation_id SET DEFAULT gen_random_uuid();
--> statement-breakpoint

ALTER TABLE economy_idempotency ALTER COLUMN operation_id SET NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS economy_idempotency_operation_id_unique
  ON economy_idempotency (operation_id);
--> statement-breakpoint


ALTER TABLE transactions ADD COLUMN IF NOT EXISTS operation_id UUID;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS transactions_operation_id_idx ON transactions (operation_id);
--> statement-breakpoint


CREATE TABLE IF NOT EXISTS economy_ledger_entries (
  id BIGSERIAL PRIMARY KEY,
  operation_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  account_code TEXT NOT NULL,
  side TEXT NOT NULL,
  amount_krc NUMERIC NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT economy_ledger_line_number_positive CHECK (line_number > 0),
  CONSTRAINT economy_ledger_side_valid CHECK (side IN ('DEBIT', 'CREDIT')),
  CONSTRAINT economy_ledger_amount_positive CHECK (amount_krc > 0),
  CONSTRAINT economy_ledger_account_valid CHECK (account_code IN (
    'wallet.weapons', 'wallet.bonus', 'wallet.fbm',
    'external.deposit', 'system.loan_receivable', 'system.loan_interest_income',
    'system.item_sales', 'system.item_repairs', 'system.salary_expense',
    'equity.opening_balance'
  ))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS economy_ledger_operation_line_unique
  ON economy_ledger_entries (operation_id, line_number);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS economy_ledger_user_key_line_unique
  ON economy_ledger_entries (user_id, idempotency_key, line_number);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS economy_ledger_user_account_time_idx
  ON economy_ledger_entries (user_id, account_code, created_at, id);
--> statement-breakpoint


CREATE TABLE IF NOT EXISTS economy_ledger_migration_state (
  migration_key TEXT PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);
--> statement-breakpoint


-- Snapshot old wallet balances exactly once per wallet account. The contra entry
-- is an opening-balance equity line. Historical `transactions` remain untouched.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM economy_ledger_migration_state
    WHERE migration_key = '0003_initial_wallet_snapshot_v1'
  ) THEN
    WITH account_balances AS (
      SELECT user_id, 'wallet.weapons'::TEXT AS account_code, weapons_balance AS balance FROM bank_accounts
      UNION ALL
      SELECT user_id, 'wallet.bonus'::TEXT, bonus_balance FROM bank_accounts
      UNION ALL
      SELECT user_id, 'wallet.fbm'::TEXT, fbm_balance FROM bank_accounts
    ), opening_operations AS MATERIALIZED (
      SELECT b.user_id, b.account_code, b.balance,
        'legacy-opening:v1:' || b.account_code AS idempotency_key,
        gen_random_uuid() AS operation_id
      FROM account_balances b
      WHERE b.balance > 0
        AND NOT EXISTS (
          SELECT 1 FROM economy_ledger_entries e
          WHERE e.user_id = b.user_id
            AND e.idempotency_key = 'legacy-opening:v1:' || b.account_code
        )
    ), opening_lines AS (
      SELECT operation_id, idempotency_key, user_id, 1 AS line_number,
        account_code, 'CREDIT'::TEXT AS side, balance AS amount_krc,
        'Opening balance snapshot'::TEXT AS description
      FROM opening_operations
      UNION ALL
      SELECT operation_id, idempotency_key, user_id, 2,
        'equity.opening_balance', 'DEBIT', balance,
        'Opening balance counterpart'
      FROM opening_operations
    )
    INSERT INTO economy_ledger_entries (
      operation_id, idempotency_key, user_id, line_number,
      account_code, side, amount_krc, description
    )
    SELECT operation_id, idempotency_key, user_id, line_number,
      account_code, side, amount_krc, description
    FROM opening_lines
    ON CONFLICT DO NOTHING;

    INSERT INTO economy_ledger_migration_state (migration_key)
    VALUES ('0003_initial_wallet_snapshot_v1')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
--> statement-breakpoint


CREATE OR REPLACE FUNCTION reject_economy_ledger_mutation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'economy_ledger_entries is append-only; use a compensating operation'
    USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint


DO $$ BEGIN
  CREATE TRIGGER economy_ledger_no_row_mutation
    BEFORE UPDATE OR DELETE ON economy_ledger_entries
    FOR EACH ROW EXECUTE FUNCTION reject_economy_ledger_mutation();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


DO $$ BEGIN
  CREATE TRIGGER economy_ledger_no_truncate
    BEFORE TRUNCATE ON economy_ledger_entries
    FOR EACH STATEMENT EXECUTE FUNCTION reject_economy_ledger_mutation();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint


CREATE OR REPLACE FUNCTION assert_economy_ledger_operation_balanced() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  debit_total NUMERIC;
  credit_total NUMERIC;
BEGIN
  SELECT
    COALESCE(SUM(amount_krc) FILTER (WHERE side = 'DEBIT'), 0),
    COALESCE(SUM(amount_krc) FILTER (WHERE side = 'CREDIT'), 0)
  INTO debit_total, credit_total
  FROM economy_ledger_entries
  WHERE operation_id = NEW.operation_id;

  IF debit_total <= 0 OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'economy ledger operation % is not balanced (debits %, credits %)',
      NEW.operation_id, debit_total, credit_total
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint


DO $$ BEGIN
  CREATE CONSTRAINT TRIGGER economy_ledger_operation_balanced
    AFTER INSERT ON economy_ledger_entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION assert_economy_ledger_operation_balanced();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
