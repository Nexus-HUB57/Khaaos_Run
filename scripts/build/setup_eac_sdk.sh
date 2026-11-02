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
#     exportado — habilita a configuração de build para linkar as bibliotecas;
#     isto não prova que APIs/sessões EAC estejam integradas ou protegidas;
#   - Download por URL exige SHA-256; extração rejeita traversal/links; fonte
#     inválida (dir/URL que não contém o pacote) retorna exit 1
#     (falha RÁPIDO — melhor que descobrir no link do build).
#
# Uso:
#   source scripts/build/setup_eac_sdk.sh            # resolve e exporta
#   bash scripts/build/setup_eac_sdk.sh --require    # falha se só houver stub
#   bash scripts/build/setup_eac_sdk.sh --print      # apenas diagnóstico
#   eval "$(bash scripts/build/setup_eac_sdk.sh --emit-env)"  # exporta no shell atual
#   bash scripts/build/setup_eac_sdk.sh --emit-github-env >> "$GITHUB_ENV"
#   EAC_SDK_URL requer EAC_SDK_SHA256 (64 hex) para verificar o artefato remoto.
# =============================================================================
set -euo pipefail

MODE="${1:-source}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_SDK_DIR="${REPO_ROOT}/Unreal/KhaaosRun/Source/KhaaosEAC/EACSDK"
DOWNLOAD_DIR="${EAC_SDK_CACHE_DIR:-${REPO_ROOT}/artifacts/eac-sdk}"

# Estrutura mínima do pacote oficial (espelha KhaaosEAC.Build.cs):
#   <sdkDir>/Sdk/anticheat/sdkdefines.h
#   <sdkDir>/Sdk/lib/anticheat/{eacserver,eacclient}.(lib|dll)  (Win64)
#   <sdkDir>/Sdk/lib/anticheat/{libeacserver,libeacclient}.so   (Linux)
required_files=( "Sdk/anticheat/sdkdefines.h" )

log() {
  if [[ "${MODE}" == "--emit-env" || "${MODE}" == "--emit-github-env" ]]; then
    echo "[setup_eac_sdk] $*" >&2
  else
    echo "[setup_eac_sdk] $*"
  fi
}

validate_sdk_dir() {
  local dir="$1"
  for rel in "${required_files[@]}"; do
    if [[ ! -f "${dir}/${rel}" ]]; then
      log "ERRO: pacote EAC inválido em ${dir} — falta ${rel}"
      log "Esperado layout oficial: <dir>/Sdk/anticheat/* + <dir>/Sdk/lib/anticheat/*"
      return 1
    fi
  done
  local has_linux_pair=0 has_windows_pair=0
  if [[ -f "${dir}/Sdk/lib/anticheat/libeacserver.so" && -f "${dir}/Sdk/lib/anticheat/libeacclient.so" ]]; then
    has_linux_pair=1
  fi
  if [[ -f "${dir}/Sdk/lib/anticheat/eacserver.lib" && -f "${dir}/Sdk/lib/anticheat/eacclient.lib" ]]; then
    has_windows_pair=1
  fi
  if [[ "${has_linux_pair}" -eq 0 && "${has_windows_pair}" -eq 0 ]]; then
    log "ERRO: SDK sem par completo eacserver/eacclient para Linux (.so) ou Win64 (.lib)"
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
  local format="${EAC_SDK_ARCHIVE_FORMAT:-}"
  if [[ -z "${format}" ]]; then
    case "${url%%\?*}" in
      *.zip) format="zip" ;;
      *.tar.gz) format="tar.gz" ;;
      *.tgz) format="tgz" ;;
      *) log "ERRO: não foi possível inferir o arquivo; defina EAC_SDK_ARCHIVE_FORMAT=zip|tar.gz"; return 1 ;;
    esac
  fi
  local archive
  case "${format}" in
    zip) archive="${DOWNLOAD_DIR}/eac-sdk.zip" ;;
    tar.gz|tgz) archive="${DOWNLOAD_DIR}/eac-sdk.tar.gz" ;;
    *) log "ERRO: EAC_SDK_ARCHIVE_FORMAT inválido (use zip ou tar.gz)"; return 1 ;;
  esac
  log "baixando EAC SDK de EAC_SDK_URL (conteúdo não logado — segredo)..."
  mkdir -p "${DOWNLOAD_DIR}"
  local curl_args=( -fsSL --retry 2 -o "${archive}" )
  if [[ -n "${EAC_SDK_URL_TOKEN:-}" ]]; then
    curl_args+=( -H "Authorization: Bearer ${EAC_SDK_URL_TOKEN}" )
  fi
  curl "${curl_args[@]}" "${url}" || return 1

  if [[ ! "${EAC_SDK_SHA256:-}" =~ ^[A-Fa-f0-9]{64}$ ]]; then
    log "ERRO: EAC_SDK_SHA256 de 64 dígitos hexadecimais é obrigatório para downloads por URL"
    return 1
  fi
  if ! printf '%s  %s\n' "${EAC_SDK_SHA256}" "${archive}" | sha256sum -c --status; then
    log "ERRO: SHA-256 do pacote EAC não confere"
    return 1
  fi

  local extract_dir
  extract_dir="$(mktemp -d "${DOWNLOAD_DIR}/extract.XXXXXX")" || return 1
  python3 - "${archive}" "${format}" "${extract_dir}" <<'PY' || return 1
import os
import shutil
import stat
import sys
import tarfile
import zipfile

archive_path, archive_format, destination = sys.argv[1:]
root = os.path.realpath(destination)

def safe_destination(name):
    if "\\" in name or name.startswith("/") or (len(name) > 1 and name[1] == ":"):
        raise ValueError(f"caminho absoluto/inválido no pacote: {name!r}")
    parts = name.split("/")
    if any(part == ".." for part in parts):
        raise ValueError(f"path traversal no pacote: {name!r}")
    target = os.path.realpath(os.path.join(root, *(part for part in parts if part not in ("", "."))))
    if os.path.commonpath((root, target)) != root:
        raise ValueError(f"destino fora do diretório de extração: {name!r}")
    return target

def write_file(target, stream, mode):
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "wb") as output:
        shutil.copyfileobj(stream, output)
    permissions = mode & 0o777 if mode else 0o644
    os.chmod(target, permissions)

try:
    if archive_format == "zip":
        with zipfile.ZipFile(archive_path) as package:
            for item in package.infolist():
                target = safe_destination(item.filename)
                mode = (item.external_attr >> 16) & 0xFFFF
                file_type = stat.S_IFMT(mode)
                if file_type not in (0, stat.S_IFREG, stat.S_IFDIR):
                    raise ValueError(f"link/arquivo especial recusado: {item.filename!r}")
                if item.is_dir() or file_type == stat.S_IFDIR:
                    os.makedirs(target, exist_ok=True)
                else:
                    with package.open(item) as source:
                        write_file(target, source, mode)
    elif archive_format in ("tar.gz", "tgz"):
        with tarfile.open(archive_path, "r:gz") as package:
            for item in package.getmembers():
                target = safe_destination(item.name)
                if item.isdir():
                    os.makedirs(target, exist_ok=True)
                elif item.isfile():
                    source = package.extractfile(item)
                    if source is None:
                        raise ValueError(f"arquivo TAR sem conteúdo: {item.name!r}")
                    with source:
                        write_file(target, source, item.mode)
                else:
                    raise ValueError(f"link/arquivo especial recusado: {item.name!r}")
    else:
        raise ValueError(f"formato não suportado: {archive_format}")
except Exception as error:
    print(f"[setup_eac_sdk] ERRO extraindo pacote EAC com segurança: {error}", file=sys.stderr)
    raise SystemExit(1)
PY

  # O diretório do SDK é exatamente o pai da árvore Sdk/anticheat.
  local header candidate
  header="$(find "${extract_dir}" -type f -path "*/Sdk/anticheat/sdkdefines.h" -print -quit)"
  if [[ -z "${header}" ]]; then
    log "ERRO: zip do EAC SDK não contém Sdk/anticheat/sdkdefines.h"
    return 1
  fi
  candidate="${header%/Sdk/anticheat/sdkdefines.h}"
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
elif [[ -n "${EAC_SDK_URL:-}" ]]; then
  if download_sdk; then
    SOURCE="url:EAC_SDK_URL"
  else
    log "ERRO: download ou validação do pacote EAC falhou; não caindo silenciosamente para stub."
    exit 1
  fi
fi

if [[ -n "${RESOLVED_SDK_DIR}" ]]; then
  export KHAAOS_EAC_SDK_DIR="${RESOLVED_SDK_DIR}"
  export EAC_SDK_MODE="real"
  log "SDK REAL do EAC resolvido via ${SOURCE}: ${RESOLVED_SDK_DIR}"
  log "build linkará eacserver/eacclient (KHAAOS_EAC_SDK=1); o servidor dedicado loga 'EAC Status: Active'"
  if [[ "${MODE}" == "--print" ]]; then
    log "KHAAOS_EAC_SDK_DIR=${RESOLVED_SDK_DIR} EAC_SDK_MODE=real SOURCE=${SOURCE}"
  elif [[ "${MODE}" == "--emit-env" ]]; then
    printf -v sdk_dir_quoted '%q' "${RESOLVED_SDK_DIR}"
    printf 'export KHAAOS_EAC_SDK_DIR=%s\n' "${sdk_dir_quoted}"
    echo 'export EAC_SDK_MODE=real'
    printf 'export EAC_SDK_SOURCE=%q\n' "${SOURCE}"
  elif [[ "${MODE}" == "--emit-github-env" ]]; then
    echo "KHAAOS_EAC_SDK_DIR=${RESOLVED_SDK_DIR}"
    echo 'EAC_SDK_MODE=real'
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
  echo 'unset KHAAOS_EAC_SDK_DIR'
  echo 'export EAC_SDK_MODE=stub'
  echo 'export EAC_SDK_SOURCE=none'
elif [[ "${MODE}" == "--emit-github-env" ]]; then
  echo 'KHAAOS_EAC_SDK_DIR='
  echo 'EAC_SDK_MODE=stub'
  echo 'EAC_SDK_SOURCE=none'
fi
exit 0
