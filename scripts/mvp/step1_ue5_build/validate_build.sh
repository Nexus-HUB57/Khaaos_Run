#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
# Khaaos Run — MVP Step 1: Post-Build Validation
# Devs Ph.D | Copyright Nexus-HUB57. All Rights Reserved.
# ════════════════════════════════════════════════════════════════════════════
#
# Validates that the UE5 build pipeline produced all required artifacts
#
# Usage:
#   ./validate_build.sh                   # Full validation
#   ./validate_build.sh --skip-docker     # Skip Docker checks
#   ./validate_build.sh --json            # Output JSON report
#
# Exit codes:
#   0 — All validations passed
#   1 — One or more validations failed
# ════════════════════════════════════════════════════════════════════════════
set -uo pipefail

# ─── Constants ────────────────────────────────────────────────────────────────
readonly SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
readonly REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
readonly PROJECT_DIR="${REPO_ROOT}/Unreal/KhaaosRun"
readonly DIST_DIR="${REPO_ROOT}/Build/Dist"
readonly SOURCE_DIR="${PROJECT_DIR}/Source"
readonly CONFIG_DIR="${PROJECT_DIR}/Config"
readonly UPROJECT="${PROJECT_DIR}/KhaaosRun.uproject"

# Counters
PASS=0; FAIL=0; WARN=0; SKIP=0

# CLI Flags
SKIP_DOCKER=false
JSON_OUTPUT=false
for arg in "$@"; do
  case $arg in
    --skip-docker) SKIP_DOCKER=true ;;
    --json)        JSON_OUTPUT=true ;;
  esac
done

# ─── Logging ──────────────────────────────────────────────────────────────────
readonly RED='\033[0;31m'; readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'; readonly CYAN='\033[0;36m'; readonly NC='\033[0m'

ok()   { echo -e "  ${GREEN}PASS${NC} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}FAIL${NC} $1"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}WARN${NC} $1"; ((WARN++)); }
skip() { echo -e "  ${CYAN}SKIP${NC} $1"; ((SKIP++)); }
section() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# ─── Header ───────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  KHAAOS RUN — Post-Build Validation (Step 1)"
echo "═══════════════════════════════════════════════════════════"
echo "  Project:  ${PROJECT_DIR}"
echo "  Dist:     ${DIST_DIR}"
echo "  Time:     $(date -Iseconds)"
echo "═══════════════════════════════════════════════════════════"

# ════════════════════════════════════════════════════════════════════════════
# 1. Server Binary Validation
# ════════════════════════════════════════════════════════════════════════════
section "1. Server Binary"

# Check primary path
SERVER_BIN_PRIMARY="${DIST_DIR}/LinuxServer/KhaaosRun/Binaries/Linux/KhaaosRunServer"
SERVER_BIN_ALT="${DIST_DIR}/LinuxNoEditor/KhaaosRun/Binaries/Linux/KhaaosRunServer"
SERVER_BIN=""

if [ -f "${SERVER_BIN_PRIMARY}" ]; then
  SERVER_BIN="${SERVER_BIN_PRIMARY}"
  ok "Server binary exists at primary path"
elif [ -f "${SERVER_BIN_ALT}" ]; then
  SERVER_BIN="${SERVER_BIN_ALT}"
  ok "Server binary exists at alternate path"
else
  fail "Server binary not found at expected paths"
  # Search for it
  FOUND_BIN=$(find "${DIST_DIR}" -name "KhaaosRunServer" -type f 2>/dev/null | head -1 || true)
  if [ -n "${FOUND_BIN}" ]; then
    SERVER_BIN="${FOUND_BIN}"
    warn "Server binary found at: ${FOUND_BIN}"
  fi
fi

if [ -n "${SERVER_BIN}" ]; then
  # Check executable
  if [ -x "${SERVER_BIN}" ]; then
    ok "Server binary is executable"
  else
    fail "Server binary is NOT executable (run: chmod +x ${SERVER_BIN})"
  fi

  # Check file size (should be > 10MB for a real server binary)
  FILESIZE_BYTES=$(stat -f%z "${SERVER_BIN}" 2>/dev/null || stat -c%s "${SERVER_BIN}" 2>/dev/null || echo 0)
  FILESIZE_MB=$((FILESIZE_BYTES / 1048576))
  if [ "$FILESIZE_MB" -gt 10 ]; then
    ok "Server binary size: ${FILESIZE_MB}MB (>10MB expected)"
  else
    fail "Server binary size: ${FILESIZE_MB}MB (expected >10MB, may be corrupt)"
  fi

  # Check ELF header (Linux)
  FILE_TYPE=$(file "${SERVER_BIN}" 2>/dev/null || echo "unknown")
  if echo "${FILE_TYPE}" | grep -qi "ELF"; then
    ok "Server binary is valid ELF executable"
  else
    warn "Server binary type: ${FILE_TYPE} (expected ELF)"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# 2. C++ Compilation Validation
# ════════════════════════════════════════════════════════════════════════════
section "2. C++ Source Files"

if [ -d "${SOURCE_DIR}" ]; then
  ok "Source directory exists: ${SOURCE_DIR}"

  # Count .cpp files
  CPP_COUNT=$(find "${SOURCE_DIR}" -name "*.cpp" -type f 2>/dev/null | wc -l)
  if [ "$CPP_COUNT" -gt 0 ]; then
    ok "C++ implementation files: ${CPP_COUNT} .cpp"
  else
    fail "No .cpp files found"
  fi

  # Count .h files
  HEADER_COUNT=$(find "${SOURCE_DIR}" -name "*.h" -type f 2>/dev/null | wc -l)
  if [ "$HEADER_COUNT" -gt 0 ]; then
    ok "C++ header files: ${HEADER_COUNT} .h"
  else
    fail "No .h files found"
  fi

  TOTAL_CPP=$((CPP_COUNT + HEADER_COUNT))
  ok "Total C++ source: ${TOTAL_CPP} files"

  # Check key game module files
  KEY_FILES=(
    "KhaaosRun/KhaaosRun.cpp"
    "KhaaosRun/KhaaosRun.h"
    "KhaaosRun/KhaaosRun.Build.cs"
    "KhaaosRun/Game/KhaaosGameMode.cpp"
    "KhaaosRun/Game/KhaaosGameMode.h"
    "KhaaosRun/Game/KhaaosGameState.cpp"
    "KhaaosRun/Game/KhaaosGameState.h"
    "KhaaosRun/Player/KhaaosPlayerState.cpp"
    "KhaaosRun/Player/KhaaosPlayerState.h"
  )

  for kf in "${KEY_FILES[@]}"; do
    if [ -f "${SOURCE_DIR}/${kf}" ]; then
      ok "Key file: ${kf}"
    else
      fail "Missing key file: ${kf}"
    fi
  done

  # Check Editor module
  EDITOR_FILES=(
    "KhaaosRunEditor/KhaaosRunEditor.Build.cs"
    "KhaaosRunEditor/KhaaosRunEditor.cpp"
    "KhaaosRunEditor/KhaaosRunEditor.h"
  )
  for ef in "${EDITOR_FILES[@]}"; do
    if [ -f "${SOURCE_DIR}/${ef}" ]; then
      ok "Editor file: ${ef}"
    else
      warn "Missing editor file: ${ef}"
    fi
  done

else
  fail "Source directory not found: ${SOURCE_DIR}"
fi

# ════════════════════════════════════════════════════════════════════════════
# 3. Configuration Files Validation
# ════════════════════════════════════════════════════════════════════════════
section "3. Configuration Files"

if [ -d "${CONFIG_DIR}" ]; then
  ok "Config directory exists: ${CONFIG_DIR}"

  # Required INI files
  REQUIRED_INIS=(
    "DefaultEngine.ini"
    "DefaultGameplayTags.ini"
    "DefaultInput.ini"
    "DefaultEOS.ini"
  )

  for ini in "${REQUIRED_INIS[@]}"; do
    if [ -f "${CONFIG_DIR}/${ini}" ]; then
      ok "Config: ${ini}"
      # Validate it's a valid INI (not empty, has sections)
      if grep -qE '^\[' "${CONFIG_DIR}/${ini}" 2>/dev/null; then
        ok "  ${ini} has valid INI sections"
      else
        warn "  ${ini} may be empty or malformed"
      fi
    else
      fail "Missing config: ${ini}"
    fi
  done

  # World-specific configs (recommended)
  WORLD_INIS=(
    "DefaultCIGKV.ini"
    "DefaultBarburhen.ini"
    "DefaultPriadus.ini"
    "DefaultCkesalth.ini"
    "DefaultArukheea.ini"
  )

  for wini in "${WORLD_INIS[@]}"; do
    if [ -f "${CONFIG_DIR}/${wini}" ]; then
      ok "World config: ${wini}"
    else
      warn "Missing world config: ${wini}"
    fi
  done

  # Production config
  if [ -f "${CONFIG_DIR}/DefaultProduction.ini" ]; then
    ok "Production config: DefaultProduction.ini"
  else
    warn "Missing: DefaultProduction.ini (needed for production deployment)"
  fi

  # EOS Production regional config
  if [ -f "${CONFIG_DIR}/Regions/DefaultEOS_Production.ini" ]; then
    ok "EOS Production config: Regions/DefaultEOS_Production.ini"
  else
    warn "Missing: Regions/DefaultEOS_Production.ini"
  fi

  # Check DefaultEngine.ini for Iris replication
  if [ -f "${CONFIG_DIR}/DefaultEngine.ini" ]; then
    if grep -qi "IrisNetDriver" "${CONFIG_DIR}/DefaultEngine.ini"; then
      ok "DefaultEngine.ini: Iris net driver configured"
    else
      warn "DefaultEngine.ini: Iris net driver not found"
    fi

    if grep -qi "bEnableIrisReplication" "${CONFIG_DIR}/DefaultEngine.ini"; then
      ok "DefaultEngine.ini: Iris replication enabled"
    else
      warn "DefaultEngine.ini: Iris replication not explicitly enabled"
    fi
  fi

else
  fail "Config directory not found: ${CONFIG_DIR}"
fi

# ════════════════════════════════════════════════════════════════════════════
# 4. .uproject Validation
# ════════════════════════════════════════════════════════════════════════════
section "4. .uproject File"

if [ -f "${UPROJECT}" ]; then
  ok "KhaaosRun.uproject exists"

  # Validate JSON
  if python3 -c "import json; data=json.load(open('${UPROJECT}')); assert data['FileVersion'] >= 3" 2>/dev/null; then
    ok "KhaaosRun.uproject is valid JSON with FileVersion >= 3"
  else
    fail "KhaaosRun.uproject is invalid JSON or wrong FileVersion"
  fi

  # Check engine association
  engine_assoc=$(python3 -c "import json; print(json.load(open('${UPROJECT}'))['EngineAssociation'])" 2>/dev/null || echo "")
  if [ "$engine_assoc" = "5.8" ]; then
    ok "Engine association: ${engine_assoc} (UE5.8)"
  else
    fail "Engine association: ${engine_assoc} (expected 5.8)"
  fi

  # Check modules
  module_count=$(python3 -c "import json; print(len(json.load(open('${UPROJECT}'))['Modules']))" 2>/dev/null || echo 0)
  if [ "$module_count" -ge 2 ]; then
    ok "Modules defined: ${module_count} (KhaaosRun + KhaaosRunEditor)"
  else
    fail "Modules defined: ${module_count} (expected >= 2)"
  fi

  # Check target platforms
  target_platforms=$(python3 -c "import json; print(' '.join(json.load(open('${UPROJECT}'))['TargetPlatforms']))" 2>/dev/null || echo "")
  if echo "$target_platforms" | grep -q "Linux"; then
    ok "Linux in TargetPlatforms"
  else
    fail "Linux NOT in TargetPlatforms (required for dedicated server)"
  fi

else
  fail "KhaaosRun.uproject not found"
fi

# ════════════════════════════════════════════════════════════════════════════
# 5. Required Plugins Validation
# ════════════════════════════════════════════════════════════════════════════
section "5. Required Plugins"

if [ -f "${UPROJECT}" ]; then
  # Plugins required for the game to function
  REQUIRED_PLUGINS=(
    "GameplayAbilities"
    "EnhancedInput"
    "OnlineSubsystem"
    "OnlineSubsystemUtils"
    "Iris"
    "SignificanceManager"
    "Niagara"
    "PCG"
    "Metasound"
    "EOSIntegrationKit"
    "GameFeatures"
    "StateTree"
  )

  # Optional but recommended
  OPTIONAL_PLUGINS=(
    "ModelingToolsEditorMode"
    "LyraExtender"
    "OnlineServicesInterface"
    "AnimationBudgetAllocator"
  )

  for plugin in "${REQUIRED_PLUGINS[@]}"; do
    if python3 -c "import json; plugins=json.load(open('${UPROJECT}'))['Plugins']; assert any(p['Name']=='${plugin}' and p.get('Enabled',False) for p in plugins)" 2>/dev/null; then
      ok "Plugin enabled: ${plugin}"
    else
      fail "Plugin missing or disabled: ${plugin}"
    fi
  done

  for plugin in "${OPTIONAL_PLUGINS[@]}"; do
    if python3 -c "import json; plugins=json.load(open('${UPROJECT}'))['Plugins']; assert any(p['Name']=='${plugin}' and p.get('Enabled',False) for p in plugins)" 2>/dev/null; then
      ok "Optional plugin enabled: ${plugin}"
    else
      warn "Optional plugin not enabled: ${plugin}"
    fi
  done
fi

# ════════════════════════════════════════════════════════════════════════════
# 6. Build.cs Dependencies Validation
# ════════════════════════════════════════════════════════════════════════════
section "6. Build.cs Dependencies"

# KhaaosRun.Build.cs
GAME_BUILD_CS="${SOURCE_DIR}/KhaaosRun/KhaaosRun.Build.cs"
if [ -f "${GAME_BUILD_CS}" ]; then
  ok "KhaaosRun.Build.cs exists"

  # Check critical dependencies
  CRITICAL_DEPS=(
    "Core"
    "Engine"
    "GameplayAbilities"
    "GameplayTags"
    "EnhancedInput"
    "Iris"
    "OnlineSubsystem"
    "Niagara"
    "SignificanceManager"
  )

  for dep in "${CRITICAL_DEPS[@]}"; do
    if grep -q "\"${dep}\"" "${GAME_BUILD_CS}" 2>/dev/null; then
      ok "  Dependency: ${dep}"
    else
      fail "  Missing dependency: ${dep} in KhaaosRun.Build.cs"
    fi
  done

  # Check C++20 standard
  if grep -qi "Cpp20" "${GAME_BUILD_CS}"; then
    ok "C++ standard: Cpp20"
  else
    warn "C++ standard not explicitly set to Cpp20"
  fi

  # Check Iris support
  if grep -qi "bIrisSupport" "${GAME_BUILD_CS}"; then
    ok "Iris replication support declared in Build.cs"
  else
    warn "Iris replication support not declared in Build.cs"
  fi

else
  fail "KhaaosRun.Build.cs not found"
fi

# KhaaosRunEditor.Build.cs
EDITOR_BUILD_CS="${SOURCE_DIR}/KhaaosRunEditor/KhaaosRunEditor.Build.cs"
if [ -f "${EDITOR_BUILD_CS}" ]; then
  ok "KhaaosRunEditor.Build.cs exists"

  EDITOR_DEPS=("Core" "Engine" "UnrealEd" "KhaaosRun")
  for dep in "${EDITOR_DEPS[@]}"; do
    if grep -q "\"${dep}\"" "${EDITOR_BUILD_CS}" 2>/dev/null; then
      ok "  Editor dependency: ${dep}"
    else
      fail "  Missing editor dependency: ${dep}"
    fi
  done
else
  warn "KhaaosRunEditor.Build.cs not found"
fi

# Check for Target.cs files
section "6b. Target.cs Files"

TARGET_FILES=(
  "KhaaosRun.Target.cs"
  "KhaaosRunEditor.Target.cs"
  "KhaaosRunServer.Target.cs"
)

for target in "${TARGET_FILES[@]}"; do
  # Search in Source directory
  FOUND=$(find "${SOURCE_DIR}" -name "${target}" -type f 2>/dev/null | head -1 || true)
  if [ -n "${FOUND}" ]; then
    ok "Target file: ${target} (${FOUND})"
  else
    # Also check in MVP step1 directory
    FOUND_ALT=$(find "${SCRIPT_DIR}" -name "${target}" -type f 2>/dev/null | head -1 || true)
    if [ -n "${FOUND_ALT}" ]; then
      ok "Target file (MVP): ${target} (${FOUND_ALT})"
    else
      warn "Missing target file: ${target}"
    fi
  fi
done

# ════════════════════════════════════════════════════════════════════════════
# 7. Docker Image Validation
# ════════════════════════════════════════════════════════════════════════════
if [ "$SKIP_DOCKER" = false ]; then
  section "7. Docker Image"

  if command -v docker &>/dev/null; then
    ok "Docker is available"

    # Check if khaaos-run-server image exists
    if docker image inspect khaaos-run-server:latest &>/dev/null; then
      ok "Docker image exists: khaaos-run-server:latest"

      # Get image size
      IMAGE_SIZE=$(docker image inspect khaaos-run-server:latest --format='{{.Size}}' 2>/dev/null || echo 0)
      IMAGE_SIZE_GB=$(echo "scale=2; ${IMAGE_SIZE} / 1073741824" | bc 2>/dev/null || echo "unknown")
      ok "Docker image size: ${IMAGE_SIZE_GB}GB"

      # Check image labels
      IMAGE_TITLE=$(docker image inspect khaaos-run-server:latest --format='{{index .Config.Labels "org.opencontainers.image.title"}}' 2>/dev/null || echo "")
      if [ -n "${IMAGE_TITLE}" ]; then
        ok "Image label: ${IMAGE_TITLE}"
      fi

      # Check exposed ports
      EXPOSED_PORTS=$(docker image inspect khaaos-run-server:latest --format='{{json .Config.ExposedPorts}}' 2>/dev/null || echo "{}")
      for port in "7777/udp" "7778/udp" "27015/udp"; do
        if echo "${EXPOSED_PORTS}" | grep -q "${port}"; then
          ok "Exposed port: ${port}"
        else
          warn "Port not exposed in image: ${port}"
        fi
      done

    else
      fail "Docker image not found: khaaos-run-server:latest (run pipeline.sh to build)"
    fi

    # Check Dockerfile
    DOCKERFILE="${PROJECT_DIR}/Build/Dockerfile"
    if [ -f "${DOCKERFILE}" ]; then
      ok "Dockerfile exists: ${DOCKERFILE}"

      # Verify multi-stage build
      if grep -q "AS builder" "${DOCKERFILE}" && grep -q "AS runtime" "${DOCKERFILE}"; then
        ok "Dockerfile uses multi-stage build (builder → runtime)"
      else
        warn "Dockerfile may not use multi-stage build"
      fi

      # Verify non-root user
      if grep -q "USER khaaos" "${DOCKERFILE}"; then
        ok "Dockerfile runs as non-root user (khaaos)"
      else
        warn "Dockerfile may run as root (security risk)"
      fi
    else
      fail "Dockerfile not found: ${DOCKERFILE}"
    fi

  else
    skip "Docker not available — skipping image validation"
  fi
else
  section "7. Docker Image"
  skip "Docker checks skipped (--skip-docker)"
fi

# ════════════════════════════════════════════════════════════════════════════
# 8. Packaged Server Directory Structure
# ════════════════════════════════════════════════════════════════════════════
section "8. Packaged Server Structure"

if [ -d "${DIST_DIR}" ]; then
  ok "Dist directory exists: ${DIST_DIR}"

  # Check for expected directory structure
  EXPECTED_DIRS=(
    "LinuxServer"
    "LinuxServer/KhaaosRun"
    "LinuxServer/KhaaosRun/Binaries"
    "LinuxServer/KhaaosRun/Config"
  )

  for edir in "${EXPECTED_DIRS[@]}"; do
    if [ -d "${DIST_DIR}/${edir}" ]; then
      ok "Directory: ${edir}/"
    else
      # Try alternate path
      ALT_DIR=$(echo "${edir}" | sed 's/LinuxServer/LinuxNoEditor/')
      if [ -d "${DIST_DIR}/${ALT_DIR}" ]; then
        ok "Directory (alt): ${ALT_DIR}/"
      else
        warn "Missing directory: ${edir}/"
      fi
    fi
  done

  # Check for critical packaged files
  CRITICAL_FILES=(
    "LinuxServer/KhaaosRun/Binaries/Linux/KhaaosRunServer"
  )

  for cfile in "${CRITICAL_FILES[@]}"; do
    if [ -f "${DIST_DIR}/${cfile}" ]; then
      ok "Packaged file: ${cfile}"
    else
      ALT_FILE=$(echo "${cfile}" | sed 's/LinuxServer/LinuxNoEditor/')
      if [ -f "${DIST_DIR}/${ALT_FILE}" ]; then
        ok "Packaged file (alt): ${ALT_FILE}"
      else
        warn "Missing packaged file: ${cfile}"
      fi
    fi
  done
else
  warn "Dist directory not found: ${DIST_DIR} (build may not have been run yet)"
fi

# ════════════════════════════════════════════════════════════════════════════
# Summary
# ════════════════════════════════════════════════════════════════════════════
TOTAL=$((PASS + FAIL + WARN + SKIP))
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  VALIDATION RESULT"
echo "═══════════════════════════════════════════════════════════"
echo -e "  ${GREEN}PASS${NC}: ${PASS}"
echo -e "  ${RED}FAIL${NC}: ${FAIL}"
echo -e "  ${YELLOW}WARN${NC}: ${WARN}"
echo -e "  ${CYAN}SKIP${NC}: ${SKIP}"
echo "  Total: ${TOTAL}"
echo "═══════════════════════════════════════════════════════════"

if [ $FAIL -eq 0 ]; then
  echo -e "  ${GREEN}ALL VALIDATIONS PASSED — Build is ready for deployment${NC}"
  echo ""

  # JSON output for CI integration
  if [ "$JSON_OUTPUT" = true ]; then
    python3 -c "
import json
print(json.dumps({
    'status': 'pass',
    'pass': ${PASS},
    'fail': 0,
    'warn': ${WARN},
    'skip': ${SKIP},
    'total': ${TOTAL}
}, indent=2))
"
  fi

  exit 0
else
  echo -e "  ${RED}VALIDATION FAILED — ${FAIL} check(s) failed${NC}"
  echo ""

  if [ "$JSON_OUTPUT" = true ]; then
    python3 -c "
import json
print(json.dumps({
    'status': 'fail',
    'pass': ${PASS},
    'fail': ${FAIL},
    'warn': ${WARN},
    'skip': ${SKIP},
    'total': ${TOTAL}
}, indent=2))
"
  fi

  exit 1
fi
