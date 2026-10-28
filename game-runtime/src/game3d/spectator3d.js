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
    // Fase 18 — sobrevivências do mundo na transmissão (banner + FX + áudio)
    case 'WORLD_HAZARD':
      return worldHazardFeedLine(d);
    default:
      return null;
  }
}

// Descrição do hazard p/ feed e banner — MESMA gramática dos avisos do
// jogador (main3d), para que a transmissão conte a mesma história.
export const WORLD_HAZARD_INFO = Object.freeze({
  tsunami: { label: 'TSUNAMI', hint: 'nível do mar subindo — terreno ALTO é a única salvação' },
  lava: { label: 'ERUPÇÃO', hint: 'lava subindo — as mesas são a única salvação' },
  gravity: { label: 'ANOMALIA KHAOS', hint: 'gravidade instável — domos de contenção nos pilões' },
  acid: { label: 'CHUVA ÁCIDA', hint: 'chuva ácida no setor — procure cobertura' },
});

export function worldHazardFeedLine(d = {}) {
  const info = WORLD_HAZARD_INFO[d.hazard];
  if (!info) return null; // hazard desconhecido nunca quebra o feed
  if (d.phase === 'end') return { who: 'MUNDO', cls: 'good', msg: `${info.label} recuando — área liberada.` };
  if (d.phase === 'pulse') return { who: 'MUNDO', cls: 'warn', msg: `${info.label}: ${info.hint}.` };
  const dur = Number.isFinite(d.durationSeconds) ? ` (${Math.round(d.durationSeconds)}s)` : '';
  return { who: 'MUNDO', cls: 'bad', msg: `${info.label} ATIVO${dur}: ${info.hint}.` };
}

// Fase 14 — URL da transmissão: /?spectate=SALA&cam=… (botão ASSISTIR do modal
// ZU aponta para cá). Sala vazia cai na sala "default" do pipeline.
export function spectateHref(code = '') {
  const room = String(code ?? '').trim() || 'default';
  return `/?spectate=${encodeURIComponent(room)}`;
}

// ───Fase 19: DIRETOR AUTOMÁTICO da câmera FOLLOW──────────────────────────
// A transmissão deve contar a história do mundo: quando um hazard ameaça,
// a câmera corta para quem está sob perigo REAL — computado do MESMO payload
// autoritativo do pipeline (players + ringState + WORLD_HAZARD). Sinais:
// nocaute (DBNO), dano recente (vida caiu entre batches — tsunami/lava/ácido
// mordendo), zona geométrica da anomalia (anchors), fora do ring, vida baixa.
export const DANGER_WEIGHTS = Object.freeze({
  knocked: 40,       // nocauteado — morrendo AGORA (finalização disponível)
  hazardDamage: 35,  // vida caiu com hazard ativo — o mundo está mordendo
  anchorZone: 30,    // dentro do raio de um pilar da anomalia Khaaos
  outsideRing: 20,   // fora do cerco — dano de ring garantido
  recentDamage: 15,  // vida caiu (combate) desde o batch anterior
  lowHealth: 10,     // vida ≤ LOW_HEALTH_THRESHOLD — à beira da eliminação
});
export const LOW_HEALTH_THRESHOLD = 30;

// Fase 19 — margem p/ RE-CORTE dentro do MESMO hazard: só troca de alvo quando
// alguém está MUITO mais ameaçado que o seguido (≥ 1 tier de peso + folga) —
// drama de diretor sem jitter por ruído (dano de ring 20 < margem; domo 30,
// nocaute 40 e dano sob hazard 35 ≥ margem).
export const AUTO_RETARGET_MARGIN = 25;

/**
 * Score de perigo de um jogador do pipeline (0..∞, maior = mais urgente).
 * Puro e determinístico: o mesmo payload gera sempre o MESMO score.
 * ctx: { hazard: { hazard, anchors?, anchorRadius? } | null,
 *        ringState: { ringCenter: [x,y,z], currentRadius } | null,
 *        prevHealth: { [id]: vida do batch anterior } }
 */
export function dangerScore(p = {}, ctx = {}) {
  const { hazard = null, ringState = null, prevHealth = {} } = ctx;
  let score = 0;
  if (p.isDowned) score += DANGER_WEIGHTS.knocked;
  // dano recente: vida caiu desde o último batch (histórico do remote)
  const before = prevHealth[String(p.id)];
  const dropped = Number.isFinite(before) && (p.health ?? 0) < before - .5;
  if (dropped) score += hazard ? DANGER_WEIGHTS.hazardDamage : DANGER_WEIGHTS.recentDamage;
  // anomalia Khaaos: PERIGO GEOMÉTRICO — dentro do domo de um pilar é dano certo
  if (hazard?.hazard === 'gravity' && Array.isArray(hazard.anchors) && hazard.anchors.length > 0) {
    const r = Number.isFinite(hazard.anchorRadius) ? hazard.anchorRadius : 28;
    if (hazard.anchors.some((a) => Math.hypot((p.posX ?? 0) - (a.x ?? 0), (p.posY ?? 0) - (a.z ?? 0)) <= r)) {
      score += DANGER_WEIGHTS.anchorZone;
    }
  }
  // ring: fora do cerco é dano garantido (dados autoritativos do batch)
  if (ringState && Array.isArray(ringState.ringCenter)) {
    const cx = ringState.ringCenter[0] ?? 0, cz = ringState.ringCenter[2] ?? 0;
    const radius = Number.isFinite(ringState.currentRadius) ? ringState.currentRadius : Infinity;
    if (Math.hypot((p.posX ?? 0) - cx, (p.posY ?? 0) - cz) > radius) score += DANGER_WEIGHTS.outsideRing;
  }
  if ((p.health ?? 0) <= LOW_HEALTH_THRESHOLD) score += DANGER_WEIGHTS.lowHealth;
  return score;
}

/** Ordem de urgência (vivos apenas): score desc → abates desc → vida ASC
 *  (mais ferido = mais urgente) → id (determinismo byte a byte). */
export function prioritizeByHazard(players = [], ctx = {}) {
  return (players ?? [])
    .filter((p) => p && !p.isEliminated)
    .map((p) => ({ p, score: dangerScore(p, ctx) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.p.kills ?? 0) !== (a.p.kills ?? 0)) return (b.p.kills ?? 0) - (a.p.kills ?? 0);
      if ((a.p.health ?? 0) !== (b.p.health ?? 0)) return (a.p.health ?? 0) - (b.p.health ?? 0);
      return String(a.p.id).localeCompare(String(b.p.id));
    })
    .map((e) => e.p);
}

/** Alvo mais ameaçado (ou null — sem vivos). */
export function pickHazardTarget(players = [], ctx = {}) {
  return prioritizeByHazard(players, ctx)[0] ?? null;
}

/** Snapshot de vida p/ detectar dano entre batches (id → health). */
export function snapshotHealth(players = []) {
  const out = {};
  for (const p of players ?? []) if (p && p.id != null) out[String(p.id)] = p.health ?? 0;
  return out;
}

// ───remote: cliente WS do pipeline (socket injetável p/ testes)───────────────

export const SPECTATOR_CAMERAS = ['FREECAM', 'FOLLOW_PLAYER', 'OVERHEAD', 'RING_CENTER'];

export class SpectatorRemote {
  constructor({ roomId = 'default', camera = 'RING_CENTER', url = null, socketFactory = null, onStatus = null, onBatch = null, onFeed = null, onEvent = null, metricsIntervalMs = 10_000 } = {}) {
    this.roomId = roomId;
    this.camera = SPECTATOR_CAMERAS.includes(camera) ? camera : 'RING_CENTER';
    this.followPlayerId = null;
    this.url = url;
    this.socketFactory = socketFactory;
    this.onStatus = onStatus; this.onBatch = onBatch; this.onFeed = onFeed;
    // Fase 18 — evento BRUTO do pipeline p/ cada novidade (após dedupe):
    // alimenta o SpectatorView (contrato da sim) sem passar pelo feed.
    this.onEvent = onEvent;
    // Fase 19 — diretor automático: corta p/ o alvo mais ameaçado quando um
    // hazard começa (ou quando o alvo seguido morre). Navegação manual
    // (prev/next) reserva o hazard corrente — o diretor só retoma no PRÓXIMO.
    this.onAutoFollow = null;     // (picked, 'hazard-start'|'target-lost')
    this.autoFollow = true;       // LIGADO por padrão: a transmissão narra o perigo
    this.activeHazard = null;     // último WORLD_HAZARD start sem end (payload completo)
    this._prevHealth = {};        // vida do batch anterior (detecção de dano)
    this._autoHoldHazard = null;  // hazard reservado pela navegação manual
    this._autoHeld = null;        // quem reivindica o hazard corrente: 'auto'|'manual'
    this.status = 'AGUARDANDO';
    this.delayMs = null;          // vem no SPECTATOR_WELCOME (anti-ghosting)
    this.spectatorId = null;
    this.last = null;             // último batch: { players, ringState, timestamp }
    this.feed = [];               // linhas já traduzidas (mais novas primeiro)
    this.ws = null;
    this._seenEvents = new Set(); // dedupe type:timestamp (batchs repetem cauda)
    // Fase 24 — métricas do DIRETOR p/ o /admin (transporte client→server):
    // cortes por motivo/hazard, intervenções manuais e liga/desliga. Um frame
    // DIRECTOR_METRICS sai a cada corte/ação + heartbeat periódico enquanto a
    // transmissão está LIVE (o /admin vê dado fresco mesmo sem novidade).
    this.metricsIntervalMs = Number.isFinite(metricsIntervalMs) && metricsIntervalMs >= 0 ? metricsIntervalMs : 10_000;
    this._metricsTimer = null;
    this._directorMetrics = {
      cuts: { total: 0, byReason: {}, byHazard: {} },
      manual: { followSelects: 0, cycles: 0 },
      toggles: { on: 0, off: 0 },
    };
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
    ws.onclose = () => { this.#stopMetricsHeartbeat(); this.ws = null; this._setStatus('TRANSMISSÃO ENCERRADA'); };
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
        this.#reportMetrics(); // estado inicial no /admin imediatamente
        this.#startMetricsHeartbeat();
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
          this.onEvent?.(e); // Fase 18 — contrato bruto (view ingere hazards)
          if (e.type === 'WORLD_HAZARD') this.#trackHazard(e.data ?? {}); // Fase 19 — diretor
        }
        this.onBatch?.(this.last);
        this.#autoFollowTick(); // Fase 19 — decisão de corte APÓS aplicar o batch
        break;
      }
      default: break; // tipos futuros são ignorados com elegância
    }
  }

  // Fase 19 — rastreio do hazard ativo (mesma semântica do banner da view:
  // start grava com payload COMPLETO p/ a geometria da anomalia; end limpa e
  // re-arma o diretor; ácido é pulse — nunca grava estado persistente).
  #trackHazard(d = {}) {
    if (!WORLD_HAZARD_INFO[d.hazard]) return; // desconhecido nunca dirige a câmera
    if (d.phase === 'end') { this.activeHazard = null; this._autoHoldHazard = null; this._autoHeld = null; return; }
    if (d.phase === 'start') this.activeHazard = { hazard: d.hazard, ...d };
  }

  // Fase 19 — decide se o diretor corta. Três gatilhos, em ordem de drama:
  // (a) hazard NOVO começou (diferente do reservado) → 'hazard-start';
  // (b) alvo seguido sumiu/morreu → 'target-lost';
  // (c) DURANTE um hazard, alguém ficou MUITO mais ameaçado que o alvo
  //     (score ≥ seguido + AUTO_RETARGET_MARGIN) → 'hazard-escalation'.
  // Sem alvo escolhido e sem hazard → sem corte: FREECAM/RING_CENTER não é
  // sequestrado sem motivo.
  #autoPick(players = []) {
    if (!this.autoFollow) return null;
    const followId = this.followPlayerId;
    const current = followId != null
      ? (players ?? []).find((p) => String(p.id) === String(followId)) ?? null
      : null;
    const targetLost = followId != null && (!current || current.isEliminated);
    const hazardKind = this.activeHazard?.hazard ?? null;
    const hazardFresh = hazardKind !== null && hazardKind !== this._autoHoldHazard;
    const ctx = {
      hazard: this.activeHazard,
      ringState: this.last?.ringState ?? null,
      prevHealth: this._prevHealth,
    };
    if (!targetLost && !hazardFresh) {
      // (c) escalada dentro do mesmo hazard — corte só com margem clara e
      // SOMENTE se o hazard não foi reservado pela navegação manual
      if (!hazardKind || !current || current.isEliminated) return null;
      if (this._autoHeld === 'manual') return null;
      const top = pickHazardTarget(players, ctx);
      if (!top || String(top.id) === String(current.id)) return null;
      if (dangerScore(top, ctx) < dangerScore(current, ctx) + AUTO_RETARGET_MARGIN) return null;
      this._autoReason = 'hazard-escalation';
      return top; // hold permanece (mesmo hazard em curso)
    }
    const pick = pickHazardTarget(players, ctx);
    if (!pick) return null;
    this._autoReason = targetLost && !hazardFresh ? 'target-lost' : 'hazard-start';
    this._autoHoldHazard = hazardKind;
    this._autoHeld = 'auto';
    return pick;
  }

  #autoFollowTick() {
    const players = this.last?.players ?? [];
    const picked = this.#autoPick(players);
    this._prevHealth = snapshotHealth(players); // histórico p/ o próximo batch
    if (!picked) return;
    this.setCamera('FOLLOW_PLAYER', picked.id);
    this.#recordCut(this._autoReason, this.activeHazard?.hazard ?? null); // Fase 24
    this.onAutoFollow?.(picked, this._autoReason);
  }

  /** Fase 19 — liga/desliga o diretor. Ao LIGAR, corta imediatamente p/ o alvo
   *  mais ameaçado (o gesto do usuário tem resposta na hora). */
  setAutoFollow(on = !this.autoFollow) {
    this.autoFollow = !!on;
    this._directorMetrics.toggles[this.autoFollow ? 'on' : 'off']++; // Fase 24
    this.#reportMetrics();
    if (this.autoFollow) {
      this._autoHoldHazard = null;
      this._autoHeld = null;
      const picked = this.#autoPick(this.last?.players ?? []);
      if (picked) {
        this.setCamera('FOLLOW_PLAYER', picked.id);
        this.#recordCut(this._autoReason, this.activeHazard?.hazard ?? null); // Fase 24
        this.onAutoFollow?.(picked, this._autoReason);
      }
    }
    return this.autoFollow;
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
    // Fase 19 — navegação manual reserva o hazard corrente: o diretor não
    // disputa o controle durante ESTE hazard (nem por escalada); retoma no
    // próximo (novo start).
    this._autoHoldHazard = this.activeHazard?.hazard ?? null;
    this._autoHeld = 'manual';
    this.setCamera('FOLLOW_PLAYER', next.id);
    this._directorMetrics.manual.cycles++; // Fase 24 — intervenção manual
    this.#reportMetrics();
    return next;
  }

  // Fase 21 — standings CLICÁVEIS: segue um jogador ESPECÍFICO do ranking com
  // a MESMA semântica de reserva manual do prev/next (o diretor não disputa
  // este hazard; retoma no próximo). Só vivos são seguíveis — clicar em
  // eliminado/fora do TOP não faz nada (o HUD nem emite o clique).
  followPlayer(id) {
    const alive = computeStandings(this.last?.players ?? []).filter((p) => !p.isEliminated);
    const target = alive.find((p) => String(p.id) === String(id)) ?? null;
    if (!target) return null;
    this._autoHoldHazard = this.activeHazard?.hazard ?? null;
    this._autoHeld = 'manual';
    this.setCamera('FOLLOW_PLAYER', target.id);
    this._directorMetrics.manual.followSelects++; // Fase 24 — clique no standings
    this.#reportMetrics();
    return target;
  }

  // ─── Fase 24 — métricas do diretor: coleta + transporte client→server ──────

  #recordCut(reason, hazardKind) {
    const m = this._directorMetrics;
    m.cuts.total++;
    m.cuts.byReason[reason] = (m.cuts.byReason[reason] ?? 0) + 1;
    if (hazardKind) m.cuts.byHazard[hazardKind] = (m.cuts.byHazard[hazardKind] ?? 0) + 1;
    this.#reportMetrics();
  }

  /** Snapshot das métricas do diretor — consumido pelo frame DIRECTOR_METRICS
   *  e disponível p/ o próprio HUD da transmissão depurar a direção. */
  getMetrics() {
    const m = this._directorMetrics;
    return {
      enabled: this.autoFollow,
      cameraMode: this.camera,
      followPlayerId: this.followPlayerId,
      activeHazard: this.activeHazard?.hazard ?? null,
      cuts: { total: m.cuts.total, byReason: { ...m.cuts.byReason }, byHazard: { ...m.cuts.byHazard } },
      manual: { ...m.manual },
      toggles: { ...m.toggles },
      now: Date.now(),
    };
  }

  /** Transporte: UM frame DIRECTOR_METRICS no WS do espectador (fire-and-forget;
   *  o servidor sanitiza — payload do cliente nunca é confiável). */
  #reportMetrics() {
    if (this.ws?.readyState === 1) {
      try { this.ws.send(JSON.stringify({ type: 'DIRECTOR_METRICS', metrics: this.getMetrics() })); } catch { /* socket morrendo */ }
    }
  }

  #startMetricsHeartbeat() {
    this.#stopMetricsHeartbeat();
    if (!(this.metricsIntervalMs > 0)) return; // 0 desliga (testes)
    this._metricsTimer = setInterval(() => this.#reportMetrics(), this.metricsIntervalMs);
    if (this._metricsTimer?.unref) this._metricsTimer.unref(); // nunca segura o processo
  }

  #stopMetricsHeartbeat() {
    if (this._metricsTimer) { clearInterval(this._metricsTimer); this._metricsTimer = null; }
  }

  dispose() {
    this.#stopMetricsHeartbeat();
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
    // Fase 18 — hazard ativo da transmissão (banner do HUD) + fila de eventos
    // no CONTRATO da sim: o handleEvents herdado do Game3D processa tsunami/
    // lava/anomalia/ácido com o MESMO SurvivalFX/áudio/aviso do jogador.
    this.hazardActive = null;     // { hazard, phase } do último start sem end
    this.#hazardQueue = [];
  }

  #hazardQueue = [];

  /**
   * Fase 18 — ingere evento BRUTO do pipeline (remote.onEvent) e traduz
   * WORLD_HAZARD p/ o vocabulário da sim (tsunamiStart/eruptionStart/…).
   * Parâmetros autoritativos passam intactos — o SurvivalFX do espectador
   * materializa a MESMA regra de dano por altura do jogador.
   */
  ingestEvent(e = {}) {
    if (e?.type !== 'WORLD_HAZARD') return false;
    const d = e.data ?? {};
    if (!WORLD_HAZARD_INFO[d.hazard]) return true; // hazard desconhecido: sem fila, sem banner
    const simEvent = this.#hazardSimEvent(d);
    if (simEvent) this.#hazardQueue.push(simEvent);
    if (d.hazard === 'acid') return true; // pulse curto: sem banner persistente
    if (d.phase === 'end') this.hazardActive = null;
    else if (d.phase === 'start') this.hazardActive = { hazard: d.hazard, phase: 'active' };
    return true;
  }

  #hazardSimEvent(d = {}) {
    switch (`${d.hazard}:${d.phase}`) {
      case 'tsunami:start': return { type: 'tsunamiStart', submergeBelowY: d.submergeBelowY ?? 90, durationSeconds: d.durationSeconds ?? 40 };
      case 'tsunami:end': return { type: 'tsunamiEnd', submergeBelowY: d.submergeBelowY };
      case 'lava:start': return { type: 'eruptionStart', lavaBelowY: d.lavaBelowY ?? 180, durationSeconds: d.durationSeconds ?? 35 };
      case 'lava:end': return { type: 'eruptionEnd', lavaBelowY: d.lavaBelowY };
      case 'gravity:start': return { type: 'gravityAnomalyStart', gravityScale: d.gravityScale ?? .35, anchors: d.anchors ?? [], anchorRadius: d.anchorRadius ?? 28, durationSeconds: d.durationSeconds ?? 30 };
      case 'gravity:end': return { type: 'gravityAnomalyEnd', gravityScale: d.gravityScale };
      case 'acid:pulse': return { type: 'acidRain', damage: d.damage ?? 1 };
      default: return null; // combinação desconhecida nunca quebra a view
    }
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

  /** Fase 18 — drena a fila de hazard no contrato da sim (handleEvents do Game3D). */
  consumeEvents() {
    if (!this.#hazardQueue.length) return [];
    const out = this.#hazardQueue;
    this.#hazardQueue = [];
    return out;
  }
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
  // Fase 18 — hazard ativo da transmissão p/ o banner (#specHazard).
  // Hazard sem info registrada cai no fallback label=KIND.toUpperCase().
  const info = WORLD_HAZARD_INFO[state.hazard?.hazard];
  const hazard = state.hazard ? {
    label: info?.label ?? String(state.hazard.hazard).toUpperCase(),
    hint: info?.hint ?? '',
    kind: state.hazard.hazard,
  } : null;
  return {
    status: state.status ?? 'AGUARDANDO',
    delaySec: Number.isFinite(state.delayMs) ? Math.round(state.delayMs / 1000) : null,
    alive: alive.length,
    camMode: state.camMode ?? 'RING_CENTER',
    followName: follow ? (follow.displayName ?? follow.name ?? follow.id) : null,
    ring,
    hazard,
    autoFollow: !!state.autoFollow, // Fase 19 — diretor automático (botão AUTO)
    followId: state.followId != null ? String(state.followId) : null, // Fase 21 — highlight do alvo
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
  constructor({ onCamera = null, onFollowCycle = null, onFollowSelect = null, onDisconnect = null, onAutoToggle = null } = {}) {
    this.onCamera = onCamera; this.onFollowCycle = onFollowCycle; this.onDisconnect = onDisconnect;
    // Fase 19 — botão AUTO: liga/desliga o diretor automático da câmera
    this.onAutoToggle = onAutoToggle;
    // Fase 21 — standings clicáveis: clique numa linha do ranking segue aquele
    // jogador (reserva manual igual ao prev/next)
    this.onFollowSelect = onFollowSelect;
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
    doc?.querySelector('#specAuto')?.addEventListener('click', () => this.onAutoToggle?.());
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
      // Fase 19 — estado visual do diretor automático (botão AUTO aceso/apagado)
      root.querySelector('#specAuto')?.classList.toggle('active', vm.autoFollow);
      set('#specStatus', vm.status);
      set('#specDelay', vm.delaySec != null ? `ATRASO ${vm.delaySec}s` : 'ATRASO —');
      set('#specAlive', `◇ ${String(vm.alive).padStart(2, '0')} VIVOS`);
      set('#specRing', `RING ${vm.ring.fase} · ${vm.ring.raio} · ${vm.ring.estado} · ${vm.ring.contagem}`);
      root.querySelector('#specRing')?.classList.toggle('shrinking', vm.ring.shrinking);
      // Fase 18 — banner de hazard da transmissão (TSUNAMI/LAVA/ANOMALIA/ÁCIDO)
      const hz = root.querySelector('#specHazard');
      if (hz) {
        if (vm.hazard) {
          hz.textContent = `${vm.hazard.label} — ${vm.hazard.hint}`;
          hz.className = `spec-hazard hazard-${vm.hazard.kind}`;
        } else {
          hz.textContent = '';
          hz.className = 'spec-hazard hidden';
        }
      }
      // ranking
      const list = root.querySelector('#specStandings');
      if (list) {
        list.replaceChildren(...vm.top.map((row) => {
          const el = this.root.ownerDocument.createElement('div');
          const isFollow = vm.followId != null && String(vm.followId) === row.id;
          el.className = `spec-row${row.alive ? '' : ' out'}${row.downed ? ' down' : ''}${row.alive ? ' clickable' : ''}${isFollow ? ' is-follow' : ''}`;
          el.dataset.id = row.id;
          el.innerHTML = `<b>${String(row.rank).padStart(2, '0')}</b><span class="spec-name">${esc(row.name)}</span><span class="spec-kills">${String(row.kills).padStart(2, '0')} ✕</span><i class="spec-life"><em style="width:${row.life}%"></em></i>`;
          if (row.alive && this.onFollowSelect) {
            el.addEventListener('click', () => this.onFollowSelect(row.id));
          }
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
        onFollowSelect: (id) => { const f = remote.followPlayer(id); if (f) this.camMode = 'FOLLOW_PLAYER'; }, // Fase 21 — ranking clicável
        onAutoToggle: () => remote.setAutoFollow(), // Fase 19 — diretor on/off
        onDisconnect: () => remote.dispose(),
      });
      // Fase 19 — diretor automático: a transmissão NARRA o corte no feed
      remote.onAutoFollow = (pick, reason) => {
        this.camMode = 'FOLLOW_PLAYER';
        const nm = pick.displayName ?? pick.name ?? String(pick.id).slice(-6);
        const why = reason === 'hazard-start' ? 'sob ameaça do mundo'
          : reason === 'hazard-escalation' ? 'perigo maior no mundo'
          : 'alvo anterior perdido';
        this.specHud.pushFeed({ who: 'CÂMERA', cls: 'warn', msg: `corte automático → ${nm} (${why})` });
      };
      remote.onStatus = (s) => {
        this.hud.setMatchStatus(`ESPECTADOR // ${s}`);
        this._specStatus = s;
      };
      remote.onBatch = (batch) => this.view.applyBatch(batch);
      // Fase 18 — evento bruto do pipeline alimenta a view (contrato da sim):
      // o handleEvents() do loop processa hazards com SurvivalFX/áudio/avisos.
      remote.onEvent = (e) => this.view.ingestEvent(e);
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
      this.handleEvents();            // Fase 18 — hazards da transmissão (FX/áudio/aviso)
      this.updateRing();
      this.updateSkyPhase(dt);
      // Fase 18 — marcos animados + sobrevivências na TRANSMISSÃO (antes o
      // espectador via fumaça/marcos congelados e nenhum tsunami/lava).
      const marksAnim = this.scene.userData.worldMarks?.animators;
      if (marksAnim) for (const fn of marksAnim) fn(dt, this.animT);
      // Fase 22 — cenários vivos na TRANSMISSÃO (mesmo padrão dos marcos)
      const dressingAnim = this.scene.userData.districtDressing?.animators;
      if (dressingAnim) for (const fn of dressingAnim) fn(dt, this.animT);
      // Fase 23 — interiores na TRANSMISSÃO (flicker de lâmpadas/telas)
      const shaftsAnim = this.scene.userData.lightshafts?.animators; // Fase 24
    if (shaftsAnim) for (const fn of shaftsAnim) fn(dt, this.animT);
    const interiorsAnim = this.scene.userData.interiors?.animators;
      if (interiorsAnim) for (const fn of interiorsAnim) fn(dt, this.animT);
      this.survivalFX?.update(dt, this.animT);
      this.updateSpectatorCamera(dt);
      this.effects.update(dt);
      this.specHud.update({
        status: this._specStatus,
        delayMs: this.remote.delayMs,
        players: this.remote.last?.players ?? [],
        ringState: this.remote.last?.ringState ?? null,
        camMode: this.camMode,
        followId: this.remote.followPlayerId,
        hazard: this.view.hazardActive, // Fase 18 — banner do hazard ativo
        autoFollow: this.remote.autoFollow, // Fase 19 — botão AUTO aceso/apagado
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
  // Fase 18 — áudio da transmissão: ctx desbloqueado no 1º gesto (política de
  // autoplay dos navegadores). Sem gesto, tudo continua no-op com elegância.
  const unlockAudio = () => { game.audio?.init?.(); game.audio?.resume?.(); };
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  window.KhaaosSpectator3D = { game, remote };
  return game;
}
