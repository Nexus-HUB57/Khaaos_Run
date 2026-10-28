// Khaaos Run — Fase 20 — decals de morte direcional com LOD (backlog LOD/decals).
// Headless por design: geometria mesclada procedural (sem textura/canvas),
// planos determinísticos por seed e LOD com histerese — mesma filosofia do
// pool de partículas (Fase 17) e do LOD de personagens (Fase 10/12).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DECAL_LOD_TIERS, decalThresholds, decalLODDecision,
  fallDirectionWorld, decalYawWorld, decalPlan, decalColor,
  buildDecalGeometry, POOL_VERTS, DeathDecalSystem,
} from '../src/game3d/decals3d.js';

const close = (a, b, eps = 1e-9, msg = '') =>
  assert.ok(Math.abs(a - b) < eps, `${msg} (esperado ~${b}, veio ${a})`);

// ---------- direção mundial da queda (matemática pura) ----------
test('queda mundial: atirador à FRENTE (angle 0) → corpo cai p/ −z; de TRÁS (π) → +z', () => {
  const front = fallDirectionWorld({ angle: 0, yaw: 0 });
  close(front.x, 0, 1e-9, 'componente lateral zero');
  close(front.z, -1, 1e-9, 'cai para −z (longe do atirador à frente)');
  const back = fallDirectionWorld({ angle: Math.PI, yaw: 0 });
  close(back.x, 0, 1e-9);
  close(back.z, 1, 1e-9, 'cai para +z (longe do atirador atrás)');
});

test('queda lateral: tiro do lado +x do modelo → cai p/ +x mundial (longe do atirador)', () => {
  const right = fallDirectionWorld({ angle: Math.PI / 2, yaw: 0 });
  close(right.x, 1, 1e-9, 'cai para +x mundial');
  close(right.z, 0, 1e-9);
});

test('yaw gira a direção da queda: angle 0 com yaw π/2 → queda p/ −x mundial', () => {
  const d = fallDirectionWorld({ angle: 0, yaw: Math.PI / 2 });
  close(d.x, -1, 1e-9);
  close(d.z, 0, 1e-9);
});

test('direção de queda é unitária p/ qualquer combinação angle+yaw', () => {
  for (const angle of [0, .7, -2.1, Math.PI]) {
    for (const yaw of [0, 1.3, -4.2]) {
      const { x, z } = fallDirectionWorld({ angle, yaw });
      close(Math.hypot(x, z), 1, 1e-9, `angle=${angle} yaw=${yaw}`);
    }
  }
});

test('decalYawWorld alinha o +z do decal com a queda (φ = atan2(dx, dz))', () => {
  close(decalYawWorld({ angle: 0, yaw: 0 }), Math.PI, 1e-9);
  const yawW = decalYawWorld({ angle: .7, yaw: 2.1 });
  const { x, z } = fallDirectionWorld({ angle: .7, yaw: 2.1 });
  close(Math.sin(yawW), x, 1e-9, '+z local do decal aponta p/ dx');
  close(Math.cos(yawW), z, 1e-9, '+z local do decal aponta p/ dz');
});

// ---------- plano determinístico ----------
test('plano determinístico: mesmo seed ⇒ plano idêntico; seed diferente ⇒ plano diferente', () => {
  const a = decalPlan({ angle: .7, yaw: 2.1, power: .8, seed: 42 });
  const b = decalPlan({ angle: .7, yaw: 2.1, power: .8, seed: 42 });
  assert.deepEqual(a, b);
  const c = decalPlan({ angle: .7, yaw: 2.1, power: .8, seed: 43 });
  assert.notDeepEqual(a, c, 'seed diferente muda a assimetria do decal');
});

test('plano: power satura em 1, zera riscos em <0.25 e não produz NaN', () => {
  assert.deepEqual(decalPlan({ power: 7, seed: 9 }), decalPlan({ power: 1, seed: 9 }), 'power satura em 1');
  const zero = decalPlan({ power: 0, seed: 3 });
  assert.equal(zero.streaks.length, 0, 'power < .25: sem riscos de arraste');
  assert.equal(zero.droplets.length >= 2, true, 'gotículas mínimas mesmo em power 0');
  const full = decalPlan({ power: 1, seed: 5 });
  assert.ok(full.streaks.length >= 2 && full.streaks.length <= 3, '2–3 riscos em power 1');
  assert.ok(full.droplets.length >= 2 && full.droplets.length <= 4, '2–4 gotículas');
  assert.ok(full.poolR > zero.poolR, 'tiro forte abre poça maior');
  const sweep = decalPlan({ angle: 1.2, yaw: -3, power: .5, seed: 77 });
  for (const v of [sweep.poolR, sweep.poolStretch, sweep.poolOffset, sweep.yawWorld, sweep.tint, sweep.opacity]) {
    assert.ok(Number.isFinite(v), `campo finito (${v})`);
  }
  for (const st of sweep.streaks) {
    for (const v of [st.off, st.len, st.w, st.alpha]) assert.ok(Number.isFinite(v), 'risco finito');
    assert.ok(st.len > 0 && st.w > 0 && st.alpha > 0, 'comprimento/largura/alpha positivos');
    assert.ok(Math.abs(st.off) <= sweep.poolR * .55 + 1e-9, 'desvio lateral dentro da faixa da poça');
  }
});

test('cor do sangue: variação sutil dentro da faixa vermelho-escuro', () => {
  for (const tint of [0, .5, 1]) {
    const c = decalColor(tint);
    assert.ok(c.r > c.g * 3 && c.r > c.b * 3, 'dominante vermelha');
    assert.ok(c.r > .25 && c.r < .42, 'vermelho escuro');
  }
  assert.notDeepEqual(decalColor(0), decalColor(1), 'tint muda a cor');
});

// ---------- LOD com histerese ----------
test('LOD do decal: full → simple → hidden pela distância', () => {
  const th = DECAL_LOD_TIERS.high;
  assert.equal(decalLODDecision(10, 'full', th), 'full');
  assert.equal(decalLODDecision(50, 'full', th), 'full');
  assert.equal(decalLODDecision(th.simple, 'full', th), 'simple');
  assert.equal(decalLODDecision(th.cull + 1, 'full', th), 'hidden');
});

test('LOD do decal: histerese impede vibração na fronteira', () => {
  const th = DECAL_LOD_TIERS.high;
  // full → só volta de simple com dist < full·(1−HYST) = 25.5
  assert.equal(decalLODDecision(26, 'simple', th), 'simple', '26 m ainda é simple (histerese)');
  assert.equal(decalLODDecision(25, 'simple', th), 'full', '25 m já volta a full');
  // hidden → só sai com dist < cull·(1−HYST) = 187
  assert.equal(decalLODDecision(190, 'hidden', th), 'hidden', '190 m continua escondido');
  assert.equal(decalLODDecision(180, 'hidden', th), 'simple', '180 m reaparece em simple');
  assert.equal(decalLODDecision(20, 'hidden', th), 'full');
  // simple → hidden só ALÉM do cull integral (mesma semântica do lod3d: proxy
  // só culla com dist > cull; dentro dele o decal continua legível como poça)
  assert.equal(decalLODDecision(200, 'simple', th), 'simple', '200 m ainda é simple (< cull 220)');
  assert.equal(decalLODDecision(th.cull + 1, 'simple', th), 'hidden');
});

// ---------- geometria mesclada ----------
test('geometria: partição do drawRange (poça 36 verts | full = poça + riscos + gotículas)', () => {
  const plan = decalPlan({ angle: .4, yaw: 1.2, power: 1, seed: 5 });
  const { geometry, simpleVerts, fullVerts } = buildDecalGeometry(plan);
  assert.equal(simpleVerts, POOL_VERTS, 'LOD simple = só a poça (12 tris)');
  assert.equal(fullVerts, POOL_VERTS + 6 * plan.streaks.length + 18 * plan.droplets.length);
  assert.ok(simpleVerts < fullVerts, 'full tem detalhe extra além da poça');
  const count = geometry.attributes.position.count;
  assert.equal(count, fullVerts, 'buffer tem exatamente os verts do LOD full');
  geometry.dispose();
});

test('geometria: planar (y=0), dentro do raio de segurança e poça alongada na queda', () => {
  const plan = decalPlan({ angle: 0, yaw: 0, power: 1, seed: 8 });
  const { geometry, simpleVerts } = buildDecalGeometry(plan);
  const pos = geometry.attributes.position.array;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < pos.length; i += 3) {
    assert.equal(pos[i + 1], 0, 'decal é plano no chão (y=0)');
    minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
    minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2]);
    assert.ok(Math.hypot(pos[i], pos[i + 2]) < 5, 'vert dentro do raio de segurança do decal');
  }
  // só a poça (simpleVerts): extensão z (queda) > extensão x (lateral)
  let sxMin = 1e9, sxMax = -1e9, szMin = 1e9, szMax = -1e9;
  for (let i = 0; i < simpleVerts * 3; i += 3) {
    sxMin = Math.min(sxMin, pos[i]); sxMax = Math.max(sxMax, pos[i]);
    szMin = Math.min(szMin, pos[i + 2]); szMax = Math.max(szMax, pos[i + 2]);
  }
  assert.ok((szMax - szMin) > (sxMax - sxMin), `poça alongada na direção da queda (${(szMax - szMin).toFixed(2)} > ${(sxMax - sxMin).toFixed(2)})`);
  geometry.dispose();
});

// ---------- sistema (pool + LOD + fade) ----------
function makeSys(overrides = {}) {
  const scene = new THREE.Scene();
  const sys = new DeathDecalSystem(scene, { capacity: 4, life: 10, ...overrides });
  return { scene, sys };
}

test('pool em ring buffer: capacidade fixa, spawn acima recicla o decal MAIS ANTIGO', () => {
  const { scene, sys } = makeSys();
  const powers = [.2, .4, .6, .8, 1, .5]; // poolR distintos (exceto os reciclados)
  powers.forEach((p) => sys.spawn({ x: 1, y: 0, z: 1, power: p, seed: 3 }));
  assert.equal(sys.activeCount, 4, 'nunca excede a capacidade');
  const snap = sys.snapshot();
  assert.equal(snap.length, 4);
  const poolRs = snap.map((d) => d.poolR).sort((a, b) => a - b);
  // os dois primeiros (.2/.4) foram reciclados — restam .5/.6/.8/1
  assert.deepEqual(poolRs.map((r) => Math.round(r * 1000) / 1000), [.725, .77, .86, .95]);
  assert.equal(scene.children.length, 4, 'meshes pertencem à cena');
});

test('mundo: decal nasce na posição do ator, acima da sombra, orientado pela queda', () => {
  const { sys } = makeSys();
  sys.spawn({ x: 10, y: 2, z: -4, angle: 0, yaw: 0, power: .8, seed: 3 });
  const s = sys.slots[0];
  close(s.mesh.position.x, 10);
  close(s.mesh.position.z, -4);
  assert.ok(s.mesh.position.y > 2.04 && s.mesh.position.y < 2.08, `y acima do chão+EPS (${s.mesh.position.y})`);
  close(s.mesh.rotation.y, Math.PI, 1e-9, 'queda mundial (0,−1) ⇒ rotation.y = π');
  assert.equal(s.mesh.visible, true);
  assert.equal(s.mesh.geometry.drawRange.count, s.fullVerts, 'nascimento em LOD full');
});

test('LOD ao vivo: câmera perto = full, longe = simple, além do cull = hidden (e reaparece)', () => {
  const { sys } = makeSys();
  sys.spawn({ x: 0, y: 0, z: 0, power: .8, seed: 3 });
  const s = sys.slots[0];
  sys.update(0, { x: 5, y: 0, z: 0 });
  assert.equal(s.level, 'full');
  assert.equal(s.mesh.visible, true);
  assert.equal(s.mesh.geometry.drawRange.count, s.fullVerts);
  sys.update(0, { x: 100, y: 0, z: 0 });
  assert.equal(s.level, 'simple', '100 m ≥ simple (85) rebaixa');
  assert.equal(s.mesh.geometry.drawRange.count, s.simpleVerts, 'simple desenha só a poça');
  sys.update(0, { x: 300, y: 0, z: 0 });
  assert.equal(s.level, 'hidden');
  assert.equal(s.mesh.visible, false);
  sys.update(0, { x: 100, y: 0, z: 0 });
  assert.equal(s.level, 'simple', 'câmera voltou: decal reaparece (histerese zera em hidden)');
  assert.equal(s.mesh.visible, true);
  sys.update(0, { x: 5, y: 0, z: 0 });
  assert.equal(s.level, 'full');
});

test('fade de vida: soak-in 8%, hold, fade-out nos 15% finais, morte no fim', () => {
  const { sys } = makeSys(); // life 10
  sys.spawn({ x: 0, y: 0, z: 0, power: .8, seed: 3 });
  const s = sys.slots[0];
  const near = { x: 2, y: 0, z: 0 };
  sys.update(.2, near);
  const opSoak = s.material.opacity;
  sys.update(.8, near); // age 1.0 → k=.1 → hold
  const opHold = s.material.opacity;
  assert.ok(opHold > 0, 'opacidade positiva no hold');
  close(opSoak / opHold, .25, 1e-6, 'k=.02 → env=.25 (soak-in)');
  sys.update(8.5, near); // age 9.5 → k=.95 → env = 1/3
  close(s.material.opacity / opHold, 1 / 3, 1e-6, 'fade-out nos 15% finais');
  sys.update(1, near); // age 10.5 ≥ life → morre
  assert.equal(sys.activeCount, 0, 'decal morre por vida');
  assert.equal(s.mesh.visible, false, 'mesh morto nunca rasteriza');
  assert.equal(s.material.opacity, 0);
});

test('update(0) não envelhece (LOD sem avanço de idade) e fade nunca produz NaN', () => {
  const { sys } = makeSys();
  sys.spawn({ x: 0, y: 0, z: 0, power: .8, seed: 3 });
  const s = sys.slots[0];
  sys.update(0, { x: 2, y: 0, z: 0 });
  assert.equal(s.age, 0, 'dt=0: idade intacta');
  assert.ok(Number.isFinite(s.material.opacity));
});

test('clear() esvazia; dispose() devolve a cena ao estado original', () => {
  const { scene, sys } = makeSys();
  const before = scene.children.length;
  sys.spawn({ x: 1, y: 0, z: 1, seed: 1 });
  sys.spawn({ x: 2, y: 0, z: 2, seed: 2 });
  assert.equal(sys.activeCount, 2);
  sys.clear();
  assert.equal(sys.activeCount, 0);
  assert.equal(scene.children.length, before, 'clear mantém os meshes no pool (reuso)');
  sys.spawn({ x: 3, y: 0, z: 3, seed: 3 });
  assert.equal(sys.activeCount, 1, 'pool reutilizável após clear');
  sys.dispose();
  assert.equal(scene.children.length, 0, 'dispose remove todos os meshes');
});

test('tiers: low simplifica mais perto, culla antes e retém menos decals', () => {
  const low = decalThresholds('low'), med = decalThresholds('medium'), high = decalThresholds('high');
  assert.ok(low.full < med.full && med.full < high.full);
  assert.ok(low.cull < med.cull && med.cull < high.cull);
  assert.ok(low.capacity < med.capacity && med.capacity < high.capacity);
  assert.equal(decalThresholds('inexistente'), DECAL_LOD_TIERS.high, 'tier desconhecido cai p/ high');
  const { sys } = makeSys({ tier: 'low', capacity: null });
  assert.equal(sys.capacity, DECAL_LOD_TIERS.low.capacity, 'capacity herda do tier');
});
