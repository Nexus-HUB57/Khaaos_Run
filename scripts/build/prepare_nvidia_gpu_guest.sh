#!/usr/bin/env bash
set -euo pipefail

# Guest-side checklist only. GPU passthrough/vGPU must be enabled by the
# hypervisor provider; this script never attempts to modify the hypervisor.
if ! command -v lspci >/dev/null; then echo 'lspci ausente; instale pciutils no guest'; exit 2; fi
GPU="$(lspci -nn 2>/dev/null | grep -Ei 'NVIDIA|3D controller|VGA compatible' | head -1 || true)"
if ! printf '%s' "$GPU" | grep -qi nvidia; then
  echo 'GPU NVIDIA não exposta ao guest. Solicite migração/passthrough ao HostGator.' >&2
  echo 'Esperado: lspci contendo NVIDIA e /dev/nvidia* após o attach.' >&2
  exit 2
fi
if ! command -v nvidia-smi >/dev/null; then
  echo 'NVIDIA PCI detectada, mas nvidia-smi está ausente; instalar o driver compatível com o kernel do guest.' >&2
  exit 2
fi
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
printf 'GPU guest ready; prossiga com UE5.8/Blender e o pipeline headless.\n'
