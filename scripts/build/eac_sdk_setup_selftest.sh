#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SETUP="${ROOT}/scripts/build/setup_eac_sdk.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

mkdir -p "${TMP}/bundle/EOSAntiCheat/Sdk/anticheat" "${TMP}/bundle/EOSAntiCheat/Sdk/lib/anticheat"
printf 'test SDK header\n' > "${TMP}/bundle/EOSAntiCheat/Sdk/anticheat/sdkdefines.h"
printf 'linux server lib fixture\n' > "${TMP}/bundle/EOSAntiCheat/Sdk/lib/anticheat/libeacserver.so"
printf 'linux client lib fixture\n' > "${TMP}/bundle/EOSAntiCheat/Sdk/lib/anticheat/libeacclient.so"
(cd "${TMP}/bundle" && zip -qr "${TMP}/official-eac-sdk.zip" EOSAntiCheat)
VALID_SHA256="$(sha256sum "${TMP}/official-eac-sdk.zip" | awk '{print $1}')"

valid_output="$(env -u KHAAOS_EAC_SDK_DIR \
  EAC_SDK_URL="file://${TMP}/official-eac-sdk.zip" \
  EAC_SDK_SHA256="${VALID_SHA256}" \
  EAC_SDK_CACHE_DIR="${TMP}/cache-valid" \
  bash "${SETUP}" --print 2>&1)"
grep -q 'EAC_SDK_MODE=real SOURCE=url:EAC_SDK_URL' <<<"${valid_output}"
grep -q 'EOSAntiCheat' <<<"${valid_output}"

expect_download_failure() {
  local label="$1" url="$2" sha="$3" cache="$4" needle="$5" output status
  set +e
  output="$(env -u KHAAOS_EAC_SDK_DIR \
    EAC_SDK_URL="${url}" EAC_SDK_SHA256="${sha}" EAC_SDK_CACHE_DIR="${cache}" \
    bash "${SETUP}" --print 2>&1)"
  status=$?
  set -e
  [[ "${status}" -ne 0 ]] || { echo "expected EAC download failure: ${label}" >&2; exit 1; }
  grep -q "${needle}" <<<"${output}" || { echo "missing failure message for ${label}: ${output}" >&2; exit 1; }
}

expect_download_failure "missing digest" "file://${TMP}/official-eac-sdk.zip" "" \
  "${TMP}/cache-no-digest" 'EAC_SDK_SHA256'
expect_download_failure "incorrect digest" "file://${TMP}/official-eac-sdk.zip" "$(printf '0%.0s' {1..64})" \
  "${TMP}/cache-bad-digest" 'SHA-256 do pacote EAC não confere'

mkdir -p "${TMP}/invalid/EOSAntiCheat/Sdk/anticheat" "${TMP}/invalid/EOSAntiCheat/Sdk/lib/anticheat"
printf 'test SDK header\n' > "${TMP}/invalid/EOSAntiCheat/Sdk/anticheat/sdkdefines.h"
printf 'only one half of the library pair\n' > "${TMP}/invalid/EOSAntiCheat/Sdk/lib/anticheat/libeacserver.so"
(cd "${TMP}/invalid" && zip -qr "${TMP}/invalid-eac-sdk.zip" EOSAntiCheat)
INVALID_SHA256="$(sha256sum "${TMP}/invalid-eac-sdk.zip" | awk '{print $1}')"
expect_download_failure "invalid library pair" "file://${TMP}/invalid-eac-sdk.zip" "${INVALID_SHA256}" \
  "${TMP}/cache-invalid" 'não caindo silenciosamente para stub'

python3 - "${TMP}/traversal-eac-sdk.zip" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w") as package:
    package.writestr("EOSAntiCheat/../../escaped.txt", "should never be extracted")
PY
TRAVERSAL_SHA256="$(sha256sum "${TMP}/traversal-eac-sdk.zip" | awk '{print $1}')"
expect_download_failure "zip traversal" "file://${TMP}/traversal-eac-sdk.zip" "${TRAVERSAL_SHA256}" \
  "${TMP}/cache-traversal" 'path traversal'
[[ ! -e "${TMP}/escaped.txt" ]]

python3 - "${TMP}/symlink-eac-sdk.zip" "${TMP}/bundle/EOSAntiCheat" <<'PY'
import os, stat, sys, zipfile
archive, sdk_root = sys.argv[1:]
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as package:
    for base, _, files in os.walk(sdk_root):
        for name in files:
            path = os.path.join(base, name)
            package.write(path, os.path.relpath(path, os.path.dirname(sdk_root)))
    link = zipfile.ZipInfo("EOSAntiCheat/Sdk/link-out")
    link.create_system = 3
    link.external_attr = (stat.S_IFLNK | 0o777) << 16
    package.writestr(link, "../../outside.txt")
PY
SYMLINK_SHA256="$(sha256sum "${TMP}/symlink-eac-sdk.zip" | awk '{print $1}')"
expect_download_failure "zip symlink" "file://${TMP}/symlink-eac-sdk.zip" "${SYMLINK_SHA256}" \
  "${TMP}/cache-symlink" 'link/arquivo especial recusado'
[[ ! -e "${TMP}/outside.txt" ]]

emit_env="$(env -u KHAAOS_EAC_SDK_DIR \
  EAC_SDK_URL="file://${TMP}/official-eac-sdk.zip" \
  EAC_SDK_SHA256="${VALID_SHA256}" \
  EAC_SDK_CACHE_DIR="${TMP}/cache with spaces" \
  bash "${SETUP}" --emit-env 2>/dev/null)"
! grep -q '\[setup_eac_sdk\]' <<<"${emit_env}"
eval "${emit_env}"
[[ "${EAC_SDK_MODE}" == "real" ]]
case "${KHAAOS_EAC_SDK_DIR}" in
  "${TMP}/cache with spaces"/extract.*/EOSAntiCheat) ;;
  *) echo "--emit-env path quoting failed: ${KHAAOS_EAC_SDK_DIR}" >&2; exit 1 ;;
esac

github_env="$(env -u KHAAOS_EAC_SDK_DIR \
  EAC_SDK_URL="file://${TMP}/official-eac-sdk.zip" \
  EAC_SDK_SHA256="${VALID_SHA256}" \
  EAC_SDK_CACHE_DIR="${TMP}/cache-github" \
  bash "${SETUP}" --emit-github-env 2>/dev/null)"
! grep -q '\[setup_eac_sdk\]' <<<"${github_env}"
grep -q '^KHAAOS_EAC_SDK_DIR=' <<<"${github_env}"
grep -q '^EAC_SDK_MODE=real$' <<<"${github_env}"
grep -q '^EAC_SDK_SOURCE=url:EAC_SDK_URL$' <<<"${github_env}"

echo "EAC SDK resolver self-test: checksum, safe extraction, layout, fail-closed errors and clean env output PASS"
