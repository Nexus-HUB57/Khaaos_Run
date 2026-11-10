#!/usr/bin/env bash
set -euo pipefail

ROOT="${GITHUB_WORKSPACE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
UE5_ROOT="${UE5_ROOT:-/opt/UnrealEngine}"
UPROJECT="${UPROJECT:-$ROOT/Unreal/KhaaosRun/KhaaosRun.uproject}"
EDITOR="$UE5_ROOT/Engine/Binaries/Linux/UnrealEditor-Cmd"
ARTIFACTS="$ROOT/artifacts/cigkv-vertical-slice"
PY_BAKE="$ROOT/scripts/ue5_editor/cigkv_headless_bake.py"
PY_RENDER="$ROOT/scripts/ue5_editor/cigkv_vertical_slice.py"

fail() { echo "[CIGKV_HEADLESS] ERROR: $*" >&2; exit 2; }
mkdir -p "$ARTIFACTS"

[ -x "$EDITOR" ] || fail "UnrealEditor-Cmd não encontrado em $EDITOR"
command -v nvidia-smi >/dev/null || fail "nvidia-smi ausente: este host não expõe NVIDIA; passthrough é requisito"
GPU_LINE="$(nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader | head -1 || true)"
[ -n "$GPU_LINE" ] || fail "GPU NVIDIA não respondeu ao nvidia-smi"
case "$GPU_LINE" in *Virtio*|*virtio*|*llvmpipe*) fail "GPU não é física/NVIDIA: $GPU_LINE";; esac
free_mb="$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)"
[ "${free_mb:-0}" -ge 8192 ] || fail "MemAvailable abaixo de 8 GiB; host não é adequado para UE5.8 GPU"
[ "${CIGKV_GPU_RUNNER:-1}" = "1" ] || fail "CIGKV_GPU_RUNNER não está habilitado"

python3 "$ROOT/scripts/build/ue58_gpu_diagnostic.py" --ue-root "$UE5_ROOT" --output "$ARTIFACTS/ue58-gpu-diagnostic.json" --require-gpu

run_editor() {
  CIGKV_CAPTURE_DIR="artifacts/cigkv-vertical-slice/headless-render" \
    "$EDITOR" "$UPROJECT" -unattended -nop4 -nosplash -nullrhi=false -nosound "$@" -log
}

run_editor -run=pythonscript -script="$ROOT/scripts/ue5_editor/configure_cigkv_sss_anisotropy.py"
test -s "$ARTIFACTS/material-configuration-report.json"
python3 "$ROOT/scripts/ue5/analyze_cigkv_material_configuration.py" --input "$ARTIFACTS/material-configuration-report.json" --output "$ARTIFACTS/material-configuration-analysis.json"
run_editor -run=pythonscript -script="$PY_BAKE"
test -s "$ARTIFACTS/headless-bake-report.json"
run_editor -run=pythonscript -script="$PY_RENDER"
test -s "$ARTIFACTS/engine-report.json"
frames="$(find "$ARTIFACTS" -type f -name 'CIGKV_*.png' | wc -l)"
[ "$frames" -ge 24 ] || fail "render headless produziu $frames frames; esperado >=24"

python3 - <<PY
import json
from pathlib import Path
p=Path("$ARTIFACTS/headless-pipeline-report.json")
data={"schema":"khaaos.cigkv.headless-pipeline-report/v1","status":"pass","gpu":"$GPU_LINE","frames":$frames,"bake_report":"artifacts/cigkv-vertical-slice/headless-bake-report.json","render_report":"artifacts/cigkv-vertical-slice/engine-report.json"}
p.write_text(json.dumps(data, indent=2)+"\n")
print(json.dumps(data, indent=2))
PY
