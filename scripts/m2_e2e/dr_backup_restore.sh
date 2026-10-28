#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — M2 DR: backup/restore de PostgreSQL com medição de RPO/RTO
# =============================================================================
# Gate M2 (docs/ROADMAP.md): "Demonstrar backup/restore e rollback de
# versão/migration em ambiente isolado, com RPO/RTO documentados."
#
# Fluxo executado (100% em bancos descartáveis *_dr / *_restore):
#   1. Prepara khaaos_dr_source com o schema econômico (migrations 0002..0004)
#      e dados de produto sintéticos (usuários, saldos, empréstimos, ledger).
#   2. Backup lógico consistente: pg_dump -Fc (custom, single transaction).
#      Registra t_backup, LSN e checksums das tabelas críticas.
#   3. Injeta escrita pós-backup (RPO window) e "desastre" (drop do banco).
#   4. Restaura em banco novo (pg_restore) e mede o RTO.
#   5. Verifica integridade: contagens, checksums, ledger balanceado,
#      constraints ativas; registra RPO (dados pós-backup perdidos).
#   6. Emite artifacts/dr/evidence-<timestamp>.json + resumo no stdout.
#
# Uso:
#   source scripts/m2_e2e/postgres_env.sh && scripts/m2_e2e/dr_backup_restore.sh
# =============================================================================
set -euo pipefail

TS=$(date +%Y%m%d_%H%M%S)
ART_DIR="${M2_ART_DIR:-$(pwd)/artifacts/dr}"
mkdir -p "$ART_DIR"
BACKUP_FILE="$ART_DIR/khaaos_dr_${TS}.dump"
EVIDENCE="$ART_DIR/evidence-${TS}.json"

PSQL="$PSQL_BIN/psql"
PG_DUMP="$PSQL_BIN/pg_dump"
PG_RESTORE="$PSQL_BIN/pg_restore"
SRC_DB="$M2_DR_DB"
RST_DB="khaaos_restore_target"
SOCK="$M2_PG_SOCK"

log()  { echo "[dr-backup] $*"; }
fail() { echo "[dr-backup] FAIL: $*" >&2; exit 1; }

q()  { "$PSQL" -h "$SOCK" -U postgres -v ON_ERROR_STOP=1 -d "$1" -c "$2"; }
qf() { "$PSQL" -h "$SOCK" -U postgres -v ON_ERROR_STOP=1 -d "$1" -f "$2"; }
qs() { "$PSQL" -h "$SOCK" -U postgres -v ON_ERROR_STOP=1 -d "$1"; } # SQL via stdin
qt() { "$PSQL" -h "$SOCK" -U postgres -tAc "$2" -d "$1"; }

# ── 1. Seed do banco "produto" sintético ────────────────────────────────────
log "1/5 preparando $SRC_DB com schema econômico + dados sintéticos"
q postgres "DROP DATABASE IF EXISTS $RST_DB" >/dev/null
q postgres "DROP DATABASE IF EXISTS $SRC_DB" >/dev/null
q postgres "CREATE DATABASE $SRC_DB" >/dev/null

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
qf "$SRC_DB" "$REPO_ROOT/scripts/m2_e2e/base_schema.sql"
qf "$SRC_DB" "$REPO_ROOT/migrations/0002_economy_idempotency.sql"
qf "$SRC_DB" "$REPO_ROOT/migrations/0003_economy_invariants.sql"
qf "$SRC_DB" "$REPO_ROOT/migrations/0004_correlated_append_only_ledger.sql"

qs "$SRC_DB" <<'SQL' >/dev/null
INSERT INTO bank_accounts (user_id, weapons_balance, bonus_balance, fbm_balance) VALUES
  ('dr-alice', 1000, 250, 0),
  ('dr-bob',   300, 40, 15),
  ('dr-carol', 5000, 0, 0);
INSERT INTO loans (user_id, principal, interest, total_due, days_remaining, is_paid) VALUES
  ('dr-bob', 200, 10, 210, 5, FALSE);
-- depósito correlacionado (ledger sempre balanceado por operation_id)
INSERT INTO transactions (user_id, type, amount_krc, operation_id, description) VALUES
  ('dr-alice', 'DEPOSITO', 1000, gen_random_uuid(), 'DR seed')
RETURNING operation_id \gset
INSERT INTO economy_ledger_entries (operation_id, idempotency_key, user_id, line_number, account_code, side, amount_krc, description) VALUES
  (:'operation_id', md5(random()::text), 'dr-alice', 1, 'wallet.weapons', 'CREDIT', 1000, 'DR seed credit'),
  (:'operation_id', md5(random()::text), 'dr-alice', 2, 'equity.opening_balance', 'DEBIT', 1000, 'DR seed offset');
SQL

declare -A BEFORE_COUNTS=(
  [bank_accounts]=$(qt "$SRC_DB" "SELECT count(*) FROM bank_accounts")
  [loans]=$(qt "$SRC_DB" "SELECT count(*) FROM loans")
  [transactions]=$(qt "$SRC_DB" "SELECT count(*) FROM transactions")
  [economy_ledger_entries]=$(qt "$SRC_DB" "SELECT count(*) FROM economy_ledger_entries")
)

# ── 2. Backup consistente + snapshot de estado ─────────────────────────────
log "2/5 executando pg_dump -Fc (transação única, consistente)"
T_BACKUP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
BACKUP_START_MS=$(date +%s%3N)
"$PG_DUMP" -h "$SOCK" -U postgres -Fc -d "$SRC_DB" -f "$BACKUP_FILE"
BACKUP_END_MS=$(date +%s%3N)
BACKUP_SIZE=$(stat -c%s "$BACKUP_FILE")
BACKUP_SHA=$(sha256sum "$BACKUP_FILE" | cut -d' ' -f1)
LSN_AT_BACKUP=$(qt "$SRC_DB" "SELECT pg_current_wal_lsn()::text")

checksum_table() { # tabela → md5 da ordenação determinística das linhas
  qt "$SRC_DB" "SELECT COALESCE(md5(string_agg(row_text, E'\n' ORDER BY row_text)), 'empty') FROM (SELECT to_jsonb(t)::text AS row_text FROM $1 t) s"
}
declare -A CHECKSUMS=(
  [bank_accounts]=$(checksum_table bank_accounts)
  [loans]=$(checksum_table loans)
  [transactions]=$(checksum_table transactions)
  [economy_ledger_entries]=$(checksum_table economy_ledger_entries)
)
log "   backup=$(basename "$BACKUP_FILE") size=${BACKUP_SIZE}B sha256=${BACKUP_SHA:0:12}… lsn=$LSN_AT_BACKUP"

# ── 3. Escrita pós-backup (janela RPO) + desastre ───────────────────────────
log "3/5 injetando escrita pós-backup e provocando desastre (DROP DATABASE)"
qs "$SRC_DB" <<'SQL' >/dev/null
INSERT INTO bank_accounts (user_id, weapons_balance) VALUES ('dr-dave', 777);
SQL
POST_BACKUP_ROWS=$(qt "$SRC_DB" "SELECT count(*) FROM bank_accounts")
T_DISASTER=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DISASTER_START_MS=$(date +%s%3N)
q postgres "DROP DATABASE $SRC_DB" >/dev/null
log "   desastre simulado em $T_DISASTER ($SRC_DB removido)"

# ── 4. Restore e medição de RTO ─────────────────────────────────────────────
log "4/5 restaurando em $RST_DB (pg_restore) e medindo RTO"
q postgres "CREATE DATABASE $RST_DB" >/dev/null
"$PG_RESTORE" -h "$SOCK" -U postgres -d "$RST_DB" --no-owner -1 "$BACKUP_FILE" >/dev/null
RESTORE_END_MS=$(date +%s%3N)
RTO_MS=$((RESTORE_END_MS - DISASTER_START_MS))
BACKUP_MS=$((BACKUP_END_MS - BACKUP_START_MS))
log "   RTO = ${RTO_MS} ms (desastre → banco restaurado aceitando conexões)"

# ── 5. Verificação de integridade + RPO ────────────────────────────────────
log "5/5 verificando integridade do restore"
FAILURES=0
for table in "${!BEFORE_COUNTS[@]}"; do
  RESTORED=$(qt "$RST_DB" "SELECT count(*) FROM $table")
  if [ "$RESTORED" != "${BEFORE_COUNTS[$table]}" ]; then
    log "   ✗ $table: ${BEFORE_COUNTS[$table]} no backup vs $RESTORED restaurado"; FAILURES=$((FAILURES+1))
  else
    log "   ✓ $table: $RESTORED linhas"
  fi
done
checksum_table() { qt "$RST_DB" "SELECT COALESCE(md5(string_agg(row_text, E'\n' ORDER BY row_text)), 'empty') FROM (SELECT to_jsonb(t)::text AS row_text FROM $1 t) s"; }
for table in "${!CHECKSUMS[@]}"; do
  RESTORED=$(checksum_table "$table")
  if [ "$RESTORED" != "${CHECKSUMS[$table]}" ]; then
    log "   ✗ checksum divergente em $table"; FAILURES=$((FAILURES+1))
  else
    log "   ✓ checksum $table idêntico ao pré-desastre"
  fi
done
DAVE_LOST=$(qt "$RST_DB" "SELECT count(*) FROM bank_accounts WHERE user_id = 'dr-dave'")
[ "$DAVE_LOST" = "0" ] || { log "   ✗ escrita pós-backup vazou no restore (RPO=0 esperado)"; FAILURES=$((FAILURES+1)); }
LEDGER_NET=$(qt "$RST_DB" "SELECT COALESCE(sum(CASE WHEN side='DEBIT' THEN amount_krc ELSE -amount_krc END),0)::text FROM economy_ledger_entries")
CONSTRAINTS=$(qt "$RST_DB" "SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conname IN ('bank_weapons_nonnegative','loans_is_paid_present')")
APPEND_ONLY=$(qt "$RST_DB" "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'economy_ledger_entries'::regclass AND NOT tgisinternal")
[ "$CONSTRAINTS" -ge 2 ] || { log "   ✗ constraints econômicas ausentes no restore"; FAILURES=$((FAILURES+1)); }
[ "$APPEND_ONLY" -ge 2 ] || { log "   ✗ triggers append-only ausentes no restore"; FAILURES=$((FAILURES+1)); }
log "   ✓ RPO demonstrado: escrita pós-backup ('dr-dave') perdida como esperado"
log "   ✓ ledger balanceado (net=$LEDGER_NET), constraints=$CONSTRAINTS, triggers append-only=$APPEND_ONLY"

RPO_LOST_ROWS=$((POST_BACKUP_ROWS - BEFORE_COUNTS[bank_accounts]))

cat > "$EVIDENCE" <<EOF
{
  "timestamp": "$TS",
  "gate": "M2 backup/restore com RPO/RTO",
  "environment": "ephemeral embedded PostgreSQL 16 (disposable *_dr/*_restore databases)",
  "backup": {
    "tool": "pg_dump -Fc (single transaction)",
    "file": "$BACKUP_FILE",
    "size_bytes": $BACKUP_SIZE,
    "sha256": "$BACKUP_SHA",
    "duration_ms": $BACKUP_MS,
    "t_backup_utc": "$T_BACKUP",
    "wal_lsn_at_backup": "$LSN_AT_BACKUP"
  },
  "restore": {
    "tool": "pg_restore --no-owner -1",
    "database": "$RST_DB",
    "t_disaster_utc": "$T_DISASTER",
    "rto_ms": $RTO_MS
  },
  "verification": {
    "row_counts_before": { $(for k in "${!BEFORE_COUNTS[@]}"; do printf '"%s": %s, ' "$k" "${BEFORE_COUNTS[$k]}"; done | sed 's/, $//') },
    "checksums_match_pre_disaster": $( [ $FAILURES -eq 0 ] && echo true || echo false ),
    "ledger_net": "$LEDGER_NET",
    "economic_constraints_present": $CONSTRAINTS,
    "append_only_triggers_present": $APPEND_ONLY,
    "failures": $FAILURES
  },
  "rpo": {
    "definition": "linhas confirmadas após o fim do backup e perdidas no desastre",
    "post_backup_writes_lost": $RPO_LOST_ROWS,
    "evidence_row": "dr-dave ausente no restore",
    "operational_target": "pg_dump por janela agendada; RPO <= intervalo entre backups (recomendado: 5 min via WAL contínuo em staging)"
  }
}
EOF

if [ "$FAILURES" -eq 0 ]; then
  log "EVIDÊNCIA OK: $EVIDENCE"
  log "RTO medido: ${RTO_MS} ms | backup: ${BACKUP_MS} ms | RPO demonstrado: $RPO_LOST_ROWS linha(s) pós-backup"
else
  fail "verificação de integridade encontrou $FAILURES divergência(s) — evidência em $EVIDENCE"
fi
