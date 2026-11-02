#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CXX="${CXX:-g++}"
command -v "${CXX}" >/dev/null 2>&1 || { echo "[mobile-netcode] compilador C++ ausente: ${CXX}" >&2; exit 2; }
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
"${CXX}" -std=c++17 -O2 -Wall -Wextra -Werror \
  -I"${ROOT}/Unreal/KhaaosRun/Source/KhaaosRun" \
  "${ROOT}/tests/mobile/mobile_fire_netcode_chaos.cpp" \
  -o "${TMP_DIR}/mobile_fire_netcode_chaos"
"${TMP_DIR}/mobile_fire_netcode_chaos"
