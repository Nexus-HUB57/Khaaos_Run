-- União canônica dos account codes do ledger (resolução do conflito de merge).
--
-- Histórico: a 0006_economy-2pc-escrow (escrow do 2PC de economia) e a
-- 0007_match_payout_2pc (payouts de partida) redefinem a MESMA check
-- constraint economy_ledger_account_valid com whitelists DIFERENTES:
--   0006 inclui system.2pc_escrow, mas perde treasury.match_rewards/payout.in_transit
--   0007 inclui treasury/payout, mas perde system.2pc_escrow
-- A ordem de aplicação decidia o vencedor: bootstrap de testes (ordem
-- alfabética de arquivo) deixava o ledger SEM system.2pc_escrow (quebrando o
-- escrow 2PC no CI), e o drizzle (ordem do journal idx) deixava SEM os codes
-- de payout (quebraria o match payout em produção).
--
-- Esta migração aplica a ÚLTIMA em ambos os runners (0008 > 0007 > 0006 no
-- filename e idx 8 no journal) com a UNIÃO dos dois conjuntos — estado final
-- determinístico em qualquer ambiente (fresh CI, staging, produção).
--
-- Balanço double-entry permanece garantido pelo trigger
-- economy_ledger_operation_balanced (0004) — esta migração não o afeta.

ALTER TABLE economy_ledger_entries DROP CONSTRAINT IF EXISTS economy_ledger_account_valid;
--> statement-breakpoint

ALTER TABLE economy_ledger_entries ADD CONSTRAINT economy_ledger_account_valid CHECK (account_code IN (
  -- wallets dos jogadores
  'wallet.weapons', 'wallet.bonus', 'wallet.fbm',
  -- ingressos de dinheiro externo
  'external.deposit',
  -- empréstimos (Bankhaoos)
  'system.loan_receivable', 'system.loan_interest_income',
  -- Forja do Armeiro / economia in-game
  'system.item_sales', 'system.item_repairs', 'system.salary_expense',
  -- escrow do Two-Phase Commit de economia (UE5 KhaaosEconomyBridge2PC)
  'system.2pc_escrow',
  -- contabilidade inicial
  'equity.opening_balance',
  -- payouts de fim de partida (Fase 16)
  'treasury.match_rewards', 'payout.in_transit'
));
