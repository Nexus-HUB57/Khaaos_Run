#!/usr/bin/env bash
# Khaaos Run — F16 cross-node smoke em MODO STAGING EXTERNO (SMOKE_EXTERNAL=1).
#
# Diferença do run-f16-smoke-local.sh: o smoke roda com SMOKE_EXTERNAL=1 —
# espera a infra de staging (PostgreSQL + Redis master + RÉPLICA) já em pé,
# valida a replicação REAL (role:slave + probe master→réplica) e delega aos
# nós de aplicação os portões SMOKE_NODE_A_PORT/SMOKE_NODE_B_PORT. Este
# wrapper sobe TODA a stack numa única invocação (o sandbox derruba
# processos em background entre chamadas) e derruba tudo ao sair.
set -uo pipefail

INFRA=/home/z/my-project/runtime-infra
REDIS_CLI=$INFRA/redis-7.4.1/src/redis-cli
PGBIN=$INFRA/pg/node_modules/@embedded-postgres/linux-x64/native/bin
REPO=/home/z/my-project/Khaaos_Run
LOGDIR=/tmp/f16-smoke-external
rm -rf "$LOGDIR" && mkdir -p "$LOGDIR"
NODE_A_PID=""
NODE_B_PID=""

cleanup() {
  [ -n "$NODE_A_PID" ] && kill -9 "$NODE_A_PID" 2>/dev/null
  [ -n "$NODE_B_PID" ] && kill -9 "$NODE_B_PID" 2>/dev/null
  "$REDIS_CLI" -p 56379 shutdown nosave 2>/dev/null
  "$REDIS_CLI" -p 56380 shutdown nosave 2>/dev/null
}
trap cleanup EXIT

# ── 1. Redis master + réplica (2 nós reais) ─────────────────────────────────
"$INFRA/redis-7.4.1/src/redis-server" --port 56379 --save '' --appendonly no \
  --maxmemory 256mb --maxmemory-policy noeviction >"$LOGDIR/redis-master.log" 2>&1 &
"$INFRA/redis-7.4.1/src/redis-server" --port 56380 --replicaof 127.0.0.1 56379 \
  --save '' --appendonly no --maxmemory 256mb >"$LOGDIR/redis-replica.log" 2>&1 &
for _ in $(seq 1 30); do
  role=$("$REDIS_CLI" -p 56380 INFO replication 2>/dev/null | grep -c "master_link_status:up" || true)
  [ "$("$REDIS_CLI" -p 56379 ping 2>/dev/null)" = "PONG" ] && [ "$role" = "1" ] && break
  sleep 0.5
done
"$REDIS_CLI" -p 56379 ping 2>/dev/null | grep -q PONG || { echo "SMOKE_SETUP_FAIL: master redis"; exit 1; }
"$REDIS_CLI" -p 56380 INFO replication 2>/dev/null | grep -q "master_link_status:up" || { echo "SMOKE_SETUP_FAIL: réplica fora de sincronia"; exit 1; }
echo "[wrap-ext] Redis master 56379 + réplica 56380 sincronizadas"

# ── 2. PostgreSQL (pgdata persistido; migrações já aplicadas) ────────────────
pg_ready() {
  node -e "const n=require('net');const s=n.connect(55432,'127.0.0.1');s.on('connect',()=>{process.exit(0)});s.on('error',()=>{process.exit(1)});setTimeout(()=>process.exit(1),1000)" 2>/dev/null
}
if ! pg_ready; then
  rm -f "$INFRA/pgdata/postmaster.pid"
  "$PGBIN/pg_ctl" -D "$INFRA/pgdata" -l "$LOGDIR/pg.log" \
    -o "-p 55432 -c fsync=off -c synchronous_commit=off -c full_page_writes=off" start >/dev/null 2>&1
fi
for _ in $(seq 1 30); do pg_ready && break; sleep 0.5; done
pg_ready || { echo "SMOKE_SETUP_FAIL: postgres"; exit 1; }
echo "[wrap-ext] PostgreSQL 55432 pronto"

# ── 3. Dois nós de aplicação de produção (dist/index.cjs) ────────────────────
nodeEnv() { # nodeId port
  echo "NODE_ENV=production PORT=$2 NODE_ID=$1 NODE_PUBLIC_URL=http://127.0.0.1:$2 \
REDIS_URL=redis://127.0.0.1:56379 REDIS_NAMESPACE=khaaos_f16 \
DATABASE_URL=postgres://postgres:staging_pg_pw@127.0.0.1:55432/khaaos_runtime_f16 \
WS_TOKEN_SECRET=f16-cross-node-smoke-secret-0123456789abcdef \
SESSION_SECRET_CURRENT=f16-cross-node-smoke-session-secret-0123456789 \
REPL_ID=khaaos-f16-smoke ALLOWED_WS_ORIGINS=http://127.0.0.1"
}
cd "$REPO"
env $(nodeEnv staging-node-a 8910) node dist/index.cjs >"$LOGDIR/node-a.log" 2>&1 &
NODE_A_PID=$!
env $(nodeEnv staging-node-b 8911) node dist/index.cjs >"$LOGDIR/node-b.log" 2>&1 &
NODE_B_PID=$!
sleep 8

# ── 4. Smoke EXTERNO (réplica validada; morte de nó pulada — staging gerenciado)
SMOKE_EXTERNAL=1 \
SMOKE_NODE_A_PORT=8910 SMOKE_NODE_B_PORT=8911 \
SMOKE_REPLICA_URL=redis://127.0.0.1:56380 SMOKE_EXPECTED_NODES="staging-node-a,staging-node-b" \
node scripts/smoke-fase16-cross-node.mjs 2>&1 | tee "$LOGDIR/smoke.log"
code=${PIPESTATUS[0]}
exit "$code"
