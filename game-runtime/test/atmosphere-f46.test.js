// F46 — atmosfera procedural por mundo: leitura visual de clima sem impacto na sim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScene } from '../src/game3d/world3d.js';
import { buildAtmosphere, ATMOSPHERE_PROFILES } from '../src/game3d/atmosphere3d.js';
import { resolveScenario } from '../src/game3d/scenarios.js';

const ctx2d = {
  fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '',
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
  moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
  bezierCurveTo() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
  fillText() {}, drawImage() {}, setTransform() {}, measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
  putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}

const IDS = ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea'];

test('F46: cada mundo recebe a assinatura atmosférica canônica', () => {
  const kinds = { CIGKV: 'ash', Barburhen: 'acidRain', Priadus: 'spores', Ckesalth: 'dust', Arukheea: 'saltSpray' };
  for (const id of IDS) {
    const { scene } = buildScene(`F46-${id}`, id, null, 'high');
    const a = scene.userData.atmosphere;
    assert.equal(a.id, id);
    assert.equal(a.kind, kinds[id]);
    assert.ok(a.count >= 12 && a.count <= ATMOSPHERE_PROFILES[id].count, `${id}: orçamento limitado`);
    assert.equal(a.group.userData.decorative, true, `${id}: VFX decorativo`);
  }
});

test('F46: atmosfera não vaza entre mundos e não altera layout', () => {
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const { scene } = buildScene(`F46-LAYOUT-${id}`, id, null, 'medium');
    const before = scene.userData.layout.colliders.length;
    const a = scene.userData.atmosphere;
    assert.equal(a.id, scenario.id);
    assert.equal(scene.userData.layout.colliders.length, before);
    assert.ok(a.mesh.frustumCulled === false, 'efeito cobre o campo sem pop de frustum');
  }
});

test('F46: mesma assinatura produz placements e buffers idênticos', () => {
  for (const id of IDS) {
    const s1 = resolveScenario(id);
    const s2 = resolveScenario(id);
    const a = buildAtmosphere({ userData: {}, add() {} }, s1, { atmosphereFactor: .7 });
    const b = buildAtmosphere({ userData: {}, add() {} }, s2, { atmosphereFactor: .7 });
    assert.deepEqual(a.placements, b.placements, `${id}: placements determinísticos`);
    assert.deepEqual([...a.mesh.geometry.getAttribute('position').array], [...b.mesh.geometry.getAttribute('position').array], `${id}: buffer determinístico`);
  }
});

test('F46: ticker atmosférico permanece finito e atualiza opacidade', () => {
  for (const id of IDS) {
    const { scene } = buildScene(`F46-TICK-${id}`, id, null, 'high');
    const a = scene.userData.atmosphere;
    const initial = a.material.opacity;
    for (const t of [0, .25, 1.7, 12.5, 310]) for (const fn of a.animators) fn(1 / 60, t);
    const values = a.mesh.geometry.getAttribute('position').array;
    assert.ok([...values].every(Number.isFinite), `${id}: posições finitas`);
    assert.ok(Number.isFinite(a.material.opacity) && a.material.opacity >= 0 && a.material.opacity <= 1, `${id}: opacity finita`);
    assert.notEqual(a.material.opacity, initial, `${id}: atmosfera respira/move`);
  }
});

test('F46: low/mobile reduz densidade sem remover a assinatura', () => {
  for (const id of IDS) {
    const scene = { userData: {}, add() {} };
    const a = buildAtmosphere(scene, resolveScenario(id), { isMobile: true, atmosphereFactor: .4 });
    assert.ok(a.count >= 12);
    assert.ok(a.count < ATMOSPHERE_PROFILES[id].count);
  }
});
