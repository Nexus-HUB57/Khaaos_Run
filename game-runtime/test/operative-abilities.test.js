import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KhaaosSim3D, DEFAULT_INPUT } from '../src/game3d/sim3d.js';
import { OPERATIVE_ABILITIES, getOperativeAbility } from '../src/game3d/operativeAbilities.js';

const roster = JSON.parse(readFileSync(new URL('../../Content/Avatars/avatar_catalog.json', import.meta.url), 'utf8'));
const createSim = (options = {}) => new KhaaosSim3D({ airdrop: false, ...options });
const activate = (sim, operativeId) => {
  sim.player.operativeId = operativeId;
  sim.start('belt');
  sim.step({ ...DEFAULT_INPUT, ability: true }, 1 / sim.tickRate);
  return sim.consumeEvents().find((event) => event.type === 'ability');
};

test('existe uma habilidade definida e identificável para cada operativo canônico', () => {
  // Fase 26 — catálogo com 17 operativos: os 16 canônicos + TALON (Hacker &
  // Urban Runner). As 3 insígnias OCE estendem a tabela além do catálogo.
  assert.equal(roster.length, 17);
  const oceIds = ['OCE_01', 'OCE_02', 'OCE_03'];
  const abilityIds = Object.keys(OPERATIVE_ABILITIES);
  for (const id of oceIds) assert.ok(abilityIds.includes(id), `${id} presente na tabela de habilidades`);
  assert.deepEqual(abilityIds.filter((id) => !oceIds.includes(id)).sort(), roster.map((operative) => operative.id).sort());
  for (const operative of [...roster, ...oceIds.map((id) => ({ id }))]) {
    const ability = getOperativeAbility(operative.id);
    assert.equal(ability.operativeId, operative.id);
    assert.ok(ability.name && ability.description);
    assert.ok(ability.cooldownSeconds >= 45);
    assert.ok(ability.durationSeconds >= 0);
  }
});

test('cada um dos 16 operativos ativa sua habilidade correspondente no simulador', () => {
  for (const operative of roster) {
    const sim = createSim({ seed: `ABILITY-${operative.id}`, botCount: 0 });
    sim.player.life = 50;
    const event = activate(sim, operative.id);
    assert.ok(event, `${operative.id} deveria emitir evento de habilidade`);
    assert.equal(event.operativeId, operative.id);
    assert.equal(event.name, OPERATIVE_ABILITIES[operative.id].name);
    assert.equal(sim.player.abilityState.cooldownTicks, Math.ceil(event.cooldownSeconds * sim.tickRate));
  }
});

test('ativação é one-shot lógica, registrada no replay e respeita cooldown por ticks', () => {
  const sim = createSim({ seed: 'ABILITY-CD', botCount: 0 });
  const first = activate(sim, 'OP_MALE_BREACHER');
  assert.equal(first.name, 'Cunha de Forja');
  assert.equal(sim.player.abilityState.cooldownTicks, 55 * sim.tickRate);
  sim.step({ ...DEFAULT_INPUT, ability: true }, 1 / sim.tickRate);
  assert.equal(sim.consumeEvents().some((event) => event.type === 'ability'), false);
  const replay = sim.exportReplay();
  assert.equal(replay.operativeId, 'OP_MALE_BREACHER');
  assert.equal(replay.inputs[0].input.ability, true);
});

test('Coágulo de Campo cura até o máximo e não consome cooldown com vida cheia', () => {
  const sim = createSim({ seed: 'ABILITY-HEAL', botCount: 0 });
  sim.player.life = 90;
  const event = activate(sim, 'OP_MALE_MEDIC_AFRICAN');
  assert.equal(sim.player.life, 100);
  assert.equal(event.healed, 10);
  const full = createSim({ seed: 'ABILITY-HEAL-FULL', botCount: 0 });
  full.player.operativeId = 'OP_MALE_MEDIC_AFRICAN';
  full.start();
  full.step({ ...DEFAULT_INPUT, ability: true });
  assert.equal(full.player.abilityState.cooldownTicks, 0);
  assert.ok(full.consumeEvents().some((item) => item.type === 'abilityUnavailable'));
});

test('habilidade de reconhecimento marca somente bots vivos dentro do raio', () => {
  const sim = createSim({ seed: 'ABILITY-RECON', botCount: 2 });
  sim.bots[0].x = sim.player.x + 10; sim.bots[0].z = sim.player.z; sim.bots[0].alive = true;
  sim.bots[1].x = sim.player.x + 60; sim.bots[1].z = sim.player.z; sim.bots[1].alive = true;
  const event = activate(sim, 'OP_MALE_RECON_ASIAN');
  assert.equal(event.targets, 1);
  assert.ok(sim.bots[0].revealedTicks > 0);
  assert.equal(sim.bots[1].revealedTicks, 0);
});

test('redução de dano, resistência ao Ring e blindagem temporária têm escopos separados', () => {
  const directPair = ['OP_MALE_BREACHER', 'OP_MALE_VANGUARD'].map((operativeId) => {
    const sim = createSim({ seed: 'ABILITY-DAMAGE', botCount: 0 });
    sim.player.operativeId = operativeId; sim.player.armor = 0; sim.start();
    if (operativeId === 'OP_MALE_BREACHER') sim.step({ ...DEFAULT_INPUT, ability: true });
    const p = sim.player;
    sim.bullets.push({ id: 999, x: p.x, y: 1, z: p.z - 2, vx: 0, vy: 0, vz: 120, owner: 'test', damage: 20, life: 1, weapon: 'test' });
    sim.step(DEFAULT_INPUT);
    return 100 - sim.player.life;
  });
  assert.ok(directPair[0] < directPair[1]);

  const ringPair = ['OP_FEMALE_SURVIVOR_INDIGENOUS', 'OP_MALE_VANGUARD'].map((operativeId) => {
    const sim = createSim({ seed: 'ABILITY-RING', botCount: 0 });
    sim.player.operativeId = operativeId; sim.player.armor = 0; sim.start();
    if (operativeId === 'OP_FEMALE_SURVIVOR_INDIGENOUS') sim.step({ ...DEFAULT_INPUT, ability: true });
    sim.player.x = 171; sim.ring.radius = 170;
    const before = sim.player.life;
    sim.step(DEFAULT_INPUT);
    return before - sim.player.life;
  });
  assert.ok(ringPair[0] < ringPair[1]);

  const armored = createSim({ seed: 'ABILITY-ARMOR', botCount: 0 });
  const armorEvent = activate(armored, 'OP_FEMALE_HEAVY_AFRICAN');
  assert.equal(armorEvent.effect, 'temporaryArmor');
  assert.equal(armored.player.temporaryArmor, 15);
});

test('pulso de desarme paralisa sem dano e o scan marca o terminal ZEX mais próximo', () => {
  const stun = createSim({ seed: 'ABILITY-STUN', botCount: 1 });
  stun.bots[0].x = stun.player.x + 2; stun.bots[0].z = stun.player.z;
  const life = stun.bots[0].life;
  const event = activate(stun, 'OP_FEMALE_DISRUPTOR_MENA');
  assert.equal(event.targets, 1);
  assert.ok(stun.bots[0].ai.stunTicks > 0);
  assert.equal(stun.bots[0].life, life);

  const scan = createSim({ seed: 'ABILITY-SCAN', botCount: 0 });
  const terminal = scan.terminals.find((item) => item.active);
  const scanEvent = activate(scan, 'OP_FEMALE_PILOT_EURO');
  assert.equal(scanEvent.terminalLabel, terminal.label || terminal.id);
  assert.equal(scan.player.abilityState.targetTerminalId, terminal.id);
});

test('impulso de Khael nunca ultrapassa 8 metros, mesmo com corrida', () => {
  const sim = createSim({ seed: 'ABILITY-DASH', botCount: 0 });
  sim.player.operativeId = 'OP_MALE_VANGUARD'; sim.start();
  sim.step({ ...DEFAULT_INPUT, ability: true, dx: 1, sprint: true });
  const startX = sim.player.x;
  for (let i = 0; i < 80 && sim.player.abilityState.activeTicks > 0; i++) {
    sim.step({ ...DEFAULT_INPUT, dx: 1, sprint: true });
  }
  assert.ok(sim.player.x - startX <= 8.05);
});
