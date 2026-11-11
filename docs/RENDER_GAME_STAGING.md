# Game Runtime staging no Render (despacho MP-ZEX sem VPS)

> Fecha o pré-requisito do despacho único MP-ZEX 08+09
> (`docs/MPZEX_STAGING_DISPATCH.md`): um servidor autoritativo real
> (`/auth/login`, `/ws`) acessível por HTTPS com host rotulado `staging`.

## Por que Render

A VPS de staging (143.95.213.237:22022) aceita apenas `publickey` e a chave
privada correspondente não está acessível à estação operacional — ver
`docs/VPS_BRIDGE_RUNBOOK.md`. O Render já hospeda a API economy
(`khaaos-run-staging`), e o mesmo owner/repo pode hospedar o game-runtime como
**Web Service Docker** separado, sem tocar no staging existente.

## Workflow `render-game-runtime-staging.yml`

`workflow_dispatch` + `environment: staging` (consome `API_KEY_RENDER` e os
`KR_STAGING_*`). Um comando:

1. Localiza ou cria o serviço `khaaos-run-game-staging` (Docker,
   `dockerfilePath: game-runtime/Dockerfile`, contexto = raiz do repo,
   health check `/healthz`, autoDeploy **off**).
2. Gera `KR_USERS_JSON` **localmente no runner** com `hashPassword` de
   `game-runtime/server/auth.js` — as senhas plaintext vivem apenas nos
   secrets `KR_STAGING_TEST_PASSWORD_*` (PB-07); o Render recebe somente
   hash.
3. Dispara o deploy pela API e aguarda `live`.
4. Healthcheck público em `https://khaaos-run-game-staging.onrender.com/healthz`.

## Fluxo completo até o despacho

```bash
# 1. Actions → "Game Runtime — staging no Render" → Run
# 2. Atualizar KR_STAGING_BASE_URL no environment staging para a URL impressa
# 3. Actions → "MP-ZEX 08+09 — Despacho único em staging" → Run (scenarios: 08,09)
```

## Notas

- O host do serviço contém `staging` — passa a rotulagem do
  `mpzex-staging-env.mjs` sem `KR_STAGING_ALLOW_CUSTOM_HOST`.
- Plano Free do Render pode dormir por inatividade; o despacho MP-ZEX acorda
  o serviço na primeira requisição (login A/B) — o `REQUEST_TIMEOUT_MS` dos
  cenários tolera o spin-up de ~30 s.
- PostgreSQL/Redis **não** são obrigatórios no game-runtime (stores em
  memória por padrão) — staging de despacho é isolado e efêmero por design.
- Revogação: remover o serviço no dashboard Render e os envs gerados.
