# CI e deploy automático em Render Staging

## Fluxo

O workflow `ci.yml` inicia em pushes para `feat/**` e executa o `PR Validation Gate`, que bloqueia se qualquer validação requerida falhar. Um workflow separado, `deploy-feature-staging.yml`, escuta a conclusão do workflow `CI` e só prossegue para pushes bem-sucedidos de `main` ou `feat/**` do próprio repositório. Eventos de pull request, forks, falhas e branches fora dessa lista não implantam.

O deploy fica separado do CI para que um workflow executado a partir de uma branch de feature não receba o segredo do Render. O workflow pós-CI vem da branch padrão, não faz checkout da feature nem baixa artifacts. Antes de usar o hook, confirma que o run veio do ID/path canônico de `.github/workflows/ci.yml` e que o arquivo CI no commit de origem é idêntico ao da branch padrão. Se a definição mudou, o deploy falha fechado; sincronize/rebase a feature branch após atualizar a CI.

O hook envia `ref=<SHA completo aprovado>` ao Render. Depois, o job consulta `/healthz.json` e só conclui com sucesso quando o serviço declara `status: ok` e exatamente o mesmo commit. Os deploys de `main` e `feat/**` compartilham o grupo `render-shared-staging`, sem cancelar uma implantação em andamento; o GitHub mantém no máximo 100 execuções pendentes por grupo.

## Configuração obrigatória antes de ativar

1. No environment **`staging`**, criar `RENDER_DEPLOY_HOOK_URL` como **environment secret**, não como secret de repositório. Se existir uma cópia em escopo de repositório/organização, removê-la e rotacionar o hook após migrar, para que um workflow de feature não possa lê-la diretamente.
2. Restringir o deployment branch policy do environment `staging` à branch padrão (`main`). O evento `workflow_run` executa o workflow privilegiado no contexto da branch padrão, portanto essa restrição protege o secret sem impedir que um run aprovado tenha sido originado em `feat/**`.
3. Definir `RENDER_DEPLOY_ENABLED=true` como variável do repositório (é avaliada no `if` do job) e manter `RENDER_SERVICE_URL` como variável de Actions com a origem HTTPS pública. O job falha se o hook ou a URL pública estiver ausente/inválida.
4. No Render, confirmar que o serviço conectado contém o SHA da branch enviada. O uso de `ref` fixa o commit testado e desativa o Auto-Deploy do Render; o workflow do GitHub passa a ser a autoridade de deploy para `main` e `feat/**`.
5. Mesclar estes workflows na branch padrão antes de esperar deploys feature: `workflow_run` só é acionado para um workflow definido na branch padrão. Depois, sincronizar as branches `feat/**` com `main` para que a cópia de `ci.yml` coincida.

## Validação

O arquivo `tools/ci-workflow-local-check.html` permite selecionar os dois YAMLs e verificar contratos estáticos no navegador, sem upload. Ele não substitui um parser completo de Actions nem executa chamadas de rede. Validar também com `actionlint` e, após publicar o PR, observar o GitHub Actions. O health check ao vivo do Render é a validação final do SHA implantado.

A validação local desta alteração passou: parse YAML com Prettier, 11/11 contratos do HTML, `bash -n` nos três scripts do job, `npm run check`, `npm run test:ue5:logic` e `npm run verify:all`. `actionlint` não estava instalado neste ambiente.

## Estado observado do repositório

O environment `staging` existe, mas a leitura atual do GitHub mostrou `protection_rules: []` e `deployment_branch_policy: null`. A sessão não teve permissão para inspecionar valores de secrets/variables; portanto, a presença e o escopo atuais do hook não foram confirmados. O deploy real não foi iniciado.
