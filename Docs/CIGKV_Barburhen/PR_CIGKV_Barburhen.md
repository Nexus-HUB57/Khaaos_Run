# PR: CIGKV completo + Barburhen (W1/C1)

**Branch sugerida:** `feat/cigkv-barburhen-e2e`  
**Base:** `main`  
**Repo:** `Nexus-HUB57/Khaaos_Run`

## Resumo

Implementação end-to-end da zona de treino **CIGKV** (Zu 1–3, Vitalidade, Bankhaoos, ZEX, Forja) e do mundo oficial **Barburhen W1/C1** (anel Água da Morte, chuva ácida, layout, export 3D).

## Escopo

### CIGKV
- [x] Zu 1 — Caminhão (impacto, pop-up cinto, −30% vitalidade, loot, Bankhaoos 1000 KRC)
- [x] Zu 2 — Capotamento (stun 5s)
- [x] Zu 3 — Queda na água (vision blur)
- [x] `UKhaaosVitalityComponent` (dano %, stun, blur, fome/sede/medo)
- [x] `UKhaaosBankhaoosComponent` (conta + 1000 KRC)
- [x] `UKhaaosTransferSystem` (20% ZEX → W1, Token Veterano top 50)
- [x] `AKhaaosZEXTerminal` (luz azul, 15 terminais)
- [x] `AKhaaosArmorerForge` + `FKhaaosForgeItemRow` (loja KRC)

### Barburhen (W1/C1)
- [x] `ABarburhenRingController` — anel 250m → 40m em 10 min
- [x] `ABarburhenAcidRainVolume` — −1%/10s + medo
- [x] `ABarburhenMapBuilder` — popula a partir de DataTables
- [x] `ABarburhenSectorVolume` — 4 setores
- [x] DT CSV (MapPoints + WorldConfig) — 8 spawns, 15 ZEX, 10 snipers, 2 bunkers, 5 tanques, 2 hospitais, 3 delegacias
- [x] Mapa visual SVG + HTML Three.js 3D
- [x] Export **OBJ/MTL + glTF** para import no UE5

## Arquivos principais

```
Source/KhaaosRun/
├── Public|Private/CIGKV/     Zu1-3, ZEX, widgets
├── Public|Private/Player/    Vitality
├── Public|Private/Economy/   Bankhaoos, Transfer, Forge
└── Public|Private/Worlds/Barburhen/

Content/Barburhen/
├── DT_Barburhen_*.csv
├── Barburhen_Map.obj|.mtl|.gltf|.bin
├── Barburhen_Map_3D.html
└── *.svg

Docs/
├── Zu*_Implementation_Guide.md
├── Vitality_Integration_Guide.md
├── Bankhaoos_Transfer_Guide.md
├── ZEX_Terminal_Guide.md
├── Armorer_Forge_Guide.md
└── Barburhen_*.md
```

## Como testar

1. Compilar módulo C++ `KhaaosRun`.
2. Character com: Vitality + Bankhaoos + TransferSystem.
3. CIGKV: PIE nos Zu 1–3 → conta 1000 KRC → ZEX → Forja.
4. Barburhen: importar OBJ (scale 1, metros) → MapBuilder + DT → Play → anel/chuva/ZEX.
5. `ExecuteTransfer()` ao sair do CIGKV → 20% + Token se rank ≤ 50.

## Import mapa 3D no UE5

Ver `Docs/Barburhen_Build_Map_Now.md` e resposta “Como salvar o mapa para importar no Unreal Engine 5”.

## Breaking changes

Nenhum em APIs existentes conhecidas. Classes novas sob `CIGKV/`, `Economy/`, `Player/`, `Worlds/Barburhen/`.

## Checklist review

- [ ] Paths de include alinhados ao Build.cs do projeto
- [ ] Módulo `Niagara` / `UMG` linkados se ainda não estiverem
- [ ] DataTables criadas no Editor a partir dos CSV
- [ ] README do repo atualizado com CIGKV + W1

---

**Closes:** CIGKV Zu entry · Bankhaoos · ZEX · Forja · Barburhen layout/systems  
**Não fecha:** arte final Landscape/meshes · AI cães/ratos · GameMode matchmaking completo
