// Khaaos Run — Testes da predição client-side com reconciliação (Fase 3).
// LocalPredictor + stepActorMovement compartilhado servidor/cliente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalPredictor, INPUT_DT, SNAP_DISTANCE } from '../src/game3d/predict3d.js';
import { stepActorMovement, getWorldLayout, WORLD } from '../src/game3d/sim3d.js';

const input = (over = {}) => ({
  seq: 1, dx: 0, dy: -1, yaw: 0, pitch: 0, fire: false, ads: false,
  sprint: false, jump: false, interact: false, reload: false, medkit: false, slot: 0, ...over,
});

const serverPlayer = (over = {}) => ({
  x: 0, y: 0, z: 150, vy: 0, yaw: 0, pitch: 0, speed: 5.2, weapon: 'g19',
  alive: true, onGround: true, moving: false, sprinting: false, ads: false, ...over,
});

test('predict3d: stepActorMovement move para frente (-Z com yaw 0) na velocidade do ator', () => {
  const world = getWorldLayout('PRED-OPEN'); // ponto aberto do mapa
  const a = { x: 0, y: 0, z: 150, vy: 0, yaw: 0, speed: 5.2, weapon: 'g19', onGround: true, moving: false, sprinting: false, ads: false };
  stepActorMovement(a, input({ dy: -1 }), 1, world);
  assert.ok(Math.abs(a.z - (150 - 5.2)) < 1e-6, `z deve avançar 5,2m: ${a.z}`);
  assert.equal(a.x, 0);
  assert.ok(a.moving);
});

test('predict3d: stepActorMovement colide com collider e respeita limite do mundo', () => {
  const world = getWorldLayout('PRED-EDGE');
  // limite do mundo: |x|,|z| <= 198
  const a = { x: 197.5, y: 0, z: 197.5, vy: 0, yaw: 0, speed: 6, weapon: 'g19', onGround: true, moving: false, sprinting: false, ads: false };
  for (let i = 0; i < 10; i++) stepActorMovement(a, input({ dx: 1, dy: 1 }), 1 / 30, world);
  assert.ok(Math.abs(a.x) <= 198 && Math.abs(a.z) <= 198, `ator dentro do mundo: ${a.x},${a.z}`);
  // collider: ator spawnado no centro de um box sólido é empurrado para fora
  const box = world.colliders.find((b) => !b.noBlock);
  assert.ok(box, 'layout tem colliders');
  const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2;
  const b2 = { x: cx, y: 0, z: cz, vy: 0, yaw: 0, speed: 5, weapon: 'g19', onGround: true, moving: false, sprinting: false, ads: false };
  stepActorMovement(b2, input({ dy: -1 }), 1 / 30, world);
  const pushedOut = b2.x <= box.minX || b2.x >= box.maxX || b2.z <= box.minZ || b2.z >= box.maxZ;
  assert.ok(pushedOut, `ator empurrado para fora do collider (${b2.x}, ${b2.z})`);
});

test('predict3d: salto integra gravidade e retorna ao chão', () => {
  const world = getWorldLayout('PRED-JUMP');
  const a = { x: 0, y: 0, z: 150, vy: 0, yaw: 0, speed: 5.2, weapon: 'g19', onGround: true, moving: false, sprinting: false, ads: false };
  stepActorMovement(a, input({ jump: true, dy: 0 }), INPUT_DT, world);
  assert.equal(a.onGround, false);
  assert.ok(a.vy > 0, 'vy inicial positiva');
  let air = true;
  for (let i = 0; i < 120 && air; i++) {
    stepActorMovement(a, input({ dy: 0 }), INPUT_DT, world);
    if (a.onGround) air = false;
  }
  assert.equal(a.onGround, true, 'aterrissou');
  assert.equal(a.y, 0);
  assert.ok(Math.abs(a.vy) < 1e-9);
});

test('predict3d: primeira reconciliação sincroniza com o spawn do servidor', () => {
  const p = new LocalPredictor({ world: getWorldLayout('PRED-SYNC') });
  assert.equal(p.synced, false);
  p.onInput(input({ seq: 1 })); // ignorado antes do sync
  assert.equal(p.pending.length, 0);
  p.reconcile(serverPlayer({ x: 42, z: 84 }), 0);
  assert.equal(p.synced, true);
  assert.equal(p.actor.x, 42);
  assert.equal(p.actor.z, 84);
  assert.deepEqual(p.pos, { x: 42, y: 0, z: 84 });
});

test('predict3d: previsão replica o servidor com inputs idênticos (erro zero)', () => {
  const world = getWorldLayout('PRED-CONV');
  const p = new LocalPredictor({ world, speed: 5.2 });
  p.reconcile(serverPlayer(), 0);
  // servidor "fantasma": aplica o mesmo stepActorMovement aos mesmos inputs
  const ghost = { x: 0, y: 0, z: 150, vy: 0, yaw: 0, speed: 5.2, weapon: 'g19', onGround: true, moving: false, sprinting: false, ads: false };
  let seq = 0;
  for (let i = 0; i < 30; i++) {
    const inp = input({ seq: ++seq, dy: -1, dx: i % 5 === 0 ? 0.4 : 0, yaw: i * 0.02 });
    p.onInput(inp);
    stepActorMovement(ghost, inp, INPUT_DT, world);
  }
  // ack de todos os inputs: servidor confirma estado = ghost
  p.reconcile({ ...serverPlayer({ x: ghost.x, y: ghost.y, z: ghost.z, vy: ghost.vy, onGround: ghost.onGround, moving: true }), ackSeq: seq }, seq);
  assert.ok(Math.abs(p.actor.x - ghost.x) < 1e-9, `x previsto = servidor (${p.actor.x} vs ${ghost.x})`);
  assert.ok(Math.abs(p.actor.z - ghost.z) < 1e-9, `z previsto = servidor (${p.actor.z} vs ${ghost.z})`);
  assert.equal(p.pending.length, 0, 'pendências confirmadas são descartadas');
});

test('predict3d: reconcile replays pendentes a partir do estado autoritativo', () => {
  const world = getWorldLayout('PRED-REPLAY');
  const p = new LocalPredictor({ world, speed: 5.2 });
  p.reconcile(serverPlayer(), 0);
  // cliente prevê 5 inputs (seq 1..5)
  for (let i = 1; i <= 5; i++) p.onInput(input({ seq: i, dy: -1 }));
  const predictedZ = p.actor.z; // 150 - 5 * 5.2 * (1/30)
  assert.ok(predictedZ < 150);
  // servidor só processou até seq 3 e está 0,5m atrasado (jitter de rede)
  const serverZ = p.history.get(3).z - 0.5;
  p.reconcile({ ...serverPlayer({ z: serverZ, moving: true }), ackSeq: 3 }, 3);
  assert.equal(p.pending.length, 2, 'inputs 4 e 5 permanecem pendentes');
  assert.ok(Math.abs(p.actor.z - (serverZ - 2 * 5.2 * INPUT_DT)) < 1e-9, 'replay dos pendentes sobre o estado do servidor');
  assert.ok(p.pending.every((i) => i.seq > 3));
});

test('predict3d: offset visual absorve o erro e decai até zero', () => {
  const world = getWorldLayout('PRED-ERR');
  const p = new LocalPredictor({ world, speed: 5.2 });
  p.reconcile(serverPlayer(), 0);
  for (let i = 1; i <= 10; i++) p.onInput(input({ seq: i, dy: -1 }));
  // servidor 1m atrás da previsão no ack (seq 10)
  const serverZ = p.history.get(10).z + 1;
  const renderedBefore = { ...p.pos };
  p.reconcile({ ...serverPlayer({ z: serverZ, moving: true }), ackSeq: 10 }, 10);
  const err = Math.hypot(p.err.x, p.err.y, p.err.z);
  assert.ok(err > 0.5, `offset visual criado: ${err}`);
  // render contínuo: posição desenhada não salta
  const renderedAfter = p.pos;
  assert.ok(Math.hypot(renderedAfter.x - renderedBefore.x, renderedAfter.y - renderedBefore.y, renderedAfter.z - renderedBefore.z) < 2,
    'transição suave (sem snap visual)');
  // decaimento até zero
  for (let i = 0; i < 240; i++) p.update(1 / 30);
  assert.equal(Math.hypot(p.err.x, p.err.y, p.err.z), 0, 'offset zera após decaimento');
});

test('predict3d: teleport acima do limite faz snap seco e limpa histórico', () => {
  const world = getWorldLayout('PRED-SNAP');
  const p = new LocalPredictor({ world, speed: 5.2 });
  p.reconcile(serverPlayer(), 0);
  p.onInput(input({ seq: 1, dy: -1 }));
  // servidor teleporta o jogador para longe (> SNAP_DISTANCE)
  p.reconcile({ ...serverPlayer({ x: 100, z: -100 }), ackSeq: 1 }, 1);
  assert.equal(p.actor.x, 100);
  assert.equal(p.actor.z, -100);
  assert.deepEqual(p.err, { x: 0, y: 0, z: 0 }, 'sem offset residual após teleport');
  assert.equal(p.history.size, 0, 'histórico descartado');
});

test('predict3d: jogador morto segue o servidor e não prevê', () => {
  const world = getWorldLayout('PRED-DEAD');
  const p = new LocalPredictor({ world, speed: 5.2 });
  p.reconcile(serverPlayer(), 0);
  p.reconcile({ ...serverPlayer({ alive: false, x: 10, z: 20 }), ackSeq: 0 }, 0);
  assert.equal(p.actor.alive, false);
  p.onInput(input({ seq: 1, dy: -1 }));
  assert.equal(p.pending.length, 0, 'nenhum input previsto enquanto morto');
  assert.equal(p.actor.z, 20, 'posição presa ao servidor');
});
