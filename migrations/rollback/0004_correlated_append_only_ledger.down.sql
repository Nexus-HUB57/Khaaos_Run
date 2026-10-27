-- =============================================================================
-- Khaaos Run — Rollback da migration 0004_correlated_append_only_ledger (M2)
-- =============================================================================
-- Reverse DDL documentado para rollback de versão/migration em ambiente
-- isolado (gate M2: "restore e rollback são repetíveis com RPO/RTO").
--
-- EFEITOS REVERTIDOS (aplicados por 0004):
--   * triggers append-only e balanceamento do ledger
--   * índices únicos/de correlação do ledger
--   * tabelas economy_ledger_entries e economy_ledger_migration_state
--   * colunas operation_id (economy_idempotency, transactions) e índices
--
-- ⚠️  PERDA DE DADOS INTENCIONAL: este rollback descarta o histórico do ledger.
-- Executar SOMENTE em ambiente isolado/descartável, com backup prévio
-- (scripts/m2_e2e/dr_backup_restore.sh). Nunca em banco de produto sem
-- janela de manutenção aprovada.
-- =============================================================================

-- 1. Desligar triggers de proteção e balanceamento do ledger
DROP TRIGGER IF EXISTS economy_ledger_operation_balanced ON economy_ledger_entries;
DROP TRIGGER IF EXISTS economy_ledger_no_truncate ON economy_ledger_entries;
DROP TRIGGER IF EXISTS economy_ledger_no_row_mutation ON economy_ledger_entries;
DROP FUNCTION IF EXISTS assert_economy_ledger_operation_balanced();
DROP FUNCTION IF EXISTS reject_economy_ledger_mutation();

-- 2. Remover índices de correlação/único do ledger
DROP INDEX IF EXISTS economy_ledger_user_account_time_idx;
DROP INDEX IF EXISTS economy_ledger_user_key_line_unique;
DROP INDEX IF EXISTS economy_ledger_operation_line_unique;

-- 3. Descartar tabelas do ledger (append-only) e estado da migração
DROP TABLE IF EXISTS economy_ledger_entries CASCADE;
DROP TABLE IF EXISTS economy_ledger_migration_state CASCADE;

-- 4. Remover índices e colunas de correlação introduzidos em 0004
DROP INDEX IF EXISTS transactions_operation_id_idx;
ALTER TABLE transactions DROP COLUMN IF EXISTS operation_id;
DROP INDEX IF EXISTS economy_idempotency_operation_id_unique;
ALTER TABLE economy_idempotency ALTER COLUMN operation_id DROP DEFAULT;
ALTER TABLE economy_idempotency DROP COLUMN IF EXISTS operation_id;
