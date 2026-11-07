// F47 — atmosfera responsiva ao hazard autoritativo, sem alterar a simulação.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScene } from '../src/game3d/world3d.js';

const ctx2d = {
  fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, font: '',
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
  moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
  bezierCurveTo() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
  fillText() {}, drawImage() {}, setTransform() {}, measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; },
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
  putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
};
if (typeof globalThis.document === 'undefined') globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };

const CASES = [
  ['CIGKV', 'gravityAnomalyStart', 'gravityAnomalyEnd'],
  ['Barburhen', 'acidRain', null],
  ['Priadus', 'sporeFogStart', 'sporeFogEnd'],
  ['Ckesalth', 'toxicSmokeStart', 'toxicSmokeEnd'],
  ['Arukheea', 'tsunamiStart', 'tsunamiEnd'],
];

test('F47: cada hazard canônico aumenta a resposta atmosférica do próprio mundo', () => {
  for (const [id, start, end] of CASES) {
    const { scene } = buildScene(`F47-REACT-${id}`, id, null, 'high');
    const a = scene.userData.atmosphere;
    const before = a.hazardState.boost;
    a.handleEvent({ type: start, durationSeconds: 10, submergeBelowY: 90, sporeTopY: 90, smokeTopY: 180 });
    for (const fn of a.animators) for (let i = 0; i < 12; i++) fn(1 / 60, i / 60);
    assert.equal(a.hazardState.active, true, `${id}: hazard ativo`);
    assert.ok(a.hazardState.boost > before, `${id}: boost atmosférico subiu`);
    assert.ok(a.material.opacity > .22, `${id}: opacidade responde`);
    if (end) {
      a.handleEvent({ type: end });
      for (const fn of a.animators) for (let i = 0; i < 120; i++) fn(1 / 60, 1 + i / 60);
      assert.equal(a.hazardState.active, false, `${id}: hazard encerra`);
    }
  }
});

test('F47: pulso ácido expira, não acumula estado e mantém buffers finitos', () => {
  const { scene } = buildScene('F47-ACID', 'Barburhen', null, 'high');
  const a = scene.userData.atmosphere;
  a.handleEvent({ type: 'acidRain' });
  for (const fn of a.animators) fn(1 / 60, 0);
  assert.equal(a.hazardState.kind, 'acidRain');
  assert.ok(a.hazardState.pulse > 0);
  for (let i = 0; i < 180; i++) for (const fn of a.animators) fn(1 / 60, i / 60);
  assert.equal(a.hazardState.active, false, 'pulso expira em ~2,2 s');
  assert.ok([...a.mesh.geometry.getAttribute('position').array].every(Number.isFinite), 'buffer continua finito');
});

test('F47: eventos de outro mundo não ativam a atmosfera errada', () => {
  for (const [id] of CASES) {
    const { scene } = buildScene(`F47-ISOLATE-${id}`, id, null, 'medium');
    const a = scene.userData.atmosphere;
    const foreign = id === 'Priadus' ? 'toxicSmokeStart' : 'sporeFogStart';
    a.handleEvent({ type: foreign });
    for (const fn of a.animators) fn(1 / 60, 0);
    assert.equal(a.hazardState.active, false, `${id}: hazard estrangeiro ignorado`);
    // O registro não muda de identidade nem cria geometrias extras.
    assert.equal(a.kind, id === 'Priadus' ? 'spores' : a.kind);
    assert.equal(a.group.children.length, 1);
  }
});
