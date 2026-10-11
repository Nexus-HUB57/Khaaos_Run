# Notificações de falha do CI

O workflow `.github/workflows/ci.yml` tenta notificar Discord e/ou Slack quando o job `verify` falha. É possível configurar um canal ou ambos; o job envia apenas para os webhooks cujos secrets estiverem configurados.

## Configurar destinos

No GitHub, abra `Nexus-HUB57/Khaaos_Run` → **Settings → Secrets and variables → Actions → New repository secret** e configure um ou os dois:

| Nome do secret | Valor esperado |
|---|---|
| `DISCORD_WEBHOOK_URL` | URL do webhook de um canal Discord autorizado |
| `SLACK_WEBHOOK_URL` | URL de Incoming Webhook do workspace/canal Slack autorizado |

Não coloque as URLs dos webhooks em arquivos do repositório, commits, issues ou logs. O workflow não imprime os valores dos secrets. Se nenhum estiver cadastrado, a pipeline continua reportando sua própria falha no GitHub, mas não há destino externo para a notificação.

## Comportamento

- O envio ocorre em job separado somente após falha do job `verify`.
- Mensagem inclui repositório, branch, SHA abreviado e link da execução.
- Se os dois secrets forem configurados, ambos os canais recebem alerta.
- Falhas no endpoint do webhook deixam o job de notificação vermelho também; a falha original permanece registrada no job de verificação.

A execução do CI usa permissões mínimas de leitura no conteúdo do repositório.
