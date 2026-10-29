// Khaaos Run — Fase 26 — TALON (Hacker & Urban Runner) + "Invasão de Campo".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// ---- stub de Canvas2D (mesmo padrão de character-realism.test.js): as
// texturas procedurais desenham em <canvas>; em node são no-ops ----
const ctx2d = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
  moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
  save() {}, restore() {}, translate() {}, fillText() {},
  measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(128) }; },
  putImageData() {},
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}

const { KhaaosSim3D, DEFAULT_INPUT } = await import('../src/game3d/sim3d.js');
const { OPERATIVE_ABILITIES, getOperativeAbility } = await import('../src/game3d/operativeAbilities.js');
const { createOperative } = await import('../src/game3d/entities3d.js');

const roster = JSON.parse(readFileSync(new URL('../../Content/Avatars/avatar_catalog.json', import.meta.url), 'utf8'));
const createSim = (options = {}) => new KhaaosSim3D({ airdrop: false, ...options });
const activate = (sim, operativeId) => {
  sim.player.operativeId = operativeId;
  sim.start('belt');
  sim.step({ ...DEFAULT_INPUT, ability: true }, 1 / sim.tickRate);
  return sim.consumeEvents().find((event) => event.type === 'ability');
};

test('Talon está no catálogo canônico com identidade de Agilidade e Informação', () => {
  const talon = roster.find((o) => o.id === 'OP_MALE_TALON');
  assert.ok(talon, 'OP_MALE_TALON presente no avatar_catalog.json');
  assert.equal(talon.codename, 'TALON');
  assert.equal(talon.specialization, 'AGILIDADE_E_INFORMACAO');
  assert.ok(talon.colors?.primary && talon.colors?.trim, 'paleta azul/laranja definida');
  assert.ok(talon.lore.includes('parkour'), 'biografia: parkour + hacker');
});

test('"Invasão de Campo" registrada com parâmetros canônicos e progressão Lv1→Lv6', () => {
  const ability = OPERATIVE_ABILITIES.OP_MALE_TALON;
  assert.ok(ability, 'habilidade registrada');
  assert.equal(ability.effect, 'fieldScan');
  assert.equal(getOperativeAbility('OP_MALE_TALON'), ability);
  // spec: pulso de 20 m por 6 s; revela por 4 s; vault +15%
  assert.equal(ability.parameters.radius, 20);
  assert.equal(ability.durationSeconds, 6);
  assert.equal(ability.parameters.revealSeconds, 4);
  assert.equal(ability.parameters.vaultSpeedMultiplier, 1.15);
  // progressão: Lv1 (15 m/4 s/CD 80 s) → Lv6 (25 m/7 s/CD 55 s)
  const lv1 = ability.levelProgression.find((l) => l.level === 1);
  const lv6 = ability.levelProgression.find((l) => l.level === 6);
  assert.deepEqual([lv1.radius, lv1.durationSeconds, lv1.cooldownSeconds], [15, 4, 80]);
  assert.deepEqual([lv6.radius, lv6.durationSeconds, lv6.cooldownSeconds], [25, 7, 55]);
  assert.equal(ability.levelProgression.length, 6);
});

test('fieldScan revela rivais ATRÁS de cobertura (sem LOS) dentro do raio', () => {
  const sim = createSim({ seed: 'TALON-SCAN', botCount: 2 });
  // bot 0 a 12 m (dentro do pulso de 20 m) atrás de cobertura; bot 1 a 60 m
  sim.bots[0].x = sim.player.x + 12; sim.bots[0].z = sim.player.z; sim.bots[0].alive = true;
  sim.bots[1].x = sim.player.x + 60; sim.bots[1].z = sim.player.z; sim.bots[1].alive = true;
  const event = activate(sim, 'OP_MALE_TALON');
  assert.ok(event, 'evento de habilidade emitido');
  assert.equal(event.effect, 'fieldScan');
  assert.equal(event.radius, 20);
  assert.equal(event.targets, 1);
  // revelado pelo pulso que atravessa a parede (revealedTicks = 4 s × tickRate)
  assert.equal(sim.bots[0].revealedTicks, Math.ceil(4 * sim.tickRate));
  assert.equal(sim.bots[1].revealedTicks, 0);
  // cooldown canônico de 65 s
  assert.equal(sim.player.abilityState.cooldownTicks, Math.ceil(65 * sim.tickRate));
});

test('vault +15%: multiplicador ativo apenas no ar enquanto o pulso vive', () => {
  const sim = createSim({ seed: 'TALON-VAULT', botCount: 0 });
  sim.player.operativeId = 'OP_MALE_TALON';
  sim.start('belt');
  // no chão: multiplicador neutro
  sim.step(DEFAULT_INPUT, 1 / sim.tickRate);
  assert.equal(sim.player.abilitySpeedMultiplier ?? 1, 1);
  // ativa o pulso e salta; no passo SEGUINTE (ainda no ar) o multiplicador aplica
  sim.step({ ...DEFAULT_INPUT, ability: true }, 1 / sim.tickRate);
  sim.consumeEvents();
  sim.step({ ...DEFAULT_INPUT, jump: true }, 1 / sim.tickRate);
  sim.step({ ...DEFAULT_INPUT }, 1 / sim.tickRate);
  assert.ok(sim.player.y > 0.05, 'jogador no ar');
  assert.equal(sim.player.abilitySpeedMultiplier, 1.15);
  // após o pulso expirar (6 s), o multiplicador volta a 1
  for (let i = 0; i < Math.ceil(6 * sim.tickRate) + 4; i++) sim.step(DEFAULT_INPUT);
  const afterEffect = sim.player.abilitySpeedMultiplier ?? 1;
  assert.equal(afterEffect, 1);
});

test('Talon tem identidade 3D fixa: moicano, visor emissivo, tiras com mola', () => {
  const { group, parts } = createOperative({ variant: 'OP_MALE_TALON' });
  let emissive = 0, boxes = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry?.type === 'BoxGeometry') boxes++;
    if (o.material?.emissiveIntensity >= 1.1) emissive++;
  });
  assert.ok(emissive >= 3, `visor + LEDs azuis/laranja emissivos (${emissive})`);
  assert.ok(boxes >= 12, `jaqueta/gola/tiras/traquitana como composição (${boxes})`);
  // tiras expostas para a física de mola no animateOperative
  assert.ok(Array.isArray(parts.straps) && parts.straps.length === 2, '2 tiras soltas');
  assert.equal(typeof parts.straps[0].userData.talonPhase, 'number');
  // operativos não-Talon NÃO recebem tiras (identidade preservada)
  const plain = createOperative({ variant: 'OP_MALE_VANGUARD' });
  assert.equal(plain.parts.straps ?? null, null);
});
