#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_SOURCE="${ROOT_DIR}/tests/ue5/cigkv_loot_rules_test.cpp"
RULES_SOURCE="${ROOT_DIR}/Unreal/KhaaosRun/Source/KhaaosRun/Game/World/CIGKV/CIGKVLootRules.cpp"
MODULE_INCLUDE_DIR="${ROOT_DIR}/Unreal/KhaaosRun/Source/KhaaosRun"
INCLUDE_DIR="${MODULE_INCLUDE_DIR}/Game/World/CIGKV"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

CXX="${CXX:-g++}"
"${CXX}" -std=c++20 -Wall -Wextra -Werror -pedantic -I"${MODULE_INCLUDE_DIR}" -I"${INCLUDE_DIR}" "${TEST_SOURCE}" "${RULES_SOURCE}" -o "${TEMP_DIR}/cigkv-loot-rules-test"
"${TEMP_DIR}/cigkv-loot-rules-test"

ZU_RULES_TEST_SOURCE="${ROOT_DIR}/tests/ue5/cigkv_zu_rules_test.cpp"
ZU_RULES_SOURCE="${MODULE_INCLUDE_DIR}/Game/World/CIGKV/CIGKVZuRules.cpp"
"${CXX}" -std=c++20 -Wall -Wextra -Werror -pedantic -I"${MODULE_INCLUDE_DIR}" "${ZU_RULES_TEST_SOURCE}" "${ZU_RULES_SOURCE}" -o "${TEMP_DIR}/cigkv-zu-rules-test"
"${TEMP_DIR}/cigkv-zu-rules-test"

MAP_DATA_TEST_SOURCE="${ROOT_DIR}/tests/ue5/cigkv_map_data_integration_test.cpp"
MAP_DATA_SOURCE="${ROOT_DIR}/Unreal/KhaaosRun/Source/KhaaosRun/Game/World/CIGKV/KhaaosCIGKVMapData.cpp"
TEST_STUB_DIR="${ROOT_DIR}/tests/ue5/stubs"
"${CXX}" -std=c++20 -Wall -Wextra -Werror -pedantic -I"${TEST_STUB_DIR}" -I"${MODULE_INCLUDE_DIR}" -I"${INCLUDE_DIR}" "${MAP_DATA_TEST_SOURCE}" "${MAP_DATA_SOURCE}" "${RULES_SOURCE}" -o "${TEMP_DIR}/cigkv-map-data-integration-test"
"${TEMP_DIR}/cigkv-map-data-integration-test"
