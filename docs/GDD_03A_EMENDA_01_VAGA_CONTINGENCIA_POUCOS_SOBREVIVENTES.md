# Emenda GDD-03A-01 — Vaga de contingência para poucos sobreviventes

**Versão da emenda:** 0.1 — 20 de outubro de 2026<br>
**Documento-base:** GDD-03A, *Progressão e persistência em sete dias*, versão 0.2<br>
**Status:** supersedida pela [Emenda GDD-03A-02](GDD_03A_EMENDA_02_RING_100_CORTE_10MIN_CIE.md); preservada abaixo apenas como histórico da regra anterior.

> **Não usar este documento como regra vigente.** O corte top-20% e a vaga única para menos de cinco sobreviventes foram substituídos pelo Ring de 100 participantes, avaliação de 10 minutos e avanço top-10 definido na Emenda 02.

## Objetivo e escopo

Esta emenda complementa o modelo de classificação do GDD-03A. “Grupo” significa o conjunto de participantes do mesmo Ring/matchmaking, até a capacidade do modo; não significa uma squad. A regra vale nos Dias 1–6. No Dia 7 há somente a disputa do título e nenhuma vaga de contingência.

## Redação proposta para a seção 2 — Fluxo de classificação

> **Corte normal.** Para um Ring com `N` participantes, o limite de posição do corte normal é `C = floor(N × 20%)`. Um participante só se classifica pelo corte normal se estiver vivo no momento da avaliação e sua posição geral no Ring for igual ou inferior a `C`. O corte é aplicado por grupo de matchmaking, e não ao total de participantes de outros Rings.
>
> **Vaga de contingência — Dias 1 a 6.** Se houver de um a quatro sobreviventes no fechamento do Ring (`1 ≤ S < 5`) e o sobrevivente de melhor posição estiver fora do corte normal, concede-se uma única vaga de contingência a esse jogador. A elegibilidade é calculada a partir da mesma classificação autoritativa do Ring: o primeiro sobrevivente, sua posição geral e o total de sobreviventes devem ser consistentes. Se o melhor sobrevivente já estiver dentro do corte normal, não se cria vaga adicional; os demais jogadores avançam somente se também satisfizerem a regra normal. Um jogador morto não pode receber a vaga. Extração, por si só, não concede classificação.
>
> A contingência é um **backfill para um Ring com poucos sobreviventes**, não um bônus de XP e não uma autorização automática para acrescentar um jogador a um conjunto que já classificou sobreviventes pelo corte normal. Uma vaga pode levar um sobrevivente para além do limite de posição `C`, mas não classifica os demais sobreviventes fora do corte.
>
> **Exceção do Dia 7.** A vaga de contingência não se aplica ao Ring final. O campeão do ciclo é o sobrevivente em primeiro lugar; os demais não avançam para um oitavo dia.

A ordem de desempate usada para decidir quem é o melhor sobrevivente deve ser determinística e igual à ordem aplicada no resultado final do Ring. O GDD-03A sugere sobrevivência, posição final, objetivo concluído e dano validado; fórmula de score, precisão, fonte dos eventos e resolução de empates continuam pendentes. O serviço de jogo não deve aceitar score, posição ou contagem de sobreviventes enviados pelo cliente.

## Redação proposta para a seção 8 — Integridade e casos de teste

Adicionar aos casos obrigatórios:

- Em 100 participantes, corte 20 e exatamente dois sobreviventes nas posições gerais 21 e 22: posição 21 qualifica pela contingência; posição 22 é eliminada.
- Em 100 participantes e dois sobreviventes nas posições 19 e 20: ambos qualificam pelo corte normal, sem contingência.
- Em um Ring com quatro participantes e dois sobreviventes nas posições 3 e 4: como `floor(4 × 20%) = 0`, somente o melhor sobrevivente recebe a vaga. Esse caso demonstra por que o mínimo de participantes por Ring precisa ser uma decisão separada.
- No Dia 7, com dois sobreviventes: primeiro lugar vivo é campeão; segundo lugar é eliminado; nenhum dos dois usa a contingência.
- Testar `S = 0`, `S = 1`, `S = 2`, `S = 4` e `S = 5`, além de posições empatadas, falha de servidor, repetição de evento e inconsistência entre colocação geral e posição entre sobreviventes.

## Redação proposta para a seção 9 — Decisões que exigem aprovação

Adicionar a decisão **“Vaga de contingência quando restam menos de cinco sobreviventes”**, com recomendação: aplicar nos Dias 1–6 somente ao melhor sobrevivente fora do corte normal; não gerar XP/recompensa adicional; não aplicar no Dia 7. Aprovação necessária: responsável de produto e design competitivo.

Manter separada a decisão **“Mínimo de participantes por Ring”**. A regra de poucos sobreviventes não define esse mínimo. Como o protótipo aceita `N ≥ 1`, sem um mínimo explícito um Ring de quatro participantes pode gerar uma vaga mesmo quando o corte normal é zero; um Ring solo também poderia promover seu único participante. Essa situação precisa ser aprovada, limitada pelo matchmaking ou tratada como `void`, antes de liberar a campanha ranqueada.

## Impactos de balanceamento e controles

A contingência reduz o risco de um Ring terminar sem nenhum classificado vivo dentro do corte. Com dois sobreviventes em um Ring de 100, se ambos estiverem fora do corte normal, a regra mantém apenas o melhor deles na campanha. Se ambos estiverem nas posições 19 e 20, os dois já passam pela regra normal e não se cria uma terceira vaga. Assim, a contingência altera quem pode avançar quando o corte normal não contém um sobrevivente, e não aumenta automaticamente o número de classificados.

O limite entre quatro e cinco sobreviventes cria uma descontinuidade: com cinco sobreviventes, a vaga não existe; com quatro, ela pode ser aplicada ao melhor fora do corte. Isso pode incentivar perseguição ao final da partida, cooperação indevida ou tentativas deliberadas de alterar a contagem de sobreviventes. Também pode permitir avanço em salas subdimensionadas. Para reduzir o risco, o sistema deve usar uma única avaliação de grupo, ranking autoritativo e um mínimo de participantes aprovado.

Não conceder multiplicador, XP ou loot extra por usar a vaga. A promoção deve mudar somente a elegibilidade para a etapa seguinte; XP segue as regras normais de ações validadas, sobrevivência e objetivos. A UI deve explicar o motivo da classificação — corte normal ou contingência — para evitar surpresa.

Monitorar por Ring: participantes admitidos, sobreviventes no corte, vagas de contingência concedidas, classificados totais, frequência por modo/região/horário, abandonos, suspeitas de combinação e tamanho da fila do próximo dia. A taxa de contingência deve ser avaliada por coortes e por versão das regras antes de alterar o limiar.

## Simulação de referência — Ring com dois sobreviventes

Os resultados abaixo foram executados com `resolveCampaignAttempt` no protótipo. São vetores determinísticos de classificação, não uma simulação de score bruto: o módulo recebe posições já calculadas e ainda não implementa uma fórmula de pontuação.

| Dia | Participantes | Sobreviventes | Posições gerais / entre sobreviventes | Resultado |
|---|---:|---:|---|---|
| 1 | 100 | 2 | 21 / 1 e 22 / 2 | O primeiro sobrevivente classifica pela contingência; o segundo é eliminado. |
| 1 | 100 | 2 | 19 / 1 e 20 / 2 | Ambos classificam pelo corte normal; nenhuma contingência é usada. |
| 1 | 4 | 2 | 3 / 1 e 4 / 2 | O primeiro recebe a vaga; o segundo é eliminado. Isso excede a proporção normal de 20% e evidencia o risco de Ring pequeno. |
| 7 | 100 | 2 | 1 / 1 e 2 / 2 | O primeiro é campeão; o segundo é eliminado; contingência desativada. |

A execução automatizada atual passou em 14 testes, incluindo as fronteiras acima. O resumo detalhado e o roteiro de apresentação estão em [`GDD_7_DIAS_PERSISTENCIA_SIMULACAO_ROTEIRO.md`](GDD_7_DIAS_PERSISTENCIA_SIMULACAO_ROTEIRO.md).

## Registro de alteração recomendado

Ao aprovar a regra, atualizar GDD-03A para uma versão seguinte e registrar que esta emenda substitui qualquer leitura do “até 20%” que impeça o backfill descrito. Até a aprovação, manter o texto marcado como proposta e não anunciar a exceção como regulamento definitivo aos jogadores.
