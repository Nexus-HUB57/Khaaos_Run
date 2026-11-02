import test from 'node:test';
import assert from 'node:assert/strict';
import { KhaaosSim3D } from '../src/game3d/sim3d.js';
import { MatchRoom3D } from '../server/room3d.js';

test('ZU entry: default starts grounded and emits a synchronized vehicle event', () => {
  const sim = new KhaaosSim3D({ seed: 'ZU-ENTRY-1', botCount: 2 });
  sim.start('belt');
  const ingress = sim.events.find((event) => event.type === 'zuIngress');
  assert.equal(sim.entryProtocol, 'zu_vehicle_entry_v1');
  assert.equal(sim.player.dropPhase, null);
  assert.equal(sim.player.onGround, true);
  assert.equal(ingress.protocol, 'ZU_VEHICLE_ENTRY_V1');
  assert.equal(ingress.durationMs, 2200);
  assert.equal(ingress.vehicle, 'train');
});

test('ZU entry online: server emits authoritative vehicle clock and no airborne actor', () => {
  const room = new MatchRoom3D({ id: 'zu-entry-room', seed: 'ZU-ENTRY-2', capacity: 2, botFill: 1 });
  room.addPlayer('human');
  assert.equal(room.start('human', 'belt'), true);
  assert.equal(room.entryProtocol, 'zu_vehicle_entry_v1');
  const actors = [...room.humans.values(), ...room.bots];
  assert.ok(actors.every((actor) => actor.dropPhase === null && actor.onGround));
  const ingress = room.drainEvents('human').find((event) => event.type === 'zuIngress');
  assert.equal(ingress.protocol, 'ZU_VEHICLE_ENTRY_V1');
  assert.equal(ingress.vehicle, 'train');
});
