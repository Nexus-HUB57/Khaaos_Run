// Khaaos Run — Fase 17 — FX das sobrevivências de cada mundo (tsunami/lava/
// gravidade/ácido) ligados aos eventos autoritativos da sim/servidor.
// O dano é POR ALTURA (submergeBelowY/lavaBelowY): o FX materializa a MESMA
// regra — nível sobe, sustenta, recua — sem aplicar dano nenhum aqui.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SurvivalFX } from '../src/game3d/survivalfx3d.js';
import { ParticleSystem } from '../src/game3d/particles3d.js';

// stub de canvas p/ buildScene headless (mesmo padrão do worldmarks.test.js)
const ctx2d = {
  fillStyle: '', fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
  moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
  save() {}, restore() {}, translate() {}, fillText() {},
  measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
  putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}

const PRIADUS = { id: 'Priadus', survival: { type: 'TSUNAMI_WAVE', intervalSeconds: 180, durationSeconds: 40, damagePerSecond: 6, submergeBelowY: 90 } };
const CKESALTH = { id: 'Ckesalth', survival: { type: 'VOLCANIC_LAVA', intervalSeconds: 140, durationSeconds: 35, damagePerSecond: 9, lavaBelowY: 180 } };
const ARUKHEEA = {
  id: 'Arukheea',
  survival: {
    type: 'KHAOS_GRAVITY', intervalSeconds: 120, durationSeconds: 30,
    damagePerSecond: 12, gravityScale: .35, anchorRadius: 28,
    anchors: [{ id: 'NEXUS', name: 'Nexus of Khaaos', x: 0, z: 0 }, { id: 'OESTE', name: 'Oeste', x: -40, z: 30 }],
  },
};

function makeFX(scenario) {
  const scene = new THREE.Scene();
  const particles = new ParticleSystem({ capacity: 512 });
  scene.add(particles.points);
  const fx = new SurvivalFX(scene, scenario, { particles });
  return { scene, particles, fx };
}

test('tsunami: superfície sobe até submergeBelowY (smoothstep) e sustenta', () => {
  const { fx } = makeFX(PRIADUS);
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  assert.equal(fx.state.active, 'tsunami');
  assert.equal(fx.state.phase, 'rising');
  const rise = Math.min(10, 40 * .28); // 10 s
  let t = 0;
  for (let i = 0; i < Math.ceil(rise / (1 / 30)); i++) { fx.update(1 / 30, t); t += 1 / 30; }
  assert.equal(fx.state.phase, 'sustained');
  assert.ok(Math.abs(fx.state.surfaceY - 90) < .5, `superfície no alvo 90 (${fx.state.surfaceY.toFixed(2)})`);
  // sustentação ondula em torno do alvo — nunca desmente a regra de dano
  for (let i = 0; i < 90; i++) { fx.update(1 / 30, t); t += 1 / 30; }
  assert.ok(Math.abs(fx.state.surfaceY - 90) < 1, `ondulação ≤1m do alvo (${fx.state.surfaceY.toFixed(2)})`);
});

test('tsunami: tsunamiEnd recua a superfície até invisível e volta a idle', () => {
  const { fx } = makeFX(PRIADUS);
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  for (let i = 0; i < 300; i++) fx.update(1 / 30, i / 30); // 10s sobe
  fx.handleEvent({ type: 'tsunamiEnd' });
  assert.equal(fx.state.phase, 'receding');
  for (let i = 0; i < 9 * 30 + 2; i++) fx.update(1 / 30, 10 + i / 30); // 9s recua
  assert.equal(fx.state.active, null);
  assert.equal(fx.state.phase, 'idle');
  assert.equal(fx.state.surfaceY, 0);
});

test('tsunami: espuma real — partículas emitidas durante a elevação', () => {
  const { particles, fx } = makeFX(PRIADUS);
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  for (let i = 0; i < 60; i++) { fx.update(1 / 30, i / 30); particles.update(1 / 30); }
  assert.ok(particles.activeCount > 0, `espuma viva (${particles.activeCount})`);
});

test('erupção: lava sobe até lavaBelowY (180 m) e emite brasas + fumaça', () => {
  const { particles, fx } = makeFX(CKESALTH);
  fx.handleEvent({ type: 'eruptionStart', durationSeconds: 35, lavaBelowY: 180 });
  assert.equal(fx.state.active, 'lava');
  const rise = Math.min(10, 35 * .28); // 9.8 s
  for (let i = 0; i < Math.ceil(rise / (1 / 30)); i++) { fx.update(1 / 30, i / 30); particles.update(1 / 30); }
  assert.ok(Math.abs(fx.state.surfaceY - 180) < .5, `lava no alvo 180 (${fx.state.surfaceY.toFixed(2)})`);
  assert.ok(particles.activeCount > 0, `brasas/fumaça vivas (${particles.activeCount})`);
  const surface = fx.group.children.find((m) => m.name === 'lava-surface');
  assert.ok(surface, 'superfície nomeada lava-surface na cena');
});

test('idempotência: tsunamiStart duplicado NÃO duplica a superfície', () => {
  const { fx } = makeFX(PRIADUS);
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  const group = fx.group;
  const meshes = group.children.length;
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  assert.equal(group.children.length, meshes, 'mesma superfície reutilizada');
});

test('anomalia KHAOS: domos nos anchors oficiais, pulso e encerramento', () => {
  const { particles, fx } = makeFX(ARUKHEEA);
  fx.handleEvent({ type: 'gravityAnomalyStart', durationSeconds: 30, gravityScale: .35, anchorRadius: 28, anchors: ARUKHEEA.survival.anchors });
  assert.equal(fx.state.active, 'gravity');
  assert.equal(fx.state.domes, 2, 'um domo por anchor');
  fx.update(1 / 30, 0);
  const group = fx.group;
  const domes = group.children.filter((m) => m.name.startsWith('gravity-dome:'));
  assert.equal(domes.length, 2);
  assert.ok(domes.every((d) => d.visible), 'domos visíveis durante a anomalia');
  assert.ok(domes.every((d) => d.material.opacity > 0), 'pulso com opacity > 0');
  // motos ascendentes
  for (let i = 0; i < 30; i++) { fx.update(1 / 30, i / 30); particles.update(1 / 30); }
  assert.ok(particles.activeCount > 0, 'motos de gravidade invertida');
  fx.handleEvent({ type: 'gravityAnomalyEnd' });
  for (let i = 0; i < 1.3 * 30; i++) fx.update(1 / 30, 1 + i / 30);
  assert.equal(fx.state.active, null);
  assert.ok(domes.every((d) => !d.visible), 'domos escondidos no fim');
});

test('acidRain: drizzle por evento, decai sozinho', () => {
  const { particles, fx } = makeFX({ id: 'CIGKV' });
  fx.handleEvent({ type: 'acidRain', damage: 1, intervalSeconds: 10 });
  assert.ok(fx.state.acidT > 0, 'drizzle ativo');
  for (let i = 0; i < 20; i++) { fx.update(1 / 30, i / 30); particles.update(1 / 30); }
  assert.ok(particles.activeCount > 0, 'gotas de ácido caindo');
  for (let i = 0; i < 3 * 30; i++) { fx.update(1 / 30, 1 + i / 30); particles.update(1 / 30); }
  assert.equal(fx.state.acidT, 0, 'decai a zero');
});

test('evento desconhecido é ignorado sem erro e sem estado', () => {
  const { fx } = makeFX(PRIADUS);
  fx.handleEvent({ type: 'meteorShower', durationSeconds: 5 });
  assert.equal(fx.state.active, null);
  assert.equal(fx.state.phase, 'idle');
});

test('mudança de hazard: tsunami ativo → erupção assume a MESMA superfície', () => {
  const { fx } = makeFX(PRIADUS);
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  fx.handleEvent({ type: 'tsunamiEnd' });
  fx.handleEvent({ type: 'eruptionStart', durationSeconds: 35, lavaBelowY: 180 });
  assert.equal(fx.state.active, 'lava');
  assert.equal(fx.group.children.filter((m) => m.name.includes('surface')).length, 1, 'uma superfície só');
});

test('dispose: grupo removido da cena sem erro duplo', () => {
  const { scene, fx } = makeFX(PRIADUS);
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  fx.update(1 / 30, 0);
  fx.dispose();
  assert.ok(!scene.children.includes(fx.group));
  fx.dispose(); // segunda passada segura
});

// ---------- integração headless com os 5 mundos reais (lição da Fase 16) ----------
import { buildScene } from '../src/game3d/world3d.js';
import { getWorldLayout } from '../src/game3d/sim3d.js';
import { SCENARIOS } from '../src/game3d/scenarios.js';

const HAZARD_EVENT = {
  CIGKV: () => ({ type: 'acidRain', damage: 1, intervalSeconds: 10 }),
  Barburhen: () => null, // sem survival hazard — só partículas de chaminé
  Priadus: (s) => ({ type: 'tsunamiStart', durationSeconds: s.durationSeconds, submergeBelowY: s.submergeBelowY }),
  Ckesalth: (s) => ({ type: 'eruptionStart', durationSeconds: s.durationSeconds, lavaBelowY: s.lavaBelowY }),
  Arukheea: (s) => ({ type: 'gravityAnomalyStart', durationSeconds: s.durationSeconds, gravityScale: s.gravityScale, anchorRadius: s.anchorRadius, anchors: s.anchors }),
};

test('5 mundos: marcos + partículas + SurvivalFX integram sem erro nem NaN', () => {
  for (const scenario of Object.values(SCENARIOS)) {
    const { scene } = buildScene(4321, scenario.id, null, 'high');
    const system = scene.userData.particles;
    assert.ok(system, `${scenario.id}: sistema de partículas compartilhado registrado`);
    const fx = new SurvivalFX(scene, scenario, { particles: system });
    const hazard = scenario.survival ? HAZARD_EVENT[scenario.id]?.(scenario.survival) : null;
    if (hazard) fx.handleEvent(hazard);
    let t = 0;
    for (let i = 0; i < 120; i++) { // 4 s de mundo vivo
      for (const fn of scene.userData.worldMarks.animators) fn(1 / 30, t);
      fx.update(1 / 30, t);
      system.update(1 / 30);
      t += 1 / 30;
    }
    for (const p of system.snapshot()) {
      for (const v of [p.x, p.y, p.z, p.alpha, p.size]) {
        assert.ok(Number.isFinite(v), `${scenario.id}: partícula finita (${v})`);
      }
    }
    if (hazard) assert.ok(fx.state.active, `${scenario.id}: hazard ativo (${fx.state.active})`);
    fx.dispose();
  }
});
