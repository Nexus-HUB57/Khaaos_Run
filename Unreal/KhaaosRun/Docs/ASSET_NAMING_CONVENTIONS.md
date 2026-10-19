# Khaaos Run — Asset Naming Conventions

> UE5.8 Battle Royale | Devs Ph.D | Nexus-HUB57
> Reference: [ue5-style-guide](https://github.com/Allar/ue5-style-guide)

## Prefix Rules

All assets must use the appropriate prefix. No exceptions.

| Prefix | Category | Example |
|--------|----------|---------|
| `SM_` | Static Mesh | `SM_Rock_Desert_01` |
| `SK_` | Skeletal Mesh | `SK_KhaaosCharacter` |
| `SKM_` | Skeletal Mesh Model | `SKM_Weapon_AR` |
| `M_` | Material | `M_Desert_Ground` |
| `MI_` | Material Instance | `MI_Desert_Ground_Wet` |
| `MF_` | Material Function | `MF_WorldAlignedNoise` |
| `T_` | Texture | `T_Desert_Ground_D` |
| `A_` | Animation | `A_Char_Sprint_Start` |
| `ABP_` | Animation Blueprint | `ABP_KhaaosCharacter` |
| `AM_` | Animation Montage | `AM_Char_Reload_AR` |
| `AS_` | Animation Sequence | `AS_Char_Idle` |
| `BP_` | Blueprint | `BP_KhaaosCharacter` |
| `BPC_` | Blueprint Component | `BPC_HealthComponent` |
| `BPI_` | Blueprint Interface | `BPI_Interactable` |
| `W_` | Widget Blueprint | `W_HUD` |
| `DT_` | Data Table | `DT_WeaponStats` |
| `DC_` | Data Asset (Curve) | `DC_DamageFalloff` |
| `DA_` | Data Asset | `DA_GameConfig` |
| `NS_` | Niagara System | `NS_MuzzleFlash_AR` |
| `NI_` | Niagara Emitter | `NI_Sparks_Bullet` |
| `NM_` | Niagara Module | `NM_CurlNoise3D` |
| `PCG_` | PCG Settings/Graph | `PCG_DesertBiome` |
| `PCGP_` | PCG Point Data | `PCGP_LootSpawnPoints` |
| `L_` | Level / Map | `L_KhaaosRun_Main` |
| `LS_` | Level Streaming | `LS_Desert_Biome` |
| `SB_` | Sound Bank | `SB_Weapons` |
| `SC_` | Sound Class | `SC_SFX` |
| `SCue_` | Sound Cue | `SCue_AR_Fire` |
| `SW_` | Sound Wave | `SW_AR_Fire_Single` |
| `EA_` | Enum Asset | `EA_BiomeType` |
| `E_` | Enum (C++) | Already defined in code |
| `S_` | Structure Asset | `S_WeaponStats` |
| `GAS_` | Gameplay Ability System | `GAS_Sprint` |
| `GEC_` | Gameplay Effect Context | `GEC_DamageContext` |
| `GEG_` | Gameplay Execution | `GEG_DamageExecution` |
| `GECue_` | Gameplay Effect Cue | `GECue_Impact_Bullet` |
| `IMC_` | Input Mapping Context | `IMC_KhaaosRun` |
| `IA_` | Input Action | `IA_Move` |
| `TAG_` | Gameplay Tag | Defined in DefaultGameplayTags.ini |
| `CURVE_` | Curve Float/Vector | `CURVE_DamageFalloff` |

## Texture Suffixes

Textures must include a suffix indicating their type:

| Suffix | Type | Example |
|--------|------|---------|
| `_D` | Diffuse / Albedo | `T_Desert_Ground_D` |
| `_N` | Normal | `T_Desert_Ground_N` |
| `_ORM` | Occlusion Roughness Metallic (packed) | `T_Desert_Ground_ORM` |
| `_M` | Mask / Metallic | `T_Desert_Ground_M` |
| `_R` | Roughness | `T_Desert_Ground_R` |
| `_E` | Emissive | `T_Desert_Ground_E` |
| `_A` | Alpha / Opacity | `T_Desert_Ground_A` |
| `_L` | Lightmap | `T_Desert_Ground_L` |
| `_H` | Height / Displacement | `T_Desert_Ground_H` |

## Folder Structure Convention

```
Content/
├── Characters/
│   ├── KhaaosCharacter/
│   │   ├── Animations/          (A_, AS_, AM_, ABP_)
│   │   ├── Meshes/              (SK_, SKM_)
│   │   └── Textures/            (T_)
│   └── AI/
│       └── KhaaosAI/
├── Weapons/
│   ├── AR/
│   ├── Shotgun/
│   ├── Sniper/
│   ├── Pistol/
│   └── Melee/
├── VFX/
│   ├── Niagara/                 (NS_, NI_, NM_)
│   └── Materials/               (M_, MI_)
├── World/
│   ├── Biomes/
│   │   ├── Desert/
│   │   ├── Forest/
│   │   ├── Ruins/
│   │   ├── Urban/
│   │   └── Volcanic/
│   └── PCG/                     (PCG_, PCGP_)
├── UI/                          (W_, BP_)
├── Data/                        (DT_, DA_, DC_)
├── Gameplay/
│   ├── Abilities/               (GAS_, GEG_, GEC_, GECue_)
│   ├── Effects/                 (GAS_)
│   └── Tags/                    (DefaultGameplayTags.ini)
├── Input/                       (IMC_, IA_)
├── Audio/                       (SB_, SC_, SCue_, SW_)
└── _Core/                       (Shared base assets)
```

## Blueprint Naming

All Blueprint classes follow the `BP_` prefix convention:

| Blueprint | Name |
|-----------|------|
| Player Character | `BP_KhaaosCharacter` |
| Player Controller | `BP_KhaaosPlayerController` |
| Game Mode | `BP_KhaaosGameMode` |
| Game State | `BP_KhaaosGameState` |
| HUD | `BP_KhaaosHUD` |
| Loot Pickup (Common) | `BP_LootPickup_Common` |
| Loot Pickup (Rare) | `BP_LootPickup_Rare` |
| AI Pawn | `BP_KhaaosAI` |
| AI Elite | `BP_KhaaosAIElite` |
| Safe Zone Visual | `BP_SafeZoneVisual` |
| Zone Warning | `BP_ZoneWarning` |

## Niagara Naming

| Asset | Convention | Example |
|-------|-----------|---------|
| Niagara System | `NS_[Effect]_[Variant]` | `NS_MuzzleFlash_AR` |
| Niagara Emitter | `NI_[Particle]_[Variant]` | `NI_Sparks_Bullet` |
| Niagara Module | `NM_[Function]` | `NM_CurlNoise3D` |

## PCG Naming

| Asset | Convention | Example |
|-------|-----------|---------|
| PCG Graph | `PCG_[Description]` | `PCG_DesertBiome` |
| PCG Point Data | `PCGP_[Description]` | `PCGP_LootSpawnPoints` |

## LFS Tracking Rules

Large binary assets tracked via Git LFS:

```gitattributes
# Meshes
*.uasset filter=lfs merge=lfs -text
*.umap filter=lfs merge=lfs -text

# Textures
*.png filter=lfs merge=lfs -text
*.tga filter=lfs merge=lfs -text
*.exr filter=lfs merge=lfs -text
*.hdr filter=lfs merge=lfs -text

# Audio
*.wav filter=lfs merge=lfs -text
*.ogg filter=lfs merge=lfs -text

# Video
*.mp4 filter=lfs merge=lfs -text

# Animation
*.fbx filter=lfs merge=lfs -text
```

## Collision Profile Conventions

| Profile Name | Use Case |
|--------------|----------|
| `Pawn` | Player and AI pawns |
| `Spectator` | Spectator pawn (no collision) |
| `Projectile` | Bullets, grenades, throwables |
| `LootPickup` | Loot pickup overlap detection |
| `ZoneDamage` | Safe zone damage volume |
| `Ragdoll` | Death ragdoll bodies |
| `Destructible` | Destructible environment meshes |
| `Interactable` | Interactable objects (doors, buttons) |
| `InvisibleWall` | Gameplay blocking, no rendering |
| `TriggerVolume` | Generic trigger volumes |

## Gameplay Tag Naming Convention

Tags follow a dot-separated hierarchy: `Domain.Category.Item`

| Domain | Example | Description |
|--------|---------|-------------|
| `State.` | `State.Match.InProgress` | Game/runtime state |
| `Ability.` | `Ability.Combat.Shoot` | Ability system |
| `Cooldown.` | `Cooldown.Ultimate` | Ability cooldowns |
| `Effect.` | `Effect.Damage.Bullet` | Status effects |
| `Input.` | `Input.Move` | Enhanced Input |
| `Loot.` | `Loot.Rarity.Epic` | Loot system |
| `AI.` | `AI.State.Chase` | AI behavior |

## C++ Naming Conventions

| Type | Prefix | Example |
|------|--------|---------|
| Class | `A` (Actor), `U` (Object), `F` (Struct), `E` (Enum), `I` (Interface) | `AKhaaosGameMode` |
| Member | `b` (bool), `f` (float in some cases) | `bIsAlive` |
| Interface | `I` prefix | `IKhaaosInteractable` |
| Template | `T` prefix | `TSoftObjectPtr<T>` |
| Subsystem | `U` prefix, `Subsystem` suffix | `UKhaaosVFXManager` |

## Key Rules

1. **No spaces** in asset names — use PascalCase or underscores
2. **No abbreviations** unless widely understood (AR, SMG, HUD, UI, VFX)
3. **Always use soft references** (`TSoftObjectPtr`, `TSoftClassPtr`) for cross-module asset references
4. **Never hard-reference** blueprint assets from C++ — use `TSoftClassPtr`
5. **No raw `new`/`delete`** — always use `NewObject<T>()` or `MakeShared<T>()`
6. **`#pragma once`** in all header files
7. **`GENERATED_BODY()`** in all UCLASS/USTRUCT/UENUM
8. **`FGameplayTag::RequestGameplayTag()`** for tag initialization
9. **`Net/UnrealNetwork.h`** include for any replicated type
10. **Iris replication** enabled at module level (`bIrisSupport = true`)
