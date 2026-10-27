#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — M2 DR: rollback de versão/migration em ambiente isolado
# =============================================================================
# Gate M2 (docs/ROADMAP.md): rollback de migration repetível com RPO/RTO.
#
# Fluxo:
#   1. Recria banco descartável khaaos_migration_rollback com dados válidos.
#   2. Aplica migrations 0002 → 0003 → 0004 e verifica objetos do 0004.
#   3. Executa o reverse DDL documentado
#      (migrations/rollback/0004_correlated_append_only_ledger.down.sql).
#   4. Verifica: objetos do 0004 removidos, dados de base (0000..0003)
#      íntegros e consultáveis, saldo preservado.
#   5. Mede RTO do rollback e emite evidência JSON.
# =============================================================================
set -euo pipefail

TS=$(date +%Y%m%d_%H%M%S)
ART_DIR="${M2_ART_DIR:-$(pwd)/artifacts/dr}"
mkdir -p "$ART_DIR"
EVIDENCE="$ART_DIR/evidence-migration-rollback-${TS}.json"

PSQL="$PSQL_BIN/psql"
DB="khaaos_migration_rollback"
SOCK="$M2_PG_SOCK"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

log()  { echo "[dr-migration] $*"; }
fail() { echo "[dr-migration] FAIL: $*" >&2; exit 1; }
q()    { "$PSQL" -h "$SOCK" -U postgres -v ON_ERROR_STOP=1 -d "$1" -c "$2"; }
qf()   { "$PSQL" -h "$SOCK" -U postgres -v ON_ERROR_STOP=1 -d "$1" -f "$2"; }
qt()   { "$PSQL" -h "$SOCK" -U postgres -tAc "$2" -d "$1"; }

log "1/4 preparando banco descartável $DB"
q postgres "DROP DATABASE IF EXISTS $DB"
q postgres "CREATE DATABASE $DB"
qf "$DB" "$REPO_ROOT/scripts/m2_e2e/base_schema.sql"
qf "$DB" "$REPO_ROOT/migrations/0002_economy_idempotency.sql"
qf "$DB" "$REPO_ROOT/migrations/0003_economy_invariants.sql"

q "$DB" "INSERT INTO bank_accounts (user_id, weapons_balance, bonus_balance, fbm_balance) VALUES ('mr-alice', 900, 100, 0), ('mr-bob', 120, 0, 5)"
qf "$DB" "$REPO_ROOT/migrations/0004_correlated_append_only_ledger.sql"

LEDGER_TABLES=$(qt "$DB" "SELECT count(*) FROM pg_tables WHERE tablename IN ('economy_ledger_entries','economy_ledger_migration_state')")
TRIGGERS=$(qt "$DB" "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'economy_ledger_entries'::regclass AND NOT tgisinternal")
[ "$LEDGER_TABLES" = "2" ] && [ "$TRIGGERS" -ge 2 ] || fail "estado pré-rollback inesperado (tables=$LEDGER_TABLES triggers=$TRIGGERS)"
log "   0004 aplicado: tables=$LEDGER_TABLES triggers append-only=$TRIGGERS"

log "2/4 executando reverse DDL documentado (0004.down.sql)"
ROLLBACK_START_MS=$(date +%s%3N)
qf "$DB" "$REPO_ROOT/migrations/rollback/0004_correlated_append_only_ledger.down.sql"
ROLLBACK_END_MS=$(date +%s%3N)
RTO_MS=$((ROLLBACK_END_MS - ROLLBACK_START_MS))

log "3/4 verificando estado pós-rollback"
LEDGER_LEFT=$(qt "$DB" "SELECT count(*) FROM pg_tables WHERE tablename IN ('economy_ledger_entries','economy_ledger_migration_state')")
COL_LEFT=$(qt "$DB" "SELECT count(*) FROM information_schema.columns WHERE table_name = 'economy_idempotency' AND column_name = 'operation_id'")
BALANCES=$(qt "$DB" "SELECT string_agg(user_id || ':' || weapons_balance::text, ', ' ORDER BY user_id) FROM bank_accounts")
CONSTRAINTS=$(qt "$DB" "SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conname IN ('bank_weapons_nonnegative','loans_is_paid_present')")
q "$DB" "INSERT INTO bank_accounts (user_id, weapons_balance) VALUES ('mr-carol', 50)"
INSERT_OK=$(qt "$DB" "SELECT count(*) FROM bank_accounts WHERE user_id = 'mr-carol'")

[ "$LEDGER_LEFT" = "0" ] || fail "tabelas do ledger sobreviveram ao rollback"
[ "$COL_LEFT" = "0" ] || fail "coluna operation_id sobreviveu ao rollback"
[ "$BALANCES" = "mr-alice:900, mr-bob:120" ] || fail "dados de base divergem pós-rollback: $BALANCES"
[ "$CONSTRAINTS" -ge 1 ] || fail "constraints de 0003 perdidas"
[ "$INSERT_OK" = "1" ] || fail "base não aceita escritas pós-rollback"
log "   ✓ objetos do 0004 removidos; dados 0002/0003 íntegros ($BALANCES); escritas OK"
log "4/4 evidência"

cat > "$EVIDENCE" <<EOF
{
  "timestamp": "$TS",
  "gate": "M2 rollback de versão/migration",
  "environment": "ephemeral embedded PostgreSQL 16 (disposable database $DB)",
  "forward_migrations": ["0002_economy_idempotency", "0003_economy_invariants", "0004_correlated_append_only_ledger"],
  "rollback_script": "migrations/rollback/0004_correlated_append_only_ledger.down.sql",
  "verification": {
    "ledger_objects_removed": true,
    "operation_id_columns_removed": true,
    "base_data_intact": "$BALANCES",
    "invariants_from_0003_still_present": $CONSTRAINTS,
    "writes_accepted_after_rollback": true
  },
  "rto_ms": $RTO_MS,
  "rpo": {
    "definition": "dados descartados pelo rollback = histórico do ledger append-only (0004)",
    "expected_loss": "economy_ledger_entries + economy_ledger_migration_state",
    "mitigation": "backup prévio obrigatório via scripts/m2_e2e/dr_backup_restore.sh"
  }
}
EOF

log "EVIDÊNCIA OK: $EVIDENCE (RTO rollback = ${RTO_MS} ms)"
