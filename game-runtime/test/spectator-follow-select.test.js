// Khaaos Run — Fase 21 — standings CLICÁVEIS p/ escolher o alvo do FOLLOW.
// SpectatorRemote.followPlayer(id) com a MESMA semântica de reserva manual do
// prev/next (Fase 19) + HUD: linhas vivas do TOP 8 clicáveis, alvo corrente
// destacado (is-follow), eliminados não seguíveis. Socket falso = mesmo
// contrato do spectator-autofollow.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { SpectatorRemote, spectatorViewModel, SpectatorHUD } =
  await import('../src/game3d/spectator3d.js');

class FakeSocket {
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeSocket.last = this; }
  onopen = null; onmessage = null; onclose = null; onerror = null;
  open() { this.readyState = 1; this.onopen?.(); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.(); }
  message(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}
const cameraMsgs = (ws) => ws.sent.filter((m) => m.type === 'SET_CAMERA');

const player = (over = {}) => ({
  id: 'p1', displayName: 'KHAEL VANCE', species: 'kv',
  posX: 0, posY: 0, yaw: 0, health: 100, shield: 0,
  isDowned: false, isEliminated: false, kills: 0, ...over,
});
const ringState = (over = {}) => ({
  currentPhase: 0, currentRadius: 520, ringCenter: [0, 0, 0],
  isShrinking: false, nextPhaseIn: 30, ...over,
});
const batch = (players, events = [], ts = Date.now()) => ({
  // protocolo REAL do pipeline: players/ringState em data; events no TOPO da msg
  type: 'SPECTATOR_BATCH', data: { players, ringState: ringState() }, events, timestamp: ts,
});
const tsunamiStart = (ts = 1000) => ({ type: 'WORLD_HAZARD', data: { hazard: 'tsunami', phase: 'start', submergeBelowY: 90, durationSeconds: 40 }, timestamp: ts });

// ---------- DOM falso mínimo (o HUD real lê #spectatorHud/#specStandings) ----------
class FakeElement {
  constructor() { this.children = []; this.className = ''; this.dataset = {}; this.listeners = {}; this._innerHTML = ''; this.textContent = ''; this.title = ''; }
  set innerHTML(v) { this._innerHTML = v; }
  get innerHTML() { return this._innerHTML; }
  get ownerDocument() { return fakeDoc; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  click() { for (const f of this.listeners.click ?? []) f({}); }
  replaceChildren(...els) { this.children = els; }
  querySelector(sel) { return this.q?.get(sel) ?? null; }
  get classList() {
    const el = this;
    return {
      add(c) { const set = new Set(el.className.split(' ').filter(Boolean)); set.add(c); el.className = [...set].join(' '); },
      remove(c) { el.className = el.className.split(' ').filter((x) => x && x !== c).join(' '); },
      toggle(c, f) { const on = f === undefined ? !el.className.split(' ').includes(c) : !!f; if (on) this.add(c); else this.remove(c); return on; },
    };
  }
}
const fakeDoc = {
  querySelector(sel) { return fakeDoc.map.get(sel) ?? null; },
  querySelectorAll() { return []; },
  createElement() { return new FakeElement(); },
  map: new Map(),
};
function buildHudHarness(state, handlers = {}) {
  const root = new FakeElement();
  const list = new FakeElement();
  root.q = new Map([['#specStandings', list]]);
  fakeDoc.map.set('#spectatorHud', root);
  fakeDoc.map.delete('#specFeed');
  // o módulo lê o document GLOBAL — injeta o fake e restaura no fim
  const hadDoc = typeof globalThis.document !== 'undefined';
  const prevDoc = globalThis.document;
  globalThis.document = fakeDoc;
  try {
    const hud = new SpectatorHUD(handlers);
    const vm = hud.update(state);
    return { hud, root, list, vm, rows: list.children };
  } finally {
    if (hadDoc) globalThis.document = prevDoc; else delete globalThis.document;
  }
}

// ---------- SpectatorRemote.followPlayer ----------

test('followPlayer: segue um jogador ESPECÍFICO vivo (frame SET_CAMERA com o id)', () => {
  const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  r.connect();
  const ws = FakeSocket.last;
  ws.open();
  ws.message(batch([player({ id: 'a' }), player({ id: 'b', displayName: 'BRAGA' }), player({ id: 'c' })]));
  const alvo = r.followPlayer('b');
  assert.equal(alvo?.id, 'b', 'devolve o alvo seguido');
  assert.equal(r.followPlayerId, 'b');
  const last = cameraMsgs(ws).at(-1);
  assert.deepEqual(last, { type: 'SET_CAMERA', cameraMode: 'FOLLOW_PLAYER', followPlayerId: 'b' });
});

test('followPlayer: id desconhecido → null, NENHUM frame, nenhuma reserva de diretor', () => {
  const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  r.connect();
  const ws = FakeSocket.last;
  ws.open();
  ws.message(batch([player({ id: 'a' })]));
  assert.equal(r.followPlayer('ghost'), null);
  assert.equal(r.followPlayer(null), null);
  assert.equal(cameraMsgs(ws).length, 0, 'nenhum corte fantasma');
  assert.equal(r._autoHeld, null, 'diretor segue livre');
});

test('followPlayer: eliminado NÃO é seguível (só vivos)', () => {
  const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  r.connect();
  const ws = FakeSocket.last;
  ws.open();
  ws.message(batch([player({ id: 'a' }), player({ id: 'morto', isEliminated: true })]));
  assert.equal(r.followPlayer('morto'), null);
  assert.equal(cameraMsgs(ws).length, 0);
  assert.equal(r.followPlayerId, null);
});

test('followPlayer: RESERVA MANUAL — diretor não disputa o hazard corrente (igual prev/next)', () => {
  const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  r.connect();
  const ws = FakeSocket.last;
  ws.open();
  // tsunami começa → diretor corta
  ws.message(batch([player({ id: 'a' }), player({ id: 'b' })], [tsunamiStart()]));
  const cortesAuto = cameraMsgs(ws).length;
  assert.ok(cortesAuto >= 1);
  // espectador clica no ranking durante o tsunami
  const alvo = r.followPlayer('b');
  assert.equal(alvo?.id, 'b');
  const total = cameraMsgs(ws).length;
  // 'a' toma dano pesado em batches seguintes: NENHUM corte forçado
  ws.message(batch([player({ id: 'a', health: 10 }), player({ id: 'b', health: 100 })]));
  ws.message(batch([player({ id: 'a', health: 4 }), player({ id: 'b', health: 100 })]));
  assert.equal(cameraMsgs(ws).length, total, 'hold manual respeitado mesmo com dano sob hazard');
  assert.equal(r.followPlayerId, 'b', 'escolha do espectador permanece');
  // tsunami termina → re-arma (end limpa a reserva e NÃO corta por si só);
  // NOVO hazard → diretor retoma (momento de diretor)
  ws.message(batch([player({ id: 'a' }), player({ id: 'b', health: 100 })], [{ type: 'WORLD_HAZARD', data: { hazard: 'tsunami', phase: 'end' }, timestamp: 2 }]));
  assert.equal(cameraMsgs(ws).length, total, 'fim do hazard não corta por si só');
  ws.message(batch([player({ id: 'a' }), player({ id: 'b', health: 100 })], [{ type: 'WORLD_HAZARD', data: { hazard: 'lava', phase: 'start', lavaBelowY: 180 }, timestamp: 3 }]));
  assert.ok(cameraMsgs(ws).length > total, 'novo hazard devolve o controle ao diretor');
  assert.equal(cameraMsgs(ws).at(-1).followPlayerId, 'a', 'empate → id decide (diretor de volta)');
});

test('followPlayer: clicar no alvo JÁ seguido re-reserva (mantém o hold manual)', () => {
  const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  r.connect();
  const ws = FakeSocket.last;
  ws.open();
  ws.message(batch([player({ id: 'a' })], [tsunamiStart()]));
  const antes = cameraMsgs(ws).length;
  const alvo = r.followPlayer('a');
  assert.equal(alvo?.id, 'a');
  assert.equal(cameraMsgs(ws).length, antes + 1, 'frame re-enviado (reconfirma o alvo)');
  assert.equal(r._autoHeld, 'manual', 'reserva manual renovada');
});

test('followPlayer e cycleFollow compartilham a MESMA semântica de reserva', () => {
  const r1 = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  r1.connect(); const ws1 = FakeSocket.last; ws1.open();
  ws1.message(batch([player({ id: 'a' }), player({ id: 'b' })], [tsunamiStart()]));
  r1.followPlayer('b');
  const r2 = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  r2.connect(); const ws2 = FakeSocket.last; ws2.open();
  ws2.message(batch([player({ id: 'a' }), player({ id: 'b' })], [tsunamiStart()]));
  r2.cycleFollow(1);
  assert.equal(r1._autoHeld, r2._autoHeld, 'mesmo estado de reserva');
  assert.equal(r1._autoHoldHazard, r2._autoHoldHazard, 'mesmo hazard reservado');
  assert.deepEqual(cameraMsgs(ws1).at(-1), cameraMsgs(ws2).at(-1));
});

// ---------- VM: followId exportado ----------

test('spectatorViewModel: followId exportado p/ o highlight (string, default null)', () => {
  const players = [player({ id: 'c1', displayName: 'Khael Vance', kills: 5 }), player({ id: 'c2' })];
  const vm = spectatorViewModel({ players, ringState: ringState(), followId: 'c2', feed: [] });
  assert.equal(vm.followId, 'c2');
  assert.equal(spectatorViewModel({ players, ringState: ringState(), feed: [] }).followId, null);
  assert.equal(spectatorViewModel({ players, ringState: ringState(), feed: [], followId: 42 }).followId, '42', 'id numérico vira string');
  // top mantém o id por linha (alvo do clique)
  assert.deepEqual(vm.top.map((r) => r.id), ['c1', 'c2']);
});

// ---------- HUD: linhas clicáveis + highlight ----------

test('HUD: linhas vivas ganham clickable, eliminadas não; alvo corrente ganha is-follow', () => {
  const state = {
    players: [
      player({ id: 'a', displayName: 'ALPHA', kills: 4 }),
      player({ id: 'b', displayName: 'BRVO', kills: 2 }),
      player({ id: 'out', displayName: 'MORTO', isEliminated: true }),
    ],
    ringState: ringState(), status: 'LIVE', delayMs: 10000,
    followId: 'b', camMode: 'FOLLOW_PLAYER', autoFollow: true, feed: [],
  };
  const { rows } = buildHudHarness(state, { onFollowSelect: () => {} });
  assert.equal(rows.length, 3);
  assert.ok(rows[0].className.includes('clickable'), 'viva → clicável');
  assert.ok(rows[1].className.includes('clickable'));
  assert.ok(!rows[2].className.includes('clickable'), 'eliminada → não clicável');
  assert.ok(rows[2].className.includes('out'));
  assert.ok(rows[1].className.includes('is-follow'), 'alvo corrente destacado');
  assert.ok(!rows[0].className.includes('is-follow'));
  assert.equal(rows[0].dataset.id, 'a', 'linha carrega o id p/ o clique');
});

test('HUD: clique na linha chama onFollowSelect com o id; linha eliminada não tem listener', () => {
  const picks = [];
  const state = {
    players: [player({ id: 'a' }), player({ id: 'b' }), player({ id: 'out', isEliminated: true })],
    ringState: ringState(), status: 'LIVE', delayMs: 10000, followId: null, feed: [],
  };
  const { rows } = buildHudHarness(state, { onFollowSelect: (id) => picks.push(id) });
  rows[1].click();
  assert.deepEqual(picks, ['b']);
  rows[0].click();
  assert.deepEqual(picks, ['b', 'a']);
  // eliminada: NENHUM listener — clique é inofensivo
  assert.equal(rows[2].listeners.click, undefined);
  rows[2].click();
  assert.deepEqual(picks, ['b', 'a']);
});

test('HUD: sem onFollowSelect update não explode e nenhuma linha ganha listener', () => {
  const state = {
    players: [player({ id: 'a' })],
    ringState: ringState(), status: 'LIVE', delayMs: 10000, followId: 'a', feed: [],
  };
  const { rows, vm } = buildHudHarness(state);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].listeners.click, undefined, 'sem handler não há listener órfão');
  assert.equal(vm.followId, 'a');
});

test('HUD: headless-safe continua valendo (sem document não explode) — Fase 21 não regrediu', () => {
  const onFollowSelect = () => {};
  const hud = new SpectatorHUD({ onFollowSelect }); // node: document não definido
  assert.equal(hud.root, null);
  assert.equal(hud.onFollowSelect, onFollowSelect, 'construtor aceita a nova opção');
});
