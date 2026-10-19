# API do Painel de Controle do Marechal

**Status: rotas HTTP ativas no backend.** Implementação em `server/game/marshalConsole.ts`, montada em `server/routes.ts`; o domínio do conselho está em `server/game/orchestration.ts`. A API é consultiva: não altera partida, saldo KRC, inventário, alianças ou publica mensagens externas. Não envie segredos, dados pessoais ou comandos de shell.

## 1. Contrato de segurança

- Prefixo: `/api/console/v1`.
- Transporte: HTTPS em produção; JSON UTF-8; limite sugerido de corpo: 16 KiB.
- Autenticação: sessão OIDC já autenticada, cookie `httpOnly` e proteção CSRF nas operações `POST`; nunca confiar em `actorId`, `role` ou `agentId` do corpo para autenticar/autorizar.
- Autorização: deny-by-default, sessão OIDC e allowlist de IDs OIDC em `MARSHAL_CONSOLE_OPERATOR_IDS`; identidade nunca vem do payload.
- Proteção CSRF no `POST`: `Origin` obrigatório e igual à origem efetiva do serviço; solicitações `Sec-Fetch-Site: cross-site` são negadas.
- Idempotência: `Idempotency-Key` UUID obrigatório; a mesma chave e mesmo corpo retorna o mesmo recurso, chave igual com corpo diferente retorna `409 IDEMPOTENCY_KEY_REUSED`.
- Limite: 10 novos conselhos/minuto por ator; corpo máximo 16 KiB; no máximo 1.000 registros ativos no processo.
- Agentes respondem com leituras e propostas. Nenhum endpoint executa mutação de partida, transação KRC, publicação externa ou operação irreversível.
- Toda proposta de mudança fica pendente de decisão humana em fluxo futuro separado, autenticado, auditado e com revisão de estado. A API v1 **não define endpoint de aprovação**.

## 2. Endpoints planejados

| Método e caminho | Finalidade | Efeito esperado |
|---|---|---|
| `GET /api/console/v1/marshal/overview?worldId=W2` | catálogo do mundo e estado operacional agregado | leitura; campos sem fonte instrumentada retornam `null` e `stale: true` |
| `POST /api/console/v1/marshal/councils` | solicitar conselho assíncrono da Classe Especial | cria execução consultiva; sem mutação de jogo |
| `GET /api/console/v1/marshal/councils/{requestId}` | consultar estado e resultado da deliberação | leitura |
| `GET /api/console/v1/marshal/proposals/{proposalId}` | obter detalhes/auditoria de uma proposta | leitura |

O endpoint de criação retorna `202 Accepted` com `status: running`; o cliente consulta o recurso pelo caminho em `Location`. Quando o conselho concluir, GET retorna `200` com `status: complete`, `partial` ou `failed`. Não há WebSocket/event stream dedicado.

## 3. Solicitar um conselho

```http
POST /api/console/v1/marshal/councils HTTP/1.1
Content-Type: application/json
Idempotency-Key: 4ef6c9c0-4b5f-4c6b-a143-c81a432a3210
Origin: https://game.example.com
Cookie: <sessao-autenticada>
```

```json
{
  "subject": "ajuste-de-janela-de-entrada-W2",
  "scope": { "worldId": "W2", "periodSeconds": 3600 },
  "context": {
    "occupancyPct": 82,
    "queueP95Seconds": 94,
    "marketVolatilityPct": 48,
    "configRevision": "world-config-12"
  }
}
```

`actorId` é obtido da sessão no servidor e não deve ser enviado pelo painel. `context` aceita apenas `occupancyPct` (0–100), `queueP95Seconds` (0–3600), `activeIncidents` (0–100), `marketVolatilityPct` (0–1000), `marketDataStale`, `activeTreatyConflict` e `configRevision` (até 80 caracteres). Dados extras, pessoais ou acima dos limites são rejeitados. **Esses campos são sinais agregados informados pelo operador, não telemetria autoritativa;** as respostas ficam identificadas como consultivas e não são executáveis.

Resposta inicial:

```http
HTTP/1.1 202 Accepted
Location: /api/console/v1/marshal/councils/a19623d4-2d6c-4d00-a0e5-c4d8e9ab0914
Retry-After: 1
```

```json
{
  "requestId": "a19623d4-2d6c-4d00-a0e5-c4d8e9ab0914",
  "status": "running",
  "createdAt": "2026-10-14T21:20:00Z",
  "correlationId": "corr_20261014_001",
  "links": { "self": "/api/console/v1/marshal/councils/a19623d4-2d6c-4d00-a0e5-c4d8e9ab0914" }
}
```

## 4. Consultar resultado do conselho

```http
GET /api/console/v1/marshal/councils/a19623d4-2d6c-4d00-a0e5-c4d8e9ab0914 HTTP/1.1
Cookie: <sessao-autenticada>
```

```json
{
  "requestId": "a19623d4-2d6c-4d00-a0e5-c4d8e9ab0914",
  "status": "complete",
  "roundsCompleted": 2,
  "scope": { "worldId": "W2" },
  "agents": [
    { "agentId": "marshal-henricks", "name": "Henricks Hunterheads III", "domain": "operations", "position": "support", "confidence": 0.65, "rationale": "Sinais recebidos dentro dos limites configurados; recomendação consultiva." },
    { "agentId": "king-krapulla", "name": "King Krapulla", "domain": "economy", "position": "hold", "confidence": 0.65, "rationale": "Sinal de mercado desatualizado ou volátil; não recomendar ajuste sem revisão." },
    { "agentId": "ambassador-uryan", "name": "Uryan Horks", "domain": "diplomacy", "position": "support", "confidence": 0.65, "rationale": "Sinais recebidos dentro dos limites configurados; recomendação consultiva." }
  ],
  "governance": [
    {
      "subject": "ajuste-de-janela-de-entrada-W2",
      "status": "preferred-proposal",
      "preferredAgent": "marshal-henricks",
      "reasonCode": "PRECEDENCE_SELECTED_PROPOSAL_ONLY",
      "executable": false
    }
  ],
  "failedAgents": [],
  "reasonCodes": [],
  "proposalIds": ["prop_8c1b7a90-5c5e-4a19-b3bd-ff1a3dced424"],
  "correlationId": "corr_20261014_001",
  "dataRevision": "world-config-12"
}
```

O `preferredAgent` identifica apenas a recomendação a ser considerada; não equivale a aprovação, comando ou mudança efetivada. Se a deliberação estiver `partial`, se houver veto de segurança/integridade ou se posições de prioridade equivalente divergirem, o painel deve exibir bloqueio/revisão humana e não oferecer execução automática.

## 5. Consultar visão agregada

```http
GET /api/console/v1/marshal/overview?worldId=W2 HTTP/1.1
Cookie: <sessao-autenticada>
```

```json
{
  "worldId": "W2",
  "name": "Priadus",
  "operationalState": "unknown",
  "occupancy": { "current": null, "capacity": 75, "percent": null },
  "queueP95Seconds": null,
  "activeIncidents": null,
  "configRevision": "world-catalog-v1",
  "observedAt": "2026-10-14T21:19:58Z",
  "stale": true
}
```

Resposta de catálogo limitada ao escopo autorizado. A API ainda não recebe telemetria por mundo do `RoomManager`; estado/ocupação/fila/incidentes permanecem `null`, com `stale: true`. A capacidade vem do catálogo documentado e não indica que o mundo esteja ativo.

## 6. Política de governança e resolução

Precedência fixa de política (não por senioridade, confiança ou ordem de chegada):

1. **Segurança** — qualquer posição `hold` ou `oppose` gera `safety-veto`.
2. **Integridade competitiva** — `hold`/`oppose` gera `integrity-veto`.
3. **Operações** — pode priorizar uma proposta operacional contra recomendação econômica/diplomática divergente, mas só como `preferred-proposal`.
4. **Economia de jogo** — recomendações informativas ou proposta; nenhuma escrita no ledger/conta.
5. **Diplomacia** — recomendações narrativas; nenhuma aliança/mensagem externa é publicada.

Se as recomendações de maior prioridade discordarem, devolver `escalated-human-review`. Falha de agente produz `partial` e bloqueia qualquer aprovação. Todos os resultados indicam `executable: false`. A política de autorização do ator humano continua independente e é aplicada pelo servidor.

## 7. Erros e respostas HTTP

Formato uniforme:

```json
{
  "error": { "code": "INVALID_WORLD_SCOPE", "message": "Escopo de mundo inválido.", "details": [] },
  "correlationId": "corr_20261014_002"
}
```

| HTTP | Código | Condição |
|---:|---|---|
| 400 | `INVALID_REQUEST` | JSON/schemas/campos inválidos |
| 401 | `AUTHENTICATION_REQUIRED` | sessão ausente/inválida; middleware OIDC atual responde `{ "message": "Unauthorized" }` |
| 403 | `INSUFFICIENT_SCOPE` | usuário autenticado sem escopo de console/mundo |
| 404 | `RESOURCE_NOT_FOUND` | council/proposal inexistente ou fora do escopo |
| 409 | `IDEMPOTENCY_KEY_REUSED` | chave de idempotência repetida com conteúdo diferente |
| 413 | `PAYLOAD_TOO_LARGE` | corpo maior que limite |
| 429 | `RATE_LIMITED` | limite por usuário excedido |
| 503 | `COUNCIL_UNAVAILABLE` | serviço indisponível; repetir com a mesma chave |

## 8. Estado operacional e retenção

- Conselhos, chaves de idempotência e propostas ficam em memória do processo por até 24 h; não são gravados no PostgreSQL e não alteram perfis/carteiras. Reinício do serviço remove esses registros; réplicas distintas não compartilham idempotência/estado. Use uma única instância para esse recurso até a futura adoção de um repositório compartilhado.
- O buffer aceita até 1.000 conselhos ativos; ao atingir o limite retorna `503 COUNCIL_UNAVAILABLE`.
- `GET overview` descreve o catálogo, não telemetria ao vivo; integrar métricas do runtime requer associação explícita e revisada entre `roomId` e `worldId`.
- Os adapters iniciais são determinísticos e locais (não chamam LLM nem serviço externo); avaliam apenas os sinais agregados permitidos no corpo. Erros/timeout dos adapters retornam resultado `partial` e exigem revisão humana.
- Para habilitar operadores no deploy, definir `MARSHAL_CONSOLE_OPERATOR_IDS` como lista separada por vírgula de subjects OIDC confiáveis. Valor ausente/vazio mantém todas as rotas privadas em 403 após autenticação. Render declara a variável como configuração externa (`sync: false`); não foi alterado nenhum valor de produção.

## 9. Cobertura

- Testes HTTP: sem sessão, operador fora da allowlist, origem CSRF inválida, payload inválido, overview, conselho, idempotência, owner-scope e acesso à proposta.
- Testes assíncronos: erro `ECONNRESET`, análise/revisão incompletas, timeout nas duas fases e falha fechada.
- Nenhuma resposta autoriza escrita de jogo ou de carteira.

## 10. Interface web do operador

- A interface autenticada fica em `/marshal-console`; o link aparece no menu somente quando a leitura de overview confirma a allowlist. A rota HTTP continua sendo a autoridade de acesso, inclusive para navegação direta.
- A página permite selecionar um mundo, revisar o catálogo, enviar sinais agregados opcionais, solicitar um conselho, acompanhar o processamento e consultar os detalhes das propostas.
- A visão operacional deve ser apresentada como catálogo desatualizado até a integração explícita com telemetria do runtime. A página identifica os adapters como determinísticos e locais, não como agentes LLM.
- A interface não contém ação de aprovação, execução, deploy ou mutação de jogo. Propostas permanecem consultivas e exigem um fluxo humano separado.
