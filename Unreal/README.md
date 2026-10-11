# Khaaos Run - Unreal Engine 5.8 Integration

> **Devs Ph.D** | Nexus-HUB57 | Battle Royale in Chaotic Worlds

## Estrutura do Projeto

```
KhaaosRun/
├── KhaaosRun.uproject          # UE5.8 project file (Lyra + GAS + Iris + EOS)
├── Config/
│   └── DefaultGame.ini         # Match, zone, loot, economy, matchmaking configs
├── Source/
│   ├── KhaaosRun/              # Runtime module (C++20)
│   │   ├── KhaaosRun.Build.cs  # Module dependencies
│   │   ├── KhaaosRun.h         # Module header
│   │   ├── Game/
│   │   │   ├── KhaaosGameMode.h      # Match lifecycle (Lobby→Countdown→Match→Finish)
│   │   │   ├── KhaaosGameState.h     # Replicated match state
│   │   │   ├── AbilitySystem/        # Tag-based ability framework
│   │   │   ├── Attributes/           # Health, Credits, Energy
│   │   │   ├── Combat/               # Projectiles + hit detection
│   │   │   ├── Zone/                 # 5-phase shrinking zone
│   │   │   ├── Loot/                 # Server-authoritative pickup
│   │   │   ├── Spatial/             # O(1) spatial hash grid
│   │   │   ├── Economy/             # HTTP bridge to Node.js microservice
│   │   │   ├── AI/                  # StateTree + BT + EQS
│   │   │   └── UI/                  # UMG HUD widgets
│   │   ├── Player/
│   │   │   └── KhaaosPlayerState.h  # Replicated player stats + PatenteKR
│   │   ├── Save/
│   │   │   └── KhaaosSaveGame.h     # Persistent progression
│   │   └── Networking/              # EOS integration
│   └── KhaaosRunEditor/            # Editor module
├── Content/                     # Assets (ue5-style-guide naming)
│   ├── Core/                   # GameMode, GameState BP
│   ├── Characters/             # SK_, A_
│   ├── Weapons/                # SM_, SK_ weapons
│   ├── Environment/            # Maps, meshes
│   ├── UI/                     # W_ widgets
│   ├── VFX/                   # Niagara systems
│   ├── Audio/                  # MetaSounds
│   ├── MaterialLibrary/        # M_ master materials
│   └── Maps/                   # Level files
└── Plugins/                    # EOS, LyraExtender, etc.
```

## Portabilidade do TypeScript → C++

| Sistema TS | Arquivo C++ | Status |
|---|---|---|
| `RoomManager.ts` | `KhaaosGameMode.h` | Header criado |
| `EconomyEngine.ts` | `EconomyBridge.h` (microservice) | Header criado |
| `MonteCarloEconomy.ts` | EconomyBridge (via API) | Header criado |
| `ProceduralGenerator.ts` | UE PCG Framework | Pendente (Fase 2) |
| `SpatialGrid.ts` | `SpatialGrid.h` | Header criado |
| `LagCompensation.ts` | Networking/ | Pendente (Fase 1) |
| `MatchmakingService.ts` | EOS Lobbies + Sessions | Pendente (Fase 4) |
| `RankingService.ts` | EOS + PostgreSQL | Pendente (Fase 3) |
| Schema: PatenteKR | `KhaaosPlayerState.h` | Header criado |
| Schema: ZONE_PHASES | `KhaaosSafeZone.h` | Header criado |
| Schema: LOOT_PRESETS | `KhaaosLootPickup.h` | Header criado |

## Novos Sistemas dos Devs (NÃO MODIFICAR)

> ⚠️ Outros desenvolvedores adicionaram sistemas desde o commit `9b200f9`:
> - `server/game/LagCompensation.ts` — Compensação de lag server-rewind
> - `server/game/MatchmakingService.ts` — Matchmaking skill-based
> - `server/game/RankingService.ts` — ELO + XP + Patente
> - `client/src/pages/lobby.tsx` — UI de lobby
> - `client/src/pages/ranking.tsx` — Leaderboard
> - `client/src/components/match-results-modal.tsx` — Modal de resultados
> - `client/src/components/battle-flow-navigator.tsx` — Auto-navegação
> - `client/src/hooks/use-ranking.ts` — Hooks de ranking
> - `shared/schema.ts` — Nova tabela `match_results` + colunas em `playerStats`

## Padrões Adotados

- **ue5-style-guide (Allar)**: Nomenclatura SM_, SK_, M_, MI_, T_, A_, BP_, W_, DT_
- **ActionRoguelike (Tom Looman)**: Ability system, AttributeSet, GameplayTags, SaveGame, SignificanceManager, ActorPooling
- **Iris Replication**: Delta replication para UE5.8
- **C++20**: Concepts, ranges, constexpr
- **Server-Authoritative**: Dano, loot, zone - tudo server-side

## Referência de Branch

- **Branch**: `feat/ue5-phd-foundation`
- **Base**: `main` @ `9b200f9`
- **NÃO fazer push direto na main** — PR only após review
