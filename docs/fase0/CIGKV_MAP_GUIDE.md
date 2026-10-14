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

#### SafeZone damage and elimination

- `AKhaaosGameMode` applies one instant `CreateZoneDamageEffect` to each player outside the active zone, on the server only.
- `AKhaaosPlayerState` owns the replicated Ability System Component and `UKhaaosAttributeSet`; `Health` and `MaxHealth` replicate through GAS.
- Apply the effect through `UKhaaosEffectApplier::ApplyZoneDamage(ASC, Damage, SafeZone)`. The applier rejects non-`AKhaaosSafeZone` causers and sets both the Gameplay Effect instigator and `EffectCauser` to the SafeZone actor in the effect context.
- When authoritative Health reaches zero, `UKhaaosAttributeSet::OnOutOfHealth` routes to `AKhaaosGameMode::EliminatePlayer`; the GameMode records `ZONA`, updates status/stats, and broadcasts elimination once.
- Do not separately call `EliminatePlayer` after applying the zone effect; death is driven by the GAS attribute event.
- The instant effect carries `GameplayCue.Damage.Zone`. `AKhaaosPlayerState` handles that tag through `IGameplayCueInterface` and forwards it only to its owning local HUD; no separate GameplayCue Blueprint asset is required for this handler. The cue is cosmetic and never drives damage or elimination.
- The HUD triggers the Blueprint event `PlayZoneDamageVignette` and loops `Content/Audio/SFX/SFX_ZoneWarningBeep.wav` locally. The interval scales from 0.90 s at full Health down to 0.18 s at zero Health, with a small pitch rise; it stops 1.65 s after the last cue or immediately when the player is eliminated.
- The WAV is source audio. On first project open, Unreal imports it as `/Game/Audio/SFX/SFX_ZoneWarningBeep`; the widget's soft reference already points to that asset. Override the reference in the HUD widget Blueprint if the project uses a different import path, and implement `PlayZoneDamageVignette` in that widget Blueprint.

#### Configure the warning Sound Cue in Unreal Editor

1. In the Content Browser, create a **Sound Cue** under `Content/Audio/SFX` and name it `SC_ZoneWarningBeep`.
2. Open the cue and build `Wave Player (SFX_ZoneWarningBeep) → Modulator → Output`. For a restrained random pitch variation, set `Pitch Min = 0.98` and `Pitch Max = 1.02`; set `Volume Min = 0.95` and `Volume Max = 1.0`. Preview it with **Play Cue** and save.
3. Open the HUD Widget Blueprint derived from `KhaaosHUDWidget`. In **Class Defaults**, set `ZoneWarningBeepSound` to `SC_ZoneWarningBeep`, then compile and save. The property is a `USoundBase` soft reference, so it accepts either the imported Sound Wave or the Sound Cue. The cue's small pitch randomization is layered with the C++ pitch multiplier (1.0–1.35) based on Health; use `Pitch Min = Pitch Max = 1.0` if the combined modulation sounds too strong.
4. For an optional spatial variant, create a **Sound Attenuation** asset such as `SA_ZoneWarningBeep`, choose a Sphere shape, enable volume attenuation and spatialization, and set the inner radius/falloff to suit the level. Assign it in the Sound Cue Output's **Attenuation Settings** (or use an Attenuation node).

**Important:** the current HUD calls `UGameplayStatics::PlaySound2D`, which intentionally plays UI audio without attenuation. Therefore, `SA_ZoneWarningBeep` will not make this warning quieter with distance. Keep the current warning 2D for consistent local feedback. To use the attenuation asset, change the playback path to a world-positioned sound (for example `PlaySoundAtLocation` or an attached Audio Component) and provide a meaningful source location; that is a separate spatial-audio behavior, not just an Editor asset setting.

### 7. Test & Iterate

```
- PIE (Play In Editor) with 2+ players
- Verify the Niagara zone boundary follows replicated center/radius on server and clients
- Verify players outside the world-space zone take server-authoritative damage and the effect context reports the SafeZone as `EffectCauser`
- Confirm the owning client gets one vignette/beep response per SafeZone damage cue; another player's HUD must not receive it, and the beep should stop after leaving the damage area
- Verify Health replication to clients and one-time elimination with cause `ZONA` when Health reaches zero
- Test ZEX interaction
- Test Zu entry sequences
- Verify loot spawning per phase
- Run standalone dedicated server test
```

Run the C++ automation checks from the Unreal Editor console with:

```text
Automation RunTests Khaaos.GAS.SafeZone
```

`Khaaos.GAS.SafeZone.GameplayCueDispatch` applies the actual instant zone Gameplay Effect to a transient ASC target and asserts that the native interface receives the expected `Executed` tag once, alongside the Health reduction. `Khaaos.GAS.SafeZone.WarningCadence` checks that the beep interval decreases with Health and remains clamped at its configured limits. Both tests live under `Source/KhaaosRun/Private/Tests` and run in the Editor context.

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
- [Sound Cue Editor](https://dev.epicgames.com/documentation/unreal-engine/sound-cue-editor-in-unreal-engine)
- [Sound Cue Reference (Modulator and Attenuation nodes)](https://dev.epicgames.com/documentation/unreal-engine/sound-cue-reference-for-unreal-engine)
- [Sound Attenuation](https://dev.epicgames.com/documentation/unreal-engine/sound-attenuation-in-unreal-engine)
- [`UGameplayStatics::PlaySound2D`](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/UGameplayStatics/PlaySound2D)
