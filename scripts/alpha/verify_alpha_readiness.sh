#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Alpha Deployment Readiness Verification | Devs Ph.D
# Copyright Nexus-HUB57. All Rights Reserved.
# =============================================================================
# Verifies all alpha deployment requirements before go-live.
# Each check outputs PASS/FAIL/WARN with color-coded output.
# Exit 0 only if ALL checks PASS.
#
# USAGE:
#   ./verify_alpha_readiness.sh           # Run all checks
#   ./verify_alpha_readiness.sh --json    # Output as JSON
#   ./verify_alpha_readiness.sh --quiet   # Only show failures
# =============================================================================

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────────
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CONFIG_DIR="${REPO_DIR}/Unreal/KhaaosRun/Config"
DOCKER_COMPOSE="${REPO_DIR}/Unreal/KhaaosRun/Build/docker-compose.yml"
PRODUCTION_COMPOSE="${REPO_DIR}/infra/deploy/docker-compose.production.yml"

# Service endpoints (overridable via environment)
UE5_PORT="${UE5_PORT:-7777}"
ECONOMY_PORT="${ECONOMY_PORT:-3000}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
PROMETHEUS_PORT="${PROMETHEUS_PORT:-9090}"
GRAFANA_PORT="${GRAFANA_PORT:-3001}"
ALERTMANAGER_PORT="${ALERTMANAGER_PORT:-9093}"

# Counters
TOTAL=0
PASSED=0
FAILED=0
WARNED=0
QUIET=false
JSON_OUTPUT=false

# ── Colors ─────────────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' NC=''
fi

# ── Helpers ────────────────────────────────────────────────────────────────────────
log_pass() {
    ((TOTAL++)) || true; ((PASSED++)) || true
    if ! $QUIET; then
        echo -e "${GREEN}[PASS]${NC} $1"
    fi
}

log_fail() {
    ((TOTAL++)) || true; ((FAILED++)) || true
    echo -e "${RED}[FAIL]${NC} $1 ${RED}— $2${NC}"
}

log_warn() {
    ((TOTAL++)) || true; ((WARNED++)) || true
    if ! $QUIET; then
        echo -e "${YELLOW}[WARN]${NC} $1 ${YELLOW}— $2${NC}"
    fi
}

log_info() {
    if ! $QUIET; then
        echo -e "${CYAN}[INFO]${NC} $1"
    fi
}

section() {
    if ! $QUIET; then
        echo ""
        echo -e "${BOLD}${BLUE}━━━ $1 ━━━${NC}"
    fi
}

# ── Argument parsing ──────────────────────────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        --json)   JSON_OUTPUT=true ;;
        --quiet)  QUIET=true ;;
    esac
done

# ── Check Results Storage ─────────────────────────────────────────────────────────
declare -a CHECK_NAMES=()
declare -a CHECK_RESULTS=()
declare -a CHECK_DETAILS=()

record_check() {
    local name="$1" result="$2" detail="${3:-}"
    CHECK_NAMES+=("$name")
    CHECK_RESULTS+=("$result")
    CHECK_DETAILS+=("$detail")
}

# =============================================================================
# CHECKS
# =============================================================================

# ── 1. Docker ─────────────────────────────────────────────────────────────────────
check_docker() {
    section "Docker & Containers"

    # Docker daemon running
    if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
        local docker_version
        docker_version=$(docker --version 2>/dev/null | head -1)
        log_pass "Docker is running ($docker_version)"
        record_check "docker_running" "PASS" "$docker_version"
    else
        log_fail "Docker is running" "Docker daemon not accessible"
        record_check "docker_running" "FAIL" "Docker daemon not accessible"
    fi

    # Docker Compose services healthy
    if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
        if [[ -f "$DOCKER_COMPOSE" ]]; then
            local unhealthy
            unhealthy=$(docker compose -f "$DOCKER_COMPOSE" ps --format json 2>/dev/null \
                | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        s = json.loads(line)
        h = s.get('Health','') or s.get('Status','')
        if 'unhealthy' in str(h).lower() or 'exited' in str(h).lower():
            print(s.get('Service','unknown'))
    except: pass
" 2>/dev/null || echo "")

            if [[ -z "$unhealthy" ]]; then
                local running_count
                running_count=$(docker compose -f "$DOCKER_COMPOSE" ps --services --filter "status=running" 2>/dev/null | wc -l || echo "0")
                log_pass "Docker Compose services healthy ($running_count running)"
                record_check "compose_healthy" "PASS" "$running_count services running"
            else
                log_fail "Docker Compose services healthy" "Unhealthy: $unhealthy"
                record_check "compose_healthy" "FAIL" "Unhealthy: $unhealthy"
            fi
        else
            log_warn "Docker Compose services healthy" "docker-compose.yml not found at $DOCKER_COMPOSE"
            record_check "compose_healthy" "WARN" "Compose file not found"
        fi
    else
        log_warn "Docker Compose services healthy" "Docker not available — skipping container checks"
        record_check "compose_healthy" "WARN" "Docker not available"
    fi
}

# ── 2. UE5 Dedicated Server ───────────────────────────────────────────────────────
check_ue5_server() {
    section "UE5 Dedicated Server"

    # Port 7777 responding
    if command -v nc &>/dev/null; then
        if nc -z -w5 127.0.0.1 "$UE5_PORT" 2>/dev/null; then
            log_pass "UE5 server responding on port $UE5_PORT"
            record_check "ue5_port" "PASS" "Port $UE5_PORT open"
        else
            log_fail "UE5 server responding on port $UE5_PORT" "Port not open"
            record_check "ue5_port" "FAIL" "Port $UE5_PORT not responding"
        fi
    elif command -v curl &>/dev/null; then
        # Try UDP port via /health endpoint (some servers expose HTTP health)
        if curl -sf --connect-timeout 5 "http://127.0.0.1:8080/health" &>/dev/null 2>&1; then
            log_pass "UE5 server responding (health endpoint)"
            record_check "ue5_port" "PASS" "Health endpoint OK"
        else
            log_fail "UE5 server responding on port $UE5_PORT" "Cannot verify — install nc (netcat)"
            record_check "ue5_port" "FAIL" "Cannot verify port"
        fi
    else
        log_warn "UE5 server responding on port $UE5_PORT" "Neither nc nor curl available"
        record_check "ue5_port" "WARN" "No tool to check port"
    fi

    # Check via Docker if containers running
    if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
        local server_status
        server_status=$(docker ps --filter "name=khaaos-server" --format "{{.Status}}" 2>/dev/null || echo "")
        if [[ -n "$server_status" ]]; then
            if echo "$server_status" | grep -qi "up"; then
                log_pass "UE5 server container is UP ($server_status)"
                record_check "ue5_container" "PASS" "$server_status"
            else
                log_fail "UE5 server container is UP" "Status: $server_status"
                record_check "ue5_container" "FAIL" "$server_status"
            fi
        else
            log_warn "UE5 server container is UP" "Container khaaos-server not found"
            record_check "ue5_container" "WARN" "Container not found"
        fi
    fi
}

# ── 3. Economy API ────────────────────────────────────────────────────────────────
check_economy_api() {
    section "Economy API"

    if command -v curl &>/dev/null; then
        local http_code
        http_code=$(curl -sf -o /dev/null -w "%{http_code}" --connect-timeout 5 \
            "http://127.0.0.1:${ECONOMY_PORT}/health" 2>/dev/null || echo "000")

        if [[ "$http_code" == "200" ]]; then
            log_pass "Economy API responding on port $ECONOMY_PORT (HTTP 200)"
            record_check "economy_api" "PASS" "HTTP $http_code"
        elif [[ "$http_code" != "000" ]]; then
            log_fail "Economy API responding on port $ECONOMY_PORT" "HTTP $http_code"
            record_check "economy_api" "FAIL" "HTTP $http_code"
        else
            log_fail "Economy API responding on port $ECONOMY_PORT" "Connection refused"
            record_check "economy_api" "FAIL" "Connection refused"
        fi
    else
        log_warn "Economy API responding" "curl not available"
        record_check "economy_api" "WARN" "curl not available"
    fi
}

# ── 4. Redis ──────────────────────────────────────────────────────────────────────
check_redis() {
    section "Redis"

    if command -v redis-cli &>/dev/null; then
        local redis_response
        redis_response=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null || echo "FAILED")

        if [[ "$redis_response" == "PONG" ]]; then
            local redis_info
            redis_info=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" info server 2>/dev/null \
                | grep "redis_version" | cut -d: -f2 | tr -d '\r' || echo "unknown")
            log_pass "Redis connected on ${REDIS_HOST}:${REDIS_PORT} (v${redis_info})"
            record_check "redis" "PASS" "v${redis_info}"
        else
            log_fail "Redis connected on ${REDIS_HOST}:${REDIS_PORT}" "PING returned: $redis_response"
            record_check "redis" "FAIL" "PING: $redis_response"
        fi
    else
        # Try via Docker
        if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
            local docker_redis
            docker_redis=$(docker exec khaaos-redis redis-cli ping 2>/dev/null || echo "FAILED")
            if [[ "$docker_redis" == "PONG" ]]; then
                log_pass "Redis connected (via Docker container)"
                record_check "redis" "PASS" "via Docker"
            else
                log_fail "Redis connected" "Cannot reach Redis (local or Docker)"
                record_check "redis" "FAIL" "Unreachable"
            fi
        else
            log_fail "Redis connected" "redis-cli not available and Docker not running"
            record_check "redis" "FAIL" "No tool available"
        fi
    fi
}

# ── 5. Prometheus ─────────────────────────────────────────────────────────────────
check_prometheus() {
    section "Prometheus"

    if command -v curl &>/dev/null; then
        # Check Prometheus healthy endpoint
        local prom_health
        prom_health=$(curl -sf --connect-timeout 5 \
            "http://127.0.0.1:${PROMETHEUS_PORT}/-/healthy" 2>/dev/null || echo "")

        if [[ -n "$prom_health" ]]; then
            # Check targets are up
            local targets_up targets_total
            targets_total=$(curl -sf --connect-timeout 5 \
                "http://127.0.0.1:${PROMETHEUS_PORT}/api/v1/targets" 2>/dev/null \
                | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    targets = d.get('data',{}).get('activeTargets',[])
    print(len(targets))
except: print(0)
" 2>/dev/null || echo "0")
            targets_up=$(curl -sf --connect-timeout 5 \
                "http://127.0.0.1:${PROMETHEUS_PORT}/api/v1/targets" 2>/dev/null \
                | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    targets = d.get('data',{}).get('activeTargets',[])
    up = sum(1 for t in targets if t.get('health','') == 'up')
    print(up)
except: print(0)
" 2>/dev/null || echo "0")

            log_pass "Prometheus healthy on port $PROMETHEUS_PORT ($targets_up/$targets_total targets UP)"
            record_check "prometheus" "PASS" "$targets_up/$targets_total targets up"
        else
            log_fail "Prometheus healthy on port $PROMETHEUS_PORT" "Not responding"
            record_check "prometheus" "FAIL" "Not responding"
        fi
    else
        log_warn "Prometheus healthy" "curl not available"
        record_check "prometheus" "WARN" "curl not available"
    fi
}

# ── 6. Grafana ────────────────────────────────────────────────────────────────────
check_grafana() {
    section "Grafana"

    if command -v curl &>/dev/null; then
        local grafana_health
        grafana_health=$(curl -sf --connect-timeout 5 \
            "http://127.0.0.1:${GRAFANA_PORT}/api/health" 2>/dev/null || echo "")

        if [[ -n "$grafana_health" ]]; then
            local grafana_db
            grafana_db=$(echo "$grafana_health" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('database','unknown'))
except: print('unknown')
" 2>/dev/null || echo "unknown")
            log_pass "Grafana accessible on port $GRAFANA_PORT (DB: $grafana_db)"
            record_check "grafana" "PASS" "DB: $grafana_db"
        else
            log_fail "Grafana accessible on port $GRAFANA_PORT" "Not responding"
            record_check "grafana" "FAIL" "Not responding"
        fi
    else
        log_warn "Grafana accessible" "curl not available"
        record_check "grafana" "WARN" "curl not available"
    fi
}

# ── 7. EOS Auth ───────────────────────────────────────────────────────────────────
check_eos_auth() {
    section "EOS (Epic Online Services)"

    # Check EOS config exists
    local eos_config="${CONFIG_DIR}/DefaultEOS.ini"
    if [[ -f "$eos_config" ]]; then
        # Check for product ID and client ID (should be set, not placeholder)
        local product_id
        product_id=$(grep -i "ProductId" "$eos_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ -n "$product_id" && "$product_id" != *"placeholder"* && "$product_id" != *"xxx"* ]]; then
            log_pass "EOS config present (ProductId configured)"
            record_check "eos_config" "PASS" "ProductId set"
        else
            log_fail "EOS config present" "ProductId not configured or placeholder"
            record_check "eos_config" "FAIL" "ProductId not set"
        fi
    else
        log_fail "EOS config present" "DefaultEOS.ini not found"
        record_check "eos_config" "FAIL" "Config file missing"
    fi

    # Ping EOS services (best-effort — may be blocked by firewall)
    if command -v curl &>/dev/null; then
        local eos_ping
        eos_ping=$(curl -sf -o /dev/null -w "%{http_code}" --connect-timeout 5 \
            "https://epicgames.com" 2>/dev/null || echo "000")
        if [[ "$eos_ping" != "000" ]]; then
            log_pass "EOS services reachable (Epic endpoint HTTP $eos_ping)"
            record_check "eos_reachable" "PASS" "HTTP $eos_ping"
        else
            log_warn "EOS services reachable" "Cannot reach Epic endpoint (may be firewall)"
            record_check "eos_reachable" "WARN" "Unreachable (firewall?)"
        fi
    else
        log_warn "EOS services reachable" "curl not available"
        record_check "eos_reachable" "WARN" "curl not available"
    fi

    # Check production EOS region config
    local eos_prod_config="${CONFIG_DIR}/Regions/DefaultEOS_Production.ini"
    if [[ -f "$eos_prod_config" ]]; then
        log_pass "EOS production region config present"
        record_check "eos_region_config" "PASS" "DefaultEOS_Production.ini exists"
    else
        log_warn "EOS production region config" "DefaultEOS_Production.ini not found"
        record_check "eos_region_config" "WARN" "Not found"
    fi
}

# ── 8. Rate Limiter ───────────────────────────────────────────────────────────────
check_rate_limiter() {
    section "Rate Limiter"

    local prod_config="${CONFIG_DIR}/DefaultProduction.ini"
    if [[ -f "$prod_config" ]]; then
        # Check bEnableRateLimiting
        local rate_limiting
        rate_limiting=$(grep "bEnableRateLimiting" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ "$rate_limiting" == "True" ]]; then
            local rate_per_min
            rate_per_min=$(grep "RequestRateLimitPerMinute" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "N/A")
            log_pass "Rate limiter enabled (${rate_per_min}/min)"
            record_check "rate_limiter" "PASS" "${rate_per_min}/min"
        else
            log_fail "Rate limiter enabled" "bEnableRateLimiting=$rate_limiting (expected True)"
            record_check "rate_limiter" "FAIL" "bEnableRateLimiting=$rate_limiting"
        fi
    else
        log_fail "Rate limiter enabled" "DefaultProduction.ini not found"
        record_check "rate_limiter" "FAIL" "Config file missing"
    fi
}

# ── 9. DDoS Protection ────────────────────────────────────────────────────────────
check_ddos_protection() {
    section "DDoS Protection"

    local prod_config="${CONFIG_DIR}/DefaultProduction.ini"
    if [[ -f "$prod_config" ]]; then
        local ddos_enabled
        ddos_enabled=$(grep "bProtectionEnabled" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ "$ddos_enabled" == "True" ]]; then
            local max_conn_sec max_conn_ip
            max_conn_sec=$(grep "MaxConnectionsPerSecond" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "N/A")
            max_conn_ip=$(grep "MaxConnectionsPerIP" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "N/A")
            log_pass "DDoS protection active (${max_conn_sec}/s global, ${max_conn_ip}/IP)"
            record_check "ddos" "PASS" "${max_conn_sec}/s, ${max_conn_ip}/IP"
        else
            log_fail "DDoS protection active" "bProtectionEnabled=$ddos_enabled (expected True)"
            record_check "ddos" "FAIL" "bProtectionEnabled=$ddos_enabled"
        fi

        # Also check bEnableDDoSProtection in KhaaosProductionConfig
        local ddos_config
        ddos_config=$(grep "bEnableDDoSProtection" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ "$ddos_config" == "True" ]]; then
            log_pass "DDoS protection in ProductionConfig enabled"
            record_check "ddos_config" "PASS" "bEnableDDoSProtection=True"
        else
            log_fail "DDoS protection in ProductionConfig" "bEnableDDoSProtection=$ddos_config (expected True)"
            record_check "ddos_config" "FAIL" "bEnableDDoSProtection=$ddos_config"
        fi
    else
        log_fail "DDoS protection active" "DefaultProduction.ini not found"
        record_check "ddos" "FAIL" "Config file missing"
    fi
}

# ── 10. Webhooks (Discord + Slack) ────────────────────────────────────────────────
check_webhooks() {
    section "Webhooks (Discord + Slack)"

    local alertmanager_config="${REPO_DIR}/infra/alerting/alertmanager.yml"
    if [[ -f "$alertmanager_config" ]]; then
        # Check Discord webhook references
        local discord_webhooks
        discord_webhooks=$(grep -c "DISCORD.*WEBHOOK" "$alertmanager_config" 2>/dev/null || echo "0")
        if [[ "$discord_webhooks" -ge 1 ]]; then
            log_pass "Discord webhook configured ($discord_webhooks references in alertmanager.yml)"
            record_check "webhook_discord" "PASS" "$discord_webhooks references"
        else
            log_fail "Discord webhook configured" "No DISCORD_WEBHOOK references in alertmanager.yml"
            record_check "webhook_discord" "FAIL" "No references found"
        fi

        # Check Slack webhook references
        local slack_webhooks
        slack_webhooks=$(grep -c "SLACK.*WEBHOOK" "$alertmanager_config" 2>/dev/null || echo "0")
        if [[ "$slack_webhooks" -ge 1 ]]; then
            log_pass "Slack webhook configured ($slack_webhooks references in alertmanager.yml)"
            record_check "webhook_slack" "PASS" "$slack_webhooks references"
        else
            log_fail "Slack webhook configured" "No SLACK_WEBHOOK references in alertmanager.yml"
            record_check "webhook_slack" "FAIL" "No references found"
        fi
    else
        log_fail "Webhooks configured" "alertmanager.yml not found"
        record_check "webhook_discord" "FAIL" "alertmanager.yml missing"
        record_check "webhook_slack" "FAIL" "alertmanager.yml missing"
    fi

    # Check environment variables are set
    if [[ -n "${DISCORD_WEBHOOK_URL:-}" || -n "${DISCORD_CRITICAL_WEBHOOK_URL:-}" ]]; then
        log_pass "Discord webhook URL env var is set"
        record_check "webhook_discord_env" "PASS" "Env var set"
    else
        log_warn "Discord webhook URL env var" "DISCORD_WEBHOOK_URL not set (may be in .env)"
        record_check "webhook_discord_env" "WARN" "Env var not set"
    fi

    if [[ -n "${SLACK_CRITICAL_WEBHOOK_URL:-}" || -n "${SLACK_WARNING_WEBHOOK_URL:-}" ]]; then
        log_pass "Slack webhook URL env var is set"
        record_check "webhook_slack_env" "PASS" "Env var set"
    else
        log_warn "Slack webhook URL env var" "SLACK_*_WEBHOOK_URL not set (may be in .env)"
        record_check "webhook_slack_env" "WARN" "Env var not set"
    fi
}

# ── 11. Feature Flags ─────────────────────────────────────────────────────────────
check_feature_flags() {
    section "Feature Flags"

    local prod_config="${CONFIG_DIR}/DefaultProduction.ini"
    if [[ -f "$prod_config" ]]; then
        # Check bIsProduction
        local is_prod
        is_prod=$(grep "bIsProduction" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ "$is_prod" == "True" ]]; then
            log_pass "Feature flags: bIsProduction=True (Alpha preset)"
            record_check "feature_flags" "PASS" "bIsProduction=True"
        else
            log_fail "Feature flags: Alpha preset" "bIsProduction=$is_prod (expected True)"
            record_check "feature_flags" "FAIL" "bIsProduction=$is_prod"
        fi

        # Check authentication required
        local auth_required
        auth_required=$(grep "bRequireAuthentication" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ "$auth_required" == "True" ]]; then
            log_pass "Feature flags: bRequireAuthentication=True"
            record_check "feature_auth" "PASS" "bRequireAuthentication=True"
        else
            log_fail "Feature flags: Auth required" "bRequireAuthentication=$auth_required"
            record_check "feature_auth" "FAIL" "bRequireAuthentication=$auth_required"
        fi

        # Check anti-cheat required
        local ac_required
        ac_required=$(grep "bRequireAntiCheat" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ "$ac_required" == "True" ]]; then
            log_pass "Feature flags: bRequireAntiCheat=True"
            record_check "feature_ac" "PASS" "bRequireAntiCheat=True"
        else
            log_fail "Feature flags: Anti-cheat required" "bRequireAntiCheat=$ac_required"
            record_check "feature_ac" "FAIL" "bRequireAntiCheat=$ac_required"
        fi
    else
        log_fail "Feature flags: Alpha preset" "DefaultProduction.ini not found"
        record_check "feature_flags" "FAIL" "Config file missing"
    fi
}

# ── 12. AlertManager ──────────────────────────────────────────────────────────────
check_alertmanager() {
    section "AlertManager"

    if command -v curl &>/dev/null; then
        local am_health
        am_health=$(curl -sf --connect-timeout 5 \
            "http://127.0.0.1:${ALERTMANAGER_PORT}/-/healthy" 2>/dev/null || echo "")
        if [[ -n "$am_health" ]]; then
            log_pass "AlertManager healthy on port $ALERTMANAGER_PORT"
            record_check "alertmanager" "PASS" "Healthy"
        else
            log_warn "AlertManager healthy on port $ALERTMANAGER_PORT" "Not responding (may not be deployed yet)"
            record_check "alertmanager" "WARN" "Not responding"
        fi
    else
        log_warn "AlertManager healthy" "curl not available"
        record_check "alertmanager" "WARN" "curl not available"
    fi
}

# ── 13. Backup System ─────────────────────────────────────────────────────────────
check_backup_system() {
    section "Backup System"

    local backup_script="${REPO_DIR}/scripts/alpha/backup_system.sh"
    if [[ -f "$backup_script" ]]; then
        if [[ -x "$backup_script" ]]; then
            log_pass "Backup script exists and is executable"
            record_check "backup_script" "PASS" "Executable"
        else
            log_warn "Backup script exists" "Not executable (chmod +x needed)"
            record_check "backup_script" "WARN" "Not executable"
        fi
    else
        log_fail "Backup script exists" "backup_system.sh not found"
        record_check "backup_script" "FAIL" "Not found"
    fi

    # Check backup directory exists or can be created
    local backup_dir="${REPO_DIR}/backups"
    if [[ -d "$backup_dir" ]]; then
        local backup_count
        backup_count=$(ls -1 "$backup_dir" 2>/dev/null | wc -l || echo "0")
        log_pass "Backup directory exists ($backup_count backups)"
        record_check "backup_dir" "PASS" "$backup_count backups"
    else
        log_warn "Backup directory" "Does not exist (will be created on first backup)"
        record_check "backup_dir" "WARN" "Does not exist yet"
    fi
}

# =============================================================================
# MAIN
# =============================================================================

echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Khaaos Run — Alpha Deployment Readiness Verification        ║"
echo "║  Devs Ph.D | Nexus-HUB57                                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

log_info "Repository: $REPO_DIR"
log_info "Config:     $CONFIG_DIR"

# Run all checks
check_docker
check_ue5_server
check_economy_api
check_redis
check_prometheus
check_grafana
check_eos_auth
check_rate_limiter
check_ddos_protection
check_webhooks
check_feature_flags
check_alertmanager
check_backup_system

# ── Summary ────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD} READINESS REPORT${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo -e "  Total:   ${BOLD}$TOTAL${NC}"
echo -e "  Passed:  ${GREEN}${BOLD}$PASSED${NC}"
echo -e "  Failed:  ${RED}${BOLD}$FAILED${NC}"
echo -e "  Warnings:${YELLOW}${BOLD}$WARNED${NC}"
echo ""

if [[ "$FAILED" -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}✓ ALL CHECKS PASSED — Alpha deployment is READY${NC}"
else
    echo -e "${RED}${BOLD}✗ $FAILED CHECK(S) FAILED — Alpha deployment is NOT READY${NC}"
fi

# ── JSON output ────────────────────────────────────────────────────────────────────
if $JSON_OUTPUT; then
    echo ""
    echo "{"
    echo "  \"total\": $TOTAL,"
    echo "  \"passed\": $PASSED,"
    echo "  \"failed\": $FAILED,"
    echo "  \"warned\": $WARNED,"
    echo "  \"ready\": $([[ $FAILED -eq 0 ]] && echo true || echo false),"
    echo "  \"checks\": ["
    for i in "${!CHECK_NAMES[@]}"; do
        local comma=","
        if [[ $((i + 1)) -eq ${#CHECK_NAMES[@]} ]]; then comma=""; fi
        echo "    {\"name\": \"${CHECK_NAMES[$i]}\", \"result\": \"${CHECK_RESULTS[$i]}\", \"detail\": \"${CHECK_DETAILS[$i]}\"}${comma}"
    done
    echo "  ]"
    echo "}"
fi

# Exit 0 only if ALL checks PASS (warnings are OK)
if [[ "$FAILED" -gt 0 ]]; then
    exit 1
fi
exit 0
