# Fase 40 — Mapa Tático em Tela Cheia (tecla M) com Tint Sazonal e Sombras em Bandas para os Props dos Distritos

> Diretiva: "prosseguir end to end" — continuidade das duas frentes sugeridas
> no fechamento da F39: levar o radar à LEITURA COMPLETA do ring (distritos
> nomeados, anéis, terminais, loot, contatos) sob o mesmo calendário sazonal
> (F39), e estender as sombras de contato em BANDAS DE DISTÂNCIA (F39) aos
> props do dressing dos distritos (F22).

---

## 1) Especificação Técnica de Ativos (Asset Tech Spec)

### 1.1 Mapa tático em tela cheia — `tacticalmap3d.js` (novo) + `hud3d.js` + `main3d.js` + `index.html` + `styles3d.css`

- **Módulo PURO `tacticalmap3d.js`** (mesmo contrato headless de
  aura3d/perf3d): `TACTICAL_HOTKEY` ('m' — fonte única consumida pelo main3d,
  sem literal espalhado), `TACTICAL_WORLD` (420 — MESMA janela do radar F35),
  `tacticalScale(size)` (size/janela, ≥0), `tacticalProject(x, z, size)`
  (origem no CENTRO do canvas, +x → direita, +z → baixo — MESMA convenção do
  `#drawMinimap`, zero surpresa de leitura entre radar e mapa; entrada suja →
  centro, sem NaN), `tacticalMarkers({...})` (gate determinístico IDÊNTICO ao
  radar: loot só ativo, bots SÓ revelados — `revealedTicks > 0` offline,
  flag `revealed` online Fase 8 —, terminais TODOS com a flag `active`
  preservada porque o mapa nunca esconde terminal, distritos com nome/raio,
  anel corrente + alvo, jogador com yaw) e `tacticalMarkerCounts` (telemetria
  por kind). Coleções lixo/não-iteráveis degradam para vazio — o mapa NUNCA
  quebra a partida por dado faltando (guard `Array.isArray`, fixado em teste).
- **`hud3d.toggleMap(force)`/`closeMap()`/`#drawTacticalMap()`**: overlay
  translúcido sobre a partida VIVA (a partida NUNCA pausa — assinatura Free
  Fire); desenho no toggle + redesenho no MESMO tick de 30 Hz do radar
  (`mmLimiter`) enquanto aberto — anéis/terminais/contatos atualizam ao vivo.
  Canvas interno 720² (CSS `min(78vmin, 720px)` responsivo). MESMO tint
  sazonal do radar (`minimapTintFor(seasonIndexFor(new Date()))`): fundo
  `.88`, grade da estação, véu ANTES dos marcadores, moldura `.seasonal` +
  `--mm-edge` (F39), subtítulo com pulso/estação/hint. Distritos nomeados
  (círculo + rótulo — o ganho de leitura de SETOR sobre o radar), anéis
  laranja-tracejado/ácido, terminais com aro verde quando ativos, loot ciano,
  contatos âmbar, seta dourada girada pelo yaw — semáforos canônicos intactos.
- **Wiring**: `main3d` binda `k === TACTICAL_HOTKEY` (toggle, `!e.repeat`) e
  `escape` fecha o mapa junto do pointer-lock; botão `#mapBtn` ("🗺 MAPA") na
  barra superior para touch, bindado no `#bindButtons` do hud3d. Legenda
  estática embaixo do canvas (6 marcas com as cores canônicas).

### 1.2 Sombras em bandas para os props dos distritos — `districts3d.js` + `world3d.js` + `main3d.js`

- **`buildDistrictDressing` ganha o hook `bandContactShadows`**: quando
  presente, as sombras do dressing (F22 — tent/billboard/machinery/templestep/
  refinetower/... 23 tipos) passam pela BANDA (F39) em vez do F7 estático;
  sem o hook, cai no estático (retrocompatível — assinatura/contrato intocado,
  fixado em teste com os dois spies).
- **Wiring `world3d.buildScene`**: `bandContactShadows` mapeia cada entrada com
  ancoragem no relevo (`y = terrainHeightAt + 12 mm` — o dressing nasce em
  y=0 do plano jogável; a margem acompanha) e cria o campo com a banda
  CANÔNICA do vocabulário F39 (`nearDist 30, farDist 90, opacity .5`) — a
  mesma régua do scrub: a sombra morre antes do fog comer o prop. O handle
  entra em `scene.userData.dressingBandShadows` (lista — um campo por build)
  e o total em `dressingShadowEntries` (padrão propPlacements).
- **`main3d.loop`**: itera a lista 1×/frame ao lado do `scrubBandShadows`
  (O(dressing) — tipicamente ~20 hipotenusa + ~20 floats por mundo).

## 2) Design Funcional (Game Design)

- **Radar × Mapa**: o radar (196 px) responde "para onde eu vou AGORA"; o
  mapa tático responde "onde está TUDO" — setores nomeados com raio visível,
  terminais para rota de extração, densidade de loot, anéis para planejar o
  próximo pulso. Abre em M (PC) ou botão (touch), fecha em M/Esc, e o jogo
  continua correndo atrás — abrir mapa tem CUSTO de atenção, não de pausa
  (decisão de design herdada do gênero).
- **Sazonalidade coerente em 3 escalas**: o mesmo calendário tinge a vinheta
  em tela cheia (F36), o radar de 196 px (F39) e agora o mapa tático de 720 px
  (F40) — a estação é uma CAMADA do mundo, não um enfeite de elemento.
- **Sombras = informação de perto**: os props do dressing são marcos de
  cobertura/navegação; o disco de contato ancora a silhueta no chão perto e
  some antes de virar moiré — mesma leitura da F39 aplicada à camada urbana.

## 3) Prompt de Renderização (Directiva Visual)

- Mapa tático: painel central sobre o mundo embaçado; grade de 50 m na cor da
  estação (primavera = véu broto sobre grade esverdeada, moldura `#7ddc6a`);
  5 círculos de distrito com rótulos monoespaçados; anel ácido atual +
  próximo pulso tracejado; terminais verdes aroados; seta dourada do jogador.
- Dressing: sombras radiais F7 nascendo/morrendo com a distância sob barracas,
  billboards, maquinário e templos — perto, âncora firme; a 90 m, nada.

## 4) Validação (testes + browser real)

- **Unit (game-runtime)**: suíte completa 925 — **919 pass / 0 fail / 13
  skip** (baseline F39: 913; +6 F40). Novos:
  - `test/tacticalmap3d.test.js` +4 (novo arquivo): projeção (centro,
    convenção do radar, entrada suja sem NaN), markers (gate determinístico
    completo — 2 revelados de 5 bots, loot ativo, terminais preservados,
    distrito sujo fora, campos r/label/active/yaw preservados), degradação
    com graça (coleções lixo → vazio, sem throw) e hotkey fonte única;
  - `test/district-dressing.test.js` +1: hook de banda assume as sombras
    (estático NÃO roda junto — sem sombra duplicada) + fallback retrocompatível;
  - `test/vegetation3d.test.js` +1: `buildScene` W1-W4 com campo de banda do
    dressing registrado (1 handle, total consistente, ancoragem no relevo
    `y ≥ .012`, banda canônica 30/90, alpha cheio no pé da sombra,
    idempotência).
- **Build**: `vite build` OK (7.16 s).
- **Browser real (dev server + eval)**:
  - **W1 Barburhen (`?scenario=w1&view=tps`)**: tecla M abre o mapa tático
    (header `PULSO 00 · PRIMAVERA · M PARA FECHAR`, moldura `.seasonal` com
    `#7ddc6a`), 5 distritos nomeados + anéis + terminais + loot + seta do
    jogador desenhados; M fecha/reabre, ESC fecha, `#mapBtn` alterna (todas
    as 3 interações verificadas por eval); dressing em banda registrado
    (1 campo, 19 sombras) com sombra visível sob a banca do dressing;
    minimapa F39 intacto. Evidências: `f40-validate-mapa-tatico-m.png`,
    `f40-validate-mapa-tatico-botao.png`, `f40-validate-dressing-banda-near.png`.
  - **W4 Arukheea (`?scenario=w4&view=tps`)**: mapa tático com os nomes
    locais (Bosque dos Perdidos | Prisão do Sol da Noite | Cemitério das
    Baleias | Marina Fantasma | Terminal ZEX), dressing em banda (16 sombras),
    toggle limpo. Evidência: `f40-validate-w4-regressao.png`.
- **Auditoria de devs paralelos**: `origin/main` parado em `5d95b68` (nossa
  F39) — nenhum commit novo desde o push; branch paralela
  `feat/fase39-diretor-populacional-zu-ue58` de outro dev segue não-mergeada
  (sem impacto no main).
