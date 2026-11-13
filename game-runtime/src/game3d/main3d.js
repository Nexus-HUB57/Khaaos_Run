// Khaaos Run — Cliente 3D (TPS Battle Royale // FreeFire-style)
// Renderizador Three.js sobre a simulação determinística KhaaosSim3D.
// Controles: WASD + mouse (pointer lock), RMB mira, Shift corre, Espaço salta,
// C agacha (toggle), R recarrega, E coleta, Q habilidade local, H medkit, G granada,
// F gloo, 1..2 slots. Espectador: ←/→ trocam operative acompanhado. Touch: joystick + botões.
import * as THREE from 'three';
import { KhaaosSim3D, WEAPONS3D, DEFAULT_INPUT, WORLD, GLOO, DBNO, DOOR, WINDOW, ZEX_CHANNEL_SECONDS, EXTRACT_XP, doorHpFor, windowPaneOnSegment } from './sim3d.js';
import { doorMaterialOf } from './interiorsPlan.js'; // Fase 26 — material (metal/wood) p/ áudio por kind da estrutura
import { buildScene, createRingWall, applyGltfProps, applyNightness, tickVegetationWind } from './world3d.js';
import { nightnessFor } from './skyPhase.js';
import { createOperative, createFirstPersonRig, createWeaponModel, animateOperative, attachWeapon, createLootMesh, createParachute, createFragMesh, createGlooMesh, poseFirstPersonHands, SKIN_TONES, VEST_COLORS_FALLBACK } from './entities3d.js';
import { resolveViewMode, VIEW_STORAGE_KEY } from './viewmode.js';
import { newGait, advanceGait } from './gait.js'; // Fase 42 — passada travada em distância
import { applyOperativeGear } from './gear3d.js'; // Fase 28 — equipamento vira silhueta
import { AVATAR_GLB_LIBRARY, avatarById, loadAvatarGlb, normalizeAvatarScale, fitAvatarToGround } from './avatars3d.js'; // Fase 56 — avatares GLB (rigs reais Tripo)
import { resolveGameplayAvatar, LEGACY_BODY_IDS, createHumanoidBody, attachHumanoidToOperative, animateHumanoid, weldWeaponToHand, syncHumanoidGear, poseLeftHandSupport, poseWeaponReady } from './humanoid3d.js'; // Fase 57 + Task 64 — corpo real, gear nos bones, empunhadura 2 mãos
import { tickMythicWeapons, unregisterMythic, MYTHIC_SKIN, MYTHIC_SKINS, mythicSkinFor } from './attachments3d.js'; // Fase 30/32 — anexos + míticas por arma
import { createCharacterLOD, buildOperativeProxy, buildOperativeSilhouette, createFrustumGate } from './lod3d.js';
import { deathFall } from './entities3d.js';
import { Effects } from './effects3d.js';
import { GameAudio } from './audio3d.js';
import { loadAudioMix, saveAudioMix } from './audiomix.js'; // Fase 19 — mixagem KR_AUDIO_*
import { FrametimeMonitor, drsDecision, tierDecision, budgetFor, RateLimiter, DRS_MIN, DRS_MAX, postFxPlanFor } from './perf3d.js'; // Fase 35 — DRS + auto-tier
import { loadGfxSettings, saveGfxSettings, effectiveBaseTier } from './gfxsettings.js'; // Fase 35 — settings KR_GFX_*
import { HUD } from './hud3d.js';
import { createPostFX } from './postfx3d.js';
import { resolveQuality, qualityTier } from './quality3d.js';
import operativeCatalog from '../../../Content/Avatars/avatar_catalog.json';
import { officerCatalogEntries } from './officers.js';
import { SCENARIOS, resolveScenario } from './scenarios.js';
import { getOperativeAbility } from './operativeAbilities.js';
import { TrainIntro } from './trainIntro.js';
// Task 53 — TREM OFICIAL DO ZU: viagem a bordo + SSOT do protocolo (fases/grace)
import { TrainRide } from './trainRide3d.js';
import { zuTrainPhase, trainRoute, seedHashOf } from '../shared/zuTrain.js';
import { buildWorldLayout as getWorldLayoutForTrain } from './layout3d.js';
import { SurvivalFX } from './survivalfx3d.js';
import { DeathDecalSystem } from './decals3d.js'; // Fase 20 — decal de morte direcional (LOD/decals)
import { DamageNumbers3D } from './damageNumbers3d.js'; // Fase 27 — números de dano flutuantes
import { TACTICAL_HOTKEY } from './tacticalmap3d.js'; // Fase 40 — hotkey do mapa tático (fonte única)
import { SeededRng } from '../shared/rng.js'; // Fase 18 — rng determinístico do FX de combate
import { refreshPojStrip, refreshPatenteChip } from './pojstrip.js'; // Fase 9 (fix) — painel POJ também no modo local
import './styles3d.css';

const SIM_DT = 1 / 30;
const VEST_COLORS = VEST_COLORS_FALLBACK;

export class Game3D {
  #selectableOperatives = null; // Fase 11 — catálogo + insígnias OCE (memo)

  constructor(seed, { net = null, scenarioId = 'CIGKV' } = {}) {
    this.seed = seed;
    this.scenario = resolveScenario(scenarioId);
    this.selectedOperative = operativeCatalog[0];
    // Fase 7 — modo squad (DBNO/revive) via ?squad=1; LOD mobile via ?q=low|medium|high
    // Fase 10 — prévia offline dos Oficiais de Classe Especial via ?officers=1
    const urlParams = new URLSearchParams(location.search);
    this.squadMode = urlParams.get('squad') === '1';
    this.officersMode = urlParams.get('officers') === '1';
    // Fase 56 — avatar GLB real no corpo do herói (?avatar=<id> da biblioteca).
    // Contrato do pipeline: QUALQUER falha de carga mantém o corpo procedural.
    this.avatarOverrideId = avatarById(urlParams.get('avatar') ?? '')?.id ?? null;
    // Fase 57 — corpo humano realista como PADRÃO (jogador + bots + remotos).
    // ?avatar=legacy|off|0|none mantém o corpo procedural antigo (escape hatch);
    // ?avatar=<id do pool> escolhe o rig do herói; sem parâmetro → determinístico.
    this.avatarParam = (urlParams.get('avatar') ?? '').trim();
    this.humanoidDisabled = LEGACY_BODY_IDS.includes(this.avatarParam.toLowerCase());
    this.humanoidPlayer = null;        // corpo GLB do herói (attach assíncrono)
    this.avatarRoot = null;
    this.avatarMixer = null;
    this.avatarShowcase = null;        // vitrine de rigs no menu
    this.avatarShowcaseMixer = null;
    this.quality = resolveQuality({ query: urlParams.get('q'), isTouch: matchMedia('(pointer: coarse)').matches, deviceMemory: navigator.deviceMemory ?? null });
    // Fase 35 — settings gráficas do jogador (KR_GFX_*): override manual de tier
    // vence o auto-detect; DRS/auto-tier assumem a partir do tier base efetivo.
    this.gfx = loadGfxSettings();
    this.quality = effectiveBaseTier(this.quality, this.gfx);
    // Fase 35 — laço de performance: EMA de frametime + estado do DRS/tier
    this.perfMon = new FrametimeMonitor();
    this.drsState = { overloadHold: 0, recoverHold: 0, lastChangeAgo: Infinity };
    this.drsScale = 1;
    this.tierState = { overloadHold: 0, recoverHold: 0, lastChangeAgo: Infinity };
    this.applyThrottle = new RateLimiter(150);   // aplicações de escala ≥150 ms
    this.perfHudThrottle = new RateLimiter(500); // telemetria HUD 2 Hz
    this.basePixelRatio = 1;
    this.sim = new KhaaosSim3D({ seed, botCount: 12, scenarioId: this.scenario.id, spectate: true, squad: this.squadMode, officers: this.officersMode });
    this.audio = new GameAudio();
    // Fase 19 — mixagem persistida (KR_AUDIO_*) aplicada ANTES do primeiro som
    this.audio.setMix(loadAudioMix());
    // Fase 43 — assinatura acústica por mundo (vento, chuva e piso padrão).
    this.audio.setWorldAmbience(this.scenario.id, {
      weather: ['Barburhen', 'Arukheea'].includes(this.scenario.id) ? 'rain' : 'clear',
    });
    this.input = { ...DEFAULT_INPUT, yaw: 0, pitch: 0 };
    this.keys = new Set();
    this.abilityPending = false;
    this.abilityTouchDown = false;
    this.pointerLocked = false;
    this.accumulator = 0;
    this.clock = new THREE.Clock();
    this.animT = 0;
    this.zuOpen = true;
    this.ended = false;
    if (typeof window !== 'undefined') window.__kr = this; // probe de debug/e2e (console)
    // modo online (OnlineGame3D injeta o NetClient3D e substitui this.sim pela view)
    this.net = net;
    this.online = !!net;
    this.pendingSlot = 0;
    this.netAccumulator = 0;
    this.viewMode = resolveViewMode({
      param: new URLSearchParams(location.search).get('view'),
      stored: (() => { try { return localStorage.getItem(VIEW_STORAGE_KEY); } catch { return null; } })(),
      fallback: 'tps', // Task 62 — default: avatar à frente do console
    });
    this.cameraSway = 0;
    // Fase 4 — visual state dos arremessáveis/queda
    this.grenadeMeshes = new Map();   // id → mesh
    this.wallMeshes = new Map();      // id → mesh
    this.wallPositions = new Map();   // Fase 21 — id → última posição conhecida (decal de glooDown)
    this.parachutes = new Map();      // actorId → { chute, group }
    this.doorBrokenFx = new Set();    // Fase 25 — portas já com FX de quebra tocado
    this.shake = 0;                   // tremor de câmera (explosões)
    // Fase 5 — espectador + agachamento
    this.spectating = false;
    this.spectateTarget = null;
    this.placement = null;
    // Fase 10 — reação de impacto: atorId → { angle, power, age }
    this.hitFX = new Map();
    this.deathFX = new Map();   // Fase 12 — queda direcional por ator (ângulo/power capturados no fim)

    this.initRenderer();
    this.initWorld();
    this.initEntities();
    this.initCamera();
    this.initInput();

    this.hud = new HUD({
      sim: this.sim,
      seed,
      onEntry: (entry) => this.startMatch(entry),
      onRestart: (nextSeed) => this.restart(nextSeed),
      onReplayExport: () => this.exportReplay(),
    });
    this.hud.audio = this.audio;
    this.hud.onViewToggle = () => this.toggleView(); // Task 62 — botão ◉ VISTA
    this.hud.setAbility(this.selectedOperative.id, this.online);
    this.hud.setMatchStatus('AGUARDANDO ZU');
    this.hud.feed('Marechal', `Seed ${seed} carregada. Aguardando decisão ZU.`);
    this.initContentSelectors();
    this.initSpectatorUI();
    this.initAudioMixer(); // Fase 19 — painel de mixagem (jogador + espectador)
    this.initGfxPanel(); // Fase 35 — painel de vídeo/performance (KR_GFX_*)
    this.initPojPanel(); // Fase 9 (fix) — painel POJ do modal ZU também no modo local

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------- Fase 9 (fix) — painel POJ do modal ZU no modo LOCAL ----------
  // O regramento é público (/poj/state no mesmo origin) e o painel não pode
  // ficar eternamente em "—" só porque o jogador não entrou em sala online.
  // Em hospedagens estáticas (sem backend) o fetch falha e o painel permanece
  // neutro — o jogo nunca quebra. No modo online o OnlineGame3D mantém o
  // próprio ciclo de 15 s (sem duplicar timers: este método sai cedo lá).
  initPojPanel() {
    if (this.online) return;
    if (!document.querySelector('#pojStrip')) return;
    refreshPojStrip();
    refreshPatenteChip();
    this.pojTimer = setInterval(() => { refreshPojStrip(); refreshPatenteChip(); }, 15000);
  }

  // ---------- Fase 19 — painel de mixagem de volume (KR_AUDIO_*) ----------
  // Painel único (jogador + espectador): 4 sliders → audio.setMix ao vivo +
  // saveAudioMix imediato. Headless-safe: tudo atrás da existência do DOM.
  initAudioMixer() {
    const btn = document.querySelector('#audioBtn');
    const panel = document.querySelector('#audioMixer');
    if (!btn || !panel) return;
    btn.addEventListener('click', () => {
      panel.classList.toggle('hidden');
      this.audio?.ui?.();
    });
    for (const input of panel.querySelectorAll('input[type="range"][data-channel]')) {
      const ch = input.dataset.channel;
      const out = panel.querySelector(`[data-out="${ch}"]`);
      const sync = () => {
        input.value = String(Math.round((this.audio?.mix?.[ch] ?? 1) * 100));
        if (out) out.textContent = `${input.value}%`;
      };
      sync();
      input.addEventListener('input', () => {
        const mix = this.audio?.setMix({ [ch]: Number(input.value) / 100 });
        if (mix) saveAudioMix(mix);
        if (out) out.textContent = `${input.value}%`;
      });
    }
  }

  // ---------- Fase 35 — painel de vídeo/performance (KR_GFX_*) ----------
  // Espelha o painel de áudio: toggle + controles → saveGfxSettings imediato.
  // Trocas que mexem no pipeline (tier/postfx) reconstroem o composer na hora;
  // sens/shake/fps/drs são lidos a cada frame/uso — nada a reaplicar.
  // Headless-safe: tudo atrás da existência do DOM.
  initGfxPanel() {
    const btn = document.querySelector('#gfxBtn');
    const panel = document.querySelector('#gfxPanel');
    if (!btn || !panel) return;
    btn.addEventListener('click', () => {
      panel.classList.toggle('hidden');
      this.audio?.ui?.();
    });
    const tierSel = panel.querySelector('[data-gfx="tier"]');
    const checks = ['postfx', 'drs', 'fps'].map((k) => panel.querySelector(`[data-gfx="${k}"]`));
    const shake = panel.querySelector('[data-gfx="shake"]');
    const sens = panel.querySelector('[data-gfx="sens"]');
    const out = (k) => panel.querySelector(`[data-out="${k}"]`);
    const sync = () => {
      if (tierSel) tierSel.value = this.gfx.tier;
      for (const [i, k] of ['postfx', 'drs', 'fps'].entries()) {
        const c = checks[i];
        if (c) c.checked = !!this.gfx[k];
      }
      if (shake) shake.value = String(Math.round(this.gfx.shake * 100));
      if (sens) sens.value = String(Math.round(this.gfx.sens * 100));
      const so = out('shake'); if (so) so.textContent = `${shake?.value ?? 100}%`;
      const po = out('sens'); if (po) po.textContent = `${sens?.value ?? 100}%`;
    };
    sync();
    const commit = (partial) => {
      this.gfx = saveGfxSettings(partial);
      sync();
      if ('tier' in partial && this.renderer) {
        // override manual: cancela degraus do auto-tier e aplica o tier pedido
        this.tierState = { overloadHold: 0, recoverHold: 0, lastChangeAgo: 0 };
        this.applyTierRuntime(effectiveBaseTier(this.quality, this.gfx));
      }
      if ('postfx' in partial && this.renderer) this.rebuildPost();
      this.audio?.ui?.();
    };
    tierSel?.addEventListener('change', () => commit({ tier: tierSel.value }));
    for (const [i, k] of ['postfx', 'drs', 'fps'].entries()) {
      checks[i]?.addEventListener('change', () => commit({ [k]: checks[i].checked }));
    }
    shake?.addEventListener('input', () => commit({ shake: Number(shake.value) / 100 }));
    sens?.addEventListener('input', () => commit({ sens: Number(sens.value) / 100 }));
  }

  // ---------- infra (protegidos: reusados pelo OnlineGame3D) ----------
  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#arena3d'), antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    // Fase 35 — pixelRatio BASE do tier (cap); a escala DRS multiplicada é
    // aplicada por applyRenderScale() (inicia em 1.0 = comportamento antigo).
    this.basePixelRatio = Math.min(devicePixelRatio, qualityTier(this.quality).pixelRatio);
    this.renderer.setPixelRatio(this.basePixelRatio);
    this.drsScale = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.post?.setSize(innerWidth, innerHeight);
    });
  }

  // pós-processamento Live Action (bloom + grade); ?fx=0 desliga (fallback direto).
  // Fase 35 — o plano vem do TIER real (perf3d.postFxPlanFor): SSR só no high;
  // a setting KR_GFX postfx desliga o composer inteiro (achado G2 corrigido —
  // antes o tier médio pagava SSR completo via quality:'high' hardcoded).
  initPost() {
    const fxOff = new URLSearchParams(location.search).get('fx') === '0';
    if (fxOff || !this.gfx.postfx || !postFxPlanFor(this.quality)) { this.post = null; return; }
    this.post = createPostFX(this.renderer, this.scene, this.camera, { quality: this.quality });
  }

  // Fase 35 — reconstrói o composer pós troca de tier/setting (alvo raro:
  // dwell de 10 s entre tiers; toggle de setting é ação do usuário).
  rebuildPost() {
    const old = this.post;
    this.initPost();
    if (this.post) this.post.setSize(innerWidth, innerHeight);
    old?.composer?.dispose?.();
  }

  // Fase 35 — aplica a escala DRS ao pipeline (throttle 150 ms; muda pixelRatio
  // e propaga p/ os render targets do composer — a UI DOM fica nítida, só o 3D
  // é renderizado na escala reduzida).
  applyRenderScale() {
    if (!this.renderer) return;
    const pr = this.basePixelRatio * this.drsScale;
    if (Math.abs(this.renderer.getPixelRatio() - pr) < 0.01) return;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight);
    this.post?.setSize(innerWidth, innerHeight);
  }

  // Fase 35 — troca ESTRUTURAL de tier em runtime: cap de pixelRatio, resolução
  // do shadow map do sol (dispose do alvo antigo) e plano de pós-FX.
  applyTierRuntime(tier) {
    if (!this.renderer) return;
    this.quality = tier;
    this.basePixelRatio = Math.min(devicePixelRatio, qualityTier(tier).pixelRatio);
    const q = qualityTier(tier);
    if (this.sun) {
      const size = q.shadowMapSize;
      if (this.sun.shadow.mapSize.width !== size) {
        this.sun.shadow.mapSize.set(size, size);
        if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      }
    }
    this.rebuildPost();
    this.applyRenderScale();
    this.hud?.feed('Sistemas', `Perfil gráfico: ${tier.toUpperCase()} (adaptativo).`);
  }

  // Fase 35 — laço de performance por frame: mede dt (custo do frame ANTERIOR),
  // decide DRS e, se o piso não bastou, degrau de tier. Com gfx.drs off, o
  // monitor continua (telemetria), mas nenhuma decisão altera o pipeline.
  updatePerf(dt) {
    const budget = budgetFor(this.quality);
    const ema = this.perfMon.push(dt, budget);
    if (!this.perfMon.warmed) return;
    if (this.gfx.drs) {
      const d = drsDecision({ emaMs: ema, budgetMs: budget, scale: this.drsScale, state: this.drsState, dt });
      this.drsState = d.state;
      this.drsScale = d.scale;
      if (d.changed && this.applyThrottle.ready()) this.applyRenderScale();
    }
    if (this.gfx.tier === 'auto') {
      const t = tierDecision({ emaMs: ema, budgetMs: budget, tier: this.quality, drsScale: this.gfx.drs ? this.drsScale : 1, state: this.tierState, dt });
      this.tierState = t.state;
      if (t.changed) { this.perfMon.reset(); this.applyTierRuntime(t.tier); }
    }
    if (this.gfx.fps && this.perfHudThrottle.ready()) {
      this.hud?.setPerf(this.perfMon.fps(), this.gfx.drs ? this.drsScale : 1, this.quality);
    }
  }

  initWorld() {
    const { scene, sun } = buildScene(this.seed, this.scenario.id, this.renderer, this.quality); // cenário + envmap PBR (renderer)
    this.scene = scene;
    this.sun = sun;
    // F41 — exposição ACES POR CENÁRIO: o perfil de luz (world3d.lightingProfile)
    // traz a exposição do mood de cada mundo (noite gélida 1.12 … deserto 1.30);
    // 1.24 permanece como fallback se o perfil não chegar (cenário sem perfil).
    const lpExposure = scene.userData?.lighting?.exposure;
    if (Number.isFinite(lpExposure) && lpExposure > 0) this.renderer.toneMappingExposure = lpExposure;
    // Task 64 — a parede do anel MATERIALIZA o hazard canônico do cenário
    // (energia CIGKV, chuva ácida W1, esporos W2, fumaça W3, tsunami W4).
    this.ringWall = createRingWall(this.scenario.id);
    scene.add(this.ringWall);
    this.effects = new Effects(scene, {
      // Fase 18 — partículas de combate no pool compartilhado da cena
      // (1 draw call p/ TODO o FX: marcos + sobrevivências + combate).
      particles: scene.userData.particles ?? null,
      rng: new SeededRng(`${this.seed}:effects`),
    });
    // fonte da luz segue o jogador (sombras estáveis)
    this.sun.target = new THREE.Object3D();
    scene.add(this.sun.target);
    // Fase 27 — números de dano flutuantes (assinatura Free Fire): pool de DOM
    // sobre o canvas, mundo-ancorado pela câmera; headless-safe (sem document vira no-op)
    this.damageNumbers = new DamageNumbers3D({ container: typeof document !== 'undefined' ? document.querySelector('#damageNumbers') : null });
    // Fase 7 — props ganham modelos GLTF REAIS quando os assets carregam
    // (fallback procedural permanece se o fetch falhar)
    applyGltfProps(scene);
    // Fase 17 — FX das sobrevivências do mundo (tsunami/lava/gravidade/ácido):
    // consome os eventos da sim/servidor e materializa a regra de dano por altura.
    // Fase 26 — FX dos marcos × mundos: o SurvivalFX abastece os MARCOS com o
    // estado do hazard a cada frame (maré/erupção/despertar/estrobo por mundo)
    this.survivalFX = new SurvivalFX(scene, this.scenario, {
      particles: scene.userData.particles ?? null,
      landmarks: scene.userData.worldMarks ?? null,
    });
    // Fase 20 — decals de morte direcional com LOD (marcas de sangue orientadas
    // longe do atirador; pool com orçamento por tier de qualidade)
    this.deathDecals = new DeathDecalSystem(scene, { tier: this.quality });
  }

  initEntities() {
    // jogador (Fase 7 — variant do operativo define acessórios determinísticos)
    this.playerOp = createOperative({ skin: this.selectedOperative.colors.skinTone, vest: this.selectedOperative.colors.primary, variant: this.selectedOperative.id });
    this.scene.add(this.playerOp.group);
    this.playerOp.group.visible = this.viewMode !== 'fps';
    this.#applyAvatarOverride(); // Fase 56 — corpo GLB real se ?avatar= válido; senão procedural
    this.firstPersonRig = createFirstPersonRig({ skin: this.selectedOperative.colors.skinTone, vest: this.selectedOperative.colors.primary });
    this.firstPersonRig.visible = this.viewMode === 'fps';
    this.playerWeapon = null;
    // bots (no modo online os atores remotos chegam via snapshot)
    // Fase 10 — bots nascem com LOD: modelo detalhado perto, proxy low-poly longe
    this.botOps = new Map();
    if (!this.online) {
      this.sim.bots.forEach((b, i) => {
        const ally = this.sim.squad && b.squad && b.squad === this.sim.player.squad;
        // Fase 10 — oficiais recebem paleta dourada canônica (identidade visual própria)
        // Fase 10 — bots nascem com LOD: modelo detalhado perto, proxy low-poly longe
        const palette = b.officer
          ? { skin: SKIN_TONES[(i * 3 + 1) % SKIN_TONES.length], vest: '#b98a1e' }
          : { skin: SKIN_TONES[(i * 3 + 1) % SKIN_TONES.length], vest: VEST_COLORS[i % VEST_COLORS.length] };
        const op = createCharacterLOD(
          createOperative({ ...palette, variant: b.officer ? 'OCE_OFFICER' : b.id }),
          buildOperativeProxy(palette),
          buildOperativeSilhouette(palette),
          { tier: this.quality }
        );
        this.scene.add(op.group);
        attachWeapon(op.parts, op.group, b.weapon, b.weaponSkin);
        this.botOps.set(b.id, { op, weapon: b.weapon, skin: b.weaponSkin ?? null, name: this.makeNameTag(b.name, i, ally, !!b.officer), ally });
        this.#attachHumanoidForBot(this.botOps.get(b.id), b.op || b.id); // Fase 57 + Task 64 — corpo real com IDENTIDADE: mesmo operativo → mesmo avatar
      });
    }
    // loot
    this.lootMeshes = new Map();
    this.syncLoot(true);
  }

  initContentSelectors() {
    const scenarioSelect = document.querySelector('#scenarioSelect');
    if (scenarioSelect) {
      scenarioSelect.replaceChildren(...Object.values(SCENARIOS).map((scenario) => {
        const option = document.createElement('option');
        option.value = scenario.id.toLowerCase();
        option.textContent = scenario.label;
        return option;
      }));
      scenarioSelect.value = this.scenario.id.toLowerCase();
      scenarioSelect.addEventListener('change', () => {
        const url = new URL(location.href);
        url.searchParams.set('scenario', scenarioSelect.value);
        location.assign(url);
      });
    }
    const scenarioName = document.querySelector('#scenarioName');
    if (scenarioName) scenarioName.textContent = `${this.scenario.shortLabel} // ${this.scenario.mapLabel}`;
    const selectionStatus = document.querySelector('#contentSelectionStatus');
    if (selectionStatus) selectionStatus.textContent = 'Aplicado no modo local. A habilidade individual é acionada com Q; o modo online ainda não a sincroniza.';
    // Fase 56 — vitrine de avatares GLB no menu (rigs reais, animação ao vivo)
    const avatarBarHost = document.querySelector('.content-selection');
    if (avatarBarHost) this.#initAvatarVitrine(avatarBarHost);

    const select = document.querySelector('#operativeSelect');
    if (!select) return;
    // Fase 7 — toggle de squad offline (recarrega com ?squad=1)
    const squadToggle = document.querySelector('#squadToggle');
    if (squadToggle) {
      squadToggle.checked = this.squadMode;
      squadToggle.addEventListener('change', () => {
        const url = new URL(location.href);
        url.searchParams.set('squad', squadToggle.checked ? '1' : '0');
        location.assign(url);
      });
    }
    select.replaceChildren(...this.#operativeOptions());
    select.value = this.selectedOperative.id;
    // Fase 11 (fix) — o rótulo "16 DISPONÍVEIS" era fixo no HTML e ficou
    // desatualizado quando o catálogo cresceu (operativos + insígnias OCE).
    // A contagem real vem das opções recém-montadas — nunca dessincroniza.
    const operativeLabel = document.querySelector('label[for="operativeSelect"]');
    if (operativeLabel && this.#selectableOperatives?.length) {
      const total = this.#selectableOperatives.length;
      operativeLabel.textContent = `OPERATIVO CANÔNICO · ${total} ${total === 1 ? 'DISPONÍVEL' : 'DISPONÍVEIS'}`;
    }
    this.renderOperativeCard(this.selectedOperative);
    select.addEventListener('change', () => {
      if (this.sim.started) return;
      const operative = this.#findSelectable(select.value);
      if (!operative) return;
      this.selectedOperative = operative;
      const isOfficer = Boolean(operative.officerWeapon); // Fase 11 — insígnia OCE
      this.sim.player.operativeId = operative.id;
      if (isOfficer) {
        // offline: a insígnia aplica a carga canônica do OCE (arma/blindagem/velocidade)
        this.sim.player.weapon = operative.officerWeapon;
        this.sim.player.ammoMag = WEAPONS3D[operative.officerWeapon].magazine;
        this.sim.player.armor = operative.officerArmor;
        this.sim.player.speed = operative.officerSpeed;
      }
      this.hud.setAbility(operative.id, this.online);
      this.scene.remove(this.playerOp.group);
      this.playerOp = createOperative(isOfficer
        ? { skin: operative.colors.skinTone, vest: operative.colors.primary, variant: 'OCE_OFFICER' }
        : { skin: operative.colors.skinTone, vest: operative.colors.primary });
      this.playerOp.group.visible = this.viewMode !== 'fps';
      this.scene.add(this.playerOp.group);
      this.#applyAvatarOverride(); // Fase 56 — recoloca o corpo GLB no novo playerOp
      this.firstPersonRig?.traverse((node) => {
        // Fase 10 — recolor alcança apenas manga/colete (tintable); pele/luva/dedos mantêm cor
        if (node.isMesh && node.userData?.tintable && node.material?.color) node.material.color.set(operative.colors.primary);
      });
      this.playerWeapon = null;
      this.renderOperativeCard(operative);
    });
  }

  // Fase 11 — catálogo selecionável: operativos canônicos + as 3 insígnias OCE
  // (jogáveis — online o servidor valida contra o plano do POJ; a insígnia é
  // única por partida). Marcadas com ★ dourada no rótulo.
  #operativeOptions() {
    const entries = [...operativeCatalog, ...officerCatalogEntries()];
    this.#selectableOperatives = entries;
    return entries.map((operative) => {
      const option = document.createElement('option');
      option.value = operative.id;
      option.textContent = operative.officerWeapon ? `★ ${operative.codename} — ${operative.rank}` : `${operative.codename} — ${operative.rank}`;
      if (operative.officerWeapon) option.dataset.officer = '1';
      return option;
    });
  }
  #findSelectable(id) {
    return (this.#selectableOperatives ?? [...operativeCatalog, ...officerCatalogEntries()]).find((o) => o.id === id) ?? null;
  }

  renderOperativeCard(operative) {
    const initials = operative.codename.split(/\s+/).map((part) => part[0]).join('').slice(0, 2);
    const sigil = document.querySelector('#operativeSigil');
    if (sigil) {
      sigil.textContent = initials;
      sigil.style.background = `linear-gradient(135deg, ${operative.colors.primary}, ${operative.colors.secondary})`;
    }
    const setText = (id, text) => { const node = document.querySelector(id); if (node) node.textContent = text; };
    setText('#operativeName', operative.codename);
    setText('#operativeRole', operative.specialization.replaceAll('_', ' '));
    setText('#operativeWorld', `MUNDO DE ORIGEM // ${operative.defaultWorld}`);
    setText('#operativeLore', operative.lore);
    setText('#operativeDisplay', `OPERATIVO // ${operative.codename}`);
  }

  makeNameTag(name, i, ally = false, officer = false, patente = null) {
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 26px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(8,8,12,.55)';
    ctx.fillRect(48, 6, 224, 44);
    // Fase 10 — Oficial de Classe Especial: moldura dourada + texto dourado
    if (officer) {
      ctx.strokeStyle = '#ffd75e'; ctx.lineWidth = 3;
      ctx.strokeRect(48, 6, 224, 44);
    }
    // Fase 7 — aliados de squad em VERDE; inimigos em tons vermelhos; oficial em OURO
    ctx.fillStyle = officer ? '#ffd75e' : ally ? '#7dff8a' : (i % 2 ? '#e86a7a' : '#d8a0aa');
    // Fase 11 — patente no nametag: linha fina acima do nome (1º critério do 11º artigo)
    if (patente) {
      ctx.font = 'bold 15px Rajdhani, sans-serif';
      ctx.fillStyle = officer ? '#ffe9a8' : ally ? '#b9ffc2' : '#e9b7bf';
      ctx.fillText(String(patente).toUpperCase(), 160, 21);
      ctx.font = 'bold 26px Rajdhani, sans-serif';
      ctx.fillStyle = officer ? '#ffd75e' : ally ? '#7dff8a' : (i % 2 ? '#e86a7a' : '#d8a0aa');
      ctx.fillText(name, 160, 44);
    } else {
      ctx.fillText(name, 128, 36);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.set(officer ? 3.1 : 2.7, .62, 1);
    sprite.position.y = 2.25;
    sprite.renderOrder = 5;
    return sprite;
  }

  initCamera() {
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .1, 1200);
    this.camRig = { dist: 4.4, height: 1.9, shoulder: .75, curDist: 4.4 };
    this.camera.position.set(0, 3, 156);
    // Task 59 (sessão 56) — FIX-RAIZ do "personagem quadrado/sem corpo": o rig
    // de 1ª pessoa (braços orgânicos + arma) é FILHO DA CÂMERA, e a câmera
    // nunca foi add() à cena — filhos de nó fora do grafo NUNCA renderizam. O
    // jogador via só a mira flutuando (zero corpo) desde sempre.
    this.scene.add(this.camera);
    // Task 59 — luz de PREENCHIMENTO do viewmodel: presa à câmera, alcance
    // curto (~3 m) — ilumina só braços/arma (o sol da cena bate nas costas do
    // rig e o deixava uma silhueta preta ilegível).
    const vmLight = new THREE.PointLight('#fff2df', .9, 3.2, 2);
    vmLight.position.set(.1, -.05, -.15);
    this.camera.add(vmLight);
    if (this.firstPersonRig) {
      this.camera.add(this.firstPersonRig);
      this.firstPersonWeapon = createWeaponModel(this.sim.player.weapon);
      this.firstPersonRig.add(this.firstPersonWeapon.group);
      // Task 59 — viewmodel canônico: arma à DIREITA da mira e angulada p/ dentro
      // (antes: x=0 — a arma de costas cobria a mira no centro da tela)
      this.firstPersonWeapon.group.position.set(.15, -.16, -.66);
      this.firstPersonWeapon.group.rotation.set(-.07, .1, 0);
    }
    this.camKick = 0; // recuo visual do disparo (só câmera, não afeta a mira)
    this.initPost();
  }

  initInput() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (!this.zuOpen && !this.ended && !this.pointerLocked && !this.isTouch()) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      document.body.classList.toggle('locked', this.pointerLocked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      // Fase 35 — sensibilidade do jogador (KR_GFX_*, 0.3..2.5×); ADS mantém a
      // razão antiga (~0.52× do hip fire).
      const sens = (this.input.ads ? .0011 : .0021) * (this.gfx?.sens ?? 1);
      this.input.yaw -= e.movementX * sens;
      this.input.pitch -= e.movementY * sens;
      this.input.pitch = Math.max(-1.35, Math.min(1.35, this.input.pitch));
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) return;
      if (e.button === 0) this.input.fire = true;
      if (e.button === 2) this.input.ads = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.fire = false;
      if (e.button === 2) this.input.ads = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      // Fase 28 — QTE do trem (derail) consome as teclas da decisão (1/2/c/e):
      // nunca vazam para o jogo (troca de slot/interagir/agachar) nem pulam a
      // cinemática — o contrato é timeout = falha, não "qualquer tecla = fuga".
      if (this.trainIntro?.consumesKey?.(k)) return;
      this.keys.add(k);
      if (k === 'r') this.input.reload = true;
      if (k === 'e') this.input.interact = true;
      if (k === 'q' && !e.repeat) this.abilityPending = true; // Fase 8 — online também (autoritativa)
      if (k === 'h') this.input.medkit = true;
      if (k === 'c') this.input.crouch = true;
      if (k === 'g') this.input.throw = true;      // Fase 4 — granada FRAG
      if (k === 'f') this.input.gloo = true;       // Fase 4 — Gloo Wall
      // Fase 40 — mapa tático em tela cheia (toggle; a partida NUNCA pausa)
      if (k === TACTICAL_HOTKEY && !e.repeat) this.hud?.toggleMap();
      if (k === 'c' && !e.repeat) this.input.crouch = !this.input.crouch; // Fase 5 — agachar (toggle)
      // Task 62 — alternância 1ª/3ª pessoa (V)
      if (k === 'v' && !e.repeat) this.toggleView();
      // Fase 5 — espectador: troca o operativo acompanhado
      if (k === 'arrowleft' && !e.repeat) this.spectateCycle(-1);
      if (k === 'arrowright' && !e.repeat) this.spectateCycle(1);
      // troca de slot: offline aplica na sim; online agenda no próximo input
      if (k === '1') this.sim.switchSlot(1);
      if (k === '2') this.sim.switchSlot(2);
      if (k === 'escape') { if (this.pointerLocked) document.exitPointerLock(); this.hud?.closeMap(); } // F40 — Esc fecha o mapa
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  isTouch() { return matchMedia('(pointer: coarse)').matches; }

  // ---------- Task 62 — alternância de câmera (1ª pessoa ↔ avatar à frente) ----------
  // Tecla V + botão ◉ VISTA do HUD. Persistida em localStorage (kr_view_mode);
  // ?view= da URL tem prioridade apenas na abertura (resolveViewMode).
  toggleView() {
    this.setViewMode(this.viewMode === 'fps' ? 'tps' : 'fps');
  }

  setViewMode(mode) {
    if (mode !== 'fps' && mode !== 'tps' || mode === this.viewMode) return;
    this.viewMode = mode;
    try { localStorage.setItem(VIEW_STORAGE_KEY, mode); } catch { /* storage privado */ }
    // visibilidade: em 1ª pessoa o corpo do jogador dorme (o rig FP assume);
    // em 3ª pessoa o operativo volta com a arma presa nas mãos.
    if (this.playerOp?.group) this.playerOp.group.visible = mode !== 'fps';
    if (this.firstPersonRig) this.firstPersonRig.visible = mode === 'fps';
    if (mode === 'tps') { this.camRig.curDist = 4.4; this.camRig.curEye = 1.62; } // re-enquadra
    this.hud?.viewToast?.(mode === 'fps' ? 'CÂMERA // PRIMEIRA PESSOA' : 'CÂMERA // AVATAR À FRENTE (3ª PESSOA)');
  }

  // ---------- fluxo ----------
  // ─── Fase 56 — avatares GLB (rigs reais) no herói e na vitrine do menu ───
  // Contrato (hero3d/avatars3d): asset OPCIONAL — qualquer falha mantém o
  // corpo procedural de createOperative(); nada aqui pode quebrar o boot.
  #removeAvatarModel() {
    if (this.avatarRoot?.parent) this.avatarRoot.parent.remove(this.avatarRoot);
    this.avatarRoot = null;
    this.avatarMixer = null;
  }

  #setProceduralBodyVisible(visible) {
    const g = this.playerOp?.group;
    if (!g) return;
    const keep = new Set();
    const wr = g.userData?.weaponRig?.group; // arma continua viva sobre o corpo GLB
    if (wr) wr.traverse((o) => keep.add(o));
    const shadow = this.playerOp?.parts?.shadow; // sombra de contato canônica
    if (shadow) shadow.traverse((o) => keep.add(o));
    g.traverse((o) => {
      if (o === this.avatarRoot || keep.has(o) || o.userData?.avatarAsset) return;
      if (o.isMesh || o.isSkinnedMesh) o.visible = visible;
    });
  }

  async #applyAvatarOverride() {
    // Fase 57 — corpo humano realista do HERÓI. O GLB é o corpo PADRÃO:
    // sem ?avatar= → determinístico pelo operativo; ?avatar=<id pool> → escolha
    // explícita; ?avatar=legacy|off|0|none → corpo procedural antigo (escape
    // hatch); QUALQUER falha de load/rig → procedural assume (doutrina hero3d).
    this.humanoidPlayer = null;
    if (this.humanoidDisabled) { this.#setProceduralBodyVisible(true); return; }
    const g = this.playerOp?.group;
    if (!g) return;
    const id = resolveGameplayAvatar(this.avatarOverrideId ?? this.avatarParam, this.selectedOperative?.id ?? 'player');
    if (!id) { this.#setProceduralBodyVisible(true); return; } // estático/inválido: procedural
    const body = await createHumanoidBody({ avatarId: id });
    if (!body || this.playerOp?.group !== g) { this.#setProceduralBodyVisible(true); return; } // troca de operativo durante o load
    attachHumanoidToOperative(this.playerOp, body);
    syncHumanoidGear(body, this.playerOp.parts); // Task 64 — capacete/colete/mochila nos bones reais
    this.humanoidPlayer = body;
  }

  // Fase 57 — corpo humano realista nos ATORES REMOTOS/bots (attach único,
  // assíncrono e idempotente: o GLB vive no tier DETALHADO do LOD, então o
  // proxy/silhueta seguem governando a distância automaticamente).
  async #attachHumanoidForBot(entry, seed) {
    if (this.humanoidDisabled || !entry?.op?.detailGroup || entry.humanoid !== undefined) return;
    entry.humanoid = null; // reserva: evita attach duplo durante o load
    const id = resolveGameplayAvatar(null, seed);
    if (!id) return;
    const body = await createHumanoidBody({ avatarId: id });
    if (!body || !entry.op?.detailGroup) return; // ator saiu durante o load → GC
    attachHumanoidToOperative({ group: entry.op.detailGroup, parts: entry.op.detailParts }, body);
    syncHumanoidGear(body, entry.op.detailParts ?? entry.op.parts); // Task 64 — gear nos bones do remoto
    entry.humanoid = body;
  }

  #initAvatarVitrine(host) {
    const bar = document.createElement('div');
    bar.className = 'avatar-glb-bar';
    const label = document.createElement('div');
    label.className = 'section-label';
    label.textContent = 'AVATARES GLB // RIGS REAIS (FASE 56)';
    const strip = document.createElement('div');
    strip.className = 'avatar-glb-strip';
    for (const a of AVATAR_GLB_LIBRARY) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'avatar-glb-chip';
      chip.dataset.avatarId = a.id;
      chip.textContent = `${a.tier === 'animated' ? '▶ ' : a.tier === 'rigged' ? '◆ ' : '○ '}${a.id}`;
      chip.title = `Pré-visualizar ${a.id} (${a.tier === 'animated' ? 'animação embutida' : a.tier === 'rigged' ? 'rig real' : 'estático'})`;
      chip.addEventListener('click', () => this.#showAvatarShowcase(a.id, chip));
      strip.appendChild(chip);
    }
    const hint = document.createElement('small');
    hint.className = 'avatar-glb-hint';
    hint.id = 'avatarGlbHint';
    hint.textContent = 'Clique para pré-visualizar girando · para JOGAR com o corpo real: ?avatar=<id>';
    bar.append(label, strip, hint);
    host.appendChild(bar);
  }

  async #showAvatarShowcase(id, chip = null) {
    const a = await loadAvatarGlb(id);
    if (!a?.root) {
      const h = document.querySelector('#avatarGlbHint');
      if (h) h.textContent = `avatar ${id} indisponível — o corpo procedural segue no jogo`;
      return;
    }
    this.#removeAvatarShowcase();
    normalizeAvatarScale(a.root);
    fitAvatarToGround(a.root);
    a.root.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) { o.castShadow = false; o.receiveShadow = false; } }); // vitrine não suja sombra do mundo
    // palco próprio: container giratório com key/fill lights + pedestal — o
    // menu é noturno e o GLB não pode depender das luzes do mundo para ler
    const stage = new THREE.Group();
    stage.name = 'avatar_glb_stage';
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(.85, .95, .06, 28),
      new THREE.MeshStandardMaterial({ color: 0x1a1420, roughness: .8, metalness: .3, emissive: 0x2a1f33, emissiveIntensity: .35 }),
    );
    pedestal.position.y = .03;
    stage.add(pedestal);
    const key = new THREE.DirectionalLight(0xfff2dd, 2.4); key.position.set(1.8, 3.4, 2.2); stage.add(key);
    const fill = new THREE.DirectionalLight(0x7d9dff, .9); fill.position.set(-2.2, 1.6, 1.4); stage.add(fill);
    const rim = new THREE.DirectionalLight(0xffd27d, 1.2); rim.position.set(0, 2.2, -2.6); stage.add(rim);
    stage.add(a.root);
    a.root.position.y = .06; // sobre o pedestal
    this.avatarShowcase = stage;
    this.scene.add(stage);
    // palco: na frente da câmera do menu e DESLOCADO À DIREITA (fora do painel
    // DOM — o rig fica visível na área livre da tela), pés ~0.9 m abaixo do olho
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const pos = this.camera.position.clone().add(dir.multiplyScalar(3.0)).add(right.multiplyScalar(1.35));
    pos.y -= 0.92;
    stage.position.copy(pos); // o PALCO viaja para frente da câmera (a.root vive dentro dele)
    if (a.clips?.length) {
      this.avatarShowcaseMixer = new THREE.AnimationMixer(a.root);
      this.avatarShowcaseMixer.clipAction(a.clips[0]).play();
    }
    if (chip) {
      for (const c of document.querySelectorAll('.avatar-glb-chip.is-active')) c.classList.remove('is-active');
      chip.classList.add('is-active');
      const h = document.querySelector('#avatarGlbHint');
      if (h) h.textContent = `pré-visualizando ${id} — para jogar com este corpo: ?avatar=${id}`;
    }
  }

  #removeAvatarShowcase() {
    if (this.avatarShowcase?.parent) this.scene.remove(this.avatarShowcase);
    this.avatarShowcase = null;
    this.avatarShowcaseMixer = null;
    for (const c of document.querySelectorAll('.avatar-glb-chip.is-active')) c.classList.remove('is-active');
  }

  startMatch(entry) {
    this.audio.init(); this.audio.resume();
    this.sim.start(entry);
    this.#removeAvatarShowcase(); // Fase 56 — vitrine de rigs sai quando a partida começa
    this.damageNumbers?.clear(); // Fase 27 — partida nova, tela limpa
    this.zuOpen = false;
    this.hud.hideZu();
    this.hud.setMatchStatus('RING EM OPERAÇÃO');
    this.hud.feed('CIGKV', entry === 'belt' ? 'Cinto travado. Defesa de impacto ampliada.' : 'Entrada agressiva. Velocidade ampliada.');
    if (!this.isTouch()) this.renderer.domElement.requestPointerLock?.();
    this.playerWeapon = attachWeapon(this.playerOp.parts, this.playerOp.group, this.sim.player.weapon);
    // Fase 11 — ZU: o trem cruza a zona e o desembarque aéreo começa (só câmera;
    // a sim continua autoritativa — nenhum input é bloqueado).
    // Task 53 — protocolo OFICIAL: a entrada é a VIAGEM a bordo (embarque → rota
    // → portas → chegada → grace 15 s). A cinemática curta permanece p/ o QTE
    // de descarrilamento (suite zu-derail-qte) — não é mais a entrada.
    this.startTrainRide();
  }

  // Fase 11 — cinemática do trem do ZU (offline e online; skippable).
  // Fase 12 — startAt (s) = entrada sincronizada pelo relógio do servidor no
  // modo online (todos os remotos veem o MESMO frame do trem).
  // Fase 26 — offline roda o modo 'derail' (QTE de emergência + descarrilo);
  // online permanece 'pass' — o servidor segue autoritativo (sem QTE local).
  startTrainIntro(startAt = 0) {
    try {
      const p = this.sim.player ?? { x: 0, z: 118 };
      this.trainIntro = new TrainIntro({
        scene: this.scene,
        spawn: { x: p.x ?? 0, z: p.z ?? 118 },
        startAt,
        mode: this.online ? 'pass' : 'derail',
        audio: this.audio,
        onDone: (outcome) => this.#applyTrainIntroOutcome(outcome),
      });
      this.hud.feed('ZU', 'Trem de infiltração chegando — desembarque no Ring autorizado.', 'warn');
    } catch { /* cinematic é best-effort — nunca bloqueia a partida */ }
  }

  // Task 53 — TREM OFICIAL DO ZU: câmera a bordo do vagão (protocolo completo:
  // embarque → rota → portas → chegada). Só apresentação — regras na SSOT/autoridade.
  startTrainRide(startAt = 0) {
    if (this.sim.trainT === null && !this.online) return; // entrada sem trem (portal)
    try {
      const spawn = this.sim.world?.playerSpawn
        ?? getWorldLayoutForTrain(this.seed, this.scenario?.id ?? 'CIGKV').playerSpawn;
      this.trainRide = new TrainRide({
        scene: this.scene,
        route: this.sim.trainRoutePts ?? trainRoute(spawn, seedHashOf(this.seed)),
        startAt,
        onDone: (reason) => this.#endTrainRide(reason),
        onPhase: (phase) => this.#onTrainPhase(phase),
      });
    } catch { /* visual best-effort — o protocolo segue autoritativo */ }
  }

  // Task 53 — fases do protocolo no HUD/rádio ZU (a bordo).
  #onTrainPhase(phase) {
    if (phase === 'embarque') this.hud.feed('ZU', 'EMBARQUE — todos os operativos a bordo. Portas fechando.', 'warn');
    else if (phase === 'em_rota') {
      this.hud.setMatchStatus('TREM EM ROTA // PORTAS FECHADAS');
      this.hud.feed('ZU', 'Em rota ao Ring — ataques liberados apenas 15 s APÓS a chegada.', 'warn');
    } else if (phase === 'portas') {
      this.hud.setMatchStatus('PORTAS ABERTAS // ESPAÇO = SALTAR');
      this.hud.feed('ZU', 'PORTAS ABERTAS — ESPAÇO salta (entrada oficial). Seguir até o destino também é oficial.', 'warn');
    }
  }

  // Task 53 — pedido de salto de porta (borda de ESPAÇO na janela das portas).
  #requestDoorJump() {
    const p = this.sim.player;
    if (!p?.trainOnboard || this.ended) return;
    if (this.online) { this.net?.sendDoorJump?.(); return; }
    if (this.sim.doorJump?.()) {
      this.audio?.wind?.(true, 0.2);
      this.hud.feed('ZU', 'Salto de porta executado — entrada oficial registrada no protocolo.', 'warn');
    }
  }

  // Task 53 — handover da câmera (salto ou chegada) + limpeza do vagão.
  #endTrainRide(reason) {
    if (!this.trainRide) return;
    this.trainRide.dispose();
    this.trainRide = null;
    if (reason === 'arrived') this.hud.feed('ZU', 'CHEGADA — desembarque concluído no Ring.', 'warn');
  }

  // Task 53 — HUD do protocolo por frame (countdown do grace + fases a bordo).
  updateTrainHud() {
    const info = this.online
      ? this._zuTrainView ?? null
      : (Number.isFinite(this.sim.trainT) ? {
          phase: zuTrainPhase(this.sim.trainT * 1000),
          playerOnboard: !!this.sim.player?.trainOnboard,
          combatLockedRemainingS: Math.max(0, this.sim.combatLockedUntil - this.sim.trainT),
        } : null);
    if (!info) return;
    if (info.phase === 'grace') {
      const s = Math.ceil(info.combatLockedRemainingS ?? 0);
      this.hud.setMatchStatus(`GRACE ZU // COMBATE EM ${s}s`);
    } else if (info.phase === 'combate' && !this._combatStatusSet) {
      this._combatStatusSet = true;
      this.hud.setMatchStatus('COMBATE LIVRE // RING');
      this.hud.feed('ZU', 'COMBATE LIVRE — protocolo oficial do trem cumprido.', 'good');
    }
  }

  // Fase 26 — consequências do QTE do trem (APENAS offline: a sim local é
  // autoritativa; no online o outcome é null e nada é aplicado). Custo de vida
  // com piso 10 (nunca mata — o ZU não elimina fora do regramento do POJ) e
  // atordoamento = trava de input local (a sim não muda).
  #applyTrainIntroOutcome(outcome) {
    const crates = this.trainIntro?.crateLoot ?? null;
    this.trainIntro = null;
    if (!outcome?.choice) return;
    const p = this.sim?.player;
    if (p) {
      if (outcome.hpCost > 0) p.life = Math.max(10, p.life - outcome.hpCost);
      if (outcome.stunSeconds > 0) this.trainStunUntil = performance.now() + outcome.stunSeconds * 1000;
    }
    const msgs = {
      seatbelt: 'Cinto travado a tempo — impacto absorvido, mas você cai atordoado.',
      jump: 'Salto de emergência! Controle imediato, mas o impacto custou vida.',
      fail: 'Sem reação a tempo — deslizamento violento: vida e consciência perdidas.',
    };
    this.hud.feed('ZU', msgs[outcome.choice] ?? 'Desembarque concluído.', outcome.choice === 'fail' ? 'bad' : 'warn');
    // Caixas do destroço viram loot REAL (formas consumidas por sim.#pickup)
    if (crates?.length && this.sim?.loot) {
      for (const c of crates) if (this.sim.loot.length < 72) this.sim.loot.push({ ...c });
    }
  }

  restart(nextSeed) {
    if (nextSeed) this.seed = nextSeed;
    // recarrega módulo de estado de forma limpa (garante layout/loot novos)
    location.hash = `#${encodeURIComponent(this.seed)}`;
    location.reload();
  }

  exportReplay() {
    if (!this.sim.exportReplay) { this.hud.feed('CONSOLE', 'Replay disponível apenas no modo offline.'); return; }
    const data = JSON.stringify(this.sim.exportReplay());
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `khaaos-replay-${this.seed}.json`;
    a.click();
    this.hud.feed('CONSOLE', 'Replay exportado (JSON).');
  }

  #endMatch(win, stats) {
    if (this.ended) return;
    this.ended = true;
    this.spectating = false;
    this.spectateTarget = null;
    document.body.classList.remove('spectating');
    this.hud.hideSpectator();
    if (this.firstPersonRig) this.firstPersonRig.visible = this.viewMode === 'fps';
    this.audio.stopAllSurvival?.(); // Fase 18 — camadas de hazard morrem com a partida
    this.audio.stinger(win);
    this.hud.setMatchStatus(win ? 'SOBREVIVENTE' : 'ELIMINADO');
    this.hud.showEnd(win, stats);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---------- Fase 5 — modo espectador ----------
  initSpectatorUI() {
    document.querySelector('#specPrev')?.addEventListener('click', () => this.spectateCycle(-1));
    document.querySelector('#specNext')?.addEventListener('click', () => this.spectateCycle(1));
    document.querySelector('#specLeave')?.addEventListener('click', () => this.leaveSpectate());
    // Fase 13 — replay da ata da Corte na UI do eliminado: reabre a ata do caso
    // próprio (busca online via mine=1) a partir da barra de espectador.
    document.querySelector('#specAta')?.addEventListener('click', () => this.openMyCourtAta?.());
    document.querySelector('#endAtaBtn')?.addEventListener('click', () => this.openMyCourtAta?.());
    document.querySelector('#ataReplayBtn')?.addEventListener('click', () => this.hud.replayCourtAta());
    document.querySelector('#ataCloseBtn')?.addEventListener('click', () => this.hud.hideCourtAta());
    // clique no card adianta a encenação (skip)
    document.querySelector('#ataTimeline')?.addEventListener('click', () => {
      (this.hud.ataNodes ?? []).forEach((n) => n.classList.add('shown'));
    });
  }

  // alvos vivos que o espectador pode acompanhar (bots/remotos; offline e online)
  spectateTargets() {
    return (this.sim.bots ?? []).filter((b) => b.alive);
  }

  enterSpectate(e) {
    if (this.ended || this.spectating) return;
    this.spectating = true;
    this.placement = e?.placement ?? null;
    this.spectateTarget = null;
    document.body.classList.add('spectating');
    // espectador usa câmera TPS no alvo: esconde as mãos FPS e mostra o corpo
    if (this.firstPersonRig) this.firstPersonRig.visible = false;
    this.playerOp.group.visible = true;
    this.audio.stinger(false);
    this.hud.setMatchStatus('ESPECTADOR');
    this.hud.feed('CIGKV', `Você foi eliminado${this.placement ? ` — posição #${this.placement}` : ''}. Transmitindo o restante da partida.`, 'bad');
    this.spectateCycle(1);
    this.hud.showSpectator({ name: this.spectateTarget?.name ?? '—', placement: this.placement });
    // Fase 13 — o eliminado passa a ver o replay da ata do SEU caso na Corte:
    // a busca é async (HTTP mine=1) e o caso pode demorar um tick para abrir.
    this.onEliminated?.(e);
  }

  spectateCycle(dir = 1) {
    if (!this.spectating) return;
    const targets = this.spectateTargets();
    if (!targets.length) {
      this.spectateTarget = null;
      this.hud.updateSpectator('AGUARDANDO');
      return;
    }
    const idx = targets.findIndex((b) => b.id === this.spectateTarget?.id);
    const next = idx < 0 ? 0 : (idx + dir + targets.length) % targets.length;
    this.spectateTarget = targets[next];
    this.hud.updateSpectator(this.spectateTarget.name ?? this.spectateTarget.id);
  }

  leaveSpectate() {
    if (!this.spectating || this.ended) return;
    const p = this.sim.player;
    this.sim.over = true; // encerra a transmissão (partida segue no servidor no modo online)
    this.#endMatch(false, { kills: p.kills, xp: p.xp, krc: p.krc, placement: this.placement });
  }

  // câmera de espectador: por trás do operativo acompanhado, com colisão simples
  updateSpectateCamera(dt) {
    const t = this.spectateTarget;
    if (!t) return;
    const fx = -Math.sin(t.yaw), fz = -Math.cos(t.yaw);
    const eye = new THREE.Vector3(t.x, t.y + 2.0, t.z);
    const desired = eye.clone().addScaledVector(new THREE.Vector3(fx, 0, fz), -5.2).add(new THREE.Vector3(0, 1.1, 0));
    desired.y = Math.max(.6, desired.y);
    // colisão: raycast do olhar do alvo até a câmera desejada
    const dir = desired.clone().sub(eye);
    const len = dir.length();
    dir.normalize();
    const ray = new THREE.Raycaster(eye, dir, 0, len);
    ray.camera = this.camera;
    const hits = ray.intersectObjects(this.scene.children, true)
      .filter((h) => h.object.isMesh && h.object.visible && !h.object.userData.noCamBlock && h.distance > .2);
    let finalPos = desired;
    if (hits.length) {
      const blocked = hits.find((h) => h.object.geometry?.type === 'BoxGeometry' || h.object.geometry?.type === 'CylinderGeometry');
      if (blocked && blocked.distance < len) finalPos = eye.clone().addScaledVector(dir, Math.max(.6, blocked.distance - .3));
    }
    this.camera.position.lerp(finalPos, Math.min(1, dt * 5));
    this.camera.lookAt(t.x, t.y + 1.35, t.z);
    if (this.shake > 0.001) {
      // Fase 35 — multiplicador de tremor do jogador (KR_GFX_*, 0 = movimento reduzido)
      const amp = this.shake * (this.gfx?.shake ?? 1);
      this.camera.position.x += (Math.random() - .5) * amp;
      this.camera.position.y += (Math.random() - .5) * amp;
      this.shake *= Math.exp(-dt * 6.5);
    }
    const targetFov = 62;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 6);
    this.camera.updateProjectionMatrix();
    this.sun.position.set(t.x - 160, 160, t.z - 240);
    this.sun.target.position.set(t.x, 0, t.z);
  }

  // ---------- sincronização visual ----------
  syncLoot(force = false) {
    const active = new Set();
    for (const item of this.sim.loot) {
      if (!item.active) continue;
      active.add(item.id);
      if (!this.lootMeshes.has(item.id)) {
        const mesh = createLootMesh(item);
        // Fase 28 — caixa de morte/airdrop/gear têm fábricas que já assentam
        // no chão (sem o offset de flutuação do loot genérico)
        const groundKinds = ['deathBox', 'supplyDrop', 'helmet', 'vest', 'pack'];
        const yOff = groundKinds.includes(item.kind) ? 0 : item.y - .45;
        mesh.position.set(item.x, yOff, item.z);
        this.scene.add(mesh);
        this.lootMeshes.set(item.id, mesh);
        // Fase 28 — a caixa de airdrop DESCE de paraquedas (34 m de altitude)
        if (item.kind === 'supplyDrop' && !item.landedT) {
          item.landedT = 1;
          mesh.position.y = 34;
          (this.supplyDropDescent ??= []).push({ mesh, h: 34 });
        }
      }
    }
    for (const [id, mesh] of this.lootMeshes) {
      if (!active.has(id) || force === 'clear') {
        this.scene.remove(mesh);
        this.lootMeshes.delete(id);
      }
    }
  }

  // ---------- Fase 28 — equipamento VISÍVEL (capacete/colete/mochila) ----------
  // Espelha o estado da sim (actor.gear) na silhueta dos operativos — jogador
  // e bots. Cachê por ator: re-aplicar só quando o nível muda (getObjectByName
  // + add/remove são baratos, mas evitados por frame).
  applyGearVisuals() {
    if (!this.sim) return;
    const actors = [this.sim.player, ...(this.sim.bots ?? [])];
    for (const a of actors) {
      if (!a?.gear) continue;
      const parts = a.id === 'player' ? this.playerOp?.parts : this.botOps.get(a.id)?.op?.parts;
      if (!parts) continue;
      const sig = `${a.gear.vest | 0}.${a.gear.helmet | 0}.${a.gear.pack | 0}`;
      const cache = parts.userData?.gearSig;
      if (cache === sig) continue;
      parts.userData.gearSig = sig;
      applyOperativeGear(parts, a.gear);
      // Task 64 — pickup/troca de nível DURANTE a partida: o gear renasce nos
      // anchors procedurais; o corpo GLB (se presente) re-adota na hora.
      if (a.id === 'player') { if (this.humanoidPlayer) syncHumanoidGear(this.humanoidPlayer, parts); }
      else { const h = this.botOps.get(a.id)?.humanoid; if (h) syncHumanoidGear(h, parts); }
    }
  }

  // ---------- Fase 25/26 — sincronização visual de PORTAS + JANELAS ----------
  // Canônica nos 3 modos: sim offline (KhaaosSim3D), online (Sim3DView dos
  // snapshots) e transmissão (SpectatorView do batch). As folhas seguem o
  // estado autoritativo (alvo de rotação/quebra) e o vidro some + cacos quando
  // o servidor/sim marca destroyed. Posição dos vãos vem do layout
  // determinístico (snapshots/batches não carregam x/z).
  syncDoors() {
    const reg = this.scene.userData.interiors;
    if (!reg?.doors?.size && !reg?.glass?.size) return;
    const layoutDoors = this.scene.userData.layout?.doors ?? [];
    const layoutWins = this.scene.userData.layout?.windows ?? [];
    // ---- folhas de porta (abrir/fechar/quebrar) ----
    for (const sd of this.sim?.doors ?? []) {
      const h = reg.doors.get(sd.id);
      if (!h) continue;
      if (sd.destroyed && !h.broken) {
        h.broken = true;
        h.leaf.visible = false;
        const gp = layoutDoors.find((d) => d.id === sd.id);
        if (gp) this.effects.impact(new THREE.Vector3(gp.x, gp.yMin + 1.15, gp.z), 'wood');
      } else if (!sd.destroyed) {
        h.target = sd.open ? DOOR.openAngle : 0;
      }
    }
    // ---- Fase 26 — painéis de vidro (estilhaça some + cacos UMA vez) ----
    for (const sw of this.sim?.windows ?? []) {
      const mesh = reg.glass.get(sw.id);
      if (!mesh) continue;
      if (sw.destroyed && mesh.visible) {
        mesh.visible = false;
        if (!this.doorBrokenFx.has(sw.id)) {
          this.doorBrokenFx.add(sw.id);
          const gp = layoutWins.find((w) => w.id === sw.id);
          if (gp) {
            const cy = (gp.y0 + gp.y1) / 2;
            for (let i = 0; i < 2; i++) {
              this.effects.impact(new THREE.Vector3(
                gp.x + (Math.random() - .5) * gp.w * .7,
                cy + (Math.random() - .5) * gp.h * .7,
                gp.z + (Math.random() - .5) * .3), 'glass');
            }
          }
        }
      }
    }
  }

  // ---------- Fase 4 — sincronização visual de arremessáveis/queda ----------
  // Funciona nos dois modos: a sim offline e a Sim3DView online expõem os mesmos
  // arrays (grenades/walls) traduzidos dos snapshots autoritativos.
  syncThrowables(dt) {
    const grenades = this.sim.grenades ?? [];
    const walls = this.sim.walls ?? [];
    const activeG = new Set(), activeW = new Set();
    for (const g of grenades) {
      activeG.add(g.id);
      let mesh = this.grenadeMeshes.get(g.id);
      if (!mesh) { mesh = createFragMesh(); this.scene.add(mesh); this.grenadeMeshes.set(g.id, mesh); }
      mesh.position.set(g.x, g.y, g.z);
      mesh.rotation.x += dt * 9; mesh.rotation.z += dt * 7; // tombo em voo
      const led = mesh.userData.led;
      if (led) led.visible = Math.sin(performance.now() / 70) > 0; // pavio piscando
    }
    for (const [id, mesh] of this.grenadeMeshes) {
      if (!activeG.has(id)) { this.scene.remove(mesh); this.grenadeMeshes.delete(id); }
    }
    for (const w of walls) {
      if (!w.active) { continue; }
      activeW.add(w.id);
      this.wallPositions.set(w.id, { x: w.x, z: w.z }); // Fase 21 — cache p/ cacos no glooDown
      let mesh = this.wallMeshes.get(w.id);
      if (!mesh) {
        mesh = createGlooMesh();
        mesh.position.set(w.x, 0, w.z);
        mesh.rotation.y = w.rot ?? 0;
        // animação de deploy: cresce do chão
        mesh.userData.spawnT = 0;
        this.scene.add(mesh);
        this.wallMeshes.set(w.id, mesh);
        this.effects.glooPuff(new THREE.Vector3(w.x, 0, w.z));
      }
      if (mesh.userData.spawnT < 1) {
        mesh.userData.spawnT = Math.min(1, (mesh.userData.spawnT ?? 0) + dt * 4.5);
        const k = mesh.userData.spawnT;
        mesh.scale.y = .12 + .88 * (1 - Math.pow(1 - k, 3)); // ease-out
      }
      mesh.userData.updateHp?.(Math.max(0, Math.min(1, (w.hp ?? 0) / 220)));
    }
    for (const [id, mesh] of this.wallMeshes) {
      if (!activeW.has(id)) { this.scene.remove(mesh); this.wallMeshes.delete(id); }
    }
  }

  syncParachutes() {
    // jogador + bots/remotos: paraquedas visível na fase 'chute' (abertura auto a 45m)
    const actors = [['player', this.sim.player, this.playerOp]];
    for (const b of this.sim.bots ?? []) {
      const entry = this.botOps.get(b.id);
      if (entry) actors.push([b.id, b, entry.op]);
    }
    const seen = new Set();
    for (const [id, actor, op] of actors) {
      if (!actor || !op) continue;
      seen.add(id);
      let pc = this.parachutes.get(id);
      const wantChute = actor.dropPhase === 'chute';
      if (wantChute && !pc) {
        const chute = createParachute(id === 'player' ? '#c8622e' : VEST_COLORS[(id.length * 7) % VEST_COLORS.length]);
        op.group.add(chute);
        pc = { chute };
        this.parachutes.set(id, pc);
      } else if (!wantChute && pc) {
        op.group.remove(pc.chute);
        this.parachutes.delete(id);
      }
    }
    for (const [id, pc] of this.parachutes) {
      if (!seen.has(id)) { pc.chute.parent?.remove(pc.chute); this.parachutes.delete(id); }
    }
  }

  syncEntities(dt) {
    const s = this.sim;
    // Fase 10 — envelhece as reações de impacto (~.55 s de flinch)
    for (const [k, hf] of this.hitFX) {
      hf.age += dt;
      if (hf.age > .55) this.hitFX.delete(k);
    }
    // jogador
    const p = s.player;
    const pg = this.playerOp.group;
    pg.position.set(p.x, p.y, p.z);
    pg.rotation.y = p.yaw; // Task 62 — modelo olha −Z local = direção de mira (fim do avatar de costas)
    if (!p.alive) {
      // Fase 12 — morte DIRECIONAL: torque oposto ao tiro, quique amortecido e assentamento
      let dfx = this.deathFX.get('player');
      if (!dfx) {
        const hf = this.hitFX.get('player');
        dfx = { angle: hf ? hf.angle : 0, power: hf ? hf.power : .7, age: 0, seed: 3 };
        this.deathFX.set('player', dfx);
        // Fase 20 — decal de morte: poça/riscos orientados longe do atirador
        this.deathDecals?.spawn({ x: p.x, y: p.y, z: p.z, angle: dfx.angle, yaw: p.yaw, power: dfx.power, seed: dfx.seed });
      }
      dfx.age += dt;
      const df = deathFall(dfx);
      pg.rotation.order = 'YXZ';          // yaw primeiro; queda em x/z locais ao modelo
      pg.rotation.x = df.rotX;
      pg.rotation.z = df.rotZ;
      pg.position.y = .35;
      pg.userData.deadPose = true;
    }
    if (p.alive) {
      pg.userData.deadPose = false;
      this.deathFX.delete('player');
      pg.rotation.x = 0; pg.rotation.z = 0;
    }
    // Fase 4 — pose de queda: braços abertos, pernas colhendo ar
    // Fase 9 — `air` esvanece a sombra de contato com a altitude
    // Fase 42 — passada do jogador LOCAL travada em DISTÂNCIA PREDITA: a fase
    // avança pelos metros percorridos (não pelo relógio) → os pés aterrisam
    // onde o corpo chega (zero patinação) e os heel strikes viram o relógio
    // físico do áudio de passos.
    this._gait ??= newGait();
    advanceGait(this._gait, { x: p.x, z: p.z, dt });
    if (p.alive && !p.dropPhase && !p.knocked && this.audio) {
      for (const _strike of this._gait.events) this.audio.step(.25 + .55 * Math.min(1, this._gait.speed), 0, this.audio.worldAmbience.surface);
    }
    const airborne = !!p.dropPhase;
    // Task 59 (sessão 56) — SPRINT ABAIXA A ARMA: sprintK com CONSTANTE DE
    // TEMPO PRÓPRIA por ator (peso do corpo — banda instantânea de speedNorm
    // atravessava em ~1 frame na frenagem exponencial); ADS/crouch/fire
    // erguem na hora (hint false).
    const skT = (!p.alive || p.knocked || p.ads || p.crouching || !p.sprinting) ? 0 : 1;
    this._sk ??= 0;
    this._sk += (skT - this._sk) * (1 - Math.exp(-(skT > this._sk ? 5.5 : 7) * dt));
    if (this._sk < 1e-4) this._sk = 0;
    // Task 59 — DIP DE POUSO: pico de vy na transição ar→chão vira absorção
    // (decaimento exponencial) consumida pela câmera em 1ª pessoa.
    this._dip ??= { v: 0, wasGround: !!p.onGround, fallV: 0 };
    const groundedNow = !!p.onGround;
    if (groundedNow && !this._dip.wasGround) this._dip.v = Math.min(.12, Math.max(0, -(this._dip.fallV ?? 0)) * .016);
    this._dip.wasGround = groundedNow;
    this._dip.fallV = groundedNow ? 0 : (p.vy ?? 0);
    this._dip.v *= Math.exp(-dt * 6.5);
    const pFx = animateOperative(this.playerOp.parts, {
      t: this.animT, phase: this._gait.phase, speedNorm: p.moving ? (p.sprinting ? 1.2 : .8) : 0,
      pitch: p.pitch, dead: !p.alive, ads: p.ads, crouch: !!p.crouching,
      knocked: !!p.knocked, // Fase 7 — pose de rastejo DBNO (só quando vivo)
      air: airborne ? Math.max(0, p.y) : 0,
      hit: this.#hitParam('player'), // Fase 10 — flinch direcional do jogador
      death: p.alive ? null : this.deathFX.get('player'), // Fase 12 — agonia direcional
      sprintK: this._sk, // Task 59 — low-ready do sprint (suavizado por ator)
    });
    // Task 62 — o low-ready da arma no sprint é resolvido DENTRO de
    // animateOperative (solda punho↔grip por frame); sem pose externa.
    if (airborne && p.alive && !p.knocked) {
      const flap = Math.sin(this.animT * 5) * .5;
      this.playerOp.parts.armL.shoulder.rotation.z = 1.1 + flap * .3;
      this.playerOp.parts.armR.shoulder.rotation.z = -1.1 - flap * .3;
      this.playerOp.parts.legL.hip.rotation.x = .5 + flap * .25;
      this.playerOp.parts.legR.hip.rotation.x = .35 - flap * .25;
    }
    // Fase 56 — mixers dos avatares GLB (herói com corpo real + vitrine do menu)
    if (this.avatarMixer) this.avatarMixer.update(dt);
    if (this.avatarShowcaseMixer) this.avatarShowcaseMixer.update(dt);
    if (this.avatarShowcase) this.avatarShowcase.rotation.y += dt * 0.6;
    // troca de arma visual (Fase 7 — skin por raridade acompanha a troca)
    // Fase 30 — anexos dos 4 sockets + estágio evolutivo mítico também reconstroem
    // Fase 32 — skin mítica POR ARMA (cor/fit do catálogo) + raridade dos anexos
    const pSkin = p.weaponSkin ?? null;
    const pAtt = (p.weaponAttachments ?? []).join(',');
    const pRar = (p.attachmentRarities ?? []).join(',');
    const pSkinDef = mythicSkinFor(p.weapon);
    const pStage = pSkinDef && pSkin === MYTHIC_SKIN.id ? Math.max(1, p.mythicStage || 1) : 0;
    if (!this.playerWeapon || this.playerWeapon.userData?.id !== p.weapon || this.playerWeapon.userData?.skin !== pSkin
      || this.playerWeapon.userData?.att !== pAtt || this.playerWeapon.userData?.rar !== pRar
      || this.playerWeapon.userData?.stage !== pStage) {
      if (this.firstPersonWeapon) unregisterMythic(this.firstPersonWeapon.group);
      this.playerWeapon = attachWeapon(this.playerOp.parts, this.playerOp.group, p.weapon, pSkin, { attachments: p.weaponAttachments ?? [], attachmentRarities: p.attachmentRarities ?? [], mythicStage: pStage, mythicColor: pSkinDef?.aura });
      this.playerWeapon.userData = { id: p.weapon, skin: pSkin, att: pAtt, rar: pRar, stage: pStage };
      if (this.viewMode === 'fps' && this.firstPersonWeapon) {
        this.firstPersonRig.remove(this.firstPersonWeapon.group);
        this.firstPersonWeapon.group.traverse(o => o.geometry?.dispose?.());
        this.firstPersonWeapon = createWeaponModel(p.weapon, pSkin, { attachments: p.weaponAttachments ?? [], attachmentRarities: p.attachmentRarities ?? [], mythicStage: pStage, mythicColor: pSkinDef?.aura });
        this.firstPersonRig.add(this.firstPersonWeapon.group);
        this.firstPersonWeapon.group.position.set(.15, -.16, -.66);
        this.firstPersonWeapon.group.rotation.set(-.07, .1, 0);
      }
    }
    // Fase 57 — corpo humano REAL do herói (3ª pessoa): locomoção fase-travada
    // pela passada predita (gait.js), mira/rastejo/agachamento/queda + arma
    // SOLDADA na mão direita do rig real. Em 1ª pessoa o grupo dorme (o rig FP
    // assume) — a visibilidade já é herdada de playerOp.group.visible.
    if (this.humanoidPlayer) {
      // Task 64 — lean de curva: vel angular do yaw (EWMA interna no rig),
      // clampada no animateHumanoid (mouse rápido nunca derruba o corpo).
      const yawVel = Number.isFinite(this._playerPrevYaw) && dt > 0
        ? Math.atan2(Math.sin(p.yaw - this._playerPrevYaw), Math.cos(p.yaw - this._playerPrevYaw)) / dt
        : 0;
      this._playerPrevYaw = p.yaw;
      animateHumanoid(this.humanoidPlayer, {
        t: this.animT, phase: this._gait.phase, speedNorm: p.moving ? (p.sprinting ? 1.2 : .8) : 0,
        pitch: p.pitch, dead: !p.alive, ads: p.ads, crouch: !!p.crouching,
        knocked: !!p.knocked, air: airborne ? Math.max(0, p.y) : 0, leanVel: yawVel,
      });
      if (this.playerWeapon && p.alive && !p.knocked && !airborne) {
        weldWeaponToHand(this.humanoidPlayer, this.playerWeapon);
        poseLeftHandSupport(this.humanoidPlayer, this.playerWeapon); // Task 64 — empunhadura de 2 mãos
        poseWeaponReady(this.humanoidPlayer, { speedNorm: p.moving ? (p.sprinting ? 1.2 : .8) : 0, ads: p.ads }); // Task 64 — arma erguida (low-ready/ADS)
      }
    }
    // bots
    const seen = new Set();
    const mySquad = s.player?.squad ?? null;
    // Fase 13 — direção da câmera UMA vez por frame (frustum de todos os atores)
    if (!this._camDir) this._camDir = new THREE.Vector3();
    this.camera.getWorldDirection(this._camDir);
    for (const b of s.bots) {
      seen.add(b.id);
      let entry = this.botOps.get(b.id);
      if (!entry) {
        // Fase 8 — identidade: paleta/acessórios pelo operativo do ator (op do snapshot);
        // aliados do esquadrão em verde; oficiais em OURO canônico (Fase 10); fallback = paleta hash do id (compat legado)
        const ally = !!(s.squad && b.squad && b.squad === mySquad);
        const catalog = operativeCatalog.find((o) => o.id === b.op);
        // Fase 10 — atores remotos também nascem com LOD; oficiais em OURO canônico
        const palette = b.officer
          ? { skin: SKIN_TONES[(b.id.charCodeAt(4) * 7) % SKIN_TONES.length], vest: '#b98a1e' }
          : catalog
            ? { skin: catalog.colors.skinTone, vest: ally ? '#2e7d4f' : catalog.colors.primary }
            : { skin: SKIN_TONES[(b.id.charCodeAt(4) * 7) % SKIN_TONES.length], vest: VEST_COLORS[b.id.charCodeAt(6) % VEST_COLORS.length] };
        const op = createCharacterLOD(
          createOperative({ ...palette, variant: b.officer ? 'OCE_OFFICER' : (catalog ? b.op : b.id) }),
          buildOperativeProxy(palette),
          buildOperativeSilhouette(palette),
          { tier: this.quality }
        );
        this.scene.add(op.group);
        const name = this.makeNameTag(b.name, 0, ally, !!b.officer, b.patente ?? null);
        op.group.add(name);
        attachWeapon(op.parts, op.group, b.weapon, b.weaponSkin);
        entry = { op, weapon: b.weapon, skin: b.weaponSkin ?? null, name, ally, patente: b.patente ?? null, officer: !!b.officer, frustum: null };
        this.botOps.set(b.id, entry);
        this.#attachHumanoidForBot(entry, b.op || (b.officer ? `OCE_${b.id}` : b.id)); // Fase 57 + Task 64 — identidade do operativo (oficial mantém fallback OCE_)
      } else if ((entry.patente ?? null) !== (b.patente ?? null) || entry.officer !== !!b.officer) {
        // Fase 11 — patente/insígnia chegou depois do spawn (resolvida async): troca o sprite
        entry.name.material.map.dispose();
        entry.name.material.dispose();
        const fresh = this.makeNameTag(b.name, 0, entry.ally, !!b.officer, b.patente ?? null);
        entry.op.group.remove(entry.name);
        entry.op.group.add(fresh);
        entry.name = fresh; entry.patente = b.patente ?? null; entry.officer = !!b.officer;
      }
      const g = entry.op.group;
      // Fase 10 — LOD por distância à câmera (corpos no chão também culam)
      // Fase 13 — LOD por FRUSTUM: fora do cone de visão por ~0,3 s a distância
      // efetiva é penalizada (downgrade acelerado sem pop) e a ANIMAÇÃO congela;
      // atores próximos (dist < limiar full do tier) nunca são penalizados —
      // a sombra deles precisa existir quando a câmera vira.
      const cam = this.camera.position;
      entry.frustum ??= createFrustumGate({ fovY: this.camera.fov, aspect: this.camera.aspect, minDist: entry.op.th.full });
      const fg = entry.frustum.update(Math.hypot(b.x - cam.x, b.y - cam.y, b.z - cam.z), cam, this._camDir, b);
      entry.op.update(fg.effectiveDist);
      entry.frozen = !fg.inside;
      // morto FINAL (sem DBNO ou já finalizado): queda DIRECIONAL (Fase 12)
      if (!b.alive && !b.knocked) {
        let dfx = this.deathFX.get(b.id);
        if (!dfx) {
          const hf = this.hitFX.get(b.id);
          dfx = { angle: hf ? hf.angle : 0, power: hf ? hf.power : .7, age: 0, seed: (b.id.charCodeAt(4) || 7) % 97 };
          this.deathFX.set(b.id, dfx);
          g.visible = true;
          g.rotation.order = 'YXZ';
          entry.name.visible = false;
          // Fase 20 — decal de morte: poça/riscos orientados longe do atirador
          this.deathDecals?.spawn({ x: b.x, y: b.y, z: b.z, angle: dfx.angle, yaw: b.yaw, power: dfx.power, seed: dfx.seed });
        }
        dfx.age += dt;
        const df = deathFall(dfx);
        g.rotation.x = df.rotX;
        g.rotation.z = df.rotZ;
        g.position.y = b.y + .35;
        g.userData.deadVisible = true;
        // agonia aditiva nos membros (se o nível ativo do LOD tem parts)
        // Fase 13 — congelada fora do frustum (rotação da raiz continua: barata)
        const dparts = entry.op.activeParts();
        if (dparts && !entry.frozen) animateOperative(dparts, { t: this.animT + (b.id.charCodeAt(4) || 7), dead: true, death: dfx });
        // Fase 57 — corpo humano REAL caído: relaxa uma única vez (assenta);
        // a rotação de queda vive na RAIZ do LOD (herdada pelo GLB filho).
        if (entry.humanoid && entry.op.level === 'full' && !entry.frozen) {
          animateHumanoid(entry.humanoid, { t: this.animT + (b.id.charCodeAt(4) || 7), dead: true });
        }
        continue;
      }
      g.userData.deadVisible = false;
      this.deathFX.delete(b.id);
      g.visible = true;
      g.rotation.x = 0; g.rotation.z = 0;
      g.position.set(b.x, b.y, b.z);
      g.rotation.y = b.yaw; // Task 62 — mesma convenção do jogador (modelo olha −Z local)
      // Fase 7 — caído rasteja (pose própria); de pé anima normal
      // Fase 9 — sombra some com altitude da queda
      // Fase 10 — anima o conjunto de parts do NÍVEL ATIVO do LOD + flinch de dano
      // Fase 12 — no nível silhueta activeParts() → null (nada a animar)
      // Fase 13 — fora do frustum a pose CONGELA (posições/rotações da raiz seguem
      // — o ator não some do mundo, só para de gastar CPU de animação)
      const parts = entry.op.activeParts();
      // Fase 42 — passada dos REMOTOS travada em DISTÂNCIA INTERPOLADA:
      // fase avança pelos metros que o ator realmente percorreu (Δ do snapshot
      // interpolado) e speedNorm é o EWMA da velocidade real (0..1.25) — o
      // binário .9/.15 (patinação + "rotor") foi aposentado. Heel strikes a
      // menos de 22 m do ouvinte viram passos audíveis com atenuação.
      if (parts && !entry.frozen) {
        entry.gait ??= newGait();
        advanceGait(entry.gait, { x: b.x, z: b.z, dt });
        const gsn = Math.max(b.moving ? .12 : 0, entry.gait.speed);
        // Task 59 — low-ready dos remotos: só oficiais sprintam (hook); estado
        // por ator com a mesma constante de tempo do jogador.
        const bSkT = (b.sprinting && !b.ads && !b.crouching) ? 1 : 0;
        entry.sk ??= 0;
        entry.sk += (bSkT - entry.sk) * (1 - Math.exp(-(bSkT > entry.sk ? 5.5 : 7) * dt));
        if (entry.sk < 1e-4) entry.sk = 0;
        animateOperative(parts, { t: this.animT + b.id.charCodeAt(4), phase: entry.gait.phase, speedNorm: gsn, pitch: 0, dead: false, crouch: !!b.crouching, knocked: !!b.knocked, air: b.dropPhase ? Math.max(0, b.y) : 0, hit: this.#hitParam(b.id), sprintK: entry.sk });
        // Fase 57 — corpo humano REAL do ator remoto: locomoção fase-travada
        // (mesma fase do gait.js), rastejo/queda/agachamento + arma na mão.
        if (entry.humanoid && entry.op.level === 'full') {
          // Task 64 — lean dos remotos: yaw do snapshot vira vel angular (wrap-safe)
          const bYawVel = Number.isFinite(entry.prevYaw) && dt > 0
            ? Math.atan2(Math.sin(b.yaw - entry.prevYaw), Math.cos(b.yaw - entry.prevYaw)) / dt
            : 0;
          entry.prevYaw = b.yaw;
          animateHumanoid(entry.humanoid, { t: this.animT + b.id.charCodeAt(4), phase: entry.gait.phase, speedNorm: gsn, pitch: 0, dead: false, crouch: !!b.crouching, knocked: !!b.knocked, air: b.dropPhase ? Math.max(0, b.y) : 0, leanVel: bYawVel });
          const bwr = entry.op.group.userData?.weaponRig;
          if (bwr && !b.knocked && !b.dropPhase) {
            weldWeaponToHand(entry.humanoid, bwr);
            poseLeftHandSupport(entry.humanoid, bwr); // Task 64 — 2 mãos também nos remotos
            poseWeaponReady(entry.humanoid, { speedNorm: gsn, ads: !!b.ads }); // Task 64 — arma erguida
          }
        }
        // Task 62 — arma acompanha o low-ready dentro do animateOperative
        if (this.audio && b.alive && !b.dropPhase && !b.knocked && entry.gait.events.length) {
          const dListener = Math.hypot(b.x - cam.x, b.z - cam.z);
          if (dListener < 22) {
            for (const _strike of entry.gait.events) this.audio.step(.2 + .5 * entry.gait.speed, dListener, this.audio.worldAmbience.surface);
          }
        }
      }
      // Fase 26 — silhueta LARANJA do fieldScan (revelado atrás de cobertura):
      // offline revela por revealedTicks; online pelo flag revealed do snapshot.
      this.#setBotRevealGlow(entry, !!(b.revealedTicks > 0 || b.revealed));
      // Fase 4 — pose de queda para bots/remotos
      if (b.dropPhase && !b.knocked && parts && !entry.frozen) {
        const flap = Math.sin(this.animT * 5 + b.id.charCodeAt(4)) * .5;
        parts.armL.shoulder.rotation.z = 1.1 + flap * .3;
        parts.armR.shoulder.rotation.z = -1.1 - flap * .3;
        parts.legL.hip.rotation.x = .5 + flap * .25;
        parts.legR.hip.rotation.x = .35 - flap * .25;
      }
      // Fase 7 — troca de arma + skin por raridade
      // Fase 30 — anexos + estágio mítico do snapshot também reconstroem o rig
      // Fase 32 — skin mítica por arma + raridade dos anexos no cache do rig
      const bSkin = b.weaponSkin ?? null;
      const bAtt = (b.weaponAttachments ?? []).join(',');
      const bRar = (b.attachmentRarities ?? []).join(',');
      const bSkinDef = mythicSkinFor(b.weapon);
      const bStage = bSkinDef && bSkin === MYTHIC_SKIN.id ? Math.max(1, b.mythicStage || 1) : 0;
      if (entry.weapon !== b.weapon || entry.skin !== bSkin || entry.att !== bAtt || entry.rar !== bRar || entry.stage !== bStage) {
        attachWeapon(entry.op.parts, g, b.weapon, bSkin, { attachments: b.weaponAttachments ?? [], attachmentRarities: b.attachmentRarities ?? [], mythicStage: bStage, mythicColor: bSkinDef?.aura });
        entry.weapon = b.weapon; entry.skin = bSkin; entry.att = bAtt; entry.rar = bRar; entry.stage = bStage;
      }
    }
    // Fase 4 — arremessáveis + paraquedas compartilham o mesmo contrato offline/online
    this.syncThrowables(dt);
    this.syncParachutes();
  }

  updateRing() {
    const r = this.sim.ring;
    this.ringWall.position.set(r.x, 23, r.z);
    this.ringWall.scale.set(r.radius, 1, r.radius);
    const t = performance.now() / 1000;
    for (const u of this.ringWall.userData.uniforms) {
      u.time.value = t;
      // FIX "mundo vermelho": parede acompanha o fog REAL da cena (applyNightness
      // muda cor do fog por pulso — sem isto a parede ignorava a névoa a 800 m).
      if (this.scene.fog) {
        u.fogColor.value.copy(this.scene.fog.color);
        u.fogDensity.value = this.scene.fog.density ?? 0.0035;
      }
    }
  }

  // Fase 8 — céu dinâmico: cada pulso do Ring aprofunda a noite (interpolação suave)
  updateSkyPhase(dt) {
    const target = nightnessFor(this.sim.ring?.pulse ?? 0);
    this.nightT = this.nightT ?? 0;
    this.nightT += (target - this.nightT) * Math.min(1, dt * 0.25); // ~12s de transição
    applyNightness(this.scene, this.nightT);
  }

  updateCamera(dt) {
    // Task 53 — TREM OFICIAL: câmera a bordo do vagão até o salto/chegada
    if (this.trainRide && !this.trainRide.done) {
      this.trainRide.update(dt);
      this.trainRide.cameraPose(this.camera);
      // salto (jogador saiu) ou chegada encerram a viagem — handover imediato
      if (this.sim.player && !this.sim.player.trainOnboard) {
        this.trainRide.end(this.trainRide.elapsedS() >= 16 ? 'arrived' : 'jumped');
      }
      return;
    }
    // Fase 11 — cinemática do trem do ZU captura a câmera até o handover
    if (this.trainIntro && !this.trainIntro.done) {
      this.trainIntro.update(dt);
      this.trainIntro.cameraPose(this.camera, this.sim.player);
      return;
    }
    // Fase 5 — espectador acompanha outro operativo
    if (this.spectating && this.spectateTarget) { this.updateSpectateCamera(dt); return; }
    const p = this.sim.player;
    const rig = this.camRig;
    if (this.viewMode === 'fps') {
      const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
      const fx = -Math.sin(p.yaw) * cp, fy = sp, fz = -Math.cos(p.yaw) * cp;
      const eyeHeight = p.sliding ? 0.92 : (p.crouching ? 1.12 : 1.62);
      const eye = new THREE.Vector3(p.x, p.y + eyeHeight, p.z);
      this.camera.position.lerp(eye, Math.min(1, dt * 18));
      this.camera.lookAt(eye.clone().add(new THREE.Vector3(fx, fy, fz).multiplyScalar(40)));
      this.cameraSway += dt * (p.sliding ? 15 : (p.sprinting ? 12 : 7));
      // Task 59 — câmera VIVA: bob vertical (contrato Fase 5) + balanço lateral
      // ELÍPTICO em espaço local da câmera + dip de pouso vindo do syncEntities.
      const bob = p.alive && !p.dropPhase ? Math.sin(this.cameraSway) * (p.sliding ? .026 : (p.sprinting ? .018 : .008)) : 0;
      const dip = this._dip?.v ?? 0;
      const bobX = (p.alive && !p.dropPhase && p.moving) ? Math.cos(this.cameraSway * .5) * (p.sprinting ? .014 : .006) : 0;
      this.camera.position.y += bob - dip;
      this.camera.translateX(bobX);
      this.firstPersonRig.position.x += ((p.ads ? .02 : 0) - this.firstPersonRig.position.x) * Math.min(1, dt * 10);
      this.firstPersonRig.position.y += (bob - dip * .6 - this.firstPersonRig.position.y) * Math.min(1, dt * 12);
      this.firstPersonRig.rotation.x += ((p.pitch * .18) - this.firstPersonRig.rotation.x) * Math.min(1, dt * 10);
      // Fase 10 — mãos articuladas: grip + indicador no gatilho + micro-vida;
      // flinch da própria câmera quando o jogador é atingido (roll + recuo)
      poseFirstPersonHands(this.firstPersonRig, { curl: .8 + this.camKick * 2.2, trigger: this.input.fire ? 1 : 0, breathe: Math.sin(this.animT * 2.1) * .03 });
      // Task 59 — SPRINT em 1ª pessoa: arma e braços abaixam (low-ready) e
      // voltam à mira ao atirar/mirar; pose ABSOLUTA a partir da base gravada
      // no rig (sem drift acumulado entre frames).
      const sprintRaw = (!p.ads && !this.input.fire) ? (this._sk ?? 0) : 0;
      this.fpsSprintK = (this.fpsSprintK ?? 0) + (sprintRaw - (this.fpsSprintK ?? 0)) * Math.min(1, dt * 10);
      const skF = this.fpsSprintK;
      const arms = this.firstPersonRig.userData.arms;
      if (arms) {
        const bL = arms.armL.userData.base, bR = arms.armR.userData.base;
        arms.armL.rotation.x = bL.x + skF * .3;
        arms.armR.rotation.x = bR.x + skF * .34;
        arms.armR.rotation.y = bR.y - skF * .18;
        arms.armL.rotation.y = bL.y + skF * .1;
      }
      if (this.firstPersonWeapon) {
        const wg = this.firstPersonWeapon.group;
        const wb = (wg.userData.sprintBase ??= { rx: wg.rotation.x, py: wg.position.y, pz: wg.position.z });
        wg.rotation.x = wb.rx - skF * .42;
        wg.rotation.y = skF * .26;
        wg.position.y = wb.py - skF * .07;
        wg.position.z = wb.pz + skF * .05;
      }
      const hf = this.hitFX.get('player');
      if (hf) {
        const env = (hf.age < .06 ? hf.age / .06 : Math.exp(-(hf.age - .06) / .17)) * hf.power;
        this.firstPersonRig.rotation.z = Math.sin(hf.angle) * env * .07;
        this.firstPersonRig.position.z = Math.cos(hf.angle) * env * .05;
      } else {
        this.firstPersonRig.rotation.z = 0;
        this.firstPersonRig.position.z = 0;
      }
      this.camKick *= Math.exp(-dt * 9);
      this.camera.rotation.z += this.camKick * .18;
      const zoom = p.attachStats?.adsZoom ?? 1;   // Fase 30 — Mira 4x aproxima
      const targetFov = p.ads ? 42 * zoom : (p.sliding ? 74 : (p.sprinting ? 72 : 68));
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
      this.camera.updateProjectionMatrix();
      this.sun.position.set(p.x - 160, 160, p.z - 240);
      this.sun.target.position.set(p.x, 0, p.z);
      return;
    }
    const targetDist = p.ads ? 2.2 : (p.sprinting ? 5 : 4.4);
    rig.curDist += (targetDist - rig.curDist) * Math.min(1, dt * 8);
    // altura do olhar: agachado ~1.15m / deslizando ~0.92m (Fase 5 + movimento avançado)
    const eyeH = p.sliding ? 0.92 : (p.crouching ? 1.15 : 1.62);
    if (!Number.isFinite(rig.curEye)) rig.curEye = eyeH;
    rig.curEye += (eyeH - rig.curEye) * Math.min(1, dt * 10);
    // posição da câmera: atrás/abaixo do olhar com deslocamento de ombro
    const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    const fx = -Math.sin(p.yaw) * cp, fy = sp, fz = -Math.cos(p.yaw) * cp;
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const eye = new THREE.Vector3(p.x, p.y + rig.curEye, p.z);
    const lookAt = eye.clone().addScaledVector(new THREE.Vector3(fx, fy, fz), 40);
    const shoulder = eye.clone().addScaledVector(new THREE.Vector3(rx, 0, rz), rig.shoulder * (p.ads ? .45 : 1));
    // origem recuada
    const camPos = shoulder.clone().addScaledVector(new THREE.Vector3(fx, fy, fz), -rig.curDist);
    camPos.y = Math.max(.4, camPos.y);
    // colisão simples da câmera: raycast do olho para a câmera
    const dir = camPos.clone().sub(eye);
    const len = dir.length(); dir.normalize();
    const ray = new THREE.Raycaster(eye, dir, 0, len);
    ray.camera = this.camera; // exigido p/ sprites (evita spam de erro no console)
    const hits = ray.intersectObjects(this.scene.children, true)
      .filter(h => h.object.isMesh && h.object.visible && !h.object.userData.noCamBlock && h.distance > .2);
    let finalPos = camPos;
    if (hits.length) {
      const blocked = hits.find(h => h.object.geometry?.type === 'BoxGeometry' || h.object.geometry?.type === 'CylinderGeometry');
      if (blocked && blocked.distance < len) {
        finalPos = eye.clone().addScaledVector(dir, Math.max(.5, blocked.distance - .3));
      }
    }
    this.camera.position.lerp(finalPos, Math.min(1, dt * 14));
    const lookTarget = shoulder.clone().addScaledVector(new THREE.Vector3(fx, fy, fz), 30);
    // recuo visual do disparo (decai exponencialmente; não altera a mira real)
    this.camKick *= Math.exp(-dt * 9);
    lookTarget.y += this.camKick * 26;
    this.camera.lookAt(lookTarget);
    // Fase 4 — tremor de explosão (só câmera; mira intacta)
    if (this.shake > 0.001) {
      // Fase 35 — multiplicador de tremor do jogador (KR_GFX_*, 0 = movimento reduzido)
      const amp = this.shake * (this.gfx?.shake ?? 1);
      this.camera.position.x += (Math.random() - .5) * amp;
      this.camera.position.y += (Math.random() - .5) * amp;
      this.camera.position.z += (Math.random() - .5) * amp;
      this.shake *= Math.exp(-dt * 6.5);
    }
    // FOV dinâmico
    const zoomTps = p.attachStats?.adsZoom ?? 1;  // Fase 30 — Mira 4x aproxima
    const targetFov = p.ads ? 42 * zoomTps : (p.sprinting ? 68 : 62);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
    this.camera.updateProjectionMatrix();
    // sol acompanha (sombras)
    this.sun.position.set(p.x - 160, 160, p.z - 240);
    this.sun.target.position.set(p.x, 0, p.z);
  }

  // Fase 26 — silhueta LARANJA do fieldScan: tinge os materiais do operativo
  // revelado (revelação atrás de cobertura é o contrato da skill — o pulso
  // atravessa paredes/Gloo). Sem churn por frame: só transiciona na mudança.
  #setBotRevealGlow(entry, revealed) {
    if (!entry?.op?.group) return;
    if (entry.revealGlow === revealed) return;
    entry.revealGlow = revealed;
    entry._revealStore ??= new Map();
    entry.op.group.traverse((o) => {
      if (!o.isMesh || !o.material?.emissive) return;
      const m = o.material;
      let store = entry._revealStore.get(m);
      if (!store) {
        store = { emissive: m.emissive.getHex(), intensity: m.emissiveIntensity };
        entry._revealStore.set(m, store);
      }
      if (revealed) {
        m.emissive.setHex(0xf97316);
        m.emissiveIntensity = Math.max(store.intensity, .8);
      } else {
        m.emissive.setHex(store.emissive);
        m.emissiveIntensity = store.intensity;
      }
    });
  }

  buildSimInput(dt) {
    const k = this.keys;
    let dx = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
    let dy = (k.has('s') ? 1 : 0) - (k.has('w') ? 1 : 0);
    // touch joystick
    if (this.hud.joy?.active) { dx = this.hud.joy.dx; dy = this.hud.joy.dy; }
    // Fase 26 — atordoamento pós-QTE do trem: trava movimento/ação, mantém olhar
    const trainStunned = this.trainStunUntil && performance.now() < this.trainStunUntil;
    if (trainStunned) { dx = 0; dy = 0; }
    // Task 53 — a bordo do trem: viagem é a entrada oficial — sem mover/atirar;
    // o salto sai pela janela das portas (borda de ESPAÇO, offline e online).
    const onboard = !!this.sim.player?.trainOnboard;
    if (onboard) { dx = 0; dy = 0; }
    const touch = this.hud.touchState ?? {};
    if (onboard && !this._doorJumpLatch && (k.has(' ') || !!touch.jump)) {
      this._doorJumpLatch = true;
      this.#requestDoorJump();
    }
    if (!k.has(' ') && !touch.jump) this._doorJumpLatch = false;
    const abilityTouch = !!touch.ability;
    const abilityTouchPressed = abilityTouch && !this.abilityTouchDown;
    this.abilityTouchDown = abilityTouch;
    const input = {
      ...this.input,
      seq: this.sim.tick + 1,
      dx, dy,
      sprint: !trainStunned && !onboard && (k.has('shift') || !!touch.sprint),
      crouch: k.has('c') || !!touch.crouch,
      jump: !trainStunned && !onboard && (k.has(' ') || !!touch.jump),
      fire: !trainStunned && !onboard && (this.input.fire || !!touch.fire),
      ads: this.input.ads || !!touch.ads,
      crouch: !!(this.input.crouch || touch.crouch), // Fase 5 — C alterna; touch segura
      reload: !trainStunned && !onboard && (this.input.reload || !!touch.reload),
      interact: !trainStunned && !onboard && (this.input.interact || !!touch.interact),
      medkit: !trainStunned && !onboard && (this.input.medkit || !!touch.medkit),
      throw: !trainStunned && !onboard && (this.input.throw || !!touch.throw),
      gloo: !trainStunned && !onboard && (this.input.gloo || !!touch.gloo),
      ability: !trainStunned && !onboard && (this.abilityPending || abilityTouchPressed), // Fase 8 — online autoritativa
      slot: this.pendingSlot ?? 0,
    };
    // consome one-shots
    this.input.reload = false; this.input.interact = false; this.input.medkit = false;
    this.input.throw = false; this.input.gloo = false;
    this.abilityPending = false;
    this.pendingSlot = 0;
    return input;
  }

  handleEvents() {
    const p = this.sim.player;
    for (const e of this.sim.consumeEvents()) {
      switch (e.type) {
        case 'shot': {
          const dist = e.owner === 'player' ? 0 : Math.hypot(e.x - p.x, e.z - p.z);
          // Fase 31 — Silenciador: sem clarão de boca + áudio "thump" abafado
          // DEDICADO (antes: hack de distância reusando shot() cru)
          if (e.silenced) this.audio.shotSilenced(e.weapon, dist);
          else {
            this.effects.muzzleFlash(new THREE.Vector3(e.x, e.y, e.z));
            this.audio.shot(e.weapon, dist);
          }
          if (e.owner === 'player') this.camKick = Math.min(0.03, this.camKick + (e.silenced ? 0.007 : 0.011));
          break;
        }
        case 'hit': {
          if (e.victim === 'player') {
            this.effects.hitFlesh(new THREE.Vector3(e.x, e.y, e.z));
            this.audio.hurt();
            this.hud.damageFlash = .4;
            this.#registerHit(e.victim, e); // Fase 10 — corpo também reage
          } else if (e.kind === 'explosion') {
            // Fase 27 — granada: SÓ o número (FX/áudio da explosão já cobrem o
            // impacto — sem hitmarker/flesh duplicado); resta no acerto próprio
            if (e.owner === 'player') this.damageNumbers?.spawn({ x: e.x, y: e.y, z: e.z, damage: e.damage, victim: e.victim });
          } else if (e.owner === undefined || e.owner === 'player') {
            // hitmarker/número apenas para acertos próprios (Fase 27: o sim
            // envia owner — bot×bot deixa de vazar no marker)
            this.effects.hitFlesh(new THREE.Vector3(e.x, e.y, e.z));
            this.audio.hit(e.head);
            this.hud.hitmarker(e.head);
            this.damageNumbers?.spawn({ x: e.x, y: e.y, z: e.z, damage: e.damage, head: e.head, victim: e.victim });
          }
          // Fase 10 — TODO alvo de carne reage ao impacto (bots/remotos incluídos)
          if (e.victim !== 'player') this.#registerHit(e.victim, e);
          break;
        }
        case 'impact': {
          this.effects.impact(new THREE.Vector3(e.x, e.y, e.z), e.kind);
          // Fase 5 — orifício persistente em superfícies sólidas (porta entra na Fase 25)
          if (e.kind === 'wall' || e.kind === 'gloo' || e.kind === 'door') this.effects.bulletHole(new THREE.Vector3(e.x, e.y, e.z));
          break;
        }
        case 'melee': {
          // Fase 28 — feedback corpo-a-corpo completo no acerto PRÓPRIO: número
          // flutuante + hitmarker + puff de carne, a MESMA gramática do hit de
          // bala (o evento só chega ao atacante no online; offline o owner filtra).
          if (e.owner === 'player') {
            this.effects.hitFlesh(new THREE.Vector3(e.x, e.y, e.z));
            this.audio.hit(false);
            this.hud.hitmarker(false);
            this.damageNumbers?.spawn({ x: e.x, y: e.y, z: e.z, damage: e.damage, head: false, victim: e.victim });
          }
          break;
        }
        case 'kill':
          this.hud.killfeed('VOCÊ', e.target, e.head, true);
          this.hud.feed('ABATE', `${e.target} neutralizado.${e.finish ? ' (finalização)' : ''} +${e.xp} XP / +${e.krc} KRC.`, 'good');
          this.audio?.killConfirm?.(e.head); // Fase 18 — confirmação sonora de abate
          break;
        case 'knock':
          this.hud.feed('ABATE', `${e.target} nocauteado — finalize ou aguarde o sangramento. +${e.xp} XP.`, 'good');
          this.audio?.knockTick?.(); // Fase 18 — tick de nocaute
          this.damageNumbers?.popupKnock(); // Fase 27 — online: mesmo popup (knock chega no batch do hit)
          break;
        case 'botKnocked':
          this.hud.feed('ABATE', `${e.target} nocauteado — finalize ou aguarde o sangramento. +${e.xp} XP.`, 'good');
          this.audio?.knockTick?.(); // Fase 18 — tick de nocaute
          this.damageNumbers?.popupKnock(); // Fase 27 — popup NOCAUTE onde o hit letal pousou
          break;
        case 'botKnockFeed':
          this.hud.killfeed(e.by === 'player' ? 'VOCÊ' : 'RING', e.target, false, e.by === 'player');
          break;
        case 'revived': {
          const selfTarget = e.isSelf || e.target === 'player' || e.target === p.id;
          const message = e.isSelf
            ? 'Você se recuperou usando um medkit.'
            : `${e.by} ${e.item === 'medkit' ? 'prestou primeiros socorros a' : 'reviveu'} ${selfTarget ? 'você' : e.targetName}.${selfTarget ? ' De volta ao combate!' : ''}`;
          this.hud.feed(e.item === 'medkit' ? 'PRIMEIROS SOCORROS' : 'SQUAD', message, 'good');
          this.audio?.pickup?.();
          break;
        }
        case 'knocked':
          this.hud.feed('ZU', `NOCAUTEADO: até 7 s para usar H/✚ em si ou receber primeiros socorros; E canaliza o revive de um aliado. Rasteje para cobertura.`, 'bad');
          this.audio?.heartbeat?.();
          this.hud.damageFlash = .6;
          break;
        case 'killfeed':
          this.hud.killfeed(e.killer, e.victim, !!e.head, false, !!e.knock);
          break;
        case 'botKill':
          // Wart B — a fonte letal chega em e.kind: morte pela ANOMALIA Khaaos
          // (quantum, sim3d #drainQuantumShield) não é "RING" — o HUD nomeia a
          // fonte real (mesmo rótulo do servidor: shared/worldKillers.ts).
          this.hud.killfeed(e.kind === 'quantum' ? 'ANOMALIA' : 'RING', e.target, false, false);
          break;
        case 'matchStart':
          this.hud.feed('ZU', `Partida iniciada. Seed ${e.seed}. Bots no ring: ${e.bots}.`, 'warn');
          // Fase 12 — remotos entram na partida AQUI (modal ZU fecha, trem
          // sincronizado pelo startedAt do servidor). O iniciador local já
          // fechou o ZU — hook é no-op para ele exceto pelo sync do trem.
          this.onMatchStartEvent?.(e);
          break;
        // Task 53 — protocolo do trem: chegada e desbloqueio de combate (offline
        // emite da sim; online chega pelos eventos da sala autoritativa).
        case 'trainArrived':
          this.hud.feed('ZU', `CHEGADA — desembarque concluído. Combate liberado em ${e.graceS ?? 15}s (grace global).`, 'warn');
          this.hud.setMatchStatus(`GRACE ZU // COMBATE EM ${e.graceS ?? 15}s`);
          break;
        case 'combatUnlocked':
          this.hud.feed('ZU', 'COMBATE LIVRE — protocolo oficial do trem cumprido.', 'good');
          this.hud.setMatchStatus('COMBATE LIVRE // RING');
          break;
        case 'botDoorJump':
          this.hud.feed('ZU', 'Operativo saltou pela porta na rota (entrada oficial).', '');
          break;
        case 'hurt':
          if (e.kind === 'ring') {
            if (!this._ringWarned || performance.now() - this._ringWarned > 4000) {
              this._ringWarned = performance.now();
              this.hud.feed('ANEL', 'Você está fora da zona segura.', 'bad');
              this.audio.ringWarn();
            }
            // Fase 10 — queimadura do Ring provoca flinch genérico sutil
            if (p.alive && !p.knocked) this.hitFX.set('player', { angle: 0, power: .3, age: 0 });
          }
          break;
        case 'pulse': {
          // Fase 42 — README (Mundos W1–W4): o anel FECHA sobre o setor canônico
          // do mundo — a leitura nomeia o destino (Templo/Vila Sombria/Prisão/Parque).
          const destino = e.finalName ? ` O anel fecha em direção ao ${e.finalName}.` : '';
          this.hud.feed('PULSO', `Anel recalibrado. Setor seguro: ${Math.round(e.target)}m.${destino}`, 'warn');
          this.audio.ringWarn();
          break;
        }
        case 'ringDamage':
          if (!this._ringWarned || performance.now() - this._ringWarned > 4000) {
            this._ringWarned = performance.now();
            this.hud.feed('ANEL', 'Você está fora da zona segura.', 'bad');
            this.audio.ringWarn();
          }
          break;
        case 'loot':
          this.audio.pickup();
          // Fase 30 — anexo avulso tem leitura própria (peça técnica)
          if (e.kind === 'attachment') {
            this.hud.feed('ANEXO', `${e.item} — socket livre da AR-47 preenchido (${e.installed ?? 0}/4${e.pocket ? ` · bolso ×${e.pocket}` : ''}).`, 'good');
          } else {
            this.hud.feed('LOOT', `${e.item}${e.attachments?.length ? ` · ${e.attachments.length} anexo(s)` : ''} adicionado à Packbag.`);
          }
          break;
        case 'gear': {
          // Fase 28 — equipamento vira SILHUETA: aplica o nível novo no
          // operativo (jogador ou bot dono do evento via nome do gear).
          this.hud.feed('EQUIPAR', `${e.name ?? 'Equipamento'} equipado.`, 'good');
          this.audio.pickup();
          this.applyGearVisuals();
          break;
        }
        case 'deathBox':
          // Fase 28 — farol de espólio: caixa entra via syncLoot (item real);
          // aqui só o toast tático.
          this.hud.feed('ESPÓLIO', `${e.victim ?? 'Operativo'} abatido — caixa marcada no local.`, 'warn');
          break;
        case 'supplyDrop':
          this.hud.feed('LOGÍSTICA', `Airdrop lançado — caixa blindada a ${Math.round(Math.hypot(e.x - p.x, e.z - p.z))}m. AR-47 lendário a bordo.`, 'warn');
          this.audio.ringWarn(); // alarme tático (mesma família de avisos do Ring)
          this.shake = Math.max(this.shake, .08);
          break;
        case 'extractStarted':
          this.hud.feed('ZEX', `Canalização iniciada — permaneça imóvel e evite dano por ${ZEX_CHANNEL_SECONDS} s.`, 'warn');
          break;
        case 'extractCancelled':
          this.hud.feed('ZEX', 'Canalização interrompida. O terminal continua disponível.', 'bad');
          break;
        case 'extractUnavailable':
          this.hud.feed('ZEX', 'Terminal ocupado por outro operativo.', 'warn');
          break;
        case 'extract':
          this.hud.feed('ZEX', `Extração confirmada. Terminal ${e.count}/3. +${EXTRACT_XP} XP.`, 'good');
          break;
        case 'mythic': {
          // Fase 30/32 — evolução da skin mítica (4 estágios; nome/aura por arma)
          const mDef = MYTHIC_SKINS[e.weapon] ?? MYTHIC_SKIN;
          this.hud.feed('MÍTICA', `${mDef.name} evoluiu — ESTÁGIO ${e.stage}: ${e.name}.`, 'good');
          this.audio?.killConfirm?.(true);
          this.shake = Math.max(this.shake, .05);
          break;
        }
        case 'reload': this.audio.reload(); break;
        case 'reloaded': break;
        case 'weaponSwitch': break;
        case 'medkit': this.hud.feed('OFICINA', 'Kit médico aplicado. +30 VL.', 'good'); break;
        case 'ability': {
          // Fase 8 — online: distingue o próprio disparo da habilidade de outro operativo
          const prefix = (!e.isSelf && e.by) ? `${e.by} · ` : '';
          let message = `${e.name}: ${e.description}`;
          if (e.effect === 'heal') message = `${e.name}: +${Math.round(e.healed)} VL.`;
          else if (e.effect === 'recon') message = `${e.name}: ${e.targets} contato(s) marcado(s) no minimapa por 3 s.`;
          else if (e.effect === 'fieldScan') message = `${e.name}: pulso de ${Math.round(e.radius ?? 20)} m — ${e.targets} rival(s) atrás de cobertura com silhueta laranja por 4 s.`;
          else if (e.effect === 'stun') message = `${e.name}: ${e.targets} bot(s) interrompido(s) sem dano.`;
          else if (e.effect === 'ringRead') message = `${e.name}: próximo pulso em ${e.nextPulseSeconds.toFixed(1)} s.`;
          else if (e.effect === 'ringForecast') message = `${e.name}: próximo pulso em ${e.nextPulseSeconds.toFixed(1)} s; raio-alvo ${Math.round(e.targetRadius)} m.`;
          else if (e.effect === 'terminalScan') message = e.terminalLabel
            ? `${e.name}: ${e.terminalLabel} a ${e.terminalDistance} m; marcado no minimapa por 4 s.`
            : `${e.name}: nenhum terminal ZEX ativo disponível.`;
          this.hud.feed('HABILIDADE', `${prefix}${message}`, e.isSelf === false ? 'warn' : 'good');
          // Fase 9 — VFX/SFX sincronizados: aura no caster + assinatura sonora
          if (e.x !== undefined) {
            const pos = new THREE.Vector3(e.x, (e.y ?? 0) + 1.1, e.z);
            this.effects.abilityAura(pos, e.effect, e.radius ?? 18);
            const p = this.sim.player;
            this.audio.ability(e.effect, e.isSelf ? 0 : Math.hypot(e.x - p.x, e.z - p.z));
          }
          break;
        }
        case 'abilityUnavailable':
          this.hud.feed('HABILIDADE', 'Vida cheia: Coágulo de Campo não consumiu recarga.', 'warn');
          break;
        // ---------- Fase 10 — Oficiais de Classe Especial no Ring (POJ 7º/9º) ----------
        case 'officers_deployed':
          this.hud.feed('POJ', `${e.count} OFICIAIS DE CLASSE ESPECIAL entraram no Ring (artigo ${e.article ?? '—'}): ${(e.names ?? []).join(', ')}.`, 'warn');
          this.audio?.ringWarn?.();
          break;
        case 'officers_departed':
          this.hud.feed('POJ', 'Oficiais de Classe Especial se retiraram do Ring — duração autorizada encerrada.', 'warn');
          break;
        case 'operative_error': // Fase 11 — insígnia OCE recusada pelo regramento
          this.hud.feed('POJ', e.reason === 'oficiais_fora_da_janela'
            ? `Insígnia OCE recusada: ${e.detail ?? 'oficiais fora da janela do 7º/9º artigo'}.`
            : e.reason === 'insignia_ocupada'
              ? 'Insígnia OCE já reivindicada por outro operativo nesta partida.'
              : `Identidade recusada: ${e.reason ?? 'desconhecida'}.`, 'bad');
          break;
        case 'patente': // Fase 11 — patente do perfil confirmada pelo servidor
          this.hud.feed('POJ', `Patente confirmada no nametag: ${e.patente}.`, 'good');
          break;
        case 'court_verdict': { // Fase 12 — veredito da Corte Marcial ao vivo
          // Fase 13 — cache p/ ata do eliminado: enriquece o replay com o ΔKRC
          // entregue ao vivo mesmo quando o docket do servidor ainda não o tem.
          (this.courtVerdictEvents ??= {})[e.caseId] = e;
          const rotulo = { afastamento: 'AFASTAMENTO DESONROSO', reducao_patente: 'REDUÇÃO DE PATENTE',
            honras_de_guerra: 'HONRAS DE GUERRA', absolvicao: 'ABSOLVIÇÃO' }[e.veredito] ?? String(e.veredito ?? '').toUpperCase();
          const krcTxt = e.krcApplied
            ? `${e.krcDelta >= 0 ? '+' : ''}${e.krcDelta} KRC${e.krcBalance != null ? ` (saldo ${e.krcBalance})` : ''}`
            : 'sem efeito em KRC';
          this.hud.feed('CORTE MARCIAL', `Caso ${e.caseId}: ${rotulo} — registro ${e.registro ?? '—'}, ${krcTxt}.`, e.krcDelta >= 0 ? 'good' : 'bad');
          if (e.patente) this.hud.feed('POJ', `Registro militar atualizado: patente ${e.patente}.`, 'warn');
          this.audio?.ui?.();
          break;
        }
        case 'empty': this.hud.feed('ARSENAL', 'Pente vazio — recarregue [R].', 'bad'); break;
        // ---------- Fase 17/18 — sobrevivências do mundo (FX + áudio imersivo) ----------
        case 'tsunamiStart':
          this.survivalFX?.handleEvent(e);
          this.shake = Math.max(this.shake, .22);
          this.audio?.survival?.('tsunami', true);
          this.audio?.hazardStinger?.('tsunami');
          this.hud.feed('SOBREVIVÊNCIA', `TSUNAMI: nível do mar subindo até ${Math.round(e.submergeBelowY ?? 90)}m — busque terreno ALTO (${Math.round(e.durationSeconds ?? 40)}s).`, 'bad');
          break;
        case 'tsunamiEnd':
          this.survivalFX?.handleEvent(e);
          this.audio?.survival?.('tsunami', false);
          this.hud.feed('SOBREVIVÊNCIA', 'Nível do mar recuando. Área baixa liberada.', 'good');
          break;
        case 'sporeFogStart': // Fase 42 — W2 "Emboscada Verde" (README)
          this.survivalFX?.handleEvent(e);
          this.shake = Math.max(this.shake, .18);
          this.audio?.survival?.('spore', true);
          this.audio?.hazardStinger?.('spore');
          this.hud.feed('SOBREVIVÊNCIA', `EMBOSCADA VERDE: neblina com esporos tóxicos sobe até ${Math.round(e.sporeTopY ?? 90)}m — não fique no terreno baixo (${Math.round(e.durationSeconds ?? 45)}s).`, 'bad');
          break;
        case 'sporeFogEnd':
          this.survivalFX?.handleEvent(e);
          this.audio?.survival?.('spore', false);
          this.hud.feed('SOBREVIVÊNCIA', 'A neblina de esporos se dissipa. Terreno baixo liberado.', 'good');
          break;
        case 'toxicSmokeStart': // Fase 42 — W3 "Assassino Silencioso" (README)
          this.survivalFX?.handleEvent(e);
          this.shake = Math.max(this.shake, .22);
          this.audio?.survival?.('smoke', true);
          this.audio?.hazardStinger?.('smoke');
          this.hud.feed('SOBREVIVÊNCIA', `ASSASSINO SILENCIOSO: fumaça tóxica inunda o terreno baixo até ${Math.round(e.smokeTopY ?? 180)}m — suba ou pereça (${Math.round(e.durationSeconds ?? 35)}s).`, 'bad');
          break;
        case 'toxicSmokeEnd':
          this.survivalFX?.handleEvent(e);
          this.audio?.survival?.('smoke', false);
          this.hud.feed('SOBREVIVÊNCIA', 'A fumaça tóxica se assenta. Área baixa liberada.', 'good');
          break;
        case 'gravityAnomalyStart': // Fase 42 — Pulso Khaaos do CIGKV (README, Protocolo CIGKV)
          this.survivalFX?.handleEvent(e);
          this.audio?.survival?.('gravity', true);
          this.audio?.hazardStinger?.('gravity');
          this.hud.feed('SOBREVIVÊNCIA', `PULSO KHAAOS: gravidade ${e.gravityScale ?? .35}× — domos de contenção ativos nos pilões (drenam escudo fora deles).`, 'warn');
          break;
        case 'gravityAnomalyEnd':
          this.survivalFX?.handleEvent(e);
          this.audio?.survival?.('gravity', false);
          this.hud.feed('SOBREVIVÊNCIA', 'Pulso Khaaos dissipado. Gravidade restaurada.', 'good');
          break;
        case 'acidRain':
          this.survivalFX?.handleEvent(e);
          this.audio?.survival?.('acid', true, { duration: 2.2 }); // hiss curto por pulso
          if (!this._acidWarned || performance.now() - this._acidWarned > 30000) {
            this._acidWarned = performance.now();
            this.hud.feed('SOBREVIVÊNCIA', 'Chuva ácida no setor — procure cobertura.', 'warn');
          }
          break;
        // ---------- Fase 4 — infiltração aérea + arremessáveis ----------
        case 'airdrop':
          this.hud.feed('ZU', `Infiltração aérea confirmada. Altitude ${Math.round(e.altitude)}m — paraquedas abre a 45m.`, 'warn');
          break;
        case 'land':
          this.audio.land();
          this.shake = Math.max(this.shake, .12);
          this.hud.feed('ZU', 'Aterrissagem confirmada. Ring em operação.', 'good');
          break;
        case 'frag':
          if (e.owner === 'player') this.audio.fragThrow();
          else this.audio.fragThrow();
          break;
        case 'explosion': {
          const dist = Math.hypot(e.x - p.x, e.z - p.z);
          this.effects.explosion(new THREE.Vector3(e.x, e.y, e.z));
          this.audio.explosion(dist);
          this.shake = Math.max(this.shake, Math.max(0, .3 - dist * .004));
          // Fase 21 — marca de explosão no chão (mesma infra de decals):
          // explosão alta deixa marca mais fraca (blast dissipa no ar).
          const yBlast = Number.isFinite(e.y) ? e.y : 0;
          const scorchPower = Math.max(.55, Math.min(1, 1 - yBlast / 9));
          this.deathDecals?.spawn({
            kind: 'scorch', x: e.x, z: e.z, power: scorchPower,
            seed: Math.floor(Math.abs(e.x * 73.13 + e.z * 179.71) * 100) % 100000,
          });
          break;
        }
        case 'gloo': {
          if (e.owner !== 'player') this.audio.gloo();
          // Fase 21 — geada na base onde a parede assentou (dono tanto faz:
          // a marca é do mundo, não do jogador)
          this.deathDecals?.spawn({
            kind: 'gloo', x: e.x, z: e.z, yaw: e.rot ?? 0, angle: Math.PI / 2,
            power: .62,
            seed: Math.floor(Math.abs(e.x * 131.7 + e.z * 57.3) * 100) % 100000,
          });
          break;
        }
        case 'glooDown': {
          this.hud.feed('ARSENAL', e.destroyed ? 'Gloo Wall destruída.' : 'Gloo Wall dissolvida.');
          // Fase 21 — cacos de gelo onde a parede estava (cache de posições;
          // o evento não traz x/z). Só quando DESTRUÍDA: dissolver não raspa o chão.
          const wp = this.wallPositions.get(e.id);
          if (wp && e.destroyed) {
            this.deathDecals?.spawn({
              kind: 'gloo', x: wp.x, z: wp.z, power: .95,
              seed: Math.floor(Math.abs(wp.x * 211.3 + wp.z * 97.9) * 100) % 100000,
            });
          }
          break;
        }
        // Fase 25 — portas: áudio dos toggles (creak) e da destruição (madeira)
        case 'doorToggle': {
          // Fase 25.1/26 — material derivado do kind da estrutura (hangar/depot
          // = metal): o evento carrega o kind, o áudio espera 'metal'/'wood'
          this.audio.door?.(e.open, Math.hypot(e.x - p.x, e.z - p.z), doorMaterialOf(e.kind));
          break;
        }
        case 'doorDown': {
          this.audio.doorDown?.(Math.hypot(e.x - p.x, e.z - p.z), doorMaterialOf(e.kind));
          break;
        }
        // Fase 26 — vidro: estilhaço audível no windowDown + ping no melee
        case 'windowDown': {
          this.audio.windowDown?.(Math.hypot(e.x - p.x, e.z - p.z));
          this.effects.impact(new THREE.Vector3(e.x, (e.y ?? 2) + .3, e.z), 'glass');
          break;
        }
        case 'windowHit': {
          this.effects.impact(new THREE.Vector3(e.x, (e.y ?? 2) + .3, e.z), 'glass');
          break;
        }
        case 'victory': this.#endMatch(true, e); break;
        case 'matchEnd': this.#endMatch(false, { kills: p.kills, xp: p.xp, krc: p.krc, ...e }); break;
        case 'eliminated': this.enterSpectate(e); break;
      }
    }
  }

  // ---------- Fase 10 — reação de impacto ----------
  // Converte o ponto de impacto (mundo) em ângulo no espaço LOCAL do modelo
  // desfeito o rotation.y real do grupo (= yaw desde a Task 62): 0 = frente do
  // modelo, +π/2 = lado +x do modelo, π = costas. Registra flinch só para vivos.
  #registerHit(victimId, e) {
    const s = this.sim;
    const actor = victimId === 'player' ? s.player : (s.bots ?? []).find((b) => b.id === victimId);
    if (!actor || !actor.alive) return;
    const dx = e.x - actor.x, dz = e.z - actor.z;
    const th = actor.yaw;
    const cos = Math.cos(th), sin = Math.sin(th);
    const lx = dx * cos - dz * sin;  // mundo → local (inverso de rotation.y)
    const lz = dx * sin + dz * cos;
    this.hitFX.set(victimId, { angle: Math.atan2(lx, -lz), power: e.head ? 1 : .8, age: 0 });
  }

  // snapshot imutável do flinch p/ animateOperative (ou null)
  #hitParam(actorId) {
    const hf = this.hitFX.get(actorId);
    return hf ? { angle: hf.angle, power: hf.power, age: hf.age } : null;
  }

  updateInteractionPrompt() {
    const p = this.sim.player;
    if (!p.alive) { this.hud.prompt(null); this.hud.target(null); return; }
    // Fase 7 — caído: dica de rastejo + estado de revive em andamento
    if (p.knocked) {
      const reviving = (p.reviveProgress ?? 0) > 0;
      this.hud.prompt(reviving ? `REVIVENDO VOCÊ — ${(p.reviveProgress / DBNO.reviveSeconds * 100) | 0}%` : 'NOCAUTADO — rasteje para cobertura e aguarde revive');
      this.hud.target(null);
      return;
    }
    // Fase 7 — reviver companheiro caído do mesmo esquadrão (prioridade sobre loot)
    if (this.sim.squad) {
      const candidates = [this.sim.player, ...(this.sim.bots ?? [])];
      let mate = null, bestD = DBNO.reviveDistance;
      for (const c of candidates) {
        if (c === p || !c.alive || !c.knocked) continue;
        if (p.squad && c.squad !== p.squad) continue;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < bestD) { bestD = d; mate = c; }
      }
      if (mate) {
        const pct = Math.min(100, Math.round(((mate.reviveProgress ?? 0) / DBNO.reviveSeconds) * 100));
        this.hud.prompt(`[E] SEGURE para reviver ${mate.name} — ${pct}%`);
        this.hud.target(null);
        return;
      }
    }
    if (p.zexChannel) {
      const pct = Math.min(100, Math.round((p.zexChannel.progress ?? 0) * 100));
      this.hud.prompt(`ZEX — canalizando ${pct}% · não se mova`);
      this.hud.target(null);
      return;
    }
    let text = null, textD = Infinity;
    for (const i of this.sim.loot) {
      if (!i.active) continue;
      const d = Math.hypot(i.x - p.x, i.z - p.z);
      if (d < 2.6 && d < textD) { text = `[E] Coletar ${i.name || i.id}${i.rarity ? ' — ' + i.rarity : ''}`; textD = d; }
    }
    if (!text) {
      for (const t of this.sim.terminals) {
        if (!t.active) continue;
        if (Math.hypot(t.x - p.x, t.z - p.z) < 3.4) {
          text = t.channeling ? `[ZEX] Em uso — ${Math.round((t.channelProgress ?? 0) * 100)}%` : `[E] Iniciar extração no ${t.label || 'terminal ZEX'} — ${ZEX_CHANNEL_SECONDS} s`;
          break;
        }
      }
    }
    // Fase 25 — porta no alcance (estilo Free Fire): mostra se for o alvo MAIS
    // PRÓXIMO do E (mesma regra do #interact da sim)
    // Fase 26 — BARRA DE HP do alvo quebrável (porta/janela): painel HUD com
    // nome + hp/max enquanto o alvo está no alcance (doors/windows da sim OU
    // do snapshot — mesmo código nos 3 modos). Íntegro some do painel.
    let target = null, doorText = null;
    if (!p.knocked) {
      let door = null, doorD = Infinity;
      for (const d of this.sim.doors ?? []) {
        if (d.destroyed) continue;
        const dd = Math.hypot(d.x - p.x, d.z - p.z);
        if (dd < 2.3 && dd < doorD) { door = d; doorD = dd; }
      }
      if (door && doorD <= textD) {
        doorText = door.open ? '[E] Fechar porta' : '[E] Abrir porta';
        target = { label: doorMaterialOf(door.kind) === 'metal' ? 'PORTA METÁLICA' : 'PORTA', hp: Math.max(0, Math.round(door.hp ?? 0)), max: doorHpFor(door.kind), cls: doorMaterialOf(door.kind) };
      }
      // Fase 26 — janela no alcance (o E não interage com vidro; o painel é
      // informativo: mostra a integridade do vidro que você vai arrebentar)
      let win = null, winD = Infinity;
      for (const w of this.sim.windows ?? []) {
        if (w.destroyed) continue;
        const dd = Math.hypot(w.x - p.x, w.z - p.z);
        if (dd < 2.3 && dd < winD && Math.abs((w.y0 ?? 0) - p.y) < 3.2) { win = w; winD = dd; }
      }
      if (win && (!door || winD < doorD)) {
        target = { label: 'JANELA', hp: Math.max(0, Math.round(win.hp ?? 0)), max: WINDOW.hp, cls: 'glass' };
      }
      // Fase 31 — barra de HP da JANELA AO MIRAR: raio da crosshair (câmera) ×
      // painéis ÍNTEGROS até 45 m — a barra aparece ONDE A MIRA APONTA (leitura
      // Free Fire: mirou no vidro, viu a integridade antes de estilhaçar),
      // espelhando o painel da porta no alcance do E. Sem alvo próximo, o raio
      // decide; vidro destruído não tem barra (não há mais o que quebrar).
      if (!target && this.camera) {
        const dir = this._camDir ?? (this._camDir = new THREE.Vector3());
        this.camera.getWorldDirection(dir);
        const o = this.camera.position;
        const intact = (this.sim.windows ?? []).filter((w) => !w.destroyed);
        const hit = intact.length ? windowPaneOnSegment(o.x, o.y, o.z, o.x + dir.x * 45, o.y + dir.y * 45, o.z + dir.z * 45, intact) : null;
        if (hit) target = { label: 'JANELA', hp: Math.max(0, Math.round(hit.pane.hp ?? 0)), max: WINDOW.hp, cls: 'glass' };
      }
    }
    this.hud.prompt(doorText);
    this.hud.target(target);
  }

  // Fase 25/26 — a sincronização visual de portas+janelas é o syncDoors()
  // canônico (acima); o antigo #syncDoorVisuals privado foi ABSORVIDO por ele
  // (antes o online/espectador não animava folhas — só o modo offline).

  // Fase 4 — áudio de queda + deriva das nuvens (chamado pelos dois loops)
  updateDropFX(dt) {
    const p = this.sim.player;
    const dropping = !!p?.dropPhase && p.alive && !this.ended;
    if (dropping) {
      this.audio.wind(true, p.dropPhase === 'sky' ? .34 : .2);
      if (this._wasPhase === 'sky' && p.dropPhase === 'chute') this.audio.chuteOpen();
    } else if (this._wasPhase) {
      this.audio.wind(false);
    }
    this._wasPhase = dropping ? p.dropPhase : null;
    // nuvens: deriva lenta constante
    const clouds = this.scene.userData.clouds;
    if (clouds) clouds.rotation.y += dt * 0.004;
  }

  // ---------- loop ----------
  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(.1, this.clock.getDelta());
    this.animT += dt;
    this.updatePerf(dt); // Fase 35 — DRS + auto-tier + telemetria (laço fechado de performance)

    // passo fixo da simulação
    if (!this.zuOpen && !this.ended) {
      this.accumulator += dt;
      let guard = 0;
      while (this.accumulator >= SIM_DT && guard++ < 5) {
        const input = this.buildSimInput(SIM_DT);
        this.sim.step(input, SIM_DT);
        this.accumulator -= SIM_DT;
      }
      this.handleEvents();
    }
    this.updateTrainHud(); // Task 53 — fases do trem + countdown do grace no HUD
    this.syncLoot();
    this.syncDoors(); // Fase 25/26 — folhas de porta + vidro seguem o estado autoritativo
    this.syncEntities(dt);
    this.applyGearVisuals(); // Fase 28 — espelha gear da sim na silhueta (com cachê)
    tickMythicWeapons(this.animT); // Fase 30 — pulso emissivo das armas míticas
    tickVegetationWind(this.scene, this.animT); // Fase 31 — vento nas copas/grama
    // Fase 32 — LOD de distância da grama: chunks full/sparse/hidden pela
    // posição da CÂMERA (1 teste por chunk — custo O(chunks) por frame)
    if (this.scene.userData.grassLOD && this.camera?.position) {
      this.scene.userData.grassLOD.update(this.camera.position.x, this.camera.position.z);
    }
    // Fase 39 — sombras de contato do SCRUB de Barburhen em BANDAS DE
    // DISTÂNCIA: alpha por instância pela distância da câmera (cheio perto,
    // raleia suave e morre antes do fog — mesmo vocabulário de bandas do
    // capim). Custo O(scrub) por frame, zero quando o mundo não tem scrub.
    if (this.scene.userData.scrubBandShadows && this.camera?.position) {
      this.scene.userData.scrubBandShadows.update(this.camera.position.x, this.camera.position.z);
    }
    // Fase 40 — sombras em banda dos PROPS DOS DISTRITOS (dressing F22):
    // mesmo alpha por instância, campo por cenário (lista — um handle por
    // build). Custo O(dressing), zero quando a banda está vazia.
    const dressingShadows = this.scene.userData.dressingBandShadows;
    if (dressingShadows?.length && this.camera?.position) {
      for (const f of dressingShadows) f.update(this.camera.position.x, this.camera.position.z);
    }
    this.updateRing();
    this.updateSkyPhase(dt); // Fase 8 — céu dinâmico por pulso do Ring
    // Fase 16 (P1) — marcos de mundo: deriva dos fragmentos, fumaça, fendas
    const marksAnim = this.scene.userData.worldMarks?.animators;
    if (marksAnim) for (const fn of marksAnim) fn(dt, this.animT);
    // Fase 22 — cenários vivos: bob dos estilhaços, chamas, bandeiras, rotor
    const dressingAnim = this.scene.userData.districtDressing?.animators;
    if (dressingAnim) for (const fn of dressingAnim) fn(dt, this.animT);
    // Fase 23 — interiores: flicker das lâmpadas e telas
    const shaftsAnim = this.scene.userData.lightshafts?.animators; // Fase 24
    if (shaftsAnim) for (const fn of shaftsAnim) fn(dt, this.animT);
    const interiorsAnim = this.scene.userData.interiors?.animators;
    if (interiorsAnim) for (const fn of interiorsAnim) fn(dt, this.animT);
    // Fase 17 — FX das sobrevivências (nível do mar/lava, domos, drizzle)
    this.survivalFX?.update(dt, this.animT);
    this.updateCamera(dt);
    this.effects.update(dt);
    this.deathDecals?.update(dt, this.camera.position); // Fase 20 — fade + LOD dos decals pela câmera
    // F39 — números de dano no festival sazonal: as variáveis da temporada
    // (hud.auraCombat — decisão PURA de aura3d) entram no pool ANTES do
    // update; spawn dos eventos do frame seguinte já nasce decorado.
    this.damageNumbers?.setAuraVars?.(this.hud?.auraCombat ?? null);
    // Fase 27 — números de dano: re-projeta âncoras, sobe e some (determinístico)
    this.damageNumbers?.update(dt, { camera: this.camera, width: innerWidth, height: innerHeight });
    this.updateDropFX(dt);
    // beacon pulse
    const bl = .5 + Math.sin(performance.now() / 300) * .5;
    for (const b of this.scene.userData.beacons ?? []) b.material.color.setRGB(.9 + bl * .1, .1, .18);
    // rotação lenta do loot
    for (const mesh of this.lootMeshes.values()) {
      mesh.rotation.y += dt * 1.6;
      // Fase 26 — fecho emissivo PULSANTE da caixa de morte (leitura de loot a distância)
      if (mesh.userData?.clasp) mesh.userData.clasp.emissiveIntensity = .7 + Math.sin(performance.now() * .004) * .5;
      // Fase 28 — faróis (caixa de morte/airdrop) pulsam por opacidade
      const beacon = mesh.getObjectByName('beacon') ?? mesh.getObjectByName('flare');
      if (beacon?.material) beacon.material.opacity = .16 + .1 * (.5 + .5 * Math.sin(performance.now() * .0022 + (mesh.userData?.beaconT ?? 0)));
      // Fase 28 — paraquedas do airdrop: encolhe e some após o pouso
      if (mesh.userData?.kind === 'supplyDrop' && mesh.userData.canopy) {
        mesh.userData.canopy.scale.multiplyScalar(Math.max(.965, 1 - dt * .35));
        if (mesh.userData.canopy.scale.x < .02) { mesh.remove(mesh.userData.canopy); mesh.remove(mesh.userData.lines); mesh.userData.canopy = null; }
      }
    }
    // Fase 28 — paraquedas do airdrop descendo (aproximação visual suave)
    for (const sd of this.supplyDropDescent ?? []) {
      if (!sd.mesh.parent) continue;
      sd.h = Math.max(0, sd.h - dt * 9);
      sd.mesh.position.y = sd.h;
      if (sd.h <= 0) { sd.mesh.position.y = 0; sd.done = true; }
    }
    if (this.supplyDropDescent) this.supplyDropDescent = this.supplyDropDescent.filter((s) => !s.done);
    // HUD
    if (!this.zuOpen) {
      this.hud.update(dt, this.input);
      this.updateInteractionPrompt();
    }
    if (this.post) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}

// ---------- bootstrap ----------
const seed = decodeURIComponent(location.hash.slice(1)) || 'CIGKV-3D-01';
const query = new URLSearchParams(location.search);
const online = query.get('online') === '1';
const spectateRoom = query.get('spectate'); // Fase 13/14 — espectador remoto (pipeline /ws/spectator)
const scenarioId = query.get('scenario') || 'CIGKV';
if (query.has('spectate')) {
  // modo espectador: transmissão atrasada do servidor, sem jogador local
  // (import dinâmico evita ciclo ESM — mesmo padrão do online3d).
  // Fase 14 — presença do parâmetro basta: ?spectate= vazio cai na sala default.
  import('./spectator3d.js').then(({ bootstrapSpectator }) => bootstrapSpectator({ roomId: spectateRoom || 'default', camera: query.get('cam') }));
} else if (online) {
  // modo online: NetClient3D + OnlineGame3D (import dinâmico evita ciclo ESM)
  import('./online3d.js').then(({ bootstrapOnline }) => bootstrapOnline());
} else {
  const game = new Game3D(seed, { scenarioId });
  window.KhaaosReplay3D = { export: () => game.sim.exportReplay(), game };
}
