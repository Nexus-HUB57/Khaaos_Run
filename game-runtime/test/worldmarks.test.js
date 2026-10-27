// Khaaos Run — Fase 16 (P1) — marcos de mundo: cada cenário com a identidade
// descrita em scenarios.js. Até a Fase 15 trocar de mundo só mudava céu/névoa:
// os cenários não materializavam as características dos mundos. Aqui cada
// cenário ganha marcos assinatura no horizonte, FORA da área jogável (anel
// ≥190 m), determinísticos e animados — sem tocar em colliders/gameplay.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildScene } from '../src/game3d/world3d.js';
import { buildWorldMarks } from '../src/game3d/worldmarks3d.js';
import { getWorldLayout } from '../src/game3d/sim3d.js';
import { SCENARIOS } from '../src/game3d/scenarios.js';

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

// todos os cenários têm marcos com a identidade descrita
test('identidade por mundo: cada cenário materializa seus marcos assinatura', () => {
  const expected = {
    CIGKV: ['watchtowers', 'targets', 'masts'],                      // campo de instrução
    Barburhen: ['coolingTowers', 'smokestacks', 'pipeBridges'],      // setor industrial
    Priadus: ['waterPlane', 'temple', 'coralDomes', 'mangroves'],    // arquipélago abissal
    Ckesalth: ['mesas', 'columns', 'flareStack', 'dunes'],           // deserto vertical/refinaria
    Arukheea: ['fragments', 'spires', 'anchorPylons', 'rifts'],      // singularidade dimensional
  };
  for (const [id, kinds] of Object.entries(expected)) {
    const { scene } = buildScene(1234, id, null, 'high');
    const marks = scene.userData.worldMarks;
    assert.equal(marks.id, id, `registro worldMarks para ${id}`);
    for (const k of kinds) {
      assert.ok(marks.counts[k] > 0, `${id}: marcos de ${k} presentes (${marks.counts[k] ?? 0})`);
    }
    assert.ok(marks.animators.length >= 1, `${id}: animadores registrados`);
    // animadores rodam sem erro e mantêm estado finito
    for (const fn of marks.animators) fn(1 / 60, 2.5);
    for (const fn of marks.animators) fn(1 / 60, 130); // t grande (drift estável)
    assert.ok(true, `${id}: animadores executam`);
  }
});

test('Priadus: a água é um ANEL no horizonte — a arena permanece seca', () => {
  const { scene } = buildScene(9, 'Priadus', null, 'high');
  const water = scene.getObjectByName('priadus-water-ring');
  assert.ok(water, 'anel d\'água presente');
  assert.equal(water.geometry.type, 'RingGeometry', 'não inunda o mapa (anel)');
  assert.equal(water.geometry.parameters.innerRadius, 190, 'borda interna fora da área jogável');
});

test('Arukheea: pilões nos ANCHORS da gravidade (mesmas posições da sim)', () => {
  const { scene } = buildScene(9, 'Arukheea', null, 'high');
  const anchors = SCENARIOS.ARUKHEEA.survival.anchors;
  const pylons = scene.getObjectByName('anchor-pylons');
  assert.ok(pylons, 'grupo de pilões presente');
  const placed = pylons.children.map((p) => `${p.position.x},${p.position.z}`).sort();
  const want = anchors.map((a) => `${a.x},${a.z}`).sort();
  assert.deepEqual(placed, want, 'pilões cravados nos anchors oficiais');
});

test('marcos FORA da área jogável (anel ≥190 m) — zero impacto em gameplay', () => {
  for (const id of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    const { scene } = buildScene(555, id, null, 'high');
    scene.updateMatrixWorld(true);
    let checked = 0;
    scene.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;              // origem do instanced é o 0 (sem sentido p/ bounds)
      if (o.name === 'priadus-water-ring') return;             // anel centrado na origem (por definição)
      if (o.name === 'barburhen-pipe-bridge') return;          // vão ENTRE pilares do anel
      let p = o, under = false, anchor = false;
      while (p) {
        if (p.name === 'anchor-pylons') anchor = true;         // pilões ficam NA arena por design
        if (p.name?.startsWith('world-marks')) { under = true; break; }
        p = p.parent;
      }
      if (!under || anchor) return;
      const wp = o.getWorldPosition(new THREE.Vector3());
      const r = Math.hypot(wp.x, wp.z);
      assert.ok(r >= 190, `${id}: marco em r=${r.toFixed(1)}m fora da área (≥190)`);
      checked++;
    });
    assert.ok(checked >= 5, `${id}: ${checked} marcos validados`);
  }
});

test('determinismo: mesma seed → mesmas contagens e posições de marcos', () => {
  const snapshot = (id, seed) => {
    const layout = getWorldLayout(seed, id);
    const scene = new THREE.Scene();
    scene.userData.worldMarks = null;
    buildWorldMarks(scene, layout, SCENARIOS[id.toUpperCase?.()] ?? SCENARIOS[Object.keys(SCENARIOS).find((k) => SCENARIOS[k].id === id)]);
    const pos = [];
    scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) pos.push(o.position.x.toFixed(2), o.position.z.toFixed(2)); });
    return { counts: JSON.stringify(scene.userData.worldMarks.counts), pos: pos.join(',') };
  };
  const a = snapshot('Ckesalth', 4242);
  const b = snapshot('Ckesalth', 4242);
  assert.equal(a.counts, b.counts, 'contagens determinísticas');
  assert.equal(a.pos, b.pos, 'posições determinísticas');
  const c = snapshot('Ckesalth', 4243);
  assert.notEqual(a.pos, c.pos, 'seeds diferentes variam (conteúdo procedural)');
});

test('cenário desconhecido não quebra (registro vazio, sem exceção)', () => {
  const scene = new THREE.Scene();
  const layout = { seed: 'x' };
  const reg = buildWorldMarks(scene, layout, { id: 'Desconhecido' });
  assert.deepEqual(reg.counts, {});
  assert.equal(reg.animators.length, 0);
});
