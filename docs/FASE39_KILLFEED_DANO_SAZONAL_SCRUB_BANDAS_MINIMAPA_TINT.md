# Fase 39 — Festival Sazonal no Killfeed/Damage Numbers, Sombras de Contato do Scrub em Bandas de Distância e Mini-mapas com Tint Sazonal

> Diretiva: "Prosseguir end to end: revisar repo e auditar desenvolvimento de
> outros Devs · estender o festival sazonal ao killfeed/damage numbers, sombra
> de contato para o scrub de Barburhen em bandas de distância · mini-mapas com
> tint sazonal por estação". Continuidade direta da Fase 38 (desbaste gradual +
> sombras dos arbustos + mira sazonal) — o festival toma a superfície de
> COMBATE (feed de eli + números de dano), o mato rasteiro de Barburhen ganha
> âncora com consciência de distância e o radar obedece ao calendário.

---

## 1) Especificação Técnica de Ativos (Asset Tech Spec)

### 1.1 Killfeed + números de dano no festival — `aura3d.js` + `hud3d.js` + `damageNumbers3d.js` + `styles3d.css`

- **Fonte única intacta**: `killfeedVars` e `damageVars` são mapeamentos PUROS
  do MESMO contrato de `weaponIconVars`/`crosshairVars` (F37/F38) — identidade
  da skin em `aura`, cor TINGIDA pela estação em `season`, ritmo em `dur`;
  `null` sem skin mítica ou hex inválido (consumidor neutro, custo 0).
- **Killfeed (`hud3d.killfeed`)**: só entradas do PRÓPRIO jogador
  (`isPlayerKill`) recebem `.mythic` + `--kf-aura/--kf-season/--kf-dur` — a
  aura é a skin EQUIPADA, ela celebra a eli do jogador, não o que ele assiste;
  kills entre bots e ecos do RING permanecem neutros. `hud.auraCombat` (freeze
  `{aura, season, dur}`) é a variável compartilhada, decidida 1×/frame no
  `update` pelo mesmo bloco F36-38 e limpa simetricamente sem mítica.
- **Números de dano (`DamageNumbers3D.setAuraVars` + `spawn`)**: o pool recebe
  as variáveis por frame (main3d repassa `hud.auraCombat` antes do `update`)
  e acende `.mythic` + `--dmg-aura/--dmg-season` SOMENTE nos tiers NEUTROS
  (`dmg-body`/`dmg-head`). A gramática de leitura rápida fica intacta:
  headshot mantém o VERMELHO (ganha só o halo da estação), `dmg-hazard` preserva
  a identidade por mundo e `dmg-knock` o dourado de recompensa. Guard no
  setter: só `{aura, season}` strings entram — dado podre nunca decora.
  `clear()` NÃO limpa o festival (a skin equipada sobrevive ao restart).
- **CSS de produção (`styles3d.css`)**: `.kill-entry.mine.mythic` — borda na
  identidade (`color-mix` 55%), ícone ☠/✕/◌ no glow da estação, pulso
  `kfSeason` escalado por `--kf-dur` (reduced-motion congela o pulso);
  `.dmg-num.mythic` pinta o corpo com a aura e `.dmg-num.mythic.dmg-head`
  preserva `#ff4d4d` trocando só o halo — especificidade calibrada para o
  dicionário de classes existente continuar decidindo o tier.

### 1.2 Sombras de contato do scrub em bandas de distância — `vegetation3d.js` + `world3d.js` + `main3d.js`

- **Problema**: os discos de contato do mato rasteiro de Barburhen (F7,
  ~1.05 m) eram ESTÁTICOS — opacidade cheia a 200 m virava moiré escuro no
  horizonte e pagava overdraw sem ganho de leitura.
- **`scrubShadowBand(dist, {nearDist=30, farDist=90})` PURA**: cheio (≤30 m,
  âncora plena), raleio smoothstep (30→90 m, some ANTES do fog comer a
  vegetação — nunca sobrevive ao que ancora), zero (≥90 m). Banda degenerada
  (`farDist ≤ nearDist`) vira degrau retrocompatível (mesmo guard da F38,
  sem NaN); dist suja (NaN/negativo) → 0.
- **`buildBandContactShadows(scene, entries, {opacity, nearDist, farDist})`**
  (`world3d.js`): mesma textura radial F7 (consistência visual), material
  transparente sem depthWrite + polygonOffset, alpha POR INSTÂNCIA via
  `patchInstanceAlpha` (F37) — `update(camX, camZ)` escreve 1 float por disco
  (O(scrub), ~150 hipotenusa + 150 floats) e esconde o mesh quando a banda
  está vazia (0 draw calls). Ancoragem no RELEVO: `entry.y = terrainHeightAt
  + 12 mm` (plano jogável = 0, margem acompanha — mesmo contrato do capim F37).
- **Wiring**: `buildNature` (Barburhen) separa as sombras do scrub do lote
  estático da natureza (árvores/pedras/arbustos seguem F7/F38 intocados) e
  registra `scene.userData.scrubBandShadows` + `scrubShadowEntries` (padrão
  propPlacements); `main3d.loop` chama `update()` 1×/frame ao lado do
  `grassLOD.update`. Banda canônica 30→90 m: dentro do full do capim (28 m) a
  âncora é plena; o raleio termina antes do fim da banda de impostores (110 m)
  — a sombra nunca sobrevive à vegetação que ela ancora. Gate por
  `q.contactShadows` (mesmo orçamento da F7).

### 1.3 Mini-mapa com tint sazonal por estação — `aura3d.js` + `hud3d.js` + `styles3d.css`

- **`MINIMAP_SEASON_TINTS` + `minimapTintFor(seasonIdx)` PURAS** (`aura3d.js`):
  4 entradas congeladas na MESMA ordem/ids do calendário do festival
  (`HUD_SEASONS` — verão/outono/inverno/primavera, hemisfério sul). Cada tint
  define `overlay` (véu rgba, alpha ≤ .12), `grid` (cor da grade da estação —
  antes roxo fixo) e `edge` (borda/halo da moldura, hex canônico). Clamp
  módulo: NaN → verão, sujo → wrap — o radar nunca fica sem estação.
- **Semáforo tático INTACTO**: a tabela NÃO contém as cores funcionais
  (terminal verde/âmbar, loot ciano, recon âmbar, jogador dourado, anéis do
  Ring) — testes fixam essa ausência. "A estação tinge, nunca substitui".
- **`#drawMinimap` (`hud3d.js`)**: fundo → grade na cor da estação → véu sobre
  fundo+grade (ANTES dos marcadores funcionais) → anéis/terminais/loot/recon/
  jogador intocados. A moldura (`.minimap-frame`) ganha `.seasonal` +
  `--mm-edge` a cada draw: borda tingida (`color-mix` 45%) e halo
  (`color-mix` 28%) com transição suave (.4s) entre estações — custo ~0,
  2 propriedades compostas.

## 2) Design Funcional (Game Design)

- **Festival toma o combate sem roubar a informação**: o jogador com skin
  mítica reconhece a temporada em TODA a cadeia de leitura de combate —
  vinheta (F36) → mira (F38) → feed de eli → números de dano. A identidade da
  skin (`--*-aura`) sempre na forma, a estação (`--*-season`) no brilho: a
  leitura "headshot = vermelho grande", "NOCAUTE = dourado", "hazard = cor do
  mundo" e "minimapa = semáforos fixos" permanece byte a byte.
- **Âncora com consciência de orçamento**: a sombra do scrub é informação de
  contato NEAR — perto ela cola a silhueta no chão (leitura de cobertura
  entre o mato), longe ela é ruído. A banda 30→90 m alinha o raleio com o
  vocabulário do capim (full 28 m, impostor até 110 m): a sombra morre
  ENQUANTO a vegetação ainda é lida, nunca depois — sem fantasma de sombra
  sem dono.
- **Radar sazonal = calendário, não skin**: o tint do minimapa é por ESTAÇÃO
  DO ANO (a mesma `seasonIndexFor` da vinheta), ativa para TODOS os jogadores
  — o mundo respira a temporada; a aura do jogador decora o combate. Duas
  camadas de festival independentes que se encontram na mesma fonte pura.

## 3) Prompt de Renderização (Directiva Visual)

- Killfeed mítico: borda da entrada na cor da skin (rosa-caos M4 `#35e1ff` no
  inverno vira `#35f9ff` no glow), ícone ☠ respirando no ritmo calmo do
  inverno (×1.4); entradas de bots imutáveis.
- Números de dano: corpo branco → cor da skin, halo fino da estação no
  headshot vermelho; hazard ácido de Barburhen permanece `#a8e86a`.
- Scrub de Barburhen: discos radiais F7 nascendo e morrendo com a distância —
  perto, sombra firme sob cada tufo cruzado; a 60 m, fantasma translúcido; a
  90 m, nada além do fog comendo o mato.
- Minimapa: véu da estação sobre a grade (verão quente, inverno gelado,
  primavera broto, outono âmbar), moldura respirando na cor da estação;
  anéis laranja/ácido, terminais e loot nos semáforos canônicos.

## 4) Validação (testes + browser real)

- **Unit (game-runtime)**: suíte completa 915 — **913 pass / 0 fail / 13
  skip** (baseline F38: 902 pass; +11 F39). Novos:
  - `aura3d.test.js` +3: paridade dos mapeamentos killfeed/damage (fonte
    única, 4 estações, congelado, null guards); tabela de tints (4 estações
    congeladas, ids = calendário, alpha ≤ .12, sem tocar semáforos);
    `minimapTintFor` (determinismo, clamp módulo, estações distintas,
    integração julho → inverno).
  - `damage-numbers.test.js` +3: body/head com `.mythic` + vars; hazard/NOCAUTE
    intocados; null/lixo → neutro e festival sobrevive ao `clear()`.
  - `vegetation3d.test.js` +5: `scrubShadowBand` (cheio/raleio/zero, monotonia
    global não-crescente 0→120 m, banda degenerada, entrada suja, bandas
    custom); `buildBandContactShadows` (capacidade = entradas, material,
    alpha por distância, idempotência, banda vazia → invisível, null guard);
    `buildScene` Barburhen (83 discos ancorados no relevo, scrub SAIU do lote
    estático — sem sombra duplicada); outros mundos sem campo (custo 0).
- **Build**: `vite build` OK (2.61 s).
- **Browser real (dev server + eval)**:
  - **Vitrine `scripts/f39-showcase.html`** (módulos REAIS): killfeed
    `.mine.mythic` acendido com vars reais (M4 inverno `#35e1ff → #35f9ff
    ×1.4`) + entrada neutra de bots imutável; pool de dano com 2 números
    `.mythic` (body/head) e hazard NEUTRO (semáforo intacto); minimapa
    `.seasonal` ciclando `#6fa8dc` (inverno) → `#ff9a4d` (verão) → `#7ddc6a`
    (primavera); scrub em bandas — mesmo cluster a 16 m α=1, a 94 m α=0,
    raleio 0.255–0.616 no meio da banda, campo O(54) com mesh invisível fora
    da banda. Evidências: `f39-validate-showcase-live.png`,
    `f39-validate-scrub-banda-cheio.png`, `f39-validate-scrub-banda-fora.png`,
    `f39-validate-minimapa-estacoes.png`.
  - **Jogo real W1 (Barburhen, `?scenario=barburhen&view=tps`)**:
    `scene.userData.scrubBandShadows` com 83 discos ancorados no relevo
    (y = terreno + 12 mm), alpha 1 no pé do tufo e 13 sombras acesas na banda;
    HUD vivo com killfeed (entradas neutras para jogador sem skin mítica) e
    moldura do minimapa `.seasonal` com `#7ddc6a` (primavera — calendário
    real de outubro no hemisfério sul). Evidências:
    `f39-validate-barburhen-scrub-near.png`, `f39-validate-barburhen-scrub-far.png`.
  - **Regressão W4 (Arukheea, `?scenario=w4&view=tps`)**: grassLOD F32/F37/F38
    intacto (preRoll 9, zonas 10/12, sombras de impostor presentes), SEM campo
    de scrub (custo 0 em mundos sem mato rasteiro). Evidência:
    `f39-validate-w4-regressao.png`.
- **Auditoria de devs paralelos**: `origin/main` avançou 1 commit desde a F38
  (`c84869b` — upload de docx de revisão técnica de modelagem em
  `Epic Games/IMPLEMENTACAO_GRAFICA`; docs-only, zero drift de código em
  `game-runtime` desde a F38). Rebase limpo sobre `origin/main` antes do push.
