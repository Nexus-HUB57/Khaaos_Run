# Khaaos Run — Fase 0: UE5.8 Setup & Compilation Guide

## Pré-requisitos

| Requisito | Mínimo | Recomendado |
|-----------|--------|-------------|
| **OS** | Ubuntu 22.04 / Windows 10 | Ubuntu 24.04 / Windows 11 |
| **CPU** | 8 cores (x64) | 16+ cores |
| **RAM** | 16 GB | 32 GB |
| **Disk** | 100 GB free | 200 GB SSD |
| **GPU** | Vulkan 1.2 / DX12 | RTX 3060+ (Editor) |
| **Epic Account** | UE5 access | UE5 + GitHub linked |

## Opção A: Epic Games Launcher (Binary — mais rápido)

```bash
# 1. Download Epic Games Launcher
# Linux: https://www.epicgames.com/store/en-US/download
# Windows: Store → Get Epic Games

# 2. Install UE5.8 via Launcher
# Launcher → Unreal Engine → Library → + → 5.8

# 3. Set install path
export UE_INSTALL_DIR=/opt/UnrealEngine  # adjust to your install

# 4. Compile KhaaosRun
bash scripts/setup_ue5_editor.sh --compile
```

## Opção B: Build from Source (mais controle, 2-4h)

```bash
# 1. Register at https://epicgames.com/en-US/unrealengine/signup
# 2. Fork https://github.com/EpicGames/UnrealEngine (branch 5.8)
# 3. Set GitHub PAT
export GH_PAT="ghp_your_token_here"

# 4. Build UE5.8 + KhaaosRun
bash scripts/setup_ue5_editor.sh --all
```

## Opção C: Docker Headless Build (CI/CD only)

```bash
# This is the CI pipeline — builds server without Editor
cd Unreal/KhaaosRun/Build
bash build-server.sh --release --docker
```

## Verificação

```bash
# Check environment
bash scripts/setup_ue5_editor.sh --check

# After successful build, verify:
cd /opt/UnrealEngine
ls Engine/Binaries/Linux/UnrealEditor  # should exist
```

## Próximos Passos (pós-compilação)

1. Open KhaaosRun.uproject in UE5 Editor
2. Verify all 84 C++ files compile without errors
3. Create CIGKV map (Level → New Level → Empty)
4. Place KhaaosCIGKVLevel as Level Script Actor
5. Configure spawn points, ZEX, loot via the Data Asset
6. Run 2-client test for replication validation
7. Run KhaaosLoadTestManager with 100 bots

## Troubleshooting

| Problema | Solução |
|----------|---------|
| `error: Vulkan not found` | Install `vulkan-tools libvulkan1` (Linux) |
| `error: out of memory` | Increase swap: `sudo fallocate -l 32G /swapfile` |
| `Build.sh: command not found` | Set `UE_INSTALL_DIR` to correct Engine path |
| `Module 'LyraGame' not found` | Install Lyra Starter Game plugin via Launcher |
| `EOS SDK not found` | Download EOS SDK from Epic Developer Portal |
