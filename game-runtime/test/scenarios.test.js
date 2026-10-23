import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KhaaosSim3D, getWorldLayout, DEFAULT_INPUT } from '../src/game3d/sim3d.js';
import { resolveScenario } from '../src/game3d/scenarios.js';

test('o seletor usa os 16 operativos canônicos com dados visuais completos', () => {
  const roster = JSON.parse(readFileSync(new URL('../../Content/Avatars/avatar_catalog.json', import.meta.url), 'utf8'));
  assert.equal(roster.length, 16);
  assert.equal(new Set(roster.map((operative) => operative.id)).size, 16);
  for (const operative of roster) {
    assert.ok(operative.codename && operative.specialization && operative.defaultWorld);
    assert.ok(operative.colors?.skinTone && operative.colors?.primary && operative.colors?.secondary);
  }
});

test('Barburhen resolve o protótipo industrial e mapeia os setores competitivos', () => {
  const scenario = resolveScenario('barburhen');
  const layout = getWorldLayout('BARBURHEN-TEST', scenario.id);
  assert.equal(scenario.id, 'Barburhen');
  assert.equal(layout.scenarioId, 'Barburhen');
  assert.deepEqual(layout.sectors.map((sector) => sector.name), [
    'SETOR URBANO', 'ESTAÇÃO FRIA', 'PARQUE FERRÍFERO', 'USINA INDUSTRIAL', 'TERMINAL ZEX',
  ]);
  assert.deepEqual(layout.playerSpawn, { x: 90, z: 150 });
  assert.ok(layout.lootSpots.every((spot) => spot.sectorId && spot.lootZone));
  assert.equal(getWorldLayout('BARBURHEN-TEST', scenario.id), layout);
});

test('Barburhen aplica dano de ring e KRC de acordo com o multiplicador do mundo', () => {
  const training = new KhaaosSim3D({ seed: 'ZONE-RULES', botCount: 0 });
  const barburhen = new KhaaosSim3D({ seed: 'ZONE-RULES', botCount: 0, scenarioId: 'Barburhen' });
  training.start('belt');
  barburhen.start('belt');
  for (const sim of [training, barburhen]) {
    sim.player.x = 171;
    sim.player.z = 0;
    sim.ring.radius = 170;
    sim.step(DEFAULT_INPUT, 1 / 30);
  }
  assert.ok(barburhen.player.life < training.player.life);
  assert.equal(training.scenario.krcMultiplier, 1);
  assert.equal(barburhen.scenario.krcMultiplier, 1.5);
  assert.equal(barburhen.snapshot().scenarioId, 'Barburhen');
  assert.equal(barburhen.exportReplay().scenarioId, 'Barburhen');
});

test('CIGKV continua sendo o cenário padrão e mantém o ponto de inserção anterior', () => {
  const sim = new KhaaosSim3D({ seed: 'DEFAULT-WORLD', botCount: 0 });
  assert.equal(sim.scenario.id, 'CIGKV');
  assert.deepEqual({ x: sim.player.x, z: sim.player.z }, { x: 0, z: 150 });
});
