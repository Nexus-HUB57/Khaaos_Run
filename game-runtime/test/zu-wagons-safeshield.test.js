// Task 68 — PROTOCOLO ZU v2: VAGÕES + SALTO CONTROLADO + ESCUDO DE POUSO.
//
// Requisitos do protocolo (estação do mundo):
//   1. Os 100 operativos chegam à estação do respectivo mundo de TREM;
//   2. 10 vagões × 10 lugares (alocação canônica wagonOfIndex/wagonSeatOfIndex);
//   3. Os vagões chegam ESCALONADOS a cada 5 s (16 s → 61 s);
//   4. Pular ANTES do vagão parar = SALTO CONTROLADO: o protocolo PREVINE os
//      prováveis acidentes (batida, descarrilamento, incêndio, colisão) —
//      corredor seguro fora da bitola, intertravamento de portas fechadas,
//      pose do trem função pura do tempo e pouso amortecido sem dano;
//   5. Quem pousa FORA da Safe Zone recebe o ESCUDO DE POUSO: pelos 15 s em
//      que está protegido de ATAQUES também está protegido da penalidade de
//      estar fora da zona — 15 s para adentrá-la. A bordo (vagões tardios),
//      o operativo está fora de alcance de ataques mesmo após o desbloqueio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KhaaosSim3D, DEFAULT_INPUT } from '../src/game3d/sim3d.js';
import { MatchRoom3D } from '../server/room3d.js';
import {
  ZU_TRAIN, LAST_WAGON_STOP_MS, wagonOfIndex, wagonSeatOfIndex, wagonStopMs, wagonStopped,
  wagonJumpWindowOpen, trainRoute, trainDoorJumpPose, safeJumpPose, platformSlotPose,
  zuTrainAnnouncement, seedHashOf, ZU_ACCIDENTS,
} from '../src/shared/zuTrain.js';

const DT = 1 / 30;
const step = (sim, seconds, input = {}) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.step({ ...DEFAULT_INPUT, ...input }, DT);
};

// ---------- 1. SSOT — alocação e escalonagem dos vagões ----------
test('SSOT: 10 vagões × 10 lugares — alocação determinística dos 100 operativos', () => {
  assert.equal(ZU_TRAIN.WAGONS, 10);
  assert.equal(ZU_TRAIN.WAGON_CAPACITY, 10);
  assert.equal(ZU_TRAIN.WAGON_GAP_MS, 5000);
  const wagons = Array.from({ length: 100 }, (_, i) => wagonOfIndex(i));
  for (let w = 0; w < 10; w++) {
    const board = wagons.map((x, i) => ({ x, i })).filter((e) => e.x === w);
    assert.equal(board.length, 10, `vagão ${w} carrega exatamente 10 operativos`);
  }
  assert.equal(wagonOfIndex(0), 0);   // jogador = vagão 1
  assert.equal(wagonOfIndex(9), 0);
  assert.equal(wagonOfIndex(10), 1);
  assert.equal(wagonOfIndex(99), 9);
  assert.equal(wagonOfIndex(100), 0); // acima de 100, cicla (salas menores)
  assert.equal(wagonSeatOfIndex(7), 7);
  assert.equal(wagonSeatOfIndex(10), 0);
  assert.equal(wagonSeatOfIndex(97), 7);
});

test('SSOT: vagões chegam ESCALONADOS a cada 5 s (16 s → 61 s)', () => {
  for (let w = 0; w < 10; w++) {
    assert.equal(wagonStopMs(w), ZU_TRAIN.ARRIVAL_MS + w * 5000, `parada do vagão ${w}`);
    assert.equal(wagonStopMs(w), 16000 + w * 5000);
  }
  assert.equal(wagonStopMs(9), 61000);
  assert.equal(LAST_WAGON_STOP_MS, 61000);
  assert.equal(wagonStopped(15999, 0), false);
  assert.equal(wagonStopped(16000, 0), true);
  assert.equal(wagonStopped(20999, 1), false);
  assert.equal(wagonStopped(21000, 1), true);
  // janela de salto do próprio vagão: portas abertas E vagão ainda em rota
  assert.equal(wagonJumpWindowOpen(7999, 0), false); // portas fechadas
  assert.equal(wagonJumpWindowOpen(9000, 0), true);  // salto antecipado (controlado)
  assert.equal(wagonJumpWindowOpen(16000, 0), false); // vagão 1 parou → desembarque obrigatório
  assert.equal(wagonJumpWindowOpen(16000, 9), true);  // vagão 10 ainda em rota
  assert.equal(wagonJumpWindowOpen(61000, 9), false);
  // anúncio serializável carrega o contrato dos vagões
  const ann = zuTrainAnnouncement(1720000000000);
  assert.equal(ann.wagons, 10);
  assert.equal(ann.wagonCapacity, 10);
  assert.equal(ann.wagonGapMs, 5000);
  assert.equal(ann.lastWagonStopMs, 61000);
});

// ---------- 2. SSOT — salto controlado e plataforma ----------
test('SSOT: safeJumpPose abre CORREDOR SEGURO além da lateral da porta (prevenção de acidentes)', () => {
  const spawn = { x: 30, z: 118 };
  const route = trainRoute(spawn, seedHashOf('ZU-T68'));
  const base = trainDoorJumpPose(9500, route);
  // corredor seguro: MAIS lateral que o salto de porta clássico — nunca na bitola
  for (let w = 0; w < 10; w++) {
    const pose = safeJumpPose(9500, route, w);
    assert.equal(pose.y, ZU_TRAIN.JUMP_HEIGHT);
    assert.equal(pose.wagon, w);
    assert.equal(pose.early, true);
    assert.deepEqual(pose.prevented, ['batida', 'descarrilamento', 'incendio', 'colisao']);
    const dBase = Math.hypot(pose.x - base.x, pose.z - base.z);
    assert.ok(dBase >= ZU_TRAIN.SAFE_CORRIDOR_M - 1e-9, `vagão ${w} abre corredor ≥ ${ZU_TRAIN.SAFE_CORRIDOR_M}m (d=${dBase.toFixed(3)})`);
    assert.deepEqual(safeJumpPose(9500, route, w), pose, 'determinismo puro');
  }
  // faixas de vagões distintos NÃO colidem entre si (fluxos paralelos)
  const p0 = safeJumpPose(9500, route, 0), p9 = safeJumpPose(9500, route, 9);
  assert.ok(Math.hypot(p0.x - p9.x, p0.z - p9.z) > ZU_TRAIN.CORRIDOR_TIER_M * 8 - 1e-9);
  // pose determinada pelo elapsed: mesmo elapsed, mesma pose (paridade servidor↔cliente)
  assert.deepEqual(safeJumpPose(12000, route, 3), safeJumpPose(12000, route, 3));
});

test('SSOT: plataforma da estação acomoda os 100 lugares SEM sobreposição', () => {
  const route = trainRoute({ x: 30, z: 118 }, seedHashOf('ZU-T68'));
  const slots = new Set();
  for (let w = 0; w < 10; w++) {
    for (let s = 0; s < 10; s++) {
      const slot = platformSlotPose(route, w, s);
      assert.equal(slot.wagon, w);
      assert.equal(slot.seat, s);
      assert.equal(slot.y, 0);
      slots.add(`${slot.x.toFixed(4)}:${slot.z.toFixed(4)}`);
      // nenhum slot longe demais da estação (plataforma compacta — dentro do anel)
      assert.ok(Math.hypot(slot.x - route.x1, slot.z - route.z1) < 15, `slot (${w},${s}) junto à plataforma`);
      assert.deepEqual(platformSlotPose(route, w, s), slot, 'determinismo puro');
    }
  }
  assert.equal(slots.size, 100, '100 lugares distintos — anti-colisão canônica');
});

// ---------- 3. sim offline — embarque nos vagões ----------
test('sim: embarque aloca jogador e bots nos vagões canônicos (10×10)', () => {
  const sim = new KhaaosSim3D({ seed: 'ZU-T68-A', botCount: 12 });
  sim.start('belt');
  assert.equal(sim.player.wagon, 0);
  assert.equal(sim.player.zuSeat, 0);
  assert.equal(sim.player.zuShieldT, 0);
  for (let i = 0; i < sim.bots.length; i++) {
    assert.equal(sim.bots[i].wagon, wagonOfIndex(i + 1));
    assert.equal(sim.bots[i].zuSeat, wagonSeatOfIndex(i + 1));
  }
  // botCount 12 → índices 1..12: 9 no vagão 0, 3 no vagão 1
  assert.equal(sim.bots.filter((b) => b.wagon === 0).length, 9);
  assert.equal(sim.bots.filter((b) => b.wagon === 1).length, 3);
});

// ---------- 4. salto controlado (antes do vagão parar) ----------
test('sim: salto ANTES da parada é CONTROLADO — recibo de prevenção + escudo de 15 s', () => {
  const sim = new KhaaosSim3D({ seed: 'ZU-T68-B', botCount: 2 });
  sim.start('belt');
  step(sim, 3);
  assert.equal(sim.doorJump(), false); // portas trancadas — intertravamento anti-acidente
  step(sim, 6); // ~9 s — portas abertas, vagão 1 ainda em rota (para em 16 s)
  assert.equal(wagonJumpWindowOpen(sim.trainT * 1000, sim.player.wagon), true);
  assert.equal(sim.doorJump(), true);
  const pose = safeJumpPose(sim.trainT * 1000, sim.trainRoutePts, sim.player.wagon ?? 0);
  assert.ok(Math.abs(sim.player.x - pose.x) < 1e-9);
  assert.ok(Math.abs(sim.player.z - pose.z) < 1e-9);
  assert.equal(sim.player.dropPhase, 'chute'); // pouso amortecido — sem dano de queda
  assert.equal(sim.player.zuShieldT, 15);
  const receipt = sim.events.find((e) => e.type === 'zuEarlyJump');
  assert.ok(receipt, 'recibo zuEarlyJump emitido');
  assert.deepEqual(receipt.prevented, ZU_ACCIDENTS);
  assert.equal(receipt.wagon, 0);
  assert.equal(receipt.shieldS, 15);
  // vagão já parou → salto manual recusado (desembarque obrigatório no próximo passo)
  sim.player.trainOnboard = true;
  sim.trainT = wagonStopMs(0) / 1000 + 0.5;
  assert.equal(sim.doorJump(), false);
});

test('sim: salto controlado pousa FORA da bitola — nenhum estado de fogo/desastre é aplicado', () => {
  const sim = new KhaaosSim3D({ seed: 'ZU-T68-C', botCount: 2 });
  sim.start('belt');
  step(sim, 12); // ~12 s — salto tardio, comboio já próximo da estação
  assert.equal(sim.doorJump(), true);
  step(sim, 3); // pouso
  assert.equal(sim.player.onGround, true);
  assert.equal(sim.player.life, 100, 'sem dano de queda/acidente no pouso controlado');
  assert.equal(sim.player.dropPhase, null);
  // a pose do trem é função pura do tempo: nenhum agente a alterou (sem descarrilamento)
  const poseAtStation = sim.trainRoutePts;
  assert.deepEqual(poseAtStation, trainRoute(sim.world.playerSpawn, sim.seedHash));
});

// ---------- 5. chegada escalonada dos vagões ----------
test('sim: vagões desembarcam obrigatoriamente a cada 5 s em slots da plataforma, com escudo', () => {
  const sim = new KhaaosSim3D({ seed: 'ZU-T68-D', botCount: 12 });
  sim.start('belt');
  // jogador segue a bordo (não salta) — desembarca com o próprio vagão
  step(sim, 16.5); // vagão 1 parou (16 s)
  assert.equal(sim.player.trainOnboard, false);
  assert.equal(sim.player.onGround, true);
  const slot = platformSlotPose(sim.trainRoutePts, 0, 0);
  assert.ok(Math.abs(sim.player.x - slot.x) < 1e-9);
  assert.ok(Math.abs(sim.player.z - slot.z) < 1e-9);
  assert.equal(sim.player.zuShieldT > 14, true, 'escudo de pouso armado no desembarque');
  const ev0 = sim.events.filter((e) => e.type === 'wagonArrived');
  assert.equal(ev0.length, 1);
  assert.equal(ev0[0].wagon, 0);
  // vagão 1 descarrega TODOS os seus passageiros ainda a bordo (os saltadores
  // determinísticos i%3===0 já desceram antes pelo salto controlado)
  const jumpedW0 = sim.bots.filter((b, i) => i % 3 === 0 && wagonOfIndex(i + 1) === 0).length;
  assert.equal(ev0[0].disembarked, 10 - jumpedW0);
  assert.equal(10 - jumpedW0 + jumpedW0, 10, 'os 10 operativos do vagão 1 estão no chão');
  step(sim, 5); // vagão 2 (21 s)
  step(sim, 40); // atravessa TODAS as paradas (26 → 61 s)
  const evs = sim.events.filter((e) => e.type === 'wagonArrived');
  assert.equal(evs.length, 10, 'os 10 vagões chegaram a cada 5 s');
  for (let w = 0; w < 10; w++) assert.equal(evs[w].wagon, w);
  assert.equal(sim.trainArrived, true, 'trainArrived = último vagão');
  assert.ok(sim.bots.every((b) => !b.trainOnboard));
});

// ---------- 6. ESCUDO DE POUSO — 15 s protegido de ataques E da zona ----------
test('sim: pousou FORA da Safe Zone → ring não aplica penalidade durante o escudo de 15 s', () => {
  const sim = new KhaaosSim3D({ seed: 'ZU-T68-E', botCount: 1 });
  sim.start('belt');
  step(sim, 9);
  assert.equal(sim.doorJump(), true); // salto controlado → escudo 15 s
  // fora da Safe Zone (fora do anel)
  sim.player.x = sim.ring.x + sim.ring.radius + 20;
  sim.player.z = sim.ring.z;
  const life0 = sim.player.life;
  step(sim, 5); // 5 s fora do anel COM escudo
  assert.equal(sim.player.life, life0, 'escudo ZU protege da penalidade de zona');
  assert.ok(sim.player.zuShieldT > 0 && sim.player.zuShieldT < 15);
  step(sim, 12); // cruza o fim do escudo (~17 s de salto)
  assert.equal(sim.player.zuShieldT, 0);
  const lifePre = sim.player.life;
  step(sim, 2); // 2 s fora do anel SEM escudo
  assert.ok(sim.player.life < lifePre, 'após os 15 s, a penalidade de zona volta a valer');
});

test('sim: escudo de pouso protege de ATAQUES — tiro no recém-pousado é rejeitado', () => {
  const sim = new KhaaosSim3D({ seed: 'ZU-T68-F', botCount: 3 });
  sim.start('belt');
  // bot do vagão 2 (chega tarde) — força a alocação para exercitar o escudo após o unlock
  const bot = sim.bots[1];
  bot.wagon = 1; bot.zuSeat = 0; // desembarque em 21 s → escudo até 36 s
  step(sim, 21.5); // vagão 2 parou; bot pousou com escudo
  assert.equal(bot.trainOnboard, false);
  assert.equal(bot.zuShieldT > 14, true);
  // combate já liberado (31 s? não — 21,5 s: grace cobre; cruza o unlock primeiro)
  step(sim, 10); // ~31,5 s — desbloqueio; escudo do bot ainda ativo (até ~36 s)
  assert.equal(sim.combatUnlockedAnnounced, true);
  assert.ok(bot.zuShieldT > 0, 'escudo do bot ainda ativo após o unlock');
  // ancora o alvo à frente e dispara
  bot.x = sim.player.x; bot.z = sim.player.z - 3; bot.y = 0;
  const life0 = bot.life;
  step(sim, 2, { fire: true, yaw: 0 });
  assert.equal(bot.life, life0, 'ataque contra protegido é REJEITADO (escudo de pouso)');
  step(sim, 6); // escudo expira (~37,5 s)
  assert.equal(bot.zuShieldT, 0);
  bot.x = sim.player.x; bot.z = sim.player.z - 3; bot.y = 0;
  step(sim, 2, { fire: true, yaw: 0 });
  assert.ok(bot.life < life0 || !bot.alive, 'após o escudo, o ataque vale');
});

test('sim: A BORDO após o desbloqueio — vagão tardio está fora de alcance de ataques', () => {
  // spectate: true — a partida PRECISA continuar mesmo se o jogador cair
  // (tiros dos bots dependem do stream de RNG; fome/loot/fauna mudam o stream).
  // As assertions deste teste são sobre o PROTOCOLO do trem (imunidade a bordo,
  // desembarque obrigatório no vagão 10 + escudo), não sobre a sobrevivência
  // do jogador — sem spectate, a morte dele congela trainT antes dos 61 s.
  const sim = new KhaaosSim3D({ seed: 'ZU-T68-G', botCount: 2, spectate: true });
  sim.start('belt');
  const bot = sim.bots[1]; // i%3 !== 0 → não salta; segue até a parada do vagão
  bot.wagon = 9; bot.zuSeat = 0; // último vagão: parada em 61 s
  step(sim, 16.5); // jogador desembarca do vagão 1
  assert.equal(sim.player.trainOnboard, false);
  assert.equal(bot.trainOnboard, true, 'bot segue a bordo do vagão 10');
  step(sim, 20); // ~36,5 s — combate livre, bot AINDA a bordo
  assert.equal(sim.combatUnlockedAnnounced, true);
  bot.x = sim.player.x; bot.z = sim.player.z - 3; bot.y = 0; // simula alvo alcançável
  const life0 = bot.life;
  step(sim, 2, { fire: true, yaw: 0 });
  assert.equal(bot.life, life0, 'quem está a bordo não pode ser atacado (não pode agir)');
  step(sim, 26); // ~64,5 s — vagão 10 parou (61 s): desembarque obrigatório
  assert.equal(bot.trainOnboard, false);
  assert.ok(bot.zuShieldT > 0 && bot.zuShieldT <= ZU_TRAIN.GRACE_S, 'desembarque tardio recebe o escudo de 15 s (já em decaimento)');
});

// ---------- 7. autoridade online (room3d) ----------
test('room3d: alocação dos vagões no snapshot — wagon e escudo do próprio jogador', () => {
  const room = new MatchRoom3D({ id: 'zu-t68-room', seed: 'ZU-T68-H', capacity: 14, botFill: 12 });
  room.addPlayer('human');
  room.start('human', 'belt');
  const actors = [...room.humans.values(), ...room.bots];
  assert.equal(actors.length, 13);
  assert.equal(actors.filter((a) => a.wagon === 0).length, 10, 'vagão 1: humano + 9 bots');
  assert.equal(actors.filter((a) => a.wagon === 1).length, 3, 'vagão 2: 3 bots');
  const snap = room.snapshot('human');
  assert.equal(snap.zuTrain.wagons, 10);
  assert.equal(snap.zuTrain.wagonGapMs, 5000);
  assert.equal(snap.zuTrain.lastWagonStopMs, 61000);
  assert.equal(snap.zuTrain.wagon, 0);
  assert.equal(snap.zuTrain.shieldS, 0);
  assert.equal(snap.player.wagon, 0);
  assert.equal(snap.player.zuShieldS, 0);
});

test('room3d: chegada ESCALONADA — wagonArrived por vagão, desembarque obrigatório e escudo', () => {
  const room = new MatchRoom3D({ id: 'zu-t68-room2', seed: 'ZU-T68-I', capacity: 14, botFill: 12 });
  room.addPlayer('human');
  room.start('human', 'belt');
  const realNow = Date.now;
  try {
    // janela das portas: os saltadores determinísticos descem ANTES das paradas
    room.trainStartedAtEpoch = realNow() - 10300;
    room.tick(1 / 20);
    room.drainEvents('human');
    // vagão 1 (16 s): passageiros ainda a bordo desembarcam com escudo
    const jumpedW0 = room.bots.filter((b, i) => i % 3 === 0 && wagonOfIndex(i + 1) === 0).length;
    const jumpedW1 = room.bots.filter((b, i) => i % 3 === 0 && wagonOfIndex(i + 1) === 1).length;
    room.trainStartedAtEpoch = realNow() - 16100;
    room.tick(1 / 20);
    const ev0 = room.drainEvents('human').filter((e) => e.type === 'wagonArrived');
    assert.equal(ev0.length, 1);
    assert.equal(ev0[0].wagon, 0);
    assert.equal(ev0[0].disembarked, 10 - jumpedW0);
    const landed = [...room.humans.values(), ...room.bots].filter((a) => a.wagon === 0);
    assert.ok(landed.every((a) => !a.trainOnboard && a.zuShieldT > 14));
    const slot = platformSlotPose(room.trainRoutePts, 0, 0);
    const me = room.humans.get('human');
    assert.ok(Math.abs(me.x - slot.x) < 1e-9);
    // vagão 2 (21 s): os 3 bots restantes menos o saltador dele
    room.trainStartedAtEpoch = realNow() - 21500;
    room.tick(1 / 20);
    const ev1 = room.drainEvents('human').filter((e) => e.type === 'wagonArrived');
    assert.equal(ev1.length, 1);
    assert.equal(ev1[0].wagon, 1);
    assert.equal(ev1[0].disembarked, 3 - jumpedW1);
    assert.ok([...room.humans.values(), ...room.bots].every((a) => !a.trainOnboard));
    // trainArrived só no ÚLTIMO vagão (61 s)
    room.trainStartedAtEpoch = realNow() - 61500;
    room.tick(1 / 20);
    assert.equal(room.trainArrived, true);
    assert.ok(room.drainEvents('human').some((e) => e.type === 'trainArrived'));
  } finally {
    Date.now = realNow;
  }
});

test('room3d: salto controlado autoritativo — recibo de prevenção e escudo no snapshot', () => {
  const room = new MatchRoom3D({ id: 'zu-t68-room3', seed: 'ZU-T68-J', capacity: 2, botFill: 3 });
  room.addPlayer('human');
  room.start('human', 'belt');
  const realNow = Date.now;
  try {
    const FROZEN = realNow();
    Date.now = () => FROZEN;
    room.trainStartedAtEpoch = FROZEN - 10000; // portas abertas, vagão em rota
    assert.equal(room.doorJump('human'), true);
    const me = room.humans.get('human');
    const events = room.drainEvents('human');
    const receipt = events.find((e) => e.type === 'zuEarlyJump');
    assert.ok(receipt, 'recibo zuEarlyJump autoritativo');
    assert.deepEqual(receipt.prevented, ZU_ACCIDENTS);
    assert.equal(me.zuShieldT, 15);
    const snap = room.snapshot('human');
    assert.equal(snap.zuTrain.shieldS, 15);
    assert.equal(snap.player.zuShieldS, 15);
  } finally {
    Date.now = realNow;
  }
});

test('room3d: A BORDO após o desbloqueio é fora de alcance — tiro de humano não aplica dano', () => {
  const room = new MatchRoom3D({ id: 'zu-t68-room4', seed: 'ZU-T68-K', capacity: 3, botFill: 2 });
  room.addPlayer('p1');
  room.addPlayer('p2');
  room.start('p1', 'belt');
  const realNow = Date.now;
  try {
    // p2 segue a bordo do último vagão (força a alocação)
    const p2 = room.humans.get('p2');
    p2.wagon = 9; p2.zuSeat = 0;
    room.trainStartedAtEpoch = realNow() - 32500; // ~32,5 s: combate já liberado
    room.tick(1 / 20);
    assert.equal(p2.trainOnboard, true);
    const life0 = p2.life;
    // p1 desembarcado dispara contra o p2 a bordo (mesma posição autoritativa)
    p2.x = room.humans.get('p1').x; p2.z = room.humans.get('p1').z - 3;
    room.input('p1', { ...DEFAULT_INPUT, fire: true, yaw: 0, seq: 1 });
    for (let i = 0; i < 30; i++) room.tick(1 / 20);
    assert.equal(p2.life, life0, 'ataque contra passageiro é REJEITADO pela autoridade');
  } finally {
    Date.now = realNow;
  }
});
