# Khaaos Run — Free 3D Asset Sources for UE5

> Step 4 Reference Guide | MVP Pipeline
> All sources listed are **free** and compatible with Unreal Engine 5.

---

## Table of Contents

1. [Mixamo — Free Characters & Animations](#1-mixamo--free-characters--animations)
2. [Quixel Megascans — Free with Epic Account](#2-quixel-megascans--free-with-epic-account)
3. [Sketchfab — CC-Licensed Assets](#3-sketchfab--cc-licensed-assets)
4. [UE Marketplace — Free Content](#4-ue-marketplace--free-content)
5. [Kenney.nl — Free Game Assets](#5-kennynl--free-game-assets)
6. [Poly Pizza — Free Low-Poly](#6-poly-pizza--free-low-poly)
7. [Recommended Downloads by Category](#7-recommended-downloads-by-category)
8. [Import Instructions for UE5](#8-import-instructions-for-ue5)
9. [Licensing Quick Reference](#9-licensing-quick-reference)

---

## 1. Mixamo — Free Characters & Animations

**URL:** https://www.mixamo.com  
**License:** Free for use with Adobe ID (no commercial redistribution of raw assets)  
**Best for:** Character meshes, animation sets, T-pose rigs

### What's Available
- **30+ character models** — various styles (warrior, soldier, robot, fantasy)
- **2,500+ motion-captured animations** — walk, run, shoot, reload, melee, death, emotes
- Auto-rigging: Upload any character and get it rigged automatically
- All animations retargetable to UE5 Mannequin skeleton

### Recommended for Khaaos Run
| Asset | Use Case | Notes |
|-------|----------|-------|
| "Warrior" or "Soldier" character | CHR_Zheers_Base base mesh | Download as FBX for UE5 |
| "Standing Idle" | AS_Idle | Loop enabled |
| "Running Forward" | AS_Run | Loop enabled |
| "Sprint" | AS_Sprint | Loop enabled |
| "Shooting Rifle" | AS_Shoot | One-shot |
| "Reload Rifle" | AS_Reload | One-shot |
| "Jumping" | AS_Jump | One-shot |
| "Melee Kick" | AS_Melee | One-shot |
| "Death From Front" | AS_Dead | One-shot |
| "Crouching" | AS_Crouch | Loop enabled |

### Mixamo → UE5 Steps
1. Log in with Adobe ID at mixamo.com
2. Select character → Download as **FBX for Unreal Engine** (with skin weights)
3. Select animations → Download each as **FBX for Unreal Engine** (keyframe reduction: medium)
4. Import character FBX into UE5: `/Game/Characters/Zheers/Meshes/`
5. Import animation FBXs: `/Game/Characters/Zheers/Animations/`
6. Create Animation Blueprint: `ABP_Zheers_Base`
7. Retarget animations to UE5 Mannequin if needed (IK Retargeter)

---

## 2. Quixel Megascans — Free with Epic Account

**URL:** https://quixel.com/megascans  
**License:** Free for use with Epic Games account (unlimited downloads)  
**Best for:** Photorealistic textures, 3D scanned meshes, foliage, surfaces

### What's Available
- **10,000+ 3D assets** — scanned real-world objects (rocks, debris, props, architecture)
- **60,000+ 2D surfaces** — PBR textures (albedo, normal, roughness, metallic)
- **3D plant atlas** — trees, grass, flowers with wind animation
- All assets come with LODs, collision meshes, and proper UVs
- Native UE5 integration via Quixel Bridge plugin

### Recommended for Khaaos Run
| Category | Search Terms | Use Case |
|----------|-------------|----------|
| 3D - Debris | "concrete debris", "metal scrap" | CIGKV map scatter |
| 3D - Props | "ammo box", "medical kit", "military crate" | Loot item references |
| 3D - Architecture | "concrete wall", "metal door", "ruins" | CIGKV buildings |
| 3D - Foliage | "dead tree", "desert shrub", "grass" | Environment foliage |
| Surface - Ground | "concrete worn", "asphalt", "dirt dry" | Terrain materials |
| Surface - Metal | "rusted metal", "gunmetal" | Weapon materials |
| 3D - Weapon | "assault rifle", "ammunition" | Weapon reference meshes |

### Quixel Bridge → UE5 Steps
1. Install Quixel Bridge (free from quixel.com)
2. Sign in with Epic Games account
3. In Bridge: Settings → UE5 Export → Set project path to KhaaosRun
4. Browse/search assets → Add to cart → Download
5. Export to UE5: Bridge auto-places in `/Game/Megascans/`
6. Bridge auto-generates: material instances, LODs, collision, foliage types

---

## 3. Sketchfab — CC-Licensed Assets

**URL:** https://sketchfab.com  
**License:** Varies — filter by CC0, CC-BY, CC-BY-SA (free commercial use)  
**Best for:** Reference models, props, environment pieces, low-poly art

### What's Available
- **Millions of 3D models** — wide quality range
- Download formats: FBX, OBJ, GLTF, DAE
- Filter by: license (Creative Commons), polycount, animated, PBR
- Many game-ready models with textures included

### Search Tips for Khaaos Run
| Search | Filters | Use Case |
|--------|---------|----------|
| "battle royale character" | Animated, CC-BY | Character reference |
| "assault rifle" | PBR, <50k polys, CC-BY | Weapon mesh base |
| "shotgun" | PBR, <30k polys, CC0 | Weapon mesh base |
| "sniper rifle" | PBR, <40k polys, CC-BY | Weapon mesh base |
| "medkit" | CC0, <5k polys | Loot item mesh |
| "ammo box" | CC0, <5k polys | Loot item mesh |
| "military helmet" | PBR, CC-BY | Character accessory |
| "tactical vest" | PBR, CC-BY | Character armor |
| "destroyed building" | PBR, <100k polys | Environment |

### Sketchfab → UE5 Steps
1. Find model → Check license (must allow commercial use)
2. Download as **FBX** or **GLTF** (with textures)
3. Import FBX into UE5 Content Browser
4. If GLTF: Use UE5's glTF importer or convert via Blender first
5. Assign imported textures to material
6. Attribute the creator per CC-BY license requirements

### ⚠️ License Warning
Always verify the specific license on each model. CC0 = no attribution needed.
CC-BY = attribution required. CC-BY-NC = **not allowed** for commercial games.

---

## 4. UE Marketplace — Free Content

**URL:** https://www.unrealengine.com/marketplace  
**License:** Free content can be used in any UE project  
**Best for:** Starter content, templates, FX, audio, complete asset packs

### Free Packs Recommended for Khaaos Run
| Pack | Contents | Use Case |
|------|----------|----------|
| **Starter Content** | Basic shapes, materials, textures, particles | Base materials & FX |
| **Lyra Starter Game** | Full game template, characters, UI, weapons | Architecture reference |
| **Open World Demo** | Large world, terrain, foliage | World building reference |
| **MetaHumans Sample** | High-quality character, face rig | Character quality target |
| **Niagara Fluids** | Fluid simulation FX | VFX reference |
| **Weapon System** | Weapon components, FX | Weapon system base |
| **Procedural Content Generation** | PCG samples, rules | CIGKV map generation |
| **Animation Starter Pack** | 30+ character animations | Mixamo alternative |
| **Infinity Blade Series** | Weapons, environments, FX | Weapon & env meshes |

### UE Marketplace → Project Steps
1. Open Epic Games Launcher → Unreal Engine → Marketplace
2. Filter by "Free"
3. Add to Vault → Create Project or add to existing
4. Content appears in `/Game/[PackName]/`

---

## 5. Kenney.nl — Free Game Assets

**URL:** https://kenney.nl/assets  
**License:** CC0 (Public Domain) — no attribution required  
**Best for:** Prototyping, low-poly placeholders, UI elements, audio

### What's Available
- **2D and 3D asset packs** — consistently styled, game-ready
- Audio: weapon sounds, UI sounds, ambient loops
- 3D: simple props, buildings, vehicles, characters (low-poly)
- All CC0: use anywhere, no attribution, no restrictions

### Recommended Packs
| Pack | Contents | Use Case |
|------|----------|----------|
| **Weapon Pack** | Low-poly rifles, pistols, melee | Weapon prototypes |
| **Character Pack** | Simple humanoid meshes | Character prototype |
| **Post Apocalypse Pack** | Ruins, debris, vehicles | Environment prototypes |
| **Nature Pack** | Trees, rocks, grass | Foliage placeholders |
| **Sci-fi Pack** | Tech props, crates | CIGKV props |
| **Audio - Weapons** | Gunshots, reloads, impacts | Placeholder audio |
| **Audio - UI** | Clicks, notifications | UI sounds |

### Kenney → UE5 Steps
1. Download pack from kenkey.nl (ZIP file)
2. Extract OBJ/FBX models and PNG textures
3. Import into UE5 via Content Browser drag-and-drop
4. Create materials from imported textures
5. No attribution needed (CC0)

---

## 6. Poly Pizza — Free Low-Poly

**URL:** https://poly.pizza  
**License:** CC0 or CC-BY (varies, check per model)  
**Best for:** Low-poly placeholders, prototyping, stylized art direction

### What's Available
- **Thousands of low-poly models** — browseable, categorized
- Formats: GLB, OBJ
- Game-ready: UV mapped, textured
- Fast download: single-click GLB export

### Recommended for Khaaos Run
| Search | Use Case |
|--------|----------|
| "rifle" | Weapon placeholder |
| "medkit" / "health" | Loot placeholder |
| "shield" | Loot placeholder |
| "ammo" | Loot placeholder |
| "soldier" | Character placeholder |
| "crate" / "box" | Loot/environment placeholder |

### Poly Pizza → UE5 Steps
1. Browse/search at poly.pizza
2. Download as GLB
3. Convert GLB to FBX using Blender (File → Import → glTF, then Export → FBX)
4. Import FBX into UE5
5. Check and apply textures

---

## 7. Recommended Downloads by Category

### Character (CHR_Zheers_Base)

| Priority | Source | Asset | Notes |
|----------|--------|-------|-------|
| **P0** | Mixamo | "Warrior" or "Mutant" character | Base mesh + auto-rig |
| **P0** | Mixamo | 10+ combat animations | Shoot, reload, melee, etc. |
| **P1** | Sketchfab | "tactical vest" or "body armor" | Character variant gear |
| **P1** | UE Marketplace | MetaHuman sample | Quality reference |
| **P2** | Quixel | Skin/cloth/camo surfaces | High-quality materials |

### Weapons (3 minimum)

| Priority | Source | Asset | Notes |
|----------|--------|-------|-------|
| **P0** | Sketchfab | "M4 assault rifle" (CC-BY, PBR) | WPN_AssaultRifle_MK1 |
| **P0** | Sketchfab | "break action shotgun" (CC-BY) | WPN_Shotgun_Breach |
| **P0** | Sketchfab | "DMR sniper" (CC-BY, PBR) | WPN_Sniper_DMR |
| **P1** | Kenney.nl | Weapon sound pack | Placeholder audio |
| **P1** | Quixel | "gunmetal", "rusted metal" | Weapon materials |

### Loot Items (7 minimum)

| Priority | Source | Asset | Notes |
|----------|--------|-------|-------|
| **P0** | Quixel | "medical kit" 3D scan | LOOT_MedKit_Small/Medium |
| **P0** | Quixel | "ammunition box" 3D scan | LOOT_AmmoBox_556/762 |
| **P0** | Kenney.nl | Simple box/prop meshes | LOOT_Bandage, Shields |
| **P1** | Sketchfab | "shield" or "energy cell" (CC0) | LOOT_Shield_Lv1/Lv2 |

### Environment

| Priority | Source | Asset | Notes |
|----------|--------|-------|-------|
| **P0** | Quixel | Building, concrete, debris | CIGKV map assets |
| **P0** | Quixel | Dead trees, desert foliage | Environment foliage |
| **P1** | Kenney.nl | Post-apocalypse pack | Environment prototypes |
| **P2** | UE Marketplace | Open World Demo | World tech reference |

### VFX & Audio

| Priority | Source | Asset | Notes |
|----------|--------|-------|-------|
| **P0** | UE Marketplace | Niagara Starter | Muzzle flash templates |
| **P0** | Kenney.nl | Weapon audio pack | Placeholder SFX |
| **P1** | UE Marketplace | Niagara Fluids | Advanced VFX |
| **P2** | Quixel | Atmospheric effects | Fog, rain references |

---

## 8. Import Instructions for UE5

### General FBX Import

1. **Drag and drop** FBX file into Content Browser (or right-click → Import)
2. In the FBX Import Options dialog:
   - **Mesh Type:** Static Mesh (weapons/loot) or Skeletal Mesh (characters)
   - **Scale:** 1.0 (if source is in centimeters; 100.0 if in meters)
   - **Forward Axis:** +Y (UE5 convention)
   - **Up Axis:** +Z
   - **Import Materials:** ✓
   - **Import Textures:** ✓
   - **Convert Units:** ✓
3. Click **Import All** if importing multiple files

### Skeletal Mesh Import (Characters)

1. Import FBX as **Skeletal Mesh**
2. Select **UE5 Mannequin** skeleton if prompted
3. If skeleton doesn't match: use **IK Retargeter** in UE5
4. Animation sequences import automatically with the skeletal mesh
5. Create **Animation Blueprint** (ABP_Zheers_Base) referencing the skeleton
6. Set up state machine: Idle → Walk → Run → Sprint → Shoot → Reload

### Static Mesh Import (Weapons/Loot)

1. Import FBX as **Static Mesh**
2. UE5 auto-generates simple collision
3. For custom collision: open mesh editor → Collision → Add Simplified Collision
4. Set **LOD Group** in mesh settings (e.g., `LOD0=100%`, `LOD1=50%`, `LOD2=25%`)
5. For weapons: set socket for muzzle flash, grip, magazine

### Material Setup

1. Create **Material Instance** from imported material
2. Assign textures:
   - Base Color → `_D` texture
   - Normal → `_N` texture
   - ORM (Occlusion/Roughness/Metallic) → `_ORM` texture (packed channel)
3. For PBR accuracy:
   - Roughness: channel **G** of ORM
   - Metallic: channel **B** of ORM
   - Ambient Occlusion: channel **R** of ORM

### Texture Import

1. Import PNG/TGA textures via Content Browser
2. Set proper **sRGB** setting:
   - Albedo/Diffuse: sRGB = ✓
   - Normal/ORM/Roughness/Metallic: sRGB = ✗
3. Set **Compression**:
   - Diffuse: DXT5 / BC7
   - Normal: BC5 (two-channel normal map)
   - ORM: DXT1 / BC4

### Collision Setup

| Asset Type | Collision Method | Settings |
|------------|-----------------|----------|
| Character | Capsule | Auto from skeletal mesh bounds |
| Weapon | Box/Convex | Simple collision in mesh editor |
| Loot (box) | Box | Auto (use as is) |
| Loot (shield) | Convex | Simplified convex hull |
| Environment | Complex | Auto with UV-based collision |

---

## 9. Licensing Quick Reference

| Source | License | Commercial Use | Attribution | Modification |
|--------|---------|---------------|-------------|-------------|
| **Mixamo** | Adobe ToS | ✓ (in-game) | Not required | ✓ |
| **Quixel Megascans** | Epic EULA | ✓ (UE projects) | Not required | ✓ |
| **Sketchfab CC0** | CC0 | ✓ | Not required | ✓ |
| **Sketchfab CC-BY** | CC-BY 4.0 | ✓ | **Required** | ✓ |
| **Sketchfab CC-BY-SA** | CC-BY-SA 4.0 | ✓ | **Required** | ✓ (share-alike) |
| **Sketchfab CC-BY-NC** | CC-BY-NC | **✗ No** | Required | ✓ |
| **UE Marketplace** | Epic EULA | ✓ (UE projects) | Not required | ✓ |
| **Kenney.nl** | CC0 | ✓ | Not required | ✓ |
| **Poly Pizza CC0** | CC0 | ✓ | Not required | ✓ |

### Attribution Template (for CC-BY assets)

Add a `CREDITS.md` file in the project:

```
## Third-Party Assets

- [Asset Name] by [Creator Name] - [Sketchfab URL]
  License: CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
```

---

## Quick-Start: Generate MVP Assets Without Blender

If you don't have Blender installed, use the placeholder generator:

```bash
# Generate all placeholder assets (OBJ + FBX + DAE + materials + metadata)
python3 scripts/mvp/step4_3d_assets/generate_placeholder_assets.py

# Validate generated assets
bash scripts/mvp/step4_3d_assets/validate_assets.sh

# Check the report
cat mvp_output/assets/asset_report.json | python3 -m json.tool
```

## Quick-Start: Generate MVP Assets With Blender

```bash
# Generate all assets with Blender (higher quality meshes)
blender --background --python scripts/mvp/step4_3d_assets/blender_generate_assets.py

# Validate
bash scripts/mvp/step4_3d_assets/validate_assets.sh
```

---

*Last updated: Step 4 — MVP 3D Assets Pipeline*
