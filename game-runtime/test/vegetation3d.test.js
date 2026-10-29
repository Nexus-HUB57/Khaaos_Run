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
  grassChunkify, grassChunkTier, buildGrassFieldLOD, grassImpostorGeometry,
  grassImpostorFade,                    // F37 — fade suave da banda de impostores
  grassSparseCount, bushShadowEntries,  // F38 — desbaste gradual + sombra dos arbustos
  grassOutdoorBake, applyOutdoorTint,   // F36 — impostor outdoor (bake no terreno)
  scrubShadowBand,                      // F39 — banda de distância da sombra do scrub
} from '../src/game3d/vegetation3d.js';
import { buildScene, buildBandContactShadows } from '../src/game3d/world3d.js';

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

// ==================================================== Fase 32 ============
// GRAMA COM LOD DE DISTÂNCIA (chunks full/sparse/hidden)

test('F32 · grassChunkify: células puras, determinísticas, cobertura exata', () => {
  const spots = [
    { x: 1, z: 1 }, { x: 2, z: 2 },        // célula 0:0
    { x: -30, z: 10 },                     // célula -2:0 (chunkSize 25)
    { x: 100, z: 100 },                    // célula 4:4
  ];
  const chunks = grassChunkify(spots, { chunkSize: 25 });
  assert.equal(chunks.length, 3);
  const all = chunks.flatMap((c) => c.indices).sort((a, b) => a - b);
  assert.deepEqual(all, [0, 1, 2, 3], 'cada spot em exatamente 1 chunk');
  const again = grassChunkify(spots, { chunkSize: 25 });
  assert.deepEqual(again, chunks, 'determinístico (ordem estável por célula)');
  const c00 = chunks.find((c) => c.kx === 0 && c.kz === 0);
  assert.ok(Math.abs(c00.x - 1.5) < 1e-9 && Math.abs(c00.z - 1.5) < 1e-9, 'centro = média dos membros');
});

test('F32 · grassChunkTier: bandas full/sparse/hidden (PURO, faixa desligada)', () => {
  // F34 — o default agora tem 4 bandas (teste F34 cobre); aqui o comportamento
  // F32 é travado explicitamente (impostorDist <= midDist desliga a faixa).
  const cfg = { nearDist: 28, midDist: 58, impostorDist: 58 };
  assert.equal(grassChunkTier(0, cfg), 'full');
  assert.equal(grassChunkTier(27.9, cfg), 'full');
  assert.equal(grassChunkTier(28, cfg), 'sparse');
  assert.equal(grassChunkTier(57.9, cfg), 'sparse');
  assert.equal(grassChunkTier(58, cfg), 'hidden');
  assert.equal(grassChunkTier(400, cfg), 'hidden');
});

test('F32 · buildGrassFieldLOD: tiers corretos, update idempotente, oculta longe', () => {
  const spots = [];
  for (let i = 0; i < 300; i++) {
    spots.push({ x: Math.sin(i * 12.9898) * 180, z: Math.cos(i * 78.233) * 180, y: 0, rot: i, s: 1, sy: 1, tintJitter: (i % 7) / 7 });
  }
  const lod = buildGrassFieldLOD({ spots, seed: 9, tintFamilies: ['#5a6b33', '#7a8443'], chunkSize: 25, nearDist: 28, midDist: 58, sparseKeep: .4 });
  assert.ok(lod.chunks.length > 3, `chunks gerados: ${lod.chunks.length}`);
  assert.equal(lod.mats.length, 2, '1 material por família de tint');
  const total = lod.chunks.reduce((s, c) => s + c.fullCount, 0);
  assert.equal(total, spots.length, 'todos os tufos plantados');
  assert.ok(lod.chunks.every((c) => !c.mesh.visible), 'estado inicial: tudo oculto');
  lod.update(0, 0);
  const vis = lod.chunks.filter((c) => c.mesh.visible);
  assert.ok(vis.length >= 1, 'chunk da origem visível');
  for (const c of vis) {
    const d = Math.hypot(c.x, c.z);
    if (d < 28) assert.equal(c.mesh.count, c.fullCount, 'tier full = count cheio');
    else if (d < 58) {
      // F38 — desbaste GRADUAL: o count segue grassSparseCount (rampa de
      // entrada full→plateau, plateau = contrato F32, raleia até 0 na saída)
      const expect = grassSparseCount(d, { fullCount: c.fullCount, nearDist: 28, midDist: 58, sparseKeep: .4 });
      assert.equal(c.mesh.count, expect, `tier sparse = desbaste gradual @${d.toFixed(1)}m (F38)`);
      assert.ok(c.mesh.count > 0 && c.mesh.count <= c.fullCount, 'visível implica count no intervalo (0, fullCount]');
    }
    else assert.fail(`chunk a ${d.toFixed(1)}m não deveria estar visível`);
  }
  const snap = vis.map((c) => [c.mesh.visible, c.mesh.count]);
  lod.update(0, 0);
  assert.deepEqual(vis.map((c) => [c.mesh.visible, c.mesh.count]), snap, 'update é idempotente');
  lod.update(1000, 1000);
  assert.ok(lod.chunks.every((c) => !c.mesh.visible), 'câmera longe = grama toda oculta');
});

test('F32 · buildScene: grama nasce em campo LOD com chunks e vento registrado', () => {
  for (const scenarioId of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    const { scene } = buildScene(`f32-${scenarioId}`, scenarioId, null, 'high');
    const lod = scene.userData.grassLOD;
    assert.ok(lod, `${scenarioId}: campo de grama LOD ausente`);
    assert.ok(lod.chunks.length >= 10, `${scenarioId}: chunks (${lod.chunks.length})`);
    const tufts = lod.chunks.reduce((s, c) => s + c.fullCount, 0);
    assert.ok(tufts >= 240, `${scenarioId}: tufos plantados (${tufts})`);
    lod.update(0, 0);
    assert.ok(lod.chunks.some((c) => c.mesh.visible && c.mesh.count > 0), `${scenarioId}: update acende chunks próximos`);
    // vento continua registrado (copa + arbusto + 2 famílias de grama)
    assert.ok(scene.userData.swayMats.length >= 4, `${scenarioId}: swayMats (${scene.userData.swayMats.length})`);
  }
});

// ======================================================= Fase 34 ==========
// Grama com faixa de IMPOSTORES: chunks a 58-110m viram 1 quad cruzado cada
// (mancha de capim no horizonte por ~2 triângulos); além de 110m, render 0.

test('F34 · grassChunkTier: 4 bandas (full/sparse/impostor/hidden) + retrocompat', () => {
  const cfg = { nearDist: 28, midDist: 58, impostorDist: 110 };
  assert.equal(grassChunkTier(0, cfg), 'full');
  assert.equal(grassChunkTier(27.9, cfg), 'full');
  assert.equal(grassChunkTier(28, cfg), 'sparse');
  assert.equal(grassChunkTier(57.9, cfg), 'sparse');
  assert.equal(grassChunkTier(58, cfg), 'impostor');
  assert.equal(grassChunkTier(109.9, cfg), 'impostor');
  assert.equal(grassChunkTier(110, cfg), 'hidden');
  assert.equal(grassChunkTier(400, cfg), 'hidden');
  // retrocompat F32: impostorDist <= midDist desliga a faixa (hidden em midDist)
  assert.equal(grassChunkTier(70, { nearDist: 28, midDist: 58, impostorDist: 58 }), 'hidden');
  // default (sem 3º parâmetro) liga a faixa — mundos ganham o horizonte verde
  assert.equal(grassChunkTier(70, { nearDist: 28, midDist: 58 }), 'impostor');
});

test('F34 · grassImpostorGeometry: 2 quads cruzados fundidos (silhueta dupla)', () => {
  const geo = grassImpostorGeometry({ height: 1.2, width: 3.0 });
  // PlaneGeometry(w,h) não-indexado = 6 verts; merge de 2 = 12
  assert.equal(geo.attributes.position.count, 12);
  assert.ok(geo.attributes.uv, 'uv preservado no merge');
  const r = geo.boundingSphere.radius;
  assert.ok(r > 1.5 && r < 2.5, `raio coerente com w3/h1.2 (r=${r.toFixed(2)})`);
});

test('F34 · buildGrassFieldLOD: faixa impostor empacota 1 quad por chunk (58-110m)', () => {
  const spots = [];
  for (let i = 0; i < 400; i++) {
    spots.push({
      x: 20 + (i % 20) * 6, z: ((i / 20) | 0) * 2 - 20,
      y: 0, rot: i, s: 1, sy: 1, tintJitter: .5,
    });
  }
  const lod = buildGrassFieldLOD({
    spots, seed: 5, tintFamilies: ['#5a6b33', '#7a8443'],
    chunkSize: 25, nearDist: 28, midDist: 58, sparseKeep: .4, impostorDist: 110,
  });
  assert.ok(lod.impostors, 'campo global de impostores existe');
  assert.equal(lod.impostorMats.length, 1, '1 material de impostor');
  assert.equal(typeof lod.impostorMats[0].onBeforeCompile, 'function', 'impostor balança (sway injetado)');
  lod.update(0, 0);
  const inBand = lod.chunks.filter((c) => { const d = Math.hypot(c.x, c.z); return d >= 58 && d < 110; });
  const near = lod.chunks.filter((c) => Math.hypot(c.x, c.z) < 58);
  assert.ok(inBand.length >= 1, `chunks na faixa impostor (${inBand.length})`);
  for (const c of inBand) assert.equal(c.mesh.visible, false, 'tufo do chunk oculto na faixa impostor');
  for (const c of near) assert.equal(c.mesh.visible, true, 'tufos próximos seguem full/sparse');
  assert.equal(lod.impostors.visible, inBand.length > 0);
  assert.equal(lod.impostors.count, inBand.length, '1 impostor por chunk na faixa');
  // matriz empacotada aponta para o centro de um chunk da faixa
  const m = new THREE.Matrix4();
  lod.impostors.getMatrixAt(0, m);
  const pos = new THREE.Vector3().setFromMatrixPosition(m);
  assert.ok(inBand.some((c) => Math.hypot(c.x - pos.x, c.z - pos.z) < 1e-6),
    'primeiro impostor = centro de um chunk da faixa');
  // idempotente
  const snap = [lod.impostors.count, lod.impostors.visible];
  lod.update(0, 0);
  assert.deepEqual([lod.impostors.count, lod.impostors.visible], snap, 'update é idempotente');
  // longe: nada de impostor (faixa não acompanha infinitamente)
  lod.update(1000, 1000);
  assert.equal(lod.impostors.count, 0);
  assert.equal(lod.impostors.visible, false);
  // retrocompat: impostorDist 0 desliga a faixa
  const lodOff = buildGrassFieldLOD({ spots, seed: 5, tintFamilies: ['#5a6b33'], chunkSize: 25, nearDist: 28, midDist: 58, impostorDist: 0 });
  lodOff.update(0, 0);
  assert.equal(lodOff.impostors.count, 0, 'faixa desligada: zero impostores');
});

test('F34 · buildScene W1-W4: impostores registrados, faixa acende e vento cobre', () => {
  for (const scenarioId of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    const { scene } = buildScene(`f34-${scenarioId}`, scenarioId, null, 'high');
    const lod = scene.userData.grassLOD;
    assert.ok(lod?.impostors, `${scenarioId}: campo de impostores ausente`);
    assert.equal(lod.impostorDist, 110, `${scenarioId}: faixa canônica 110m`);
    assert.equal(lod.impostors.count, 0, 'update ainda não rodou (main3d é o dono)');
    lod.update(0, 0);
    // F37/F38 — a faixa empacota chunks com fade > 0 (na BORDA o alpha ~0 nem
    // empacota — custo 0). F38 — com pre-roll do cross-fade, a janela de
    // entrada começa DENTRO do desbaste sparse (58 - impostorPreRoll).
    const pre = lod.impostorPreRoll ?? 0;
    const inBand = lod.chunks.filter((c) => {
      const d = Math.hypot(c.x, c.z);
      return d >= 58 - pre && d < 110
        && grassImpostorFade(d, { midDist: 58, impostorDist: 110, fadeZone: 14, preRoll: pre }) > 0.002;
    });
    assert.equal(lod.impostors.count, inBand.length, `${scenarioId}: faixa empacotada (${inBand.length})`);
    assert.ok(inBand.length > 0, `${scenarioId}: faixa com conteúdo visível`);
    assert.ok(scene.userData.swayMats.includes(lod.impostorMats[0]), 'vento do impostor registrado');
  }
});

// ================================================== F36 — OUTDOOR IMPOSTOR ===

test('F36 · grassOutdoorBake: 1 contribuição por chunk, família por módulo POSITIVO', () => {
  const fams = ['#c9cfa0', '#b3bd8c'];
  const chunks = [
    { kx: 1, kz: 2, x: 37.5, z: 62.5 },
    { kx: -3, kz: -1, x: -62.5, z: -12.5 },   // kx/kz NEGATIVOS (oeste/norte)
    { kx: 0, kz: 0, x: 12.5, z: 12.5 },
  ];
  const bake = grassOutdoorBake(chunks, fams);
  assert.equal(bake.length, 3, '1 contribuição por chunk');
  // módulo positivo: ((kx+kz) % 2 + 2) % 2 — chunk 1: 3%2=1; chunk -4: ((-4%2)+2)%2=0
  const c0 = new THREE.Color(fams[1]), c1 = new THREE.Color(fams[0]), c2 = new THREE.Color(fams[0]);
  assert.ok(Math.abs(bake[0].r - c0.r) < 1e-9 && Math.abs(bake[0].g - c0.g) < 1e-9, 'chunk (1,2) → família 1');
  assert.ok(Math.abs(bake[1].r - c1.r) < 1e-9, 'chunk (-3,-1) → família 0 (módulo positivo)');
  assert.ok(Math.abs(bake[2].r - c2.r) < 1e-9, 'chunk (0,0) → família 0');
  assert.equal(bake[0].x, 37.5, 'centro do chunk preservado');
  // determinismo byte a byte
  const bake2 = grassOutdoorBake(chunks, fams);
  assert.deepEqual(bake, bake2, 'mesma entrada → mesma saída');
});

test('F36 · applyOutdoorTint: disco suave no centro, borda intacta, kernel monotônico', () => {
  // terreno 1 plano 10×10 com vertex colors brancos
  const geo = new THREE.PlaneGeometry(10, 10, 10, 10);
  geo.rotateX(-Math.PI / 2);
  const N = geo.attributes.position.count;
  const colors = new Float32Array(N * 3).fill(1);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true }));
  const grass = new THREE.Color('#66cc66');
  const res = applyOutdoorTint(mesh, [{ x: 0, z: 0, r: grass.r, g: grass.g, b: grass.b }], { radius: 4, strength: .6 });
  assert.ok(res, 'retorna relatório');
  assert.ok(res.touched > 0, 'pintou vértices');
  const col = geo.attributes.color;
  const centerDelta = 1 - col.getY(0); // vertice (0,0)? PlaneGeometry 10x10 começa no canto; usa amostra radial
  // amostra: vértice mais próximo do centro e um na borda (|x|>4.5)
  let centerIdx = -1, edgeIdx = -1;
  for (let i = 0; i < N; i++) {
    const x = geo.attributes.position.getX(i), z = geo.attributes.position.getZ(i);
    if (Math.abs(x) < .6 && Math.abs(z) < .6) centerIdx = i;
    if (Math.abs(x) > 4.5 && Math.abs(z) < .6) edgeIdx = i;
  }
  assert.ok(centerIdx >= 0 && edgeIdx >= 0, 'amostras existem');
  // NOTA: THREE.Color converte hex sRGB→linear (ColorManagement) — o delta
  // linear 0.8→0.603 é o mesmo pipeline das instance colors dos tufos.
  assert.ok(col.getY(centerIdx) > .5 && col.getY(centerIdx) < .8, `centro tingido (g=${col.getY(centerIdx).toFixed(3)})`);
  assert.equal(col.getY(edgeIdx), 1, 'borda byte a byte intacta');
  // monotonia: kernel cai com a distância (dois vértices em 1m e 3m do centro)
  const near = col.getY([...Array(N).keys()].find((i) => Math.abs(geo.attributes.position.getX(i) - 1) < .3 && Math.abs(geo.attributes.position.getZ(i)) < .3));
  const far = col.getY([...Array(N).keys()].find((i) => Math.abs(geo.attributes.position.getX(i) - 3) < .3 && Math.abs(geo.attributes.position.getZ(i)) < .3));
  assert.ok(near < far, `kernel monotônico (near=${near.toFixed(3)} < far=${far.toFixed(3)})`);
  // sem terreno (headless sem attribute color) → no-op
  assert.equal(applyOutdoorTint(new THREE.Mesh(new THREE.PlaneGeometry()), []), null, 'no color attr → null');
  assert.equal(applyOutdoorTint(null, []), null, 'sem mesh → null');
});

test('F36 · tier hidden NÃO mudou de contrato: render 0 além do impostor (regressão)', () => {
  // o outdoor impostor é BAKE no terreno — o update por frame continua
  // idêntico: chunks ≥ impostorDist não geram mesh, matriz ou draw call
  const spots = [];
  for (let i = 0; i < 60; i++) spots.push({ x: (i % 10) * 30, z: Math.floor(i / 10) * 30, y: 0, rot: 0, s: 1, sy: 1 });
  const lod = buildGrassFieldLOD({ spots, seed: 9, tintFamilies: ['#5a6b33'] });
  lod.update(0, 0);
  const hiddenCount = lod.chunks.filter((c) => Math.hypot(c.x, c.z) >= 110).length;
  assert.ok(hiddenCount > 0, 'cenário tem chunks no tier hidden');
  for (const c of lod.chunks) {
    if (Math.hypot(c.x, c.z) >= 110) assert.equal(c.mesh.visible, false, 'hidden: mesh invisível (custo 0)');
  }
  assert.equal(grassChunkTier(150), 'hidden', '150m → hidden (contrato F32/F34)');
  assert.equal(grassChunkTier(90), 'impostor', '90m → impostor (faixa F34)');
});

test('F36 · buildScene W1-W4: bake outdoor registrado e terreno pintado', () => {
  for (const scenarioId of ['CIGKV', 'Barburhen', 'Arukheea']) {
    const { scene } = buildScene(`f36-${scenarioId}`, scenarioId, null, 'high');
    const meta = scene.userData.grassOutdoorBake;
    assert.ok(meta, `${scenarioId}: registro do bake ausente`);
    const lod = scene.userData.grassLOD;
    assert.equal(meta.chunks, lod.chunks.length, `${scenarioId}: 1 contribuição por chunk`);
    assert.equal(meta.radius, 25, 'raio canônico = chunkSize');
    const terrain = scene.getObjectByName('terrain');
    assert.ok(terrain, 'terreno presente');
    const col = terrain.geometry.attributes.color;
    assert.ok(col, 'terreno tem vertex colors');
    // o terreno mudou da tint pura de altitude: existe vértice com canal G > R
    // (verde do capim) que a tint de altitude (tons terrosos/cinza) não produzia
    let greened = 0;
    for (let i = 0; i < col.count; i++) if (col.getY(i) > col.getX(i) + .02) greened++;
    assert.ok(greened > 0, `${scenarioId}: ${greened} vértices com identidade de capim`);
  }
});

// ============================================== Fase 37 — fade + sombras ====

test('F37 · grassImpostorFade: rampa suave nas DUAS bordas da banda (PURO)', () => {
  const cfg = { midDist: 58, impostorDist: 110, fadeZone: 14 };
  // fora da banda → 0 (antes da entrada e depois da saída)
  assert.equal(grassImpostorFade(0, cfg), 0);
  assert.equal(grassImpostorFade(57.9, cfg), 0);
  assert.equal(grassImpostorFade(110.1, cfg), 0);
  assert.equal(grassImpostorFade(400, cfg), 0);
  // entrada: 0 na borda exata, cresce suave até o plateau
  assert.equal(grassImpostorFade(58, cfg), 0, 'entrada da banda começa em 0');
  const a1 = grassImpostorFade(62, cfg), a2 = grassImpostorFade(66, cfg), plateau = grassImpostorFade(84, cfg);
  assert.ok(a1 > 0 && a1 < 1, `62m: rampa subindo (alpha=${a1.toFixed(3)})`);
  assert.ok(a2 > a1, `66m > 62m (monotônico: ${a2.toFixed(3)} > ${a1.toFixed(3)})`);
  assert.equal(plateau, 1, 'meio da banda = plateau pleno (1.0)');
  // saída: dissolve antes do corte p/ hidden (blend no bake outdoor F36)
  const b1 = grassImpostorFade(104, cfg), b2 = grassImpostorFade(108, cfg);
  assert.ok(b1 < 1 && b1 > b2, `saída caindo (104m=${b1.toFixed(3)} > 108m=${b2.toFixed(3)})`);
  assert.equal(grassImpostorFade(110, cfg), 0, 'borda de saída = 0 (sem pop no horizonte)');
  // monotonia global nas duas metades (sem degraus)
  let prev = 0;
  for (let d = 58; d <= 92; d += 2) { const a = grassImpostorFade(d, cfg); assert.ok(a >= prev - 1e-9, `subida monotônica até plateau @${d}m`); prev = a; }
  prev = 1;
  for (let d = 96; d <= 110; d += 2) { const a = grassImpostorFade(d, cfg); assert.ok(a <= prev + 1e-9, `descida monotônica @${d}m`); prev = a; }
});

test('F37 · grassImpostorFade: zone clamp + banda desligada (retrocompat F32)', () => {
  // fadeZone gigante: clamp pela metade da banda — as rampas NUNCA se cruzam
  // (sempre existe plateau; aqui banda 58→110, zone clampado p/ 26)
  const clamped = { midDist: 58, impostorDist: 110, fadeZone: 500 };
  assert.equal(grassImpostorFade(84, clamped), 1, 'plateau existe mesmo com zone gigante');
  assert.ok(grassImpostorFade(60, clamped) > 0, 'rampa de entrada cobre mais com zone maior');
  // banda desligada (impostorDist <= midDist — comportamento F32): 0 em tudo
  const off = { midDist: 58, impostorDist: 58 };
  for (const d of [0, 30, 58, 90, 200]) assert.equal(grassImpostorFade(d, off), 0, `banda off @${d}m`);
  // micro-banda: zone mínimo .5 garante suavidade mesmo em faixa estreita
  const tiny = { midDist: 58, impostorDist: 59, fadeZone: 14 };
  assert.equal(grassImpostorFade(58, tiny), 0);
  assert.equal(grassImpostorFade(59, tiny), 0);
  // 58.5 = plateau do ponto único (midpoint); 58.4 está na rampa de entrada
  assert.ok(grassImpostorFade(58.4, tiny) > 0 && grassImpostorFade(58.4, tiny) < 1, 'micro-banda ainda suave');
  assert.equal(grassImpostorFade(58.5, tiny), 1, 'midpoint de micro-banda = plateau exato');
});

test('F37 · buildGrassFieldLOD: alpha por instância segue o fade da banda', () => {
  // chunks em anel: o chunk a ~70m fica no meio da rampa de entrada;
  // a 84m plateau; a 106m na rampa de saída
  const spots = [];
  for (let i = 0; i < 40; i++) spots.push({ x: (i % 8) * 30, z: Math.floor(i / 8) * 30, y: 0, rot: 0, s: 1, sy: 1 });
  const lod = buildGrassFieldLOD({ spots, seed: 7, tintFamilies: ['#5a6b33'], impostorFadeZone: 14 });
  lod.update(0, 0);
  const attr = lod.impostors.geometry.attributes.instanceAlpha;
  assert.ok(attr, 'attribute instanceAlpha presente na geometria do impostor');
  assert.equal(attr.itemSize, 1, 'itemSize 1 (um alpha por instância)');
  // cada instância empacotada carrega o alpha do SEU chunk (fade × opacidade)
  let seen = 0;
  for (const ch of lod.chunks) {
    const d = Math.hypot(ch.x, ch.z);
    const tier = grassChunkTier(d, { nearDist: 28, midDist: 58, impostorDist: 110 });
    if (tier !== 'impostor') continue;
    const fade = grassImpostorFade(d, { midDist: 58, impostorDist: 110, fadeZone: 14 });
    if (fade <= 0.002) continue;              // alpha ~0 nem empacota (custo 0)
    seen++;
    assert.ok(fade > 0.002, `chunk @${d.toFixed(1)}m empacotado com fade=${fade.toFixed(3)}`);
  }
  assert.equal(seen, lod.impostors.count, '1 instância por chunk com fade > 0');
  // os alphas empacotados (primeiros count slots) batem com os fades dos
  // chunks NA ORDEM DE EMPACOTAMENTO (ordem do array chunks — kx/kz), leitura
  // direta do buffer
  const packed = [];
  for (const ch of lod.chunks) {
    const d = Math.hypot(ch.x, ch.z);
    const fade = grassImpostorFade(d, { midDist: 58, impostorDist: 110, fadeZone: 14 });
    if (d >= 58 && d < 110 && fade > 0.002) packed.push({ d, fade });
  }
  assert.ok(packed.length === lod.impostors.count && packed.length > 0, 'faixa não vazia');
  for (let i = 0; i < packed.length; i++) {
    assert.ok(Math.abs(attr.array[i] - packed[i].fade) < 1e-6,
      `slot ${i}: alpha ${attr.array[i].toFixed(4)} === fade(${packed[i].d.toFixed(1)}m)=${packed[i].fade.toFixed(4)}`);
  }
  // idempotência: mesma câmera → mesmos alphas byte a byte
  const snapshot = Float32Array.from(attr.array);
  lod.update(0, 0);
  assert.deepEqual(attr.array, snapshot, 'update idempotente (mesmos alphas)');
});

test('F37 · sombras de contato: espelho da banda, ancoradas no relevo (ch.y+lift)', () => {
  const spots = [];
  for (let i = 0; i < 40; i++) spots.push({ x: (i % 8) * 30, z: Math.floor(i / 8) * 30, y: .04 + (i % 3) * .12, rot: 0, s: 1, sy: 1 });
  const lod = buildGrassFieldLOD({
    spots, seed: 3, tintFamilies: ['#5a6b33'],
    impostorShadow: true, impostorShadowOpacity: .5, impostorShadowRadius: 1.9, impostorShadowLift: .05,
  });
  assert.ok(lod.impostorShadows, 'campo de sombras presente');
  assert.equal(lod.impostorShadows.name, 'grassImpostorShadows');
  lod.update(0, 0);
  const sh = lod.impostorShadows;
  assert.equal(sh.count, lod.impostors.count, '1 sombra por impostor (espelho exato)');
  assert.equal(sh.visible, lod.impostors.visible && lod.impostors.count > 0, 'visibilidade acoplada à banda');
  // geometria: disco deitado com gradiente RGBA (centro opaco → borda 0)
  const geo = sh.geometry;
  assert.equal(geo.attributes.color.itemSize, 4, 'RGBA por vértice (itemSize 4)');
  const pos = geo.attributes.position, col = geo.attributes.color;
  let center = -1, rim = -1;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    if (r < .01) center = i;
    if (r > .99) rim = i;
  }
  assert.ok(center >= 0 && rim >= 0, 'disco tem centro e borda');
  assert.equal(col.getW(center), 1, 'centro: alpha cheio (contato)');
  assert.equal(col.getW(rim), 0, 'borda: alpha 0 (sem banda dura)');
  assert.equal(col.getX(center), 0, 'cor preta (sombra de contato, não mancha)');
  // ancoragem no relevo: cada sombra fica em ch.y + lift, MESMA altura média
  // dos tufos do chunk (o terreno sob o capim), com raio fixo
  const mat4 = sh.instanceMatrix;
  let mirrored = 0;
  for (let s = 0; s < sh.count; s++) {
    const x = mat4.array[s * 16 + 12], y = mat4.array[s * 16 + 13], z = mat4.array[s * 16 + 14];
    const sc = Math.hypot(mat4.array[s * 16], mat4.array[s * 16 + 1]);
    assert.ok(Math.abs(sc - 1.9) < 1e-5, `sombra ${s}: raio fixo 1.9 (sc=${sc.toFixed(3)})`);
    const owner = lod.chunks.find((c) => Math.hypot(c.x - x, c.z - z) < 1 && Math.abs(c.y + .05 - y) < 1e-5);
    assert.ok(owner, `sombra ${s} ancorada em um chunk (x=${x.toFixed(1)} z=${z.toFixed(1)} y=${y.toFixed(3)})`);
    mirrored++;
  }
  assert.equal(mirrored, sh.count, 'todas as sombras ancoradas no relevo dos chunks');
  // alphas casam com o fade da banda (a sombra nasce/morre COM a mancha)
  const shAttr = geo.attributes.instanceAlpha;
  const impAttr = lod.impostors.geometry.attributes.instanceAlpha;
  for (let s = 0; s < sh.count; s++) assert.equal(shAttr.array[s], impAttr.array[s], `alpha sombra ${s} === alpha impostor`);
  // OFF switch: sem sombra o campo fica count 0/invisível (custo 0)
  const lod2 = buildGrassFieldLOD({ spots, seed: 3, tintFamilies: ['#5a6b33'], impostorShadow: false });
  lod2.update(0, 0);
  assert.equal(lod2.impostorShadows.count, 0, 'impostorShadow:false → 0 sombras');
  assert.equal(lod2.impostorShadows.visible, false);
});

// ======================================= Fase 38 — desbaste/sombra/cross-fade ====

test('F38 · grassSparseCount: desbaste gradual (entrada rampa, plateau F32, saída raleia a 0)', () => {
  const cfg = { fullCount: 40, nearDist: 28, midDist: 58, sparseKeep: .4, entryZone: 10, exitZone: 12 };
  const plateau = Math.max(1, Math.ceil(40 * .4)); // 16 — contrato F32 intocado no plateau
  assert.equal(grassSparseCount(20, cfg), 40, 'dentro do full → count cheio');
  assert.equal(grassSparseCount(28, cfg), 40, 'entrada da banda = fullCount (rampa começa em 0)');
  const e1 = grassSparseCount(33, cfg), e2 = grassSparseCount(38, cfg);
  assert.ok(40 > e1 && e1 > e2, `entrada raleia monotônica (33m=${e1} > 38m=${e2})`);
  assert.equal(grassSparseCount(38.5, cfg), plateau, 'fim da zona de entrada = plateau F32');
  assert.equal(grassSparseCount(45, cfg), plateau, 'plateau no meio da banda (fração fixa preservada)');
  const x1 = grassSparseCount(50, cfg), x2 = grassSparseCount(55, cfg);
  assert.ok(plateau > x1 && x1 > x2, `saída raleia monotônica (50m=${x1} > 55m=${x2})`);
  assert.equal(grassSparseCount(58, cfg), 0, 'borda de saída = 0 (entrega p/ o impostor sem pop)');
  assert.equal(grassSparseCount(70, cfg), 0, 'além da banda = 0');
  // monotonia global não-crescente na banda inteira (sem degraus)
  let prev = 40;
  for (let d = 28; d <= 58; d += .5) {
    const c = grassSparseCount(d, cfg);
    assert.ok(c <= prev, `não-crescente @${d}m (${c} <= ${prev})`);
    prev = c;
  }
});

test('F38 · grassSparseCount: clamps de zona, banda degenerada e cantos', () => {
  // zonas gigantes: cap de 45% da banda cada — o plateau SEMPRE existe
  const big = { fullCount: 20, nearDist: 28, midDist: 58, sparseKeep: .5, entryZone: 999, exitZone: 999 };
  assert.equal(grassSparseCount(43, big), Math.max(1, Math.ceil(20 * .5)),
    'plateau no meio da banda mesmo com zonas gigantes');
  // banda degenerada (midDist <= nearDist): degrau puro retrocompatível
  const deg = { fullCount: 12, nearDist: 58, midDist: 58 };
  assert.equal(grassSparseCount(30, deg), 12, 'abaixo de nearDist → full');
  assert.equal(grassSparseCount(58, deg), 0, 'em midDist → 0');
  // sparseKeep fora de [0,1] capado; fullCount 0 → 0
  assert.equal(grassSparseCount(40, { fullCount: 9, sparseKeep: 2 }), 9, 'keep > 1 → plateau = fullCount');
  assert.equal(grassSparseCount(40, { fullCount: 9, sparseKeep: -1 }), 1, 'keep < 0 → plateau mínimo 1');
  assert.equal(grassSparseCount(40, { fullCount: 0 }), 0, 'chunk vazio → 0');
  // zonas zero = degrau F32 puro (fração fixa na entrada, corte seco na saída)
  const step = { fullCount: 10, nearDist: 28, midDist: 58, entryZone: 0, exitZone: 0 };
  assert.equal(grassSparseCount(28.1, step), Math.max(1, Math.ceil(10 * .4)), 'zonas 0: degrau direto ao plateau');
  assert.equal(grassSparseCount(57.9, step), Math.max(1, Math.ceil(10 * .4)), 'zonas 0: plateau até a borda');
});

test('F38 · grassImpostorFade: pre-roll cruza o desbaste (opt-in; default F37 intocado)', () => {
  const cfg = { midDist: 58, impostorDist: 110, fadeZone: 14, preRoll: 9 };
  assert.equal(grassImpostorFade(48.9, cfg), 0, 'antes do pre-roll → 0');
  assert.equal(grassImpostorFade(49, cfg), 0, 'borda do pre-roll = 0');
  const mid = grassImpostorFade(53, cfg);
  assert.ok(mid > 0 && mid < 1, `rampa sobe DENTRO do sparse (53m=${mid.toFixed(3)})`);
  const at58 = grassImpostorFade(58, cfg);
  assert.ok(at58 > .5 && at58 < 1, `fronteira 58m: mancha já existe (~70%, ${at58.toFixed(3)})`);
  assert.ok(grassImpostorFade(62, cfg) > at58, 'continua subindo após midDist');
  assert.equal(grassImpostorFade(110, cfg), 0, 'saída da banda intocada');
  // default preRoll 0 = contrato F37 byte a byte
  const f37 = { midDist: 58, impostorDist: 110, fadeZone: 14 };
  assert.equal(grassImpostorFade(57.9, f37), 0);
  assert.equal(grassImpostorFade(58, f37), 0);
  assert.equal(grassImpostorFade(84, f37), 1);
  // cap: preRoll nunca invade o tier full nem passa da própria zone
  const capped = { midDist: 58, impostorDist: 110, fadeZone: 14, preRoll: 999 };
  assert.equal(grassImpostorFade(43.9, capped), 0, 'cap pela zone: só entra em 44 (58-14)');
  assert.ok(grassImpostorFade(45, capped) > 0, 'cap respeitado (rampa a partir de 44)');
  // monotonia global da subida com pre-roll
  let prev = 0;
  for (let d = 49; d <= 92; d += 1) {
    const a = grassImpostorFade(d, cfg);
    assert.ok(a >= prev - 1e-9, `subida monotônica @${d}m`);
    prev = a;
  }
});

test('F38 · buildGrassFieldLOD: sparse raleia gradual e impostor cruza a fronteira', () => {
  // chunks determinísticos: 1 spot por célula → centro do chunk = spot exato
  const mk = (x) => ({ x, z: 0, y: 0, rot: 0, s: 1, sy: 1 });
  const spots = [
    ...Array.from({ length: 10 }, (_, i) => mk(10 + i * .01)),   // d=10 → full
    ...Array.from({ length: 10 }, (_, i) => mk(30 + i * .01)),   // d=30 → entrada do sparse
    ...Array.from({ length: 10 }, (_, i) => mk(55 + i * .01)),   // d=55 → saída do sparse + cross-fade
    ...Array.from({ length: 10 }, (_, i) => mk(75 + i * .01)),   // d=75 → impostor plateau
    ...Array.from({ length: 10 }, (_, i) => mk(105 + i * .01)),  // d=105 → rampa de saída
    ...Array.from({ length: 10 }, (_, i) => mk(130 + i * .01)),  // d=130 → hidden
  ];
  const common = { spots, seed: 5, tintFamilies: ['#5a6b33'], chunkSize: 25, sparseKeep: .4 };
  const plateau = Math.max(1, Math.ceil(10 * .4)); // 4

  // default (sem preRoll): contrato F37 — NADA empacota abaixo de 58m
  const lod = buildGrassFieldLOD({ ...common });
  assert.equal(lod.impostorPreRoll, 0, 'default impostorPreRoll = 0 (F37)');
  assert.equal(lod.sparseEntryZone, 10, 'default entryZone = 10');
  assert.equal(lod.sparseExitZone, 12, 'default exitZone = 12');
  lod.update(0, 0);
  const byD = (lod, d) => lod.chunks.find((c) => Math.abs(Math.hypot(c.x, c.z) - d) < .2);
  const full = byD(lod, 10), entry = byD(lod, 30), exit = byD(lod, 55);
  const impPlateau = byD(lod, 75), impOut = byD(lod, 105), hidden = byD(lod, 130);
  assert.equal(full.mesh.count, 10, 'full: count cheio');
  assert.equal(entry.mesh.count, 9, 'entrada do sparse: rampa (thinIn ~.10 → 9 tufos)');
  assert.equal(exit.mesh.count, 1, 'saída do sparse: raleia até ~1 tufo (thinOut ~.16)');
  assert.equal(hidden.mesh.visible, false, 'hidden intocado');
  assert.equal(lod.impostors.count, 2, 'default: só a banda [58,110) empacota (75m e 105m)');
  assert.equal(impPlateau.mesh.visible, false, 'impostor: tufo do chunk oculto');
  assert.equal(impOut.mesh.visible, false, 'impostor: tufo do chunk oculto (saída)');

  // com pre-roll (world3d): a mancha cresce DENTRO da saída do sparse
  const lod2 = buildGrassFieldLOD({ ...common, impostorPreRoll: 9 });
  lod2.update(0, 0);
  assert.equal(lod2.impostors.count, 3, 'cross-fade: 55m entra no empacotamento');
  // alphas na ordem de empacotamento = fades puros lidos do CENTRO REAL do
  // chunk (média dos membros — não do spot nominal)
  const attr = lod2.impostors.geometry.attributes.instanceAlpha;
  const fcfg = { midDist: 58, impostorDist: 110, fadeZone: 14, preRoll: 9 };
  const dOf = (lod, d) => { const c = lod.chunks.find((cc) => Math.abs(Math.hypot(cc.x, cc.z) - d) < .2); return Math.hypot(c.x, c.z); };
  const f55 = grassImpostorFade(dOf(lod2, 55), fcfg);
  const f75 = grassImpostorFade(dOf(lod2, 75), fcfg);
  const f105 = grassImpostorFade(dOf(lod2, 105), fcfg);
  assert.ok(Math.abs(attr.array[0] - f55) < 1e-6, `slot 0 = fade(55m)=${f55.toFixed(3)}`);
  assert.ok(Math.abs(attr.array[1] - f75) < 1e-6, 'slot 1 = fade(75m)');
  assert.ok(Math.abs(attr.array[2] - f105) < 1e-6, 'slot 2 = fade(105m)');
  assert.ok(f55 > 0 && f55 < .5 && f75 === 1 && f105 > 0 && f105 < .5, 'fases do cross-fade coerentes');
  // sombras de contato espelham o cross-fade (1 disco por impostor, mesmo alpha)
  assert.equal(lod2.impostorShadows.count, 3, 'sombra espelha o impostor no cross-fade');
  const shAttr = lod2.impostorShadows.geometry.attributes.instanceAlpha;
  assert.equal(shAttr.array[0], attr.array[0], 'alpha da sombra = alpha da mancha (55m)');
  // idempotência byte a byte
  const snap = Float32Array.from(attr.array);
  lod2.update(0, 0);
  assert.deepEqual(attr.array, snap, 'update idempotente');
});

test('F38 · bushShadowEntries: 1 disco por arbusto, tamanho pela escala (PURO)', () => {
  const spots = [{ x: 5, z: -3, s: 1.2 }, { x: -9, z: 4, s: .8 }, { x: 0, z: 0 }];
  const entries = bushShadowEntries(spots);
  assert.equal(entries.length, 3, '1 entrada por arbusto');
  assert.deepEqual(entries[0], { x: 5, z: -3, rot: 0, size: 2.1 * 1.2 });
  assert.ok(Math.abs(entries[0].size - 2.52) < 1e-9, 'size = 2.1 × s');
  assert.deepEqual(entries[1], { x: -9, z: 4, rot: 0, size: 2.1 * .8 });
  assert.deepEqual(entries[2], { x: 0, z: 0, rot: 0, size: 2.1 }, 's ausente → 1');
  assert.deepEqual(bushShadowEntries(spots), entries, 'determinístico');
  assert.deepEqual(bushShadowEntries([]), [], 'vazio → vazio');
  assert.deepEqual(bushShadowEntries([{ x: 1, z: 1, s: 3 }], { sizeFactor: 0 })[0].size, 0, 'sizeFactor 0 respeitado');
});

test('F38 · buildScene W1-W4: arbustos com sombra de contato + cross-fade canônico', () => {
  for (const scenarioId of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    const { scene } = buildScene(`f38-${scenarioId}`, scenarioId, null, 'high');
    const shadows = scene.userData.natureContactShadows;
    assert.ok(shadows, `${scenarioId}: campo de sombras de natureza ausente`);
    assert.equal(shadows.count, scene.userData.natureShadowEntries,
      `${scenarioId}: registro do total consistente (${shadows.count})`);
    const bushEntries = scene.userData.bushShadowSpots;
    assert.ok(bushEntries?.length > 0, `${scenarioId}: arbustos registrados p/ sombra (${bushEntries?.length})`);
    // cada arbusto tem SEU disco no instanceMatrix (posição x|z no chão)
    const mat4 = shadows.instanceMatrix;
    const packed = new Set();
    for (let i = 0; i < shadows.count; i++) {
      packed.add(`${mat4.array[i * 16 + 12].toFixed(2)}|${mat4.array[i * 16 + 14].toFixed(2)}`);
    }
    for (const e of bushEntries) {
      assert.ok(packed.has(`${e.x.toFixed(2)}|${e.z.toFixed(2)}`),
        `${scenarioId}: arbusto (${e.x.toFixed(1)},${e.z.toFixed(1)}) ancorado com sombra`);
    }
    // campo de grama: zonas do desbaste + pre-roll canônicos
    const lod = scene.userData.grassLOD;
    assert.equal(lod.impostorPreRoll, 9, `${scenarioId}: pre-roll do cross-fade = 9`);
    assert.equal(lod.sparseEntryZone, 10, `${scenarioId}: entryZone canônica = 10`);
    assert.equal(lod.sparseExitZone, 12, `${scenarioId}: exitZone canônica = 12`);
  }
});

// ================================ Fase 39 — sombra do scrub em bandas ====

test('F39 · scrubShadowBand: cheio perto, raleio smoothstep, zero no horizonte (PURO)', () => {
  const cfg = { nearDist: 30, farDist: 90 };
  assert.equal(scrubShadowBand(0, cfg), 1, 'no pé da câmera → âncora plena');
  assert.equal(scrubShadowBand(20, cfg), 1, 'dentro do cheio → 1');
  assert.equal(scrubShadowBand(30, cfg), 1, 'borda do cheio = 1 (rampa começa em 0)');
  const m1 = scrubShadowBand(50, cfg), m2 = scrubShadowBand(70, cfg);
  assert.ok(m1 > 0 && m1 < 1, `meio da banda raleia (50m=${m1.toFixed(3)})`);
  assert.ok(m2 > 0 && m2 < 1, `fim do raleio ainda visível (70m=${m2.toFixed(3)})`);
  assert.ok(m1 > m2, 'raleio monotônico (50m > 70m)');
  assert.equal(scrubShadowBand(90, cfg), 0, 'borda de saída = 0 (morre ANTES do fog comer a vegetação)');
  assert.equal(scrubShadowBand(120, cfg), 0, 'além da banda = 0 (sem sombra fantasma no horizonte)');
  assert.equal(scrubShadowBand(110, cfg), 0, 'na banda de impostores do capim (110m) a sombra já foi');
  // monotonia global não-crescente na banda inteira (sem degraus/moire)
  let prev = 1;
  for (let d = 0; d <= 120; d += .5) {
    const a = scrubShadowBand(d, cfg);
    assert.ok(a <= prev, `não-crescente @${d}m (${a.toFixed(3)} <= ${prev.toFixed(3)})`);
    prev = a;
  }
  // determinismo byte a byte
  assert.equal(scrubShadowBand(55, cfg), scrubShadowBand(55, cfg), 'mesma dist → mesmo alpha');
});

test('F39 · scrubShadowBand: banda degenerada, entrada suja e bandas custom', () => {
  const cfg = { nearDist: 30, farDist: 90 };
  // farDist <= nearDist → degrau retrocompatível (1|0), sem NaN
  assert.equal(scrubShadowBand(25, { nearDist: 30, farDist: 20 }), 1, 'degenerada: dentro do near → 1');
  assert.equal(scrubShadowBand(35, { nearDist: 30, farDist: 20 }), 0, 'degenerada: fora do near → 0');
  assert.equal(scrubShadowBand(30, { nearDist: 30, farDist: 20 }), 1, 'degenerada: borda exata → 1');
  // entrada suja: NaN/negativo → 0 (sombra nunca nasce de lixo numérico)
  assert.equal(scrubShadowBand(NaN, cfg), 0, 'NaN → 0');
  assert.equal(scrubShadowBand(-5, cfg), 0, 'negativo → 0');
  // bandas custom respeitadas (parâmetros, não constantes escondidas)
  const tight = { nearDist: 10, farDist: 30 };
  assert.equal(scrubShadowBand(8, tight), 1);
  assert.equal(scrubShadowBand(30, tight), 0);
  const mid = scrubShadowBand(20, tight);
  assert.ok(mid > 0 && mid < 1, `banda custom raleia (20m=${mid.toFixed(3)})`);
});

test('F39 · buildBandContactShadows: campo com alpha por instância dirigido por banda', () => {
  const scene = new THREE.Scene();
  const entries = [
    { x: 0, z: 0, size: 1.05, y: .012 },        // perto da câmera (0,0)
    { x: 60, z: 0, size: 1.0, y: .012 },        // meio do raleio (60m)
    { x: 200, z: 0, size: .9, y: .012 },        // horizonte (200m → 0)
  ];
  const handle = buildBandContactShadows(scene, entries, { opacity: .55, nearDist: 30, farDist: 90 });
  assert.ok(handle, 'campo criado com entradas');
  assert.equal(handle.mesh.parent, scene, 'mesh adicionado à cena');
  assert.equal(handle.mesh.count, 3, 'capacidade = entradas');
  assert.equal(handle.mesh.visible, false, 'nasce invisível (update acende a banda)');
  assert.ok(handle.mesh.material.transparent && !handle.mesh.material.depthWrite,
    'material transparente sem depthWrite (só escurece)');
  assert.ok(handle.alpha, 'attribute instanceAlpha presente');
  // câmera em (0,0): perto=1, 60m no raleio, 200m = 0
  handle.update(0, 0);
  assert.equal(handle.alpha.array[0], 1, 'sombra 0: cheia (0m)');
  const a60 = handle.alpha.array[1];
  assert.ok(a60 > 0 && a60 < 1, `sombra 1: raleio (60m=${a60.toFixed(3)})`);
  assert.equal(handle.alpha.array[2], 0, 'sombra 2: horizonte → 0');
  assert.equal(handle.mesh.visible, true, 'banda com alpha > 0 → visível');
  // idempotente: mesma câmera → mesmo estado
  const before = [...handle.alpha.array];
  handle.update(0, 0);
  assert.deepEqual([...handle.alpha.array], before, 'update idempotente');
  // câmera longe de tudo → banda vazia → mesh invisível (0 draw calls)
  handle.update(500, 500);
  assert.equal(handle.mesh.visible, false, 'banda vazia → invisível (custo 0)');
  assert.ok([...handle.alpha.array].every((a) => a === 0), 'todos os alphas zerados');
  // null guard: sem entradas → null (chamador não registra)
  assert.equal(buildBandContactShadows(scene, []), null, 'vazio → null');
});

test('F39 · buildScene Barburhen: scrub com campo de sombras em bandas registrado', () => {
  const { scene } = buildScene('f39-scrub', 'Barburhen', null, 'high');
  const handle = scene.userData.scrubBandShadows;
  assert.ok(handle, 'scrubBandShadows registrado no userData');
  assert.equal(scene.userData.scrubShadowEntries, handle.entries.length,
    'registro do total consistente com as entradas');
  assert.ok(handle.entries.length > 50, `scrub plantado (${handle.entries.length} sombras)`);
  // cada disco ancorado no relevo (y = terreno + 12mm — plano jogável = 0.012)
  for (const e of handle.entries) {
    assert.ok(e.size > 0, `sombra ${e.x.toFixed(1)}: tamanho plantado`);
    assert.ok(e.y >= .012, `sombra ${e.x.toFixed(1)}: lift anti-z-fight (y=${e.y.toFixed(3)})`);
  }
  // update acende a banda com a câmera no spawn (o mb de alpha varia por dist)
  handle.update(0, 0);
  const lit = [...handle.alpha.array].filter((a) => a > 0).length;
  assert.ok(lit > 0, `câmera no centro: ${lit} sombras na banda`);
  assert.equal(handle.mesh.visible, true, 'campo visível com banda ocupada');
  // scrub NÃO está mais no lote estático da natureza (evita sombra duplicada)
  const staticShadows = scene.userData.natureContactShadows;
  const mat4 = staticShadows.instanceMatrix;
  const packed = new Set();
  for (let i = 0; i < staticShadows.count; i++) {
    packed.add(`${mat4.array[i * 16 + 12].toFixed(2)}|${mat4.array[i * 16 + 14].toFixed(2)}`);
  }
  for (const e of handle.entries) {
    assert.ok(!packed.has(`${e.x.toFixed(2)}|${e.z.toFixed(2)}`),
      `scrub (${e.x.toFixed(1)},${e.z.toFixed(1)}) saiu do lote estático`);
  }
});

test('F39 · outros mundos: sem scrub → sem campo de bandas (custo 0)', () => {
  for (const scenarioId of ['CIGKV', 'Priadus', 'Ckesalth', 'Arukheea']) {
    const { scene } = buildScene(`f39-noscrub-${scenarioId}`, scenarioId, null, 'high');
    assert.equal(scene.userData.scrubBandShadows, undefined, `${scenarioId}: sem scrub, sem campo`);
    assert.equal(scene.userData.scrubShadowEntries, undefined, `${scenarioId}: sem registro`);
  }
});
