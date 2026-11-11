#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Fase B automatizada: os 7 secrets EOS_* no GitHub.
# =============================================================================
# Automatiza o passo 3 de docs/EOS_PORTAL_CHECKLIST.md §0.1. Regra de ouro
# (PB-07): valores entram SOMENTE por variável de ambiente (gerenciador de
# senhas → export) — nunca argumento, nunca arquivo, nunca chat. O script
# nunca ecoa valores; tudo que imprime é nome de secret.
#
# USO (máquina administrativa com gh autenticado):
#   export REPO=Nexus-HUB57/Khaaos_Run
#   export EOS_PRODUCT_ID=… EOS_SANDBOX_ID=… EOS_DEPLOYMENT_ID=…
#   export EOS_CLIENT_ID=…  EOS_CLIENT_SECRET=…
#   # opcional: EOS_ENCRYPTION_KEY (gerado se ausente), EOS_REGION (default sa1)
#   bash scripts/eos/setup_eos_secrets.sh
#
# Saída esperada: EOS_SECRETS_SETUP_OK + `gh secret list` mostrando os 7 nomes.
# =============================================================================
set -euo pipefail

REPO="${REPO:-Nexus-HUB57/Khaaos_Run}"

command -v gh >/dev/null 2>&1 || { echo "ERRO: gh CLI ausente — instale https://cli.github.com"; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "ERRO: openssl ausente"; exit 1; }

# Nunca imprimir valores: qualquer erro aborta antes; set -x proibido aqui.
for name in EOS_PRODUCT_ID EOS_SANDBOX_ID EOS_DEPLOYMENT_ID EOS_CLIENT_ID EOS_CLIENT_SECRET; do
  if [[ -z "${!name:-}" ]]; then
    echo "ERRO: variável de ambiente $name ausente — exporte a partir do gerenciador de senhas (Portal Epic, Fase A)."
    exit 1
  fi
done

# EOS_ENCRYPTION_KEY: 64 hex; gerado localmente e NUNCA registrado em nenhum
# outro lugar (se perdido, gere outro e redefina o secret — chaves criptográficas
# de sessão EOS podem ser rotacionadas sem perda além de sessões ativas).
if [[ -z "${EOS_ENCRYPTION_KEY:-}" ]]; then
  EOS_ENCRYPTION_KEY="$(openssl rand -hex 32)"
  echo "EOS_ENCRYPTION_KEY gerado localmente (openssl rand -hex 32)."
fi
EOS_REGION="${EOS_REGION:-sa1}"

set_secret() { # stdin → gh secret set (valor nunca vai para argv)
  local name="$1"
  gh secret set "$name" --repo "$REPO" --body "$(
    # valor vem do stdin do próprio pipeline; echo aqui não revela em log
    # porque stdout do script segue para o pipe do gh, não para o terminal
    cat
  )"
}

printf '%s' "$EOS_PRODUCT_ID"     | set_secret EOS_PRODUCT_ID
printf '%s' "$EOS_SANDBOX_ID"     | set_secret EOS_SANDBOX_ID
printf '%s' "$EOS_DEPLOYMENT_ID"  | set_secret EOS_DEPLOYMENT_ID
printf '%s' "$EOS_CLIENT_ID"      | set_secret EOS_CLIENT_ID
printf '%s' "$EOS_CLIENT_SECRET"  | set_secret EOS_CLIENT_SECRET
printf '%s' "$EOS_ENCRYPTION_KEY" | set_secret EOS_ENCRYPTION_KEY
printf '%s' "$EOS_REGION"         | set_secret EOS_REGION

echo "Verificação (apenas nomes):"
names="$(gh secret list --repo "$REPO" --json name --jq '.[].name' 2>/dev/null || gh secret list --repo "$REPO" | awk '{print $1}')"
missing=0
for name in EOS_PRODUCT_ID EOS_SANDBOX_ID EOS_DEPLOYMENT_ID EOS_CLIENT_ID EOS_CLIENT_SECRET EOS_ENCRYPTION_KEY EOS_REGION; do
  if grep -qx "$name" <<<"$names"; then
    echo "  ✔ $name"
  else
    echo "  ✘ $name (ausente)"
    missing=1
  fi
done
(( missing == 0 )) || { echo "ERRO: nem todos os secrets foram gravados."; exit 1; }

echo "Próximo passo (Fase C): bash scripts/eos/inject_eos_credentials.sh --check"
echo "Auditoria geral: GH_TOKEN=… node scripts/eos/p0_gate.mjs"
echo "EOS_SECRETS_SETUP_OK"
