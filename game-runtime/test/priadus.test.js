import test from 'node:test';
import assert from 'node:assert/strict';
import { KhaaosSim3D, DEFAULT_INPUT } from '../src/game3d/sim3d.js';

test('Priadus tsunami starts on schedule and damages submerged operators', () => {
  const sim = new KhaaosSim3D({ seed: 'PRIADUS-TSUNAMI', botCount: 0, airdrop: false, scenarioId: 'Priadus' });
  sim.start('belt');
  const armorBefore = sim.player.armor;
  sim.tsunamiTimer = 179.99;
  sim.step(DEFAULT_INPUT, 0.02);
  assert.equal(sim.tsunamiActive, true);
  assert.ok(sim.player.life < 100);
  assert.equal(sim.player.armor, armorBefore);
  assert.ok(sim.events.some((event) => event.type === 'tsunamiStart'));
});

test('Priadus high platforms counter the active tsunami', () => {
  const sim = new KhaaosSim3D({ seed: 'PRIADUS-HIGH-GROUND', botCount: 0, airdrop: false, scenarioId: 'Priadus' });
  sim.player.x = 0;
  sim.player.z = 0;
  sim.start('belt');
  sim.player.y = 100;
  sim.tsunamiTimer = 179.99;
  sim.step(DEFAULT_INPUT, 0.02);
  const lifeAfterStart = sim.player.life;
  sim.step(DEFAULT_INPUT, 1);
  assert.equal(sim.player.life, lifeAfterStart);
  assert.equal(sim.tsunamiActive, true);
});
