# Notificações de falha do CI

O workflow `.github/workflows/ci.yml` contém um job `notify-failure` que tenta notificar Discord e Slack quando qualquer job principal de validação ou deploy falha. Cada destino é opcional: somente os webhooks cujos secrets estiverem disponíveis recebem mensagem.

## Secrets de Actions necessários

No GitHub, abra `Nexus-HUB57/Khaaos_Run` → **Settings → Secrets and variables → Actions → New repository secret** e cadastre um ou ambos:

| Nome | Valor esperado |
|---|---|
| `DISCORD_WEBHOOK_URL` | URL de webhook de um canal Discord autorizado |
| `SLACK_WEBHOOK_URL` | URL de Incoming Webhook do workspace/canal Slack autorizado |

As URLs não devem ser colocadas no repositório, em issues ou em mensagens de chat. O workflow passa os valores ao processo por variáveis de ambiente e não os imprime. Se não houver secret para um destino, a etapa correspondente registra que foi ignorada. A pipeline continua exibindo a falha no GitHub.

## Limite de verificação

Durante a manutenção desta integração, a API GitHub usada pela sessão retornou `403 Resource not accessible by integration` ao consultar nomes de Actions secrets. Portanto, não foi possível confirmar se os dois secrets existem. Nenhum valor foi lido ou cadastrado nesta execução. Um administrador do repositório precisa conferir a tela de Actions secrets.

O job de alerta usa `curl` e payload JSON (`content` para Discord e `text` para Slack). Se o endpoint configurado rejeitar a mensagem, o job de notificação também falha; a falha que acionou o alerta continua visível nos jobs originais.
