# Fase 32 — Skins Míticas por Arma, Anexos por Raridade e Grama com LOD

> Diretiva: "skin mítica evolutiva para as outras armas, variantes de anexos por
> raridade (visual gasto→dourado), grama com LOD de distância."
> Padrão de produção 3D — três seções: especificação técnica de ativos, design
> funcional e prompt de renderização.

---

## 1) Especificação Técnica de Ativos (Asset Tech Spec)

### 1.1 Catálogo mítico por arma — `MYTHIC_SKINS` (attachments3d.js)

| Arma | Skin | Aura (hex) | Fit (escala, offset z) | Identidade visual |
|------|------|-----------|------------------------|-------------------|
| AR-47 | AR-47 · Fúria Primordial | `#ff2d78` rosa-caos | 1.0, 0 | assinatura F30 — runas de caos |
| M4 | M4 · Sentinela de Éter | `#35e1ff` ciano-éter | 1.22, −0.05 | linha fria de energia contida |
| MP5 | MP5 · Vaga-lume Urbano | `#b6ff3c` lima-tóxica | 0.88, −0.06 | bioluminescência de beco |
| Barrett | Barrett · Julgamento Orbital | `#b47bff` violeta-orbital | 1.60, −0.10 | julgamento de altas altitudes |
| G19 | G19 · Eco Espectral | `#8ef7e0` menta-espectral | 0.55, −0.02 | eco fantasma de mira curta |

- **Estágios (4, mesma régua FF)**: 0 abates → Forja Bruta (faixa dorsal); 2 →
  Marca do Caos (runas laterais + ventes); 4 → Despertar Primordial (núcleo +
  bordas incandescentes); 6 → Fúria Primordial (aleta holográfica + aura).
  `mythicStageFromKills()` permanece PURA e compartilhada.
- **Fit por silhueta**: o overlay mítico é genérico; o campo `fit` (escala +
  offset y/z) o assenta em cada arma — pistola 0.55×, sniper 1.6× — sem tocar
  as fábricas de `entities3d.js`.
- **Orçamento**: overlay = ≤ 8 meshes emissivos por arma (memo de geometria +
  materiais por estágio); pulso por frame é 1 uniforme emissivo
  (`tickMythicWeapons`, registro com auto-limpeza de grupos órfãos).

### 1.2 Anexos por raridade — `ATTACHMENT_RARITY_TREATMENTS` (attachments3d.js)

| Tier | Corpo (hex) | Rough | Metal | Acento | Chip | Desgaste |
|------|------------|-------|-------|--------|------|----------|
| COMUM (gasto) | `#33363a` | 0.90 | 0.30 | — | `#b7c2c7` | risco claro (`#8b9096`) em cada peça |
| INCOMUM | `#1c1f24` | 0.55 | 0.70 | ciano `#42d9de` | ciano | — |
| RARO | `#1c1f24` | 0.50 | 0.74 | violeta `#a875ff` | violeta | — |
| LENDARIO | `#3d3423` | 0.38 | 0.88 | ouro fosco `#ffb52e` | ouro | — |
| MITICA | `#c9a23f` | 0.16 | 0.95 | ouro vivo `#ffd75e` | ouro pulsante | — |

- Os 4 anexos (mira4x, silenciador, magestendida, gripvertical) aceitam os 5
  tiers — a forma é a mesma, o acabamento muda: corpo fosco escurecido +
  arranhão (COMUM), acentos anel/banda/montagem na cor do tier (RARO+), ouro
  polido com emissivo (MITICA).
- **Chip de raridade**: cubo emissivo de 1.8 cm nomeado `rarityChip` montado em
  posição canônica por anexo — leitura de tier à distância, cor vinda da tabela
  central `RARITIES` (shared/weapons.js).
- **Memo com chave de tier** (`att.metal:${tier}`) — zero vazamento de material
  entre raridades; `attachmentRarityFor()` aceita mapa `{id:rarity}`, array
  paralelo, string única ou null (padrão INCOMUM — retrocompatível F30/31).

### 1.3 Grama com LOD de distância — `vegetation3d.js`

- **Chunking**: `grassChunkify(spots, {chunkSize:25})` divide o campo em células
  de 25 m (PURO, ordenado por chave de célula); cada chunk carrega o centro
  médio dos membros para o teste de distância.
- **Tiers**: `grassChunkTier(dist)` → `full` (<28 m: count cheio), `sparse`
  (28–58 m: `ceil(count×0.4)` na ordem de plantio estável — desbaste sem
  tremulação), `hidden` (≥58 m: `visible=false`, custo de render 0).
- **Custo**: 1 InstancedMesh por chunk (geometria de tufo compartilhada, tint
  por instância, vento por shader nas 2 famílias de cor); `update(camX,camZ)` é
  O(chunks) por frame e só troca `visible`/`count` — sem reescrita de matrizes.
  Cena W4 'high': 189 chunks, ~10 visíveis na origem (3 full + 7 sparse).
- `buildGrassFieldLOD()` é headless (InstancedMesh sem renderer) e
  determinístico; `world3d` registra `scene.userData.grassLOD` e o main3d
  chama `update()` 1×/frame com a posição da câmera.

---

## 2) Design Funcional

### 2.1 Progressão mítica generalizada
- **Loot**: qualquer arma com sockets pode rolar raridade MÍTICA (`rollRarity`
  weight 0.8); arma mítica nasce com estágio 1 e kit de série COMPLETO cujos
  anexos HERDAM a raridade da arma (kit dourado).
- **Evolução**: `#creditMythic` dispara em todo o arsenal com skin mítica
  (ar47/m4/mp5/barrett/g19) — abate derruba/evolui; evento `mythic` carrega a
  arma e o main3d monta o toast com o NOME da skin ("M4 · Sentinela de Éter
  evoluiu — ESTÁGIO 3: …").
- **Render**: main3d detecta `weaponSkin === 'MITICA'` + `mythicSkinFor(weapon)`
  e passa `mythicStage` + `mythicColor` + raridades à fábrica; cache de rig
  inclui as raridades (`rar`) para re-render em troca de kit.

### 2.2 Ciclo de vida da raridade do anexo (gasto→dourado)
1. **Nascimento** — anexo avulso rola raridade própria em `rollLoot`; anexo de
   série herda a raridade da arma.
2. **Instalação** — `#pickup` grava `attachmentRarities` paralelo a
   `weaponAttachments`; incompatível vai ao bolso com `attachmentBagRarities`.
3. **Troca/reinstalação** — `switchSlot` e `#installBagAttachments` movem ids +
   raridades EM PARALELO (nada se perde; bolso preenche sockets livres).
4. **Herança** — `deathBoxContents` preserva anexos E raridades (matou,
   herdou TUDO).
5. **Visual** — `applyAttachments(group, ids, rarities)` monta cada anexo com o
   acabamento do tier + chip; HUD pinta a borda/brilho do slot com a cor da
   raridade e tooltip "Mira 4x · LENDARIO".

### 2.3 Grama LOD no fluxo do frame
- `buildScene` planta os tufos (clumps, colisões, relevo — inalterado) e monta o
  campo LOD; o tick do main3d chama `grassLOD.update(camera.x, camera.z)` junto
  do vento — a grama densa segue o jogador, o horizonte fica limpo e barato.

---

## 3) Prompt de Renderização (para os artistas/IA de imagem)

> Battle-royale mobile stylized-realista, Third-Person, FreeFire-like. ARSENAL
> MÍTICO: cinco armas em fileira sobre campo aberto ao entardecer — AR-47 com
> runas rosa-caos incandescentes e madeira envelhecida, M4 com filamentos
> ciano-éter percorrendo o receiver, MP5 com veios lima bioluminescentes,
> Barrett poluído por violeta orbital e a pistola G19 traslúcida em menta
> espectral; cada arma expele aleta holográfica dupla-face e pilar de aura
> translúcido na própria cor, chão molhado refletindo os glows. ANEXOS POR
> RARIDADE: mesma mira 4x e mesmo silenciador repetidos em cinco acabamentos —
> metal gasto escurecido com risco claro de uso, padrão de fábrica com chip
> ciano, acentos violeta emissivos, banho de ouro fosco e ouro polido com
> brilho dourado pulsante; chip quadrado emissivo no topo de cada peça,
> legível a distância. CENÁRIO: capim em tufos cruzados com curvatura natural —
> denso e nítido num raio de 28 m, rarefeito em faixa intermediária, inexistente
> no horizonte; vento visível nas copas e no capim próximo, grão de filme
> leve, atmosfera crepuscular com fog frio.

---

## Evidências
- `game-runtime/artifacts/f32-showcase-miticas-anexos-grama.png` — vitrine geral
- `game-runtime/artifacts/f32-skins-miticas-close.png` — 5 auras míticas por arma
- `game-runtime/artifacts/f32-anexos-raridade-close.png` — gasto→dourado nos anexos
- `game-runtime/artifacts/f32-w4-tps-farol-grama.png` / `f32-w4-solo-grama.png` — W4
  Arukheea (`?scenario=Arukheea&view=tps`): queda, pouso e HUD ao vivo
- Testes: 824 — 811 pass / 0 fail / 13 skip (21 testes na suíte de anexos, 15 na
  de vegetação); `vite build` OK
