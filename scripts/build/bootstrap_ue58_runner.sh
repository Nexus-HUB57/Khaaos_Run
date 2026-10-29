#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Bootstrap de runner self-hosted com UE5.8 (Linux)
# =============================================================================
# Desbloqueia a compilação do UE5.8 em CI quando não é possível puxar a imagem
# oficial de contêiner da Epic (workflow ue58-container-build.yml): provisiona
# uma máquina Linux com engine + registra um GitHub Actions runner com os
# labels exigidos pelos workflows que rodam engine real:
#   - ue5-headless-compile.yml / ue58-release-cd.yml: [self-hosted, linux, ue5.8, x64]
#   - ue5-build.yml:                                  [self-hosted, ue5]
# e injeta UE5_ROOT no .env do runner (ue5-build.yml falha sem essa variável).
#
# USO:
#   sudo UE5_GITHUB_TOKEN=ghp_xxx RUNNER_URL=https://github.com/Nexus-HUB57/Khaaos_Run \
#        RUNNER_TOKEN=<token de runner da UI de Settings→Actions→Runners> \
#        bash scripts/build/bootstrap_ue58_runner.sh --all
#   # 100% automatizado (Fase 28): RUNNER_TOKEN vem da API — basta um PAT
#   # com escopo de admin de Actions (fine-grained: Administration read+write):
#   sudo UE5_GITHUB_TOKEN=ghp_epic RUNNER_PAT=ghp_admin \
#        bash scripts/build/bootstrap_ue58_runner.sh --all
#   # ou por fases:
#   bash scripts/build/bootstrap_ue58_runner.sh --prereqs
#   bash scripts/build/bootstrap_ue58_runner.sh --engine
#   bash scripts/build/bootstrap_ue58_runner.sh --runner
#   bash scripts/build/bootstrap_ue58_runner.sh --check     # valida sem instalar
#
# PRÉ-REQUISITOS DO HOST (fora do script):
#   - Disco: ≥ 250 GB livres (engine ~90 GB + builds), 32 GB RAM, 8+ cores;
#   - Conta GitHub com permissão de clone do repositório privado
#     github.com/EpicGames/UnrealEngine (vínculo com conta Epic + EULA aceita)
#     — o token vai em UE5_GITHUB_TOKEN;
#   - RUNNER_TOKEN gerado em Settings → Actions → Runners → New self-hosted
#     runner (expira em ~1 h; o script não aceita PAT aqui).
# =============================================================================
set -euo pipefail

UE_VERSION="${UE_VERSION:-5.8.0}"
ENGINE_DIR="${UE_INSTALL_DIR:-/opt/UnrealEngine}"
RUNNER_DIR="${RUNNER_DIR:-/opt/actions-runner}"
RUNNER_URL="${RUNNER_URL:-https://github.com/Nexus-HUB57/Khaaos_Run}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux,x64,ue5.8,ue5}"
MIN_FREE_GB=250

log() { printf '\n\033[1;36m[ue58-bootstrap]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[ue58-bootstrap] ERRO:\033[0m %s\n' "$*" >&2; exit 1; }

free_gb() { df -BG "$1" | awk 'NR==2 {gsub("G","",$4); print $4}'; }

phase_prereqs() {
  log "Fase 1/3 — pré-requisitos (build-essential, clang, .NET 8, git-lfs)"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq build-essential clang git git-lfs curl jq xdotool numactl python3-setuptools >/dev/null
  else
    die "distribuição sem apt-get: adapte a lista de pacotes para o seu gerenciador"
  fi
  if ! command -v dotnet >/dev/null 2>&1; then
    curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
    bash /tmp/dotnet-install.sh --channel 8.0 --install-dir /usr/share/dotnet >/dev/null
    ln -sf /usr/share/dotnet/dotnet /usr/local/bin/dotnet
  fi
  git lfs install
  log "Disco: ${MIN_FREE_GB} GB livres exigidos em $(dirname "$ENGINE_DIR") — $(free_gb "$(dirname "$ENGINE_DIR" 2>/dev/null || echo /)") GB disponíveis"
  [ "$(free_gb /)" -ge "$MIN_FREE_GB" ] || die "disco insuficiente (< ${MIN_FREE_GB} GB livres)"
}

phase_engine() {
  log "Fase 2/3 — engine ${UE_VERSION} (clone do repositório licenciado da Epic)"
  [ -n "${UE5_GITHUB_TOKEN:-}" ] || die "UE5_GITHUB_TOKEN ausente — PAT de conta vinculada à EpicGames (clone de github.com/EpicGames/UnrealEngine)"
  if [ -d "${ENGINE_DIR}/Engine" ]; then
    log "engine já presente em ${ENGINE_DIR} — pulando clone (remova a pasta para forçar)"
  else
    mkdir -p "$(dirname "$ENGINE_DIR")"
    git config --global advice.detachedHead false
    git clone --depth 1 --branch "${UE_VERSION}-release" \
      "https://${UE5_GITHUB_TOKEN}@github.com/EpicGames/UnrealEngine.git" "${ENGINE_DIR}"
  fi
  log "Setup.sh (binários de terceiros, ~30-60 min)"
  ( cd "${ENGINE_DIR}" && chmod +x Setup.sh GenerateProjectFiles.sh && ./Setup.sh )
}

phase_runner() {
  log "Fase 3/3 — registro do GitHub Actions runner (labels: ${RUNNER_LABELS})"
  # Fase 28 — RUNNER_TOKEN pode vir da API de registration-token (POST
  # /repos/{owner}/{repo}/actions/runners/registration-token) com um PAT de
  # administração: elimina o ÚLTIMO passo manual do bootstrap (a UI do GitHub
  # expira o token em ~1 h e exigia navegação). RUNNER_TOKEN explícito vence.
  if [ -z "${RUNNER_TOKEN:-}" ] && [ -n "${RUNNER_PAT:-}" ]; then
    log "RUNNER_TOKEN ausente — obtendo registration-token via API (RUNNER_PAT)"
    api_url="https://api.github.com/repos/${RUNNER_URL#https://github.com/}/actions/runners/registration-token"
    resp=$(curl -fsSL -X POST \
      -H "Authorization: Bearer ${RUNNER_PAT}" \
      -H "Accept: application/vnd.github+json" "${api_url}") \
      || die "falha ao obter registration-token — RUNNER_PAT tem escopo de administração de Actions neste repo?"
    RUNNER_TOKEN=$(printf '%s' "$resp" | jq -r '.token // empty')
    [ -n "$RUNNER_TOKEN" ] || die "resposta da API sem token — verifique o PAT"
    log "registration-token obtido via API (válido ~1 h)"
  fi
  [ -n "${RUNNER_TOKEN:-}" ] || die "RUNNER_TOKEN/RUNNER_PAT ausentes — gere em Settings → Actions → Runners ou forneça RUNNER_PAT (válido ~1 h)"
  if [ ! -d "${RUNNER_DIR}" ]; then
    mkdir -p "${RUNNER_DIR}"
    RUNNER_ARCH="x64"
    RUNNER_VER="${RUNNER_VERSION:-2.321.0}"
    curl -fsSL -o /tmp/runner.tar.gz "https://github.com/actions/runner/releases/download/v${RUNNER_VER}/actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VER}.tar.gz"
    tar -xzf /tmp/runner.tar.gz -C "${RUNNER_DIR}"
  fi
  ( cd "${RUNNER_DIR}" && ./config.sh --url "${RUNNER_URL}" --token "${RUNNER_TOKEN}" --labels "${RUNNER_LABELS}" --unattended --replace )
  # ue5-build.yml exige UE5_ROOT no ambiente de cada step ("❌ UE5_ROOT not set
  # on self-hosted runner"). O arquivo .env no diretório do runner é o mecanismo
  # oficial do actions-runner: cada valor vira variável de ambiente dos jobs.
  if grep -q '^UE5_ROOT=' "${RUNNER_DIR}/.env" 2>/dev/null; then
    sed -i "s|^UE5_ROOT=.*|UE5_ROOT=${ENGINE_DIR}|" "${RUNNER_DIR}/.env"
  else
    printf 'UE5_ROOT=%s\n' "${ENGINE_DIR}" >> "${RUNNER_DIR}/.env"
  fi
  log "UE5_ROOT=${ENGINE_DIR} injetado em ${RUNNER_DIR}/.env"
  if [ "$(id -u)" -eq 0 ] && [ -f "${RUNNER_DIR}/svc.sh" ]; then
    ( cd "${RUNNER_DIR}" && ./svc.sh install && ./svc.sh start ) || log "serviço systemd opcional não instalado — rode ./run.sh manualmente"
  else
    log "inicie o runner com: cd ${RUNNER_DIR} && ./run.sh"
  fi
}

phase_check() {
  log "Verificação (sem instalar nada)"
  [ -d "${ENGINE_DIR}/Engine/Build/BatchFiles" ] && log "✅ engine presente: ${ENGINE_DIR}" || log "❌ engine ausente: ${ENGINE_DIR} (fase --engine)"
  [ -x "${ENGINE_DIR}/Engine/Build/BatchFiles/Build.sh" ] && log "✅ Build.sh executável" || log "❌ Build.sh ausente — Setup.sh rodou?"
  [ -x "${ENGINE_DIR}/Engine/Build/BatchFiles/Linux/Build.sh" ] && log "✅ Linux/Build.sh executável (usado por ue58-release-cd.yml)" || log "❌ Linux/Build.sh ausente"
  grep -q '^UE5_ROOT=' "${RUNNER_DIR}/.env" 2>/dev/null && log "✅ UE5_ROOT no .env do runner" || log "❌ UE5_ROOT ausente no ${RUNNER_DIR}/.env (fase --runner)"
  [ -d "${RUNNER_DIR}/bin" ] && log "✅ runner instalado: ${RUNNER_DIR}" || log "❌ runner ausente (fase --runner)"
  [ -f "${RUNNER_DIR}/.runner" ] && log "✅ runner registrado em ${RUNNER_URL}" || log "❌ runner não registrado (RUNNER_TOKEN)"
  command -v dotnet >/dev/null 2>&1 && log "✅ dotnet $(dotnet --version 2>/dev/null | head -1)" || log "❌ dotnet ausente (fase --prereqs)"
  log "teste rápido de compilação: bash ${ENGINE_DIR}/Engine/Build/BatchFiles/Build.sh KhaaosRunServer Linux Development -project=$(pwd)/Unreal/KhaaosRun/KhaaosRun.uproject"
  cat <<'EOF'

─── Pós-bootstrap (máquina administrativa com gh autenticado) ───
Sem estas variáveis de repo, o job "Build and cook UE5.8 package"
(ue58-release-cd.yml) permanece skipped:
  gh variable set UE58_ENABLED --repo Nexus-HUB57/Khaaos_Run --body true
  gh variable set UE5_ROOT    --repo Nexus-HUB57/Khaaos_Run --body /opt/UnrealEngine
  gh variable set UE5_WORLD_STRESS_COMMAND --repo Nexus-HUB57/Khaaos_Run \
    --body '"$UE5_ROOT/Engine/Binaries/Linux/UnrealEditor-Cmd" "$GITHUB_WORKSPACE/Unreal/KhaaosRun/KhaaosRun.uproject" -nullrhi -unattended -nosplash -nopause -ExecCmds="Automation RunTests Khaaos.Worlds.Stress; Quit" -testexit="Automation Test Queue Finished" -log'
(ajuste o nome do automation test ao cookado em scripts/performance/ue58_all_world_stress.mjs)
EOF
}

case "${1:---check}" in
  --prereqs) phase_prereqs ;;
  --engine) phase_engine ;;
  --runner) phase_runner ;;
  --all) phase_prereqs; phase_engine; phase_runner ;;
  --check|"") phase_check ;;
  *) sed -n '2,20p' "$0"; exit 2 ;;
esac
