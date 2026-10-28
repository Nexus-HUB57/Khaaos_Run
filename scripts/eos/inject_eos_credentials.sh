#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — M4: injeção de credenciais EOS reais no DefaultEOS.ini
# =============================================================================
# O roadmap M4 (docs/ROADMAP.md) exige "EOS Dev/Staging com credenciais reais
# protegidas" — os placeholders KHAOS_* NUNCA vão para um build final.
#
# Uso (build/empacotamento/CI):
#   EOS_PRODUCT_ID=... EOS_SANDBOX_ID=... EOS_DEPLOYMENT_ID=... \
#   EOS_CLIENT_ID=... EOS_CLIENT_SECRET=... \
#   bash scripts/eos/inject_eos_credentials.sh
#
# Modo verificação (gate de CI — exit 1 se placeholders permanecerem):
#   bash scripts/eos/inject_eos_credentials.sh --check
#
# Segredos vêm do ambiente (GitHub Actions secrets EOS_*); o arquivo com
# credenciais gerado em runtime não é commitado (gitignore de *Local*.ini).
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EOS_INI="${REPO_ROOT}/Unreal/KhaaosRun/Config/DefaultEOS.ini"

check() {
  local failures=0
  for placeholder in KHAOS_PRODUCT_ID KHAOS_SANDBOX_ID KHAOS_DEPLOYMENT_ID KHAOS_CLIENT_ID KHAOS_CLIENT_SECRET; do
    if grep -q "${placeholder}" "${EOS_INI}"; then
      echo "❌ placeholder ${placeholder} presente em ${EOS_INI}"
      failures=$((failures + 1))
    fi
  done
  if [ "${failures}" -gt 0 ]; then
    echo "M4 gate: ${failures} placeholder(s) — injete credenciais reais (bash scripts/eos/inject_eos_credentials.sh)"
    exit 1
  fi
  echo "✅ M4 gate: DefaultEOS.ini sem placeholders — credenciais reais aplicadas"
  exit 0
}

[ "${1:-}" = "--check" ] && check

for var in EOS_PRODUCT_ID EOS_SANDBOX_ID EOS_DEPLOYMENT_ID EOS_CLIENT_ID EOS_CLIENT_SECRET; do
  if [ -z "${!var:-}" ]; then
    echo "❌ variável ${var} ausente no ambiente (GitHub secret EOS_*)"; exit 1
  fi
done

if [ ! -f "${EOS_INI}" ]; then
  echo "❌ ${EOS_INI} não encontrado"; exit 1
fi

sed -i.bak \
  -e "s/^ProductId=.*/ProductId=${EOS_PRODUCT_ID}/" \
  -e "s/^SandboxId=.*/SandboxId=${EOS_SANDBOX_ID}/" \
  -e "s/^DeploymentId=.*/DeploymentId=${EOS_DEPLOYMENT_ID}/" \
  -e "s/^ClientId=.*/ClientId=${EOS_CLIENT_ID}/" \
  -e "s/^ClientSecret=.*/ClientSecret=${EOS_CLIENT_SECRET}/" \
  "${EOS_INI}"
rm -f "${EOS_INI}.bak"

echo "✅ credenciais EOS reais injetadas em ${EOS_INI} (ProductId=${EOS_PRODUCT_ID}, SandboxId=${EOS_SANDBOX_ID}, DeploymentId=${EOS_DEPLOYMENT_ID})"
bash "${BASH_SOURCE[0]}" --check
