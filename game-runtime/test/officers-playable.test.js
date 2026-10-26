// Khaaos Run — Fase 11 — Oficiais de Classe Especial JOGÁVEIS + patente no snapshot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchRoom3D } from '../server/room3d.js';
import { SPECIAL_CLASS_OFFICERS } from '../src/game3d/officers.js';
import { PATENTE_HIERARQUIA } from '../src/game3d/poj.js';
import { WEAPONS3D } from '../src/game3d/sim3d.js';

const planAllowed = () => ({ allowed: true, minutesPerRing: 3, article: '7º', officers: 3, survivors: 150000 });
const planDenied = () => ({ allowed: false, minutesPerRing: 0, article: null, reason: 'fora_do_7o_dia_de_arukheea' });

const mkRoom = (officerPlanFn) => new MatchRoom3D({
  id: 'test-poj-11', seed: 'TEST-3D-11', capacity: 8, botFill: 4, officerPlanFn,
});

test('fail-closed: sem plano de oficiais, a insígnia OCE é recusada com operative_error', () => {
  const room = mkRoom(null);
  room.addPlayer('h1', 'Alfa');
  assert.equal(room.setOperative('h1', 'OCE_01'), false);
  const events = room.drainEvents('h1');
  const err = events.find((e) => e.type === 'operative_error');
  assert.ok(err, 'evento operative_error emitido');
  assert.equal(err.reason, 'oficiais_fora_da_janela');
  const a = room.humans.get('h1');
  assert.equal(a.officer, undefined); // identidade regular preservada
});

test('fora da janela do 7º/9º artigo: recusa com motivo do plano', () => {
  const room = mkRoom(planDenied);
  room.addPlayer('h1', 'Alfa');
  assert.equal(room.setOperative('h1', 'OCE_02'), false);
  const err = room.drainEvents('h1').find((e) => e.type === 'operative_error');
  assert.equal(err.reason, 'oficiais_fora_da_janela');
  assert.equal(err.detail, 'fora_do_7o_dia_de_arukheea');
});

test('dentro da janela: humano reivindica a insígnia e assume a carga canônica do OCE', () => {
  const room = mkRoom(planAllowed);
  room.addPlayer('h1', 'Alfa');
  assert.equal(room.setOperative('h1', 'OCE_01'), true);
  const a = room.humans.get('h1');
  const def = SPECIAL_CLASS_OFFICERS.find((o) => o.id === 'OCE_01');
  assert.equal(a.officer, true);
  assert.equal(a.officerId, 'OCE_01');
  assert.equal(a.officerCallsign, def.callsign);
  assert.equal(a.operativeId, 'OCE_01');
  assert.equal(a.weapon, def.weapon);
  assert.equal(a.armor, def.armor);
  assert.equal(a.speed, def.speed);
  assert.equal(a.ammoMag, WEAPONS3D[def.weapon].magazine);
});

test('insígnia é ÚNICA por partida: segundo humano não toma a mesma insígnia', () => {
  const room = mkRoom(planAllowed);
  room.addPlayer('h1', 'Alfa');
  room.addPlayer('h2', 'Bravo');
  assert.equal(room.setOperative('h1', 'OCE_01'), true);
  assert.equal(room.setOperative('h2', 'OCE_01'), false);
  const err = room.drainEvents('h2').find((e) => e.type === 'operative_error');
  assert.equal(err.reason, 'insignia_ocupada');
  // mas pode reivindicar outra
  assert.equal(room.setOperative('h2', 'OCE_03'), true);
  assert.equal(room.humans.get('h2').officerId, 'OCE_03');
});

test('trocar para operativo regular libera a insígnia OCE', () => {
  const room = mkRoom(planAllowed);
  room.addPlayer('h1', 'Alfa');
  room.addPlayer('h2', 'Bravo');
  assert.equal(room.setOperative('h1', 'OCE_02'), true);
  assert.equal(room.setOperative('h1', 'OP_MALE_VANGUARD'), true);
  const a = room.humans.get('h1');
  assert.equal(a.officer, false);
  assert.equal(a.officerId, null);
  assert.equal(a.operativeId, 'OP_MALE_VANGUARD');
  // insígnia liberada → outro humano assume
  assert.equal(room.setOperative('h2', 'OCE_02'), true);
});

test('trocar entre OCEs libera apenas a insígnia anterior', () => {
  const room = mkRoom(planAllowed);
  room.addPlayer('h1', 'Alfa');
  room.addPlayer('h2', 'Bravo');
  assert.equal(room.setOperative('h1', 'OCE_01'), true);
  assert.equal(room.setOperative('h1', 'OCE_02'), true);
  assert.equal(room.humans.get('h1').officerId, 'OCE_02');
  assert.equal(room.setOperative('h2', 'OCE_01'), true); // a 01 foi liberada
});

test('patente no snapshot: humana via setPatente, bot por tier, own view e others', () => {
  const room = mkRoom(planAllowed);
  room.addPlayer('h1', 'Alfa');
  assert.equal(room.setPatente('h1', 'Capitão'), true);
  assert.equal(room.setPatente('h1', 'Marechal-imortal'), false); // fora da hierarquia
  room.start('h1', 'belt');
  const snap = room.snapshot('h1');
  assert.equal(snap.player.patente, 'Capitão');
  assert.ok(snap.player.officer === false || snap.player.officer === true);
  const withPatente = (snap.others ?? []).filter((o) => o.patente);
  assert.ok(withPatente.length > 0, 'bots carregam patente no snapshot');
  assert.ok((snap.others ?? []).every((o) => PATENTE_HIERARQUIA.includes(o.patente) || o.patente === null));
});

test('humano-OCE aparece dourado no snapshot (officer + callsign) com patente', () => {
  const room = mkRoom(planAllowed);
  room.addPlayer('h1', 'Alfa');
  room.addPlayer('h2', 'Bravo');
  room.setOperative('h2', 'OCE_03');
  room.setPatente('h2', 'General');
  room.start('h1', 'belt');
  const snap = room.snapshot('h1');
  const oce = snap.others.find((o) => o.id === 'h2');
  assert.equal(oce.officer, true);
  assert.equal(oce.officerCallsign, 'Oficial de Classe Especial III');
  assert.equal(oce.patente, 'General');
  assert.equal(oce.op, 'OCE_03');
});
