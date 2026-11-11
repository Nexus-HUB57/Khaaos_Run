# Fase 41 — Perfis de Luz por Cenário (Reconfiguração de Parâmetros), Personagens Ergonômicos e Acessórios PBR no Padrão Free Fire

> Diretiva: "prosseguir end to end e aprimorar gráficos e cenários, acessórios e
> personagens que ainda não são compatíveis aos gráficos do Free Fire. Executar
> reconfiguração dos parâmetros para que o cenário seja mais real possível e os
> personagens realísticos e com movimentos mais naturais e ergonômicos humanos."
> Auditoria prévia: origin/main parado na F40 (`8f20513`) — os 4 itens da
> diretiva anterior (killfeed/dano sazonal, scrub em bandas, minimapa tint,
> desbaste gradual do sparse) já estavam mergeados pelos devs paralelos
> (F38/F39/F40) e foram re-verificados por símbolo antes de qualquer código.

---

## 1) Especificação Técnica de Ativos (Asset Tech Spec)

### 1.1 Perfis de luz por cenário — `world3d.js` (LIGHTING_PROFILES + lightingProfile) + `main3d.js`

- **`LIGHTING_PROFILES` (NOVO, fonte única, congelado)**: antes TODOS os
  cenários não-Barburhen recebiam a MESMA régua quente via ternário inline —
  céu de deserto iluminado igual a noite gélida. Agora cada mundo tem um
  perfil físico-motivado com 13 campos: `sunColor/sunIntensity`,
  `hemiSky/hemiGround/hemiIntensity`, `fillColor/fillIntensity`,
  `backColor/backIntensity`, `exposure` (ACES), `envIntensity` (IBL) e
  `shadowBias/shadowNormalBias`. CINCO perfis: **CIGKV** (crepúsculo violeta —
  baseline histórica preservada byte a byte: sol `#ffc98f` @2.35, hemi 1.18,
  fills .72/.55, exp 1.24), **Barburhen** (golden hour urbano — valores F7
  recalibrados preservados: `#f0c7a2` @2.05, hemi 1.04, exp 1.18), **Priadus**
  (noite gélida — sol frio `#b8c4e8` @2.1, exp 1.12, IBL .42), **Ckesalth**
  (terra de brasa — sol laranja `#ffb27a` @2.45, exp 1.28) e **Arukheea**
  (pôr do sol de deserto — sol alto `#ffd9a0` @2.55, hemi de areia
  `#d8b894/#6a4a30`, exp 1.30). `default` aponta para o MESMO objeto congelado
  de CIGKV (desconhecido nunca explode — fixado em teste).
- **`lightingProfile(scenarioId)`** (NOVO, puro): resolve pelo mapa com
  fallback na baseline; consumido por `buildScene`, que expõe o perfil em
  `scene.userData.lighting` e alimenta TODAS as luzes a partir dele.
- **Sombras**: `sun.shadow.normalBias` entra no vocabulário (.018–.022 por
  perfil) — mata acne de shadow map nas cápsulas curvas dos personagens; o
  `shadow.bias` negativo cai ~50% (-0.0004 → -0.00022/-0.00028) porque o
  normalBias assume o combate ao acne (menos peter-panning nas bases).
- **Exposição ACES por cenário** (`main3d.initWorld`):
  `renderer.toneMappingExposure = scene.userData.lighting.exposure` (fallback
  1.24 se o perfil não chegar). O IBL acompanha: `scene.environmentIntensity`
  deixa de ser `.45` fixo e vem do perfil (.42–.52).
- **Anoitecer coerente**: `scene.userData.nightBase` (skyPhase) passa a
  capturar o PERFIL do cenário como base (antes: ternário fixo) — o ciclo
  dia/noite de cada mundo interpola a partir do próprio ponto de partida.

### 1.2 Personagens ergonômicos — `entities3d.js` (createOperative/animateOperative) + `textures3d.js`

- **Micro-detalle PBR no VESTUÁRIO INTEIRO** (fim do plástico liso nos
  acessórios): `sharedMicroDetail()` (NOVO) memoiza os mapas procedurais F26
  POR PRESET (6 texturas no total, não 6×24 atores) e aplica `fabric` no
  secundário e no cabelo, `plastic` no gear/gear2/bota e `metal` no coldre —
  os mapas são reutilizáveis entre materiais porque o scalar
  roughness/normalScale modula por instância. **Pele ganha relevo 3D**: o
  `skinMaterial` (textures3d, memo por tom) aplica o preset `skin` como
  normalMap (normalScale .6) — poros ganham profundidade real sob luz rasante;
  headless continua no-op seguro (contrato F26 preservado).
- **Estabilização vestibular do olhar** (animateOperative): o bounce da
  passada foi EXTRAÍDO para `const bounce` (mesma fórmula, zero duplicação) e
  a cabeça contra-move 30% do sinal vertical (`head.position.y = .46 −
  bounce·.3`) e 30% do sway lateral (`head.position.x = −sway·.3`) — a linha
  de mira fica nivelada enquanto o corpo sobe/desce/rola. Pivô canônico .46
  preservado na criação (contrato F9 "mundo 1.68" intocado, fixado em teste).
- **Ombros contra-rolam a passada** (ergonomia de tiro): `roll` da passada
  (mesma fase do roll do tronco) é cancelada em 35% nos DOIS ombros em z —
  as mãos ficam niveladas no plano do horizonte enquanto o tórax rola. Em
  speedNorm 0 o contra-roll é exatamente 0 (regime neutro do hit reativo F10
  preservado — o flinch continua aditivo por cima).
- **Micro-balço ADS**: mirando, os ombros ganham respiração de atirador em 2
  eixos dessintonizados (z ±.012 @1.7/1.9 rad/s, x ±.008 @2.3/2.6 rad/s) —
  determinístico em t, contido (≤.025 z; excesso ≤.017 x sobre a respiração
  F16 já existente) e sem loop perceptível.
- **Cotovelos respiram**: `breathe·.012` somado aos dois cotovelos (micro-vida
  no idle coerente com o peito F9).
- **Pós-condições intactas**: crouch .88 exato, rastejo 1.22 exato, morte sem
  NaN, continuidade 30 Hz (<.28/frame por junta), orçamento ≤6500 tris,
  CapsuleGeometry == 8, PlaneGeometry == 1 (somente a sombra de contato).

### 1.3 Acessórios no padrão FF — `entities3d.js` (createOperative)

- **Jugular do capacete** (2 tiras `gearM2` .016×.13×.02 sob o queixo, ±x
  .118, flag `baseHeadGear` — o gear Nv2+ F28 continua substituindo): o casco
  lê como capacete REAL em close TPS, não como bolha flutuante. Boina NÃO
  recebe (acessório é do capacete — fixado em teste).
- **Luva 3ª pessoa com dedos**: placa de dedos (.105×.05×.07, curl .55
  enrolando o grip) + polegar esférico oposto (lado interno = −side) nas DUAS
  mãos — o punho fechado na arma substitui o bloco único F6.
- **Bota de combate**: cadarço no peito do pé (.13×.018×.022 na frente do
  cano) + colarinho do cano (cil .082→.088×.05) nas duas pernas — calçado lê
  como calçado, não como tijolo preto.
- **Anisotropia 8** (`textures3d.js`, os 2 criadores de textura): chão,
  asfalto e fachadas ficam nítidos em ângulo raso (TPS a correr) até o
  horizonte — custo de GPU desprezível vs o ganho de leitura.

### 1.4 Vitrine de evidências — `scripts/f41-showcase.html` (novo)

- Cena mínima com módulos REAIS: `createOperative`/`animateOperative`
  (personagem correndo in-place), `LIGHTING_PROFILES` (5 botões trocam sol +
  hemisfério + fills + exposição + biases AO VIVO), anisotropia 8 no chão,
  readout com a MATEMÁTICA ao vivo (bounce do tronco vs contra-movimento do
  olhar, contra-roll dos ombros) e câmeras de close (CORPO/CABEÇA/LUVA/BOTA).
  Hook `window.__f41` (state/shot/profile/exposure) para smoke por eval.

---

## 2) Design Funcional (Game Design)

- **Mundo com identidade luminosa**: a escolha de cenário passa a ser uma
  escolha de HUMOR fotográfico — a noite gélida de Priadus escurece e esfria
  (exp 1.12), o deserto de Arukheea abre a exposição e esquenta a rebatida de
  areia (1.30), Barburhen mantém o golden hour cinematográfico calibrado na
  F7. A reconfiguração não é cosmética: exposição, IBL, temperatura do sol e
  balanço hemisférico mudam a LEITURA de contraste, silhueta e legibilidade
  de cada mapa (o mesmo V-taper lê diferente sob sol duro vs luz fria).
- **Ergonomia = qualidade de mira percebida**: o olhar nivelado (vestibular)
  e as mãos niveladas (contra-roll) removem os dois "tremores artificiais"
  que sobravam da passada — o personagem parece CONTROLAR o corpo em vez de
  ser carregado por ele; o micro-balço ADS devolve a vida da respiração SEM
  roubar precisão percebida (amplitudes ≤ metade do deadzone visual).
- **Acessórios = silhueta de invólucro real**: jugular, dedos e cadarço são
  os três detalhes que separam "boneco com capacete" de "operativo vestido" —
  exatamente os closes que o TPS mostra (cabeça ao mirar, mãos ao recarregar,
  pés ao escalar). O orçamento de 6500 tris/ator continua sagrado (24 atores).
- **Continuidade sazonal intacta**: nada desta fase toca aura/festival
  (F36–F40) — o tint do minimapa, o killfeed e os números de dano seguem os
  contratos F39 byte a byte.

## 3) Prompt de Renderização (Directiva Visual)

- CIGKV: violeta crepuscular, sol quente médio, sombras azul-violeta.
- Barburhen: golden hour urbano — sol âmbar suave, hemisfério cinza-azulado,
  sombras longas e frescas (preservação F7).
- Priadus: noite gélida — sol azul-aço baixo, fills frios, exposição contida,
  IBL discreto (materiais não brilham à noite).
- Ckesalth: brasa — sol laranja duro, sombras quentes, IBL médio.
- Arukheea: deserto ao entardecer — sol alto e quente, rebatida de areia no
  hemisfério, exposição aberta, chão nítido até o horizonte (aniso 8).
- Personagens: poros com relevo sob luz rasante, trama de tecido em todo o
  vestuário, metal escovado no coldre, jugular amarrando o casco, punho
  fechado no grip, cadarço no peito do pé.

## 4) Validação (testes + browser real)

- **Unit (game-runtime)**: suíte completa 980 — **967 pass / 0 fail / 13
  skip** (baseline F40: 962; +18 F41). Novo `test/realism-f41.test.js` (18):
  - Perfis: 5 cenários resolvem pelo mapa com 13 campos/congelados/faixas
    plausíveis (sol 1.8–2.8, exposição 1.0–1.4, IBL .3–.8, bias contido,
    normalBias .015–.03); exposições e temperaturas distintas por mundo
    (Priadus < CIGKV < Arukheea); desconhecido/sem argumento → baseline;
    baseline histórica preservada (Barburhen F7 e CIGKV byte a byte);
  - buildScene consome o perfil (userData.lighting, cor/intensidade do sol,
    normalBias/bias das sombras, nightBase capturando o perfil);
  - Ergonomia: contra-movimento do olhar no pico do bounce (30% exato) com
    pivô .46 no repouso e NA CRIAÇÃO; cabeça contra o sway lateral; ombros
    contra-rolam 35% com regime neutro no repouso; balço ADS contido medido
    como EXCESSO sobre a respiração F16; determinismo byte-idêntico;
    continuidade 30 Hz com a nova camada; poses canônicas exatas (crouch
    .88, rastejo 1.22, morte sem NaN);
  - Acessórios: jugular simétrica com flag baseHeadGear (e ausente na boina),
    dedos com curl .55 + polegar interno nas duas mãos, cadarço + colarinho
    nas duas botas, orçamento ≤6500 tris com 8 cápsulas e 1 plano;
  - Materiais: anisotropia 8 em ground/asphalt; pele memoizada com poros no
    roughness e metal 0 (relevo de normal map é browser-only — headless
    no-op, contrato F26).
- **Build**: `vite build` OK (2.7–3.1 s).
- **Browser real (dev server + agent-browser/eval)**:
  - **W4 Arukheea** (`?scenario=w4&view=tps`): `renderer.toneMappingExposure`
    = **1.3** (perfil deserto AO VIVO — antes 1.24 global), personagem em
    close com jugular visível sob o casco, luva no grip, sombra de contato e
    chão nítido em ângulo raso. Evidências: `f41-validate-w4-personagem-close.png`,
    `f41-validate-w4-cabeca-jugular.png`, `f41-validate-w4-horizonte-aniso.png`.
  - **W1 Barburhen** (`?scenario=w1`): exposição **1.18**, sol `#f0c7a2`,
    IBL .5, normalBias .022 (perfil golden hour confirmado por eval) — rua com
    névoa quente→fria e terminal XP. Evidências: `f41-validate-w1-barburhen-goldenhour.png`,
    `f41-validate-w1-barburhen-rua.png`.
  - **W2 Priadus** (`?scenario=w2`): exposição **1.12**, sol `#b8c4e8` @2.1 —
    noite gélida legível com vias em ângulo raso. Evidência:
    `f41-validate-w2-priadus-noite.png`.
  - **Vitrine f41** (`/scripts/f41-showcase.html`): readout com a matemática
    ao vivo — bounce do tronco `+0.0539` vs contra-movimento do olhar
    `−0.0162` (= 30% exato), ombros `zR −0.0157 · zL −0.0157`; troca de perfil
    AO VIVO (Arukheea → Barburhen: sol #ffd9a0@2.55/exp 1.3 → #f0c7a2@2.05/exp
    1.18 no painel e na cena); closes CABEÇA (jugular), LUVA (trama PBR do
    colete + punho no grip) e BOTA (cadarço/colarinho/sola). Evidências:
    `f41-validate-showcase-live.png`, `f41-validate-showcase-cabeca.png`,
    `f41-validate-showcase-luva.png`, `f41-validate-showcase-bota.png`,
    `f41-validate-showcase-barburhen.png`.
- **Auditoria de devs paralelos**: `origin/main` estava em `c6c5f95` (F40 +
  uploads de docs) — a diretiva anterior inteira já mergeada (F38 desbaste
  gradual/cross-fade/arbustos/crosshair sazonal; F39 killfeed/dano sazonal +
  scrub em bandas + minimapa tint; F40 mapa tático + dressing em bandas),
  verificada por símbolo (grassSparseCount, scrubShadowBand,
  buildBandContactShadows, MINIMAP_SEASON_TINTS, killfeedVars/damageVars,
  tacticalmap3d) e re-validada pela suíte completa antes deste ciclo.
