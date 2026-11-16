# Fase 59 — Worldgen UE5 no cânon de vias e biomas (fim da divergência estradas/ruas)

> Diretiva: **"Prosseguir correções do cenário dos mundos que ainda possuem
> estradas e ruas e não está compatível com as descrições oficiais — corrigir
> divergências e aplicar todas as características que estão validadas às
> descrições oficiais"**.
>
> A Fase 58 corrigiu o RUNTIME WEB (`game-runtime`): vias apenas em CIGKV e
> Barburhen, pinado por `game-runtime/test/mundos-vias-canon.test.js`. Esta
> fase elimina a divergência remanescente no lado **UE5** — presets de bioma
> CONTRARIANDO as descrições oficiais e o estágio de estradas rodando
> incondicionalmente para todos os mundos.

## Diagnóstico (divergência residual no UE5)

`Unreal/KhaaosRun/Source/KhaaosRun/Game/WorldGen/KhaaosWorldGenerator.{h,cpp}`
carregava presets que contradizem as descrições oficiais (README
"Arquitetura dos Mundos" + `shared/worlds.ts`):

| Mundo | Descrição oficial | Bioma no UE5 (antes) | Cânon F59 |
|---|---|---|---|
| CIGKV | vila militar murada, setor Urbano Denso | `UrbanRuins` ✅ | `UrbanRuins` |
| **W1 Barburhen** | **urbano pós-guerra** ("carros abandonados", "Estradas com Rachaduras") | `TropicalForest` ❌ selva densa, 0.8 vegetação | `UrbanRuins` — urbano degradado |
| **W2 Priadus** | **selva hostil, pântanos, flora carnívora, jacarés** | `VolcanicWastes` ❌ baldio 0.05 vegetação | `TropicalForest` — selva densa + pântanos |
| **W3 Ckesalth** | **deserto árido, lagoas de petróleo em chamas, areia movediça** | `FrozenTundra` ❌ lagos congelados | `DesertCanyon` — bacia de dunas |
| **W4 Arukheea** | **ilha isolada, tsunami, tubarões** | `DesertCanyon` ❌ cânions de deserto | `OceanArchipel` — ilha costeira |

Além do bioma errado, `GenerateRoads()` ("MST + extras connecting POIs")
rodava **para todos os mundos** — exatamente o vazamento de vias que a F58
corrigiu no runtime web. Se o estágio fosse implementado, asfalto apareceria
em selva, deserto e ilha, na contramão das descrições oficiais.

## Correção (fonte única de verdade portável)

- **`Game/WorldGen/KhaaosWorldCanon.{h,cpp}`** (NOVO) — cânon portável
  (política pura, zero UCLASS, padrão `KhaaosBarburhenRules`): tabela
  autoritativa dos 5 mundos com bioma + parâmetros de geração alinhados às
  descrições oficiais + `HasCanonicalRoads()` (F58: apenas CIGKV e
  Barburhen) + `IsUrbanBiome()`. Falha fechada: mundo desconhecido não é
  reconhecido e não possui vias.
- **`KhaaosWorldGenerator.cpp`** — `GetWorldPreset()` agora consome o cânon
  (bioma e parâmetros por mundo); `GenerateRoads(Config)` recebe o bioma e
  **falha fechado** para mundos não-urbanos (log `[PCG 4/7] Roads: SKIPPED`).
  Novo `HasCanonicalRoads(WorldName)` BlueprintPure para paridade com o
  runtime web (`detail3d.hasCanonicalRoads`). `WorldSize` preservado
  (10/20/18/15/18 km) — partição intacta.
- **`KhaaosWorldGenerator.h`** — doc comment atualizado (mapa de biomas
  canônico + regra de vias F58) e assinatura `GenerateRoads(Config)`.
- **Parâmetros alinhados às descrições oficiais** — Barburhen: vegetação
  0.8→0.15 e obstáculos 0.2→0.6 (urbano degradado); Priadus: vegetação
  0.05→0.85 (selva densa) e água 0.02→0.30 (pântanos/jacarés); Ckesalth:
  vegetação 0.15→0.05 e água 0.2→0.04 (só lagoas de petróleo em chamas);
  Arukheea: água 0.03→0.50 (oceano/tsunami/tubarões) e vegetação
  0.05→0.45 (Bosque dos Perdidos = 4/8 da ilha).
- **`tests/ue5/worldgen_vias_canon_test.cpp`** (NOVO) + hook em
  `scripts/test_ue5_logic.sh` — 36 assertions que pinam biomas, tabela de
  vias, coerência urbana, parâmetros por descrição, partição preservada e
  falha fechada; roda no gate (`test:ue5:logic`).

## Nota sobre o snapshot selado `Epic Games/IMPLEMENTACAO_GRAFICA/`

A cópia local `world3d.js` nesse diretório é um **arquivo selado** de
implementação anterior ao F58 (`manifest.json` com `patch_sha256`,
"Implementação local, sem push ou PR"), NÃO conectada ao runtime servido.
Ela contém `buildRoads` incondicional pré-F58 e NÃO deve ser reaproveitada
sem rebase do cânon F58 — qualquer uso futuro deve partir de
`game-runtime/src/game3d/*` (fonte única corrigida). Não foi alterada para
não violar o manifesto selado.

## Contrato de teste

- `npm run test:ue5:logic` → `worldgen-vias-canon-test` (36 PASS): biomas por
  mundo conforme `shared/worlds.ts`/README; `HasCanonicalRoads` verdadeiro
  SOMENTE para CIGKV/Barburhen; parâmetros coerentes com cada descrição
  oficial; falha fechada para mundos desconhecidos/vazios/nulos.
- Regressões pinadas: Barburhen≠selva, Priadus≠vulcânico-baldio,
  Ckesalth≠tundra, Arukheea≠deserto-cânion, vias fora dos mundos urbanos.
- Runtime web segue pinado por `game-runtime/test/mundos-vias-canon.test.js`
  (F58) — as duas fontes (web + UE5) agora declaram o MESMO cânon.
