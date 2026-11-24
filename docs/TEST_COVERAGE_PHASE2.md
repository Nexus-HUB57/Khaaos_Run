# Fase 2 — Cobertura Node: de 38,44% para 40%+

## Objetivo

Consolidar a cobertura oficial da aplicação Node acima de 40% sem perseguir execução artificial de linhas. A Fase 1 elevou a cobertura do domínio de salas com testes unitários isolados, formalizou a injeção de storage no `RoomManager` e centralizou a instância de produção em `server/game/roomManagerSingleton.ts`.

A leitura atual do relatório `coverage:official` na base Zu mesclada é:

- **Agregado instrumentado:** 42,00% de statements/linhas.
- **Branches agregados:** 73,08%.
- **Funções agregadas:** 63,63%.
- **`server/game/RoomManager.ts`:** 73,94%.
- **Suíte oficial:** 595 testes, 586 aprovados, 0 falhas e 9 skips condicionais.

O relatório deve ser interpretado com o escopo configurado em `.c8rc.json`, que inclui cliente, servidor e `shared`. A meta de 40% global exige atacar arquivos de produção ainda não exercitados, não apenas ampliar os testes do `RoomManager`.

## Prioridade P0 — Cobertura diferencial e qualidade do CI

1. Publicar `coverage/official/coverage-summary.json` e o relatório LCOV como artefatos do CI. O workflow `ci.yml` já preserva ambos em `unit-test-results`.
2. Impedir regressão da cobertura global em qualquer PR. O comando `npm run coverage:gate` falha abaixo de 40% usando a menor métrica entre linhas e statements.
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

### Marco 2.1 — 39% — concluído

Cobertura do `RoomManager` estabilizada acima de 70%, com ciclo de salas, reconexão, quotas, PackBack, persistência de loot e falhas de preparação cobertos.

### Marco 2.2 — 39,5% — concluído

Rotas administrativas, telemetry stream, rate limit e respostas uniformes de autenticação/autorização exercitados na suíte oficial; os relatórios JSON/LCOV são publicados pelo CI.

### Marco 2.3 — 40%+ — concluído

Falhas de storage relevantes, idempotência e cenários de matchmaking permanecem cobertos; a cobertura limpa atingiu 42,00%. O gate global de 40% está ativo, enquanto a expansão diferencial continua como Fase 3.

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
npm run coverage:gate
npm run build
```

Aceitar a Fase 2 quando a cobertura global atingir pelo menos 40%, a suíte oficial continuar sem falhas, o `RoomManager` permanecer acima de 70%, os relatórios forem publicados e não houver regressão no contrato `ZU_VEHICLE_ENTRY_V1`. Esses critérios foram atendidos na medição atual; a execução do gate é obrigatória no CI.
