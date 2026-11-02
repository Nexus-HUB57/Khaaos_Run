# ADR-CIGKV — Contrato espacial e distribuição do mapa

**Status: DRAFT — NÃO APROVADO**
**Data do rascunho:** 31/10/2026
**Escopo:** contrato espacial, categorias e distribuição de spawns, setores, loot, fonte canônica e consumo em runtime do mapa CIGKV.
**Efeito sobre os dados atuais:** nenhum. Este documento não aprova nem autoriza migração, edição ou deslocamento de coordenadas.

> **Bloqueio obrigatório:** não migrar, regenerar, editar ou deslocar coordenadas, nem sincronizar cópias de dados, antes de (1) aprovação explícita do responsável de produto/design para as decisões aplicáveis e (2) confirmação e validação da geometria e do consumidor no mapa/runtime Unreal efetivamente utilizado. Os limites de 500 cm de spacing e 100 cm de clearance spawn–ZEX encontrados em ferramentas são thresholds técnicos legados, não regras de design aprovadas por este rascunho.

## 1. Contexto e problema

Os artefatos disponíveis descrevem contratos espaciais e distribuições incompatíveis. As cópias de `config/levels/CIGKV_level_data.json` e `Unreal/KhaaosRun/Content/Maps/CIGKV/CIGKV_level_data.json` são idênticas byte a byte e declaram dimensões de 2.048 × 2.048 cm, 50 pontos de spawn com distribuição 5/25/20 por rótulo (ArmoryHub/ProvingGrounds/Park), e 60 posições de loot cuja raridade observada é 30/17/8/3/2 (common/uncommon/rare/epic/legendary). A igualdade das cópias não demonstra qual delas é fonte canônica.

O guia CIGKV e os defaults declarados de `UKhaaosCIGKVMapData` indicam 10.000 × 10.000 cm, distribuição de spawn 15/20/15 e distribuição/contagens de loot 10/25/25. O validador legado, por sua vez, espera 5/20/25 para spawn e 30/15/10/3/2 para raridade. São referências divergentes; nenhuma delas, isoladamente, resolve a intenção aprovada de produto.

A auditoria estática não comprovou que os 50 pontos dos JSONs governem a entrada de jogadores em runtime. O fluxo inicial examinado herda o comportamento de `PlayerStart`; caso `AKhaaosCIGKVLevel` esteja presente, o GameMode realiza depois um teleporte para uma das `ZuVariants`. Não foi encontrado consumidor gameplay para `UKhaaosCIGKVMapData::PlayerSpawnPoints`. O loader JSON tenta `ProjectConfigDir()/levels/CIGKV_level_data.json`, caminho ausente neste checkout. Não há `.umap`/`.uasset` versionado nem Unreal Editor disponível no ambiente examinado; associação do Level Actor, mapa carregado, geometria, `PlayerStart` e configuração efetiva dos assets permanecem por confirmar.

Portanto, estão separados neste ADR: **fatos observados**, **questões sem decisão**, e **recomendações técnicas provisórias**. Não se deve inferir aprovação a partir de convenções existentes, defaults de código, guias, contagens do JSON ou regras de ferramentas.

## 2. Referências e evidências de contexto

- [Auditoria do runtime canônico CIGKV, 30/10/2026](CIGKV_RUNTIME_CANONICAL_AUDIT_2026-10-30.md): caminhos de entrada, limites da análise estática, fontes examinadas, baseline JSON e verificações realizadas.
- [Plano de ação de distribuição de spawns CIGKV, 25/10/2026](CIGKV_SPAWN_DISTRIBUTION_ACTION_PLAN_2026-10-25.md): diagnóstico, questões da Fase B e gates propostos para as fases C–E. As recomendações ali descritas continuam sendo propostas, não decisões aprovadas.
- O inventário e a auditoria não substituem inspeção do mapa e assets de runtime nem uma aprovação de design. Nenhuma coordenada foi alterada como parte desse trabalho.

## 3. Decisões pendentes

A tabela abaixo é um registro de perguntas a resolver; as opções não constituem decisão. As recomendações, quando indicadas, são propostas técnicas provisórias e exigem validação/aprovação.

| ID | Tema / pergunta para decisão | Opções a considerar (não aprovadas) | Proposta técnica provisória (não é decisão) | Owner de aprovação / evidência necessária |
|---|---|---|---|---|
| D1 | **Dimensão, unidade e origem:** qual é o tamanho XY jogável, unidade e frame de coordenadas? Como Z se relaciona ao piso? | Manter 2.048 × 2.048 cm; adotar 10.000 × 10.000 cm; ou outra dimensão justificada pela geometria real. Origem no canto, no centro, ou frame definido pelo mapa. Altitude fixa ou Z resolvido por terreno/trace/NavMesh. | Avaliar 10.000 × 10.000 cm com XY de −5.000 a +5.000 cm e origem central, pois é a convenção indicada pelo guia/defaults referidos. Não adotar sem comparar com bounds, escala e origem do mapa carregado. Z deve ser validado no terreno, não presumido universalmente. | Product/Design (decisão de escala); Level/World Design e Unreal Engineering (bounds, grid, referência e teste no mapa). |
| D2 | **Categoria e finalidade dos spawns:** o que representam os 50 pontos e qual consumidor os seleciona? | Entrada de treino/onboarding; spawn inicial de BR; spawn de equipe/queda; geração/editor; outra finalidade. Uma lista comum ou listas distintas por modo/fase. | Separar explicitamente categorias e elegibilidade por modo caso a entrada de treino/Zu e o spawn inicial de BR sejam experiências distintas. Identificar primeiro o consumidor runtime real; não tratar a lista JSON como spawn inicial comprovado. | Product/Design (semântica e experiência); Gameplay/Unreal Engineering (fluxo/consumidor e seleção autoritativa); QA (verificação em PIE). |
| D3 | **Geometria dos setores:** quais são bounds, forma, posição, cobertura e relação com POIs/áreas jogáveis? | Retângulos atuais; polígonos definidos por Design; outra partição; regiões sobrepostas somente se explicitamente permitidas. Frações por área bruta ou área jogável útil. | Propor uma partição integral, sem lacunas nem sobreposições acidentais, com IDs/membership explícitos. As frações 1/8, 3/8 e 4/8 e faixas de largura 1.250/3.750/5.000 cm são apenas uma hipótese de trabalho registrada no plano; validar contra geometria/POIs antes de fixar. | Level/World Design (polígonos e POIs); Product/Design (intenção/frações); Engineering/Data (representação e validação geométrica). |
| D4 | **Contagens de spawn por modo e setor:** quantos pontos, de que tipo e em que regiões cada modo requer? | Preservar 5/25/20 do JSON; adotar 15/20/15 do guia/defaults; manter contagens distintas por modo ou categoria; outra distribuição com justificativa de gameplay. | Avaliar 15/20/15 somente como proposta para a categoria de entrada a que guia/defaults se referem. Não reutilizar automaticamente em BR competitivo nem inferir que cada setor tenha a mesma função em todos os modos. | Product/Design e Level Design, por modo; Gameplay/Engineering valida contagem e seleção implementada. |
| D5 | **Spacing, clearance e fairness:** quais regras espaciais se aplicam a cada categoria/modo? | Limites fixos aprovados após playtest; regras dependentes de cápsula, time, POI, cobertura, no-spawn volumes e modo; exceções explícitas. | Não promover 500 cm nem 100 cm a política. Definir métricas por modo, verificar colisão, NavMesh, linha de visão, proteção inicial, acessibilidade e distância à borda ZEX; medir e justificar exceções. | Product/Design e Competitive/Gameplay Design aprovam objetivos; Unreal Engineering implementa medições; QA executa testes; responsável por ZEX confirma a regra de proximidade. |
| D6 | **Política de loot:** as 60 posições são slots físicos fixos, pontos candidatos ou amostras de geração? Raridade é fixa por ponto ou probabilística? Quais metas por setor/fase/modo? | Manter raridade fixa observada 30/17/8/3/2; usar tabela esperada do validador 30/15/10/3/2; usar 10/25/25 como contagem por setor indicada no guia/defaults; definir pesos sorteados por seed; combinar slots e pesos. | Formalizar slots e política de raridade separadamente. Se o runtime sorteia por pesos, declarar pesos/seed e validar distribuições agregadas; se raridade for fixa, sincronizar registros com a tabela aprovada. Não tomar 10/25/25 como densidade justa sem playtest por área útil e população. | Product/Design e Loot/Gameplay Design aprovam política e metas; Engineering confirma consumidor/aleatoriedade e reprodutibilidade; QA mede por seed/fase. |
| D7 | **Fonte canônica e fluxo de publicação:** qual artefato é autoridade para editor, gerador, validação e servidor? | JSON em `config`; JSON em Content; Data Asset Unreal; schema-fonte com artefatos derivados; outra fonte explicitamente indicada. | Escolher uma única fonte consumida e versionada, com import/export ou geração determinística das cópias/artefatos; teste de drift em CI. Primeiro provar qual conteúdo o runtime carrega, inclusive caminho do JSON e referência de Data Asset. | Tech Lead/Architecture e Unreal Engineering propõem/confirmam fluxo; Product/Design aprova dados; Build/Release valida empacotamento. |
| D8 | **Consumidor de runtime e mapas/assets:** qual sequência e quais assets efetivamente implementam a entrada de jogador e o layout CIGKV? | Spawn padrão em `PlayerStart`; teleporte Zu; lista de spawns própria por modo; combinação explicitamente especificada; outro fluxo comprovado. | Recuperar mapa e assets exatos usados, identificar atores/configuração e reproduzir a partida em ambiente Unreal. Não atribuir função de runtime aos JSONs ou a `PlayerSpawnPoints` sem referência/seleção observada. | Unreal Engineering/Level Engineering fornece build, mapa, assets, referências e instrumentação; QA/Release confirma ambiente e modo; Design confirma intenção de produto. |

## 4. Questões obrigatórias aos owners

Antes de qualquer mudança de coordenadas, os owners devem registrar respostas rastreáveis às perguntas seguintes:

1. **Dimensão e origem:** quais limites XYZ e unidade correspondem ao mapa jogável aberto no Unreal? Qual ponto de origem, orientação dos eixos e regra para determinar Z do piso? Quais referências físicas/grid confirmam escala, offsets e bounds?
2. **Origem e categoria de spawn:** cada conjunto é entrada de treino, BR inicial, equipe/queda ou geração/editor? Qual estágio do fluxo seleciona cada conjunto? Como o jogador passa de `PlayerStart` para Zu, se aplicável, e essa realocação faz parte da experiência aprovada?
3. **Geometria dos setores:** quais polígonos/limites nomeados correspondem a cada região? A partição deve cobrir todo o espaço jogável? As frações são por área geométrica, área acessível ou outro critério? Como POIs, limites e exceções são representados?
4. **Contagens por modo:** quantos pontos por setor, categoria, equipe, modo e fase? Quais regras governam distribuição e repetição entre seeds? Como tratar zonas neutras/hubs que não devem servir a partidas competitivas, se aplicável?
5. **Spacing e clearance:** quais métricas e valores foram aprovados por modo, com que rationale e teste? Como medir clearance do limite de ZEX (incluindo raio), obstáculos, cápsula, água/áreas bloqueadas, visibilidade e proteção inicial? Quem aprova exceções?
6. **Política de loot:** os registros são posições fixas ou slots de sorteio? Raridade por ponto ou por peso? Qual tabela por setor, fase, modo e seed, e quais KPIs (item útil por jogador, tempo até arma/heal, densidade por área utilizável)?
7. **Fonte canônica:** qual artefato o servidor efetivamente consome? Como evitar drift entre JSON, Content, Data Asset, gerador e validadores? Qual comportamento operacional se a fonte estiver ausente/inválida — falha explícita ou fallback controlado e claramente não produtivo?
8. **Consumidor runtime:** quais mapa, build, WorldConfig, Data Assets, Blueprints, Level Actor, `PlayerStart` e seleção de spawn estarão ativos na validação? Como demonstrar no código e em PIE que a fonte escolhida é consumida para o modo em questão?

## 5. Responsáveis necessários e papéis

Os nomes próprios ainda não foram indicados. Antes da aprovação, preencher os campos abaixo com uma pessoa responsável e, se necessário, suplente. Uma aprovação genérica de equipe ou evidência apenas estática não substitui o owner.

| Papel necessário | Responsabilidade mínima | Pessoa / suplente |
|---|---|---|
| Product Owner / responsável de produto | Aprovar escopo, modos e objetivo da decisão; garantir que questões P0 tenham dono. | Pendente |
| Game/Level/World Design | Definir escala pretendida, setores, POIs, categorias/contagens e regras de experiência/fairness. | Pendente |
| Gameplay/Unreal Engineering | Identificar e instrumentar consumidor real, fonte runtime, seleção e migração/integração técnica. | Pendente |
| Loot/Gameplay Design | Aprovar densidade, pesos/raridades, distribuição por modo/fase e critérios de playtest de loot. | Pendente |
| QA / responsável por validação de build | Validar schema, análise espacial, mapa no Editor, PIE multiplayer e resultados por modo/seed. | Pendente |
| Build/Release ou responsável pela fonte de dados | Confirmar empacotamento/caminho da fonte canônica e proteção contra artefatos ausentes ou divergentes. | Pendente |

## 6. Recomendação técnica provisória (não é decisão)

Esta seção é uma proposta para orientar a avaliação; **não autoriza trabalho de migração nem estabelece política de produto**. Cada item depende da decisão correspondente acima e das evidências indicadas.

- Avaliar o frame central de 10.000 × 10.000 cm (−5.000 a +5.000 cm em XY), pois guia e defaults citados apontam nessa direção; confirmar escala e bounds no mapa real antes de escolher.
- Modelar setores como regiões nomeadas que particionam o espaço jogável de forma explícita. Tratar frações 1/8, 3/8, 4/8 e faixas 1.250/3.750/5.000 cm somente como alternativas geométricas iniciais, sujeitas a revisão por POIs e acessibilidade.
- Distinguir categorias de spawn por finalidade/modo e identificar o consumidor runtime. Avaliar 15/20/15 como proposta para entrada no ring, sem transferi-la automaticamente para BR.
- Tornar espaçamento, clearance e proteção parâmetros aprovados, mensuráveis e específicos ao modo; não promover constantes legadas de ferramenta a requisitos.
- Definir se loot é fixo ou probabilístico e validar densidade/experiência por simulação determinística e playtest. Manter contagens/raridades existentes como baseline observado, não como alvos aprovados.
- Eleger uma fonte canônica só depois de provar o pipeline runtime. Produzir cópias/importações como derivados verificáveis e controlar explicitamente falha de carregamento/fallback.
- Versionar schema e migração, preservar IDs e relatório before/after, com possibilidade de rollback, somente depois dos gates de aprovação e geometria.

## 7. Critérios de aceite e gates para fases C–E

Os gates abaixo detalham condições para seguir com a execução. **Nenhum gate converte o status deste documento em aprovação automática.** Se mapas/assets/runtime ou aprovação de produto/design não estiverem disponíveis, a fase que dependa deles permanece bloqueada.

### Fase C — schema, fonte canônica e migração controlada

**Gate de entrada:** este ADR foi aprovado pelos owners necessários; D1–D8 têm respostas registradas, inclusive tipo/consumidor dos pontos; o mapa e os assets efetivos foram disponibilizados e a transformação de frame foi confirmada contra eles.

**Critérios de aceite:**

- Schema versionado explicita unidade, dimensões/bounds, origem/frame, eixos, setores, IDs, tipo de spawn, elegibilidade por modo/fase e política de loot; validações rejeitam IDs duplicados, valores não finitos ou campos ambíguos.
- Um artefato é declarado fonte canônica e seu uso pelo servidor é demonstrado; cópias/artefatos derivados têm geração/import/export reproduzível e verificação de drift.
- Migração é determinística, aprovada e reversível; preserva IDs, registra coordenadas antes/depois e delta por ponto, não altera dados silenciosamente, e mantém baseline/rollback.
- Bounds e setores aprovados são completos e validados; membership é explícita, não inferida por lógica contraditória de coordenadas.
- Caminho de carregamento, empacotamento e comportamento de dado ausente/inválido são testados. Fallback não pode ativar silenciosamente dados não aprovados em ambiente de produção.
- Nenhuma coordenada é alterada durante o trabalho preparatório anterior a esses critérios e aprovações.

### Fase D — validador espacial, distribuição e análise reprodutível

**Gate de entrada:** schema/fonte e políticas aplicáveis aprovados; thresholds de spawn, clearance e exceções definidos pelos owners, em lugar de inferir 500/100 cm das ferramentas existentes.

**Critérios de aceite:**

- CLI/CI verifica schema, unidades, frame, dimensões, IDs, contagens por modo/setor e inclusão nos bounds; confirma que setores cobrem a área jogável conforme regra aprovada, sem gaps/overlaps não autorizados.
- Verificações geométricas incluem terreno/colisão/NavMesh, no-spawn volumes, dimensões de cápsula, regras de proteção e clearance medido até a borda do ZEX; violações e exceções são enumeradas e justificadas segundo política aprovada.
- Relatório de distâncias inclui pares, mínimos, percentis e histogramas separados por modo/equipe/POI, com critérios aprovados; não apresenta thresholds legados como decisão.
- Auditoria de loot relata contagens/pesos por setor e fase, itens úteis, pontos duplicados e cobertura; seleção probabilística é testada em muitas seeds com método, tolerância e resultados reprodutíveis.
- Testes de regressão cobrem limites, migração/rollback, parse, IDs, seeds e falha de carregamento. Relatórios baseline-versus-candidato e visualização top-down usam o mesmo frame e escala.

### Fase E — mapa Unreal, runtime e experiência

**Gate de entrada:** assets/mapa da build-alvo disponíveis e carregáveis em Unreal Editor; fonte canônica e configurações efetivamente usadas identificadas; plano de teste aprovado por modo.

**Critérios de aceite:**

- No Editor, grid, origem, eixos e referências conhecidas confirmam escala e alinhamento; bounds, setores, spawns, ZEX, loot e safe zone conferem com o contrato aprovado.
- Colisão, trace ao piso, NavMesh, line-of-sight e acessibilidade são verificados no mapa real para cada spawn elegível; nenhum ponto inválido ou fora do espaço permitido é aceito sem exceção formal.
- Teste multiplayer PIE confirma consumidor e seleção autoritativa de runtime para cada modo, fluxo `PlayerStart`/Zu quando aplicável, ausência de spawn em geometria inválida e comportamento consistente com seeds/reset.
- Playtests em mais de uma seed medem métricas aprovadas de loot, conflito inicial, proteção/fairness, acesso a equipamento, visita a POIs e uso de ZEX, reportadas separadamente por modo.
- Donos de produto/design avaliam resultados contra metas acordadas. Violações bloqueiam a aprovação final ou geram ação corretiva documentada, com dados e rollback.
- CI/análise portável, sozinhos, não são apresentados como prova da geometria ou experiência no mapa Unreal real.

## 8. Registro de aprovação

**Enquanto houver campo obrigatório em branco, o status permanece `DRAFT — NÃO APROVADO`.** Aprovação deve identificar a versão revisada deste ADR, decisões aprovadas/condicionais e data; aprovação condicional precisa explicitar condições e gate que a libera. Assinaturas abaixo não substituem a validação técnica do mapa/runtime.

| Papel | Nome | Decisão (aprovo / rejeito / condicional) | Escopo / condições / referência de evidência | Data (AAAA-MM-DD) | Assinatura ou registro rastreável |
|---|---|---|---|---|---|
| Product Owner / responsável de produto | Pendente | Pendente | Pendente | Pendente | Pendente |
| Game/Level/World Design | Pendente | Pendente | Pendente | Pendente | Pendente |
| Gameplay/Unreal Engineering | Pendente | Pendente | Pendente | Pendente | Pendente |
| Loot/Gameplay Design | Pendente | Pendente | Pendente | Pendente | Pendente |
| QA / responsável por validação | Pendente | Pendente | Pendente | Pendente | Pendente |
| Build/Release / fonte de dados | Pendente | Pendente | Pendente | Pendente | Pendente |

**Decisões/questões ainda abertas:** D1–D8, salvo registro explícito e aprovado por owner na tabela de decisões ou anexo rastreável.
**Data de revisão prevista:** Pendente.
**Estado final deste rascunho:** `DRAFT — NÃO APROVADO`.