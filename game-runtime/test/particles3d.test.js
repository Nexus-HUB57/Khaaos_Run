// Khaaos Run — Fase 17 — sistema de partículas REAL (pooled, determinístico).
// Headless por design: falloff procedural no shader (sem document/textura),
// integração SOA determinística, pool em ring buffer com budget constante.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ParticleSystem, Emitter } from '../src/game3d/particles3d.js';

const SPAWN = {
  x: 10, y: 5, z: -3,
  vx: 1, vy: 2, vz: -.5,
  size: 1.5, growth: .5, life: 1,
  drag: .2, gravity: 4, alpha: .8,
  color: [1, .5, .25], endColor: [0, .1, .2],
};

test('pool: capacity fixa — spawn acima da capacidade recicla o slot mais antigo', () => {
  const s = new ParticleSystem({ capacity: 8, name: 'test' });
  for (let i = 0; i < 20; i++) s.spawn({ ...SPAWN, x: i, life: 100 });
  assert.equal(s.activeCount, 8, 'nunca excede a capacidade');
  const alive = s.snapshot();
  assert.equal(alive.length, 8);
  // os 12 primeiros foram reciclados — restam os x=12..19
  assert.deepEqual(alive.map((p) => p.x).sort((a, b) => a - b), [12, 13, 14, 15, 16, 17, 18, 19]);
});

test('vida e morte: partícula morre por life e nunca rasteriza (size 0, y -9999)', () => {
  const s = new ParticleSystem({ capacity: 4 });
  s.spawn({ ...SPAWN, life: .1 });
  assert.equal(s.activeCount, 1);
  s.update(.2);
  assert.equal(s.activeCount, 0);
  const i = 0;
  assert.equal(s.sizeAttr.array[i], 0);
  assert.equal(s.alphaAttr.array[i], 0);
  assert.equal(s.posAttr.array[i * 3 + 1], -9999);
});

test('envelope alpha: fade-in até 12% da vida, fade-out até zero no fim', () => {
  const s = new ParticleSystem({ capacity: 4 });
  s.spawn({ ...SPAWN, life: 1, alpha: 1 });
  s.update(.06); // k=.06 <.12 → env=.5
  assert.ok(Math.abs(s.snapshot()[0].alpha - .5) < 1e-6, `alpha 50% no meio do fade-in (${s.snapshot()[0].alpha})`);
  const s2 = new ParticleSystem({ capacity: 4 });
  s2.spawn({ ...SPAWN, life: 1, alpha: 1 });
  s2.update(.12); // k=.12 → pico
  assert.ok(Math.abs(s2.snapshot()[0].alpha - 1) < 1e-6, 'pico no fim do fade-in');
  const s3 = new ParticleSystem({ capacity: 4 });
  s3.spawn({ ...SPAWN, life: 1, alpha: 1 });
  s3.update(.99); // k=.99 → quase zero
  assert.ok(s3.snapshot()[0].alpha < .05, 'fade-out quase completo');
});

test('integração: gravidade puxa vy, drag amortece vx, crescimento aumenta size', () => {
  const s = new ParticleSystem({ capacity: 4 });
  s.spawn({ ...SPAWN, life: 2 }); // vida 2 s — update(1) deixa a partícula viva
  s.update(1);
  const p = s.snapshot()[0];
  // dragK = 1-.2*1 = .8 → vx = .8; vy = 2*.8 - 4*1 = -2.4; y = 5 + (-2.4)*1
  assert.ok(Math.abs(p.vx - .8) < 1e-6, `vx com drag (${p.vx})`);
  assert.ok(Math.abs(p.vy - (-2.4)) < 1e-6, `vy com drag+gravidade (${p.vy})`);
  assert.ok(Math.abs(p.size - (1.5 + .5 * 1)) < 1e-6, `size cresce (${p.size})`);
  assert.ok(Math.abs(p.y - 2.6) < 1e-6, `y integra a vy JÁ amortecida (${p.y})`);
});

test('determinismo: mesma sequência de spawn+dt → estado idêntico', () => {
  const a = new ParticleSystem({ capacity: 16 });
  const b = new ParticleSystem({ capacity: 16 });
  for (let f = 0; f < 10; f++) {
    for (const s of [a, b]) {
      s.spawn({ ...SPAWN, x: f * 2, vy: 3 });
      s.update(1 / 60);
    }
  }
  const sa = a.snapshot().map((p) => [p.x, p.y, p.z, p.vx, p.vy, p.alpha, p.size].map((v) => v.toFixed(6)));
  const sb = b.snapshot().map((p) => [p.x, p.y, p.z, p.vx, p.vy, p.alpha, p.size].map((v) => v.toFixed(6)));
  assert.deepEqual(sa, sb);
});

test('cor lerp: endColor interpola pela idade da partícula', () => {
  const s = new ParticleSystem({ capacity: 4 });
  s.spawn({ ...SPAWN, life: 1, color: [1, 0, 0], endColor: [0, 1, 0] });
  s.update(.5); // k=.5 → cor média
  const c = s.colorAttr.array;
  assert.ok(Math.abs(c[0] - .5) < 1e-6 && Math.abs(c[1] - .5) < 1e-6, `cor no meio do lerp (${c[0]}, ${c[1]})`);
});

test('Emitter: rate acumula dívida — floor por frame, resto carrega', () => {
  const s = new ParticleSystem({ capacity: 64 });
  const e = new Emitter(s, { origin: { x: 0, y: 0, z: 0 }, rate: 5, params: () => ({ vy: 1, life: 2 }) });
  e.update(.1); // .5 → 0 emitidos (dívida carrega)
  assert.equal(s.activeCount, 0);
  e.update(.1); // 1.0 → 1 emitido
  assert.equal(s.activeCount, 1);
  e.update(1);  // 5 → 5 emitidos
  assert.equal(s.activeCount, 6);
  assert.equal(e.emittedTotal, 6);
});

test('Emitter: origin função, burst manual, disabled não emite', () => {
  const s = new ParticleSystem({ capacity: 64 });
  let t = 0;
  const e = new Emitter(s, { origin: () => ({ x: t, y: 9, z: 0 }), rate: 0, params: () => ({ life: 1 }) });
  e.burst(3, t);
  assert.equal(s.activeCount, 3);
  assert.ok(s.snapshot().every((p) => p.y === 9), 'burst usa origin fn');
  e.enabled = false;
  e.burst(2, t);
  assert.equal(s.activeCount, 3, 'disabled bloqueia burst');
});

test('stress: 60s de simulação sem NaN e com budget respeitado', () => {
  const s = new ParticleSystem({ capacity: 32 });
  const e = new Emitter(s, { origin: { x: 0, y: 0, z: 0 }, rate: 30, params: () => ({ vy: 2, life: 4, size: 1, growth: 1 }) });
  for (let f = 0; f < 60 * 60; f++) {
    e.update(1 / 60, f / 60);
    s.update(1 / 60);
  }
  assert.ok(s.activeCount <= 32, `budget respeitado (${s.activeCount})`);
  for (const p of s.snapshot()) {
    for (const v of [p.x, p.y, p.z, p.vx, p.vy, p.alpha, p.size]) assert.ok(Number.isFinite(v), 'sem NaN/Inf');
  }
});

test('dispose: geometria e material descartados sem erro', () => {
  const s = new ParticleSystem({ capacity: 4 });
  s.spawn({ ...SPAWN });
  s.dispose();
  assert.ok(true);
});
