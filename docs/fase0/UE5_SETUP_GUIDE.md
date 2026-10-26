# Khaaos Run — UE5.8 Setup Guide (Fase 0)

> **Project:** Khaaos Run — Battle Royale in Chaotic Worlds  
> **Engine:** Unreal Engine 5.8  
> **Organization:** Devs Ph.D / Nexus-HUB57  
> **Date:** 2025-07-17

---

## 1. System Requirements

| Component | Minimum | Recommended | Source Build |
|-----------|---------|-------------|--------------|
| **OS** | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS | Ubuntu 22.04+ |
| **CPU** | 8 cores (x86_64) | 16 cores | 32+ cores |
| **RAM** | 16 GB | 32 GB | 64 GB |
| **Disk** | 100 GB SSD | 200 GB NVMe | 300+ GB NVMe |
| **GPU** | Vulkan 1.1+ | Vulkan 1.3+ (RTX 3060+) | Not needed (headless) |
| **GPU VRAM** | 4 GB | 8 GB+ | N/A |
| **DirectX** | DirectX 12 (Windows) | DirectX 12 Agility SDK | N/A |
| **Clang** | 16+ | 17+ | Bundled by UE5 |
| **CMake** | 3.22+ | 3.28+ | Bundled by UE5 |
| **Git** | 2.30+ | 2.40+ | 2.40+ with LFS |
| **Python** | 3.8+ | 3.10+ | For build scripts |
| **DotNET** | 6.0+ | 8.0+ | Bundled by UE5 |

### Linux-Specific Dependencies

```bash
# Ubuntu 22.04+
sudo apt install -y \
    build-essential clang-16 lld-16 \
    cmake git git-lfs \
    libx11-dev libxrandr-dev libxinerama-dev libxcursor-dev libxi-dev \
    libgl1-mesa-dev libglu1-mesa-dev libvulkan-dev \
    libfontconfig1-dev libcurl4-openssl-dev \
    mono-complete dotnet-sdk-8.0 \
    python3 python3-pip
```

---

## 2. Installation Options

### Option A: Epic Games Launcher (Binary Install) — Recommended for Desktop

**Time:** ~30 minutes (download only, no compilation)  
**Disk:** ~50 GB

1. Download Epic Games Launcher: https://www.epicgames.com/store/en-US/download
2. Install and sign in with your Epic Games account
3. Navigate to **Unreal Engine → Library → Add Version**
4. Select **5.8** and choose install location
5. After install, the Editor is at: `<InstallDir>/Engine/Binaries/Linux/UnrealEditor`

**Pros:** Fastest setup, automatic updates, full Editor with Marketplace  
**Cons:** Requires GPU, not suitable for CI/CD or headless servers

### Option B: GitHub Source Build — Full Control

**Time:** 2-4 hours (compile on 16+ cores)  
**Disk:** ~200 GB

```bash
# 1. Register at https://epicgames.com/en-US/unrealengine/signup
# 2. Fork https://github.com/EpicGames/UnrealEngine
# 3. Clone (shallow, branch 5.8)
git clone --depth 1 --branch 5.8 \
    https://<GH_PAT>@github.com/EpicGames/UnrealEngine.git \
    /opt/UnrealEngine

# 4. Setup (downloads ~3 GB of prerequisites)
cd /opt/UnrealEngine
bash Setup.sh
bash GenerateProjectFiles.sh -Game -Engine

# 5. Build (2-4 hours)
make -j$(nproc)

# 6. Verify
./Engine/Binaries/Linux/UnrealEditor
```

**Pros:** Full source access, debug symbols, custom modifications  
**Cons:** Long build time, large disk usage, must rebuild on updates

### Option C: Linux Headless / Docker — Server & CI/CD Only

**Time:** ~1 hour (Docker build)  
**Disk:** ~50 GB (builder), ~5 GB (runtime image)

```bash
# Build the dedicated server in Docker
cd Unreal/KhaaosRun/Build
docker build -t khaaos-server:latest .

# Run the server
docker run -d \
    -p 7777:7777/udp -p 7778:7778/udp -p 27015:27015/udp \
    -e MAX_PLAYERS=100 -e REGION=us-east-1 \
    khaaos-server:latest
```

**Pros:** No GPU needed, reproducible builds, ideal for CI/CD  
**Cons:** No Editor access, no content creation, server-only

---

## 3. Compilation Steps

### 3.1 Development Editor Build (Desktop)

```bash
# Generate project files
/opt/UnrealEngine/Engine/Build/BatchFiles/Linux/GenerateProjectFiles.sh \
    -project=/path/to/KhaaosRun.uproject \
    -game -engine

# Build Development Editor
/opt/UnrealEngine/Engine/Build/BatchFiles/Linux/Build.sh \
    KhaaosRunEditor Linux Development \
    /path/to/KhaaosRun.uproject \
    -WaitMutex
```

### 3.2 Dedicated Server Build (Linux Headless)

```bash
# Build server target (no Slate/UMG, no rendering)
/opt/UnrealEngine/Engine/Build/BatchFiles/Linux/Build.sh \
    KhaaosRunServer Linux Development \
    /path/to/KhaaosRun.uproject \
    -WaitMutex

# Package for deployment
/opt/UnrealEngine/Engine/Build/BatchFiles/RunUAT.sh BuildCookRun \
    -project=/path/to/KhaaosRun.uproject \
    -noP4 -platform=Linux \
    -target=KhaaosRunServer \
    -serverconfig=Development \
    -cook -build -stage -pak \
    -archive -archivedirectory=/path/to/PackagedServer
```

### 3.3 Shipping Build (Production)

```bash
# Shipping server (optimized, no debug symbols)
/opt/UnrealEngine/Engine/Build/BatchFiles/Linux/Build.sh \
    KhaaosRunServer Linux Shipping \
    /path/to/KhaaosRun.uproject \
    -WaitMutex
```

### 3.4 Automation Script

```bash
# All-in-one via our setup script
bash scripts/setup_ue5_editor.sh --check          # Verify environment
bash scripts/setup_ue5_editor.sh --from-source    # Build UE5 from source
bash scripts/setup_ue5_editor.sh --compile        # Compile KhaaosRun Editor
bash scripts/setup_ue5_editor.sh --server         # Build dedicated server
bash scripts/setup_ue5_editor.sh --all            # Full pipeline
```

---

## 4. Project Architecture

### 4.1 Modules (3 modules declared in .uproject)

| Module | Type | Loading Phase | Platforms | Description |
|--------|------|---------------|----------|-------------|
| **KhaaosRun** | Runtime | Default | Win64, Linux, Mac | Main game module (GAS, Combat, EOS, Worlds) |
| **KhaaosRunEditor** | Editor | Default | Win64, Mac | Editor extensions, detail customizations |
| **KhaaosEAC** | Runtime | Default | Win64, Linux | Easy Anti-Cheat integration (stub-safe) |

### 4.2 Plugins (15 plugins enabled in .uproject)

| # | Plugin | Category | UE5.8 Status | Purpose |
|---|--------|----------|--------------|---------|
| 1 | ModelingToolsEditorMode | Editor | Built-in | Geometry modeling tools |
| 2 | LyraExtender | Game Framework | Community | Lyra extension framework |
| 3 | GameplayAbilities | GAS | Built-in | Gameplay Ability System (core) |
| 4 | GameFeatures | Modular | Built-in | Game Feature plugins (dynamic loading) |
| 5 | EnhancedInput | Input | Built-in | Enhanced Input System (replaces old input) |
| 6 | OnlineSubsystem | Online | Built-in | Online abstraction layer |
| 7 | OnlineSubsystemUtils | Online | Built-in | Online utility functions |
| 8 | OnlineServicesInterface | Online | Built-in | Online services interface (EOS) |
| 9 | Iris | Network | Built-in | Iris replication system |
| 10 | SignificanceManager | Performance | Built-in | LOD/significance budget manager |
| 11 | StateTree | AI | Built-in | State Tree (replaces Behavior Trees) |
| 12 | Niagara | VFX | Built-in | Niagara particle system |
| 13 | PCG | Procedural | Built-in | Procedural Content Generation |
| 14 | AnimationBudgetAllocator | Animation | Built-in | Animation budget system |
| 15 | Metasound | Audio | Built-in | MetaSound audio system |
| — | EOSIntegrationKit | Online/EOS | Community | Epic Online Services integration |

### 4.3 Build Targets (3 Target.cs files)

| Target | Type | bBuildClient | bBuildServer | bUsesSlate | C++ |
|--------|------|-------------|-------------|-----------|-----|
| **KhaaosRun** | Game | true | false | true | C++20 |
| **KhaaosRunEditor** | Editor | true | false | true | C++20 |
| **KhaaosRunServer** | Server | false | true | false | C++20 |

---

## 5. Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `error: 'KhaaosEAC' module not found` | EAC SDK not present | Build works in stub mode (KHAAOS_EAC_SDK=0). Set KHAAOS_EAC_SDK_DIR for full SDK. |
| `UHT error: missing generated.h` | Missing `#include "ClassName.generated.h"` | Add the generated header include as last include before GENERATED_BODY |
| `Link error: unresolved LyraGame` | LyraExtender plugin not found | Ensure LyraExtender plugin is installed in Engine/Plugins or Project/Plugins |
| `Vulkan not available` | No GPU / drivers missing | Install mesa-vulkan-drivers, or use headless server target |
| `Out of memory during build` | Insufficient RAM | Increase swap, reduce parallel jobs: `make -j4` instead of `make -j$(nproc)` |
| `Clang version mismatch` | System Clang too old | UE5 bundles its own Clang; set `--clang-version` or use source build |
| `EOS SDK not found` | EOSSDK module missing | Install EOS SDK from Epic, configure in DefaultEngine.ini |
| `Plugin 'Iris' not found` | UE5 version < 5.5 | Iris was added in UE5.5; upgrade to UE5.8 |
| `Error: CppStandard Cpp20` | UE5 version < 5.4 | C++20 requires UE5.4+; upgrade engine |
| `GenerateProjectFiles fails` | .uproject syntax error | Validate JSON: `python3 -c "import json; json.load(open('KhaaosRun.uproject'))"` |
| `Docker build OOM` | Builder stage needs 32+ GB RAM | Set Docker memory limit: `docker build --memory=32g` |
| `EAC integration link error` | EAC .so/.dll missing | Provide SDK via KHAAOS_EAC_SDK_DIR or accept stub mode |
| `Build.sh permission denied` | Scripts not executable | `chmod +x Engine/Build/BatchFiles/Linux/*.sh` |
| `Disk full during build` | Intermediate files ~50+ GB | Clean Intermediate/ and Saved/ between builds |
| `Lyra dependency cycle` | KhaaosRunEditor ↔ KhaaosRun | Editor module only links in `bBuildEditor` block |

---

## 6. Project-Specific Notes

### 6.1 Gameplay Ability System (GAS)
- Core combat, movement, species passives, and defense all use GAS
- `KhaaosAttributeSet` defines Vitality, Shield, Stamina attributes
- `KhaaosGameplayTags` declares 100+ gameplay tags (125 UPROPERTY macros)
- Custom `KhaaosAbility_Combat`, `KhaaosAbility_Movement`, `KhaaosAbility_Defense`, `KhaaosAbility_SpeciesPassives`

### 6.2 Niagara VFX
- `KhaaosVFXManager` orchestrates all Niagara systems
- Muzzle flash, bullet impact, zone warnings are Niagara-emitter driven
- Assets in `mvp_output/assets/vfx/` (assault, sniper, shotgun, metal, concrete, dirt)

### 6.3 Epic Online Services (EOS)
- 8 EOS-related header files in `Game/EOS/`
- `KhaaosEOSManager` is the central EOS interface
- Session, Lobby, Matchmaking (V1 + V2), Cloud Save, Crossplay, Region Manager
- Production config in `Config/Regions/DefaultEOS_Production.ini`

### 6.4 Lyra Extender
- 7 bridge files in `Game/LyraBridge/`
- Overrides for ModeBase, HUD, HeroComponent, Input, Weapon, Ability, GameplayTag
- Bridges Khaaos custom systems into Lyra's modular architecture

### 6.5 Multi-World System
- 6 worlds defined: Barburhen, Arukheea, Priadus, Ckesalth, CIGKV, Zu
- Each world has MapData + Level classes
- `KhaaosMultiWorldPersistence` handles world transitions and save state
- `KhaaosPCGConfig` configures procedural generation per world

### 6.6 Easy Anti-Cheat (EAC)
- `KhaaosEAC` module builds in stub mode when SDK is absent
- `KHAAOS_EAC_SDK=0/1` compile-time define controls stub vs. real
- Integration in `Game/AntiCheat/KhaaosEACIntegration.h`
- Movement validation via `KhaaosMovementValidator`

### 6.7 Economy System
- 10 economy-related headers: AtomicLedger, ComplianceFramework, TransferSystem
- Bankhaoos component, Armorer Forge, Shop System, Transaction Validator
- Full compliance framework for regional regulations

### 6.8 Code Statistics
- **206 header files** (.h) — all with `#pragma once` include guards
- **~150 implementation files** (.cpp)
- **6,203 total UHT macro occurrences** across 191 files
  - UCLASS: 183 files
  - USTRUCT: 125 files
  - UENUM: 89 files
- **C++20** standard with concepts, ranges, constexpr
- **IWYU** (Include What You Use) enforced
- **Unity Build** disabled for strict compilation (`bUseUnity = false`)

---

## 7. Next Steps (Post-Fase 0)

| Phase | Description | Status |
|-------|-------------|--------|
| Fase 1 | UE5 Editor launch + first map load | Pending |
| Fase 2 | EOS production setup + authentication | Pending |
| Fase 3 | Content import (3D assets, audio, VFX) | Pending |
| Fase 4 | GAS combat system integration test | Pending |
| Fase 5 | Multi-region deployment + go-live | Pending |
