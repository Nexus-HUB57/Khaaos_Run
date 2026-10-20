#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Remote Sync & GitHub Push Automation
# Nexus-HUB57 | Copyright 2026. All Rights Reserved.
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[✅]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[⚠️]${NC} $*"; }
log_error()   { echo -e "${RED}[❌]${NC} $*"; }

REPO_URL_SSH="git@github.com:Nexus-HUB57/Khaaos_Run.git"
REPO_URL_HTTPS="https://github.com/Nexus-HUB57/Khaaos_Run.git"

log_info "Verificando conectividade e autenticação com GitHub ($REPO_URL_SSH)..."

# 1. Pre-flight Console Protection check
bash "$(dirname "$0")/khaaos_workflow.sh" --check-overlaps

# 2. Check SSH Authentication
CAN_PUSH_SSH=false
if ssh -T -o StrictHostKeyChecking=no -o ConnectTimeout=5 git@github.com 2>&1 | grep -iqE "successfully authenticated|Nexus-HUB57"; then
  CAN_PUSH_SSH=true
  log_success "Autenticação SSH com GitHub verificada com sucesso!"
fi

# 3. Check GitHub Token Authentication
CAN_PUSH_TOKEN=false
TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ -n "$TOKEN" ]]; then
  CAN_PUSH_TOKEN=true
  log_success "Token GitHub (GH_TOKEN/GITHUB_TOKEN) detectado no ambiente!"
fi

BRANCHES=(
  "feat/pr61-game-hierarchy-e2e-subsystem"
  "feat/pr62-16-operatives-ethnic-avatars-studio"
  "feat/pr63-ue5-portable-verification-pipeline"
  "pr-48/merge-main-into-feat-console-e2e-phases-1-4"
)

if [[ "$CAN_PUSH_SSH" == true ]]; then
  git remote set-url origin "$REPO_URL_SSH"
  log_info "Enviando atualizações via SSH (git@github.com:Nexus-HUB57/Khaaos_Run.git)..."
  for branch in "${BRANCHES[@]}"; do
    log_info "Povoando branch $branch..."
    git push origin "$branch:$branch" || log_warn "Não foi possível dar push direto em $branch"
  done
  log_success "Repositório GitHub atualizado com sucesso via SSH!"
elif [[ "$CAN_PUSH_TOKEN" == true ]]; then
  AUTH_HTTPS="https://${TOKEN}@github.com/Nexus-HUB57/Khaaos_Run.git"
  git remote set-url origin "$AUTH_HTTPS"
  log_info "Enviando atualizações via HTTPS com Token de Autenticação..."
  for branch in "${BRANCHES[@]}"; do
    log_info "Povoando branch $branch..."
    git push origin "$branch:$branch" || log_warn "Não foi possível dar push direto em $branch"
  done
  git remote set-url origin "$REPO_URL_HTTPS"
  log_success "Repositório GitHub atualizado com sucesso via HTTPS Token!"
else
  log_error "Autenticação pendente para git@github.com:Nexus-HUB57/Khaaos_Run.git"
  echo ""
  echo -e "${YELLOW}Para autorizar o envio ao GitHub, escolha UMA das opções abaixo:${NC}"
  echo ""
  echo -e "${CYAN}Opção 1 (Chave SSH — Recomendado):${NC}"
  echo "Adicione a chave pública abaixo como Deploy Key (com permissão de escrita) em:"
  echo "👉 https://github.com/Nexus-HUB57/Khaaos_Run/settings/keys"
  echo ""
  echo -e "${GREEN}$(cat ~/.ssh/id_ed25519.pub 2>/dev/null || echo "(chave não encontrada)")${NC}"
  echo ""
  echo -e "${CYAN}Opção 2 (Personal Access Token / PAT):${NC}"
  echo "Execute o comando com seu token (escopo 'repo'):"
  echo "👉 export GITHUB_TOKEN=\"ghp_seu_token_aqui\" && bash scripts/push_to_github.sh"
  echo ""
  exit 1
fi
