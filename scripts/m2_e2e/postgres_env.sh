#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — M2 harness: ephemeral PostgreSQL (isolated, disposable)
# Attaches to the keeper-managed pgserver instance (unix socket), creates the
# disposable khaaos_e2e_test database and exports TEST_DATABASE_URL.
# USAGE: source scripts/m2_e2e/postgres_env.sh
# =============================================================================
set -euo pipefail
M2_PG_HOME="${M2_PG_HOME:-/home/z/my-project/scripts/m2_pg}"
M2_PG_SOCK="$M2_PG_HOME/pgdata"
M2_TEST_DB="khaaos_e2e_test"
M2_DR_DB="khaaos_dr_source"        # product-like DB used by the DR demo
PG_BIN_DIR="/home/z/.venv/lib/python3.12/site-packages/pgserver/pginstall/bin"
PSQL_BIN="$(dirname "$PG_BIN_DIR/psql")"

if [ ! -S "$M2_PG_SOCK/.s.PGSQL.5432" ]; then
  echo "[postgres_env] ERROR: keeper server not running at $M2_PG_SOCK" >&2
  echo "[postgres_env] start it with: nohup python3 -c 'import pgserver,time; pgserver.get_server(\"$M2_PG_SOCK\"); [time.sleep(3600) for _ in iter(int,1)]' &" >&2
  exit 1
fi

psql_run() { "$PSQL_BIN/psql" -h "$M2_PG_SOCK" -U postgres -v ON_ERROR_STOP=1 "$@"; }

for DB in "$M2_TEST_DB" "$M2_DR_DB"; do
  EXISTS=$(psql_run -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'")
  if [ "$EXISTS" != "1" ]; then psql_run -d postgres -c "CREATE DATABASE $DB" >/dev/null; fi
done

export TEST_DATABASE_URL="postgresql://postgres@localhost/${M2_TEST_DB}?host=${M2_PG_SOCK}"
export M2_PG_SOCK M2_TEST_DB M2_DR_DB PSQL_BIN
echo "[postgres_env] ready: sock=$M2_PG_SOCK test_db=$M2_TEST_DB dr_db=$M2_DR_DB"
