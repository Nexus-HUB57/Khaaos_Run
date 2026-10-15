# API do Painel de Controle do Marechal

**Status: especificação proposta, ainda não conectada a rotas HTTP.** O código de domínio do conselho está em `server/game/orchestration.ts`; esta documentação não significa que os endpoints abaixo estejam ativos. Não envie segredos, dados pessoais ou comandos de shell. O servidor permanece a única autoridade sobre estado de mundo e permissões.

## 1. Contrato de segurança

- Prefixo planejado: `/api/console/v1`.
- Transporte: HTTPS em produção; JSON UTF-8; limite sugerido de corpo: 16 KiB.
- Autenticação: sessão OIDC já autenticada, cookie `httpOnly` e proteção CSRF nas operações `POST`; nunca confiar em `actorId`, `role` ou `agentId` do corpo para autenticar/autorizar.
- Autorização: deny-by-default, role operacional atribuída no servidor, escopo por mundo, rate limit e auditoria com correlation ID.
- Idempotência: `Idempotency-Key` UUID obrigatório em solicitações de conselho/proposta; mesma chave e mesmo corpo retorna a mesma decisão, chave igual com corpo diferente retorna `409 IDEMPOTENCY_KEY_REUSED`.
- Agentes respondem com leituras e propostas. Nenhum endpoint executa mutação de partida, transação KRC, publicação externa ou operação irreversível.
- Toda proposta de mudança fica pendente de decisão humana em fluxo futuro separado, autenticado, auditado e com revisão de estado. A API v1 **não define endpoint de aprovação**.

## 2. Endpoints planejados

| Método e caminho | Finalidade | Efeito esperado |
|---|---|---|
| `GET /api/console/v1/marshal/overview` | estado agregado dos mundos visíveis ao operador | leitura |
| `POST /api/console/v1/marshal/councils` | solicitar conselho assíncrono da Classe Especial | cria execução consultiva; sem mutação de jogo |
| `GET /api/console/v1/marshal/councils/{requestId}` | consultar estado e resultado da deliberação | leitura |
| `GET /api/console/v1/marshal/proposals/{proposalId}` | obter detalhes/auditoria de uma proposta | leitura |

O endpoint de criação retorna `202 Accepted`; o cliente consulta o recurso em `Location` ou acompanha eventos pelo mecanismo realtime autenticado existente, se aprovado no desenho final. Não pressupor WebSocket/event stream dedicado antes da sua implementação.

## 3. Solicitar um conselho

```http
POST /api/console/v1/marshal/councils HTTP/1.1
Content-Type: application/json
Idempotency-Key: 4ef6c9c0-4b5f-4c6b-a143-c81a432a3210
X-CSRF-Token: <token-da-sessao>
Cookie: <sessao-autenticada>
```

```json
{
  "subject": "ajuste-de-janela-de-entrada-W2",
  "scope": { "worldId": "W2", "periodSeconds": 3600 },
  "context": {
    "occupancyPct": 82,
    "queueP95Seconds": 94,
    "configRevision": "world-config-12"
  }
}
```

`actorId` é obtido da sessão no servidor e não deve ser enviado pelo painel. `context` aceita somente métricas agregadas aprovadas por schema; dados extras, pessoais ou acima dos limites são rejeitados.

Resposta inicial:

```http
HTTP/1.1 202 Accepted
Location: /api/console/v1/marshal/councils/council_20261014_001
Retry-After: 2
```

```json
{
  "requestId": "council_20261014_001",
  "status": "queued",
  "createdAt": "2026-10-14T21:20:00Z",
  "correlationId": "corr_20261014_001",
  "links": { "self": "/api/console/v1/marshal/councils/council_20261014_001" }
}
```

## 4. Consultar resultado do conselho

```http
GET /api/console/v1/marshal/councils/council_20261014_001 HTTP/1.1
Cookie: <sessao-autenticada>
```

```json
{
  "requestId": "council_20261014_001",
  "status": "complete",
  "roundsCompleted": 2,
  "agents": [
    { "agentId": "marshal-henricks", "name": "Henricks Hunterheads III", "domain": "operations", "position": "support", "confidence": 0.86, "rationale": "A fila observada justifica sugerir ampliação temporária." },
    { "agentId": "king-krapulla", "name": "King Krapulla", "domain": "economy", "position": "hold", "confidence": 0.72, "rationale": "O impacto agregado no mercado precisa de revisão." },
    { "agentId": "ambassador-uryan", "name": "Uryan Horks", "domain": "diplomacy", "position": "support", "confidence": 0.65, "rationale": "A janela proposta não altera compromissos diplomáticos conhecidos." }
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
  "operationalState": "running",
  "occupancy": { "current": 61, "capacity": 75, "percent": 81.3 },
  "queueP95Seconds": 94,
  "activeIncidents": 0,
  "configRevision": "world-config-12",
  "observedAt": "2026-10-14T21:19:58Z",
  "stale": false
}
```

Resposta agregada e limitada ao escopo autorizado do operador. Campos de saúde operacional devem vir de serviços existentes; dados indisponíveis aparecem como `null` com indicação de frescor, nunca como zero fabricado.

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
| 401 | `AUTHENTICATION_REQUIRED` | sessão ausente/inválida |
| 403 | `INSUFFICIENT_SCOPE` | usuário autenticado sem escopo de console/mundo |
| 404 | `RESOURCE_NOT_FOUND` | council/proposal inexistente ou fora do escopo |
| 409 | `IDEMPOTENCY_KEY_REUSED` / `STALE_REVISION` | colisão da chave ou revisão obsoleta |
| 413 | `PAYLOAD_TOO_LARGE` | corpo maior que limite |
| 429 | `RATE_LIMITED` | limite por usuário excedido |
| 503 | `COUNCIL_UNAVAILABLE` | serviço indisponível; repetir com a mesma chave |

## 8. Validações mínimas de implementação

- Testes HTTP: sem sessão, role insuficiente, escopo inválido e acesso cruzado a council/proposal.
- Testes concorrentes de idempotência; nenhuma execução duplicada para a mesma chave.
- Schema estrito, limites de tamanho/intervalo, CSRF e rate limit.
- Verificar serialização de `partial`, veto, empate e timeout; nenhuma resposta autoriza escrita.
- Auditoria registra ator autenticado, chave hash/identificador, revisão de dados, participantes, reason codes e resultado; não registra cookies, tokens nem conteúdo pessoal.
- As rotas permanecem desabilitadas até implementação dos controles e testes acima.
