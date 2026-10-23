// Khaaos Run — Modo Online 3D (Battle Royale autoritativo).
// Sim3DView traduz snapshots autoritativos do servidor para o mesmo contrato da
// simulação local (player/bots/ring/loot/terminals/consumeEvents), permitindo que
// o renderizador e o HUD do modo offline funcionem sem alterações de comportamento.
// Fase 3: LocalPredictor prevê o movimento do jogador local (mesma física do
// servidor) e reconcilia a cada snapshot — input responsivo com correção suave.
// bootstrapOnline conecta o NetClient3D e injeta o modo online no Game3D.
import { Game3D } from './main3d.js';
import { NetClient3D } from './net3d.js';
import { MATCH_TIME, WORLD, getWorldLayout, glooCollider } from './sim3d.js';
import { LocalPredictor } from './predict3d.js';
import { attachWeapon } from './entities3d.js';

const OFFLINE_RING = { x: 0, z: 0, radius: WORLD.ring.radius, target: WORLD.ring.radius, pulse: 0 };

// ---------- view: snapshots → contrato da sim local ----------
export class Sim3DView {
  constructor() {
    this.online = true;
    this.seed = null;
    this.tick = 0;
    this.time = MATCH_TIME;
    this.over = false;
    this.started = false;
    this.aliveCount = 1;
    this.ring = { ...OFFLINE_RING };
    this.player = this.#placeholderPlayer();
    this.bots = [];
    this.loot = [];
    this.terminals = [];
    this.grenades = [];  // Fase 4 — granadas autoritativas (snapshots)
    this.walls = [];     // Fase 4 — Gloo Walls ativas (snapshots)
    this.pendingEvents = [];
    this.myId = null;
    this.onSwitchSlot = null; // injetado pelo OnlineGame3D
  }

  #placeholderPlayer() {
    return {
      id: 'player', name: 'OPERATIVO', x: 0, y: 0, z: 150, yaw: 0, pitch: 0,
      life: 100, armor: 35, xp: 0, krc: 250, kills: 0, extracted: 0,
      weapon: 'g19', ammoMag: 15, reloadT: 0, activeSlot: 1,
      inventory: { ammo: { '9MM': 45 }, medkit: 1, frag: 1, gloo: 1 },
      slots: { 1: 'g19' },
      alive: true, onGround: true, moving: false, sprinting: false, ads: false,
      dropPhase: null,
    };
  }

  applySnapshot(s) {
    if (!s) return;
    if (s.seed) this.seed = s.seed;
    this.tick = s.tick ?? this.tick;
    this.time = s.time ?? this.time;
    this.over = s.over ?? this.over;
    this.started = s.started ?? this.started;
    this.aliveCount = s.aliveCount ?? this.aliveCount;
    if (s.ring) this.ring = { ...s.ring };
    if (s.player) this.player = s.player;
    if (s.others) this.bots = s.others;
    if (s.loot) this.loot = s.loot;
    if (s.terminals) this.terminals = s.terminals;
    if (s.grenades) this.grenades = s.grenades;
    if (s.walls) {
      this.walls = s.walls.map((w) => ({ ...w, active: true }));
      // Fase 4 — o preditor local respeita as paredes ativas (mesmo mundo físico)
      this.onWallsChanged?.(this.walls);
    }
  }

  // eventos do servidor → formas consumidas pelo handleEvents do modo offline
  queueEvent(evt, myId = this.myId) {
    const own = (id) => (id === myId ? 'player' : id);
    switch (evt.type) {
      case 'shot': this.pendingEvents.push({ ...evt, owner: own(evt.owner) }); break;
      case 'hit': this.pendingEvents.push({ ...evt, victim: own(evt.victim), owner: own(evt.owner) }); break;
      default: this.pendingEvents.push({ ...evt });
    }
  }

  consumeEvents() {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  switchSlot(slot) { this.onSwitchSlot?.(slot); }
}

// ---------- jogo online ----------
export class OnlineGame3D extends Game3D {
  constructor(seed, net) {
    super(seed, { net });
    this.view = new Sim3DView();
    this.view.myId = net.myId;
    this.view.onSwitchSlot = (slot) => { this.pendingSlot = slot; };
    this.sim = this.view;
    this.hud.sim = this.view;
    // predição client-side (Fase 3): mundo local idêntico ao da sala (seed sincronizada)
    this.inputSeq = 0;
    this.predictor = new LocalPredictor({ world: getWorldLayout(this.seed) });
    // Fase 4 — preditor enxerga Gloo Walls (colliders dinâmicos) sem mutar o layout cacheado
    this.predictorWorld = { colliders: getWorldLayout(this.seed).colliders };
    this.predictor.world = this.predictorWorld;
    this.view.onWallsChanged = (walls) => {
      const staticColliders = getWorldLayout(this.seed).colliders;
      const active = walls.filter((w) => w.active !== false);
      this.predictorWorld.colliders = active.length
        ? staticColliders.concat(active.map(glooCollider))
        : staticColliders;
    };
    this.hud.onReplayExport = () => this.hud.feed('CONSOLE', 'Exportação de replay disponível apenas no modo offline.');
    this.hud.onEntry = (entry) => this.#startMatchOnline(entry);
    const scenarioSelect = document.querySelector('#scenarioSelect');
    if (scenarioSelect) {
      scenarioSelect.disabled = true;
      scenarioSelect.title = 'O cenário online é escolhido pela sala autoritativa.';
    }
    const operativeSelect = document.querySelector('#operativeSelect');
    if (operativeSelect) operativeSelect.disabled = true;
    const selectionStatus = document.querySelector('#contentSelectionStatus');
    if (selectionStatus) selectionStatus.textContent = 'ONLINE: o servidor define o mundo; o operativo/paleta ainda não sincroniza entre jogadores.';
    const seedInput = document.querySelector('#seedInput');
    if (seedInput) { seedInput.disabled = true; seedInput.value = 'SERVIDOR'; }

    net.onStatus = (status) => this.hud.setMatchStatus(status);
    net.onSnapshot = (snapshot) => {
      // primeira amostra define a seed do mundo (o servidor escolhe a sala)
      if (snapshot.seed && snapshot.seed !== this.seed) this.pendingWorldSeed = snapshot.seed;
      this.view.myId = net.myId ?? this.view.myId;
    };
    net.onEvent = (evt) => this.view.queueEvent(evt, net.myId);
    net.onRejected = (msg) => this.hud.feed('ANTI-CHEAT', `Input rejeitado: ${msg.violations?.join(', ')}`, 'bad');
    this.pingTimer = setInterval(() => {
      if (!this.zuOpen) this.hud.setMatchStatus(`ONLINE // PING ${net.rtt ?? '—'}ms // ${this.view.aliveCount} VIVOS`);
    }, 3000);
    net.connect();
    this.hud.feed('CIGKV', 'Modo online: sala autoritativa. Escolha a entrada ZU.', 'good');
  }

  // world rebuild quando a seed do servidor difere da local (uma vez, pré-partida)
  _applyWorldSeed(seed) {
    this.seed = seed;
    this.scene.traverse((o) => { o.geometry?.dispose?.(); });
    this.initWorld();
    this.initEntities();
    this.initCamera(); // initCamera → initPost (composer acompanha nova cena/câmera)
    // preditor acompanha o novo layout (mesma seed autoritativa) + mundo físico próprio
    this.predictor = new LocalPredictor({ world: getWorldLayout(seed) });
    this.predictorWorld = { colliders: getWorldLayout(seed).colliders };
    this.predictor.world = this.predictorWorld;
    this.view.onWallsChanged = (walls) => {
      const staticColliders = getWorldLayout(this.seed).colliders;
      const active = walls.filter((w) => w.active !== false);
      this.predictorWorld.colliders = active.length
        ? staticColliders.concat(active.map(glooCollider))
        : staticColliders;
    };
    this.hud.feed('CIGKV', `Sincronizado com a seed da sala: ${seed}.`, 'good');
  }

  #startMatchOnline(entry) {
    this.audio.init(); this.audio.resume();
    this.net.start(entry);
    this.zuOpen = false;
    this.hud.hideZu();
    this.hud.setMatchStatus('MATCH ONLINE // RING');
    this.hud.feed('ZU', entry === 'belt' ? 'Cinto travado. Entrada online confirmada.' : 'Salto no caos. Entrada online confirmada.');
    if (!this.isTouch()) this.renderer.domElement.requestPointerLock?.();
    const weapon = this.sim.player?.weapon ?? 'g19';
    this.playerWeapon = attachWeapon(this.playerOp.parts, this.playerOp.group, weapon);
    this.playerWeapon.userData = { id: weapon };
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, this.clock.getDelta());
    this.animT += dt;

    if (this.pendingWorldSeed) {
      const seed = this.pendingWorldSeed;
      this.pendingWorldSeed = null;
      this._applyWorldSeed(seed);
    }

    // estado autoritativo interpolado
    const view = this.net?.interpolate();
    if (view) {
      this.view.applySnapshot(view);
      const serverPlayer = this.view.player;
      if (serverPlayer) {
        // Fase 3 — predição + reconciliação: posição local prevista com a mesma
        // física do servidor; vida/armas/etc permanecem autoritativos.
        this.predictor?.reconcile(serverPlayer, serverPlayer.ackSeq ?? this.net.ackSeq);
        const pos = this.predictor?.pos;
        this.view.player = {
          ...serverPlayer,
          x: pos?.x ?? serverPlayer.x,
          y: pos?.y ?? serverPlayer.y,
          z: pos?.z ?? serverPlayer.z,
          moving: this.predictor?.actor.moving ?? serverPlayer.moving,
          sprinting: this.predictor?.actor.sprinting ?? serverPlayer.sprinting,
          onGround: this.predictor?.actor.onGround ?? serverPlayer.onGround,
        };
      }
      // câmera/jogador local usam yaw/pitch locais (responsivos)
      if (this.view.player) {
        this.view.player.yaw = this.input.yaw;
        this.view.player.pitch = this.input.pitch;
      }
    }
    this.predictor?.update(dt);

    // envio de input a 30Hz (enquanto a partida estiver ativa) + predição local
    if (!this.zuOpen && !this.ended) {
      this.netAccumulator = (this.netAccumulator ?? 0) + dt;
      while (this.netAccumulator >= 1 / 30) {
        const input = this.buildSimInput(1 / 30);
        input.seq = ++this.inputSeq; // seq local monotônica (independe do tick do servidor)
        this.net?.sendInput(input);
        this.predictor?.onInput(input);
        this.netAccumulator -= 1 / 30;
      }
      this.handleEvents();
    }

    this.syncLoot();
    this.syncEntities(dt);
    this.updateRing();
    this.updateCamera(dt);
    this.effects.update(dt);
    this.updateDropFX(dt);
    const bl = 0.5 + Math.sin(performance.now() / 300) * 0.5;
    for (const b of this.scene.userData.beacons ?? []) b.material.color.setRGB(0.9 + bl * 0.1, 0.1, 0.18);
    for (const mesh of this.lootMeshes.values()) mesh.rotation.y += dt * 1.6;
    if (!this.zuOpen) {
      this.hud.update(dt, this.input);
      this.updateInteractionPrompt();
    }
    if (this.post) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}

// ---------- bootstrap ----------
export function bootstrapOnline() {
  const net = new NetClient3D({
    url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`,
  });
  const game = new OnlineGame3D('CIGKV-3D-01', net);
  window.KhaaosOnline3D = { game, net };
  return game;
}
