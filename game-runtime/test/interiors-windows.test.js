// Khaaos Run — Fase 26 — JANELAS DESTRUTÍVEIS (vidro com HP, nível Free Fire).
//
// 1. PLANO PURO: windowPanelsOf — painéis de vidro determinísticos (MESMO plano
//    de parede das folhas de porta), 1:1 com as aberturas do dressing; vidro
//    íntegro tem AABB (windowBoxCollider), quebrado sai do mundo físico.
// 2. BALÍSTICA: bala RACHA o vidro íntegro (para no painel — bala consumida);
//    a quebra ESTILHAÇA e a MESMA bala SEGUE (dano cheio) — vidro não segura
//    projétil. Explosão estilhaça no raio (mesma atenuação das folhas).
// 3. MELEE: coturnada/cano estilhaça no 1º golpe (mult 4,0× de WINDOW).
// 4. LOS: vidro NUNCA entra na LOS (transparente) — colliders kind 'window'
//    são pulados por #hasLos (bots enxergam/atiram pelas janelas como na F24).
// 5. DEPOT METÁLICO: doorMaterialOf estende o metal ao depot (hp 500).
// 6. SERVIDOR: MatchRoom3D autoritativo (snapshot + windowDown GLOBAL).
// 7. HUD: alvo quebrável expõe hp/max (contrato do painel de HP da porta).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildScene } from '../src/game3d/world3d.js';
import {
  interiorDressing, windowPanelsOf, windowBoxCollider,
  WINDOW_MECH, doorMaterialOf, localPointToWorld,
} from '../src/game3d/interiorsPlan.js';
import { getWorldLayout, KhaaosSim3D, WINDOW, DOOR, doorHpFor, DEFAULT_INPUT } from '../src/game3d/sim3d.js';
import { MatchRoom3D } from '../server/room3d.js';
import { resolveScenario } from '../src/game3d/scenarios.js';

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
const idle = (over = {}) => ({ ...DEFAULT_INPUT, ...over });

// ============================================================================
// 1. PLANO PURO — painéis de vidro determinísticos
// ============================================================================

test('windowPanelsOf: determinístico, ids únicos e 1:1 com as aberturas do dressing', () => {
  for (const id of IDS) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`F26-DET-${id}`, scenario.id);
    const dressing = interiorDressing(layout, scenario, { density: 1 });
    const a = windowPanelsOf(layout, dressing);
    const b = windowPanelsOf(layout, dressing);
    assert.deepEqual(a, b, `${id}: mesmo plano em duas chamadas`);
    const expected = dressing.structures.reduce((n, sp) => n + (sp.windows?.length ?? 0), 0);
    assert.equal(a.length, expected, `${id}: um painel por abertura`);
    assert.equal(new Set(a.map((w) => w.id)).size, a.length, `${id}: ids únicos`);
    for (const w of a) {
      assert.ok(w.id.startsWith('win-'), 'id win-<estrutura>-<k>');
      assert.ok(w.w === 1.5 || w.w === 1.7, 'largura do vão (WINDOW_SPEC 1,5 / UPPER 1,7)');
      assert.ok(w.y0 === 1.55 || w.y0 === 3.35, 'peitoril na banda lower/upper');
      assert.ok(w.y1 > w.y0, 'banda vertical válida');
      assert.equal(Math.hypot(w.nx, w.nz), 1, 'normal exterior unitária');
    }
  }
});

test('windowBoxCollider: íntegro AABB no plano da parede; destruído => null', () => {
  const scenario = resolveScenario('CIGKV');
  const layout = getWorldLayout('F26-COL', scenario.id);
  const dressing = interiorDressing(layout, scenario, { density: 1 });
  const panes = windowPanelsOf(layout, dressing);
  assert.ok(panes.length >= 10, 'CIGKV tem vidros suficientes');
  const win = panes[0];
  const box = windowBoxCollider(win);
  assert.ok(box, 'íntegro tem collider');
  assert.equal(box.windowId, win.id);
  assert.equal(box.kind, 'window');
  assert.equal(box.yMin, win.y0);
  assert.equal(box.yMax, win.y1);
  // AABB no plano da parede: espessura = T da parede (0,26) na direção da normal
  const extX = box.maxX - box.minX, extZ = box.maxZ - box.minZ;
  if (win.horizontal) assert.ok(Math.abs(extZ - 0.26) < .01, 'front/back: espessura em Z');
  else assert.ok(Math.abs(extX - 0.26) < .01, 'left/right: espessura em X');
  assert.equal(windowBoxCollider({ ...win, destroyed: true }), null, 'destruído não colide');
});

// ============================================================================
// 2. SIM OFFLINE — balística do vidro
// ============================================================================

test('sim offline: bala RACHA o vidro íntegro (para no painel, hp cai, sem windowDown)', () => {
  const sim = new KhaaosSim3D({ seed: 'F26-S1', botCount: 0, scenarioId: 'CIGKV', airdrop: false });
  sim.started = true;
  const win = sim.windows.find((w) => w.horizontal && !w.destroyed);
  assert.ok(win, 'CIGKV tem vidro horizontal');
  assert.equal(win.hp, WINDOW.hp, 'vidro nasce íntegro');
  assert.ok(sim.physicsWorld.colliders.some((c) => c.windowId === win.id), 'vidro íntegro no mundo físico');
  // 3,5 m a 120 m/s × 1/30 s = 4 m por step — a bala ALCANÇA o painel no step
  sim.bullets.push({
    id: 1, x: win.x + win.nx * 3.5, y: (win.y0 + win.y1) / 2, z: win.z + win.nz * 3.5,
    vx: -win.nx * 120, vy: 0, vz: -win.nz * 120, owner: 'player',
    damage: 22, baseDamage: 22, distance: 0, life: 1, weapon: 'g19',
  });
  sim.step(idle(), 1 / 30);
  assert.equal(win.destroyed, false, '1ª bala de g19 (22) RACHA sem derrubar (30 hp)');
  assert.ok(win.hp < WINDOW.hp && win.hp > 0, `hp caiu sem quebrar (${win.hp})`);
  assert.equal(sim.bullets.length, 0, 'bala CONSUMIDA no vidro íntegro (não atravessa)');
  assert.ok(sim.events.some((e) => e.type === 'impact' && e.kind === 'glass'), 'impact glass p/ FX de cacos');
  assert.equal(sim.events.some((e) => e.type === 'windowDown'), false, 'sem windowDown no rachar');
  assert.ok(sim.physicsWorld.colliders.some((c) => c.windowId === win.id), 'vidro rachado segue no mundo físico');
});

test('sim offline: a bala que ESTILHAÇA SEGUE (vidro não segura projétil) + windowDown', () => {
  const sim = new KhaaosSim3D({ seed: 'F26-S2', botCount: 0, scenarioId: 'CIGKV', airdrop: false });
  sim.started = true;
  const win = sim.windows.find((w) => w.horizontal && !w.destroyed);
  // 1ª bala: racha (hp 30 − 22 = 8)
  sim.bullets.push({
    id: 1, x: win.x + win.nx * 3.5, y: (win.y0 + win.y1) / 2, z: win.z + win.nz * 3.5,
    vx: -win.nx * 120, vy: 0, vz: -win.nz * 120, owner: 'player',
    damage: 22, baseDamage: 22, distance: 0, life: 1, weapon: 'g19',
  });
  sim.step(idle(), 1 / 30);
  assert.equal(win.destroyed, false, 'rachou no 1º');
  // 2ª bala (22 > 8 restantes): estilhaça E SEGUE (life intacta pós-step)
  sim.bullets.push({
    id: 2, x: win.x + win.nx * 3.5, y: (win.y0 + win.y1) / 2, z: win.z + win.nz * 3.5,
    vx: -win.nx * 120, vy: 0, vz: -win.nz * 120, owner: 'player',
    damage: 22, baseDamage: 22, distance: 0, life: 1, weapon: 'g19',
  });
  sim.step(idle(), 1 / 30);
  assert.equal(win.destroyed, true, '2ª bala estilhaça');
  const down = sim.events.find((e) => e.type === 'windowDown');
  assert.ok(down, 'windowDown emitido');
  assert.equal(down.id, win.id);
  assert.equal(sim.physicsWorld.colliders.some((c) => c.windowId === win.id), false, 'vidro SAIU do mundo físico');
  // no mesmo step em que estilhaça, a bala NÃO é consumida (segue com dano cheio)
  assert.ok(sim.bullets.some((b) => b.id === 2), 'bala que estilhaçou SEGUE em voo');
});

test('sim offline: EXPLOSÃO estilhaça o vidro no raio (mesma regra da porta)', () => {
  const sim = new KhaaosSim3D({ seed: 'F26-S3', botCount: 0, scenarioId: 'CIGKV', airdrop: false, spectate: true });
  sim.started = true;
  const win = sim.windows.find((w) => !w.destroyed);
  sim.grenades.push({ id: 1, owner: 'player', x: win.x + win.nx * .5, y: (win.y0 + win.y1) / 2, z: win.z + win.nz * .5, vx: 0, vy: 0, vz: 0, fuse: .01, born: -1 });
  sim.step(idle(), 1 / 30);
  assert.equal(win.destroyed, true, 'explosão no epicentro estilhaça');
  assert.ok(sim.events.some((e) => e.type === 'windowDown' && e.id === win.id), 'windowDown da explosão');
});

// ============================================================================
// 3. MELEE — vidro estilhaça no 1º golpe
// ============================================================================

test('sim offline: MELEE estilhaça o vidro no 1º golpe (mult 4,0× do WINDOW)', () => {
  const sim = new KhaaosSim3D({ seed: 'F26-M1', botCount: 0, airdrop: false });
  sim.start('belt');
  const win = sim.windows.find((w) => w.horizontal && !w.destroyed);
  assert.ok(win, 'CIGKV tem vidro horizontal');
  // sucata 24 dmg × 4.0 = 96 ≫ 30 hp — SEMPRE 1 golpe (qualquer arma melee)
  assert.ok(DOOR.hp >= 0 && 24 * WINDOW.meleeMult > WINDOW.hp, 'mult garante 1 golpe');
  const p = sim.player;
  p.weapon = 'sucata'; p.slots[1] = 'sucata';
  p.x = win.x + win.nx * 1.6; p.z = win.z + win.nz * 1.6; p.y = 0;
  const dx = win.x - p.x, dz = win.z - p.z;
  const yaw = Math.atan2(-dx, -dz);
  sim.step(idle({ yaw, fire: true }), 1 / 30);
  assert.equal(win.destroyed, true, `1º golpe estilhaça (hp ${win.hp})`);
  const events = sim.consumeEvents();
  assert.ok(events.some((e) => e.type === 'windowDown' && e.id === win.id), 'windowDown do melee');
  assert.equal(sim.physicsWorld.colliders.some((c) => c.windowId === win.id), false, 'painel fora da física');
});

// ============================================================================
// 4. LOS — vidro é transparente (não entra no caminho da visão)
// ============================================================================

test('LOS: colliders de vidro existem na física e NUNCA bloqueiam visão (skip kind window)', () => {
  const sim = new KhaaosSim3D({ seed: 'F26-LOS', botCount: 0, scenarioId: 'CIGKV', airdrop: false });
  sim.started = true;
  // vidro íntegro entra na física SÓ para balística (kind 'window')
  const panesInPhysics = sim.physicsWorld.colliders.filter((c) => c.kind === 'window');
  assert.equal(panesInPhysics.length, sim.windows.length, 'um collider por painel íntegro');
  for (const c of panesInPhysics) assert.equal(c.noBlock, undefined, 'vidro colide balisticamente (sem noBlock)');
  // a isenção da LOS é estrutural: #hasLos (sim offline e sala) pula kind
  // 'window' — regridido pelos testes de engage da F24 (bots vêem por janelas)
  const win = sim.windows[0];
  win.destroyed = true;
  sim.syncPhysicsWorld();
  assert.equal(sim.physicsWorld.colliders.some((c) => c.windowId === win.id), false, 'quebrado sai da física');
  assert.equal(sim.physicsWorld.colliders.filter((c) => c.kind === 'window').length, sim.windows.length - 1, 'só o quebrado sai');
});

// ============================================================================
// 5. DEPOT METÁLICO — material da folha estendido ao depot
// ============================================================================

test('depot: porta METÁLICA (hp 500) — mesmo tratamento do hangar', () => {
  assert.equal(doorMaterialOf('depot'), 'metal');
  assert.equal(doorHpFor('depot'), DOOR.hpMetal);
  const scenario = resolveScenario('Ckesalth'); // cenário com depósitos
  const sim = new KhaaosSim3D({ seed: 'F26-DEPOT', botCount: 0, scenarioId: scenario.id, airdrop: false });
  sim.started = true;
  const depotDoor = sim.doors.find((d) => d.kind === 'depot');
  assert.ok(depotDoor, 'cenário tem depot');
  assert.equal(depotDoor.hp, DOOR.hpMetal, 'folha de depot nasce com hp de metal');
  // balas amassam (não estilhaçam fácil): g19 levaria ~23 balas
  sim.bullets.push({
    id: 1, x: depotDoor.x + depotDoor.nx * 4, y: 1.2, z: depotDoor.z + depotDoor.nz * 4,
    vx: -depotDoor.nx * 120, vy: 0, vz: -depotDoor.nz * 120, owner: 'player',
    damage: 22, baseDamage: 22, distance: 0, life: 1, weapon: 'g19',
  });
  sim.step(idle(), 1 / 30);
  assert.equal(depotDoor.destroyed, false, 'metal absorve o 1º tiro');
  assert.equal(depotDoor.hp, DOOR.hpMetal - 22, 'hp caiu 22');
});

// ============================================================================
// 6. SNAPSHOT + SERVIDOR — estado do vidro é autoritativo
// ============================================================================

test('snapshot/applySnapshot: estado do vidro round-trips (idempotente p/ snapshots antigos)', () => {
  const sim = new KhaaosSim3D({ seed: 'F26-SNAP', botCount: 0, scenarioId: 'CIGKV', airdrop: false, spectate: true });
  sim.started = true;
  const win = sim.windows[0];
  win.hp = 0; win.destroyed = true;
  sim.syncPhysicsWorld();
  const snap = sim.snapshot();
  assert.ok(Array.isArray(snap.windows) && snap.windows.length === sim.windows.length, 'snapshot carrega vidros');
  assert.ok(snap.windows.some((w) => w.id === win.id && w.destroyed === true), 'estado quebrado no snapshot');
  const sim2 = new KhaaosSim3D({ seed: 'F26-SNAP', botCount: 0, scenarioId: 'CIGKV', airdrop: false, spectate: true });
  sim2.started = true;
  sim2.applySnapshot(snap);
  const win2 = sim2.windows.find((w) => w.id === win.id);
  assert.equal(win2.destroyed, true, 'quebrado restaurado');
  assert.equal(sim2.physicsWorld.colliders.some((c) => c.windowId === win.id), false, 'quebrado fora da física restaurada');
  // snapshots ANTIGOS (sem windows) são no-op — idempotente
  const sim3 = new KhaaosSim3D({ seed: 'F26-SNAP', botCount: 0, scenarioId: 'CIGKV', airdrop: false, spectate: true });
  sim3.started = true;
  sim3.applySnapshot({ doors: [] }); // sem s.windows
  assert.equal(sim3.windows.every((w) => !w.destroyed), true, 'vidro intacto sem campo no snapshot');
});

test('MatchRoom3D: vidro autoritativo — bala do humano racha, snapshot carrega e windowDown sai GLOBAL', () => {
  // botFill 1: a sala encerra com 1 vivo (last_alive) — 2 vivos mantêm o tick
  // rodando pelos 2 disparos do teste
  const room = new MatchRoom3D({ id: 'r-win1', seed: 'F26-R1', capacity: 4, botFill: 1, airdrop: false, scenarioId: 'CIGKV' });
  room.addPlayer('p1', 'A');
  room.start('p1', 'belt');
  assert.ok(room.windows.length >= 10, `sala tem vidros (${room.windows.length})`);
  const win = room.windows.find((w) => w.horizontal);
  assert.ok(win, 'sala tem vidro horizontal');
  assert.ok(room.physicsWorld.colliders.some((c) => c.windowId === win.id), 'vidro íntegro na física da sala');
  // humano dispara no vidro (bala autoritativa da sala)
  room.humans.get('p1').x = win.x + win.nx * 3;
  room.humans.get('p1').z = win.z + win.nz * 3;
  room.humans.get('p1').y = 0;
  // 3,5 m a 120 m/s × 1/20 s = 6 m por tick — a bala ALCANÇA o painel
  room.bullets.push({
    id: 1, x: win.x + win.nx * 3.5, y: (win.y0 + win.y1) / 2, z: win.z + win.nz * 3.5,
    vx: -win.nx * 120, vy: 0, vz: -win.nz * 120, owner: 'p1',
    damage: 22, baseDamage: 22, distance: 0, life: 1, weapon: 'g19',
  });
  room.tick(1 / 20);
  assert.equal(win.destroyed, false, '1ª bala racha na sala');
  assert.ok(win.hp < WINDOW.hp && win.hp > 0, `hp rachado (${win.hp})`);
  // snapshot da sala carrega o estado do vidro
  const snap = room.snapshot('p1');
  assert.ok(Array.isArray(snap.windows) && snap.windows.length === room.windows.length, 'snapshot da sala carrega vidros');
  // 2ª bala estilhaça e windowDown sai para TODOS os humanos
  room.bullets.push({
    id: 2, x: win.x + win.nx * 3.5, y: (win.y0 + win.y1) / 2, z: win.z + win.nz * 3.5,
    vx: -win.nx * 120, vy: 0, vz: -win.nz * 120, owner: 'p1',
    damage: 22, baseDamage: 22, distance: 0, life: 1, weapon: 'g19',
  });
  room.tick(1 / 20);
  assert.equal(win.destroyed, true, '2ª bala estilhaça na sala');
  const evs = room.drainEvents('p1');
  assert.ok(evs.some((e) => e.type === 'windowDown' && e.id === win.id), 'windowDown GLOBAL ao humano');
  assert.equal(room.physicsWorld.colliders.some((c) => c.windowId === win.id), false, 'vidro fora da física da sala');
});

// ============================================================================
// 7. HUD + VISUAL — contratos do painel de HP e do estilhaço
// ============================================================================

test('HUD: alvo quebrável expõe hp/max coerente (porta metal/madeira e janela)', () => {
  const sim = new KhaaosSim3D({ seed: 'F26-HUD', botCount: 0, scenarioId: 'CIGKV', airdrop: false });
  sim.started = true;
  // portas: max = doorHpFor(kind) — depot/hangar 500, madeira 200
  for (const d of sim.doors) {
    const max = doorHpFor(d.kind);
    assert.equal(d.hp, max, `folha ${d.kind} nasce com hp cheio`);
    assert.ok(max === 500 || max === 200, 'hp canônico da F25.1/26');
  }
  // janelas: max = WINDOW.hp (30)
  for (const w of sim.windows) assert.equal(w.hp, WINDOW.hp, 'vidro nasce íntegro');
  assert.equal(WINDOW.hp, WINDOW_MECH.hp, 'WINDOW herda o plano puro');
});

test('VISUAL: cascas registram os painéis de vidro com o MESMO id do plano puro', () => {
  const seed = 'F26-VIS';
  const { scene, layout } = buildScene(seed, 'CIGKV', null, 'high');
  const reg = scene.userData.interiors;
  const layoutWins = layout.windows;
  assert.ok(reg.glass instanceof Map, 'registry expõe glass Map');
  assert.equal(reg.glass.size, layoutWins.length, 'um mesh de vidro por painel do plano');
  for (const w of layoutWins) {
    const mesh = reg.glass.get(w.id);
    assert.ok(mesh, `painel ${w.id} registrado`);
    assert.equal(mesh.userData.windowId, w.id, 'mesh carrega o id canônico');
    assert.equal(mesh.visible, true, 'vidro nasce visível');
  }
});
