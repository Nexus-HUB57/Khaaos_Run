#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
# Khaaos Run — MVP Step 1: UE5.8 Build Pipeline (One-Click)
# Devs Ph.D | Copyright Nexus-HUB57. All Rights Reserved.
# ════════════════════════════════════════════════════════════════════════════
#
# Master pipeline: SDK → Compile → Dedicated Server → Docker → Smoke Test
#
# Usage:
#   ./pipeline.sh                          # Full pipeline
#   ./pipeline.sh --skip-ue5               # Skip UE5 engine install/build
#   ./pipeline.sh --build-only             # Only compile, skip Docker/test
#   ./pipeline.sh --from-docker            # Full build via Docker (no local UE5)
#   ./pipeline.sh --dry-run                # Print steps without executing
#
# Exit codes:
#   0 — All stages passed
#   1 — System requirements not met
#   2 — UE5 engine installation failed
#   3 — Project configuration failed
#   4 — Compilation failed
#   5 — Packaging failed
#   6 — Docker build failed
#   7 — Smoke test failed
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Constants ────────────────────────────────────────────────────────────────
readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
readonly REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
readonly STEP_NAME="step1_ue5_build"
readonly UE5_VERSION="5.8"
readonly UE5_BRANCH="${UE5_VERSION}-release"
readonly UE5_GITHUB="https://github.com/EpicGames/UnrealEngine.git"
readonly UE5_ZIP_FALLBACK="https://releases.unrealengine.com/download/UE${UE5_VERSION}-Linux.zip"

# Paths
readonly UE5_INSTALL="${UE5_INSTALL:-/opt/UnrealEngine/${UE5_VERSION}}"
readonly PROJECT_DIR="${REPO_ROOT}/Unreal/KhaaosRun"
readonly DIST_DIR="${REPO_ROOT}/Build/Dist"
readonly DOCKERFILE="${PROJECT_DIR}/Build/Dockerfile"
readonly LOG_DIR="${REPO_ROOT}/logs/${STEP_NAME}"

# Build config
readonly JOBS="${JOBS:-$(nproc)}"
readonly BUILD_TARGET="KhaaosRunServer"
readonly BUILD_PLATFORM="Linux"
readonly BUILD_CONFIG="Development"

# System requirements
readonly MIN_DISK_GB=80
readonly MIN_RAM_GB=16
readonly MIN_CORES=8

# ─── CLI Flags ────────────────────────────────────────────────────────────────
SKIP_UE5=false
BUILD_ONLY=false
FROM_DOCKER=false
DRY_RUN=false
VERBOSE=false

for arg in "$@"; do
  case $arg in
    --skip-ue5)    SKIP_UE5=true ;;
    --build-only)  BUILD_ONLY=true ;;
    --from-docker) FROM_DOCKER=true ;;
    --dry-run)     DRY_RUN=true ;;
    --verbose)     VERBOSE=true ;;
    -h|--help)
      echo "Usage: $0 [--skip-ue5] [--build-only] [--from-docker] [--dry-run] [--verbose]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

# ─── Logging ──────────────────────────────────────────────────────────────────
readonly RED='\033[0;31m'; readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'; readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'; readonly NC='\033[0m'

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="${LOG_DIR}/pipeline_${TIMESTAMP}.log"

log()   { echo -e "${GREEN}[PASS]${NC} $*" | tee -a "${LOG_FILE}" >&2; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "${LOG_FILE}" >&2; }
err()   { echo -e "${RED}[FAIL]${NC} $*" | tee -a "${LOG_FILE}" >&2; }
info()  { echo -e "${CYAN}[INFO]${NC} $*" | tee -a "${LOG_FILE}" >&2; }
phase() { echo -e "\n${BOLD}${CYAN}━━━ Phase $1: $2 ━━━${NC}" | tee -a "${LOG_FILE}" >&2; }
step()  { echo -e "  ${CYAN}→${NC} $*" | tee -a "${LOG_FILE}" >&2; }

die() {
  err "$*"
  echo -e "\n${RED}Pipeline ABORTED at phase: ${CURRENT_PHASE:-unknown}${NC}" | tee -a "${LOG_FILE}" >&2
  exit "${CURRENT_EXIT:-1}"
}

# Dry-run wrapper: print command instead of executing
run() {
  if [ "$DRY_RUN" = true ]; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} $*"
    return 0
  fi
  if [ "$VERBOSE" = true ]; then
    step "Executing: $*"
  fi
  "$@"
}

# ─── Initialize ───────────────────────────────────────────────────────────────
mkdir -p "${LOG_DIR}" "${DIST_DIR}"

info "═══════════════════════════════════════════════════════════"
info "  KHAAOS RUN — MVP Step 1: UE5.8 Build Pipeline"
info "═══════════════════════════════════════════════════════════"
info "  Timestamp:  $(date -Iseconds)"
info "  Repo Root:  ${REPO_ROOT}"
info "  UE5:        ${UE5_VERSION} (${UE5_BRANCH})"
info "  Target:     ${BUILD_TARGET} | ${BUILD_PLATFORM} | ${BUILD_CONFIG}"
info "  Jobs:       ${JOBS}"
info "  Log:        ${LOG_FILE}"
info "  Dry-Run:    ${DRY_RUN}"
info "═══════════════════════════════════════════════════════════"

# ─── Phase 0: System Requirements ─────────────────────────────────────────────
CURRENT_PHASE="0: System Requirements"
CURRENT_EXIT=1

phase 0 "System Requirements Check"

step "Checking available disk space..."
available_disk=$(df -BG / | tail -1 | awk '{print $2}' | tr -d 'G')
step "Checking available RAM..."
available_ram=$(free -g | awk '/^Mem:/{print $2}')
step "Checking CPU cores..."
cores=$(nproc)

info "System: ${available_disk}GB disk | ${available_ram}GB RAM | ${cores} cores"

if [ "$available_disk" -lt "$MIN_DISK_GB" ]; then
  die "Insufficient disk: ${available_disk}GB < ${MIN_DISK_GB}GB required (UE5 SDK ~50GB + build ~30GB)"
fi
log "Disk: ${available_disk}GB >= ${MIN_DISK_GB}GB minimum"

if [ "$available_ram" -lt "$MIN_RAM_GB" ]; then
  warn "Low RAM: ${available_ram}GB < ${MIN_RAM_GB}GB recommended (compilation will be slow)"
else
  log "RAM: ${available_ram}GB >= ${MIN_RAM_GB}GB minimum"
fi

if [ "$cores" -lt "$MIN_CORES" ]; then
  warn "Low CPU cores: ${cores} < ${MIN_CORES} recommended (build times will increase)"
else
  log "CPU: ${cores} cores >= ${MIN_CORES} minimum"
fi

# Check required tools
step "Checking required tools..."
for tool in git cmake make clang++ curl docker; do
  if command -v "$tool" &>/dev/null; then
    log "Tool found: ${tool} ($(command -v "$tool"))"
  else
    warn "Tool missing: ${tool} (may cause issues)"
  fi
done

# ─── Phase 1: Download/Install UE5.8 Source ───────────────────────────────────
if [ "$SKIP_UE5" = false ] && [ "$FROM_DOCKER" = false ]; then
  CURRENT_PHASE="1: UE5 Engine Installation"
  CURRENT_EXIT=2

  phase 1 "UE5.${UE5_VERSION} Engine Installation"

  if [ -d "${UE5_INSTALL}/Engine" ] && [ -f "${UE5_INSTALL}/Engine/Binaries/Linux/UnrealBuildTool" ]; then
    log "UE5.${UE5_VERSION} already installed at ${UE5_INSTALL}"
    step "Verifying engine binary..."
    if run test -x "${UE5_INSTALL}/Engine/Binaries/Linux/UnrealBuildTool"; then
      log "Engine binary is executable"
    else
      warn "Engine binary exists but may not be executable"
    fi
  else
    info "UE5.${UE5_VERSION} not found at ${UE5_INSTALL}. Installing..."

    mkdir -p "${UE5_INSTALL}"
    cd "${UE5_INSTALL}"

    # Method 1: Git clone from EpicGames/UnrealEngine (requires Epic GitHub access)
    step "Attempting GitHub clone (${UE5_BRANCH} branch)..."
    if run git clone --depth 1 --branch "${UE5_BRANCH}" "${UE5_GITHUB}" . 2>&1 | tee -a "${LOG_FILE}"; then
      log "Cloned UE5.${UE5_VERSION} from GitHub"
    else
      # Method 2: ZIP fallback
      warn "GitHub clone failed (requires Epic Games GitHub access). Trying ZIP fallback..."
      step "Downloading from ${UE5_ZIP_FALLBACK}..."
      if run curl -L "${UE5_ZIP_FALLBACK}" -o /tmp/ue5.zip --progress-bar 2>&1 | tee -a "${LOG_FILE}"; then
        step "Extracting UE5 source..."
        run unzip -q /tmp/ue5.zip -d "${UE5_INSTALL}"
        run rm -f /tmp/ue5.zip
        log "Extracted UE5.${UE5_VERSION} from ZIP"
      else
        die "Failed to download UE5 from both GitHub and ZIP fallback. Install manually or use --from-docker."
      fi
    fi

    # Run Setup.sh (downloads third-party dependencies)
    step "Running Setup.sh (downloads third-party deps)..."
    if ! run bash "${UE5_INSTALL}/Setup.sh" 2>&1 | tail -20 | tee -a "${LOG_FILE}"; then
      die "Setup.sh failed. Check ${LOG_FILE} for details."
    fi
    log "Setup.sh completed"

    # Generate project files
    step "Running GenerateProjectFiles.sh..."
    if ! run bash "${UE5_INSTALL}/GenerateProjectFiles.sh" 2>&1 | tail -10 | tee -a "${LOG_FILE}"; then
      die "GenerateProjectFiles.sh failed. Check ${LOG_FILE} for details."
    fi
    log "Project files generated"

    # Build UE5 engine (headless — only server target needed)
    step "Building UE5 engine (headless server build, ${JOBS} jobs)..."
    info "This typically takes 2-4 hours on recommended hardware..."
    if ! run make "${BUILD_TARGET}" Linux -j"${JOBS}" TARGET=Server CONFIG=Development 2>&1 | tail -30 | tee -a "${LOG_FILE}"; then
      die "UE5 engine build failed. Check ${LOG_FILE} for details."
    fi
    log "UE5.${UE5_VERSION} engine build complete"
  fi
fi

# ─── Phase 2: Project Configuration ──────────────────────────────────────────
CURRENT_PHASE="2: Project Configuration"
CURRENT_EXIT=3

phase 2 "Khaaos Run Project Configuration"

cd "${PROJECT_DIR}"

# Validate .uproject
step "Validating KhaaosRun.uproject..."
if [ ! -f "KhaaosRun.uproject" ]; then
  die "KhaaosRun.uproject not found at ${PROJECT_DIR}"
fi

# Validate JSON syntax
if python3 -c "import json; json.load(open('KhaaosRun.uproject'))" 2>/dev/null; then
  log "KhaaosRun.uproject is valid JSON"
else
  die "KhaaosRun.uproject has invalid JSON syntax"
fi

# Check engine association
engine_assoc=$(python3 -c "import json; print(json.load(open('KhaaosRun.uproject'))['EngineAssociation'])" 2>/dev/null || echo "unknown")
if [ "$engine_assoc" = "${UE5_VERSION}" ]; then
  log "Engine association: ${engine_assoc} (matches pipeline UE5.${UE5_VERSION})"
else
  warn "Engine association: ${engine_assoc} (expected ${UE5_VERSION})"
fi

# Generate project files (if not from Docker)
if [ "$FROM_DOCKER" = false ]; then
  step "Generating UE5 project files..."
  UBT_PATH="${UE5_INSTALL}/Engine/Binaries/Linux/UnrealBuildTool"
  GPF_SCRIPT="${UE5_INSTALL}/Engine/Build/BatchFiles/Linux/GenerateProjectFiles.sh"

  if [ -f "${GPF_SCRIPT}" ]; then
    if ! run bash "${GPF_SCRIPT}" -project="$(pwd)/KhaaosRun.uproject" -game -engine 2>&1 | tail -10 | tee -a "${LOG_FILE}"; then
      die "GenerateProjectFiles failed for KhaaosRun"
    fi
  elif [ -f "${UBT_PATH}" ]; then
    if ! run "${UBT_PATH}" -project="$(pwd)/KhaaosRun.uproject" -game -engine -genmakefiles 2>&1 | tail -10 | tee -a "${LOG_FILE}"; then
      die "UBT project generation failed for KhaaosRun"
    fi
  else
    warn "No project generation script found — assuming Docker build will handle this"
  fi
  log "Project files generated"
fi

# ─── Phase 3: Compile Dedicated Server ────────────────────────────────────────
CURRENT_PHASE="3: Compile Dedicated Server"
CURRENT_EXIT=4

phase 3 "Compile ${BUILD_TARGET} (${BUILD_PLATFORM} ${BUILD_CONFIG})"

if [ "$FROM_DOCKER" = false ]; then
  UBT="${UE5_INSTALL}/Engine/Binaries/Linux/UnrealBuildTool"

  if [ ! -f "${UBT}" ]; then
    die "UnrealBuildTool not found at ${UBT}. Install UE5 first or use --from-docker."
  fi

  step "Building ${BUILD_TARGET} (${BUILD_PLATFORM} ${BUILD_CONFIG}, ${JOBS} jobs)..."
  info "Compilation output tail stored in ${LOG_FILE}"

  COMPILE_START=$(date +%s)

  if ! run "${UBT}" "${BUILD_TARGET}" "${BUILD_PLATFORM}" "${BUILD_CONFIG}" \
    -project="$(pwd)/KhaaosRun.uproject" \
    -Progress -NoHotReloadFromIDE -j"${JOBS}" \
    2>&1 | tail -50 | tee -a "${LOG_FILE}"; then
    die "Compilation of ${BUILD_TARGET} FAILED. Check ${LOG_FILE} for errors."
  fi

  COMPILE_END=$(date +%s)
  COMPILE_SECS=$((COMPILE_END - COMPILE_START))
  COMPILE_MINS=$((COMPILE_SECS / 60))

  log "Compilation successful in ${COMPILE_MINS}m ${COMPILE_SECS}s"
else
  info "Skipping local compilation (--from-docker: Docker will compile)"
fi

# ─── Phase 4: Package with UAT BuildCookRun ──────────────────────────────────
if [ "$BUILD_ONLY" = false ]; then
  CURRENT_PHASE="4: Package Server"
  CURRENT_EXIT=5

  phase 4 "Package Dedicated Server (UAT BuildCookRun)"

  if [ "$FROM_DOCKER" = false ]; then
    UAT="${UE5_INSTALL}/Engine/Build/BatchFiles/RunUAT.sh"

    if [ ! -f "${UAT}" ]; then
      die "RunUAT.sh not found at ${UAT}"
    fi

    step "Running UAT BuildCookRun..."
    mkdir -p "${DIST_DIR}"

    if ! run bash "${UAT}" BuildCookRun \
      -project="$(pwd)/KhaaosRun.uproject" \
      -noP4 \
      -platform="${BUILD_PLATFORM}" \
      -target="${BUILD_TARGET}" \
      -serverconfig="${BUILD_CONFIG}" \
      -cook \
      -build \
      -stage \
      -pak \
      -archive \
      -archivedirectory="${DIST_DIR}" \
      2>&1 | tail -30 | tee -a "${LOG_FILE}"; then
      die "UAT BuildCookRun FAILED. Check ${LOG_FILE} for errors."
    fi

    log "Server packaged to ${DIST_DIR}"

    # Verify packaged binary
    SERVER_BIN="${DIST_DIR}/LinuxServer/KhaaosRun/Binaries/Linux/KhaaosRunServer"
    if [ -f "${SERVER_BIN}" ]; then
      FILESIZE=$(du -h "${SERVER_BIN}" | cut -f1)
      log "Server binary: ${SERVER_BIN} (${FILESIZE})"
      if [ -x "${SERVER_BIN}" ]; then
        log "Server binary is executable"
      else
        warn "Server binary is NOT executable — setting permissions"
        run chmod +x "${SERVER_BIN}"
      fi
    else
      # Try alternate output path
      SERVER_BIN_ALT="${DIST_DIR}/LinuxNoEditor/KhaaosRun/Binaries/Linux/KhaaosRunServer"
      if [ -f "${SERVER_BIN_ALT}" ]; then
        FILESIZE=$(du -h "${SERVER_BIN_ALT}" | cut -f1)
        log "Server binary (alt path): ${SERVER_BIN_ALT} (${FILESIZE})"
      else
        warn "Server binary not found at expected paths. Listing artifacts:"
        find "${DIST_DIR}" -name "KhaaosRunServer*" 2>/dev/null | head -20 | tee -a "${LOG_FILE}" || true
      fi
    fi
  else
    info "Skipping local packaging (--from-docker: Docker will package)"
  fi
fi

# ─── Phase 5: Docker Image Build ─────────────────────────────────────────────
if [ "$BUILD_ONLY" = false ]; then
  CURRENT_PHASE="5: Docker Image Build"
  CURRENT_EXIT=6

  phase 5 "Build Docker Image"

  if [ ! -f "${DOCKERFILE}" ]; then
    die "Dockerfile not found at ${DOCKERFILE}"
  fi

  DOCKER_TAG="khaaos-run-server:$(date +%Y%m%d-%H%M%S)"
  DOCKER_LATEST="khaaos-run-server:latest"

  cd "${REPO_ROOT}"

  step "Building Docker image (this may take 30-60 min on first run)..."

  DOCKER_BUILD_START=$(date +%s)

  if run docker build \
    -t "${DOCKER_TAG}" \
    -t "${DOCKER_LATEST}" \
    -f "${DOCKERFILE}" \
    --build-arg UE5_PATH="${UE5_INSTALL}" \
    --progress=plain \
    . 2>&1 | tail -30 | tee -a "${LOG_FILE}"; then
    log "Docker image built: ${DOCKER_TAG}"
  else
    die "Docker build FAILED. Check ${LOG_FILE} for errors."
  fi

  DOCKER_BUILD_END=$(date +%s)
  DOCKER_BUILD_SECS=$((DOCKER_BUILD_END - DOCKER_BUILD_START))
  DOCKER_BUILD_MINS=$((DOCKER_BUILD_SECS / 60))

  log "Docker build completed in ${DOCKER_BUILD_MINS}m ${DOCKER_BUILD_SECS}s"

  # Verify Docker image
  step "Verifying Docker image..."
  IMAGE_SIZE=$(docker image inspect "${DOCKER_LATEST}" --format='{{.Size}}' 2>/dev/null || echo "0")
  IMAGE_SIZE_GB=$(echo "scale=2; ${IMAGE_SIZE} / 1073741824" | bc 2>/dev/null || echo "unknown")
  log "Docker image size: ${IMAGE_SIZE_GB}GB"

  # Also build with docker-compose if compose file exists
  COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.build.yml"
  if [ -f "${COMPOSE_FILE}" ]; then
    step "Building via docker-compose..."
    if run docker compose -f "${COMPOSE_FILE}" build 2>&1 | tail -20 | tee -a "${LOG_FILE}"; then
      log "docker-compose build successful"
    else
      warn "docker-compose build failed (non-fatal, image already built)"
    fi
  fi
fi

# ─── Phase 6: Smoke Test ─────────────────────────────────────────────────────
if [ "$BUILD_ONLY" = false ]; then
  CURRENT_PHASE="6: Smoke Test"
  CURRENT_EXIT=7

  phase 6 "Smoke Test"

  step "Running container smoke test..."

  # Start container with timeout
  CONTAINER_NAME="khaaos-smoke-$(date +%s)"
  SMOKETEST_PASS=true

  # Run container in background
  run docker run -d \
    --name "${CONTAINER_NAME}" \
    -p 7777:7777/udp \
    -p 7778:7778/udp \
    -p 27015:27015/udp \
    -e SERVER_NAME="smoke-test" \
    -e MAX_PLAYERS=10 \
    -e MAP_NAME="Main" \
    "${DOCKER_LATEST}" 2>&1 | tee -a "${LOG_FILE}" || SMOKETEST_PASS=false

  if [ "$SMOKETEST_PASS" = true ] && [ "$DRY_RUN" = false ]; then
    step "Waiting for server startup (60s)..."
    sleep 60

    # Check container is running
    CONTAINER_STATUS=$(docker inspect -f '{{.State.Status}}' "${CONTAINER_NAME}" 2>/dev/null || echo "not_found")
    if [ "$CONTAINER_STATUS" = "running" ]; then
      log "Container is running"

      # Check health
      step "Checking container health..."
      HEALTH_STATUS=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${CONTAINER_NAME}" 2>/dev/null || echo "none")
      log "Health status: ${HEALTH_STATUS}"

      # Check port binding
      step "Checking port 7777/udp..."
      if docker port "${CONTAINER_NAME}" 7777/udp &>/dev/null; then
        log "Port 7777/udp is bound"
      else
        warn "Port 7777/udp not detected (may be UDP-only)"
      fi

      # Check server logs for startup
      step "Checking server logs for successful startup..."
      if docker logs "${CONTAINER_NAME}" 2>&1 | head -50 | grep -qi "listen\|ready\|server\|init"; then
        log "Server startup indicators found in logs"
      else
        warn "No explicit startup indicator in logs (may still be starting)"
      fi

    else
      warn "Container status: ${CONTAINER_STATUS} (expected 'running')"
      step "Container logs (last 30 lines):"
      docker logs "${CONTAINER_NAME}" 2>&1 | tail -30 | tee -a "${LOG_FILE}" || true
      SMOKETEST_PASS=false
    fi

    # Cleanup
    step "Cleaning up smoke test container..."
    docker stop "${CONTAINER_NAME}" &>/dev/null || true
    docker rm "${CONTAINER_NAME}" &>/dev/null || true
  fi

  if [ "$SMOKETEST_PASS" = true ]; then
    log "Smoke test PASSED"
  else
    if [ "$DRY_RUN" = true ]; then
      log "Smoke test SKIPPED (dry-run)"
    else
      die "Smoke test FAILED"
    fi
  fi
fi

# ─── Phase 7: Post-Build Validation ──────────────────────────────────────────
if [ "$BUILD_ONLY" = false ]; then
  CURRENT_PHASE="7: Post-Build Validation"
  CURRENT_EXIT=1

  phase 7 "Post-Build Validation"

  VALIDATE_SCRIPT="${SCRIPT_DIR}/validate_build.sh"
  if [ -f "${VALIDATE_SCRIPT}" ]; then
    step "Running validate_build.sh..."
    if run bash "${VALIDATE_SCRIPT}" 2>&1 | tee -a "${LOG_FILE}"; then
      log "Post-build validation PASSED"
    else
      warn "Post-build validation reported issues (non-fatal)"
    fi
  else
    warn "validate_build.sh not found — skipping detailed validation"
  fi
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
PIPELINE_END=$(date +%s)
PIPELINE_START="${PIPELINE_START:-$(date +%s)}"
TOTAL_SECS=$((PIPELINE_END - PIPELINE_START))
TOTAL_MINS=$((TOTAL_SECS / 60))

echo ""
echo "═══════════════════════════════════════════════════════════" | tee -a "${LOG_FILE}"
echo "  KHAAOS RUN — MVP Step 1: BUILD COMPLETE" | tee -a "${LOG_FILE}"
echo "═══════════════════════════════════════════════════════════" | tee -a "${LOG_FILE}"
echo "  UE5 Version:     ${UE5_VERSION}" | tee -a "${LOG_FILE}"
echo "  Build Target:    ${BUILD_TARGET}" | tee -a "${LOG_FILE}"
echo "  Platform:        ${BUILD_PLATFORM} ${BUILD_CONFIG}" | tee -a "${LOG_FILE}"
echo "  Server Dist:     ${DIST_DIR}" | tee -a "${LOG_FILE}"
echo "  Docker Image:    ${DOCKER_LATEST:-N/A}" | tee -a "${LOG_FILE}"
echo "  Total Time:      ${TOTAL_MINS}m ${TOTAL_SECS}s" | tee -a "${LOG_FILE}"
echo "  Jobs Used:       ${JOBS}" | tee -a "${LOG_FILE}"
echo "  Log File:        ${LOG_FILE}" | tee -a "${LOG_FILE}"
echo "═══════════════════════════════════════════════════════════" | tee -a "${LOG_FILE}"
echo "" | tee -a "${LOG_FILE}"
echo "  To run the dedicated server:" | tee -a "${LOG_FILE}"
echo "    cd ${DIST_DIR}/LinuxServer" | tee -a "${LOG_FILE}"
echo "    ./KhaaosRunServer KhaaosRun -log -port=7777" | tee -a "${LOG_FILE}"
echo "" | tee -a "${LOG_FILE}"
echo "  To run via Docker:" | tee -a "${LOG_FILE}"
echo "    docker run -p 7777:7777/udp -p 7778:7778/udp -p 27015:27015/udp ${DOCKER_LATEST:-khaaos-run-server:latest}" | tee -a "${LOG_FILE}"
echo "" | tee -a "${LOG_FILE}"
echo "  To run via docker-compose:" | tee -a "${LOG_FILE}"
echo "    docker compose -f ${SCRIPT_DIR}/docker-compose.build.yml up -d" | tee -a "${LOG_FILE}"
echo "" | tee -a "${LOG_FILE}"

exit 0
