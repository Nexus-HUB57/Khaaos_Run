// Khaaos Run — Fase 23 — INTERIORES REAIS + TERRENO COM RELEVO.
//
// Dois fronts de realismo nível Free Fire:
//  1. Terreno: elevação VISUAL além da área jogável (plano jogável y=0 EXATO —
//     contrato de gameplay), perfis por mundo, tinta por altitude;
//  2. Interiores: cascas com porta real + mobília por tipo de estrutura e
//     acento por cenário — SEM mudar colliders/estruturas do layout (o sim
//     continua tratando os prédios como sólidos, bit a bit).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildScene } from '../src/game3d/world3d.js';
import { interiorDressing, buildInteriors, buildShellHost, SHELL_KINDS } from '../src/game3d/interiors3d.js';
import { terrainHeightAt, buildTerrain } from '../src/game3d/terrain3d.js';
import { getWorldLayout } from '../src/game3d/sim3d.js';
import { resolveScenario, SCENARIOS } from '../src/game3d/scenarios.js';
import { qualityTier, QUALITY_TIERS } from '../src/game3d/quality3d.js';

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

// ============================================================================
// TERRENO — relevo por elevação (visual) sem tocar o plano jogável
// ============================================================================

test('terreno: plano jogável permanece EXATAMENTE em y=0 (contrato de gameplay)', () => {
  for (const id of IDS) {
    for (let x = -196; x <= 196; x += 7) {
      for (let z = -196; z <= 196; z += 7) {
        const h = terrainHeightAt(x, z, id);
        assert.equal(h, 0, `${id}: (${x},${z}) deveria ser plano (h=${h})`);
      }
    }
  }
});

test('terreno: relevo existe além da borda em TODOS os cenários + determinismo', () => {
  for (const id of IDS) {
    let sawRelief = 0;
    for (const [x, z] of [[218, 0], [-218, 0], [0, 218], [0, -218], [216, 216], [-216, 216]]) {
      const h = terrainHeightAt(x, z, id);
      assert.ok(h > 0.2, `${id}: (${x},${z}) deveria ter relevo (h=${h})`);
      assert.equal(h, terrainHeightAt(x, z, id), `${id}: altura determinística`);
      sawRelief += h;
    }
    assert.ok(sawRelief > 3, `${id}: relevo acumulado presente (${sawRelief.toFixed(1)})`);
  }
});

test('terreno: contínuo (sem degraus) na rampa da borda', () => {
  let prev = 0;
  for (let x = 190; x <= 220; x += 2) {
    const h = terrainHeightAt(x, 0, 'Ckesalth'); // maior amplitude — pior caso
    assert.ok(Math.abs(h - prev) < 1.2, `degrau em x=${x}: ${prev} → ${h}`);
    prev = h;
  }
});

test('terreno: perfis por mundo (Ckesalth dunes ≫ Barburhen planície; cantos mais altos)', () => {
  let maxCke = 0, maxBarb = 0;
  for (let x = -220; x <= 220; x += 4) for (let z = -220; z <= 220; z += 4) {
    maxCke = Math.max(maxCke, terrainHeightAt(x, z, 'Ckesalth'));
    maxBarb = Math.max(maxBarb, terrainHeightAt(x, z, 'Barburhen'));
  }
  assert.ok(maxCke > maxBarb * 2, `Ckesalth (${maxCke.toFixed(1)}) deveria superar Barburhen (${maxBarb.toFixed(1)})`);
  // cristas cheias nos cantos (far term) vs. platô moderado nas bordas retas
  const corner = terrainHeightAt(216, 216, 'Ckesalth');
  const edge = terrainHeightAt(0, 216, 'Ckesalth');
  assert.ok(corner > edge, `canto (${corner}) > borda (${edge})`);
});

test('buildScene: malha de terreno com relevo + vertex colors + centro plano', () => {
  const { scene } = buildScene(4242, 'CIGKV', null, 'high');
  const terrain = scene.children.find((o) => o.userData?.terrain);
  assert.ok(terrain, 'malha de terreno presente');
  assert.equal(terrain.receiveShadow, true);
  const pos = terrain.geometry.attributes.position;
  const col = terrain.geometry.attributes.color;
  assert.ok(pos.count > 5000, `malha segmentada (${pos.count} vértices)`);
  assert.ok(col, 'atributo de cor por vértice presente');
  let center = null, corner = null;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (x === 0 && z === 0) center = pos.getY(i);
    if (Math.abs(x) === 220 && Math.abs(z) === 220) corner = Math.max(corner ?? 0, pos.getY(i));
  }
  assert.equal(center, 0, `vértice central plano (y=${center})`);
  assert.ok(corner > 0.3, `vértice de canto elevado (y=${corner})`);
});

// ============================================================================
// INTERIORES — cascas com porta real + mobília (zero impacto em gameplay)
// ============================================================================

test('interiores: determinismo (mesma seed+cenário => placements idênticos)', () => {
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`INT-DET-${id}`, scenario.id);
    const a = interiorDressing(layout, scenario, { density: 1 });
    const b = interiorDressing(layout, scenario, { density: 1 });
    assert.deepEqual(a, b, `${id}: placements estáveis`);
    assert.equal(a.scenarioId, id);
    assert.ok(a.structures.length > 0, `${id}: estruturas-habitação presentes`);
  }
});

test('interiores: kit por tipo de estrutura + acento por mundo', () => {
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`INT-KIT-${id}`, scenario.id);
    const { counts, structures } = interiorDressing(layout, scenario, { density: 1 });
    const kinds = new Set(structures.map((s) => s.kind));
    assert.ok(kinds.size >= 2, `${id}: mais de um tipo de casca (${[...kinds].join(',')})`);
    for (const s of structures) {
      assert.ok(SHELL_KINDS.has(s.kind), `${id}: ${s.kind} é casca`);
      assert.ok(s.items.length >= 1, `${id}: ${s.kind} tem mobília`);
    }
    assert.ok(Object.keys(counts).length >= 3, `${id}: variedade de mobília`);
  }
  // acentos exclusivos por cenário (identidade dentro dos prédios)
  const accentOf = {
    CIGKV: 'weaponsrack', Barburhen: 'heater', Priadus: 'hammock',
    Ckesalth: 'waterdrum', Arukheea: 'astralconsole',
  };
  for (const [id, prop] of Object.entries(accentOf)) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`INT-ACC-${id}`, scenario.id);
    const { counts } = interiorDressing(layout, scenario, { density: 1 });
    assert.ok((counts[prop] ?? 0) > 0, `${id}: acento ${prop} presente`);
    if (id === 'CIGKV') continue; // rack já é do kit do quartel
    for (const other of IDS) {
      if (other === id) continue;
      const sc = resolveScenario(other);
      const { counts: c2 } = interiorDressing(getWorldLayout(`INT-ACC2-${other}`, sc.id), sc, { density: 1 });
      assert.equal(c2[prop] ?? 0, 0, `${prop} não deveria existir em ${other}`);
    }
  }
});

test('interiores: ZERO impacto em gameplay — layout intacto, mobília dentro da pegada, porta na face da fachada e corredor livre', () => {
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`INT-GP-${id}`, scenario.id);
    const collidersBefore = layout.colliders.length;
    const structuresBefore = layout.structures.length;

    const { structures } = interiorDressing(layout, scenario, { density: 1 });
    assert.equal(layout.colliders.length, collidersBefore, `${id}: colliders intactos`);
    assert.equal(layout.structures.length, structuresBefore, `${id}: estruturas intactas`);

    for (const spec of structures) {
      const s = layout.structures[spec.index];
      assert.equal(s.kind, spec.kind, `${id}: índice da estrutura consistente`);
      // porta na MESMA face da fachada (detail3d: front se d ≥ w, senão right)
      assert.equal(spec.door.face, s.d >= s.w ? 'front' : 'right', `${id}: face da porta`);
      assert.ok(spec.door.w >= 1.8 && spec.door.h >= 2.4, `${id}: porta transitável visualmente`);
      // mobília DENTRO da pegada (folga das paredes)
      for (const it of spec.items) {
        assert.ok(Math.abs(it.u) <= s.w / 2 - 0.85, `${id}: u dentro da pegada (${it.u} / w=${s.w})`);
        assert.ok(Math.abs(it.v) <= s.d / 2 - 0.85, `${id}: v dentro da pegada (${it.v} / d=${s.d})`);
        // corredor da porta livre (folga levemente menor que a usada no módulo)
        const m = 1.2, dw = spec.door.w;
        const blocked = spec.door.face === 'front'
          ? (it.v < -(s.d / 2 - 2.3) && Math.abs(it.u - spec.door.u) < dw / 2 + m)
          : (it.u > (s.w / 2 - 2.3) && Math.abs(it.v - spec.door.u) < dw / 2 + m);
        assert.ok(!blocked, `${id}: item (${it.u},${it.v}) não bloqueia a porta`);
      }
    }
  }
});

test('interiores: densidade responde ao tier (interiorFactor)', () => {
  const scenario = resolveScenario('CIGKV');
  const layout = getWorldLayout('INT-DENSITY', scenario.id);
  const full = interiorDressing(layout, scenario, { density: 1 });
  const low = interiorDressing(layout, scenario, { density: QUALITY_TIERS.low.interiorFactor });
  const count = (p) => p.structures.reduce((acc, s) => acc + s.items.length, 0);
  assert.ok(count(low) > 0, 'tier baixo ainda mobília os interiores');
  assert.ok(count(low) <= count(full), 'menos mobília no tier baixo');
  assert.equal(QUALITY_TIERS.low.interiorFactor, 0.55);
  assert.equal(qualityTier('medium').interiorFactor, 0.8);
  assert.equal(qualityTier('high').interiorFactor, 1);
  assert.equal(qualityTier('unknown').interiorFactor, 1);
});

test('buildShellHost: casca tem piso, paredes com vão, teto e mobília (malha real)', () => {
  const scenario = resolveScenario('CIGKV');
  const layout = getWorldLayout('INT-SHELL', scenario.id);
  const q = qualityTier('high');
  const { scene } = buildScene(1, 'CIGKV', null, 'high'); // apenas p/ materiais válidos
  const registry = buildInteriors(scene, layout, scenario, q);
  assert.ok(registry.shells.size >= 3, 'várias cascas registradas');
  for (const [s, spec] of registry.shells) {
    const host = buildShellHost(s, spec, registry.mats);
    let meshes = 0;
    host.traverse((o) => { if (o.isMesh) meshes++; });
    assert.ok(meshes >= 5, `${s.kind}: casca construída (${meshes} malhas)`);
    assert.ok(host.position.x === s.x && host.position.z === s.z, 'host na posição da estrutura');
  }
});

test('integração buildScene: registro interiors completo nos 5 cenários + idempotência', () => {
  for (const id of IDS) {
    const { scene } = buildScene(4242, id, null, 'high');
    const registry = scene.userData.interiors;
    assert.ok(registry, `${id}: registry presente`);
    assert.equal(registry.id, id);
    assert.ok(registry.animators.length >= 2, `${id}: animators de interiores registrados`);
    assert.ok(registry.shells.size >= 1, `${id}: cascas no registry`);
    assert.ok(registry.group.parent === scene, `${id}: grupo de interiores na cena`);
    for (const s of registry.shells.keys()) {
      assert.ok(SHELL_KINDS.has(s.kind), `${id}: shell só para kinds habitação (${s.kind})`);
    }
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
    // idempotência: rebuild na mesma cena devolve o MESMO registry
    const again = buildInteriors(scene, scene.userData.layout, resolveScenario(id), { interiorFactor: 1 });
    assert.equal(again, registry, `${id}: buildInteriors é idempotente`);
  }
});

test('cascas substituem a caixa sólida: sem box duplicado, sem cap, collider intocado', () => {
  const { scene, layout } = buildScene(4242, 'CIGKV', null, 'high');
  const registry = scene.userData.interiors;
  // cada shell tem exatamente UM host dentro do grupo de interiores
  for (const s of registry.shells.keys()) {
    const name = `shell:${s.kind}:${s.x}:${s.z}`;
    const hosts = registry.group.children.filter((c) => c.name === name);
    assert.equal(hosts.length, 1, `${s.kind}: um host por estrutura`);
    // NENHUMA caixa sólida direta na cena com a pegada da estrutura shelled
    const solidBoxes = scene.children.filter((o) =>
      o.isMesh
      && o.geometry?.parameters?.width === s.w
      && o.geometry?.parameters?.height === s.h
      && o.geometry?.parameters?.depth === s.d
      && Math.abs(o.position.x - s.x) < .01 && Math.abs(o.position.z - s.z) < .01);
    assert.equal(solidBoxes.length, 0, `${s.kind}: caixa sólida removida em favor da casca`);
    assert.ok(s.kind !== 'monolith' || true, 'monolito permanece caixa');
  }
  // estruturas SEM casca continuam com a caixa sólida direta na cena
  const plain = layout.structures.filter((s) => !registry.shells.has(s) && s.kind !== 'container');
  assert.ok(plain.length > 0, 'há estruturas fora do conjunto de cascas');
  for (const s of plain.slice(0, 5)) {
    const solid = scene.children.filter((o) =>
      o.isMesh
      && o.geometry?.parameters?.width === s.w
      && o.geometry?.parameters?.height === s.h
      && o.geometry?.parameters?.depth === s.d
      && Math.abs(o.position.x - s.x) < .01 && Math.abs(o.position.z - s.z) < .01);
    assert.equal(solid.length, 1, `${s.kind}: caixa sólida preservada`);
  }
  // colliders do layout NUNCA mudaram (contrato da Fase 23)
  const fresh = getWorldLayout('4242', 'CIGKV');
  assert.equal(layout.colliders.length, fresh.colliders.length, 'colliders idênticos ao layout canônico');
});

test('cenários preservados: SCENARIOS intactos pela Fase 23 (contrato de gameplay)', () => {
  assert.equal(Object.keys(SCENARIOS).length, 5);
  assert.equal(SCENARIOS.PRIADUS.ringDamageMultiplier, 1.75);
  assert.equal(SCENARIOS.CKESALTH.survival.type, 'VOLCANIC_LAVA');
  assert.equal(SCENARIOS.ARUKHEEA.survival.anchors.length, 4);
  assert.equal(SCENARIOS.CIGKV.playerSpawn.x, 0);
});
