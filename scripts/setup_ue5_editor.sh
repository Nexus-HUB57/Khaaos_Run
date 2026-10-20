#!/usr/bin/env bash
# ============================================================================
# Khaaos Run — UE5.8 Editor Setup & Project Compilation (Fase 0)
# ============================================================================
# Este script automatiza a instalação do UE5.8 Editor e a compilação
# do projeto KhaaosRun.uproject em Development/Linux (dedicated server).
#
# PREREQUISITES:
#   - Epic Games Account with UE5 access
#   - 100 GB+ free disk space
#   - 16 GB+ RAM (32 GB recommended)
#   - Vulkan-capable GPU (for Editor; server builds headless)
#   - Linux: Ubuntu 22.04+ / Debian 12+
#
# USAGE:
#   bash setup_ue5_editor.sh --install        # Full UE5.8 install from Epic
#   bash setup_ue5_editor.sh --from-source    # Build UE5.8 from GitHub source
#   bash setup_ue5_editor.sh --compile        # Compile KhaaosRun project
#   bash setup_ue5_editor.sh --server         # Build Linux dedicated server
#   bash setup_ue5_editor.sh --all            # Install + Compile + Server
#   bash setup_ue5_editor.sh --check          # Verify environment only
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
GH_PAT="${GH_PAT:-}"  # GitHub PAT with repo scope for EpicGames repo

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERR]${NC}   $*"; exit 1; }

# ─── Environment Check ────────────────────────────────────────────────────────
check_environment() {
    info "Checking build environment..."
    local PASS=true

    # OS
    if [[ "$(uname -s)" == "Linux" ]]; then
        ok "OS: Linux ($(uname -r))"
    else
        warn "OS: $(uname -s) — UE5 Editor requires Linux or Windows"
        PASS=false
    fi

    # CPU
    local CPUS=$(nproc 2>/dev/null || echo 4)
    if (( CPUS >= 8 )); then ok "CPU cores: ${CPUS}"; else warn "CPU cores: ${CPUS} (8+ recommended)"; PASS=false; fi

    # RAM
    local RAM_GB=$(awk '/MemTotal/ {printf "%.0f", $2/1024/1024}' /proc/meminfo 2>/dev/null || echo 8)
    if (( RAM_GB >= 16 )); then ok "RAM: ${RAM_GB} GB"; else warn "RAM: ${RAM_GB} GB (16+ GB recommended)"; PASS=false; fi

    # Disk
    local DISK_GB=$(df -BG /opt 2>/dev/null | awk 'NR==2 {gsub(/G/,"",$4); print $4}' || echo 50)
    if (( DISK_GB >= 100 )); then ok "Disk: ${DISK_GB} GB free"; else warn "Disk: ${DISK_GB} GB free (100+ GB recommended)"; PASS=false; fi

    # Git
    if command -v git &>/dev/null; then ok "Git: $(git --version)"; else err "Git not found"; fi

    # CMake (optional)
    if command -v cmake &>/dev/null; then ok "CMake: $(cmake --version | head -1)"; else warn "CMake not found (may need for dependencies)"; fi

    # Clang/GCC
    if command -v clang++ &>/dev/null; then ok "Clang: $(clang++ --version | head -1)"; 
    elif command -v g++ &>/dev/null; then ok "GCC: $(g++ --version | head -1)";
    else warn "No C++ compiler found — UE5 bundles its own, but system compiler helps"; fi

    # Vulkan (for Editor)
    if command -v vulkaninfo &>/dev/null; then ok "Vulkan: available"; else warn "Vulkan not found — required for UE5 Editor GUI"; fi

    # UE5 already installed?
    if [[ -d "${UE_INSTALL_DIR}/Engine" ]]; then
        ok "UE5 found at: ${UE_INSTALL_DIR}"
    else
        warn "UE5 not found at: ${UE_INSTALL_DIR} — needs installation"
        PASS=false
    fi

    # Project file
    if [[ -f "${UPROJECT}" ]]; then
        ok "Project: ${UPROJECT}"
    else
        warn "Project .uproject not found at: ${UPROJECT}"
        PASS=false
    fi

    if $PASS; then
        ok "Environment check: ALL PASS"
    else
        warn "Environment check: some items need attention"
    fi
}

# ─── Install UE5 from Epic Games Launcher (binary) ────────────────────────────
install_ue5_binary() {
    info "Installing UE${UE_VERSION} from Epic Games Launcher..."
    info "This requires the Epic Games Launcher for Linux."
    echo ""
    info "Option 1: Epic Games Launcher (recommended)"
    info "  1. Download: https://www.epicgames.com/store/en-US/download"
    info "  2. Install Launcher"
    info "  3. Install Unreal Engine ${UE_VERSION} via Launcher"
    info "  4. Set UE_INSTALL_DIR to the install path"
    echo ""
    info "Option 2: Direct download (no Launcher)"
    info "  1. Go to: https://www.unrealengine.com/en-US/linux"
    info "  2. Download UE${UE_VERSION} Linux .tar.gz"
    info "  3. Extract to: ${UE_INSTALL_DIR}"
    echo ""
    info "After installation, run:"
    info "  bash $0 --compile"
}

# ─── Build UE5 from GitHub Source ─────────────────────────────────────────────
install_ue5_source() {
    info "Building UE${UE_VERSION} from GitHub source (2-4 hours)..."

    if [[ -z "${GH_PAT}" ]]; then
        err "GH_PAT not set. Register at https://epicgames.com/en-US/unrealengine/signup\n" \
            "then fork https://github.com/EpicGames/UnrealEngine and set GH_PAT."
    fi

    if [[ -d "${UE_INSTALL_DIR}/.git" ]]; then
        info "Source repo exists, pulling latest..."
        cd "${UE_INSTALL_DIR}"
        git fetch origin
        git checkout "${UE_BRANCH}"
        git pull origin "${UE_BRANCH}"
    else
        info "Cloning UE${UE_VERSION} source (~4 GB)..."
        mkdir -p "${UE_INSTALL_DIR}"
        git clone --depth 1 --branch "${UE_BRANCH}" \
            "https://${GH_PAT}@github.com/EpicGames/UnrealEngine.git" \
            "${UE_INSTALL_DIR}"
    fi

    cd "${UE_INSTALL_DIR}"

    # Setup
    info "Running Setup.sh..."
    bash Setup.sh

    # Generate project files
    info "Generating project files..."
    bash GenerateProjectFiles.sh

    # Build
    info "Building UE5 Editor (this takes 2-4 hours)..."
    make -j$(nproc)

    ok "UE5 Editor built at: ${UE_INSTALL_DIR}/Engine/Binaries/Linux/UnrealEditor"
}

# ─── Compile KhaaosRun Project ────────────────────────────────────────────────
compile_project() {
    info "Compiling KhaaosRun project..."

    local UBT="${UE_INSTALL_DIR}/Engine/Build/BatchFiles/Linux/Build.sh"
    if [[ ! -f "${UBT}" ]]; then
        # Try alternate paths
        UBT="${UE_INSTALL_DIR}/Engine/Binaries/DotNET/UnrealBuildTool/UnrealBuildTool"
    fi

    if [[ ! -f "${UBT}" ]] && [[ ! -d "${UE_INSTALL_DIR}/Engine" ]]; then
        err "UE5 Engine not found at ${UE_INSTALL_DIR}\n" \
            "Run 'bash $0 --install' or 'bash $0 --from-source' first."
    fi

    # Generate project files
    info "Generating project files for KhaaosRun..."
    if [[ -f "${UE_INSTALL_DIR}/Engine/Build/BatchFiles/Linux/GenerateProjectFiles.sh" ]]; then
        bash "${UE_INSTALL_DIR}/Engine/Build/BatchFiles/Linux/GenerateProjectFiles.sh" -project="${UPROJECT}" -game -engine
    fi

    # Build Development/Linux
    info "Building KhaaosRun Development/Linux..."
    if [[ -f "${UE_INSTALL_DIR}/Engine/Build/BatchFiles/Linux/Build.sh" ]]; then
        bash "${UE_INSTALL_DIR}/Engine/Build/BatchFiles/Linux/Build.sh" KhaaosRunEditor Linux Development "${UPROJECT}" -waitmutex
    else
        # Use UAT directly
        local UAT="${UE_INSTALL_DIR}/Engine/Binaries/DotNET/UnrealAutomationTool/UnrealAutomationTool"
        ${UAT} BuildCookRun -project="${UPROJECT}" -noP4 -platform=Linux -clientconfig=Development -serverconfig=Development -build -Compile
    fi

    ok "KhaaosRun compiled successfully!"
}

# ─── Build Dedicated Server ──────────────────────────────────────────────────
build_server() {
    info "Building KhaaosRun Linux Dedicated Server..."
    bash "${PROJECT_DIR}/scripts/build-server.sh" --ue5="${UE_INSTALL_DIR}" --release --clean
    ok "Dedicated server build complete!"
}

# ─── Generate 3D Maps (.umap), Meshes & Niagara Assets via Commandlet ────────
generate_maps() {
    info "Running KhaaosWorldAssetBuilderCommandlet for CIGKV + W1-W4..."
    local EDITOR_CMD="${UE_INSTALL_DIR}/Engine/Binaries/Linux/UnrealEditor-Cmd"
    if [[ ! -f "${EDITOR_CMD}" ]]; then
        err "UnrealEditor-Cmd not found at ${EDITOR_CMD}"
    fi
    "${EDITOR_CMD}" "${UPROJECT}" -run=KhaaosWorldAssetBuilder -world=All -nopause -unattended -nullrhi
    ok "All 5 worlds (.umap, StaticMeshes, DataTables, Niagara VFX) generated!"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
    local ACTION="${1:---check}"

    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║   Khaaos Run — UE5.8 Editor Setup & Compilation (F0)    ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""

    case "${ACTION}" in
        --check)          check_environment ;;
        --install)        check_environment; install_ue5_binary ;;
        --from-source)    check_environment; install_ue5_source ;;
        --compile)        check_environment; compile_project ;;
        --generate-maps)  check_environment; generate_maps ;;
        --server)         check_environment; build_server ;;
        --all)            check_environment; install_ue5_source; compile_project; generate_maps; build_server ;;
        *)                err "Unknown action: ${ACTION}\nUsage: $0 [--check|--install|--from-source|--compile|--generate-maps|--server|--all]" ;;
    esac
}

main "$@"
