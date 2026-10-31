# Plano de ação — reconciliar coordenadas e distribuição do CIGKV

**Data:** 25/10/2026 (plano); Fase A atualizada em 30/10/2026
**Estado:** Fase A — rastreamento estático concluído, validação de mapa/asset bloqueada; nenhum ponto do mapa foi movido.
**Objetivo:** estabelecer uma definição de mapa única, reproduzível e consumida de forma consistente pelo gerador, validadores e runtime, preservando fairness de spawn e uma distribuição de loot testável.

## Resumo executivo

Não é seguro corrigir as coordenadas escolhendo um dos JSONs ou deslocando pontos por uma constante: os artefatos discordam tanto sobre o tamanho do mundo quanto sobre sua origem e a forma dos setores. Também divergem as quantidades esperadas de spawn. Antes de tocar nos pontos, é preciso identificar o consumidor de runtime usado pela partida e aprovar uma decisão de design para escala, origem, setores e modos de entrada.

**Recomendação de trabalho para decisão:** usar o mapa de 10.000 × 10.000 cm já descrito no INI e no Data Asset, com origem no centro do mapa e limites XY de −5.000 a +5.000 cm. Representar os três setores como regiões contínuas, sem sobreposição nem lacunas, com áreas de 1/8, 3/8 e 4/8. Como proposta geométrica simples, podem ser faixas verticais de largura 1.250, 3.750 e 5.000 cm, respectivamente; validar com design antes de fixar, pois a forma/posição das POIs pode exigir limites irregulares.

**Recomendação de contagens candidata:** `15/20/15` pontos de entrada por ArmoryHub/ProvingGrounds/Park — converge com o guia de mapa e os defaults do `UKhaaosCIGKVMapData`. Para a partida competitiva, decidir separadamente se “spawn de entrada no ring” é o mesmo que “spawn inicial de BR”; se não for, criar categorias distintas em vez de reutilizar esses pontos. Para loot estático, `10/25/25` é a proposta de contagem do guia/Data Asset; validar densidade e tempo até o primeiro equipamento em playtest, não presumir que contagens iguais a densidades iguais.

As recomendações acima são uma proposta de ADR, não aprovação automática de produto.

## 1. Diagnóstico verificado

| Fonte | Dimensão/origem | Contagem de spawn | Setores/loot | Implicação |
|---|---|---:|---|---|
| `config/levels/CIGKV_level_data.json` | 2.048 × 2.048 × 256 cm; coordenadas positivas a partir de `(0,0)` | 5 / 25 / 20 | Setores em retângulos; 60 itens, raridade declarada 30/15/10/3/2 | A dimensão equivale a um quadrado de apenas 20,48 m de lado se `cm` estiver correto. |
| `docs/fase0/CIGKV_MAP_GUIDE.md` | Declara mapa 10.000 × 10.000 × 500 unidades | 15 / 20 / 15 | Loot 10 / 25 / 25; 15 ZEX | Contradiz as contagens de spawn do JSON e do validador. |
| `DefaultCIGKV.ini` e propriedades iniciais de `UKhaaosCIGKVMapData` | 10.000 × 10.000 × 500 cm; defaults centralizados no mundo Unreal | 15 / 20 / 15 | Loot 10 / 25 / 25 | Converge com o guia na dimensão e contagens, mas não com os setores geométricos atuais. |
| `UKhaaosCIGKVMapData::InitializeDefaults()` | coordenadas centralizadas; limites de X vão de −5.000 a +10.000, Y de −5.000 a +5.000 | 15 / 20 / 15, aleatórios | 10 / 25 / 25, aleatórios | Apesar de declarar mapa 10.000 cm, os setores cobrem 15.000 cm no eixo X; os defaults são não determinísticos e não aplicam clearance/rejeição. |
| `validate_spawn_points.py` e `generate_cigkv_map.py` | assumem mapa 2.048 × 2.048 cm | 5 / 20 / 25 | clearance de 100 cm para ZEX e raridade lida do JSON | Essas regras parecem ser uma interpretação do JSON, não uma decisão de design reconciliada. |
| `AKhaaosCIGKVLevelData` | carrega o JSON de `ProjectConfigDir()/levels/...`; fallback hard-coded de 10 spawns | JSON esperado em 50; fallback de 3 / 4 / 3 | outro caminho de runtime, com defaults simplificados | Confirmar se esta classe é efetivamente usada pela partida, ou se está duplicada/legada. |

Medições do JSON atual, reproduzidas neste ambiente:

- A contagem por rótulo de spawn é `ArmoryHub=5`, `ProvingGrounds=25`, `Park=20`; o validador espera `5/20/25`.
- As caixas declaradas dos setores no JSON cobrem **68,75%** do quadrado 2.048×2.048: ArmoryHub 6,25%, ProvingGrounds 25%, Park 37,5%. Os outros **31,25%** ficam fora das três caixas. Elas não implementam as frações 1/8, 3/8 e 4/8 citadas no próprio guia.
- Há **280 dos 1.225 pares** de pontos de spawn a menos de 500 cm. O limiar de 500 cm é uma constante de ferramenta e não consta aprovado como regra de fairness.
- **26 pares spawn–ZEX** ficam dentro de `raio ZEX + 100 cm`; também não há decisão de design que aprove esse clearance de 100 cm.
- Contando setor de loot pela regra geométrica hard-coded em `AKhaaosCIGKVLevelData.cpp`, os 60 pontos resultam em 7/27/26, não nos 10/25/25 documentados. O JSON não carrega `sector` em cada item de loot; o runtime infere a região por coordenadas.
- A raridade efetiva nos 60 registros é `common/uncommon/rare/epic/legendary = 30/17/8/3/2`; diverge da tabela `30/15/10/3/2` por dois pontos uncommon a mais e dois rare a menos.

## 2. Princípios e guardrails

1. **Não editar coordenadas antes de aprovar um ADR** sobre dimensão, origem, forma dos setores, categorias de spawn e regras de clearance.
2. **Uma única fonte canônica.** O dado que o servidor usa para iniciar a partida deve ser o mesmo dado que é validado e visualizado. Conteúdo Unreal, JSON auxiliar e script gerado devem ser derivados/checados contra essa fonte, não editados manualmente em paralelo.
3. **Unidades e frame explícitos.** Persistir unidade (`cm`), eixos, origem (centro ou canto), rotação e versão do schema. Fazer conversão de coordenadas em exatamente um lugar.
4. **Separar regras de produto de limites técnicos.** `min_spawn_separation`, clearance ZEX, densidade de loot e políticas de modo precisam ser configurações aprovadas com motivo e teste; remover “números mágicos” do gerador/validador.
5. **Reprodutibilidade.** Geração procedural usa seed identificável e resultado versionado; mesmos dados + seed produzem os mesmos pontos.
6. **Fairness por experiência.** Aprovar coordenadas não apenas por distância Euclidiana: incluir colisão/terreno navegável, line of sight, rotas, proximidade de arma/loot, proteção inicial e tempo até o primeiro encontro.

## 3. Plano por fases

### Fase A — congelar baseline e mapear runtime (pré-condição)

**Status (30/10/2026): PARCIAL — inventário estático e baseline concluídos; não foi comprovado um runtime canônico para os 50 pontos JSON.** Ver [auditoria de runtime canônico](CIGKV_RUNTIME_CANONICAL_AUDIT_2026-10-30.md).

**Ações**

- **Concluído — inventário estático:** rastreados JSONs, loader `AKhaaosCIGKVLevelData`, defaults `UKhaaosCIGKVMapData`, `AKhaaosCIGKVLevel`, `ZuVariants`, `WorldConfig.SpawnPoints`, gerador/validador e referências C++/runtime web. Os 50 pontos JSON não têm consumidor de spawn inicial demonstrado; novos jogadores aparecem primeiro no `PlayerStart` padrão e são reposicionados para uma `ZuVariant` somente se o `AKhaaosCIGKVLevel` existir.
- **Concluído — resolução de fontes:** o loader JSON tenta `Unreal/KhaaosRun/Config/levels/CIGKV_level_data.json`, ausente no checkout; portanto, se esse actor for usado sem arquivo instalado nesse destino, cai no fallback hard-coded de 10 spawns. O `DefaultCIGKV.ini` declara dimensões, mas nenhum carregamento foi encontrado e as propriedades examinadas não têm specifier `Config`.
- **Concluído — hash:** as cópias em `config/levels` e `Unreal/.../Content/Maps/CIGKV` são byte-idênticas (SHA-256 `499294fe150314ada68c06a6931434c5abf15741f84e84e8af7904930a002303`); a igualdade não identifica qual é canônica.
- **Concluído — baseline:** hashes, contagens e falhas atuais de spacing, distribuição, clearance ZEX e raridade estão registrados no relatório de auditoria. Não foi alterada nenhuma coordenada.
- **Bloqueado — confirmação de mapa/asset:** nenhum `.umap`/`.uasset` CIGKV está versionado e não há Unreal Editor/BuildTool disponível nesta sessão; não é possível provar associação/configuração do Level Actor, `PlayerStart`, terreno, nem validar pontos contra geometria.
- **Pendente — decisão de design:** confirmar com o responsável de produto/mapa se os 50 pontos representam entrada de treino, spawn BR inicial ou pontos de geração/editor; aprovar escala, origem e distribuição antes de alterar coordenadas.

**Entregáveis**

- Inventário estático e baseline com evidências em `docs/CIGKV_RUNTIME_CANONICAL_AUDIT_2026-10-30.md`.
- ADR-000X aprovado, incluindo as decisões da Fase B — **ainda pendente; não inferir aprovação a partir da auditoria**.

**Gate:** inventário estático concluído, mas não avançar à migração de pontos sem recuperar/confirmar o mapa e os assets efetivamente carregados e sem decisão para todas as perguntas P0 da Fase B. O runtime de spawn inicial e o uso dos 50 pontos JSON permanecem não comprovados.

### Fase B — aprovar contrato espacial e política de distribuição

**Decisões P0**

1. Dimensão: manter 10 km × 10 km como especificado no INI/guia/Data Asset ou justificar outra medida.
2. Origem: recomendação é centro do mapa em `(0,0,0)`, XY de −5.000 a +5.000 cm; definir Z de superfície como resultado de terreno/NavMesh, não como `z=0` universal.
3. Regiões: acordar polígonos/limites que formem uma partição completa, sem lacunas ou overlaps. As faixas 1.250/3.750/5.000 cm são proposta inicial para obter áreas 12,5/37,5/50% em mapa quadrado, não uma imposição de layout.
4. Tipos de spawn: declarar se os 50 pontos são `TrainingEntry`, `BRInitial`, `TeamDrop` ou outros. Se a área ArmoryHub é neutra/sem combate, não usá-la silenciosamente como spawn competitivo de BR; separar listas e regras por modo quando necessário.
5. Contagem por setor: avaliar proposta 15/20/15 para pontos de entrada do ring; se for BR competitivo, decidir contagem e regra por modo, em vez de herdar automaticamente 15 pontos na zona neutra.
6. Spacing e proteção: estabelecer algoritmo por modo usando distância mínima entre jogadores, dimensões da cápsula, cobertura/oclusão, no-spawn volumes e tempo sem combate; definir clearance real dos ZEX conforme gameplay. Não promover 500 cm e 100 cm existentes sem teste.
7. Loot: decidir se os 60 registros são posições físicas fixas ou slots para sorteio. Recomendação: pontos de loot não carregam raridade fixa como verdade de distribuição se o runtime vai sortear por `RarityWeights`; definir pesos determinísticos/seed e medir resultado agregado. Se raridade fixa é a regra, sincronizar os 60 registros à tabela aprovada.
8. Densidade por setor: decidir alvos de item útil/minuto, armas por POI e tempo médio até heal/arma. Contagens 10/25/25 podem iniciar o protótipo, mas devem ser ajustadas por área utilizável, população, acesso e risco, não apenas área bruta.

**Gate:** dono de design aprova ADR e exemplos numéricos; decisão documenta exceções da zona neutra, times/modos e distribuição de raridade.

### Fase C — padronizar schema e migrar dados uma única vez

**Ações**

- Versionar schema CIGKV e adicionar campos formais para `world_bounds`, `coordinate_origin`, `unit`, `schema_version`, `sectors[].bounds`, `spawn_points[].spawn_type`, fase/modo elegível, `loot_points[].sector_id` e política de loot/raridade.
- Remover adivinhação de setor por if/else de coordenadas; todo ponto referencia ID de setor e o validador comprova que está contido no polígono correspondente.
- Escrever migração versionada para converter uma vez os dados escolhidos ao frame aprovado. Manter cópia da versão anterior e relatório de delta por ID (origem/destino/distância deslocada); não editar IDs silenciosamente.
- Atualizar a cópia do Content como artefato derivado ou removê-la do fluxo, conforme o ADR. Se o Data Asset editável no Unreal for a fonte real, criar import/export que faça round-trip e detecte drift em CI.
- Eliminar defaults aleatórios ocultos de `InitializeDefaults()` ou exigir seed, bounds e validador; nenhum fallback de runtime pode gerar coordenadas não aprovadas sem log/gate explícito.
- Definir política fail-closed para JSON ausente/inválido: fallback de teste não pode virar layout silenciosamente usado em staging/prod.

**Gate:** conversão é determinística, os bounds estão completos, os IDs persistem, e todos os artefatos de runtime/teste são gerados/validados a partir da fonte canônica.

### Fase D — reescrever validação espacial e análise de distribuição

**Validações mínimas no CLI/CI**

- Schema, unidade, frame, dimensões e `schema_version` conhecidos; IDs únicos; números finitos; contagens totais e por modo/sector.
- Todo ponto dentro de `world_bounds`; partição de setores cobre o mapa jogável sem sobreposição nem buracos; membership explícita confere com coordenadas.
- Spawns sem interpenetração de cápsulas, fora de água/volumes vedados, alcançáveis por NavMesh, com clearance de obstáculos/encostas e regras aprovadas de proteção.
- Relatório de todas as distâncias entre spawns: mínimo, percentis, histogramas e pares abaixo do limite da política, separados por equipe/modo/POI. Para BR, auditar densidade de spawn e distância de conflito inicial, não apenas média global.
- Clearance spawn–ZEX medido à borda da zona (`centro a centro − raio`), com regra explícita de exceção se a mesma área aceitar os dois usos.
- Loot: distribuição por região e categoria, pesos por slot e por fase, itens úteis por jogador esperado, distância/tempo até equipamento, pontos duplicados e áreas sem loot.
- Simulação determinística de muitas seeds para verificar distribuição estatística, com intervalo de confiança/tolerância registrado; não exigir a mesma amostra exata para uma seleção estocástica.
- Testes de regressão para os IDs afetados pela migração, pontos de fronteira, coordenadas fora do mapa, limites de clearance, seeds repetíveis e falha de parse.

**Entregáveis**

- Relatório JSON com baseline vs. novo, decisões aplicadas e todos os pares violadores (não truncar a evidência principal).
- Visualização top-down que use a mesma origem/escala e desenhe bounds, setores, spawns, ZEX, loot, safe-zone e heatmaps.

### Fase E — validar no Unreal e testar a experiência

**Ações**

- Importar/buildar no Unreal Editor a partir do schema/Data Asset canônico; remover pendências de import e produzir mapa de teste mínimo.
- Sobrepor um grid de escala conhecido, limites e rótulos; conferir pelo menos um ponto de referência por quadrante/limite para detectar espelhamento, offset, eixo invertido ou erro cm↔m.
- Rodar validação de colisão/NavMesh, trace para piso e line-of-sight; observar que todos os 50 starts são ocupáveis no mapa real.
- Fazer PIE com servidores/clientes e seeds fixas; confirmar seleção de spawn autoritativa, ausência de spawn em parede/fora do mapa e que participantes não apareçam no mesmo espaço. Testar reset e repetição da seed.
- Playtest em mais de uma seed: medir primeira arma/heal, tempo até primeiro combate, mortes antes de conseguir controle, distribuição de visitas por POI, utilização dos ZEX e opinião de justiça de spawn.
- Separar resultados de treinamento (entrada contínua e hub neutro) dos resultados de BR competitivo; não agregar modos distintos no mesmo KPI.

**Gate:** build/PIE sem spawn inválido; relatório geométrico sem violação de regras aprovadas; playtest confirma metas de tempo/justiça ou gera ticket de ajuste com dados e rollback.

### Fase F — publicar decisão e prevenir regressões

- Atualizar guia, INI, config, Data Asset, testes e relatório na mesma mudança; marcar relatórios velhos como arquivados.
- Adicionar CI para que qualquer modificação de fonte, schema, gerador ou regra rode o validador, diffs/hashes e teste estatístico por seeds.
- Versionar mudança em changelog/ADR, guardar seed e checksum do layout, e registrar compatibilidade do servidor/cliente.
- Remover constantes contraditórias dos comentários e códigos duplicados; documentar exceções por modo.

## 4. Critérios de aceite de ponta a ponta

1. Uma fonte canônica versionada produz o layout que o servidor realmente consome; não há edição manual divergente de uma cópia.
2. A unidade/origem/dimensões são explícitas e um teste de conversão confirma os limites (incluindo fronteiras e Z do piso).
3. Setores particionam integralmente o espaço jogável e as frações aprovadas são verificadas pela área geométrica real.
4. A política aprovada de contagem de spawns por modo/sector bate com os dados e com a seleção de runtime; os 50 starts requeridos são válidos e alcançáveis.
5. Nenhum par viola o spacing/clearance aprovado; toda exceção é explícita, identificada e coberta por teste.
6. Loot fixo ou probabilístico é inequívoco; contagens/weights e distribuição por sector/fase correspondem à política e à simulação reprodutível.
7. Um mapa aberto no Editor e teste multiplayer PIE demonstram os pontos sobre a geometria real; CI portável isoladamente não é apresentado como validação visual/Unreal.
8. Relatório registra before/after e métricas de experiência por modo/seed, sem apresentar thresholds propostos como resultados medidos.

## 5. Ordem de execução recomendada

1. **Primeiro:** inventário de runtime + ADR aprovado (Fases A/B).
2. **Depois:** schema, transformação de coordenadas com diff por ID e fonte única (Fase C).
3. **Em paralelo após aprovação:** regras/testes espaciais e visualização/relatório (Fase D).
4. **Antes de declarar pronto:** Editor/PIE, testes multiplayer e playtests com métricas (Fase E).
5. **Fechamento:** CI, documentação e changelog (Fase F).

### Bloqueios que não se resolvem só com código

- Produto/design deve esclarecer se o ArmoryHub sem combate serve como área de entrada ou está fora das partidas BR competitivas.
- É necessário confirmar que a escala de 10 km é intencional e de qual classe/asset o runtime depende.
- O limite de separação spawn–spawn e spawn–ZEX depende da gameplay, escala de POIs, cápsula do jogador e proteção inicial; não deve ser inventado a partir do validador legado.
- A distribuição de loot depende de saber se a raridade é atributo fixo de cada ponto ou resultado de pesos por spawn.
