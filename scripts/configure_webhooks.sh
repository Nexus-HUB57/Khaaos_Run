#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Webhook Setup (Discord + Slack)
# Run this script with your webhook URLs to configure GitHub Actions secrets
# =============================================================================
set -euo pipefail

export PATH="/home/z/my-project/.local/bin:$PATH"
REPO="Nexus-HUB57/Khaaos_Run"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[✅]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[⚠️]${NC} $*"; }

if ! gh auth status &>/dev/null; then
  echo -e "${RED}gh CLI not authenticated${NC}"; exit 1
fi

# ── Discord ──
echo ""
log_info "━━━ Discord Webhook ━━━"
if [[ -n "${1:-}" ]]; then
  echo "$1" | gh secret set DISCORD_WEBHOOK_URL --repo "$REPO"
  log_success "DISCORD_WEBHOOK_URL configured!"
else
  log_warn "No Discord URL provided. Usage: $0 <discord_webhook_url> [slack_webhook_url]"
  log_info "Or set manually: gh secret set DISCORD_WEBHOOK_URL --repo $REPO"
fi

# ── Slack ──
echo ""
log_info "━━━ Slack Webhook ━━━"
if [[ -n "${2:-}" ]]; then
  echo "$2" | gh secret set SLACK_WEBHOOK_URL --repo "$REPO"
  log_success "SLACK_WEBHOOK_URL configured!"
else
  log_warn "No Slack URL provided. Optionally: $0 <discord> <slack_webhook_url>"
  log_info "Or set manually: gh secret set SLACK_WEBHOOK_URL --repo $REPO"
fi

# ── Verify ──
echo ""
log_info "━━━ Configured Secrets ━━━"
gh secret list --repo "$REPO" 2>/dev/null || echo "(none)"
log_success "Done!"
