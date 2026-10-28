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
# printf por palavra: não gera linha vazia de espaço residual (bug de contagem).
NON200=$(printf '%s\n' $STATUSES | grep -cv '^200$' || true)
if [ "$NON200" != "0" ]; then fail "alguma requisição ao LB não foi 200 (${NON200} de 12)"; fi
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

echo "== 4. Réplica Redis sincronizada (2 nós reais — topologia do smoke F16) =="
if docker compose ps --status running 2>/dev/null | grep -q redis-replica; then
  ROLE=$(docker compose exec -T redis-replica redis-cli INFO replication 2>/dev/null || true)
  echo "$ROLE" | grep -q "role:slave" || fail "réplica sem role:slave: $ROLE"
  echo "$ROLE" | grep -q "master_link_status:up" || fail "réplica fora de sincronia com o master: $ROLE"
  # Probe de replicação REAL: escrita no master visível na réplica.
  PROBE_KEY="staging:replication-probe:$$"
  docker compose exec -T redis redis-cli SET "$PROBE_KEY" "$$" >/dev/null
  sleep 1
  SEEN=$(docker compose exec -T redis-replica redis-cli GET "$PROBE_KEY" 2>/dev/null || true)
  [ "$SEEN" = "$$" ] || fail "chave escrita no master não apareceu na réplica (probe=$SEEN)"
  echo "✅ réplica role:slave sincronizada — probe master→réplica replicada"
else
  fail "redis-replica não está em execução — topologia F17 (2 nós Redis reais) ausente do staging"
fi

echo ""
echo "✅ Staging verificado: dependências reais, gate de saturação, autoscaler alimentados e Redis HA."
