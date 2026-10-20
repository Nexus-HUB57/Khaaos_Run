#!/usr/bin/env bash
# ============================================================================
# Khaaos Run — EOS Environment Setup (Step 3: Auth + Matchmaking)
# ============================================================================
# Sets up EOS integration for development or production:
#   1. Checks for real EOS credentials
#   2. Starts mock EOS server if no real credentials
#   3. Configures DefaultEOS.ini
#   4. Sets up 3 region configurations
#   5. Validates integration by running test_eos_flow.js
#   6. Outputs connection info
# ============================================================================

set -euo pipefail

# ─── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "\n${BOLD}─── $* ───${NC}"; }

# ─── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
EOS_INI="${REPO_ROOT}/Unreal/KhaaosRun/Config/DefaultEOS.ini"
EOS_REGION_INI="${REPO_ROOT}/Unreal/KhaaosRun/Config/Regions/DefaultEOS_Production.ini"
EOS_PRODUCTION_ENV="${REPO_ROOT}/config/eos/eos_production.env"
MOCK_SERVER="${SCRIPT_DIR}/mock_eos_server.js"
TEST_SCRIPT="${SCRIPT_DIR}/test_eos_flow.js"
CONFIG_TEMPLATE="${SCRIPT_DIR}/eos_config_template.json"

MOCK_PORT="${EOS_MOCK_PORT:-8989}"
MOCK_PID=""

# ─── Cleanup ───────────────────────────────────────────────────────────────────
cleanup() {
  if [[ -n "${MOCK_PID}" ]]; then
    log_info "Stopping mock EOS server (PID: ${MOCK_PID})..."
    kill "${MOCK_PID}" 2>/dev/null || true
    MOCK_PID=""
  fi
}
trap cleanup EXIT

# ─── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Khaaos Run — EOS Environment Setup (Step 3)                ║"
echo "║  Auth → Lobby → Matchmaking → Sessions → Cloud Save         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ═════════════════════════════════════════════════════════════════════════════
# STEP 1: Check for real EOS credentials
# ═════════════════════════════════════════════════════════════════════════════

log_step "Step 1: Checking for real EOS credentials"

USE_PRODUCTION=false
EOS_PRODUCT_ID=""
EOS_SANDBOX_ID=""
EOS_DEPLOYMENT_ID=""
EOS_CLIENT_ID=""
EOS_CLIENT_SECRET=""

if [[ -f "${EOS_PRODUCTION_ENV}" ]]; then
  log_info "Found ${EOS_PRODUCTION_ENV}"

  # Source the env file (validate it has values)
  # shellcheck disable=SC1090
  source "${EOS_PRODUCTION_ENV}"

  # Check for required variables
  if [[ -n "${EOS_PRODUCT_ID:-}" && -n "${EOS_SANDBOX_ID:-}" && -n "${EOS_DEPLOYMENT_ID:-}" && -n "${EOS_CLIENT_ID:-}" && -n "${EOS_CLIENT_SECRET:-}" ]]; then
    log_ok "Real EOS credentials found!"
    log_info "  Product ID:   ${EOS_PRODUCT_ID:0:8}..."
    log_info "  Sandbox ID:   ${EOS_SANDBOX_ID:0:8}..."
    log_info "  Deployment ID: ${EOS_DEPLOYMENT_ID:0:8}..."
    USE_PRODUCTION=true
  else
    log_warn "EOS env file exists but has empty values — falling back to mock"
  fi
else
  log_warn "No production credentials found at ${EOS_PRODUCTION_ENV}"
  log_info "Using mock EOS server for development"
fi

# ═════════════════════════════════════════════════════════════════════════════
# STEP 2: Start mock server or configure for production
# ═════════════════════════════════════════════════════════════════════════════

log_step "Step 2: Starting EOS backend"

if [[ "${USE_PRODUCTION}" == "true" ]]; then
  log_ok "Using production EOS endpoints"
  EOS_ENDPOINT="https://epicgames.com"
else
  # Check dependencies
  if ! command -v node &>/dev/null; then
    log_error "Node.js not found. Install Node.js 18+ to use mock EOS server."
    exit 1
  fi

  # Check for express and ws modules
  if ! node -e "require('express')" &>/dev/null; then
    log_info "Installing express..."
    npm install --prefix "${SCRIPT_DIR}" express 2>/dev/null
  fi
  if ! node -e "require('ws')" &>/dev/null; then
    log_info "Installing ws..."
    npm install --prefix "${SCRIPT_DIR}" ws 2>/dev/null
  fi

  # Install both at once if needed
  if ! node -e "require('express'); require('ws');" &>/dev/null; then
    log_info "Installing mock server dependencies..."
    npm install --prefix "${SCRIPT_DIR}" express ws 2>/dev/null || {
      # Fallback: install globally
      log_warn "Local install failed, trying global..."
      npm install -g express ws 2>/dev/null || true
    }
  fi

  # Start mock server
  log_info "Starting mock EOS server on port ${MOCK_PORT}..."
  EOS_MOCK_PORT="${MOCK_PORT}" node "${MOCK_SERVER}" &
  MOCK_PID=$!

  # Wait for server to be ready
  MAX_WAIT=10
  WAITED=0
  while ! curl -s "http://localhost:${MOCK_PORT}/health" &>/dev/null; do
    sleep 1
    WAITED=$((WAITED + 1))
    if [[ ${WAITED} -ge ${MAX_WAIT} ]]; then
      log_error "Mock EOS server failed to start within ${MAX_WAIT}s"
      exit 1
    fi
  done

  log_ok "Mock EOS server running on port ${MOCK_PORT} (PID: ${MOCK_PID})"
  EOS_ENDPOINT="http://localhost:${MOCK_PORT}"
fi

# ═════════════════════════════════════════════════════════════════════════════
# STEP 3: Configure DefaultEOS.ini
# ═════════════════════════════════════════════════════════════════════════════

log_step "Step 3: Configuring DefaultEOS.ini"

if [[ -f "${EOS_INI}" ]]; then
  # Backup original
  cp "${EOS_INI}" "${EOS_INI}.bak.$(date +%s)"
  log_info "Backed up existing DefaultEOS.ini"

  if [[ "${USE_PRODUCTION}" == "true" ]]; then
    # Write production credentials
    sed -i "s/^ProductId=.*/ProductId=${EOS_PRODUCT_ID}/" "${EOS_INI}"
    sed -i "s/^SandboxId=.*/SandboxId=${EOS_SANDBOX_ID}/" "${EOS_INI}"
    sed -i "s/^DeploymentId=.*/DeploymentId=${EOS_DEPLOYMENT_ID}/" "${EOS_INI}"
    sed -i "s/^ClientId=.*/ClientId=${EOS_CLIENT_ID}/" "${EOS_INI}"
    sed -i "s/^ClientSecret=.*/ClientSecret=${EOS_CLIENT_SECRET}/" "${EOS_INI}"
    log_ok "DefaultEOS.ini updated with production credentials"
  else
    # Write mock/dev credentials
    sed -i "s/^ProductId=.*/ProductId=KHAOS_MOCK_PRODUCT_ID/" "${EOS_INI}"
    sed -i "s/^SandboxId=.*/SandboxId=KHAOS_MOCK_SANDBOX_ID/" "${EOS_INI}"
    sed -i "s/^DeploymentId=.*/DeploymentId=KHAOS_MOCK_DEPLOYMENT_ID/" "${EOS_INI}"
    sed -i "s/^ClientId=.*/ClientId=khaaos-mock-client/" "${EOS_INI}"
    sed -i "s/^ClientSecret=.*/ClientSecret=khaaos-mock-secret/" "${EOS_INI}"
    log_ok "DefaultEOS.ini updated with mock development credentials"
  fi
else
  log_warn "DefaultEOS.ini not found at ${EOS_INI}"
  log_info "Creating minimal DefaultEOS.ini..."

  cat > "${EOS_INI}" << 'EOF'
; Khaaos Run - Devs Ph.D | UE5.8 | Copyright Nexus-HUB57
; DefaultEOS.ini — EOS Integration Kit configuration for Khaaos Run

[/Script/EOSIntegrationKit.EOSIntegrationKitSettings]
ProductId=KHAOS_MOCK_PRODUCT_ID
SandboxId=KHAOS_MOCK_SANDBOX_ID
DeploymentId=KHAOS_MOCK_DEPLOYMENT_ID
ClientId=khaaos-mock-client
ClientSecret=khaaos-mock-secret
bEnableOverlay=True
bEnableOverlaySocial=True
bUseEAS=True

[EOS]
DefaultRegion=sa1
MaxLobbyMembers=100
MatchmakingPool=CIGKV_Training
EOF

  log_ok "Created DefaultEOS.ini with mock credentials"
fi

# ═════════════════════════════════════════════════════════════════════════════
# STEP 4: Set up 3 region configurations
# ═════════════════════════════════════════════════════════════════════════════

log_step "Step 4: Setting up region configurations (sa1, na1, eu1)"

REGION_DIR="${REPO_ROOT}/Unreal/KhaaosRun/Config/Regions"
mkdir -p "${REGION_DIR}"

# Verify region config exists
if [[ -f "${EOS_REGION_INI}" ]]; then
  log_ok "Region configuration already exists at ${EOS_REGION_INI}"
else
  log_warn "Region config not found. Creating default..."

  cat > "${EOS_REGION_INI}" << 'REGIONSEOF'
; ============================================================================
; Khaaos Run — EOS Production Configuration per Region (Step 3)
; ============================================================================

[/Script/KhaaosRun.EOSProductionConfig]
bEOSProductionEnabled=true

[/Script/KhaaosRun.EOSRegionConfig_sa1]
RegionId=sa1
RegionName=South America - Sao Paulo
RegionEndpoint=eos-sa1.epicgames.com
Latitude=-23.5505
Longitude=-46.6333
MaxLobbySize=100
MaxPlayersPerServer=50
MatchmakingPool=KR_SA1
bEnabled=true
PingThreshold=150

[/Script/KhaaosRun.EOSRegionConfig_na1]
RegionId=na1
RegionName=North America - Virginia
RegionEndpoint=eos-na1.epicgames.com
Latitude=37.4316
Longitude=-78.6569
MaxLobbySize=100
MaxPlayersPerServer=50
MatchmakingPool=KR_NA1
bEnabled=true
PingThreshold=100

[/Script/KhaaosRun.EOSRegionConfig_eu1]
RegionId=eu1
RegionName=Europe - Frankfurt
RegionEndpoint=eos-eu1.epicgames.com
Latitude=50.1109
Longitude=8.6821
MaxLobbySize=100
MaxPlayersPerServer=50
MatchmakingPool=KR_EU1
bEnabled=true
PingThreshold=100
REGIONSEOF

  log_ok "Created DefaultEOS_Production.ini with 3 regions"
fi

# Verify each region is configured
for region in sa1 na1 eu1; do
  if grep -q "RegionId=${region}" "${EOS_REGION_INI}" 2>/dev/null; then
    log_ok "Region ${region} configured"
  else
    log_warn "Region ${region} not found in config"
  fi
done

# ═════════════════════════════════════════════════════════════════════════════
# STEP 5: Validate EOS integration
# ═════════════════════════════════════════════════════════════════════════════

log_step "Step 5: Validating EOS integration"

if [[ "${USE_PRODUCTION}" != "true" ]]; then
  # Check mock server health
  HEALTH=$(curl -s "http://localhost:${MOCK_PORT}/health" 2>/dev/null || echo '{"status":"unreachable"}')

  if echo "${HEALTH}" | grep -q '"healthy"'; then
    log_ok "Mock EOS server is healthy"

    # Run integration tests
    if [[ -f "${TEST_SCRIPT}" ]]; then
      log_info "Running integration tests..."
      if node "${TEST_SCRIPT}" 2>&1; then
        log_ok "All integration tests PASSED"
      else
        log_error "Integration tests FAILED"
        log_warn "EOS integration may not work correctly"
      fi
    else
      log_warn "Test script not found at ${TEST_SCRIPT}"
    fi
  else
    log_error "Mock EOS server is not healthy"
    exit 1
  fi
else
  log_info "Production mode — skipping mock server validation"
  log_warn "Manual validation recommended: test auth flow in UE5 editor"
fi

# ═════════════════════════════════════════════════════════════════════════════
# STEP 6: Output connection info
# ═════════════════════════════════════════════════════════════════════════════

log_step "Step 6: Connection Information"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Khaaos Run — EOS Connection Info                           ║"
echo "╠══════════════════════════════════════════════════════════════╣"

if [[ "${USE_PRODUCTION}" == "true" ]]; then
  echo "║  Mode:       PRODUCTION                                     ║"
  echo "║  Endpoint:   Epic Online Services (production)              ║"
  echo "║  Product ID: ${EOS_PRODUCT_ID:0:16}...                       ║"
else
  echo "║  Mode:       DEVELOPMENT (Mock)                             ║"
  echo "║  HTTP:       http://localhost:${MOCK_PORT}                    ║"
  echo "║  WebSocket:  ws://localhost:${MOCK_PORT}/ws                   ║"
  echo "║  Health:     http://localhost:${MOCK_PORT}/health             ║"
  echo "║  Server PID: ${MOCK_PID}                                    ║"
fi

echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Regions:                                                   ║"
echo "║    sa1  — South America (São Paulo)  [PRIMARY]              ║"
echo "║    na1  — North America (Virginia)                          ║"
echo "║    eu1  — Europe (Frankfurt)                                ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Matchmaking Pools:                                         ║"
echo "║    CIGKV_Training     (sa1, 2-50 players)                   ║"
echo "║    W1_Barburhen_Solo  (sa1, 2-100 players)                  ║"
echo "║    W2_Ckesalth_Duo    (na1, 4-100 players)                  ║"
echo "║    W3_Priadus_Squad   (eu1, 8-100 players)                  ║"
echo "║    W4_Arukheea_BR     (sa1, 10-100 players)                 ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Config Files:                                              ║"
echo "║    DefaultEOS.ini:         ${EOS_INI}" 
echo "║    Regions:                ${EOS_REGION_INI}"
echo "║    Template:               ${CONFIG_TEMPLATE}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [[ "${USE_PRODUCTION}" != "true" ]]; then
  log_info "To stop the mock server: kill ${MOCK_PID}"
  log_info "To test manually: curl http://localhost:${MOCK_PORT}/health"
  log_info "To run tests:     node ${TEST_SCRIPT}"
fi

log_ok "EOS environment setup complete!"
exit 0
