// Khaaos Run — Testes da MatchRoom3D (sala autoritativa do BR 3D), validateInput3D
// e filtro de modo no matchmaking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchRoom3D, KILL_XP, KILL_KRC, EXTRACT_XP } from '../server/room3d.js';
import { validateInput3D } from '../server/antiCheat.js';
import { chooseRoom } from '../server/matchmaking.js';
import { MatchRoom } from '../server/room.js';
import { PULSE_INTERVAL, WEAPONS3D } from '../src/game3d/sim3d.js';

const DT = 1 / 20;

const blankInput = (over = {}) => ({
  seq: 1, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false,
  sprint: false, jump: false, interact: false, reload: false, medkit: false, slot: 0, ...over,
});

function makeRoom({ humans = 3, botFill = 0, seed = 'TESTE-3D' } = {}) {
  const room = new MatchRoom3D({ id: 'ring3d-test', seed, region: 'sa-east', capacity: 16, botFill });
  for (let i = 0; i < humans; i++) room.addPlayer(`p${i + 1}`, `JOGADOR-${i + 1}`);
  return room;
}

test('room3d: lobby → start preenche bots, aplica entrada e emite matchStart', () => {
  const room = makeRoom({ humans: 2, botFill: 14 });
  const before = room.snapshot('p1');
  assert.equal(before.state, 'LOBBY');
  assert.equal(before.player.name, 'JOGADOR-1');
  assert.ok(room.start('p1', 'belt'));
  const after = room.snapshot('p1');
  assert.equal(after.state, 'IN_PROGRESS');
  assert.equal(after.player.armor, 60);
  // 2 humanos + 14 bots = capacidade
  assert.equal(after.others.length, 15);
  assert.equal(after.others.filter((o) => o.isBot).length, 14);
  assert.equal(after.aliveCount, 16);
  const events = after.events;
  assert.ok(events.some((e) => e.type === 'matchStart'));
  // start repetido é ignorado (sala já iniciada)
  assert.equal(room.start('p2', 'rush'), false);
});

test('room3d: start exige entrada válida e sala em lobby', () => {
  const room = makeRoom({ humans: 1 });
  assert.equal(room.start('p1', 'teleport'), false);
  assert.equal(room.start('ghost', 'belt'), false);
  assert.ok(room.start('p1', 'rush'));
});

test('room3d: movimento com input do humano (frente = -Z com yaw 0)', () => {
  const room = makeRoom({ humans: 1, botFill: 1 });
  room.start('p1', 'belt');
  const z0 = room.humans.get('p1').z;
  for (let i = 0; i < 30; i++) {
    room.input('p1', blankInput({ seq: i + 1, dy: -1 }));
    room.tick(DT);
  }
  const p = room.humans.get('p1');
  assert.ok(p.z < z0 - 3, `z deve diminuir (frente): ${z0} → ${p.z}`);
  assert.ok(p.moving);
});

test('room3d: colisão mantém ator dentro do mundo e fora de colliders', () => {
  const room = makeRoom({ humans: 1, botFill: 1 });
  room.start('p1', 'belt');
  const p = room.humans.get('p1');
  p.x = 197; p.z = 197; // borda (limite = 198)
  for (let i = 0; i < 60; i++) {
    room.input('p1', blankInput({ seq: i + 1, dx: 1, dy: 1 }));
    room.tick(DT);
  }
  assert.ok(Math.abs(p.x) <= 198 && Math.abs(p.z) <= 198);
});

test('room3d: tiro mata alvo com crédito, xp/krc, killfeed e eventos', () => {
  const room = makeRoom({ humans: 3 }); // p3 observador do killfeed
  room.start('p1', 'belt');
  const p1 = room.humans.get('p1');
  const p2 = room.humans.get('p2');
  // coloca p2 a 4m a leste de p1
  p2.x = p1.x + 4; p2.z = p1.z; p2.armor = 0;
  // yaw que aponta p1 para p2: frente (-sin, -cos) = (1, 0) → yaw = -PI/2
  let seq = 1;
  for (let i = 0; i < 300 && p2.alive; i++) {
    room.input('p1', blankInput({ seq: seq++, yaw: -Math.PI / 2, fire: true }));
    room.input('p2', blankInput({ seq: seq++ }));
    room.input('p3', blankInput({ seq: seq++ }));
    room.tick(DT);
  }
  assert.equal(p2.alive, false, 'p2 deve ser eliminado');
  assert.equal(p1.kills, 1);
  assert.ok(p1.xp >= KILL_XP);
  assert.ok(p1.krc >= 250 + KILL_KRC);
  const p1Events = room.drainEvents('p1');
  assert.ok(p1Events.some((e) => e.type === 'kill' && e.target === 'JOGADOR-2'));
  const p3Events = room.drainEvents('p3');
  assert.ok(p3Events.some((e) => e.type === 'killfeed' && e.victim === 'JOGADOR-2'));
  const p2Events = room.drainEvents('p2');
  assert.ok(p2Events.some((e) => e.type === 'hurt'));
  assert.ok(p2Events.some((e) => e.type === 'eliminated'));
});

test('room3d: headshot multiplicado (×1.75) — abate a queima-roupa mirando alto', () => {
  const room = makeRoom({ humans: 2 });
  room.start('p1', 'belt');
  const p1 = room.humans.get('p1');
  const p2 = room.humans.get('p2');
  p2.armor = 0;
  p2.x = p1.x; p2.z = p1.z - 2; // 2m à frente (frente -Z, yaw 0)
  let seq = 10;
  for (let i = 0; i < 300 && p2.alive; i++) {
    room.input('p1', blankInput({ seq: seq++, yaw: 0, pitch: 0.1, fire: true })); // linha de tiro na altura da cabeça
    room.tick(DT);
  }
  assert.equal(p2.alive, false, 'p2 deve ser eliminado');
  const kill = room.drainEvents('p1').find((e) => e.type === 'kill');
  assert.ok(kill, 'kill esperado');
  assert.equal(kill.xp, 180, 'headshot paga 180 XP');
});

test('room3d: zona pulsa, encolhe e causa dano fora do anel', () => {
  const room = makeRoom({ humans: 1, botFill: 1 });
  room.start('p1', 'belt');
  const p = room.humans.get('p1');
  p.x = 195; p.z = 0; // fora do anel inicial (170)
  const r0 = room.ring.radius;
  room.pulseTimer = PULSE_INTERVAL - 0.001;
  room.tick(DT);
  assert.equal(room.ring.pulse, 1);
  assert.ok(room.ring.target < r0);
  const life0 = p.life;
  for (let i = 0; i < 40; i++) { room.input('p1', blankInput({ seq: i + 1 })); room.tick(DT); }
  assert.ok(p.life < life0, 'dano de zona aplicado');
  const events = room.drainEvents('p1');
  assert.ok(events.some((e) => e.type === 'pulse'));
  assert.ok(events.some((e) => e.type === 'hurt' && e.kind === 'ring'));
});

test('room3d: coleta de loot e extração em terminal ZEX', () => {
  const room = makeRoom({ humans: 1, botFill: 1 });
  room.start('p1', 'belt');
  const p = room.humans.get('p1');
  const item = room.loot.find((i) => i.active);
  p.x = item.x; p.z = item.z; p.y = 0;
  room.input('p1', blankInput({ seq: 1, interact: true }));
  room.tick(DT);
  assert.equal(item.active, false);
  assert.ok(room.drainEvents('p1').some((e) => e.type === 'loot'));

  // remove loot restante para isolar a extração no terminal (loot tem prioridade)
  for (const i of room.loot) i.active = false;
  const t = room.terminals[0];
  p.x = t.x; p.z = t.z;
  const xp0 = p.xp;
  room.input('p1', blankInput({ seq: 2, interact: true }));
  room.tick(DT);
  assert.equal(t.active, false);
  assert.equal(p.extracted, 1);
  assert.equal(p.xp, xp0 + EXTRACT_XP);
  assert.ok(room.drainEvents('p1').some((e) => e.type === 'extract'));
});

test('room3d: recarga conserva munição de reserva', () => {
  const room = makeRoom({ humans: 1, botFill: 1 });
  room.start('p1', 'belt');
  const p = room.humans.get('p1');
  p.ammoMag = 0;
  room.input('p1', blankInput({ seq: 1, reload: true }));
  room.tick(DT);
  assert.ok(p.reloadT > 0);
  // fila processa 1 input/tick com dt=1/30: cada tick avança 1/30s da recarga
  for (let i = 0; i < Math.ceil(WEAPONS3D.g19.reload * 30) + 2; i++) {
    room.input('p1', blankInput({ seq: i + 2 }));
    room.tick(DT);
  }
  assert.equal(p.ammoMag, WEAPONS3D.g19.magazine);
  assert.equal(p.inventory.ammo['9MM'], 45 - WEAPONS3D.g19.magazine);
});

test('room3d: bots se movem, engajam e atiram em humanos', () => {
  const room = makeRoom({ humans: 1, botFill: 6 });
  room.start('p1', 'belt');
  assert.equal(room.bots.length, 6);
  const p = room.humans.get('p1');
  // coloca bot 1 ao lado do humano para engajamento rápido
  room.bots[0].x = p.x + 10; room.bots[0].z = p.z;
  const bot0 = { x: room.bots[0].x, z: room.bots[0].z };
  let sawBullet = false;
  for (let i = 0; i < 400; i++) {
    room.input('p1', blankInput({ seq: i + 1 }));
    room.tick(DT);
    if (room.bullets.length > 0) sawBullet = true;
  }
  const moved = room.bots.some((b) => Math.hypot(b.x - bot0.x, b.z - bot0.z) > 0.5) || room.bullets.length > 0;
  assert.ok(moved || sawBullet, 'bots devem agir');
  assert.ok(room.ring.radius <= 170);
});

test('room3d: snapshot filtrado — sem inventory/ai de terceiros e eventos drenados uma vez', () => {
  const room = makeRoom({ humans: 3, botFill: 2 });
  room.start('p1', 'belt');
  const s1 = room.snapshot('p1');
  assert.equal(s1.mode, '3d');
  assert.equal(s1.roomId, 'ring3d-test');
  assert.ok(s1.player.inventory, 'próprio jogador carrega inventory');
  assert.ok(s1.others.every((o) => !o.inventory && !o.ai && o.id !== 'p1'));
  assert.ok(s1.others.some((o) => o.isBot));
  assert.ok(s1.events.length > 0, 'matchStart/pulse entregues');
  const s2 = room.snapshot('p1');
  assert.equal(s2.events.length, 0, 'eventos drenados no snapshot anterior');
});

test('room3d: remoção de jogador emite killfeed e limpa eventos', () => {
  const room = makeRoom({ humans: 2 });
  room.start('p1', 'belt');
  room.removePlayer('p2');
  assert.equal(room.humans.has('p2'), false);
  const events = room.drainEvents('p1');
  assert.ok(events.some((e) => e.type === 'killfeed' && e.killer === 'CONEXÃO'));
});

test('room3d: vitória por tempo e encerramento da sala', () => {
  const room = makeRoom({ humans: 2, botFill: 2 });
  room.start('p1', 'belt');
  room.time = 0.02;
  room.tick(DT);
  assert.equal(room.state, 'FINISHED');
  const s = room.snapshot('p1');
  assert.equal(s.over, true);
  assert.ok(s.events.some((e) => e.type === 'victory'));
  assert.ok(s.events.some((e) => e.type === 'matchEnd'));
});

test('room3d: partida termina quando só resta um ator vivo', () => {
  const room = makeRoom({ humans: 1, botFill: 3 });
  room.start('p1', 'belt');
  const p = room.humans.get('p1');
  for (const b of room.bots) b.alive = false;
  room.tick(DT);
  assert.equal(room.state, 'FINISHED');
  assert.ok(p.alive);
});

// ---------- validateInput3D ----------
test('anticheat 3D: input válido passa', () => {
  const prev = { seq: 0, yaw: 0 };
  const next = blankInput({ seq: 1, dx: 1, dy: 0, yaw: 0.3, pitch: 0.2, fire: true, clientDt: DT });
  const result = validateInput3D(prev, next, DT);
  assert.deepEqual(result, { ok: true, violations: [] });
});

test('anticheat 3D: replay de sequência rejeitado', () => {
  const result = validateInput3D({ seq: 5, yaw: 0 }, blankInput({ seq: 5 }), DT);
  assert.equal(result.ok, false);
  assert.ok(result.violations.includes('sequence_replay'));
});

test('anticheat 3D: vetor de movimento acima de 1.01 rejeitado', () => {
  const result = validateInput3D({ seq: 0, yaw: 0 }, blankInput({ seq: 1, dx: 0.9, dy: 0.9 }), DT);
  assert.equal(result.ok, false);
  assert.ok(result.violations.includes('movement_vector'));
});

test('anticheat 3D: pitch além do limite e yaw com rotação impossível rejeitados', () => {
  const pitchResult = validateInput3D({ seq: 0, yaw: 0 }, blankInput({ seq: 1, pitch: 2.5 }), DT);
  assert.ok(pitchResult.violations.includes('aim_range'));
  // 14 rad/s * 0.05 = 0.7 rad máximo por tick
  const yawResult = validateInput3D({ seq: 0, yaw: 0 }, blankInput({ seq: 1, yaw: 1.5 }), DT);
  assert.ok(yawResult.violations.includes('yaw_rate'));
  // wrap: 0 → 6.2 (~-0.08 rad na forma curta) é permitido
  const wrapResult = validateInput3D({ seq: 0, yaw: 0 }, blankInput({ seq: 1, yaw: 6.2 }), DT);
  assert.equal(wrapResult.ok, true);
});

test('anticheat 3D: campos não-booleanos e slot inválido rejeitados', () => {
  const result = validateInput3D({ seq: 0, yaw: 0 }, blankInput({ seq: 1, fire: 1, slot: 9 }), DT);
  assert.equal(result.ok, false);
  assert.ok(result.violations.includes('field_type'));
});

// ---------- matchmaking por modo ----------
test('matchmaking: chooseRoom só agrupa clientes do mesmo modo', () => {
  const rooms = new Map();
  const room2d = new MatchRoom({ id: 'ring-1', seed: 's1', region: 'sa-east', capacity: 16 });
  const room3d = new MatchRoom3D({ id: 'ring3d-1', seed: 's2', region: 'sa-east', capacity: 16, botFill: 15 });
  rooms.set(room2d.id, room2d);
  rooms.set(room3d.id, room3d);
  assert.equal(chooseRoom(rooms, 'sa-east', 16).id, 'ring-1');           // default 2d
  assert.equal(chooseRoom(rooms, 'sa-east', 16, '2d').id, 'ring-1');
  assert.equal(chooseRoom(rooms, 'sa-east', 16, '3d').id, 'ring3d-1');
  assert.equal(chooseRoom(rooms, 'eu-west', 16, '3d'), null);           // região incompatível
});

// ---------- Fase 3: fila de inputs, ackSeq e lag compensation ----------
test('room3d: fila de inputs processa em ordem e snapshot expõe ackSeq (predição)', () => {
  const room = makeRoom({ humans: 1, botFill: 1 });
  room.start('p1', 'belt');
  const p = room.humans.get('p1');
  const z0 = p.z;
  // 5 inputs enfileirados; 1º tick processa até 3
  for (let i = 1; i <= 5; i++) room.input('p1', blankInput({ seq: i, dy: -1 }));
  room.tick(DT);
  assert.equal(p.lastProcessedSeq, 3, 'MAX_INPUTS_PER_TICK=3 por tick');
  room.tick(DT);
  assert.equal(p.lastProcessedSeq, 5, 'fila drenada no 2º tick');
  const snap = room.snapshot('p1');
  assert.equal(snap.player.ackSeq, 5, 'ackSeq no snapshot para reconciliação');
  // movimento idêntico ao previsto pelo cliente (mesma física compartilhada)
  const expected = z0 - 5 * 5.2 * (1 / 30);
  assert.ok(Math.abs(p.z - expected) < 1e-9, `z = ${p.z}, esperado ${expected}`);
});

test('room3d: rajada de inputs é limitada (anti-speedhack) e duplicados ignorados', () => {
  const room = makeRoom({ humans: 1, botFill: 1 });
  room.start('p1', 'belt');
  const p = room.humans.get('p1');
  const z0 = p.z;
  // rajada: 50 inputs de uma vez (spam de rede)
  for (let i = 1; i <= 50; i++) room.input('p1', blankInput({ seq: i, dy: -1 }));
  room.tick(DT);
  assert.equal(p.lastProcessedSeq, 3, 'no máximo 3 inputs processados no tick');
  // deslocamento do tick equivale a no máximo 3 passos de 1/30s
  assert.ok(p.z - z0 >= -(5.2 * 3 * (1 / 30) + 1e-9), 'sem deslocamento além do cap');
  // seq repetida/antiga não re-enfileira
  const q = p.inputQueue.length;
  room.input('p1', blankInput({ seq: 40, dy: -1 }));
  room.input('p1', blankInput({ seq: 10, dy: -1 }));
  assert.equal(p.inputQueue.length, q, 'duplicado/replay fora da fila');
});

test('room3d: rtt reportado no input é armazenado com clamp', () => {
  const room = makeRoom({ humans: 1, botFill: 1 });
  room.start('p1', 'belt');
  room.input('p1', blankInput({ seq: 1, rtt: 180 }));
  room.tick(DT);
  assert.equal(room.humans.get('p1').rtt, 180);
  room.input('p1', blankInput({ seq: 2, rtt: 99999 }));
  room.tick(DT);
  assert.equal(room.humans.get('p1').rtt, 600, 'clamp em 600ms');
});

test('room3d: lag compensation acerta alvo na posição rebobinada que o atirador via', () => {
  const room = makeRoom({ humans: 2, botFill: 0, seed: 'LAGCOMP-1' });
  room.start('p1', 'belt');
  const p1 = room.humans.get('p1'); // atirador (rtt alto)
  const p2 = room.humans.get('p2'); // vítima em movimento
  p1.cooldown = 0; p1.rtt = 400;             // 400ms de RTT → rewind ≈ 11 ticks
  p2.armor = 0;
  // vítima vista 4m a leste do spawn (linha livre, como no teste de kill)
  p1.yaw = -Math.PI / 2; // frente = +X
  p2.x = p1.x + 4; p2.z = p1.z;
  for (let i = 0; i < 6; i++) { room.input('p1', blankInput({ seq: i + 1, rtt: 400 })); room.input('p2', blankInput({ seq: i + 1 })); room.tick(DT); }
  // desloca a vítima: ainda dentro do anel, 40m ao norte da linha de tiro
  p2.x = p1.x + 30; p2.z = p1.z + 40;
  for (let i = 0; i < 8; i++) { room.input('p1', blankInput({ seq: 10 + i, rtt: 400 })); room.input('p2', blankInput({ seq: 10 + i })); room.tick(DT); }
  const life0 = p2.life;
  // fogo no tick 15: rewind 11 ticks → tick 4, quando p2 estava 4m a leste
  room.input('p1', blankInput({ seq: 100, yaw: -Math.PI / 2, fire: true, rtt: 400 }));
  room.input('p2', blankInput({ seq: 100 }));
  room.tick(DT); // processa o input de fogo (bala nasce — e pode acertar — neste tick)
  assert.ok(room.bullets.length > 0 || p2.life < life0, 'disparo processado (bala em voo ou impacto imediato)');
  for (let i = 0; i < 20 && room.bullets.length > 0; i++) {
    room.tick(DT);
    room.input('p1', blankInput({ seq: 101 + i, rtt: 400 }));
    room.input('p2', blankInput({ seq: 101 + i }));
  }
  assert.ok(p2.life < life0, `rewind acerta a posição passada: vida ${life0} → ${p2.life}`);
  const events = room.drainEvents('p1');
  assert.ok(events.some((e) => e.type === 'hit' && e.victim === 'p2'), 'evento hit entregue ao atirador');
});

test('room3d: lag compensation NÃO acerta posição presente quando alvo já saiu do rewind', () => {
  // vítima nunca esteve na linha de tiro: rewind = presente, nenhum hit
  const room = makeRoom({ humans: 2, botFill: 0, seed: 'LAGCOMP-2' });
  room.start('p1', 'belt');
  const p1 = room.humans.get('p1');
  const p2 = room.humans.get('p2');
  p1.yaw = -Math.PI / 2; // mira leste
  p2.armor = 0;
  p2.x = p1.x + 4; p2.z = p1.z;
  for (let i = 0; i < 6; i++) { room.input('p1', blankInput({ seq: i + 1 })); room.tick(DT); }
  p2.x = p1.x + 4; p2.z = p1.z + 90; // vítima ao NORTE da linha leste
  for (let i = 0; i < 8; i++) { room.input('p1', blankInput({ seq: 10 + i })); room.tick(DT); }
  const life0 = p2.life;
  room.input('p1', blankInput({ seq: 50, yaw: -Math.PI / 2, fire: true }));
  room.tick(DT);
  for (let i = 0; i < 20 && room.bullets.length > 0; i++) room.tick(DT);
  assert.equal(p2.life, life0, 'tiro para leste não acerta vítima ao norte');
});
