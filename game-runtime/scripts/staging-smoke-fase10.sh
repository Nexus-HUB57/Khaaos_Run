#!/usr/bin/env bash
# Khaaos Run — Staging smoke end to end (Fase 10).
# Sobe o servidor autoritativo em perfil de staging e valida as novidades da
# Fase 10 sobre o ciclo POJ real:
#   1. /profile (patente por KRC + progresso) — 401 sem token, 200 autenticado;
#   2. /poj/register SEM patente explícita → patente derivada da progressão KRC;
#   3. ciclo POJ comprimido (alistamento → contagem 24 h → guerra | Barburhen);
#   4. plano de Oficiais visível em /poj/state (officerPlan do 7º/9º artigo);
#   5. ponte partida→POJ (reportMatchResult) validada in-process por
#      scripts/smoke-fase10-3d.mjs (executado ao final deste script).
set -uo pipefail

PORT="${STAGING_PORT:-8801}"
LOG="/tmp/kr-staging-f10-$$-.log"

KR_USERS_JSON=$(node -e "
import('./server/auth.js').then(({ hashPassword }) => {
  const users = ['kr_player','kr_player2'].map((u) => ({ id: u, username: u, role: 'player', region: 'sa-east', passwordHash: hashPassword('kr123') }));
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

echo "[staging-f10] boot servidor em :$PORT (POJ comprimido, cota 2)"
KR_READY_MAX_CONNECTIONS=500 \
KR_DEV_AUTH=1 \
KR_POJ_DAY_SECONDS=240 \
KR_POJ_ENLISTMENT_TOTAL=2 \
KR_POJ_CIGKV_TRIGGER=1 \
PORT="$PORT" \
node server/server.js >"$LOG" 2>&1 &
SERVER_PID=$!

ready=""
for _ in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/readyz" || true)
  if [ "$code" = "200" ]; then ready=1; break; fi
  sleep 0.5
done
[ -n "$ready" ] || { echo "STAGING_FAIL: readyz não abriu"; tail -5 "$LOG"; exit 1; }
echo "[staging-f10] /readyz 200 OK"

# ---------- 1. /profile sem token → 401 ----------
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/profile")
[ "$code" = "401" ] || { echo "STAGING_FAIL: /profile sem token = $code (esperado 401)"; exit 1; }
echo "[staging-f10] /profile sem token → 401 OK"

# ---------- 2. login + /profile autenticado ----------
TOK_A=$(curl -s -X POST -H 'content-type: application/json' -d '{"username":"kr_player","password":"kr123"}' "http://127.0.0.1:$PORT/auth/login" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch{console.log('')}})")
[ -n "$TOK_A" ] || { echo "STAGING_FAIL: login kr_player"; exit 1; }
profile=$(curl -s -H "authorization: Bearer $TOK_A" "http://127.0.0.1:$PORT/profile")
echo "[staging-f10] /profile → ${profile:0:160}"
case "$profile" in
  *'"patente":"Recruta"'*) echo "[staging-f10] /profile patente Recruta (saldo 0 KRC) OK" ;;
  *) echo "STAGING_FAIL: /profile inesperado"; exit 1 ;;
esac

# ---------- 3. registro POJ SEM patente → derivada do perfil (KRC 0 → Recruta) ----------
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "authorization: Bearer $TOK_A" -H 'content-type: application/json' -d '{}' "http://127.0.0.1:$PORT/poj/register")
[ "$code" = "200" ] || { echo "STAGING_FAIL: poj/register $code"; exit 1; }
TOK_B=$(curl -s -X POST -H 'content-type: application/json' -d '{"username":"kr_player2","password":"kr123"}' "http://127.0.0.1:$PORT/auth/login" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch{console.log('')}})")
curl -s -o /dev/null -X POST -H "authorization: Bearer $TOK_B" -H 'content-type: application/json' -d '{}' "http://127.0.0.1:$PORT/poj/register"
patente=$(curl -s "http://127.0.0.1:$PORT/poj/state" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);console.log(s.players.map(p=>p.patente).join(','))})")
echo "[staging-f10] patentes alistadas → $patente"
[ "$patente" = "Recruta,Recruta" ] || { echo "STAGING_FAIL: patentes não derivadas do perfil ($patente)"; exit 1; }
echo "[staging-f10] /poj/register com patente automática OK"

# ---------- 4. ciclo POJ comprimido até a guerra ----------
phase=$(curl -s "http://127.0.0.1:$PORT/poj/state" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).phase)})")
[ "$phase" = "contagem_regressiva" ] || { echo "STAGING_FAIL: fase após alistamento = $phase"; exit 1; }
curl -s -X POST -H 'x-admin-token: change-me' -H 'content-type: application/json' -d '{"seconds":86400}' "http://127.0.0.1:$PORT/poj/advance" >/dev/null
phase=$(curl -s "http://127.0.0.1:$PORT/poj/state" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);console.log(s.phase+'|'+s.world)})")
echo "[staging-f10] POJ pós-advance → $phase"
[ "$phase" = "guerra|Barburhen" ] || { echo "STAGING_FAIL: guerra não iniciou ($phase)"; exit 1; }
echo "[staging-f10] POJ guerra OK (Barburhen)"

# ---------- 5. officerPlan visível no estado ----------
officer=$(curl -s "http://127.0.0.1:$PORT/poj/state" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);console.log(JSON.stringify(s.officerPlan))})")
echo "[staging-f10] officerPlan → $officer"
case "$officer" in *'"allowed":false'*) echo "[staging-f10] officerPlan (fora do 7º dia) OK" ;; *) echo "STAGING_FAIL: officerPlan inesperado"; exit 1 ;; esac

# ---------- 6. ponte partida→POJ in-process (room3d → reportMatchResult) ----------
echo "[staging-f10] ponte partida→POJ (in-process)..."
node scripts/smoke-fase10-3d.mjs || { echo "STAGING_FAIL: smoke-fase10-3d"; exit 1; }

echo "STAGING_OK"
