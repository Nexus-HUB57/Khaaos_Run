import test from 'node:test';
import assert from 'node:assert/strict';
import { KhaaosSim3D, DEFAULT_INPUT } from '../src/game3d/sim3d.js';

test('Barburhen applies corrosive rain every ten seconds without consuming armor', () => {
  const sim = new KhaaosSim3D({ seed: 'BARBURHEN-ACID', botCount: 0, airdrop: false, scenarioId: 'Barburhen' });
  sim.player.x = 0;
  sim.player.z = 0;
  sim.start('belt');
  const armorBefore = sim.player.armor;
  for (let i = 0; i < 301; i++) sim.step(DEFAULT_INPUT, 1 / 30);
  assert.equal(sim.player.life, 99);
  assert.equal(sim.player.armor, armorBefore);
  assert.ok(sim.events.some((event) => event.type === 'acidRain'));
});

test('CIGKV does not emit Barburhen acid-rain events', () => {
  const sim = new KhaaosSim3D({ seed: 'CIGKV-NO-ACID', botCount: 0, airdrop: false, scenarioId: 'CIGKV' });
  sim.start('belt');
  for (let i = 0; i < 300; i++) sim.step(DEFAULT_INPUT, 1 / 30);
  assert.equal(sim.player.life, 100);
  assert.equal(sim.events.some((event) => event.type === 'acidRain'), false);
});
