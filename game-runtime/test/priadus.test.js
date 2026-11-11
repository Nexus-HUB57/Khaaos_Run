import test from 'node:test';
import assert from 'node:assert/strict';
import { KhaaosSim3D, DEFAULT_INPUT } from '../src/game3d/sim3d.js';
import { disembarcarSim, disembarcarSala } from './helpers/zuProtocolo.js'; // Task 53 — fixture do protocolo do trem

// Fase 42 — W2 "Emboscada Verde" (README): neblina com esporos tóxicos pune o
// atraso — teto de esporos sobe até sporeTopY 90; terreno alto sobrevive.

test('Priadus spore fog starts on schedule and damages operators below the canopy', () => {
  const sim = new KhaaosSim3D({ seed: 'PRIADUS-SPORE', botCount: 0, airdrop: false, scenarioId: 'Priadus' });
  sim.start('belt');
  disembarcarSim(sim); // Task 53 — protocolo do trem cumprido antes do teste
  const armorBefore = sim.player.armor;
  sim.sporeTimer = 149.99;
  sim.step(DEFAULT_INPUT, 0.02);
  assert.equal(sim.sporeActive, true);
  assert.ok(sim.player.life < 100);
  assert.equal(sim.player.armor, armorBefore, 'esporos furam a regra do dano ambiental sem tocar blindagem');
  assert.ok(sim.events.some((event) => event.type === 'sporeFogStart'));
});

test('Priadus high platforms counter the active spore fog', () => {
  const sim = new KhaaosSim3D({ seed: 'PRIADUS-HIGH-GROUND', botCount: 0, airdrop: false, scenarioId: 'Priadus' });
  sim.player.x = 0;
  sim.player.z = 0;
  sim.start('belt');
  disembarcarSim(sim); // Task 53 — protocolo do trem cumprido antes do teste
  sim.player.y = 100;
  sim.sporeTimer = 149.99;
  sim.step(DEFAULT_INPUT, 0.02);
  const lifeAfterStart = sim.player.life;
  sim.step(DEFAULT_INPUT, 1);
  assert.equal(sim.player.life, lifeAfterStart);
  assert.equal(sim.sporeActive, true);
});
