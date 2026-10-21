# Baseline de cobertura — Khaaos_Run

**Data da medição:** 21/10/2026
**Base de código:** `main` em `ce630f2e7b31397e1b2af38965ef1adf3948b033` (`ce630f2`); os commits desde `1375a06` acrescentam arquivos Unreal fora do escopo V8.
**Instrumentador:** `c8` 12.0.0, baseado em V8; relatórios por arquivo e LCOV.
**Escopos:** app (`client/src/`, `server/`, `shared/`) e runtime Node (`game-runtime/server/`, `game-runtime/src/`), medidos separadamente.

## Resultado instrumentado

| Escopo | Arquivos | Statements/linhas | Branches | Functions |
|---|---:|---:|---:|---:|
| App oficial | 129 | 8.871 / 25.936 (**34,20%**) | 831 / 1.225 (**67,83%**) | 198 / 411 (**48,17%**) |
| Runtime Node | 12 | 604 / 788 (**76,64%**) | 185 / 263 (**70,34%**) | 70 / 98 (**71,42%**) |

Os resultados são dois scopes distintos; não some percentuais entre app e runtime. Os contadores cobrem as fontes que correspondem aos globos `--include` e não incluem testes, `node_modules`, diretórios de build nem migrations/scripts do runtime. O código React está incluído no denominador para não mascarar a ausência de testes de UI.

### Breakdown do app oficial

| Área | Arquivos | Linhas | Branches | Functions |
|---|---:|---:|---:|---:|
| `client/src/` | 87 | 902 / 14.315 (**6,30%**) | 63 / 186 (**33,87%**) | 33 / 134 (**24,63%**) |
| `server/` | 31 | 3.843 / 6.632 (**57,95%**) | 644 / 875 (**73,60%**) | 143 / 251 (**56,97%**) |
| `shared/` | 11 | 4.126 / 4.989 (**82,70%**) | 124 / 164 (**75,61%**) | 22 / 26 (**84,62%**) |

A coverage baixa em `client/src/` é principalmente por não haver uma suíte browser/React que monte esses componentes; vários componentes aparecem com 0%. Isso é lacuna real do escopo e não deve ser lido como falha funcional nem excluído do denominador sem decisão documentada.

## Testes executados sob instrumentação

| Suite | Casos | Aprovados | Ignorados | Falhas |
|---|---:|---:|---:|---:|
| App oficial — TS/TSX | 230 | 229 | 1 | 0 |
| App oficial — JavaScript | 39 | 39 | 0 | 0 |
| Fluxo EOS mockado | 7 | 7 | 0 | 0 |
| **App oficial total** | **276** | **275** | **1** | **0** |
| Runtime `npm test` | 16 | 14 | 2 | 0 |

`coverage:official` também instrumenta `test:postgres` quando `TEST_DATABASE_URL` está explicitamente configurada (como no job CI com PostgreSQL efêmero). Na medição local ela foi ignorada por ausência dessa variável. Os casos são contagens de execução, não percentuais de cobertura, e podem se sobrepor a outras etapas de CI. A integração PostgreSQL/Redis real é exercitada separadamente no CI. EOS aqui é mockado. O teste C++ host-side continua fora de LCOV/V8.

## Hotspots prioritários

Os menores resultados no app apontam para estas próximas suítes, em ordem de risco/impacto:

| Módulo | Linhas | Branches | Functions | Prioridade/razão |
|---|---:|---:|---:|---|
| `server/game/worldProgression.ts` | 0,00% | 0,00% | 0,00% | Lógica de progressão sem testes exercitando a implementação |
| `server/game/economyService.ts` | 12,25% | 100,00% | 23,07% | Operações críticas de economia; cobrir fluxos, side effects e persistência |
| `server/game/economyRetention.ts` | 24,57% | 100,00% | 50,00% | Retention/cleanup precisa de cenários de prazo e falha |
| `server/game/MonteCarloEconomy.ts` | 27,18% | 100,00% | 14,28% | Funções do modelo quase não exercitadas |
| `server/storage.ts` | 31,47% | 100,00% | 4,25% | Grande quantidade de funções de persistência sem chamada medida |
| `server/game/MatchmakingService.ts` | 45,03% | 64,70% | 56,25% | Cenários de fila, rating, timeout e cancelamento |
| `server/game/LagCompensation.ts` | 47,77% | 87,50% | 62,50% | Limites temporais, hit validation e entradas inválidas |
| `server/routes.ts` | 66,99% | 60,31% | 66,66% | Matriz de autorização/erros e efeitos colaterais |
| `server/game/RoomManager.ts` | 67,10% | 67,31% | 69,76% | Reconnect, privacidade de sala, replay e limites |

Além disso, 87 arquivos de `client/src/` somam 6,30% de linhas. O roadmap deve priorizar testes de browser para login, lobby→partida→resultado, inventário/economia, erro/loading, teclado, leitor de tela e breakpoints.

## Scripts e artifacts

- `npm run coverage:official` — testes oficiais do app e fluxo EOS mockado; inclui PostgreSQL quando `TEST_DATABASE_URL` existir; gera relatórios em `coverage/official/`.
- `npm --prefix game-runtime run coverage` — testes do runtime e relatórios em `game-runtime/coverage/`.
- `npm run coverage:all` — executa os dois scopes sequencialmente.
- `npm run verify:all` — inclui typecheck/builds, regras C++ host-side e as duas suites instrumentadas.
- Cada scope gera `lcov.info` (detalhe linha a linha) e `coverage-summary.json` (percentuais por arquivo e total), além da tabela `text` no log. O workflow CI publica os dois diretórios como artifacts. As saídas locais são ignoradas pelo Git.

**Baseline não é threshold.** Não há limites mínimos de coverage configurados ainda; definir thresholds antes de estabilizar a execução pode bloquear contribuição por artefatos/escopos não calibrados. Após duas execuções CI reproduzíveis, fixar metas graduais por `server/`, `shared/`, `client/src/` e runtime, privilegiando linhas/branches críticas em vez de um único percentual global.

## Lacunas que permanecem

1. Autorização deny-by-default em todas as rotas mutáveis, ownership/TOCTOU e efeitos laterais.
2. Token WebSocket: replay/revogação, Origin, limite agregado por IP/identidade e concorrência em reconnect.
3. Salas privadas, snapshots/AOI, isolamento por sala/região e rejeição de mensagens inválidas.
4. Operações econômicas concorrentes, rollback multi-tabela, idempotência, reconciliação e divergência preview/cobrança.
5. UI React/browser, acessibilidade e comportamento em loading/erro.
6. PostgreSQL/Redis gerenciados, OIDC real, staging, failover e restore/backups.
7. UE5 sem build comprovado por UnrealBuildTool/Editor/Automation Tests; seus testes portáveis C++ não são contabilizados pelo c8.

Consulte [`ROADMAP.md`](ROADMAP.md) para marcos e gates técnicos.
