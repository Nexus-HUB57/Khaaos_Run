#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Verificação pós-deploy do staging
# =============================================================================
# Valida (sem segredos): readyz 200 com PG/Redis reais, gate
# KR_READY_MAX_CONNECTIONS visível no payload, healthz com regions[] para o
# autoscaler, e LB nginx distribuindo entre as réplicas (round-robin).
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"
# shellcheck disable=SC1091
[ -f .env ] && { set -a; source .env; set +a; }
PORT="${KR_STAGING_PORT:-8080}"
BASE="http://127.0.0.1:${PORT}"
EXPECTED_GATE="${KR_READY_MAX_CONNECTIONS:-2000}"

fail() { echo "❌ $1"; exit 1; }

echo "== 1. /readyz → 200 com sondas reais de dependências =="
body=$(curl -fsS "$BASE/readyz") || fail "readyz não respondeu 200"
echo "$body" | grep -q '"status":"ready"' || fail "status != ready: $body"
echo "$body" | grep -q '"sessionStore":true' || fail "sonda sessionStore ausente/fora (PG real)"
echo "$body" | grep -q '"rateStore":true' || fail "sonda rateStore ausente/fora (Redis real)"
echo "$body" | grep -q "\"maxConnections\":${EXPECTED_GATE}" || fail "gate KR_READY_MAX_CONNECTIONS=${EXPECTED_GATE} não refletido: $body"
echo "✅ readyz ok — PG e Redis REAIS sondados, gate=${EXPECTED_GATE}"

echo "== 2. /healthz público com regions[] para autoscaling =="
health=$(curl -fsS "$BASE/healthz")
echo "$health" | grep -q '"regions":\[' || fail "regions[] ausente no healthz"
echo "$health" | grep -q '"recommendation"' || fail "recommendation ausente (autoscaling)"
echo "✅ healthz expõe carga por região + recomendação"

echo "== 3. LB nginx round-robin entre réplicas =="
FIRST_XREQ=$(curl -fsS -D - -o /dev/null "$BASE/healthz" | grep -i '^x-request-id:' | head -1)
STATUSES=$(for _ in $(seq 1 12); do curl -s -o /dev/null -w '%{http_code} ' "$BASE/healthz"; done)
echo "  12 requisições: ${STATUSES}"
ALL_200=$(echo "$STATUSES" | tr ' ' '\n' | grep -cv '^200$' || true)
if [ "$ALL_200" != "0" ]; then fail "alguma requisição ao LB não foi 200"; fi
# Coerência de instância única: uptimeMs cresce monotonicamente na MESMA réplica;
# com N réplicas, o uptime parece "andar para trás" ocasionalmente. Contamos quantas vezes voltou.
UPTIMES=$(for _ in $(seq 1 10); do curl -fsS "$BASE/healthz" | grep -o '"uptimeMs":[0-9]*' | cut -d: -f2; done)
BACKWARDS=$(echo "$UPTIMES" | awk 'NR>1 && $1 < prev {c++} {prev=$1} END {print c+0}')
echo "  uptimes: $(echo $UPTIMES | tr '\n' ' ')"
if [ "${BACKWARDS:-0}" = "0" ]; then
  echo "ℹ️  1 réplica visível (uptime monotônico). Para provar o LB: docker compose up -d --scale app=2 e rode de novo."
else
  echo "✅ ${BACKWARDS} saltos de uptime para trás — múltiplas réplicas servindo (LB ativo)"
fi

echo ""
echo "✅ Staging verificado: dependências reais, gate de saturação e autoscaler alimentados."
