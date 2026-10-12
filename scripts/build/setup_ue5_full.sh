#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# Khaaos Run — UE5.8 Full Setup & Build Script
# Runs on the GPU build VM to compile and package the dedicated server
# Usage: ./setup_ue5_full.sh [--headless] [--build-only] [--skip-ue5]
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
UE5_VERSION="5.8"
UE5_INSTALL="${UE5_INSTALL:-/opt/UnrealEngine/${UE5_VERSION}}"
BUILD_DIR="${REPO_ROOT}/Unreal/KhaaosRun"
DIST_DIR="${REPO_ROOT}/Build/Dist"
JOBS="${JOBS:-$(nproc)}"
HEADLESS=false
BUILD_ONLY=false
SKIP_UE5=false

# Parse args
for arg in "$@"; do
  case $arg in
    --headless)   HEADLESS=true ;;
    --build-only) BUILD_ONLY=true ;;
    --skip-ue5)   SKIP_UE5=true ;;
  esac
done

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[⚠]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; }
info() { echo -e "${CYAN}[→]${NC} $*"; }

# ─── Phase 1: System Requirements ───
info "Phase 1: Checking system requirements..."

MIN_DISK_GB=80
MIN_RAM_GB=16
MIN_CORES=8

available_disk=$(df -BG / | tail -1 | awk '{print $2}' | tr -d 'G')
available_ram=$(free -g | awk '/^Mem:/{print $2}')
cores=$(nproc)

if [ "$available_disk" -lt "$MIN_DISK_GB" ]; then
  err "Insufficient disk: ${available_disk}GB < ${MIN_DISK_GB}GB required"
  err "UE5.8 SDK requires ~50GB + build artifacts ~30GB"
  exit 1
fi
if [ "$available_ram" -lt "$MIN_RAM_GB" ]; then
  warn "Low RAM: ${available_ram}GB < ${MIN_RAM_GB}GB recommended (compilation will be slow)"
fi
if [ "$cores" -lt "$MIN_CORES" ]; then
  warn "Low CPU cores: ${cores} < ${MIN_CORES} recommended"
fi

log "System check: ${available_disk}GB disk, ${available_ram}GB RAM, ${cores} cores"

# ─── Phase 2: UE5 Engine Installation ───
if [ "$SKIP_UE5" = false ]; then
  info "Phase 2: Installing UE5.${UE5_VERSION}..."

  if [ -d "${UE5_INSTALL}/Engine" ] && [ -f "${UE5_INSTALL}/Engine/Build.version" ]; then
    log "UE5.${UE5_VERSION} already installed at ${UE5_INSTALL}"
  else
    info "Downloading UE5.${UE5_VERSION} source (this takes 30-60 min)..."

    mkdir -p "${UE5_INSTALL}"
    cd "${UE5_INSTALL}"

    # Method 1: GitHub source (requires Epic GitHub access)
    if git clone --depth 1 --branch "${UE5_VERSION}"-release \
        https://github.com/EpicGames/UnrealEngine.git . 2>/dev/null; then
      log "Cloned UE5 from GitHub"
    else
      # Method 2: Epic Launcher / ZIP download
      warn "GitHub clone failed. Trying Epic download..."
      UE5_ZIP_URL="https://releases.unrealengine.com/download/UE${UE5_VERSION}-Linux.zip"
      curl -L "${UE5_ZIP_URL}" -o /tmp/ue5.zip --progress-bar
      unzip -q /tmp/ue5.zip -d "${UE5_INSTALL}"
      log "Extracted UE5 from ZIP"
    fi

    # Build UE5 from source
    info "Building UE5 engine (2-4 hours on recommended hardware)..."
    cd "${UE5_INSTALL}"

    ./Setup.sh 2>&1 | tail -5
    ./GenerateProjectFiles.sh 2>&1 | tail -5

    if [ "$HEADLESS" = true ]; then
      # Headless build: only what's needed for dedicated server
      make KhaaosRunServer Linux -j"${JOBS}" TARGET=Server CONFIG=Development 2>&1 | tail -20
    else
      # Full build: Editor + Server + Client
      make -j"${JOBS}" 2>&1 | tail -20
    fi

    log "UE5.${UE5_VERSION} build complete"
  fi
fi

# ─── Phase 3: Project Configuration ───
info "Phase 3: Configuring Khaaos Run project..."

cd "${BUILD_DIR}"

# Validate .uproject exists
if [ ! -f "KhaaosRun.uproject" ]; then
  err "KhaaosRun.uproject not found at ${BUILD_DIR}"
  exit 1
fi
log "Project file validated: KhaaosRun.uproject"

# Generate project files
info "Generating UE5 project files..."
"${UE5_INSTALL}/Engine/BuildScripts/GenerateProjectFiles.sh" \
  -project="$(pwd)/KhaaosRun.uproject" \
  -game -engine 2>&1 | tail -5
log "Project files generated"

# ─── Phase 4: Compile Dedicated Server ───
info "Phase 4: Compiling Khaaos Run Dedicated Server..."

UBT="${UE5_INSTALL}/Engine/Binaries/Linux/UnrealBuildTool"
UAT="${UE5_INSTALL}/Engine/BuildScripts/RunUAT.sh"

# Build server target
info "Building KhaaosRunServer (Development, Linux, ${JOBS} jobs)..."
"${UBT}" KhaaosRunServer Linux Development \
  -project="$(pwd)/KhaaosRun.uproject" \
  -Progress -NoHotReloadFromIDE 2>&1 | tail -30

BUILD_EXIT=$?
if [ $BUILD_EXIT -ne 0 ]; then
  err "Build FAILED with exit code ${BUILD_EXIT}"
  err "Check build logs for errors"
  exit 1
fi
log "Compilation successful"

# ─── Phase 5: Package & Archive ───
info "Phase 5: Packaging dedicated server..."

mkdir -p "${DIST_DIR}"

"${UAT}" BuildCookRun \
  -project="$(pwd)/KhaaosRun.uproject" \
  -noP4 \
  -platform=Linux \
  -target=KhaaosRunServer \
  -serverconfig=Development \
  -cook -build -stage -archive \
  -archivedirectory="${DIST_DIR}" 2>&1 | tail -20

log "Server packaged to ${DIST_DIR}"

# Verify binary exists
SERVER_BIN="${DIST_DIR}/LinuxNoEditor/KhaaosRun/Binaries/Linux/KhaaosRunServer"
if [ -f "${SERVER_BIN}" ]; then
  FILESIZE=$(du -h "${SERVER_BIN}" | cut -f1)
  log "Server binary: ${SERVER_BIN} (${FILESIZE})"
else
  warn "Server binary not found at expected path, listing artifacts:"
  find "${DIST_DIR}" -name "*.sh" -o -name "KhaaosRun*" 2>/dev/null | head -20
fi

# ─── Phase 6: Docker Image ───
info "Phase 6: Building Docker image..."

cd "${REPO_ROOT}"
DOCKER_TAG="khaaos-run-server:$(date +%Y%m%d-%H%M%S)"

docker build -t "${DOCKER_TAG}" \
  -f Unreal/KhaaosRun/Build/Dockerfile \
  --build-arg UE5_PATH="${UE5_INSTALL}" \
  . 2>&1 | tail -10

log "Docker image built: ${DOCKER_TAG}"

# ─── Phase 7: Verification ───
info "Phase 7: Running post-build verification..."

# Check C++ file count
CPP_COUNT=$(find "${BUILD_DIR}/Source" -name "*.cpp" | wc -l)
HEADER_COUNT=$(find "${BUILD_DIR}/Source" -name "*.h" | wc -l)
log "C++ files: ${CPP_COUNT} .cpp + ${HEADER_COUNT} .h = $((CPP_COUNT + HEADER_COUNT)) total"

# Check configs
for cfg in DefaultEngine.ini DefaultGame.ini DefaultGameplayTags.ini; do
  if [ -f "${BUILD_DIR}/Config/${cfg}" ]; then
    log "Config OK: ${cfg}"
  else
    warn "Missing config: ${cfg}"
  fi
done

# Check world configs
for world in CIGKV Barburhen Priadus Ckesalth Arukheea; do
  if [ -f "${BUILD_DIR}/Config/Default${world}.ini" ]; then
    log "World config OK: ${world}"
  else
    warn "Missing world config: ${world}"
  fi
done

# ─── Summary ───
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  KHAAOS RUN — BUILD COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo "  UE5 Version:    ${UE5_VERSION}"
echo "  Build Mode:     $([ "$HEADLESS" = true ] && echo 'Headless (Server Only)' || echo 'Full (Editor+Server+Client)')"
echo "  Server Dist:    ${DIST_DIR}"
echo "  Docker Image:   ${DOCKER_TAG}"
echo "  C++ Files:      $((CPP_COUNT + HEADER_COUNT))"
echo "  Jobs Used:      ${JOBS}"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "To run the dedicated server:"
echo "  cd ${DIST_DIR}/LinuxNoEditor"
echo "  ./KhaaosRunServer KhaaosRun -log -port=7777"
echo ""
echo "To run via Docker:"
echo "  docker run -p 7777:7777/udp ${DOCKER_TAG}"
echo ""
