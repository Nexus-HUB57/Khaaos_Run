# Fase 49 — Terreno por Bioma (Textura Própria por Mundo) e Cabelo/Capa com Física de Mola

> Diretiva: "revisar as evidências [da F41], abrir para sentir a troca de perfis
> ao vivo, ou seguir com a próxima frente (ex.: material do terreno por bioma, ou
> cabelo/capa com física de mola como as tiras do Talon)."
> Execução: as DUAS frentes implementadas na mesma fase + revisão AO VIVO das
> evidências F41 (perfis de luz trocados no browser real: Arukheea exp 1.30 →
> Barburhen 1.18 → Priadus 1.12, vestibular ON no readout).
> Auditoria prévia: main sincronizada `2035a66` → `507309f` — Tasks 41–45 dos
> devs paralelos (fidelidade W, SSOT ledgers + taxa U$1, DBNO 7 s em 3
> superfícies) re-visadas por commit; nenhum conflito com as frentes gráficas.

---

## 1) Especificação Técnica de Ativos (Asset Tech Spec)

### 1.1 Terreno por bioma — `textures3d.js` (GROUND_BIOMES + canvases) + `terrain3d.js`

- **O problema**: os 5 mundos compartilhavam a MESMA textura de terra seca
  marrom (`groundCanvas` #6d5f45) — a bioma era sugerida SÓ por vertex colors
  (neve de Barburhen e areia de Arukheea liam como terra tingida em ângulo
  raso e em close).
- **`GROUND_BIOMES` (NOVO, fonte única, congelado)**: registro por mundo com
  física de solo própria — `rough` (roughness) e `strength` (relevo do
  normalMap) + `label`: **CIGKV** savana (rough .95, relevo 1.5 — baseline
  preservada), **Barburhen** neve compactada (.74/1.15 — desliza), **Priadus**
  musgo/pântano (.97/1.7 — orgânico), **Ckesalth** basalto queimado
  (.9/1.95 — áspero) e **Arukheea** areia branca (.99/.9 — cede, relevo suave).
  `groundBiomeParams(id)` resolve com fallback em CIGKV (mundo desconhecido
  nunca explode — fixado em teste).
- **4 canvases procedurais NOVOS (512², PRNG estável do módulo)**:
  `snowGroundCanvas` (nevascas/drifts, placas de gelo compactado em trilhas,
  tufos de grama seca atravessando a neve), `mossGroundCanvas` (manchas
  orgânicas 3 tons, poças rasas com gradiente radial e borda orgânica, raízes
  submersas em quadraticCurve), `basaltGroundCanvas` (placas poligonais de
  lava resfriada com juntas, cinza pousada, fendas de brasa #963a1e+ que o sol
  laranja do perfil F41 acende), `sandGroundCanvas` (ondulações de duna em
  polilinha senoidal claro/escuro, grãos e conchinhas). **Compatibilidade com
  stubs**: só métodos presentes nos stubs de canvas dos testes (arc/lineTo/
  fillRect/gradients) — sem `rotate`/`ellipse`, que não existem nos stubs
  legados (lição registrada).
- **`groundMaterial(repeat, tint, biome)` / `groundTexture(repeat, biome)`**:
  assinatura estendida com retrocompatibilidade (biome null → savana legada).
- **`buildTerrain`**: material da bioma do cenário (`groundMaterial(34, null,
  scenario.id)`) — o `groundTint` NÃO multiplica mais o terreno (evita
  rebaptizar neve/areia); ele segue alimentando o IBL/envmap (world3d) e o
  minimapa. `mesh.userData.biome` exposto p/ inspeção e2e.
- **TINTS por vértice re-especificados**: de "carregava a bioma" para
  MODULADOR estreito ao redor de 1.0 — mantém baixo úmido → cume rochoso sem
  destruir a identidade da textura (Barburhen ganha gelo azulado no baixo e
  cume iluminado >1.0, clamp 1.15 preservado; Ckesalth escurece para basalto
  no alto; Arukheea vai a falésia cinza).

### 1.2 Cabelo/capa com física de mola — `entities3d.js` (buildAccessories/createOperative/animateOperative)

- **Rabo de cabelo (FEMALE)**: operatrizes (`/FEMALE/` no variant — OP_FEMALE_*,
  OP_MIL_FEMALE_*, OP_GNG_FEMALE_*) ganham cadeia de 3 segmentos ancorada na
  nuca (fora do casco, z .168) com tufos esféricos `hairM` (6×5 segmentos —
  dentro do orçamento), fase SEMEADA em `userData.hairPhase` (hash do variant —
  determinística como `talonPhase` F26). Homens e Talon não ganham (identidade
  preservada — fixado em teste).
- **Capa (roll 1-em-5 por variant)**: `roll(5,'cape')===0` dá capa de 3 painéis
  em caixa plana (pano: custo mínimo) ancorada atrás da mochila base (z .335),
  nasce aberta do ombro (−.16), fivelas nos ombros + barra emissiva `trimM` na
  barra (leitura FF à distância). Roll travado por teste (SORO tem, VANGUARD
  não — determinismo).
- **`animateOperative` — onda viajante (mesma família das tiras do Talon)**:
  CABELO — base de drapeado −.34 decaindo por segmento (o cabelo deita SOBRE a
  mochila, sem clipar), pulso do passo `|sin(PH)|·.1·speedNorm`, onda
  `sin(t·5.1+φ)·amp·lag·.5` com `amp = .04+.085·speedNorm+min(.16, air·.028)`,
  lag `1+i·.55` (a ponta atrasa mais), acoplagem ao pitch do olhar (`+.12` com
  decaimento) e ao sway do tronco (z). CAPA — billow `.05+.34·speedNorm+
  min(.5, air·.09)` (abre ao correr e no ar, cascata `i·.3`), onda própria
  `t·4.6/3.1` e reação ao roll da passada (z −sway·.45). **Sinal físico**: −x
  abre o pano para TRÁS (+z) — verificação visual obrigatória (a primeira
  versão com +x enfiava a capa DENTRO do tronco; corrigido e re-evidenciado).
- **Morte/rastejo assentam**: morto — cabelo −.14 e capa −.06 com z zerado (não
  congelam no último passo); rastejo — cabelo arrasta (−.12 + esforço do
  arrasto em z), capa comprimida (−.04).
- **Orçamento de polígonos**: rabo 3×~120 tris + capa ~130 tris —
  OP_MIL_FEMALE_SORO (rabo+capa) 6454 tris, SNIPER 6334, TALON 6370 — TODOS ≤
  6500 (gate de teste estendido para a variante com rabo+capa).

### 1.3 Vitrine de evidências — `scripts/f49-showcase.html` (novo)

- Módulos REAIS (createOperative/animateOperative/GROUND_BIOMES/LIGHTING_
  PROFILES): SORO (capa + rabo castanho #7a4a26) e SNIPER (rabo) correndo em
  terreno da bioma; painéis trocam BIOMA AO VIVO (terreno + perfil de luz F41
  juntos — o solo e o sol do mundo chegam juntos, como no jogo), REGIME
  (parado/andar/correr/no ar) e CÂMERA (corpo/capa/cabelo/chão raso).
- Readout ao vivo: bioma + rough/relevo + exposição + **mola da capa (ponta
  rot.x) e do cabelo** por frame. Hook `__f49.shot([cam],[look])` segura o
  enquadramento (`state.hold`) p/ evidências estáveis.

---

## 2) Design Funcional (Game Design)

- **Leitura de mundo instantânea**: no drop, o jogador reconhece o mundo pelo
  SOLO antes de qualquer UI — neve que desliza (Barburhen), pântano orgânico
  (Priadus), basalto de brasa (Ckesalth), areia de duna (Arukheea). O solo
  vira identidade, não piso genérico — aproximando a variedade de biomas do FF.
- **Silhueta FF à distância**: a capa (1 em 5 operantes, cor da equipe, barra
  emissiva) e o rabo das operatrizes quebram a silhueta "todos iguais" dos
  bots — leitura de identidade em milissegundos no meio da fumaça, como os
  trajes do FF. A física vende vida: capa abre na corrida e no pouso aéreo,
  cabelo segue o olhar com atraso.
- **Consistência física**: o solo dialoga com o perfil de luz (F41) do próprio
  mundo — basalto + sol laranja acende as fendas de brasa; neve + golden hour
  dá contraste frio/quente. Terreno e luz trocam JUNTOS na vitrine (mesmo
  acoplamento do jogo).

## 3) Prompt de Renderização (Directiva Visual)

- Neve compactada azul-acinzentada com placas de gelo e grama seca pontuando,
  sombra suave; pântano musgo escuro com poças espelhadas e raízes; basalto
  negro poligonal com fendas incandescentes sob sol laranja; areia clara com
  ondulações de vento regulares e brilho fosco. Câmeras rasas (TPS correndo)
  mantêm nitidez (anisotropia 8 herdada F41).
- Capa: pano da cor do esquadrão, barras emissivas, abre como vela contra o
  dorso na corrida e no ar — nunca rígida, nunca dentro do corpo. Cabelo: rabo
  orgânico que deita sobre a mochila e segue o olhar com atraso (lag visível
  por segmento).

## 4) Validação (testes + browser real)

- **Testes**: suíte game-runtime **1080 testes — 1067 pass / 0 fail / 13 skip**
  (+12 novos em `test/f49-terreno-bioma-cabelo-capa.test.js`: registro congelado
  + fallback, material por bioma, buildTerrain com userData.biome, cadeia do
  rabo 3 segmentos com fase semeada, FEMALE-only, capa determinística (SORO
  sim / VANGUARD não), determinismo das molas, billow cresce corrida < ar,
  morte/rastejo assentam, orçamento ≤ 6500). `vite build` OK (2.6 s).
- **Browser real (dev server + agent-browser)**:
  - **F41 revisado AO VIVO** (diretiva): perfis trocados na vitrine f41 —
    Arukheea exp 1.30 → Barburhen 1.18 → Priadus 1.12; readout vestibular
    (bounce +0.0514 vs olhar −0.0154). Evidências:
    `f49-validate-f41-perfis-live-{arukheea,barburhen,priadus}.png`.
  - **Vitrine f49**: biomas trocam terreno+luz ao vivo (rough/relevo no
    painel); close da capa abrindo na corrida (ponta rot.x −.2355) com barra
    emissiva; rabo castanho drapeando sobre a mochila (ponta −.2974). Evidências:
    `f49-validate-showcase-arukheea.png`, `f49-validate-bioma-{barburhen-neve,
    ckesalth-basalto,priadus-musgo}.png`, `f49-validate-{capa,cabelo}-close.png`,
    `f49-validate-corpo-duas-operatrizes.png`.
  - **In-game**: W4 Arukheea (`?scenario=w4&view=tps`) — terreno com bioma
    areia (userData.biome=Arukheea, rough .99) ao redor das vias; W1 Barburhen
    (`?scenario=w1`) — neve compactada com tufos sob golden hour + QTE ZU;
    travessia de cena confirma 3 segmentos de capa em bots (roll 1-em-5 vivo
    no mundo). Evidências: `f49-validate-w4-terrain-areia.png`,
    `f49-validate-w1-terrain-neve.png`.
- **Auditoria de devs paralelos**: main `507309f` (Tasks 41–45 + docs UE5.8)
  — trabalho dos paralelos é de SIMULAÇÃO/economia/DBNO, zero conflito com as
  frentes gráficas deste ciclo; suíte completa re-validada ANTES do commit.
