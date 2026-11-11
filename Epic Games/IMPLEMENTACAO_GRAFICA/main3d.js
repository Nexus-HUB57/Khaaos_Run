// Khaaos Run — Cliente 3D (TPS Battle Royale // FreeFire-style)
// Renderizador Three.js sobre a simulação determinística KhaaosSim3D.
// Controles: WASD + mouse (pointer lock), RMB mira, Shift corre, Espaço salta,
// C agacha (toggle), R recarrega, E coleta, Q habilidade local, H medkit, G granada,
// F gloo, 1..2 slots. Espectador: ←/→ trocam operative acompanhado. Touch: joystick + botões.
import * as THREE from 'three';
import { KhaaosSim3D, WEAPONS3D, DEFAULT_INPUT, WORLD, GLOO, DBNO, DOOR, WINDOW, doorHpFor, windowPaneOnSegment } from './sim3d.js';
import { doorMaterialOf } from './interiorsPlan.js'; // Fase 26 — material (metal/wood) p/ áudio por kind da estrutura
import { buildScene, createRingWall, applyGltfProps, applyNightness, tickVegetationWind } from './world3d.js';
import { nightnessFor } from './skyPhase.js';
import { createOperative, createFirstPersonRig, createWeaponModel, animateOperative, attachWeapon, createLootMesh, createParachute, createFragMesh, createGlooMesh, poseFirstPersonHands, SKIN_TONES, VEST_COLORS_FALLBACK } from './entities3d.js';
import { applyOperativeGear } from './gear3d.js'; // Fase 28 — equipamento vira silhueta
import { tickMythicWeapons, unregisterMythic, MYTHIC_SKIN, MYTHIC_SKINS, mythicSkinFor } from './attachments3d.js'; // Fase 30/32 — anexos + míticas por arma
import { createCharacterLOD, buildOperativeProxy, buildOperativeSilhouette, createFrustumGate } from './lod3d.js';
import { deathFall } from './entities3d.js';
import { Effects } from './effects3d.js';
import { GameAudio } from './audio3d.js';
import { loadAudioMix, saveAudioMix } from './audiomix.js'; // Fase 19 — mixagem KR_AUDIO_*
import { FrametimeMonitor, drsDecision, tierDecision, budgetFor, RateLimiter, DRS_MIN, DRS_MAX, postFxPlanFor } from './perf3d.js'; // Fase 34 — DRS + auto-tier
import { loadGfxSettings, saveGfxSettings, effectiveBaseTier } from './gfxsettings.js'; // Fase 34 — settings KR_GFX_*
import { HUD } from './hud3d.js';
import { createPostFX } from './postfx3d.js';
import { resolveQuality, qualityTier } from './quality3d.js';
import operativeCatalog from '../../../Content/Avatars/avatar_catalog.json';
import { officerCatalogEntries } from './officers.js';
import { SCENARIOS, resolveScenario } from './scenarios.js';
import { getOperativeAbility } from './operativeAbilities.js';
import { TrainIntro } from './trainIntro.js';
import { SurvivalFX } from './survivalfx3d.js';
import { DeathDecalSystem } from './decals3d.js'; // Fase 20 — decal de morte direcional (LOD/decals)
import { DamageNumbers3D } from './damageNumbers3d.js'; // Fase 27 — números de dano flutuantes
import { SeededRng } from '../shared/rng.js'; // Fase 18 — rng determinístico do FX de combate
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
    this.quality = resolveQuality({ query: urlParams.get('q'), isTouch: matchMedia('(pointer: coarse)').matches, deviceMemory: navigator.deviceMemory ?? null });
    // Fase 34 — settings gráficas do jogador (KR_GFX_*): override manual de tier
    // vence o auto-detect; DRS/auto-tier assumem a partir do tier base efetivo.
    this.gfx = loadGfxSettings();
    this.quality = effectiveBaseTier(this.quality, this.gfx);
    // Fase 34 — laço de performance: EMA de frametime + estado do DRS/tier
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
    // modo online (OnlineGame3D injeta o NetClient3D e substitui this.sim pela view)
    this.net = net;
    this.online = !!net;
    this.pendingSlot = 0;
    this.netAccumulator = 0;
    this.viewMode = new URLSearchParams(location.search).get('view') === 'tps' ? 'tps' : 'fps';
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
    this.hud.setAbility(this.selectedOperative.id, this.online);
    this.hud.setMatchStatus('AGUARDANDO ZU');
    this.hud.feed('Marechal', `Seed ${seed} carregada. Aguardando decisão ZU.`);
    this.initContentSelectors();
    this.initSpectatorUI();
    this.initAudioMixer(); // Fase 19 — painel de mixagem (jogador + espectador)
    this.initGfxPanel(); // Fase 34 — painel de vídeo/performance (KR_GFX_*)

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
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

  // ---------- Fase 34 — painel de vídeo/performance (KR_GFX_*) ----------
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
    // Fase 34 — pixelRatio BASE do tier (cap); a escala DRS multiplicada é
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
  // Fase 34 — o plano vem do TIER real (perf3d.postFxPlanFor): SSR só no high;
  // a setting KR_GFX postfx desliga o composer inteiro (achado G2 corrigido —
  // antes o tier médio pagava SSR completo via quality:'high' hardcoded).
  initPost() {
    const fxOff = new URLSearchParams(location.search).get('fx') === '0';
    if (fxOff || !this.gfx.postfx || !postFxPlanFor(this.quality)) { this.post = null; return; }
    this.post = createPostFX(this.renderer, this.scene, this.camera, { quality: this.quality });
  }

  // Fase 34 — reconstrói o composer pós troca de tier/setting (alvo raro:
  // dwell de 10 s entre tiers; toggle de setting é ação do usuário).
  rebuildPost() {
    const old = this.post;
    this.initPost();
    if (this.post) this.post.setSize(innerWidth, innerHeight);
    old?.dispose?.();
  }

  // Fase 34 — aplica a escala DRS ao pipeline (throttle 150 ms; muda pixelRatio
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

  // Fase 34 — troca ESTRUTURAL de tier em runtime: cap de pixelRatio, resolução
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

  // Fase 34 — laço de performance por frame: mede dt (custo do frame ANTERIOR),
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
    this.ringWall = createRingWall();
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
    if (this.firstPersonRig) {
      this.camera.add(this.firstPersonRig);
      this.firstPersonWeapon = createWeaponModel(this.sim.player.weapon);
      this.firstPersonRig.add(this.firstPersonWeapon.group);
      this.firstPersonWeapon.group.position.set(0, -.17, -.72);
      this.firstPersonWeapon.group.rotation.x = -.08;
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
      // Fase 34 — sensibilidade do jogador (KR_GFX_*, 0.3..2.5×); ADS mantém a
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
      if (k === 'c' && !e.repeat) this.input.crouch = !this.input.crouch; // Fase 5 — agachar (toggle)
      // Fase 5 — espectador: troca o operativo acompanhado
      if (k === 'arrowleft' && !e.repeat) this.spectateCycle(-1);
      if (k === 'arrowright' && !e.repeat) this.spectateCycle(1);
      // troca de slot: offline aplica na sim; online agenda no próximo input
      if (k === '1') this.sim.switchSlot(1);
      if (k === '2') this.sim.switchSlot(2);
      if (k === 'escape' && this.pointerLocked) document.exitPointerLock();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  isTouch() { return matchMedia('(pointer: coarse)').matches; }

  // ---------- fluxo ----------
  startMatch(entry) {
    this.audio.init(); this.audio.resume();
    this.sim.start(entry);
    this.damageNumbers?.clear(); // Fase 27 — partida nova, tela limpa
    this.zuOpen = false;
    this.hud.hideZu();
    this.hud.setMatchStatus('RING EM OPERAÇÃO');
    this.hud.feed('CIGKV', entry === 'belt' ? 'Cinto travado. Defesa de impacto ampliada.' : 'Entrada agressiva. Velocidade ampliada.');
    if (!this.isTouch()) this.renderer.domElement.requestPointerLock?.();
    this.playerWeapon = attachWeapon(this.playerOp.parts, this.playerOp.group, this.sim.player.weapon);
    // Fase 11 — ZU: o trem cruza a zona e o desembarque aéreo começa (só câmera;
    // a sim continua autoritativa — nenhum input é bloqueado).
    this.startTrainIntro();
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
      // Fase 34 — multiplicador de tremor do jogador (KR_GFX_*, 0 = movimento reduzido)
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
    pg.rotation.y = p.yaw + Math.PI; // modelo olha -Z; yaw 0 = frente -Z
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
    const airborne = !!p.dropPhase;
    animateOperative(this.playerOp.parts, {
      t: this.animT, speedNorm: p.moving ? (p.sprinting ? 1.2 : .8) : 0,
      pitch: -p.pitch, dead: !p.alive, ads: p.ads, crouch: !!p.crouching,
      knocked: !!p.knocked, // Fase 7 — pose de rastejo DBNO (só quando vivo)
      air: airborne ? Math.max(0, p.y) : 0,
      hit: this.#hitParam('player'), // Fase 10 — flinch direcional do jogador
      death: p.alive ? null : this.deathFX.get('player'), // Fase 12 — agonia direcional
    });
    if (airborne && p.alive && !p.knocked) {
      const flap = Math.sin(this.animT * 5) * .5;
      this.playerOp.parts.armL.shoulder.rotation.z = 1.1 + flap * .3;
      this.playerOp.parts.armR.shoulder.rotation.z = -1.1 - flap * .3;
      this.playerOp.parts.legL.hip.rotation.x = .5 + flap * .25;
      this.playerOp.parts.legR.hip.rotation.x = .35 - flap * .25;
    }
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
        this.firstPersonWeapon.group.position.set(0, -.17, -.72);
        this.firstPersonWeapon.group.rotation.x = -.08;
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
        continue;
      }
      g.userData.deadVisible = false;
      this.deathFX.delete(b.id);
      g.visible = true;
      g.rotation.x = 0; g.rotation.z = 0;
      g.position.set(b.x, b.y, b.z);
      g.rotation.y = b.yaw + Math.PI;
      // Fase 7 — caído rasteja (pose própria); de pé anima normal
      // Fase 9 — sombra some com altitude da queda
      // Fase 10 — anima o conjunto de parts do NÍVEL ATIVO do LOD + flinch de dano
      // Fase 12 — no nível silhueta activeParts() → null (nada a animar)
      // Fase 13 — fora do frustum a pose CONGELA (posições/rotações da raiz seguem
      // — o ator não some do mundo, só para de gastar CPU de animação)
      const parts = entry.op.activeParts();
      if (parts && !entry.frozen) animateOperative(parts, { t: this.animT + b.id.charCodeAt(4), speedNorm: b.moving ? .9 : .15, pitch: 0, dead: false, crouch: !!b.crouching, knocked: !!b.knocked, air: b.dropPhase ? Math.max(0, b.y) : 0, hit: this.#hitParam(b.id) });
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
      const bob = p.alive && !p.dropPhase ? Math.sin(this.cameraSway) * (p.sliding ? .026 : (p.sprinting ? .018 : .008)) : 0;
      this.camera.position.y += bob;
      this.firstPersonRig.position.x += ((p.ads ? .02 : 0) - this.firstPersonRig.position.x) * Math.min(1, dt * 10);
      this.firstPersonRig.position.y += (bob - this.firstPersonRig.position.y) * Math.min(1, dt * 12);
      this.firstPersonRig.rotation.x += ((p.pitch * .18) - this.firstPersonRig.rotation.x) * Math.min(1, dt * 10);
      // Fase 10 — mãos articuladas: grip + indicador no gatilho + micro-vida;
      // flinch da própria câmera quando o jogador é atingido (roll + recuo)
      poseFirstPersonHands(this.firstPersonRig, { curl: .8 + this.camKick * 2.2, trigger: this.input.fire ? 1 : 0, breathe: Math.sin(this.animT * 2.1) * .03 });
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
      // Fase 34 — multiplicador de tremor do jogador (KR_GFX_*, 0 = movimento reduzido)
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
    const touch = this.hud.touchState ?? {};
    const abilityTouch = !!touch.ability;
    const abilityTouchPressed = abilityTouch && !this.abilityTouchDown;
    this.abilityTouchDown = abilityTouch;
    const input = {
      ...this.input,
      seq: this.sim.tick + 1,
      dx, dy,
      sprint: !trainStunned && (k.has('shift') || !!touch.sprint),
      crouch: k.has('c') || !!touch.crouch,
      jump: !trainStunned && (k.has(' ') || !!touch.jump),
      fire: !trainStunned && (this.input.fire || !!touch.fire),
      ads: this.input.ads || !!touch.ads,
      crouch: !!(this.input.crouch || touch.crouch), // Fase 5 — C alterna; touch segura
      reload: !trainStunned && (this.input.reload || !!touch.reload),
      interact: !trainStunned && (this.input.interact || !!touch.interact),
      medkit: !trainStunned && (this.input.medkit || !!touch.medkit),
      throw: !trainStunned && (this.input.throw || !!touch.throw),
      gloo: !trainStunned && (this.input.gloo || !!touch.gloo),
      ability: !trainStunned && (this.abilityPending || abilityTouchPressed), // Fase 8 — online autoritativa
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
        case 'revived':
          this.hud.feed('SQUAD', `${e.by} reviveu ${e.targetName}.${e.target === 'player' ? ' De volta ao combate!' : ''}`, 'good');
          this.audio?.pickup?.();
          break;
        case 'knocked':
          this.hud.feed('ZU', `Você está NOCAUTEADO${e.by ? ` por ${e.by}` : ''} — aliados podem reviver. Rasteje para cobertura.`, 'bad');
          this.audio?.heartbeat?.();
          this.hud.damageFlash = .6;
          break;
        case 'killfeed':
          this.hud.killfeed(e.killer, e.victim, !!e.head, false, !!e.knock);
          break;
        case 'botKill':
          this.hud.killfeed('RING', e.target, false, false);
          break;
        case 'matchStart':
          this.hud.feed('ZU', `Partida iniciada. Seed ${e.seed}. Bots no ring: ${e.bots}.`, 'warn');
          // Fase 12 — remotos entram na partida AQUI (modal ZU fecha, trem
          // sincronizado pelo startedAt do servidor). O iniciador local já
          // fechou o ZU — hook é no-op para ele exceto pelo sync do trem.
          this.onMatchStartEvent?.(e);
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
        case 'pulse':
          this.hud.feed('PULSO', `Anel recalibrado. Setor seguro: ${Math.round(e.target)}m.`, 'warn');
          this.audio.ringWarn();
          break;
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
        case 'extract':
          this.hud.feed('ZEX', `Extração confirmada. Terminal ${e.count}/3. +250 XP.`, 'good');
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
        case 'eruptionStart':
          this.survivalFX?.handleEvent(e);
          this.shake = Math.max(this.shake, .3);
          this.audio?.survival?.('lava', true);
          this.audio?.hazardStinger?.('lava');
          this.hud.feed('SOBREVIVÊNCIA', `ERUPÇÃO: lava subindo até ${Math.round(e.lavaBelowY ?? 180)}m — as mesas são a única salvação (${Math.round(e.durationSeconds ?? 35)}s).`, 'bad');
          break;
        case 'eruptionEnd':
          this.survivalFX?.handleEvent(e);
          this.audio?.survival?.('lava', false);
          this.hud.feed('SOBREVIVÊNCIA', 'Lava recuando para as fendas.', 'good');
          break;
        case 'gravityAnomalyStart':
          this.survivalFX?.handleEvent(e);
          this.audio?.survival?.('gravity', true);
          this.audio?.hazardStinger?.('gravity');
          this.hud.feed('SOBREVIVÊNCIA', `ANOMALIA KHAOS: gravidade ${e.gravityScale ?? .35}× — domos de contenção ativos nos pilões (drenam escudo fora deles).`, 'warn');
          break;
        case 'gravityAnomalyEnd':
          this.survivalFX?.handleEvent(e);
          this.audio?.survival?.('gravity', false);
          this.hud.feed('SOBREVIVÊNCIA', 'Anomalia dissipada. Gravidade restaurada.', 'good');
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
  // desfeito o rotation.y real do grupo (yaw + π): 0 = frente do modelo,
  // +π/2 = lado +x do modelo, π = costas. Registra flinch só para atores vivos.
  #registerHit(victimId, e) {
    const s = this.sim;
    const actor = victimId === 'player' ? s.player : (s.bots ?? []).find((b) => b.id === victimId);
    if (!actor || !actor.alive) return;
    const dx = e.x - actor.x, dz = e.z - actor.z;
    const th = actor.yaw + Math.PI;
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
    let text = null, textD = Infinity;
    for (const i of this.sim.loot) {
      if (!i.active) continue;
      const d = Math.hypot(i.x - p.x, i.z - p.z);
      if (d < 2.6 && d < textD) { text = `[E] Coletar ${i.name || i.id}${i.rarity ? ' — ' + i.rarity : ''}`; textD = d; }
    }
    if (!text) {
      for (const t of this.sim.terminals) {
        if (!t.active) continue;
        if (Math.hypot(t.x - p.x, t.z - p.z) < 3.4) { text = `[E] Extrair dados no ${t.label || 'terminal ZEX'}`; break; }
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
    this.updatePerf(dt); // Fase 34 — DRS + auto-tier + telemetria (laço fechado de performance)

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
