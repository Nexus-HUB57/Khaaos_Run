// Khaaos Run — Fase 21 — decals de EXPLOSÃO (scorch) e GLOO reusando a infra
// da Fase 20 (pool ring buffer, LOD por drawRange com histerese, fade de vida,
// 1 draw call/decal). O caminho 'blood' da Fase 20 é REGRESSÃO ZERO: o kind
// default preserva o plano bit a bit (mesmos vértices, mesma partição).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECAL_LOD_TIERS, decalThresholds, decalLODDecision,
  fallDirectionWorld, decalYawWorld, decalPlan, decalColor,
  POOL_VERTS, buildDecalGeometry, DeathDecalSystem,
} from '../src/game3d/decals3d.js';

const fakeScene = () => {
  const scene = { added: [], removed: [] };
  scene.add = (m) => scene.added.push(m);
  scene.remove = (m) => scene.removed.push(m);
  return scene;
};

// ---------- puro: planos por família ----------

test('kind default é blood — decalPlan preserva a Fase 20 bit a bit (regressão zero)', () => {
  const implicit = decalPlan({ angle: .7, yaw: 2.1, power: .8, seed: 42 });
  const explicit = decalPlan({ kind: 'blood', angle: .7, yaw: 2.1, power: .8, seed: 42 });
  assert.deepEqual(implicit, explicit);
  assert.equal(implicit.kind, 'blood');
  // e o plano inteiro é idêntico ao contrato antigo (sem kind no argumento)
  assert.equal(implicit.poolStretch > 1, true, 'sangue continua alongado na queda');
  assert.equal(implicit.poolOffset > 0, true, 'sangue continua deslocado p/ o corpo');
});

test('scorch: determinístico por seed; radiais (ângulos espalhados) e sem offset direcional', () => {
  const a = decalPlan({ kind: 'scorch', power: 1, seed: 7 });
  const b = decalPlan({ kind: 'scorch', power: 1, seed: 7 });
  const c = decalPlan({ kind: 'scorch', power: 1, seed: 8 });
  assert.deepEqual(a, b, 'mesmo seed ⇒ mesmo plano');
  assert.notDeepEqual(a, c, 'seeds diferentes ⇒ planos diferentes');
  assert.equal(a.kind, 'scorch');
  assert.ok(a.streaks.length >= 4 && a.streaks.length <= 7, `4–7 raios, veio ${a.streaks.length}`);
  // raios espalhados em círculo: ângulos normalizados cobrem ≥ 2 quadrantes
  const norm = a.streaks.map((st) => ((st.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
  const quadrants = new Set(norm.map((x) => Math.floor(x / (Math.PI / 2)) % 4));
  assert.ok(quadrants.size >= 2, 'raios cobrem direções distintas (blast não tem frente)');
  // explosão não desloca o centro (poolOffset 0) nem alonga (stretch ~1)
  assert.equal(a.poolOffset, 0);
  assert.ok(a.poolStretch >= 1 && a.poolStretch <= 1.1);
  // todo raio carrega partida própria (s0) e ângulo (a)
  for (const st of a.streaks) {
    assert.equal(typeof st.a, 'number');
    assert.equal(typeof st.s0, 'number');
  }
});

test('scorch: power escala o disco e satura nos extremos (clamp/NaN)', () => {
  const fraco = decalPlan({ kind: 'scorch', power: .3, seed: 5 });
  const forte = decalPlan({ kind: 'scorch', power: 1, seed: 5 });
  assert.ok(forte.poolR > fraco.poolR, 'power maior ⇒ disco maior');
  // clamps: >1 satura em 1; <0 satura em 0; NaN vira 1
  assert.deepEqual(decalPlan({ kind: 'scorch', power: 5, seed: 5 }), forte);
  const zero = decalPlan({ kind: 'scorch', power: -2, seed: 5 });
  assert.deepEqual(zero, decalPlan({ kind: 'scorch', power: 0, seed: 5 }));
  assert.equal(zero.streaks.length, 0, 'power < .25 sem raios (só o disco)');
  assert.deepEqual(decalPlan({ kind: 'scorch', power: NaN, seed: 5 }), forte);
});

test('gloo: determinístico, power escala, cristais finos e brilhos de gelo', () => {
  const a = decalPlan({ kind: 'gloo', power: .62, seed: 11 });
  const b = decalPlan({ kind: 'gloo', power: .62, seed: 11 });
  const c = decalPlan({ kind: 'gloo', power: .62, seed: 12 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.equal(a.kind, 'gloo');
  assert.ok(a.streaks.length >= 3 && a.streaks.length <= 5, `3–5 cristais, veio ${a.streaks.length}`);
  assert.ok(a.droplets.length >= 2 && a.droplets.length <= 4);
  const forte = decalPlan({ kind: 'gloo', power: .95, seed: 11 });
  assert.ok(forte.poolR > a.poolR);
  // cristais são mais FINOS que os raios de explosão (média de w menor)
  const avgW = (pl) => pl.streaks.reduce((s, st) => s + st.w, 0) / pl.streaks.length;
  assert.ok(avgW(a) < avgW(decalPlan({ kind: 'scorch', power: .62, seed: 11 })), 'cristal ≠ raio de blast');
});

test('decalColor: scorch é carvão (mais escuro que sangue), gloo é azul-gelo, blood preservado', () => {
  const blood = decalColor(.5);
  const scorch = decalColor(.5, 'scorch');
  const gloo = decalColor(.5, 'gloo');
  const lum = (c) => .299 * c.r + .587 * c.g + .114 * c.b;
  assert.ok(lum(scorch) < lum(blood), 'explosão (carvão) mais escura que sangue em luminância');
  assert.ok(scorch.r < .2, 'scorch quase sem vermelho');
  assert.ok(gloo.b > gloo.r && gloo.b > .7, 'gloo domina azul');
  // blood com 1 argumento = assinatura antiga intacta (testes da Fase 20)
  assert.deepEqual(decalColor(0), { r: .30, g: .035, b: .045 });
  assert.notDeepEqual(decalColor(0), decalColor(1), 'tint muda a cor');
  // kind default: decalColor(t) === decalColor(t, 'blood')
  assert.deepEqual(decalColor(.7), decalColor(.7, 'blood'));
});

// ---------- puro: geometria mesclada ----------

test('buildDecalGeometry: partição do drawRange preservada p/ todas as famílias', () => {
  for (const kind of ['blood', 'scorch', 'gloo']) {
    const plan = decalPlan({ kind, power: 1, seed: 33 });
    const { geometry, simpleVerts, fullVerts } = buildDecalGeometry(plan);
    assert.equal(simpleVerts, POOL_VERTS, `${kind}: poça = fan de 12 tris`);
    const esperado = POOL_VERTS + 6 * plan.streaks.length + 18 * plan.droplets.length;
    assert.equal(fullVerts, esperado, `${kind}: +6/risco +18/gota`);
    const pos = geometry.getAttribute('position');
    assert.equal(pos.count, fullVerts);
    // planaridade: y = 0 em todos os vértices
    for (let i = 0; i < pos.count; i++) assert.equal(pos.getY(i), 0, `${kind}: decal é plano`);
  }
});

test('buildDecalGeometry: quad de raio com ângulo `a` casa com a matemática sin/cos', () => {
  const plan = decalPlan({ kind: 'scorch', power: 1, seed: 99 });
  const st = plan.streaks[0];
  const { geometry } = buildDecalGeometry(plan);
  const pos = geometry.getAttribute('position');
  const dx = Math.sin(st.a), dz = Math.cos(st.a);
  const px = Math.cos(st.a), pz = -Math.sin(st.a);
  // 1º triângulo do 1º quad: (p00, p01, p11) — mesma ordem do sangue
  const expect = [
    [px * (st.off - st.w / 2) + dx * st.s0, pz * (st.off - st.w / 2) + dz * st.s0],
    [px * (st.off - st.w / 2) + dx * (st.s0 + st.len), pz * (st.off - st.w / 2) + dz * (st.s0 + st.len)],
    [px * (st.off + st.w / 2) + dx * (st.s0 + st.len), pz * (st.off + st.w / 2) + dz * (st.s0 + st.len)],
  ];
  expect.forEach(([ex, ez], v) => {
    // 1º quad de risco começa DEPOIS da poça (POOL_VERTS) — buffer é Float32Array
    assert.ok(Math.abs(pos.getX(POOL_VERTS + v) - ex) < 1e-6, `vert ${v} x`);
    assert.ok(Math.abs(pos.getZ(POOL_VERTS + v) - ez) < 1e-6, `vert ${v} z`);
  });
});

test('buildDecalGeometry: sangue com a=0 gera os MESMOS vértices da receita da Fase 20', () => {
  const plan = decalPlan({ power: .9, seed: 3 });
  const { geometry, simpleVerts } = buildDecalGeometry(plan);
  const pos = geometry.getAttribute('position');
  const st = plan.streaks[0];
  const z0 = plan.poolOffset + plan.poolR * .35;
  const z1 = z0 + st.len;
  const i = simpleVerts * 3;
  const near = (got, want) => Math.abs(got - want) < 1e-6; // Float32Array: ulp ~3e-8 @ 0.3
  // 1º vértice do 1º risco: (off - w/2, z0) — exatamente como antes
  assert.ok(near(pos.array[i], st.off - st.w / 2), 'x0 = off - w/2');
  assert.ok(near(pos.array[i + 2], z0), 'z0 = poolOffset + poolR*.35');
  // e o 2º vértice continua (off - w/2, z1)
  assert.ok(near(pos.array[i + 3], st.off - st.w / 2));
  assert.ok(near(pos.array[i + 5], z1));
});

// ---------- sistema: pool compartilhado entre famílias ----------

test('sistema: spawn de 3 famílias no MESMO pool — snapshot carrega o kind', () => {
  const sys = new DeathDecalSystem(fakeScene(), { tier: 'high' });
  sys.spawn({ kind: 'blood', x: 1, z: 1, angle: .5, yaw: 1, power: .8, seed: 1 });
  sys.spawn({ kind: 'scorch', x: 20, z: 5, power: .9, seed: 2 });
  sys.spawn({ kind: 'gloo', x: 40, z: 9, yaw: .3, angle: Math.PI / 2, power: .62, seed: 3 });
  const snap = sys.snapshot();
  assert.equal(snap.length, 3);
  assert.deepEqual(snap.map((d) => d.kind), ['blood', 'scorch', 'gloo']);
  assert.equal(sys.activeCount, 3);
  // default sem kind continua sendo sangue
  sys.spawn({ x: 60, z: 1, seed: 4 });
  assert.equal(sys.snapshot().at(-1).kind, 'blood');
});

test('sistema: cor do material segue a família (scorch escuro, gloo gelo)', () => {
  const scene = fakeScene();
  const sys = new DeathDecalSystem(scene, { tier: 'high' });
  sys.spawn({ kind: 'scorch', seed: 1 });
  sys.spawn({ kind: 'gloo', seed: 2 });
  sys.spawn({ kind: 'blood', seed: 3 });
  const [sc, gl, bl] = sys.slots.map((s) => s.material.color);
  assert.ok(sc.r < .2, 'scorch quase preto');
  assert.ok(gl.b > gl.r, 'gloo azulado');
  assert.ok(bl.r > .25 && bl.g < .1, 'sangue vermelho escuro');
});

test('sistema: ring buffer RECICLA entre famílias (orçamento constante p/ tudo)', () => {
  const sys = new DeathDecalSystem(fakeScene(), { tier: 'high', capacity: 2 });
  sys.spawn({ kind: 'blood', seed: 1 });
  sys.spawn({ kind: 'scorch', seed: 2 });
  assert.equal(sys.activeCount, 2);
  sys.spawn({ kind: 'gloo', seed: 3 });           // enche: recicla o mais antigo (blood)
  const snap = sys.snapshot();
  assert.equal(sys.activeCount, 2);
  assert.deepEqual(snap.map((d) => d.kind), ['gloo', 'scorch'], 'slot 0 reciclado pelo gloo');
  // renovar a MESMA família também recicla (comportamento da Fase 20 preservado)
  sys.spawn({ kind: 'gloo', seed: 4 });
  assert.equal(sys.activeCount, 2);
  assert.equal(sys.snapshot().filter((d) => d.kind === 'gloo').length, 2);
});

test('sistema: LOD e fade de vida funcionam por decal independente da família', () => {
  const sys = new DeathDecalSystem(fakeScene(), { tier: 'high', life: 10 });
  sys.spawn({ kind: 'scorch', x: 0, z: 0, seed: 1 });
  sys.spawn({ kind: 'gloo', x: 5, z: 0, seed: 2 });
  // perto: full; longe: hidden (limiar de cull do tier high = 220)
  sys.update(0, { x: 0, y: 0, z: 0 });
  assert.equal(sys.snapshot()[0].level, 'full');
  sys.update(0, { x: 500, y: 0, z: 0 });
  assert.deepEqual(sys.snapshot().map((d) => d.level), ['hidden', 'hidden']);
  sys.update(0, { x: 0, y: 0, z: 0 });
  // de hidden volta direto p/ full (dist < simple)
  assert.deepEqual(sys.snapshot().map((d) => d.level), ['full', 'full']);
  // fade-out nos 15% finais da vida
  sys.update(8.4, { x: 0, y: 0, z: 0 });          // k = .84 → hold
  const antes = sys.snapshot().map((d) => d.opacity);
  sys.update(.8, { x: 0, y: 0, z: 0 });           // k = .92 → esvaziando
  const depois = sys.snapshot().map((d) => d.opacity);
  assert.ok(depois[0] < antes[0], 'scorch esvanece com a vida');
  assert.ok(depois[1] < antes[1], 'gloo esvanece com a vida');
  sys.update(1, { x: 0, y: 0, z: 0 });            // k = 1.0 → morte
  assert.equal(sys.activeCount, 0, 'decals de qualquer família expiram');
});

test('sistema: camadas anti z-fight e orientação mundial mantidas p/ novas famílias', () => {
  const sys = new DeathDecalSystem(fakeScene(), { tier: 'high' });
  sys.spawn({ kind: 'scorch', x: 10, z: 20, seed: 1 });
  sys.spawn({ kind: 'gloo', x: 10, z: 20, yaw: 1.2, angle: Math.PI / 2, seed: 2 });
  const [a, b] = sys.snapshot();
  assert.ok(b.y > a.y, 'slots sobrepostos empilham camadas (EPS + slot·LAYER)');
  assert.ok(Number.isFinite(a.yawWorld) && Number.isFinite(b.yawWorld));
  // clear + dispose não explodem com pool misto
  sys.clear();
  assert.equal(sys.activeCount, 0);
  sys.spawn({ kind: 'scorch', seed: 9 });
  assert.equal(sys.activeCount, 1);
  sys.dispose();
  assert.equal(sys.slots.length, 0);
});

test('tiers e decisão de LOD intocados (contrato da Fase 20)', () => {
  assert.equal(decalThresholds('low'), DECAL_LOD_TIERS.low);
  assert.equal(decalThresholds('inexistente'), DECAL_LOD_TIERS.high);
  assert.equal(decalLODDecision(5), 'full');
  assert.equal(decalLODDecision(100), 'simple', 'simple ∈ [85, 220) no tier high');
  assert.equal(decalLODDecision(999), 'hidden');
  // direção mundial segue a MESMA convenção da Fase 20 (canônico: angle 0
  // yaw 0 cai p/ −z — longe do atirador à frente)
  const f = fallDirectionWorld({ angle: 0, yaw: 0 });
  assert.ok(Math.abs(f.x) < 1e-9 && Math.abs(f.z + 1) < 1e-9, 'queda p/ −z');
  assert.equal(decalYawWorld({ angle: 0, yaw: 0 }), Math.PI);
});
