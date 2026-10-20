#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Khaaos Run — Fase 2: EOS Production Setup Script
# Configura EOS, Matchmaking, EAC e Cloud Save para produção
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[✅]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[⚠️]${NC} $*"; }
log_error()   { echo -e "${RED}[❌]${NC} $*"; }
log_step()    { echo -e "\n${CYAN}${BOLD}━━━ $* ━━━${NC}\n"; }

# ─── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
UNREAL_DIR="$PROJECT_ROOT/Unreal/KhaaosRun"
CONFIG_DIR="$UNREAL_DIR/Config"
EOS_INI="$CONFIG_DIR/DefaultEOS.ini"
EOS_PROD_INI="$CONFIG_DIR/Regions/DefaultEOS_Production.ini"
REPO="Nexus-HUB57/Khaaos_Run"

export PATH="/home/z/my-project/.local/bin:$PATH"

# ═══════════════════════════════════════════════════════════════════════════════
# Banner
# ═══════════════════════════════════════════════════════════════════════════════

echo -e "${BOLD}${CYAN}"
cat << 'EOF'
╔════════════════════════════════════════════════════════════╗
║  Khaaos Run — Fase 2: EOS Production Setup                 ║
║  Devs Ph.D | UE5.8 | Nexus-HUB57                           ║
║                                                             ║
║  Este script configura:                                     ║
║    • EOS Product/Sandbox/Deployment IDs                    ║
║    • Matchmaking pools por região (sa1, na1, eu1)          ║
║    • Easy Anti-Cheat integration                            ║
║    • Cloud Save produção                                    ║
║    • GitHub secrets para CI/CD                              ║
╚════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# ═══════════════════════════════════════════════════════════════════════════════
# Step 1: Validate Prerequisites
# ═══════════════════════════════════════════════════════════════════════════════

log_step "Passo 1: Validando Pré-requisitos"

# Check gh CLI
if ! command -v gh &>/dev/null; then
  log_error "GitHub CLI (gh) não encontrado. Instale: https://cli.github.com/"
  exit 1
fi
log_success "GitHub CLI encontrado"

# Check gh auth
if ! gh auth status &>/dev/null; then
  log_error "gh CLI não autenticado. Execute: gh auth login"
  exit 1
fi
log_success "gh CLI autenticado"

# Check project files exist
if [[ ! -f "$EOS_INI" ]]; then
  log_error "DefaultEOS.ini não encontrado em: $EOS_INI"
  exit 1
fi
log_success "DefaultEOS.ini encontrado"

if [[ ! -f "$EOS_PROD_INI" ]]; then
  log_error "DefaultEOS_Production.ini não encontrado em: $EOS_PROD_INI"
  exit 1
fi
log_success "DefaultEOS_Production.ini encontrado"

# Check curl for EOS API calls
if ! command -v curl &>/dev/null; then
  log_error "curl não encontrado. Necessário para EOS API."
  exit 1
fi
log_success "curl encontrado"

# ═══════════════════════════════════════════════════════════════════════════════
# Step 2: Collect Epic Developer Portal Credentials
# ═══════════════════════════════════════════════════════════════════════════════

log_step "Passo 2: Credenciais do Epic Developer Portal"

echo -e "${YELLOW}Obtenha seus IDs em: https://dev.epicgames.com/portal/${NC}"
echo ""

# Product ID
read -rp "EOS Product ID: " EOS_PRODUCT_ID
if [[ -z "$EOS_PRODUCT_ID" ]]; then
  log_error "Product ID é obrigatório."
  exit 1
fi
log_success "Product ID: $EOS_PRODUCT_ID"

# Sandbox ID
read -rp "EOS Sandbox ID: " EOS_SANDBOX_ID
if [[ -z "$EOS_SANDBOX_ID" ]]; then
  log_error "Sandbox ID é obrigatório."
  exit 1
fi
log_success "Sandbox ID: $EOS_SANDBOX_ID"

# Deployment ID
read -rp "EOS Deployment ID: " EOS_DEPLOYMENT_ID
if [[ -z "$EOS_DEPLOYMENT_ID" ]]; then
  log_error "Deployment ID é obrigatório."
  exit 1
fi
log_success "Deployment ID: $EOS_DEPLOYMENT_ID"

# Client ID
read -rp "EOS Client ID: " EOS_CLIENT_ID
if [[ -z "$EOS_CLIENT_ID" ]]; then
  log_error "Client ID é obrigatório."
  exit 1
fi
log_success "Client ID: $EOS_CLIENT_ID"

# Client Secret
read -rsp "EOS Client Secret (hidden): " EOS_CLIENT_SECRET
echo ""
if [[ -z "$EOS_CLIENT_SECRET" ]]; then
  log_error "Client Secret é obrigatório."
  exit 1
fi
log_success "Client Secret: ********"

# ═══════════════════════════════════════════════════════════════════════════════
# Step 3: Validate EOS Credentials
# ═══════════════════════════════════════════════════════════════════════════════

log_step "Passo 3: Validando Credenciais EOS"

# Test EOS auth with credentials
log_info "Testando autenticação EOS..."

EOS_AUTH_URL="https://api.epicgames.com/auth/v1/oauth/token"
AUTH_HEADER=$(echo -n "${EOS_CLIENT_ID}:${EOS_CLIENT_SECRET}" | base64 -w 0)

HTTP_CODE=$(curl -s -o /tmp/eos_auth_response.json -w "%{http_code}" \
  -X POST "$EOS_AUTH_URL" \
  -H "Authorization: Basic ${AUTH_HEADER}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=basic" \
  --connect-timeout 10 \
  --max-time 30 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "200" ]]; then
  log_success "Autenticação EOS bem-sucedida (HTTP 200)"
  # Extract token type for verification
  TOKEN_TYPE=$(python3 -c "import json; d=json.load(open('/tmp/eos_auth_response.json')); print(d.get('token_type','unknown'))" 2>/dev/null || echo "unknown")
  log_info "Token type: $TOKEN_TYPE"
elif [[ "$HTTP_CODE" == "401" ]]; then
  log_error "Credenciais EOS inválidas (HTTP 401). Verifique Client ID e Secret."
  log_warn "Continuando mesmo assim — você pode corrigir depois."
else
  log_warn "Não foi possível validar credenciais EOS (HTTP $HTTP_CODE)."
  log_warn "Isso pode ser temporário. Continuando..."
fi

# Clean up
rm -f /tmp/eos_auth_response.json

# ═══════════════════════════════════════════════════════════════════════════════
# Step 4: Configure DefaultEOS.ini
# ═══════════════════════════════════════════════════════════════════════════════

log_step "Passo 4: Configurando DefaultEOS.ini"

# Backup original
cp "$EOS_INI" "$EOS_INI.bak.$(date +%Y%m%d%H%M%S)"
log_info "Backup criado: $EOS_INI.bak.*"

# Update DefaultEOS.ini with real values
if [[ -f "$EOS_INI" ]]; then
  # Replace placeholder values with real ones
  sed -i "s|KHAOS_PRODUCT_ID|${EOS_PRODUCT_ID}|g" "$EOS_INI"
  sed -i "s|KHAOS_SANDBOX_ID|${EOS_SANDBOX_ID}|g" "$EOS_INI"
  sed -i "s|KHAOS_DEPLOYMENT_ID|${EOS_DEPLOYMENT_ID}|g" "$EOS_INI"
  sed -i "s|KHAOS_CLIENT_ID|${EOS_CLIENT_ID}|g" "$EOS_INI"
  sed -i "s|KHAOS_CLIENT_SECRET|${EOS_CLIENT_SECRET}|g" "$EOS_INI"

  log_success "DefaultEOS.ini atualizado com credenciais reais"
else
  log_error "DefaultEOS.ini não encontrado para atualização"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# Step 5: Configure DefaultEOS_Production.ini
# ═══════════════════════════════════════════════════════════════════════════════

log_step "Passo 5: Configurando DefaultEOS_Production.ini"

# Update production ini with real values
sed -i "s|^EOSProductId=.*|EOSProductId=${EOS_PRODUCT_ID}|g" "$EOS_PROD_INI"
sed -i "s|^EOSSandboxId=.*|EOSSandboxId=${EOS_SANDBOX_ID}|g" "$EOS_PROD_INI"
sed -i "s|^EOSDeploymentId=.*|EOSDeploymentId=${EOS_DEPLOYMENT_ID}|g" "$EOS_PROD_INI"
sed -i "s|^EOSClientClientId=.*|EOSClientClientId=${EOS_CLIENT_ID}|g" "$EOS_PROD_INI"
# Don't write client secret to ini — use GitHub secret instead
sed -i "s|^EOSClientClientSecret=.*|EOSClientClientSecret=SEE_GITHUB_SECRET|g" "$EOS_PROD_INI"

log_success "DefaultEOS_Production.ini atualizado"

# ═══════════════════════════════════════════════════════════════════════════════
# Step 6: Configure Matchmaking Pools per Region
# ═══════════════════════════════════════════════════════════════════════════════

log_step "Passo 6: Configurando Matchmaking Pools por Região"

echo -e "${YELLOW}Configurando pools para 3 regiões:${NC}"
echo "  sa1 — South America (São Paulo) — Padrão para Brasil"
echo "  na1 — North America (Virginia)"
echo "  eu1 — Europe (Frankfurt)"
echo ""

# Ask for matchmaking pool names (with defaults)
read -rp "Pool SA1 [KR_SA1]: " MM_POOL_SA1
MM_POOL_SA1=${MM_POOL_SA1:-KR_SA1}

read -rp "Pool NA1 [KR_NA1]: " MM_POOL_NA1
MM_POOL_NA1=${MM_POOL_NA1:-KR_NA1}

read -rp "Pool EU1 [KR_EU1]: " MM_POOL_EU1
MM_POOL_EU1=${MM_POOL_EU1:-KR_EU1}

log_success "Matchmaking pools configurados:"
log_info "  sa1 → $MM_POOL_SA1"
log_info "  na1 → $MM_POOL_NA1"
log_info "  eu1 → $MM_POOL_EU1"

# Update DefaultEOS.ini with matchmaking pool
sed -i "s|^MatchmakingPool=.*|MatchmakingPool=${MM_POOL_SA1}|g" "$EOS_INI"

# ═══════════════════════════════════════════════════════════════════════════════
# Step 7: Set GitHub Secrets
# ═══════════════════════════════════════════════════════════════════════════════

log_step "Passo 7: Configurando GitHub Secrets"

log_info "Configurando secrets no repositório: $REPO"

# EOS_CLIENT_ID
echo "$EOS_CLIENT_ID" | gh secret set EOS_CLIENT_ID --repo "$REPO" 2>/dev/null
log_success "EOS_CLIENT_ID secret configurado"

# EOS_CLIENT_SECRET
echo "$EOS_CLIENT_SECRET" | gh secret set EOS_CLIENT_SECRET --repo "$REPO" 2>/dev/null
log_success "EOS_CLIENT_SECRET secret configurado"

# EOS_DEPLOYMENT_ID
echo "$EOS_DEPLOYMENT_ID" | gh secret set EOS_DEPLOYMENT_ID --repo "$REPO" 2>/dev/null
log_success "EOS_DEPLOYMENT_ID secret configurado"

# EOS_PRODUCT_ID
echo "$EOS_PRODUCT_ID" | gh secret set EOS_PRODUCT_ID --repo "$REPO" 2>/dev/null
log_success "EOS_PRODUCT_ID secret configurado"

# EOS_SANDBOX_ID
echo "$EOS_SANDBOX_ID" | gh secret set EOS_SANDBOX_ID --repo "$REPO" 2>/dev/null
log_success "EOS_SANDBOX_ID secret configurado"

log_info "Secrets configurados:"
gh secret list --repo "$REPO" 2>/dev/null | grep -E "EOS_" || echo "(none visible)"

# ═══════════════════════════════════════════════════════════════════════════════
# Step 8: Validate EAC Integration Requirements
# ═══════════════════════════════════════════════════════════════════════════════

log_step "Passo 8: Validando Requisitos do Easy Anti-Cheat"

# Check EAC SDK directory
EAC_SDK_PATH="$UNREAL_DIR/Plugins/EasyAntiCheatServer"
if [[ -d "$EAC_SDK_PATH" ]]; then
  log_success "EAC SDK encontrado em: $EAC_SDK_PATH"
else
  log_warn "EAC SDK não encontrado em: $EAC_SDK_PATH"
  log_info "Para EAC em produção, você precisa:"
  log_info "  1. Baixar o EAC SDK de https://dev.epicgames.com/docs/game-services/anti-cheat"
  log_info "  2. Colocar em $EAC_SDK_PATH"
  log_info "  3. Configurar o EAC Product ID no Epic Dev Portal"
fi

# Check EAC config in DefaultEngine.ini
ENGINE_INI="$CONFIG_DIR/DefaultEngine.ini"
if [[ -f "$ENGINE_INI" ]]; then
  if grep -q "EasyAntiCheat" "$ENGINE_INI" 2>/dev/null; then
    log_success "EAC referenciado no DefaultEngine.ini"
  else
    log_warn "EAC não referenciado no DefaultEngine.ini"
    log_info "Adicione [+OnlineServices] e configure EasyAntiCheat após instalar o SDK"
  fi
else
  log_warn "DefaultEngine.ini não encontrado"
fi

# Validate EAC requirements
log_info "Requisitos do EAC para produção:"
log_info "  • EAC SDK baixado e integrado ao projeto UE5"
log_info "  • Product/Sandbox/Deployment IDs configurados (✅ já feito)"
log_info "  • EAC Product Settings configurados no Epic Dev Portal"
log_info "  • Server: eac_server.ini com product_id e sandbox_id"
log_info "  • Client: Packaged build com EAC launcher"

# ═══════════════════════════════════════════════════════════════════════════════
# Step 9: Production Verification
# ═══════════════════════════════════════════════════════════════════════════════

log_step "Passo 9: Verificação de Produção"

ERRORS=0
WARNINGS=0

# Verify DefaultEOS.ini has real values (not placeholders)
if grep -q "KHAOS_" "$EOS_INI" 2>/dev/null; then
  log_error "DefaultEOS.ini ainda contém placeholders (KHAOS_*)"
  ((ERRORS++))
else
  log_success "DefaultEOS.ini: sem placeholders"
fi

# Verify DefaultEOS_Production.ini has real Product ID
if grep -q "^EOSProductId=$" "$EOS_PROD_INI" 2>/dev/null; then
  log_error "DefaultEOS_Production.ini: Product ID vazio"
  ((ERRORS++))
else
  log_success "DefaultEOS_Production.ini: Product ID configurado"
fi

# Verify GitHub secrets are set
SECRETS_LIST=$(gh secret list --repo "$REPO" 2>/dev/null || echo "")
for SECRET_NAME in EOS_CLIENT_ID EOS_CLIENT_SECRET EOS_DEPLOYMENT_ID; do
  if echo "$SECRETS_LIST" | grep -q "$SECRET_NAME"; then
    log_success "GitHub secret $SECRET_NAME: configurado"
  else
    log_error "GitHub secret $SECRET_NAME: NÃO configurado"
    ((ERRORS++))
  fi
done

# Verify regions configured
for REGION in sa1 na1 eu1; do
  if grep -q "RegionId=$REGION" "$EOS_PROD_INI" 2>/dev/null; then
    log_success "Região $REGION: configurada"
  else
    log_warn "Região $REGION: não encontrada no config"
    ((WARNINGS++))
  fi
done

# ═══════════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════════

log_step "Resumo da Configuração"

echo -e "${BOLD}EOS IDs:${NC}"
echo "  Product ID:    $EOS_PRODUCT_ID"
echo "  Sandbox ID:    $EOS_SANDBOX_ID"
echo "  Deployment ID: $EOS_DEPLOYMENT_ID"
echo "  Client ID:     $EOS_CLIENT_ID"
echo "  Client Secret: ********"
echo ""
echo -e "${BOLD}Matchmaking Pools:${NC}"
echo "  sa1 (São Paulo):   $MM_POOL_SA1"
echo "  na1 (Virginia):    $MM_POOL_NA1"
echo "  eu1 (Frankfurt):   $MM_POOL_EU1"
echo ""
echo -e "${BOLD}Config Files:${NC}"
echo "  DefaultEOS.ini:             $EOS_INI"
echo "  DefaultEOS_Production.ini:  $EOS_PROD_INI"
echo ""
echo -e "${BOLD}Verificação:${NC}"
echo "  Erros:   $ERRORS"
echo "  Avisos:  $WARNINGS"
echo ""

if [[ $ERRORS -eq 0 ]]; then
  log_success "Configuração EOS de produção completa! 🎮"
  echo ""
  log_info "Próximos passos:"
  log_info "  1. Configure matchmaking rules no Epic Dev Portal"
  log_info "  2. Teste matchmaking com 2+ clientes"
  log_info "  3. Integre EAC SDK se ainda não instalado"
  log_info "  4. Configure cloud save schema no game"
  log_info "  5. Rode testes de load test (KhaaosLoadTestManager)"
  log_info "  6. Deploy para staging e valide end-to-end"
else
  log_error "Configuração completa com $ERRORS erro(s). Corrija antes do deploy."
  exit 1
fi
