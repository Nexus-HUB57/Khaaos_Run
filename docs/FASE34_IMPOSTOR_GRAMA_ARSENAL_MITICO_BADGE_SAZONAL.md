# Fase 34 — Impostor da Grama no Horizonte, Arsenal Mítico COMPLETO e Badge Sazonal

> Diretiva: "Prosseguir end to end e atualizar o repo" — próximos passos anunciados
> na validação da F32: ① tier impostor billboard para a grama distante,
> ② skins míticas para as armas SEM sockets (sucata/pulse) e ③ efeito sazonal
> no HUD por aura. Padrão de produção 3D — três seções: especificação técnica
> de ativos, design funcional e prompt de renderização.

---

## 1) Especificação Técnica de Ativos (Asset Tech Spec)

### 1.1 Grama com faixa de IMPOSTORES — `vegetation3d.js`

- **4 bandas canônicas** (`grassChunkTier`): `full` (<28 m, count cheio) ·
  `sparse` (28–58 m, fração .4) · **`impostor` (58–110 m, NOVO)** ·
  `hidden` (≥110 m, custo 0). `impostorDist <= midDist` DESLIGA a faixa —
  chamadas F32 seguem idênticas (retrocompatível).
- **`grassImpostorGeometry({height:1.15, width:3.2})`** — 2 quads cruzados (X)
  fundidos em 1 geometria (12 verts não-indexados): silhueta dupla evita o
  "flipse" de plano único quando a câmera orbita; sem textura e sem alpha-test
  (cor chapada por instância) — ~2 triângulos por chunk.
- **Campo GLOBAL de impostores** — 1 `InstancedMesh` com capacidade de 1
  instância por chunk (`grassImpostors`, dentro do grupo `grassLOD`). O
  `update(camX, camZ)` empacota NA FRENTE as matrizes dos chunks na faixa
  (escrita O(faixa), tipicamente 9–20 células) e define `count`; os tufos
  continuam intocados (só `visible`/`count` como na F32).
- **Relevo e identidade**: o chunk carrega agora `kx/kz` e a ALTURA MÉDIA dos
  membros — o impostor nasce na altura do terreno sem re-testar colisão; tint
  por instância herda a família de cor do chunk (módulo POSITIVO — kx/kz
  negativos) e yaw determinístico `(kx*7 + kz*13) % 6`.
- **Vento**: material do impostor recebe `patchSway` (metade da amplitude,
  `yScale .5`) e entra em `scene.userData.swayMats` via `impostorMats` — a
  mancha distante balança junto do capim próximo.
- **Opacidade**: `.55` fixa, `depthWrite true`, sem sombra projetada — leitura
  de "mancha de capim" no horizonte sem pop visual.

### 1.2 Arsenal mítico COMPLETO — `MYTHIC_SKINS` (attachments3d.js)

| Arma | Skin | Aura (hex) | Fit (escala, y, z) | Identidade |
|------|------|-----------|--------------------|------------|
| AR-47 | Fúria Primordial | `#ff2d78` rosa-caos | 1.0, 0, 0 | assinatura F30 |
| M4 | Sentinela de Éter | `#35e1ff` ciano-éter | 1.22, 0, −.05 | energia contida |
| MP5 | Vaga-lume Urbano | `#b6ff3c` lima-tóxica | .88, 0, −.06 | bioluminescência |
| Barrett | Julgamento Orbital | `#b47bff` violeta | 1.6, .02, −.1 | altas altitudes |
| G19 | Eco Espectral | `#8ef7e0` menta | .55, 0, −.02 | eco fantasma |
| **Sucata** | **Coroa de Ferro-Velho** | **`#ff8c1a` âmbar-ferrugem** | **1.35, .01, −.12** | forno de ferro-velho |
| **Pulse** | **Prisma Soberano** | **`#ffe14d` ouro-arco** | **1.25, .01, −.04** | energia do General |

- Mesma régua de 4 estágios (`mythicStageFromKills` PURA compartilhada) e o
  MESMO overlay genérico — o `fit` assenta na silhueta (lança longa 1.35×,
  rifle de energia 1.25×); fábricas de `entities3d.js` intocadas (o pipeline
  `mythicSkinFor(id)` já era genérico).
- 7 auras ÚNICAS no catálogo — identidade à distância em todo o arsenal.

### 1.3 Badge sazonal por aura — `hud3d.js` + `styles3d.css`

- `#mythicStage` recebe `--aura` (cor da skin) a cada update do HUD.
- CSS: `::before` = anel cônico girando (`conic-gradient` transparente → aura
  → transparente, `mythicSeason 3.2s linear infinite`); `::after` = varredura
  de brilho (`linear-gradient` 105°, `mix-blend-mode: screen`,
  `mythicShimmer 2.8s ease-in-out`). Pseudo-elementos (zero layout extra),
  animam só com o badge visível e respeitam `prefers-reduced-motion`.

---

## 2) Design Funcional

### 2.1 Leitura contínua do horizonte
- O jogador vê AGORA: tufos nítidos (<28 m) → capim desbastado (28–58 m) →
  manchas verdes que marcam onde a mata continua (58–110 m) → horizonte limpo
  (≥110 m). O "vazio" da F32 entre 58–110 m virou informação tática: capim
  distante lê como CAPIM, não como terreno nu — sem custo perceptível
  (~2 triângulos/chunk vs dezenas de tufos).
- Orçamento por frame: 1 hipotenusa por chunk + empacotamento de matrizes
  SOMENTE da faixa (células mudam de banda raramente ao andar) — update segue
  O(chunks), idempotente e determinístico (testes headless byte a byte).

### 2.2 Grind mítico em TODO o arsenal
- **Sucata** (melee, pool 'park') rola a tabela completa — pode nascer COMUM
  até MÍTICA (Coroa de Ferro-Velho, 0.8%): a arma de início de partida agora
  tem "dream skin".
- **Pulse** (rifle do General) mantém o piso de flavor: rola raridade como o
  arsenal, mas QUALQUER rolagem abaixo de LENDARIO sobe para LENDARIO — e
  MÍTICA atravessa o piso (Prisma Soberano, 1.75× de dano, 84 por tiro).
- Evolução idêntica: abate sobe estágio (evento `mythic` carrega a arma e o
  toast usa o NOME da skin — "Pulse · Prisma Soberano evoluiu — ESTÁGIO 3").
- Sem sockets: sucata/pulse não recebem anexos (`attachmentsForDrop` já
  devolve undefined) — a míticas delas são puramente de identidade visual.

### 2.3 Sazonalidade sem custo
- O efeito é 100% CSS na cor da skin corrente — trocar de arma re-pinta o
  badge no próximo update do HUD; badge escondido (`hidden`) não anima.
- Acessibilidade: `prefers-reduced-motion` congela anel/shimmer (opacidade
  estática .35) — leitura de raridade preservada.

---

## 3) Prompt de Renderização (para os artistas/IA de imagem)

> Battle-royale mobile stylized-realista, Third-Person, FreeFire-like. HORIZONTE
> VIVO: campo aberto ao entardecer onde o capim em tufos nítidos desbasta com a
> distância e se dissolve em manchas verdes translúcidas que pontuam a planície
> até a linha do fog — cada mancha é um par de planos cruzados balançando junto
> do vento, lidas como "ali continua a mata"; além delas, só relevo e atmosfera.
> ARSENAL SOBERANO: um operativo segura o rifle de pulso do General banhado em
> ouro-arco #ffe14d — núcleo de energia exposto, runas incandescentes e aleta
> holográfica dupla-face pulsando; ao lado, deitada no chão molhado, a lança de
> sucata Coroa de Ferro-Velho em âmbar-ferrugem #ff8c1a com pregos em brasa e
> fita de punho envelhecida; cada aura reflui como festival de fim de temporada.
> HUD: badge "EV.4 · Fúria Primordial" em ouro com anel cônico girando e
> varredura de brilho atravessando o texto. Grão de filme leve, fog frio,
> atmosfera crepuscular.

---

## Evidências
- `game-runtime/artifacts/f34-pulse-mitico-tps.png` — Prisma Soberano em TPS +
  badge EV.4 na aura ouro-arco (#ffe14d) com shimmer sazonal
- `game-runtime/artifacts/f34-grama-impostor-horizonte.png` — faixa de
  impostores ao vivo (câmera elevada + solo; manchas verdes no campo)
- Testes: suíte completa **861 — 848 pass / 0 fail / 13 skip** (+9 F34: 4
  bandas com retrocompat, geometria do impostor, empacotamento da faixa com
  matrizes verificadas, idempotência, buildScene W1-W4 com vento do impostor;
  catálogo 7 auras, fit da sucata/pulse, piso LENDARIO do pulse com MÍTICA
  atravessando, tabela completa da sucata, sim: pulse mítico evolui por abate);
  `vite build` OK (2.71 s)
- Validação ao vivo (`?scenario=w4&view=tps`): campo de impostores presente
  (capacidade = chunks), faixa segue a câmera (12 na origem → 17 a +70 m → 9
  no setor industrial), matrizes apontam para centros de chunk, vento do
  impostor registrado; badge mítico re-pinta por arma com `--aura`
