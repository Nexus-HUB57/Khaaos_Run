import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorldLayout, stepActorMovement } from '../src/game3d/sim3d.js';

const world = getWorldLayout('movement-advanced-test');
const baseActor = () => ({
  x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, speed: 5.2, weapon: 'g19',
  stamina: 100, onGround: true, moving: false, sprinting: false, ads: false,
  crouching: false, sliding: false, slideT: 0, dropPhase: null,
});

test('stamina drains on sprint and recovers while tactical crouched', () => {
  const actor = baseActor();
  stepActorMovement(actor, { dx: 0, dy: 1, yaw: 0, sprint: true, crouch: false }, 0.5, world);
  assert.ok(actor.sprinting);
  assert.ok(actor.stamina < 100);
  const spent = actor.stamina;
  stepActorMovement(actor, { dx: 0, dy: 0, yaw: 0, sprint: false, crouch: true }, 0.5, world);
  assert.ok(actor.crouching);
  assert.ok(actor.stamina > spent);
});

test('sprint+crouch starts a bounded slide with lower camera pose state', () => {
  const actor = baseActor();
  stepActorMovement(actor, { dx: 0, dy: 1, yaw: 0, sprint: true, crouch: true }, 1 / 30, world);
  assert.equal(actor.sliding, true);
  assert.equal(actor.crouching, true);
  assert.ok(actor.slideT > 0 && actor.slideT <= 0.68);
  const slideZ = actor.z;
  stepActorMovement(actor, { dx: 0, dy: 1, yaw: 0, sprint: true, crouch: true }, 0.7, world);
  assert.equal(actor.sliding, false);
  assert.notEqual(actor.z, slideZ);
});
