# Barburhen (W1/C1) – Design Técnico do Mapa

**Mundo da Destruição** · Layout oficial alinhado ao README do Khaaos_Run.

> Este documento + código C++ permitem montar o `.umap` no UE5 Editor de forma estruturada.  
> Meshes, Landscape e iluminação continuam sendo arte no Editor.

---

## 1. Frações oficiais do perímetro

| Setor | Fração | Função | Tamanho relativo (mapa ~500 m de raio) |
|-------|--------|--------|----------------------------------------|
| **Área Urbana e Comercial** | 2/8 | Loot médio, emboscadas urbanas | ~NW + NE |
| **Setor Industrial** | 3/8 | **Desembarque / spawn inicial** | ~S + SE |
| **Parque Abandonado** | 3/8 | **Centro** – anel fecha aqui | Centro |
| **Estação Ferroviária** | — | **Zona de Extração final** | Borda N |

**Origem sugerida do level:** centro do Parque Abandonado = `(0, 0, 0)`.

---

## 2. Dinâmica “Água da Morte”

```
t=0      Partida inicia | spawns no Setor Industrial
t=60s    Anel começa a fechar (StartDelay)
t=660s   Anel no Parque (CloseDuration = 600s)
Fora do anel → dano contínuo + medo ↑ + chuva ácida
```

- **StartRadius:** 25 000 cm (250 m)
- **EndRadius:** 4 000 cm (40 m) – Parque
- **Chuva ácida:** −1 % Vitalidade / 10 s (sem colete)

---

## 3. Plus + (vantagens posicionais)

| Tipo | Qtd oficial | Notas de colocação |
|------|-------------|--------------------|
| Bunkers | 2 | 1 Industrial, 1 Urbano |
| Tanques | 5 | Dispersos, 1 perto da Estação |
| Sniper points | 10 | Telhados urbanos + silos industriais |
| Hospitais | 2 | Urbano + beira do Parque |
| Delegacias | 3 | Urbano (2) + Industrial (1) |

---

## 4. Plus − (perigos)

| Perigo | Implementação |
|--------|----------------|
| Chuva ácida | `ABarburhenAcidRainVolume` |
| Cães raivosos | AI / EQS (fase seguinte) |
| Ratos dedo-duro | UI de alerta + exposição (fase seguinte) |
| Corpos que apodrecem | Static meshes + decals (arte) |
| Desabamentos | Chaos / scripted events (arte + level seq) |

---

## 5. Coordenadas de referência (cm, origem = Parque)

Use estas posições no DataTable `DT_Barburhen_MapPoints`:

### Spawns (Industrial – sul)
| PointId | Location | Type |
|---------|----------|------|
| Spawn_01 | (0, -18000, 100) | PlayerSpawn |
| Spawn_02 | (4000, -17000, 100) | PlayerSpawn |
| Spawn_03 | (-4000, -17000, 100) | PlayerSpawn |
| Spawn_04 | (8000, -15000, 100) | PlayerSpawn |
| Spawn_05 | (-8000, -15000, 100) | PlayerSpawn |

### Parque (centro)
| PointId | Location | Type |
|---------|----------|------|
| Park_Center | (0, 0, 0) | RingCenter |
| ZEX_Park_01 | (1500, 1500, 50) | ZEXTerminal |
| ZEX_Park_02 | (-1500, 1200, 50) | ZEXTerminal |

### Urbano
| PointId | Location | Type |
|---------|----------|------|
| Sniper_Roof_01 | (12000, 8000, 1200) | SniperPoint |
| Sniper_Roof_02 | (9000, 11000, 900) | SniperPoint |
| Hospital_01 | (10000, 5000, 100) | Hospital |
| Bunker_Urban | (7000, 9000, 50) | Bunker |
| Police_01 | (11000, 3000, 100) | PoliceStation |

### Industrial
| PointId | Location | Type |
|---------|----------|------|
| Bunker_Ind | (-2000, -12000, 50) | Bunker |
| Tank_01 | (3000, -10000, 50) | TankSpawn |
| Sniper_Silo_01 | (-6000, -9000, 1500) | SniperPoint |
| Police_Ind | (1000, -14000, 100) | PoliceStation |

### Extração (Estação – norte)
| PointId | Location | Type |
|---------|----------|------|
| Extract_Station | (0, 20000, 100) | ZEXTerminal / Extração final |
| ZEX_Station_01 | (-2000, 19000, 50) | ZEXTerminal |
| Tank_Station | (2500, 18500, 50) | TankSpawn |

*(Complete até 10 sniper points, 5 tanks, 15 ZEX conforme arte final.)*

---

## 6. Passo a passo no UE5 Editor

1. **File → New Level** (Open World ou Empty).
2. Crie **Landscape** ~512×512 ou 1009×1009, escala para ~500 m de raio útil.
3. Divida visualmente os 3 setores (materiais distintos: concreto, ferrugem, vegetação morta).
4. Importe / coloque:
   - Prédios inacabados (Urbano)
   - Galpões, silos, containers (Industrial)
   - Árvores mortas, coreto, lagos secos (Parque)
   - Trilhos + plataforma (Estação)
5. Crie DataTables:
   - `DT_Barburhen_WorldConfig` → 1 row `FBarburhenWorldConfig`
   - `DT_Barburhen_MapPoints` → rows `FBarburhenMapPoint`
6. Coloque no nível:
   - `BP_Barburhen_MapBuilder` (referencia os 2 DTs + classes ZEX / Rain / Ring)
   - Player Starts nos spawns industriais
7. Iluminação: céu cinza, fog, post-process esverdeado (chuva ácida).
8. Áudio: vento + chuva + distante metal rangendo.
9. Corpos: static meshes espalhados (não despawnam – lore).

---

## 7. Código entregue

```
Source/KhaaosRun/
├── Public/Worlds/Barburhen/
│   ├── BarburhenTypes.h
│   ├── BarburhenAcidRainVolume.h
│   ├── BarburhenRingController.h
│   └── BarburhenMapBuilder.h
└── Private/Worlds/Barburhen/
    ├── BarburhenAcidRainVolume.cpp
    ├── BarburhenRingController.cpp
    └── BarburhenMapBuilder.cpp
```

| Classe | Função |
|--------|--------|
| `ABarburhenAcidRainVolume` | Dano periódico + medo + FX chuva |
| `ABarburhenRingController` | Anel “Água da Morte” 10 min |
| `ABarburhenMapBuilder` | Lê DataTables e spawna sistemas/ZEX |
| `FBarburhenMapPoint` / `FBarburhenWorldConfig` | Dados do layout |

---

## 8. Integração com CIGKV

Ao entrar em Barburhen (após transferência):

```cpp
// No GameMode / level blueprint de Barburhen:
TransferSystem->ExecuteTransfer();  // 20 % + Token de Veterano
// Pop-up: “Marechal, as conquistas foram salvas. Bem-vindo ao Barburhen, Zheers.”
RingController->StartRing();
```

---

## 9. Checklist de validação

- [ ] Landscape e 3 setores legíveis do ar
- [ ] Spawns só no Industrial
- [ ] Anel fecha no Parque em ~10 min
- [ ] Chuva ácida aplica dano sem colete
- [ ] 2 bunkers, ≥5 sniper points, 2 hospitais, 3 delegacias
- [ ] Estação como extração final
- [ ] ZEX com luz azul funcionando
- [ ] Corpos estáticos (não somem)
- [ ] Transferência CIGKV → inventário/KRC aplicada no load

---

**Mapa Barburhen: lógica + layout + sistemas prontos.**  
O `.umap` final é montagem de arte no Editor usando este guia e os DataTables.
