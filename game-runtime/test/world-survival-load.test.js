import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { KhaaosSim3D, DEFAULT_INPUT } from '../src/game3d/sim3d.js';
import { MatchRoom3D } from '../server/room3d.js';

test('Ckesalth eruption damages low terrain and preserves high exploration routes', () => {
  const sim = new KhaaosSim3D({ seed: 'CKESALTH-ERUPTION', botCount: 0, airdrop: false, scenarioId: 'Ckesalth' });
  sim.start('belt');
  sim.player.x = 0;
  sim.player.z = 0;
  sim.volcanicTimer = 139.99;
  sim.step(DEFAULT_INPUT, 0.02);
  assert.equal(sim.volcanicActive, true);
  assert.ok(sim.player.life < 100);
  assert.ok(sim.events.some((event) => event.type === 'eruptionStart'));

  const high = new KhaaosSim3D({ seed: 'CKESALTH-FORGE', botCount: 0, airdrop: false, scenarioId: 'Ckesalth' });
  high.start('belt');
  high.player.x = 0;
  high.player.z = 0;
  high.player.y = 220;
  high.volcanicTimer = 139.99;
  high.step(DEFAULT_INPUT, 0.02);
  const lifeAtStart = high.player.life;
  high.step(DEFAULT_INPUT, 1);
  assert.equal(high.player.life, lifeAtStart);
});

test('Arukheea anomaly drains exposed shields while quantum anchors protect explorers', () => {
  const exposed = new KhaaosSim3D({ seed: 'ARUKHEEA-EXPOSED', botCount: 0, airdrop: false, scenarioId: 'Arukheea' });
  exposed.start('belt');
  exposed.player.x = 160;
  exposed.player.z = -90;
  exposed.player.vy = 6;
  exposed.player.onGround = false;
  const exposedArmor = exposed.player.armor;
  exposed.quantumTimer = 119.99;
  exposed.step(DEFAULT_INPUT, 0.02);
  assert.equal(exposed.quantumActive, true);
  assert.equal(exposed.player.gravityScale, 0.35);
  assert.ok(exposed.player.armor < exposedArmor, 'operador fora da âncora deve perder escudo');
  assert.ok(exposed.player.y > 0, 'gravidade reduzida deve manter o operador no ar por mais tempo');
  assert.ok(exposed.events.some((event) => event.type === 'gravityAnomalyStart'));

  const anchored = new KhaaosSim3D({ seed: 'ARUKHEEA-ANCHOR', botCount: 0, airdrop: false, scenarioId: 'Arukheea' });
  anchored.start('belt');
  anchored.player.x = 0;
  anchored.player.z = 0;
  const anchoredArmor = anchored.player.armor;
  anchored.quantumTimer = 119.99;
  anchored.step(DEFAULT_INPUT, 0.02);
  assert.equal(anchored.player.armor, anchoredArmor, 'Nexus deve proteger o escudo durante a anomalia');
  assert.deepEqual(anchored.world.quantumAnchors.map((anchor) => anchor.id), ['NEXUS', 'NORTH', 'EAST', 'WEST']);
});

test('Arukheea authoritative room replicates anomaly events and anchor protection', () => {
  const room = new MatchRoom3D({ id: 'arukheea-survival', seed: 'ARUKHEEA-ROOM', capacity: 2, botFill: 0, airdrop: false, scenarioId: 'Arukheea' });
  assert.ok(room.addPlayer('exposed', 'EXPOSED'));
  assert.ok(room.addPlayer('anchored', 'ANCHORED'));
  assert.ok(room.start('exposed', 'belt'));
  room.humans.get('exposed').x = 160;
  room.humans.get('exposed').z = -90;
  room.humans.get('anchored').x = 0;
  room.humans.get('anchored').z = 0;
  room.quantumTimer = 119.99;
  room.tick(0.02);
  const exposedEvents = room.drainEvents('exposed');
  const anchoredEvents = room.drainEvents('anchored');
  assert.ok(exposedEvents.some((event) => event.type === 'gravityAnomalyStart'));
  assert.ok(exposedEvents.some((event) => event.type === 'shieldDrain'));
  assert.ok(anchoredEvents.some((event) => event.type === 'gravityAnomalyStart'));
  assert.equal(room.humans.get('anchored').armor, 35);
  assert.equal(room.snapshot('anchored').survival.active, true);
});

test('Priadus tsunami integrates 60 players and remains within the simulation budget', () => {
  const room = new MatchRoom3D({ id: 'priadus-load', seed: 'PRIADUS-60P', region: 'sa-east', capacity: 60, botFill: 0, airdrop: false, scenarioId: 'Priadus' });
  for (let i = 0; i < 60; i++) assert.ok(room.addPlayer(`p${i}`, `OPERADOR-${i}`));
  assert.ok(room.start('p0', 'belt'));
  for (const [index, actor] of [...room.humans.values()].entries()) actor.y = index % 5 === 0 ? 120 : 0;
  room.tsunamiTimer = 179.99;

  const started = performance.now();
  room.tick(0.02);
  for (let i = 0; i < 800; i++) room.tick(0.05);
  const elapsedMs = performance.now() - started;
  const events = [...room.humans.keys()].flatMap((id) => room.drainEvents(id));

  assert.ok(events.filter((event) => event.type === 'tsunamiStart').length >= 60);
  assert.ok(events.some((event) => event.type === 'tsunamiEnd'));
  assert.ok([...room.humans.values()].some((actor) => actor.life < 100));
  assert.ok(elapsedMs < 2500, `60 jogadores × 40s simulados excederam 2500ms: ${elapsedMs.toFixed(1)}ms`);
});
