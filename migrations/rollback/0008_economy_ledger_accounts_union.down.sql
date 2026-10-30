-- Rollback: restaura a whitelist da 0007_match_payout_2pc (sem system.2pc_escrow).
-- ATENÇÃO: reverter para UMA das whitelists parciais requebra o outro subsistema
-- (escrow 2PC ou payouts). Só usar se 0008 for abandonada em favor de um design
-- novo de accounts.
ALTER TABLE economy_ledger_entries DROP CONSTRAINT IF EXISTS economy_ledger_account_valid;
--> statement-breakpoint
ALTER TABLE economy_ledger_entries ADD CONSTRAINT economy_ledger_account_valid CHECK (account_code IN (
  'wallet.weapons', 'wallet.bonus', 'wallet.fbm',
  'external.deposit', 'system.loan_receivable', 'system.loan_interest_income',
  'system.item_sales', 'system.item_repairs', 'system.salary_expense',
  'equity.opening_balance',
  'treasury.match_rewards', 'payout.in_transit'
));
