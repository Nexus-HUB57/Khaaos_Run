# Fase 38 — Desbaste Gradual no Tier Sparse, Sombras de Contato nos Arbustos e Mira com Festival Sazonal por Aura

> Diretiva: "Prosseguir: estender o fade ao tier sparse (desbaste gradual em
> vez de fração fixa) · sombras de contato para os arbustos do LOD · sazonal
> na mira/crosshair por aura". Continuidade direta da Fase 37 (fade da banda
> de impostores + sombras de contato + ícone sazonal) — completa a leitura
> contínua tufos → desbaste → mancha → bake e leva a temporada ao elemento
> de combate mais olhado do jogo: a pontaria.

---

## 1) Especificação Técnica de Ativos (Asset Tech Spec)

### 1.1 Desbaste gradual do tier sparse — `vegetation3d.js`

- **Problema**: a F32 raleava o tier sparse em DEGRAU — o count saltava de
  `fullCount` para `ceil(fullCount × sparseKeep)` na entrada (28 m) e morria
  seco na saída (58 m). Com a F37 entregando a mancha com fade suave, o
  degrau do sparse virou o último "pop" da cadeia visual do capim.
- **Solução — o count É o fade**: `grassSparseCount(dist, { fullCount,
  nearDist, midDist, sparseKeep, entryZone, exitZone })` PURA devolve o
  count do chunk por distância em TRÊS fases: entrada
  `[nearDist, nearDist+entryZone]` rampa smoothstep `fullCount → plateau`;
  plateau com o MESMO contrato F32 (`max(1, ceil(n × sparseKeep))` — a
  densidade do meio da banda não mudou); saída `[midDist−exitZone, midDist]`
  raleando até 0. As zonas são capadas a 45% da banda cada (sempre existe
  plateau ≥ 10%); banda degenerada (`midDist ≤ nearDist`) vira degrau puro
  retrocompatível; `sparseKeep` fora de [0,1] é capado. A ordem de plantio
  é estável — reduzir count nunca troca QUAIS tufos aparecem (mesmo
  contrato anti-tremedeira da F32). Count 0 → mesh invisível (custo de
  draw 0, como o tier hidden).
- **Cross-fade com pre-roll**: `grassImpostorFade` ganha `preRoll = 0`
  (opt-in, default 0 = contrato F37 byte a byte): a rampa de ENTRADA da
  mancha começa em `midDist − pre` (capado pela própria `zone`) — a mancha
  cresce DENTRO da saída do desbaste e chega a ~70% de alpha quando os
  últimos tufos somem. Sem o pre-roll existia um "vale de densidade" na
  fronteira 58 m (tufos zerados, mancha ainda invisível).
- **Empacotamento unificado**: o `update()` do campo extraiu
  `packImpostor(ch, fade)` — o cross-fade acende a mancha também em chunks
  do tier sparse (fade > 0.002), além do tier impostor. Custo por frame
  INTACTO: mesma varredura O(chunks), matrizes escritas só na faixa
  ativa, alpha por instância (`instanceAlpha` F37) carregando o fade.
- **world3d canônico**: `sparseEntryZone: 10, sparseExitZone: 12,
  impostorPreRoll: 9` — entrada 28→38 m, plateau 38→46 m, saída 46→58 m,
  mancha nascendo de 49→58 m (~39% em 55 m) e chegando à borda a ~71%.
  O default do campo continua `impostorPreRoll: 0` (testes F34/F37
  intocados; o pre-roll é decisão de wiring de produção).

### 1.2 Sombras de contato nos arbustos — `vegetation3d.js` + `world3d.js`

- **Problema**: desde a F7, árvores, pedras, props e o mato rasteiro de
  Barburhen ancoravam no chão via `buildContactShadows` — os arbustos em
  cluster (F31) ficaram FORA e "flutuavam" sobre o solo liso.
- **Solução — decisão PURA + mesma infra**: `bushShadowEntries(bushSpots,
  { sizeFactor = 2.1 })` devolve 1 entrada por arbusto (`{ x, z, rot: 0,
  size: 2.1 × s }` — diâmetro do cluster × escala plantada),
  determinística e testável headless. O `buildNature` acrescenta as
  entradas ao MESMO `shadowSpots` (árvores/pedras/scrub) → um único
  InstancedMesh, mesmo stagger anti-z-fight (y = .012 + i×.0006), mesmo
  gate de qualidade (`q.contactShadows`, true em todos os tiers).
  `buildContactShadows` agora RETORNA o mesh (antes `undefined`) e o mundo
  registra `scene.userData.natureContactShadows` /
  `natureShadowEntries` / `bushShadowSpots` para inspeção e testes
  (padrão `propPlacements`).

### 1.3 Mira/crosshair com festival sazonal — `aura3d.js` + `hud3d.js` + `styles3d.css`

- **Decisão PURA**: `crosshairVars(aura, mythicHex)` em aura3d — MESMA
  fonte única do badge/vinheta/ícone (`hudAuraFor`), MESMO contrato de
  `weaponIconVars` (null sem aura ativa ou hex inválido → mira neutra,
  custo 0; retorno congelado com `aura`/`season`/`dur`/`shimmerAngle`).
- **Wiring**: no update do HUD, com skin mítica o `#crosshair` ganha a
  classe `mythic` + variáveis `--ch-aura` (identidade da skin), `--ch-season`
  (cor tingida pela estação) e `--ch-dur` (ritmo); sem mítica, limpeza
  simétrica (classe + 3 variáveis removidas — custo 0).
- **CSS de produção** (styles3d.css, seção do crosshair): braços
  (`.ch`) na cor da SKIN; ponto central (`.dot`) + glow na cor da ESTAÇÃO;
  anel cônico girando em `#crosshair.mythic::before` reutilizando o
  keyframe `mythicSeason` (mesmo do badge/ícone) com raio acoplado ao
  spread (`inset: calc(-1 × var(--ch-gap) - 8px)` — o anel abraça os
  braços e segue a abertura da pontaria). Elemento de COMBATE: anel em
  opacidade baixa (.26; inverno .18, primavera .34) e
  `prefers-reduced-motion` congela a rotação mantendo a tintura. Zero
  layout shift (pseudo-elemento absoluto).

---

## 2) Design Funcional (Game Design)

- **A cadeia visual do capim fecha SEM nenhum pop**: full (<28 m) →
  desbaste gradual (28–58 m: engrossa o raleio conforme se afasta) →
  cross-fade (49–58 m: a mancha nasce SOB os últimos tufos) → mancha com
  fade F37 (58–110 m) → bake outdoor F36 (≥110 m). Andar em qualquer
  direção agora é uma função contínua de densidade — o "vale" que existia
  na fronteira 58 m desapareceu.
- **Peso no chão para TODA a natureza**: com os arbustos ancorados, as 4
  famílias de vegetação (árvores, arbustos, pedras, mato rasteiro)
  assentam em sombra de contato — a leitura "plantado, não flutuante"
  fica uniforme em W1–W5.
- **A temporada alcança a pontaria**: badge (F34), vinheta (F36), ícone
  (F37) e agora a MIRA (F38) respiram na mesma aura e no mesmo ritmo —
  o jogador passa o jogo inteiro olhando a mira; é o veículo mais
  eficiente do festival. Contenção deliberada: identidade nos braços,
  estação no ponto/glow, anel discreto — cosmético que não compete com
  o alvo.

---

## 3) Prompt de Renderização (Directiva Visual)

> Campo aberto ao entardecer: o capim próximo é denso; a 35 m ele RALEIA
> de forma perceptível mas suave — metade dos tufos, sem buracos bruscos;
> a 50 m restam pontas isoladas e, entre elas, manchas translúcidas de
> capim já crescem no horizonte, cada uma com sombra elíptica no chão.
> Arbustos em cluster espalham sombras radiais suaves sobre o solo liso.
> No centro da tela, a mira não é mais o traço verde padrão: com a skin
> mítica os braços acendem na cor da aura, o ponto central e o brilho
> carregam a cor deslocada pela estação e um anel cônico quase
> imperceptível gira em volta — no inverno o anel quase dorme, na
> primavera ele pulsa mais rápido — e a pontaria continua limpa.

---

## 4) Validação (testes + browser real)

- **Testes +8** (915 totais — 902 pass / 0 fail / 13 skip; vite build OK):
  - `vegetation3d.test.js` +6: grassSparseCount (rampa de entrada
    monotônica, plateau = contrato F32 `ceil(n×.4)`, saída raleando a 0,
    não-crescente na banda inteira; clamps de zona com plateau garantido,
    banda degenerada, sparseKeep capado, zonas zero = degrau F32 puro);
    grassImpostorFade pre-roll (rampa começa em 49 m, ~70% na borda 58 m,
    default 0 = F37 byte a byte, cap pela zone, monotonia global);
    buildGrassFieldLOD (chunks determinísticos 1 spot/célula: full 10/10,
    entrada 9, saída 1, count 0 → invisível; default NADA empacota <58 m;
    com pre-roll 55 m entra com alpha ~0.39, slots = fades dos CENTROS
    reais, sombras espelham, idempotência byte a byte); bushShadowEntries
    (1 disco por arbusto, size 2.1×s, determinístico); buildScene W1–W5
    (cada arbusto ancorado no instanceMatrix por x|z, registro do total
    consistente, zonas + pre-roll canônicos no campo); asserção F32 do
    sparse atualizada para o contrato F38 (fração fixa → desbaste);
    asserção F34 buildScene estendida ao pre-roll.
  - `aura3d.test.js` +2: crosshairVars (4 estações, identidade preservada,
    retorno congelado); null sem aura/ com hex inválido (mira neutra).
- **Browser real** (vite dev + agent-browser):
  - vitrine `scripts/f38-showcase.html` (módulos REAIS, bandas escaladas
    10/22/38 m rotuladas, zonas 5/5 m, fade 6 m, pre-roll 4 m): rail de 7
    paradas — estado real lido do buffer: FULL 27/27 tufos · SAÍDA
    d=19 m com **7/27 tufos + manchas nascendo (fade .074, 21 manchas +
    21 sombras)** · BORDA 22 m com **0 tufos + mancha a .741 (~74%)** ·
    14 arbustos com sombra de contato (anchors no chão y=.012);
    painel da mira com 5 auras × 4 estações — decisão REAL de
    `crosshairVars` + CSS `#crosshair.mythic` de PRODUÇÃO (M4 Sentinela
    de Éter · primavera: `#35e1ff → #35bbff ×0.84` ao vivo);
  - jogo real W4 (`?scenario=w4`, bandas canônicas 28/58/110 m): update
    vivo do campo lido do buffer — chunk a d=19 m 19/19 (full), d=31 m
    15/18 (entrada do sparse), d=44 m 6/14 (plateau), d=41.7 m 4/8
    (saída), 10 manchas + 10 sombras na banda; evidência visual do
    desbaste a ~42 m em altura de jogador;
  - evidências PNG (artifacts/): f38-showcase-full.png,
    f38-showcase-entrada.png, f38-showcase-saida-crossfade.png,
    f38-showcase-borda22.png, f38-showcase-impostor.png,
    f38-validate-w4-sparse-fade.png, f38-validate-w4-sparse-near.png,
    f38-validate-w4-impostor-band.png.
