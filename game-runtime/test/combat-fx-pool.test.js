// Khaaos Run — Fase 18 — FX de combate no pool de partículas compartilhado.
// Effects com { particles, rng } injetados: impactos/sangue/explosão/gloo/
// muzzle saem do caminho legado de sprites e entram no POOL (1 draw call),
// determinístico com SeededRng. Sem pool, o fallback legado segue intacto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Effects } from '../src/game3d/effects3d.js';
import { ParticleSystem } from '../src/game3d/particles3d.js';
import { SeededRng } from '../src/shared/rng.js';

// stub de canvas p/ radialSprite headless (mesmo padrão do survival-fx.test.js)
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

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const makeFX = (seed = 'fx-test', capacity = 256) => {
  const scene = new THREE.Scene();
  const pool = new ParticleSystem({ capacity });
  scene.add(pool.points);
  const fx = new Effects(scene, { particles: pool, rng: new SeededRng(`${seed}:effects`) });
  return { scene, pool, fx };
};

test('impact wall: 10 faíscas + 2 puffs de poeira no pool (12 partículas)', () => {
  const { pool, fx } = makeFX();
  fx.impact(V(1, 2, 3), 'wall');
  assert.equal(pool.activeCount, 12);
  fx.impact(V(1, 2, 3), 'gloo'); // gloo usa o mesmo verbo de faíscas
  assert.equal(pool.activeCount, 24);
});

test('impact ground: poeira marrom (7 chips + 2 puffs), sem faísca quente', () => {
  const { pool, fx } = makeFX();
  fx.impact(V(0, 0.05, 0), 'ground');
  assert.equal(pool.activeCount, 9);
});

test('hitFlesh: sangue com vermelho dominante sobre verde/azul', () => {
  const { pool, fx } = makeFX();
  fx.hitFlesh(V(0, 1, 0));
  assert.equal(pool.activeCount, 9);
  // cor inicial do sangue (r > g,b) — sem antecipar o rng exato
  const { cr, cg, cb } = pool;
  let bloodSeen = false;
  for (let i = 0; i < pool.capacity; i++) if (pool.age[i] < pool.life[i] && cr[i] > cg[i] && cr[i] > cb[i]) bloodSeen = true;
  assert.ok(bloodSeen, 'partícula de sangue presente (vermelho dominante)');
});

test('explosion: 26 partículas no pool (10 fumaça + 16 faíscas) + fireball sprite na cena', () => {
  const { scene, pool, fx } = makeFX();
  fx.explosion(V(0, 1, 0));
  assert.equal(pool.activeCount, 26);
  // fireball continua mesh-based (bola aditiva) — 1 sprite na cena além do points
  const sprites = scene.children.filter((c) => c.isSprite);
  assert.equal(sprites.length, 1);
  assert.ok(fx.explosions.length >= 1, 'fireball registrada p/ update');
});

test('glooPuff: 8 cristais azul-gelo (b > r) no pool', () => {
  const { pool, fx } = makeFX();
  fx.glooPuff(V(0, 0, 0));
  assert.equal(pool.activeCount, 8);
  let crystal = false;
  for (let i = 0; i < pool.capacity; i++) if (pool.age[i] < pool.life[i] && pool.cb[i] > pool.cr[i]) crystal = true;
  assert.ok(crystal, 'cristal azul presente');
});

test('muzzleFlash: 3 partículas no pool (1 fumaça + 2 faíscas) + luz acesa', () => {
  const { pool, fx } = makeFX();
  fx.muzzleFlash(V(0, 1.2, 0));
  assert.equal(pool.activeCount, 3);
  assert.ok(fx.muzzleLight.intensity > 0, 'luz de muzzle preservada');
});

test('determinismo: mesma seed → snapshot byte a byte após update', async () => {
  const run = () => {
    const { pool, fx } = makeFX('det-seed');
    fx.impact(V(1, 2, 3), 'wall');
    fx.explosion(V(0, 1, 0));
    pool.update(.05); pool.update(.05);
    return JSON.stringify(pool.snapshot());
  };
  assert.equal(run(), run(), 'mesma sequência de spawns/dts → mesmo estado');
  assert.notEqual(run(), (() => {
    const { pool, fx } = makeFX('outra-seed');
    fx.impact(V(1, 2, 3), 'wall');
    fx.explosion(V(0, 1, 0));
    pool.update(.05); pool.update(.05);
    return JSON.stringify(pool.snapshot());
  })(), 'seed diferente → estado diferente');
});

test('fallback legado: sem pool os sprites continuam na cena e o pool não existe', () => {
  const scene = new THREE.Scene();
  const fx = new Effects(scene); // contratos antigos: constructor(scene)
  fx.impact(V(0, 0, 0), 'wall');
  fx.hitFlesh(V(1, 0, 0));
  fx.explosion(V(2, 0, 0));
  fx.glooPuff(V(3, 0, 0));
  assert.equal(fx.pool, null);
  const sprites = scene.children.filter((c) => c.isSprite);
  assert.ok(sprites.length >= 12 + 9 + 26 + 8, 'caminho legado intacto');
});

test('reciclagem: burst acima da capacidade não explode (ring buffer)', () => {
  const { pool, fx } = makeFX('burst', 64);
  for (let i = 0; i < 12; i++) fx.explosion(V(i % 5, 1, i % 3)); // 12×26 = 312 > 64
  assert.ok(pool.activeCount <= 64, `capacidade respeitada (${pool.activeCount})`);
  pool.update(.1); // integra sem erro
  assert.ok(pool.snapshot().length <= 64);
});

test('update do pool mata as partículas de combate no fim da vida (sem vazamento)', () => {
  const { pool, fx } = makeFX();
  fx.impact(V(0, 1, 0), 'wall');
  // vida máxima das faíscas: .22+.3 = .52 s → 1 s mata tudo
  for (let i = 0; i < 20; i++) pool.update(.05);
  assert.equal(pool.activeCount, 0);
  assert.equal(pool.snapshot().length, 0);
});

test('compatibilidade: caminho legado dos testes antigos (sem deps) não quebra', () => {
  const scene = new THREE.Scene();
  const fx = new Effects(scene);
  fx.impact(V(0, 0, 0), 'blood');
  fx.impact(V(0, 0, 0), 'ground');
  fx.muzzleFlash(V(0, 1, 0)); // luz preservada no legado
  fx.update(.016);
  assert.equal(fx.muzzleLight.intensity > 0, true);
});
