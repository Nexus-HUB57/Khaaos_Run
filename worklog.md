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
Task ID: Graphics v3
Agent: Main
Task: Pipeline Gráfica v3 — fechar o gap visual vs Free Fire

Work Log:
- Diagnóstico: PostProcessManager usava CVars INEXISTENTES na engine (r.ColorGradingLUT, r.VignetteIntensity, r.UnderwaterDistortion, r.BloomIntensity, r.SceneChromaticAberration) — pós-processamento era cosmético, não real
- Criado KhaaosPostProcessDirector.h/.cpp (WorldSubsystem): FPostProcessSettings REAL em APostProcessVolume unbounded (prioridade 100); assinatura FF = exposição fixa (Min==Max), tonemapper contraste (Slope 0.85/Toe 0.30/Shoulder 0.22), saturação 1.22x + tint quente, bloom threshold 0.85, grain 0, vignette 0.22; 5 moods (PadraoBattle/NoiteNeon/NebulosaAlien/AmanhecerVenenoso/LowEndLeve); overlay tint+vignette por espécie; crossfade via BlendWeight (FTSTicker)
- Criado KhaaosLightingDirector.h/.cpp (WorldSubsystem): rig programático (DirectionalLight+SkyLight+ExponentialHeightFog+SkyAtmosphere) via SpawnActorDeferred; 4 presets (DiaSolarPadrao 12lux@6100K, TardeDourada, NoiteNeon, NebulosaVioleta); auto-mapping por mundo; CVars r.Shadow.CSM.MaxMobileCascades + r.Shadow.DistanceScale; guardas dedicated server/-NullRHI/commandlet
- Criado KhaaosCharacterPopComponent.h/.cpp: rim light Fresnel por espécie (MID params RimLightIntensity/RimLightColor), custom depth stencil (1+espécie), point light de ancoragem (pawn local, cast shadows off, preset>Low), SetRimBoost(0-3) hook p/ skills
- Criado Tests/KhaaosGraphicsV3Spec.cpp: 6 specs de automação (receitas, mapeamento de mundos, presets de luz, rim único por espécie, 7 estágios, WriteRecipeToSettings real)
- Corrigido KhaaosPostProcessManager.cpp: CVars fake → r.SceneColorFringe.Intensity real + delegação ColorGrading/Vignette ao Director
- KhaaosMaterialPipeline.h/.cpp: +RimLightIntensity/RimLightColor no perfil por espécie (6 cores de identidade) + aplicação no ApplyMaterialProfile
- KhaaosGraphicsPipelineManager.h/.cpp: pipeline 5→7 estágios (POST_PROCESS_SETUP, LIGHTING_SETUP) com pre-aquecimento de receita e reaplicação se world existe
- KhaaosGraphicsPresetSubsystem.cpp: +r.Tonemapper.Sharpen por tier (0.35-0.7), +r.ScreenPercentage 100 baseline, +r.TSR.History.SampleCount (4 High+/2 low)
- KhaaosCharacter.h/.cpp: +CharacterPopComp (CreateDefaultSubobject) + InitializePop no ApplySpecies (FName→EKhaaosSpecies) + accessor GetCharacterPopComponent()
- Validado: scripts/validate_uht.py 298/298 PASSED; balanceamento de chaves OK em 15 arquivos

Stage Summary:
- Pós-processamento REAL (FPostProcessSettings) substitui CVars fake — maior causa do gap visual
- Rig de iluminação completo por mundo — sol/ambient/névoa/atmosfera estilo FF
- Personagens com identidade visual por espécie (rim light) — "pop" de gameplay
- Sharpen + TSR tuning mobile — nitidez característica do FF
- Integração: 7 estágios no PipelineManager, aplicação automática no OnWorldBeginPlay
- Próximo passo: compile na GPU runner + validação visual com screenshot em staging

---
Task ID: Graphics v6 — Assets LUT + PostProcess no Content Browser
Agent: Main
Data: 2026-10-29

Work Log:
- KhaaosLUTTextureFactory.cpp: patch WITH_EDITORONLY_DATA — pixels espelhados no Source (GetMip(0)) — sem isso assets LUT salvos perderiam pixels ao re-cozinhar
- Criado KhaaosLUTMaterialBuilderCommandlet.h/.cpp (KhaaosRunEditor): gera programaticamente no Content Browser
  - 5 texturas LUT persistentes /Game/Graphics/LUTs/T_KhaaosLUT_{PadraoBattle,NoiteNeon,NebulosaAlien,AmanhecerVenenoso,LowEndLeve} — duplicate do transient do factory, CompressionNone, TMGS_NoMipmaps, SRGB=false, LODGroup ColorLookupTable, FSavePackageArgs
  - Material /Game/Graphics/Materials/M_KhaaosColorGradeLUT — MD_PostProcess (Unlit), BlendableLocation AfterTonemapping, grafo de ~35 nós: SceneTexture(PPI_PostProcessInput0) → ComponentMask → Saturate → UV strip math (U=(floor(B*q)*Size+R*q+0.5)/Size², V=(G*q+0.5)/Size) → TextureSampleParameter2D "LUTTexture" → Lerp LUTBlend → Desat+Lerp AdditionalSaturation → Multiply AdditionalTint → debug split-screen (ScreenPosition+If, esquerda=raw/direita=graded) → EmissiveColor
  - 6 parâmetros idênticos aos que o runtime (KhaaosPostProcessLUTMaterial) define nos MIDs
- KhaaosRunEditor.Build.cs: +AssetRegistry, +AssetTools
- ue5-headless-compile.yml: FIX de label divergente (runs-on [self-hosted,gpu] vs script que registrava [self-hosted,linux,ue5.8,x64] — job nunca rodaria) → unificado em [self-hosted, linux, gpu, ue5.8, x64]; novo step "Generate LUT + PostProcess Material Assets" (-run=KhaaosLUTMaterialBuilder); artifacts incluem Content/Graphics/{LUTs,Materials}
- setup-gpu-runner.sh: RUNNER_LABELS default alinhado + doc do helper
- scripts/register-gpu-runner-token.sh (novo): gera RUNNER_REGISTRATION_TOKEN via API GitHub (POST /repos/{repo}/actions/runners/registration-token), usa GH_TOKEN ou PAT do remote; --list, --token-file (perms 600), nunca ecoa o token; token validado HTTP 201 contra Nexus-HUB57/Khaaos_Run
- package.json: script canônico "test" = guard:tests && test:official (npm test agora é o entrypoint anti-reversão)
- Testes de contrato: tests/official/lut-material-contract.test.ts (10 specs: domínio/blendable, cadeia do grafo, 6 parâmetros idênticos runtime↔commandlet, path único, 5 LUTs, Source mirror, Build.cs, step CI) + gpu-runner-labels.test.ts (4 specs: labels workflow↔script com deepEqual, essenciais, anti-vazamento de token, encadeamento)
- Validado: validate_uht.py 298/298 no módulo game; Phase 1 limpa nos novos headers (fases 3-5 falham igual com arquivos antigos do HEAD — limitação pré-existente de paths fixos); npm test = 453 testes, 0 falhas (414 TS + 39 JS, 8 skipped por design)

Stage Summary:
- Material M_KhaaosColorGradeLUT agora EXISTE: gerado pelo builder em vez de depender de montagem manual no editor; runtime carrega o asset real e só usa ColorGradingLUT nativo como fallback
- Pipeline de assets LUT reproduzível em CI (headless) e no editor (1 commandlet)
- GPU runner: labels workflow↔runner consistentes + registro em 1 comando via API (sem Settings UI)
- Próximo passo: registrar o runner na VM GPU (bash scripts/register-gpu-runner-token.sh com GH_TOKEN) e rodar o workflow ue5-headless-compile para compilar + gerar os assets

---
Task ID: Economy 2PC Server — PGlite + build limpo
Agent: Main
Data: 2026-10-29

Work Log:
- economy-server: vitest subia a árvore e carregava o vitest.config.ts da RAIZ (vitest proibido pelo guard e ausente lá) → ERR_MODULE_NOT_FOUND. Criado economy-server/vitest.config.ts local (root ancorado, env DATABASE_URL=pglite:memory)
- src/db/index.ts: suporte a PGlite (Postgres WASM em-processo) via DATABASE_URL=pglite: — createRequire(cwd) (compatível com build tsc NodeNext→CJS, sem import.meta); prod continua postgres.js/TCP sem carregar PGlite
- src/db/ddl.ts (novo): DDL espelho de schema.ts (3 tabelas 2PC) aplicado no beforeAll da suíte
- src/__tests__/2pc.integration.test.ts: beforeAll aplica DDL no PGlite
- src/routes/2pc.ts: guard de params na rota status/:transactionId (Express 5 types) — consertava erro TS2769 pré-existente que quebrava npm run build
- Fix de comportamento real: rotas commit/abort retornavam 500 em vez de 404 para transação inexistente quando o banco não estava acessível — agora os 404 são verificados contra Postgres REAL embutido (PGlite)
- Validado: npm run build = 0 erros tsc; npm test (economy-server) = 6/6; npm test (raiz) = 453 testes 0 falhas

Stage Summary:
- Suíte 2PC integra contra Postgres real (WASM embutido) — os 404/409/403 não são mais mocks superficiais
- Build tsc do economy-server volta a funcionar (era quebrado antes do guard de rotas)
- Config vitest isolada por pacote — monorepo à prova do guard de testes

---
Task ID: Graphics v7 — Validação visual dos LUTs + correção do runner Linux
Agent: Main
Data: 2026-10-29

Work Log:
- BUG CRÍTICO corrigido no KhaaosRun.uproject: módulo KhaaosRunEditor tinha PlatformAllowList ["Win64","Mac"] — SEM Linux. O runner GPU (Linux) não carregaria NENHUM commandlet do editor (nem o LUTMaterialBuilder): o workflow inteiro de geração de assets estaria morto. Adicionado "Linux" (protegido por contrato no novo teste).
- Criado KhaaosLUTVisualValidatorCommandlet.h/.cpp (KhaaosRunEditor): validação VISUAL dos LUTs com captura PNG headless (sampling 100% CPU, sem RHI):
  - Por mood (5): Strip_<Mood>.png (strip cru Size²×Size), Antes_<Mood>.png / Depois_<Mood>.png (padrão de teste 512×256: hue sweep, saturação quente, rampa de cinza, 16 swatches de gameplay) e Comparacao_<Mood>.png (folha de contato antes/separador/depois)
  - Sampling replica EXATAMENTE a matemática de UV do material M_KhaaosColorGradeLUT: U=(floor(B*q)*Size+R*q+0.5)/Size², V=(G*q+0.5)/Size — o preview prova o que o material vai amostrar
  - Extração de pixels via Source.GetMip(0) (fallback PlatformData) — sobrevive a -NullRHI e re-cozimento
  - Carregamento: asset persistente /Game/Graphics/LUTs/T_KhaaosLUT_* primeiro, fallback transient da factory (GenerateLUTForMood)
  - Relatório lut_visual_report.json com meanDelta255/maxDelta255/pctPixelsChanged por mood (evidência numérica do grading); exit code 0 só se os 5 moods carregarem+salvarem
- ue5-headless-compile.yml: novo step "Validate LUTs Visually (PNG captures + report)" (-run=KhaaosLUTVisualValidator, roda DEPOIS do builder) + artifact lut-visual-validation-<sha> (Saved/LUTValidation/**, 30 dias, if-no-files-found warn)
- Teste de contrato tests/official/lut-visual-validation.test.ts (9 specs): herança UCommandlet, 5 assets + fallback, Source-based extraction, paridade sampling×material, 4 capturas PNG via ImageWrapper, chaves do JSON, ordem builder→validador no CI, artifact com retenção, Linux no PlatformAllowList do editor
- Validado: validate_uht.py 298/298; contratos LUT/runner 22/22; economy-server npm install && npm test = 6/6 (2PC contra PGlite real); npm test raiz = 470 testes 0 falhas (8 skipped por design); bash -n OK em register-gpu-runner-token.sh e setup-gpu-runner.sh; JSON do .uproject e YAML do workflow válidos

Stage Summary:
- Validação visual dos LUTs agora é AUTOMÁTICA: após a 1ª compilação no runner GPU, as capturas Strip/Antes/Depois/Comparacao por mood saem no artifact do CI para inspeção humana
- Runner GPU: registro em 1 comando (GH_TOKEN=<PAT> bash scripts/register-gpu-runner-token.sh) — token gerado via API, nunca impresso; --list para conferir no repo settings
- Correção do .uproject destrava o pipeline de assets no Linux — sem ela nem o builder rodaria no runner
- Próximo passo: registrar runner na VM GPU, disparar o workflow e conferir as capturas no artifact lut-visual-validation

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

---
Task ID: 13
Agent: Main
Task: Fase 30 — morte AMBIENTAL canônica (anomalia Khaaos sai pelo #finalizeDeath nas 2 trilhas) + verificação pós-Fase 26 (PR #205)

Work Log:
- Estado de entrada verificado: PR #205 (Fase 26 — janelas destrutíveis + HUD de HP da porta + metal no depot) JÁ MERGEADA no main (bb001b3); baseline local 780 testes — 767 pass/0 fail/13 skip; _p0view.html já removida; calibração de portas/janelas PINADA por testes (madeira 200 / metal 500 hp, g19 racha o vidro 30hp, melee 1 golpe — doors.test + interiors-windows.test); loot no mezanino + id canônico loot-i* já resolvidos na Fase 25/26
- WART registrado no worklog (Task 12) REPARADO: morte pela anomalia quântica saía por `actor.alive = false` SECO — sem killfeed, sem caixa de morte (Fase 28), sem XP/KRC e sem 'eliminated' (a vítima humana NUNCA entrava em espectador no offline)
- sim3d.js #drainQuantumShield: drain letal agora sai pelo MESMO #finalizeDeath das outras mortes — espólio onde caiu, 'eliminated' com colocação, kill/XP/KRC via lastHitBy (mesma regra das mortes por RING/ácido/tsunami), botKill fallback; anomalia mantém a decisão da Fase 29: fura escudo/blindagem e mata DIRETO (sem DBNO) — caído dentro do campo é finalizado
- room3d.js #drainQuantumShield: mesma rota para #finalizeDeath(actor, null, 'quantum') — paridade 1:1 com a trilha offline; rótulo ambiental 'ANOMALIA' assume lugar ao lado de RING/CIGKV no killfeed E no by do 'eliminated'; espelho de DAMAGE kind 'quantum' da Fase 29 intocado
- Testes: test/environmental-death.test.js (8 NOVOS — killfeed ANOMALIA, crédito via lastHitBy com kill+xp/krc+kills, vítima humana recebe eliminated by ANOMALIA com colocação, caído finalizado no campo, offline: espólio na posição + botKill, crédito ao jogador, eliminated do player com colocação #2, blindagem absorve/âncora protege — sem morte espúria; eventos FLAT nas duas trilhas { type, ...payload })
- Pipeline: branch feat/game3d-fase30-morte-ambiental-canonica → PR → CI → merge → main re-verificada

Stage Summary:
- A anomalia Khaaos agora CONTA A HISTÓRIA da morte: killfeed (ANOMALIA ou último atirador), espólio no campo, XP/KRC creditado e vítima humana entrando em espectador — nas duas trilhas, pelo mesmo funil
- Zero mudança de balística/netcode/física; contrato de spectador da Fase 29 preservado (número de dano ambiental segue igual)
- Suite: 788 testes — 775 pass / 0 fail / 13 skipped; tsc 0; vite build OK (versão 0.22.0)

---
Task ID: 14
Agent: Main
Task: Fase 31 — janelas conscientes (LOS pelo vão + bots estilhaçam e atiram pelo vidro + HUD ao mirar) + PRs legadas #181/#210 resolvidas e mergeadas + infra UE5.8/EAC (credencial alternativa + diagnóstico)

Work Log:
- GAP DESCOBERTO EMPIRICAMENTE (sonda headless): a F24 cortou a parede e a F26 deixou o vidro transparente p/ visão, MAS o olho da LOS a 1,5 m batia na parede SOB o vão (sill 1,55) e o focinho a 1,42 m nunca cruzava a banda — bots NUNCA engajavam por janelas (windowHit 0, hurt 0, bot driftava p/ hunt). Testes da F26 não pegaram porque empurravam balas MANUALMENTE na banda (y = (y0+y1)/2), bypassando a geometria do atirador
- F31 (PR #211 MERGEADA, b62d31b): (1) #hasLos eye 1,5 → 1,6 nas DUAS trilhas — ator de pé enxerga pelo vão (agachado segue escondido: peitoril continua cobertura); (2) windowPaneOnSegment PURA (exportada do sim3d, consumida pelo room3d) — o painel define a ABERTURA mesmo destruído (fresta útil), íntegro é também alvo balístico; (3) bots: LATCH de aproximação até a posição de TIRO no vão (2,4 m do vidro no eixo do painel — solta por timeout 6 s/painel sumido/alvo trocado) + PLANTADO (run 0) atirando NA ALTURA DO OLHO (raio plano ~1,6 m — única geometria que cruza a parede DENTRO da banda): vidro íntegro racha/estilhaça (bala consumida — impact glass), destruído a bala SEGUE e fere o alvo exposto (só a cabeça fica acima do peitoril); (4) HUD (main3d): barra de HP da JANELA AO MIRAR — raio da crosshair × painéis íntegros até 45 m, espelhando o painel da porta (F26); proximidade vence, vidro destruído não tem barra
- Loop completo validado por sonda: bot vê → engaja → caminha ao vão → planta a 2,0 m → estilhaça o vidro → 4 hits → ELIMINA o alvo pela janela
- Testes: test/windows-fase31.test.js (6 — pure olho/baixo, abertura persiste + hp/max HUD, engajar pelo vão, racha→estilhaça→fere com ordem canônica de eventos [impact glass é o evento de BALA; windowHit é melee], paridade room3d do loop completo, regressão de intransponibilidade do peitoril). Suíte: 805 pass / 0 fail / 13 skip; vite build ✓
- PR #210 (entrega DUPLICADA F22/23 — o main recebeu o mesmo trabalho via #166/#170 e evoluiu até a F31): reconciliada com merge do main mantendo a evolução canônica (11 arquivos conflitados = versões do main), MERGEADA (12d87e2); no caminho, REPARO de detritos de merge no main pós-#208/#209 que a suíte completa pescou: interiors-doors-loot com 'const h = ctl;' (fusão textual h vs ctl → ReferenceError) e asserção de hp SEM material (folhas depot/hangar nascem METÁLICAS 500 hp desde a F26 — canônico é doorHpFor(kind)) — 386bc96
- PR #181 (e2e phases 9-12: gráficos UE5 v3-v7 + economy-server 2PC + GPU runner CI): reconciliada com 2 merges do main — Character.cpp/.h fundidos SEMANTICAMENTE (graphics pop da branch + species runtime do main; LookUp/Landed/TickRegen preservados, duplicatas de Jump/SlideTimeRemaining/TickSlide eliminadas), worklog em união; TRIVY 'new alerts' = CVEs PRÉ-EXISTENTES em lockfiles que a PR NÃO toca (root + scripts/mvp/step3_eos_auth — atribuição errada por diff grande); check 'Staging AO VIVO' reparado: dashboard da PR referenciava 4 séries do economy-server (serviço novo, não implantado) — reconciliado com os nomes canônicos do server autoritativo (khaaos_economy_2pc_requests_total/phase_duration_ms_bucket/errors_total/escrows)
- UE5.8/EAC (PR #212): diagnóstico decisivo — UNREAL_ENGINE_LOGIN (secret novo de 28/10) NÃO autentica no ghcr (smoke run #9 registrou 'denied' em 23:52:27); ue58-container-build.yml agora aceita UNREAL_ENGINE_LOGIN como credencial ALTERNATIVA do UE_CONTAINER_PAT (gate + container.credentials) e o ue58_eac_unblock.mjs distingue ausente × inválido; bloqueadores remanescentes 100% humanos: EAC SDK (dev portal, não-redistribuível), EOS_* 6 secrets (Dev Portal), runner ue5.8 (host machine), credencial ghcr válida da conta Epic-vinculada

Stage Summary:
- Bots agora LUTAM por janelas como no Free Fire: enxergam pelo vão, assumem a posição de tiro, estilhaçam o vidro e pressionam o alvo pelas frestas — nas duas trilhas, com paridade 1:1 e zero mudança de netcode
- O peitoril seguiu COBERTURA: intransponível para atores, invisível para agachados
- HUD fecha a leitura: mirou no vidro, viu a integridade (45 m) antes de estilhaçar
- PRs #210 (duplicata F22/23) e #181 (gráficos UE5 + economy 2PC) mergeadas com reconciliação semântica; main re-verificado
- Infra UE5.8/EAC pronta para destravar no instante em que os valores humanos chegarem — nenhum outro edit necessário

================================================================================
Task: Fase 32 — skins míticas evolutivas PARA O ARSENAL (não só AR-47) + variantes de anexos por raridade (visual gasto→dourado) + grama com LOD de distância

Work Log:
- attachments3d.js: MYTHIC_SKINS — catálogo mítico por arma (AR-47 rosa-caos herdado da F30 + M4 Sentinela de Éter ciano, MP5 Vaga-lume Urbano lima, Barrett Julgamento Orbital violeta, G19 Eco Espectral menta); fit por silhueta (escala/offset do overlay: pistola .55×, sniper 1.6×); mythicSkinFor() PURA; MYTHIC_SKIN vira alias da ar47 (compat F30)
- attachments3d.js: ATTACHMENT_RARITY_TREATMENTS — 5 acabamentos por raridade (COMUM gasto fosco com risco de desgaste, INCOMUM ciano, RARO violeta, LENDARIO ouro fosco, MITICA ouro polido emissivo) + chip de raridade (rarityChip) por anexo; buildAttachmentMesh(id, {rarity}); applyAttachments(id, rarities) com attachmentRarityFor() aceitando mapa/array/string/null (retrocompatível); materiais memoizados POR TIER (zero leak)
- entities3d.js: fábricas passam raridades + cor/fit da skin mítica da arma (mythicSkinFor) ao overlay — applyMythicSkin({color, fit})
- sim3d.js: mítica GENERALIZADA (mythicStage = rarity MITICA && mythicSkinFor(id)) em players/bots/oficiais; attachmentRarities + attachmentBagRarities paralelos em pickup/troca/bolso/caixa de morte; kit de arma MÍTICA nasce dourado (anexos herdam a raridade); anexo avulso rola raridade própria (rollLoot)
- gear3d.js: deathBoxContents preserva attachmentRarities (matou, herdou TUDO)
- main3d.js: rig do player/bots com raridades + mythicColor por arma; toast do evento mythic com o NOME da skin; tick do LOD da grama (update da câmera 1×/frame)
- hud3d.js: badge mítico em TODO o arsenal com cor da aura; faixa de anexos com chip de raridade (borda/brilho na cor do tier + tooltip)
- vegetation3d.js: grassChunkify (chunks 25m, PURO) + grassChunkTier (full <28m / sparse 28-58m fração .4 / hidden ≥58m) + buildGrassFieldLOD (1 InstancedMesh por chunk, tint por instância, vento por shader, update O(chunks) só troca visible/count); world3d planta via LOD e registra scene.userData.grassLOD
- Testes: +11 F32 (catálogo mítico, fit/aura por arma, raridade gasto→dourado com chip, attachmentRarityFor, applyAttachments com raridades, sim mítica da M4 evolui, ciclo bolso/troca/caixa preserva raridades, loot com raridade; chunkify/tier/LOD headless + buildScene W1-W4)
- Evidências: artifacts/f32-*.png (vitrine dev scripts/f32-showcase.html + partida real ?scenario=Arukheea&view=tps com queda/pouso/HUD)

Stage Summary:
- As 4 armas com sockets (M4/MP5/Barrett/G19) agora têm skin mítica EVOLUTIVA com identidade própria — mesma régua de 4 estágios por abates da AR-47
- Anexos nascem com RARIDADE visível (gasto→dourado + chip) que sobrevive a troca de arma, bolso e caixa de morte — grind de coleta FF completo
- Grama com LOD de distância em chunks: densa perto, rarefeita no meio, invisível longe — ~95% dos chunks ocultos na origem (189 → ~10 draw calls de grama)
- Suite: 824 testes — 811 pass / 0 fail / 13 skipped; vite build OK

================================================================================
Task: Fase 32 — VALIDAÇÃO END TO END (sessão de verificação, browser real)

Work Log:
- Suíte completa re-executada: 824 testes — 811 pass / 0 fail / 13 skip; vite build OK (2.35 s)
- ?scenario=w4&view=tps ao vivo (Arukheea, seed CIGKV-3D-01): boot sem erros de página; modal ZU-01 → "SALTAR NO CAOS" → queda (sky→chute) → pouso; HUD/rádio/ring/minimapa operantes
- Farol girando CONFIRMADO por medição: Δrotation.z/ΔanimT = 0.38 rad/s (exato = registro do spinner em districts3d.js). Causa-raiz esclarecida para leituras por tempo de parede: headless estrangula rAF (~1 fps) e o loop clampa dt em 0.1 s — por tempo de JOGO a rotação é 1:1 com o canônico. Evidência: f32-validate-w4-tps-farol.png
- Grama LOD CONFIRMADA ao vivo: 80 chunks; 8 visíveis na origem (2 full + 6 sparse, 26 instâncias) → câmera +200 m: 3 → volta: 8 (só visible/count trocados). Evidência: f32-validate-grama-lod-close.png
- Vitrine /scripts/f32-showcase.html ao vivo com módulos REAIS: 5 auras míticas (rosa/ciano/lima/violeta/menta) + chips de raridade gasto→dourado. Evidências: f32-validate-showcase-live.png, f32-validate-skins-miticas-close.png, f32-validate-anexos-raridade-close.png, f32-validate-anexos-fileira.png
- Doc FASE32_SKINS_MITICAS_ANEXOS_RARIDADE_GRAMA_LOD.md: seção "Validação end to end" adicionada com método e números

Stage Summary:
- Fase 32 VERIFICADA end to end: implementação + testes + build + browser real com evidências — nada pendente na diretiva (skins míticas do arsenal, anexos por raridade, grama com LOD)
- Nota de instrumentação registrada: distância/custo de render da grama e rotação do farol devem ser medidos por animT (tempo de jogo), não por tempo de parede, em ambientes headless

---
Task ID: 15
Agent: Main
Task: Fase 32 — Distance Matching + Motion Warping + Air Pose + Pé-Pivô (kernel de locomoção natural, continuação do anti-robotização M5)

Work Log:
- Estado de entrada: PR #215 (wiring automatizado dos assets NL — script do Editor + §7 da doc) mergeado em f4dfba6; main 22/22 workflows success; bateria local 805 game-runtime + 430/39 official + 49 checks natloco + 312 UHT verde
- GAP: o Vault existia como estado FÍSICO (EMovementState) mas não havia distance matching, warping, blend de pose aérea nem escolha de pé-pivô — stops derrapavam no idle, saltos tinham pose única congelada, turn-in-place girava sem plantar o pé (última fronteira do "movimento robotizado")
- KhaaosLocomotionCore (kernel puro, zero deps UE): (1) PredictStopDistanceCm — v²/2a sobre o braking real do CMC; (2) StopMatchPhase 0→1 pela distância restante com captura do pico de velocidade na abertura do freio, arrival abaixo de 10 uu/s (limpa o pico → próxima arrancada detectável), fase sempre suavizada (nunca snappa); (3) WarpPhaseForDistance — remapeia fase pela razão de distância, clampada à janela ±35% (sem rubber-band), NaN-safe; (4) ChoosePivotFoot — giro à direita cruza o pé ESQUERDO (human cross-over), histerese de 12°, peso linear até 55°; (5) AirPoseBlend — −1 subindo / 0 ápice / +1 caindo (sinal corrigido empiricamente no teste), saturação a 700 uu/s, decay a 0 no chão
- Componente: amostra VerticalSpeed + BrakingDecelerationWalking do CMC; expõe StopDistanceCm/StopMatchPhase/AirPoseBlend/bPivotFootLeft/PivotWeight; registry de warp targets (SetWarpTarget/ClearWarpTargets/GetWarpTarget) com fase do vault distance-matched (0→1 exatamente na marca) e auto-release pós-chegada; tunables WarpBaseDistanceCm=150 / WarpWindowFrac=0.35
- AnimInstances (Player + Species): novos UPROPERTYs espelhando os 8 outputs (com fallback honesto clamped sem componente — mesmo cálculo v²/2a e sinal correto do air pose)
- BUGS PESCADOS PELO TESTE NOVO antes do push: sinal do air pose invertido (subida dava +1), PeakStopSpeed obsoleto pós-arrival (phase não resetava na arrancada), warp além da janela (clamp final em [0,1] é o contrato correto — teste ajustado)
- Testes: tests/ue5/distance_match_test.cpp (38 checks standalone -Wall -Wextra -Werror -pedantic): cinemática 600→180cm/900→405cm quadrática, fase monótona e reset na arrancada, warp identidade/clamp/determinismo, pivô (direita→esquerdo, histerese, peso linear), air pose (saturação ±1, grounded→0, independência 60 vs 120 Hz), fuzz 600 frames sem NaN; registrado no test_ue5_logic.sh
- Doc: NATURAL_LOCOMOTION.md — camadas 12-15, contrato §4 estendido (8 parâmetros novos), wiring §7.2 linhas 10-13 (distance-matched stop, Blend Poses by AirPoseBlend, turn espelhado por pivô, Motion Warping do vault), validação §7.3 checks 7-8 (parar na marca, vault em 100/150/190 cm)

Stage Summary:
- O ciclo de movimento humano completo agora é modelado no kernel: arrancada com lean, passada sincronizada, PARADA NA MARCA (distance matching), salto com subida/ápice/queda, pouso com absorção, giro plantando o pé-pivô e vault que cobre a distância real
- Zero mudança de física/balística/netcode; tudo em cima do kernel determinístico já testado em CI
- 87 checks standalone de locomoção (49 + 38) pinando o contrato anti-robotização

---
Task ID: 16
Agent: Main
Task: Fase 33 — WART A reparado (contrato de ids do loot na sim = room3d) + fumaça REAL na chaminé do caos + verificação dos itens do menu (FX marcos×mundos e wart B já entregues)

Work Log:
- Estado de entrada re-verificado contra a concorrência: token OK (HTTP 200), main avançou 12d87e2→f4dfba6→f05cdae durante a rodada (PRs #211-#216 de sessões paralelas); rebase do trabalho feito em cima de f05cdae com 1 conflito textual resolvido em #pickup (intenção deles: raridades de anexos; minha: ref de catálogo — SEMANTICAMENTE ortogonais)
- VERIFICAÇÃO DO MENU (sem re-entrega): FX dos marcos × mundos (tsunami/lava) JÁ ENTREGUE na Fase 26 — SurvivalFX abastece registry.applyHazard(kind, boost, surfaceY) a cada frame (maré no anel oceânico, erupção da tocha, pilões, beacons), wired em main3d + spectator3d; morte por anomalia bypassa killfeed (wart B) JÁ REPARADA na Fase 30 (Task 13) — #finalizeDeath(a, null, 'quantum') nas 2 trilhas + test/environmental-death.test.js (re-verificado no main atual, linha 1624 do sim3d)
- WART A (Task 12) REPARADO de verdade: o spread do drop DEPOIS do `id:` vencia o id de instância — 2 drops iguais COLIDIAM no Map do syncLoot (1 mesh p/ 2 instâncias: loot invisível no chão + remoção prematura quando 1 era coletada); e o loot interior (loot-i*/loot-m*, Fase 25/26) mantinha id canônico SEM ref de catálogo → #pickup caía no fallback g19 (arma interior virava pistola!) e inventava chaves de inventário ('loot-i0' no ammo)
- sim3d #spawnLoot: toInstance único p/ GERAL + INTERIOR + MEZANINO — id canônico loot-N/i/m SEMPRE vence o spread; ref de catálogo migra p/ weaponId/ammoId/resourceId/attachmentId; nome de não-arma composto ('5.56 ×20'); campo cru 'weapon' (stats) NÃO serializa — mesmo contrato do room3d (paridade 1:1 das trilhas, snapshot/ws limpo)
- sim3d #pickup: consome a REF com fallback `|| item.id` — bundles crus (deathBox/supplyDrop) e loot sintético de testes continuam no MESMO caminho; regra anti-rebaixamento do #grantBundle intata (g19 22 dmg RECUSA mp5 18, ACEITA m4 31 — provado nos 2 sentidos)
- FUMAÇA REAL (fumaça/fendas do menu): smokecolumn do Barburhen (Industrial + Extração) — a voluta ESTÁTICA (cone 'plume' opacity .3 flutuando) saiu do builder; fumaça agora é REAL via emissor no pool compartilhado da Fase 26 (1 draw call): coluna cinza contínua com deriva térmica + brisa, cresce/clareia ao subir — mesma gramática da fumaça de fogueira/lavapatch; fendas de lava/rifts JÁ tinham partículas desde a F26 (brasas + motos do vazio — re-verificado)
- Concorrência na rodada: sessões paralelas tomaram o nome "Fase 32" (skins míticas + validação browser + Distance Matching UE) — esta entrega renomeada F33 ANTES do PR; stash de sessão anterior (reparo parcial do wart A achado no worktree) adotado, estendido (interior/mezanino + pickup + fumaça) e commitado
- Testes: game-runtime/test/loot-instance-contract.test.js (9 NOVOS — ids loot-N únicos em 8 seeds [regressão da colisão do syncLoot], ref certa por kind e campos irmãos vazios, nome composto, pickup de arma por weaponId [nunca g19], munição na chave do catálogo com teto AMMO_CAP, interior/mezanino no mesmo contrato, bundles nas 2 direções do anti-rebaixamento, drop duplicado coletável de forma independente, snapshot serializável sem stats crus) + district-dressing (plume=0 no grupo + pool vivo com partículas de fumaça após tick; Barburhen saiu da lista "sem fontes")
- Pipeline completo: branch feat/game3d-fase33-loot-instance-contract-fumaca-real → PR #218 → CI 30 checks (25 success/5 skip/0 FAIL) → MERGE (d486429) → main re-verificada pós-merge (26 checks: 21 success/5 skip/0 FAIL)

Stage Summary:
- O loot da sim offline fala o MESMO idioma do servidor: id de instância canônico, referência de catálogo explícita, snapshot limpo — loot duplicado NÃO desaparece mais do chão e arma interior NÃO vira mais g19
- A chaminé do caos fuma de verdade (partículas no pool compartilhado, custo ~0 por frame) — a última fumaça estática da arena saiu
- Menu da rodada FECHADO com verificação honesta: 2 dos 3 itens já estavam entregues por fases anteriores (F26/F30) — re-entrega zero, reparo real no item que faltava
- Suíte final no main: 840 testes — 827 pass / 0 fail / 13 skip; root official 0 fail; tsc 0; vite build ✓

---
Task ID: 15
Agent: Main
Task: Fase 32 — economia de sobrevivência dos bots (coleta de loot + cura + frag/gloo) [numerada 15 pelo caminho próprio; reconciliada com Task 16/F33 no merge — cronologia do merge prevalece]

Work Log:
- GAP DESCOBERTO EMPIRICAMENTE (sonda no código): a F25 fazia a patrulha mirar pontos de loot (34% dos waypoints), MAS a coleta (#interact) só era chamada via input.interact do JOGADOR — bots chegavam ao chão de loot, não pegavam NADA e lutavam com o loadout do spawn até morrer; medkit/frag/gloo do spawn nunca eram usados (#useMedkit/#throwFrag/#deployGloo também eram exclusivos do input do jogador)
- F32 (sim3d.js): BOT_SURVIVAL exportado (sense 9 m, collect 2,6 m = #interact, yBand 2,2 m, lootCd 0,5 s, medkitBelow 45/medkitCd 5 s, frag banda 8-30 m/chance 0,34/cd 9+5 s, glooBelow 60/chance 0,5/cd 14+6 s); #botWantsItem (arma só se UPGRADE de dano — regra do #grantBundle; deathBox/supplyDrop sempre; consumível/frag/gloo com folga de cap; ammo/resource não); #botLootInterest (item vivo mais próximo vale a pena); #botSurvival no step (decrementa cds, coleta por proximidade, cura SEM alvo visível — cura sob fogo continua sendo do jogador —, frag/gloo no engage com rng da seed)
- Atração em patrol/hunt APENAS (engage/resgate não interrompem): hook no #stepBot entre a escolha de tx/tz e o #doorRoute — loot dentro de cascas usa a MESMA rota de portas da F25
- room3d.js: espelho 1:1 (mesmos BOT_SURVIVAL/mesmas regras); #botWantsItem da sala limitado ao que o #pickup local replica (weapon/consumable/armor/frag/gloo — sala não tem anexos/gear/deathBox)
- PARIDADE DE INVENTÁRIO: bots regulares NÃO tinham slots/activeSlot/inventory/weaponAttachments/attachmentBag/attachStats (#pickup lançaria) — #spawnBot ganhou o kit completo (rng order PRESERVADO: consts hoisted na mesma sequência jx,jz,yaw,arma,cooldown); oficiais (#spawnOfficer) também ganharam inventory+slots; raridades de anexos (F32-skins) preservadas no merge
- FIX weaponId: o mesmo gap foi corrigido em paralelo pela F33 (Task 16) com o contrato canônico toInstance() — NELE o merge adota a versão da F33 (superconjunto); o #botWantsItem da F32 já lê weaponId || id, compatível com os DOIS contratos
- Ajuste de teste F27 (damage-numbers): cenário "1 hit nocauteia" precisava zerar o medkit do bot — com a economia nova o bot se CURA no step (comportamento canônico agora); contrato do teste (botKnocked traz victim id) intocado
- Testes: test/bots-survival-fase32.test.js (12 NOVOS — coleta upgrade/anti-rebaixamento/consumíveis, cura fora de combate + NÃO cura com inimigo à vista, frag na banda útil, gloo de defesa, ENGAGE vence loot, paridade room3d coleta+cura, determinismo do spawn preservado, weaponId interior resolvido no catálogo, BOT_SURVIVAL pinado)
- ANOMALIA DE CI registrada: o push original NÃO gerou workflow runs no GitHub (degradação do gatilho — 0 runs em 2 pushes + close/reopen + commit vazio, enquanto main/F33 rodavam minutos antes/depois; mergeable stuck "unknown" 25+ min) — julgamento pela suíte local completa, precedente F30
- RECONCILIAÇÃO com o main (2 merges concorrentes: F32-anim/skins #216 + F33-loot #218): sim3d.js em união semântica (spawn = consts hoisted da F32 + raridades da F32-skins + inventário da F32-economia; loot = toInstance da F33), worklog em união cronológica
- Pipeline: branch feat/game3d-fase32-economia-sobrevivencia → PR #217 → merge → main re-verificada

Stage Summary:
- Bots agora VIVEM a economia do jogo como no Free Fire: desviam da patrulha para saquear, trocam para a arma melhor que acharem, curam fora de combate, arremessam frag na banda útil e armam gloo feridos sob fogo — nas duas trilhas, pelo mesmo #pickup/#useMedkit/#throwFrag/#deployGloo do jogador
- Inventário de bots em paridade com oficiais/jogador (slots/inventory/anexos+raridades) — mortes deles agora carregam espólio completo nas caixas (F28 herda de graça)
- Zero mudança de netcode/balística; eventos reutilizados (loot/medkit/frag) — espectador e HUD não precisam de edits
- Suíte reconciliada: 852 testes — 839 pass / 0 fail / 13 skip; tsc 0; vite build OK

---
Task ID: 17
Agent: Main
Task: Fase 34 — Revisão PhD-level de otimização de cenários/gráficos + experiência do jogador: laço adaptativo de performance (DRS + auto-tier) no cliente 3D web, settings KR_GFX_*, telemetria de FPS

Work Log:
- REVISÃO SISTEMÁTICA (5 módulos gráficos + HUD + bootstrap): quality3d resolvia o tier UMA vez por sessão (nenhuma reação a carga runtime — combate com 24 atores + SSR + partículas + grama colapsava o frametime sem contra-medida); lod3d (histerese + frustum gate), grass LOD chunks (F32) e contact shadows instanciadas avaliados como sólidos (referência de design, intocados)
- ACHADO G2 (bug de custo): initPost() passava quality:'high' HARDCODED ao createPostFX — o tier MEDIUM pagava SSR completo (SSRPass a 72% da resolução) que é exclusivo do high; corrigido via postFxPlanFor(tier) — ÚNICA fonte de verdade do plano de pós-FX (low=null composer, medium=bloom+grade sem SSR, high=completo)
- perf3d.js (PURO, headless): FrametimeMonitor com EMA de constante de TEMPO (α=1−exp(−dt/τ), τ=0.5s — estável igual a 30 e 144 Hz; warmup 30 amostras; descarta dt>0.5s de aba em background); drsDecision (escala 0.55..1.0, descida −12% após hold 0.6s de overload >budget×1.12, subida +5% após folga sustentada 2.5s <budget×0.82, dwells assimétricos 0.9s/2.5s); tierDecision (downgrade high→medium→low SÓ com DRS no PISO e EMA>budget×1.35 por 6s; upgrade exige 20s de folga <budget×0.65 NO TETO; dwell 10s entre trocas — anti ping-pong); RateLimiter; budgetFor (15ms high/medium, 22ms low)
- gfxsettings.js (PURO, padrão KR_AUDIO_*): blob versionado KR_GFX_SETTINGS_V1 {tier auto|low|medium|high, postfx, drs, fps, shake 0..1, sens 0.3..2.5} — sanitização (inválido→default, números clampados), fallback de memória headless, merge parcial
- main3d.js (wiring): updatePerf(dt) no topo do loop; applyRenderScale (pixelRatio base×escala, throttle 150ms, propaga p/ render targets do composer); applyTierRuntime (cap de pixelRatio + shadow map do sol com dispose do alvo antigo + rebuild do composer); sens do mouse × gfx.sens (ADS mantém razão ~0.52×); shake × gfx.shake nos 2 pontos de aplicação; initGfxPanel (padrão initAudioMixer, headless-safe) com commit que cancela auto-tier e aplica override na hora
- hud3d.js: minimapa a 30 Hz via RateLimiter (G4 — canvas 2D full-redraw a 60+ Hz custava real em touch sem ganho perceptível); setPerf(fps, escala, tier) → #perfReadout a 2 Hz
- index.html/styles3d.css: botão ⚙ GFX ao lado do ♪ MIX, painel VÍDEO//PERFORMANCE (QUALIDADE/PÓS-FX/RES. DINÂMICA/TELEMETRIA/TREMOR/SENSIBILIDADE, aria-labels) ao lado do mixer de áudio, #perfReadout fixo canto inferior direito
- EXPERIÊNCIA DO JOGADOR fechada: U1 painel gráfico in-game (antes só ?q= na URL); U2 sensibilidade ajustável (era hardcoded .0021/.0011); U3 movimento reduzido (tremor 0 — acessibilidade); telemetria FPS·RES·tier para diagnóstico
- PARIDADE UE5: mesma filosofia do UKhaaosDynamicResolution (Game/Graphics — speeds assimétricos up 0.1 / down 0.5, budget 16.67ms) agora no cliente web Three.js; docs/gfx-ux-perf.md registra a tabela de parâmetros com justificativas + protocolo de verificação browser-real
- Testes: test/perf3d.test.js (14 — EMA converge/descarta hitches/warmup, DRS hold+piso/teto, simulador de carga 600 frames: converge ≤8 mudanças sob carga 17.5ms, carga leve inerte, stall 96ms inerte com pico EMA <limiar, recuperação ao teto, tier: não desce fora do piso/desce no piso/upgrade anti senoidal/upgrade 20s folga, budgetFor, RateLimiter, postFxPlanFor SSR exclusivo high) + test/gfxsettings.test.js (7 — defaults imutáveis, round-trip, sanitização clamp, blob corrompido, storage quebrado, effectiveBaseTier override)

Stage Summary:
- Cliente 3D web agora TEM laço fechado de performance: mediu (EMA τ=0.5s) → decidiu (DRS histerese assimétrica) → aplicou (pixelRatio/sombras/pós-FX) → subiu de escala estrutural (tier) só quando o DRS esgotou — sem oscilação provada por simulador
- Tier MEDIUM deixou de pagar SSR (G2) — maior ganho de custo por linha trocada
- Jogador ganhou controle completo (painel GFX persistido KR_GFX_*) + acessibilidade (movimento reduzido, sensibilidade) + telemetria
- Suíte game-runtime: 875 testes — 862 pass / 0 fail / 13 skip (23 novos); determinismo da sim intocado (rng/nomeada não tocados)
