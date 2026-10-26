# Baseline de cobertura — Khaaos_Run

**Atualizado em:** 23/10/2026
**Revisão:** `main` em `37bce8d0cdb8a61c5061cd79602b45ccb8db8055` (`37bce8d`).
**Instrumentador:** c8 12.0.0 / V8; LCOV e JSON-summary.
**Status:** baseline local provisório; a CI desta revisão está falhando e ainda não produziu artifacts atuais do app.

## Cobertura reproduzida na main atual

| Escopo | Arquivos | Statements/linhas | Branches | Functions |
|---|---:|---:|---:|---:|
| App (`client/src`, `server`, `shared`) | 141 | 10.149 / 28.366 (**35,77%**) | 1.006 / 1.464 (**68,71%**) | 247 / 487 (**50,71%**) |
| Runtime Node | 26 | 1.931 / 4.339 (**44,50%**) | 668 / 900 (**74,22%**) | 149 / 192 (**77,60%**) |

A medição do app foi obtida por `npm run coverage:official`; o processo produziu summary, mas falhou em 2 de 270 testes (267 aprovados, 2 falhas, 1 ignorado). Portanto, coverage é uma medida parcial, não uma execução verde. O runtime executou 62 testes: 60 aprovados, zero falhas, 2 ignorados.

O app foi medido sem `TEST_DATABASE_URL`; integração PostgreSQL foi omitida localmente. A UI permanece incluída no denominador. Não compare percentuais diretamente com o snapshot CI de 21/10: desde então o código, o número de arquivos e o denominador mudaram.

### Breakdown do app

| Área | Arquivos | Linhas | Branches | Functions |
|---|---:|---:|---:|---:|
| `client/src/` | 88 | 892 / 14.559 (**6,13%**) | 64 / 196 (**32,65%**) | 34 / 129 (**26,36%**) |
| `server/` | 41 | 4.858 / 8.545 (**56,85%**) | 807 / 1.092 (**73,90%**) | 187 / 327 (**57,19%**) |
| `shared/` | 12 | 4.399 / 5.262 (**83,60%**) | 135 / 176 (**76,70%**) | 26 / 31 (**83,87%**) |

## Bloqueadores de qualidade atuais

A CI da revisão `37bce8d` está vermelha. `02 — CI TypeScript` (`40002127431`), `04 — Unit Tests` (`40002127508`) e CI (`40002127380`) falharam. O typecheck lista erros de contrato em `server/game/discordApiV1.ts`: propriedades de jogador (`elo`, `losses`, `playerName`, `username`, `bestKillStreak`, `killStreak`, `damageDealt`, `matchesSurvived`), método `DistributedState.getState`, chamada `DatabaseStorage.getPlayerBalance`, assinatura de construtor e tipo implícito.

Na execução local de coverage, falharam `tests/official/discordApiV1.test.ts` e `tests/official/economy-migration-contract.test.ts`. A segunda ainda espera `0005_optimal_steel_serpent`, mas a migration atual se chama `0005_stripe_checkout`. Corrigir essas falhas e rerodar CI com serviços PostgreSQL/Redis efêmeros antes de marcar baseline estável.

## Hotspots

| Módulo | Linhas | Branches | Functions | Próximo foco |
|---|---:|---:|---:|---|
| `server/game/worldProgression.ts` | 0% | 0% | 0% | Adicionar suite de regras/estados |
| `server/game/economyService.ts` | 12,25% | 100% | 23,07% | Cobrir fluxo monetário e persistência |
| `server/game/economyRetention.ts` | 24,57% | 100% | 50% | Cenários de cleanup e falha |
| `server/game/MonteCarloEconomy.ts` | 27,18% | 100% | 14,28% | Exercitar funções do modelo |
| `server/storage.ts` | 32,75% | 100% | 3,57% | Testes de transação e ownership |
| `server/game/discordApiV1.ts` | 38,53% | 100% | 40% | Corrigir contratos e cobrir handlers |
| `server/game/MatchmakingService.ts` | 54,86% | 69,23% | 64,70% | Filas, rating e timeout |
| `server/routes.ts` | 63,10% | 60,71% | 66,66% | Autorização/ownership |
| `server/game/RoomManager.ts` | 66,66% | 65% | 70,21% | Reconnect e isolamento de sala |

## Scripts e artefatos

- `npm run coverage:official` gera `coverage/official/lcov.info` e `coverage/official/coverage-summary.json`.
- `npm --prefix game-runtime run coverage` gera LCOV e summary do runtime.
- `npm run coverage:all` executa ambos; `npm run verify:all` inclui testes, builds e typecheck.
- A CI publica `unit-test-results` e `coverage-game-runtime` quando as etapas de upload são atingidas. A revisão atual não possui artifact atualizado do app porque o job falhou no typecheck.

O primeiro snapshot CI verde de coverage foi `b3524d4` (21/10): app 36,16% linhas / 67,30% branches / 53,52% funções; runtime 82,61% / 70,21% / 81,63%, com PostgreSQL/Redis efêmeros. É histórico e não substitui a nova medição.

**Não há thresholds mínimos configurados.** Após duas execuções CI verdes e comparáveis, estabelecer gates graduais por `client/src`, `server`, `shared` e runtime. Não remover UI do denominador para elevar percentuais. Coverage C++/UE5 deve ser medido em ferramenta/runner próprio.

O próximo plano e os critérios de aceite estão em [`ROADMAP.md`](ROADMAP.md); o relatório detalhado desta execução está em [`COVERAGE_REPORT_2026-10-23.md`](COVERAGE_REPORT_2026-10-23.md).
