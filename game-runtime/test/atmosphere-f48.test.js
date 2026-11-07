// F48 — diretor cinematográfico: fog responde ao hazard e retorna ao estado-base.
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

test('F48: hazards estreitam e tonalizam o fog cinematográfico por mundo', () => {
  for (const [id, start] of CASES) {
    const { scene } = buildScene(`F48-FOG-${id}`, id, null, 'high');
    const a = scene.userData.atmosphere;
    const baseColor = scene.fog.color.clone();
    const baseDensity = scene.fog.density;
    a.handleEvent({ type: start });
    for (let i = 0; i < 30; i++) for (const fn of a.animators) fn(1 / 60, i / 60);
    assert.notEqual(scene.fog.color.getHex(), baseColor.getHex(), `${id}: fog recebe grade`);
    assert.ok(scene.fog.density > baseDensity, `${id}: densidade fecha a leitura`);
  }
});

test('F48: encerramento restaura fog e densidade sem salto persistente', () => {
  for (const [id, start, end] of CASES.filter(([, , e]) => e)) {
    const { scene } = buildScene(`F48-RESTORE-${id}`, id, null, 'medium');
    const a = scene.userData.atmosphere;
    const baseColor = scene.fog.color.clone();
    const baseDensity = scene.fog.density;
    a.handleEvent({ type: start });
    for (let i = 0; i < 60; i++) for (const fn of a.animators) fn(1 / 60, i / 60);
    a.handleEvent({ type: end });
    for (let i = 0; i < 180; i++) for (const fn of a.animators) fn(1 / 60, 1 + i / 60);
    const colorDelta = Math.abs(scene.fog.color.r - baseColor.r)
      + Math.abs(scene.fog.color.g - baseColor.g)
      + Math.abs(scene.fog.color.b - baseColor.b);
    assert.ok(colorDelta < .002, `${id}: cor de fog restaurada`);
    assert.ok(Math.abs(scene.fog.density - baseDensity) < 1e-8, `${id}: densidade restaurada`);
  }
});

test('F48: fog não responde a evento estrangeiro', () => {
  const { scene } = buildScene('F48-ISOLATION', 'Priadus', null, 'high');
  const a = scene.userData.atmosphere;
  const color = scene.fog.color.getHex();
  const density = scene.fog.density;
  a.handleEvent({ type: 'toxicSmokeStart' });
  for (const fn of a.animators) fn(1 / 60, .5);
  assert.equal(scene.fog.color.getHex(), color);
  assert.equal(scene.fog.density, density);
});
