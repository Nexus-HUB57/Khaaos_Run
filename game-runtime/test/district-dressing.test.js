// Khaaos Run — Fase 22 — cenários vivos: dressing por distrito DENTRO da arena.
//
// A Fase 16 trouxe a identidade dos mundos nos marcos do horizonte (fora da
// área jogável). A Fase 22 materializa essa identidade nos PRÓPRIOS distritos:
// barracas/raia de treino (CIGKV), bancas com toldo/neve (Barburhen),
// mangues/poças/templo/corais (Priadus), dunas/lava rachada/trilhos/refinaria
// (Ckesalth) e estilhaços/runas/fendas do vazio (Arukheea) — SEMPRE com zero
// impacto em gameplay (nenhum collider novo, placements fora de estradas,
// loot, praça central e colliders) e determinismo por seed.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildScene } from '../src/game3d/world3d.js';
import { districtDressing, buildDistrictDressing } from '../src/game3d/districts3d.js';
import { roadSegments } from '../src/game3d/detail3d.js';
import { getWorldLayout } from '../src/game3d/sim3d.js';
import { resolveScenario, SCENARIOS } from '../src/game3d/scenarios.js';

// stub de canvas p/ texturas procedurais headless (mesmo padrão do worldmarks.test.js)
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

// assinaturas mínimas de identidade por cenário (counts do dressing)
const SIGNATURES = {
  CIGKV: ['tent', 'flagmast', 'tirerow', 'bleacher', 'fanunit'],
  Barburhen: ['stall', 'billboard', 'machinery', 'snowpile', 'snowpatch'],
  Priadus: ['waterpool', 'mudpatch', 'mangrove', 'hut', 'walkway', 'templestep', 'statue', 'brazier', 'coral', 'labdome'],
  Ckesalth: ['tent', 'campfire', 'dune', 'banner', 'minecart', 'lavapatch', 'refinetower'],
  Arukheea: ['runering', 'shard', 'crystal', 'quantumring', 'rift', 'voidscorch'],
};

// tipos EXCLUSIVOS por cenário (leitura de identidade inconfundível)
const EXCLUSIVE = {
  Priadus: ['waterpool', 'mangrove', 'templestep', 'labdome'],
  Ckesalth: ['lavapatch', 'dune', 'refinetower', 'minecart'],
  Arukheea: ['runering', 'shard', 'quantumring', 'rift'],
  Barburhen: ['stall', 'billboard', 'snowpile'],
  CIGKV: ['tirerow', 'bleacher'],
};

test('determinismo: mesma seed+cenário produzem placements idênticos', () => {
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`DRESS-DET-${id}`, scenario.id);
    const a = districtDressing(layout, scenario, { density: 1 });
    const b = districtDressing(layout, scenario, { density: 1 });
    assert.deepEqual(a, b, `${id}: placements estáveis`);
    assert.equal(a.scenarioId, id);
  }
});

test('identidade por mundo: cada cenário materializa o kit dos seus distritos', () => {
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`DRESS-ID-${id}`, scenario.id);
    const dressing = districtDressing(layout, scenario, { density: 1 });
    for (const kind of SIGNATURES[id]) {
      assert.ok((dressing.counts[kind] ?? 0) > 0, `${id}: ${kind} presente (${dressing.counts[kind] ?? 0})`);
    }
    assert.ok(dressing.items.length >= 6, `${id}: itens suficientes (${dressing.items.length})`);
  }
});

test('exclusividade cruzada: nenhum tipo assinatura vaza para outro cenário', () => {
  const placements = {};
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    placements[id] = districtDressing(getWorldLayout(`DRESS-EX-${id}`, scenario.id), scenario, { density: 1 });
  }
  for (const [owner, types] of Object.entries(EXCLUSIVE)) {
    for (const type of types) {
      for (const other of IDS) {
        if (other === owner) continue;
        const leaked = placements[other].items.some((p) => p.type === type)
          || placements[other].patches.some((p) => p.type === type);
        assert.ok(!leaked, `${type} não deveria existir em ${other} (exclusivo de ${owner})`);
      }
    }
  }
});

test('zero impacto em gameplay: bounds, praça, colliders, loot e estradas respeitados', () => {
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`DRESS-GP-${id}`, scenario.id);
    const collidersBefore = layout.colliders.length;
    const structuresBefore = layout.structures.length;
    const { items, patches } = districtDressing(layout, scenario, { density: 1 });

    // dressing NUNCA altera o layout (sim/colisão intocadas)
    assert.equal(layout.colliders.length, collidersBefore, `${id}: colliders intactos`);
    assert.equal(layout.structures.length, structuresBefore, `${id}: estruturas intactas`);

    const all = [...items, ...patches];
    assert.ok(all.length > 0, `${id}: placements existem`);
    for (const p of all) {
      // dentro da área jogável
      assert.ok(Math.abs(p.x) <= 195 && Math.abs(p.z) <= 195, `${id}: (${p.x},${p.z}) dentro dos bounds`);
      // fora da praça central/terminal (monolito + asfalto r=34; folga p/ borda do patch)
      const pr = p.r ?? 0;
      assert.ok(Math.hypot(p.x, p.z) >= 46 - pr - 0.5, `${id}: (${p.x},${p.z}) fora da praça central`);
      // livre de colliders (folga >= 1.2; placements usam >= 1.6)
      for (const c of layout.colliders) {
        const clear = p.x < c.minX - 1.2 || p.x > c.maxX + 1.2 || p.z < c.minZ - 1.2 || p.z > c.maxZ + 1.2;
        assert.ok(clear, `${id}: (${p.x},${p.z}) sem colisão com collider [${c.kind}]`);
      }
      // longe dos pontos de loot (mesma folga da geração de props)
      for (const l of layout.lootSpots) {
        assert.ok(Math.hypot(p.x - l.x, p.z - l.z) > 3.2, `${id}: (${p.x},${p.z}) não bloqueia loot`);
      }
    }
    // itens fora do asfalto das estradas (distância ao EIXO da via > meia-largura)
    const roads = roadSegments(layout);
    assert.ok(roads.length > 0, 'vias existem no layout');
    for (const p of items) {
      for (const seg of roads) {
        const d = distToSeg(p.x, p.z, seg);
        assert.ok(d > seg.width / 2, `${id}: item (${p.x},${p.z}) fora do asfalto da via`);
      }
    }
  }
});

// distância ponto→segmento (mesma matemática de detail3d)
function distToSeg(px, pz, seg) {
  const dx = seg.x2 - seg.x1, dz = seg.z2 - seg.z1;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - seg.x1) * dx + (pz - seg.z1) * dz) / len2));
  return Math.hypot(px - (seg.x1 + dx * t), pz - (seg.z1 + dz * t));
}

test('integração buildScene: registro districtDressing completo nos 5 cenários', () => {
  for (const id of IDS) {
    const { scene } = buildScene(4242, id, null, 'high');
    const registry = scene.userData.districtDressing;
    assert.ok(registry, `${id}: registry presente`);
    assert.equal(registry.id, id);
    for (const kind of SIGNATURES[id]) {
      assert.ok((registry.counts[kind] ?? 0) > 0, `${id}: registry conta ${kind}`);
    }
    assert.ok(registry.animators.length >= 1, `${id}: animators registrados`);
    // grupo está na cena
    assert.ok(registry.group.parent === scene, `${id}: grupo do dressing na cena`);
    // animators rodam em t curto e longo sem erro, sem NaN
    for (const t of [1 / 60, 2.5, 130]) {
      for (const fn of registry.animators) fn(1 / 60, t);
    }
    scene.traverse((o) => {
      if (o.isMesh && o.material?.emissiveIntensity !== undefined) {
        assert.ok(Number.isFinite(o.material.emissiveIntensity), `${id}: emissiveIntensity finito`);
      }
      if (o.isMesh) {
        assert.ok(Number.isFinite(o.position.x) && Number.isFinite(o.position.y) && Number.isFinite(o.position.z),
          `${id}: posição finita`);
      }
    });
    // idempotência: rebuild na mesma cena devolve o MESMO registry (padrão worldmarks)
    const again = buildDistrictDressing(scene, scene.userData.layout, resolveScenario(id), { dressingFactor: 1 });
    assert.equal(again, registry, `${id}: buildDistrictDressing é idempotente`);
  }
});

test('densidade responde ao tier: density menor produz kit igual ou menor', () => {
  const scenario = resolveScenario('Priadus');
  const layout = getWorldLayout('DRESS-DENSITY', scenario.id);
  const full = districtDressing(layout, scenario, { density: 1 });
  const low = districtDressing(layout, scenario, { density: 0.5 });
  assert.ok(low.items.length > 0, 'tier baixo ainda veste o cenário');
  assert.ok(low.items.length <= full.items.length, 'menos itens no tier baixo');
  assert.ok(low.patches.length > 0 && low.patches.length <= full.patches.length, 'patches escalam com o tier');
});

test('patches de solo usam materiais do mundo (lava emissiva, água translúcida, runa alpha)', () => {
  const { scene } = buildScene(77, 'Ckesalth', null, 'high');
  const lavaMeshes = [];
  scene.traverse((o) => {
    if (o.isInstancedMesh && o.material?.emissiveMap && o.material.emissive?.getHexString() === 'ff7a1e') {
      lavaMeshes.push(o);
    }
  });
  assert.ok(lavaMeshes.length >= 1, 'crosta de lava com emissiveMap presente no Ckesalth');

  const { scene: priadus } = buildScene(77, 'Priadus', null, 'high');
  const water = [];
  priadus.traverse((o) => {
    if (o.isInstancedMesh && o.material?.transparent && o.material?.normalMap) water.push(o);
  });
  assert.ok(water.length >= 1, 'poças de água translúcidas com relevo no Priadus');

  const { scene: arukheea } = buildScene(77, 'Arukheea', null, 'high');
  let runeFound = false;
  arukheea.traverse((o) => {
    if (o.isMesh && o.material?.transparent && o.material?.map && o.material.color?.getHexString() === '59e6ff') {
      runeFound = true;
    }
  });
  assert.ok(runeFound, 'círculo de runa astral presente no Arukheea');
});

test('cenários preservados: SCENARIOS intactos pela Fase 22 (contrato de gameplay)', () => {
  assert.equal(Object.keys(SCENARIOS).length, 5);
  assert.equal(SCENARIOS.PRIADUS.ringDamageMultiplier, 1.75);
  assert.equal(SCENARIOS.CKESALTH.survival.type, 'VOLCANIC_LAVA');
  assert.equal(SCENARIOS.ARUKHEEA.survival.anchors.length, 4);
});

// ══════════════════════════════════════════════════════════════════════════
// Fase 26 — PARTÍCULAS REAIS no miolo da arena (fumaça/fendas):
// fogueiras soltam fumaça + fagulhas, lavapatches cospem brasas + wisp de
// calor, fendas do vazio derivam motos e a torre de destilação emite fagulhas
// — tudo no MESMO pool compartilhado dos marcos (1 draw call, ticker único).
// ══════════════════════════════════════════════════════════════════════════

test('Fase 26: fogueiras do Ckesalth soltam fumaça + fagulhas REAIS', () => {
  const { scene } = buildScene(77, 'Ckesalth', null, 'high');
  const system = scene.userData.particles;
  assert.ok(system, 'pool compartilhado existe (districts cria, marks reutiliza)');
  const dressing = scene.userData.districtDressing;
  assert.ok(dressing.counts.campfire >= 1, `fogueira presente (${dressing.counts.campfire})`);
  const before = system.activeCount;
  for (let i = 0; i < 120; i++) for (const fn of dressing.animators) fn(1 / 60, i / 60);
  assert.ok(system.activeCount > before, `fumaça/fagulhas vivas (${before} → ${system.activeCount})`);
});

test('Fase 26: lavapatches (fendas de lava) cospem brasas — Encosta Média/Pico', () => {
  const { scene } = buildScene(77, 'Ckesalth', null, 'high');
  const dressing = scene.userData.districtDressing;
  assert.ok(dressing.counts.lavapatch >= 2, `lavapatches presentes (${dressing.counts.lavapatch})`);
  const system = scene.userData.particles;
  for (let i = 0; i < 180; i++) for (const fn of dressing.animators) fn(1 / 60, i / 60);
  assert.ok(system.activeCount > 0, `brasas vivas (${system.activeCount})`);
  // partículas nascem DENTRO da arena (brasas em x/z |p| ≤ BOUND)
  const snap = system.snapshot();
  const inside = snap.filter((p) => Math.abs(p.x) <= 172 && Math.abs(p.z) <= 172).length;
  assert.ok(inside >= Math.floor(snap.length * .9), `brasas na arena (${inside}/${snap.length})`);
});

test('Fase 26: fenda do vazio no EAST VOID SANCTUM deriva motos (Arukheea)', () => {
  const { scene } = buildScene(33, 'Arukheea', null, 'high');
  const dressing = scene.userData.districtDressing;
  assert.ok(dressing.counts.rift >= 1, `fenda de distrito presente (${dressing.counts.rift})`);
  const system = scene.userData.particles;
  for (let i = 0; i < 240; i++) for (const fn of dressing.animators) fn(1 / 60, i / 60);
  assert.ok(system.activeCount > 0, `motos do vazio vivas (${system.activeCount})`);
});

test('Fase 26/32: CENÁRIOS SEM fontes de distrito ficam com o pool ocioso e integram', () => {
  // Barburhen saiu da lista na F33: as colunas de fumaça viraram emissor REAL
  for (const id of ['CIGKV', 'Priadus']) {
    const { scene } = buildScene(21, id, null, 'high');
    const system = scene.userData.particles;
    assert.ok(system, `${id}: pool existe (marcos criam/reutilizam)`);
    for (let i = 0; i < 60; i++) {
      for (const fn of scene.userData.districtDressing?.animators ?? []) fn(1 / 60, i / 60);
      for (const fn of scene.userData.worldMarks?.animators ?? []) fn(1 / 60, i / 60);
    }
    // CIGKV/Priadus: sem emissor de distrito — pool ocioso ou só marcos
    assert.ok(Number.isFinite(system.activeCount), `${id}: estado finito`);
  }
});

test('F33: smokecolumn do Barburhen — voluta estática REMOVIDA, fumaça REAL no pool', () => {
  const scenario = resolveScenario('Barburhen');
  const layout = getWorldLayout(`DRESS-F33-SMOKE-Barburhen`, scenario.id);
  const placements = districtDressing(layout, scenario, { density: 1 });
  assert.ok((placements.counts.smokecolumn ?? 0) >= 1, 'Barburhen coloca smokecolumn (Industrial/Extração)');

  const { scene } = buildScene(21, 'Barburhen', null, 'high');
  const dressing = scene.userData.districtDressing;
  assert.ok((dressing.counts.smokecolumn ?? 0) >= 1, 'dressing construído com as colunas');
  // F33 — a voluta ESTÁTICA (cone 'plume' flutuante) saiu do builder
  let plumes = 0;
  dressing.group.traverse((o) => { if (o.name === 'plume') plumes++; });
  assert.equal(plumes, 0, 'cone estático de fumaça não existe mais');
  // F33 — emissor REAL: pool vivo com partículas de fumaça após o tick
  const system = scene.userData.particles;
  assert.ok(system, 'pool compartilhado existe');
  for (let i = 0; i < 120; i++) for (const fn of dressing.animators) fn(1 / 60, i / 60);
  assert.ok(system.activeCount > 0, `fumaça real viva (${system.activeCount} partículas)`);
});

// ================== Fase 40 — sombras do dressing em BANDAS DE DISTÂNCIA ====

test('F40 · dressing: hook de bandas assume as sombras (e o estático fica retrocompatível)', () => {
  const layout = getWorldLayout('f40-band', 'CIGKV');
  const q = { dressingFactor: 1 };
  // COM hook de banda: SÓ ele é chamado (o estático não roda junto — sem sombra duplicada)
  const bandCalls = [], staticCalls = [];
  const s1 = new THREE.Scene();
  buildDistrictDressing(s1, layout, resolveScenario('CIGKV'), q, {
    contactShadows: (e) => staticCalls.push(e),
    bandContactShadows: (e) => bandCalls.push(e),
  });
  assert.ok(bandCalls.length === 1 && bandCalls[0].length > 0,
    `hook de banda chamado 1× com ${bandCalls[0]?.length} entradas`);
  assert.equal(staticCalls.length, 0, 'F7 estático NÃO roda quando a banda existe');
  // entradas carregam x/z/rot/size do contrato F22 (y é acrescentado pelo world3d)
  for (const e of bandCalls[0]) {
    assert.ok(Number.isFinite(e.x) && Number.isFinite(e.z) && e.size > 0, `entrada válida (${e.x.toFixed(1)},${e.z.toFixed(1)})`);
  }
  // SEM hook de banda: cai no F7 estático (retrocompatível — contratual)
  const s2 = new THREE.Scene();
  buildDistrictDressing(s2, layout, resolveScenario('CIGKV'), q, {
    contactShadows: (e) => staticCalls.push(e),
  });
  assert.equal(staticCalls.length, 1, 'fallback estático preservado (assinarura F22 intoca)'.replace('assinarura', 'assinatura'));
});
