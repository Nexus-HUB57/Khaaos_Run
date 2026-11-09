#!/usr/bin/env bash
# Provisiona/valida host Linux para capturas e testes visuais UE5.8.
# Não instala uma versão arbitrária de driver por padrão e nunca imprime tokens.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Nexus-HUB57/Khaaos_Run}"
UE5_INSTALL_DIR="${UE5_INSTALL_DIR:-/opt/UnrealEngine}"
RUNNER_DIR="${RUNNER_DIR:-/opt/actions-runner}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux,x64,ue5.8,ue5,gpu}"
BLENDER_BIN="${BLENDER_BIN:-blender}"
GPU_REQUIRED="${GPU_REQUIRED:-1}"
INSTALL_NVIDIA_DRIVER="${INSTALL_NVIDIA_DRIVER:-0}"
INSTALL_SERVICE="${INSTALL_SERVICE:-1}"
PROVISION_PACKAGES="${PROVISION_PACKAGES:-1}"

log() { printf '\n[ue58-gpu-provision] %s\n' "$*"; }
warn() { printf '[ue58-gpu-provision][WARN] %s\n' "$*" >&2; }
die() { printf '[ue58-gpu-provision][ERROR] %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '1,28p' "$0"
  cat <<'EOF'

Variáveis importantes:
  UE5_INSTALL_DIR=/opt/UnrealEngine
  RUNNER_DIR=/opt/actions-runner
  RUNNER_REGISTRATION_TOKEN=<token efêmero do GitHub>
  GPU_REQUIRED=1|0
  INSTALL_NVIDIA_DRIVER=1   # Ubuntu; pode exigir reboot, não é padrão
  PROVISION_PACKAGES=1|0
  INSTALL_SERVICE=1|0

Exemplos:
  sudo GPU_REQUIRED=1 PROVISION_PACKAGES=1 bash scripts/build/provision_ue58_gpu_runner.sh --check
  sudo RUNNER_REGISTRATION_TOKEN=... bash scripts/build/provision_ue58_gpu_runner.sh --all
EOF
}

check_host() {
  log "Validando arquitetura, memória, disco e GPU"
  [[ "$(uname -m)" == "x86_64" ]] || die "UE5.8 runner exige x86_64"
  local ram_gb disk_gb
  ram_gb=$(( $(awk '/MemTotal/{print $2}' /proc/meminfo) / 1024 / 1024 ))
  disk_gb=$(df --output=avail -BG "$(dirname "$UE5_INSTALL_DIR")" | tail -1 | tr -dc '0-9')
  (( ram_gb >= 32 )) || warn "RAM ${ram_gb} GB; recomendado >=32 GB para Editor + capturas"
  (( disk_gb >= 150 )) || warn "Disco ${disk_gb} GB; recomendado >=150 GB para engine/cache/artifacts"
  if command -v nvidia-smi >/dev/null 2>&1; then
    local gpu
    gpu=$(nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader | head -1)
    log "GPU detectada: ${gpu}"
    local vram_mb
    vram_mb=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1 | tr -dc '0-9')
    (( vram_mb >= 8192 )) || warn "VRAM ${vram_mb} MiB; recomendado >=8192 MiB para Lumen/VSM"
  elif [[ "$GPU_REQUIRED" == "1" ]]; then
    if [[ "$INSTALL_NVIDIA_DRIVER" == "1" && "$(id -u)" == "0" ]]; then
      command -v ubuntu-drivers >/dev/null 2>&1 || apt-get update -qq && apt-get install -y -qq ubuntu-drivers
      ubuntu-drivers install
      die "driver instalado; reinicie o host e execute novamente"
    fi
    die "nvidia-smi ausente; instale o driver NVIDIA ou use INSTALL_NVIDIA_DRIVER=1 em Ubuntu"
  else
    warn "GPU não detectada; modo GPU_REQUIRED=0 permite somente validação/headless"
  fi
  [[ -x "${UE5_INSTALL_DIR}/Engine/Binaries/Linux/UnrealEditor-Cmd" ]] || die "UnrealEditor-Cmd ausente em ${UE5_INSTALL_DIR}"
  [[ -f "${UE5_INSTALL_DIR}/Engine/Build/Build.version" ]] || die "Build.version ausente"
  grep -q '"MajorVersion": 5' "${UE5_INSTALL_DIR}/Engine/Build/Build.version" || die "engine não parece UE5"
  command -v "$BLENDER_BIN" >/dev/null 2>&1 || die "Blender 4.x ausente: BLENDER_BIN=$BLENDER_BIN"
  "$BLENDER_BIN" --version | grep -qE 'Blender (4\.|4)' || die "Blender 4.x requerido"
}

install_packages() {
  [[ "$PROVISION_PACKAGES" == "1" ]] || return 0
  command -v apt-get >/dev/null 2>&1 || die "apt-get requerido para provisionamento automático"
  log "Instalando dependências mínimas do host"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl git git-lfs jq numactl python3 python3-pip xz-utils >/dev/null
  git lfs install || true
}

register_runner() {
  [[ -n "${RUNNER_REGISTRATION_TOKEN:-}" ]] || die "RUNNER_REGISTRATION_TOKEN ausente; forneça token efêmero sem gravá-lo no repositório"
  [[ -d "$RUNNER_DIR" ]] || mkdir -p "$RUNNER_DIR"
  if [[ ! -x "$RUNNER_DIR/config.sh" ]]; then
    local version tarball url
    version="${RUNNER_VERSION:-2.321.0}"
    tarball="actions-runner-linux-x64-${version}.tar.gz"
    url="https://github.com/actions/runner/releases/download/v${version}/${tarball}"
    curl -fsSL -o "/tmp/${tarball}" "$url"
    tar -xzf "/tmp/${tarball}" -C "$RUNNER_DIR"
    rm -f "/tmp/${tarball}"
  fi
  log "Registrando runner com labels: ${RUNNER_LABELS}"
  (cd "$RUNNER_DIR" && ./config.sh --url "$REPO_URL" --token "$RUNNER_REGISTRATION_TOKEN" --name "${RUNNER_NAME:-ue58-gpu-$(hostname -s)}" --labels "$RUNNER_LABELS" --work "${RUNNER_WORKDIR:-_work}" --unattended --replace)
  printf 'UE5_ROOT=%s\n' "$UE5_INSTALL_DIR" > "$RUNNER_DIR/.env"
  printf 'CIGKV_GPU_RUNNER=1\n' >> "$RUNNER_DIR/.env"
  if [[ "$INSTALL_SERVICE" == "1" && "$(id -u)" == "0" ]]; then
    (cd "$RUNNER_DIR" && ./svc.sh install "${RUN_AS_USER:-$(logname 2>/dev/null || echo root)}" && ./svc.sh start)
  else
    log "Serviço não instalado; execute cd $RUNNER_DIR && ./run.sh"
  fi
}

case "${1:---check}" in
  --check) check_host ;;
  --install) install_packages; check_host ;;
  --register) register_runner ;;
  --all) install_packages; check_host; register_runner ;;
  --help|-h) usage ;;
  *) usage; exit 2 ;;
esac
