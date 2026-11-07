// F49 — iluminação cinematográfica sincronizada com os hazards visuais.
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

function intensities(lights) {
  return Object.fromEntries(['sun', 'hemi', 'fill', 'back'].map((name) => [name, lights[name]?.intensity ?? 0]));
}

test('F49: cada hazard altera a assinatura luminosa do próprio Ring', () => {
  for (const [id, start] of CASES) {
    const { scene } = buildScene(`F49-LIGHT-${id}`, id, null, 'high');
    const a = scene.userData.atmosphere;
    const lights = scene.userData.nightLights;
    const before = intensities(lights);
    a.handleEvent({ type: start });
    for (let i = 0; i < 36; i++) for (const fn of a.animators) fn(1 / 60, i / 60);
    const after = intensities(lights);
    assert.ok(Object.keys(before).some((name) => Math.abs(after[name] - before[name]) > 1e-5), `${id}: luz reagiu`);
  }
});

test('F49: fim do hazard restaura intensidades e cores capturadas', () => {
  for (const [id, start, end] of CASES.filter(([, , e]) => e)) {
    const { scene } = buildScene(`F49-RESTORE-${id}`, id, null, 'medium');
    const a = scene.userData.atmosphere;
    const lights = scene.userData.nightLights;
    const before = intensities(lights);
    const colors = Object.fromEntries(['sun', 'hemi', 'fill', 'back'].map((name) => [name, lights[name].color.clone()]));
    a.handleEvent({ type: start });
    for (let i = 0; i < 48; i++) for (const fn of a.animators) fn(1 / 60, i / 60);
    a.handleEvent({ type: end });
    for (let i = 0; i < 180; i++) for (const fn of a.animators) fn(1 / 60, 1 + i / 60);
    const after = intensities(lights);
    for (const name of Object.keys(before)) {
      assert.ok(Math.abs(after[name] - before[name]) < 1e-7, `${id}: intensidade ${name} restaurada`);
      const c = lights[name].color;
      const b = colors[name];
      assert.ok(Math.abs(c.r - b.r) + Math.abs(c.g - b.g) + Math.abs(c.b - b.b) < 1e-6, `${id}: cor ${name} restaurada`);
    }
  }
});

test('F49: hazard estrangeiro não modifica as luzes', () => {
  const { scene } = buildScene('F49-ISOLATION', 'Priadus', null, 'high');
  const lights = scene.userData.nightLights;
  const before = intensities(lights);
  scene.userData.atmosphere.handleEvent({ type: 'toxicSmokeStart' });
  for (const fn of scene.userData.atmosphere.animators) fn(1 / 60, .5);
  assert.deepEqual(intensities(lights), before);
});
