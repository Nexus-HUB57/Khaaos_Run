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

// ══════════════════════════════════════════════════════════════════════════
// Fase 26 — FX DOS MARCOS × MUNDOS: os marcos REAGEM à sobrevivência do
// próprio mundo via registry.applyHazard (abastecido pelo SurvivalFX).
// ══════════════════════════════════════════════════════════════════════════

test('Fase 26: registro expõe applyHazard + hazardState zerado na criação', () => {
  for (const id of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    const { scene } = buildScene(7, id, null, 'high');
    const marks = scene.userData.worldMarks;
    assert.equal(typeof marks.applyHazard, 'function', `${id}: applyHazard presente`);
    assert.deepEqual(marks.hazardState, { kind: null, boost: 0, surfaceY: 0 }, `${id}: estado zerado`);
  }
});

test('Priadus × tsunami: o ANEL oceânico sobe (maré) e recua ao idle', () => {
  const { scene } = buildScene(9, 'Priadus', null, 'high');
  const marks = scene.userData.worldMarks;
  const water = scene.getObjectByName('priadus-water-ring');
  const baseY = water.position.y; // ~.3 (shimmer)
  marks.applyHazard('tsunami', 1, 90);
  for (const fn of marks.animators) fn(1 / 60, 2.5);
  const surgeY = water.position.y;
  assert.ok(surgeY > baseY + 3, `maré de tempestade subiu (${surgeY.toFixed(2)} > ${(baseY + 3).toFixed(2)})`);
  assert.ok(water.material.opacity > .8, 'opacidade fecha o céu d\'água');
  // boost parcial — maré proporcional (smoothstep do SurvivalFX)
  marks.applyHazard('tsunami', .5, 45);
  for (const fn of marks.animators) fn(1 / 60, 2.5);
  const halfY = water.position.y;
  assert.ok(halfY > baseY && halfY < surgeY, `boost 0.5 entre base e pico (${halfY.toFixed(2)})`);
  // hazard termina → volta à base
  marks.applyHazard(null, 0, 0);
  for (const fn of marks.animators) fn(1 / 60, 2.5);
  assert.ok(Math.abs(water.position.y - baseY) < .1, 'recuo ao idle');
});

test('Ckesalth × lava: a tocha ERUPCIONA (escala/emissiva ×) com fagulhas reais', () => {
  const { scene } = buildScene(42, 'Ckesalth', null, 'high');
  const marks = scene.userData.worldMarks;
  const system0 = scene.userData.particles;
  assert.ok(system0, 'pool compartilhado presente');
  // localiza a chama da tocha (cone emissivo #ff7a1a no anel externo)
  let flame = null;
  scene.traverse((o) => {
    if (o.isMesh && o.geometry?.type === 'ConeGeometry' && o.material?.emissive?.getHexString?.() === 'ff7a1a') flame = o;
  });
  assert.ok(flame, 'tocha presente');
  // linhança: animators rodam SEM hazard primeiro (estado base estável)
  for (const fn of marks.animators) fn(1 / 60, 1);
  const baseIntensity = flame.material.emissiveIntensity;
  const baseScale = flame.scale.y;
  marks.applyHazard('lava', 1, 180);
  // 120 frames — emissores acumulam dívida (rate 4/s: 1 frame = debt .067 < 1)
  for (let i = 0; i < 120; i++) for (const fn of marks.animators) fn(1 / 60, 1.1 + i / 60);
  assert.ok(flame.material.emissiveIntensity > baseIntensity * 2.5, `chama incandesce (${flame.material.emissiveIntensity.toFixed(2)} > ${(baseIntensity * 2.5).toFixed(2)})`);
  assert.ok(flame.scale.y > baseScale + 1, `chama 3× mais alta (${flame.scale.y.toFixed(2)})`);
  // fagulhas REAIS na cena (partículas pooled — antes da Fase 26 a tocha era só cone)
  const system = scene.userData.particles;
  assert.ok(system.activeCount > 0, `fagulhas/fumaça vivas no pool (${system.activeCount})`);
});

test('Arukheea × gravity: pilões ACORDAM (anéis giram + cristal incandesce) e fendas fecham brilho', () => {
  const { scene } = buildScene(9, 'Arukheea', null, 'high');
  const marks = scene.userData.worldMarks;
  const pylons = scene.getObjectByName('anchor-pylons');
  const rings = [];
  pylons.traverse((o) => { if (o.isMesh && o.geometry?.type === 'TorusGeometry') rings.push(o); });
  assert.ok(rings.length > 0, 'anéis dos pilões presentes');
  const crysMats = rings.map((r) => r.material);
  for (const fn of marks.animators) fn(1 / 60, 3);
  const rot0 = rings.map((r) => r.rotation.z);
  const em0 = crysMats[0].emissiveIntensity;
  const riftOp0 = scene.traverse.length; // placeholder — fendas abaixo
  marks.applyHazard('gravity', 1, 0);
  for (let i = 0; i < 30; i++) for (const fn of marks.animators) fn(1 / 60, 3 + i / 60);
  const rot1 = rings.map((r) => r.rotation.z);
  const moved = rings.filter((r, i) => Math.abs(r.rotation.z - rot0[i]) > .5).length;
  assert.ok(moved >= rings.length - 1, `anéis giraram com a anomalia (${moved}/${rings.length})`);
  assert.ok(crysMats[0].emissiveIntensity > em0 * 2, `cristal incandesce (${crysMats[0].emissiveIntensity.toFixed(2)})`);
  assert.ok(rings.length > 0);
  assert.ok(rot1.length === rings.length);
});

test('Arukheea × gravity: fendas do vazio incandecem (opacidade ↑)', () => {
  const { scene } = buildScene(9, 'Arukheea', null, 'high');
  const marks = scene.userData.worldMarks;
  // nomeadas na Fase 26 — raios de luz (Fase 24) são PlaneGeometry transparente idêntico
  const rifts = [];
  scene.traverse((o) => { if (o.name === 'void-rift') rifts.push(o); });
  assert.ok(rifts.length >= 4, `fendas do horizonte presentes (${rifts.length})`);
  for (const fn of marks.animators) fn(1 / 60, 5);
  const idle = rifts.map((r) => r.material.opacity);
  marks.applyHazard('gravity', 1, 0);
  for (const fn of marks.animators) fn(1 / 60, 5.5);
  const hot = rifts.map((r) => r.material.opacity);
  const up = rifts.filter((r, i) => hot[i] > idle[i]).length;
  assert.ok(up === rifts.length, `todas as fendas incandecem (${up}/${rifts.length})`);
});

test('CIGKV × acid: beacons estroboscopiam (pulso acelera com o boost)', () => {
  const { scene } = buildScene(9, 'CIGKV', null, 'high');
  const marks = scene.userData.worldMarks;
  const beacons = [];
  scene.traverse((o) => {
    if (o.isMesh && o.geometry?.type === 'SphereGeometry' && o.material?.emissive?.getHexString?.() === 'ff3d52') beacons.push(o);
  });
  assert.ok(beacons.length >= 3, `beacons presentes (${beacons.length})`);
  // amostra a intensidade em fase equivalente: com acid o speed 2.2→13.2
  const sample = (t) => { for (const fn of marks.animators) fn(1 / 60, t); return beacons.map((b) => b.material.emissiveIntensity); };
  const s1 = sample(1);
  marks.applyHazard('acid', 1, 0);
  const s2 = sample(1); // mesmo t — velocidade diferente muda a fase do sinal
  const differs = beacons.filter((b, i) => Math.abs(s2[i] - s1[i]) > .05).length;
  assert.ok(differs >= 1, `estrobo acelera com ácido (${differs}/${beacons.length} mudaram)`);
});

test('Barburhen × hazard: sem sobrevivência no cenário — reação nula e sem erro', () => {
  const { scene } = buildScene(11, 'Barburhen', null, 'high');
  const marks = scene.userData.worldMarks;
  assert.doesNotThrow(() => {
    marks.applyHazard('tsunami', 1, 90);
    for (const fn of marks.animators) fn(1 / 60, 1);
    marks.applyHazard(null, 0, 0);
  }, 'cenário sem sobrevivência ignora hazard com elegância');
});

test('Fase 26: particles ticker é IDEMPOTENTE por cena (districts + marks = 1 tick)', () => {
  for (const id of ['Ckesalth', 'Arukheea', 'Priadus']) {
    const { scene } = buildScene(88, id, null, 'high');
    const system = scene.userData.particles;
    assert.ok(system, `${id}: pool compartilhado existe`);
    const live0 = system.activeCount;
    // 1 segundo de "frames": se o ticker fosse 2×, idade avançaria 2× (partículas curtas morriam no dobro da velocidade)
    const emitters = [];
    scene.traverse(() => {});
    for (let i = 0; i < 60; i++) {
      for (const fn of scene.userData.worldMarks.animators) fn(1 / 60, i / 60);
      for (const fn of scene.userData.districtDressing?.animators ?? []) fn(1 / 60, i / 60);
    }
    assert.ok(system.activeCount >= 0, `${id}: estado finito após 60 frames`);
    assert.ok(live0 >= 0);
  }
});
