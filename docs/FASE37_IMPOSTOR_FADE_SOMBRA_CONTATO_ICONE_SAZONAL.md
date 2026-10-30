# Fase 37 — Fade de Opacidade na Banda de Impostores, Sombras de Contato Ancoradas no Relevo e Ícone da Arma com Festival Sazonal

> Diretiva: "Próximos passos: sombra de contato falso sob os impostores
> (ancoragem no relevo) · transição de opacidade por distância (fade suave na
> entrada da banda) · levar o efeito sazonal ao ícone da arma no inventário".
> Continuidade direta da Fase 34 (faixa de impostores) e da Fase 36 (bake
> outdoor + HUD sazonal) — fecha o laço visual do horizonte e estende a
> temporada ao inventário.

---

## 1) Especificação Técnica de Ativos (Asset Tech Spec)

### 1.1 Fade de opacidade por distância — `vegetation3d.js`

- **Problema**: a F34 acendia o impostor em DEGRAU — alpha fixo .55 na
  entrada da banda (58 m) e corte seco na saída (110 m). O "pop" era visível
  ao andar: a mancha nascia do nada e morria sem transição, quebrando a
  leitura contínua tufos → desbaste → mancha → bake outdoor.
- **Solução — alpha por instância**: `grassImpostorFade(dist, { midDist,
  impostorDist, fadeZone })` PURA devolve 0..1 com rampa smoothstep SUBINDO
  em `[midDist, midDist+zone]` e DESCENDO em `[impostorDist−zone,
  impostorDist]`; `zone = max(.5, min(fadeZone, (impostorDist−midDist)/2))`
  garante que as rampas NUNCA se cruzam (sempre existe plateau) e a banda
  desligada (impostorDist ≤ midDist, retrocompat F32) devolve 0 em qualquer
  distância. A geometria do impostor ganha um `InstancedBufferAttribute
  'instanceAlpha'` (itemSize 1, DynamicDrawUsage, 1 slot por chunk) e o
  material é patchado por `patchInstanceAlpha(mat)` — onBeforeCompile injeta
  `attribute float instanceAlpha` → `varying vInstAlpha` → `diffuseColor.a *=
  vInstAlpha` no fragmento (MESMO contrato headless do patchSway: string de
  shader, inerte sem renderer). Uma troca de alpha por chunk por frame,
  zero materiais duplicados, zero recompilações.
- **Custo por frame INTACTO**: update() escreve o alpha do chunk na posição
  livre do buffer (O(faixa)) e marca needsUpdate; chunks com fade ≤ 0.002
  nem empacotam (draw 0 — mesma economia do tier hidden). Na saída da banda
  o alpha dissolve ANTES do corte p/ hidden — a mancha morre DENTRO do bake
  outdoor da F36, que já pintou a identidade do capim no terreno.
- **world3d**: `impostorFadeZone: 14` canônico (banda 58–110m: rampas de
  14m nas duas bordas, plateau de 24m no meio).

### 1.2 Sombras de contato falsas ancoradas no relevo — `vegetation3d.js`

- **Problema**: o quad cruzado do impostor "flutua" — sem peso no chão, a
  mancha lê como cartão em pé sobre o terreno em vez de capim plantado.
- **Solução — disco radial**: `grassShadowGeometry({ segments 14 })` gera um
  `CircleGeometry(1)` deitado (rotação −90° em X) com gradiente de alpha por
  VÉRTICE (attribute color itemSize 4 — RGBA, three r125+ detecta; centro
  preto α=1 → borda α=0 por smoothstep, sem banda dura). Nada de
  textura/canvas — contrato headless preservado. O campo de sombras é UM
  `InstancedMesh` espelho dos impostores (`grassImpostorShadows`, 1 disco
  por chunk na banda), empacotado na MESMA varredura de update: posição
  `(ch.x, ch.y + lift, ch.z)` — o MESMO ch.y dos tufos do chunk (média das
  alturas de plantio = o terreno sob o capim) com lift fino .05 anti-z-fight
  + polygonOffset −2/−2; escala fixa `impostorShadowRadius 1.9` (cobre a
  base do quad de 3.2m); `MeshBasicMaterial` preto, transparent, depthWrite
  false, renderOrder 1 (só escurece, nunca oclui); patchInstanceAlpha no
  mesmo material — **a sombra nasce, acompanha e morre com a mancha**
  (alpha idêntico ao impostor, lido do mesmo fade).
- **Toggle e custo**: `impostorShadow:false` zera o campo (count 0, custo 0);
  `impostorShadowOpacity .5` canônico; quando a banda está vazia NENHUM
  disco é empacotado — 0 draw calls como o tier hidden.

### 1.3 Ícone da arma no inventário com festival sazonal — `aura3d.js` + `hud3d.js` + `index.html` + `styles3d.css`

- **Problema**: a F36 deu a temporada ao badge e à vinheta, mas o INVENTÁRIO
  (painel da arma, canto inferior direito) seguia neutro — a skin mítica não
  se anunciava onde o jogador lê "o que tenho na mão".
- **Decisão PURA**: `weaponIconVars(aura, mythicHex)` em aura3d.js mapeia a
  decisão de `hudAuraFor` (fonte única com badge/vinheta) para o contrato CSS
  do ícone — `{ aura, season, dur, shimmerAngle }` — congelado; null sem
  aura ativa ou com hex inválido (catálogo é a fonte; HUD não inventa cor).
- **Ícone NOVO no painel**: `#weaponIcon` (index.html) — SVG inline com 8
  silhuetas por categoria (rifle · sniper · shotgun · lmg · smg · sidearm ·
  energy · melee), hud3d acende o path ativo via `data-cat` (fonte real:
  `WEAPONS3D[weapon].category`) e pinta pela raridade coletada (`--wi`,
  mesma fonte do #weaponName). Cor muda ao coletar, silhueta muda ao trocar
  de arma — leitura única de "o que tenho na mão".
- **Festival (CSS de produção)**: com skin mítica o hud3d adiciona `.mythic`
  + `--aura/--aura-season/--aura-dur` no ícone — MESMO festival do badge:
  anel cônico girando (`mythicSeason`, calc(3.2s × var(--aura-dur))) +
  varredura de brilho (`mythicShimmer`, calc(2.8s × var(--aura-dur))) no
  ::before/::after (zero layout shift), traço na cor da IDENTIDADE (--aura),
  glow em drop-shadow na cor TINGIDA pela estação (--aura-season); ritmo da
  estação: inverno contém (::before .3), primavera acende (.52);
  `prefers-reduced-motion` congela (opacidade estática .3). Sem mítica: vars
  removidas, ícone neutro — custo 0.

---

## 2) Design Funcional (Game Design)

- **Leitura contínua do horizonte fecha em 4 camadas SEM pop**: tufos cheios
  (<28m) → desbaste (28–58m) → **manchas com fade** (rampa 58–72m, plateau
  72–96m, dissolução 96–110m) → identidade cozida no terreno (≥110m). O
  jogador em deslocamento vê o capim "engrossar" e "afinar" — nunca nascer
  nem sumir em degrau. A sombra de contato ancora cada mancha NO RELEVO: o
  horizonte lê capim plantado (com peso), não cartões flutuantes.
- **Custo Zero como diretriz**: fade e sombras vivem na MESMA varredura
  O(faixa) da F34; alpha ~0 nem gera draw; sem sombra na banda vazia;
  sem textura nova (gradiente na geometria); 1 material por campo
  (impostor/sombra), 1 attribute cada — o frame paga dezenas de escritas de
  float, nada mais.
- **A temporada no inventário**: o grind mítico agora se anuncia em TODA a
  interface de arma — badge (F34), vinheta (F36) e ÍCONE (F37) respiram na
  mesma aura e no mesmo ritmo de estação. A silhueta por categoria dá
  identidade instantânea às 8 famílias de arma (rifle/sniper/shotgun/lmg/
  smg/sidearm/energy/melee) — com a skin mítica, o ícone vira um farol da
  temporada (glow na cor da estação, ritmo calmo no inverno, frenético na
  primavera).

---

## 3) Prompt de Renderização (Directiva Visual)

> Horizonte de campo aberto ao entardecer: o capim próximo é denso e
> individualizado; a 60m ele adensa em manchas translúcidas que
> **deslizam para dentro da cena** conforme o observador avança — sem corte,
> sem pop, cada mancha com uma **sombra elíptica suave sob a base**, assentada
> na ondulação do terreno; além de 110m só o chão tingido de capim até o fog.
> No HUD, o painel da arma exibe a silhueta da categoria em traço dourado de
> raridade; com a skin mítica equipada o ícone **acende em festival**: anel
> cônico girando na cor da aura, varredura de brilho e glow externo na cor
> deslocada pela estação — no inverno o brilho contém-se (ritmo 1.4× mais
> lento), na primavera transborda (0.84×) — a identidade da skin permanece
> intacta sob a camada da temporada.

---

## 4) Validação (testes + browser real)

- **Testes +6** (907 totais — 894 pass / 0 fail / 13 skip; root 39 pass / 0
  fail; tsc 0; vite build OK):
  - `vegetation3d.test.js` +4: grassImpostorFade (rampa nas DUAS bordas,
    monotonia global, plateau 1.0, fora da banda 0); zone clamp + banda
    desligada (retrocompat F32) + micro-banda (zone mínimo .5); alpha por
    instância segue o fade (buffer lido slot a slot na ordem de empacotamento,
    idempotência byte a byte); sombras de contato (espelho exato da banda,
    disco RGBA centro 1.0/borda 0, ancoragem ch.y+lift por chunk, raio fixo
    1.9, alpha casado com o impostor, toggle off = 0 sombras);
  - `aura3d.test.js` +2: weaponIconVars (4 estações mapeadas, identidade
    preservada, retorno congelado); null sem aura/ com hex inválido (custo 0).
- **Browser real** (dev server + eval no jogo rodando, W4/W1):
  - fade VIVO na cena real: bandas com alphas graduais por chunk
    ([0.1 … 1.0] a partir da posição do jogador; 5 parciais na banda
    telefoto), impostores e sombras 1:1 (11/11, 9/9, 13/13 conforme o ponto);
  - sombras ancoradas: matrizes das sombras em (ch.x, ch.y+0.05, ch.z) —
    relevo dos tufos + lift;
  - vitrine `scripts/f37-showcase.html` (módulos REAIS, bandas escaladas
    10/18/34m rotuladas): rail de 5 paradas (sparse → entrada → plateau →
    saída → hidden) com fade teórico vs alphas do buffer (entrada 0.216 vs
    plateau 1.000), sombras 14/14 e 10/10 com ancoragem y=0.07; painel de
    ícones com as 9 skins míticas em styles3d.css de PRODUÇÃO — decisão real
    de hudAuraFor + weaponIconVars, troca de estação ao vivo (primavera:
    AR-47 #ff2d78→#ff632d; inverno: →#ff2da6, ritmo 1.4×);
  - ícone no jogo real: data-cat segue a arma (sidearm→rifle→shotgun), --wi
    segue a raridade coletada (#b7c2c7→#a875ff), mítica acende
    (.weapon-icon.mythic, --aura #ff2d78, --aura-season #ff632d, --aura-dur
    0.84, animationName mythicSeason RODANDO, drop-shadow na cor da estação),
    limpeza sem mítico (classes/vars removidas — custo 0);
  - evidências PNG: f37-vitrine-plateau.png, f37-vitrine-entrada-fade.png,
    f37-vitrine-icones-inverno.png, f37-hud-icone-mitico.png,
    f37-impostor-sombra-horizonte.png.
- **Nota de instrumentação**: o loop principal chama grassLOD.update() 1×/frame
  com a câmera do jogador — em inspeção com câmera livre, CONGELAR o update
  (stub que fixa camX/camZ) antes de renderizar/tirar screenshot, senão a
  banda é re-empacotada pela câmera real entre o eval e o quadro capturado.
