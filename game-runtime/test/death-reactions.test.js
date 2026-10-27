// Fase 12 — reações de morte direcionais (ragdoll fake por torque).
// deathFall é analítico e PURO: impulso de torque oposto ao tiro, pêndulo
// amortecido e assentamento em θmax. Rotação na RAIZ do LOD (vale nos 3
// níveis); agonia aditiva nos membros via animateOperative(dead, death).
import { test } from 'node:test';
import assert from 'node:assert/strict';

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

const { deathFall, deathFallMax, DEATH_FALL, createOperative, animateOperative } =
  await import('../src/game3d/entities3d.js');

test('direção: tiro da frente → cai de COSTAS; tiro de trás → cai p/ frente', () => {
  const front = deathFall({ angle: 0, power: 1, age: .3 });
  assert.ok(front.rotX > 0, 'tiro da frente: rotX positivo tomba de costas');
  assert.ok(Math.abs(front.rotZ) < 1e-9, 'sem componente lateral');
  const behind = deathFall({ angle: Math.PI, power: 1, age: .3 });
  assert.ok(behind.rotX < 0, 'tiro de trás: rotX negativo (cai p/ frente)');
  assert.ok(Math.abs(behind.rotZ) < 1e-9);
});

test('direção lateral: tiro do lado +x tomba p/ −x (longe do atirador)', () => {
  const right = deathFall({ angle: Math.PI / 2, power: 1, age: .3 });
  assert.ok(right.rotZ > 0, 'rotZ positivo = tomba p/ −x');
  assert.ok(Math.abs(right.rotX) < 1e-9, 'sem componente frente/costas');
  const left = deathFall({ angle: -Math.PI / 2, power: 1, age: .3 });
  assert.ok(left.rotZ < 0, 'espalho: lado −x tomba p/ +x');
});

test('power escala θmax e o th assentado; clamp de power fora de faixa', () => {
  assert.ok(deathFallMax(1) > deathFallMax(.5) && deathFallMax(.5) > deathFallMax(0));
  assert.equal(deathFallMax(7), deathFallMax(1), 'power satura em 1');
  assert.equal(deathFallMax(-2), deathFallMax(0), 'power negativo zera');
  const soft = deathFall({ angle: 0, power: 0, age: 2 }).th;
  const hard = deathFall({ angle: 0, power: 1, age: 2 }).th;
  assert.ok(hard > soft, 'tiro mais forte derruba mais');
  assert.equal(hard, deathFallMax(1), 'age ≥ settleT: th == θmax');
});

test('envelope: cresce no impulso, contínuo na fronteira, sem NaN no sweep', () => {
  // monotônico durante o impulso
  let prev = -1;
  for (let a = 0; a < DEATH_FALL.impulse; a += .01) {
    const th = deathFall({ angle: 0, power: 1, age: a }).th;
    assert.ok(th >= prev - 1e-12, `th monotônico no impulso em age=${a.toFixed(2)}`);
    prev = th;
  }
  // continuidade analítica na fronteira impulso→pêndulo
  const a0 = DEATH_FALL.impulse;
  const before = deathFall({ age: a0 - 1e-4, power: 1 }).th;
  const after = deathFall({ age: a0 + 1e-4, power: 1 }).th;
  assert.ok(Math.abs(before - after) < .02, `contínuo (${before.toFixed(4)} → ${after.toFixed(4)})`);
  // sweep completo sem NaN e dentro dos limites
  for (let a = 0; a <= 2.5; a += .01) {
    const r = deathFall({ angle: .7, power: .8, age: a, seed: 5 });
    assert.ok(Number.isFinite(r.th) && Number.isFinite(r.rotX) && Number.isFinite(r.rotZ), `finito em age=${a.toFixed(2)}`);
    assert.ok(r.th >= 0 && r.th <= deathFallMax(.8) * 1.13, `th limitado em age=${a.toFixed(2)}`);
    assert.ok(r.flail >= 0 && r.flail <= 1);
  }
});

test('assentamento: após settleT o corpo para (th fixo, flail 0, settled)', () => {
  const r = deathFall({ angle: .3, power: .9, age: DEATH_FALL.settleT + .5, seed: 2 });
  assert.ok(r.settled);
  assert.equal(r.flail, 0, 'agonia terminou');
  const r2 = deathFall({ angle: .3, power: .9, age: DEATH_FALL.settleT + 2, seed: 2 });
  assert.equal(r.th, r2.th, 'estático: mesma th para sempre');
  for (const k of ['armL', 'armR', 'elbow', 'legL', 'legR', 'head']) {
    assert.equal(r.joints[k], 0, `junta ${k} relaxa no assentamento`);
  }
});

test('agonia: flail sobe no impulso e decai; membros abrem assimetricamente', () => {
  const peak = deathFall({ age: .09, power: 1, seed: 4 }).flail;
  assert.ok(peak > .95, 'flail ~1 no fim do impulso');
  const mid = deathFall({ age: .6, power: 1, seed: 4 }).flail;
  assert.ok(mid > 0 && mid < peak, 'decaindo');
  const a = deathFall({ age: .09, seed: 1 }).joints;
  const b = deathFall({ age: .09, seed: 99 }).joints;
  assert.notEqual(a.armL, b.armL, 'seeds diferentes → aberturas diferentes');
  assert.ok(Math.abs((a.armL - a.armR)) > 0 || Math.abs((b.armL - b.armR)) > 0, 'assimetria orgânica presente');
  // determinismo total
  const a2 = deathFall({ age: .09, seed: 1 });
  assert.deepEqual(a, a2.joints, 'mesmo seed → mesmas juntas');
});

test('inputs hostis não produzem NaN (age/power/seed estranhos)', () => {
  for (const bad of [{ age: NaN }, { age: -5 }, { power: NaN }, { power: 'x' }, { seed: Infinity }, {}]) {
    const r = deathFall(bad);
    assert.ok(Number.isFinite(r.th) && Number.isFinite(r.rotX) && Number.isFinite(r.rotZ), JSON.stringify(bad));
  }
});

test('animateOperative: agonia aditiva sobre a pose morta base (e clamp)', () => {
  const { parts } = createOperative({ variant: 'onith' });
  // base: morto sem death — braços abrem devagar (comportamento Fase 10)
  const { parts: base } = createOperative({ variant: 'onith' });
  animateOperative(base, { t: 1, dead: true });
  // com agonia no pico
  animateOperative(parts, { t: 1, dead: true, death: { angle: .5, power: 1, age: .09, seed: 7 } });
  assert.ok(Math.abs(parts.armL.shoulder.rotation.z) > Math.abs(base.armL.shoulder.rotation.z),
    'agonia abre mais o braço que a base');
  assert.ok(parts.armL.shoulder.rotation.z <= 1.5 + 1e-9, 'clamp de ombro respeitado');
  assert.ok(parts.armR.shoulder.rotation.z >= -1.5 - 1e-9, 'clamp do outro ombro');
  // assentado: juntas voltam ao comportamento base (flail 0 → aditivo zero)
  const { parts: settled } = createOperative({ variant: 'onith' });
  animateOperative(settled, { t: 1, dead: true, death: { angle: .5, power: 1, age: 3, seed: 7 } });
  assert.equal(settled.armL.shoulder.rotation.z, base.armL.shoulder.rotation.z,
    'assentado = base (flail 0 → aditivo zero, mesmo passo da pose morta)');
});

test('retrocompatibilidade: dead sem death → comportamento Fase 10 intacto', () => {
  const { parts } = createOperative({ variant: 'zheers' });
  animateOperative(parts, { t: 1, dead: true });
  assert.ok(parts.armL.shoulder.rotation.z > 0, 'braço abre como antes');
  assert.ok(parts.torso.scale.x === 1, 'tronco sem escala de impacto');
  // face com expressão death mesmo sem param death (rosto reage à própria morte)
  assert.equal(parts.face.expression, 'death');
});

test('face no ragdoll: morto com agonia mantém rosto de morte (imune a hit)', () => {
  const { parts } = createOperative({ variant: 'khael' });
  animateOperative(parts, { t: 1, dead: true, hit: { angle: 0, power: 1, age: 0 }, death: { angle: 0, power: 1, age: .1, seed: 3 } });
  assert.equal(parts.face.expression, 'death', 'morte domina o rosto');
});
