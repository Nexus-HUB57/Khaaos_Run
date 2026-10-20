# EP555 — progressão do QG-WAR'I

## Modelo ativo

- As patentes e seus limites de Accur Points (XP) vêm do estatuto EP555: Zheers 0; Onith 15.000; Skeetw 45.000; Huran 100.000; Ven'Ex 250.000; Khael 500.000; Malakor 1.000.000; OverLord 5.000.000.
- O catálogo inclui as 12 certificações da matriz de especializações, com patente mínima e requisito Morth.
- Até existir um contador de Morth separado, o modelo usa `player_stats.kills`, que é incrementado após uma eliminação PvP confirmada.
- O jogador pode assumir uma certificação elegível no perfil/QG. O endpoint autenticado valida XP e Morth no servidor e grava somente no perfil da sessão. A migração `0001_ep555-specialization` adiciona `specialization_id`; ela ainda precisa ser aplicada pelo processo de deploy do projeto.
- O XP determina a patente retornada pela API, pelo QG e pela tabela competitiva; o campo persistido `rank` não é usado como autoridade para exibição.
- Esta entrega não adiciona uma solicitação manual de promoção no Painel de Operações: o processamento de partida mantém o comportamento existente de calcular a patente a partir do XP ao encerrar o ring.

## Alinhamento e Hierarquia End-to-End (5 Eixos)

Os limites de patente, as 12 especializações e a matriz de eventos EP555 estão espelhados em:
- `shared/schema.ts` e `shared/game-hierarchy.ts` (5 eixos canônicos + simulador determinístico `computeEp555MatchReward` e `evaluateOperativeHierarchyProfile`);
- `Unreal/KhaaosRun/Source/KhaaosRun/Player/KhaaosPlayerState.cpp` e `Unreal/KhaaosRun/Source/KhaaosRun/Game/Hierarchy/KhaaosHierarchySubsystem.h/.cpp` (UE5.8 C++20);
- `Unreal/KhaaosRun/Source/KhaaosRun/Config/DefaultGame.ini` (`[Khaaos.RankXpThresholds]`, `[Khaaos.Specializations]`, `[Khaaos.WorldHierarchy]`);
- Rotas `/api/hierarchy/overview`, `/api/hierarchy/simulate-ep555` e `/api/hierarchy/evaluate-operative` + painel interativo em `/hierarquia`.

A concessão base de XP em `RankingService.ts` permanece preservada para compatibilidade retroativa, enquanto `computeEp555MatchReward` (`shared/game-hierarchy.ts` ↔ `UKhaaosHierarchySubsystem::ComputeEp555MatchReward`) modela a matriz completa de multiplicadores por mundo (`CIGKV` 1.0x → `Barburhen` 1.35x → `Priadus` 1.75x → `Ckesalth` 2.25x → `Arukheea` 3.0x), decisões `Zu 1 / Zu 2 / Zu 3`, extrações `ZEX` (20%+ transferência) e *Desafio de Gigantes* (Top 50).

