# Deploy para Render após CI

## Fluxo automático

O workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) executa `npm run verify:all` em pushes para `main` e pull requests. O job `deploy` depende de `verify`, só roda para `push` em `refs/heads/main` e quando a Actions variable `RENDER_DEPLOY_ENABLED` é exatamente `true`. Ele solicita ao Render o SHA exato de `github.sha` e aguarda até `/healthz.json` anunciar o mesmo commit. Uma falha de teste, trigger ou health check deixa a execução vermelha. Deploys de staging são serializados para evitar concorrência.

O Blueprint [`render.yaml`](../render.yaml) liga o Web Service de staging à branch `main`, compila com `npm ci --include=dev --no-audit --no-fund && npm run build` e `node scripts/write-render-health.mjs`, inicia com `npm start`, configura `/healthz.json` e desativa deploy automático por push. A inclusão de devDependencies é necessária porque o build usa `tsx`. O script de build grava o arquivo estático com o `RENDER_GIT_COMMIT` fornecido pelo Render. Essa desativação é intencional: o GitHub Actions é o único gatilho de publicação, e o teste deve terminar antes de o Render receber uma solicitação.

## Configuração inicial no Render

1. O serviço `khaaos-run-staging` está no plano Free e região Oregon. O PostgreSQL `khaaos-run-staging-db` também foi criado em Oregon no plano Free; ele expira em 10 de novembro de 2026, tem limite de 1 GB e não oferece backups ([limites oficiais do Free Postgres](https://render.com/docs/free)). Use-o apenas para validação temporária de staging, nunca para dados reais de jogadores. Não crie um segundo Web Service ou banco por engano.
2. No PostgreSQL, copie a **Internal Database URL** e defina-a como `DATABASE_URL` no ambiente do Web Service `khaaos-run-staging`. Os dois recursos estão na mesma região; prefira a URL interna e não cole credenciais em chat, issue, log ou arquivo versionado. Configure também `SESSION_SECRET`, `WS_TOKEN_SECRET`, `REPL_ID` e `ZONE_OPERATOR_IDS`. `SESSION_SECRET` e `WS_TOKEN_SECRET` devem ser aleatórios, fortes e independentes, com pelo menos 32 bytes.
3. O schema inicial está em migrations versionadas. O CI aplica-as a um PostgreSQL efêmero vazio. Para aplicar manualmente ao staging, confirme primeiro que `DATABASE_URL` aponta ao banco correto, defina `RUN_DB_MIGRATIONS=true` e faça um deploy controlado; `scripts/start.mjs` executará `npm run db:migrate` antes do app. Depois que os logs confirmarem sucesso, volte `RUN_DB_MIGRATIONS` para `false`. Não use `db:push` nem deixe o opt-in ativo em deploys regulares. Como o banco Free não tem backup, não armazene nele dados que precisem ser preservados.
4. Abra **Settings** do Web Service → **Deploy Hook** e gere um hook. Trate a URL como credencial capaz de iniciar deploys; não cole em issue, chat, log ou arquivo versionado.
5. No GitHub do repositório, em **Settings → Secrets and variables → Actions**, adicione o secret `RENDER_DEPLOY_HOOK_URL` com a URL inteira do Deploy Hook.
6. Na seção **Variables** do mesmo local, adicione `RENDER_SERVICE_URL` com a origem pública do serviço, por exemplo `https://<seu-servico>.onrender.com` (sem `/` final). O workflow usa essa URL só para polling público de `/healthz.json`.
7. Mantenha a variável `RENDER_DEPLOY_ENABLED` ausente ou diferente de `true` até o banco, as variáveis de runtime e o Deploy Hook estarem configurados. Depois de validar staging, defina-a como `true` para ativar deploy a cada push em `main`. A compatibilidade do callback OIDC continua sendo um gate separado e obrigatório antes de liberar produção.
8. Verifique em Render que **Auto-Deploy** está `Off`, e confirme `healthCheckPath: /healthz.json`. Faça um commit de teste em `main` após revisão e observe os jobs Verify → Deploy → health check.

## O que o workflow prova

`GET /healthz.json` serve um arquivo JSON estático com `status: ok` e `commit: RENDER_GIT_COMMIT`. O arquivo é gerado ao final do build, é público e não consulta banco nem altera `server/`; o GitHub Actions compara o campo `commit` com o SHA que acabou de passar pelo CI. Assim, uma resposta saudável da versão antiga não basta para marcar a nova publicação como concluída.

O Deploy Hook responde quando Render aceita/agenda o deploy, não quando a aplicação já está pronta. Por isso, o workflow espera o health check do commit exato. Se um deploy terminar sem ficar saudável em até 30 minutos, o job falha; investigue os logs do Render e faça rollback manual conforme a política do serviço.

## Login OIDC: gate obrigatório antes de produção

O backend atual descobre `https://replit.com/oidc` e monta o callback como `https://<req.hostname>/api/callback`. A documentação de Replit Auth garante suporte para Development e Published Apps (`replit.dev`, `replit.app` e domínios customizados Replit), mas não afirma que um deployment em Render seja suportado. **Não presuma que login Replit funcionará em `onrender.com`.** Veja também a [análise de compatibilidade e plano de verificação](REPLIT_AUTH_RENDER_COMPATIBILITY.md).

Antes de liberar tráfego real em Render, valide com a equipe/configuração do Replit que o `REPL_ID` pode autorizar o callback `https://<host-render>/api/callback` e post-logout URI `https://<host-render>`. Faça o teste de login/callback/logout e cookie Secure atrás do proxy. Se o issuer recusar domínio externo, não contorne validação de redirect: mantenha a produção no Replit ou planeje uma migração explícita para um provedor de identidade compatível, com estratégia de migração/ligação de usuários e testes. O deploy pode compilar e iniciar mesmo quando esse gate de autenticação falha.

## Secrets e credenciais

No **GitHub Actions** ficam o secret `RENDER_DEPLOY_HOOK_URL` e as variables não sigilosas `RENDER_SERVICE_URL` e `RENDER_DEPLOY_ENABLED`. As variáveis da aplicação — em particular `DATABASE_URL`, chaves de sessão/WS e `REPL_ID` — ficam exclusivamente no ambiente Render. Webhook URLs de Discord/Slack são opcionais e só necessárias se a notificação de falha já configurada for desejada.

## Referências oficiais

- [Deploy Hooks do Render](https://render.com/docs/deploy-hooks)
- [Deploys e auto-deploy do Render](https://render.com/docs/deploys)
- [Blueprint YAML Reference](https://render.com/docs/blueprint-spec)
- [Replit Auth](https://docs.replit.com/features/auth-and-identity/authentication) e [Custom Domains](https://docs.replit.com/features/publishing/custom-domains) do Replit
