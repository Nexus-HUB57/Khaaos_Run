# E2E Phases 9-12 — Khaaos Run Console Quality

## Phase 9: AI/Bot System
- **KhaaosBotBehaviorTree** (`.h/.cpp`) — Advanced bot AI with 5 difficulty tiers (Recruit→Mythic) + Adaptive mode, 6 tactical roles (Assault/Sniper/Support/Flanker/Defender/Scout), behavior tree with blackboard, squad coordination, perception (sight 3km + hearing 2km), zone awareness, adaptive AI scaling by player K/D
- **KhaaosBotSpawner** (`.h/.cpp`) — Dynamic bot population manager, difficulty ramping with match phase (Recruit early → Mythic endgame), species distribution (balanced 6 species), squad formation, horde mode (wave-based spawning), role distribution (40% Assault, 20% Sniper, etc.), max 50 bots

## Phase 10: LiveOps & Analytics
- **KhaaosTelemetryPipeline** (`.h/.cpp`) — Server telemetry with 12 event types, batch flush (100 events / 5s), rate limit (1000/s), local buffer (10K), sampling (100% critical, 10% verbose), A/B experiment tagging, gzip compression
- **KhaaosHotFixSystem** (`.h/.cpp`) — Live ops hot-fix with 7 types (ConfigOverride, FeatureFlag, EconomyTweak, BalanceTweak, MOTD, EventSchedule, MaintenanceMode), version gating, auto-expiry, rollback, 60s pull interval

## Phase 11: Social & Progression
- **KhaaosSocialSystem** (`.h/.cpp`) — Friends list (200 max, EOS Friends API), clans (50-member guilds with tag/XP), party (1-4 group), recent players, block list, cross-platform friends
- **KhaaosProgressionSystem** (`.h/.cpp`) — Battle pass (100 tiers, free + premium tracks, 500 XP/tier), achievements (50+, 6 categories, KRC rewards), daily quests (3/day, midnight UTC refresh, XP + KRC rewards)

## Phase 12: Polish & Launch Prep
- **KhaaosServerHealthMonitor** (`.h/.cpp`) — Real-time health monitoring, 6 default metrics (FPS, memory, network, economy latency, GC pause, actor count), threshold alerting (Warning/Critical), Prometheus `/metrics` export, auto-scaling triggers
- **KhaaosCrashHandler** (`.h/.cpp`) — Structured crash reports, callstack deduplication (60s window), rate limiting (10/min), graceful shutdown (5-step: save state → notify players → migrate → flush telemetry → close), player migration on server crash

## GameMode Integration
- `InitializePhases9to12Subsystems()` — 1 world subsystem (BotSpawner) + 6 auto-initialized subsystems (TelemetryPipeline, HotFixSystem, SocialSystem, ProgressionSystem, ServerHealthMonitor, CrashHandler)

## Tests
- `KhaaosE2EPhases9to12Spec` — 20 tests covering all Phase 9-12 systems

**Total**: 10 new files + 2 modified files (GameMode.h/.cpp), ~3,500 lines of PhD-level C++
