#!/usr/bin/env bash
# ============================================================================
# Khaaos Run — UE5.8 Editor Setup & Project Compilation (Fase 0)
# ============================================================================
# Automates UE5.8 Editor installation and KhaaosRun project compilation.
#
# PREREQUISITES:
#   - Epic Games Account with UE5 access (for binary or source build)
#   - 100 GB+ free disk space (200 GB+ for source build)
#   - 32 GB+ RAM (64 GB recommended for source build)
#   - 8+ CPU cores (16+ recommended)
#   - Vulkan 1.3+ capable GPU (for Editor; server builds headless)
#   - Clang 16+ or GCC 12+ (UE5 bundles its own, but system helps)
#   - Git LFS, CMake 3.22+
#   - Linux: Ubuntu 22.04+ / Debian 12+
#
# USAGE:
#   bash setup_ue5_editor.sh --check          # Verify environment only
#   bash setup_ue5_editor.sh --install        # Install UE5.8 from Epic Launcher
#   bash setup_ue5_editor.sh --from-source    # Build UE5.8 from GitHub source
#   bash setup_ue5_editor.sh --compile        # Compile KhaaosRun (Development Editor)
#   bash setup_ue5_editor.sh --server         # Build Linux dedicated server
#   bash setup_ue5_editor.sh --all            # Install + Compile + Server
#
# ENVIRONMENT VARIABLES:
#   UE_INSTALL_DIR  — UE5 install path (default: /opt/UnrealEngine)
#   GH_PAT          — GitHub PAT for EpicGames/UnrealEngine access
#   KHAAOS_EAC_SDK_DIR — Easy Anti-Cheat SDK path (optional)
#   BUILD_CONFIG    — Build config: Development|Shipping (default: Development)
# ============================================================================
set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
UE_VERSION="5.8"
UE_BRANCH="5.8"
UE_INSTALL_DIR="${UE_INSTALL_DIR:-/opt/UnrealEngine}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
UPROJECT="${PROJECT_DIR}/Unreal/KhaaosRun/KhaaosRun.uproject"
BUILD_DIR="${PROJECT_DIR}/Unreal/KhaaosRun/Build"
EPIC_GITHUB="https://github.com/EpicGames/UnrealEngine.git"
GH_PAT="${GH_PAT:-}"
BUILD_CONFIG="${BUILD_CONFIG:-Development}"
PARALLEL_JOBS="${PARALLEL_JOBS:-$(nproc 2>/dev/null || echo 4)}"

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
step()  { echo -e "${CYAN}[STEP]${NC}  $*"; }
err()   { echo -e "${RED}[ERR]${NC}   $*"; exit 1; }

# ============================================================================
# Environment Check
# ============================================================================
check_environment() {
    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Khaaos Run — UE5.8 Environment Check (Fase 0)             ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    local PASS=true
    local WARNINGS=0

    # ── OS ────────────────────────────────────────────────────────────────────
    step "Operating System"
    local OS_NAME="$(uname -s)"
    local OS_VER=""
    if [[ "${OS_NAME}" == "Linux" ]]; then
        if [[ -f /etc/os-release ]]; then
            OS_VER="$(source /etc/os-release && echo "${PRETTY_NAME}")"
        fi
        ok "OS: Linux — ${OS_VER:-$(uname -r)}"
    else
        warn "OS: ${OS_NAME} — UE5 Editor requires Linux (Ubuntu 22.04+) or Windows"
        PASS=false; ((WARNINGS++))
    fi

    # ── CPU ───────────────────────────────────────────────────────────────────
    step "CPU"
    local CPUS=$(nproc 2>/dev/null || echo 4)
    if (( CPUS >= 16 )); then ok "CPU cores: ${CPUS} (optimal)";
    elif (( CPUS >= 8 )); then ok "CPU cores: ${CPUS} (acceptable)";
    else warn "CPU cores: ${CPUS} — 8+ recommended, 16+ for source build"; PASS=false; ((WARNINGS++)); fi

    # ── RAM ───────────────────────────────────────────────────────────────────
    step "RAM"
    local RAM_GB=$(awk '/MemTotal/ {printf "%.0f", $2/1024/1024}' /proc/meminfo 2>/dev/null || echo 8)
    if (( RAM_GB >= 64 )); then ok "RAM: ${RAM_GB} GB (optimal for source build)";
    elif (( RAM_GB >= 32 )); then ok "RAM: ${RAM_GB} GB (recommended)";
    elif (( RAM_GB >= 16 )); then warn "RAM: ${RAM_GB} GB (16 GB minimum, 32+ recommended)"; PASS=false; ((WARNINGS++));
    else warn "RAM: ${RAM_GB} GB (insufficient — 16 GB minimum)"; PASS=false; ((WARNINGS++)); fi

    # ── Disk ──────────────────────────────────────────────────────────────────
    step "Disk Space"
    local DISK_GB=$(df -BG /opt 2>/dev/null | awk 'NR==2 {gsub(/G/,"",$4); print $4}' || echo 50)
    if (( DISK_GB >= 200 )); then ok "Disk: ${DISK_GB} GB free (optimal for source build)";
    elif (( DISK_GB >= 100 )); then ok "Disk: ${DISK_GB} GB free (minimum for binary install)";
    else warn "Disk: ${DISK_GB} GB free — 100+ GB required, 200+ GB for source build"; PASS=false; ((WARNINGS++)); fi

    # ── Git ───────────────────────────────────────────────────────────────────
    step "Git"
    if command -v git &>/dev/null; then
        ok "Git: $(git --version)"
        # Check Git LFS
        if git lfs version &>/dev/null; then ok "Git LFS: $(git lfs version 2>/dev/null | head -1)";
        else warn "Git LFS not found — required for UE5 assets"; ((WARNINGS++)); fi
    else err "Git not found — install: apt install git git-lfs"; fi

    # ── CMake ─────────────────────────────────────────────────────────────────
    step "CMake"
    if command -v cmake &>/dev/null; then ok "CMake: $(cmake --version | head -1)";
    else warn "CMake not found — may be needed for third-party dependencies"; ((WARNINGS++)); fi

    # ── Clang/GCC ─────────────────────────────────────────────────────────────
    step "C++ Compiler"
    if command -v clang++ &>/dev/null; then
        local CLANG_VER=$(clang++ --version | head -1)
        ok "Clang: ${CLANG_VER}"
    elif command -v g++ &>/dev/null; then
        local GCC_VER=$(g++ --version | head -1)
        ok "GCC: ${GCC_VER}"
    else
        warn "No system C++ compiler found — UE5 bundles its own Clang, but a system compiler helps"
        ((WARNINGS++))
    fi

    # ── Vulkan ────────────────────────────────────────────────────────────────
    step "Vulkan (GPU rendering for Editor)"
    if command -v vulkaninfo &>/dev/null; then
        local VK_VER=$(vulkaninfo --summary 2>/dev/null | awk '/apiVersion/ {print $3}' | head -1)
        ok "Vulkan: available ${VK_VER:+(API ${VK_VER})}"
    else
        warn "Vulkan not found — required for UE5 Editor GUI (headless server builds don't need it)"
        PASS=false; ((WARNINGS++))
    fi

    # ── UE5 Already Installed? ────────────────────────────────────────────────
    step "UE5 Engine"
    if [[ -d "${UE_INSTALL_DIR}/Engine" ]]; then
        ok "UE5 found at: ${UE_INSTALL_DIR}"
        if [[ -f "${UE_INSTALL_DIR}/Engine/Binaries/Linux/UnrealEditor" ]]; then
            ok "UE5 Editor binary exists"
        else
            warn "UE5 directory found but Editor binary missing — may need build step"
        fi
    else
        warn "UE5 not found at: ${UE_INSTALL_DIR} — needs installation"
        PASS=false
    fi

    # ── Project File ──────────────────────────────────────────────────────────
    step "Project (.uproject)"
    if [[ -f "${UPROJECT}" ]]; then
        ok "Project: ${UPROJECT}"
        local ENGINE_ASSOC=$(python3 -c "import json; d=json.load(open('${UPROJECT}')); print(d.get('EngineAssociation','?'))" 2>/dev/null || echo "?")
        if [[ "${ENGINE_ASSOC}" == "5.8" ]]; then
            ok "EngineAssociation: 5.8 (correct)"
        else
            warn "EngineAssociation: ${ENGINE_ASSOC} — expected 5.8"
            ((WARNINGS++))
        fi
    else
        warn "Project .uproject not found at: ${UPROJECT}"
        PASS=false
    fi

    # ── Summary ───────────────────────────────────────────────────────────────
    echo ""
    if $PASS && ((WARNINGS == 0)); then
        ok "Environment check: ALL PASS ✓"
    else
        warn "Environment check: ${WARNINGS} warning(s), some items need attention"
    fi
    echo ""
}

# ============================================================================
# Install UE5 from Epic Games Launcher (binary)
# ============================================================================
install_ue5_binary() {
    echo ""
    step "Installing UE${UE_VERSION} from Epic Games Launcher (binary distribution)"
    echo ""
    info "This requires the Epic Games Launcher for Linux."
    echo ""
    info "━━━ Option 1: Epic Games Launcher (recommended) ━━━"
    info "  1. Download Launcher: https://www.epicgames.com/store/en-US/download"
    info "  2. Install the Launcher"
    info "  3. Sign in with your Epic Games account"
    info "  4. Navigate to Unreal Engine → Library → Add Version"
    info "  5. Select version ${UE_VERSION} and install"
    info "  6. Set UE_INSTALL_DIR to the install path"
    echo ""
    info "━━━ Option 2: Direct Linux Download (no Launcher) ━━━"
    info "  1. Visit: https://www.unrealengine.com/en-US/linux"
    info "  2. Download UE${UE_VERSION} for Linux (.tar.gz)"
    info "  3. Extract to: ${UE_INSTALL_DIR}"
    info "  4. Run: ${UE_INSTALL_DIR}/Engine/Binaries/Linux/UnrealEditor"
    echo ""
    info "━━━ Option 3: Docker (headless/server builds only) ━━━"
    info "  cd ${BUILD_DIR}"
    info "  docker build -t khaaos-server:latest ."
    echo ""
    info "After installation, run:"
    info "  bash $0 --compile"
}

# ============================================================================
# Build UE5 from GitHub Source
# ============================================================================
install_ue5_source() {
    echo ""
    step "Building UE${UE_VERSION} from GitHub source (2-4 hours on 16+ cores)"
    echo ""

    # Prerequisite: GitHub PAT
    if [[ -z "${GH_PAT}" ]]; then
        err "GH_PAT environment variable not set.\n" \
            "Register at https://epicgames.com/en-US/unrealengine/signup\n" \
            "Fork https://github.com/EpicGames/UnrealEngine\n" \
            "Set GH_PAT to your Personal Access Token with repo scope."
    fi

    # Clone or update
    if [[ -d "${UE_INSTALL_DIR}/.git" ]]; then
        info "Source repo exists at ${UE_INSTALL_DIR}, pulling latest..."
        cd "${UE_INSTALL_DIR}"
        git fetch origin
        git checkout "${UE_BRANCH}"
        git pull origin "${UE_BRANCH}"
    else
        info "Cloning UE${UE_VERSION} source (~4 GB, shallow clone)..."
        mkdir -p "$(dirname "${UE_INSTALL_DIR}")"
        git clone --depth 1 --branch "${UE_BRANCH}" \
            "https://${GH_PAT}@github.com/EpicGames/UnrealEngine.git" \
            "${UE_INSTALL_DIR}"
    fi

    cd "${UE_INSTALL_DIR}"

    # Run Setup.sh (downloads prerequisites ~3 GB)
    info "Running Setup.sh (downloads third-party dependencies)..."
    bash Setup.sh

    # Generate project files
    info "Generating UE5 project files..."
    bash GenerateProjectFiles.sh -Game -Engine

    # Build the Editor
    info "Building UE5 Editor (${PARALLEL_JOBS} parallel jobs)..."
    info "This typically takes 2-4 hours depending on hardware."
    make -j"${PARALLEL_JOBS}"

    ok "UE5 Editor built at: ${UE_INSTALL_DIR}/Engine/Binaries/Linux/UnrealEditor"
    info "Verify by running: ${UE_INSTALL_DIR}/Engine/Binaries/Linux/UnrealEditor"
}

# ============================================================================
# Compile KhaaosRun Project (Development Editor)
# ============================================================================
compile_project() {
    echo ""
    step "Compiling KhaaosRun — ${BUILD_CONFIG} Editor target"
    echo ""

    # Locate UBT
    local UBT="${UE_INSTALL_DIR}/Engine/Build/BatchFiles/Linux/Build.sh"
    local GEN="${UE_INSTALL_DIR}/Engine/Build/BatchFiles/Linux/GenerateProjectFiles.sh"
    local UAT="${UE_INSTALL_DIR}/Engine/Build/BatchFiles/RunUAT.sh"

    if [[ ! -d "${UE_INSTALL_DIR}/Engine" ]]; then
        err "UE5 Engine not found at ${UE_INSTALL_DIR}\n" \
            "Run 'bash $0 --install' or 'bash $0 --from-source' first."
    fi

    # Verify project file
    if [[ ! -f "${UPROJECT}" ]]; then
        err "Project file not found: ${UPROJECT}"
    fi

    # Step 1: Generate project files (equivalent to GenerateProjectFiles)
    info "Step 1/3: Generating project files (UHT + UBT)..."
    if [[ -f "${GEN}" ]]; then
        bash "${GEN}" -project="${UPROJECT}" -game -engine -progress
        ok "Project files generated"
    else
        warn "GenerateProjectFiles.sh not found at expected path"
    fi

    # Step 2: Build Development Editor
    info "Step 2/3: Building KhaaosRunEditor Linux ${BUILD_CONFIG}..."
    if [[ -f "${UBT}" ]]; then
        bash "${UBT}" KhaaosRunEditor Linux ${BUILD_CONFIG} "${UPROJECT}" -WaitMutex -FromDist
        ok "KhaaosRunEditor compiled successfully!"
    elif [[ -f "${UAT}" ]]; then
        bash "${UAT}" BuildCookRun \
            -project="${UPROJECT}" \
            -noP4 \
            -platform=Linux \
            -clientconfig=${BUILD_CONFIG} \
            -serverconfig=${BUILD_CONFIG} \
            -build \
            -Compile
        ok "KhaaosRun compiled via UAT!"
    else
        err "Neither Build.sh nor RunUAT.sh found at ${UE_INSTALL_DIR}"
    fi

    # Step 3: Verify output
    info "Step 3/3: Verifying build output..."
    local BIN_DIR="${PROJECT_DIR}/Unreal/KhaaosRun/Binaries/Linux"
    if [[ -f "${BIN_DIR}/KhaaosRunEditor" ]]; then
        ok "Editor binary: ${BIN_DIR}/KhaaosRunEditor"
    else
        warn "Editor binary not found at expected path (may be in Intermediate/)"
    fi
}

# ============================================================================
# Build Dedicated Server
# ============================================================================
build_server() {
    echo ""
    step "Building KhaaosRun Linux Dedicated Server"
    echo ""

    local UBT="${UE_INSTALL_DIR}/Engine/Build/BatchFiles/Linux/Build.sh"
    local UAT="${UE_INSTALL_DIR}/Engine/Build/BatchFiles/RunUAT.sh"

    if [[ ! -d "${UE_INSTALL_DIR}/Engine" ]]; then
        err "UE5 Engine not found at ${UE_INSTALL_DIR}"
    fi

    # Build server target (headless, no Slate/UMG)
    info "Building KhaaosRunServer Linux ${BUILD_CONFIG}..."
    if [[ -f "${UBT}" ]]; then
        bash "${UBT}" KhaaosRunServer Linux ${BUILD_CONFIG} "${UPROJECT}" -WaitMutex
        ok "KhaaosRunServer compiled!"
    fi

    # Package for deployment
    info "Packaging dedicated server for deployment..."
    if [[ -f "${UAT}" ]]; then
        bash "${UAT}" BuildCookRun \
            -project="${UPROJECT}" \
            -noP4 \
            -platform=Linux \
            -target=KhaaosRunServer \
            -serverconfig=${BUILD_CONFIG} \
            -cook \
            -build \
            -stage \
            -pak \
            -archive \
            -archivedirectory="${BUILD_DIR}/PackagedServer"
        ok "Server packaged at: ${BUILD_DIR}/PackagedServer"
    fi

    # Alternative: Docker build
    if [[ -f "${BUILD_DIR}/Dockerfile" ]]; then
        info "Docker build available: cd ${BUILD_DIR} && docker build -t khaaos-server:latest ."
    fi
}

# ============================================================================
# Main
# ============================================================================
main() {
    local ACTION="${1:---check}"

    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║   Khaaos Run — UE5.8 Editor Setup & Compilation (Fase 0)    ║${NC}"
    echo -e "${BOLD}║   Devs Ph.D | Copyright Nexus-HUB57                        ║${NC}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    case "${ACTION}" in
        --check)
            check_environment
            ;;
        --install)
            check_environment
            install_ue5_binary
            ;;
        --from-source)
            check_environment
            install_ue5_source
            ;;
        --compile)
            check_environment
            compile_project
            ;;
        --server)
            check_environment
            build_server
            ;;
        --all)
            check_environment
            install_ue5_source
            compile_project
            build_server
            ;;
        *)
            err "Unknown action: ${ACTION}\n" \
                "Usage: $0 [--check|--install|--from-source|--compile|--server|--all]"
            ;;
    esac
}

main "$@"
