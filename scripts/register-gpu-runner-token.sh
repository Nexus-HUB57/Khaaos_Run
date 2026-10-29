#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Registro do GPU Runner via API do GitHub
# =============================================================================
# Gera o RUNNER_REGISTRATION_TOKEN via API (POST /repos/{repo}/actions/runners/
# registration-token) e encadeia o scripts/setup-gpu-runner.sh — sem precisar
# abrir o navegador em Settings → Actions → Runners.
#
# Fontes de token GitHub (nesta ordem):
#   1. $GH_TOKEN (PAT com escopo admin no repo)
#   2. PAT embutido no git remote origin (https://<token>@github.com/...)
#
# Uso:
#   bash scripts/register-gpu-runner-token.sh              # registra runner NESTA máquina
#   bash scripts/register-gpu-runner-token.sh --list       # lista runners registrados no repo
#   bash scripts/register-gpu-runner-token.sh --token-file /root/runner-token
#                                                          # salva token p/ usar na VM GPU
#
# Na VM GPU (com UE5.8 instalado), fluxo completo em 2 comandos:
#   git clone https://github.com/Nexus-HUB57/Khaaos_Run && cd Khaaos_Run
#   GH_TOKEN=<PAT> bash scripts/register-gpu-runner-token.sh
#
# Env opcionais (passam direto pro setup-gpu-runner.sh):
#   RUNNER_NAME, RUNNER_LABELS, RUNNER_DIR, UE5_INSTALL_DIR, INSTALL_SERVICE
# =============================================================================
set -euo pipefail

REPO="${REPO:-Nexus-HUB57/Khaaos_Run}"
API_ROOT="https://api.github.com"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log()  { printf '\033[1;34m[khaaos-runner-token]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[erro]\033[0m %s\n' "$*" >&2; exit 1; }

# ─── Obter token GitHub sem imprimi-lo ───────────────────────────────────────
fetch_git_token() {
  local URL
  URL="$(git -C "$(dirname "$SCRIPT_DIR")" remote get-url origin 2>/dev/null || true)"
  [[ -z "$URL" ]] && return 1
  # Formatos: https://<token>@github.com/... ou https://x-access-token:<token>@...
  printf '%s' "$URL" | sed -E 's#https://(x-access-token:)?([^@]+)@github\.com.*#\2#'
}

GH_PAT="${GH_TOKEN:-}"
if [[ -z "$GH_PAT" ]]; then
  GH_PAT="$(fetch_git_token || true)"
fi
[[ -z "$GH_PAT" ]] && fail "Sem token GitHub: defina GH_TOKEN ou configure o remote origin com PAT embutido."

AUTH_HEADER="Authorization: Bearer ${GH_PAT}"
API_VERSION_HEADER="X-GitHub-Api-Version: 2022-11-28"

# ─── --list: apenas listar runners registrados ───────────────────────────────
if [[ "${1:-}" == "--list" ]]; then
  log "Runners registrados em ${REPO}:"
  curl -sf -H "$AUTH_HEADER" -H "$API_VERSION_HEADER" \
    "${API_ROOT}/repos/${REPO}/actions/runners" \
    | node -e '
      let raw=""; process.stdin.on("data",d=>raw+=d).on("end",()=>{
        const data=JSON.parse(raw);
        if(!data.runners || data.runners.length===0){ console.log("  (nenhum runner registrado)"); return; }
        for(const r of data.runners){
          const labels=(r.labels||[]).map(l=>l.name).join(",");
          const status=r.status==="online"?"\u001b[32monline\u001b[0m":"\u001b[33m"+r.status+"\u001b[0m";
          console.log(`  - ${r.name} [${status}] busy=${r.busy} labels=[${labels}]`);
        }
      });'
  exit 0
fi

# ─── Gerar registration token ────────────────────────────────────────────────
log "Gerando RUNNER_REGISTRATION_TOKEN para ${REPO}..."
RESPONSE="$(mktemp)"
HTTP_CODE="$(curl -s -o "$RESPONSE" -w '%{http_code}' -X POST \
  -H "$AUTH_HEADER" -H "$API_VERSION_HEADER" -H "Accept: application/vnd.github+json" \
  "${API_ROOT}/repos/${REPO}/actions/runners/registration-token")" || fail "curl falhou ao chamar a API do GitHub."

if [[ "$HTTP_CODE" != "201" ]]; then
  log "HTTP ${HTTP_CODE} — resposta:"
  head -c 500 "$RESPONSE" >&2
  echo >&2
  fail "Falha ao gerar token (HTTP ${HTTP_CODE}). O PAT precisa de permissão admin no repo."
fi

REG_TOKEN="$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$RESPONSE','utf8')).token || '')")"
rm -f "$RESPONSE"
[[ -z "$REG_TOKEN" ]] && fail "Resposta da API sem token."
log "Token gerado (validade: 1 hora, não será exibido)."

# ─── --token-file: salvar token p/ transferir à VM GPU ───────────────────────
if [[ "${1:-}" == "--token-file" ]]; then
  TOKEN_FILE="${2:-}"
  [[ -z "$TOKEN_FILE" ]] && fail "--token-file requer um caminho como 2º argumento."
  umask 077
  printf '%s' "$REG_TOKEN" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
  log "Token salvo em ${TOKEN_FILE} (perms 600)."
  log "Na VM GPU, rode:"
  log "  RUNNER_REGISTRATION_TOKEN=\$(cat ${TOKEN_FILE}) UE5_INSTALL_DIR=/opt/unreal-engine/5.8 \\"
  log "    bash scripts/setup-gpu-runner.sh"
  exit 0
fi

# ─── Padrão: registrar runner NESTA máquina ─────────────────────────────────
log "Encadeando setup-gpu-runner.sh (registro nesta máquina)..."
export RUNNER_REGISTRATION_TOKEN="$REG_TOKEN"
exec bash "${SCRIPT_DIR}/setup-gpu-runner.sh" "$@"
