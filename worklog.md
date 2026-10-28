# Khaaos_Run Worklog

---
Task ID: 1
Agent: Main
Task: Fix corrupted KhaaosDynamicResolution.cpp

Work Log:
- Identified garbled/corrupted code in KhaaosDynamicResolution.cpp after line 143
- Rewrote entire file with clean C++ implementation
- All method signatures corrected: SetDRSMode, ApplyAdaptiveThresholds, ForceResolutionFraction, ReleaseForcedResolution

Stage Summary:
- KhaaosDynamicResolution.cpp rewritten cleanly (179 lines)
- DRS modes: Off, Conservative (80-100%), Aggressive (50-100%), Adaptive (auto-range)

---
Task ID: 2
Agent: Main
Task: Implement KhaaosSpeciesLODManager — per-species skeletal mesh LOD

Work Log:
- Created KhaaosSpeciesLODManager.h (120 lines) with EKhaaosLODLevel enum (LOD0-LOD4)
- Created KhaaosSpeciesLODManager.cpp (220 lines) with species-specific LOD configs
- Each species has unique LOD distances, screen size thresholds, and disable points
- Skeetw: earliest LOD transitions (feather bone cost high)
- Onith: tail physics reduces at LOD2
- Khael: crystal glow disables at LOD2

Stage Summary:
- 5 LOD levels: LOD0 (full) → LOD4 (significance culled)
- 6 species LOD configs with distance + screen-size thresholds
- Morph targets, emissive, VFX, bone count all reduce per LOD level

---
Task ID: 3
Agent: Main
Task: Implement KhaaosPostProcessManager — species-specific post-process effects

Work Log:
- Created KhaaosPostProcessManager.h (130 lines) with 9 effect types
- Created KhaaosPostProcessManager.cpp (260 lines) with species profiles
- Huran: bloom + underwater distortion + aquatic color grading + vignette
- Khael: intense arcane bloom + chromatic aberration + arcane LUT
- Venex: cyber CA + chrome bloom + cyber LUT + HUD vignette
- Onith: thermal color grading + chitin bloom + thermal shimmer
- Zheers: tattoo bloom + shadow vignette + shadow LUT
- Skeetw: feather bloom + motion blur + wind distortion + iridescence CA
- Budget optimization: cuts low-priority effects when GPU overloaded

Stage Summary:
- 9 post-effect types: Bloom, CA, DoF, Distortion, MotionBlur, ColorGrading, Vignette, ScreenFade, CustomMaterial
- 6 species profiles with fade in/out blending
- GPU budget optimizer (priority-based triage)

---
Task ID: 4
Agent: Main
Task: Implement KhaaosAnimationBlendManager — species-specific physics animation

Work Log:
- Created KhaaosAnimationBlendManager.h (160 lines) with 8 physics anim parts
- Created KhaaosAnimationBlendManager.cpp (250 lines) with spring-damper physics
- Huran: GillPulse (breathing) + Membrane (soft-body)
- Khael: FloatingCrystal (spring orbit, anti-gravity)
- Venex: CyberLimb (procedural twitch)
- Onith: Tail (6-bone chain physics, highest CPU cost ~0.15ms)
- Zheers: EarBounce (subtle spring)
- Skeetw: Wings (symmetric pair, flap physics)
- Gameplay events trigger physics reactions (damage→tail whip, ability→crystal orbit speedup)

Stage Summary:
- 8 physics animation parts: None, Tail, Wings, FloatingCrystal, GillPulse, CyberLimb, EarBounce, Membrane
- Total CPU across all species: ~0.60ms (max single: Onith 0.15ms)
- Spring-damper simulation with rotation constraints per bone

---
Task ID: 5
Agent: Main
Task: Implement KhaaosCosmeticValidator — server-side loadout validation

Work Log:
- Created KhaaosCosmeticValidator.h (110 lines) with 8 validation result types
- Created KhaaosCosmeticValidator.cpp (230 lines) with full validation pipeline
- Validates: ownership, species compatibility, battle pass tier, duplicate items, bans
- Anti-cheat integration: flags players with >10 failures in 300s window
- Species compatibility: SKN_<SPECIES> prefix matching vs universal (ACC_, GLD_, BNR_, WSKN_)
- Battle pass tier: LENDARIO requires tier ≥60 + premium, MITICO requires tier ≥100 + premium

Stage Summary:
- 8 validation results: Valid, NotOwned, SpeciesMismatch, SlotConflict, RarityLocked, DuplicateItem, ExpiredSeasonal, BannedCosmetic
- Anti-cheat rate limiting (10 failures → flag)
- Server-side only — prevents client spoofing

---
Task ID: 6
Agent: Main
Task: Implement KhaaosGraphicsBenchmarkCommandlet — headless CI/CD benchmark

Work Log:
- Created KhaaosGraphicsBenchmarkCommandlet.h (50 lines)
- Created KhaaosGraphicsBenchmarkCommandlet.cpp (270 lines) with 8 benchmark suites
- Benchmarks: GraphicsPresets, SpeciesLOD, PostProcess, MaterialOptimizer, DynamicResolution, CosmeticValidator, CharacterCustomizer, AnimationBlend
- Each benchmark validates enum counts, ranges, and species-specific configs
- Generates PASS/FAIL report for CI/CD gate
- Updated CI workflow: added validate-graphics job with -NullRHI commandlet execution

Stage Summary:
- 8 benchmark suites for headless validation
- CI/CD integration: KhaaosGraphicsBenchmark commandlet in ue5-headless-compile.yml
- Artifact upload: graphics-benchmark-report with 30-day retention

---
Task ID: 9
Agent: Main
Task: Fase 26 — diretor calibrado por métricas reais (margem/pesos) + partículas reais p/ fumaça/fendas + FX dos marcos × mundos

Work Log:
- Calibration: calibrateDirector() pure/deterministic in spectator3d.js — SpectatorRemote heartbeat recalibrates retarget margin + danger weights from REAL broadcast metrics (Fase 24 cuts/escalation/manual/toggles): twitchy→margin up, starved/manual-pressure→down, fatigue→down-weight minor signals, healthy→revert to Fase 19 mean; bands (min/max/step) preserve weight hierarchy; dangerScore accepts ctx.weights; tuning exposed via getMetrics().tuning
- Parity: tuning whitelist in sanitizeDirectorReport (DIRECTOR_WEIGHT_KEYS vocabulary + clamp) in BOTH trails (server/game/SpectatorDataPipeline.ts + game-runtime/server/spectator.js); aggregate last-report-wins (tuning is STATE, not counter); admin.html Command Monitor shows MARGEM DE RECORTE + PESOS rows
- Particles: getSharedParticles + bindParticleTicker idempotent per scene (districts build BEFORE worldmarks in buildScene — creator owns the tick); pool 1024→2048; real emitters for district campfires (smoke+sparks), lavapatches (embers+heat wisp), district void rift (motes), refinetower flare, CKESALTH horizon flare stack (was static cone)
- Landmark FX × worlds: worldMarks registry gains applyHazard(kind, boost, surfaceY) fed by SurvivalFX every frame (boost 0→1 rising, 1 sustained, fade receding, acid=full alert) — Priadus ocean-ring storm surge; Ckesalth torch erupts 3× + emitters fire; Arukheea pylons awaken (rings spin + crystal incandesce + void rifts blaze); CIGKV beacons strobe on acid; Barburhen null (no survival event); pure visual, zero colliders, single draw call
- Tests: director-calibration.test.js (14 new), worldmarks.test.js (+8 Fase 26), survival-fx.test.js (+3), district-dressing.test.js (+4), spectator-director-metrics JS (tuning contract) + TS (11, incl. E2E WS last-wins tuning)
- Pipeline: branch feat/game3d-fase26-diretor-calibrado-fx-marcos → PR #176 → CI 24 success/0 fail (30 checks, 6 conditional skips) → merged 60d9615 → main re-verified (25 success/0 fail + local: 11 TS + 28 JS pass on merged head)

Stage Summary:
- Director closes the perception→action loop: measures its own broadcast behavior and retunes margin/weights live, no redeploy
- Playable-area smoke/crack density (campfires, lava cracks, void rifts) with zero new draw calls
- World landmarks now REACT to their own survival events (tsunami/lava/gravity/acid) — broadcast and offline share the same reaction path via SurvivalFX

---
Task ID: 10
Agent: Main
Task: Fase 27 — números de dano flutuantes (assinatura Free Fire) + conserto do vazamento de hitmarker bot×bot

Work Log:
- New pure module src/game3d/damageNumbers3d.js — DOM pool (ring buffer cap 24), deterministic world→screen projection (projectToScreen, behind-camera/offscreen invisible with 5% margin), age-driven rise (easeOut)+scale pop+fade (no wall clock, no CSS animation), stagger anti-overlap by victim hash (−1|0|1 × 26 px), headless-safe (no document => math continues, DOM skipped)
- Free Fire grammar: body white 19px / HEADSHOT red 24px (dmg-head) / NOCAUTE amber uppercase popup 1.5s (dmg-knock); #damageNumbers layer in index.html (pointer-events none, z-15) + styles in styles3d.css
- Event contract closed BOTH sides with parity: (1) offline sim — bullet 'hit' gains owner: b.owner (FIXES latent bug: hitmarker/audio leaked into bot×bot fights because owner was undefined), #detonate emits 'hit' kind 'explosion' per victim with rounded damage, botKnocked gains victim (id); (2) authoritative server (room3d.js #detonate) — explosion 'hit' delivered ONLY to grenade owner within 110m (band economy; canonical TS trail has no MatchRoom3D twin — no parity work needed)
- Consumption (main3d): number ONLY on own hits (owner === 'player'; online3d.queueEvent already localized owner via own()), explosion shows number WITHOUT hitmarker/hitFlesh (explosion FX/audio already cover it), NOCAUTE popup spawns at last hit position (KNOCK_MEMORY_S 1.2s) on 'botKnocked' (offline) and 'knock' (online, same batch), pool ticked in the render loop with camera, clear() on startMatch
- Tests: test/damage-numbers.test.js (13 — projection, tiers, hash, pool with fake DOM, zero damage rejected, ring buffer, rise+fade+expiry, knock popup memory window + clear, headless-safe, offline sim bullet/frag/knock contracts, room explosion owner-only delivery + bullet contract intact)
- Pipeline: branch feat/game3d-fase27-danos-flutuantes → PR #178 → CI 34 checks (0 fail, só Build Server lento no fim) → merged 8ac3555 → main re-verified (0 fail) e RE-verificada após merge concorrente do PR #179 (head 2035a66: 25 success + 5 skipped + 0 fail)

Stage Summary:
- Combat feedback closes the loop: every own hit now speaks Free Fire language (white/red numbers, knock popup) — zero drift for sims, purely additive event fields
- Latent fix: hitmarker + flesh audio no longer fire for bot-vs-bot hits (owner was undefined)
- 692 tests — 679 pass, 0 fail, 13 skipped (opt-in); vite build OK

---
Task ID: 11
Agent: Main
Task: Fase 28 — números de dano na TRANSMISSÃO (espectador FOLLOW) + números de melee + revisão do ZU pós-derail do PR #179 + automação UE5.8/EAC + P1 Android CLI 100% executável

Work Log:
- Spectator damage numbers: room3d mirrors authoritative damage as DAMAGE events for the /ws/spectator pipeline — dedicated ring of 10 (public ELIMINATION/RING_PHASE never drowned), 150 ms per-victim rate limit (tick-based hazard damage can't flood bandwidth), STRICTLY increasing timestamps (client dedupe key type:timestamp can never collide); spectatorView() interleaves public events + DAMAGE sorted by timestamp. Client: pure specDamageSpawn() — number only in FOLLOW camera and ONLY when it involves the followed player (dealt or received; never a combat radar), hostile input sanitized (finite coords, damage clamped 100k, string ids), NOCAUTE popup via knocked flag, pool ticked in the spectator loop with the player's projection
- Melee numbers: 'melee' event now carries the number contract (x/y/z/victim/owner/damage) in offline sim AND authoritative server (#emitTo to attacker only); online3d.queueEvent localizes owner/victim via own(); main3d answers own hits with FULL feedback — floating number + hitmarker + flesh puff + audio (same grammar as bullet hits)
- ZU post-derail review (PR #179) found and fixed 2 real defects: (a) QTE BYPASS — any non-decision key/touch during the window skipped the whole cinematic → onDone(null) → zero canonical cost ("any key = escape" violated "timeout = fail"); non-decision input now IGNORED during the window (skip restored after decision); (b) INPUT LEAK — QTE keys [1]/[2]/c/e also switched weapon/crouched/interacted in-game; TrainIntro.consumesKey() + keydown guard consume decision keys BEFORE game input; bonus: chooseQTE refuses to overwrite a resolved outcome (late key after timeout can't convert fail→seatbelt)
- UE5.8/EAC automation: bootstrap_ue58_runner.sh now fetches RUNNER_TOKEN via API (RUNNER_PAT → POST actions/runners/registration-token) — runner bootstrap fully automated; NEW scripts/build/ue58_eac_unblock.mjs single-command blocker report (vars/secrets presence, ue5.8-labeled runner online, EAC SDK stub/real, DefaultEOS.ini placeholders, preflight) with the EXACT unlock command per item — verified against the live API: 6 blockers mapped (UE58_ENABLED/UE5_ROOT vars, no ue5.8 runner online, EOS_* secrets, UE_CONTAINER_PAT, EAC SDK download, ini injection)
- P1 Android CLI (Windows-only by design): scripts/windows/install_android_cli.cmd (+ .ps1 fallback without curl) — validates curl.exe/TEMP, unique temp file per run (never stale), empty-download detection, exit code propagation, cleanup, CRLF; invariants pinned by tests
- Tests: spectator-damage-numbers.test.js (7 — pure filter, hostile sanitization, view ingest/drain, ring DAMAGE + rate limit + ordering, melee contract server+offline, ring cap 10 + strictly increasing timestamps), zu-derail-qte.test.js (+4 — consumesKey, non-decision key can't skip QTE, decision keys work via window events, resolved outcome immutable), tests/integration/windows-scripts.test.ts (7 — CRLF, canonical URL, env validations, unique temp, empty download, exit propagation)
- Pipeline: branch feat/game3d-fase28-espectador-melee-zu → PR #182 → CI 37 checks (25 success + 5 skipped + 0 fail) → merged f21bcc2 → main re-verified (30 checks: 25 success + 5 skipped + 0 fail; local on merged head: game-runtime 711 pass / 0 fail / 13 skipped; tsc 0; vite build OK)

Stage Summary:
- The broadcast now TELLS the combat story: followed player's deals and wounds speak Free Fire grammar (white/red numbers + NOCAUTE popup) with zero radar leakage — FOLLOW-only, followed-involved-only, bandwidth-rate-limited
- Melee finally has complete feedback (number + marker + flesh + audio) on both offline and authoritative trails
- ZU derail QTE is now tamper-proof: canonical costs (0/2.5s · 20 VL · 35 VL/3.5s) cannot be bypassed by key spam and can't leak into gameplay input
- UE5.8/EAC unblock is now a single command (ue58_eac_unblock.mjs) with exact remediation per blocker; runner bootstrap needs zero UI steps
- P1 Android CLI delivered as a real, error-proof Windows script pair — the original one-liner was the spec, the .cmd/.ps1 are the product

---
Task ID: 12
Agent: Main
Task: Fase 29 — hazard damage in the SPECTATOR numbers (FOLLOW) + real UE5.8/EAC provisioning (blockers 6→5) + repair of the concurrent-merge debris storm (#185→#200)

Work Log:
- Standard opening: remote token validated (HTTP 200); main 4024a0f green (11 success/4 in_progress); concurrent PRs #183/#184 (Unreal Cloud DDC + Lore Server) already merged
- UE5.8/EAC provisioning EXECUTED: ue58_eac_unblock.mjs ran with PAT — 6 blockers mapped; the ONLY API-automatable one was repo variables → UE58_ENABLED=true + UE5_ROOT=/opt/UnrealEngine CREATED via API (201, re-verified) → re-run shows 6→5 blockers; remaining 5 are genuine human actions (EAC SDK from the Epic dev portal, EOS_*/UE_CONTAINER_PAT values from the portal, self-hosted runner needs a host machine)
- Backlog VERIFIED ALREADY SHIPPED on main: clickable standings (Fase 21 onFollowSelect + clickable CSS) and HUD volume mixing (Fase 19 #audioMixer, 4 KR_AUDIO_* channels, visible in spectator too) — nothing to do
- FASE 29 — hazard damage in the spectator numbers (PR #187 MERGED, 8f47f66): key discovery: the server ALREADY mirrored tsunami/lava/ring/acid as DAMAGE events (single #damage funnel), but the client dropped `kind` — and the KHAOS ANOMALY landed OUTSIDE the funnel (#drainQuantumShield) never reaching the pipeline. (1) room3d: #drainQuantumShield now mirrors the LIFE lost with kind 'quantum' (armor-only drain is NOT a number — life lost is the information; knocked=false, anomaly death bypasses DBNO on this path); melee gets honest kind 'melee' (was `false`); (2) spectator3d: specDamageSpawn propagates sanitized kind (≤24 chars, hostile→null) and derives `hazard` for HAZARD_DAMAGE_KINDS {tsunami,eruption,ring,acid,quantum} — render flag derived CLIENT-side only (server payload never carries it); (3) damageNumbers3d + styles3d: dmg-hazard tier scale 1.2 (body 1.0 < hazard < head 1.45) with PER-HAZARD colors reusing the SAME broadcast banner palette (hz-tsunami #7fd8e8, hz-lava #ff8a4d, hz-gravity #9fe8ff, hz-acid #a8e86a, hz-ring #ff6b2c; unknown → hz-ring fallback); knock > head > hazard > body hierarchy intact; environmental hits feed the NOCAUTE popup memory (tsunami/lava/anomaly eliminations show NOCAUTE where the number landed). Tests 13/13 (+6); suite 730 → 717 pass/0 fail; tsc 0; build ✓; version 0.22.0; PR CI 32 success/5 skip/0 fail
- CONCURRENT MERGE DEBRIS STORM (biggest yet — #185/#189/#190/#192/#194/#195/#196/#197/#200 within ~1h): PR #185 merged WITH conflict debris (its own head had `export const DOOR` duplicated in sim3d → module-level SyntaxError; the branch never ran green and was merged anyway) → main red in cascade. Repair cycle: my PR #190 (DOOR unified as { ...DOOR_MECH, meleeMult: 2.5 }; dead doors init removed from room3d (stale hw/hd/index/active over doorways → NaN colliders); 7 call-sites this.syncPhysicsWorld() → #private (GLOO deploy crashed with TypeError — the public form did not exist); MELEE×DOOR restored on BOTH sides (the block read d.active/d.hw/d.hd which don't exist on doorways — melee could never damage doors again); #stepDoors sweeps in canonical vocabulary; stale grenade×door NaN hunk removed from #detonate; spectator snapshot derives active: !(open||destroyed) (broken panels never disappeared from the broadcast)) merged first-green by owner automation; PR #192 from ANOTHER session reconciled the SAME debris with the OPPOSITE decision (syncPhysicsWorld PUBLIC) → my 2 private call-sites became module SyntaxError AGAIN (#private reference without declaration is a parse error, worse than TypeError — the whole module fails to load); my PR #195 converted the 2 call-sites to the public form (#192's public body is correct: doorBoxCollider leafs) + npm ci for the "Stress all five worlds" job (the sim imports gear3d→three since #189 and the job never installed deps); on rebase, #194/#196 had already converged the call-sites — the PR reduced to the workflow fix; automation merged #195 at a head with 2 remaining test failures (textual debris h vs ctl/panel from fusing both versions); #200 reconciled the tests and main CLOSED GREEN
- FINAL MAIN STATE (bb3d39c): CI 21 success/5 skipped/0 FAIL (stress job green with npm ci); local suite 768 tests — 755 pass/0 fail/13 skipped; Fase 29 intact (HAZARD_DAMAGE_KINDS ×2, 5 hazard CSS classes, quantum ×2, version 0.22.0); critical suites spectator-damage/doors/interiors 48/48 ✓
- LESSONS: (1) a #private reference without a class declaration is a MODULE SyntaxError (not a runtime TypeError) — one orphan call-site kills the entire bundle; (2) the owner merge automation acts on the FIRST green and does not wait for the next push — batch ALL fixes into a single push before opening the PR (the workflow fix got stranded on an already-merged branch); (3) three fronts repairing the same debris in parallel with opposite strategies (private vs public) collide by definition — re-read main at patch time before reconciling someone else's merge; (4) textual merge debris in TESTS (variable names h/ctl/panel, leaf/panel) produce ReferenceErrors that only surface in the full suite; (5) "Total: 0" check-runs with HTTP 200 (fresh merge commits may legitimately have no checks yet) — distinguish from token expiry via /rate_limit and the PR state

Stage Summary:
- ON MAIN: Fase 29 (hazard damage numbers with per-world identity + environmental NOCAUTE + quantum anomaly in the pipeline) + UE58_ENABLED/UE5_ROOT provisioned (6→5 blockers; remaining 5 = human actions) + full repair of the merge storm (main 100% green end to end: CI 21✓/0✗, 768 tests/0 fail, tsc 0, build ✓)
- Remaining backlog: real smoke/crack particles; landmark FX × worlds (tsunami/lava); sim interior-loot ids lose the loot-i* prefix to the catalog drop id (room3d preserves — cosmetic inconsistency registered); quantum anomaly death bypasses killfeed/finalizeDeath (pre-existing wart, registered)
Task ID: 11
Agent: Main
Task: Fase 28 — números de dano na TRANSMISSÃO (espectador FOLLOW) + números de melee + revisão do ZU pós-derail do PR #179 + automação UE5.8/EAC + P1 Android CLI 100% executável

Work Log:
- Spectator damage numbers: room3d mirrors authoritative damage as DAMAGE events for the /ws/spectator pipeline — dedicated ring of 10 (public ELIMINATION/RING_PHASE never drowned), 150 ms per-victim rate limit (tick-based hazard damage can't flood bandwidth), STRICTLY increasing timestamps (client dedupe key type:timestamp can never collide); spectatorView() interleaves public events + DAMAGE sorted by timestamp. Client: pure specDamageSpawn() — number only in FOLLOW camera and ONLY when it involves the followed player (dealt or received; never a combat radar), hostile input sanitized (finite coords, damage clamped 100k, string ids), NOCAUTE popup via knocked flag, pool ticked in the spectator loop with the player's projection
- Melee numbers: 'melee' event now carries the number contract (x/y/z/victim/owner/damage) in offline sim AND authoritative server (#emitTo to attacker only); online3d.queueEvent localizes owner/victim via own(); main3d answers own hits with FULL feedback — floating number + hitmarker + flesh puff + audio (same grammar as bullet hits)
- ZU post-derail review (PR #179) found and fixed 2 real defects: (a) QTE BYPASS — any non-decision key/touch during the window skipped the whole cinematic → onDone(null) → zero canonical cost ("any key = escape" violated "timeout = fail"); non-decision input now IGNORED during the window (skip restored after decision); (b) INPUT LEAK — QTE keys [1]/[2]/c/e also switched weapon/crouched/interacted in-game; TrainIntro.consumesKey() + keydown guard consume decision keys BEFORE game input; bonus: chooseQTE refuses to overwrite a resolved outcome (late key after timeout can't convert fail→seatbelt)
- UE5.8/EAC automation: bootstrap_ue58_runner.sh now fetches RUNNER_TOKEN via API (RUNNER_PAT → POST actions/runners/registration-token) — runner bootstrap fully automated; NEW scripts/build/ue58_eac_unblock.mjs single-command blocker report (vars/secrets presence, ue5.8-labeled runner online, EAC SDK stub/real, DefaultEOS.ini placeholders, preflight) with the EXACT unlock command per item — verified against the live API: 6 blockers mapped (UE58_ENABLED/UE5_ROOT vars, no ue5.8 runner online, EOS_* secrets, UE_CONTAINER_PAT, EAC SDK download, ini injection)
- P1 Android CLI (Windows-only by design): scripts/windows/install_android_cli.cmd (+ .ps1 fallback without curl) — validates curl.exe/TEMP, unique temp file per run (never stale), empty-download detection, exit code propagation, cleanup, CRLF; invariants pinned by tests
- Tests: spectator-damage-numbers.test.js (7 — pure filter, hostile sanitization, view ingest/drain, ring DAMAGE + rate limit + ordering, melee contract server+offline, ring cap 10 + strictly increasing timestamps), zu-derail-qte.test.js (+4 — consumesKey, non-decision key can't skip QTE, decision keys work via window events, resolved outcome immutable), tests/integration/windows-scripts.test.ts (7 — CRLF, canonical URL, env validations, unique temp, empty download, exit propagation)
- Pipeline: branch feat/game3d-fase28-espectador-melee-zu → PR #182 → CI 37 checks (25 success + 5 skipped + 0 fail) → merged f21bcc2 → main re-verified (30 checks: 25 success + 5 skipped + 0 fail; local on merged head: game-runtime 711 pass / 0 fail / 13 skipped; tsc 0; vite build OK)

Stage Summary:
- The broadcast now TELLS the combat story: followed player's deals and wounds speak Free Fire grammar (white/red numbers + NOCAUTE popup) with zero radar leakage — FOLLOW-only, followed-involved-only, bandwidth-rate-limited
- Melee finally has complete feedback (number + marker + flesh + audio) on both offline and authoritative trails
- ZU derail QTE is now tamper-proof: canonical costs (0/2.5s · 20 VL · 35 VL/3.5s) cannot be bypassed by key spam and can't leak into gameplay input
- UE5.8/EAC unblock is now a single command (ue58_eac_unblock.mjs) with exact remediation per blocker; runner bootstrap needs zero UI steps
- P1 Android CLI delivered as a real, error-proof Windows script pair — the original one-liner was the spec, the .cmd/.ps1 are the product

---
Task ID: 11
Agent: Main
Task: Fase 28 — Arsenal & Equipamento FF (AR-47 4 sockets, gear por nível visível, caixa de morte, airdrop) + reparo residual do pipeline de folhas

Work Log:
- Novo módulo PURO headless-safe src/game3d/gear3d.js: buildGearMesh por nível (colete Nv1-4 — placas/gorjo/ombreiras blindadas + LED de equipe; capacete Nv1-3 — boné→casco→assalto com óculos balísticos + NVG; mochila Nv1-3 — assalto→campo→expedição com bedroll/bolsos/faixa), applyOperativeGear IDEMPOTENTE (substitui head-gear base via tag userData.baseHeadGear no Nv2+ e mochila base via userData.basePack), createDeathBox (tampa entreaberta, placa de nome, farol pulsante de time), createSupplyDrop (paraquedas + 4 suspensões + sinalizador vermelho), deathBoxContents (herda arma/munição/consumíveis/gear — determinístico), supplyDropEvent (agendador puro a ~38% da partida com jitter ±10% por seed), GEAR_ARMOR_BONUS/gearFromArmor (placa cerâmica reflete na silhueta)
- shared/weapons.js: AR-47 no catálogo (7.62, 40 balas, sockets declarados), pools de loot com gear por zona + pool exclusivo supplyDrop (AR-47 LENDÁRIO garantido + medkit + placa), rollLoot respeita raridade pré-definida
- entities3d.js: malha da AR-47 (receiver/gas tube/handguard de madeira/coronha esqueleto/mira em torre) com 4 SOCKETS nomeados (muzzle/optic/mag/grip) em userData.sockets; createLootMesh com fábricas dedicadas (deathBox/supplyDrop/gear com feixe por tipo); head-gear e mochila base marcados para substituição
- sim3d.js: actor.gear {vest,helmet,pack} nos 3 spawns (oficiais chegam 2/1/1); #pickup trata helmet/vest/pack (nível nunca desce + bônus de armor + evento 'gear'), deathBox (bundle pelo mesmo caminho de coleta) e supplyDrop (pool exclusivo); #dropDeathBox nas 3 trilhas de morte final; agendador do airdrop no tick com seedHash determinístico; AMMO_CAP 7.62
- main3d.js: 'gear' → applyGearVisuals() com cachê por assinatura (silhueta do jogador e bots espelha a sim); syncLoot assenta caixas/gear no chão e dispara a DESCIDA do airdrop de 34 m (paraquedas encolhe e some no pouso); faróis pulsam; toasts EQUIPAR/ESPÓLIO/LOGÍSTICA
- Reparos residuais do main half-migrated (merges #192/#194/#195/#196/#199): syncPhysicsWorld duplicado/privado (SyntaxError derrubava módulos inteiros) unificado público; decay do cooldown de toggle das folhas restaurado; main3d.syncDoors deriva handle.pivot (painel quebrado voltou a sumir); varredura defensiva de folhas com hp esgotado (doorDown + collider fora); doorPanels como alias getter do registry; testes alinhados ao contrato canônico (structIndex, sectorId, kind 'wood', folha 5 peças)
- Testes: test/gear3d.test.js (16 — catálogo/sockets, pools/raridade pré-definida, gearFromArmor, malhas monotônicas, idempotência/substituição de base, caixa determinística, conteúdo herdado, agendador único/determinístico, airdrop coletável com AR-47 lendário, placa→colete Nv4, seedHash)
- Pipeline: branch feat/game3d-fase28-arsenal-equipamento-ff → PR #189 (obsoleta por merges paralelos) → PR #197/#200 → CI 12/12 success (incl. UE5.8 Release CI/CD — credenciais do container ativas) → merged bb3d39c → main re-verificada (11 workflows success + local: 768 testes — 755 pass, 0 fail, 13 skipped; tsc OK; vite build OK)

Stage Summary:
- O loot agora muda o CORPO (silhueta por nível de capacete/colete/mochila) — identidade instantânea à distância, gramática Free Fire
- Espólio vira mecânica: matou, herdou (caixa de morte com farol + bundle)
- Airdrop com AR-47 lendário cria pico de rota no meio da partida (determinístico por seed)
- Zero mudança de física/balística/netcode; custo por frame ~0 (cachê por assinatura)
