# Relatório de cobertura — Khaaos_Run

**Atualizado em:** 23/10/2026
**Revisão medida:** `main` em `37bce8d0cdb8a61c5061cd79602b45ccb8db8055` (`37bce8d`).
**Instrumentador:** c8 12.0.0 / V8.
**Execução:** `npm run coverage:official` e `npm run coverage` no runtime. A suíte oficial gerou summary, mas terminou com falhas; esses números são cobertura parcial, não evidência de suite verde.

## Situação de validação

- CI atual: run `40002127380` (CI) e `40002127431` (TypeScript) falharam; `40002127508` (Unit Tests) também falhou. A etapa de TypeScript aponta erros em `server/game/discordApiV1.ts` (API/tipos incompatíveis com `DistributedState`, jogador e storage). A suíte atual também falha em `tests/official/economy-migration-contract.test.ts`, que espera `0005_optimal_steel_serpent`, enquanto a migration presente é `0005_stripe_checkout`.
- Execução local instrumentada do app: 270 casos, 267 passaram, 2 falharam, 1 ignorado. `tests/official/discordApiV1.test.ts` falhou; a outra falha foi o contrato do nome da migration. A verificação TypeScript independente confirma erros no novo módulo Discord API.
- Runtime: 62 casos, 60 passaram, 0 falhas e 2 ignorados. A suite de cobertura do runtime concluiu; a CI anterior no commit `b3524d4` também provou testes reais com PostgreSQL/Redis efêmeros.
- `TEST_DATABASE_URL` não estava configurada na medição local, portanto os testes PostgreSQL oficiais não entraram nessa execução. O atual workflow tem serviços de teste, mas o job de unit tests está bloqueado antes de produzir um artifact atualizado por causa das falhas de CI.

## Métricas c8 locais na revisão atual

| Escopo | Arquivos | Statements/linhas cobertos | Branches cobertos | Functions cobertas |
|---|---:|---:|---:|---:|
| App (`client/src`, `server`, `shared`) | 141 | 10.149 / 28.366 — **35,77%** | 1.006 / 1.464 — **68,71%** | 247 / 487 — **50,71%** |
| Runtime Node (`game-runtime`) | 26 | 1.931 / 4.339 — **44,50%** | 668 / 900 — **74,22%** | 149 / 192 — **77,60%** |

Não combine percentuais entre escopos. A alteração recente no runtime ampliou bastante o denominador e introduziu módulos 3D/client que os testes Node ainda não inicializam.

### Breakdown do app

| Área | Arquivos | Linhas | Branches | Functions |
|---|---:|---:|---:|---:|
| `client/src/` | 88 | 892 / 14.559 (**6,13%**) | 64 / 196 (**32,65%**) | 34 / 129 (**26,36%**) |
| `server/` | 41 | 4.858 / 8.545 (**56,85%**) | 807 / 1.092 (**73,90%**) | 187 / 327 (**57,19%**) |
| `shared/` | 12 | 4.399 / 5.262 (**83,60%**) | 135 / 176 (**76,70%**) | 26 / 31 (**83,87%**) |

A UI continua deliberadamente no denominador. Os 6,13% de linhas em `client/src/` indicam falta de testes de browser/componentes, não falha funcional demonstrada.

## Hotspots e lacunas atuais

| Módulo | Linhas | Branches | Functions | Prioridade |
|---|---:|---:|---:|---|
| `server/game/worldProgression.ts` | 0% | 0% | 0% | Progressão sem cobertura executada |
| `server/game/economyService.ts` | 12,25% | 100% | 23,07% | Operações econômicas e persistência |
| `server/game/economyRetention.ts` | 24,57% | 100% | 50% | Retenção, prazo e falhas |
| `server/game/MonteCarloEconomy.ts` | 27,18% | 100% | 14,28% | Funções do modelo pouco executadas |
| `server/storage.ts` | 32,75% | 100% | 3,57% | Persistência e consistência transacional |
| `server/game/discordApiV1.ts` | 38,53% | 100% | 40% | Código novo; primeiro corrigir tipos/contratos e então testar respostas/erros |
| `server/game/MatchmakingService.ts` | 54,86% | 69,23% | 64,70% | Fila, rating, timeout e cancelamento |
| `server/routes.ts` | 63,10% | 60,71% | 66,66% | Autorização, ownership e efeitos laterais |
| `server/game/RoomManager.ts` | 66,66% | 65% | 70,21% | Reconnect, privacidade, replay e limites |

No runtime, `game3d/audio3d.js`, `effects3d.js`, `entities3d.js`, `hud3d.js`, `main3d.js`, `net3d.js`, `online3d.js`, `postfx3d.js`, `textures3d.js` e `src/main.js` estão em 0% de linhas: cobertura de runtime/simulação não equivale a teste da experiência 3D no browser.

## Histórico de comparação

A primeira execução CI verde com coverage foi no commit `b3524d4` em 21/10: app 36,16% linhas / 67,30% branches / 53,52% funções (incluía PostgreSQL efêmero); runtime 82,61% / 70,21% / 81,63%. Esse é um snapshot histórico de código anterior, não uma comparação direta de melhoria/regressão: os 51 commits seguintes alteraram módulos, testes e denominadores. A revisão atual precisa de CI verde para estabelecer baseline oficial atualizado.

## Recomendação de sequência

1. Restaurar CI verde: corrigir contratos/tipagem de `discordApiV1.ts` e atualizar o teste de migration para a sequência real `0005_stripe_checkout`.
2. Rerodar unit tests com PostgreSQL efêmero para produzir artifacts de coverage confiáveis da main atual; revalidar os dois scopes.
3. Cobrir os fluxos econômicos, `worldProgression`, storage e a API Discord com mocks/integração apropriados.
4. Adicionar testes browser para login, lobby→partida→resultado, inventário/economia, loading/erro, teclado e acessibilidade.
5. Estabelecer thresholds graduais somente após pelo menos duas execuções CI verdes comparáveis; não excluir a UI do denominador para elevar artificialmente a taxa.
6. Manter coverage UE5 em runner/licença e ferramenta próprios; c8 não mede C++ Unreal.

## Reprodução e artifacts

- App: `npm run coverage:official` → `coverage/official/lcov.info` e `coverage/official/coverage-summary.json`.
- Runtime: `npm --prefix game-runtime run coverage` → `game-runtime/coverage/lcov.info` e `game-runtime/coverage/coverage-summary.json`.
- Integrado: `npm run coverage:all`; validação completa: `npm run verify:all`.
- O CI publica `unit-test-results` e `coverage-game-runtime` quando os respectivos jobs alcançam a etapa de upload.

## Discord/Slack — limite externo

O job `notify-failure` envia POST JSON. No run atual `40002127380`, Discord respondeu HTTP 405 e Slack HTTP 302; nenhum deles confirmou entrega 2xx. O código não pode corrigir endpoints guardados como Actions secrets. A consulta `gh secret list` falhou com HTTP 403 (permissão insuficiente), então não foi possível verificar nomes nem substituir secrets. Um administrador deve conferir/substituir `DISCORD_WEBHOOK_URL` e `SLACK_WEBHOOK_URL` diretamente em **Settings → Secrets and variables → Actions** e validar respostas 2xx. Não enviar as URLs no repositório ou em chat.
