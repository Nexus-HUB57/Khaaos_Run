# Montar o mapa Barburhen AGORA (checklist no UE5)

## O que este pacote contém

| Arquivo | Uso |
|---------|-----|
| `DT_Barburhen_WorldConfig.csv` | Importar → DataTable `FBarburhenWorldConfig` |
| `DT_Barburhen_MapPoints.csv` | Importar → DataTable `FBarburhenMapPoint` |
| `ABarburhenRingController` | Anel Água da Morte |
| `ABarburhenAcidRainVolume` | Chuva ácida |
| `ABarburhenMapBuilder` | Auto-spawn ZEX + sistemas |
| `ABarburhenSectorVolume` | 4 volumes de setor |

**Pontos no CSV:** 8 spawns · 2 bunkers · 5 tanques · 10 snipers · 2 hospitais · 3 delegacias · **15 ZEX** · 3 loot caches · 1 ring center.

---

## Passo a passo (30–60 min de setup lógico)

### 1. Level
1. `File → New Level → Open World` (ou Empty + Landscape).
2. Landscape: tamanho que cubra **±25 000 cm** a partir da origem (anel inicial).
3. Origem do mundo = **centro do Parque** `(0,0,0)`.

### 2. DataTables
1. Content Browser → `Miscellaneous → Data Table`.
2. Row Structure: `BarburhenWorldConfig` / `BarburhenMapPoint`.
3. Clique direito no DT → **Import** os CSV em `Content/Barburhen/`.
4. Ajuste enums se o import vier como string (Type / Sector).

### 3. Blueprints
| BP | Parent |
|----|--------|
| `BP_Barburhen_Ring` | `BarburhenRingController` |
| `BP_Barburhen_AcidRain` | `BarburhenAcidRainVolume` |
| `BP_Barburhen_MapBuilder` | `BarburhenMapBuilder` |
| `BP_Barburhen_Sector` | `BarburhenSectorVolume` |
| `BP_ZEX_Terminal` | `KhaaosZEXTerminal` (já existe) |

No MapBuilder:
- `MapPointsTable` = DT_Barburhen_MapPoints  
- `WorldConfigTable` = DT_Barburhen_WorldConfig  
- `ZEXTerminalClass` = BP_ZEX_Terminal  
- `AcidRainVolumeClass` / `RingControllerClass` = BPs acima  

### 4. Setores (4 volumes)
Coloque 4 `BP_Barburhen_Sector` e ajuste Box Extent + Location:

| Sector | Centro aprox. (X,Y) | Extent X,Y |
|--------|---------------------|------------|
| Industrial | (0, -14000) | 14000 × 9000 |
| AbandonedPark | (0, 0) | 8000 × 8000 |
| UrbanCommercial | (9000, 7000) | 10000 × 9000 |
| ExtractionStation | (0, 19500) | 8000 × 5000 |

### 5. Player Starts
Coloque PlayerStarts nas coordenadas `Spawn_01` … `Spawn_08` do CSV (Industrial).

### 6. Arte mínima (placeholder)
Enquanto não há pack final:
- Cubos/BSP para prédios urbanos
- Containers = industrial  
- Planos verdes mortos = parque  
- Linhas (rails) = estação  
- Decals de rachadura + fog + post-process esverdeado = chuva ácida  

### 7. Play
1. PIE → MapBuilder spawna Ring + Rain + 15 ZEX.  
2. Confirme logs `[Barburhen] Ring iniciado` e `[ZEX]`.  
3. Saia do anel → dano de vitalidade.  
4. Fique sob chuva → tick de 1 % / 10 s.

---

## Mapa mental (vista top)

```
                    N
            [ ESTAÇÃO / EXTRAÇÃO ]
                 ZEX 13-15
                      |
    [ URBANO 2/8 ] ---+--- [ PARQUE 3/8 ]
     bunkers snipers  |    ring END
     hospitais        |    ZEX 9-12
                      |
            [ INDUSTRIAL 3/8 ]
              SPAWNS + bunker
              ZEX 1-4 · tanques
                    S
```

---

## Limite realista

O **arquivo `.umap` binário** e os meshes finais só existem depois de você salvar o Level no Editor.  
Este pacote é o **mapa lógico completo** (todas as posições oficiais + sistemas de gameplay). Com Landscape + placeholders, o nível já é jogável para testar anel, chuva, ZEX e transferência.
