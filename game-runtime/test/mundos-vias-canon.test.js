// Khaaos Run — Fase 58 — VIAS CANÔNICAS POR MUNDO (divergência estradas/ruas).
//
// Diretiva: "corrigir divergências e aplicar todas as características validadas
// às descrições oficiais". O README ("Mundos Oficiais W1–W4" + Ontologia) só
// descreve AMBIENTE URBANO em CIGKV ("Khaaos Ville", campo de instrução com
// setor Urbano Denso) e W1 Barburhen (urbano pós-guerra, carros abandonados).
// W2 Priadus (selva/pântano), W3 Ckesalth (deserto) e W4 Arukheea (ilha) NÃO
// citam estradas nem ruas — a rede viária urbana que era gerada para TODOS os
// mundos (4 radiais + anel + calçadas + faixas + tráfego + props de via) era
// divergência. Esta suíte pinam o cânon para o futuro (regressão de fidelidade).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScene, centralPlazaMaterial } from '../src/game3d/world3d.js';
import {
  roadSegments, propPlacements, trafficPlacements,
  naturalDressingPlacements, hasCanonicalRoads, URBAN_WORLDS,
} from '../src/game3d/detail3d.js';
import { getWorldLayout } from '../src/game3d/sim3d.js';
import { SCENARIOS } from '../src/game3d/scenarios.js';
import { roadMaterial, sidewalkMaterial } from '../src/game3d/textures3d.js';

// stub de canvas p/ texturas procedurais headless (mesmo padrão do district-dressing)
const ctx2d = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', font: '',
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
  moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
  bezierCurveTo() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
  fillText() {}, setTransform() {}, drawImage() {},
  measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
  putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}

const URBAN = ['CIGKV', 'Barburhen'];
const NATURE = ['Priadus', 'Ckesalth', 'Arukheea'];
const SEEDS = ['khaaos-e2e', 'vias-canon-58', 'det-5831'];

test('F58 — classificação urbano/natureza cobre TODOS os mundos do catálogo', () => {
  for (const id of Object.values(SCENARIOS).map((s) => s.id)) {
    assert.equal(hasCanonicalRoads(id), URBAN_WORLDS.has(id), `${id}: classificação consistente`);
  }
  assert.deepEqual([...URBAN_WORLDS].sort(), [...URBAN].sort(), 'urbanos canônicos: CIGKV + Barburhen');
});

test('F58 — mundos de natureza NÃO geram estradas/ruas em nenhuma seed', () => {
  for (const id of NATURE) {
    for (const seed of SEEDS) {
      const layout = getWorldLayout(seed, id);
      assert.equal(layout.scenarioId, id, `${id}: layout do mundo correto`);
      assert.deepEqual(roadSegments(layout), [],
        `${id}/${seed}: nenhuma via asfaltada (cânon README)`);
    }
  }
});

test('F58 — mundos de natureza NÃO têm tráfego nem props de beira de via', () => {
  const ROAD_PROPS = new Set(['lamp', 'barrel', 'tire', 'cone', 'pallet']);
  for (const id of NATURE) {
    const layout = getWorldLayout(`f58-${id}`, id);
    assert.deepEqual(trafficPlacements(layout), [],
      `${id}: sem carros/vans abandonados (cânon não descreve vias)`);
    const props = propPlacements(layout);
    for (const p of props) {
      assert.ok(!ROAD_PROPS.has(p.type),
        `${id}: prop urbano de via "${p.type}" em mundo de natureza`);
    }
    // props de acampamento (sandbag/barrierprop/crate) junto a estruturas são
    // dressing válido e permanecem
    assert.ok(props.every((p) => ['sandbag', 'barrierprop', 'crate'].includes(p.type)),
      `${id}: apenas props de acampamento`);
  }
});

test('F58 — mundos urbanos mantêm a rede viária completa (radiais conectam distritos)', () => {
  for (const id of URBAN) {
    const layout = getWorldLayout(`f58-${id}`, id);
    const roads = roadSegments(layout);
    assert.ok(roads.length >= 4, `${id}: rede viária presente (${roads.length} segmentos)`);
    const radials = roads.filter((r) => r.kind === 'radial');
    assert.ok(radials.length >= 4, `${id}: 4 radiais`);
    for (const d of layout.districts.slice(0, 4)) {
      const hits = radials.some((r) => Math.hypot(r.x2 - d.cx, r.z2 - d.cz) < d.r);
      assert.ok(hits, `${id}: distrito ${d.name} conectado pela via`);
    }
  }
  // tráfego urbano existe (carros abandonados são cânon de Barburhen; Khaaos
  // Ville tem setor urbano de treino)
  for (const id of URBAN) {
    const layout = getWorldLayout(`f58-traffic-${id}`, id);
    assert.ok(trafficPlacements(layout).length > 0, `${id}: tráfego urbano presente`);
  }
});

test('F58 — praça central: asfalto só nos urbanos; natureza usa o solo do bioma', () => {
  for (const id of URBAN) {
    const m = centralPlazaMaterial(id);
    assert.equal(m.userData.surfaceTag, 'asphalt-plaza', `${id}: praça asfaltada (cânon urbano)`);
  }
  for (const id of NATURE) {
    const m = centralPlazaMaterial(id);
    assert.equal(m.userData.surfaceTag, 'biome-ground',
      `${id}: praça é clareira do bioma (F49) — sem mancha de asfalto`);
    // textura de solo F49: roughness do bioma (não do asfalto)
    const biomeRough = { Priadus: .97, Ckesalth: .9, Arukheea: .99 }[id];
    assert.equal(m.roughness, biomeRough, `${id}: roughness do solo do bioma`);
  }
});

test('F58 — buildScene: praça "central-plaza" com material fiel em TODOS os mundos', () => {
  // materiais memoizados: se uma via existisse, os meshes apontariam para estas
  // instâncias EXATAS — identidade é o discriminador mais forte
  const road = roadMaterial();
  const walk = sidewalkMaterial();
  for (const id of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    const { scene } = buildScene(5858, id, null, 'low');
    const plaza = scene.children.find((o) => o.name === 'central-plaza');
    assert.ok(plaza, `${id}: praça central nomeada existe`);
    const expected = hasCanonicalRoads(id) ? 'asphalt-plaza' : 'biome-ground';
    assert.equal(plaza.material.userData.surfaceTag, expected,
      `${id}: material da praça fiel ao cânon`);
    // mundos de natureza: NENHUM mesh usa o material memoizado de via/calçada
    if (!hasCanonicalRoads(id)) {
      scene.traverse((o) => {
        if (o.isMesh) {
          assert.ok(o.material !== road, `${id}: nenhum mesh de estrada asfaltada`);
          assert.ok(o.material !== walk, `${id}: nenhum mesh de calçada`);
        }
      });
      // e o registro de tráfego não existe nos mundos de natureza
      assert.equal(scene.userData.trafficPlacements, undefined,
        `${id}: scene.userData.trafficPlacements ausente`);
    } else {
      assert.ok(scene.userData.trafficPlacements?.length > 0,
        `${id}: tráfego urbano registrado na cena`);
    }
  }
});

test('F58 — dressing natural preenche o solo antes ocupado por vias (sem buracos)', () => {
  for (const id of NATURE) {
    const layout = getWorldLayout(`f58-nat-${id}`, id);
    const spots = naturalDressingPlacements(layout, { seed: 'f58-natural' });
    assert.ok(spots.length >= 35, `${id}: clutter natural visível (${spots.length})`);
    // determinismo byte-idêntico
    assert.deepEqual(spots, naturalDressingPlacements(layout, { seed: 'f58-natural' }),
      `${id}: determinismo por seed`);
  }
});
