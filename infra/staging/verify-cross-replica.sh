#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — verify cross-replica AO VIVO contra a stack de staging real.
# =============================================================================
# Sobe a stack docker-compose.cross-replica.yml (PG 16 + Redis 7 + 2 réplicas
# com KR_DISTRIBUTED=1) e roda o smoke cross-replica em modo attach:
#   1. /readyz 200 nas duas réplicas com replicaIds distintos;
#   2. ownership/fencing da sala no Redis REAL (kr:own:{roomId});
#   3. redirect ao dono vivo lido do registro (kr:replica:{id});
#   4. resume no dono sem duplicar jogador;
#   5. relay room_open espelhado entre réplicas (mirrorApplied > 0);
#   6. SLO smoke12 (p95 RTT < 150ms, erros < 1%) contra CADA réplica.
# Contrato: CROSS_REPLICA_SMOKE_OK
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE_FILE=docker-compose.cross-replica.yml
COMPOSE="docker compose -f ${COMPOSE_FILE}"
SMOKE=../../game-runtime/scripts/smoke-cross-replica.mjs
PORT_A=${KR_XREP_PORT_A:-8791}
PORT_B=${KR_XREP_PORT_B:-8792}
REDIS_PORT=${KR_XREP_REDIS_PORT:-6399}

# Segredos: .env da pasta (deploy.sh usa o mesmo) ou defaults de CI.
if [ ! -f .env ]; then
  cat > .env <<EOF
KR_PG_PASSWORD=cross_replica_ci_pw
ADMIN_TOKEN=cross_replica_admin_ci
AUTH_SECRET=cross_replica_auth_secret_ci_0123456789abcdef
EOF
fi
# shellcheck disable=SC1091
set -a; source .env; set +a

# Identidades do smoke (2 humanos + pool kr_bot001..012 do loadgen) com hash
# REAL no mesmo formato do servidor (import direto de hashPassword).
export KR_USERS_JSON=$(node -e '
  (async () => {
    const { hashPassword } = await import("../../game-runtime/server/auth.js");
    const users = [
      { id: "xrep-1", username: "xrep_user_a", passwordHash: hashPassword("kr123"), role: "player", region: "sa-east" },
      { id: "xrep-2", username: "xrep_user_b", passwordHash: hashPassword("kr123"), role: "player", region: "sa-east" },
    ];
    for (let i = 1; i <= 12; i++) {
      users.push({ id: `bot-${i}`, username: `kr_bot${String(i).padStart(3, "0")}`, passwordHash: hashPassword("kr123"), role: "player", region: "sa-east" });
    }
    process.stdout.write(JSON.stringify(users));
  })();
')

echo "── [1/4] build + up da stack cross-replica (2 réplicas reais + PG/Redis reais)"
${COMPOSE} up -d --build 2>&1 | tail -4

echo "── [2/4] espera /readyz das duas réplicas"
for port in "${PORT_A}" "${PORT_B}"; do
  for i in $(seq 1 60); do
    status=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/readyz" || true)
    [ "$status" = "200" ] && break
    sleep 1
    [ "$i" = "60" ] && { echo "réplica :${port} não ficou ready"; ${COMPOSE} logs --tail 30 || true; exit 1; }
  done
  echo "   réplica :${port} ready"
done

echo "── [3/4] smoke cross-replica AO VIVO (attach às réplicas reais)"
set -o pipefail
node "${SMOKE}" --mode attach \
  --replica-a "http://127.0.0.1:${PORT_A}" \
  --replica-b "http://127.0.0.1:${PORT_B}" \
  --redis-url "redis://127.0.0.1:${REDIS_PORT}" 2>&1 | tee /tmp/xreplica-verify.log || {
  echo "── smoke falhou; logs das réplicas:";
  ${COMPOSE} logs --tail 40 app-a app-b || true;
  exit 1;
}

echo "── [4/4] contrato"
grep -q "^CROSS_REPLICA_SMOKE_OK$" /tmp/xreplica-verify.log || { echo "contrato CROSS_REPLICA_SMOKE_OK ausente"; exit 1; }
echo "✅ cross-replica AO VIVO: ownership/fencing no Redis, redirect, resume, relay e SLO provados com 2 réplicas reais"
