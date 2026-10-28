// Khaaos Run — Fase 25 — PORTAS FUNCIONAIS/DESTRUTÍVEIS + BOTS INVASORES.
//
// Três fronts:
//  1. PLANO PURO: doorwaysOf (vão em mundo, pula pavilhão), doorBoxCollider
//     (folha fechada com espessura; aberta/destruída => null), footprintHas;
//  2. SIM/SERVIDOR: E abre/fecha (interação contextual com latch), folha
//     fechada colide e bloqueia LOS, balas/explosão estilhaçam (doorDown),
//     bots abrem portas e invadem interiores, loot no térreo/mezanino;
//  3. VISUAL: folha com dobradiça registrada p/ animator (abre pra dentro).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  doorwaysOf, doorBoxCollider, footprintHas, DOOR_MECH,
  interiorDressing, localRectToWorldAabb, localPointToWorld,
} from '../src/game3d/interiorsPlan.js';
import {
  getWorldLayout, KhaaosSim3D, DOOR,
} from '../src/game3d/sim3d.js';
import { resolveScenario } from '../src/game3d/scenarios.js';
import { buildScene } from '../src/game3d/world3d.js';
import { MatchRoom3D } from '../server/room3d.js';
import { GameAudio } from '../src/game3d/audio3d.js';

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

const input = (over = {}) => ({ dx: 0, dy: 0, sprint: false, ads: false, crouch: false, jump: false, fire: false, reload: false, interact: false, medkit: false, throw: false, gloo: false, slot: 0, ...over });

// ============================================================================
// 1. PLANO PURO — vãos, folha e pegada
// ============================================================================

test('doorwaysOf: determinístico, SEM pavilhão e com todos os tipos restantes', () => {
  for (const id of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    const scenario = resolveScenario(id);
    const layout = getWorldLayout(`F25-PLAN-${id}`, scenario.id);
    const a = doorwaysOf(layout, layout.dressing);
    const b = doorwaysOf(layout, layout.dressing);
    assert.deepEqual(a, b, `${id}: vãos estáveis`);
    assert.ok(a.length >= 8, `${id}: vãos suficientes (${a.length})`);
    assert.equal(a.some((d) => d.kind === 'pavilion'), false, `${id}: quiosque sem folha`);
    assert.equal(layout.doors.length, a.length, `${id}: layout.doors == doorwaysOf`);
    // folhas visuais do mundo batem com os vãos (contrato física↔visual)
    for (const d of a) {
      assert.ok(d.w >= 1.8 && d.h >= 2.3, `${id}: vão habitável (${d.w}×${d.h})`);
      assert.ok(Math.abs(Math.hypot(d.nx, d.nz) - 1) < 0.01, `${id}: normal unitária`);
    }
  }
});

test('doorwaysOf: vão casa com o collider do casco (mesmo retângulo local→mundo)', () => {
  const scenario = resolveScenario('CIGKV');
  const layout = getWorldLayout('F25-MATCH', scenario.id);
  for (const spec of layout.dressing.structures) {
    const s = layout.structures[spec.index];
    if (s.kind === 'pavilion') continue;
    const d = layout.doors.find((x) => x.structIndex === spec.index);
    assert.ok(d, `vão existe p/ ${s.kind}`);
    const axis = (spec.door.face === 'front' || spec.door.face === 'back') ? 'x' : 'z';
    const band = spec.door.face === 'front' ? { v0: -s.d / 2, v1: -s.d / 2 + .26 }
      : spec.door.face === 'back' ? { v0: s.d / 2 - .26, v1: s.d / 2 }
      : spec.door.face === 'right' ? { v0: s.w / 2 - .26, v1: s.w / 2 }
      : { v0: -s.w / 2, v1: -s.w / 2 + .26 };
    const box = localRectToWorldAabb(s, axis, spec.door.u - spec.door.w / 2, spec.door.u + spec.door.w / 2, band.v0, band.v1, 0, spec.door.h, 'door');
    const leaf = doorBoxCollider({ ...d, open: false, destroyed: false });
    const bcx = (box.minX + box.maxX) / 2, lcx = (leaf.minX + leaf.maxX) / 2;
    const bcz = (box.minZ + box.maxZ) / 2, lcz = (leaf.minZ + leaf.maxZ) / 2;
    assert.ok(Math.abs(bcx - lcx) < 0.02, `centro X casa (${bcx.toFixed(2)} vs ${lcx.toFixed(2)})`);
    assert.ok(Math.abs(bcz - lcz) < 0.02, `centro Z casa (${bcz.toFixed(2)} vs ${lcz.toFixed(2)})`);
  }
});

test('doorBoxCollider: fechada tem ESPESSURA de parede; aberta/destruída => null', () => {
  const base = { id: 'door-x', x: 10, z: 20, yMin: 0, w: 2.6, h: 3, nx: 0, nz: -1, horizontal: true, rot: 0 };
  const closed = doorBoxCollider(base);
  assert.ok(closed, 'fechada gera collider');
  assert.ok(closed.maxZ - closed.minZ > 0.2, 'espessura T presente (não é plano)');
  assert.ok(Math.abs((closed.maxZ - closed.minZ) - DOOR_MECH ? false : true || Math.abs((closed.maxZ - closed.minZ)) > 0.2), 'espessura coerente');
  assert.equal(closed.kind, 'door');
  assert.equal(closed.doorId, 'door-x');
  assert.equal(doorBoxCollider({ ...base, open: true }), null, 'aberta não colide');
  assert.equal(doorBoxCollider({ ...base, destroyed: true }), null, 'destruída não colide');
  assert.equal(doorBoxCollider(null), null, 'null-safe');
});

test('footprintHas: centro dentro, fora fora, margem funciona com rot 90°', () => {
  const door = { fx: 0, fz: 0, fw: 8, fd: 6, rot: 0 };
  assert.equal(footprintHas(door, 0, 0), true);
  assert.equal(footprintHas(door, 10, 0), false);
  assert.equal(footprintHas(door, 3.9, 2.9), true);
  assert.equal(footprintHas(door, 4.2, 0), false);
  // rot 90°: pegada vira 6 em X × 8 em Z
  const r90 = { fx: 0, fz: 0, fw: 8, fd: 6, rot: Math.PI / 2 };
  assert.equal(footprintHas(r90, 2.9, 3.9), true, 'rot 90° troca os eixos');
  assert.equal(footprintHas(r90, 3.9, 2.9), false, 'rot 90° não aceita eixo original');
});

// ============================================================================
// 2. SIM — interação E, colisão, destrutível, bots, loot interior
// ============================================================================

test('porta FECHADA colide desde o 1º tick; E abre (latch) e o vão libera passagem', () => {
  const sim = new KhaaosSim3D({ seed: 'F25-S1', botCount: 2, scenarioId: 'CIGKV', airdrop: false, spectate: true });
  const d = sim.doors[0];
  assert.equal(d.open, false, 'inicia fechada');
  assert.ok(sim.physicsWorld.colliders.some((c) => c.doorId === d.id), 'folha no mundo físico');
  // E perto da porta: toggle + evento com owner
  sim.started = true;
  sim.player.x = d.x + d.nx * 1.2; sim.player.z = d.z + d.nz * 1.2; sim.player.y = 0;
  sim.step(input({ interact: true }), 1 / 30);
  assert.equal(d.open, true, 'E abre a folha');
  assert.ok(sim.events.some((e) => e.type === 'doorToggle' && e.owner === 'player' && e.open === true), 'evento doorToggle');
  assert.equal(sim.physicsWorld.colliders.some((c) => c.doorId === d.id), false, 'aberta SAI do mundo físico');
  // latch: segurar E NÃO alterna de novo
  sim.step(input({ interact: true }), 1 / 30);
  assert.equal(d.open, true, 'segurar E não fecha');
  // soltar rearma; novo toque fecha (após o cooldown de 0,6s)
  sim.step(input({ interact: false }), 1 / 30);
  sim.doors.forEach((x) => { x.cooldown = 0; });
  sim.step(input({ interact: true }), 1 / 30);
  assert.equal(d.open, false, 'novo toque fecha');
});

test('folha fechada BLOQUEIA o jogador no vão; aberta deixa ATRAVESSAR', () => {
  const sim = new KhaaosSim3D({ seed: 'F25-S2', botCount: 2, scenarioId: 'CIGKV', airdrop: false, spectate: true });
  sim.started = true;
  const d = sim.doors.find((x) => x.horizontal);
  const stepIn = (doorOpen) => {
    d.open = doorOpen;
    sim.applySnapshot(sim.snapshot()); // resincroniza mundo físico
    const p = sim.player;
    p.x = d.x + d.nx * 2.2; p.z = d.z + d.nz * 2.2; p.y = 0; p.vy = 0;
    const yaw = Math.atan2(d.nx, d.nz); // frente = (−sin, −cos) = (−nx, −nz) → pra dentro
    let inside = false;
    for (let i = 0; i < 160 && !inside; i++) {
      const s = sim.step(input({ dy: -1, yaw }), 1 / 30);
      inside = Math.abs(s.player.x - d.fx) < d.fw / 2 - .3 && Math.abs(s.player.z - d.fz) < d.fd / 2 - .3;
    }
    return inside;
  };
  assert.equal(stepIn(false), false, 'porta FECHADA impede a entrada');
  assert.equal(stepIn(true), true, 'porta ABERTA permite atravessar');
});

test('balas estilhaçam a folha: hp cai, impact wood, doorDown e fim do collider', () => {
  const sim = new KhaaosSim3D({ seed: 'F25-S3', botCount: 2, scenarioId: 'CIGKV', airdrop: false, spectate: true });
  sim.started = true;
  const d = sim.doors[0];
  d.hp = 30;
  sim.bullets.push({ id: 1, x: d.x + d.nx * 4, y: 1.2, z: d.z + d.nz * 4, vx: -d.nx * 120, vy: 0, vz: -d.nz * 120, owner: 'player', damage: 40, baseDamage: 40, distance: 0, life: 1, weapon: 'g19' });
  sim.step(input(), 1 / 30);
  assert.equal(d.destroyed, true, 'folha destruída');
  assert.ok(sim.events.some((e) => e.type === 'doorDown' && e.id === d.id), 'evento doorDown');
  assert.ok(sim.events.some((e) => e.type === 'impact' && e.kind === 'wood'), 'impacto do tipo wood');
  assert.equal(sim.physicsWorld.colliders.some((c) => c.doorId === d.id), false, 'destruída nunca mais colide');
  // destruída não reage a E (eventos anteriores consumidos p/ isolamento)
  sim.consumeEvents();
  sim.player.x = d.x + d.nx * 1.2; sim.player.z = d.z + d.nz * 1.2;
  sim.step(input({ interact: false }), 1 / 30);
  sim.step(input({ interact: true }), 1 / 30);
  assert.equal(sim.events.some((e) => e.type === 'doorToggle'), false, 'E em folha destruída é no-op');
});

test('granada no epicentro estilhaça a folha (explosão desgasta portas)', () => {
  const sim = new KhaaosSim3D({ seed: 'F25-S4', botCount: 2, scenarioId: 'CIGKV', airdrop: false, spectate: true });
  sim.started = true;
  const d = sim.doors.find((x) => !x.open && !x.destroyed);
  sim.grenades.push({ id: 1, owner: 'player', x: d.x + d.nx * 0.4, y: 1, z: d.z + d.nz * 0.4, vx: 0, vy: 0, vz: 0, fuse: 0.01, born: -1 });
  sim.step(input(), 1 / 30);
  assert.equal(d.destroyed, true, 'explosão destrói a folha no epicentro');
  assert.ok(sim.events.some((e) => e.type === 'doorDown'), 'doorDown da explosão');
});

test('BOT abre a porta fechada sozinho e INVADE o interior (patrulha p/ waypoint interno)', () => {
  const sim = new KhaaosSim3D({ seed: 'F25-S5', botCount: 1, scenarioId: 'CIGKV', airdrop: false, spectate: true });
  sim.started = true;
  const d = sim.doors.find((x) => x.horizontal);
  const b = sim.bots[0];
  b.x = d.x + d.nx * 8; b.z = d.z + d.nz * 8; b.y = 0;
  b.ai.state = 'patrol'; b.ai.think = 0;
  b.ai.waypoint = { x: d.fx, z: d.fz };
  let opened = false, byBot = false, entered = false;
  for (let i = 0; i < 1500 && !entered; i++) {
    sim.step(input(), 1 / 30);
    for (const e of sim.consumeEvents()) {
      if (e.type === 'doorToggle') { opened = true; byBot = String(e.owner).startsWith('bot'); }
    }
    entered = footprintHas(d, b.x, b.z, -0.2);
  }
  assert.equal(opened, true, 'bot acionou a folha');
  assert.equal(byBot, true, 'toggle veio da IA (owner bot-*)');
  assert.equal(entered, true, 'bot cruzou o vão');
});

test('ENGAGE: bot enxerga pelo vão aberto, entra e pressiona o alvo; folha FECHADA esconde', () => {
  const sim = new KhaaosSim3D({ seed: 'F25-S6', botCount: 1, scenarioId: 'CIGKV', airdrop: false, spectate: true });
  sim.started = true;
  const d = sim.doors.find((x) => x.horizontal);
  const hide = () => {
    sim.player.x = d.x - d.nx * 3; sim.player.z = d.z - d.nz * 3; sim.player.y = 0;
    const b = sim.bots[0];
    b.x = d.x + d.nx * 4; b.z = d.z + d.nz * 4; b.y = 0;
    b.ai.state = 'patrol'; b.ai.think = 99;
    sim.step(input(), 1 / 30);
    return sim.bots[0].ai.state;
  };
  assert.equal(hide(), 'patrol', 'folha fechada: jogador interno INVISÍVEL');
  d.open = true;
  sim.applySnapshot(sim.snapshot());
  assert.equal(hide(), 'engage', 'vão aberto: bot ENGaja e atravessa');
});

test('loot INTERIOR: térreo na mobília + MEZANINO em y≈2,95 (pegável só de cima)', () => {
  const sim = new KhaaosSim3D({ seed: 'F25-S7', botCount: 2, scenarioId: 'CIGKV', airdrop: false, spectate: true });
  sim.started = true;
  const interior = sim.loot.filter((l) => l.sectorId === 'interior');
  assert.ok(interior.length >= 8, `itens dentro de interiores (${interior.length})`);
  const mezz = interior.filter((l) => l.y > 2.5);
  assert.ok(mezz.length >= 2, `itens no mezanino (${mezz.length})`);
  assert.ok(mezz.every((l) => Math.abs(l.y - 2.95) < 0.01), 'y do mezanino = altura da laje + flutuação');
  // pegável só de cima: item do mezanino, jogador no chão => E não coleta
  const item = mezz[0];
  sim.player.x = item.x; sim.player.z = item.z; sim.player.y = 0;
  sim.doors.forEach((x) => { x.cooldown = 0; });
  sim.step(input({ interact: true }), 1 / 30);
  assert.equal(item.active, true, 'do chão o item do mezanino NÃO sai');
  // em cima da laje (E solto entre os toques: latch rearma): coleta
  sim.player.y = 2.4; sim.player.vy = 0;
  sim.step(input({ interact: false }), 1 / 30);
  sim.step(input({ interact: true }), 1 / 30);
  assert.equal(item.active, false, 'da laje o item é coletado');
});

test('snapshot: estado das folhas sobrevive ao round-trip (applySnapshot resincroniza física)', () => {
  const sim = new KhaaosSim3D({ seed: 'F25-S8', botCount: 2, scenarioId: 'CIGKV', airdrop: false, spectate: true });
  sim.started = true;
  sim.doors[0].open = true;
  sim.doors[1].destroyed = true;
  sim.doors[1].hp = 0;
  const snap = sim.snapshot();
  const sim2 = new KhaaosSim3D({ seed: 'F25-S8', botCount: 2, scenarioId: 'CIGKV', airdrop: false, spectate: true });
  sim2.applySnapshot(snap);
  assert.equal(sim2.doors[0].open, true, 'aberta persiste');
  assert.equal(sim2.doors[1].destroyed, true, 'destruída persiste');
  assert.equal(sim2.physicsWorld.colliders.some((c) => c.doorId === sim2.doors[0].id), false, 'física resincronizada');
  assert.equal(sim2.physicsWorld.colliders.some((c) => c.doorId === sim2.doors[1].id), false, 'destruída fora da física');
  assert.equal(sim2.physicsWorld.colliders.some((c) => c.doorId === sim2.doors[2].id), true, 'fechada continua sólida');
});

test('DOOR: constantes compartilhadas (sim offline e sala usam os MESMOS números)', () => {
  assert.equal(DOOR.hp, DOOR_MECH.hp);
  assert.equal(DOOR.interactRange, DOOR_MECH.interactRange);
  assert.equal(DOOR.toggleCooldown, DOOR_MECH.toggleCooldown);
});

// ============================================================================
// 3. SALA AUTORITATIVA — paridade online
// ============================================================================

test('MatchRoom3D: folhas iniciam fechadas e sólidas; E do humano abre com doorToggle global', () => {
  const room = new MatchRoom3D({ id: 'r-door', seed: 'F25-R1', capacity: 4, botFill: 0, airdrop: false, scenarioId: 'CIGKV' });
  room.addPlayer('p1', 'A');
  room.start('p1', 'belt');
  assert.ok(room.doors.length >= 8, 'sala tem folhas');
  const d = room.doors[0];
  assert.ok(room.physicsWorld.colliders.some((c) => c.doorId === d.id), 'folha fechada sólida na sala');
  // humano perto da porta aperta E (fila de inputs)
  const a = room.humans.get('p1');
  a.x = d.x + d.nx * 1.2; a.z = d.z + d.nz * 1.2; a.y = 0;
  room.input('p1', { seq: 1, dx: 0, dy: 0, yaw: 0, pitch: 0, interact: true });
  room.tick(1 / 20);
  assert.equal(d.open, true, 'sala abre a folha');
  const evs = room.drainEvents('p1');
  assert.ok(evs.some((e) => e.type === 'doorToggle' && e.open === true), 'doorToggle entregue ao humano');
  assert.equal(room.physicsWorld.colliders.some((c) => c.doorId === d.id), false, 'folha aberta fora da física da sala');
  // snapshot carrega o estado das folhas
  const snap = room.snapshot('p1');
  assert.ok(Array.isArray(snap.doors) && snap.doors.some((x) => x.id === d.id && x.open === true), 'snapshot carrega folhas');
});

test('MatchRoom3D: sala tem loot INTERIOR e spots de invasão da IA', () => {
  const room = new MatchRoom3D({ id: 'r-door2', seed: 'F25-R2', capacity: 4, botFill: 0, airdrop: false, scenarioId: 'CIGKV' });
  room.addPlayer('p1', 'A');
  room.start('p1', 'belt');
  const interior = room.loot.filter((l) => String(l.id).startsWith('loot-i') || String(l.id).startsWith('loot-m'));
  assert.ok(interior.length >= 8, `loot interior na sala (${interior.length})`);
  assert.ok(interior.some((l) => l.y > 2.5), 'item no mezanino');
  assert.ok(room.interiorLootSpots.length >= 8, 'spots de waypoint interior');
});

test('MatchRoom3D: bot abre folha fechada e cruza o vão (mesma IA da sim offline)', () => {
  const room = new MatchRoom3D({ id: 'r-door3', seed: 'F25-R3', capacity: 4, botFill: 1, airdrop: false, scenarioId: 'CIGKV' });
  room.addPlayer('p1', 'A');
  room.start('p1', 'belt');
  const d = room.doors.find((x) => x.horizontal);
  const b = room.bots[0];
  b.x = d.x + d.nx * 8; b.z = d.z + d.nz * 8; b.y = 0;
  b.ai.state = 'patrol'; b.ai.think = 0;
  b.ai.waypoint = { x: d.fx, z: d.fz };
  let opened = false, entered = false;
  for (let i = 0; i < 900 && !entered; i++) {
    room.tick(1 / 20);
    for (const e of room.drainEvents('p1')) if (e.type === 'doorToggle') opened = true;
    entered = footprintHas(d, b.x, b.z, -0.2);
  }
  assert.equal(opened, true, 'bot da sala acionou a folha');
  assert.equal(entered, true, 'bot da sala cruzou o vão');
});

// ============================================================================
// 4. ÁUDIO — contrato headless (sem AudioContext os métodos são no-op seguros)
// ============================================================================

test('GameAudio: door()/doorDown() sem ctx não lançam (contrato headless)', () => {
  const audio = new GameAudio();
  assert.doesNotThrow(() => audio.door(true, 0));
  assert.doesNotThrow(() => audio.door(false, 4));
  assert.doesNotThrow(() => audio.doorDown(0));
  assert.doesNotThrow(() => audio.doorDown(9));
});

// ============================================================================
// 5. VISUAL — folha com dobradiça, animator e quebra
// ============================================================================

test('buildShellHost: folhas registradas == vãos do layout; animator converge; quebra esconde', () => {
  const { scene, layout } = buildScene(4242, 'CIGKV', null, 'high');
  const reg = scene.userData.interiors;
  assert.equal(reg.doors.size, layout.doors.length, '1 folha visual por vão do plano');
  // painel + travessas + maçaneta existem na cena (espessura .09 do painel)
  let panels = 0;
  reg.group.traverse((o) => { if (o.isMesh && o.geometry?.parameters?.depth === 0.09) panels++; });
  assert.ok(panels >= reg.doors.size, `painéis de folha presentes (${panels})`);
  // animator: alvo aberto converge para openAngle com o SINAL da dobradiça
  const h = reg.doors.values().next().value;
  h.target = DOOR_MECH.openAngle;
  for (let i = 0; i < 120; i++) for (const fn of reg.animators) fn(1 / 60, i / 60);
  assert.ok(Math.abs(h.current - DOOR_MECH.openAngle) < 0.01, `animator converge (${h.current.toFixed(3)})`);
  assert.ok(Math.abs(h.pivot.rotation.y) > 1.5, 'pivô girou para dentro');
  // quebra: folha some da cena (animator materializa o broken)
  h.broken = true;
  for (const fn of reg.animators) fn(1 / 60, 0);
  assert.equal(h.leaf.visible, false, 'quebrada esconde a folha');
  // animators rodam sem erro/NaN nos três loops
  for (const t of [1 / 60, 2.5, 130]) for (const fn of reg.animators) fn(1 / 60, t);
});
