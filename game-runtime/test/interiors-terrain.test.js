// Khaaos Run — Fase 23 — interiores dos prédios + variação de terreno por elevação.
//
// A Fase 23 troca a caixa sólida dos prédios elegíveis por uma CASCA OCA real
// (paredes com buracos verdadeiros de porta/janela, vidro, piso, forro, mobília
// procedural e pendentes emissivos) — SEMPRE com zero impacto em gameplay: o
// collider AABB de cada estrutura permanece bit a bit, e o terreno continua
// PLANO dentro da área jogável (y=0 exato p/ sim, decals, estradas e sombras).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildScene } from '../src/game3d/world3d.js';
import { buildingInteriors, buildBuildingInteriors } from '../src/game3d/interiors3d.js';
import { terrainHeightAt, terrainColorAt, terrainVertexData, terrainSeedNum, TERRAIN_DEFAULTS } from '../src/game3d/terrain3d.js';
import { getWorldLayout } from '../src/game3d/sim3d.js';
import { resolveScenario, SCENARIOS } from '../src/game3d/scenarios.js';
import { QUALITY_TIERS } from '../src/game3d/quality3d.js';

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

const IDS = ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea'];
const ELIGIBLE_KINDS = new Set(['barrack', 'hangar', 'warehouse', 'building', 'depot', 'tower', 'ruin', 'pavilion']);

test('interiores: determinismo — mesma seed+cenário produzem o mesmo plano', () => {
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`INT-DET-${id}`, scenario.id);
    const a = buildingInteriors(layout, { fraction: 1, density: 1 });
    const b = buildingInteriors(layout, { fraction: 1, density: 1 });
    assert.deepEqual(a, b, `${id}: plano estável`);
    assert.equal(a.scenarioId, id);
  }
});

test('interiores: elegibilidade correta (tipos com interior, h>=3.2, sem silo/contêiner)', () => {
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`INT-EL-${id}`, scenario.id);
    const plan = buildingInteriors(layout, { fraction: 1, density: 1 });
    assert.ok(plan.buildings.length > 0, `${id}: ao menos 1 prédio com interior`);
    for (const b of plan.buildings) {
      const s = layout.structures[b.index];
      assert.ok(ELIGIBLE_KINDS.has(s.kind), `${id}: tipo ${s.kind} elegível`);
      assert.ok(s.h >= 3.2, `${id}: altura ${s.h} >= 3.2`);
      // plano espelha a estrutura (casca no MESMO lugar da caixa visual)
      assert.equal(b.x, s.x); assert.equal(b.z, s.z);
      assert.equal(b.w, s.w); assert.equal(b.d, s.d); assert.equal(b.h, s.h);
    }
  }
});

test('interiores: porta verdadeira, janelas em baías e mobília dentro da casca', () => {
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`INT-GEOM-${id}`, scenario.id);
    const plan = buildingInteriors(layout, { fraction: 1, density: 1 });
    for (const b of plan.buildings) {
      // porta com abertura real
      assert.ok(b.door.w > 0 && b.door.h === 2.5, `${id}: porta dimensionada`);
      assert.ok(['front', 'right'].includes(b.door.face), `${id}: porta em face válida`);
      assert.equal(b.faces.length, 4, `${id}: 4 faces`);
      // prédios com fileiras de janela têm baías nas 4 faces (mesma regra da
      // fachada da Fase 6: rows = floor((h-2.4)/2.8) — h=5 => 0 fileiras)
      if (b.faces.some((f) => f.rows.length > 0)) {
        const withBays = b.faces.filter((f) => f.bays.length > 0);
        assert.ok(withBays.length === 4, `${id}: 4 faces com baías (h=${b.h})`);
        for (const f of b.faces) {
          for (const bay of f.bays) {
            // baía dentro da face (folga dos cantos)
            assert.ok(Math.abs(bay.u) + bay.w / 2 <= f.span / 2 + .01, `${id}: baía dentro da face`);
          }
        }
      }
      // mobília dentro da casca e fora do corredor da porta
      for (const f of b.furniture) {
        assert.ok(Math.abs(f.x) <= b.w / 2 - b.wallT - .5, `${id}: móvel x dentro (${f.x} / w=${b.w})`);
        assert.ok(Math.abs(f.z) <= b.d / 2 - b.wallT - .5, `${id}: móvel z dentro (${f.z} / d=${b.d})`);
        if (b.door.face === 'front') {
          const inCorridor = f.z < -b.d / 2 + 2.6 && Math.abs(f.x) < b.door.w / 2 + 1.1;
          assert.ok(!inCorridor, `${id}: corredor da porta livre`);
        }
      }
      // pendentes abaixo do forro
      for (const lamp of b.lamps) {
        assert.ok(lamp.y > 1.4 && lamp.y < b.h, `${id}: pendente pendurado (y=${lamp.y}, h=${b.h})`);
      }
      // ruína: telhado quebrado, sem pendentes; prédio inteiro: telhado plano
      if (b.kind === 'ruin') assert.equal(b.roof, 'broken');
      else {
        assert.equal(b.roof, 'flat');
        assert.ok(b.lamps.length >= 1, `${id}: prédio inteiro tem pendente`);
      }
    }
  }
});

test('interiores: ZERO impacto em gameplay — layout (colliders/estruturas/loot) intacto', () => {
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`INT-GP-${id}`, scenario.id);
    const snapshot = JSON.stringify({
      colliders: layout.colliders, structures: layout.structures,
      lootSpots: layout.lootSpots, terminals: layout.terminals, botSpawns: layout.botSpawns,
    });
    buildingInteriors(layout, { fraction: 1, density: 1 });
    assert.equal(
      JSON.stringify({
        colliders: layout.colliders, structures: layout.structures,
        lootSpots: layout.lootSpots, terminals: layout.terminals, botSpawns: layout.botSpawns,
      }),
      snapshot,
      `${id}: sim/colisão bit a bit`,
    );
  }
});

test('interiores: tier baixo recebe SUBCONJUNTO determinístico do tier alto', () => {
  const scenario = resolveScenario('CIGKV');
  const layout = getWorldLayout('INT-TIER', scenario.id);
  const full = buildingInteriors(layout, { fraction: 1, density: 1 });
  const half = buildingInteriors(layout, { fraction: 0.5, density: 0.7 });
  assert.ok(half.buildings.length >= 1, 'tier baixo ainda tem interiores');
  assert.ok(half.buildings.length <= full.buildings.length, 'orçamento respeitado');
  // prioridade: marcos grandes primeiro (warehouse/hangar/barrack antes de depot)
  const prio = { warehouse: 0, hangar: 1, barrack: 2, building: 3, tower: 4, ruin: 5, depot: 6, pavilion: 7 };
  const firstHalf = Math.min(...half.buildings.map((b) => prio[b.kind]));
  const lastFull = Math.max(...full.buildings.map((b) => prio[b.kind]));
  assert.ok(firstHalf <= lastFull, 'prédios prioritários entram primeiro');
  // QUALITY_TIERS expõem os knobs da Fase 23
  assert.equal(QUALITY_TIERS.high.interiorFactor, 1);
  assert.equal(QUALITY_TIERS.medium.interiorFactor, 0.8);
  assert.equal(QUALITY_TIERS.low.interiorFactor, 0.5);
});

test('integração buildScene: registry buildingInteriors nos 5 cenários + casca oca na cena', () => {
  for (const id of IDS) {
    const { scene } = buildScene(4242, id, null, 'high');
    const registry = scene.userData.buildingInteriors;
    assert.ok(registry, `${id}: registry presente`);
    assert.equal(registry.id, id);
    assert.ok(registry.placements.buildings.length >= 1, `${id}: prédios com interior`);
    // um grupo host por prédio
    assert.equal(registry.group.children.length, registry.placements.buildings.length);
    assert.ok(registry.group.parent === scene, `${id}: grupo na cena`);
    // pendentes geram animators; animators rodam sem erro/NaN
    const hasLamps = registry.placements.buildings.some((b) => b.lamps.length > 0);
    assert.equal(registry.animators.length >= 1, hasLamps, `${id}: animator de flicker condizente`);
    for (const t of [1 / 60, 2.5, 130]) {
      for (const fn of registry.animators) fn(1 / 60, t);
    }
    scene.traverse((o) => {
      if (o.isMesh) {
        assert.ok(Number.isFinite(o.position.x) && Number.isFinite(o.position.y) && Number.isFinite(o.position.z),
          `${id}: posição finita`);
      }
    });
    // idempotência (padrão worldmarks/dressing)
    const again = buildBuildingInteriors(scene, scene.userData.layout, registry.placements);
    assert.equal(again, registry, `${id}: buildBuildingInteriors é idempotente`);
  }
});

test('interiores: prédio com interior NÃO tem caixa sólida duplicada (casca substitui)', () => {
  const { scene } = buildScene(4242, 'CIGKV', null, 'high');
  const layout = scene.userData.layout;
  const registry = scene.userData.buildingInteriors;
  for (const b of registry.placements.buildings) {
    const s = layout.structures[b.index];
    // nenhuma malha com o MESMO centro e volume da caixa original (a casca é oca)
    const solidBox = scene.children.find((o) =>
      o.isMesh
      && Math.abs(o.position.x - s.x) < .01
      && Math.abs(o.position.z - s.z) < .01
      && Math.abs(o.position.y - (s.yMin + s.h / 2)) < .01
      && o.geometry?.parameters?.width === s.w
      && o.geometry?.parameters?.height === s.h);
    assert.ok(!solidBox, `caixa sólida de [${s.kind}] deveria ter sido substituída pela casca`);
  }
});

test('terreno: PLANO dentro da área jogável (y=0 exato) e colinas fora', () => {
  // dentro: grid denso + pontos de gameplay reais
  for (let x = -200; x <= 200; x += 25) {
    for (let z = -200; z <= 200; z += 25) {
      assert.equal(terrainHeightAt(x, z), 0, `(${x},${z}) plano dentro do bound`);
    }
  }
  // fora: sobe de forma determinística e limitada
  let rose = 0;
  for (const [x, z] of [[205, 0], [0, 208], [210, 210], [-214, 30], [40, -215]]) {
    const h = terrainHeightAt(x, z);
    assert.ok(h >= 0 && h <= TERRAIN_DEFAULTS.maxRise + .001, `(${x},${z}) elevação limitada (${h})`);
    if (h > 0.5) rose++;
  }
  assert.ok(rose >= 3, 'maioria dos pontos externos tem elevação');
  // borda extrema tem relevo considerável em algum lugar
  let maxEdge = 0;
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    maxEdge = Math.max(maxEdge, terrainHeightAt(Math.cos(ang) * 219, Math.sin(ang) * 219));
  }
  assert.ok(maxEdge >= 6, `colinas visíveis na borda (max ${maxEdge.toFixed(1)}m)`);
});

test('terreno: determinístico por seedNum e sensível à seed da partida', () => {
  const a = terrainHeightAt(210, 208, { seedNum: 42 });
  const b = terrainHeightAt(210, 208, { seedNum: 42 });
  assert.equal(a, b, 'mesma seed => mesma elevação');
  const s1 = terrainSeedNum('CIGKV-3D-01', 'CIGKV');
  const s2 = terrainSeedNum('OUTRA-SEED', 'CIGKV');
  assert.notEqual(s1, s2, 'seeds de partida diferentes => terreno diferente');
  assert.equal(s1, terrainSeedNum('CIGKV-3D-01', 'CIGKV'), 'seed estável');
});

test('terreno: cores por vértice em [0,1], dois tons de capim e rocha na elevação', () => {
  const tints = ['#c9cfa0', '#b3bd8c'];
  // variação de manchas: cores diferentes em pontos diferentes do plano
  const c1 = terrainColorAt(-60, -60, 0, { tints });
  const c2 = terrainColorAt(70, 30, 0, { tints });
  const c3 = terrainColorAt(10, 110, 0, { tints });
  const distinct = new Set([c1.join(), c2.join(), c3.join()]);
  assert.ok(distinct.size >= 2, `manchas de tonalidade presentes (${distinct.size} tons)`);
  for (const c of [c1, c2, c3]) {
    for (const v of c) assert.ok(v >= 0 && v <= 1, 'cor normalizada');
  }
  // elevação mistura para rocha (cor sai da família do capim)
  const grass = terrainColorAt(0, 0, 0, { tints });
  const rocky = terrainColorAt(215, 215, 14, { tints });
  const dGrass = Math.hypot(grass[0] - rocky[0], grass[1] - rocky[1], grass[2] - rocky[2]);
  assert.ok(dGrass > 0.05, `elevação muda a cor (Δ=${dGrass.toFixed(3)})`);
});

test('terreno: terrainVertexData alinha alturas/cores com a malha do chão', () => {
  const geo = new THREE.PlaneGeometry(440, 440, 24, 24);
  geo.rotateX(-Math.PI / 2);
  const { heights, colors } = terrainVertexData(geo.attributes.position.array, { tints: ['#c9cfa0', '#b3bd8c'] });
  const n = geo.attributes.position.count;
  assert.equal(heights.length, n);
  assert.equal(colors.length, n * 3);
  // aplicar alturas não produz NaN e mantém plano dentro do bound
  const pos = geo.attributes.position;
  for (let i = 0; i < n; i++) {
    pos.setY(i, heights[i]);
    assert.ok(Number.isFinite(heights[i]), 'altura finita');
    if (Math.abs(pos.getX(i)) <= 200 && Math.abs(pos.getZ(i)) <= 200) {
      assert.equal(heights[i], 0, 'vértice interno permanece plano');
    }
  }
  // cores em [0,1]
  for (let i = 0; i < colors.length; i++) assert.ok(colors[i] >= 0 && colors[i] <= 1);
});

test('cenários preservados: SCENARIOS intactos pela Fase 23 (contrato de gameplay)', () => {
  assert.equal(Object.keys(SCENARIOS).length, 5);
  assert.equal(SCENARIOS.CIGKV.playerSpawn.z, 150);
  assert.equal(SCENARIOS.CKESALTH.survival.type, 'VOLCANIC_LAVA');
  assert.equal(SCENARIOS.ARUKHEEA.survival.anchors.length, 4);
  assert.equal(SCENARIOS.BARBURHEN.ringDamageMultiplier, 1.5);
});
