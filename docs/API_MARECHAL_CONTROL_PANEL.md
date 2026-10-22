# API do Painel de Controle do Marechal

**Estado: rotas HTTP ativas.** Implementação em `server/game/marshalConsole.ts`, montada em `server/routes.ts`; repositório PostgreSQL em `server/game/marshalConsoleRepository.ts`; contratos dos agentes em `server/game/orchestration.ts`. A API é consultiva: não altera partida, saldo KRC, inventário, alianças ou publica mensagens externas. Não envie segredos, dados pessoais ou comandos.

## Segurança e governança

- Prefixo: `/api/console/v1/marshal`; HTTPS em produção e JSON UTF-8.
- Autenticação por sessão OIDC existente. Autorização deny-by-default por `MARSHAL_CONSOLE_OPERATOR_IDS`, lista de subjects OIDC confiáveis. Não aceitar `actorId`/papéis no corpo.
- `POST` exige `Origin` igual à origem efetiva e rejeita `Sec-Fetch-Site: cross-site`. Respostas privadas incluem `Cache-Control: no-store`.
- `Idempotency-Key` é UUID obrigatório. Mesmo ator + chave + corpo retorna o recurso existente; reutilizar chave com outro conteúdo retorna `409`.
- Limite de 10 novas deliberações por minuto por operador (contador local ao processo). Payload máximo de 16 KiB. Use uma chave UUID diferente por submissão.
- Os três agentes são determinísticos e locais nesta versão; propostas nunca são executáveis. Nenhuma rota aprova ou aplica resultado. Segurança e integridade competitiva têm precedência; falha/timeout resulta em `partial` e revisão humana.

## Rotas

| Método e caminho | Descrição |
|---|---|
| `GET /api/console/v1/marshal/overview?worldId=W2` | Snapshot atual de salas e fila para o mundo. |
| `GET /api/console/v1/marshal/telemetry/stream?worldId=W2` | Stream SSE autenticado; publica snapshots a cada 2 s. |
| `GET /api/console/v1/marshal/narrative-events?worldId=W2` | Drafts narrativos determinísticos dos três agentes, derivados do snapshot. |
| `POST /api/console/v1/marshal/councils` | Persistir e iniciar um conselho assíncrono. |
| `GET /api/console/v1/marshal/councils/{requestId}` | Consultar status, snapshot usado e deliberação. |
| `GET /api/console/v1/marshal/proposals/{proposalId}` | Consultar uma proposta; sempre `executable: false`. |

Mundos aceitos: `CIGKV`, `W1`, `W2`, `W3`, `W4`. Novas mensagens de criação de lobby/fila aceitam `worldId`; clientes antigos que não o enviam continuam no mundo padrão `CIGKV`. A fila só combina jogadores do mesmo mundo. Salas carregam o mundo no servidor e no snapshot do room state.

## Visão agregada

```http
GET /api/console/v1/marshal/overview?worldId=W2
Cookie: <sessao-autenticada>
```

Exemplo de formato de resposta (contagens variam em tempo real):

```json
{
  "worldId": "W2",
  "name": "Priadus",
  "operationalState": "idle",
  "occupancy": { "current": 0, "capacity": 0, "percent": null },
  "activeRooms": 0,
  "queueCount": 0,
  "queueP95Seconds": null,
  "activeIncidents": null,
  "incidentTelemetryAvailable": false,
  "configRevision": null,
  "observedAt": "2026-10-21T20:00:00.000Z",
  "stale": false
}
```

Amostras reais são agregadas do `RoomManager` e da fila local: jogadores conectados e vagas configuradas em salas não finalizadas, mais quantidade e p95 da idade de espera dos jogadores atualmente enfileirados. O p95 é uma estimativa da espera atual, não uma série histórica de tempos de conclusão. `activeIncidents` é `null` e `incidentTelemetryAvailable` é `false` enquanto não existir fonte de incidentes; revisão de mercado e diplomacia também não têm conectores nesta versão. Esses campos ausentes fazem os agentes de economia/diplomacia se posicionarem em `hold`.

## Criar conselho

```http
POST /api/console/v1/marshal/councils
Content-Type: application/json
Idempotency-Key: 4ef6c9c0-4b5f-4c6b-a143-c81a432a3210
Origin: https://game.example.com
Cookie: <sessao-autenticada>
```

```json
{
  "subject": "revisar-capacidade-W2",
  "scope": { "worldId": "W2", "periodSeconds": 3600 }
}
```

O corpo aceita apenas `subject` (2–120 caracteres) e `scope` com `worldId` e `periodSeconds` (60–2.592.000, opcional). `actorId` e telemetria são derivados do servidor: qualquer `context`, métrica ou campo extra é rejeitado. O snapshot real usado na deliberação é capturado e persistido no momento da submissão.

A resposta inicial usa `202 Accepted` enquanto `queued`/`running`, inclui `Location`, `Retry-After: 1`, identificador e snapshot de telemetria. Polling retorna `200` ao atingir `complete`, `partial` ou `failed`. Replay de chave concluída retorna `200`.

## Persistência e recuperação

A migration aditiva `migrations/0006_marshal-council-persistence.sql` cria `marshal_councils` e `marshal_proposals`, com índice único `(actor_id, idempotency_key)`, índices de consulta e FK com cascade. O início normal do servidor tenta recuperar trabalhos `queued` e re-enfileira registros `running` sem atualização por 120 segundos; a reivindicação é um `UPDATE ... WHERE status='queued'`, para impedir que processos concorrentes iniciem o mesmo conselho. Resultado e propostas são gravados juntos em transação. A persistência não toca em usuários, perfis, contas ou partidas.

Aplicar migrations no deployment com o mecanismo existente (`RUN_DB_MIGRATIONS=true`) ou executar `npm run db:migrate` com `DATABASE_URL` configurada antes de ativar as rotas. Se o PostgreSQL estiver indisponível, `POST`/consultas retornam `503 COUNCIL_UNAVAILABLE`; em POST, repetir com a mesma chave.

## Erros

Formato comum: `{ "error": { "code": "...", "message": "...", "details": [] }, "correlationId": "..." }`.

| HTTP | Código | Condição |
|---:|---|---|
| 400 | `INVALID_REQUEST` / `INVALID_IDEMPOTENCY_KEY` | schema, mundo ou UUID inválido |
| 401 | middleware OIDC | sessão ausente/inválida |
| 403 | `INSUFFICIENT_SCOPE` / `CSRF_ORIGIN_REJECTED` | operador não autorizado ou origem inválida |
| 404 | `RESOURCE_NOT_FOUND` | recurso inexistente ou de outro ator |
| 409 | `IDEMPOTENCY_KEY_REUSED` | chave usada com corpo diferente |
| 413 | `PAYLOAD_TOO_LARGE` | corpo maior que 16 KiB |
| 429 | `RATE_LIMITED` | 10 novas submissões/minuto/ator |
| 503 | `COUNCIL_UNAVAILABLE` | banco indisponível ou job não persistido |

## Limites explícitos

- Salas e contadores de ocupação são locais ao processo; a fila pode ser coordenada via Redis conforme a configuração do runtime. Persistência/idempotência de conselhos é compartilhada via PostgreSQL. Em múltiplas réplicas, o snapshot de salas reflete o runtime local desta instância.
- Eventos de incidentes, métricas de mercado e estado de tratados não têm fontes instrumentadas e permanecem indisponíveis em vez de inventados.
- O rate limit é por processo, não um rate limiter global distribuído.
- A avaliação dos três agentes é consultiva, determinística, auditável e fail-closed; não existe endpoint de aprovação/execução.

## Interface web do operador

A interface autenticada fica em `/marshal-console`; o backend continua sendo a autoridade. Ela apresenta snapshots autoritativos do runtime, permite selecionar mundo e submeter assunto/período para deliberação, acompanhar o processamento e consultar propostas. Métricas indisponíveis não podem ser preenchidas pelo cliente nem usadas como telemetria factual. A página não aprova nem executa propostas.


## Telemetria em tempo real (SSE)

```http
GET /api/console/v1/marshal/telemetry/stream?worldId=W2
Cookie: <sessao-autenticada>
Accept: text/event-stream
```

A conexão usa a mesma sessão OIDC e allowlist de operadores da API. O servidor envia `event: telemetry` imediatamente e, enquanto aberta, um snapshot a cada 2 segundos. O campo `data` é o objeto de overview documentado acima, incluindo `observedAt`. O painel atualiza o cache React Query com os eventos recebidos; EventSource reconecta automaticamente e o overview mantém polling de fallback a cada 15 segundos. Respostas usam `Cache-Control: no-cache, no-store, no-transform` e `X-Accel-Buffering: no`. Cada processo limita streams ativos a 100 no total e 3 por operador; excesso responde `429 STREAM_LIMIT_REACHED` com `Retry-After: 5`. Fechar a aba remove o consumidor e interrompe o timer de fanout quando não há clientes.

## Drafts narrativos da Classe Especial

```http
GET /api/console/v1/marshal/narrative-events?worldId=W2
Cookie: <sessao-autenticada>
```

A resposta contém `source: "server-runtime-telemetry"`, eventos atuais e `policy: { proposalOnly: true, humanReviewRequired: true, executable: false }`. Gatilhos disponíveis: fila com ao menos 3 participantes (**As Docas em Silêncio**), p95 de espera de ao menos 60 segundos (**O Farol da Espera**) e ocupação observada de ao menos 80% (**A Mesa do Anel**). Cada draft inclui os sinais que o ativaram e uma contribuição de Henricks, King Krapulla e Uryan. Valores ausentes não acionam gatilhos; falas são ficcionais, não evidência de incidentes/mercado/tratados, e não afetam gameplay. A lista pode ficar vazia. Regras editoriais completas em [`SPECIAL_CLASS_NARRATIVE_GUIDELINES.md`](SPECIAL_CLASS_NARRATIVE_GUIDELINES.md).

## Pipeline de carga por PR

`.github/workflows/marshal-console-load.yml` executa para cada pull request destinado a `main` ou `develop` e também pode ser acionado manualmente. O harness local testa 400 leituras de overview, 100 conselhos assíncronos e 40 streams SSE simultâneos com 20 operadores e cinco mundos, aplica limites de latência, e publica o log como artefato por 30 dias. A simulação é isolada do serviço público e usa repositório de memória, não exige DB/Redis nem gera tráfego em regiões de produção.
