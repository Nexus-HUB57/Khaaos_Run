#!/usr/bin/env bash
# =============================================================================
# Khaaos Run — Secrets de STAGING no GitHub Environment "staging".
# =============================================================================
# Automatiza a configuração exigida pelo despacho único MP-ZEX 08+09
# (.github/workflows/mp-zex-staging.yml): cria o environment "staging" (se não
# existir) e grava os 5 secrets KR_STAGING_*. Senhas podem ser geradas aqui
# (openssl) — valores nunca aparecem em log.
#
# USO (máquina administrativa com gh autenticado):
#   export REPO=Nexus-HUB57/Khaaos_Run
#   export KR_STAGING_BASE_URL=https://staging.sua-infra.example   # HTTPS + host com stage/staging
#   # senhas (opcional — geradas se ausentes):
#   export KR_STAGING_TEST_PASSWORD_A=… KR_STAGING_TEST_PASSWORD_B=…
#   # usuários (default: kr_zex_a / kr_zex_b):
#   export KR_STAGING_TEST_USER_A=kr_zex_a KR_STAGING_TEST_USER_B=kr_zex_b
#   bash scripts/staging/setup_staging_secrets.sh
#
# APÓS o script (uma vez): provisione as duas contas no PRÓPRIO staging
# (KR_USERS_JSON no .env do compose + restart, docs/MPZEX_STAGING_DISPATCH.md
# §provisionamento). Se o domínio não contiver "stage"/"staging", confirme o
# destino e defina a variável NÃO secreta KR_STAGING_ALLOW_CUSTOM_HOST=true
# no environment/repositório — isto é decisão humana consciente.
# =============================================================================
set -euo pipefail

REPO="${REPO:-Nexus-HUB57/Khaaos_Run}"

command -v gh >/dev/null 2>&1 || { echo "ERRO: gh CLI ausente"; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "ERRO: openssl ausente"; exit 1; }

if [[ -z "${KR_STAGING_BASE_URL:-}" ]]; then
  echo "ERRO: KR_STAGING_BASE_URL ausente (ex.: export KR_STAGING_BASE_URL=https://staging.example)"
  exit 1
fi

url_scheme="$(printf '%s' "$KR_STAGING_BASE_URL" | sed -E 's#^([a-z]+)://.*#\1#')"
case "$url_scheme" in
  https) : ;;
  *) echo "ERRO: KR_STAGING_BASE_URL deve ser HTTPS (obtido: ${url_scheme})"; exit 1 ;;
esac

host="$(printf '%s' "$KR_STAGING_BASE_URL" | sed -E 's#^[a-z]+://([^/:]+).*#\1#')"
if ! printf '%s' "$host" | grep -qiE '(^|[.-])(stage|staging)([.-]|$)'; then
  echo "AVISO: host '$host' não identifica staging; o job exigirá KR_STAGING_ALLOW_CUSTOM_HOST=true (variável NÃO secreta, decisão humana)."
fi

KR_STAGING_TEST_USER_A="${KR_STAGING_TEST_USER_A:-kr_zex_a}"
KR_STAGING_TEST_USER_B="${KR_STAGING_TEST_USER_B:-kr_zex_b}"
if [[ "$KR_STAGING_TEST_USER_A" == "$KR_STAGING_TEST_USER_B" ]]; then
  echo "ERRO: as duas contas de teste precisam ser distintas."
  exit 1
fi
if [[ -z "${KR_STAGING_TEST_PASSWORD_A:-}" ]]; then
  KR_STAGING_TEST_PASSWORD_A="$(openssl rand -hex 16)"
  echo "KR_STAGING_TEST_PASSWORD_A gerado (openssl rand -hex 16) — guarde no gerenciador de senhas."
fi
if [[ -z "${KR_STAGING_TEST_PASSWORD_B:-}" ]]; then
  KR_STAGING_TEST_PASSWORD_B="$(openssl rand -hex 16)"
  echo "KR_STAGING_TEST_PASSWORD_B gerado (openssl rand -hex 16) — guarde no gerenciador de senhas."
fi

# Environment "staging" (idempotente; 204/200 esperados)
gh api -X PUT "repos/${REPO}/environments/staging" >/dev/null \
  || { echo "ERRO: não consegui criar/ler o environment 'staging' (PAT sem Administração de repo?)."; exit 1; }
echo "Environment 'staging' garantido."

set_env_secret() { # nome ← stdin
  local name="$1"
  gh secret set "$name" --env staging --repo "$REPO" --body "$(cat)"
}

printf '%s' "$KR_STAGING_BASE_URL"      | set_env_secret KR_STAGING_BASE_URL
printf '%s' "$KR_STAGING_TEST_USER_A"   | set_env_secret KR_STAGING_TEST_USER_A
printf '%s' "$KR_STAGING_TEST_PASSWORD_A" | set_env_secret KR_STAGING_TEST_PASSWORD_A
printf '%s' "$KR_STAGING_TEST_USER_B"   | set_env_secret KR_STAGING_TEST_USER_B
printf '%s' "$KR_STAGING_TEST_PASSWORD_B" | set_env_secret KR_STAGING_TEST_PASSWORD_B

echo "Verificação (apenas nomes):"
names="$(gh secret list --env staging --repo "$REPO" --json name --jq '.[].name' 2>/dev/null || gh secret list --env staging --repo "$REPO" | awk '{print $1}')"
missing=0
for name in KR_STAGING_BASE_URL KR_STAGING_TEST_USER_A KR_STAGING_TEST_PASSWORD_A KR_STAGING_TEST_USER_B KR_STAGING_TEST_PASSWORD_B; do
  if grep -qx "$name" <<<"$names"; then
    echo "  ✔ $name"
  else
    echo "  ✘ $name (ausente)"
    missing=1
  fi
done
(( missing == 0 )) || { echo "ERRO: nem todos os secrets de staging foram gravados."; exit 1; }

cat <<'EOF'

Próximos passos:
  1. Provisionar as duas contas no staging real (KR_USERS_JSON + restart; ver
     docs/MPZEX_STAGING_DISPATCH.md §Provisionamento das contas).
  2. (Só para domínio sem rótulo staging) confirmar destino e definir
     KR_STAGING_ALLOW_CUSTOM_HOST=true no environment.
  3. Despachar: Actions → "MP-ZEX 08+09 — Despacho único em staging" → Run.
Auditoria geral: GH_TOKEN=… node scripts/eos/p0_gate.mjs
EOF
echo "STAGING_SECRETS_SETUP_OK"
