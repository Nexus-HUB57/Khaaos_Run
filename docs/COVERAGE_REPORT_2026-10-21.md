# Relatório detalhado de cobertura — Khaaos_Run

**Data da medição:** 21/10/2026
**Base de código:** `main` em `ce630f2e7b31397e1b2af38965ef1adf3948b033` (`ce630f2`); os commits desde `1375a06` acrescentam arquivos Unreal fora do escopo V8.
**Ferramenta:** `c8` 12.0.0 / V8; execução limpa de `npm run coverage:all`.
**Verificação local:** `npm run verify:all` passou após integrar os comandos de coverage.

## Resultado agregado

| Escopo | Arquivos | Statements/linhas | Branches | Functions |
|---|---:|---:|---:|---:|
| App (`client/src`, `server`, `shared`) | 129 | 8.871 / 25.936 — **34,20%** | 831 / 1.225 — **67,83%** | 198 / 411 — **48,17%** |
| Runtime Node (`game-runtime/server`, `game-runtime/src`) | 12 | 604 / 788 — **76,64%** | 185 / 263 — **70,34%** | 70 / 98 — **71,42%** |

Cada taxa pertence ao escopo correspondente; não se somam percentuais de app e runtime.

## Quebra do app oficial

| Área | Arquivos | Linhas cobertas / total | Branches cobertos / total | Functions cobertas / total |
|---|---:|---:|---:|---:|
| `client/src/` | 87 | 902 / 14.315 — **6,30%** | 63 / 186 — **33,87%** | 33 / 134 — **24,63%** |
| `server/` | 31 | 3.843 / 6.632 — **57,95%** | 644 / 875 — **73,60%** | 143 / 251 — **56,97%** |
| `shared/` | 11 | 4.126 / 4.989 — **82,70%** | 124 / 164 — **75,61%** | 22 / 26 — **84,62%** |

A camada React está deliberadamente incluída no denominador. A taxa baixa deriva principalmente da ausência de testes browser/componentes que montem esses módulos; não deve ser removida para inflar o percentual global.

## Módulos menos cobertos

Percentuais de linhas do app no snapshot medido:

| Arquivo | Linhas | Branches | Functions | Leitura de risco |
|---|---:|---:|---:|---|
| `server/game/worldProgression.ts` | 0,00% | 0,00% | 0,00% | Progressão sem execução instrumentada |
| `server/game/economyService.ts` | 12,25% | 100,00% | 23,07% | Fluxos críticos de economia e efeitos de persistência |
| `server/game/economyRetention.ts` | 24,57% | 100,00% | 50,00% | Cenários de prazo, cleanup e falhas |
| `server/game/MonteCarloEconomy.ts` | 27,18% | 100,00% | 14,28% | Funções do modelo quase não exercitadas |
| `server/storage.ts` | 31,47% | 100,00% | 4,25% | Muitas funções de persistência sem chamada medida |
| `server/game/MatchmakingService.ts` | 45,03% | 64,70% | 56,25% | Fila, rating, timeout e cancelamento |
| `server/game/LagCompensation.ts` | 47,77% | 87,50% | 62,50% | Limites temporais e validação de hits |
| `server/routes.ts` | 66,99% | 60,31% | 66,66% | Autorização/erros e efeitos colaterais |
| `server/game/RoomManager.ts` | 67,10% | 67,31% | 69,76% | Reconnect, sala privada, replay e limites |

No runtime, `src/main.js` e `src/network/client.js` ficaram em 0% porque a suíte Node cobre servidor e módulos de simulação, mas não inicializa o cliente Vite. `server/store.js` ficou em 67,82% de linhas, `server/room.js` em 71,35% e `server/rateLimit.js` em 73,80%.

## Suites executadas sob instrumentação

| Suite | Casos | Passaram | Ignorados | Falhas |
|---|---:|---:|---:|---:|
| App oficial — TS/TSX | 230 | 229 | 1 | 0 |
| App oficial — JavaScript | 39 | 39 | 0 | 0 |
| Fluxo EOS mockado | 7 | 7 | 0 | 0 |
| **App oficial — total de execuções** | **276** | **275** | **1** | **0** |
| Runtime `npm test` | 16 | 14 | 2 | 0 |

`coverage:official` acrescenta `test:postgres` quando `TEST_DATABASE_URL` está explicitamente configurada. Essa variável não estava presente na medição local, então a integração PostgreSQL não contribuiu para a métrica local. No job CI, PostgreSQL efêmero é provisionado e `TEST_DATABASE_URL` existe, portanto essa suíte também será instrumentada. EOS é mockado. C++ host-side não é contabilizado por LCOV/V8.

## Artefatos e reprodução

- App LCOV: `coverage/official/lcov.info`
- App JSON-summary por arquivo: `coverage/official/coverage-summary.json`
- Runtime LCOV: `game-runtime/coverage/lcov.info`
- Runtime JSON-summary por arquivo: `game-runtime/coverage/coverage-summary.json`
- Os jobs CI publicam ambos os diretórios como artifacts `unit-test-results` e `coverage-game-runtime`; saídas locais são ignoradas pelo Git.
- Comandos: `npm run coverage:official`, `npm --prefix game-runtime run coverage`, `npm run coverage:all` e `npm run verify:all`.

O baseline ainda não define thresholds: primeiro devem existir pelo menos duas execuções CI comparáveis. A evolução deve ter metas por camada e privilegiar testes de segurança/dados críticos em vez de um limite global que esconda lacunas.

## Próximas tarefas orientadas pelo resultado

1. Criar testes browser para a jornada login → lobby → partida → resultado, inventário/economia, estados de erro/loading, teclado e leitor de tela; começar pela cobertura de `client/src/`.
2. Instrumentar e ampliar PostgreSQL transacional em CI; priorizar `economyService.ts`, `storage.ts`, `worldProgression.ts`, `RoomManager.ts` e todas as rotas mutáveis/ownership.
3. Acrescentar cenários adversariais de token WebSocket/replay/Origin, lobby privado/AOI, reconnect, matchmaking, falhas e idempotência.
4. Confirmar a estabilidade da métrica via CI; só então estabelecer gates graduais por `client/src`, `server`, `shared` e runtime.
5. Tratar coverage UE5 em ferramenta separada após disponibilizar runner UE licenciado; não misturar com V8.

Para status histórico, lacunas e critérios, consulte [`TEST_COVERAGE_BASELINE.md`](TEST_COVERAGE_BASELINE.md) e [`ROADMAP.md`](ROADMAP.md).
