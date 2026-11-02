# Khaaos Run — Persistência em 7 dias, simulações de fronteira e roteiro (snapshot histórico)

**Versão:** 0.2 — 20 de outubro de 2026<br>
**Uso:** especificação para a próxima etapa de desenvolvimento<br>
**Status:** snapshot histórico de 20 de outubro de 2026; regras de classificação supersedidas pela [Emenda GDD-03A-02](GDD_03A_EMENDA_02_RING_100_CORTE_10MIN_CIE.md).

> **Atenção:** as seções de classificação e simulação abaixo documentam a proposta anterior top-20%/contingência e não são o regulamento vigente. Use a Emenda 02 para as regras atuais; este arquivo fica preservado somente para rastreabilidade da análise anterior de persistência.

## Resumo executivo

A campanha é concebida como uma sequência de sete incursões: o estado do jogador deve sobreviver ao encerramento de cada Ring, à desconexão e à reinicialização do servidor. O banco de dados deve ser a fonte de verdade; a memória do servidor e o SaveGame local/cloud podem servir como cache ou transporte, mas não confirmar sozinhos uma classificação.

A regra de progressão atualmente prototipada é: avançam jogadores vivos dentro do corte `floor(participantes × 20%)`; se houver menos de cinco sobreviventes e o melhor classificado entre eles estiver fora desse corte, ele recebe uma vaga de contingência. No sétimo dia, o sobrevivente em primeiro lugar vence a campanha. A regra pura e os seus testes existem no branch local, mas **a campanha ainda não está ligada ao timer real de 10 minutos, ao matchmaking, ao Unreal nem a armazenamento durável**.

As simulações abaixo são vetores determinísticos de fronteira executados contra o código atual; não são telemetria de partidas, nem uma fórmula de pontuação. O protótipo recebe posições já calculadas pelo servidor. Empates e o cálculo de posição ainda precisam de regra e integração próprias.

## 1. Estado atual verificado

O módulo [`campaignProgression.ts`](../server/game/campaignProgression.ts) contém funções puras para criar progresso, consumir a tentativa diária e resolver um resultado. O estado em memória inclui campanha, jogador, dia, situação (`READY`, `IN_RING`, `ELIMINATED` ou `COMPLETED`), Ring ativo e até sete resoluções. O replay de um `matchId` já processado é reconhecido **quando a resolução anterior está presente no estado recebido**.

A cobertura em [`campaign-progression.test.ts`](../tests/official/campaign-progression.test.ts) passou em **14/14 testes**, executados com Node 22.13.0. Foram executadas 22 resoluções determinísticas de fronteira: as 14 anteriores e mais oito resultados de jogador em quatro configurações com dois sobreviventes. Isso não prova gravação em banco, concorrência entre processos, execução em Unreal ou funcionamento em produção.

O resultado recebido pelo módulo contém `participantCount`, `placement`, `survivorCount`, `survivorPlacement`, `aliveAtEvaluation` e `extracted`. Ele não recebe pontos brutos, objetivo concluído, dano nem timestamp de sobrevivência. Portanto, o código não implementa um score composto ou o desempate sugerido no GDD-03A. O chamador deverá fornecer resultados calculados pela autoridade do servidor; nunca aceitar esses campos de um cliente.

O GDD-03A v0.2 declara suas regras como **proposta, não regra aprovada**. A vaga para grupos com menos de cinco sobreviventes agora está formalizada como emenda proposta em [`GDD_03A_EMENDA_01_VAGA_CONTINGENCIA_POUCOS_SOBREVIVENTES.md`](GDD_03A_EMENDA_01_VAGA_CONTINGENCIA_POUCOS_SOBREVIVENTES.md); falta aprovação de produto/design para torná-la regulamento final.

## 2. Estrutura proposta para persistência

### 2.1 Fonte de verdade e limites de confiança

O serviço de partida valida identidade e resultado; o coordenador da campanha aplica a máquina de estados; o PostgreSQL persiste o estado e os resultados. A Unreal recebe apenas o resultado confirmado pelo servidor e apresenta a etapa seguinte no War’I. Redis, estado em memória, PlayerState replicado e SaveGame não substituem o commit durável.

A proposta mantém quatro responsabilidades separadas:

1. **Definição da campanha:** calendário, mundo, modo, capacidade, janela, versão das regras e estado operacional.
2. **Progresso do participante:** dia atual, situação, Ring ativo e eventual vaga de qualificação.
3. **Tentativa diária:** reserva única para o dia; impede duas filas ou dois Rings ranqueados concorrentes para a mesma pessoa.
4. **Resultado imutável por participante e Ring:** posições, sobrevivência, decisão, versão das regras e referência ao resultado autoritativo da partida.

### 2.2 Tabelas recomendadas

Os nomes são sugestões de schema, não migrations já aplicadas.

| Tabela lógica | Chave e campos principais | Objetivo |
|---|---|---|
| `campaigns` | `campaign_id`; mundo/modo; `rules_version`; início/fim; fuso horário; janela diária; estado | Fixar qual calendário e qual conjunto de regras rege cada ciclo. |
| `campaign_player_state` | chave única (`campaign_id`, `player_id`); `day`; `status`; `active_match_id`; `revision`; `updated_at` | Snapshot consultável e recuperável da posição atual do jogador na campanha. |
| `campaign_attempts` | `campaign_id`, `player_id`, `day`, `match_id`, `status`, `started_at`, `resolved_at`; unicidade por participante/dia e por match/participante | Consumir uma tentativa atomicamente e permitir retomar/reconciliar um Ring. Estados sugeridos: `RESERVED`, `IN_PROGRESS`, `RESOLVED`, `VOIDED`. |
| `campaign_match_results` | `campaign_id`, `day`, `match_id`, `player_id`, participantes, sobreviventes, posições, estado vivo, extração, resultado/motivo, `rules_version`, `resolved_at`; chave única por campanha/dia/match/jogador | Histórico auditável e idempotência por participante; não sobrescrever a decisão anterior. |
| `campaign_reward_events` (ou ledger de XP equivalente) | chave única por evento, jogador, match e tipo de recompensa; XP concedido e referência | Impedir duplicação de XP/itens em retries; reconciliar resultado e perfil. |

O progresso da campanha não deve ser a única cópia do histórico. A tabela de resultado preserva a evidência imutável; `campaign_player_state` é o estado atual/materializado que pode ser reconstruído ou reconciliado.

### 2.3 Fluxo atômico de cada incursão

**A. Entrada/reserva.** Após autenticação e validação de elegibilidade, o servidor abre uma transação, bloqueia a linha do participante (`SELECT … FOR UPDATE` ou equivalente), verifica campanha/dia/status e insere a tentativa única do dia. Um índice único em (`campaign_id`, `player_id`, `day`) impede que duas solicitações concorrentes consumam duas entradas. O servidor cria/atribui o `match_id`, fixa o loadout/estado inicial exigido e marca o participante `IN_RING`. Se a operação for repetida com a mesma chave, deve retornar a tentativa existente; uma segunda chave não pode criar outra tentativa.

**B. Execução.** O servidor autoritativo mantém timer, vida, eventos, posição, desconexão e reconexão. O resultado de classificação deve derivar de eventos validados do servidor. A proposta GDD sugere sobrevivência como critério primário, seguida de posição final, objetivo concluído e dano validado; a fórmula, resolução de empates e timestamp exato do corte ainda não estão implementados.

**C. Resolução.** No corte aprovado, o servidor calcula uma única classificação do grupo e um resultado por jogador. Em uma transação, insere o resultado imutável com chave única, atualiza tentativa e estado, avança o dia somente para quem qualificou e registra XP/eventos de recompensa com chave idempotente. Repetir a mesma resolução deve devolver os resultados já gravados, sem conceder XP, loot ou avanço novamente. Validar `active_match_id` e `rules_version` impede que um evento antigo altere uma etapa nova.

**D. Retorno ao War’I.** Após o commit, a Unreal apresenta o resultado confirmado e permite o retorno ao QG. Recompensas de loot/PackBack só entram no inventário conforme regra publicada de extração/validação. Se uma recompensa residir em outro sistema (por exemplo, EOS/cloud), usar outbox transacional e consumidor idempotente; não anunciar atomicidade entre serviços enquanto ela não existir.

### 2.4 O que persiste e o que reinicia

A tabela segue a matriz proposta do GDD-03A, sujeita a aprovação de design e economia do jogo.

| Dado | Entre Rings / dias | Após eliminação | Ao final dos sete dias |
|---|---|---|---|
| Dia, status e vaga | Atualizar uma vez por resultado confirmado; classificado passa ao próximo dia. | Fica `ELIMINATED` no ciclo atual; sem nova entrada ranqueada. | Arquivar o resultado e limpar apenas a elegibilidade do ciclo. |
| XP/Accur validado | Somar no encerramento do Ring; manter registro de origem e versão. | Não retirar XP já validado; descartar ações não confirmadas. | Persistir entre ciclos, sem reset automático. |
| Patente/especialização/guilda | Perfil persiste; promoção pode ficar pendente para próxima entrada, como propõe o GDD. | Não rebaixar nem apagar progresso. | Persistir, salvo regra de temporada aprovada. |
| WarBag/inventário guardado | Seguro no QG; não saqueável dentro do Ring. | Mantido no perfil. | Persistir. |
| PackBack e loot do Ring | Temporário até extração/qualificação e validação; salvar somente o que a regra autorizar. | Perda/pilhagem depende da regra de jogo publicada. | Manter apenas itens devidamente recuperados/bancados. |
| VL/VD, sequelas e status | Persistir e exigir tratamento aprovado antes da próxima entrada; sem cura automática presumida. | Não autorizar reentrada só por trocar de mapa. | Recuperação depende de regra de debrief explícita. |
| Temporizador, posição, zona, loot não bancado e efeitos da instância | Reiniciar no Ring seguinte. | Encerrar com a partida. | Não carregá-los para outro ciclo. |
| KRC/valor real | Não usar depósito, saque, cashback, criptoativo ou promessa financeira na campanha. | Nenhum saldo real perdido ou pago. | Nenhuma conversão para valor financeiro. |

XP atual pertence ao perfil persistente existente; a campanha deve referenciar e atualizar esse perfil uma vez, sem duplicar um segundo saldo de XP. A proposta do GDD é conceder XP validado no encerramento e manter XP/patente mesmo após eliminação.

### 2.5 Desconexão, reinício e indisponibilidade

- Reautenticar o jogador e reanexar à mesma tentativa/match dentro de uma janela de reconexão aprovada; não criar outra entrada.
- Se o servidor cair, recuperar estado de campanha do banco e consultar evidência persistida do match. Não inferir sobrevivência de um cache expirado.
- Para falha de serviço confirmada, aplicar política explícita de rematch/void. Marcar `VOIDED` uma vez, liberar/refazer a tentativa somente conforme regra aprovada e deduplicar qualquer compensação.
- Se não houver resultado autoritativo recuperável, não conceder avanço ou recompensa automaticamente; encaminhar para política de adjudicação definida pelo produto/ops.
- Manter métricas e trilha de auditoria para entrada, desconexão, morte, classificação, XP, retorno e reconciliação.

## 3. Simulações determinísticas de fronteira

**Convenção:** `corte = floor(N × 0,20)`, em que `N` é o número de participantes do Ring. “Posição geral” e “posição entre sobreviventes” já são valores ordenados fornecidos ao código. A vaga de contingência se aplica antes do dia 7 quando há de 1 a 4 sobreviventes e o jogador é o sobrevivente melhor colocado (`survivorPlacement = 1`), mas está fora do corte normal. A regra exige que ele esteja vivo no instante de avaliação.

| Cenário | N | Corte | Sobreviventes | Posição geral / entre sobreviventes | Resultado observado |
|---|---:|---:|---:|---|---|
| Limite do top 20% | 100 | 20 | 8 | 20 / 4 | Classifica pelo corte normal; dia seguinte. |
| Uma posição além, cinco sobreviventes | 100 | 20 | 5 | 21 / 1 | Eliminado; grupo não é elegível ao fallback. |
| Quatro sobreviventes; melhor fora do corte | 100 | 20 | 4 | 24 / 1 | Classifica pela vaga de contingência; dia seguinte. |
| Quatro sobreviventes; segundo entre eles | 100 | 20 | 4 | 25 / 2 | Eliminado; a vaga de contingência é única. |
| Quatro sobreviventes já dentro do corte | 100 | 20 | 4 | 20 / 4 | Classifica pelo corte normal; fallback não usado. |
| Limite com N=24 | 24 | 4 | 5 | 4 / 4 | Classifica; `floor(4,8) = 4`. |
| Uma posição além com N=24 e cinco vivos | 24 | 4 | 5 | 5 / 1 | Eliminado; sem fallback. |
| Uma posição além com N=24 e quatro vivos | 24 | 4 | 4 | 5 / 1 | Classifica pela contingência. |
| Grupo de quatro; primeiro colocado | 4 | 0 | 4 | 1 / 1 | Classifica pela vaga de contingência. |
| Grupo de quatro; segundo colocado | 4 | 0 | 4 | 2 / 2 | Eliminado; somente o melhor recebe a vaga. |
| Dois sobreviventes, ambos dentro do corte | 100 | 20 | 2 | 19 / 1 e 20 / 2 | Ambos classificam pelo corte normal; contingência não usada. |
| Dois sobreviventes, ambos fora do corte | 100 | 20 | 2 | 21 / 1 e 22 / 2 | Só a posição 21 classifica pela contingência; posição 22 é eliminada. |
| Dois sobreviventes em Ring com quatro participantes | 4 | 0 | 2 | 3 / 1 e 4 / 2 | Só o melhor classifica; mostra risco de lobby subdimensionado. |
| Colocação alta, mas morto no corte | 100 | 20 | 4 | 1 / — | Eliminado; sobrevivência é obrigatória. |
| Dia 7, primeiro e vivo | 100 | 1* | 4 | 1 / 1 | Campeão; estado `COMPLETED`. |
| Dia 7, segundo e vivo | 100 | 1* | 4 | 2 / 2 | Eliminado; não é campeão. |
| Dia 7, primeiro nominal, mas morto | 100 | 1* | 3 | 1 / — | Eliminado; não se declara campeão morto. |
| Dia 7, dois sobreviventes | 100 | 1* | 2 | 1 / 1 e 2 / 2 | Primeiro é campeão; segundo é eliminado; sem contingência. |

\* O código reporta `qualifierLimit = 1` no dia 7; a vitória final exige jogador vivo em posição 1, não uma vaga diária top 20%.

Os resultados foram obtidos invocando as funções do módulo atual, sem aleatoriedade. A cobertura automatizada atual é de 14 testes. A expressão “cenário de pontuação” não deve ser confundida com score bruto: o módulo não implementa a soma de pontos nem desempata valores iguais. Ele valida a fronteira de posições já ordenadas.

### Impactos de balanceamento

Com 100 participantes e dois sobreviventes nas posições 21 e 22, somente o primeiro dos dois ganha a vaga; a contingência evita que o Ring deixe de avançar alguém vivo fora do corte. Se os dois sobreviventes estiverem nas posições 19 e 20, ambos já avançam pelo corte normal e não há uma terceira vaga. Portanto, com ranking consistente, a contingência funciona como backfill quando nenhum sobrevivente está dentro do corte; não é um bônus automático que se soma aos sobreviventes já classificados.

A fronteira entre quatro e cinco sobreviventes pode incentivar perseguição no fim da partida ou combinação para alterar a contagem. O caso de lobby pequeno é mais crítico: com quatro participantes, `floor(4 × 20%) = 0`, mas a contingência permite a passagem de um dos dois sobreviventes; com apenas um participante, o código atual também permitiria progressão se ele sobreviver. **A quantidade mínima de participantes por Ring precisa ser definida separadamente**, antes do modo ranqueado.

Para preservar o balanceamento da economia, a contingência deve alterar somente elegibilidade para o próximo dia. Não deve conceder XP, loot ou multiplicadores extras. Acompanhar taxa de uso, tamanho dos Rings, posição geral dos classificados, resultados por modo/região/horário, tentativas de combinação e volume de fila no dia seguinte.

### Leitura dos limites e riscos

1. O corte é arredondado para baixo: com 24 participantes, quatro vagas; com quatro, o corte normal é zero e a contingência cria uma vaga.
2. Com quatro sobreviventes em um grupo grande, o fallback não libera todos: só o melhor sobrevivente fora do corte normal recebe a vaga. Quem já está no top 20% avança pela regra normal; com ranking consistente, a contingência não acrescenta uma vaga além dos sobreviventes já dentro do corte.
3. A regra admite uma vaga mesmo em um grupo de quatro participantes e, tecnicamente, em grupo de um participante. Isso pode permitir progressão sem competição real. **Definir mínimo de participantes aceitos por Ring é bloqueador**; o usuário aprovou a exceção de sobreviventes, não um mínimo de fila.
4. Empate de score/posição não foi simulado porque a API atual exige inteiros sem empate. Fechar ordem determinística antes de produção; o GDD-03A sugere sobrevivência, posição final, objetivo e dano validado nessa ordem.
5. O número de sobreviventes e o ranking entre eles precisam vir do mesmo snapshot autoritativo do grupo, calculado uma vez; não podem ser recebidos como declarações independentes de cada cliente.

## 4. Roteiro de apresentação executiva — cerca de 5 minutos

### Slide 1 — A promessa da campanha

**Na tela:** “Sete dias. Uma incursão por etapa. Sobreviver habilita a próxima convocação.”<br>
**Fala:** “Khaaos Run transforma partidas curtas em uma campanha contínua. O jogador sai do War’I, participa do Ring, recebe um resultado validado e, se sobreviver e se classificar, volta ao QG para preparar a próxima etapa. Esta é uma regra de protótipo; o GDD-03A ainda marca o modelo como proposta para validação.”

### Slide 2 — Loop entre incursões

**Na tela:** War’I → reserva de entrada → Ring → validação server-side → resultado → War’I/próximo dia.<br>
**Fala:** “A tentativa é consumida uma vez por dia. O Ring é proposto como dez minutos dentro de uma janela operacional separada. Ao fechar a etapa, o servidor registra classificação e recompensas uma vez. O cliente recebe o resultado, mas não decide se sobreviveu, qual posição obteve ou quantos pontos ganhou.”

### Slide 3 — Corte normal e vaga de contingência

**Na tela:** `corte = floor(N × 20%)`; “vivo + dentro do corte = classificado”. Exemplo: 100 → 20; 24 → 4.<br>
**Fala:** “O corte usa arredondamento para baixo e a sobrevivência é obrigatória. Se restarem menos de cinco sobreviventes e o melhor entre eles estiver fora do corte, ele pode receber uma única vaga de contingência. Em um grupo de 100, as posições 21 e 22 com apenas dois sobreviventes avançam de forma diferente: só a posição 21 recebe a vaga. Se houver empate, ainda precisamos aprovar o desempate antes da integração final.”

### Slide 4 — O que persiste

**Na tela:** perfil durável versus estado temporário do Ring.<br>
**Fala:** “XP validado, patente, especialização, guilda e WarBag ficam no perfil. Estado da campanha, tentativa e resultados ficam registrados no servidor. Timer, zona, posição e loot ainda não validado reiniciam. PackBack, saúde e sequelas exigem regras claras de retorno e tratamento; não presumimos cura grátis nem recuperação automática.”

### Slide 5 — Integridade e recuperação

**Na tela:** PostgreSQL como fonte de verdade; chaves únicas; transação; reconexão ao mesmo match.<br>
**Fala:** “Uma chave única impede segunda tentativa no mesmo dia. Outra protege o resultado por jogador e partida. O registro do resultado, a mudança de etapa e o XP precisam ser gravados numa única operação idempotente. Se o servidor cair, reconstituímos a situação do banco e das evidências persistidas; não concedemos avanço com base em estado local perdido.”

### Slide 6 — Próximas decisões e gates

**Na tela:** mínimo de participantes, janela/fuso, desempate/score, desconexão/rematch, persistência real e build UE5.8.<br>
**Fala:** “Hoje a regra de classificação está prototipada e seus quatorze testes passam; as 22 resoluções determinísticas confirmam os limites descritos, incluindo o Ring com dois sobreviventes. Ainda não existe armazenamento durável dessa campanha nem ligação com o GameMode/timer do Unreal. O roadmap do próprio repositório mantém a build UE5.8 e o vertical slice bloqueados por ambiente licenciado e integração. O próximo gate é aprovar mínimo de participantes e desempate, implementar as gravações transacionais e então testar o ciclo completo no servidor e no cliente Unreal.”

### Fecho

**Fala:** “A meta é que cada retorno ao War’I seja confiável: a campanha lembra onde o jogador chegou, recompensa só o que foi validado e nunca duplica uma vaga ou um XP por repetição de evento.”

## 5. Próximas tarefas recomendadas

1. Aprovar mínimo de participantes por modo e como formar grupo quando há baixa população; decidir se a exceção de grupo pequeno é exatamente uma vaga de fallback para o melhor sobrevivente.
2. Aprovar métrica e desempates; definir como converter eventos autoritativos em posições geral e entre sobreviventes.
3. Aprovar horário/fuso e regra das 12 horas; fechar desconexão, AFK, falha de serviço, rematch/void e revives por modo.
4. Implementar migrations e serviço transacional PostgreSQL com restrições de unicidade, locks e ledger de recompensas idempotente; adicionar testes concorrentes e testes de reinício com banco descartável.
5. Conectar o coordenador ao sistema autoritativo de partidas e a um contrato versionado Unreal ↔ backend; não expor rota pública para o cliente escrever resultados.
6. Validar transições, reconnect e recuperação de servidor em runtime; depois compilar com Unreal Engine 5.8 e executar Automation Tests num ambiente licenciado.
7. Só então considerar UI no War’I, conteúdo de debrief e operação do bracket; manter qualquer economia financeira fora desse escopo.

## Referências de projeto

- `GDD_KhaaosRun_v02/GDD_03A_Progressao_Persistencia_7_Dias.docx` — proposta de sete etapas, persistência, morte e integridade competitiva.
- `GDD_03A_EMENDA_01_VAGA_CONTINGENCIA_POUCOS_SOBREVIVENTES.md` — emenda proposta para a vaga de contingência e análise de balanceamento.
- `GDD_KhaaosRun_v02/GDD_06_Analise_Conflitos_Design_Tecnologia.docx` — decisões P0/P1 ainda abertas.
- `server/game/campaignProgression.ts` e `tests/official/campaign-progression.test.ts` — protótipo e testes atuais.
- `Unreal/README.md` e `docs/ROADMAP.md`, Fase 4 — build UE5.8, testes em mundo e integração continuam pendentes/bloqueados neste ambiente.
