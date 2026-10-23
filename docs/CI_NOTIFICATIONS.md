# Notificações de falha do CI

O workflow `.github/workflows/ci.yml` contém um job `notify-failure` que tenta notificar Discord e Slack quando qualquer job principal de validação ou deploy falha. Cada destino é opcional: somente os webhooks cujos secrets estiverem disponíveis recebem mensagem.

## Secrets de Actions necessários

No GitHub, abra `Nexus-HUB57/Khaaos_Run` → **Settings → Secrets and variables → Actions → New repository secret** e cadastre um ou ambos:

| Nome | Valor esperado |
|---|---|
| `DISCORD_WEBHOOK_URL` | URL de webhook de um canal Discord autorizado |
| `SLACK_WEBHOOK_URL` | URL de Incoming Webhook do workspace/canal Slack autorizado |

As URLs não devem ser colocadas no repositório, em issues ou em mensagens de chat. O workflow passa os valores ao processo por variáveis de ambiente e não os imprime. Se não houver secret para um destino, a etapa correspondente registra que foi ignorada. As notificações são auxiliares: falha de entrega gera warning e não mascara os resultados dos jobs principais; a tentativa Slack continua mesmo se Discord falhar.

## Limite de verificação

O log do workflow mostrou que `DISCORD_WEBHOOK_URL` foi injetado como secret mascarado, sem revelar nem ler seu valor. Na execução `39449716200`, a chamada retornou HTTP 405. O workflow agora informa apenas o status HTTP e continua ao Slack, sem imprimir URL ou corpo da resposta. Um administrador deve conferir **Settings → Secrets and variables → Actions** e garantir que `DISCORD_WEBHOOK_URL` contém a URL canônica de um webhook de canal Discord (endpoint Discord que aceita POST), e não URL de outro serviço, a página de configuração ou endpoint de leitura. Se necessário, criar um webhook novo no Discord e substituir o secret diretamente no GitHub; nunca compartilhe o valor.

O job de alerta usa POST JSON (`content` para Discord e `text` para Slack). Somente status HTTP 2xx é registrado como entrega aceita; 405 indica endpoint incompatível com POST e aparece como warning, sem transformar o job de alerta em uma falha adicional. Isso mantém a CI independente da disponibilidade do serviço de chat, mas não significa que a mensagem Discord foi entregue: a URL secreta precisa ser corrigida para reativar a entrega.

### Estado da verificação — 23/10/2026

A execução CI `40002127380` repetiu Discord HTTP 405 e também recebeu Slack HTTP 302; nenhum destino confirmou entrega 2xx. O 302 do Slack sugere URL que redireciona (por exemplo, página web em vez de Incoming Webhook); a etapa usa POST e não segue redirecionamentos automaticamente.

A consulta atual da GitHub CLI a repository Actions secrets foi recusada com HTTP 403 (`Resource not accessible by integration`). Não foi possível confirmar os nomes dos secrets nem criar/substituir valores; os valores nunca são legíveis por esse fluxo. Um administrador deve validar/substituir `DISCORD_WEBHOOK_URL` e `SLACK_WEBHOOK_URL` diretamente em **Settings → Secrets and variables → Actions** e confirmar respostas 2xx em execução de teste. Até então, ambos devem ser tratados como sem entrega verificada. Nunca compartilhe os valores em chat ou repositório.
