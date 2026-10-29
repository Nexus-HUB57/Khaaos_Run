// Khaaos Run — Fase 24 — INTERIORES ACESSÍVEIS + RAIOS DE LUZ.
//
// Dois fronts complementares à Fase 23:
//  1. COLLIDERS OCOS: as cascas ganham vão de porta REAL (dá pra entrar) e
//     faixas de janela por onde balas/LOS passam; degraus e mezaninos viram
//     superfícies pisáveis (supportAt + step up/down + pouso varrido);
//  2. RAIOS DE LUZ: cada janela projeta raio aditivo + poça no piso, com
//     gate por tier (lightFactor) e animator de respiração.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildScene } from '../src/game3d/world3d.js';
import {
  interiorDressing, hollowAccess, SHELL_KINDS, MEZZ_KINDS,
  localRectToWorldAabb, localPointToWorld, WINDOW_SPEC,
} from '../src/game3d/interiorsPlan.js';
import { buildLightShafts } from '../src/game3d/lightshafts3d.js';
import {
  getWorldLayout, stepActorMovement, supportAt,
  STEP_UP, STEP_DOWN, PLAYER_R,
} from '../src/game3d/sim3d.js';
import { buildWorldLayout } from '../src/game3d/layout3d.js';
import { resolveScenario, SCENARIOS } from '../src/game3d/scenarios.js';
import { qualityTier, QUALITY_TIERS } from '../src/game3d/quality3d.js';

// stub de canvas p/ texturas procedurais headless (mesmo padrão das demais fases)
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
const input = (over = {}) => ({ dx: 0, dy: 0, sprint: false, ads: false, crouch: false, jump: false, fire: false, reload: false, interact: false, medkit: false, throw: false, gloo: false, slot: 0, ...over });

// ============================================================================
// 1. PLANO PURO — colliders ocos determinísticos
// ============================================================================

test('hollowAccess: determinismo total (mesma seed => mesmos colliders/floors)', () => {
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`F24-DET-${id}`, scenario.id);
    const a = hollowAccess(layout, scenario);
    const b = hollowAccess(layout, scenario);
    assert.deepEqual(a.colliders, b.colliders, `${id}: colliders estáveis`);
    assert.deepEqual(a.floors, b.floors, `${id}: floors estáveis`);
    assert.equal(a.replaced, b.replaced);
    assert.equal(a.windows, b.windows);
    assert.equal(a.mezzanines, b.mezzanines);
  }
});

test('hollowAccess: TODOS os cenários têm portas reais, janelas e mezaninos', () => {
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`F24-COV-${id}`, scenario.id);
    const access = hollowAccess(layout, scenario);
    assert.ok(access.replaced >= 8, `${id}: cascas substituídas (${access.replaced})`);
    assert.ok(access.windows >= 20, `${id}: janelas abertas (${access.windows})`);
    assert.ok(access.mezzanines >= 3, `${id}: mezaninos com escada (${access.mezzanines})`);
    assert.ok(access.floors.length >= access.mezzanines, `${id}: floors ≥ mezaninos`);
    assert.ok(access.colliders.length > layout.structures.length, `${id}: decomposição expandiu colliders`);
  }
});

test('hollowAccess: estruturas SEM casca preservam o collider sólido bit a bit', () => {
  const SOLID_KINDS = ['tower', 'crate', 'wall', 'barrier', 'container', 'silo', 'monolith'];
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const raw = buildWorldLayout(`F24-SOLID-${id}`, scenario.id);
    const layout = getWorldLayout(`F24-SOLID-${id}`, scenario.id);
    // collider sólido original de cada estrutura NÃO-casca (fórmula do addBox)
    let checked = 0;
    raw.structures.forEach((s, i) => {
      if (SHELL_KINDS.has(s.kind)) return;
      const solid = raw.colliders[i];
      if (!solid) return;
      const kept = layout.colliders.find((c) =>
        c.minX === solid.minX && c.maxX === solid.maxX && c.minZ === solid.minZ
        && c.maxZ === solid.maxZ && c.yMin === solid.yMin && c.yMax === solid.yMax && c.kind === solid.kind);
      assert.ok(kept, `${id}: sólido de ${s.kind}@(${s.x},${s.z}) preservado bit a bit`);
      checked++;
    });
    assert.ok(checked >= 5, `${id}: amostragem de sólidos (${checked})`);
  }
});

test('porta REAL: vão de porta sem collider no eixo de passagem (raio laser atravessa)', () => {
  const scenario = resolveScenario('CIGKV');
  const layout = getWorldLayout('F24-DOOR', scenario.id);
  const { structures } = interiorDressing(layout, scenario, { density: 1 });
  const rayHits = (from, to) => {
    const dx = to.x - from.x, dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    for (const c of layout.colliders) {
      // varredura grosseira por amostragem (raio horizontal a 1m de altura)
      for (let t = 0; t <= 1; t += 0.02) {
        const x = from.x + dx * t, z = from.z + dz * t;
        if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.yMin <= 1 && c.yMax >= 1) return true;
      }
    }
    return false;
  };
  let checked = 0;
  for (const spec of structures) {
    if (spec.kind === 'pavilion') continue;
    const s = layout.structures[spec.index];
    const frontZ = s.d >= s.w;
    // ponto externo a 2,5m da face da porta → centro do vão no nível do piso
    const wx = s.x + (frontZ ? spec.door.u : s.w / 2 + 2.5);
    const wz = s.z + (frontZ ? -s.d / 2 - 2.5 : spec.door.u);
    const ix = s.x + (frontZ ? spec.door.u : s.w / 2 - 1);
    const iz = s.z + (frontZ ? -s.d / 2 + 1 : spec.door.u);
    const blocked = rayHits({ x: wx, z: wz }, { x: ix, z: iz });
    assert.equal(blocked, false, `${s.kind}@(${s.x},${s.z}): porta NÃO bloqueia o caminho`);
    checked++;
    if (checked >= 6) break;
  }
  assert.ok(checked >= 4, 'amostragem de portas suficiente');
});

test('janela: peitoril abaixo e verga acima bloqueiam; a FAIXA deixa balas passarem', () => {
  const scenario = resolveScenario('CIGKV');
  const layout = getWorldLayout('F24-WIN', scenario.id);
  const { structures } = interiorDressing(layout, scenario, { density: 1 });
  const hitsBand = (x, z, y) => layout.colliders.some((c) =>
    x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && y >= c.yMin && y <= c.yMax);
  let checked = 0;
  for (const spec of structures) {
    for (const w of spec.windows ?? []) {
      const s = layout.structures[spec.index];
      // ponto NO PLANO da parede (espaço local → mundo, respeita rot 0/90°)
      const frontZ = w.face === 'front' || w.face === 'back';
      const plane = frontZ ? (w.face === 'front' ? -s.d / 2 + .13 : s.d / 2 - .13) : (w.face === 'right' ? s.w / 2 - .13 : -s.w / 2 + .13);
      const u = (w.u0 + w.u1) / 2;
      const p = localPointToWorld(s, frontZ ? u : plane, frontZ ? plane : u);
      const midY = (w.y0 + w.y1) / 2;
      assert.equal(hitsBand(p.x, p.z, midY), false, `faixa da janela (${w.face}) ABERTA a y=${midY}`);
      assert.equal(hitsBand(p.x, p.z, w.y0 - .3), true, 'peitoril abaixo da faixa SÓLIDO');
      assert.equal(hitsBand(p.x, p.z, w.y1 + .3), true, 'verga acima da faixa SÓLIDA');
      // peitoril acima do alcance do salto (apex ≈ 1,24m) — não dá pra "entrar" pela janela
      assert.ok(w.y0 >= 1.4, `peitoril ${w.y0} acima do salto`);
      checked++;
      if (checked >= 8) return;
    }
  }
  assert.ok(checked >= 4, 'amostragem de janelas suficiente');
});

// ============================================================================
// 2. FÍSICA — supportAt, escada, step up/down, pouso varrido
// ============================================================================

test('supportAt: mundo SEM floors legado (0) e com floors retorna o maior topo elegível', () => {
  assert.equal(supportAt({ colliders: [] }, 0, 0, 0), 0, 'mundo sem floors => 0');
  const world = { colliders: [], floors: [
    { minX: -2, maxX: 2, minZ: -2, maxZ: 2, yMax: 2.4 },   // mezanino
    { minX: 0, maxX: 1, minZ: 0, maxZ: 1, yMax: 0.24 },    // degrau
  ] };
  assert.equal(supportAt(world, 0.5, 0.5, 0), 0.24, 'degrau elegível do chão');
  assert.equal(supportAt(world, 0.5, 0.5, 1.9), 2.4, 'mezanino elegível de 1,9m');
  assert.equal(supportAt(world, 0.5, 0.5, 0.2), 0.24, 'step-up sobe até 0,55 acima');
  assert.equal(supportAt(world, 0.5, 0.5, 1.2), 0.24, 'mezanino FORA do alcance do meio-salto');
  assert.equal(supportAt(world, 5, 5, 10), 0, 'fora da pegada => chão');
});

test('escada + mezanino: ator SOBE os degraus e anda no mezanino (stepActorMovement)', () => {
  const scenario = resolveScenario('CIGKV');
  const layout = getWorldLayout('F24-STAIR', scenario.id);
  const { structures } = interiorDressing(layout, scenario, { density: 1 });
  const spec = structures.find((s) => s.stairs);
  assert.ok(spec, 'CIGKV tem mezanino (hangar/galpão)');
  const s = layout.structures[spec.index];
  const st = spec.stairs;
  // ator na BASE da escada, virado para os degraus (+z local)
  const a = { x: s.x + st.x0 + (st.x1 - st.x0) / 2, y: 0, z: s.z + st.z0 - .6, vy: 0, yaw: Math.PI, speed: 5.2, weapon: 'g19', onGround: true };
  // yaw=π → frente -Z invertida = +Z? convenção: frente = (-sin yaw, -cos yaw) → π → (0, +1) = +z ✓
  let landedOnMezz = false;
  for (let i = 0; i < 400 && !landedOnMezz; i++) {
    stepActorMovement(a, input({ dy: -1 }), 1 / 30, layout); // dy=-1 = frente
    if (a.y >= st.height - 1e-6) landedOnMezz = true;
  }
  assert.ok(landedOnMezz, `ator alcançou o mezanino (y=${a.y.toFixed(2)})`);
  assert.ok(a.y >= st.height - .01 && a.y <= st.height + .01, `y assentado no mezanino: ${a.y.toFixed(3)}`);
  // e CAI ao andar além da borda frontal (passa a borda e cai)
  for (let i = 0; i < 240; i++) {
    stepActorMovement(a, input({ dy: 1 }), 1 / 30, layout); // volta para trás → borda
  }
  assert.ok(a.y < 1, `ator caiu da borda do mezanino (y=${a.y.toFixed(2)})`);
});

test('pouso VARRIDO: queda de 40m pousa NO mezanino (anti-tunneling) e no chão fora dele', () => {
  const scenario = resolveScenario('CIGKV');
  const layout = getWorldLayout('F24-SWEEP', scenario.id);
  const { structures } = interiorDressing(layout, scenario, { density: 1 });
  const spec = structures.find((s) => s.stairs);
  const s = layout.structures[spec.index];
  // 1) direto sobre o mezanino (centro da laje): pousa em 2,4
  const a1 = { x: s.x, y: 40, z: s.z + (spec.stairs.mezzZ0 + spec.stairs.mezzZ1) / 2, vy: 0, yaw: 0, speed: 5.2, weapon: 'g19', onGround: false, dropPhase: 'sky' };
  let guard = 0;
  while (!a1.onGround && guard++ < 600) stepActorMovement(a1, input(), 1 / 30, layout);
  assert.equal(a1.y, 2.4, `pousou no mezanino: ${a1.y}`);
  // 2) fora da pegada: pousa no chão y=0
  const a2 = { x: s.x + s.w / 2 + 6, y: 40, z: s.z, vy: 0, yaw: 0, speed: 5.2, weapon: 'g19', onGround: false, dropPhase: 'sky' };
  guard = 0;
  while (!a2.onGround && guard++ < 600) stepActorMovement(a2, input(), 1 / 30, layout);
  assert.equal(a2.y, 0, `pousou no chão: ${a2.y}`);
});

test('paredes ocAs: ator ATRAVESSA o vão da porta e fica DENTRO do prédio', () => {
  const scenario = resolveScenario('CIGKV');
  const layout = getWorldLayout('F24-THRU', scenario.id);
  const { structures } = interiorDressing(layout, scenario, { density: 1 });
  const spec = structures.find((s) => !['pavilion', 'ruin'].includes(s.kind));
  const s = layout.structures[spec.index];
  const frontZ = s.d >= s.w;
  // porta no espaço LOCAL → mundo (respeita rot 0/90°): início 3m FORA, alvo 1,5m DENTRO
  const startLocal = frontZ ? [spec.door.u, -s.d / 2 - 3] : [s.w / 2 + 3, spec.door.u];
  const goalLocal = frontZ ? [spec.door.u, -s.d / 2 + 1.5] : [s.w / 2 - 1.5, spec.door.u];
  const start = localPointToWorld(s, startLocal[0], startLocal[1]);
  const goal = localPointToWorld(s, goalLocal[0], goalLocal[1]);
  const dir = { x: goal.x - start.x, z: goal.z - start.z };
  const len = Math.hypot(dir.x, dir.z); dir.x /= len; dir.z /= len;
  // frente do ator = (-sin yaw, -cos yaw) = dir → yaw = atan2(-dir.x, -dir.z)
  const yaw = Math.atan2(-dir.x, -dir.z);
  const a = { x: start.x, y: 0, z: start.z, vy: 0, yaw, speed: 5.2, weapon: 'g19', onGround: true };
  for (let i = 0; i < 200; i++) stepActorMovement(a, input({ dy: -1 }), 1 / 30, layout);
  const inside = Math.abs(a.x - s.x) < s.w / 2 - .3 && Math.abs(a.z - s.z) < s.d / 2 - .3
    || (s.rot === Math.PI / 2 && Math.abs(a.x - s.x) < s.d / 2 - .3 && Math.abs(a.z - s.z) < s.w / 2 - .3);
  assert.ok(inside, `ator entrou no prédio (${a.x.toFixed(1)}, ${a.z.toFixed(1)} vs centro (${s.x}, ${s.z}) pegada ${s.w}×${s.d})`);
});

test('getWorldLayout: floors + access metadata presentes nos 5 cenários (cache determinístico)', () => {
  for (const id of IDS) {
    const l1 = getWorldLayout(`F24-META-${id}`, id);
    const l2 = getWorldLayout(`F24-META-${id}`, id);
    assert.equal(l1, l2, `${id}: cache idempotente`);
    assert.ok(Array.isArray(l1.floors) && l1.floors.length > 0, `${id}: floors presentes`);
    assert.ok(l1.access.replaced > 0 && l1.access.windows > 0 && l1.access.mezzanines > 0, `${id}: access meta completa`);
  }
});

test('QUALIDADE: lightFactor por tier (low .4 / medium .8 / high 1)', () => {
  assert.equal(QUALITY_TIERS.low.lightFactor, 0.4);
  assert.equal(qualityTier('medium').lightFactor, 0.8);
  assert.equal(qualityTier('high').lightFactor, 1);
});

// ============================================================================
// 3. VISUAL — cascas com janelas/escada + raios de luz
// ============================================================================

test('buildShellHost: cascas têm VIDRO nas janelas e escada/mezanino visuais', () => {
  const { scene, layout } = buildScene(4242, 'CIGKV', null, 'high');
  const registry = scene.userData.interiors;
  let sawGlass = 0, sawSteps = 0, sawSlab = 0;
  for (const host of registry.group.children) {
    host.traverse((o) => {
      if (!o.isMesh) return;
      const mat = o.material;
      if (mat?.transparent && mat?.opacity < .5 && mat?.depthWrite === false) sawGlass++;
      const p = o.geometry?.parameters;
      if (p?.depth && Math.abs(p.depth - .34) < 1e-6 && p.height && Math.abs(p.height - .24) < 1e-6) sawSteps++;
      if (p?.height && Math.abs(p.height - .25) < 1e-6 && p.width && p.width > 6) sawSlab++;
    });
  }
  assert.ok(sawGlass >= 20, `vidros de janela presentes (${sawGlass})`);
  assert.ok(sawSteps >= 10, `degraus visuais presentes (${sawSteps})`);
  assert.ok(sawSlab >= 1, `laje de mezanino presente (${sawSlab})`);
});

test('buildLightShafts: registro, quads de raio + poças, animator finito, idempotência', () => {
  for (const id of IDS) {
    const { scene } = buildScene(777, id, null, 'high');
    const reg = scene.userData.lightshafts;
    assert.ok(reg, `${id}: registry lightshafts presente`);
    assert.equal(reg.id, id);
    assert.ok(reg.counts.shafts >= 10, `${id}: raios (${reg.counts.shafts})`);
    assert.equal(reg.counts.pools, reg.counts.shafts, `${id}: 1 poça por raio`);
    assert.equal(reg.group.parent, scene);
    // geometria indexada com 4 vértices/quad
    const shaftMesh = reg.group.children[0];
    assert.equal(shaftMesh.geometry.attributes.position.count, reg.counts.shafts * 4);
    // animators rodam sem erro/NaN
    for (const t of [1 / 60, 2.5, 130]) for (const fn of reg.animators) fn(1 / 60, t);
    // idempotência
    assert.equal(buildLightShafts(scene, scene.userData.layout, resolveScenario(id), scene.userData.interiors, { lightFactor: 1 }), reg);
  }
});

test('lightFactor: tier baixo gera MENOS raios que o high (gate determinístico)', () => {
  const { scene: sLow } = buildScene(777, 'CIGKV', null, 'low');
  const { scene: sHigh } = buildScene(777, 'CIGKV', null, 'high');
  const low = sLow.userData.lightshafts.counts.shafts;
  const high = sHigh.userData.lightshafts.counts.shafts;
  assert.ok(low > 0 && low < high, `low (${low}) < high (${high})`);
});

test('integração buildScene: nada quebrou nos 5 cenários (posições finitas, colliders ocOs na cena)', () => {
  for (const id of IDS) {
    const { scene, layout } = buildScene(4242, id, null, 'high');
    scene.traverse((o) => {
      if (o.isMesh) assert.ok(Number.isFinite(o.position.x) && Number.isFinite(o.position.z), `${id}: posição finita`);
    });
    assert.ok(layout.floors.length > 0, `${id}: floors no layout da cena`);
    // SEM caixa sólida nas cascas, COM paredes finas (segmentos de casca)
    const registry = scene.userData.interiors;
    for (const s of registry.shells.keys()) {
      const solid = scene.children.filter((o) =>
        o.isMesh && o.geometry?.parameters?.width === s.w && o.geometry?.parameters?.height === s.h
        && o.geometry?.parameters?.depth === s.d && Math.abs(o.position.x - s.x) < .01 && Math.abs(o.position.z - s.z) < .01);
      assert.equal(solid.length, 0, `${s.kind}: caixa sólida continua fora da cena`);
    }
  }
});

test('cenários preservados: SCENARIOS intactos pela Fase 24 (contrato de gameplay)', () => {
  assert.equal(Object.keys(SCENARIOS).length, 5);
  assert.equal(SCENARIOS.PRIADUS.ringDamageMultiplier, 1.75);
  assert.equal(SCENARIOS.PRIADUS.survival.submergeBelowY, 90);
  assert.equal(SCENARIOS.CKESALTH.survival.damagePerSecond, 9);
  assert.equal(SCENARIOS.CIGKV.playerSpawn.x, 0);
});
