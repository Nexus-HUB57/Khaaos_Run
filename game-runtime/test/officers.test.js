// Khaaos Run — Fase 10: Oficiais de Classe Especial no Ring (7º/9º artigos do
// POJ). Módulo puro + integração na MatchRoom3D autoritativa + paridade offline
// (KhaaosSim3D). A elite vem de disciplina (reação/erro), nunca de dano inflado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchRoom3D } from '../server/room3d.js';
import { KhaaosSim3D, DEFAULT_INPUT, BOT_COMBAT, botAimError } from '../src/game3d/sim3d.js';
import {
  SPECIAL_CLASS_OFFICERS, OFFICER_COMBAT, officerCombatParams,
  officerDeployment, shouldWithdraw, officerDeployFeed,
} from '../src/game3d/officers.js';

const blankInput = (over = {}) => ({ seq: 0, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false, crouch: false, jump: false, interact: false, reload: false, medkit: false, throw: false, gloo: false, ability: false, slot: 0, ...over });

// ---------- módulo puro ----------
test('fase10 officers: catálogo canônico tem exatamente 3 oficiais identificados', () => {
  assert.equal(SPECIAL_CLASS_OFFICERS.length, 3, '3 Oficiais de Classe Especial (7º/9º)');
  const ids = new Set(SPECIAL_CLASS_OFFICERS.map((o) => o.id));
  const names = new Set(SPECIAL_CLASS_OFFICERS.map((o) => o.name));
  assert.equal(ids.size, 3);
  assert.equal(names.size, 3);
  for (const o of SPECIAL_CLASS_OFFICERS) {
    assert.ok(o.operativeId?.startsWith('OP_'), 'identidade visual sincronizada (Fase 8)');
    assert.ok(o.armor >= 50 && o.armor <= 70, 'blindagem de elite razoável');
    assert.ok(o.speed > 5, 'velocidade de elite');
  }
});

test('fase10 officers: officerDeployment traduz o plano do POJ em spawns determinísticos', () => {
  assert.deepEqual(officerDeployment(null), [], 'sem plano → ninguém entra');
  assert.deepEqual(officerDeployment({ allowed: false, minutesPerRing: 0 }), [], 'plano negado → ninguém entra');
  assert.deepEqual(officerDeployment({ allowed: true, minutesPerRing: 0, article: '9º' }), [], 'minutos 0 → ninguém entra (faixa <500 do 9º)');
  const plan = { allowed: true, minutesPerRing: 5, article: '9º', officers: 3 };
  const dep = officerDeployment(plan);
  assert.equal(dep.length, 3);
  assert.equal(dep[0].name, SPECIAL_CLASS_OFFICERS[0].name);
  assert.equal(dep[0].deploySeconds, 300, 'duração autoritativa em segundos');
  assert.equal(dep[2].slot, 2);
  // count limita o nº de oficiais sem exceder 3
  assert.equal(officerDeployment({ allowed: true, minutesPerRing: 3, officers: 2 }).length, 2);
});

test('fase10 officers: combate de elite deriva de BOT_COMBAT — reação curta, erro menor, dano contido', () => {
  const p = officerCombatParams(BOT_COMBAT);
  assert.ok(p.reactionMin < BOT_COMBAT.reactionMin, 'reação mais curta que bot comum');
  assert.ok(p.reactionMax < BOT_COMBAT.reactionMax);
  assert.ok(p.aimErrBase < BOT_COMBAT.aimErrBase, 'erro base menor (mira de oficial)');
  assert.ok(p.aimErrMax < BOT_COMBAT.aimErrMax);
  assert.ok(p.burstCooldownMax < BOT_COMBAT.burstCooldownMax, 'disciplina de rajada');
  assert.equal(p.dmgMult, OFFICER_COMBAT.dmgMult);
  assert.ok(p.dmgMult <= 1, 'dano nunca amplificado — mesma curva de decaimento');
  // paridade com o cálculo canônico: a 20 m o erro do oficial é estritamente menor
  const d = 20;
  const officerErr = Math.min(p.aimErrMax, p.aimErrBase + d * p.aimErrPerM);
  assert.ok(officerErr < botAimError(d));
  // tabela default sem base não explode
  const bare = officerCombatParams();
  assert.ok(Number.isFinite(bare.aimErrBase) && Number.isFinite(bare.reactionMax));
});

test('fase10 officers: shouldWithdraw e feed', () => {
  assert.equal(shouldWithdraw(0, 180), false);
  assert.equal(shouldWithdraw(179.9, 180), false);
  assert.equal(shouldWithdraw(180, 180), true, 'no fim da duração autorizada');
  assert.equal(shouldWithdraw(200, 180), true);
  assert.equal(shouldWithdraw(10, 0), false, 'duração 0 → nunca (não implantado)');
  assert.equal(shouldWithdraw(Number.NaN, 180), false);
  const feed = officerDeployFeed(officerDeployment({ allowed: true, minutesPerRing: 3, article: '7º' }));
  assert.match(feed, /3 OFICIAIS DE CLASSE ESPECIAL/);
  assert.match(feed, /7º/);
  assert.equal(officerDeployFeed([]), null);
});

// ---------- MatchRoom3D ----------
test('fase10 room: plano autorizado implanta 3 oficiais acima do botFill com flag no snapshot', () => {
  const room = new MatchRoom3D({
    id: 'r-oce', seed: 'F10R1', capacity: 8, botFill: 4, airdrop: false,
    officerPlanFn: () => ({ allowed: true, minutesPerRing: 5, article: '9º', officers: 3 }),
  });
  room.addPlayer('p1', 'HUMANO');
  room.start('p1', 'belt');
  assert.equal(room.bots.filter((b) => b.officer).length, 3, '3 oficiais implantados');
  assert.equal(room.bots.length, 7, '4 bots regulares + 3 oficiais (acima do botFill)');
  const officers = room.bots.filter((b) => b.officer);
  for (const o of officers) {
    assert.match(o.name, /^OCE-/);
    assert.deepEqual(o.combat, officerCombatParams(BOT_COMBAT), 'parâmetros de elite compartilhados');
    assert.ok(o.armor >= 50);
    assert.ok(o.officerCallsign);
  }
  // evento de implantação para o feed HUD (DRENADO ANTES do snapshot — snapshot consome eventos)
  const events = room.drainEvents('p1');
  const deployed = events.find((e) => e.type === 'officers_deployed');
  assert.ok(deployed, 'evento officers_deployed emitido');
  assert.equal(deployed.count, 3);
  assert.equal(deployed.minutesPerRing, 5);
  assert.equal(deployed.article, '9º');
  assert.ok(deployed.names.includes('OCE-VALKON'));
  // snapshot carrega a marca para o cliente renderizar em ouro
  const snap = room.snapshot('p1');
  const remoteOfficers = snap.others.filter((o) => o.officer);
  assert.equal(remoteOfficers.length, 3);
  assert.ok(remoteOfficers.every((o) => o.officerCallsign));
  assert.ok(snap.others.filter((o) => !o.officer).length >= 4, 'bots regulares sem a marca');
  assert.equal(room.metrics().officers, 3);
});

test('fase10 room: sem plano (ou negado) nenhuma sala ganha oficiais — default é zero', () => {
  const room = new MatchRoom3D({ id: 'r-nooce', seed: 'F10R2', capacity: 8, botFill: 3, airdrop: false });
  room.addPlayer('p1', 'HUMANO');
  room.start('p1', 'belt');
  assert.equal(room.bots.filter((b) => b.officer).length, 0);
  const denied = new MatchRoom3D({
    id: 'r-nooce2', seed: 'F10R3', capacity: 8, botFill: 2, airdrop: false,
    officerPlanFn: () => ({ allowed: false, minutesPerRing: 0, article: null }),
  });
  denied.addPlayer('p1', 'HUMANO');
  denied.start('p1', 'belt');
  assert.equal(denied.bots.filter((b) => b.officer).length, 0);
  assert.equal(denied.officerMeta, null);
});

test('fase10 room: oficiais se RETIRAM ao fim da duração autorizada — sem crédito de kill', () => {
  const room = new MatchRoom3D({
    id: 'r-oce-wd', seed: 'F10R4', capacity: 8, botFill: 1, airdrop: false,
    officerPlanFn: () => ({ allowed: true, minutesPerRing: 0.05, article: '9º' }), // 3 s
  });
  room.addPlayer('p1', 'HUMANO');
  room.start('p1', 'belt');
  assert.equal(room.bots.filter((b) => b.officer).length, 3);
  room.drainEvents('p1');
  // 20 ticks × 0.25 s = 5 s > 3 s autorizados
  for (let i = 0; i < 20; i++) room.tick(0.25);
  assert.equal(room.bots.filter((b) => b.officer).length, 0, 'oficiais saíram do Ring');
  assert.equal(room.officerMeta, null, 'estado de implantação limpo');
  const events = room.drainEvents('p1');
  const departed = events.find((e) => e.type === 'officers_departed');
  assert.ok(departed, 'evento officers_departed emitido');
  assert.equal(departed.reason, 'duracao_autorizada_encerrada');
  assert.equal(room.metrics().officers, 0);
});

test('fase10 room: oficiais caídos em combate são removidos na retirada junto com vivos', () => {
  const room = new MatchRoom3D({
    id: 'r-oce-dead', seed: 'F10R5', capacity: 8, botFill: 0, airdrop: false,
    officerPlanFn: () => ({ allowed: true, minutesPerRing: 0.05, article: '9º' }),
  });
  room.addPlayer('p1', 'HUMANO');
  room.start('p1', 'belt');
  // oficial abatido durante a operação (corpóreo na cena)
  room.bots.find((b) => b.officer).alive = false;
  for (let i = 0; i < 20; i++) room.tick(0.25);
  assert.equal(room.bots.filter((b) => b.officer).length, 0, 'caídos e vivos saem juntos');
});

test('fase10 room: oficiais respeitam a proteção de paraquedistas (mesma curva Fase 9)', () => {
  const room = new MatchRoom3D({
    id: 'r-oce-drop', seed: 'F10R6', capacity: 8, botFill: 0, airdrop: true,
    officerPlanFn: () => ({ allowed: true, minutesPerRing: 5, article: '7º' }),
  });
  room.addPlayer('p1', 'HUMANO');
  room.start('p1', 'belt');
  const officer = room.bots.find((b) => b.officer);
  assert.ok(officer.dropPhase, 'oficiais entram na infiltração aérea');
});

// ---------- sim offline (paridade) ----------
test('fase10 sim offline: ?officers=1 implanta 3 oficiais com combate de elite e retirada', () => {
  const sim = new KhaaosSim3D({ seed: 'F10S1', botCount: 2, airdrop: false, officers: true, spectate: true });
  assert.equal(sim.bots.filter((b) => b.officer).length, 3);
  const officer = sim.bots.find((b) => b.officer);
  assert.equal(officer.name, 'OCE-VALKON');
  assert.deepEqual(officer.combat, officerCombatParams(BOT_COMBAT));
  assert.ok(officer.armor >= 50);
  // partida segue; duração comprimida p/ teste (3 s) e 10 passos × 0,5 s = 5 s
  sim.start('belt');
  sim.officerMeta.deploySeconds = 3;
  for (let i = 0; i < 10; i++) sim.step(blankInput(), 0.5);
  assert.equal(sim.bots.filter((b) => b.officer).length, 0, 'oficiais se retiraram offline');
  assert.equal(sim.officerMeta, null);
  const events = sim.consumeEvents();
  assert.ok(events.some((e) => e.type === 'officers_departed'));
});

test('fase10 sim offline: default SEM oficiais — zero mudança de comportamento canônico', () => {
  const sim = new KhaaosSim3D({ seed: 'F10S2', botCount: 3, airdrop: false });
  assert.equal(sim.bots.filter((b) => b.officer).length, 0);
  assert.equal(sim.officerMeta, null);
  sim.start('belt');
  sim.step(blankInput(), 1);
  assert.equal(sim.bots.length, 3);
});
