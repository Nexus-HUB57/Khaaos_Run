import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS3D } from '../src/game3d/sim3d.js';

test('first-world weapon profiles expose deterministic ballistic envelopes', () => {
  for (const id of ['g19', 'mp5', 'm4', 'barrett', 'pulse']) {
    const weapon = WEAPONS3D[id];
    assert.ok(weapon.ballistic, `${id} must have a ballistic profile`);
    assert.ok(weapon.ballistic.gravity >= 0);
    assert.ok(weapon.ballistic.drag >= 0);
    assert.ok(weapon.ballistic.falloffEnd > weapon.ballistic.falloffStart);
    assert.ok(weapon.ballistic.minDamage > 0 && weapon.ballistic.minDamage <= 1);
  }
});

test('sniper has the flattest trajectory and longest damage envelope', () => {
  assert.ok(WEAPONS3D.barrett.ballistic.gravity < WEAPONS3D.g19.ballistic.gravity);
  assert.ok(WEAPONS3D.barrett.ballistic.falloffEnd > WEAPONS3D.g19.ballistic.falloffEnd);
  assert.ok(WEAPONS3D.barrett.ballistic.minDamage > WEAPONS3D.mp5.ballistic.minDamage);
});
