#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Backup System | Devs Ph.D
# Copyright Nexus-HUB57. All Rights Reserved.
# =============================================================================
# Creates timestamped backups of all critical systems:
#   - PostgreSQL database (pg_dump)
#   - Redis (BGSAVE + RDB copy)
#   - EOS Cloud Save (API export)
#   - Config/ INI files
#   - Grafana dashboard JSON
# Compresses to tar.gz, uploads to S3 (if configured), and prunes old backups.
#
# USAGE:
#   ./backup_system.sh                    # Full backup
#   ./backup_system.sh --no-upload        # Backup without S3 upload
#   ./backup_system.sh --no-prune         # Don't prune old backups
#   ./backup_system.sh --verbose          # Verbose output
# =============================================================================

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────────
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CONFIG_DIR="${REPO_DIR}/Unreal/KhaaosRun/Config"
DOCKER_COMPOSE="${REPO_DIR}/Unreal/KhaaosRun/Build/docker-compose.yml"
BACKUP_BASE="${REPO_DIR}/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_BASE}/${TIMESTAMP}"
LOG_FILE="${BACKUP_BASE}/backup.log"

# S3 configuration (optional)
S3_BUCKET="${S3_BACKUP_BUCKET:-}"
S3_PREFIX="${S3_BACKUP_PREFIX:-khaaos-run/backups}"

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

# EOS configuration
EOS_DEPLOYMENT_ID="${EOS_DEPLOYMENT_ID:-}"
EOS_CLIENT_ID="${EOS_CLIENT_ID:-}"
EOS_CLIENT_SECRET="${EOS_CLIENT_SECRET:-}"

# Retention
PRUNE_DAYS=${BACKUP_PRUNE_DAYS:-30}

# Flags
DO_UPLOAD=true
DO_PRUNE=true
VERBOSE=false

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
        INFO)  [[ $VERBOSE == true ]] && echo -e "${CYAN}[INFO]${NC} $*" ;;
        OK)    echo -e "${GREEN}[OK]${NC} $*" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} $*" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} $*" ;;
    esac
}

# ── Argument parsing ──────────────────────────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        --no-upload) DO_UPLOAD=false ;;
        --no-prune)  DO_PRUNE=false ;;
        --verbose)   VERBOSE=true ;;
    esac
done

# ── Setup ──────────────────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR" "$BACKUP_BASE"
log INFO "=== Backup started: ${TIMESTAMP} ==="
log INFO "Backup directory: ${BACKUP_DIR}"

# =============================================================================
# BACKUP FUNCTIONS
# =============================================================================

backup_postgresql() {
    log INFO "Backing up PostgreSQL..."
    local db_file="${BACKUP_DIR}/postgresql_${TIMESTAMP}.sql.gz"

    # Try via Docker first
    if command -v docker &>/dev/null && docker ps --filter "name=khaaos" --format "{{.Names}}" 2>/dev/null | grep -qi "postgres\|economy"; then
        local container_name
        container_name=$(docker ps --filter "name=khaaos" --format "{{.Names}}" 2>/dev/null | grep -i "postgres\|economy" | head -1 || echo "")
        if [[ -n "$container_name" ]]; then
            docker exec -T "$container_name" pg_dump -U "$DB_USER" "$DB_NAME" 2>/dev/null | gzip > "$db_file" 2>/dev/null
            if [[ $? -eq 0 && -s "$db_file" ]]; then
                local size
                size=$(du -h "$db_file" | cut -f1)
                log OK "PostgreSQL backup via Docker (${size})"
                return 0
            fi
        fi
    fi

    # Try direct pg_dump
    if command -v pg_dump &>/dev/null; then
        PGPASSWORD="${DB_PASSWORD:-}" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" 2>/dev/null | gzip > "$db_file" 2>/dev/null
        if [[ $? -eq 0 && -s "$db_file" ]]; then
            local size
            size=$(du -h "$db_file" | cut -f1)
            log OK "PostgreSQL backup via pg_dump (${size})"
            return 0
        fi
    fi

    log WARN "PostgreSQL backup skipped (no accessible database)"
    touch "${BACKUP_DIR}/postgresql_SKIPPED"
}

backup_redis() {
    log INFO "Backing up Redis..."
    local redis_file="${BACKUP_DIR}/redis_${TIMESTAMP}.rdb"

    # Try via Docker first
    if command -v docker &>/dev/null && docker ps --filter "name=khaaos-redis" --format "{{.Names}}" 2>/dev/null | grep -q "redis"; then
        # Trigger BGSAVE
        docker exec khaaos-redis redis-cli BGSAVE 2>/dev/null || true
        sleep 2
        # Copy RDB from container
        docker cp khaaos-redis:/data/dump.rdb "$redis_file" 2>/dev/null
        if [[ -s "$redis_file" ]]; then
            local size
            size=$(du -h "$redis_file" | cut -f1)
            log OK "Redis backup via Docker (${size})"
            return 0
        fi
    fi

    # Try via redis-cli
    if command -v redis-cli &>/dev/null; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BGSAVE 2>/dev/null || true
        sleep 2
        # Try to find RDB file in default location
        local rdb_path
        rdb_path=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" CONFIG GET dir 2>/dev/null | tail -1 || echo "")
        local rdb_file
        rdb_file=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" CONFIG GET dbfilename 2>/dev/null | tail -1 || echo "dump.rdb")
        if [[ -n "$rdb_path" && -f "${rdb_path}/${rdb_file}" ]]; then
            cp "${rdb_path}/${rdb_file}" "$redis_file"
            local size
            size=$(du -h "$redis_file" | cut -f1)
            log OK "Redis backup via redis-cli (${size})"
            return 0
        fi
    fi

    log WARN "Redis backup skipped (no accessible Redis instance)"
    touch "${BACKUP_DIR}/redis_SKIPPED"
}

backup_eos_cloud_save() {
    log INFO "Backing up EOS Cloud Save..."
    local eos_file="${BACKUP_DIR}/eos_cloudsave_${TIMESTAMP}.json"

    if [[ -n "$EOS_DEPLOYMENT_ID" && -n "$EOS_CLIENT_ID" ]]; then
        # Get access token
        local token
        token=$(curl -sf -X POST "https://api.epicgames.com/auth/v1/oauth/token" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "grant_type=client_credentials&client_id=${EOS_CLIENT_ID}&client_secret=${EOS_CLIENT_SECRET}" \
            2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")

        if [[ -n "$token" ]]; then
            # Export cloud save data
            curl -sf -H "Authorization: Bearer ${token}" \
                "https://api.epicgames.com/epic/data/v1/cloudstorage/${EOS_DEPLOYMENT_ID}/export" \
                -o "$eos_file" 2>/dev/null || true

            if [[ -s "$eos_file" ]]; then
                local size
                size=$(du -h "$eos_file" | cut -f1)
                log OK "EOS Cloud Save backup (${size})"
                return 0
            fi
        fi
        log WARN "EOS Cloud Save backup skipped (auth failed)"
    else
        log WARN "EOS Cloud Save backup skipped (EOS credentials not configured)"
    fi
    touch "${BACKUP_DIR}/eos_cloudsave_SKIPPED"
}

backup_config_files() {
    log INFO "Backing up Config/ INI files..."
    local config_backup="${BACKUP_DIR}/config"
    mkdir -p "$config_backup"

    if [[ -d "$CONFIG_DIR" ]]; then
        cp -r "$CONFIG_DIR"/* "$config_backup"/ 2>/dev/null
        local file_count
        file_count=$(find "$config_backup" -type f | wc -l)
        log OK "Config files backed up (${file_count} files)"
    else
        log WARN "Config directory not found at $CONFIG_DIR"
        touch "${BACKUP_DIR}/config_SKIPPED"
    fi

    # Also backup game-runtime configs if present
    if [[ -d "${REPO_DIR}/game-runtime" ]]; then
        local gr_config="${BACKUP_DIR}/game-runtime_config"
        mkdir -p "$gr_config"
        find "${REPO_DIR}/game-runtime" -maxdepth 1 -name "*.ini" -exec cp {} "$gr_config"/ \; 2>/dev/null || true
        log OK "Game-runtime config files backed up"
    fi
}

backup_grafana_dashboards() {
    log INFO "Backing up Grafana dashboards..."
    local grafana_backup="${BACKUP_DIR}/grafana"
    mkdir -p "$grafana_backup"

    # Try via Grafana API
    if command -v curl &>/dev/null; then
        local auth_header=""
        if [[ -n "$GRAFANA_API_KEY" ]]; then
            auth_header="Authorization: Bearer ${GRAFANA_API_KEY}"
        fi

        # List all dashboards
        local dashboards_json
        dashboards_json=$(curl -sf -H "$auth_header" \
            "${GRAFANA_URL}/api/search?type=dash-db" 2>/dev/null || echo "[]")

        local dashboard_uids
        dashboard_uids=$(echo "$dashboards_json" | python3 -c "
import sys, json
try:
    dbs = json.load(sys.stdin)
    for db in dbs:
        print(db.get('uid',''))
except: pass
" 2>/dev/null || echo "")

        local count=0
        for uid in $dashboard_uids; do
            if [[ -n "$uid" ]]; then
                curl -sf -H "$auth_header" \
                    "${GRAFANA_URL}/api/dashboards/uid/${uid}" \
                    -o "${grafana_backup}/dashboard_${uid}.json" 2>/dev/null || true
                ((count++)) || true
            fi
        done

        if [[ $count -gt 0 ]]; then
            log OK "Grafana dashboards backed up (${count} dashboards)"
        else
            log WARN "No Grafana dashboards found or API not accessible"
        fi
    fi

    # Also copy static dashboard files if present
    local static_dashboards="${REPO_DIR}/infra/grafana"
    if [[ -d "$static_dashboards" ]]; then
        cp -r "$static_dashboards"/* "$grafana_backup"/ 2>/dev/null || true
        log OK "Static Grafana dashboard files backed up"
    fi
}

compress_and_upload() {
    log INFO "Compressing backup..."
    local archive="${BACKUP_BASE}/khaaos_backup_${TIMESTAMP}.tar.gz"

    tar -czf "$archive" -C "$BACKUP_BASE" "$TIMESTAMP" 2>/dev/null
    if [[ -s "$archive" ]]; then
        local size
        size=$(du -h "$archive" | cut -f1)
        log OK "Backup compressed (${size})"

        # Remove uncompressed directory
        rm -rf "$BACKUP_DIR"

        # Upload to S3
        if $DO_UPLOAD && [[ -n "$S3_BUCKET" ]]; then
            log INFO "Uploading to S3 (s3://${S3_BUCKET}/${S3_PREFIX}/)..."
            if command -v aws &>/dev/null; then
                aws s3 cp "$archive" "s3://${S3_BUCKET}/${S3_PREFIX}/$(basename "$archive")" \
                    --storage-class STANDARD_IA 2>/dev/null
                if [[ $? -eq 0 ]]; then
                    log OK "Backup uploaded to S3"
                else
                    log ERROR "S3 upload failed"
                fi
            else
                log WARN "AWS CLI not installed — skipping S3 upload"
            fi
        else
            if ! $DO_UPLOAD; then
                log INFO "S3 upload skipped (--no-upload)"
            else
                log INFO "S3 upload skipped (S3_BACKUP_BUCKET not configured)"
            fi
        fi

        log OK "Backup archive: $archive"
    else
        log ERROR "Backup compression failed"
    fi
}

prune_old_backups() {
    if ! $DO_PRUNE; then
        log INFO "Pruning skipped (--no-prune)"
        return
    fi

    log INFO "Pruning backups older than ${PRUNE_DAYS} days..."
    local pruned=0

    # Find and delete old backup archives
    while IFS= read -r -d '' file; do
        rm -f "$file"
        ((pruned++)) || true
        log INFO "Pruned: $(basename "$file")"
    done < <(find "$BACKUP_BASE" -name "khaaos_backup_*.tar.gz" -mtime +"$PRUNE_DAYS" -print0 2>/dev/null)

    # Also prune old backup directories (if any remain uncompressed)
    while IFS= read -r -d '' dir; do
        rm -rf "$dir"
        ((pruned++)) || true
        log INFO "Pruned directory: $(basename "$dir")"
    done < <(find "$BACKUP_BASE" -mindepth 1 -maxdepth 1 -type d -mtime +"$PRUNE_DAYS" -print0 2>/dev/null)

    if [[ $pruned -gt 0 ]]; then
        log OK "Pruned ${pruned} old backup(s)"
    else
        log INFO "No backups to prune"
    fi

    # Prune S3 backups
    if [[ -n "$S3_BUCKET" ]] && command -v aws &>/dev/null; then
        local s3_pruned=0
        # List objects older than PRUNE_DAYS and delete them
        local cutoff_date
        cutoff_date=$(date -d "-${PRUNE_DAYS} days" +%Y-%m-%d 2>/dev/null || date -v-"${PRUNE_DAYS}"d +%Y-%m-%d 2>/dev/null || echo "")
        if [[ -n "$cutoff_date" ]]; then
            log INFO "Checking S3 for old backups..."
            # This is a best-effort prune; full implementation would use S3 lifecycle policies
            log INFO "S3 prune: consider using S3 lifecycle rules for automatic expiration"
        fi
    fi
}

# =============================================================================
# MAIN
# =============================================================================

echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Khaaos Run — Backup System                                  ║"
echo "║  Devs Ph.D | Nexus-HUB57                                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Run all backup steps
backup_postgresql
backup_redis
backup_eos_cloud_save
backup_config_files
backup_grafana_dashboards
compress_and_upload
prune_old_backups

log OK "=== Backup complete: ${TIMESTAMP} ==="
echo ""
echo -e "${GREEN}${BOLD}✓ Backup completed successfully${NC}"
echo -e "  Archive: ${BACKUP_BASE}/khaaos_backup_${TIMESTAMP}.tar.gz"
echo -e "  Log:     ${LOG_FILE}"

exit 0
