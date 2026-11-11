import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KhaaosSim3D, getWorldLayout, DEFAULT_INPUT } from '../src/game3d/sim3d.js';
import { resolveScenario } from '../src/game3d/scenarios.js';
import { disembarcarSim, disembarcarSala } from './helpers/zuProtocolo.js'; // Task 53 — fixture do protocolo do trem

test('o seletor usa os operativos canônicos com dados visuais completos', () => {
  // Fase 26 — 16 canônicos + TALON (Agilidade e Informação) = 17 selecionáveis
  // Lote 4 — +16 não-militares (milícias e gangues urbanas) = 33 selecionáveis
  const roster = JSON.parse(readFileSync(new URL('../../Content/Avatars/avatar_catalog.json', import.meta.url), 'utf8'));
  assert.equal(roster.length, 33);
  assert.equal(new Set(roster.map((operative) => operative.id)).size, 33);
  for (const operative of roster) {
    assert.ok(operative.codename && operative.specialization && operative.defaultWorld);
    assert.ok(operative.colors?.skinTone && operative.colors?.primary && operative.colors?.secondary);
  }
});

test('Barburhen resolve o MUNDO DA DESTRUIÇÃO (diretiva W1) e mapeia os setores competitivos', () => {
  const scenario = resolveScenario('barburhen');
  const layout = getWorldLayout('BARBURHEN-TEST', scenario.id);
  assert.equal(scenario.id, 'Barburhen');
  assert.equal(layout.scenarioId, 'Barburhen');
  // Fase 31 — identidade da diretiva de arte (Mundos W1/C1)
  // Fase 42 — setores 1:1 com a tabela W1 do README ("Área Urbana e Comercial")
  assert.equal(scenario.label, 'Barburhen — O Mundo da Destruição');
  assert.deepEqual(layout.sectors.map((sector) => sector.name), [
    'ÁREA URBANA E COMERCIAL', 'SETOR INDUSTRIAL', 'PARQUE ABANDONADO', 'ZONA DE EXTRAÇÃO', 'TERMINAL ZEX',
  ]);
  assert.deepEqual(layout.playerSpawn, { x: 90, z: 150 });
  assert.ok(layout.lootSpots.every((spot) => spot.sectorId && spot.lootZone));
  assert.equal(getWorldLayout('BARBURHEN-TEST', scenario.id), layout);
});

test('Barburhen aplica dano de ring e KRC de acordo com o multiplicador do mundo', () => {
  const training = new KhaaosSim3D({ seed: 'ZONE-RULES', botCount: 0 });
  const barburhen = new KhaaosSim3D({ seed: 'ZONE-RULES', botCount: 0, scenarioId: 'Barburhen' });
  training.start('belt');
  disembarcarSim(training); // Task 53 — protocolo do trem cumprido antes do teste
  barburhen.start('belt');
  disembarcarSim(barburhen); // Task 53 — protocolo do trem cumprido antes do teste
  for (const sim of [training, barburhen]) {
    sim.player.x = 171;
    sim.player.z = 0;
    sim.ring.radius = 170;
    sim.step(DEFAULT_INPUT, 1 / 30);
  }
  assert.ok(barburhen.player.life < training.player.life);
  assert.equal(training.scenario.krcMultiplier, 0.5);
  assert.equal(training.scenario.xpMultiplier, 1.0);
  assert.equal(barburhen.scenario.krcMultiplier, 1.0);
  assert.equal(barburhen.scenario.xpMultiplier, 1.25);
  assert.equal(barburhen.snapshot().scenarioId, 'Barburhen');
  assert.equal(barburhen.exportReplay().scenarioId, 'Barburhen');
});

test('CIGKV continua sendo o cenário padrão e mantém o ponto de inserção anterior', () => {
  const sim = new KhaaosSim3D({ seed: 'DEFAULT-WORLD', botCount: 0 });
  assert.equal(sim.scenario.id, 'CIGKV');
  assert.deepEqual({ x: sim.player.x, z: sim.player.z }, { x: 0, z: 150 });
});

test('os quatro Mundos competitivos possuem previews locais selecionáveis e aliases operacionais', () => {
  const worlds = [
    ['Priadus', 'w2/c2'],
    ['Ckesalth', 'W3'],
    ['Arukheea', 'w4'],
  ];
  for (const [canonical, alias] of worlds) {
    const scenario = resolveScenario(alias);
    assert.equal(scenario.id, canonical);
    assert.equal(scenario.sectorNames.length, 5);
    assert.ok(scenario.krcMultiplier >= 1.5);
    assert.ok(scenario.xpMultiplier >= 1.5);
    const sim = new KhaaosSim3D({ seed: `PREVIEW-${canonical}`, botCount: 0, scenarioId: canonical });
    assert.equal(sim.snapshot().scenarioId, canonical);
    assert.ok(sim.scenario.playerSpawn);
  }
});
