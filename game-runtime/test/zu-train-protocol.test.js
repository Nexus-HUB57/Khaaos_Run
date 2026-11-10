// Task 53 — PROTOCOLO OFICIAL DE ENTRADA ZU (trem dos Rings) — suíte e2e.
//
// Cobre: SSOT (fases/grace/rota pura), sim offline (onboard, trava de combate,
// salto de porta, chegada, desbloqueio, pulso do Ring gated) e autoridade
// online (room3d: contrato do snapshot, salto autoritativo, disembark).
import test from 'node:test';
import assert from 'node:assert/strict';
import { KhaaosSim3D } from '../src/game3d/sim3d.js';
import { MatchRoom3D } from '../server/room3d.js';
import {
  ZU_TRAIN, COMBAT_UNLOCK_MS, zuTrainPhase, canAttackAt, doorWindowOpen,
  trainRoute, trainPoseAt, trainDoorJumpPose, combatUnlockEpoch, zuTrainAnnouncement, seedHashOf,
} from '../src/shared/zuTrain.js';
import { DEFAULT_INPUT } from '../src/game3d/sim3d.js';

const DT = 1 / 30;
const step = (sim, seconds, input = {}) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.step({ ...DEFAULT_INPUT, ...input }, DT);
};

// ---------- 1. SSOT ----------
test('SSOT: fases canônicas do protocolo e desbloqueio em chegada + 15s', () => {
  assert.equal(zuTrainPhase(0), 'embarque');
  assert.equal(zuTrainPhase(3399), 'embarque');
  assert.equal(zuTrainPhase(3400), 'em_rota');
  assert.equal(zuTrainPhase(7999), 'em_rota');
  assert.equal(zuTrainPhase(8000), 'portas');
  assert.equal(zuTrainPhase(15999), 'portas');
  assert.equal(zuTrainPhase(16000), 'grace');
  assert.equal(zuTrainPhase(30999), 'grace');
  assert.equal(zuTrainPhase(31000), 'combate');
  assert.equal(COMBAT_UNLOCK_MS, ZU_TRAIN.ARRIVAL_MS + ZU_TRAIN.GRACE_S * 1000);
  assert.equal(COMBAT_UNLOCK_MS, 31000);
  assert.equal(ZU_TRAIN.GRACE_S, 15); // protocolo ZU: ataques 15 s APÓS a chegada
  assert.equal(canAttackAt(16000), false);
  assert.equal(canAttackAt(31000), true);
  assert.equal(doorWindowOpen(7999), false);
  assert.equal(doorWindowOpen(8000), true);
  assert.equal(doorWindowOpen(16000), false);
});

test('SSOT: rota e pose de salto são PURAS (paridade servidor ↔ cliente)', () => {
  const spawn = { x: 30, z: 118 };
  const route = trainRoute(spawn, seedHashOf('CIGKV-3D'));
  const a = trainPoseAt(5000, route);
  const b = trainPoseAt(5000, route);
  assert.deepEqual(a, b); // mesma entrada → mesma pose (determinismo)
  assert.equal(trainPoseAt(0, route).progress, 0);
  assert.equal(trainPoseAt(ZU_TRAIN.ARRIVAL_MS, route).progress, 1);
  // pose de salto = pose do trem + lateral canônica + altura do protocolo
  const pose = trainDoorJumpPose(9000, route);
  const tp = trainPoseAt(9000, route);
  assert.equal(pose.y, ZU_TRAIN.JUMP_HEIGHT);
  const dx = route.x1 - route.x0, dz = route.z1 - route.z0, len = Math.hypot(dx, dz);
  assert.ok(Math.abs((pose.x - tp.x) - (-dz / len) * ZU_TRAIN.JUMP_LATERAL) < 1e-9);
  assert.ok(Math.abs((pose.z - tp.z) - (dx / len) * ZU_TRAIN.JUMP_LATERAL) < 1e-9);
  // anúncio serializável (evento zuIngress/snapshot)
  const ann = zuTrainAnnouncement(1720000000000);
  assert.equal(ann.doorOpenAtMs, 8000);
  assert.equal(ann.arrivalAtMs, 16000);
  assert.equal(ann.graceS, 15);
  assert.equal(ann.combatLockedUntil, combatUnlockEpoch(1720000000000));
});

// ---------- 2. sim offline — embarque e trava ----------
test('sim: protocolo do trem embarca TODOS a bordo, no chão, com combate travado', () => {
  const sim = new KhaaosSim3D({ seed: 'ZU-T53-A', botCount: 6 });
  sim.start('belt');
  assert.equal(sim.entryProtocol, 'zu_train_v1');
  assert.equal(sim.player.trainOnboard, true);
  assert.equal(sim.player.dropPhase, null);
  assert.ok(sim.bots.every((b) => b.trainOnboard && b.onGround));
  assert.ok(sim.combatLockedUntil > 0);
  const ingress = sim.events.find((e) => e.type === 'zuIngress');
  assert.equal(ingress.doorOpenAtMs, 8000);
  assert.equal(ingress.arrivalAtMs, 16000);
  assert.equal(ingress.graceS, 15);
  assert.equal(ingress.combatLockedAfterS, 31);
  // rota determinística compartilhada
  assert.deepEqual(sim.trainRoutePts, trainRoute(sim.world.playerSpawn, sim.seedHash));
});

test('sim: rota/portas/grace NÃO consomem partida nem pulso do Ring', () => {
  const sim = new KhaaosSim3D({ seed: 'ZU-T53-B', botCount: 4 });
  sim.start('belt');
  const t0 = sim.time;
  step(sim, 7.5); // 7,5 s de rota (antes da janela das portas)
  assert.equal(sim.time, t0); // relógio de MATCH_TIME congelado até o desbloqueio
  assert.equal(sim.ring.pulse, 0); // pulso do Ring começa APÓS o combate liberar
  assert.ok(sim.player.trainOnboard);
  // bots a bordo: parados (nenhum movimento de IA; saltadores ainda não existem)
  assert.ok(sim.bots.filter((b) => b.trainOnboard).every((b) => !b.moving));
});

// ---------- 3. salto de porta ----------
test('sim: salto de porta fora da janela é REJEITADO', () => {
  const sim = new KhaaosSim3D({ seed: 'ZU-T53-C', botCount: 2 });
  sim.start('belt');
  step(sim, 3); // embarque/em_rota — portas fechadas
  const before = { x: sim.player.x, z: sim.player.z };
  assert.equal(sim.doorJump(), false); // < 8 s
  assert.equal(sim.player.trainOnboard, true);
  assert.equal(sim.player.x, before.x);
  assert.equal(sim.player.z, before.z);
});

test('sim: salto de porta NA JANELA aplica a pose SSOT e pousa canonicamente', () => {
  const sim = new KhaaosSim3D({ seed: 'ZU-T53-D', botCount: 2 });
  sim.start('belt');
  step(sim, 9.5); // dentro da janela [8, 16)
  assert.equal(sim.doorJump(), true);
  const elapsed = sim.trainT * 1000;
  const pose = trainDoorJumpPose(elapsed, sim.trainRoutePts);
  assert.ok(Math.abs(sim.player.x - pose.x) < 1e-9);
  assert.ok(Math.abs(sim.player.z - pose.z) < 1e-9);
  assert.equal(sim.player.trainOnboard, false);
  assert.equal(sim.player.dropPhase, 'chute'); // pouso canônico da Fase 4
  assert.equal(sim.player.onGround, false);
  step(sim, 3); // desce e pousa
  assert.equal(sim.player.onGround, true);
  assert.equal(sim.player.dropPhase, null);
  assert.ok(sim.player.y < 0.6);
});

// ---------- 4. bots determinísticos + chegada + desbloqueio ----------
test('sim: bots saltam deterministicamente na janela; chegada desembarca o resto', () => {
  const sim = new KhaaosSim3D({ seed: 'ZU-T53-E', botCount: 6 });
  sim.start('belt');
  step(sim, 7.9); // até quase a abertura das portas
  const onboardBefore = sim.bots.filter((b) => b.trainOnboard).length;
  assert.equal(onboardBefore, 6);
  step(sim, 7.5); // atravessa a janela inteira
  // saltos registrados pelo protocolo (botDoorJump) — a queda de 5,5 m já pousa
  // dentro da janela, então a prova do salto é o EVENTO + quem ficou a bordo
  const jumped = sim.events.filter((e) => e.type === 'botDoorJump').length;
  assert.ok(jumped > 0, 'bots com i%3===0 devem saltar pela porta');
  assert.ok(sim.bots.filter((b) => !b.trainOnboard).length >= jumped);
  assert.ok(sim.bots.some((b) => b.trainOnboard), 'parte segue até o destino');
  step(sim, 1); // chegada (16 s)
  assert.equal(sim.trainArrived, true);
  assert.ok(sim.bots.every((b) => !b.trainOnboard));
  assert.equal(sim.player.trainOnboard, false);
  assert.equal(sim.events.filter((e) => e.type === 'trainArrived').length, 1);
  // desbloqueio só em 31 s
  assert.equal(sim.events.some((e) => e.type === 'combatUnlocked'), false);
  step(sim, 6); // ~22,5 s
  assert.equal(sim.events.some((e) => e.type === 'combatUnlocked'), false);
  step(sim, 9); // ~31,5 s
  assert.equal(sim.events.filter((e) => e.type === 'combatUnlocked').length, 1);
  assert.ok(sim.combatUnlockedAnnounced);
});

// ---------- 5. trava de dano (grace global) via input público ----------
test('sim: NENHUM dano entre operativos durante o grace; após 31s o combate vale', () => {
  const sim = new KhaaosSim3D({ seed: 'ZU-T53-F', botCount: 3 });
  sim.start('belt');
  step(sim, 16.5); // chegada + desembarque
  assert.equal(sim.player.trainOnboard, false);
  // ancora um alvo vivo a 3 m à frente do jogador (LOS aberto, sem obstáculos)
  const bot = sim.bots.find((b) => b.alive);
  assert.ok(bot, 'deve haver bot no ring');
  bot.x = sim.player.x; bot.z = sim.player.z - 3; bot.y = 0;
  const botLife0 = bot.life;
  // GRACE: atira 2 s — nada pode ser aplicado
  step(sim, 2, { fire: true, yaw: 0 });
  assert.equal(bot.life, botLife0, 'dano jogador→bot deve ser REJEITADO no grace');
  assert.equal(bot.alive, true);
  // depois do desbloqueio (31 s): o mesmo disparo causa dano
  step(sim, 15); // atravessa o restante do grace
  assert.equal(sim.events.some((e) => e.type === 'combatUnlocked'), true);
  bot.x = sim.player.x; bot.z = sim.player.z - 3; bot.y = 0; // re-ancora o alvo
  step(sim, 2, { fire: true, yaw: 0 });
  assert.ok(bot.life < botLife0 || !bot.alive, 'dano deve ser APLICADO após o desbloqueio');
});

test('sim: jogador a bordo não dispara (sem eventos de tiro na viagem)', () => {
  const sim = new KhaaosSim3D({ seed: 'ZU-T53-G', botCount: 2 });
  sim.start('belt');
  step(sim, 6, { fire: true }); // embarque + rota com gatilho preso
  assert.ok(!sim.events.some((e) => e.type === 'shot'), 'nenhum tiro durante a viagem');
});

// ---------- 6. autoridade online (room3d) ----------
test('room3d: contrato do protocolo no snapshot e a bordo (autoridade)', () => {
  const room = new MatchRoom3D({ id: 'zu-t53-room', seed: 'ZU-T53-H', capacity: 4, botFill: 3 });
  room.addPlayer('human');
  assert.equal(room.start('human', 'belt'), true);
  const actors = [...room.humans.values(), ...room.bots];
  assert.ok(actors.every((a) => a.trainOnboard === true));
  const snap = room.snapshot('human');
  assert.ok(snap.zuTrain);
  assert.equal(snap.zuTrain.graceS, 15);
  assert.equal(snap.zuTrain.doorOpenAtMs, 8000);
  assert.equal(snap.zuTrain.arrivalAtMs, 16000);
  assert.ok(Math.abs(snap.zuTrain.combatLockedUntil - (Date.now() + 31000)) < 2000);
  assert.equal(snap.zuTrain.combatLocked, true);
  assert.equal(snap.zuTrain.phase, 'embarque');
  // snapshot DRENA os eventos da fila: o zuIngress chega nele (não há segunda drenagem)
  const ingress = snap.events.find((e) => e.type === 'zuIngress');
  assert.ok(ingress, 'zuIngress no snapshot inicial');
  assert.equal(ingress.combatLockedUntil, snap.zuTrain.combatLockedUntil);
  // a bordo: inputs ignorados (sem física) e tempo de partida congelado
  const t0 = room.time;
  room.input('human', { ...DEFAULT_INPUT, dx: 0, dy: -1, seq: 1 });
  for (let i = 0; i < 20; i++) room.tick(1 / 20);
  const me = room.humans.get('human');
  assert.equal(me.z, snap.player.z); // posição autoritativa intocada a bordo
  assert.equal(room.time, t0);
});

test('room3d: salto de porta autoritativo — rejeita fora da janela, aplica na janela', () => {
  const room = new MatchRoom3D({ id: 'zu-t53-room2', seed: 'ZU-T53-I', capacity: 2, botFill: 1 });
  room.addPlayer('human');
  room.start('human', 'belt');
  assert.equal(room.doorJump('human'), false); // portas fechadas (< 8 s)
  // simula relógio dentro da janela das portas (9 s após o início da rota)
  room.trainStartedAtEpoch = Date.now() - 9000;
  const me = room.humans.get('human');
  assert.equal(room.doorJump('human'), true);
  const elapsed = Date.now() - room.trainStartedAtEpoch;
  const pose = trainDoorJumpPose(elapsed, room.trainRoutePts);
  assert.ok(Math.abs(me.x - pose.x) < 1e-6);
  assert.ok(Math.abs(me.z - pose.z) < 1e-6);
  assert.equal(me.dropPhase, 'chute');
  assert.equal(me.trainOnboard, false);
  assert.equal(room.doorJump('human'), false); // segunda tentativa: já fora do trem
});

test('room3d: chegada desembarca todos e o pulso do Ring só corre após o unlock', () => {
  const room = new MatchRoom3D({ id: 'zu-t53-room3', seed: 'ZU-T53-J', capacity: 2, botFill: 2 });
  room.addPlayer('human');
  room.start('human', 'belt');
  room.trainStartedAtEpoch = Date.now() - 16100; //logo após a chegada
  room.tick(1 / 20);
  assert.equal(room.trainArrived, true);
  assert.ok([...room.humans.values(), ...room.bots].every((a) => !a.trainOnboard));
  // pulso: com o relógio dentro do grace, pulseTimer não avança
  room.trainStartedAtEpoch = Date.now() - 20000; // ainda grace (até 31 s)
  const pulse0 = room.pulseTimer;
  for (let i = 0; i < 40; i++) room.tick(1 / 20); // 2 s
  assert.equal(room.pulseTimer, pulse0);
  // desbloqueio: relógio do protocolo em 32 s — pulseTimer volta a correr
  // (combatLockedUntil é deslocado junto — a sala de produção evolui os DOIS
  // a partir do epoch do start; no teste simulamos o mesmo instante)
  room.combatLockedUntil = Date.now() - 100;
  room.tick(1 / 20);
  assert.ok(room.pulseTimer > 0);
  assert.equal(room.combatUnlockedAnnounced, true);
});
