// Khaaos Run — Fase 19 — DIRETOR AUTOMÁTICO da câmera FOLLOW: a transmissão
// corta para o alvo mais ameaçado (hazard ativo, nocaute, fora do ring, dano
// recente). Puro (dangerScore/prioritizeByHazard) + SpectatorRemote end to end
// com socket falso (mesmo contrato do spectator-hud.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DANGER_WEIGHTS, LOW_HEALTH_THRESHOLD, AUTO_RETARGET_MARGIN,
  dangerScore, prioritizeByHazard, pickHazardTarget, snapshotHealth,
  SpectatorRemote,
} from '../src/game3d/spectator3d.js';

// ---------- fixtures (payload REAL do pipeline: posX/posY = chão) ----------
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

// ---------- puro: dangerScore ----------

test('dangerScore: componentes isolados somam os pesos canônicos', () => {
  assert.equal(dangerScore(player()), 0, 'saudável dentro do ring: zero');
  assert.equal(dangerScore(player({ isDowned: true }), {}), DANGER_WEIGHTS.knocked);
  assert.equal(dangerScore(player({ health: 25 }), {}), DANGER_WEIGHTS.lowHealth);
  assert.equal(LOW_HEALTH_THRESHOLD, 30);
});

test('dangerScore: dano recente vale MAIS com hazard ativo (o mundo mordendo)', () => {
  const prev = { p1: 100 };
  const comHazard = dangerScore(player({ health: 80 }), { hazard: { hazard: 'tsunami' }, prevHealth: prev });
  const semHazard = dangerScore(player({ health: 80 }), { prevHealth: prev });
  assert.equal(comHazard, DANGER_WEIGHTS.hazardDamage);
  assert.equal(semHazard, DANGER_WEIGHTS.recentDamage);
  assert.ok(comHazard > semHazard);
  // vida igual ou maior: nenhum sinal
  assert.equal(dangerScore(player({ health: 100 }), { hazard: { hazard: 'lava' }, prevHealth: { p1: 100 } }), 0);
  // primeiro batch (sem histórico): sem falso positivo
  assert.equal(dangerScore(player({ health: 40 }), { hazard: { hazard: 'lava' }, prevHealth: {} }), 0, 'sem prevHealth não há sinal de dano');
});

test('dangerScore: anomalia Khaaos é PERIGO GEOMÉTRICO (anchors do payload autoritativo)', () => {
  const hazard = { hazard: 'gravity', anchors: [{ x: 100, z: 200 }], anchorRadius: 30 };
  const dentro = dangerScore(player({ posX: 110, posY: 210 }), { hazard });
  const fora = dangerScore(player({ posX: 200, posY: 300 }), { hazard });
  assert.equal(dentro, DANGER_WEIGHTS.anchorZone);
  assert.equal(fora, 0);
  // sem anchors no payload: nada de zona
  assert.equal(dangerScore(player(), { hazard: { hazard: 'gravity' } }), 0);
});

test('dangerScore: fora do ring (ringCenter/currentRadius autoritativos)', () => {
  const ctx = { ringState: ringState({ currentRadius: 100, ringCenter: [0, 0, 0] }) };
  assert.equal(dangerScore(player({ posX: 150, posY: 0 }), ctx), DANGER_WEIGHTS.outsideRing);
  assert.equal(dangerScore(player({ posX: 99, posY: 0 }), ctx), 0);
});

test('dangerScore: composto — nocauteado + dano + vida baixa + fora do ring', () => {
  const prev = { p1: 90 };
  const score = dangerScore(
    player({ isDowned: true, health: 20, posX: 600, posY: 0 }),
    { hazard: { hazard: 'tsunami' }, ringState: ringState({ currentRadius: 500 }), prevHealth: prev },
  );
  assert.equal(score, DANGER_WEIGHTS.knocked + DANGER_WEIGHTS.hazardDamage + DANGER_WEIGHTS.outsideRing + DANGER_WEIGHTS.lowHealth);
});

// ---------- puro: priorização determinística ----------

test('prioritizeByHazard: score desc, eliminados fora, desempate determinístico', () => {
  const players = [
    player({ id: 'saudavel', health: 100 }),
    player({ id: 'nocaute', isDowned: true, health: 50 }),
    player({ id: 'fora', posX: 700, posY: 0, health: 100 }),
    player({ id: 'morto', isEliminated: true, isDowned: true, health: 0 }),
  ];
  const ordem = prioritizeByHazard(players, { ringState: ringState({ currentRadius: 500 }) });
  assert.deepEqual(ordem.map((p) => p.id), ['nocaute', 'fora', 'saudavel'], 'eliminado filtrado, nocaute primeiro');
  // desempate 1: mesmo score → abates desc
  const tieKills = [
    player({ id: 'b', kills: 2, health: 45 }),
    player({ id: 'a', kills: 3, health: 45 }),
    player({ id: 'c', kills: 2, health: 45 }),
  ];
  assert.deepEqual(prioritizeByHazard(tieKills).map((p) => p.id), ['a', 'b', 'c'], 'abates decidem');
  // desempate 2: mesmos abates → vida ASC (mais ferido = mais urgente)
  const tieHealth = [
    player({ id: 'b', kills: 2, health: 80 }),
    player({ id: 'a', kills: 2, health: 45 }),
  ];
  assert.deepEqual(prioritizeByHazard(tieHealth).map((p) => p.id), ['a', 'b'], 'mais ferido primeiro');
  // desempate 3: tudo igual → id (determinismo byte a byte)
  const tieId = [player({ id: 'zz' }), player({ id: 'aa' })];
  assert.deepEqual(prioritizeByHazard(tieId).map((p) => p.id), ['aa', 'zz']);
});

test('pickHazardTarget: null em lista vazia/só eliminados — nunca quebra', () => {
  assert.equal(pickHazardTarget([]), null);
  assert.equal(pickHazardTarget([player({ id: 'x', isEliminated: true })]), null);
  assert.equal(pickHazardTarget(null), null);
  assert.equal(pickHazardTarget([player()])?.id, 'p1');
});

test('snapshotHealth: id → health (String), ignora entradas inválidas', () => {
  assert.deepEqual(snapshotHealth([player({ id: 7, health: 88 }), player({ health: 1 })]), { '7': 88, p1: 1 });
  assert.deepEqual(snapshotHealth([null, undefined]), {});
  assert.deepEqual(snapshotHealth(), {});
});

// ---------- remote: diretor end to end (socket falso) ----------

class FakeSocket {
  constructor() { this.readyState = 0; this.sent = []; FakeSocket.last = this; }
  onopen = null; onmessage = null; onclose = null; onerror = null;
  open() { this.readyState = 1; this.onopen?.(); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.(); }
  message(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}
const cameraMsgs = (ws) => ws.sent.filter((m) => m.type === 'SET_CAMERA');

test('remote: diretor LIGADO por padrão e hazard start corta para o alvo mais ameaçado', () => {
  const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  assert.equal(r.autoFollow, true, 'auto ON por padrão');
  const cuts = [];
  r.onAutoFollow = (pick, reason) => cuts.push([pick.id, reason]);
  r.connect();
  const ws = FakeSocket.last;
  ws.open();
  // batch SEM hazard + sem follow escolhido: diretor NÃO sequestra a câmera
  ws.message(batch([player({ id: 'calmo', health: 100 })]));
  assert.equal(cameraMsgs(ws).length, 0, 'sem hazard: nenhum corte');
  // tsunami começa → corte para o único vivo
  ws.message(batch([player({ id: 'calmo', health: 100 })], [tsunamiStart()]));
  assert.equal(cameraMsgs(ws).length, 1, 'hazard start → 1 corte');
  assert.deepEqual(cameraMsgs(ws)[0], { type: 'SET_CAMERA', cameraMode: 'FOLLOW_PLAYER', followPlayerId: 'calmo' });
  assert.equal(cuts[0][1], 'hazard-start');
  assert.equal(r.activeHazard?.hazard, 'tsunami');
});

test('remote: corta para o MAIS AMEAÇADO, não o primeiro da lista (geometria + dano)', () => {
  const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  r.connect();
  const ws = FakeSocket.last;
  ws.open();
  const players = [
    player({ id: 'longe', posX: 0, posY: 0, health: 100 }),
    player({ id: 'noDomo', posX: 105, posY: 205, health: 100 }),
  ];
  const ev = [{ type: 'WORLD_HAZARD', data: { hazard: 'gravity', phase: 'start', anchors: [{ x: 100, z: 200 }], anchorRadius: 30 }, timestamp: 1 }];
  ws.message(batch(players, ev));
  assert.deepEqual(cameraMsgs(ws).at(-1)?.followPlayerId, 'noDomo', 'dentro do domo é a história');
});

test('remote: ESCALADA dentro do mesmo hazard — dano sob tsunami (gap ≥ margem) re-corta', () => {
  const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  const cuts = [];
  r.onAutoFollow = (pick, reason) => cuts.push([pick.id, reason]);
  r.connect();
  const ws = FakeSocket.last;
  ws.open();
  // tsunami começa → corte para 'a' (empate → id)
  ws.message(batch([player({ id: 'a', health: 100 }), player({ id: 'b', health: 100 })], [tsunamiStart()]));
  assert.equal(r.followPlayerId, 'a');
  assert.equal(cuts.at(-1)[1], 'hazard-start');
  // 'b' começa a TOMAR dano do tsunami (gap 35 ≥ AUTO_RETARGET_MARGIN 25)
  ws.message(batch([player({ id: 'a', health: 100 }), player({ id: 'b', health: 61 })]));
  assert.equal(r.followPlayerId, 'b', 'dano sob hazard re-corta (escalada)');
  assert.equal(cuts.at(-1)[1], 'hazard-escalation');
  // dano de RING puro (20 < margem) NÃO re-corta: estabilidade
  const r2 = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  r2.connect();
  const ws2 = FakeSocket.last;
  ws2.open();
  ws2.message(batch([player({ id: 'c1', health: 100 }), player({ id: 'c2', health: 100 })], [tsunamiStart()]));
  assert.equal(r2.followPlayerId, 'c1', 'empate → id decide');
  // c2 sai do ring SEM tomar dano (fora=20 < margem 25): sem re-corte
  ws2.message(batch([player({ id: 'c1', health: 100 }), player({ id: 'c2', posX: 550, health: 100 })]));
  assert.equal(r2.followPlayerId, 'c1', 'fora-do-ring isolado (20) não vira corte');
  // c2 TOMA dano fora do ring (35+20=55 ≥ 25): escalada corta
  ws2.message(batch([player({ id: 'c1', health: 100 }), player({ id: 'c2', posX: 550, health: 90 })]));
  assert.equal(r2.followPlayerId, 'c2', 'dano sob hazard + fora do ring vira corte');
  assert.equal(AUTO_RETARGET_MARGIN, 25);
});

test('remote: estabilidade — mesmo hazard contínuo NÃO gera corte a cada batch', () => {
  const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  r.connect();
  const ws = FakeSocket.last;
  ws.open();
  ws.message(batch([player({ id: 'a' })], [tsunamiStart()]));
  assert.equal(cameraMsgs(ws).length, 1);
  for (let i = 0; i < 5; i++) ws.message(batch([player({ id: 'a', health: 100 - i * 10 })]));
  assert.equal(cameraMsgs(ws).length, 1, 'hazard já "reservado" pelo próprio corte: sem spam');
});

test('remote: navegação MANUAL reserva o hazard — diretor não disputa até o próximo', () => {
  const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  r.connect();
  const ws = FakeSocket.last;
  ws.open();
  ws.message(batch([player({ id: 'a' }), player({ id: 'b', isDowned: true, health: 20 })], [tsunamiStart()]));
  const cortesAuto = cameraMsgs(ws).length;
  assert.ok(cortesAuto >= 1);
  // usuário navega manualmente durante o tsunami
  r.cycleFollow(1);
  const total = cameraMsgs(ws).length;
  // batches seguintes: diretor respeita a escolha manual
  ws.message(batch([player({ id: 'a', health: 10 }), player({ id: 'b', isDowned: true, health: 5 })]));
  assert.equal(cameraMsgs(ws).length, total, 'hold manual: nenhum corte forçado');
  // tsunami termina → re-arma; NOVO hazard → diretor retoma (momento de diretor)
  ws.message(batch([player({ id: 'a' })], [{ type: 'WORLD_HAZARD', data: { hazard: 'tsunami', phase: 'end' }, timestamp: 2 }]));
  ws.message(batch([player({ id: 'a' })], [{ type: 'WORLD_HAZARD', data: { hazard: 'lava', phase: 'start', lavaBelowY: 180 }, timestamp: 3 }]));
  assert.ok(cameraMsgs(ws).length > total, 'novo hazard retoma o controle');
  assert.equal(cameraMsgs(ws).at(-1).followPlayerId, 'a');
});

test('remote: alvo seguido MORREU → corte para o próximo mais ameaçado (target-lost)', () => {
  const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  const cuts = [];
  r.onAutoFollow = (pick, reason) => cuts.push([pick.id, reason]);
  r.connect();
  const ws = FakeSocket.last;
  ws.open();
  ws.message(batch([player({ id: 'a' }), player({ id: 'b' })], [tsunamiStart()]));
  assert.equal(r.followPlayerId, 'a');
  ws.message(batch([player({ id: 'a', isEliminated: true, health: 0 }), player({ id: 'b', health: 100 })]));
  assert.equal(r.followPlayerId, 'b', 'alvo morto → próximo mais ameaçado');
  assert.deepEqual(cuts.at(-1), ['b', 'target-lost']);
});

test('remote: ácido (pulse) NÃO grava hazard persistente — sem cortes espúrios', () => {
  const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  r.connect();
  const ws = FakeSocket.last;
  ws.open();
  ws.message(batch([player({ id: 'a' })], [{ type: 'WORLD_HAZARD', data: { hazard: 'acid', phase: 'pulse', damage: 1 }, timestamp: 1 }]));
  assert.equal(r.activeHazard, null, 'pulse não persiste');
  assert.equal(cameraMsgs(ws).length, 0, 'sem corte por pulse');
});

test('remote: hazard desconhecido nunca dirige a câmera', () => {
  const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  r.connect();
  const ws = FakeSocket.last;
  ws.open();
  ws.message(batch([player({ id: 'a' })], [{ type: 'WORLD_HAZARD', data: { hazard: 'meteoro', phase: 'start' }, timestamp: 1 }]));
  assert.equal(r.activeHazard, null);
  assert.equal(cameraMsgs(ws).length, 0);
});

test('remote: setAutoFollow(false) desliga; ligar de novo corta IMEDIATAMENTE', () => {
  const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  r.connect();
  const ws = FakeSocket.last;
  ws.open();
  r.setAutoFollow(false);
  assert.equal(r.autoFollow, false);
  ws.message(batch([player({ id: 'a' })], [tsunamiStart()]));
  assert.equal(cameraMsgs(ws).length, 0, 'desligado: nenhum corte mesmo com hazard');
  r.setAutoFollow(true);
  assert.equal(r.autoFollow, true);
  assert.equal(cameraMsgs(ws).length, 1, 'ligar → corte imediato');
  assert.equal(r.followPlayerId, 'a');
  // toggle default alterna
  r.setAutoFollow();
  assert.equal(r.autoFollow, false);
});

test('remote: cycleFollow preserva contrato (ordem do ranking, só vivos)', () => {
  const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket() });
  r.connect();
  const ws = FakeSocket.last;
  ws.open();
  r.last = {
    players: [player({ id: 'x' }), player({ id: 'y', kills: 4 }), player({ id: 'z', isEliminated: true })],
    ringState: ringState(), timestamp: 1,
  };
  r.followPlayerId = 'x';
  assert.equal(r.cycleFollow(1).id, 'y');
  assert.equal(r.cycleFollow(1).id, 'x');
  assert.equal(r.cycleFollow(-1).id, 'y');
  // sala vazia: FOLLOW solto, null devolvido
  r.last = { players: [player({ id: 'z', isEliminated: true })], ringState: ringState() };
  assert.equal(r.cycleFollow(1), null);
  assert.equal(r.followPlayerId, null);
});
