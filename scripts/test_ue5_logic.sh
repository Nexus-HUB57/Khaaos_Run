#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_SOURCE="${ROOT_DIR}/tests/ue5/cigkv_loot_rules_test.cpp"
INCLUDE_DIR="${ROOT_DIR}/Unreal/KhaaosRun/Source/KhaaosRun/Game/World/CIGKV"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

CXX="${CXX:-g++}"
"${CXX}" -std=c++20 -Wall -Wextra -Werror -pedantic \
  -I"${INCLUDE_DIR}" "${TEST_SOURCE}" -o "${TEMP_DIR}/cigkv-loot-rules-test"
"${TEMP_DIR}/cigkv-loot-rules-test"
