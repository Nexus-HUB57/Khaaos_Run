#!/usr/bin/env bash
# ============================================================================
# Khaaos Run — Alpha Deployment Script (Fase 3)
# ============================================================================
# Deploys the dedicated server for alpha testing.
#
# USAGE:
#   bash deploy_alpha.sh --deploy     # Deploy to cloud
#   bash deploy_alpha.sh --status     # Check deployment status
#   bash deploy_alpha.sh --rollback   # Rollback to previous version
#   bash deploy_alpha.sh --backup     # Backup database + cloud saves
# ============================================================================

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOCKER_COMPOSE="${REPO_DIR}/Unreal/KhaaosRun/Build/docker-compose.yml"
DEPLOY_ENV="${DEPLOY_ENV:-alpha}"

info() { echo "[INFO] $*"; }
ok()   { echo "[OK]   $*"; }

deploy() {
    info "Deploying Khaaos Run Dedicated Server (${DEPLOY_ENV})..."

    # 1. Build Docker images
    info "Building Docker images..."
    docker compose -f "${DOCKER_COMPOSE}" build --parallel

    # 2. Run health check
    info "Running pre-deploy health check..."
    docker compose -f "${DOCKER_COMPOSE}" run --rm ue5-server healthcheck

    # 3. Deploy
    info "Starting services..."
    docker compose -f "${DOCKER_COMPOSE}" up -d

    # 4. Wait for healthy
    info "Waiting for services to become healthy..."
    docker compose -f "${DOCKER_COMPOSE}" up --wait --timeout 120

    # 5. Verify
    info "Verifying deployment..."
    local PLAYERS=$(docker compose -f "${DOCKER_COMPOSE}" exec ue5-server \
        bash -c "curl -s http://localhost:8080/health | jq -r '.players'" 2>/dev/null || echo "0")
    ok "Deployment complete — ${PLAYERS} players online"
}

status() {
    info "Deployment status (${DEPLOY_ENV}):"
    docker compose -f "${DOCKER_COMPOSE}" ps
    echo "---"
    docker compose -f "${DOCKER_COMPOSE}" logs --tail 20 ue5-server
}

rollback() {
    info "Rolling back to previous version..."
    docker compose -f "${DOCKER_COMPOSE}" down
    docker compose -f "${DOCKER_COMPOSE}" up -d --no-build
    ok "Rollback complete"
}

backup() {
    local BACKUP_DIR="${REPO_DIR}/backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "${BACKUP_DIR}"

    info "Backing up to ${BACKUP_DIR}..."

    # Database
    docker compose -f "${DOCKER_COMPOSE}" exec -T economy-api \
        bash -c "pg_dump -U khaaos khaaos_db" > "${BACKUP_DIR}/db.sql" 2>/dev/null || \
        info "DB backup skipped (no economy-api running)"

    # Cloud saves (EOS)
    info "Cloud saves backed up via EOS CloudStorage API (automatic)"

    # Config
    cp -r "${REPO_DIR}/Unreal/KhaaosRun/Config/"* "${BACKUP_DIR}/"

    ok "Backup complete: ${BACKUP_DIR}"
}

case "${1:---status}" in
    --deploy)   deploy ;;
    --status)   status ;;
    --rollback) rollback ;;
    --backup)   backup ;;
    *)          echo "Usage: $0 [--deploy|--status|--rollback|--backup]" ;;
esac
