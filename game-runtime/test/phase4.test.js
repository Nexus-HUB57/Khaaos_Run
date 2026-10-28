// Khaaos Run — Fase 4: infiltração aérea (paraquedas) + arremessáveis táticos
// (granada FRAG + Gloo Wall). Cobre a sim offline determinística, a MatchRoom3D
// autoritativa (incl. anti-cheat dos one-shots) e a predição client-side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchRoom3D } from '../server/room3d.js';
import { validateInput3D } from '../server/antiCheat.js';
import { KhaaosSim3D } from '../src/game3d/sim3d.js';

const STEP = 1 / 30;
const DT = 1 / 20;

// ---------- helpers ----------
const groundSim = (seed, botCount = 0) => new KhaaosSim3D({ seed, botCount, airdrop: false });
const blank = (over = {}) => ({
  seq: 1, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false,
  jump: false, interact: false, reload: false, medkit: false, throw: false, gloo: false, slot: 0, ...over,
});
const idle = (yaw = 0, pitch = 0) => blank({ yaw, pitch });
function makeRoom({ humans = 3, botFill = 0, seed = 'P4-3D' } = {}) {
  const room = new MatchRoom3D({ id: 'ring3d-p4', seed, region: 'sa-east', capacity: 16, botFill, airdrop: true });
  for (let i = 0; i < humans; i++) room.addPlayer(`p${i + 1}`, `JOGADOR-${i + 1}`);
  return room;
}

// ---------- infiltração aérea (sim offline) ----------
test('fase4 sim: airdrop inicia no céu, proíbe combate no ar e aterrissa em tempo finito', () => {
  const s = new KhaaosSim3D({ seed: 'DROP-1', botCount: 2 }); // airdrop ON por padrão
  s.start('belt');
  assert.equal(s.player.dropPhase, 'sky');
  assert.ok(s.player.y >= 130, `altitude inicial ${s.player.y}`);
  assert.equal(s.player.onGround, false);
  for (const b of s.bots) assert.equal(b.dropPhase, 'sky');

  // sem tiro no ar: munição intacta mesmo com fire pressionado
  const mag0 = s.player.ammoMag;
  for (let i = 0; i < 40; i++) s.step({ ...idle(0, -0.2), fire: true }, STEP);
  assert.equal(s.player.ammoMag, mag0, 'fire ignorado durante a queda');
  assert.equal(s.player.dropPhase, 'sky', 'queda livre nos primeiros 1,3 s');

  // paraquedas abre automaticamente a 45 m (~2,6 s de queda)
  for (let i = 0; i < 120; i++) s.step({ ...idle(0, -0.2), fire: true }, STEP);
  assert.equal(s.player.dropPhase, 'chute', 'abertura automática do paraquedas');

  // aterrissagem determinística em tempo finito (~8,5 s) — jogador E bots
  const allLanded = () => s.player.dropPhase === null && s.player.onGround && s.bots.every((b) => b.dropPhase === null);
  let landed = false;
  for (let i = 0; i < 30 * 14; i++) { s.step(idle(), STEP); if (allLanded()) { landed = true; break; } }
  assert.equal(landed, true, 'jogador e bots devem aterrissar');
  assert.equal(s.player.y, 0);
  // bots também aterrissam
  for (const b of s.bots) assert.equal(b.dropPhase, null, `${b.id} deve aterrissar`);
  // evento land emitido
  const events = s.consumeEvents();
  assert.ok(events.some((e) => e.type === 'land'), 'evento land esperado');
  // airdrop determinístico: mesma seed → mesma posição de aterrissagem
  const s2 = new KhaaosSim3D({ seed: 'DROP-1', botCount: 2 });
  s2.start('belt');
  for (let i = 0; i < 30 * 12; i++) s2.step(idle(), STEP);
  assert.equal(Math.abs(s2.player.x - s.player.x) < 1e-9, true);
  assert.equal(Math.abs(s2.player.z - s.player.z) < 1e-9, true);
});

test('fase4 sim: controle de deriva direciona a queda (input afeta o destino)', () => {
  const a = new KhaaosSim3D({ seed: 'DRIFT-A', botCount: 0 });
  a.start('belt');
  for (let i = 0; i < 120; i++) a.step({ ...idle(0), dy: -1 }, STEP); // deriva para frente
  const b = new KhaaosSim3D({ seed: 'DRIFT-A', botCount: 0 });
  b.start('belt');
  for (let i = 0; i < 120; i++) b.step(idle(), STEP); // cai quase parado
  const drift = Math.hypot(a.player.x - b.player.x, a.player.z - b.player.z);
  assert.ok(drift > 8, `deriva deve mudar o destino (>8m): ${drift.toFixed(1)}m`);
});

// ---------- granada FRAG (sim offline) ----------
test('fase4 sim: granada consome inventário, detona no pavio e mata bot no epicentro', () => {
  const s = groundSim('FRAG-1', 1);
  s.start('belt');
  const p = s.player, bot = s.bots[0];
  s.world.colliders.length = 0;
  s.doors.length = 0; s.syncPhysicsWorld(); // Fase 25 — painéis fora da linha unitária (dinâmico)
  assert.equal(p.inventory.frag, 1);
  s.step({ ...idle(0), throw: true }, STEP);
  assert.equal(p.inventory.frag, 0, 'granada consumida');
  assert.equal(s.grenades.length, 1, 'projétil em voo');
  assert.equal(s.grenades[0].owner, 'player');
  // acompanha a granada com o bot até a detonação (epicentro garantido)
  for (let i = 0; i < 30 * 4 && s.grenades.length > 0; i++) {
    s.step(idle(), STEP);
    if (s.grenades[0]) { bot.x = s.grenades[0].x; bot.z = s.grenades[0].z; bot.armor = 0; }
  }
  assert.equal(bot.alive, false, 'bot no epicentro deve morrer (110 de dano)');
  assert.equal(p.kills, 1, 'abate creditado ao arremessador');
  const events = s.consumeEvents();
  assert.ok(events.some((e) => e.type === 'explosion'));
  assert.ok(events.some((e) => e.type === 'frag'));
});

test('fase4 sim: granada sem estoque não lança', () => {
  const s = groundSim('FRAG-2', 0);
  s.start('belt');
  s.player.inventory.frag = 0;
  s.step({ ...idle(0), throw: true }, STEP);
  assert.equal(s.grenades.length, 0, 'sem frag não há lançamento');
});

test('fase4 unit: explosionDamage — dano cheio no epicentro, decai e atenua atrás de parede', async () => {
  const { explosionDamage, glooCollider } = await import('../src/game3d/sim3d.js');
  const target = { x: 6, z: 0, y: 0 };
  const empty = [];
  const full = explosionDamage(0, 0.5, 0, target, empty);
  const near = explosionDamage(0, 0.5, 0, { x: 1, z: 0, y: 0 }, empty);
  const edge = explosionDamage(0, 0.5, 0, { x: 8.9, z: 0, y: 0 }, empty);
  const far = explosionDamage(0, 0.5, 0, { x: 12, z: 0, y: 0 }, empty);
  assert.ok(near > full, 'epicentro mais perto recebe mais dano');
  assert.ok(edge > 0 && edge < full, 'borda do raio recebe dano residual');
  assert.equal(far, 0, 'fora do raio não há dano');
  // parede entre epicentro e alvo atenua
  const wall = { minX: 2.8, maxX: 3.2, minZ: -4, maxZ: 4, yMin: 0, yMax: 3 };
  const blocked = explosionDamage(0, 0.5, 0, target, [wall]);
  assert.ok(blocked > 0 && blocked < full, 'parede atenua o dano');
  // glooCollider produz AABB coerente com a rotação
  const alongX = glooCollider({ id: 1, x: 0, z: 0, rot: 0 });
  const alongZ = glooCollider({ id: 2, x: 0, z: 0, rot: Math.PI / 2 });
  assert.ok(alongX.maxX - alongX.minX > alongX.maxZ - alongX.minZ, 'rot 0 estende em X');
  assert.ok(alongZ.maxZ - alongZ.minZ > alongZ.maxX - alongZ.minX, 'rot 90° estende em Z');
});

// ---------- Gloo Wall (sim offline) ----------
test('fase4 sim: gloo deploy bloqueia movimento e balas; expira após a duração', () => {
  const s = groundSim('GLOO-1', 0); // sem bots: isola a parede
  s.start('belt');
  const p = s.player;
  s.world.colliders.length = 0;
  s.doors.length = 0; s.syncPhysicsWorld(); // Fase 25 — painéis fora da linha unitária (dinâmico)
  p.x = 0; p.z = 0; p.yaw = 0; // frente = -Z
  assert.equal(p.inventory.gloo, 1);
  s.step({ ...idle(0), gloo: true }, STEP);
  assert.equal(p.inventory.gloo, 0, 'gloo consumida');
  assert.equal(s.walls.length, 1);
  assert.equal(s.walls[0].active, true);
  // deploy a 2,2 m à frente: parede em z≈-2.2 (rot 0 → estende em X)
  assert.ok(Math.abs(s.walls[0].x) < 0.01 && Math.abs(s.walls[0].z + 2.2) < 0.01);

  // movimento bloqueado: andar 3 s para frente não atravessa a parede
  for (let i = 0; i < 90; i++) s.step({ ...idle(0), dy: -1 }, STEP);
  assert.ok(p.z > -1.7, `jogador deve ficar antes da parede: z=${p.z.toFixed(2)}`);

  // balas desgastam a parede até destruir
  const hp0 = s.walls[0].hp;
  p.x = 0; p.z = 0;
  let sawDown = false;
  for (let i = 0; i < 30 * 8; i++) {
    s.step({ ...idle(0), fire: true }, STEP);
    if (s.consumeEvents().some((e) => e.type === 'glooDown' && e.destroyed)) sawDown = true;
    if (!s.walls[0].active) break;
  }
  assert.ok(s.walls[0].hp < hp0, `balas desgastam a gloo (${hp0} → ${s.walls[0].hp})`);
  assert.ok(sawDown, 'gloo destruída pelas balas emite glooDown');

  // sem estoque: segundo deploy falha
  const walls = s.walls.length;
  s.step({ ...idle(0), gloo: true }, STEP);
  assert.equal(s.walls.length, walls, 'sem estoque nenhuma parede nova');

  // expiração: parede nova, 60 s → inactive, collider removido, evento glooDown
  p.inventory.gloo = 1;
  p.x = 0; p.z = 0; p.yaw = 0;
  s.step({ ...idle(0), gloo: true }, STEP);
  assert.equal(s.walls[s.walls.length - 1].active, true);
  for (let i = 0; i < 30 * 62; i++) s.step(idle(), STEP);
  assert.equal(s.walls[s.walls.length - 1].active, false, 'gloo expira após a duração');
  // sem parede ativa: jogador atravessa o espaço livre
  p.x = 0; p.z = 0;
  for (let i = 0; i < 60; i++) s.step({ ...idle(0), dy: -1 }, STEP);
  assert.ok(p.z < -2.5, 'sem parede ativa o movimento passa livre');
});

test('fase4 sim: gloo não empilha dentro de estrutura e loot frag/gloo é coletável', () => {
  const s = groundSim('GLOO-2', 0);
  s.start('belt');
  const p = s.player;
  // jogador dentro do monolito (collider central) → deploy rejeitado por sobreposição
  p.x = 0; p.z = 0; p.yaw = 0;
  assert.ok(s.world.colliders.some((c) => c.minX <= 2 && c.maxX >= -2 && c.minZ <= 2 && c.maxZ >= -2));
  s.step({ ...idle(0), gloo: true }, STEP);
  assert.equal(s.walls.length, 0, 'deploy em collider existente é rejeitado');

  // loot de arremessáveis: coleta incrementa inventário (isola o frag/gloo dos
  // demais itens no mesmo spot — interact pega o primeiro no raio de 2,6 m)
  const fragLoot = s.loot.find((i) => i.kind === 'frag');
  const glooLoot = s.loot.find((i) => i.kind === 'gloo');
  assert.ok(fragLoot && glooLoot, 'spawn determinístico inclui frag e gloo');
  for (const i of s.loot) if (i !== fragLoot && i !== glooLoot) i.active = false;
  p.inventory.frag = 0; p.inventory.gloo = 0;
  p.x = fragLoot.x; p.z = fragLoot.z;
  s.step({ ...idle(), interact: true }, STEP);
  assert.equal(fragLoot.active, false);
  assert.equal(p.inventory.frag, 1, 'frag coletada');
  p.x = glooLoot.x; p.z = glooLoot.z;
  s.step({ ...idle(), interact: true }, STEP);
  assert.equal(p.inventory.gloo, 1, 'gloo coletada');
  // snapshot roundtrip preserva grenades/walls
  s.step({ ...idle(0), throw: true }, STEP);
  const snap = JSON.parse(JSON.stringify(s.snapshot()));
  assert.ok(Array.isArray(snap.grenades) && Array.isArray(snap.walls));
});

// ---------- MatchRoom3D autoritativa (Fase 4) ----------
test('fase4 room: airdrop autoritativo — atores caem, aterrissam e recebem land', () => {
  const room = makeRoom({ humans: 2, botFill: 3 });
  assert.ok(room.start('p1', 'belt'));
  assert.equal(room.humans.get('p1').dropPhase, 'sky');
  assert.equal(room.bots[0].dropPhase, 'sky');
  let landed = false;
  for (let i = 0; i < 30 * 14; i++) {
    room.input('p1', blank({ seq: i + 1 }));
    room.input('p2', blank({ seq: i + 1 }));
    room.tick(DT);
    if (room.humans.get('p1').dropPhase === null && room.humans.get('p1').onGround) { landed = true; break; }
  }
  assert.equal(landed, true, 'humano aterrissa');
  // bots podem levar alguns ticks além do humano: drena até todos pousarem
  for (let i = 0; i < 30 * 14 && room.bots.some((b) => b.dropPhase !== null); i++) {
    room.input('p1', blank({ seq: 1000 + i }));
    room.tick(DT);
  }
  for (const b of room.bots) assert.equal(b.dropPhase, null, 'bots aterrissam');
  const events = room.drainEvents('p1');
  assert.ok(events.some((e) => e.type === 'land'), 'evento land entregue ao humano');
});

test('fase4 room: throw/gloo autoritativos — snapshot replica grenades/walls', () => {
  const room = makeRoom({ humans: 1, botFill: 1 });
  room.start('p1', 'belt');
  // aterrissa primeiro
  for (let i = 0; i < 30 * 12 && room.humans.get('p1').dropPhase; i++) {
    room.input('p1', blank({ seq: i + 1 }));
    room.tick(DT);
  }
  room.drainEvents('p1');
  const p1 = room.humans.get('p1');
  assert.equal(p1.dropPhase, null);
  // canto livre de estruturas: deploy/arremesso determinísticos
  p1.x = -180; p1.z = -180; p1.yaw = 0;

  // throw autoritativo
  let seq = 1000;
  room.input('p1', blank({ seq: seq++, throw: true }));
  room.tick(DT);
  assert.equal(room.grenades.length, 1, 'granada autoritativa em voo');
  let snap = room.snapshot('p1');
  assert.equal(snap.grenades.length, 1);
  assert.equal(snap.player.inventory.frag, 0);
  assert.ok(snap.events.some((e) => e.type === 'frag'));
  // detonação replicada (pavio 2,2 s > 60 ticks a 20 Hz)
  for (let i = 0; i < 60 && room.grenades.length > 0; i++) { room.input('p1', blank({ seq: seq++ })); room.tick(DT); }
  assert.ok(room.drainEvents('p1').some((e) => e.type === 'explosion'), 'explosion entregue');

  // gloo autoritativa + replicação no snapshot
  room.input('p1', blank({ seq: seq++, gloo: true }));
  room.tick(DT);
  assert.equal(room.walls.length, 1, 'gloo autoritativa');
  snap = room.snapshot('p1');
  assert.equal(snap.walls.length, 1);
  assert.ok(snap.events.some((e) => e.type === 'gloo'));
  // bala do próprio dono desgasta a parede (está logo à frente)
  const hp0 = room.walls[0].hp;
  for (let i = 0; i < 30 * 6 && room.walls[0].active; i++) { room.input('p1', blank({ seq: seq++, yaw: 0, fire: true })); room.tick(DT); }
  assert.ok(room.walls[0].hp < hp0 || !room.walls[0].active, `balas no servidor desgastam a gloo (${hp0} → ${room.walls[0].hp})`);
  assert.ok(room.drainEvents('p1').some((e) => e.type === 'impact' && e.kind === 'gloo'), 'impacto de gloo replicado');
});

test('fase4 room: anticheat rejeita throw/gloo não-booleanos e granada respeita estoque', () => {
  const ok = validateInput3D({ seq: 0, yaw: 0 }, blank({ seq: 1, throw: true, gloo: false }), DT);
  assert.equal(ok.ok, true);
  const bad = validateInput3D({ seq: 0, yaw: 0 }, blank({ seq: 1, throw: 1 }), DT);
  assert.equal(bad.ok, false);
  assert.ok(bad.violations.includes('field_type'));
  const badGloo = validateInput3D({ seq: 0, yaw: 0 }, blank({ seq: 1, gloo: 'x' }), DT);
  assert.ok(badGloo.violations.includes('field_type'));
  // estoque: consumiu a única gloo, segundo deploy não cria parede
  const room = makeRoom({ humans: 1, botFill: 1, seed: 'P4-STOCK' });
  room.start('p1', 'belt');
  let seq = 1;
  for (let i = 0; i < 30 * 12 && room.humans.get('p1').dropPhase; i++) {
    room.input('p1', blank({ seq: seq++ }));
    room.tick(DT);
  }
  room.input('p1', blank({ seq: seq++, gloo: true }));
  room.tick(DT);
  assert.equal(room.walls.length, 1);
  room.input('p1', blank({ seq: seq++, gloo: true }));
  room.tick(DT);
  assert.equal(room.walls.length, 1, 'sem estoque nenhuma parede nova');
});

// ---------- predição client-side (Fase 4) ----------
test('fase4 predict: predição replica a queda do servidor e reconcilia no ack', async () => {
  const { LocalPredictor } = await import('../src/game3d/predict3d.js');
  const { stepActorMovement, getWorldLayout } = await import('../src/game3d/sim3d.js');
  const world = getWorldLayout('P4-PRED');
  // servidor: ator em queda com deriva
  const server = {
    id: 'p1', x: 0, y: 140, z: 0, vy: 0, yaw: 0, pitch: 0, speed: 5.2,
    weapon: 'g19', alive: true, onGround: false, moving: false, sprinting: false, ads: false,
    dropPhase: 'sky',
  };
  const predictor = new LocalPredictor({ world });
  predictor.reconcile({ ...server, ackSeq: 0 }, 0);
  assert.equal(predictor.actor.dropPhase, 'sky');
  // mesmo fluxo de inputs no servidor e no preditor (servidor replica o #stepActor:
  // yaw/pitch do input entram no ator antes da cinemática)
  let inputSeq = 0;
  for (let i = 0; i < 280; i++) {
    const input = { ...idle(0.3), seq: ++inputSeq, dy: -1 };
    server.yaw = input.yaw; server.pitch = input.pitch ?? 0;
    stepActorMovement(server, input, 1 / 30, world);
    predictor.onInput(input);
    // reconciliação periódica com o estado autoritativo (a cada 10 passos)
    if (i % 10 === 0) predictor.reconcile({ ...server, dropPhase: server.dropPhase, vy: server.vy, onGround: server.onGround, ackSeq: inputSeq }, inputSeq);
    predictor.update(1 / 60);
  }
  assert.equal(server.dropPhase, null, 'servidor aterrissou');
  assert.ok(Math.abs(predictor.actor.y - server.y) < 1e-6, `y predito = servidor (${predictor.actor.y} vs ${server.y})`);
  assert.ok(Math.hypot(predictor.actor.x - server.x, predictor.actor.z - server.z) < 1e-6, 'XZ predito = servidor');
  assert.equal(predictor.actor.onGround, true);
});

test('fase4 predict: input de throw/gloo não perturba a física prevista', async () => {
  const { LocalPredictor } = await import('../src/game3d/predict3d.js');
  const { stepActorMovement, getWorldLayout } = await import('../src/game3d/sim3d.js');
  const world = getWorldLayout('P4-PRED2');
  const server = {
    id: 'p1', x: 0, y: 0, z: 0, vy: 0, yaw: 0.4, pitch: 0, speed: 5.2,
    weapon: 'g19', alive: true, onGround: true, moving: false, sprinting: false, ads: false,
    dropPhase: null,
  };
  const predictor = new LocalPredictor({ world });
  predictor.reconcile({ ...server, ackSeq: 0 }, 0);
  let inputSeq = 0;
  for (let i = 0; i < 60; i++) {
    const input = { ...idle(0.4), seq: ++inputSeq, dy: -1, throw: i === 10, gloo: i === 20 };
    server.yaw = input.yaw; server.pitch = input.pitch ?? 0; // replica #stepActor
    stepActorMovement(server, input, 1 / 30, world);
    predictor.onInput(input);
  }
  assert.equal(isFinite(predictor.actor.x) && isFinite(predictor.actor.y) && isFinite(predictor.actor.z), true);
  assert.ok(Math.hypot(predictor.actor.x - server.x, predictor.actor.y - server.y, predictor.actor.z - server.z) < 1e-9,
    'one-shots de arremesso não afetam a cinemática prevista');
});
