# EP555 — progressão do QG-WAR'I

## Modelo ativo

- As patentes e seus limites de Accur Points (XP) vêm do estatuto EP555: Zheers 0; Onith 15.000; Skeetw 45.000; Huran 100.000; Ven'Ex 250.000; Khael 500.000; Malakor 1.000.000; OverLord 5.000.000.
- O catálogo inclui as 12 certificações da matriz de especializações, com patente mínima e requisito Morth.
- Até existir um contador de Morth separado, o modelo usa `player_stats.kills`, que é incrementado após uma eliminação PvP confirmada.
- O jogador pode assumir uma certificação elegível no perfil/QG. O endpoint autenticado valida XP e Morth no servidor e grava somente no perfil da sessão. A migração `0001_ep555-specialization` adiciona `specialization_id`; ela ainda precisa ser aplicada pelo processo de deploy do projeto.
- O XP determina a patente retornada pela API, pelo QG e pela tabela competitiva; o campo persistido `rank` não é usado como autoridade para exibição.
- Esta entrega não adiciona uma solicitação manual de promoção no Painel de Operações: o processamento de partida mantém o comportamento existente de calcular a patente a partir do XP ao encerrar o ring.

## Alinhamento e limite desta entrega

Os limites de patente estão espelhados em `shared/schema.ts`, `KhaaosPlayerState.cpp` e `DefaultGame.ini`. Testes de fronteira garantem a promoção no XP exato e verificam a igualdade entre TS e UE5.

A concessão atual de XP por partida continua sendo a fórmula simples de colocação e eliminações de `RankingService.ts` (15–120 por colocação, mais 12 por kill). O EP555 descreve bônus diferentes por mundo e tipo de ação, mas o evento de partida ainda não carrega esses campos. Por isso, esta entrega modela os limites e exibe a progressão sem inventar esses bônus; a matriz de eventos e seu balanceamento ficam para uma etapa posterior. Com os limites novos, a progressão ficará mais lenta até essa matriz ser ligada.

Como os níveis anteriores eram muito menores, patentes antigas são recalculadas pelo XP atual e podem cair ao usar os limites EP555; nenhum XP é apagado nem alterado por esta migração.
