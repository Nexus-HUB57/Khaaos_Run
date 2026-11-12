// Fase 34 — personagens orgânicos end to end.
// O proxy de LOD deixou de ser homem-palito (cápsulas facetadas de 5 lados,
// mochila e tronco em caixa, pés congelados) e virou MINI-OPERATIVO orgânico:
// V-taper elíptico, crânio + mandíbula + capacete, membros com deltóide/joelho/
// luva, PÉS com pivô próprio animando a passada à distância. Esta suíte fixa os
// contratos novos SEM repetir os cobertos em character-lod/character-lod2.
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

const { buildOperativeProxy, buildOperativeSilhouette, createCharacterLOD } = await import('../src/game3d/lod3d.js');
const { createOperative, animateOperative } = await import('../src/game3d/entities3d.js');

const collect = (group, fn) => { const out = []; group.traverse((o) => { if (o.isMesh && fn(o)) out.push(o); }); return out; };

test('proxy orgânico: ZERO caixas de volume (só cinto fino de gear)', () => {
  const proxy = buildOperativeProxy({});
  const boxes = collect(proxy.group, (o) => o.geometry.type === 'BoxGeometry');
  assert.ok(boxes.length >= 1, 'cinto de gear presente (âncora visual do uniforme)');
  for (const b of boxes) {
    const p = b.geometry.parameters;
    const vol = p.width * p.height * p.depth;
    assert.ok(vol <= 0.012, `nenhuma caixa grande no proxy (vol ${vol.toFixed(4)} m³ ≤ 0.012)`);
  }
});

test('proxy orgânico: geometrias curvas com segmentação suave (nada de 5 lados)', () => {
  const proxy = buildOperativeProxy({});
  const curved = collect(proxy.group, (o) => /Capsule|Sphere|Cylinder/.test(o.geometry.type));
  assert.ok(curved.length >= 20, `corpo curvo presente (${curved.length} malhas curvas)`);
  for (const m of curved) {
    const p = m.geometry.parameters;
    if (p.radialSegments != null) assert.ok(p.radialSegments >= 6, `radial ${p.radialSegments} ≥ 6 (anti-facetado)`);
    if (p.widthSegments != null) assert.ok(p.widthSegments >= 5, `width ${p.widthSegments} ≥ 5`);
  }
});

test('proxy: orçamento de draw calls (≤ 26 meshes) e pés ARTICULADOS', () => {
  const proxy = buildOperativeProxy({});
  const meshes = collect(proxy.group, () => true);
  assert.ok(meshes.length <= 26, `${meshes.length} meshes ≤ 26 (budget de draw calls)`);
  for (const k of ['legL', 'legR']) {
    assert.ok(proxy.parts[k].foot, `parts.${k}.foot existe (pivô do tornozelo)`);
    assert.equal(proxy.parts[k].foot.position.y, -.31, 'pivô do pé idêntico ao detalhado');
  }
});

test('passada à distância: pés do proxy rolam calcanhar→ponta como o detalhado', () => {
  const { parts: full } = createOperative({ variant: 'onith' });
  const { parts: low } = buildOperativeProxy({});
  animateOperative(full, { t: .83, speedNorm: 1 });
  animateOperative(low, { t: .83, speedNorm: 1 });
  assert.notEqual(low.legL.foot.rotation.x, 0, 'pé do proxy anima na passada (não congela)');
  assert.equal(
    low.legL.foot.rotation.x.toFixed(6),
    full.legL.foot.rotation.x.toFixed(6),
    'mesma transformada de junta do modelo detalhado'
  );
});

test('contra-balanço dos ombros: contrafase ao sway, determinístico e limitado', () => {
  const { parts } = createOperative({ variant: 'onith' });
  animateOperative(parts, { t: 1.37, speedNorm: .8 });
  const yR = parts.armR.shoulder.rotation.y, yL = parts.armL.shoulder.rotation.y;
  assert.equal(yR, yL, 'ombros giram juntos (contra o tronco, não entre si)');
  assert.ok(Math.abs(yR) <= .06, `amplitude discreta (|${yR.toFixed(4)}| ≤ .06)`);
  const { parts: again } = createOperative({ variant: 'onith' });
  animateOperative(again, { t: 1.37, speedNorm: .8 });
  assert.equal(again.armR.shoulder.rotation.y, yR, 'determinístico (mesmo t → mesmo ângulo)');
  // ombros do proxy seguem a MESMA animação
  const { parts: low } = buildOperativeProxy({});
  animateOperative(low, { t: 1.37, speedNorm: .8 });
  assert.equal(low.armR.shoulder.rotation.y, yR, 'proxy recebe o mesmo contra-balanço');
});

test('silhueta com taper humano: ombrelos mais largos que a profundidade', () => {
  const sil = buildOperativeSilhouette({});
  assert.ok(sil.group.children[0].scale.x > sil.group.children[0].scale.z, 'corpo: x > z (leitura frontal)');
  assert.ok(sil.group.children[1].scale.y > 1, 'crânio alongado (não bola perfeita)');
});

test('LOD completo: os 3 níveis compartilham a gramática orgânica', () => {
  const lod = createCharacterLOD(
    createOperative({ variant: 'onith' }),
    buildOperativeProxy({ vest: '#3a3f47' }),
    buildOperativeSilhouette({ vest: '#3a3f47' }),
    { tier: 'high' }
  );
  lod.update(10);
  assert.equal(lod.level, 'full');
  assert.ok(lod.detailParts.legL.foot, 'detalhado: pé articulado');
  lod.update(60);
  assert.equal(lod.level, 'proxy');
  assert.ok(lod.proxyParts.legL.foot, 'proxy: pé articulado (antes congelava)');
  lod.update(120);
  assert.equal(lod.level, 'silhouette');
});
