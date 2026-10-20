#!/usr/bin/env bash
# ============================================================================
# Khaaos Run — Webhook Configuration (Discord + Slack)
# ============================================================================
# Configures real webhook URLs for CI/CD notifications.
#
# USAGE:
#   bash configure_webhooks.sh --discord <URL> --slack <URL>
#   bash configure_webhooks.sh --discord <URL>              # Discord only
#   bash configure_webhooks.sh --slack <URL>                # Slack only
#   bash configure_webhooks.sh --verify                     # Test current webhooks
#   bash configure_webhooks.sh --gh-secrets                 # Set as GitHub Actions secrets
#
# DISCORD WEBHOOK FORMAT:
#   https://discord.com/api/webhooks/<WEBHOOK_ID>/<WEBHOOK_TOKEN>
#
# SLACK WEBHOOK FORMAT:
#   https://hooks.[SLACK]/services/T.../B.../...  (replace [SLACK] with service name)
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
GH_BIN="${GH_BIN:-/home/z/my-project/.local/bin/gh}"

DISCORD_URL=""
SLACK_URL=""

# ─── Parse Arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --discord)  DISCORD_URL="$2"; shift 2 ;;
        --slack)    SLACK_URL="$2"; shift 2 ;;
        --verify)   VERIFY=true; shift ;;
        --gh-secrets) GH_SECRETS=true; shift ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

# ─── Validate Webhook URLs ────────────────────────────────────────────────────
validate_discord() {
    local url="$1"
    if [[ ! "${url}" =~ ^https://discord\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$ ]]; then
        echo "[ERR] Invalid Discord webhook URL format"
        echo "      Expected: https://discord.com/api/webhooks/<ID>/<TOKEN>"
        return 1
    fi
    echo "[OK]  Discord webhook URL format valid"
    return 0
}

validate_slack() {
    local url="$1"
    if [[ ! "${url}" =~ ^https://hooks\.[a-z]+\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[A-Za-z0-9]+$ ]]; then
        echo "[ERR] Invalid Slack webhook URL format"
        echo "      Expected: https://hooks.<slack-domain>/services/T.../B.../..."
        return 1
    fi
    echo "[OK]  Slack webhook URL format valid"
    return 0
}

# ─── Test Webhook (send a test message) ───────────────────────────────────────
test_discord() {
    local url="$1"
    echo "[INFO] Sending test message to Discord..."
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -d '{"content":"🎮 Khaaos Run CI/CD — Webhook test successful!","username":"Khaaos CI"}' \
        "${url}")
    if [[ "${response}" == "204" || "${response}" == "200" ]]; then
        echo "[OK]  Discord webhook test: PASS (HTTP ${response})"
    else
        echo "[ERR] Discord webhook test: FAIL (HTTP ${response})"
        return 1
    fi
}

test_slack() {
    local url="$1"
    echo "[INFO] Sending test message to Slack..."
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -d '{"text":"🎮 Khaaos Run CI/CD — Webhook test successful!","username":"Khaaos CI","icon_emoji":":video_game:"}' \
        "${url}")
    if [[ "${response}" == "200" ]]; then
        echo "[OK]  Slack webhook test: PASS (HTTP ${response})"
    else
        echo "[ERR] Slack webhook test: FAIL (HTTP ${response})"
        return 1
    fi
}

# ─── Set GitHub Actions Secrets ──────────────────────────────────────────────
set_gh_secrets() {
    echo "[INFO] Setting GitHub Actions secrets for Nexus-HUB57/Khaaos_Run..."

    if [[ ! -x "${GH_BIN}" ]]; then
        echo "[ERR] gh CLI not found at ${GH_BIN}"
        return 1
    fi

    if [[ -n "${DISCORD_URL}" ]]; then
        echo "${DISCORD_URL}" | "${GH_BIN}" secret set DISCORD_WEBHOOK_URL --repo Nexus-HUB57/Khaaos_Run
        echo "[OK]  DISCORD_WEBHOOK_URL set as GitHub secret"
    fi

    if [[ -n "${SLACK_URL}" ]]; then
        echo "${SLACK_URL}" | "${GH_BIN}" secret set SLACK_WEBHOOK_URL --repo Nexus-HUB57/Khaaos_Run
        echo "[OK]  SLACK_WEBHOOK_URL set as GitHub secret"
    fi
}

# ─── Save to local config ─────────────────────────────────────────────────────
save_local_config() {
    local CONFIG_FILE="${REPO_DIR}/Unreal/KhaaosRun/Config/DefaultWebhooks.ini"
    echo "[INFO] Saving webhook config to ${CONFIG_FILE}..."

    cat > "${CONFIG_FILE}" << EOF
[/Script/KhaaosRun.WebhookConfig]
; Khaaos Run — Webhook Configuration
; DO NOT commit real URLs to the repository — use GitHub Actions secrets instead
; This file is for local development reference only

; Discord webhook for CI/CD notifications (build status, PR events, deploy alerts)
; Format: https://discord.com/api/webhooks/<ID>/<TOKEN>
DiscordWebhookUrl=

; Slack webhook for CI/CD notifications (same events as Discord)
; Format: https://hooks.<slack-domain>/services/T.../B.../...
SlackWebhookUrl=

; Notification preferences
bNotifyOnBuildSuccess=true
bNotifyOnBuildFailure=true
bNotifyOnPRCreated=true
bNotifyOnPRMerged=true
bNotifyOnDeploySuccess=true
bNotifyOnDeployFailure=true
bNotifyOnSecurityAlert=true
EOF
    echo "[OK]  Local config template saved (URLs NOT stored in file — use GitHub secrets)"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Khaaos Run — Webhook Configuration (Discord + Slack)  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Configure
if [[ -n "${DISCORD_URL}" ]]; then
    validate_discord "${DISCORD_URL}" && test_discord "${DISCORD_URL}"
fi

if [[ -n "${SLACK_URL}" ]]; then
    validate_slack "${SLACK_URL}" && test_slack "${SLACK_URL}"
fi

# Verify existing
if [[ "${VERIFY:-false}" == "true" ]]; then
    echo "[INFO] Verifying current GitHub Actions secrets..."
    if [[ -x "${GH_BIN}" ]]; then
        "${GH_BIN}" secret list --repo Nexus-HUB57/Khaaos_Run
    fi
fi

# Set GitHub secrets
if [[ "${GH_SECRETS:-false}" == "true" ]]; then
    set_gh_secrets
fi

# Save local template
save_local_config

echo ""
echo "[DONE] Webhook configuration complete."
echo "       Real URLs are stored ONLY in GitHub Actions secrets (never in repo)."
echo "       CI/CD workflows will use secrets.DISCORD_WEBHOOK_URL and secrets.SLACK_WEBHOOK_URL."
