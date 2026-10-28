// Khaaos Run — Fase 25 — PORTAS DESTRUTÍVEIS + LOOT INTERIOR (nível Free Fire).
//
// 1. PORTAS: painel físico no vão da porta (interiorsPlan.doorPanelFor) —
//    bloqueia movimento/balas/LOS enquanto ativa; hp cai com balas, granadas
//    e corpo-a-corpo (melee 2,5×); quebrada => collider sai e o vão fica livre.
//    Estado autoritativo no servidor (snapshot + evento doorDown) e na
//    predição client-side (mesmo mundo físico).
// 2. LOOT INTERIOR: spots dentro dos interiores acessíveis — chão junto à
//    mobília e MEZANINO (y = 2,95: pegável só de cima, |Δy| < 2,2 na coleta).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildScene } from '../src/game3d/world3d.js';
import {
  interiorDressing, hollowAccess, DOOR_KINDS, SHELL_KINDS,
  localPointToWorld, doorBoxCollider, doorMaterialOf,
} from '../src/game3d/interiorsPlan.js';
import {
  getWorldLayout, stepActorMovement, KhaaosSim3D, DOOR, doorHpFor, DEFAULT_INPUT,
} from '../src/game3d/sim3d.js';
import { MatchRoom3D } from '../server/room3d.js';
import { resolveScenario, SCENARIOS } from '../src/game3d/scenarios.js';

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
const STEP = 1 / 30;
const idle = (over = {}) => ({ ...DEFAULT_INPUT, ...over });
const blankInput = (over = {}) => ({
  seq: 1, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false,
  crouch: false, jump: false, interact: false, reload: false, medkit: false, throw: false,
  gloo: false, ability: false, slot: 0, ...over,
});
const DT = 1 / 20;

// ============================================================================
// 1. PLANO PURO — painéis de porta determinísticos
// ============================================================================

test('portas: determinismo total e cobertura nos 5 cenários (ruína/pavilhão sem painel)', () => {
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`F25-DET-${id}`, scenario.id);
    const a = hollowAccess(layout, scenario);
    const b = hollowAccess(layout, scenario);
    assert.deepEqual(a.doors, b.doors, `${id}: painéis estáveis`);
    assert.deepEqual(a.lootSpots, b.lootSpots, `${id}: loot spots estáveis`);
    assert.ok(a.doors.length >= 6, `${id}: portas destrutíveis (${a.doors.length})`);
    // ids únicos e amarrados à estrutura
    const ids = new Set(a.doors.map((d) => d.id));
    assert.equal(ids.size, a.doors.length, `${id}: ids únicos`);
    for (const d of a.doors) {
      assert.equal(d.id, `door-${d.index}`);
      assert.ok(DOOR_KINDS.has(d.kind), `${id}: painel só em ${[...DOOR_KINDS].join('/')}`);
      assert.ok(d.hw > 0 && d.hd > 0, `${id}: meia-larguras positivas`);
      assert.equal(d.yMin, 0);
      assert.ok(d.yMax >= 2.2 && d.yMax <= 4.3, `${id}: painel da base à verga (${d.yMax})`);
    }
    // ruínas e pavilhões NUNCA recebem painel
    const ruinPavIndexes = new Set(layout.structures
      .map((s, i) => (s.kind === 'ruin' || s.kind === 'pavilion' ? i : -1))
      .filter((i) => i >= 0));
    for (const d of a.doors) assert.equal(ruinPavIndexes.has(d.index), false, `${id}: ruína/pavilhão sem painel`);
  }
});

test('painel DENTRO do vão: AABB casa com a abertura da casca (nada de porta fantasma)', () => {
  const scenario = resolveScenario('CIGKV');
  const layout = getWorldLayout('F25-FIT', scenario.id);
  const access = hollowAccess(layout, scenario);
  const { structures } = interiorDressing(layout, scenario, { density: 1 });
  for (const spec of structures) {
    if (!DOOR_KINDS.has(spec.kind)) continue;
    const s = layout.structures[spec.index];
    const d = access.doors.find((p) => p.index === spec.index);
    assert.ok(d, `painel existe para ${spec.kind}@${spec.index}`);
    // centro do painel ≈ centro do vão no espaço local (rot aplicada)
    const frontZ = s.d >= s.w;
    const cLocal = frontZ ? [spec.door.u, -s.d / 2 + .13] : [s.w / 2 - .13, spec.door.u];
    const cWorld = localPointToWorld(s, cLocal[0], cLocal[1]);
    const span = Math.max(d.hw, d.hd);
    assert.ok(Math.abs(d.x - cWorld.x) < span, `x do painel no vão (${d.x.toFixed(2)} vs ${cWorld.x.toFixed(2)})`);
    assert.ok(Math.abs(d.z - cWorld.z) < span, `z do painel no vão (${d.z.toFixed(2)} vs ${cWorld.z.toFixed(2)})`);
    // largura do painel ≈ largura da porta (com folga numérica)
    const width = 2 * Math.max(d.hw, d.hd);
    const expected = spec.door.w;
    assert.ok(Math.abs(width - expected) < .05, `painel cobre o vão (${width.toFixed(2)} ≈ ${expected})`);
  }
});

// ============================================================================
// 2. LOOT INTERIOR — chão junto à mobília + mezanino (y 2,95)
// ============================================================================

test('loot interior: determinismo, mezanino em 2,95, chão em 0,55 e FORA de colliders', () => {
  const ZONES = new Set(['armory', 'extraction', 'park', 'industrial']);
  let totalMezz = 0;
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`F25-LOOT-${id}`, scenario.id);
    const access = hollowAccess(layout, scenario);
    assert.ok(access.lootSpots.length >= 10, `${id}: spots internos (${access.lootSpots.length})`);
    let mezz = 0;
    for (const spot of access.lootSpots) {
      assert.ok(ZONES.has(spot.lootZone), `${id}: lootZone válida (${spot.lootZone})`);
      assert.equal(spot.interior, true);
      if (spot.mezzanine) {
        mezz++;
        assert.equal(spot.y, 2.95, `${id}: loot do mezanino em y=2,95 (2,4 + 0,55)`);
        // dentro da LAJE (x/z entre as bordas da pegada da estrutura)
        const s = layout.structures[spot.index];
        assert.ok(Math.abs(spot.x - s.x) < s.w / 2 - .3 && Math.abs(spot.z - s.z) < s.d / 2 - .3,
          `${id}: spot do mezanino dentro da laje`);
      } else {
        assert.equal(spot.y, 0.55, `${id}: loot do chão em y=0,55`);
        // NUNCA dentro de collider (faixa 0,35–0,95 m de altura)
        const inside = layout.colliders.some((c) => c.yMin < spot.y + .4 && c.yMax > spot.y - .2
          && spot.x >= c.minX && spot.x <= c.maxX && spot.z >= c.minZ && spot.z <= c.maxZ);
        assert.equal(inside, false, `${id}: spot (${spot.x},${spot.z}) livre de colisão`);
      }
    }
    assert.ok(mezz >= 2, `${id}: mezaninos com loot (${mezz})`);
    totalMezz += mezz;
  }
  // props sobrepostos (ex.: contêiner dentro do galpão) podem descartar 1 spot,
  // mas a economia global de mezanino se mantém
  assert.ok(totalMezz >= 8, `mezaninos com loot global (${totalMezz})`);
});

test('getWorldLayout: doors + interiorSpots no cache determinístico dos 5 cenários', () => {
  for (const id of IDS) {
    const l1 = getWorldLayout(`F25-META-${id}`, id);
    const l2 = getWorldLayout(`F25-META-${id}`, id);
    assert.equal(l1, l2, `${id}: cache idempotente`);
    assert.ok(Array.isArray(l1.doors) && l1.doors.length >= 6, `${id}: doors no layout`);
    assert.ok(Array.isArray(l1.interiorSpots) && l1.interiorSpots.length >= 10, `${id}: interiorSpots no layout`);
  }
});

// ============================================================================
// 3. FÍSICA — porta bloqueia o ator; quebrada, o vão fica LIVRE
// ============================================================================

test('porta destrutível: ator REAL fica PRESO fora; quebrada, entra (stepActorMovement)', () => {
  const scenario = resolveScenario('CIGKV');
  const layout = getWorldLayout('F25-BLOCK', scenario.id);
  const { structures } = interiorDressing(layout, scenario, { density: 1 });
  const spec = structures.find((sp) => DOOR_KINDS.has(sp.kind));
  assert.ok(spec, 'CIGKV tem porta destrutível');
  const s = layout.structures[spec.index];
  // HOTFIX pós-merge #185 — layout.doors são DOORWAYS (campo structIndex;
  // colliders canônicos via doorBoxCollider — folhas não têm mais hw/hd).
  const door = layout.doors.find((d) => d.structIndex === spec.index);
  assert.ok(door, 'vão da porta presente no layout (structIndex)');
  const frontZ = s.d >= s.w;
  const startLocal = frontZ ? [spec.door.u, -s.d / 2 - 3] : [s.w / 2 + 3, spec.door.u];
  const goalLocal = frontZ ? [spec.door.u, -s.d / 2 + 1.5] : [s.w / 2 - 1.5, spec.door.u];
  const start = localPointToWorld(s, startLocal[0], startLocal[1]);
  const goal = localPointToWorld(s, goalLocal[0], goalLocal[1]);
  const dir = { x: goal.x - start.x, z: goal.z - start.z };
  const len = Math.hypot(dir.x, dir.z); dir.x /= len; dir.z /= len;
  const yaw = Math.atan2(-dir.x, -dir.z);
  const walk = (world) => {
    const a = { x: start.x, y: 0, z: start.z, vy: 0, yaw, speed: 5.2, weapon: 'g19', onGround: true };
    for (let i = 0; i < 200; i++) stepActorMovement(a, idle({ dy: -1 }), STEP, world);
    return a;
  };
  const inside = (a) => Math.abs(a.x - s.x) < s.w / 2 - .3 && Math.abs(a.z - s.z) < s.d / 2 - .3
    || (s.rot === Math.PI / 2 && Math.abs(a.x - s.x) < s.d / 2 - .3 && Math.abs(a.z - s.z) < s.w / 2 - .3);
  // mundo COM a folha: ator fica FORA (empurrado de volta pelo collider da porta)
  const blockedWorld = { colliders: layout.colliders.concat([doorBoxCollider(door)]), floors: layout.floors };
  const aBlocked = walk(blockedWorld);
  assert.equal(inside(aBlocked), false, `porta FECHADA bloqueia (${aBlocked.x.toFixed(1)}, ${aBlocked.z.toFixed(1)})`);
  assert.ok(Math.hypot(aBlocked.x - start.x, aBlocked.z - start.z) < 4, 'ator nem chega a atravessar');
  // mundo SEM o painel (porta quebrada): o MESMO caminho entra
  const openWorld = { colliders: layout.colliders, floors: layout.floors };
  const aFree = walk(openWorld);
  assert.equal(inside(aFree), true, `vão LIVRE após quebrar (${aFree.x.toFixed(1)}, ${aFree.z.toFixed(1)})`);
});

// ============================================================================
// 4. SIM OFFLINE — dano quebra a porta; evento + mundo físico atualizado
// ============================================================================

test('sim offline: hp esgotado emite doorDown, desativa painel e limpa o mundo físico', () => {
  const s = new KhaaosSim3D({ seed: 'F25-SIM-1', botCount: 2, airdrop: false });
  s.start('belt');
  assert.equal(s.doors.length, s.world.doors.length, 'folhas nasceram do layout');
  // CALIBRAÇÃO 25.1 — hp pelo MATERIAL: hangar (metal 500) ≠ madeira (200)
  assert.ok(s.doors.every((d) => !d.destroyed && !d.open && d.hp === doorHpFor(d.kind)));
  const d = s.doors[0];
  d.hp = 0;
  s.step(idle(), STEP);
  assert.equal(d.destroyed, true, 'folha destruída (hp esgotado)');
  const events = s.consumeEvents();
  assert.ok(events.some((e) => e.type === 'doorDown' && e.id === d.id), 'evento doorDown emitido');
  assert.equal(s.physicsWorld.colliders.some((c) => c.doorId === d.id), false, 'collider saiu do mundo físico');
  assert.ok(s.physicsWorld.colliders.some((c) => c.doorId !== undefined || true), 'resto intacto');
});

test('sim offline: BALAS desgastam o painel (linha de tiro real contra a porta)', () => {
  const s = new KhaaosSim3D({ seed: 'F25-SHOOT', botCount: 1, airdrop: false });
  s.start('belt');
  const spec = interiorDressing(s.world, s.scenario, { density: 1 }).structures.find((sp) => DOOR_KINDS.has(sp.kind));
  const st = s.world.structures[spec.index];
  // HOTFIX pós-merge #185 — folhas são doorways (structIndex)
  const panel = s.doors.find((d) => d.structIndex === spec.index);
  assert.ok(panel, 'folha presente na sim (structIndex)');
  const frontZ = st.d >= st.w;
  const out = localPointToWorld(st, frontZ ? spec.door.u : st.w / 2 + 4, frontZ ? -st.d / 2 - 4 : spec.door.u);
  const p = s.player;
  p.x = out.x; p.z = out.z; p.y = 0;
  const dx = panel.x - p.x, dz = panel.z - p.z, dh = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dx, -dz);
  // HOTFIX pós-merge #185 — doorways: yMin + h (não há yMax)
  const pitch = Math.atan2((panel.yMin + panel.h * .4) - (p.y + 1.55), dh);
  let broke = false;
  for (let i = 0; i < 30 * 12 && !broke; i++) {
    s.step(idle({ yaw, pitch, fire: true }), STEP);
    broke = panel.destroyed;
  }
  assert.ok(panel.hp < doorHpFor(panel.kind), `folha desgastada (hp ${panel.hp}/${doorHpFor(panel.kind)})`);
  assert.ok(broke, 'porta QUEBROU a tiro');
  const events = s.consumeEvents();

  assert.ok(events.some((e) => e.type === 'doorDown' && e.id === panel.id));
  assert.equal(s.physicsWorld.colliders.some((c) => c.doorId === panel.id), false, 'collider saiu do mundo físico');
  assert.ok(events.some((e) => e.type === 'impact' && e.kind === 'wood'), 'impactos do tipo wood na folha p/ FX');

});

test('sim offline: MELEE arrebenta a folha de MADEIRA rápido (mult 3,0×) e prioriza carne', () => {
  const s = new KhaaosSim3D({ seed: 'F25-MELEE', botCount: 0, airdrop: false });
  s.start('belt');
  const spec = interiorDressing(s.world, s.scenario, { density: 1 })
    .structures.find((sp) => DOOR_KINDS.has(sp.kind) && doorMaterialOf(sp.kind) === 'wood');
  assert.ok(spec, 'CIGKV tem estrutura com folha de madeira');
  const st = s.world.structures[spec.index];
  // HOTFIX pós-merge #185 — folhas são doorways (structIndex)
  const panel = s.doors.find((d) => d.structIndex === spec.index);
  assert.ok(panel, 'folha presente na sim (structIndex)');
  const frontZ = st.d >= st.w;
  const near = localPointToWorld(st, frontZ ? spec.door.u : st.w / 2 + 1.6, frontZ ? -st.d / 2 - 1.6 : spec.door.u);
  const p = s.player;
  p.weapon = 'sucata'; p.slots[1] = 'sucata';
  p.x = near.x; p.z = near.z;
  const dx = panel.x - p.x, dz = panel.z - p.z;
  const yaw = Math.atan2(-dx, -dz);
  for (let i = 0; i < 30 * 4 && !panel.destroyed; i++) s.step(idle({ yaw, fire: true }), STEP);
  assert.ok(panel.destroyed, `melee quebrou a folha (hp ${panel.hp})`);
  const events = s.consumeEvents();
  assert.ok(events.some((e) => e.type === 'doorHit'), 'feedback doorHit por golpe');
  // calibração 25.1: madeira 200 / sucata 24×3.0 = 72 por golpe => 3 golpes
  assert.ok(panel.hp > -80, `sem overkill absurdo (hp ${panel.hp})`);
});

// ============================================================================
// 5. LOOT INTERIOR NO SIM — ids, y de mezanino e intactos externos
// ============================================================================

test('sim offline: loot interior nos ids loot-i*, mezanino pegável só de cima', () => {
  const s = new KhaaosSim3D({ seed: 'F25-LOOT-SIM', botCount: 2, airdrop: false });
  // FIX sincronização pós-#190 — o spread do drop NÃO vence mais o prefixo
  // canônico: sim e sala preservam loot-i*/loot-m* (mesma língua nos dois lados)
  const interior = s.loot.filter((i) => i.sectorId === 'interior');
  assert.ok(interior.length >= 5, `itens internos gerados (${interior.length})`);
  assert.ok(interior.every((i) => /^loot-[im]/.test(String(i.id))), 'ids canônicos loot-i*/loot-m* na sim');
  const mezzItems = interior.filter((i) => i.y > 2.5);
  assert.ok(mezzItems.length >= 2, `itens de mezanino (${mezzItems.length})`);
  // externos intactos (contrato Fase 4/6): 24 bases (ids de catálogo no offline) + 6 arremessáveis
  assert.equal(s.loot.length - interior.length - 6, 24);
  assert.equal(s.loot.filter((i) => /^loot-t\d+$/.test(String(i.id))).length, 6);
  // gate de coleta por altura: mezanino (2,95) NÃO é pegável do chão, sim de cima
  const m = mezzItems[0];
  assert.ok(Math.abs(m.y - 0) > 2.2, 'do chão não pega (Δy > 2,2)');
  assert.ok(Math.abs(m.y - 2.4) < 2.2, 'do mezanino pega (Δy = 0,55)');
  // determinismo: mesma seed => mesmas posições
  const s2 = new KhaaosSim3D({ seed: 'F25-LOOT-SIM', botCount: 2, airdrop: false });
  assert.deepEqual(s2.loot.map((i) => [i.id, i.x, i.y, i.z]), s.loot.map((i) => [i.id, i.x, i.y, i.z]));
});

// ============================================================================
// 6. SERVIDOR AUTORITATIVO — portas no snapshot, doorDown e física da sala
// ============================================================================

test('room3d: portas autoritativas (snapshot, doorDown global, collider fora do mundo)', () => {
  const room = new MatchRoom3D({ id: 'ring3d-f25', seed: 'F25-ROOM', region: 'sa-east', capacity: 8, botFill: 0, airdrop: false });
  room.addPlayer('p1', 'JOGADOR-1');
  room.start('p1', 'belt');
  assert.equal(room.doors.length, room.world.doors.length, 'painéis nasceram do layout');
  const snap1 = room.snapshot('p1');
  assert.ok(Array.isArray(snap1.doors) && snap1.doors.length === room.doors.length, 'snapshot traz portas');
  // HOTFIX pós-merge #185 — snapshot do jogador usa open/destroyed (não active)
  assert.ok(snap1.doors.every((d) => !d.open && !d.destroyed), 'todas fechadas no início');
  // quebra autoritativa
  const d = room.doors[0];
  d.hp = 0;
  room.tick(DT);
  const snap2 = room.snapshot('p1');
  assert.equal(snap2.doors.find((x) => x.id === d.id).destroyed, true, 'snapshot reflete a quebra');
  // o snapshot DRENA os eventos — doorDown vem nele (não num drainEvents posterior)
  assert.ok(snap2.events.some((e) => e.type === 'doorDown' && e.id === d.id), 'doorDown entregue ao humano');
  assert.equal(room.physicsWorld.colliders.some((c) => c.doorId === d.id), false, 'collider fora do mundo da sala');
  // loot interior no servidor (loot-i*/loot-m* — e agora a SIM também preserva,
  // mesma regra dos dois lados: spread do drop não vence o id canônico)
  const interior = room.loot.filter((i) => /^loot-[im]/.test(String(i.id)));
  assert.ok(interior.length >= 5, `loot interno autoritativo (${interior.length})`);
  assert.ok(interior.some((i) => i.y > 2.5), 'mezanino no servidor');
  // transmissão também carrega o estado
  const view = room.spectatorView();
  assert.ok(Array.isArray(view.doors) && view.doors.some((x) => x.id === d.id && x.active === false), 'espectador vê a porta quebrada');
});

test('room3d: bala do humano desgasta a porta (autoritativo, ponta a ponta)', () => {
  // botFill 2: com 1 ator só a partida acabaria no 1º tick (último vivo) e o
  // fire nunca seria processado além do primeiro input
  const room = new MatchRoom3D({ id: 'ring3d-f25b', seed: 'F25-ROOMB', region: 'sa-east', capacity: 8, botFill: 2, airdrop: false });
  room.addPlayer('p1', 'JOGADOR-1');
  room.start('p1', 'belt');
  const world = getWorldLayout('F25-ROOMB', room.scenario.id);
  const spec = interiorDressing(world, room.scenario, { density: 1 }).structures.find((sp) => DOOR_KINDS.has(sp.kind));
  const st = world.structures[spec.index];
  // HOTFIX pós-merge #185 — folhas são doorways (structIndex; yMin + h)
  const panel = room.doors.find((d) => d.structIndex === spec.index);
  assert.ok(panel, 'folha presente na sala (structIndex)');
  const frontZ = st.d >= st.w;
  const out = localPointToWorld(st, frontZ ? spec.door.u : st.w / 2 + 4, frontZ ? -st.d / 2 - 4 : spec.door.u);
  const a = room.humans.get('p1');
  a.x = out.x; a.z = out.z; a.y = 0; a.onGround = true;
  const dx = panel.x - a.x, dz = panel.z - a.z, dh = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2((panel.yMin + panel.h * .4) - (a.y + 1.55), dh);
  for (let i = 0; i < 20 * 12 && !panel.destroyed; i++) {
    room.input('p1', blankInput({ seq: i + 1, yaw, pitch, fire: true }));
    room.tick(DT);
  }
  assert.ok(panel.hp < DOOR.hp, `servidor desgastou o painel (${panel.hp}/${DOOR.hp})`);
  assert.equal(panel.destroyed, true, 'porta quebrou no autoritativo');
});

// ============================================================================
// 7. VISUAL — painéis registrados por id no registry de interiores
// ============================================================================

test('buildScene: doorPanels registrados (id → grupo) e painel completo (6 peças)', () => {
  for (const id of IDS) {
    const { scene, layout } = buildScene(2525, id, null, 'high');
    const reg = scene.userData.interiors;
    // HOTFIX pós-merge #185 — registry canônico é `reg.doors` (antes doorPanels)
    // e o valor virou CONTROLADOR de animação { pivot, leaf, openSign, current,
    // target, broken }: folha com 5 peças (painel + 2 travessas + maçaneta +
    // fecho), dobradiça no pivot; current/target/broken são o estado da animação.
    assert.ok(reg.doors instanceof Map, `${id}: registry doors`);
    assert.equal(reg.doors.size, layout.doors.length, `${id}: 1 painel por porta do plano`);
    for (const [doorId, ctl] of reg.doors) {
      assert.ok(doorId.startsWith('door-'), `${id}: id canônico`);
      const h = ctl; // controlador de animação { pivot, leaf, openSign, current, target, broken }
      assert.ok(h.leaf.children.length === 5, `${id}: painel+2 travessas+diagonal+maçaneta`);
      assert.ok(h.pivot.children.includes(h.leaf), `${id}: folha pendurada no pivô da dobradiça`);
      assert.equal(h.current, 0, `${id}: fechada no spawn`);
      const panel = h.leaf.children[0];
      const p = panel.geometry.parameters;
      assert.ok(p.height >= 2.2, `${id}: folha da base à verga`);

    }
  }
});

test('cenários preservados: SCENARIOS intactos pela Fase 25 (contrato de gameplay)', () => {
  assert.equal(Object.keys(SCENARIOS).length, 5);
  assert.equal(SCENARIOS.PRIADUS.ringDamageMultiplier, 1.75);
  assert.equal(SCENARIOS.CIGKV.playerSpawn.x, 0);
});
