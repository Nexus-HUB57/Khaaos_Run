#!/usr/bin/env bash
# Bootstrap do Android SDK/NDK para Unreal Engine 5.8 em Linux.
# Não aceita licenças silenciosamente: rode --install --accept-licenses somente
# depois de ler e aceitar os termos exibidos por sdkmanager --licenses.
set -euo pipefail

SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-${HOME}/Android/Sdk}}"
NDK_VERSION="27.2.12479018" # UE 5.8 documents NDK r27c
ANDROID_API="35"
BUILD_TOOLS="35.0.1"
MODE="${1:---check}"
ACCEPT_LICENSES="${2:-}"

usage() {
  cat <<EOF
Uso:
  $0 --check
  $0 --install --accept-licenses  # só depois de aceitar os termos Android
  $0 --emit-env

Versões UE 5.8: SDK API ${ANDROID_API}, Build Tools ${BUILD_TOOLS}, NDK r27c (${NDK_VERSION}), JDK 21.
Instalação em: ${SDK_ROOT}
EOF
}

fail() { echo "[android-ue58] ERRO: $*" >&2; exit 1; }

find_sdkmanager() {
  if [[ -x "${SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager" ]]; then
    SDKMANAGER="${SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager"
  elif command -v sdkmanager >/dev/null 2>&1; then
    SDKMANAGER="$(command -v sdkmanager)"
  else
    SDKMANAGER=""
  fi
}

java_major() {
  java -version 2>&1 | awk -F '"' '/version/ { split($2, v, "."); print v[1]; exit }'
}

java_home_from_javac() {
  local javac_path
  javac_path="$(readlink -f "$(command -v javac)")"
  dirname "$(dirname "${javac_path}")"
}

fetch_cmdline_tools() {
  command -v curl >/dev/null || fail "curl ausente"
  command -v python3 >/dev/null || fail "python3 ausente"
  command -v unzip >/dev/null || fail "unzip ausente"
  command -v sha1sum >/dev/null || fail "sha1sum ausente"

  local work metadata package_name package_sha1 archive
  work="$(mktemp -d)"
  metadata="${work}/repository2-1.xml"
  curl -fsSL --retry 2 https://dl.google.com/android/repository/repository2-1.xml -o "${metadata}"
  mapfile -t package_info < <(python3 - "${metadata}" <<'PY'
import sys
import xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
for package in root.iter():
    if not package.tag.endswith("remotePackage") or package.attrib.get("path") != "cmdline-tools;latest":
        continue
    for archive in package.iter():
        if not archive.tag.endswith("archive"):
            continue
        host = next((node.text for node in archive.iter() if node.tag.endswith("host-os")), None)
        if host != "linux":
            continue
        complete = next((node for node in archive if node.tag.endswith("complete")), None)
        if complete is None:
            continue
        url = next((node.text for node in complete if node.tag.endswith("url")), None)
        checksum = next((node.text for node in complete if node.tag.endswith("checksum")), None)
        if url and checksum and "/" not in url and "\\" not in url:
            print(url)
            print(checksum)
            raise SystemExit(0)
raise SystemExit("Google repository metadata has no Linux cmdline-tools;latest archive")
PY
)
  [[ "${#package_info[@]}" -eq 2 ]] || fail "não foi possível ler o pacote oficial cmdline-tools;latest"
  package_name="${package_info[0]}"
  package_sha1="${package_info[1]}"
  archive="${work}/${package_name}"
  curl -fsSL --retry 3 "https://dl.google.com/android/repository/${package_name}" -o "${archive}"
  printf '%s  %s\n' "${package_sha1}" "${archive}" | sha1sum -c - >/dev/null || fail "SHA-1 do arquivo oficial command-line tools não confere"

  mkdir -p "${SDK_ROOT}/cmdline-tools"
  unzip -q "${archive}" -d "${work}/unpacked"
  [[ -x "${work}/unpacked/cmdline-tools/bin/sdkmanager" ]] || fail "layout inesperado no pacote command-line tools"
  [[ ! -e "${SDK_ROOT}/cmdline-tools/latest" ]] || fail "${SDK_ROOT}/cmdline-tools/latest já existe, mas sdkmanager não foi encontrado; revise antes de substituir"
  mv "${work}/unpacked/cmdline-tools" "${SDK_ROOT}/cmdline-tools/latest"
  rm -rf "${work}"
}

emit_env() {
  local java_home=""
  local sdk_root_q ndk_root_q java_home_q platform_tools_q cmdline_tools_q
  printf -v sdk_root_q '%q' "${SDK_ROOT}"
  printf -v ndk_root_q '%q' "${SDK_ROOT}/ndk/${NDK_VERSION}"
  if command -v javac >/dev/null 2>&1; then
    java_home="$(java_home_from_javac)"
  fi
  printf 'export ANDROID_HOME=%s\n' "${sdk_root_q}"
  printf 'export ANDROID_SDK_ROOT=%s\n' "${sdk_root_q}"
  printf 'export ANDROID_NDK_ROOT=%s\n' "${ndk_root_q}"
  printf 'export NDKROOT=%s\n' "${ndk_root_q}"
  if [[ -n "${java_home}" ]]; then
    printf -v java_home_q '%q' "${java_home}"
    printf 'export JAVA_HOME=%s\n' "${java_home_q}"
  fi
  printf -v platform_tools_q '%q' "${SDK_ROOT}/platform-tools"
  printf -v cmdline_tools_q '%q' "${SDK_ROOT}/cmdline-tools/latest/bin"
  printf 'export PATH=%s:%s:${PATH}\n' "${platform_tools_q}" "${cmdline_tools_q}"
}

check_install() {
  local errors=0
  if [[ "$(uname -m)" != "x86_64" ]]; then
    echo "[android-ue58] HOST_ARCH_BLOCKED: $(uname -m); use Linux x86_64 com a toolchain UE 5.8 instalada para cook Android"
    errors=$((errors + 1))
  fi
  find_sdkmanager
  if [[ -z "${SDKMANAGER}" ]]; then
    echo "[android-ue58] FALTA cmdline-tools/sdkmanager em ${SDK_ROOT}"
    errors=$((errors + 1))
  fi
  [[ -x "${SDK_ROOT}/platform-tools/adb" ]] || { echo "[android-ue58] FALTA platform-tools/adb"; errors=$((errors + 1)); }
  [[ -d "${SDK_ROOT}/platforms/android-${ANDROID_API}" ]] || { echo "[android-ue58] FALTA platforms;android-${ANDROID_API}"; errors=$((errors + 1)); }
  [[ -d "${SDK_ROOT}/build-tools/${BUILD_TOOLS}" ]] || { echo "[android-ue58] FALTA build-tools;${BUILD_TOOLS}"; errors=$((errors + 1)); }
  [[ -d "${SDK_ROOT}/ndk/${NDK_VERSION}" ]] || { echo "[android-ue58] FALTA ndk;${NDK_VERSION} (r27c)"; errors=$((errors + 1)); }
  if command -v java >/dev/null 2>&1; then
    local major
    major="$(java_major)"
    if [[ "${major}" != "21" ]]; then
      echo "[android-ue58] JDK 21 exigido para este perfil; encontrado major=${major:-desconhecido}"
      errors=$((errors + 1))
    elif ! command -v javac >/dev/null 2>&1; then
      echo "[android-ue58] java 21 existe, mas javac não: instale o pacote JDK 21 completo"
      errors=$((errors + 1))
    else
      echo "[android-ue58] JDK 21: OK ($(java -version 2>&1 | head -1))"
    fi
  else
    echo "[android-ue58] FALTA Java/JDK 21"
    errors=$((errors + 1))
  fi
  if [[ "${errors}" -eq 0 ]]; then
    echo "[android-ue58] ANDROID_TOOLCHAIN_OK SDK=${SDK_ROOT} API=${ANDROID_API} NDK=${NDK_VERSION} BuildTools=${BUILD_TOOLS}"
    return 0
  fi
  echo "[android-ue58] BLOCKED: ${errors} requisito(s) ausente(s)"
  return 2
}

case "${MODE}" in
  --help|-h) usage ;;
  --emit-env) emit_env ;;
  --check) check_install ;;
  --install)
    [[ "$(uname -m)" == "x86_64" ]] || fail "host $(uname -m) não suportado por este bootstrap UE 5.8 Linux; use runner Linux x86_64"
    [[ "${ACCEPT_LICENSES}" == "--accept-licenses" ]] || fail "para aceitar os termos e instalar, use --install --accept-licenses após revisar os termos Android SDK exibidos pelo sdkmanager"
    command -v java >/dev/null || fail "JDK 21 ausente"
    [[ "$(java_major)" == "21" ]] || fail "UE 5.8 exige JDK 21 neste perfil; instale o JDK antes"
    command -v javac >/dev/null || fail "javac ausente; instale o JDK 21 completo antes"
    find_sdkmanager
    if [[ -z "${SDKMANAGER}" ]]; then
      fetch_cmdline_tools
      find_sdkmanager
    fi
    [[ -x "${SDKMANAGER}" ]] || fail "sdkmanager não executável"
    mkdir -p "${SDK_ROOT}"
    # A flag explícita autoriza aceitar em lote os termos apresentados pelo sdkmanager.
    # Ignore o SIGPIPE esperado do `yes`, mas preserve o status do sdkmanager.
    set +o pipefail
    if yes | "${SDKMANAGER}" --sdk_root="${SDK_ROOT}" --licenses; then
      license_status=0
    else
      license_status=$?
    fi
    set -o pipefail
    [[ "${license_status}" -eq 0 ]] || fail "sdkmanager --licenses falhou (exit ${license_status})"
    "${SDKMANAGER}" --sdk_root="${SDK_ROOT}" --install \
      "platform-tools" "platforms;android-${ANDROID_API}" \
      "build-tools;${BUILD_TOOLS}" "ndk;${NDK_VERSION}"
    echo "[android-ue58] Ambiente configurado. Para exportar as variáveis: source <($0 --emit-env)"
    check_install
    ;;
  *) usage; exit 2 ;;
esac
