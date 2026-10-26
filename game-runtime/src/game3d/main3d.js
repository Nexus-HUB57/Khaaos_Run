// Khaaos Run — Cliente 3D (TPS Battle Royale // FreeFire-style)
// Renderizador Three.js sobre a simulação determinística KhaaosSim3D.
// Controles: WASD + mouse (pointer lock), RMB mira, Shift corre, Espaço salta,
// C agacha (toggle), R recarrega, E coleta, Q habilidade local, H medkit, G granada,
// F gloo, 1..2 slots. Espectador: ←/→ trocam operative acompanhado. Touch: joystick + botões.
import * as THREE from 'three';
import { KhaaosSim3D, WEAPONS3D, DEFAULT_INPUT, WORLD, GLOO, DBNO } from './sim3d.js';
import { buildScene, createRingWall, applyGltfProps, applyNightness } from './world3d.js';
import { nightnessFor } from './skyPhase.js';
import { createOperative, createFirstPersonRig, createWeaponModel, animateOperative, attachWeapon, createLootMesh, createParachute, createFragMesh, createGlooMesh, SKIN_TONES, VEST_COLORS_FALLBACK } from './entities3d.js';
import { Effects } from './effects3d.js';
import { GameAudio } from './audio3d.js';
import { HUD } from './hud3d.js';
import { createPostFX } from './postfx3d.js';
import { resolveQuality, qualityTier } from './quality3d.js';
import operativeCatalog from '../../../Content/Avatars/avatar_catalog.json';
import { SCENARIOS, resolveScenario } from './scenarios.js';
import { getOperativeAbility } from './operativeAbilities.js';
import './styles3d.css';

const SIM_DT = 1 / 30;
const VEST_COLORS = VEST_COLORS_FALLBACK;

export class Game3D {
  constructor(seed, { net = null, scenarioId = 'CIGKV' } = {}) {
    this.seed = seed;
    this.scenario = resolveScenario(scenarioId);
    this.selectedOperative = operativeCatalog[0];
    // Fase 7 — modo squad (DBNO/revive) via ?squad=1; LOD mobile via ?q=low|medium|high
    const urlParams = new URLSearchParams(location.search);
    this.squadMode = urlParams.get('squad') === '1';
    this.quality = resolveQuality({ query: urlParams.get('q'), isTouch: matchMedia('(pointer: coarse)').matches, deviceMemory: navigator.deviceMemory ?? null });
    this.sim = new KhaaosSim3D({ seed, botCount: 12, scenarioId: this.scenario.id, spectate: true, squad: this.squadMode });
    this.audio = new GameAudio();
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
    this.parachutes = new Map();      // actorId → { chute, group }
    this.shake = 0;                   // tremor de câmera (explosões)
    // Fase 5 — espectador + agachamento
    this.spectating = false;
    this.spectateTarget = null;
    this.placement = null;

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

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------- infra (protegidos: reusados pelo OnlineGame3D) ----------
  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#arena3d'), antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, qualityTier(this.quality).pixelRatio));
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

  // pós-processamento Live Action (bloom + grade); ?fx=0 desliga (fallback render direto)
  initPost() {
    const fxOff = new URLSearchParams(location.search).get('fx') === '0';
    if (fxOff || !qualityTier(this.quality).bloom) { this.post = null; return; }
    this.post = createPostFX(this.renderer, this.scene, this.camera, { quality: 'high' });
  }

  initWorld() {
    const { scene, sun } = buildScene(this.seed, this.scenario.id, this.renderer, this.quality); // cenário + envmap PBR (renderer)
    this.scene = scene;
    this.sun = sun;
    this.ringWall = createRingWall();
    scene.add(this.ringWall);
    this.effects = new Effects(scene);
    // fonte da luz segue o jogador (sombras estáveis)
    this.sun.target = new THREE.Object3D();
    scene.add(this.sun.target);
    // Fase 7 — props ganham modelos GLTF REAIS quando os assets carregam
    // (fallback procedural permanece se o fetch falhar)
    applyGltfProps(scene);
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
    this.botOps = new Map();
    if (!this.online) {
      this.sim.bots.forEach((b, i) => {
        const ally = this.sim.squad && b.squad && b.squad === this.sim.player.squad;
        const op = createOperative({
          skin: SKIN_TONES[(i * 3 + 1) % SKIN_TONES.length],
          vest: VEST_COLORS[i % VEST_COLORS.length],
          variant: b.id,
        });
        this.scene.add(op.group);
        attachWeapon(op.parts, op.group, b.weapon, b.weaponSkin);
        this.botOps.set(b.id, { op, weapon: b.weapon, skin: b.weaponSkin ?? null, name: this.makeNameTag(b.name, i, ally), ally });
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
    select.replaceChildren(...operativeCatalog.map((operative) => {
      const option = document.createElement('option');
      option.value = operative.id;
      option.textContent = `${operative.codename} — ${operative.rank}`;
      return option;
    }));
    select.value = this.selectedOperative.id;
    this.renderOperativeCard(this.selectedOperative);
    select.addEventListener('change', () => {
      if (this.sim.started) return;
      const operative = operativeCatalog.find((entry) => entry.id === select.value);
      if (!operative) return;
      this.selectedOperative = operative;
      this.sim.player.operativeId = operative.id;
      this.hud.setAbility(operative.id, this.online);
      this.scene.remove(this.playerOp.group);
      this.playerOp = createOperative({ skin: operative.colors.skinTone, vest: operative.colors.primary });
      this.playerOp.group.visible = this.viewMode !== 'fps';
      this.scene.add(this.playerOp.group);
      this.firstPersonRig?.traverse((node) => {
        if (node.isMesh && node.material?.color) node.material.color.set(operative.colors.primary);
      });
      this.playerWeapon = null;
      this.renderOperativeCard(operative);
    });
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

  makeNameTag(name, i, ally = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 26px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(8,8,12,.55)';
    ctx.fillRect(48, 6, 160, 44);
    // Fase 7 — aliados de squad em VERDE; inimigos em tons vermelhos
    ctx.fillStyle = ally ? '#7dff8a' : (i % 2 ? '#e86a7a' : '#d8a0aa');
    ctx.fillText(name, 128, 36);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.set(2.2, .55, 1);
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
      const sens = this.input.ads ? .0011 : .0021;
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
    this.zuOpen = false;
    this.hud.hideZu();
    this.hud.setMatchStatus('RING EM OPERAÇÃO');
    this.hud.feed('CIGKV', entry === 'belt' ? 'Cinto travado. Defesa de impacto ampliada.' : 'Entrada agressiva. Velocidade ampliada.');
    if (!this.isTouch()) this.renderer.domElement.requestPointerLock?.();
    this.playerWeapon = attachWeapon(this.playerOp.parts, this.playerOp.group, this.sim.player.weapon);
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
      this.camera.position.x += (Math.random() - .5) * this.shake;
      this.camera.position.y += (Math.random() - .5) * this.shake;
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
        mesh.position.set(item.x, item.y - .45, item.z);
        this.scene.add(mesh);
        this.lootMeshes.set(item.id, mesh);
      }
    }
    for (const [id, mesh] of this.lootMeshes) {
      if (!active.has(id) || force === 'clear') {
        this.scene.remove(mesh);
        this.lootMeshes.delete(id);
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
    // jogador
    const p = s.player;
    const pg = this.playerOp.group;
    pg.position.set(p.x, p.y, p.z);
    pg.rotation.y = p.yaw + Math.PI; // modelo olha -Z; yaw 0 = frente -Z
    if (!p.alive && !pg.userData.deadPose) {
      pg.rotation.x = -Math.PI / 2.2; pg.position.y = .35;
      pg.userData.deadPose = true;
    }
    if (p.alive) pg.userData.deadPose = false, pg.rotation.x = 0;
    // Fase 4 — pose de queda: braços abertos, pernas colhendo ar
    const airborne = !!p.dropPhase;
    animateOperative(this.playerOp.parts, {
      t: this.animT, speedNorm: p.moving ? (p.sprinting ? 1.2 : .8) : 0,
      pitch: -p.pitch, dead: !p.alive, ads: p.ads, crouch: !!p.crouching,
      knocked: !!p.knocked, // Fase 7 — pose de rastejo DBNO (só quando vivo)
    });
    if (airborne && p.alive && !p.knocked) {
      const flap = Math.sin(this.animT * 5) * .5;
      this.playerOp.parts.armL.shoulder.rotation.z = 1.1 + flap * .3;
      this.playerOp.parts.armR.shoulder.rotation.z = -1.1 - flap * .3;
      this.playerOp.parts.legL.hip.rotation.x = .5 + flap * .25;
      this.playerOp.parts.legR.hip.rotation.x = .35 - flap * .25;
    }
    // troca de arma visual (Fase 7 — skin por raridade acompanha a troca)
    const pSkin = p.weaponSkin ?? null;
    if (!this.playerWeapon || this.playerWeapon.userData?.id !== p.weapon || this.playerWeapon.userData?.skin !== pSkin) {
      this.playerWeapon = attachWeapon(this.playerOp.parts, this.playerOp.group, p.weapon, pSkin);
      this.playerWeapon.userData = { id: p.weapon, skin: pSkin };
      if (this.viewMode === 'fps' && this.firstPersonWeapon) {
        this.firstPersonRig.remove(this.firstPersonWeapon.group);
        this.firstPersonWeapon.group.traverse(o => o.geometry?.dispose?.());
        this.firstPersonWeapon = createWeaponModel(p.weapon, pSkin);
        this.firstPersonRig.add(this.firstPersonWeapon.group);
        this.firstPersonWeapon.group.position.set(0, -.17, -.72);
        this.firstPersonWeapon.group.rotation.x = -.08;
      }
    }
    // bots
    const seen = new Set();
    const mySquad = s.player?.squad ?? null;
    for (const b of s.bots) {
      seen.add(b.id);
      let entry = this.botOps.get(b.id);
      if (!entry) {
        // Fase 8 — identidade: paleta/acessórios pelo operativo do ator (op do snapshot);
        // aliados do esquadrão em verde; fallback = paleta hash do id (compat legado)
        const ally = !!(s.squad && b.squad && b.squad === mySquad);
        const catalog = operativeCatalog.find((o) => o.id === b.op);
        const op = createOperative(catalog
          ? { skin: catalog.colors.skinTone, vest: ally ? '#2e7d4f' : catalog.colors.primary, variant: b.op }
          : { skin: SKIN_TONES[(b.id.charCodeAt(4) * 7) % SKIN_TONES.length], vest: VEST_COLORS[b.id.charCodeAt(6) % VEST_COLORS.length], variant: b.id });
        this.scene.add(op.group);
        const name = this.makeNameTag(b.name, 0, ally);
        op.group.add(name);
        attachWeapon(op.parts, op.group, b.weapon, b.weaponSkin);
        entry = { op, weapon: b.weapon, skin: b.weaponSkin ?? null, name, ally };
        this.botOps.set(b.id, entry);
      }
      const g = entry.op.group;
      // morto FINAL (sem DBNO ou já finalizado): pose de corpo no chão
      if (!b.alive && !b.knocked) {
        if (!g.userData.deadVisible) {
          g.visible = true;
          g.rotation.x = -Math.PI / 2.2; g.position.y = b.y + .35;
          g.userData.deadVisible = true;
          entry.name.visible = false;
        }
        continue;
      }
      g.userData.deadVisible = false;
      g.visible = true;
      g.rotation.x = 0;
      g.position.set(b.x, b.y, b.z);
      g.rotation.y = b.yaw + Math.PI;
      // Fase 7 — caído rasteja (pose própria); de pé anima normal
      animateOperative(entry.op.parts, { t: this.animT + b.id.charCodeAt(4), speedNorm: b.moving ? .9 : .15, pitch: 0, dead: false, crouch: !!b.crouching, knocked: !!b.knocked });
      // Fase 4 — pose de queda para bots/remotos
      if (b.dropPhase && !b.knocked) {
        const flap = Math.sin(this.animT * 5 + b.id.charCodeAt(4)) * .5;
        entry.op.parts.armL.shoulder.rotation.z = 1.1 + flap * .3;
        entry.op.parts.armR.shoulder.rotation.z = -1.1 - flap * .3;
        entry.op.parts.legL.hip.rotation.x = .5 + flap * .25;
        entry.op.parts.legR.hip.rotation.x = .35 - flap * .25;
      }
      // Fase 7 — troca de arma + skin por raridade
      const bSkin = b.weaponSkin ?? null;
      if (entry.weapon !== b.weapon || entry.skin !== bSkin) {
        attachWeapon(entry.op.parts, g, b.weapon, bSkin);
        entry.weapon = b.weapon; entry.skin = bSkin;
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
    for (const u of this.ringWall.userData.uniforms) u.time.value = t;
  }

  // Fase 8 — céu dinâmico: cada pulso do Ring aprofunda a noite (interpolação suave)
  updateSkyPhase(dt) {
    const target = nightnessFor(this.sim.ring?.pulse ?? 0);
    this.nightT = this.nightT ?? 0;
    this.nightT += (target - this.nightT) * Math.min(1, dt * 0.25); // ~12s de transição
    applyNightness(this.scene, this.nightT);
  }

  updateCamera(dt) {
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
      this.camKick *= Math.exp(-dt * 9);
      this.camera.rotation.z += this.camKick * .18;
      const targetFov = p.ads ? 42 : (p.sliding ? 74 : (p.sprinting ? 72 : 68));
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
      this.camera.position.x += (Math.random() - .5) * this.shake;
      this.camera.position.y += (Math.random() - .5) * this.shake;
      this.camera.position.z += (Math.random() - .5) * this.shake;
      this.shake *= Math.exp(-dt * 6.5);
    }
    // FOV dinâmico
    const targetFov = p.ads ? 42 : (p.sprinting ? 68 : 62);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
    this.camera.updateProjectionMatrix();
    // sol acompanha (sombras)
    this.sun.position.set(p.x - 160, 160, p.z - 240);
    this.sun.target.position.set(p.x, 0, p.z);
  }

  buildSimInput(dt) {
    const k = this.keys;
    let dx = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
    let dy = (k.has('s') ? 1 : 0) - (k.has('w') ? 1 : 0);
    // touch joystick
    if (this.hud.joy?.active) { dx = this.hud.joy.dx; dy = this.hud.joy.dy; }
    const touch = this.hud.touchState ?? {};
    const abilityTouch = !!touch.ability;
    const abilityTouchPressed = abilityTouch && !this.abilityTouchDown;
    this.abilityTouchDown = abilityTouch;
    const input = {
      ...this.input,
      seq: this.sim.tick + 1,
      dx, dy,
      sprint: k.has('shift') || !!touch.sprint,
      crouch: k.has('c') || !!touch.crouch,
      jump: k.has(' ') || !!touch.jump,
      fire: this.input.fire || !!touch.fire,
      ads: this.input.ads || !!touch.ads,
      crouch: !!(this.input.crouch || touch.crouch), // Fase 5 — C alterna; touch segura
      reload: this.input.reload || !!touch.reload,
      interact: this.input.interact || !!touch.interact,
      medkit: this.input.medkit || !!touch.medkit,
      throw: this.input.throw || !!touch.throw,
      gloo: this.input.gloo || !!touch.gloo,
      ability: this.abilityPending || abilityTouchPressed, // Fase 8 — online autoritativa
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
          this.effects.muzzleFlash(new THREE.Vector3(e.x, e.y, e.z));
          this.audio.shot(e.weapon, dist);
          if (e.owner === 'player') this.camKick = Math.min(0.03, this.camKick + 0.011);
          break;
        }
        case 'hit': {
          if (e.victim === 'player') {
            this.effects.hitFlesh(new THREE.Vector3(e.x, e.y, e.z));
            this.audio.hurt();
            this.hud.damageFlash = .4;
          } else if (e.owner === undefined || e.owner === 'player') {
            // hitmarker apenas para acertos próprios (offline não envia owner)
            this.effects.hitFlesh(new THREE.Vector3(e.x, e.y, e.z));
            this.audio.hit(e.head);
            this.hud.hitmarker(e.head);
          }
          break;
        }
        case 'impact': {
          this.effects.impact(new THREE.Vector3(e.x, e.y, e.z), e.kind);
          // Fase 5 — orifício persistente em superfícies sólidas
          if (e.kind === 'wall' || e.kind === 'gloo') this.effects.bulletHole(new THREE.Vector3(e.x, e.y, e.z));
          break;
        }
        case 'kill':
          this.hud.killfeed('VOCÊ', e.target, e.head, true);
          this.hud.feed('ABATE', `${e.target} neutralizado.${e.finish ? ' (finalização)' : ''} +${e.xp} XP / +${e.krc} KRC.`, 'good');
          break;
        case 'knock':
          this.hud.feed('ABATE', `${e.target} nocauteado — finalize ou aguarde o sangramento. +${e.xp} XP.`, 'good');
          break;
        case 'botKnocked':
          this.hud.feed('ABATE', `${e.target} nocauteado — finalize ou aguarde o sangramento. +${e.xp} XP.`, 'good');
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
          break;
        case 'hurt':
          if (e.kind === 'ring') {
            if (!this._ringWarned || performance.now() - this._ringWarned > 4000) {
              this._ringWarned = performance.now();
              this.hud.feed('ANEL', 'Você está fora da zona segura.', 'bad');
              this.audio.ringWarn();
            }
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
          this.hud.feed('LOOT', `${e.item} adicionado à Packbag.`);
          break;
        case 'extract':
          this.hud.feed('ZEX', `Extração confirmada. Terminal ${e.count}/3. +250 XP.`, 'good');
          break;
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
          else if (e.effect === 'stun') message = `${e.name}: ${e.targets} bot(s) interrompido(s) sem dano.`;
          else if (e.effect === 'ringRead') message = `${e.name}: próximo pulso em ${e.nextPulseSeconds.toFixed(1)} s.`;
          else if (e.effect === 'ringForecast') message = `${e.name}: próximo pulso em ${e.nextPulseSeconds.toFixed(1)} s; raio-alvo ${Math.round(e.targetRadius)} m.`;
          else if (e.effect === 'terminalScan') message = e.terminalLabel
            ? `${e.name}: ${e.terminalLabel} a ${e.terminalDistance} m; marcado no minimapa por 4 s.`
            : `${e.name}: nenhum terminal ZEX ativo disponível.`;
          this.hud.feed('HABILIDADE', `${prefix}${message}`, e.isSelf === false ? 'warn' : 'good');
          break;
        }
        case 'abilityUnavailable':
          this.hud.feed('HABILIDADE', 'Vida cheia: Coágulo de Campo não consumiu recarga.', 'warn');
          break;
        case 'empty': this.hud.feed('ARSENAL', 'Pente vazio — recarregue [R].', 'bad'); break;
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
          break;
        }
        case 'gloo':
          if (e.owner !== 'player') this.audio.gloo();
          break;
        case 'glooDown':
          this.hud.feed('ARSENAL', e.destroyed ? 'Gloo Wall destruída.' : 'Gloo Wall dissolvida.');
          break;
        case 'victory': this.#endMatch(true, e); break;
        case 'matchEnd': this.#endMatch(false, { kills: p.kills, xp: p.xp, krc: p.krc, ...e }); break;
        case 'eliminated': this.enterSpectate(e); break;
      }
    }
  }

  updateInteractionPrompt() {
    const p = this.sim.player;
    if (!p.alive) { this.hud.prompt(null); return; }
    // Fase 7 — caído: dica de rastejo + estado de revive em andamento
    if (p.knocked) {
      const reviving = (p.reviveProgress ?? 0) > 0;
      this.hud.prompt(reviving ? `REVIVENDO VOCÊ — ${(p.reviveProgress / DBNO.reviveSeconds * 100) | 0}%` : 'NOCAUTADO — rasteje para cobertura e aguarde revive');
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
        return;
      }
    }
    let text = null;
    for (const i of this.sim.loot) {
      if (!i.active) continue;
      const d = Math.hypot(i.x - p.x, i.z - p.z);
      if (d < 2.6) { text = `[E] Coletar ${i.name || i.id}${i.rarity ? ' — ' + i.rarity : ''}`; break; }
    }
    if (!text) {
      for (const t of this.sim.terminals) {
        if (!t.active) continue;
        if (Math.hypot(t.x - p.x, t.z - p.z) < 3.4) { text = `[E] Extrair dados no ${t.label || 'terminal ZEX'}`; break; }
      }
    }
    this.hud.prompt(text);
  }

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
    this.syncEntities(dt);
    this.updateRing();
    this.updateSkyPhase(dt); // Fase 8 — céu dinâmico por pulso do Ring
    this.updateCamera(dt);
    this.effects.update(dt);
    this.updateDropFX(dt);
    // beacon pulse
    const bl = .5 + Math.sin(performance.now() / 300) * .5;
    for (const b of this.scene.userData.beacons ?? []) b.material.color.setRGB(.9 + bl * .1, .1, .18);
    // rotação lenta do loot
    for (const mesh of this.lootMeshes.values()) mesh.rotation.y += dt * 1.6;
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
const scenarioId = query.get('scenario') || 'CIGKV';
if (online) {
  // modo online: NetClient3D + OnlineGame3D (import dinâmico evita ciclo ESM)
  import('./online3d.js').then(({ bootstrapOnline }) => bootstrapOnline());
} else {
  const game = new Game3D(seed, { scenarioId });
  window.KhaaosReplay3D = { export: () => game.sim.exportReplay(), game };
}
