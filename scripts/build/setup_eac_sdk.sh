#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — EAC SDK setup para o pipeline headless (Fase 0 / go-live)
# =============================================================================
# Resolve o SDK REAL do Easy Anti-Cheat e exporta KHAAOS_EAC_SDK_DIR para o
# build UE5.8. O SDK não é redistribuível: chega ao runner por uma das fontes
# abaixo (nesta ordem):
#
#   1. KHAAOS_EAC_SDK_DIR já apontando para um pacote válido (runner self-hosted
#      com SDK pré-instalado) — nada é baixado;
#   2. Source/KhaaosEAC/EACSDK/ dentro do repo (coloque o pacote extraído lá
#      se o runner não tem acesso à rede de artefatos);
#   3. download do arquivo indicado em EAC_SDK_URL (ex.: artifact store
#      privado com o zip oficial baixado do dev portal da Epic; suporta
#      EAC_SDK_URL_TOKEN para Authorization: Bearer).
#
# Contrato de build (KhaaosEAC.Build.cs + preflight UE1040/UE1041):
#   - Sem SDK: exit 0 com EAC_SDK_MODE=stub — build segue em modo stub
#     (KHAAOS_EAC_SDK=0), NUNCA quebra (exceto com --require);
#   - Com SDK válido: exit 0 com EAC_SDK_MODE=real e KHAAOS_EAC_SDK_DIR
#     exportado — o build linka eacserver/eacclient e o servidor loga
#     "EAC Status: Active" ao inicializar (checar no smoke pós-build);
#   - Com fonte inválida (dir/URL que não contém o pacote): exit 1
#     (falha RÁPIDO — melhor que descobrir no link do build).
#
# Uso:
#   source scripts/build/setup_eac_sdk.sh            # resolve e exporta
#   bash scripts/build/setup_eac_sdk.sh --require    # falha se só houver stub
#   bash scripts/build/setup_eac_sdk.sh --print      # apenas diagnóstico
#   eval "$(bash scripts/build/setup_eac_sdk.sh --emit-env)"  # p/ CI (GITHUB_ENV)
# =============================================================================
set -euo pipefail

MODE="${1:-source}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_SDK_DIR="${REPO_ROOT}/Unreal/KhaaosRun/Source/KhaaosEAC/EACSDK"
DOWNLOAD_DIR="${REPO_ROOT}/artifacts/eac-sdk"

# Estrutura mínima do pacote oficial (espelha KhaaosEAC.Build.cs):
#   <sdkDir>/Sdk/anticheat/sdkdefines.h
#   <sdkDir>/Sdk/lib/anticheat/{eacserver,eacclient}.(lib|dll)  (Win64)
#   <sdkDir>/Sdk/lib/anticheat/{libeacserver,libeacclient}.so   (Linux)
required_files=( "Sdk/anticheat/sdkdefines.h" )

log() { echo "[setup_eac_sdk] $*"; }

validate_sdk_dir() {
  local dir="$1"
  for rel in "${required_files[@]}"; do
    if [[ ! -f "${dir}/${rel}" ]]; then
      log "ERRO: pacote EAC inválido em ${dir} — falta ${rel}"
      log "Esperado layout oficial: <dir>/Sdk/anticheat/* + <dir>/Sdk/lib/anticheat/*"
      return 1
    fi
  done
  local libs_found=0
  for lib in "Sdk/lib/anticheat/libeacserver.so" "Sdk/lib/anticheat/libeacclient.so" \
             "Sdk/lib/anticheat/eacserver.lib" "Sdk/lib/anticheat/eacclient.lib"; do
    [[ -f "${dir}/${lib}" ]] && libs_found=$((libs_found + 1))
  done
  if [[ "${libs_found}" -eq 0 ]]; then
    log "ERRO: nenhuma lib anticheat (eacserver/eacclient) encontrada em ${dir}/Sdk/lib/anticheat"
    return 1
  fi
  return 0
}

try_dir() {
  local dir="$1"
  if [[ -n "${dir}" && -d "${dir}" ]] && validate_sdk_dir "${dir}"; then
    RESOLVED_SDK_DIR="${dir}"
    return 0
  fi
  return 1
}

download_sdk() {
  local url="${EAC_SDK_URL:-}"
  if [[ -z "${url}" ]]; then
    return 1
  fi
  log "baixando EAC SDK de EAC_SDK_URL (conteúdo não logado — segredo)..."
  mkdir -p "${DOWNLOAD_DIR}"
  local archive="${DOWNLOAD_DIR}/eac-sdk.pkg"
  local curl_args=( -fsSL --retry 2 -o "${archive}" )
  if [[ -n "${EAC_SDK_URL_TOKEN:-}" ]]; then
    curl_args+=( -H "Authorization: Bearer ${EAC_SDK_URL_TOKEN}" )
  fi
  curl "${curl_args[@]}" "${url}"

  mkdir -p "${DOWNLOAD_DIR}/extract"
  case "${archive}" in
    *.zip)  unzip -q -o "${archive}" -d "${DOWNLOAD_DIR}/extract" ;;
    *.tar.gz|*.tgz) tar -xzf "${archive}" -C "${DOWNLOAD_DIR}/extract" ;;
    *) log "ERRO: formato de EAC_SDK_URL não suportado (use zip/tar.gz)"; return 1 ;;
  esac

  # Localiza o diretório que contém o layout <...>/Sdk/anticheat.
  local candidate
  candidate="$(dirname "$(find "${DOWNLOAD_DIR}/extract" -type f -path "*/Sdk/anticheat/sdkdefines.h" | head -1 | sed 's|/Sdk/anticheat/sdkdefines.h$||')")"
  if [[ -z "${candidate}" ]]; then
    log "ERRO: zip do EAC SDK não contém Sdk/anticheat/sdkdefines.h"
    return 1
  fi
  RESOLVED_SDK_DIR="${candidate}"
  validate_sdk_dir "${RESOLVED_SDK_DIR}"
}

RESOLVED_SDK_DIR=""
SOURCE="none"

fail_fast_invalid() {
  local label="$1" dir="$2"
  log "ERRO: ${label} apontado mas o pacote é inválido (${dir}) — falha rápida."
  log "Corrija o pacote (Sdk/anticheat/* + Sdk/lib/anticheat/*) ou desdefina a fonte para usar stub."
  exit 1
}

if [[ -n "${KHAAOS_EAC_SDK_DIR:-}" ]]; then
  # Fonte EXPLÍCITA: inválida é erro de configuração — não cai para stub.
  if try_dir "${KHAAOS_EAC_SDK_DIR}"; then
    SOURCE="env:KHAAOS_EAC_SDK_DIR"
  else
    fail_fast_invalid "KHAAOS_EAC_SDK_DIR" "${KHAAOS_EAC_SDK_DIR}"
  fi
elif [[ -d "${LOCAL_SDK_DIR}" ]]; then
  if try_dir "${LOCAL_SDK_DIR}"; then
    SOURCE="repo:EACSDK"
  else
    fail_fast_invalid "Source/KhaaosEAC/EACSDK" "${LOCAL_SDK_DIR}"
  fi
elif download_sdk; then
  SOURCE="url:EAC_SDK_URL"
fi

if [[ -n "${RESOLVED_SDK_DIR}" ]]; then
  export KHAAOS_EAC_SDK_DIR="${RESOLVED_SDK_DIR}"
  export EAC_SDK_MODE="real"
  log "SDK REAL do EAC resolvido via ${SOURCE}: ${RESOLVED_SDK_DIR}"
  log "build linkará eacserver/eacclient (KHAAOS_EAC_SDK=1); o servidor dedicado loga 'EAC Status: Active'"
  if [[ "${MODE}" == "--print" ]]; then
    log "KHAAOS_EAC_SDK_DIR=${RESOLVED_SDK_DIR} EAC_SDK_MODE=real SOURCE=${SOURCE}"
  elif [[ "${MODE}" == "--emit-env" ]]; then
    # Linhas shell-safe para eval/GITHUB_ENV em CI.
    echo "KHAAOS_EAC_SDK_DIR=${RESOLVED_SDK_DIR}"
    echo "EAC_SDK_MODE=real"
    echo "EAC_SDK_SOURCE=${SOURCE}"
  fi
  exit 0
fi

# Sem SDK — contrato: nunca quebra (stub), salvo --require.
export EAC_SDK_MODE="stub"
unset KHAAOS_EAC_SDK_DIR || true
if [[ "${MODE}" == "--require" ]]; then
  log "ERRO (--require): SDK real do EAC ausente."
  log "Fontes suportadas: KHAAOS_EAC_SDK_DIR pré-instalado, ${LOCAL_SDK_DIR}, ou EAC_SDK_URL (download)."
  log "Go-live exige EAC 'Active' — não prossiga com o build de produção em modo stub."
  exit 1
fi
log "SDK do EAC ausente — modo stub (KHAAOS_EAC_SDK=0). Fontes tentadas:"
log "  1. KHAAOS_EAC_SDK_DIR (env)  2. ${LOCAL_SDK_DIR}  3. EAC_SDK_URL (download)"
log "O build segue em modo stub (contrato: nunca quebra). Download oficial: dev portal da Epic."
if [[ "${MODE}" == "--print" ]]; then
  log "EAC_SDK_MODE=stub SOURCE=none"
elif [[ "${MODE}" == "--emit-env" ]]; then
  echo "EAC_SDK_MODE=stub"
  echo "EAC_SDK_SOURCE=none"
fi
exit 0
