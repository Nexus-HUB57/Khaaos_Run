# Khaaos Run — Fase 1: CIGKV Map Creation Guide

## Visão Geral

O CIGKV (Campo de Instrução de Guerra Khaaos Ville) é o primeiro mapa jogável do Khaaos Run. É o Ring de treinamento pré-lançamento — 50 players, 3 horas, fluxo contínuo de entrada.

## Arquitetura do Mapa

```
┌──────────────────────────────────────────────────────────────┐
│                    CIGKV — KHAAS VILLE                        │
│  10.000 × 10.000 × 500 world units                          │
├─────────────┬──────────────────────┬─────────────────────────┤
│ ARMORY HUB  │  PROVING GROUNDS     │   ABANDONED PARK        │
│   1/8       │      3/8             │       4/8               │
│  Neutral    │  Urban Dense         │   Vegetation            │
│  Loadout    │  Destructible        │   Rivers / Ambushes     │
│  No Combat  │  Tunnels / Multi-    │   15 ZEX points         │
│             │  story buildings     │   Flora Carnívora       │
└─────────────┴──────────────────────┴─────────────────────────┘
```

## Componentes Implementados

### C++ Level Script Actor: `AKhaaosCIGKVLevel`

Controla toda a lógica do Ring CIGKV:

| Sistema | Métodos | Descrição |
|---------|---------|-----------|
| Zone Management | `StartZoneSequence()`, `AdvanceZonePhase()` | 4 fases de shrinking |
| Loot Spawning | `SpawnPhaseLoot()`, `SpawnPulsoKhaaosDrop()` | Drops por fase + legendary pulso |
| ZEX Management | `UpdateZEXActivation()`, `PlayerExtractAtZEX()` | 15 Zonas de Extração de XP |
| Zu Entry | `StartZuEntry()`, `ResolveZuDecision()` | 3 variantes cinematográficas |
| Player Flow | `CanPlayerEnter()`, `GetAlivePlayerCount()` | Fluxo contínuo, block últimos 5 min |
| Inactivity | `ProcessInactivityPunishment()` | "Dedo-duro" (rats, mosquitoes, etc.) |

### Data Asset: `UKhaaosCIGKVMapData`

Single source of truth para layout do mapa:

| Data | Quantidade | Descrição |
|------|-----------|-----------|
| Sectors | 3 | ArmoryHub (1/8), ProvingGrounds (3/8), Park (4/8) |
| Spawn Points | 50+ | 15 Armory + 20 Proving + 15 Park |
| Loot Points | 60+ | 10 Armory + 25 Proving + 25 Park |
| Environment Markers | 27+ | Bunkers, Snipers, MedKits, Fog, Destruction |

### Zone Phases (Default)

| Phase | Time | Center | Radius | Damage/s | Loot drops | Climate |
|-------|------|--------|--------|----------|------------|---------|
| 0 | 0h | (0,0,0) | 5000 | 1 | 20 (spawned on Ring start) | Clear |
| 1 | 1h | (1000,0,0) | 3500 | 3 | 15 | Rain |
| 2 | 2h | (500,500,0) | 2000 | 5 | 10 | Fog |
| 3 | 2h45 | (300,300,0) | 800 | 10 | 5 | Storm |

Loot points with `MinPhase` greater than the current phase remain locked; each phase selects only eligible points inside its active zone. `RarityWeights` is sampled per point in enum order (Comum → Incomum → Raro → Épico → Lendário; a sixth weight enables Mítico).

## Passo a Passo para Criar o Mapa no UE5 Editor

### 1. Create the Level

```
File → New Level → Empty Level
Save As: Content/Maps/CIGKV_KhaaosVille.umap
```

### 2. Set Level Script Actor

```
Level Blueprint → Replace with: KhaaosCIGKVLevel
(or: Details → Level Script Actor Class → KhaaosCIGKVLevel)
```

### 3. Create Map Data Asset

```
Content Browser → Right Click → Miscellaneous → Data Asset → KhaaosCIGKVMapData
Save As: Content/Data/Maps/DA_CIGKV_MapData
Edit in Editor: configure all spawn points, loot points, environment markers
```

### 4. Build the Geometry

**Armory Hub (1/8)**
- Large indoor armory building
- Weapon racks (interactive)
- Loadout stations (no patente restrictions)
- Neutral zone boundary (volume trigger)

**Proving Grounds (3/8)**
- Dense urban blocks (8-12 buildings)
- Multi-story buildings (2-4 floors, enterable)
- Underground tunnels (2-3 connecting passages)
- Destructible walls (Chaos Destruction)
- Vehicle spawn points (2-3 locations)

**Abandoned Park (4/8)**
- Open grass areas with trees
- River/creek running through
- Abandoned structures (pavilions, gazebos)
- Dense vegetation (bushes for hiding)
- Flora carnívora zones (damage areas)
- ZEX terminal meshes (15 locations)

### 5. Place Actors

```
- PlayerStart actors at all 50+ spawn points
- Create a concrete Blueprint subclass of `AKhaaosLootPickup` and assign it to `AKhaaosCIGKVLevel.LootPickupClass` (the C++ base class is abstract)
- KhaaosSafeZone actor for zone shrinking
- Niagara emitters for climate effects
- Assign `NS_CIGKV_ZoneShrink` to `KhaaosSafeZone.ZoneBoundarySystem`
- Configure Niagara user parameters `User.ZoneCenter` (Vector), `User.ZoneRadius` (Float), and `User.ZoneColor` (Linear Color)
- Light sources + PostProcess volumes
- NavMeshBoundsVolume for AI navigation
- Audio volumes for KhaaosZoneAudio
```

### 6. Configure Gameplay

```
World Settings → GameMode Override: KhaaosGameMode
GameMode → GameState: KhaaosGameState
GameMode → PlayerState: KhaaosPlayerState
GameMode → HUD: KhaaosHUD
```

### 7. Test & Iterate

```
- PIE (Play In Editor) with 2+ players
- Verify the Niagara zone boundary follows replicated center/radius on server and clients
- Verify players outside the world-space zone take server-authoritative damage
- Test ZEX interaction
- Test Zu entry sequences
- Verify loot spawning per phase
- Run standalone dedicated server test
```

## Convenções de Nomenclatura

| Tipo | Prefix | Exemplo |
|------|--------|---------|
| Map | CIGKV_ | `CIGKV_KhaaosVille.umap` |
| Data Asset | DA_ | `DA_CIGKV_MapData` |
| Material | M_CIGKV_ | `M_CIGKV_BuildingWall` |
| Texture | T_CIGKV_ | `T_CIGKV_Concrete_D` |
| Static Mesh | SM_CIGKV_ | `SM_CIGKV_ArmoryRack` |
| Niagara | NS_CIGKV_ | `NS_CIGKV_ZoneShrink` |

## Referências

- Design Doc: Mundos.md → CIGKV section
- Level Actor: `Game/Level/KhaaosCIGKVLevel.h`
- Map Data: `Game/World/CIGKV/KhaaosCIGKVMapData.h`
- Config: `Config/DefaultCIGKV.ini`
