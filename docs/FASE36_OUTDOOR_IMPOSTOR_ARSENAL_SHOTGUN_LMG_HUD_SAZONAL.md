# Fase 36 — Impostor OUTDOOR no Horizonte, Arsenal 9/9 (Shotgun/LMG sem soquetes) e HUD Sazonal por Aura

> Diretiva: "Próximos passos sugeridos: evoluir o tier hidden da grama para
> impostor outdoor (custo zero no horizonte) · ampliar o catálogo mítico para
> armas sem soquetes (Shotgun/LMG) · implementar efeito sazonal no HUD por
> aura · validação em navegador real (protocolo docs/gfx-ux-perf.md §5)".
> Padrão de produção 3D — três seções: especificação técnica de ativos,
> design funcional e prompt de renderização.

---

## 1) Especificação Técnica de Ativos (Asset Tech Spec)

### 1.1 Grama — o tier `hidden` ganha IMPOSTOR OUTDOOR — `vegetation3d.js`

- **Problema**: além da faixa de impostores (≥110 m) o chunk era INVISÍVEL —
  o horizonte lia "terreno nu" e a identidade do capim morria na linha do fog.
- **Solução — bake no terreno**: `grassOutdoorBake(chunks, tintFamilies)` PURA
  devolve 1 contribuição por chunk (centro + família de tint pelo MESMO módulo
  POSITIVO dos impostores — kx/kz negativos seguros);
  `applyOutdoorTint(terrainMesh, bake, { radius 25, strength .3 })` pinta um
  disco suave nas **vertex colors do terreno** (plateau no núcleo d < R/3,
  queda smoothstep até 0 na borda; fora do raio byte a byte intacto; no-op
  seguro sem atributo color). Roda UMA vez no build (`world3d`), custo
  O(verts do disco) por chunk — ~194 vértices pintados por mundo real.
- **Contrato por frame INTACTO**: o tier `hidden` segue render 0 (0 draw
  calls, 0 matrizes, 0 update) — o "impostor" agora é o PRÓPRIO CHÃO:
  4 bandas canônicas leem contínuas → tufos (<28 m) · desbaste (28–58 m) ·
  manchas de impostor (58–110 m) · **identidade cozida no terreno (≥110 m)**.
- **Espaço de cor**: THREE.Color converte hex sRGB→linear (ColorManagement) —
  o bake usa o MESMO pipeline das instance colors dos tufos (consistência
  visual medida: canal azul −13% relativo no campo = deslocamento
  verde-amarelo para a família do capim).

### 1.2 Arsenal 9/9 — Shotgun Breach SG-12 + LMG Skeetw MG-6 — `shared/weapons.js`

| Arma | Categoria | Dano | Cadência | Alcance (2D) | Pente | Munição | Raridade | Peso |
|------|-----------|------|----------|--------------|-------|---------|----------|------|
| **Shotgun Breach SG-12** | `shotgun` | **13 ×7 pellets** | 1.05 | 130 | 6 | `SHELL` (teto 32) | INCOMUM | 14 |
| **LMG Skeetw MG-6** | `lmg` | 26 | 9.2 | 400 | 80 (cinto) | `7.62` | RARO | 8 |

- **Paridade UE5**: nomes/categorias espelham `components_dev/weapons/`
  (`WPN_Shotgun_Breach` SG-12, `WPN_LMG_Skeetw` MG-6).
- **Sem soquetes** (sem a chave `sockets`): `attachmentsForDrop` devolve
  `undefined` e `ATTACHMENT_COMPAT` nunca os lista — a identidade deles é a
  skin mítica, não o kit (mesmo contrato sucata/pulse da F34).
- **Balística 3D** (`sim3d` WEAPONS3D por categoria):
  `shotgun` spread .05 / reload 2.6 / ballistic {gravity 1.05, drag .005,
  falloffStart 9, falloffEnd 34, minDamage .3} — chumbo perde a mordida
  rápido; `lmg` spread .019 / reload 3.6 / ballistic {gravity .5, drag .0018,
  falloffStart 32, falloffEnd 135, minDamage .62} — cano longo sustenta o
  7.62.
- **CHUMBO no `#spawnBullet`**: 1 gatilho = `w.pellets` projéteis, cada um com
  dispersão PRÓPRIA (spread de mira + cone `w.spread × .85`, rng determinístico
  da seed) — cobre jogador E bots numa única implementação.
- **Bots (paridade 1:1 `sim3d`/`room3d`)**: dano de REFERÊNCIA
  `damage × (pellets ?? 1)` em `#botWantsItem` — SG-12 13×7=91 vence g19 (22)
  e m4 (31) como upgrade legítimo; sem o pellet a escopeta nunca seria
  coletada (13 < 22). Salva inteira conta como 1 burst (regra sniper).
- **Loot**: `shotgun` no pool `park` (w8) + `SHELL ×8` (w7) — arma de início
  de partida ao lado da lança; `lmg` no `industrial` (w4) + `SHELL ×10` (w6) —
  pesos relativos preservam a identidade das zonas.
- **Fábricas 3D** (`entities3d.js`): SG-12 com receiver massivo, cano grosso,
  TUBO de munição, foregrip de bomba de madeira (`pumpForegrip`) e bead sight;
  MG-6 com receiver longo, cano pesado + flash hider, caixa de munição
  lateral, alça de transporte e bipé dobrado. Sem âncoras de socket.
- **Áudio** (`audio3d.js`): SG-12 BOOM grave (.26 s, 520 Hz, peak .8);
  MG-6 rasgo metálico sustentado (.12 s, 950 Hz, peak .55).

### 1.3 Skins míticas — catálogo 9/9 — `attachments3d.js`

| Arma | Skin | Aura (hex) | Fit (escala, y, z) | Identidade |
|------|------|-----------|--------------------|------------|
| AR-47 | Fúria Primordial | `#ff2d78` | 1.0, 0, 0 | assinatura F30 |
| M4 | Sentinela de Éter | `#35e1ff` | 1.22, 0, −.05 | energia contida |
| MP5 | Vaga-lume Urbano | `#b6ff3c` | .88, 0, −.06 | bioluminescência |
| Barrett | Julgamento Orbital | `#b47bff` | 1.6, .02, −.1 | altas altitudes |
| G19 | Eco Espectral | `#8ef7e0` | .55, 0, −.02 | eco fantasma |
| Sucata | Coroa de Ferro-Velho | `#ff8c1a` | 1.35, .01, −.12 | forno de ferro-velho |
| Pulse | Prisma Soberano | `#ffe14d` | 1.25, .01, −.04 | energia do General |
| **Shotgun** | **Brasa do Breach** | **`#ff5333` vermelho-brasa** | **1.15, 0, −.08** | carga de arrombamento |
| **LMG** | **Tempestade de Chumbo** | **`#4d9bff` azul-tempestade** | **1.3, .02, −.1** | rajada sustentada |

- 9 auras ÚNICAS (matizes 340/192/78/270/166/28/50/**8/214**°) — a régua de 4
  estágios e o overlay genérico são intocados (`mythicSkinFor` cobre TODO o
  arsenal; `rollLoot` aplica multiplicador de raridade como no resto).

### 1.4 Efeito SAZONAL no HUD por aura — `aura3d.js` (NOVO) + `hud3d.js` + CSS

- **`aura3d.js` (PURO, headless)** — decisão inspecionável em Node:
  - `HUD_SEASONS` — 4 estações meteorológicas do hemisfério sul (verão 12–02,
    outono 03–05, inverno 06–08, primavera 09–11), cada uma com `hueShift`
    (verão 0°, outono +8°, inverno −12°, primavera +16°), `durMul` (ritmo do
    festival: 1 / 1.18 / 1.4 / .84) e `shimmer` (ângulo 105/121/75/137°);
  - `seasonIndexForMonth/For` — mapeamento puro à prova de entrada suja
    (NaN/negativo/overflow; Date podre → guard determinístico 15/07);
  - `shiftAuraHex` — desloca a matiz SEM tocar s/l (regex `#rrggbb` antes do
    THREE.Color — lixo devolve branco, não NaN); a aura original nunca sai do
    catálogo: a estação TINGE, nunca substitui;
  - `hudAuraFor` — null sem skin mítica (HUD neutro, custo 0); ativa devolve
    `{stage, seasonIdx, season, hueShift, durMul, shimmerAngle}` — agnóstica
    por arma (o chamador faz o gate do catálogo).
- **`hud3d.js`** — a cada update com mítico equipado: badge recebe
  `--aura`/`--aura-season`/`--aura-dur` (F34 mantida + ritmo da estação) e o
  `body` recebe `data-aura`/`data-aura-season` + as mesmas variáveis; sem
  mítico: atributos REMOVIDOS (vinheta some, custo 0).
- **CSS** — `#auraVignette` (NOVO no `index.html`): camada fixa
  `pointer-events: none`, radial-gradient de borda em
  `color-mix(var(--aura-season) 30%)`, `mix-blend-mode: screen`, opacity por
  estação (inverno .36 contém o festival, primavera .58 frenética, base .5);
  badge escala as durações por `calc(3.2s * var(--aura-dur, 1))` e
  `calc(2.8s * var(--aura-dur, 1))`. `prefers-reduced-motion` congela tudo
  (vinheta estática .3, badge .35 — leitura de raridade preservada).

---

## 2) Design Funcional

### 2.1 O horizonte que não morre
- Leitura contínua em TODA a distância: o jogador enxerga tufos nítidos →
  capim desbastado → manchas de impostor → **o campo continua pela cor do
  chão até a linha do fog**. O tier `hidden` mantém custo de render 0 — o
  impostor outdoor é literalmente grátis (0 draw calls, 0 matrizes, 0 update;
  o bake é pago UMA vez no load, ~ms).
- Medição no mundo real (CIGKV, seed CIGKV-3D-01, 82 chunks): 194 vértices
  tingidos; média no campo [r .857, g .843, b .746] vs fora
  [r .904, g .886, b .861] — canal azul −13% relativo = deslocamento
  verde-amarelo para a família do capim, invisível de perto (os tufos
  dominam), decisor no horizonte.

### 2.2 Arsenal completo — o grind mítico fecha em 9/9
- A SG-12 nasce no park (zona de início): a primeira arma de fogo pesado do
  jogador tem caminho de dream skin (Brasa do Breach) desde o drop.
- A MG-6 é o prêmio de sustentação do mid-game (cinto de 80 no 7.62 que já
  abastece a AR-47 — zero munição nova no inventário).
- Bots VIVEM as novas armas: coletam a SG-12 como upgrade legítimo (referência
  ×pellets), disparam a salva completa e NÃO rebaixam para g19 — paridade
  provada nas duas trilhas (sim offline e MatchRoom3D).
- Sazonalidade SEM custo: 100% CSS + decisão pura; trocar de arma re-pinta a
  vinheta no próximo update do HUD; sem mítico o corpo fica limpo (nenhuma
  camada anima).

### 2.3 Temporada no HUD
- A estação REAL do dia (hemisfério sul) modula o festival: primavera acelera
  (0.84×) e alarga a vinheta; inverno contém (1.4×, .36). A identidade da
  skin permanece — a estação tinge (hueShift ≤ 16°), nunca substitui.
- Acessibilidade preservada: `prefers-reduced-motion` trava animações e
  reduz a vinheta a presença estática.

---

## 3) Prompt de Renderização (para os artistas/IA de imagem)

> Battle-royale mobile stylized-realista, Third-Person, FreeFire-like.
> HORIZONTE ETERNO: planície ao entardecer onde o capim nítido desbasta com a
> distância, vira manchas translúcidas que balançam e enfim DISSOLVE-SE NA COR
> DO PRÓPRIO CHÃO — o terreno carrega manchas verde-oliva suaves até a linha
> do fog, como se a mata continuasse para sempre sem um triângulo a mais.
> ARSENAL SOBERANO 9/9: no centro, a escopeta Breach SG-12 envolta em brasa
> vermelha #ff5333 — bomba de madeira escura, tubo brilhando como fornalha —
> e, ao lado, a metralhadora Skeetw MG-6 em azul-tempestade #4d9bff, caixa de
> munição faiscando, bipé plantado; ao redor, as sete auras irmãs (rosa-caos,
> ciano-éter, lima, violeta, menta, âmbar, ouro-arco) em fila cerimonial.
> HUD: badge "EV.4 · Brasa do Breach" com anel cônico girando rápido (spring
> festival de primavera) e a BORDA DA TELA respirando na cor da aura — o
> jogador carrega a temporada consigo. Grão de filme leve, fog frio,
> atmosfera crepuscular.

---

## Evidências
- `game-runtime/artifacts/f36-shotgun-lmg-miticas.png` — close da fileira:
  SG-12 (brasa) e MG-6 (azul-tempestade) com overlay mítico estágio 4
- `game-runtime/artifacts/f36-catalogo-mitico-9.png` — as 9 auras únicas em
  fila cerimonial + badge sazonal "Prisma Soberano · PRIMAVERA" (estação REAL
  do dia) + vinheta de borda na cor da aura
- `game-runtime/artifacts/f36-outdoor-bake-horizonte.png` — leitura contínua:
  tufos → manchas de impostor → identidade cozida no terreno até o fog
- `game-runtime/artifacts/f36-grama-outdoor-horizonte.png` — mundo REAL
  (CIGKV ?scenario=cigkv&view=tps): bake vivo no terreno com faixa de
  impostores ativa (9 na faixa, 76 chunks ocultos com identidade no chão)
- `game-runtime/scripts/f36-showcase.html` — vitrine dev com módulos REAIS
  (9 armas, bake real via applyOutdoorTint, rotação sazonal automática)
- Testes: suíte completa **901 — 888 pass / 0 fail / 13 skip** (+26 F36:
  bake contribuição/módulo positivo/determinismo; applyOutdoorTint disco
  suave/borda intacta/kernel monotônico/no-op; regressão do tier hidden
  render 0; buildScene W1 com bake registrado e terreno tingido; catálogo
  9/9 auras únicas; SG-12/MG-6 stats sem sockets + attachmentsForDrop
  undefined; pools com SHELL; fábricas 3D sem âncoras; sim: 7 projéteis
  determinísticos, teto SHELL + recarga consumindo reserva, bot coleta
  SG-12 por referência ×pellets e NÃO rebaixa, salva completa do bot; aura3d:
  estações 12 meses, robustez, shiftAuraHex idempotente/sem colisão,
  hudAuraFor null/neutro/ativa por estação/determinismo/clamp de estágio);
  root 430+39 pass / 0 fail; tsc 0; `vite build` OK (2.72 s)
- Validação browser real (protocolo §5): bake medido por eval
  (`grassOutdoorBake {chunks:80, radius:25, strength:.3}`), HUD sazonal vivo
  (`body[data-aura=#ff5333]`, `data-aura-season=primavera`, vinheta .58),
  persistência `KR_GFX_SETTINGS_V1` round-trip OK
