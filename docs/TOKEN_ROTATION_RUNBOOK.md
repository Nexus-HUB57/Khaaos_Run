# Khaaos Run — Runbook de Rotação de Token GitHub (P0)

> **Contexto**: um Personal Access Token (PAT) clássico da conta
> `Nexus-HUB57` foi compartilhado em texto plano (chat + arquivo anexado) na
> sessão de 2026-10-28. Tokens expostos são varridos por bots em minutos —
> a rotação é OBRIGATÓRIA e imediata.

## 1. Revogar o token comprometido (< 15 min) — MANUAL, sem API

GitHub **não expõe endpoint público** para criar/revogar PATs clássicos
(à prova de roubo de conta por API). Executar como dono da conta:

1. Acessar `https://github.com/settings/tokens` (Settings → Developer
   settings → **Personal access tokens → Tokens (classic)**).
2. Localizar o token comprometido (o mais recente com escopo `repo`; ver
   chat/anexo da sessão — **não reproduzir o valor em documento**).
3. **Delete** imediatamente. Isso invalida TODAS as sessões que o usam.
4. Repetir para qualquer token com escopo `repo` sem data de expiração
   (higiene: nenhum token clássico deve viver > 90 dias).

## 2. Emitir substituto com escopo mínimo

Preferir **fine-grained PAT** (Settings → Developer settings → Fine-grained
tokens) ao clássico:

| Propriedade | Valor recomendado |
|---|---|
| Resource owner | `Nexus-HUB57` |
| Repository access | Only selected repositories → `Khaaos_Run` |
| Permissions | `Contents: Read and write` (push/PR), `Actions: Read` (ver CI), `Pull requests: Read and write` |
| Expiration | ≤ 30 dias (com lembrete de renovação) |

NÃO conceder: `admin:*`, `delete_repo`, `workflow` (a menos que necessário
para editar workflows via API — se necessário, limitar a 7 dias).

## 3. Distribuir o novo token (sem re-exposição)

1. **Nunca** colar em chat/arquivo/anexos. Entregar via canal seguro
   (gerenciador de senhas da equipe).
2. Máquina local: `gh auth login` (colar interativamente) ou
   `git config credential.helper store` no primeiro push.
3. CI/CD: se algum workflow precisa do PAT (ex.: disparo cross-repo),
   `gh secret set GH_PAT --repo Nexus-HUB57/Khaaos_Run` — o valor fica
   cifrado e invisível nos logs. Inventário atual de secrets do repo:
   `API_KEY_RENDER`, `SERVICE_ID_RENDER`, `DISCORD_WEBHOOK_URL`,
   `SLACK_WEBHOOK_URL`, `SERVIDOR_DISCORD`, `SUPORT_DISCORD` — nenhum deles
   é o PAT; manter assim.
4. Auditoria de uso do token revogado:
   `https://github.com/Nexus-HUB57/Khaaos_Run/security` → Security log →
   revisar acessos incomuns nas últimas 24 h.

## 4. Verificação pós-rotação

```bash
# O token antigo deve retornar 401 (usar o valor SEM colar aqui:
# export OLD_TOKEN='<token-comprometido>' e referenciar a variável)
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $OLD_TOKEN" \
  https://api.github.com/user   # esperado: 401

# O novo token deve autenticar com o escopo esperado
gh auth status
gh api repos/Nexus-HUB57/Khaaos_Run --jq .full_name
```

## 5. Prevenção (pipeline de segredos)

- Push protection já ativo no GitHub? Verificar
  `https://github.com/Nexus-HUB57/Khaaos_Run/settings/security_analysis`
  e ativar **Secret scanning + push protection**.
- O `10 — Security Scan` (Trivy/Gitleaks) já roda no CI; manter o gate
  bloqueante para `ghp_`, `sk_`, `AKIA` e similares.
- Regra de ouro da equipe: segredo que passou por chat está COMPROMETIDO —
  rotação imediata, sem exceção (PB-07 em `docs/SRE_PLAYBOOKS.md`).
