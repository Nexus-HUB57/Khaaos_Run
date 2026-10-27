#!/usr/bin/env bash
# Khaaos Run — F16 cross-node smoke (sandbox self-hosted).
# O sandbox derruba processos em background entre chamadas: esta fiação sobe
# TODA a stack (Redis master + réplica, PostgreSQL, 2 nós de app de produção)
# e roda o smoke dentro de UMA invocação.
set -uo pipefail

INFRA=/home/z/my-project/runtime-infra
REDIS_CLI=$INFRA/redis-7.4.1/src/redis-cli
PGBIN=$INFRA/pg/node_modules/@embedded-postgres/linux-x64/native/bin
REPO=/home/z/my-project/Khaaos_Run
LOGDIR=/tmp/f16-smoke
rm -rf "$LOGDIR" && mkdir -p "$LOGDIR"

cleanup() {
  [ -n "${SMOKE_PID:-}" ] && kill "$SMOKE_PID" 2>/dev/null
  "$REDIS_CLI" -p 56379 shutdown nosave 2>/dev/null
  "$REDIS_CLI" -p 56380 shutdown nosave 2>/dev/null
  "$PGBIN/pg_ctl" -D "$INFRA/pgdata" stop -m fast 2>/dev/null
}
trap cleanup EXIT

# ── 1. Redis master + réplica (2 nós reais) ─────────────────────────────────
"$INFRA/redis-7.4.1/src/redis-server" --port 56379 --save '' --appendonly no \
  --maxmemory 256mb --maxmemory-policy noeviction >"$LOGDIR/redis-master.log" 2>&1 &
"$INFRA/redis-7.4.1/src/redis-server" --port 56380 --replicaof 127.0.0.1 56379 \
  --save '' --appendonly no --maxmemory 256mb >"$LOGDIR/redis-replica.log" 2>&1 &
for _ in $(seq 1 30); do
  role=$("$REDIS_CLI" -p 56380 INFO replication 2>/dev/null | grep -c "master_link_status:up" || true)
  ping=$("$REDIS_CLI" -p 56379 ping 2>/dev/null || true)
  [ "$ping" = "PONG" ] && [ "$role" = "1" ] && break
  sleep 0.5
done
[ "$("$REDIS_CLI" -p 56379 ping 2>/dev/null)" = "PONG" ] || { echo "SMOKE_SETUP_FAIL: master redis"; tail -5 "$LOGDIR/redis-master.log"; exit 1; }
"$REDIS_CLI" -p 56380 INFO replication 2>/dev/null | grep -q "master_link_status:up" || { echo "SMOKE_SETUP_FAIL: réplica fora de sincronia"; tail -5 "$LOGDIR/redis-replica.log"; exit 1; }
echo "[wrap] Redis master 56379 + réplica 56380 sincronizadas"

# ── 2. PostgreSQL (pgdata persistido; migrações já aplicadas) ────────────────
pg_ready() {
  node -e "const n=require('net');const s=n.connect(55432,'127.0.0.1');s.on('connect',()=>{process.exit(0)});s.on('error',()=>{process.exit(1)});setTimeout(()=>process.exit(1),1000)" 2>/dev/null
}
if ! pg_ready; then
  rm -f "$INFRA/pgdata/postmaster.pid"   # lock órfão: postmaster foi derrubado
  "$PGBIN/pg_ctl" -D "$INFRA/pgdata" -l "$LOGDIR/pg.log" \
    -o "-p 55432 -c fsync=off -c synchronous_commit=off -c full_page_writes=off" start >/dev/null 2>&1
fi
for _ in $(seq 1 30); do
  pg_ready && break
  sleep 0.5
done
pg_ready || { echo "SMOKE_SETUP_FAIL: postgres"; tail -10 "$LOGDIR/pg.log" 2>/dev/null; exit 1; }
echo "[wrap] PostgreSQL 55432 pronto"

# ── 3. Smoke cross-node (boots os 2 nós de app a partir de dist/) ────────────
cd "$REPO"
SMOKE_DEBUG=${SMOKE_DEBUG:-0} node scripts/smoke-fase16-cross-node.mjs 2>&1 | tee "$LOGDIR/smoke.log"
code=${PIPESTATUS[0]}
exit "$code"
