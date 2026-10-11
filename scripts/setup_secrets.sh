#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Secrets Configuration Script
# Sets up GitHub Actions secrets for CI/CD notifications
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[✅]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[⚠️]${NC} $*"; }
log_error()   { echo -e "${RED}[❌]${NC} $*"; }

export PATH="/home/z/my-project/.local/bin:$PATH"
REPO="Nexus-HUB57/Khaaos_Run"

# Verify gh auth
if ! gh auth status &>/dev/null; then
  log_error "gh CLI not authenticated. Run: gh auth login"
  exit 1
fi

log_info "Khaaos Run — Secrets Configuration"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check current secrets
log_info "Current secrets:"
CURRENT=$(gh secret list --repo "$REPO" 2>/dev/null || echo "(none)")
echo "$CURRENT"

# ── DISCORD_WEBHOOK_URL ──
log_info ""
log_info "Configuring DISCORD_WEBHOOK_URL..."
log_info "Format: https://discord.com/api/webhooks/<webhook_id>/<webhook_token>"
log_info ""
log_info "Steps to get Discord webhook:"
log_info "  1. Open Discord → Server Settings → Integrations → Webhooks"
log_info "  2. Click 'New Webhook'"
log_info "  3. Name it 'Khaaos CI/CD'"
log_info "  4. Copy the Webhook URL"
log_info ""

if [[ -n "${DISCORD_WEBHOOK_URL:-}" ]]; then
  log_success "DISCORD_WEBHOOK_URL found in environment"
  echo "$DISCORD_WEBHOOK_URL" | gh secret set DISCORD_WEBHOOK_URL --repo "$REPO"
  log_success "Secret DISCORD_WEBHOOK_URL set!"
else
  log_warn "DISCORD_WEBHOOK_URL not in environment"
  log_info "To set manually:"
  log_info "  gh secret set DISCORD_WEBHOOK_URL --repo $REPO"
  log_info "  (then paste the URL and press Ctrl+D)"
fi

# ── SLACK_WEBHOOK_URL ──
log_info ""
log_info "Configuring SLACK_WEBHOOK_URL..."
log_info "Format: https://hooks.slack.com/services/<workspace>/<channel>/<token>"
log_info ""
log_info "Steps to get Slack webhook:"
log_info "  1. Open Slack → App Management → Custom Integrations → Incoming WebHooks"
log_info "  2. Select channel '#khaaos-ci'"
log_info "  3. Copy the Webhook URL"
log_info ""

if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
  log_success "SLACK_WEBHOOK_URL found in environment"
  echo "$SLACK_WEBHOOK_URL" | gh secret set SLACK_WEBHOOK_URL --repo "$REPO"
  log_success "Secret SLACK_WEBHOOK_URL set!"
else
  log_warn "SLACK_WEBHOOK_URL not in environment"
  log_info "To set manually:"
  log_info "  gh secret set SLACK_WEBHOOK_URL --repo $REPO"
  log_info "  (then paste the URL and press Ctrl+D)"
fi

# ── NEXUS_HUB57_PAT (for cross-repo access) ──
log_info ""
log_info "Configuring NEXUS_HUB57_PAT (optional — for cross-repo CI access)..."
if [[ -n "${NEXUS_HUB57_PAT:-}" ]]; then
  log_success "NEXUS_HUB57_PAT found in environment"
  echo "$NEXUS_HUB57_PAT" | gh secret set NEXUS_HUB57_PAT --repo "$REPO"
  log_success "Secret NEXUS_HUB57_PAT set!"
else
  log_warn "NEXUS_HUB57_PAT not in environment — optional for now"
fi

# ── Verify ──
log_info ""
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Configured secrets:"
gh secret list --repo "$REPO" 2>/dev/null || echo "(none)"
log_success "Done! CI/CD notifications are now configured."
