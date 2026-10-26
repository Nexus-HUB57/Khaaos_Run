// Khaaos Run — Fase 5: agachamento (crouch), modo espectador (a partida continua
// após a eliminação do jogador, com combate bot-vs-bot) e orifícios de bala.
// Cobre a sim offline determinística, a MatchRoom3D autoritativa e o anti-cheat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchRoom3D } from '../server/room3d.js';
import { validateInput3D } from '../server/antiCheat.js';
import { KhaaosSim3D, DEFAULT_INPUT } from '../src/game3d/sim3d.js';

const STEP = 1 / 30;
const DT = 1 / 20;

// ---------- helpers ----------
const blank = (over = {}) => ({
  seq: 1, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false,
  jump: false, interact: false, reload: false, medkit: false, throw: false, gloo: false,
  crouch: false, slot: 0, ...over,
});
const idle = (yaw = 0) => blank({ yaw });
function makeRoom({ humans = 1, botFill = 0, seed = 'P5-3D' } = {}) {
  const room = new MatchRoom3D({ id: 'ring3d-p5', seed, region: 'sa-east', capacity: 16, botFill, airdrop: false });
  for (let i = 0; i < humans; i++) room.addPlayer(`p${i + 1}`, `JOGADOR-${i + 1}`);
  return room;
}
// posição aberta (fora de colliders com margem) — spawn do jogador é garantidamente livre
function assertOpen(sim, x, z, margin = 2.5) {
  for (const c of sim.world.colliders) {
    const inside = x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin && c.yMin < 1.5;
    assert.ok(!inside, `precondição: (${x},${z}) deve ser área aberta`);
  }
}

// ---------- agachamento (sim offline) ----------
test('fase5 sim: agachar reduz a velocidade à metade e aparece no estado do ator', () => {
  const a = new KhaaosSim3D({ seed: 'P5-CROUCH-A', botCount: 0, airdrop: false });
  const b = new KhaaosSim3D({ seed: 'P5-CROUCH-A', botCount: 0, airdrop: false });
  a.start('belt'); b.start('belt');
  assert.equal(DEFAULT_INPUT.crouch, false, 'DEFAULT_INPUT expõe crouch desligado');
  const sx = a.player.x, sz = a.player.z;
  // mesmo yaw, terreno aberto: 60 passos andando de pé vs agachado
  for (let i = 0; i < 60; i++) a.step({ ...idle(), seq: i + 1, dy: -1 }, STEP);
  for (let i = 0; i < 60; i++) b.step({ ...idle(), seq: i + 1, dy: -1, crouch: true }, STEP);
  const dStanding = Math.hypot(a.player.x - sx, a.player.z - sz);
  const dCrouched = Math.hypot(b.player.x - sx, b.player.z - sz);
  assert.ok(dStanding > 5, `andou de pé (${dStanding.toFixed(2)}m)`);
  assert.ok(b.player.crouching === true, 'ator marca crouching');
  assert.ok(a.player.crouching === false);
  const ratio = dCrouched / dStanding;
  assert.ok(ratio > 0.4 && ratio < 0.62, `agachado anda ~50% (${ratio.toFixed(2)})`);
});

test('fase5 sim: sprint é cancelado pelo agachamento (agachar tem prioridade)', () => {
  const s = new KhaaosSim3D({ seed: 'P5-SPRINT', botCount: 0, airdrop: false });
  s.start('belt');
  s.step({ ...idle(), seq: 1, dy: -1, sprint: true, crouch: true }, STEP);
  assert.equal(s.player.sprinting, false, 'sprint não se aplica agachado');
  assert.equal(s.player.crouching, true);
  // soltar o agachamento libera o sprint de novo
  s.step({ ...idle(), seq: 2, dy: -1, sprint: true, crouch: false }, STEP);
  assert.equal(s.player.sprinting, true);
});

test('fase5 sim: agachamento não tem efeito na queda (airdrop reseta o estado)', () => {
  const s = new KhaaosSim3D({ seed: 'P5-AIR', botCount: 0, airdrop: false });
  s.start('belt');
  // no salto, o salto prevalece: o ator sai do chão e o sprint/agachar não combinam
  s.step({ ...idle(), seq: 1, jump: true, crouch: true }, STEP);
  assert.ok(!s.player.onGround, 'ator no ar após o salto');
  const drop = new KhaaosSim3D({ seed: 'P5-AIR-DROP', botCount: 0 }); // airdrop ON
  drop.start('belt');
  assert.equal(drop.player.dropPhase, 'sky');
  drop.step({ ...idle(), seq: 1, crouch: true }, STEP);
  assert.equal(drop.player.crouching, false, 'em queda não agacha (reset pela fase de queda)');
  assert.equal(drop.player.sprinting, false);
});

// ---------- combate bot-vs-bot (vida ao ring + espectador) ----------
test('fase5 sim: bots engajam uns aos outros quando são os alvos mais próximos', () => {
  const s = new KhaaosSim3D({ seed: 'P5-BVB', botCount: 3, airdrop: false });
  s.start('belt');
  // jogador longe (fora do alcance de visão) e bots 01/02 colados numa área aberta
  const spawn = s.world.playerSpawn;
  const x0 = spawn.x, z0 = spawn.z;
  assertOpen(s, x0 + 2, z0);
  assertOpen(s, x0 + 5, z0);
  s.player.x = x0; s.player.z = z0 - 120; // a >85m do par
  for (const b of s.bots) { b.dropPhase = null; b.y = 0; }
  const b1 = s.bots[0], b2 = s.bots[1], b3 = s.bots[2];
  b1.x = x0 + 2; b1.z = z0;
  b2.x = x0 + 5; b2.z = z0;
  b3.x = x0 - 200; b3.z = z0 - 200; // fora da cena
  for (let i = 0; i < 300; i++) s.step({ ...idle(), seq: i + 1 }, STEP); // 10 s
  const hurt = b1.life < 100 || b2.life < 100 || b1.armor < 20 || b2.armor < 20 || !b1.alive || !b2.alive;
  assert.ok(hurt, `bots trocam tiro entre si (b1: ${b1.life.toFixed(0)}/arm ${b1.armor.toFixed(0)}, b2: ${b2.life.toFixed(0)}/arm ${b2.armor.toFixed(0)})`);
});

// ---------- modo espectador (sim offline) ----------
test('fase5 sim: com spectate a partida continua após a eliminação e termina com matchEnd', () => {
  const s = new KhaaosSim3D({ seed: 'P5-SPEC', botCount: 4, airdrop: false, spectate: true });
  s.start('belt');
  // elimina o jogador pelo anel (determinístico): vida mínima, fora do raio seguro
  s.player.armor = 0; s.player.life = 0.5;
  s.player.x = 300; s.player.z = 0;
  let eliminated = null, steps = 0;
  while (steps++ < 40) {
    s.step({ ...idle(), seq: steps }, STEP);
    eliminated = s.consumeEvents().find((e) => e.type === 'eliminated') ?? eliminated;
    if (!s.player.alive) break;
  }
  assert.equal(s.player.alive, false, 'jogador eliminado pelo anel');
  assert.ok(eliminated, 'evento eliminated emitido');
  assert.ok(eliminated.placement >= 2 && eliminated.placement <= 6, `posição coerente (#${eliminated.placement})`);
  assert.equal(s.over, false, 'partida NÃO termina na morte (modo espectador)');
  // a partida segue: bots lutam entre si até sobrar 1 (ou o tempo de partida expirar)
  let matchEnd = null, guard = 0;
  while (guard++ < 20000 && !s.over) {
    s.step({ ...idle(), seq: guard }, STEP);
    matchEnd = s.consumeEvents().find((e) => e.type === 'matchEnd') ?? matchEnd;
  }
  assert.equal(s.over, true, 'matchEnd chega com o desfecho do ring');
  assert.ok(matchEnd, 'evento matchEnd emitido');
  assert.ok(['time', 'last_alive'].includes(matchEnd.reason));
  assert.ok(matchEnd.winner, `matchEnd traz o vencedor (${matchEnd.winner})`);
  assert.ok(matchEnd.placement >= 2, `matchEnd preserva a posição do jogador (#${matchEnd.placement})`);
});

test('fase5 sim: sem spectate (legado) a eliminação encerra a partida imediatamente', () => {
  const s = new KhaaosSim3D({ seed: 'P5-LEGACY', botCount: 2, airdrop: false });
  s.start('belt');
  s.player.life = 0.5; s.player.armor = 0;
  s.player.x = 300; s.player.z = 0; // fora do anel: dano de zona nos próximos passos
  for (let i = 0; i < 30 && s.player.alive; i++) s.step({ ...idle(), seq: i + 1 }, STEP);
  assert.equal(s.player.alive, false);
  assert.equal(s.over, true, 'comportamento legado preservado');
});

// ---------- agachamento online (sala autoritativa + anti-cheat) ----------
test('fase5 room: input agachado move mais devagar e replica crouching nos snapshots', () => {
  const room = makeRoom({ humans: 2 });
  room.start('p1', 'belt');
  const p1 = room.humans.get('p1');
  const p2 = room.humans.get('p2');
  const x1 = p1.x, z1 = p1.z, x2 = p2.x, z2 = p2.z;
  let seq = 1;
  for (let i = 0; i < 60; i++) {
    room.input('p1', blank({ seq: seq++, dy: -1, crouch: true }));
    room.input('p2', blank({ seq: seq++, dy: -1 }));
    room.tick(DT);
  }
  const dCrouched = Math.hypot(p1.x - x1, p1.z - z1);
  const dStanding = Math.hypot(p2.x - x2, p2.z - z2);
  assert.ok(dStanding > dCrouched * 1.7, `de pé anda bem mais (${dStanding.toFixed(2)}m vs ${dCrouched.toFixed(2)}m agachado)`);
  const snap = room.snapshot('p1');
  assert.equal(snap.player.crouching, true, 'selfView replica crouching');
  // outro jogador também vê o estado agachado
  const other = room.snapshot('p2').others.find((o) => o.id === 'p1');
  assert.equal(other.crouching, true, 'otherView replica crouching');
});

test('fase5 room: bots replicam crouching=false e aceitam input crouch booleano no anti-cheat', () => {
  const room = makeRoom({ humans: 1, botFill: 3 });
  room.start('p1', 'belt');
  const snap = room.snapshot('p1');
  for (const o of snap.others) assert.equal(o.crouching, false);
  const prev = { seq: 0, yaw: 0, x: 0 };
  const ok = validateInput3D(prev, blank({ seq: 1, crouch: true }));
  assert.equal(ok.ok, true, 'crouch booleano é aceito');
  const bad = validateInput3D(prev, blank({ seq: 2, crouch: 1 }));
  assert.equal(bad.ok, false, 'crouch numérico é rejeitado');
  assert.ok(bad.violations.includes('field_type'));
});

// ---------- modo espectador online (sala autoritativa) ----------
test('fase5 room: humano eliminado permanece na sala e a partida segue até o último vivo', () => {
  const room = makeRoom({ humans: 1, botFill: 4 });
  room.start('p1', 'belt');
  const p1 = room.humans.get('p1');
  // mata o humano pelo anel (determinístico): vida mínima + fora do raio seguro
  p1.armor = 0; p1.life = 0.5;
  p1.x = 320; p1.z = 0;
  let seq = 1, eliminated = null;
  for (let i = 0; i < 40 && p1.alive; i++) {
    room.input('p1', blank({ seq: seq++ }));
    room.tick(DT);
    eliminated = room.drainEvents('p1').find((e) => e.type === 'eliminated') ?? eliminated;
  }
  assert.equal(p1.alive, false, 'humano eliminado pelo anel');
  assert.ok(eliminated, 'evento eliminated entregue à vítima');
  assert.ok(eliminated.placement >= 2, `posição #${eliminated.placement}`);
  assert.equal(room.state, 'IN_PROGRESS', 'sala continua em jogo (espectador)');
  // snapshots continuam fluindo para o espectador, com bots vivos em others
  room.input('p1', blank({ seq: seq++ }));
  room.tick(DT);
  const specSnap = room.snapshot('p1');
  assert.equal(specSnap.over, false);
  assert.ok(specSnap.others.filter((o) => o.isBot && o.alive).length >= 2, 'bots ainda vivos visíveis');
  // encerra por último vivo: elimina todos os bots menos um
  for (let i = 1; i < room.bots.length; i++) room.bots[i].alive = false;
  room.input('p1', blank({ seq: seq++ }));
  room.tick(DT);
  assert.equal(room.state, 'FINISHED', 'encerra com o último operativo vivo');
  const events = room.drainEvents('p1');
  const matchEnd = events.find((e) => e.type === 'matchEnd');
  assert.ok(matchEnd, 'matchEnd entregue ao espectador');
  assert.equal(matchEnd.reason, 'last_alive');
  assert.ok(matchEnd.winner, `matchEnd nomeia o vencedor (${matchEnd.winner})`);
});

test('fase5 room: sala vazia (todos desconectaram) encerra para liberar recursos', () => {
  const room = makeRoom({ humans: 2, botFill: 2 });
  room.start('p1', 'belt');
  room.removePlayer('p1');
  room.removePlayer('p2');
  room.tick(DT);
  assert.equal(room.state, 'FINISHED', 'sala sem humanos conectados termina');
  const matchEnd = room.drainEvents('p1');
  assert.ok(Array.isArray(matchEnd));
});
