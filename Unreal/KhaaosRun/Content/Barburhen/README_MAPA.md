# Mapa Barburhen — dados, blockout e preview 3D

## Arquivos do mapa

```
Content/Barburhen/
├── Barburhen_Map_TopDown.svg      ← Mapa visual (abra no browser)
├── Barburhen_Map_3D.html          ← Preview 3D estilizado (blockout de revisão)
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

## Preview artístico 3D

O preview interativo usa Three.js e pode ser aberto localmente no Chrome/Firefox. Antes de abrir, sincronize os pontos de interesse e parâmetros do anel a partir dos DataTables CSV:

```bash
npm run test:barburhen:ids
npm run map:barburhen:preview
npm run test:barburhen:preview
```

`test:barburhen:ids` percorre todos os CSVs em `Content/Barburhen` e exige IDs não vazios e únicos dentro de cada tabela/coluna de identificador, sem diferenciar maiúsculas/minúsculas (semântica de `FName`). Também exige que a row key da DataTable de pontos seja igual a `PointId`, analisa membros e valores numéricos de todos os enums `EBarburhen*` e confere se `Type` e `Sector` existem em `EBarburhenPointType` e `EBarburhenSector`. Valores enum C++ não literais não suportados provocam falha explícita, evitando declarar uma validação incompleta como aprovada. O comando usa apenas Python 3 da biblioteca padrão e informa arquivo/linha para facilitar a correção.

Depois abra `Content/Barburhen/Barburhen_Map_3D.html`. O preview exibe todos os POIs do CSV, conta-os automaticamente, usa os raios/centro do anel do world config e inclui uma primeira camada autoral de luz, vias, entulho e silhuetas por setor. Os volumes de edifícios e o dressing ainda são blockout ilustrativo; não são meshes de produção nem substituem o level jogável.

## Limite de integração UE5

Este checkout contém dados, C++ de gameplay e fontes de referência OBJ/GLTF, mas não contém um `.umap` salvo nem os assets finais `.uasset` de cenário. Para chegar a um ambiente de produção de shooter competitivo, ainda é necessário importar/criar meshes e materiais modulares no UE 5.8, montar o Landscape/level, validar colisão, cobertura, leitura de POIs e desempenho no PIE e em dispositivo-alvo. O preview web serve para revisar escala e direção visual antes dessa etapa; não deve ser apresentado como captura/render do Unreal.
