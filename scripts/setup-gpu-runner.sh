#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Setup do Runner GPU Self-Hosted (ue5-headless-compile)
# =============================================================================
# Registra um runner self-hosted Linux x64 com os labels EXATOS que o workflow
# .github/workflows/ue5-headless-compile.yml exige:
#
#     runs-on: [self-hosted, linux, ue5.8, x64]
#
# Uso rápido (interativo):
#   bash scripts/setup-gpu-runner.sh
#
# Uso não-interativo (CI/infra-as-code):
#   RUNNER_REGISTRATION_TOKEN=XXXX \
#   UE5_INSTALL_DIR=/opt/UnrealEngine \
#   RUNNER_NAME=gpu-runner-01 \
#   INSTALL_SERVICE=1 \
#   bash scripts/setup-gpu-runner.sh
#
# Desinstalar:
#   bash scripts/setup-gpu-runner.sh --uninstall
#
# O token de registro vem de: GitHub → Settings → Actions → Runners →
# "New self-hosted runner" → Linux x64 → copiar o RUNNER_REGISTRATION_TOKEN
# (validade de 1 hora). NÃO é o mesmo que um PAT.
#
# Referência: docs/fase0/UE5_SETUP_GUIDE.md (dependências e requisitos).
# =============================================================================
set -euo pipefail

# ─── Configuração (sobrescrevível por env) ───────────────────────────────────
REPO_URL="${REPO_URL:-https://github.com/Nexus-HUB57/Khaaos_Run}"
RUNNER_VERSION="${RUNNER_VERSION:-}"            # vazio = busca a latest da API
RUNNER_DIR="${RUNNER_DIR:-$HOME/actions-runner}"
RUNNER_NAME="${RUNNER_NAME:-gpu-runner-$(hostname -s 2>/dev/null || echo 01)}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux,ue5.8,x64}"
RUNNER_GROUP="${RUNNER_GROUP:-Default}"
RUNNER_WORKDIR="${RUNNER_WORKDIR:-$HOME/runner-work}"
UE5_INSTALL_DIR="${UE5_INSTALL_DIR:-/opt/UnrealEngine}"
INSTALL_SERVICE="${INSTALL_SERVICE:-0}"         # 1 = instala serviço systemd
RUN_AS_USER="${RUN_AS_USER:-$(whoami)}"

# ─── Helpers ─────────────────────────────────────────────────────────────────
log()  { printf '\033[1;34m[khaaos-runner]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[aviso]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[erro]\033[0m %s\n' "$*" >&2; exit 1; }

need_cmd() { command -v "$1" >/dev/null 2>&1 || fail "comando ausente: $1 — instale antes de continuar"; }

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,35p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

# ─── Desinstalação ───────────────────────────────────────────────────────────
if [[ "${1:-}" == "--uninstall" ]]; then
  log "Desinstalando runner em ${RUNNER_DIR}..."
  if [[ -f "${RUNNER_DIR}/.runner" ]]; then
    sudo systemctl stop "actions.runner.${RUNNER_NAME}.service" 2>/dev/null || true
    sudo systemctl disable "actions.runner.${RUNNER_NAME}.service" 2>/dev/null || true
    sudo rm -f "/etc/systemd/system/actions.runner.${RUNNER_NAME}.service"
    sudo systemctl daemon-reload 2>/dev/null || true
    (cd "${RUNNER_DIR}" && ./svc.sh uninstall 2>/dev/null) || true
    REG_TOKEN="${RUNNER_REGISTRATION_TOKEN:-}"
    if [[ -n "${REG_TOKEN}" ]]; then
      (cd "${RUNNER_DIR}" && ./config.sh remove --token "${REG_TOKEN}" --url "${REPO_URL}") || true
    else
      warn "Sem RUNNER_REGISTRATION_TOKEN — remova o runner manualmente em ${REPO_URL}/settings/actions/runners"
    fi
  fi
  rm -rf "${RUNNER_DIR}"
  log "Runner removido."
  exit 0
fi

# ─── Pré-flight: dependências do runner ──────────────────────────────────────
log "Pré-flight: verificando dependências..."
need_cmd curl; need_cmd tar; need_cmd git

if ! command -v sudo >/dev/null 2>&1; then
  fail "sudo ausente — o runner precisa instalar serviço/dependências de sistema"
fi

# git-lfs (checkout do workflow usa lfs: true)
if ! command -v git-lfs >/dev/null 2>&1; then
  warn "git-lfs ausente — instalando (checkout do workflow usa LFS)"
  sudo apt-get update -qq && sudo apt-get install -y -qq git-lfs
  git lfs install || true
fi

# ─── Pré-flight: hardware & UE5.8 (labels ue5.8/x64 têm que ser verdade) ─────
log "Pré-flight: validando ambiente do compile UE5.8..."

ARCH="$(uname -m)"
[[ "${ARCH}" == "x86_64" ]] || fail "arquitetura ${ARCH} — o label x64 exige x86_64"

GLIBC_MAJOR="$(ldd --version | awk 'NR==1{gsub(/\./,"",$NF); print substr($NF,1,1)}')"
if [[ "$(ldd --version | awk 'NR==1{print $NF}')" < "2.28" ]]; then
  warn "glibc < 2.28 — runners recentes falham (GLIBC_2.28 not found). Use Ubuntu 22.04+"
fi

RAM_GB=$(( $(grep MemTotal /proc/meminfo | awk '{print $2}') / 1024 / 1024 ))
[[ ${RAM_GB} -ge 16 ]] || warn "RAM: ${RAM_GB} GB — mínimo 16 GB, recomendado 32 GB (build UE5 é pesado)"
DISK_GB="$(df --output=avail -BG "$(dirname "${UE5_INSTALL_DIR}")" | tail -1 | tr -dc '0-9')"
[[ ${DISK_GB:-0} -ge 60 ]] || warn "Disco: ${DISK_GB} GB livres — compilar UE5 precisa de ~60-100 GB"

# GPU (label "GPU runner"): driver NVIDIA presente?
if command -v nvidia-smi >/dev/null 2>&1; then
  log "GPU: $(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader | head -1)"
else
  warn "nvidia-smi não encontrado — o compile headless (-NullRHI) funciona SEM GPU,"
  warn "mas o benchmark gráfico (validate-graphics) e Pixel Streaming precisam de driver."
fi

# UE5.8
if [[ -d "${UE5_INSTALL_DIR}/Engine" ]]; then
  UE_VER="$(cat "${UE5_INSTALL_DIR}/Engine/Build/Build.version" 2>/dev/null | grep MajorVersion || echo '?')"
  log "UE5 encontrado em ${UE5_INSTALL_DIR} (${UE_VER//[$'\r\n']/})"
else
  warn "UE5 NÃO encontrado em ${UE5_INSTALL_DIR}"
  warn "Instale a 5.8 (docs/fase0/UE5_SETUP_GUIDE.md, opção A/B) e/ou configure o"
  warn "secret UE5_INSTALL_DIR no GitHub. O workflow falha cedo sem o Engine."
fi

# ─── Token de registro ───────────────────────────────────────────────────────
REG_TOKEN="${RUNNER_REGISTRATION_TOKEN:-}"
if [[ -z "${REG_TOKEN}" ]]; then
  warn "RUNNER_REGISTRATION_TOKEN não definido no ambiente."
  echo
  echo "  1. Abra: ${REPO_URL}/settings/actions/runners/new"
  echo "  2. Escolha Linux / x64"
  echo "  3. Copie o token do comando ./config.sh (parâmetro --token)"
  echo
  read -r -p "Cole o RUNNER_REGISTRATION_TOKEN: " REG_TOKEN
  [[ -n "${REG_TOKEN}" ]] || fail "token obrigatório"
fi

# ─── Download do runner (latest da API, override via RUNNER_VERSION) ─────────
if [[ -z "${RUNNER_VERSION}" ]]; then
  log "Buscando versão mais recente do actions-runner..."
  RUNNER_VERSION="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest \
    | grep -oP '"tag_name":\s*"v\K[^"]+' || true)"
  [[ -n "${RUNNER_VERSION}" ]] || fail "não consegui obter a latest — defina RUNNER_VERSION=2.xxx.x manualmente"
fi
RUNNER_VERSION="${RUNNER_VERSION#v}"
TARBALL="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${TARBALL}"

log "Baixando runner v${RUNNER_VERSION}..."
mkdir -p "${RUNNER_DIR}" && cd "${RUNNER_DIR}"
if [[ ! -f ./config.sh ]]; then
  curl -fL -o "${TARBALL}" "${URL}"
  # Checksum oficial (publicado pelo GitHub junto da release)
  curl -fsL -o "${TARBALL}.sha" "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${TARBALL}.hashes" 2>/dev/null || true
  if [[ -f "${TARBALL}.sha" ]]; then
    EXPECTED="$(grep 'linux-x64' "${TARBALL}.sha" | grep -oE '^[a-f0-9]{64}')"
    ACTUAL="$(sha256sum "${TARBALL}" | awk '{print $1}')"
    [[ "${EXPECTED}" == "${ACTUAL}" ]] || fail "checksum do tarball não bate (${EXPECTED} vs ${ACTUAL})"
    log "Checksum SHA-256 verificado."
  else
    warn "hashes não disponíveis — seguindo sem verificação de checksum"
  fi
  tar xzf "${TARBALL}" && rm -f "${TARBALL}"
fi

# ─── Registro com os labels exatos do workflow ───────────────────────────────
log "Registrando runner '${RUNNER_NAME}' com labels: ${RUNNER_LABELS}"
./config.sh \
  --url "${REPO_URL}" \
  --token "${REG_TOKEN}" \
  --name "${RUNNER_NAME}" \
  --labels "${RUNNER_LABELS}" \
  --work "${RUNNER_WORKDIR}" \
  --unattended \
  --replace

# ─── Serviço systemd (opcional, recomendado) ─────────────────────────────────
if [[ "${INSTALL_SERVICE}" == "1" ]]; then
  log "Instalando serviço systemd (user=${RUN_AS_USER})..."
  sudo ./svc.sh install "${RUN_AS_USER}"
  sudo ./svc.sh start
  log "Serviço ativo: sudo systemctl status actions.runner.*"
else
  warn "INSTALL_SERVICE=0 — para produção rode: cd ${RUNNER_DIR} && sudo ./svc.sh install ${RUN_AS_USER} && sudo ./svc.sh start"
  warn "(ou apenas teste com: cd ${RUNNER_DIR} && ./run.sh)"
fi

log "Pronto! Runner '${RUNNER_NAME}' registrado com labels: ${RUNNER_LABELS}"
log "Valide em: ${REPO_URL}/settings/actions/runners"
log "Próximo passo: dispare 'UE5 Headless Compile' (workflow_dispatch) ou faça push em main com mudanças em Unreal/KhaaosRun/Source/**"
log "Lembre do secret: UE5_INSTALL_DIR=${UE5_INSTALL_DIR} (Settings → Secrets → Actions)"
