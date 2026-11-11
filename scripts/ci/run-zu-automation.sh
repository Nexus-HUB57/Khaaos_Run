#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT_DIR" ]] || fail "run this script from inside a Git checkout"

if [[ "$(uname -s)" != "Linux" ]]; then
  fail "this runner script currently supports Linux self-hosted UE runners only"
fi

UE_ROOT="${UE_ROOT:-${UE5_INSTALL_DIR:-/opt/unreal-engine/5.8}}"
UE_PLATFORM="${UE_PLATFORM:-Linux}"
UE_CONFIGURATION="${UE_CONFIGURATION:-Development}"
UE_EDITOR_TARGET="${UE_EDITOR_TARGET:-KhaaosRunEditor}"
UE_PROJECT="${UE_PROJECT:-Unreal/KhaaosRun/KhaaosRun.uproject}"

case "$UE_CONFIGURATION" in
  Development|Debug)
    ;;
  *)
    fail "Automation tests require a development configuration, not '$UE_CONFIGURATION'"
    ;;
esac

if [[ "$UE_PROJECT" != /* ]]; then
  UE_PROJECT="$ROOT_DIR/$UE_PROJECT"
fi
[[ -f "$UE_PROJECT" ]] || fail "project file not found: $UE_PROJECT"
[[ -d "$UE_ROOT/Engine" ]] || fail "Unreal Engine root not found: $UE_ROOT"

BUILD_SH="$UE_ROOT/Engine/Build/BatchFiles/Linux/Build.sh"
EDITOR_CMD="${UE_EDITOR_CMD:-$UE_ROOT/Engine/Binaries/Linux/UnrealEditor-Cmd}"
VERIFIER="$ROOT_DIR/scripts/ci/verify-zu-automation-report.sh"
PROJECT_DIR="$(dirname "$UE_PROJECT")"
TARGET_RULES="$PROJECT_DIR/Source/${UE_EDITOR_TARGET}.Target.cs"

[[ -x "$BUILD_SH" ]] || fail "Unreal Build.sh is not executable: $BUILD_SH"
[[ -x "$EDITOR_CMD" ]] || fail "UnrealEditor-Cmd is not executable: $EDITOR_CMD"
[[ -f "$TARGET_RULES" ]] || fail "Editor target rules not found: $TARGET_RULES"
[[ -x "$VERIFIER" ]] || fail "report verifier is not executable: $VERIFIER"

BUILD_VERSION="$UE_ROOT/Engine/Build/Build.version"
[[ -f "$BUILD_VERSION" ]] || fail "Unreal version file not found: $BUILD_VERSION"
python3 - "$BUILD_VERSION" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    version = json.load(source)
major = version.get("MajorVersion")
minor = version.get("MinorVersion")
if (major, minor) != (5, 8):
    raise SystemExit(f"FAIL: expected Unreal Engine 5.8, found {major}.{minor}")
print(f"PASS: Unreal Engine {major}.{minor}")
PY

RUN_ID="${GITHUB_RUN_ID:-local}"
RUN_ATTEMPT="${GITHUB_RUN_ATTEMPT:-1}"
REPORT_BASE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
REPORT_DIR="${UE_AUTOMATION_REPORT_DIR:-$REPORT_BASE/zu-automation-${RUN_ID}-${RUN_ATTEMPT}}"
REPORT_JSON="$REPORT_DIR/AutomationReport.json"
LOG_FILE="$REPORT_DIR/UnrealEditor.log"
mkdir -p "$REPORT_DIR"
[[ ! -e "$REPORT_JSON" ]] || fail "refusing to overwrite an existing report: $REPORT_JSON"

# Compile the Editor target in a configuration where development Automation Tests are available.
echo "==> Building $UE_EDITOR_TARGET $UE_PLATFORM $UE_CONFIGURATION"
"$BUILD_SH" "$UE_EDITOR_TARGET" "$UE_PLATFORM" "$UE_CONFIGURATION" \
  "-Project=$UE_PROJECT" \
  -WaitMutex \
  -NoP4

# Keep report and log even if the Editor exits non-zero so CI can upload diagnostics.
echo "==> Running Automation RunTest Khaaos.Zu"
if "$EDITOR_CMD" "$UE_PROJECT" \
  "-ExecCmds=Automation RunTest Khaaos.Zu;Quit" \
  "-ReportExportPath=$REPORT_JSON" \
  -NullRHI \
  -unattended \
  -nop4 \
  -nopause \
  -nosplash \
  "-log=$LOG_FILE"; then
  EDITOR_STATUS=0
else
  EDITOR_STATUS=$?
  echo "WARN: UnrealEditor-Cmd exited with status $EDITOR_STATUS" >&2
fi

if [[ -f "$REPORT_JSON" ]]; then
  if "$VERIFIER" "$REPORT_JSON"; then
    REPORT_STATUS=0
  else
    REPORT_STATUS=$?
  fi
else
  echo "FAIL: Unreal Automation report was not created: $REPORT_JSON" >&2
  REPORT_STATUS=1
fi

if (( EDITOR_STATUS != 0 )); then
  echo "FAIL: UnrealEditor-Cmd exited with status $EDITOR_STATUS; see $LOG_FILE" >&2
  exit "$EDITOR_STATUS"
fi
if (( REPORT_STATUS != 0 )); then
  echo "FAIL: Automation report validation failed; see $REPORT_JSON and $LOG_FILE" >&2
  exit "$REPORT_STATUS"
fi

echo "PASS: Zu Automation run completed; report=$REPORT_JSON"
