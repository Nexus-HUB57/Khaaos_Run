// Khaaos Run — Fase 43 — DETALHES FIEIS AO README por mundo (dressing nível
// Free Fire). A Fase 42 garantiu as DINÂMICAS canônicas 1:1; esta fase traz os
// detalhes de CENÁRIO que o README cita e faltavam no runtime:
//   W1 Barburhen — "construções inacabadas... desabamentos"  → skeleton/collapse
//   W2 Priadus   — "flora carnívora" + "neblina alucinógena" → carnplant + mist
//   W3 Ckesalth  — "lagoas de petróleo EM CHAMAS" + "areia movediça" → fogo real nos oilpools + quicksand
//   W4 Arukheea  — "tubarões" → mar (anel oceânico) + sharkfin patrulhando, NOS
//                     WORLDMARKS (mesma gramática do anel oceânico de Priadus —
//                     a arena permanece seca, fauna visual fora da área jogável)
// Filosofia intocada: zero collider, determinismo por seed, fora de
// estradas/loot/praça e fauna SEM IA (caminho analítico por t).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScene } from '../src/game3d/world3d.js';
import { districtDressing, buildDistrictDressing } from '../src/game3d/districts3d.js';
import { getWorldLayout } from '../src/game3d/sim3d.js';
import { resolveScenario } from '../src/game3d/scenarios.js';
import { mistMaterial, quicksandMaterial } from '../src/game3d/textures3d.js';

// stub de canvas p/ texturas procedurais headless (mesmo padrão do district-dressing.test.js)
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

// ---------- F43: presença por mundo (README → dressing) ----------

test('F43 placements: cada mundo materializa os detalhes que o README cita', () => {
  const EXPECT = {
    Barburhen: { skeleton: 3, collapse: 2 },            // 4 distritos urbanos
    Priadus: { carnplant: 4, mist: 6 },                 // pantanosa+bosque (planta) / 4 setores (névoa)
    Ckesalth: { quicksand: 2, oilpool: 2 },             // setor da areia movediça / resort+refinaria
  };
  for (const [id, kinds] of Object.entries(EXPECT)) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`F43-PLACE-${id}`, scenario.id);
    const d = districtDressing(layout, scenario, { density: 1 });
    for (const [kind, min] of Object.entries(kinds)) {
      assert.ok((d.counts[kind] ?? 0) >= min, `${id}: ${kind} >= ${min} (${d.counts[kind] ?? 0})`);
    }
  }
});

test('F43 exclusividade: os detalhes novos não vazam para outros mundos', () => {
  const OWNER = {
    skeleton: 'Barburhen', collapse: 'Barburhen',
    carnplant: 'Priadus', mist: 'Priadus',
    quicksand: 'Ckesalth',
  };
  const IDS = ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea'];
  const placements = {};
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    placements[id] = districtDressing(getWorldLayout(`F43-EX-${id}`, scenario.id), scenario, { density: 1 });
  }
  for (const [type, owner] of Object.entries(OWNER)) {
    for (const other of IDS) {
      if (other === owner) continue;
      const leaked = placements[other].items.some((p) => p.type === type)
        || placements[other].patches.some((p) => p.type === type);
      assert.ok(!leaked, `${type} não deveria existir em ${other} (exclusivo de ${owner})`);
    }
  }
});

test('F43 determinismo: placements com detalhes novos são byte-idênticos por seed', () => {
  for (const id of ['Barburhen', 'Priadus', 'Ckesalth']) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`F43-DET-${id}`, scenario.id);
    const a = districtDressing(layout, scenario, { density: 1 });
    const b = districtDressing(layout, scenario, { density: 1 });
    assert.deepEqual(a, b, `${id}: placements estáveis`);
  }
});

test('F43 zero impacto: detalhes novos respeitam colliders, praça e loot', () => {
  for (const id of ['Barburhen', 'Priadus', 'Ckesalth']) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`F43-GP-${id}`, scenario.id);
    const NEW = {
      Barburhen: ['skeleton', 'collapse'],
      Priadus: ['carnplant'],
      Ckesalth: [],
      Arukheea: ['sharkfin'],
    }[id];
    const PATCH_NEW = { Ckesalth: ['quicksand'], Priadus: ['mist'] }[id] ?? [];
    const d = districtDressing(layout, scenario, { density: 1 });
    const fresh = [...d.items.filter((p) => NEW.includes(p.type)), ...d.patches.filter((p) => PATCH_NEW.includes(p.type))];
    assert.ok(fresh.length > 0, `${id}: itens/patches F43 presentes`);
    for (const p of fresh) {
      assert.ok(Math.hypot(p.x, p.z) >= 46, `${id}: ${p.type} fora da praça central`);
      for (const c of layout.colliders) {
        const clear = p.x < c.minX - 1.2 || p.x > c.maxX + 1.2 || p.z < c.minZ - 1.2 || p.z > c.maxZ + 1.2;
        assert.ok(clear, `${id}: ${p.type} (${p.x},${p.z}) colide com collider [${c.kind}]`);
      }
      for (const l of layout.lootSpots) {
        assert.ok(Math.hypot(p.x - l.x, p.z - l.z) > 3.2, `${id}: ${p.type} bloqueia loot`);
      }
    }
    // layout intocado (dressing nunca altera sim/colisão)
    const before = layout.colliders.length;
    districtDressing(layout, scenario, { density: 1 });
    assert.equal(layout.colliders.length, before, `${id}: colliders intactos`);
  }
});

// ---------- F43 no build real (buildScene headless) ----------

test('F43 buildScene: Barburhen tem esqueletos + desabamentos com sombra registrada', () => {
  const { scene } = buildScene(4242, 'Barburhen', null, 'high');
  const reg = scene.userData.districtDressing;
  assert.ok((reg.counts.skeleton ?? 0) >= 2, `esqueletos no cenário (${reg.counts.skeleton ?? 0})`);
  assert.ok((reg.counts.collapse ?? 0) >= 1, `desabamentos no cenário (${reg.counts.collapse ?? 0})`);
  const named = { skeleton: 0, collapse: 0 };
  reg.group.traverse((o) => { if (named[o.name] !== undefined) named[o.name]++; });
  assert.ok(named.skeleton >= 1 && named.collapse >= 1, 'grupos nomeados construídos (builders executados)');
  // animators rodam sem NaN em t curto e longo
  for (const t of [1 / 60, 12.5, 310]) for (const fn of reg.animators) fn(1 / 60, t);
  scene.traverse((o) => {
    if (o.isMesh) assert.ok(Number.isFinite(o.position.x + o.position.y + o.position.z), 'posição finita');
  });
});

test('F43 buildScene: Priadus tem flora carnívora pulsante + névoa que respira', () => {
  const { scene } = buildScene(4242, 'Priadus', null, 'high');
  const reg = scene.userData.districtDressing;
  assert.ok((reg.counts.carnplant ?? 0) >= 3, `carnplant no cenário (${reg.counts.carnplant ?? 0})`);
  assert.ok((reg.counts.mist ?? 0) >= 4, `bancos de névoa (${reg.counts.mist ?? 0})`);
  // bioluminescência: PELO MENOS UM pulso muda o emissiveIntensity com o tempo
  // (emissive NÃO-preto — todo MeshStandardMaterial tem .emissive preto default)
  const pulsing = [];
  reg.group.traverse((o) => {
    if (o.isMesh && o.material?.emissive?.isColor
      && o.material.emissive.getHexString() !== '000000'
      && o.parent?.name === 'carnplant') pulsing.push(o);
  });
  assert.ok(pulsing.length >= 1, `dentes/bulbo com material ácido (${pulsing.length})`);
  const probe = pulsing[0].material;
  for (const fn of reg.animators) fn(1 / 60, 0);
  const v1 = probe.emissiveIntensity;
  for (const fn of reg.animators) fn(1 / 60, 1.6);
  const v2 = probe.emissiveIntensity;
  assert.ok(Math.abs(v2 - v1) > 1e-4, `pulso vivo (${v1.toFixed(3)} → ${v2.toFixed(3)})`);
  // névoa: InstancedMesh com o MATERIAL de névoa (map radial translúcido)
  const mistMat = mistMaterial();
  let mist = null;
  scene.traverse((o) => {
    if (o.isInstancedMesh && o.material === mistMat) mist = o;
  });
  assert.ok(mist, 'névoa alucinógena presente (disco translúcido)');
  for (const fn of reg.animators) fn(1 / 60, 7);
  assert.ok(mist.material.opacity > 0.05 && mist.material.opacity < 0.4, `opacidade da névoa respira (${mist.material.opacity.toFixed(3)})`);
});

test('F43 buildScene: Ckesalth — lagoas de óleo EM CHAMAS + areia movediça', () => {
  const { scene } = buildScene(4242, 'Ckesalth', null, 'high');
  const reg = scene.userData.districtDressing;
  assert.ok((reg.counts.oilpool ?? 0) >= 2, `lagoas de óleo (${reg.counts.oilpool ?? 0})`);
  // Cada lagoa tem cinco línguas independentes; cada língua tem borda, corpo e núcleo.
  const fires = [];
  scene.traverse((o) => {
    if (o.name === 'oilfire') fires.push(o);
  });
  assert.equal(fires.length, reg.counts.oilpool, 'um grupo de fogo por lagoa de óleo');
  for (const fire of fires) {
    assert.equal(fire.userData.flameTongues, 5, 'cinco línguas por lagoa');
    const tongues = fire.children.filter((o) => o.name === 'oilfire-tongue');
    assert.equal(tongues.length, 5, 'grupos de chama separados para flicker independente');
    const layerCounts = { outer: 0, body: 0, core: 0 };
    fire.traverse((o) => { if (o.userData.fireLayer) layerCounts[o.userData.fireLayer]++; });
    assert.deepEqual(layerCounts, { outer: 5, body: 5, core: 5 }, 'cada língua tem as três camadas de cor');
    fire.userData.update(.47);
    assert.ok(tongues.every((o) => Number.isFinite(o.scale.y)), 'flicker em estado finito');
  }
  assert.equal(reg.oilfireEmitters.length, fires.length * 2, 'um emissor de brasa e um de fumaça por lagoa');
  assert.deepEqual(reg.oilfireEmitters.map((e) => e.kind).sort(),
    fires.flatMap(() => ['oilfire-embers', 'oilfire-smoke']).sort(), 'os emissores são tipados por efeito');
  // Avançar os animators e provar que cada emissor oilfire, não apenas outro
  // efeito da cena, produziu partículas no pool compartilhado.
  const system = scene.userData.particles;
  assert.ok(reg.oilfireEmitters.every((e) => e.system === system), 'todos os emissores reutilizam o mesmo pool da cena');
  for (let i = 0; i < 150; i++) for (const fn of reg.animators) fn(1 / 60, i / 60);
  assert.ok(reg.oilfireEmitters.every((e) => e.emittedTotal > 0), 'brasa/fumaça emitidas por cada lagoa');
  assert.ok(system.activeCount > 0, `fogo do óleo vivo no pool (${system.activeCount})`);
  // areia movediça: patch com anéis concêntricos (map) no setor canônico
  assert.ok((reg.counts.quicksand ?? 0) >= 2, `areia movediça (${reg.counts.quicksand ?? 0})`);
  const quicksand = quicksandMaterial();
  let qsFound = false;
  scene.traverse((o) => {
    if (o.isInstancedMesh && o.material === quicksand) qsFound = true;
  });
  assert.ok(qsFound, 'patch de areia movediça com textura de anéis');
});

test('F43 worldmarks: Arukheea ganha o MAR e TUBARÕES patrulhando o anel oceânico', () => {
  const { scene } = buildScene(4242, 'Arukheea', null, 'high');
  const marks = scene.userData.worldMarks;
  assert.ok((marks.counts.sea ?? 0) >= 1, `mar presente (${marks.counts.sea ?? 0})`);
  assert.ok((marks.counts.sharks ?? 0) >= 3, `tubarões no mar (${marks.counts.sharks ?? 0})`);
  const fins = [];
  scene.traverse((o) => { if (o.name === 'sharkfin') fins.push(o); });
  assert.equal(fins.length, marks.counts.sharks, 'grupos sharkfin construídos');
  // anel do mar existe e é centrado na origem (mesma gramática do Priadus)
  const sea = scene.traverse.bind(scene);
  let ring = null;
  scene.traverse((o) => { if (o.name === 'arukheea-sea-ring') ring = o; });
  assert.ok(ring, 'anel do mar presente');
  assert.ok(Math.abs(ring.position.x) < .01 && Math.abs(ring.position.z) < .01, 'mar centrado na origem');
  // patrulha: a barbatana se move e permanece na FAIXA DO MAR (nunca em terra)
  const fin = fins[0];
  for (const fn of marks.animators) fn(1 / 60, 0);
  const p0 = fin.position.clone();
  for (const fn of marks.animators) fn(1 / 60, 9.3);
  const p1 = fin.position.clone();
  assert.ok(p0.distanceTo(p1) > .5, `barbatana se move (${p0.distanceTo(p1).toFixed(2)} m)`);
  let minR = Infinity, maxR = 0;
  for (let i = 0; i <= 3600; i++) {
    for (const fn of marks.animators) fn(1 / 60, i / 60);
    const r = Math.hypot(fin.position.x, fin.position.z);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    assert.ok(Number.isFinite(fin.position.x + fin.position.y + fin.position.z), 'posição finita');
  }
  assert.ok(minR >= 200, `sempre no mar (raio mínimo ${minR.toFixed(1)} m ≥ 200)`);
  assert.ok(maxR <= 255, `nunca escapa do anel (raio máximo ${maxR.toFixed(1)} m ≤ 255)`);
  assert.equal(fins.length, 3, 'sem tubarão extra');
});

test('F43 idempotência e contrato: buildDistrictDressing segue o padrão do registry', () => {
  const { scene } = buildScene(88, 'Arukheea', null, 'high');
  const registry = scene.userData.districtDressing;
  const again = buildDistrictDressing(scene, scene.userData.layout, resolveScenario('Arukheea'), { dressingFactor: 1 });
  assert.equal(again, registry, 'idempotente na mesma cena');
  assert.ok(registry.animators.length >= 1, 'animators registrados');
  assert.equal(registry.id, 'Arukheea');
});
