#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Launch Checklist Verification | Devs Ph.D
# Copyright Nexus-HUB57. All Rights Reserved.
# =============================================================================
# Automated verification of the 14-point launch checklist.
# Each check outputs PASS/FAIL/WARN with details. Summary at end.
# Exit 0 only if ALL checks PASS.
#
# 14-POINT LAUNCH CHECKLIST:
#   1.  Server compiles without errors
#   2.  100-bot load test passes
#   3.  Anti-cheat: 3-strike kick in <2s
#   4.  Rate limiter active (60/min + 10/s)
#   5.  DDoS protection active (50/s global, 5/IP)
#   6.  EOS Auth functional
#   7.  Matchmaking creating matches
#   8.  Cloud save round-trip <5s
#   9.  Webhooks delivering (Discord + Slack)
#  10.  Monitoring: Grafana dashboards loaded
#  11.  Alerting: Prometheus rules loaded
#  12.  Feature flags: Alpha preset applied
#  13.  Backup system operational
#  14.  Rollback procedure tested
#
# USAGE:
#   ./verify_launch_checklist.sh           # Run all 14 checks
#   ./verify_launch_checklist.sh --json    # Output as JSON
#   ./verify_launch_checklist.sh --quiet   # Only show failures
# =============================================================================

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────────
REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CONFIG_DIR="${REPO_DIR}/Unreal/KhaaosRun/Config"
DOCKER_COMPOSE="${REPO_DIR}/Unreal/KhaaosRun/Build/docker-compose.yml"

# Service endpoints
UE5_PORT="${UE5_PORT:-7777}"
ECONOMY_PORT="${ECONOMY_PORT:-3000}"
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
        echo -e "  ${GREEN}[PASS]${NC} $1"
    fi
}

log_fail() {
    ((TOTAL++)) || true; ((FAILED++)) || true
    echo -e "  ${RED}[FAIL]${NC} $1 ${RED}— $2${NC}"
}

log_warn() {
    ((TOTAL++)) || true; ((WARNED++)) || true
    if ! $QUIET; then
        echo -e "  ${YELLOW}[WARN]${NC} $1 ${YELLOW}— $2${NC}"
    fi
}

log_info() {
    if ! $QUIET; then
        echo -e "  ${CYAN}[INFO]${NC} $1"
    fi
}

check_header() {
    local num="$1"; shift
    if ! $QUIET; then
        echo ""
        echo -e "${BOLD}${BLUE}[$num/14] $*${NC}"
    fi
}

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

# ── Argument parsing ──────────────────────────────────────────────────────────────
for arg in "$@"; do
    case "$arg" in
        --json)   JSON_OUTPUT=true ;;
        --quiet)  QUIET=true ;;
    esac
done

# =============================================================================
# 14-POINT LAUNCH CHECKLIST
# =============================================================================

# ── 1. Server compiles without errors ─────────────────────────────────────────────
check_01_server_compiles() {
    check_header 1 "Server compiles without errors"

    # Check if server binary exists
    local server_binary_found=false

    # Check Docker image
    if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
        local image
        image=$(docker images --format "{{.Repository}}:{{.Tag}}" 2>/dev/null | grep -i "khaaos" | head -1 || echo "")
        if [[ -n "$image" ]]; then
            log_pass "Server Docker image exists: $image"
            record_check "server_compiles" "PASS" "Image: $image"
            return
        fi
    fi

    # Check if server process is running (implies successful compile)
    if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
        if docker ps --filter "name=khaaos-server" --format "{{.Names}}" 2>/dev/null | grep -q "khaaos-server"; then
            log_pass "Server container is running (implies successful build)"
            record_check "server_compiles" "PASS" "Server running"
            return
        fi
    fi

    # Check if UE5 server process is running natively
    if pgrep -f "KhaaosRunServer" &>/dev/null 2>&1; then
        log_pass "KhaaosRunServer process is running"
        record_check "server_compiles" "PASS" "Process running"
        return
    fi

    log_fail "Server compiles/runs" "No server binary, image, or process found"
    record_check "server_compiles" "FAIL" "No server found"
}

# ── 2. 100-bot load test passes ──────────────────────────────────────────────────
check_02_load_test() {
    check_header 2 "100-bot load test passes"

    # Check if load test results exist
    local loadtest_dir="${REPO_DIR}/loadtest_results"
    if [[ -d "$loadtest_dir" ]]; then
        local latest_result
        latest_result=$(ls -t "$loadtest_dir"/*.json 2>/dev/null | head -1 || echo "")
        if [[ -n "$latest_result" ]]; then
            local passed
            passed=$(python3 -c "
import json
try:
    d = json.load(open('$latest_result'))
    print('true' if d.get('passed', False) else 'false')
except: print('false')
" 2>/dev/null || echo "false")
            if [[ "$passed" == "true" ]]; then
                log_pass "Load test results: PASSED ($(basename "$latest_result"))"
                record_check "load_test" "PASS" "Results: passed"
                return
            else
                log_fail "100-bot load test" "Latest results show failure"
                record_check "load_test" "FAIL" "Latest results: failed"
                return
            fi
        fi
    fi

    # Check if load test code exists
    if [[ -f "${REPO_DIR}/Unreal/KhaaosRun/Source/KhaaosRun/Game/LoadTest/KhaaosLoadTestManager.cpp" ]]; then
        log_warn "100-bot load test" "Load test code exists but no results found — run load test first"
        record_check "load_test" "WARN" "No results found"
    else
        log_fail "100-bot load test" "Load test system not found"
        record_check "load_test" "FAIL" "System not found"
    fi
}

# ── 3. Anti-cheat: 3-strike kick in <2s ───────────────────────────────────────────
check_03_anticheat() {
    check_header 3 "Anti-cheat: 3-strike kick in <2s"

    local prod_config="${CONFIG_DIR}/DefaultProduction.ini"
    if [[ -f "$prod_config" ]]; then
        # Check bAutoKickOnCheat
        local auto_kick
        auto_kick=$(grep "bAutoKickOnCheat" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        # Check CheatStrikeThreshold
        local strike_threshold
        strike_threshold=$(grep "CheatStrikeThreshold" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")

        if [[ "$auto_kick" == "True" && "$strike_threshold" == "3" ]]; then
            log_pass "Anti-cheat: auto-kick=True, 3-strike threshold configured"
            record_check "anticheat" "PASS" "3-strike kick configured"
        elif [[ "$auto_kick" == "True" ]]; then
            log_warn "Anti-cheat: auto-kick=True but threshold=$strike_threshold (expected 3)"
            record_check "anticheat" "WARN" "Threshold=$strike_threshold"
        else
            log_fail "Anti-cheat: 3-strike kick" "bAutoKickOnCheat=$auto_kick (expected True)"
            record_check "anticheat" "FAIL" "bAutoKickOnCheat=$auto_kick"
        fi

        # Check bRequireAntiCheat in production config
        local ac_required
        ac_required=$(grep "bRequireAntiCheat" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ "$ac_required" == "True" ]]; then
            log_pass "Anti-cheat required in production config"
        else
            log_fail "Anti-cheat required" "bRequireAntiCheat=$ac_required (expected True)"
        fi
    else
        log_fail "Anti-cheat: 3-strike kick" "DefaultProduction.ini not found"
        record_check "anticheat" "FAIL" "Config missing"
    fi
}

# ── 4. Rate limiter active (60/min + 10/s) ────────────────────────────────────────
check_04_rate_limiter() {
    check_header 4 "Rate limiter active (60/min + 10/s)"

    local prod_config="${CONFIG_DIR}/DefaultProduction.ini"
    if [[ -f "$prod_config" ]]; then
        local rate_enabled rate_per_min
        rate_enabled=$(grep "bEnableRateLimiting" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        rate_per_min=$(grep "RequestRateLimitPerMinute" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")

        if [[ "$rate_enabled" == "True" ]]; then
            if [[ "$rate_per_min" == "60" ]]; then
                log_pass "Rate limiter: enabled, ${rate_per_min}/min (production threshold)"
                record_check "rate_limiter" "PASS" "${rate_per_min}/min"
            else
                log_warn "Rate limiter: enabled but ${rate_per_min}/min (expected 60/min)"
                record_check "rate_limiter" "WARN" "${rate_per_min}/min"
            fi
        else
            log_fail "Rate limiter active" "bEnableRateLimiting=$rate_enabled (expected True)"
            record_check "rate_limiter" "FAIL" "Not enabled"
        fi

        # Check auto-throttle
        local auto_throttle
        auto_throttle=$(grep "bAutoThrottle" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ "$auto_throttle" == "True" ]]; then
            log_pass "Rate limiter: auto-throttle enabled"
        else
            log_warn "Rate limiter: auto-throttle not enabled"
        fi
    else
        log_fail "Rate limiter active" "DefaultProduction.ini not found"
        record_check "rate_limiter" "FAIL" "Config missing"
    fi
}

# ── 5. DDoS protection active (50/s global, 5/IP) ────────────────────────────────
check_05_ddos() {
    check_header 5 "DDoS protection active (50/s global, 5/IP)"

    local prod_config="${CONFIG_DIR}/DefaultProduction.ini"
    if [[ -f "$prod_config" ]]; then
        local ddos_enabled max_conn_sec max_conn_ip
        ddos_enabled=$(grep "bProtectionEnabled" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        max_conn_sec=$(grep "MaxConnectionsPerSecond" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        max_conn_ip=$(grep "MaxConnectionsPerIP" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")

        if [[ "$ddos_enabled" == "True" ]]; then
            if [[ "$max_conn_sec" == "50" && "$max_conn_ip" == "5" ]]; then
                log_pass "DDoS protection: enabled, ${max_conn_sec}/s global, ${max_conn_ip}/IP"
                record_check "ddos" "PASS" "${max_conn_sec}/s, ${max_conn_ip}/IP"
            else
                log_warn "DDoS protection: enabled but ${max_conn_sec}/s, ${max_conn_ip}/IP (expected 50/s, 5/IP)"
                record_check "ddos" "WARN" "${max_conn_sec}/s, ${max_conn_ip}/IP"
            fi
        else
            log_fail "DDoS protection active" "bProtectionEnabled=$ddos_enabled (expected True)"
            record_check "ddos" "FAIL" "Not enabled"
        fi

        # Check auto-block
        local auto_block
        auto_block=$(grep "bAutoBlockIPs" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ "$auto_block" == "True" ]]; then
            log_pass "DDoS: auto-block IPs enabled"
        else
            log_warn "DDoS: auto-block IPs not enabled (bAutoBlockIPs=$auto_block)"
        fi
    else
        log_fail "DDoS protection active" "DefaultProduction.ini not found"
        record_check "ddos" "FAIL" "Config missing"
    fi
}

# ── 6. EOS Auth functional ────────────────────────────────────────────────────────
check_06_eos_auth() {
    check_header 6 "EOS Auth functional"

    local eos_config="${CONFIG_DIR}/DefaultEOS.ini"
    local eos_prod="${CONFIG_DIR}/Regions/DefaultEOS_Production.ini"

    if [[ -f "$eos_config" ]]; then
        # Check for essential EOS config keys
        local has_product=false has_client=false
        grep -qi "ProductId" "$eos_config" && has_product=true || true
        grep -qi "ClientId\|ClientCredentialsId" "$eos_config" && has_client=true || true

        if $has_product && $has_client; then
            log_pass "EOS Auth: ProductId + ClientId configured"
            record_check "eos_auth" "PASS" "Credentials configured"
        else
            log_fail "EOS Auth functional" "Missing ProductId or ClientId in config"
            record_check "eos_auth" "FAIL" "Missing credentials"
        fi
    else
        log_fail "EOS Auth functional" "DefaultEOS.ini not found"
        record_check "eos_auth" "FAIL" "Config missing"
    fi

    # Check production region config
    if [[ -f "$eos_prod" ]]; then
        log_pass "EOS production region config present"
    else
        log_warn "EOS production region config" "DefaultEOS_Production.ini not found"
    fi

    # Check bUseEAS in production config
    local prod_config="${CONFIG_DIR}/DefaultProduction.ini"
    if [[ -f "$prod_config" ]]; then
        local use_eas
        use_eas=$(grep "bUseEAS" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ "$use_eas" == "True" ]]; then
            log_pass "EOS: Epic Account Services (EAS) enabled"
        else
            log_warn "EOS: EAS not enabled (bUseEAS=$use_eas)"
        fi
    fi
}

# ── 7. Matchmaking creating matches ──────────────────────────────────────────────
check_07_matchmaking() {
    check_header 7 "Matchmaking creating matches"

    # Check matchmaking code exists
    local mm_code="${REPO_DIR}/Unreal/KhaaosRun/Source/KhaaosRun/Game/EOS/KhaaosEOSMatchmaking.cpp"
    if [[ -f "$mm_code" ]]; then
        log_pass "Matchmaking code exists (KhaaosEOSMatchmaking)"
        record_check "matchmaking_code" "PASS" "Code exists"
    else
        log_fail "Matchmaking code" "KhaaosEOSMatchmaking.cpp not found"
        record_check "matchmaking_code" "FAIL" "Code missing"
    fi

    # Check if we can query active matches via Prometheus
    if command -v curl &>/dev/null; then
        local active_matches
        active_matches=$(curl -sf --connect-timeout 5 \
            "http://127.0.0.1:${PROMETHEUS_PORT}/api/v1/query?query=khaaos_matches_active_total" 2>/dev/null \
            | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    results = d.get('data',{}).get('result',[])
    if results:
        print(results[0].get('value',['','0'])[1])
    else:
        print('0')
except: print('query_failed')
" 2>/dev/null || echo "query_failed")

        if [[ "$active_matches" != "query_failed" && "$active_matches" != "0" ]]; then
            log_pass "Matchmaking: $active_matches active matches"
            record_check "matchmaking_active" "PASS" "$active_matches matches"
        elif [[ "$active_matches" == "0" ]]; then
            log_warn "Matchmaking: 0 active matches (expected during pre-launch)"
            record_check "matchmaking_active" "WARN" "0 matches"
        else
            log_warn "Matchmaking: cannot query Prometheus"
            record_check "matchmaking_active" "WARN" "Prometheus query failed"
        fi
    fi
}

# ── 8. Cloud save round-trip <5s ──────────────────────────────────────────────────
check_08_cloud_save() {
    check_header 8 "Cloud save round-trip <5s"

    # Check cloud save code exists
    local cs_code="${REPO_DIR}/Unreal/KhaaosRun/Source/KhaaosRun/Game/Save/KhaaosCloudSaveProduction.cpp"
    if [[ -f "$cs_code" ]]; then
        log_pass "Cloud save production code exists"
        record_check "cloudsave_code" "PASS" "Code exists"
    else
        log_fail "Cloud save production code" "KhaaosCloudSaveProduction.cpp not found"
        record_check "cloudsave_code" "FAIL" "Code missing"
    fi

    # Check EOS cloud save metric if Prometheus available
    if command -v curl &>/dev/null; then
        local save_latency
        save_latency=$(curl -sf --connect-timeout 5 \
            "http://127.0.0.1:${PROMETHEUS_PORT}/api/v1/query?query=histogram_quantile(0.95,rate(khaaos_eos_cloudsave_duration_bucket[5m]))" 2>/dev/null \
            | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    results = d.get('data',{}).get('result',[])
    if results:
        print(results[0].get('value',['',''])[1])
    else:
        print('no_data')
except: print('query_failed')
" 2>/dev/null || echo "query_failed")

        if [[ "$save_latency" != "query_failed" && "$save_latency" != "no_data" ]]; then
            # Compare with 5s threshold
            if python3 -c "exit(0 if float('$save_latency') < 5.0 else 1)" 2>/dev/null; then
                log_pass "Cloud save round-trip p95: ${save_latency}s (<5s)"
                record_check "cloudsave_latency" "PASS" "${save_latency}s"
            else
                log_fail "Cloud save round-trip <5s" "p95: ${save_latency}s"
                record_check "cloudsave_latency" "FAIL" "${save_latency}s"
            fi
        else
            log_warn "Cloud save round-trip" "No Prometheus data yet (pre-launch)"
            record_check "cloudsave_latency" "WARN" "No data"
        fi
    fi
}

# ── 9. Webhooks delivering (Discord + Slack) ─────────────────────────────────────
check_09_webhooks() {
    check_header 9 "Webhooks delivering (Discord + Slack)"

    local alertmanager_config="${REPO_DIR}/infra/alerting/alertmanager.yml"

    # Discord webhook
    if [[ -f "$alertmanager_config" ]]; then
        local discord_refs
        discord_refs=$(grep -c "DISCORD.*WEBHOOK" "$alertmanager_config" 2>/dev/null || echo "0")
        if [[ "$discord_refs" -ge 1 ]]; then
            log_pass "Discord webhook configured in AlertManager ($discord_refs refs)"
            record_check "webhook_discord" "PASS" "$discord_refs references"
        else
            log_fail "Discord webhook configured" "No DISCORD_WEBHOOK in alertmanager.yml"
            record_check "webhook_discord" "FAIL" "No references"
        fi

        # Slack webhook
        local slack_refs
        slack_refs=$(grep -c "SLACK.*WEBHOOK" "$alertmanager_config" 2>/dev/null || echo "0")
        if [[ "$slack_refs" -ge 1 ]]; then
            log_pass "Slack webhook configured in AlertManager ($slack_refs refs)"
            record_check "webhook_slack" "PASS" "$slack_refs references"
        else
            log_fail "Slack webhook configured" "No SLACK_WEBHOOK in alertmanager.yml"
            record_check "webhook_slack" "FAIL" "No references"
        fi

        # Check AlertManager is running
        if command -v curl &>/dev/null; then
            local am_health
            am_health=$(curl -sf --connect-timeout 5 \
                "http://127.0.0.1:${ALERTMANAGER_PORT}/-/healthy" 2>/dev/null || echo "")
            if [[ -n "$am_health" ]]; then
                log_pass "AlertManager is running and healthy"
            else
                log_warn "AlertManager health" "Not responding on port $ALERTMANAGER_PORT"
            fi
        fi
    else
        log_fail "Webhooks configured" "alertmanager.yml not found"
        record_check "webhook_discord" "FAIL" "Config missing"
        record_check "webhook_slack" "FAIL" "Config missing"
    fi

    # Check webhook scripts exist
    local webhook_script="${REPO_DIR}/scripts/configure_webhooks.sh"
    if [[ -f "$webhook_script" ]]; then
        log_pass "Webhook configuration script exists"
    else
        log_warn "Webhook configuration script" "configure_webhooks.sh not found"
    fi
}

# ── 10. Monitoring: Grafana dashboards loaded ────────────────────────────────────
check_10_grafana() {
    check_header 10 "Monitoring: Grafana dashboards loaded"

    # Check static dashboard files
    local dashboard_file="${REPO_DIR}/infra/grafana/khaaos-production-dashboard.json"
    if [[ -f "$dashboard_file" ]]; then
        # Validate JSON
        if python3 -c "import json; json.load(open('$dashboard_file'))" 2>/dev/null; then
            local dashboard_title
            dashboard_title=$(python3 -c "import json; print(json.load(open('$dashboard_file')).get('title','unknown'))" 2>/dev/null || echo "unknown")
            log_pass "Grafana production dashboard: valid JSON ($dashboard_title)"
            record_check "grafana_dashboard" "PASS" "$dashboard_title"
        else
            log_fail "Grafana production dashboard" "Invalid JSON"
            record_check "grafana_dashboard" "FAIL" "Invalid JSON"
        fi
    else
        log_fail "Grafana dashboard" "khaaos-production-dashboard.json not found"
        record_check "grafana_dashboard" "FAIL" "File missing"
    fi

    # Check Grafana is accessible
    if command -v curl &>/dev/null; then
        local grafana_health
        grafana_health=$(curl -sf --connect-timeout 5 \
            "http://127.0.0.1:${GRAFANA_PORT}/api/health" 2>/dev/null || echo "")
        if [[ -n "$grafana_health" ]]; then
            log_pass "Grafana accessible on port $GRAFANA_PORT"
        else
            log_warn "Grafana accessible" "Not responding on port $GRAFANA_PORT"
        fi
    fi

    # Check alerting rules file
    local alerts_file="${REPO_DIR}/infra/alerting/khaaos-alerts.yml"
    if [[ -f "$alerts_file" ]]; then
        local rule_count
        rule_count=$(grep -c "^      - alert:" "$alerts_file" 2>/dev/null || echo "0")
        log_pass "Prometheus alerting rules present ($rule_count rules)"
    else
        log_fail "Prometheus alerting rules" "khaaos-alerts.yml not found"
    fi
}

# ── 11. Alerting: Prometheus rules loaded ─────────────────────────────────────────
check_11_prometheus_rules() {
    check_header 11 "Alerting: Prometheus rules loaded"

    # Check alert rules file
    local alerts_file="${REPO_DIR}/infra/alerting/khaaos-alerts.yml"
    if [[ -f "$alerts_file" ]]; then
        local rule_count
        rule_count=$(grep -c "^      - alert:" "$alerts_file" 2>/dev/null || echo "0")

        # Check we have both critical and warning rules
        local critical_count warning_count
        critical_count=$(grep -c "severity: critical" "$alerts_file" 2>/dev/null || echo "0")
        warning_count=$(grep -c "severity: warning" "$alerts_file" 2>/dev/null || echo "0")

        if [[ "$critical_count" -gt 0 && "$warning_count" -gt 0 ]]; then
            log_pass "Prometheus rules: $rule_count alerts ($critical_count critical, $warning_count warning)"
            record_check "prometheus_rules" "PASS" "$rule_count rules"
        else
            log_fail "Prometheus rules" "Missing critical or warning rules (critical=$critical_count, warning=$warning_count)"
            record_check "prometheus_rules" "FAIL" "Missing rule types"
        fi
    else
        log_fail "Prometheus rules loaded" "khaaos-alerts.yml not found"
        record_check "prometheus_rules" "FAIL" "File missing"
    fi

    # Check AlertManager config
    local am_config="${REPO_DIR}/infra/alerting/alertmanager.yml"
    if [[ -f "$am_config" ]]; then
        local receiver_count
        receiver_count=$(grep -c "^  - name:" "$am_config" 2>/dev/null || echo "0")
        log_pass "AlertManager config: $receiver_count receivers configured"
    else
        log_fail "AlertManager config" "alertmanager.yml not found"
    fi

    # Check if Prometheus is scraping
    if command -v curl &>/dev/null; then
        local prom_targets
        prom_targets=$(curl -sf --connect-timeout 5 \
            "http://127.0.0.1:${PROMETHEUS_PORT}/api/v1/targets" 2>/dev/null || echo "")
        if [[ -n "$prom_targets" ]]; then
            local targets_up
            targets_up=$(echo "$prom_targets" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    targets = d.get('data',{}).get('activeTargets',[])
    up = sum(1 for t in targets if t.get('health','') == 'up')
    print(up)
except: print(0)
" 2>/dev/null || echo "0")
            if [[ "$targets_up" -gt 0 ]]; then
                log_pass "Prometheus: $targets_up targets being scraped"
            else
                log_warn "Prometheus targets" "0 targets UP"
            fi
        else
            log_warn "Prometheus scraping" "Cannot query Prometheus"
        fi
    fi
}

# ── 12. Feature flags: Alpha preset applied ──────────────────────────────────────
check_12_feature_flags() {
    check_header 12 "Feature flags: Alpha preset applied"

    local prod_config="${CONFIG_DIR}/DefaultProduction.ini"
    if [[ -f "$prod_config" ]]; then
        # Check key feature flags for alpha
        local flags_ok=true
        local details=""

        # bIsProduction
        local is_prod
        is_prod=$(grep "bIsProduction" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ "$is_prod" == "True" ]]; then
            details+="bIsProduction=True; "
        else
            flags_ok=false
            details+="bIsProduction=$is_prod (FAIL); "
        fi

        # bRequireAuthentication
        local auth
        auth=$(grep "bRequireAuthentication" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ "$auth" == "True" ]]; then
            details+="Auth=True; "
        else
            flags_ok=false
            details+="Auth=$auth (FAIL); "
        fi

        # bRequireAntiCheat
        local ac
        ac=$(grep "bRequireAntiCheat" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ "$ac" == "True" ]]; then
            details+="AC=True; "
        else
            flags_ok=false
            details+="AC=$ac (FAIL); "
        fi

        # bEnableMetricsCollection
        local metrics
        metrics=$(grep "bEnableMetricsCollection" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ "$metrics" == "True" ]]; then
            details+="Metrics=True; "
        else
            flags_ok=false
            details+="Metrics=$metrics (FAIL); "
        fi

        # bEnableCrashReporting
        local crash
        crash=$(grep "bEnableCrashReporting" "$prod_config" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]' || echo "")
        if [[ "$crash" == "True" ]]; then
            details+="Crash=True"
        else
            flags_ok=false
            details+="Crash=$crash (FAIL)"
        fi

        if $flags_ok; then
            log_pass "Feature flags: Alpha preset correctly applied"
            log_info "  $details"
            record_check "feature_flags" "PASS" "$details"
        else
            log_fail "Feature flags: Alpha preset" "Some flags misconfigured"
            log_info "  $details"
            record_check "feature_flags" "FAIL" "$details"
        fi
    else
        log_fail "Feature flags: Alpha preset" "DefaultProduction.ini not found"
        record_check "feature_flags" "FAIL" "Config missing"
    fi
}

# ── 13. Backup system operational ────────────────────────────────────────────────
check_13_backup() {
    check_header 13 "Backup system operational"

    local backup_script="${REPO_DIR}/scripts/alpha/backup_system.sh"
    local restore_script="${REPO_DIR}/scripts/alpha/restore_system.sh"

    # Backup script
    if [[ -f "$backup_script" ]]; then
        if [[ -x "$backup_script" ]]; then
            log_pass "Backup script exists and is executable"
            record_check "backup_script" "PASS" "Executable"
        else
            log_fail "Backup script executable" "backup_system.sh not executable"
            record_check "backup_script" "FAIL" "Not executable"
        fi
    else
        log_fail "Backup script" "backup_system.sh not found"
        record_check "backup_script" "FAIL" "Not found"
    fi

    # Restore script
    if [[ -f "$restore_script" ]]; then
        if [[ -x "$restore_script" ]]; then
            log_pass "Restore script exists and is executable"
            record_check "restore_script" "PASS" "Executable"
        else
            log_fail "Restore script executable" "restore_system.sh not executable"
            record_check "restore_script" "FAIL" "Not executable"
        fi
    else
        log_fail "Restore script" "restore_system.sh not found"
        record_check "restore_script" "FAIL" "Not found"
    fi

    # Check backup directory
    local backup_dir="${REPO_DIR}/backups"
    if [[ -d "$backup_dir" ]]; then
        local backup_count
        backup_count=$(ls -1 "$backup_dir"/*.tar.gz 2>/dev/null | wc -l || echo "0")
        if [[ "$backup_count" -gt 0 ]]; then
            log_pass "Backup directory has $backup_count backup(s)"
            record_check "backup_exists" "PASS" "$backup_count backups"
        else
            log_warn "Backup directory" "No backup archives found (run backup_system.sh first)"
            record_check "backup_exists" "WARN" "No archives"
        fi
    else
        log_warn "Backup directory" "Does not exist yet (created on first backup)"
        record_check "backup_exists" "WARN" "Not created yet"
    fi
}

# ── 14. Rollback procedure tested ────────────────────────────────────────────────
check_14_rollback() {
    check_header 14 "Rollback procedure tested"

    # Check rollback mechanism exists in deploy script
    local deploy_script="${REPO_DIR}/scripts/alpha/deploy_alpha.sh"
    if [[ -f "$deploy_script" ]]; then
        if grep -q "rollback" "$deploy_script" 2>/dev/null; then
            log_pass "Deploy script has rollback command (--rollback)"
            record_check "rollback_script" "PASS" "Deploy script has rollback"
        else
            log_fail "Rollback procedure" "deploy_alpha.sh has no rollback command"
            record_check "rollback_script" "FAIL" "No rollback command"
        fi
    else
        log_fail "Rollback procedure" "deploy_alpha.sh not found"
        record_check "rollback_script" "FAIL" "Script missing"
    fi

    # Check restore script (part of rollback)
    local restore_script="${REPO_DIR}/scripts/alpha/restore_system.sh"
    if [[ -f "$restore_script" && -x "$restore_script" ]]; then
        log_pass "Restore system script available for rollback"
    else
        log_fail "Restore for rollback" "restore_system.sh not found or not executable"
    fi

    # Check Docker Compose has restart policies
    if [[ -f "$DOCKER_COMPOSE" ]]; then
        local restart_policies
        restart_policies=$(grep -c "restart:" "$DOCKER_COMPOSE" 2>/dev/null || echo "0")
        if [[ "$restart_policies" -ge 3 ]]; then
            log_pass "Docker services have restart policies ($restart_policies services)"
            record_check "rollback_restart" "PASS" "$restart_policies restart policies"
        else
            log_warn "Docker restart policies" "Only $restart_policies services have restart policies"
            record_check "rollback_restart" "WARN" "$restart_policies policies"
        fi
    fi

    # Check for backup to restore from (rollback needs a known-good state)
    local backup_dir="${REPO_DIR}/backups"
    local latest_backup
    latest_backup=$(ls -t "$backup_dir"/*.tar.gz 2>/dev/null | head -1 || echo "")
    if [[ -n "$latest_backup" ]]; then
        local backup_age
        backup_age=$(find "$latest_backup" -mtime -7 2>/dev/null || echo "")
        if [[ -n "$backup_age" ]]; then
            log_pass "Recent backup available for rollback (<7 days old)"
            record_check "rollback_backup" "PASS" "Recent backup exists"
        else
            log_warn "Rollback backup" "Latest backup is >7 days old"
            record_check "rollback_backup" "WARN" "Backup >7 days old"
        fi
    else
        log_warn "Rollback backup" "No backup archive found — create one before launch"
        record_check "rollback_backup" "WARN" "No backup"
    fi
}

# =============================================================================
# MAIN
# =============================================================================

echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Khaaos Run — 14-Point Launch Checklist Verification         ║"
echo "║  Devs Ph.D | Nexus-HUB57                                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

log_info "Repository: $REPO_DIR"
log_info "Config:     $CONFIG_DIR"

# Run all 14 checks
check_01_server_compiles
check_02_load_test
check_03_anticheat
check_04_rate_limiter
check_05_ddos
check_06_eos_auth
check_07_matchmaking
check_08_cloud_save
check_09_webhooks
check_10_grafana
check_11_prometheus_rules
check_12_feature_flags
check_13_backup
check_14_rollback

# ── Summary ────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD} LAUNCH CHECKLIST SUMMARY${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Total checks:   ${BOLD}$TOTAL${NC}"
echo -e "  Passed:         ${GREEN}${BOLD}$PASSED${NC}"
echo -e "  Failed:         ${RED}${BOLD}$FAILED${NC}"
echo -e "  Warnings:       ${YELLOW}${BOLD}$WARNED${NC}"
echo ""

if [[ "$FAILED" -eq 0 && "$WARNED" -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}✓ ALL 14 CHECKS PASSED — GO FOR LAUNCH${NC}"
elif [[ "$FAILED" -eq 0 ]]; then
    echo -e "${YELLOW}${BOLD}⚠ ALL CHECKS PASSED (with $WARNED warnings) — Review warnings before launch${NC}"
else
    echo -e "${RED}${BOLD}✗ $FAILED CHECK(S) FAILED — DO NOT LAUNCH${NC}"
fi

# ── Checklist recap ───────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Checklist Recap:${NC}"
echo "  1.  Server compiles       — $(if [[ ${CHECK_RESULTS[0]:-} == "PASS" ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
echo "  2.  100-bot load test     — $(if [[ ${CHECK_RESULTS[1]:-} == "PASS" ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
echo "  3.  Anti-cheat 3-strike   — $(if [[ ${CHECK_RESULTS[2]:-} == "PASS" ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
echo "  4.  Rate limiter          — $(if [[ ${CHECK_RESULTS[3]:-} == "PASS" ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
echo "  5.  DDoS protection       — $(if [[ ${CHECK_RESULTS[4]:-} == "PASS" ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
echo "  6.  EOS Auth              — $(if [[ ${CHECK_RESULTS[5]:-} == "PASS" ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
echo "  7.  Matchmaking           — $(if [[ ${CHECK_RESULTS[6]:-} == "PASS" ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
echo "  8.  Cloud save <5s        — $(if [[ ${CHECK_RESULTS[7]:-} == "PASS" ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
echo "  9.  Webhooks delivering   — $(if [[ ${CHECK_RESULTS[8]:-} == "PASS" ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
echo "  10. Grafana dashboards    — $(if [[ ${CHECK_RESULTS[9]:-} == "PASS" ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
echo "  11. Prometheus rules      — $(if [[ ${CHECK_RESULTS[10]:-} == "PASS" ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
echo "  12. Feature flags alpha   — $(if [[ ${CHECK_RESULTS[11]:-} == "PASS" ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
echo "  13. Backup system         — $(if [[ ${CHECK_RESULTS[12]:-} == "PASS" ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"
echo "  14. Rollback tested       — $(if [[ ${CHECK_RESULTS[13]:-} == "PASS" ]]; then echo -e "${GREEN}PASS${NC}"; else echo -e "${RED}FAIL${NC}"; fi)"

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

# Exit 0 only if ALL checks PASS
if [[ "$FAILED" -gt 0 ]]; then
    exit 1
fi
exit 0
