# Fase 2 — Cobertura Node: de 38,44% para 40%+

## Objetivo

Consolidar a cobertura oficial da aplicação Node acima de 40% sem perseguir execução artificial de linhas. A Fase 1 elevou a cobertura do domínio de salas com testes unitários isolados, formalizou a injeção de storage no `RoomManager` e centralizou a instância de produção em `server/game/roomManagerSingleton.ts`.

A leitura atual do relatório `coverage:official` é:

- **Agregado instrumentado:** 38,44% de statements/linhas.
- **Servidor:** 42,47%.
- **`server/game/RoomManager.ts`:** 73,68%.
- **Branches agregados:** 73,40%.
- **Funções agregadas:** 61,08%.
- **Suíte oficial:** 451 aprovados, 0 falhas e 8 skips condicionais.

O relatório deve ser interpretado com o escopo configurado em `.c8rc.json`, que inclui cliente, servidor e `shared`. A meta de 40% global exige atacar arquivos de produção ainda não exercitados, não apenas ampliar os testes do `RoomManager`.

## Prioridade P0 — Cobertura diferencial e qualidade do CI

1. Publicar `coverage/official/coverage-summary.json` e o relatório LCOV como artefatos do CI.
2. Impedir regressão da cobertura global em qualquer PR.
3. Exigir cobertura mínima de linhas alteradas, inicialmente 80% para código de domínio e 100% para schemas/validadores novos.
4. Manter `npm run check`, `npm run test:official` e `npm run coverage:official` como gates independentes.
5. Não elevar o threshold global diretamente para 40% antes de medir a cobertura diferencial; primeiro subir em incrementos de 0,5–1 ponto percentual.

## Prioridade P1 — Rotas e serviços de maior risco

A próxima frente deve cobrir os caminhos que ainda representam maior superfície não exercitada:

- rotas administrativas e de telemetria que retornam erros de origem, autenticação e autorização;
- falhas de persistência em `server/storage.ts` sem exigir PostgreSQL em testes unitários;
- reconciliação e recuperação de serviços econômicos;
- limites de rate limit, idempotência e payloads acima do tamanho permitido;
- matchmaking por mundo, fila vazia, timeout e desconexão durante a formação da partida;
- `RoomManager` em estados `COUNTDOWN`, `IN_PROGRESS` e `FINISHED`, incluindo cancelamento, vitória e destruição da sala.

Cada caso negativo deve verificar o código de erro, a ausência de vazamento de detalhes internos e a ausência de efeitos colaterais indevidos.

## Prioridade P1 — Contratos e schemas

Para cada contrato Zod ou DTO compartilhado, manter uma matriz de aceitação e rejeição:

- payload mínimo válido;
- campo obrigatório ausente;
- tipo incorreto;
- número não finito;
- valor de fronteira;
- campo extra;
- enum desconhecido;
- identidade do usuário forjada;
- protocolo ou versão legada.

O contrato `ZU_VEHICLE_ENTRY_V1` deve permanecer coberto para `train`, variantes canônicas futuras, relógio autoritativo, duração, mundo e spawn. `portal`, `parachute`, `ZU_PORTAL_V1` e aliases equivalentes devem continuar sendo rejeitados no ingresso padrão.

## Prioridade P2 — Storage por contrato

Separar a suíte em duas camadas:

1. **Suíte unitária com fake em memória:** cobre regras, transições, erros e idempotência sem rede ou banco.
2. **Suíte de contrato PostgreSQL:** executada somente quando `DATABASE_URL` estiver disponível; valida que a implementação real preserva a mesma semântica do fake.

O fake não deve ser tratado como prova suficiente da implementação SQL. Operações transacionais, conflitos de unicidade, rollback e concorrência exigem uma camada PostgreSQL dedicada e explicitamente marcada como condicional.

## Prioridade P2 — WebSocket e recursos

Expandir os testes de WebSocket com foco em limpeza determinística:

- handshake válido e inválido;
- reconexão com socket antigo atrasado;
- sala removida durante reconexão;
- mensagem inválida e mensagem em estado incorreto;
- limite de mensagens;
- broadcast para cliente desconectado;
- encerramento de todos os sockets, timers e servidores em `afterEach`.

Todo teste que abre servidor, socket, intervalo ou listener deve possuir uma saída garantida mesmo em caso de falha. Não usar `setTimeout` como sincronização principal; preferir eventos observáveis com timeout de segurança.

## Priorização por retorno

| Ordem | Área | Critério de conclusão |
|---|---|---|
| P0 | CI e cobertura diferencial | Nenhuma regressão; relatório publicado |
| P1 | Rotas críticas | Sucesso, autorização, validação e erro cobertos |
| P1 | Storage e persistência | Fake + contrato PostgreSQL quando disponível |
| P2 | WebSocket | Reconexão, erro, rate limit e limpeza |
| P2 | Matchmaking | Mundos, timeout, fila e cancelamento |
| P3 | Código de configuração | Apenas depois de esgotar caminhos de negócio |

## Plano incremental

### Marco 2.1 — 39%

Cobrir branches remanescentes do `RoomManager`, especialmente ciclo de countdown, cancelamento, derrota/vitória e falha de preparação de PackBack.

### Marco 2.2 — 39,5%

Cobrir rotas administrativas, telemetry stream, rate limit e respostas uniformes de autenticação/autorização.

### Marco 2.3 — 40%+

Cobrir falhas de storage, idempotência e cenários de matchmaking não exercitados. O gate global só deve ser aumentado quando os testes forem determinísticos e a cobertura diferencial estiver ativa.

## Regras de revisão

- Toda correção de bug inclui um teste de regressão.
- Toda alteração em `RoomManager` inclui teste de estado ou transição.
- Toda alteração em `roomManagerSingleton.ts` atualiza os consumidores e preserva a injeção para testes.
- Nenhum teste deve importar a instância de produção quando uma instância isolada for suficiente.
- Não substituir fake por mock genérico quando o comportamento de domínio puder ser modelado em memória.
- Não incluir cobertura de arquivos gerados, declarações ou fixtures apenas para aumentar o percentual.
- PRs devem ser pequenos, sem `git push --force` e sem sobrescrever a branch remota de outro desenvolvedor.

## Gates de aceite da Fase 2

```bash
npm run check
DATABASE_URL=postgres://test:test@127.0.0.1:5432/khaaos_test npm run test:official
DATABASE_URL=postgres://test:test@127.0.0.1:5432/khaaos_test npm run coverage:official
npm run build
```

Aceitar a Fase 2 quando a cobertura global atingir pelo menos 40%, a suíte oficial continuar sem falhas, o `RoomManager` permanecer acima de 70%, os relatórios forem publicados e não houver regressão no contrato `ZU_VEHICLE_ENTRY_V1`.
