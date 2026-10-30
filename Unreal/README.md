# Khaaos Run - Unreal Engine 5.8 Integration

> **Devs Ph.D** | Nexus-HUB57 | Battle Royale in Chaotic Worlds

## Estado e escopo de validação
O repositório contém código C++ e configuração `.uproject`, mas isso não comprova compilação completa, execução em servidor dedicado ou integração funcional com o backend. O roadmap marca como pendentes uma build limpa com UnrealBuildTool, Automation Tests em mundo UE5, protocolo cliente-servidor versionado e mapa mínimo jogável. Os testes portáveis de regras C++ não substituem essas validações.

`game-runtime/`, a aplicação web e este projeto Unreal são componentes/processos separados. Os nomes `EconomyBridge` e os comentários de arquitetura não constituem, por si só, evidência de uma jornada end-to-end conectada. Consulte [`../docs/ROADMAP.md`](../docs/ROADMAP.md) para os gates pendentes.

## Pré-requisitos e build do servidor
O `.uproject` declara Unreal Engine **5.8**, módulos Runtime/Editor e plugins externos/engine, incluindo LyraExtender e EOSIntegrationKit. Confirme a disponibilidade e a licença desses plugins no ambiente de build. O target Linux dedicado depende de instalação UE5.8 compatível e toolchain Linux; reserve espaço em disco, RAM e CPU suficientes.

Do diretório raiz do repositório, o script disponível é `scripts/build-server.sh` (não há `build-server.sh` dentro de `Unreal/KhaaosRun/Build`):
```bash
# Ajuste para o diretório da instalação UE5.8 que contém Engine/.
bash scripts/build-server.sh --ue5=/caminho/para/UnrealEngine --debug

# Configuração Shipping; --docker solicita também a build de uma imagem.
bash scripts/build-server.sh --ue5=/caminho/para/UnrealEngine --release --docker
```
O script exige UE5 já instalada e empacota `KhaaosRunServer` para Linux. A build completa ainda não está validada; trate eventuais falhas de toolchain/plugins como pendentes de investigação, não como evidência de que o runtime JS falhou. O Dockerfile em `Build/` usa imagem base de Unreal Engine, cujo acesso/disponibilidade deve ser confirmado no ambiente.

Para os testes portáveis de regras C++ (compilador C++20, sem Unreal Engine), execute da raiz:
```bash
bash scripts/test_ue5_logic.sh
```
Esse comando compila subconjuntos de regras com g++; não valida UHT, módulos/plugins UE, replicação nem o executável dedicado.

## Empacotamento do slice FPS CIGKV

O script `scripts/build/package_ue5_first_world.py` cria um ZIP do primeiro slice de combate/ballística, inclui um manifesto SHA-256 e valida o `.uproject`, plugins, configuração CIGKV, perfil visual e contratos C++ necessários:

```bash
python3 scripts/build/package_ue5_first_world.py --run-engine
```

Com `--run-engine`, o script usa `UE5_ROOT`, `RUNUAT` ou `UNREAL_EDITOR` quando disponíveis. Sem uma instalação real do UE5.8, ele ainda empacota e executa a validação estática, mas registra `skipped_no_engine`; isso não deve ser interpretado como cook, UHT, UBT ou PIE aprovados. O artefato é escrito em `artifacts/ue5/`.

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
│   │   │   ├── Economy/             # HTTP bridge to Node.js application API
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
| `EconomyEngine.ts` | `EconomyBridge.h` (HTTP API Node.js) | Header criado |
| `MonteCarloEconomy.ts` | EconomyBridge (via API) | Header criado |
| `ProceduralGenerator.ts` | UE PCG Framework | Pendente (Fase 2) |
| `SpatialGrid.ts` | `SpatialGrid.h` | Header criado |
| `LagCompensation.ts` | Networking/ | Pendente (Fase 1) |
| `MatchmakingService.ts` | EOS Lobbies + Sessions | Pendente (Fase 4) |
| `RankingService.ts` | EOS + PostgreSQL | Pendente (Fase 3) |
| Schema: PatenteKR | `KhaaosPlayerState.h` | Header criado |
| Schema: ZONE_PHASES | `KhaaosSafeZone.h` | Header criado |
| Schema: LOOT_PRESETS | `KhaaosLootPickup.h` | Header criado |

## Imagem de servidor e contexto Docker

`server/` contém código TypeScript do backend, mas não é um pacote Node autônomo: `package.json`, `shared/`, o build do cliente e o schema ficam na raiz do repositório. Portanto, `server/Dockerfile` é o arquivo da imagem e o **contexto de build é a raiz (`.`)**. A imagem publicada em GHCR é a aplicação Node completa (API e arquivos estáticos do cliente), não um microserviço de economia separado.

O workflow `UE5 CD` valida em PR e constrói a imagem sem publicá-la. Em `main`, primeiro roda `npm run verify:all` e só então publica as tags SHA e `main` em `ghcr.io/nexus-hub57/khaaos-run-server`. O `GITHUB_TOKEN` recebe `packages: write` apenas no job de build; segredos de execução são fornecidos pelo ambiente de deploy, nunca copiados para a imagem.

## Sistemas de Experiência do Jogador (v2.0)

### Pipeline Gráfica
| Sistema | Classe | Descrição |
|---|---|---|
| Pipeline Manager | `UKhaaosGraphicsPipelineManager` | Orquestrador central: 7 estágios (init→asset loading→quality calibration→**post process setup**→**lighting setup**→runtime optimization→hot reload) |
| Quality Profile Runtime | `UKhaaosQualityProfileRuntime` | Override por-jogador, LOD bias para spectating/killcam, console command integration |
| Material Pipeline | `UKhaaosMaterialPipeline` | Pipeline de materiais por espécie: 8 passes (BaseColor, Normal, Emissive, ORM, Subsurface, ClearCoat, WetMap, SpeciesTrait) + rim light por espécie, async streaming |
| LOD System | `UKhaaosCharacterLODSystem` | Distance-based LOD (HIGH 0-30m, MEDIUM 30-60m, LOW 60-100m, CULLED 100m+), animation budget 2ms |
| Species LOD Manager | `UKhaaosSpeciesLODManager` | LOD por espécie (5 níveis LOD0-LOD4), disable morph/emissive/VFX por nível |
| Graphics Presets | `UKhaaosGraphicsPresetSubsystem` | 5 presets (Low 720p30→PhD 4K120), auto-detect GPU VRAM, DLSS/FSR/XeSS/TSR + sharpen tonemapper + TSR samples |
| Dynamic Resolution | `UKhaaosDynamicResolution` | GPU-time-based DRS (Conservative/Aggressive/Adaptive), 8-frame moving average |
| Post Process Manager | `UKhaaosPostProcessManager` | Efeitos por espécie (bloom, chromatic aberration, DOF, motion blur), GPU budget optimization — grading delegado ao Director |
| Material Optimizer | `UKhaaosMaterialOptimizer` | Streaming budget, batch parameter updates, distant material optimization |

### Pipeline Gráfica v3 — "Look Free Fire" (2026-10-28)
O objetivo da v3 é fechar o gap visual vs Free Fire: imagem **clara, saturada e estável**, com **personagens que "popam"** do cenário e **profundidade via névoa**.

| Sistema | Classe | Descrição |
|---|---|---|
| Post Process Director | `UKhaaosPostProcessDirector` (WorldSubsystem) | Pós-processamento **REAL** via `FPostProcessSettings` em `APostProcessVolume` unbounded (prioridade 100). Assinatura FF: exposição fixa (histograma colapsado Min==Max, sem pop de adaptação), tonemapper de alto contraste (Slope 0.85/Toe 0.30/Shoulder 0.22), saturação 1.22x + tint quente, bloom com threshold 0.85, grain zero, vignette sutil. 5 moods: `PadraoBattle` (FF signature), `NoiteNeon` (Arukheea), `NebulosaAlien` (Ckesalth), `AmanhecerVenenoso` (Barburhen), `LowEndLeve`. Overlay por espécie (tint+vignette) exposto ao PostProcessManager. Crossfade via BlendWeight |
| Lighting Director | `UKhaaosLightingDirector` (WorldSubsystem) | Rig de luz programático: `ADirectionalLight` (lux/temperatura/cascatas/contact shadows), `ASkyLight` (captura única SLS_CapturedScene), `AExponentialHeightFog` (densidade/inscattering/profundidade), `ASkyAtmosphere`. 4 presets: `DiaSolarPadrao` (12 lux@6100K — FF), `TardeDourada` (Priadus), `NoiteNeon` (Arukheea), `NebulosaVioleta` (Barburhen/Ckesalth). Auto-mapping por nome de mundo. Guardas: dedicated server/-NullRHI/commandlet não spawnam |
| Character Pop Component | `UKhaaosCharacterPopComponent` (ActorComponent) | "Pop" de personagem estilo FF: **rim light Fresnel por espécie** (Huran ciano 0.9, Khael violeta 1.1, Venex magenta 1.0, Onith laranja 0.8, Zheers violeta-espiritual 0.7, Skeetw verde-pena 0.6) via MID params `RimLightIntensity`/`RimLightColor`, **custom depth stencil** (1+espécie, para outline PP), **point light de ancoragem** (só pawn local, cast shadows off, preset>Low). Hook de gameplay: `SetRimBoost(0-3)` para as 48 skills |
| Correções de CVars | `KhaaosPostProcessManager` | Removidas CVars **inexistentes** na engine (`r.ColorGradingLUT`, `r.VignetteIntensity`, `r.UnderwaterDistortion`, `r.BloomIntensity`, `r.SceneChromaticAberration`) — substituídas por `r.SceneColorFringe.Intensity` real + delegação ao Director |
| Testes | `KhaaosGraphicsV3Spec.cpp` | 6 specs: receitas válidas, mapeamento de mundos, presets de luz, rim único por espécie, 7 estágios do pipeline, tradução real de `FPostProcessSettings` |

**Fluxo de inicialização gráfica v3:** `InitializePipeline()` → estágio 4 pré-aquece receita de PP → estágio 5 valida preset de luz → no `OnWorldBeginPlay` os WorldSubsystems criam volume PP + rig de luz e aplicam mood/preset automático do mundo (CIGKV=PadraoBattle/Dia, Arukheea=NoiteNeon, Barburhen=AmanhecerVenenoso/NebulosaVioleta, Ckesalth=NebulosaAlien, Priadus=PadraoBattle/TardeDourada).

**Nota de materiais:** os parâmetros `RimLightIntensity`, `RimLightColor`, `EmissiveIntensity` etc. assumem master materials com esses parâmetros expostos (convenção do pipeline); materiais sem o parâmetro ignoram o set de MID — sem risco de crash.

### Sistema de Personagens (6 Espécies)
| Sistema | Classe | Descrição |
|---|---|---|
| Mesh Registry | `UKhaaosSpeciesMeshRegistry` | Registry central de skeletal meshes por espécie (4 LODs), async loading via FStreamableManager |
| Trait Builder | `UKhaaosSpeciesTraitBuilder` | Constrói e aplica GAS traits: HP/Energy/Speed/Shield + passives por espécie |
| Anim BP Proxy | `UKhaaosAnimBPProxy` | State machine de animação (8 estados), physics blend por body part, combat layer, LOD tick rate |
| Operative Actor | `AKhaaosOperativeActor` | Base abstrata com SpeciesGAS, ApplySpeciesTraits, species-specific stats |
| Species GAS | `UKhaaosSpeciesGAS` | ASC + AttributeSet, 6 GameplayEffects por espécie (regen/resist/bonus) |
| Animation Blend | `UKhaaosAnimationBlendManager` | Physics-based animation por espécie (spring-damper), gameplay event reactions |
| Character Customizer | `UKhaaosCharacterCustomizer` | Morph targets, color channels, species presets, JSON serialization |
| Emote System | `UKhaaosEmoteSystem` | 5 categorias, montage+VFX+audio, 8-slot emote wheel |

**Traits por Espécie:**
- **Huran** (85 bones): HP=120, WaterBreathing, HPRegen 2/s, SwimSpeed+25%
- **Khael** (92 bones): Energy=120, Shield=20, CryoResist+40%, CrystalArmor, ManaRegen 3/s
- **Venex** (88 bones): Speed=680, Shield=15, SpeedBoost+15%, CyberShield, HUDHack
- **Onith** (110 bones, tail): HP=150, Shield=30, ToxicResist+50%, CarapaceArmor, TailWhip
- **Zheers** (78 bones): Speed=600, Shield=10, RadResist+35%, FogStealth, EarPerception
- **Skeetw** (120 bones, wings): Speed=720, Shield=5, FlightGlide, FeatherDodge, WindSense

### Sistema de Acessórios
| Sistema | Classe | Descrição |
|---|---|---|
| Point Manager | `UKhaaosAccessoryPointManager` | 10 pontos de attachment com hierarquia (Head/Face/Shoulders/Back/Chest/Waist/Legs/Feet/Weapon_L/R) |
| Material Variants | `UKhaaosMaterialVariantSystem` | 18 variantes por espécie (3 cada), MID com parameter overrides, blend transitions, compra KRC |
| VFX Hook System | `UKhaaosVFXHookSystem` | 18 hooks VFX por espécie (3 cada), 10 lifecycle events, species filtering, Niagara pooling |
| Socket System | `UKhaaosAccessorySocketSystem` | Socket-based attachment, instancing, draw call batching |
| Skin System | `UKhaaosSkinSystem` | 6 rarities (COMUM→MITICO), mesh/material/VFX overrides, rarity aura VFX |
| Cosmetic Validator | `UKhaaosCosmeticValidator` | Validação server-side, species compatibility, battle pass tier, anti-cheat rate limiting |

### Economy 2PC (Two-Phase Commit)
| Sistema | Classe | Descrição |
|---|---|---|
| Economy Bridge 2PC | `UKhaaosEconomyBridge2PC` | C++/TS two-phase commit: PREPARE→COMMIT/ABORT, Idempotency-Key anti-double-spend, timeout recovery (10s check, 30s timeout). **v2:** HTTP aceita toda faixa 2xx (prepare fresh = 201), erro server lido de `code`/`message`, `playerId` em TODAS as fases (fix 403 dev-mode) |
| Economy Bridge | `UEconomyBridgeSubsystem` | HTTP bridge: /api/economy/prices, /simulate, /health. TTL cache, rate limiting |
| Armorer Forge | `AKhaaosArmorerForge` | Marketplace de equipamentos, DataTable catalog. **v2:** `TryPurchase` roteado pelo 2PC (escrow server-side → entrega pós-commit), fallback local Bankhaoos (`bUseTwoPhaseCommit=false`), guardas de compra única por jogador, `EndPlay` aborta pendências, idempotency key `forge.<item>.<guid32>` |
| Shop System | `UKhaaosShopSystem` | Daily deals (24h), featured rotation (7d), Fisher-Yates shuffle, discount system |

**2PC Flow (wired na Forja):** `TryPurchase` → `BeginTransaction(forge.<item>.<guid32>)` → `PreparePhase()` [POST /api/economy/2pc/prepare — escrow server-side] → auto-commit do bridge [POST /api/economy/2pc/commit com `playerId`] → `Handle2PCPurchaseCompleted` (débito no espelho local + entrega do item + feedback). Falha em qualquer fase → `AbortPhase()` (refund) → `Handle2PCPurchaseFailed`.

**Observabilidade:** `GET /metrics` no economy-api expõe `khaaos_economy_2pc_*` (requests por fase/resultado, latência p95, escrows por status, GC) — dashboards em `infra/grafana/khaaos-economy-dashboard.json`; `GET /healthz` = postgres/health agregado.

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
