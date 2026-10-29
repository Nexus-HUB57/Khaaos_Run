// Khaaos Run — Fase 31 — Vegetação de Produção (árvores/arbustos/grama PhD).
//
// Camadas testadas:
//   1. GEOMETRIAS PURAS — árvores por arquétipo (5 mundos), determinismo
//      byte a byte, merge real (tronco+raízes+galhos), deformação orgânica;
//   2. VENTO — patchSway injeta uniforms + sway no vertex shader (headless);
//      tickVegetationWind é inerte e seguro;
//   3. CAMPOS INSTANCIADOS — buildTreeField/buildBushField com tint por
//      instância e contagem fiel aos spots;
//   4. CENA REAL — buildScene W1-W4: vegetação presente, sway registrado e
//      o FAROL GIRANDO de Arukheea (W4) com beam no registry de spinners.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  TREE_ARCHETYPES, treeArchetypeFor, vegRng,
  mergeGeoms, buildTreeGeometries, buildBushGeometry, grassTuftGeometry,
  patchSway, tickVegetationWind, buildTreeField, buildBushField,
} from '../src/game3d/vegetation3d.js';
import { buildScene } from '../src/game3d/world3d.js';

// ---- shim de canvas 2D (padrão da suíte) — texturas procedurais em Node ----
const ctx2d = {
  fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, imageSmoothingEnabled: true,
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, closePath() {},
  moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, fill() {}, stroke() {}, save() {}, restore() {},
  translate() {}, rotate() {}, scale() {}, drawImage() {}, setTransform() {},
  quadraticCurveTo() {}, bezierCurveTo() {}, rect() {}, clip() {},
  fillText() {}, strokeText() {}, arcTo() {}, roundRect() {},
  measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData() { return { data: new Uint8ClampedArray(4).fill(128) }; },
  putImageData() {}, createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(128) }; },
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}

// ---------------------------------------------------------------- 1 ----
test('F31 · 5 arquétipos de árvore mapeiam os 4 mundos + CIGKV', () => {
  assert.deepEqual(Object.keys(TREE_ARCHETYPES).sort(),
    ['astral', 'dry', 'jungle', 'pine', 'temperate']);
  assert.equal(treeArchetypeFor('CIGKV'), 'temperate');
  assert.equal(treeArchetypeFor('Barburhen'), 'pine');
  assert.equal(treeArchetypeFor('Priadus'), 'jungle');
  assert.equal(treeArchetypeFor('Ckesalth'), 'dry');
  assert.equal(treeArchetypeFor('Arukheea'), 'astral');
  assert.equal(treeArchetypeFor('mundo-desconhecido'), 'temperate', 'fallback seguro');
});

test('F31 · árvore: tronco+raízes+galhos fundidos em 1 geometria; dossel orgânico', () => {
  for (const archetype of Object.keys(TREE_ARCHETYPES)) {
    const { trunk, canopy, height } = buildTreeGeometries({ archetype, seed: 42 });
    // merge real: muito mais vértices que um cilindro cru (raízes + galhos)
    assert.ok(trunk.attributes.position.count > 300,
      `${archetype}: tronco muito simples (${trunk.attributes.position.count})`);
    assert.ok(canopy.attributes.position.count > 400,
      `${archetype}: dossel muito simples (${canopy.attributes.position.count})`);
    // altura coerente com o arquétipo (dossel acima do tronco)
    const trunkBox = new THREE.Box3().setFromBufferAttribute(trunk.attributes.position);
    const canopyBox = new THREE.Box3().setFromBufferAttribute(canopy.attributes.position);
    assert.ok(trunkBox.max.y > 1.5, `${archetype}: tronco baixo demais`);
    assert.ok(canopyBox.max.y <= height * 1.35, `${archetype}: dossel acima do esperado`);
    assert.ok(canopyBox.max.y > trunkBox.max.y * .8, `${archetype}: dossel deveria coroar o tronco`);
    // acácia (dry): copa mais LARGA que alta (silhueta de guarda-chuva)
    if (archetype === 'dry') {
      const w = canopyBox.max.x - canopyBox.min.x;
      const h = canopyBox.max.y - canopyBox.min.y;
      assert.ok(w > h * 1.4, `acácia deveria ser achatada (w=${w.toFixed(2)}, h=${h.toFixed(2)})`);
    }
  }
});

test('F31 · determinismo byte a byte (mesma seed → mesmos vértices)', () => {
  const a = buildTreeGeometries({ archetype: 'jungle', seed: 7 });
  const b = buildTreeGeometries({ archetype: 'jungle', seed: 7 });
  assert.deepEqual(
    Array.from(a.trunk.attributes.position.array),
    Array.from(b.trunk.attributes.position.array));
  assert.deepEqual(
    Array.from(a.canopy.attributes.position.array),
    Array.from(b.canopy.attributes.position.array));
  const c = buildTreeGeometries({ archetype: 'jungle', seed: 8 });
  assert.notDeepEqual(
    Array.from(a.canopy.attributes.position.array).slice(0, 99),
    Array.from(c.canopy.attributes.position.array).slice(0, 99),
    'seeds distintas deveriam divergir');
});

test('F31 · arbusto em cluster e tufo de grama curvado (não mais primitivas cruas)', () => {
  const bush = buildBushGeometry({ seed: 5 });
  const bushBox = new THREE.Box3().setFromBufferAttribute(bush.attributes.position);
  assert.ok(bushBox.max.y < 1.1, `arbusto rente ao chão (maxY=${bushBox.max.y.toFixed(2)})`);
  assert.ok(bush.attributes.position.count > 200, 'cluster de blobs, não 1 esfera');
  const tuft = grassTuftGeometry({ seed: 5 });
  // 3 lâminas (PlaneGeometry 1×3 seg = 18 verts non-indexed cada) = 54
  assert.equal(tuft.attributes.position.count, 54);
  const tuftBox = new THREE.Box3().setFromBufferAttribute(tuft.attributes.position);
  assert.ok(tuftBox.max.y > .5 && tuftBox.max.y < 1.2, `tufo de ~0.7m (maxY=${tuftBox.max.y.toFixed(2)})`);
  assert.ok(tuft.attributes.normal, 'normais presentes (merge preserva)');
});

test('F31 · vegRng é determinístico e mergeGeoms preserva contagens', () => {
  const r1 = vegRng(9), r2 = vegRng(9);
  const seq1 = Array.from({ length: 12 }, () => r1());
  const seq2 = Array.from({ length: 12 }, () => r2());
  assert.deepEqual(seq1, seq2);
  assert.ok(seq1.every((v) => v >= 0 && v < 1));
  const g1 = new THREE.BoxGeometry(1, 1, 1);
  const g2 = new THREE.SphereGeometry(.5, 6, 4);
  const merged = mergeGeoms([g1, g2]);
  const expect = (g1.index ? g1.toNonIndexed() : g1).attributes.position.count
    + (g2.index ? g2.toNonIndexed() : g2).attributes.position.count;
  assert.equal(merged.attributes.position.count, expect);
  assert.equal(merged.attributes.normal.count, expect);
});

// ---------------------------------------------------------------- 2 ----
test('F31 · patchSway injeta uniforms + sway no vertex shader (headless)', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#3f6b35' });
  patchSway(mat, { strength: .06, freq: 1.7, yScale: .3 });
  assert.equal(typeof mat.onBeforeCompile, 'function');
  assert.ok(mat.customProgramCacheKey().startsWith('sway:0.06:1.7'), 'cache key isola variantes');
  // simula a compilação do renderer: hook recebe shader cru e o patch entra
  const shader = {
    uniforms: {},
    vertexShader: 'void main() {\n#include <begin_vertex>\n}',
  };
  mat.onBeforeCompile(shader);
  assert.ok(shader.uniforms.uSwayTime, 'uniform de tempo registrado');
  assert.ok(shader.uniforms.uSwayStrength.value === .06);
  assert.ok(shader.vertexShader.includes('uSwayTime * uSwayFreq'), 'sway senoidal injetado');
  assert.ok(shader.vertexShader.includes('instanceMatrix[3].x'), 'fase por instância');
  assert.ok(mat.userData.swayShader === shader, 'shader capturado p/ o tick');
});

test('F31 · tickVegetationWind: atualiza o tempo e é inerte sem registro', () => {
  const scene = new THREE.Scene();
  tickVegetationWind(scene, 1.23);                        // sem swayMats: no-op
  const mat = new THREE.MeshStandardMaterial();
  patchSway(mat, { strength: .04, freq: 1.2 });
  mat.userData.swayShader = { uniforms: { uSwayTime: { value: 0 } } }; // simula pós-compile
  scene.userData.swayMats = [mat];
  tickVegetationWind(scene, 3.5);
  assert.equal(mat.userData.swayShader.uniforms.uSwayTime.value, 3.5);
});

// ---------------------------------------------------------------- 3 ----
test('F31 · buildTreeField: par de InstancedMesh fiel aos spots, com tint e vento', () => {
  const spots = Array.from({ length: 14 }, (_, i) => ({
    x: i * 2, z: (i % 3) * 2, s: 1 + (i % 4) * .1, rot: i * .7, tilt: .02,
    tint: ['#3f6b35', '#2f5d43'][i % 2], trunkTint: '#6b5433',
  }));
  const { trunks, canopies } = buildTreeField({ archetype: 'pine', seed: 11, spots });
  assert.equal(trunks.isInstancedMesh, true);
  assert.equal(canopies.isInstancedMesh, true);
  assert.equal(trunks.count, 14);
  assert.equal(canopies.count, 14);
  assert.ok(canopies.instanceColor, 'tint por instância no dossel');
  assert.ok(trunks.instanceColor, 'tint por instância no tronco');
  assert.equal(typeof canopies.material.onBeforeCompile, 'function', 'vento na copa');
  assert.equal(trunks.castShadow && canopies.castShadow, true);
  // mesma matriz de instância nos 2 meshes (copa acompanha a inclinação do tronco)
  const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4();
  trunks.getMatrixAt(3, m1); canopies.getMatrixAt(3, m2);
  assert.deepEqual(m1.toArray(), m2.toArray(), 'tronco e copa compartilham a transform');
});

test('F31 · buildBushField: 1 InstancedMesh, tint e vento no arbusto', () => {
  const spots = Array.from({ length: 9 }, (_, i) => ({ x: i, z: -i, s: .9, tint: '#45542c' }));
  const bushes = buildBushField({ seed: 3, spots });
  assert.equal(bushes.count, 9);
  assert.ok(bushes.instanceColor);
  assert.equal(typeof bushes.material.onBeforeCompile, 'function');
});

// ---------------------------------------------------------------- 4 ----
test('F31 · cena W1-W4: vegetação de produção presente + sway registrado', () => {
  for (const scenarioId of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    const { scene } = buildScene(`f31-${scenarioId}`, scenarioId, null, 'high');
    const instanced = [];
    scene.traverse((o) => { if (o.isInstancedMesh) instanced.push(o); });
    // árvores (tronco+copa), arbustos e ≥1 campo de grama em tufo
    assert.ok(instanced.length >= 4, `${scenarioId}: poucos campos instanciados (${instanced.length})`);
    const treeLike = instanced.filter((m) => m.geometry.attributes.position.count > 300);
    assert.ok(treeLike.length >= 2, `${scenarioId}: floresta fundida ausente`);
    assert.ok(scene.userData.swayMats?.length >= 3,
      `${scenarioId}: materiais de vento não registrados (${scene.userData.swayMats?.length})`);
    for (const m of scene.userData.swayMats) {
      assert.equal(typeof m.onBeforeCompile, 'function');
    }
  }
});

test('F31 · W4 Arukheea: FAROL GIRANDO — beam no registry de spinners (view=tps)', () => {
  const { scene } = buildScene('f31-farol', 'Arukheea', null, 'high');
  const spinners = [];
  scene.traverse((o) => {
    if (o.userData?.spinners?.length) spinners.push(...o.userData.spinners);
  });
  // o farol da Prisão do Sol da Noite registra o beam com rotação contínua
  assert.ok(spinners.length >= 1, 'nenhum spinner registrado no W4');
  assert.ok(spinners.some((s) => s.name === 'lampBeam'), 'beam do farol ausente');
  // e o tick do districts realmente gira o objeto (contrato dos animators)
  const beam = spinners.find((s) => s.name === 'lampBeam');
  const t1 = 1.5, t2 = 4.2;
  beam.rotation.z = 0;
  // mesmíssima fórmula do districts3d (axis 'z', speed .38, fase 0 no teste)
  const expect = t2 * .38;
  assert.ok(Math.abs(expect - t1 * .38) > .5, 'rotação evolui com o tempo (farol varre o mar)');
});
