# Mapa Barburhen — Pacote Final

## Arquivos do mapa

```
Content/Barburhen/
├── Barburhen_Map_TopDown.svg      ← Mapa visual (abra no browser)
├── DT_Barburhen_WorldConfig.csv   ← Config do anel / chuva / players
├── DT_Barburhen_MapPoints.csv     ← TODOS os pontos oficiais
└── README_MAPA.md

Source/.../Worlds/Barburhen/
├── BarburhenTypes.h
├── BarburhenRingController.*      ← Água da Morte
├── BarburhenAcidRainVolume.*      ← Chuva ácida
├── BarburhenMapBuilder.*          ← Auto-popula o level
└── BarburhenSectorVolume.*        ← 4 setores

Docs/
├── Barburhen_Map_Design.md
└── Barburhen_Build_Map_Now.md
```

## Como obter o .umap

1. Abra o projeto no **UE5.8 Editor**
2. New Level (Open World)
3. Landscape cobrindo ±250 m a partir de (0,0,0)
4. Importe os CSV como DataTables
5. Coloque BP_Barburhen_MapBuilder + 4 SectorVolumes + PlayerStarts
6. **File → Save Current As… → Mapa_Barburhen_W1**

O Editor gera o `.umap`. Este pacote é o conteúdo completo do mapa (lógica + layout + dados).

## Contagem oficial

| Elemento | Qtd no CSV |
|----------|------------|
| Player Spawns | 8 |
| Bunkers | 2 |
| Tanques | 5 |
| Sniper points | 10 |
| Hospitais | 2 |
| Delegacias | 3 |
| ZEX | 15 |
| Ring center | 1 |

Abra `Barburhen_Map_TopDown.svg` no Chrome/Firefox para ver o layout.
