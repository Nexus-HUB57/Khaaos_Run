#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Restore System | Devs Ph.D
# Copyright Nexus-HUB57. All Rights Reserved.
# =============================================================================
# Restores all systems from a backup archive created by backup_system.sh.
#
# USAGE:
#   ./restore_system.sh <backup_archive.tar.gz>          # Full restore
#   ./restore_system.sh <backup_archive.tar.gz> --dry-run # Show what would be restored
#   ./restore_system.sh --latest                          # Restore latest backup
#   ./restore_system.sh --list                            # List available backups
# =============================================================================
# WARNING: This script stops all services during restore. Use with caution.
# =============================================================================

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────────
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CONFIG_DIR="${REPO_DIR}/Unreal/KhaaosRun/Config"
DOCKER_COMPOSE="${REPO_DIR}/Unreal/KhaaosRun/Build/docker-compose.yml"
BACKUP_BASE="${REPO_DIR}/backups"
LOG_FILE="${BACKUP_BASE}/restore.log"

# Database configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-khaaos_db}"
DB_USER="${DB_USER:-khaaos}"

# Redis configuration
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

# Grafana configuration
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3001}"
GRAFANA_API_KEY="${GRAFANA_API_KEY:-}"

# Flags
DRY_RUN=false

# ── Colors ─────────────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' CYAN='' BOLD='' NC=''
fi

# ── Helpers ────────────────────────────────────────────────────────────────────────
log() {
    local level="$1"; shift
    local msg="[$(date +%Y-%m-%dT%H:%M:%S)] [${level}] $*"
    echo -e "${msg}" >> "$LOG_FILE"
    case "$level" in
        INFO)  echo -e "${CYAN}[INFO]${NC} $*" ;;
        OK)    echo -e "${GREEN}[OK]${NC} $*" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $*" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $*" ;;
    esac
}

die() {
    log ERROR "$*"
    exit 1
}

# ── Argument parsing ──────────────────────────────────────────────────────────────
ARCHIVE=""
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --latest)
            # Find latest backup
            LATEST=$(ls -t "${BACKUP_BASE}"/khaaos_backup_*.tar.gz 2>/dev/null | head -1 || echo "")
            if [[ -z "$LATEST" ]]; then
                die "No backups found in ${BACKUP_BASE}"
            fi
            ARCHIVE="$LATEST"
            ;;
        --list)
            echo -e "${BOLD}Available Backups:${NC}"
            if ls "${BACKUP_BASE}"/khaaos_backup_*.tar.gz &>/dev/null; then
                for f in "${BACKUP_BASE}"/khaaos_backup_*.tar.gz; do
                    local size
                    size=$(du -h "$f" | cut -f1)
                    local ts
                    ts=$(basename "$f" | sed 's/khaaos_backup_//;s/\.tar\.gz//' || echo "unknown")
                    echo -e "  ${GREEN}$ts${NC}  ${size}  $f"
                done
            else
                echo "  (no backups found)"
            fi
            exit 0
            ;;
        *)
            if [[ -z "$ARCHIVE" ]]; then
                ARCHIVE="$arg"
            fi
            ;;
    esac
done

# Validate archive argument
if [[ -z "$ARCHIVE" ]]; then
    die "Usage: $0 <backup_archive.tar.gz> [--dry-run]\n       $0 --latest [--dry-run]\n       $0 --list"
fi

if [[ ! -f "$ARCHIVE" ]]; then
    die "Backup archive not found: $ARCHIVE"
fi

# ── Setup ──────────────────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_BASE"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESTORE_DIR="${BACKUP_BASE}/restore_${TIMESTAMP}"

log INFO "=== Restore started: ${TIMESTAMP} ==="
log INFO "Archive: ${ARCHIVE}"
log INFO "Restore directory: ${RESTORE_DIR}"

if $DRY_RUN; then
    log INFO "DRY RUN — no changes will be made"
fi

# =============================================================================
# RESTORE FUNCTIONS
# =============================================================================

verify_archive() {
    log INFO "Verifying archive integrity..."
    if tar -tzf "$ARCHIVE" &>/dev/null; then
        log OK "Archive integrity verified"
    else
        die "Archive is corrupted: $ARCHIVE"
    fi

    # Show archive contents
    log INFO "Archive contents:"
    tar -tzf "$ARCHIVE" | head -30 | while read -r line; do
        log INFO "  $line"
    done
    local total_files
    total_files=$(tar -tzf "$ARCHIVE" | wc -l)
    log INFO "Total files in archive: $total_files"
}

extract_archive() {
    log INFO "Extracting archive..."
    mkdir -p "$RESTORE_DIR"
    tar -xzf "$ARCHIVE" -C "$RESTORE_DIR" 2>/dev/null
    if [[ $? -eq 0 ]]; then
        log OK "Archive extracted to $RESTORE_DIR"
    else
        die "Archive extraction failed"
    fi

    # Find the timestamp subdirectory inside
    RESTORE_SRC=$(find "$RESTORE_DIR" -mindepth 1 -maxdepth 1 -type d | head -1 || echo "$RESTORE_DIR")
    log INFO "Restore source: $RESTORE_SRC"
}

stop_services() {
    if $DRY_RUN; then
        log INFO "DRY RUN: Would stop all services"
        return
    fi

    log INFO "Stopping all services..."
    if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
        if [[ -f "$DOCKER_COMPOSE" ]]; then
            docker compose -f "$DOCKER_COMPOSE" down --timeout 30 2>/dev/null || true
            log OK "Docker Compose services stopped"
        else
            # Try stopping individual containers
            docker stop khaaos-server khaaos-economy-api khaaos-redis khaaos-prometheus khaaos-grafana 2>/dev/null || true
            log OK "Docker containers stopped"
        fi
    else
        log WARN "Docker not available — ensure services are stopped manually"
    fi

    # Wait for graceful shutdown
    sleep 5
}

restore_postgresql() {
    log INFO "Restoring PostgreSQL..."
    local db_file
    db_file=$(find "$RESTORE_SRC" -name "postgresql_*.sql.gz" -type f 2>/dev/null | head -1 || echo "")

    if [[ -z "$db_file" ]]; then
        if [[ -f "${RESTORE_SRC}/postgresql_SKIPPED" ]]; then
            log WARN "PostgreSQL was skipped in backup — skipping restore"
            return
        fi
        log WARN "No PostgreSQL backup found in archive"
        return
    fi

    if $DRY_RUN; then
        log INFO "DRY RUN: Would restore PostgreSQL from $(basename "$db_file")"
        return
    fi

    # Try via Docker
    if command -v docker &>/dev/null; then
        # Start just the database container first
        local container_name
        container_name=$(docker ps -a --filter "name=khaaos" --format "{{.Names}}" 2>/dev/null | grep -i "postgres\|economy\|db" | head -1 || echo "")
        if [[ -n "$container_name" ]]; then
            docker start "$container_name" 2>/dev/null || true
            sleep 5
            gunzip -c "$db_file" | docker exec -i "$container_name" psql -U "$DB_USER" -d "$DB_NAME" 2>/dev/null
            if [[ $? -eq 0 ]]; then
                log OK "PostgreSQL restored via Docker"
                return
            fi
        fi
    fi

    # Try direct psql
    if command -v psql &>/dev/null; then
        gunzip -c "$db_file" | PGPASSWORD="${DB_PASSWORD:-}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" 2>/dev/null
        if [[ $? -eq 0 ]]; then
            log OK "PostgreSQL restored via psql"
            return
        fi
    fi

    log WARN "PostgreSQL restore failed — manual restore may be required"
}

restore_redis() {
    log INFO "Restoring Redis..."
    local rdb_file
    rdb_file=$(find "$RESTORE_SRC" -name "redis_*.rdb" -type f 2>/dev/null | head -1 || echo "")

    if [[ -z "$rdb_file" ]]; then
        if [[ -f "${RESTORE_SRC}/redis_SKIPPED" ]]; then
            log WARN "Redis was skipped in backup — skipping restore"
            return
        fi
        log WARN "No Redis backup found in archive"
        return
    fi

    if $DRY_RUN; then
        log INFO "DRY RUN: Would restore Redis from $(basename "$rdb_file")"
        return
    fi

    # Try via Docker
    if command -v docker &>/dev/null; then
        if docker ps -a --filter "name=khaaos-redis" --format "{{.Names}}" 2>/dev/null | grep -q "redis"; then
            # Stop Redis, replace RDB, start Redis
            docker stop khaaos-redis 2>/dev/null || true
            docker cp "$rdb_file" khaaos-redis:/data/dump.rdb 2>/dev/null
            docker start khaaos-redis 2>/dev/null || true
            sleep 3
            # Verify
            if docker exec khaaos-redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
                log OK "Redis restored via Docker"
                return
            fi
        fi
    fi

    # Try direct redis-cli
    if command -v redis-cli &>/dev/null; then
        # Stop Redis, replace RDB, start Redis
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SHUTDOWN NOSAVE 2>/dev/null || true
        local redis_dir
        redis_dir=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" CONFIG GET dir 2>/dev/null | tail -1 || echo "/var/lib/redis")
        cp "$rdb_file" "${redis_dir}/dump.rdb" 2>/dev/null || true
        log INFO "Redis RDB copied — restart Redis service to apply"
        log WARN "Redis restore requires manual service restart"
        return
    fi

    log WARN "Redis restore failed — manual restore may be required"
}

restore_config() {
    log INFO "Restoring Config/ INI files..."
    local config_backup
    config_backup=$(find "$RESTORE_SRC" -type d -name "config" 2>/dev/null | head -1 || echo "")

    if [[ -z "$config_backup" || ! -d "$config_backup" ]]; then
        log WARN "No config backup found in archive"
        return
    fi

    if $DRY_RUN; then
        log INFO "DRY RUN: Would restore config files from $config_backup"
        return
    fi

    # Backup current config before overwriting
    local current_config_backup="${BACKUP_BASE}/pre_restore_config_${TIMESTAMP}"
    if [[ -d "$CONFIG_DIR" ]]; then
        mkdir -p "$current_config_backup"
        cp -r "$CONFIG_DIR"/* "$current_config_backup"/ 2>/dev/null || true
        log INFO "Current config backed up to $current_config_backup"
    fi

    # Restore config files
    mkdir -p "$CONFIG_DIR"
    cp -r "$config_backup"/* "$CONFIG_DIR"/ 2>/dev/null
    local file_count
    file_count=$(find "$CONFIG_DIR" -type f -name "*.ini" | wc -l)
    log OK "Config files restored (${file_count} INI files)"
}

restore_grafana_dashboards() {
    log INFO "Restoring Grafana dashboards..."
    local grafana_backup
    grafana_backup=$(find "$RESTORE_SRC" -type d -name "grafana" 2>/dev/null | head -1 || echo "")

    if [[ -z "$grafana_backup" || ! -d "$grafana_backup" ]]; then
        log WARN "No Grafana dashboard backup found in archive"
        return
    fi

    if $DRY_RUN; then
        log INFO "DRY RUN: Would restore Grafana dashboards"
        return
    fi

    # Try via Grafana API
    if command -v curl &>/dev/null; then
        local auth_header=""
        if [[ -n "$GRAFANA_API_KEY" ]]; then
            auth_header="Authorization: Bearer ${GRAFANA_API_KEY}"
        fi

        local count=0
        for dashboard_file in "${grafana_backup}"/dashboard_*.json; do
            if [[ -f "$dashboard_file" ]]; then
                # Extract dashboard JSON from the full response (Grafana wraps it)
                local dashboard_json
                dashboard_json=$(python3 -c "
import sys, json
try:
    d = json.load(open('$dashboard_file'))
    # Grafana API returns {dashboard: {...}, meta: {...}}
    if 'dashboard' in d:
        db = d['dashboard']
        db.pop('id', None)
        print(json.dumps({'dashboard': db, 'overwrite': True}))
    else:
        d.pop('id', None)
        print(json.dumps({'dashboard': d, 'overwrite': True}))
except Exception as e:
    print('', file=sys.stderr)
" 2>/dev/null || echo "")

                if [[ -n "$dashboard_json" ]]; then
                    curl -sf -X POST -H "Content-Type: application/json" -H "$auth_header" \
                        "${GRAFANA_URL}/api/dashboards/db" \
                        -d "$dashboard_json" &>/dev/null 2>&1 || true
                    ((count++)) || true
                fi
            fi
        done

        if [[ $count -gt 0 ]]; then
            log OK "Grafana dashboards restored (${count} dashboards)"
        fi
    fi

    # Also restore static dashboard files
    local static_dir="${REPO_DIR}/infra/grafana"
    if [[ -d "$static_dir" ]]; then
        cp -r "${grafana_backup}"/*.json "$static_dir"/ 2>/dev/null || true
        log OK "Static Grafana dashboard files restored"
    fi
}

start_services() {
    if $DRY_RUN; then
        log INFO "DRY RUN: Would start all services"
        return
    fi

    log INFO "Starting all services..."
    if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
        if [[ -f "$DOCKER_COMPOSE" ]]; then
            docker compose -f "$DOCKER_COMPOSE" up -d 2>/dev/null
            log INFO "Waiting for services to become healthy..."
            docker compose -f "$DOCKER_COMPOSE" up --wait --timeout 120 2>/dev/null || true
            log OK "Docker Compose services started"
        else
            docker start khaaos-redis khaaos-prometheus khaaos-grafana khaaos-economy-api khaaos-server 2>/dev/null || true
            log OK "Docker containers started"
        fi
    else
        log WARN "Docker not available — start services manually"
    fi
}

verify_health() {
    log INFO "Verifying system health after restore..."
    local verify_script="${REPO_DIR}/scripts/alpha/verify_alpha_readiness.sh"

    if [[ -x "$verify_script" ]]; then
        log INFO "Running alpha readiness verification..."
        if "$verify_script" --quiet; then
            log OK "System health verification PASSED"
        else
            log WARN "System health verification reported FAILURES — check manually"
        fi
    else
        log WARN "verify_alpha_readiness.sh not found — manual health check required"

        # Basic health checks
        local failures=0
        command -v curl &>/dev/null || true

        # Check Economy API
        if curl -sf --connect-timeout 5 "http://localhost:3000/health" &>/dev/null 2>&1; then
            log OK "Economy API healthy"
        else
            log WARN "Economy API not responding"
            ((failures++)) || true
        fi

        # Check Redis
        if command -v redis-cli &>/dev/null && redis-cli ping 2>/dev/null | grep -q "PONG"; then
            log OK "Redis healthy"
        else
            log WARN "Redis not responding"
            ((failures++)) || true
        fi

        # Check Grafana
        if curl -sf --connect-timeout 5 "http://localhost:3001/api/health" &>/dev/null 2>&1; then
            log OK "Grafana healthy"
        else
            log WARN "Grafana not responding"
            ((failures++)) || true
        fi

        if [[ $failures -gt 0 ]]; then
            log WARN "Health check: $failures failure(s) — verify manually"
        else
            log OK "Basic health check passed"
        fi
    fi
}

cleanup() {
    log INFO "Cleaning up restore directory..."
    rm -rf "$RESTORE_DIR"
    log OK "Cleanup complete"
}

# =============================================================================
# MAIN
# =============================================================================

echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Khaaos Run — Restore System                                 ║"
echo "║  Devs Ph.D | Nexus-HUB57                                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

if $DRY_RUN; then
    echo -e "${YELLOW}${BOLD}DRY RUN MODE — No changes will be made${NC}"
fi

# Confirmation prompt (skip in dry-run)
if ! $DRY_RUN; then
    echo -e "${YELLOW}WARNING: This will STOP all services and restore from backup.${NC}"
    echo -e "Archive: ${BOLD}$ARCHIVE${NC}"
    read -rp "Are you sure? [y/N] " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        log INFO "Restore cancelled by user"
        exit 0
    fi
fi

# Execute restore steps
verify_archive
extract_archive
stop_services
restore_postgresql
restore_redis
restore_config
restore_grafana_dashboards
start_services
verify_health
cleanup

log OK "=== Restore complete: ${TIMESTAMP} ==="
echo ""
echo -e "${GREEN}${BOLD}✓ Restore completed successfully${NC}"
echo -e "  Log: ${LOG_FILE}"

exit 0
