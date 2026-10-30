#!/usr/bin/env bash
# ============================================================================
# Khaaos Run — GPU Machine Bootstrap (Cloud-Init Compatible v3.0)
# ============================================================================
# This script is designed to run as ECS user_data via Terraform.
# It wraps the full bootstrap with:
#   - Cloud-init header (#!/bin/bash)
#   - Tee to /var/log/khaaos_gpu_bootstrap.log
#   - NVIDIA driver + Xorg virtual framebuffer install
#   - Then delegates to the full gpu_machine_bootstrap.sh
# ============================================================================
# When used as Terraform user_data, this file MUST be in the same
# directory as the .tf files (or referenced via file() path).
# ============================================================================

# ─── Logging ─────────────────────────────────────────────────────────────────
LOG_FILE="/var/log/khaaos_gpu_bootstrap.log"
mkdir -p "$(dirname "${LOG_FILE}")"

exec > >(tee -a "${LOG_FILE}") 2>&1

echo ""
echo "========================================================================"
echo "  Khaaos Run — GPU Bootstrap v3.0 (Cloud-Init)"
echo "  Started: $(date -Iseconds)"
echo "  Host:    $(hostname)"
echo "  User:    $(whoami)"
echo "========================================================================"
echo ""

# ─── Phase 0: System Dependencies ────────────────────────────────────────────
echo "[Phase 0/7] Installing system dependencies..."

export DEBIAN_FRONTEND=noninteractive

# Update package lists
apt-get update -y

# Core build tools
apt-get install -y \
    build-essential cmake ninja-build clang-16 git git-lfs \
    python3 python3-pip python3-venv \
    curl wget unzip \
    vulkan-tools mesa-vulkan-drivers \
    2>&1 || echo "[WARN] Some packages may have failed — continuing"

# ─── Phase 1: NVIDIA Driver Installation ─────────────────────────────────────
echo "[Phase 1/7] Installing NVIDIA GPU drivers..."

if command -v nvidia-smi &>/dev/null; then
    echo "[OK] NVIDIA driver already installed: $(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1)"
else
    echo "[INFO] Installing NVIDIA driver via apt..."
    apt-get install -y nvidia-driver-535 2>&1 || {
        echo "[INFO] apt install failed — trying NVIDIA runfile..."
        # Fallback: download and run NVIDIA installer
        NVIDIA_DRIVER_URL="https://us.download.nvidia.com/XFree86/Linux-x86_64/535.154.05/NVIDIA-Linux-x86_64-535.154.05.run"
        wget -q "${NVIDIA_DRIVER_URL}" -O /tmp/nvidia-driver.run 2>/dev/null && \
        chmod +x /tmp/nvidia-driver.run && \
        /tmp/nvidia-driver.run --silent --no-x-check 2>&1 || \
        echo "[WARN] NVIDIA driver install failed — may need manual install after reboot"
    }
fi

# Verify GPU
if command -v nvidia-smi &>/dev/null; then
    nvidia-smi
    echo "[OK] GPU detected and driver loaded"
else
    echo "[WARN] nvidia-smi still not available — driver may load after reboot"
    echo "[INFO] Continuing with bootstrap (UE5 will fail without GPU but other steps will proceed)"
fi

# ─── Phase 2: Virtual Framebuffer (Xorg) ─────────────────────────────────────
echo "[Phase 2/7] Setting up virtual framebuffer for headless UE5..."

apt-get install -y xorg xorg-dev xvfb 2>&1 || echo "[WARN] Xorg install may have partial failures"

# Start Xvfb on display :99
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &
export DISPLAY=:99
echo "[OK] Xvfb started on :99 (1920x1080x24)"

# ─── Phase 3: Clone Khaaos_Run Repository ────────────────────────────────────
echo "[Phase 3/7] Cloning Khaaos_Run repository..."

KHAAOS_ROOT="/opt/Khaaos_Run"
REPO="${KHAAOS_ROOT}/repo"

if [ ! -d "${REPO}/.git" ]; then
    mkdir -p "${KHAAOS_ROOT}"

    # Clone with GH_PAT if available, otherwise public
    if [ -n "${GH_PAT:-}" ]; then
        git clone "https://${GH_PAT}@github.com/Nexus-HUB57/Khaaos_Run.git" "${REPO}" 2>&1
    else
        git clone "https://github.com/Nexus-HUB57/Khaaos_Run.git" "${REPO}" 2>&1 || \
        echo "[WARN] Public clone failed — repo may be private. Set GH_PAT env var."
    fi

    cd "${REPO}"
    git lfs pull 2>&1 || true
else
    echo "[OK] Repository already cloned at ${REPO}"
fi

# ─── Phase 4: Dev Tools Clone ────────────────────────────────────────────────
echo "[Phase 4/7] Setting up dev tools..."

DEV_TOOLS="${KHAAOS_ROOT}/dev-tools"
mkdir -p "${DEV_TOOLS}"

# Install tools we need (uv for MCP, etc.)
curl -LsSf https://astral.sh/uv/install.sh | sh 2>/dev/null || echo "[WARN] uv install skipped"

# ─── Phase 5: Run Full GPU Bootstrap ─────────────────────────────────────────
echo "[Phase 5/7] Running GPU Machine Bootstrap..."

BOOTSTRAP_SCRIPT="${DEV_TOOLS}/gpu_machine_bootstrap.sh"
if [ -f "${BOOTSTRAP_SCRIPT}" ]; then
   "${BOOTSTRAP_SCRIPT}" 2>&1
else
    echo "[INFO] Bootstrap script not at ${BOOTSTRAP_SCRIPT}"
    echo "[INFO] Trying repo scripts path..."
    REPO_BOOTSTRAP="${REPO}/scripts/setup_ue5_editor.sh"
    if [ -f "${REPO_BOOTSTRAP}" ]; then
        bash "${REPO_BOOTSTRAP}" --all 2>&1
    else
        echo "[ERR] No bootstrap script found — manual setup required"
    fi
fi

# ─── Phase 6: Visual Validation ──────────────────────────────────────────────
echo "[Phase 6/7] Running visual validation..."

VALIDATION_SCRIPT="${DEV_TOOLS}/visual_validation_v2.py"
if [ -f "${VALIDATION_SCRIPT}" ]; then
    python3 "${VALIDATION_SCRIPT}" 2>&1
else
    echo "[INFO] Visual validation script not found — skipping offline check"
fi

# ─── Phase 7: Frame Budget Test ──────────────────────────────────────────────
echo "[Phase 7/7] Frame budget validation setup..."
echo ""
echo "  To validate GPU frame budget < 16ms (60fps) with 27 VFX Niagara:"
echo ""
echo "  1. Open UE5 Editor: ${UE_INSTALL_DIR:-/opt/UnrealEngine}/Engine/Binaries/Linux/UnrealEditor ${REPO}/Unreal/KhaaosRun/KhaaosRun.uproject"
echo "  2. Enter PIE (Play In Editor)"
echo "  3. Open Stats > GPU Profile (Ctrl+Shift+,)"
echo "  4. Spawn all 27 VFX Niagara systems simultaneously"
echo "  5. Verify total GPU time < 16ms per frame"
echo "  6. Verify Niagara significance culling reduces distant VFX to 0ms"
echo ""

# ─── Final Report ────────────────────────────────────────────────────────────
echo ""
echo "========================================================================"
echo "  BOOTSTRAP COMPLETE — $(date -Iseconds)"
echo "  Log: ${LOG_FILE}"
echo "  Visual Validation: ${KHAAOS_ROOT}/reports/visual_validation_report.json"
echo "========================================================================"
echo ""
echo "  Validation Checklist:"
echo "  □ UE5.8 Editor compiled and running"
echo "  □ KhaaosRun.uproject opens without errors"
echo "  □ 48 abilities validated (8 per species × 6)"
echo "  □ 27 VFX Niagara systems rendering without errors"
echo "  □ GPU frame budget < 16ms (60fps target)"
echo "  □ Niagara significance culling operational"
echo "  □ MCP-for-Blender server connected"
echo "  □ Send2UE export: Blender → UE5 Content Browser"
echo ""
