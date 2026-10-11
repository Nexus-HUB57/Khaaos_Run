#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — UE5.8 Linux Dedicated Server Build Script | Devs Ph.D
# Copyright Nexus-HUB57. All Rights Reserved.
# =============================================================================
#
# Automates the UE5 Linux dedicated server build pipeline:
#   1. Validate UE5 installation path
#   2. Generate project files
#   3. Build dedicated server target
#   4. Package server for deployment
#   5. (Optional) Build Docker image
#   6. (Optional) Push image to GHCR
#
# Usage:
#   ./build-server.sh                          # Default: Development build
#   ./build-server.sh --release                # Shipping configuration
#   ./build-server.sh --debug                  # Debug configuration
#   ./build-server.sh --clean                  # Clean intermediate files first
#   ./build-server.sh --docker                 # Build Docker image after packaging
#   ./build-server.sh --upload                 # Push Docker image to GHCR
#   ./build-server.sh --release --docker --upload  # Full production pipeline
# =============================================================================

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ── Logging ─────────────────────────────────────────────────────────────────────
log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

# ── Defaults ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_DIR="${REPO_ROOT}/Unreal/KhaaosRun"
PROJECT_FILE="${PROJECT_DIR}/KhaaosRun.uproject"
BUILD_DIR="${PROJECT_DIR}/Build"

UE5_PATH="${UE5_PATH:-/home/ue4/UnrealEngine}"
CONFIGURATION="Development"
TARGET="KhaaosRunServer"
PLATFORM="Linux"
CLEAN=false
BUILD_DOCKER=false
UPLOAD_IMAGE=false
IMAGE_REGISTRY="${IMAGE_REGISTRY:-ghcr.io/nexus-hub57}"
IMAGE_NAME="khaaos-server"

# ── Parse Arguments ─────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)    CLEAN=true; shift ;;
        --debug)    CONFIGURATION="Debug"; shift ;;
        --release)  CONFIGURATION="Shipping"; shift ;;
        --docker)   BUILD_DOCKER=true; shift ;;
        --upload)   UPLOAD_IMAGE=true; BUILD_DOCKER=true; shift ;;
        --ue5=*)    UE5_PATH="${1#*=}"; shift ;;
        -h|--help)
            echo "Usage: $0 [--clean] [--debug|--release] [--docker] [--upload] [--ue5=PATH]"
            exit 0
            ;;
        *)
            log_error "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# ── Step 1: Validate UE5 Installation ──────────────────────────────────────────
log_step "Step 1: Validating UE5 Installation"

if [[ ! -d "${UE5_PATH}" ]]; then
    log_error "UE5 not found at: ${UE5_PATH}"
    log_info "Set UE5_PATH environment variable or use --ue5=/path/to/UnrealEngine"
    exit 1
fi

UE5_BUILD_SCRIPT="${UE5_PATH}/Engine/Build/BatchFiles/Linux/Build.sh"
UE5_UAT_SCRIPT="${UE5_PATH}/Engine/Build/BatchFiles/RunUAT.sh"
UE5_GEN_SCRIPT="${UE5_PATH}/Engine/Build/BatchFiles/Linux/GenerateProjectFiles.sh"

if [[ ! -f "${UE5_BUILD_SCRIPT}" ]]; then
    log_error "UE5 Build.sh not found at: ${UE5_BUILD_SCRIPT}"
    exit 1
fi

log_ok "UE5 found at: ${UE5_PATH}"

# Validate project file
if [[ ! -f "${PROJECT_FILE}" ]]; then
    log_error "Project file not found: ${PROJECT_FILE}"
    exit 1
fi
log_ok "Project file: ${PROJECT_FILE}"

# ── Step 2: Clean (if requested) ───────────────────────────────────────────────
if [[ "${CLEAN}" == true ]]; then
    log_step "Step 2: Cleaning Intermediate Files"
    rm -rf "${PROJECT_DIR}/Intermediate"
    rm -rf "${PROJECT_DIR}/Binaries"
    rm -rf "${PROJECT_DIR}/Saved/Logs"
    rm -rf "${PROJECT_DIR}/PackagedServer"
    log_ok "Cleaned intermediate and binary files"
fi

# ── Step 3: Generate Project Files ─────────────────────────────────────────────
log_step "Step 3: Generating Project Files"

if "${UE5_GEN_SCRIPT}" \
    -project="${PROJECT_FILE}" \
    -game \
    -engine; then
    log_ok "Project files generated"
else
    log_error "Failed to generate project files"
    exit 1
fi

# ── Step 4: Build Dedicated Server ─────────────────────────────────────────────
log_step "Step 4: Building ${TARGET} (${CONFIGURATION}) for ${PLATFORM}"

BUILD_START=$(date +%s)

if "${UE5_BUILD_SCRIPT}" \
    "${TARGET}" "${PLATFORM}" "${CONFIGURATION}" \
    -project="${PROJECT_FILE}" \
    -WaitMutex -FromDist; then
    BUILD_END=$(date +%s)
    BUILD_DURATION=$((BUILD_END - BUILD_START))
    log_ok "Build completed in ${BUILD_DURATION}s"
else
    log_error "Build failed"
    exit 1
fi

# ── Step 5: Package Server ─────────────────────────────────────────────────────
log_step "Step 5: Packaging Dedicated Server"

ARCHIVE_DIR="${PROJECT_DIR}/PackagedServer"

if "${UE5_UAT_SCRIPT}" \
    BuildCookRun \
    -project="${PROJECT_FILE}" \
    -noP4 \
    -platform="${PLATFORM}" \
    -target="${TARGET}" \
    -serverconfig \
    -cook \
    -build \
    -stage \
    -pak \
    -archive \
    -archivedirectory="${ARCHIVE_DIR}"; then
    log_ok "Server packaged to: ${ARCHIVE_DIR}"
else
    log_error "Packaging failed"
    exit 1
fi

# ── Step 6: Docker Build ───────────────────────────────────────────────────────
if [[ "${BUILD_DOCKER}" == true ]]; then
    log_step "Step 6: Building Docker Image"

    IMAGE_TAG="${IMAGE_REGISTRY}/${IMAGE_NAME}:${CONFIGURATION,,}-$(date +%Y%m%d)-$(git rev-parse --short HEAD 2>/dev/null || echo 'local')"

    if docker build \
        -t "${IMAGE_TAG}" \
        -t "${IMAGE_REGISTRY}/${IMAGE_NAME}:latest" \
        -f "${BUILD_DIR}/Dockerfile" \
        "${PROJECT_DIR}"; then
        log_ok "Docker image built: ${IMAGE_TAG}"
    else
        log_error "Docker build failed"
        exit 1
    fi

    # ── Step 7: Upload to GHCR ──────────────────────────────────────────────
    if [[ "${UPLOAD_IMAGE}" == true ]]; then
        log_step "Step 7: Pushing Image to GHCR"

        if docker push "${IMAGE_TAG}" && \
           docker push "${IMAGE_REGISTRY}/${IMAGE_NAME}:latest"; then
            log_ok "Image pushed to GHCR"
        else
            log_error "Image push failed (check authentication: docker login ghcr.io)"
            exit 1
        fi
    fi
fi

# ── Summary ─────────────────────────────────────────────────────────────────────
log_step "Build Summary"
echo "  Configuration : ${CONFIGURATION}"
echo "  Target        : ${TARGET}"
echo "  Platform      : ${PLATFORM}"
echo "  Project       : ${PROJECT_FILE}"
echo "  UE5 Path      : ${UE5_PATH}"
echo "  Archive       : ${ARCHIVE_DIR}"
if [[ "${BUILD_DOCKER}" == true ]]; then
    echo "  Docker Image  : ${IMAGE_TAG}"
fi
echo ""
log_ok "Build pipeline complete!"
