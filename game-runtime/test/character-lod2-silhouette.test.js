// Fase 12 — LOD 2: silhueta sólida única a >80 m.
// Um volume convexo (2 meshes, 1 material) substitui o proxy além do limiar
// `sil` por tier (65/80/95 m) — com a MESMA histerese de 15% e cull herdado.
// A rotação de morte (Fase 12) vive na RAIZ do LOD, então vale em silhueta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// ---- stub de Canvas2D (createOperative → textures3d desenha em <canvas>) ----
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

const { lodDecision, lodThresholds, LOD_TIERS, buildOperativeSilhouette, buildOperativeProxy, createCharacterLOD } =
  await import('../src/game3d/lod3d.js');
const { createOperative } = await import('../src/game3d/entities3d.js');

test('limiares sil por tier: 65/80/95 m e ordem full < sil < cull', () => {
  assert.equal(LOD_TIERS.low.sil, 65);
  assert.equal(LOD_TIERS.medium.sil, 80);
  assert.equal(LOD_TIERS.high.sil, 95);
  for (const t of ['low', 'medium', 'high']) {
    const th = lodThresholds(t);
    assert.ok(th.full < th.sil && th.sil < th.cull, `${t}: full(${th.full}) < sil(${th.sil}) < cull(${th.cull})`);
  }
  assert.ok(LOD_TIERS.low.sil < LOD_TIERS.medium.sil && LOD_TIERS.medium.sil < LOD_TIERS.high.sil,
    'mobile troca p/ silhueta mais perto que o high');
});

test('decisão: full → proxy → silhouette → hidden (tier high)', () => {
  const th = LOD_TIERS.high; // full 30, sil 95, cull 280
  assert.equal(lodDecision(20, 'full', th), 'full');
  assert.equal(lodDecision(40, 'full', th), 'proxy');
  assert.equal(lodDecision(94.9, 'proxy', th), 'proxy');
  assert.equal(lodDecision(95.1, 'proxy', th), 'silhouette');
  assert.equal(lodDecision(200, 'silhouette', th), 'silhouette');
  assert.equal(lodDecision(281, 'silhouette', th), 'hidden');
  assert.equal(lodDecision(400, undefined, th), 'hidden', 'primeira chamada sem nível atual');
});

test('histerese da silhueta: fronteira em 95 m não vibra a cada frame', () => {
  const th = LOD_TIERS.high;
  // entra em silhueta em 95; só volta a proxy abaixo de 95*.85 = 80.75
  assert.equal(lodDecision(94, 'proxy', th), 'proxy');
  assert.equal(lodDecision(96, 'proxy', th), 'silhouette');
  assert.equal(lodDecision(90, 'silhouette', th), 'silhouette', 'acima de 80.75: permanece silhueta');
  assert.equal(lodDecision(80, 'silhouette', th), 'proxy', 'só retorna com ~15% de folga');
  // vai-e-vem na fronteira: estado memórico estabiliza
  let level = 'proxy';
  for (const d of [96, 94, 96, 94]) level = lodDecision(d, level, th);
  assert.equal(level, 'silhouette', 'oscilar em 94/96 não troca de nível');
});

test('orçamento da silhueta: ≤ 3 meshes, ≤ 200 tris, 1 material de volume', () => {
  const sil = buildOperativeSilhouette({ vest: '#3a3f47' });
  let meshes = 0, materials = new Set();
  sil.group.traverse((o) => { if (o.isMesh) { meshes++; materials.add(o.material.uuid); } });
  assert.ok(meshes <= 3, `${meshes} meshes ≤ 3`);
  assert.ok(sil.tris <= 200, `silhueta ${sil.tris} tris ≤ 200`);
  assert.ok(sil.tris >= 60, `silhueta ${sil.tris} tris — volume presente, não vazio`);
  assert.ok(materials.size <= 2, 'volume compartilha UM material (sombra pode ter outro)');
  // geometria compartilhada entre instâncias (mesmo cache do proxy)
  const sil2 = buildOperativeSilhouette({});
  assert.equal(sil.group.children[0].geometry, sil2.group.children[0].geometry, 'cápsula memoizada');
});

test('wrapper 3 níveis: visibilidade por nível e activeParts() null na silhueta', () => {
  const detail = createOperative({ variant: 'onith' });
  const proxy = buildOperativeProxy({ vest: '#3a3f47' });
  const sil = buildOperativeSilhouette({ vest: '#3a3f47' });
  const lod = createCharacterLOD(detail, proxy, sil, { tier: 'high' });
  lod.update(5);
  assert.equal(lod.level, 'full');
  assert.ok(detail.group.visible && !proxy.group.visible && !sil.group.visible);
  assert.equal(lod.activeParts(), detail.parts);
  lod.update(60);
  assert.equal(lod.level, 'proxy');
  assert.ok(!detail.group.visible && proxy.group.visible && !sil.group.visible);
  assert.equal(lod.activeParts(), proxy.parts);
  lod.update(120);
  assert.equal(lod.level, 'silhouette');
  assert.ok(!detail.group.visible && !proxy.group.visible && sil.group.visible, 'só a silhueta desenha');
  assert.equal(lod.activeParts(), null, 'nada para animar a >80 m');
  assert.ok(lod.group.visible, 'ator ainda desenhado (não confundir com hidden)');
  lod.update(400);
  assert.equal(lod.level, 'hidden');
  assert.ok(!lod.group.visible);
  lod.update(10);
  assert.equal(lod.level, 'full', 'histerese do hidden devolve full perto');
});

test('wrapper legado (2 níveis): createCharacterLOD(detail, proxy, { tier }) segue sem silhueta', () => {
  const detail = createOperative({ variant: 'zheers' });
  const proxy = buildOperativeProxy({});
  const lod = createCharacterLOD(detail, proxy, { tier: 'high' });
  lod.update(120); // estaria na silhueta com 3 níveis
  assert.equal(lod.level, 'proxy', 'sem silhueta o proxy cobre até o cull');
  assert.equal(lod.activeParts(), proxy.parts);
  assert.equal(lod.silhouetteParts, null);
  lod.update(400);
  assert.equal(lod.level, 'hidden');
});

test('arma anexada à raiz permanece visível no nível silhueta', () => {
  const detail = createOperative({ variant: 'onith' });
  const proxy = buildOperativeProxy({});
  const sil = buildOperativeSilhouette({});
  const lod = createCharacterLOD(detail, proxy, sil, { tier: 'high' });
  const weapon = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .8));
  lod.group.add(weapon); // attachWeapon anexa à raiz (fora dos grupos de nível)
  lod.update(120);
  assert.equal(lod.level, 'silhouette');
  assert.ok(lod.group.visible, 'raiz visível → arma visível junto');
});

test('rotação de morte na RAIZ alcança a silhueta (ragdoll fake por torque)', () => {
  const detail = createOperative({ variant: 'onith' });
  const proxy = buildOperativeProxy({});
  const sil = buildOperativeSilhouette({});
  const lod = createCharacterLOD(detail, proxy, sil, { tier: 'high' });
  lod.update(120); // nível silhueta
  lod.group.updateMatrixWorld(true);
  const world = new THREE.Vector3();
  sil.group.children[0].getWorldPosition(world);
  lod.group.rotation.order = 'YXZ';
  lod.group.rotation.x = 1.3; // queda de costas
  lod.group.updateMatrixWorld(true);
  const after = new THREE.Vector3();
  sil.group.children[0].getWorldPosition(after);
  assert.notDeepEqual([world.x, world.y, world.z], [after.x, after.y, after.z],
    'tombou: volume da silhueta se moveu com a rotação da raiz');
});
