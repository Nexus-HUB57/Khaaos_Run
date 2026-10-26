#!/usr/bin/env bash
# Khaaos Run — Staging smoke end to end (Fase 9).
# Sobe o servidor autoritativo em perfil de staging (gate de saturação ativo),
# valida sondas (/readyz, /healthz, /poj/state, admin.html), executa o ciclo
# POJ via REST e encerra. Depois, as suítes smoke rodam separadamente
# (smoke-live, smoke-private, smoke-fase8, smoke-fase9).
set -uo pipefail

PORT="${STAGING_PORT:-8800}"
LOG="/tmp/kr-staging-$$.log"

# usuários de staging (hash no formato do AuthService) — 3 alistados reais
KR_USERS_JSON=$(node -e "
import('./server/auth.js').then(({ hashPassword }) => {
  const users = ['kr_player','kr_player2','kr_player3'].map((u) => ({ id: u, username: u, role: 'player', region: 'sa-east', passwordHash: hashPassword('kr123') }));
  console.log(JSON.stringify(users));
});
" 2>/dev/null)
[ -n "$KR_USERS_JSON" ] || { echo "STAGING_FAIL: KR_USERS_JSON não gerado"; exit 1; }
export KR_USERS_JSON

cleanup() {
  if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
  rm -f "$LOG"
}
trap cleanup EXIT

echo "[staging] boot servidor em :$PORT (KR_READY_MAX_CONNECTIONS=500, POJ comprimido cota 3)"
KR_READY_MAX_CONNECTIONS=500 \
KR_DEV_AUTH=1 \
KR_POJ_DAY_SECONDS=240 \
KR_POJ_ENLISTMENT_TOTAL=3 \
KR_POJ_CIGKV_TRIGGER=2 \
PORT="$PORT" \
node server/server.js >"$LOG" 2>&1 &
SERVER_PID=$!

# espera o readyz abrir (até 20 s)
ready=""
for _ in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/readyz" || true)
  if [ "$code" = "200" ]; then ready=1; break; fi
  sleep 0.5
done
if [ -z "$ready" ]; then
  echo "STAGING_FAIL: readyz não abriu"; tail -5 "$LOG"; exit 1
fi
echo "[staging] /readyz 200 OK"

health=$(curl -s "http://127.0.0.1:$PORT/healthz" | head -c 200)
echo "[staging] /healthz → ${health:0:120}"
case "$health" in *'"ok"'*|*'"status"'*) echo "[staging] healthz OK" ;; *) echo "STAGING_FAIL: healthz inesperado"; exit 1 ;; esac

poj=$(curl -s "http://127.0.0.1:$PORT/poj/state")
echo "[staging] /poj/state → ${poj:0:140}"
case "$poj" in *'"phase":"alistamento"'*) echo "[staging] POJ alistamento OK" ;; *) echo "STAGING_FAIL: POJ fase inesperada"; exit 1 ;; esac

admin=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/admin.html")
echo "[staging] /admin.html → $admin"
[ "$admin" = "200" ] || { echo "STAGING_FAIL: admin.html $admin"; exit 1; }

# ciclo POJ comprimido: 3 alistados → contagem → guerra (advance 24h)
for u in kr_player kr_player2 kr_player3; do
  tok=$(curl -s -X POST -H 'content-type: application/json' -d "{\"username\":\"$u\",\"password\":\"kr123\"}" "http://127.0.0.1:$PORT/auth/login" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch{console.log('')}})")
  [ -n "$tok" ] || { echo "STAGING_FAIL: login $u"; exit 1; }
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "authorization: Bearer $tok" -H 'content-type: application/json' -d '{}' "http://127.0.0.1:$PORT/poj/register")
  echo "[staging] POJ register $u → $code"
done
phase=$(curl -s "http://127.0.0.1:$PORT/poj/state" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).phase)})")
[ "$phase" = "contagem_regressiva" ] || { echo "STAGING_FAIL: fase após alistamento = $phase"; exit 1; }
echo "[staging] POJ contagem_regressiva OK"

curl -s -X POST -H 'x-admin-token: change-me' -H 'content-type: application/json' -d '{"seconds":86400}' "http://127.0.0.1:$PORT/poj/advance" >/dev/null
phase=$(curl -s "http://127.0.0.1:$PORT/poj/state" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);console.log(s.phase+'|'+s.world)})")
echo "[staging] POJ pós-advance → $phase"
[ "$phase" = "guerra|Barburhen" ] || { echo "STAGING_FAIL: guerra não iniciou ($phase)"; exit 1; }
echo "[staging] POJ guerra OK (Barburhen)"

echo "STAGING_OK"
