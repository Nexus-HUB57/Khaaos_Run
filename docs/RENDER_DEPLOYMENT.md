# Deploy para Render após CI

## Fluxo de CI e deploy

O workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) executa lint, testes unitários e de runtime, migrations sobre um PostgreSQL efêmero e builds em pushes para `main`/`develop` e pull requests.

O workflow [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) publica no staging quando há push em `main` que altera `server/**`, `game-runtime/**`, `infra/**` ou `docker-compose*.yml`, e também aceita execução manual (`workflow_dispatch`). Ele faz sua própria validação/build, chama a API do Render e verifica `/healthz.json`. **Esse workflow não depende do resultado do workflow CI separado.** Para o bootstrap, confira que o CI passou antes de iniciar um deploy manual; não trate o gatilho atual de push como um gate de testes.

O Blueprint [`render.yaml`](../render.yaml) configura o Web Service de staging na branch `main`, plano Free, região Oregon, build `npm ci --include=dev --no-audit --no-fund && npm run build && node scripts/write-render-health.mjs`, start `npm start`, health check `/healthz.json` e Auto-Deploy Off. O script de configuração também alinha o build command e o health check do serviço que já existe; essa alteração de configuração do serviço não inicia um deploy. A mudança de variáveis pode ter efeito de publicação: confirme o estado dos deploys no Render antes de iniciar um segundo.

## Bootstrap do Postgres staging

1. O serviço `khaaos-run-staging` está no plano Free e região Oregon. O PostgreSQL `khaaos-run-staging-db` também está em Oregon no plano Free; expira em 10 de novembro de 2026, tem limite de 1 GB e não oferece backups ([limites oficiais do Free Postgres](https://render.com/docs/free)). Use-o apenas para validação temporária de staging, nunca para dados reais de jogadores. Não crie outro Web Service ou banco por engano.
2. Antes do deploy, confirme no ambiente do serviço se já estão configurados `SESSION_SECRET`, `WS_TOKEN_SECRET`, `REPL_ID` e `ZONE_OPERATOR_IDS`. `SESSION_SECRET` e `WS_TOKEN_SECRET` devem ser aleatórios, fortes, independentes e ter pelo menos 32 bytes. Não envie os valores em mensagens. Se esses segredos ainda não estiverem disponíveis, a migration pode mesmo assim ser aplicada, mas o processo web pode falhar depois e o health check não ficar saudável.
3. No GitHub Actions, execute manualmente **Configure Render Staging Database** na branch `main` e confirme `confirm_staging=true`. O workflow usa o secret `API_KEY_RENDER` para buscar a conexão **interna** do Postgres, alinhar o comando de build para incluir `devDependencies`, definir `/healthz.json` como health check, gravar `DATABASE_URL` no serviço e ativar `RUN_DB_MIGRATIONS=true`. A URL não é exibida nem salva no repositório. Verifique a lista de deploys do Render após a execução; não inicie outro deploy se já houver um em andamento.
4. Depois de confirmar o CI verde e a configuração, aguarde o deploy que possa ter sido iniciado pelas alterações de ambiente. Se nenhum deploy tiver começado, execute manualmente o workflow **Deploy** com `environment=staging`. A inicialização via `scripts/start.mjs` roda `npm run db:migrate` antes do servidor. Confirme nos logs do Render a mensagem de conclusão das migrations e o health check `/healthz.json`. Não use `db:push`.
5. Depois de confirmar a migration, volte `RUN_DB_MIGRATIONS` para `false` no ambiente do serviço, para que deploys normais não reapliquem esse gate temporário. Essa alteração pode iniciar outro deploy; monitore-o e evite iniciar um deploy duplicado. Mantenha o Auto-Deploy do Render em **Off**. Até o workflow de deploy depender explicitamente do resultado do CI separado, prefira o `workflow_dispatch` manual após verificar os testes.

## O que o health check prova

`GET /healthz.json` serve um arquivo JSON estático com `status: ok` e `commit: RENDER_GIT_COMMIT`. O arquivo é gerado ao final do build, é público e não consulta banco nem altera `server/`. Uma resposta HTTP 200 isolada pode corresponder a uma versão anterior; verifique também o campo `commit`.

A resposta do endpoint de deploy do Render confirma que o deploy foi aceito/agendado, não que a aplicação já está pronta. Se um deploy terminar sem ficar saudável, investigue os logs do Render e use rollback manual conforme a política do serviço.

## Login OIDC: gate obrigatório antes de produção

O backend atual descobre `https://replit.com/oidc` e monta o callback como `https://<req.hostname>/api/callback`. A documentação de Replit Auth garante suporte para Development e Published Apps (`replit.dev`, `replit.app` e domínios customizados Replit), mas não afirma que um deployment em Render seja suportado. **Não presuma que login Replit funcionará em `onrender.com`.** Veja também a [análise de compatibilidade e plano de verificação](REPLIT_AUTH_RENDER_COMPATIBILITY.md).

Antes de liberar tráfego real em Render, valide que o `REPL_ID` pode autorizar o callback `https://<host-render>/api/callback` e post-logout URI `https://<host-render>`. Faça o teste de login/callback/logout e cookie Secure atrás do proxy. Se o issuer recusar domínio externo, não contorne a validação de redirect: mantenha a produção no Replit ou planeje uma migração explícita para um provedor compatível, com estratégia de migração/ligação de usuários e testes.

## Secrets e credenciais

O secret `API_KEY_RENDER` do GitHub Actions é usado pelos workflows para chamar a API do Render; o workflow de bootstrap não escreve a chave nem a URL do banco nos logs. `DATABASE_URL`, chaves de sessão/WS e `REPL_ID` ficam no ambiente do Render. O service ID de staging é um identificador público e está fixado no workflow. Webhooks de Discord/Slack são opcionais e só necessários se a notificação de falha configurada for desejada.

## Referências oficiais

- [Render Postgres: criar e conectar](https://render.com/docs/postgresql-creating-connecting)
- [Render API: recuperar conexão do Postgres](https://api-docs.render.com/reference/retrieve-postgres-connection-info)
- [Render API: adicionar ou atualizar variável de ambiente](https://api-docs.render.com/reference/update-env-var)
- [Render API: atualizar configuração do serviço](https://api-docs.render.com/reference/update-service)
- [Render Deploy Hooks](https://render.com/docs/deploy-hooks)
- [Blueprint YAML Reference](https://render.com/docs/blueprint-spec)
- [Replit Auth](https://docs.replit.com/features/auth-and-identity/authentication) e [Custom Domains](https://docs.replit.com/features/publishing/custom-domains) do Replit
