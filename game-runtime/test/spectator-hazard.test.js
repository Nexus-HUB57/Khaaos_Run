// Khaaos Run — Fase 18 — espectador imersivo: sobrevivências do mundo na
// TRANSMISSÃO. Server: MatchRoom3D espelha hazards para o spectatorLog como
// WORLD_HAZARD (payload autoritativo intacto). Cliente: feed/banner/VM +
// SpectatorView traduz WORLD_HAZARD para o CONTRATO da sim (o handleEvents
// herdado do Game3D processa com o MESMO SurvivalFX/áudio do jogador).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchRoom3D } from '../server/room3d.js';
import {
  eventToFeed, worldHazardFeedLine, WORLD_HAZARD_INFO,
  SpectatorRemote, SpectatorView, SpectatorHUD, spectatorViewModel,
} from '../src/game3d/spectator3d.js';

// ───server: espelho do hazard autoritativo para a transmissão───────────────

test('room3d: tsunami autoritativo (Priadus) vira WORLD_HAZARD no spectatorLog', () => {
  const room = new MatchRoom3D({ id: 'ring3d-hz1', seed: 'HZ-TSUNAMI', region: 'sa-east', capacity: 4, botFill: 3, airdrop: false, scenarioId: 'Priadus' });
  room.addPlayer('p1', 'JOGADOR-1');
  room.start('p1', 'belt');
  for (let i = 0; i < 380 && !room.spectatorLog.some((e) => e.type === 'WORLD_HAZARD' && e.data.hazard === 'tsunami'); i++) room.tick(0.5);
  const haz = room.spectatorLog.find((e) => e.type === 'WORLD_HAZARD' && e.data.hazard === 'tsunami' && e.data.phase === 'start');
  assert.ok(haz, 'WORLD_HAZARD tsunami:start presente no log');
  assert.equal(haz.data.submergeBelowY, 90);   // parâmetro AUTORITATIVO intacto
  assert.equal(haz.data.durationSeconds, 40);
  const view = room.spectatorView();
  assert.ok(view.events.some((e) => e.type === 'WORLD_HAZARD'), 'spectatorView carrega o hazard');
});

test('room3d: acidRain (Barburhen — chuva ácida do mundo) vira WORLD_HAZARD pulse na transmissão', () => {
  const room = new MatchRoom3D({ id: 'ring3d-hz2', seed: 'HZ-ACID', region: 'sa-east', capacity: 4, botFill: 3, airdrop: false, scenarioId: 'Barburhen' });
  room.addPlayer('p1', 'JOGADOR-1');
  room.start('p1', 'belt');
  for (let i = 0; i < 30 && !room.spectatorLog.some((e) => e.type === 'WORLD_HAZARD'); i++) room.tick(0.5); // ácido a cada 10 s
  const acid = room.spectatorLog.find((e) => e.type === 'WORLD_HAZARD' && e.data.hazard === 'acid' && e.data.phase === 'pulse');
  assert.ok(acid, 'WORLD_HAZARD acid:pulse presente');
});

test('room3d: mirror não vaza eventos privados (killfeed/pulse mantêm contrato da Fase 14)', () => {
  const room = new MatchRoom3D({ id: 'ring3d-hz3', seed: 'HZ-MIX', region: 'sa-east', capacity: 4, botFill: 3, airdrop: false });
  room.addPlayer('p1', 'JOGADOR-1');
  room.start('p1', 'belt');
  for (let i = 0; i < 3; i++) room.tick(0.5); // pulse dispara no 1º tick (PULSE_INTERVAL)
  const types = room.spectatorLog.map((e) => e.type);
  assert.ok(types.includes('RING_PHASE'), 'RING_PHASE preservado');
  assert.ok(room.spectatorLog.every((e) => ['ELIMINATION', 'RING_PHASE', 'WORLD_HAZARD'].includes(e.type)), 'só vocabulário público no log');
});

// ───client: feed p/ o espectador─────────────────────────────────────────────

test('worldHazardFeedLine: start/end/pulse com a MESMA gramática dos avisos do jogador', () => {
  const start = worldHazardFeedLine({ hazard: 'tsunami', phase: 'start', durationSeconds: 40 });
  assert.equal(start.who, 'MUNDO');
  assert.equal(start.cls, 'bad');
  assert.match(start.msg, /TSUNAMI ATIVO \(40s\)/);
  const end = worldHazardFeedLine({ hazard: 'lava', phase: 'end' });
  assert.equal(end.cls, 'good');
  assert.match(end.msg, /ERUPÇÃO recuando/);
  const pulse = worldHazardFeedLine({ hazard: 'acid', phase: 'pulse' });
  assert.equal(pulse.cls, 'warn');
  assert.match(pulse.msg, /CHUVA ÁCIDA/);
  const gravity = worldHazardFeedLine({ hazard: 'gravity', phase: 'start' });
  assert.match(gravity.msg, /ANOMALIA KHAOS/);
});

test('worldHazardFeedLine: hazard desconhecido → null (nunca quebra o feed)', () => {
  assert.equal(worldHazardFeedLine({ hazard: 'meteoro', phase: 'start' }), null);
  assert.equal(worldHazardFeedLine({}), null);
  assert.equal(eventToFeed({ type: 'WORLD_HAZARD', data: { hazard: 'x' } }), null);
  assert.equal(eventToFeed({ type: 'tipo_futuro', data: {} }), null);
});

test('eventToFeed: tipos da Fase 14 preservados junto ao WORLD_HAZARD', () => {
  assert.equal(eventToFeed({ type: 'ELIMINATION', data: { killer: 'A', victim: 'B' } }).cls, 'kill');
  assert.equal(eventToFeed({ type: 'WORLD_HAZARD', data: { hazard: 'tsunami', phase: 'start', durationSeconds: 40 } }).who, 'MUNDO');
});

// ───client: ingest → contrato da sim (handleEvents do Game3D processa)───────

test('SpectatorView.ingestEvent: WORLD_HAZARD tsunami start → tsunamiStart com parâmetros autoritativos', () => {
  const v = new SpectatorView();
  assert.equal(v.ingestEvent({ type: 'WORLD_HAZARD', data: { hazard: 'tsunami', phase: 'start', submergeBelowY: 88, durationSeconds: 42 } }), true);
  assert.deepEqual(v.consumeEvents(), [{ type: 'tsunamiStart', submergeBelowY: 88, durationSeconds: 42 }]);
  assert.equal(v.consumeEvents().length, 0, 'drenagem esvazia a fila');
  assert.deepEqual(v.hazardActive, { hazard: 'tsunami', phase: 'active' });
});

test('SpectatorView.ingestEvent: tsunami end → tsunamiEnd + banner limpo', () => {
  const v = new SpectatorView();
  v.ingestEvent({ type: 'WORLD_HAZARD', data: { hazard: 'tsunami', phase: 'start' } });
  v.ingestEvent({ type: 'WORLD_HAZARD', data: { hazard: 'tsunami', phase: 'end', submergeBelowY: 90 } });
  assert.equal(v.hazardActive, null);
  const evts = v.consumeEvents();
  assert.deepEqual(evts.map((e) => e.type), ['tsunamiStart', 'tsunamiEnd']);
});

test('SpectatorView.ingestEvent: lava/gravity/acid no contrato da sim', () => {
  const v = new SpectatorView();
  v.ingestEvent({ type: 'WORLD_HAZARD', data: { hazard: 'lava', phase: 'start', lavaBelowY: 175, durationSeconds: 33 } });
  v.ingestEvent({ type: 'WORLD_HAZARD', data: { hazard: 'gravity', phase: 'start', gravityScale: .4, anchorRadius: 30, anchors: [{ id: 'a1', x: 10, z: 20 }], durationSeconds: 28 } });
  v.ingestEvent({ type: 'WORLD_HAZARD', data: { hazard: 'acid', phase: 'pulse', damage: 1 } });
  v.ingestEvent({ type: 'WORLD_HAZARD', data: { hazard: 'lava', phase: 'end' } });
  const types = v.consumeEvents().map((e) => e.type);
  assert.deepEqual(types, ['eruptionStart', 'gravityAnomalyStart', 'acidRain', 'eruptionEnd']);
  // ácido NÃO grava banner persistente; lava end limpa
  assert.equal(v.hazardActive, null);
});

test('SpectatorView.ingestEvent: evento não-hazard e payload inválido são ignorados com elegância', () => {
  const v = new SpectatorView();
  assert.equal(v.ingestEvent({ type: 'ELIMINATION', data: {} }), false);
  assert.equal(v.ingestEvent({ type: 'WORLD_HAZARD', data: { hazard: 'desconhecido', phase: 'start' } }), true); // aceito, mas sem fila/banner
  assert.deepEqual(v.consumeEvents(), []);  // sem evento de sim correspondente
  assert.equal(v.hazardActive, null, 'hazard desconhecido não grava banner');
  assert.equal(v.ingestEvent(null), false); // nunca lança
});

// ───client: remote entrega o evento bruto (onEvent) pós-dedupe───────────────

test('SpectatorRemote: onEvent recebe cada evento NOVO (dedupe mantido, onFeed preservado)', () => {
  const raws = [], feeds = [];
  const r = new SpectatorRemote({
    url: 'ws://teste',
    socketFactory: () => new FakeSocket(),
    onEvent: (e) => raws.push(e),
    onFeed: (line) => feeds.push(line),
  });
  r.connect();
  FakeSocket.last.open();
  const batch = (ts) => ({ type: 'SPECTATOR_BATCH', data: { players: [], ringState: null }, events: [
    { type: 'WORLD_HAZARD', data: { hazard: 'tsunami', phase: 'start', durationSeconds: 40 }, timestamp: ts },
  ], timestamp: Date.now() });
  FakeSocket.last.message(batch(1000));
  FakeSocket.last.message(batch(1000)); // repetido → dedupe
  assert.equal(raws.length, 1, 'evento bruto entregue UMA vez');
  assert.equal(feeds.length, 1, 'feed gerado uma vez');
  assert.equal(raws[0].type, 'WORLD_HAZARD');
});

// ───client: VM + banner no HUD (headless-safe)───────────────────────────────

test('spectatorViewModel: hazard ativo vira { label, hint, kind } p/ o banner', () => {
  const vm = spectatorViewModel({ hazard: { hazard: 'lava', phase: 'active' } });
  assert.equal(vm.hazard.kind, 'lava');
  assert.equal(vm.hazard.label, 'ERUPÇÃO');
  assert.ok(vm.hazard.hint.length > 0);
  assert.equal(spectatorViewModel({}).hazard, null);
  assert.equal(spectatorViewModel({ hazard: { hazard: 'desconhecido' } }).hazard.kind, 'desconhecido');
});

test('SpectatorHUD.update: banner headless-safe (root null nunca quebra)', () => {
  const hud = new SpectatorHUD({}); // sem document → root/feedRoot null
  hud.update({ status: 'LIVE', hazard: { hazard: 'tsunami', phase: 'active' } });
  hud.update({ status: 'LIVE', hazard: null });
  assert.ok(true);
});

// ───fake socket (mesmo contrato do spectator-hud.test.js)───────────────────

class FakeSocket {
  constructor() { this.readyState = 0; this.sent = []; FakeSocket.last = this; }
  onopen = null; onmessage = null; onclose = null; onerror = null;
  open() { this.readyState = 1; this.onopen?.(); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.(); }
  message(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}
