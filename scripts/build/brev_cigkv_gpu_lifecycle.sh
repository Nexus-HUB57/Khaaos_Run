#!/usr/bin/env bash
set -euo pipefail

ROOT="${GITHUB_WORKSPACE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
export PATH="$HOME/.local/bin:$PATH"
: "${BREV_API_KEY:?Defina BREV_API_KEY via secret; nunca grave a chave no repositório}"
INSTANCE_NAME="${BREV_INSTANCE_NAME:-khaaos-cigkv-${GITHUB_RUN_ID:-manual}}"
GPU_NAME="${BREV_GPU_NAME:-A10G}"
MIN_VRAM="${BREV_MIN_VRAM_GB:-16}"
MIN_DISK="${BREV_MIN_DISK_GB:-150}"
PROVISION="${BREV_PROVISION:-0}"
INSTANCE_CREATED=0

cleanup() {
  unset BREV_API_KEY
  if [ "$INSTANCE_CREATED" = "1" ]; then
    echo "Removendo instância Brev $INSTANCE_NAME"
    brev delete "$INSTANCE_NAME" || true
  fi
}
trap cleanup EXIT

if ! command -v brev >/dev/null; then
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/brevdev/brev-cli/main/bin/install-latest.sh)"
fi
brev login --api-key "$BREV_API_KEY" >/dev/null
unset BREV_API_KEY
brev refresh >/dev/null || true

echo "Dry-run Brev: GPU=$GPU_NAME VRAM>=${MIN_VRAM}GB disk>=${MIN_DISK}GB"
brev create "$INSTANCE_NAME" --gpu-name "$GPU_NAME" --min-vram "$MIN_VRAM" --min-disk "$MIN_DISK" --dry-run

if [ "$PROVISION" != "1" ]; then
  echo "BREV_PROVISION!=1; nenhuma instância foi criada."
  exit 0
fi

brev create "$INSTANCE_NAME" \
  --gpu-name "$GPU_NAME" \
  --min-vram "$MIN_VRAM" \
  --min-disk "$MIN_DISK" \
  --timeout "${BREV_TIMEOUT_SECONDS:-900}"
INSTANCE_CREATED=1
brev exec "$INSTANCE_NAME" 'set -e; nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader; test -x /opt/UnrealEngine/Engine/Binaries/Linux/UnrealEditor-Cmd'
brev copy "$ROOT" "$INSTANCE_NAME:~/workspace"
brev exec "$INSTANCE_NAME" 'cd ~/workspace && CIGKV_GPU_RUNNER=1 scripts/build/run_cigkv_headless_gpu_pipeline.sh'
