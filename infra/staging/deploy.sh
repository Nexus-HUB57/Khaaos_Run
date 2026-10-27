#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Deploy de staging (PG/Redis reais + gate de saturação + LB)
# =============================================================================
# Idempotente: pode rodar repetidamente (recria apenas o que mudou).
# Passos: .env → build → migrações → up → espera /readyz 200 → resumo.
# Uso: bash deploy.sh [--scale N]
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "⚠️  .env ausente — criando a partir de .env.example (AJUSTE OS SEGREDOS)"
  cp .env.example .env
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

SCALE_APP="${2:-}"
if [ "${1:-}" = "--scale" ] && [ -n "$SCALE_APP" ]; then
  echo "→ Escalando app para ${SCALE_APP} réplicas"
  docker compose up -d --build postgres redis redis-replica
  docker compose run --rm migrate
  docker compose up -d --scale "app=${SCALE_APP}" nginx
else
  echo "→ Build + subida da stack completa"
  docker compose build app
  docker compose up -d postgres redis redis-replica
  echo "→ Migrações versionadas (001/002/003)"
  docker compose run --rm migrate
  docker compose up -d app nginx
fi

# F17: espera a réplica Redis sincronizar com o master (topologia 2 nós reais
# que o smoke cross-node valida). Falha aqui = topologia de staging quebrada.
echo "→ Esperando réplica Redis sincronizar (master_link_status:up)..."
for attempt in $(seq 1 30); do
  if docker compose exec -T redis-replica redis-cli INFO replication 2>/dev/null | grep -q master_link_status:up; then
    echo "✅ réplica Redis sincronizada (tentativa ${attempt})"
    break
  fi
  [ "$attempt" = "30" ] && { echo "❌ réplica Redis não sincronizou em 60 s"; docker compose logs --tail=30 redis-replica; exit 1; }
  sleep 2
done

echo "→ Esperando /readyz ficar 200 (sondas reais de PG/Redis)..."
for attempt in $(seq 1 60); do
  code=$(curl -s -o /tmp/readyz.json -w '%{http_code}' "http://127.0.0.1:${KR_STAGING_PORT:-8080}/readyz" || true)
  if [ "$code" = "200" ]; then
    echo "✅ ready 200 (tentativa ${attempt})"
    cat /tmp/readyz.json | head -c 600; echo
    echo ""
    echo "→ Gate de saturação ativo: KR_READY_MAX_CONNECTIONS=${KR_READY_MAX_CONNECTIONS:-2000}"
    echo "→ Autoscaler: node autoscaler.mjs  (dry-run por padrão)"
    exit 0
  fi
  sleep 2
done
echo "❌ /readyz não ficou 200 em 120 s — diagnóstico da stack:"
echo "--- docker compose ps -a ---"
docker compose ps -a || true
echo "--- logs app (tail 80) ---"
docker compose logs --tail=80 app || true
echo "--- logs nginx (tail 30) ---"
docker compose logs --tail=30 nginx || true
echo "--- último readyz capturado ---"
cat /tmp/readyz.json 2>/dev/null || true
exit 1
