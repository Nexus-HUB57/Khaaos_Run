# Fase 58 — Vias canônicas por mundo (correção de divergência estradas/ruas)

> Diretiva: **"Prosseguir correções do cenário dos mundos que ainda possuem
> estradas e ruas e não está compatível com as descrições oficiais — corrigir
> divergências e aplicar todas as características que estão validadas às
> descrições oficiais"**.
> A Fase 42 garantiu as DINÂMICAS 1:1 com o README e a F43 trouxe os DETALHES;
> esta fase corrige a última divergência estrutural de cenário: a rede viária
> urbana ("estradas de Khaoos Ville") que era gerada para TODOS os mundos,
> inclusive onde o README NÃO descreve cidade.

## Diagnóstico (divergência)

O pipeline de viação (Fase 6) era incondicional: `buildRoads(scene, layout,
scenario.id)` + `roadSegments(layout)` geravam 4 radiais + anel de perímetro,
com pista de asfalto, faixas de rolamento pintadas, calçadas, faixas de
pedestre, tráfego estático (carros/vans abandonados) e props de beira de via
(postes, barris, pneus, cones, paletes) — em **todos** os cinco mundos:

| Mundo | Descrição oficial (README) | Estradas eram geradas? | Cânon |
|---|---|---|---|
| CIGKV — "Khaaos Ville" | Campo de instrução com setor **Urbano Denso** | Sim | ✅ Vias legítimas (cidade-treino) |
| **W1 Barburhen** | "urbano pós-guerra… **carros abandonados**" | Sim | ✅ Vias legítimas (grid urbano irregular) |
| **W2 Priadus** | "selva hostil, neblina, pântanos, flora carnívora, jacarés" | Sim | ❌ **Divergência** — nada de vias no README |
| **W3 Ckesalth** | "deserto árido, lagoas de petróleo em chamas, fumaça tóxica, areia movediça" | Sim | ❌ **Divergência** |
| **W4 Arukheea** | "ilha isolada, Prisão do Sol da Noite, tsunami, tubarões" | Sim | ❌ **Divergência** |

Além da via em si, a **praça central de asfalto** (disco r=34) também vazava
para selva, deserto e ilha — uma mancha urbana no coração dos mundos de
natureza.

## Correção (fonte única de verdade)

- **`detail3d.js`** — novo contrato canônico `URBAN_WORLDS` =
  `{CIGKV, Barburhen}` + `hasCanonicalRoads(scenarioId)`. `roadSegments()`
  devolve `[]` determinístico para mundos de natureza. Como calçadas, faixas,
  tráfego (`trafficPlacements`), props de via (`propPlacements`) e o avoidance
  de dressing (`districts3d`, `naturalDressingPlacements`) todos consomem
  `roadSegments`, **toda a cadeia urbana desaparece junta e coerente** nos três
  mundos corrigidos — e o dressing natural volta a ocupar o solo (mais pedras,
  troncos, samambaias/musgo).
- **`world3d.js`** — `centralPlazaMaterial(scenarioId)` (exportado): mundos
  urbanos mantêm `asphaltMaterial` (praça é o coração viário da cidade);
  Priadus/Ckesalth/Arukheea recebem a **clareira do próprio bioma**
  (`groundMaterial` F49 — musgo·pântano / basalto queimado / areia branca), com
  `userData.surfaceTag` (`'asphalt-plaza' | 'biome-ground'`) para inspeção e2e.
  A praça recebe `name = 'central-plaza'` (procura em cena nos testes).
  **Geometria intacta (r=34)**: terminal ZEX, avoidance de dressing, monolito e
  contratos espaciais permanecem byte-idênticos — apenas o MATERIAL é fiel.
- **Zero impacto em gameplay**: vias nunca tiveram collider; layout
  (colliders/loot/terminals/distritos) não muda; simulação intacta.

## Características oficiais já validadas (mantidas e preservadas)

A correção NÃO remove nada que o README descreve — preserva todas as
características validadas das fases anteriores: skeleton/collapse (W1),
carnplant/neblina pulsante (W2), oilfire/quicksand (W3), mar+barbatanas (W4),
dressing por distrito (F40/F43), terreno por bioma (F49), perfis PBR (F50).

## Contrato de teste

- **`test/mundos-vias-canon.test.js` (7 — novo)**: classificação cobre todo o
  catálogo de mundos; natureza sem vias em 3 seeds; natureza sem tráfego e sem
  props de via (lamp/barrel/tire/cone/pallet); urbanos com radiais conectando
  os 4 distritos e tráfego presente; praça com `surfaceTag` fiel por mundo;
  `buildScene` real — nenhum mesh usando os materiais memoizados de
  via/calçada nos mundos de natureza, tráfego registrado só nos urbanos;
  dressing natural determinístico preenchendo o solo.
- **Re-âncora honesta**: `test/district-dressing.test.js` — o teste "zero
  impacto" agora divide o contrato: mundos urbanos (vias existem e dressing
  fica fora do asfalto) vs mundos de natureza (`roadSegments` = 0 — regressão
  de vazamento urbano é falha de fidelidade).
- Suítes adjacentes revalidadas: graphicsdetail (F6/F45), online-identity
  (tráfego), mundos-detalhes (F43), mundos-fidelidade (F42), vegetation3d,
  F49, F41/fidelity gates — **100 + 82 testes, 0 falhas**.
- Suíte completa: ver `game-runtime` CI — version **0.27.0**.

## Como inspecionar

Abrir o console web → aba Mundos → Priadus/Ckesalth/Arukheea: nenhum asfalto
(planejar, pois a zona é gerada em runtime 3D); CIGKV/Barburhen mantêm a rede
viária com faixas, calçadas e carros abandonados. `scene.children.find(o =>
o.name === 'central-plaza').material.userData.surfaceTag` responde o cânon.
