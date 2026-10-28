#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Deploy de staging (PG/Redis reais + gate de saturação + LB)
# =============================================================================
# Idempotente: pode rodar repetidamente (recria apenas o que mudou).
# Passos: .env → build → migrações → up → espera /readyz 200 → resumo.
# Uso: bash deploy.sh [--scale N | --replicas 2]
#   --scale N      escala o serviço `app` (ids de réplica = HOSTNAME, KR_REPLICA_URL
#                  = LB para todas — redirect cross-réplica cai em qualquer nó)
#   --replicas 2   perfil DETERMINÍSTICO (M4): serviços app-a/app-b com ids fixos
#                  (staging-app-a/b) e endereços públicos diretos (8081/8082) —
#                  exigido pelo smoke cross-replica ao vivo
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "⚠️  .env ausente — criando a partir de .env.example (AJUSTE OS SEGREDOS)"
  cp .env.example .env
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

# M4 — o redirect cross-réplica precisa do endereço público da réplica: se o
# .env não define KR_REPLICA_URL, usa o LB do staging (porta KR_STAGING_PORT).
if [ -z "${KR_REPLICA_URL:-}" ]; then
  export KR_REPLICA_URL="http://127.0.0.1:${KR_STAGING_PORT:-8080}"
  echo "→ KR_REPLICA_URL ausente no .env — usando ${KR_REPLICA_URL}"
fi

SCALE_APP=""
REPLICAS_MODE=0
if [ "${1:-}" = "--scale" ] && [ -n "${2:-}" ]; then
  SCALE_APP="$2"
elif [ "${1:-}" = "--replicas" ] && [ "${2:-}" = "2" ]; then
  REPLICAS_MODE=1
fi

if [ "$REPLICAS_MODE" = "1" ]; then
  echo "→ MODO 2 RÉPLICAS (M4): app-a + app-b com KR_DISTRIBUTED=1 e ids determinísticos"
  docker compose -f docker-compose.yml -f docker-compose.2replicas.yml build app-a app-b
  docker compose -f docker-compose.yml -f docker-compose.2replicas.yml up -d postgres redis redis-replica
  docker compose -f docker-compose.yml -f docker-compose.2replicas.yml run --rm migrate
  docker compose -f docker-compose.yml -f docker-compose.2replicas.yml up -d app-a app-b nginx
elif [ -n "$SCALE_APP" ]; then
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

# Diagnóstico: no modo 2 réplicas os serviços têm nomes próprios (app-a/app-b).
if [ "$REPLICAS_MODE" = "1" ]; then
  COMPOSE="docker compose -f docker-compose.yml -f docker-compose.2replicas.yml"
  echo "❌ /readyz não ficou 200 em 120 s — diagnóstico da stack (modo 2 réplicas):"
  $COMPOSE ps -a || true
  echo "--- logs app-a (tail 60) ---"; $COMPOSE logs --tail=60 app-a || true
  echo "--- logs app-b (tail 60) ---"; $COMPOSE logs --tail=60 app-b || true
else
  echo "❌ /readyz não ficou 200 em 120 s — diagnóstico da stack:"
  docker compose ps -a || true
  echo "--- logs app (tail 80) ---"; docker compose logs --tail=80 app || true
fi
echo "--- logs nginx (tail 30) ---"
docker compose logs --tail=30 nginx || true
echo "--- último readyz capturado ---"
cat /tmp/readyz.json 2>/dev/null || true
exit 1
