// Khaaos Run — Fase 13: ESPECTADOR REMOTO consumindo o pipeline /ws/spectator.
// O SpectatorDataPipeline do servidor transmite batches atrasados (10 s anti-ghosting,
// 5 Hz agregados) com players/ringState/events. Este módulo é o CLIENTE dessa
// transmissão: remote (WS com socket injetável — testável headless), view no
// CONTRATO da sim (players atrasados viram bots renderizados pelo MESMO pipeline de
// LOD/frustum dos atores), câmeras de broadcast e o HUD de espectador.
// Tudo que toca Game3D/document fica atrás de bootstrapSpectator() (import dinâmico,
// mesmo padrão do online3d) — os exports puros nunca tocam DOM na importação.
import * as THREE from 'three';

// ───helpers puros──────────────────────────────────────────────────────────────

// Ranking do broadcast: vivos primeiro, depois abates, vida, escudo, id (tiebreak
// determinístico — o mesmo estado gera sempre a MESMA tabela).
export function computeStandings(players = []) {
  return [...players].sort((a, b) => {
    const aliveA = a.isEliminated ? 1 : 0, aliveB = b.isEliminated ? 1 : 0;
    if (aliveA !== aliveB) return aliveA - aliveB;
    if ((b.kills ?? 0) !== (a.kills ?? 0)) return (b.kills ?? 0) - (a.kills ?? 0);
    if ((b.health ?? 0) !== (a.health ?? 0)) return (b.health ?? 0) - (a.health ?? 0);
    if ((b.shield ?? 0) !== (a.shield ?? 0)) return (b.shield ?? 0) - (a.shield ?? 0);
    return String(a.id).localeCompare(String(b.id));
  });
}

export function formatCountdown(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// nomes de atores vêm do SERVIDOR (pipeline) — escapados antes de qualquer innerHTML
const esc = (s) => String(s ?? '—').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Resumo do Ring p/ chip do HUD (fase 1-based, raio, estado, contagem do próximo pulso)
export function ringSummary(r = {}) {
  const phase = Math.max(0, Math.floor(r.currentPhase ?? 0));
  return {
    fase: `F${phase + 1}`,
    raio: `${Math.max(0, Math.round(r.currentRadius ?? 0))}m`,
    estado: r.isShrinking ? 'ENCOLHENDO' : 'ESTÁVEL',
    contagem: formatCountdown(r.nextPhaseIn),
    shrinking: !!r.isShrinking,
  };
}

// Evento do pipeline → linha do feed (null para tipos desconhecidos — nunca quebra)
export function eventToFeed(e = {}) {
  const d = e.data ?? {};
  switch (e.type) {
    case 'ELIMINATION':
      return { who: 'RING', cls: 'kill', msg: `${d.killer ?? '—'} ${d.knock ? 'nocauteou' : 'eliminou'} ${d.victim ?? '—'}${d.headshot ? ' — HEADSHOT' : ''}` };
    case 'REVIVE':
      return { who: 'APOIO', cls: 'good', msg: `${d.by ?? 'Aliado'} revivendo ${d.victim ?? 'operativo'}` };
    case 'AIRDROP':
      return { who: 'LOGÍSTICA', cls: 'warn', msg: 'Airdrop lançado no ring — corram para a marca' };
    case 'RING_PHASE':
      return { who: 'RING', cls: 'warn', msg: `Fase ${d.phase ?? '—'} do Ring: ${d.isShrinking ? 'o cerco está fechando' : 'aguardando encolher'}` };
    case 'WORLD_TRANSITION':
      return { who: 'ZU', cls: 'warn', msg: `Transição de mundo → ${d.to ?? '—'}` };
    default:
      return null;
  }
}

// Fase 14 — URL da transmissão: /?spectate=SALA&cam=… (botão ASSISTIR do modal
// ZU aponta para cá). Sala vazia cai na sala "default" do pipeline.
export function spectateHref(code = '') {
  const room = String(code ?? '').trim() || 'default';
  return `/?spectate=${encodeURIComponent(room)}`;
}

// ───remote: cliente WS do pipeline (socket injetável p/ testes)───────────────

export const SPECTATOR_CAMERAS = ['FREECAM', 'FOLLOW_PLAYER', 'OVERHEAD', 'RING_CENTER'];

export class SpectatorRemote {
  constructor({ roomId = 'default', camera = 'RING_CENTER', url = null, socketFactory = null, onStatus = null, onBatch = null, onFeed = null } = {}) {
    this.roomId = roomId;
    this.camera = SPECTATOR_CAMERAS.includes(camera) ? camera : 'RING_CENTER';
    this.followPlayerId = null;
    this.url = url;
    this.socketFactory = socketFactory;
    this.onStatus = onStatus; this.onBatch = onBatch; this.onFeed = onFeed;
    this.status = 'AGUARDANDO';
    this.delayMs = null;          // vem no SPECTATOR_WELCOME (anti-ghosting)
    this.spectatorId = null;
    this.last = null;             // último batch: { players, ringState, timestamp }
    this.feed = [];               // linhas já traduzidas (mais novas primeiro)
    this.ws = null;
    this._seenEvents = new Set(); // dedupe type:timestamp (batchs repetem cauda)
  }

  _setStatus(s) { this.status = s; this.onStatus?.(s); }

  connect() {
    if (this.ws) return;
    const base = this.url ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    const url = `${base}/ws/spectator?roomId=${encodeURIComponent(this.roomId)}&camera=${encodeURIComponent(this.camera)}`;
    let ws;
    if (this.socketFactory) {
      ws = this.socketFactory(url); // factory injetável (testes/adaptadores)
    } else if (typeof WebSocket !== 'undefined') {
      ws = new WebSocket(url);
    } else {
      this._setStatus('INDISPONÍVEL');
      return;
    }
    this._setStatus('CONECTANDO');
    this.ws = ws;
    ws.onopen = () => this._setStatus('SINCRONIZANDO'); // welcome ainda não chegou (delay 10 s)
    ws.onmessage = (ev) => this.#handleMessage(String(ev.data));
    ws.onclose = () => { this.ws = null; this._setStatus('TRANSMISSÃO ENCERRADA'); };
    ws.onerror = () => { /* onclose segue */ };
  }

  #handleMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; } // lixo de rede nunca quebra o HUD
    switch (msg.type) {
      case 'SPECTATOR_WELCOME':
        this.spectatorId = msg.spectatorId ?? null;
        this.delayMs = Number.isFinite(msg.delayMs) ? msg.delayMs : null;
        this._setStatus('LIVE');
        break;
      case 'SPECTATOR_BATCH': {
        const data = msg.data ?? {};
        this.last = {
          players: Array.isArray(data.players) ? data.players : [],
          ringState: data.ringState ?? null,
          timestamp: msg.timestamp ?? Date.now(),
          batchSize: msg.batchSize ?? null,
        };
        for (const e of msg.events ?? []) {
          const key = `${e.type}:${e.timestamp}`;
          if (this._seenEvents.has(key)) continue;
          this._seenEvents.add(key);
          if (this._seenEvents.size > 400) this._seenEvents.clear(); // teto de memória
          const line = eventToFeed(e);
          if (line) { this.feed.unshift(line); if (this.feed.length > 8) this.feed.pop(); this.onFeed?.(line, e); }
        }
        this.onBatch?.(this.last);
        break;
      }
      default: break; // tipos futuros são ignorados com elegância
    }
  }

  setCamera(mode, followPlayerId = null) {
    this.camera = SPECTATOR_CAMERAS.includes(mode) ? mode : this.camera;
    this.followPlayerId = followPlayerId;
    if (this.ws?.readyState === 1) {
      try { this.ws.send(JSON.stringify({ type: 'SET_CAMERA', cameraMode: this.camera, followPlayerId })); } catch { /* socket morrendo */ }
    }
  }

  // gira o alvo de FOLLOW entre os VIVOS pela ordem do ranking (prev/next do HUD)
  cycleFollow(dir = 1) {
    const alive = computeStandings(this.last?.players ?? []).filter((p) => !p.isEliminated);
    if (alive.length === 0) { this.setCamera('FOLLOW_PLAYER', null); return null; }
    const idx = Math.max(0, alive.findIndex((p) => p.id === this.followPlayerId));
    const next = alive[(((idx + dir) % alive.length) + alive.length) % alive.length];
    this.setCamera('FOLLOW_PLAYER', next.id);
    return next;
  }

  dispose() {
    try { this.ws?.close(); } catch { /* já fechado */ }
    this.ws = null;
    this._setStatus('ENCERRADO');
  }
}

// ───view: batches atrasados → contrato da sim (mesmo renderizador do jogo)────

// players do pipeline (2D: posX/posY) viram atores no chão; isDowned vira knocked
// (rastejo DBNO do render), isEliminated vira morte (queda direcional continua
// valendo — Fase 12). Sem loot/terminals/arremessáveis: a transmissão não os traz.
export class SpectatorView {
  constructor({ spectatorName = 'TRANSMISSÃO' } = {}) {
    this.online = true;
    this.seed = null;
    this.tick = 0;
    this.time = 0;
    this.over = false;
    this.started = true;
    this.squad = false;
    this.aliveCount = 0;
    this.spectatorName = spectatorName;
    this.ring = { x: 0, z: 0, radius: 800, target: 800, pulse: 0 };
    this.player = this.#placeholder();
    this.bots = [];
    this.loot = [];
    this.terminals = [];
    this.grenades = [];
    this.walls = [];
    this.batchCount = 0;
    this.lastBatchAt = 0;
  }

  #placeholder() {
    return {
      id: 'broadcast', name: this.spectatorName, x: 0, y: -50, z: 0, yaw: 0, pitch: 0,
      life: 100, armor: 0, xp: 0, krc: 0, kills: 0, extracted: 0,
      weapon: 'sucata', ammoMag: 0, reloadT: 0, activeSlot: 1,
      inventory: { ammo: {}, medkit: 0, frag: 0, gloo: 0 },
      slots: {}, alive: false, onGround: true, moving: false, sprinting: false, ads: false,
      stamina: 100, crouching: false, sliding: false, slideT: 0, dropPhase: null,
    };
  }

  applyBatch(batch = {}) {
    if (!batch) return;
    this.batchCount++;
    this.lastBatchAt = Date.now();
    const alive = (batch.players ?? []).filter((p) => !p.isEliminated);
    this.aliveCount = alive.length;
    if (batch.ringState) {
      const c = batch.ringState.ringCenter ?? [0, 0, 0];
      const radius = batch.ringState.currentRadius ?? this.ring.radius;
      this.ring = {
        x: c[0] ?? 0, z: c[2] ?? 0, radius, target: radius,
        pulse: batch.ringState.currentPhase ?? this.ring.pulse,
      };
    }
    this.bots = (batch.players ?? []).map((p) => ({
      id: String(p.id),
      // Fase 14 — nome REAL do jogador (displayName do pipeline); fallbacks:
      // name legado → espécie → cauda do id.
      name: p.displayName ?? p.name ?? p.species ?? String(p.id).slice(-6),
      op: p.species ?? null,
      x: p.posX ?? 0, y: 0, z: p.posY ?? 0,
      yaw: p.yaw ?? 0,
      life: p.health ?? 0,
      armor: p.shield ?? 0,
      kills: p.kills ?? 0,
      alive: !p.isEliminated,
      knocked: !!p.isDowned && !p.isEliminated,
      moving: false, sprinting: false, crouching: false,
      dropPhase: null,
      weapon: 'g19',
    }));
  }

  step() { /* transmissão: nenhum tick local — o estado vem dos batches */ }
  consumeEvents() { return []; }
}

// ───câmeras de broadcast (puro: devolve pose pos/look, sem tocar câmera)──────

export function spectatorCameraPose(mode, state = {}, out = null) {
  const pose = out ?? { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const cx = state.ringCenter?.x ?? 0, cz = state.ringCenter?.z ?? 0;
  const radius = Math.max(10, state.ringRadius ?? 120);
  const t = state.time ?? 0;
  const f = state.follow ?? { x: cx, y: 0, z: cz };
  switch (mode) {
    case 'FOLLOW_PLAYER': {
      pose.pos.set(f.x + 6.5, f.y + 7.5, f.z + 9.5);   // ombro cinematográfico
      pose.look.set(f.x, f.y + 1.4, f.z);
      break;
    }
    case 'OVERHEAD': {
      pose.pos.set(cx, Math.max(70, radius * 1.7), cz + .01);
      pose.look.set(cx, 0, cz);
      break;
    }
    case 'RING_CENTER': {
      pose.pos.set(cx, 3.2, cz);
      const a = t * .04;
      pose.look.set(cx + Math.cos(a) * radius, 1.2, cz + Math.sin(a) * radius);
      break;
    }
    case 'FREECAM':
    default: {
      const a = t * .06;
      const orbit = radius * 1.25;
      pose.pos.set(cx + Math.cos(a) * orbit, 26, cz + Math.sin(a) * orbit);
      pose.look.set(cx, 1, cz);
      break;
    }
  }
  return pose;
}

// ───HUD do espectador (VM pura + render DOM guardado p/ headless)─────────────

export function spectatorViewModel(state = {}) {
  const standings = computeStandings(state.players ?? []);
  const alive = standings.filter((p) => !p.isEliminated);
  const ring = ringSummary(state.ringState ?? {});
  const follow = state.followId
    ? (standings.find((p) => p.id === state.followId) ?? null)
    : null;
  return {
    status: state.status ?? 'AGUARDANDO',
    delaySec: Number.isFinite(state.delayMs) ? Math.round(state.delayMs / 1000) : null,
    alive: alive.length,
    camMode: state.camMode ?? 'RING_CENTER',
    followName: follow ? (follow.displayName ?? follow.name ?? follow.id) : null,
    ring,
    top: standings.slice(0, 8).map((p, i) => ({
      rank: i + 1,
      id: String(p.id),
      name: p.displayName ?? p.name ?? p.species ?? String(p.id).slice(-6),
      kills: p.kills ?? 0,
      life: Math.max(0, Math.round(p.health ?? 0)),
      shield: Math.max(0, Math.round(p.shield ?? 0)),
      alive: !p.isEliminated,
      downed: !!p.isDowned && !p.isEliminated,
    })),
    feed: (state.feed ?? []).slice(0, 6),
  };
}

export class SpectatorHUD {
  constructor({ onCamera = null, onFollowCycle = null, onDisconnect = null } = {}) {
    this.onCamera = onCamera; this.onFollowCycle = onFollowCycle; this.onDisconnect = onDisconnect;
    const doc = typeof document !== 'undefined' ? document : null;
    this.root = doc?.querySelector('#spectatorHud') ?? null;
    this.feedRoot = doc?.querySelector('#specFeed') ?? null;
    this.followId = null;
    // botões de câmera
    doc?.querySelectorAll('#spectatorHud [data-cam]').forEach((btn) => {
      btn.addEventListener('click', () => this.onCamera?.(btn.dataset.cam));
    });
    doc?.querySelector('#specFollowPrev')?.addEventListener('click', () => this.onFollowCycle?.(-1));
    doc?.querySelector('#specFollowNext')?.addEventListener('click', () => this.onFollowCycle?.(1));
    doc?.querySelector('#specDisconnect')?.addEventListener('click', () => this.onDisconnect?.());
  }

  show() { this.root?.classList.remove('hidden'); this.feedRoot?.classList.remove('hidden'); }
  hide() { this.root?.classList.add('hidden'); this.feedRoot?.classList.add('hidden'); }
  pushFeed(line) { this.feed = [line, ...(this.feed ?? [])].slice(0, 8); }

  update(state = {}) {
    const vm = spectatorViewModel({ ...state, feed: (this.feed?.length ? this.feed : state.feed) });
    const set = (sel, text) => { const el = this.root?.querySelector(sel); if (el) el.textContent = text; };
    const root = this.root;
    if (root) {
      root.classList.toggle('cam-follow', vm.camMode === 'FOLLOW_PLAYER');
      set('#specStatus', vm.status);
      set('#specDelay', vm.delaySec != null ? `ATRASO ${vm.delaySec}s` : 'ATRASO —');
      set('#specAlive', `◇ ${String(vm.alive).padStart(2, '0')} VIVOS`);
      set('#specRing', `RING ${vm.ring.fase} · ${vm.ring.raio} · ${vm.ring.estado} · ${vm.ring.contagem}`);
      root.querySelector('#specRing')?.classList.toggle('shrinking', vm.ring.shrinking);
      // ranking
      const list = root.querySelector('#specStandings');
      if (list) {
        list.replaceChildren(...vm.top.map((row) => {
          const el = this.root.ownerDocument.createElement('div');
          el.className = `spec-row${row.alive ? '' : ' out'}${row.downed ? ' down' : ''}`;
          el.innerHTML = `<b>${String(row.rank).padStart(2, '0')}</b><span class="spec-name">${esc(row.name)}</span><span class="spec-kills">${String(row.kills).padStart(2, '0')} ✕</span><i class="spec-life"><em style="width:${row.life}%"></em></i>`;
          return el;
        }));
      }
      // feed
      if (this.feedRoot) {
        this.feedRoot.replaceChildren(...vm.feed.map((line) => {
          const el = this.root.ownerDocument.createElement('div');
          el.className = `spec-feed-entry ${line.cls ?? ''}`;
          el.innerHTML = `<b>${esc(line.who)} //</b> ${esc(line.msg)}`;
          return el;
        }));
      }
    }
    return vm;
  }
}

// ───jogo espectador: Game3D reutilizado com a transmissão no lugar da sim─────
// Definido AQUI DENTRO (Game3D chega por import dinâmico no bootstrap — mesmo
// padrão anti-ciclo do online3d). Nada de sim local, input ou ZU: a câmera é de
// broadcast e os atores atrasados atravessam o MESMO pipeline de LOD/frustum.
function createSpectatorGame(Game3D) {
  return class SpectatorGame3D extends Game3D {
    constructor(seed, remote) {
      super(seed, { net: { spectator: true } }); // net marker: online=true (bots vêm da view)
      this.view = new SpectatorView();
      this.sim = this.view;
      this.hud.sim = this.view;
      this.remote = remote;
      this.camMode = remote.camera;
      // HUD de espectador substitui o HUD de jogador (painéis escondidos via body.spectating)
      this.specHud = new SpectatorHUD({
        onCamera: (mode) => { this.camMode = mode; remote.setCamera(mode, this.camMode === 'FOLLOW_PLAYER' ? remote.followPlayerId : null); },
        onFollowCycle: (dir) => { const f = remote.cycleFollow(dir); if (f) this.camMode = 'FOLLOW_PLAYER'; },
        onDisconnect: () => remote.dispose(),
      });
      remote.onStatus = (s) => {
        this.hud.setMatchStatus(`ESPECTADOR // ${s}`);
        this._specStatus = s;
      };
      remote.onBatch = (batch) => this.view.applyBatch(batch);
      remote.onFeed = (line, e) => {
        this.specHud.pushFeed(line);
        // killfeed clássico (canto superior) também recebe eliminações
        if (e?.type === 'ELIMINATION') {
          this.hud.killfeed(e.data?.killer ?? '—', e.data?.victim ?? '—', !!e.data?.headshot, false, !!e.data?.knock);
        }
      };
      // rig FPS nunca aparece na transmissão (mãos flutuando na frente da câmera)
      this.firstPersonRig.visible = false;
      this.playerOp.group.visible = false;
      document.body.classList.add('spectating');
      this.zuOpen = false;
      this.hud.hideZu();
      this.hud.hideSpectator();
      this.specHud.show();
      this.hud.setMatchStatus(`ESPECTADOR // ${remote.status}`);
      this.hud.feed('TRANSMISSÃO', `Espectador remoto da sala ${remote.roomId} — feed atrasado (anti-ghosting).`, 'good');
      this._camPose = { pos: new THREE.Vector3(0, 40, 200), look: new THREE.Vector3(0, 0, 0) };
    }

    // câmeras de broadcast (FREECAM/FOLLOW/OVERHEAD/RING_CENTER) com suavização
    updateSpectatorCamera(dt) {
      const r = this.view.ring;
      const follow = this.camMode === 'FOLLOW_PLAYER'
        ? (this.view.bots.find((b) => b.id === this.remote.followPlayerId) ?? null)
        : null;
      spectatorCameraPose(this.camMode, {
        ringCenter: { x: r.x, z: r.z },
        ringRadius: r.radius,
        follow: follow ? { x: follow.x, y: follow.y, z: follow.z } : { x: r.x, y: 0, z: r.z },
        time: this.animT,
      }, this._camPose);
      const k = Math.min(1, dt * 2.2);
      this.camera.position.lerp(this._camPose.pos, k);
      this.camera.lookAt(this._camPose.look);
    }

    loop() {
      requestAnimationFrame(this.loop);
      const dt = Math.min(.1, this.clock.getDelta());
      this.animT += dt;
      this.syncLoot();
      this.syncEntities(dt);          // atores atrasados + LOD + frustum (Fase 13)
      this.updateRing();
      this.updateSkyPhase(dt);
      this.updateSpectatorCamera(dt);
      this.effects.update(dt);
      this.specHud.update({
        status: this._specStatus,
        delayMs: this.remote.delayMs,
        players: this.remote.last?.players ?? [],
        ringState: this.remote.last?.ringState ?? null,
        camMode: this.camMode,
        followId: this.remote.followPlayerId,
      });
      if (this.post) this.post.render(dt);
      else this.renderer.render(this.scene, this.camera);
    }

    dispose() {
      this.remote.dispose();
      this.specHud.hide();
      document.body.classList.remove('spectating');
    }
  };
}

// ---------- bootstrap (?spectate=SALA&cam=FREECAM) ----------
export async function bootstrapSpectator({ roomId = 'default', camera = null } = {}) {
  const { Game3D } = await import('./main3d.js'); // anti-ciclo ESM (padrão online3d)
  const SpectatorGame3D = createSpectatorGame(Game3D);
  const remote = new SpectatorRemote({ roomId, camera: camera ?? 'RING_CENTER' });
  const game = new SpectatorGame3D('CIGKV-3D-01', remote);
  remote.connect();
  window.KhaaosSpectator3D = { game, remote };
  return game;
}
