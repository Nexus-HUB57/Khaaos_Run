// Khaaos Run — Fase 8: identidade operativa online (set_operative/snapshot),
// habilidades autoritativas no servidor (cooldown, heal, dash, speed, precision,
// damageReduction, temporaryArmor, recon, stun, concealment, ringResistance),
// tráfego urbano determinístico e fase do céu (dia/noite por pulso do Ring).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchRoom3D, OPERATIVE_IDS, ABILITY_TICK_RATE } from '../server/room3d.js';
import { validateInput3D } from '../server/antiCheat.js';
import { DEFAULT_INPUT, PULSE_INTERVAL, WEAPONS3D } from '../src/game3d/sim3d.js';
import { trafficPlacements } from '../src/game3d/detail3d.js';
import { buildWorldLayout } from '../src/game3d/layout3d.js';
import { nightnessFor, nightSceneState, mixHex, lerp, NIGHT, MAX_NIGHT_PULSE } from '../src/game3d/skyPhase.js';

const DT = 1 / 20;
const idle = (over = {}) => ({ ...DEFAULT_INPUT, ...over });

function makeRoom({ humans = 1, botFill = 2, seed = 'TESTE-F8', squad = false } = {}) {
  // botFill ≥ 1: com 1 humano e 0 bots a sala encerra no 1º tick (último vivo)
  const room = new MatchRoom3D({ id: 'ring3d-f8', seed, region: 'sa-east', capacity: 16, botFill, airdrop: false, squad });
  for (let i = 0; i < humans; i++) room.addPlayer(`p${i + 1}`, `JOGADOR-${i + 1}`);
  room._botsAway = () => { for (const b of room.bots) { b.x = 185; b.z = 185; } }; // IA longe dos testes de dano
  return room;
}
const blankInput = (over = {}) => ({
  seq: 1, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false,
  crouch: false, jump: false, interact: false, reload: false, medkit: false,
  throw: false, gloo: false, ability: false, slot: 0, ...over,
});
// projetil sintético determinístico (mesmos campos do #spawnBullet)
function spawnShotAt(room, ownerId, victim, damage = 20) {
  const m = { x: victim.x, y: victim.y + 1.42, z: victim.z + 6 }; // 6m ao sul, altura do cano
  room.bullets.push({
    id: room.nextBulletId++, x: m.x, y: m.y, z: m.z,
    vx: 0, vy: 0, vz: -30, // viaja para -Z (em direção à vítima)
    owner: ownerId, damage, baseDamage: damage, distance: 0,
    gravity: 0, drag: 0, life: 2, weapon: 'g19', lagTargets: null,
  });
}
// ponto aberto do layout: loot spot com corredor livre de 6m ao sul (linha do tiro
// sintético) — verifica colliders no ponto e no segmento (vítima → muzzle)
function openSpot(room) {
  const colliders = room.world.colliders;
  const clearSouth = (x, z) => colliders.every((c) =>
    c.minX > x + 1.2 || c.maxX < x - 1.2 || c.minZ > z + 7.2 || c.maxZ < z - 1.2);
  const spot = room.world.lootSpots.find((s) => Math.abs(s.x) < 160 && Math.abs(s.z) < 160 && clearSouth(s.x, s.z));
  return { x: spot.x, z: spot.z };
}
function stepUntilHit(room, maxTicks = 30) {
  for (let i = 0; i < maxTicks; i++) {
    room.tick(DT);
    if (room.bullets.length === 0) return true;
  }
  return false;
}
function drainAll(room) {
  for (const id of room.humans.keys()) room.drainEvents(id);
}

// ---------- identidade operativa ----------
test('fase8 identidade: setOperative valida catálogo e só muda em LOBBY', () => {
  const room = makeRoom({ humans: 1 });
  assert.equal(room.setOperative('p1', 'OP_FEMALE_SNIPER'), true);
  assert.equal(room.humans.get('p1').operativeId, 'OP_FEMALE_SNIPER');
  assert.equal(room.setOperative('p1', 'OP_QUE_NAO_EXISTE'), false);
  assert.equal(room.humans.get('p1').operativeId, 'OP_FEMALE_SNIPER');
  room.start('p1', 'belt');
  assert.equal(room.setOperative('p1', 'OP_MALE_VANGUARD'), false); // partida iniciada
  assert.equal(room.humans.get('p1').operativeId, 'OP_FEMALE_SNIPER');
});

test('fase8 identidade: addPlayer aceita operativo e snapshot carrega self+others', () => {
  const room = new MatchRoom3D({ id: 'f8b', seed: 'ID-1', capacity: 8, botFill: 3, airdrop: false });
  room.addPlayer('p1', 'JOGADOR-1', 'OP_FEMALE_VALKYRIE');
  room.start('p1', 'belt');
  const snap = room.snapshot('p1');
  assert.equal(snap.player.operativeId, 'OP_FEMALE_VALKYRIE'); // addPlayer validou (id do catálogo)
  assert.ok(snap.player.abilityState && 'cooldownTicks' in snap.player.abilityState);
  assert.equal(snap.player.temporaryArmor, 0);
  const bots = snap.others.filter((o) => o.isBot);
  assert.equal(bots.length, 3);
  for (const b of bots) assert.ok(OPERATIVE_IDS.includes(b.op), `bot sem op válida: ${b.op}`);
  assert.ok(bots.every((b) => typeof b.revealed === 'boolean'));
});

test('fase8 identidade: addPlayer rejeita catálogo inválido e cai no VANGUARD', () => {
  const room = new MatchRoom3D({ id: 'f8c', seed: 'ID-2', capacity: 4, botFill: 0, airdrop: false });
  room.addPlayer('p1', 'JOGADOR-1', 'OP_FALSO');
  assert.equal(room.humans.get('p1').operativeId, 'OP_MALE_VANGUARD');
});

// ---------- habilidades autoritativas ----------
test('fase8 habilidade: heal (Coágulo de Campo) cura com teto e entra em cooldown', () => {
  const room = makeRoom({ humans: 1 });
  room.setOperative('p1', 'OP_MALE_MEDIC_AFRICAN');
  room.start('p1', 'belt');
  const p = room.humans.get('p1');
  p.life = 50;
  room.input('p1', blankInput({ seq: 1, ability: true }));
  room.tick(DT);
  assert.equal(p.life, 74); // 50 + 24
  const st = p.abilityState;
  assert.ok(st.cooldownT > 54 && st.cooldownT <= 55, `cooldown: ${st.cooldownT}`);
  const events = room.drainEvents('p1').filter((e) => e.type === 'ability');
  assert.equal(events.length, 1);
  assert.equal(events[0].isSelf, true);
  assert.equal(events[0].effect, 'heal');
  // durante o cooldown não repete
  room.input('p1', blankInput({ seq: 2, ability: true }));
  room.tick(DT);
  assert.equal(p.life, 74);
  assert.ok(p.abilityState.cooldownT < 55);
});

test('fase8 habilidade: heal respeita vida cheia (abilityUnavailable, sem custo)', () => {
  const room = makeRoom({ humans: 1 });
  room.setOperative('p1', 'OP_MALE_MEDIC_AFRICAN');
  room.start('p1', 'belt');
  room.input('p1', blankInput({ seq: 1, ability: true }));
  room.tick(DT);
  const events = room.drainEvents('p1');
  assert.ok(events.some((e) => e.type === 'abilityUnavailable'));
  assert.equal(room.humans.get('p1').abilityState.cooldownT, 0);
});

test('fase8 habilidade: cooldownTicks no snapshot segue a convenção 30Hz', () => {
  const room = makeRoom({ humans: 1 });
  room.setOperative('p1', 'OP_MALE_MEDIC_AFRICAN');
  room.start('p1', 'belt');
  room.humans.get('p1').life = 50; // sem isso o heal é recusado (vida cheia)
  room.input('p1', blankInput({ seq: 1, ability: true }));
  room.tick(DT);
  const snap = room.snapshot('p1');
  assert.ok(Math.abs(snap.player.abilityState.cooldownTicks - 55 * ABILITY_TICK_RATE) <= 2);
});

test('fase8 habilidade: dash (Ruptura de Viela) limita o deslocamento ao orçamento', () => {
  const dash = makeRoom({ humans: 1, seed: 'DASH-1' });
  dash.setOperative('p1', 'OP_MALE_VANGUARD');
  dash.start('p1', 'belt');
  const a = dash.humans.get('p1');
  const z0 = a.z;
  dash.input('p1', blankInput({ seq: 1, ability: true, dy: -1 }));
  dash.tick(DT);
  assert.equal(a.abilityState.effect, 'dash'); // ativação autoritativa confirmada
  // deslocamento acumulado enquanto o dash está ativo (orçamento de 8m @ ~8,6 m/s)
  let movedDuringDash = 0;
  for (let i = 2; i <= 120; i++) {
    const before = a.z;
    dash.input('p1', blankInput({ seq: i, dy: -1 }));
    dash.tick(DT);
    if (a.abilityState.effect === 'dash' || movedDuringDash === 0) movedDuringDash += before - a.z;
    else break; // dash encerrado (orçamento esgotado) — janela encerrada
    if (a.abilityState.activeT === 0) break;
  }
  assert.ok(movedDuringDash > 5.5, `dash deve avançar bastante: ${movedDuringDash.toFixed(2)}`);
  assert.ok(movedDuringDash <= 8.7, `dash não pode passar do orçamento (8m): ${movedDuringDash.toFixed(2)}`);
  assert.ok(a.abilityState.cooldownT > 0, 'dash esgotado entra em cooldown');
});

test('fase8 habilidade: speed (Investida Quebramar) amplia o deslocamento ~1.45x', () => {
  const withSpeed = makeRoom({ humans: 1, seed: 'SPD-1' });
  withSpeed.setOperative('p1', 'OP_MALE_BERSERKER_PACIFIC');
  withSpeed.start('p1', 'belt');
  const a = withSpeed.humans.get('p1');
  a.x = 0; a.z = 40;
  withSpeed.input('p1', blankInput({ seq: 1, ability: true }));
  withSpeed.tick(DT);
  const z0 = a.z;
  for (let i = 2; i <= 30; i++) { withSpeed.input('p1', blankInput({ seq: i, dy: -1 })); withSpeed.tick(DT); }
  const movedFast = z0 - a.z;

  const normal = makeRoom({ humans: 1, seed: 'SPD-2' });
  normal.start('p1', 'belt');
  const b = normal.humans.get('p1');
  b.x = 0; b.z = 40;
  const z0b = b.z;
  for (let i = 1; i <= 30; i++) { normal.input('p1', blankInput({ seq: i, dy: -1 })); normal.tick(DT); }
  const movedNormal = z0b - b.z;
  const ratio = movedFast / movedNormal;
  assert.ok(ratio > 1.35 && ratio < 1.55, `razão de velocidade esperada ~1.45: ${ratio.toFixed(3)} (${movedFast.toFixed(2)} vs ${movedNormal.toFixed(2)})`);
});

test('fase8 habilidade: precision ativa o multiplicador de precisão no ator', () => {
  const room = makeRoom({ humans: 1 });
  room.setOperative('p1', 'OP_FEMALE_SNIPER');
  room.start('p1', 'belt');
  const p = room.humans.get('p1');
  room.input('p1', blankInput({ seq: 1, ability: true }));
  room.tick(DT);
  assert.equal(p.abilityState.effect, 'precision');
  // a derivada é recalculada no próximo passo de input (mesma ordem da sim offline)
  room.input('p1', blankInput({ seq: 2 }));
  room.tick(DT);
  assert.ok(p.abilityAccuracyMultiplier > 1);
});

test('fase8 habilidade: damageReduction reduz o dano direto recebido em 25%', () => {
  const hard = makeRoom({ humans: 2, seed: 'DR-1' });
  hard.setOperative('p2', 'OP_FEMALE_TACTICIAN_SOUTHASIAN');
  hard.start('p1', 'belt');
  hard._botsAway();
  const v = hard.humans.get('p2');
  const spot = openSpot(hard);
  v.armor = 0; v.life = 100; v.x = spot.x; v.z = spot.z; v.yaw = 0;
  hard.input('p2', blankInput({ seq: 1, ability: true }));
  hard.tick(DT);
  assert.equal(v.abilityState.effect, 'damageReduction');
  spawnShotAt(hard, 'p1', v, 20);
  drainAll(hard);
  assert.ok(stepUntilHit(hard));
  const lifeWithReduction = v.life;

  const soft = makeRoom({ humans: 2, seed: 'DR-1' }); // MESMA seed: geometria idêntica
  soft.start('p1', 'belt');
  soft._botsAway();
  const v2 = soft.humans.get('p2');
  const spot2 = openSpot(soft);
  v2.armor = 0; v2.life = 100; v2.x = spot2.x; v2.z = spot2.z; v2.yaw = 0;
  spawnShotAt(soft, 'p1', v2, 20);
  drainAll(soft);
  assert.ok(stepUntilHit(soft));
  const lifeWithout = v2.life;

  assert.ok(lifeWithout < 100, 'tiro de referência deve causar dano');
  assert.ok(Math.abs((100 - lifeWithReduction) - (100 - lifeWithout) * 0.75) < 0.6,
    `dano com redução deve ser 75%: ${100 - lifeWithReduction} vs ${100 - lifeWithout}`);
});

test('fase8 habilidade: temporaryArmor absorve dano e expira zerando', () => {
  const room = makeRoom({ humans: 2, seed: 'TA-1' });
  room.setOperative('p2', 'OP_FEMALE_HEAVY_AFRICAN');
  room.start('p1', 'belt');
  room._botsAway();
  const v = room.humans.get('p2');
  const spot = openSpot(room);
  v.armor = 0; v.life = 100; v.x = spot.x; v.z = spot.z;
  room.input('p2', blankInput({ seq: 1, ability: true }));
  room.tick(DT);
  assert.equal(v.temporaryArmor, 15);
  spawnShotAt(room, 'p1', v, 20);
  drainAll(room);
  assert.ok(stepUntilHit(room));
  // 20 de dano: 15 absorvidos pela blindagem temporária (soak integral, armor fixa = 0)
  assert.ok(v.temporaryArmor < 15, 'blindagem consumida');
  assert.ok(v.life > 84, `dano restante ≤ 5 + falloff: vida ${v.life.toFixed(1)}`);
  // expiração zera a blindagem
  for (let i = 0; i < 130; i++) room.tick(DT); // 6.5s > 6s de duração
  assert.equal(v.temporaryArmor, 0);
  assert.equal(v.abilityState.effect, null);
});

test('fase8 habilidade: recon marca bots no raio e o snapshot revela para o minimapa', () => {
  const room = makeRoom({ humans: 1, botFill: 3, seed: 'RC-1' });
  room.setOperative('p1', 'OP_MALE_RECON_ASIAN');
  room.start('p1', 'belt');
  const p = room.humans.get('p1');
  const near = room.bots[0], far = room.bots[1];
  near.x = p.x + 10; near.z = p.z; // dentro do raio 28
  far.x = p.x + 90; far.z = p.z;   // fora
  room.input('p1', blankInput({ seq: 1, ability: true }));
  room.tick(DT);
  assert.ok(near.revealedTicks > 0);
  assert.equal(far.revealedTicks, 0);
  const events = room.drainEvents('p1').filter((e) => e.type === 'ability');
  assert.equal(events[0].targets, 1);
  let snap = room.snapshot('p1');
  const othersById = new Map(snap.others.map((o) => [o.id, o]));
  assert.equal(othersById.get(near.id).revealed, true);
  assert.equal(othersById.get(far.id).revealed, false);
  for (let i = 0; i < 70; i++) room.tick(DT); // 3.5s > 3s de marca
  snap = room.snapshot('p1');
  const after = new Map(snap.others.map((o) => [o.id, o]));
  assert.equal(after.get(near.id).revealed, false);
});

test('fase8 habilidade: stun congela o bot (sem mover/atirar) durante a duração', () => {
  const room = makeRoom({ humans: 1, botFill: 2, seed: 'ST-1' });
  room.setOperative('p1', 'OP_FEMALE_DISRUPTOR_MENA');
  room.start('p1', 'belt');
  const p = room.humans.get('p1');
  const bot = room.bots[0];
  bot.x = p.x + 4; bot.z = p.z; // dentro do raio 9
  room.input('p1', blankInput({ seq: 1, ability: true }));
  room.tick(DT);
  assert.ok(bot.ai.stunT > 0, 'bot atordoado');
  const bx = bot.x, bz = bot.z;
  for (let i = 0; i < 12; i++) room.tick(DT); // 0.6s congelado
  assert.equal(bot.x, bx);
  assert.equal(bot.z, bz);
  assert.ok(bot.ai.stunT < 1.5, 'stun decresce');
  for (let i = 0; i < 40; i++) room.tick(DT); // 2s: stun acabou
  assert.ok((bot.ai.stunT ?? 0) <= 0);
});

test('fase8 habilidade: concealment impede que a IA adquira o alvo ocultado', () => {
  const room = makeRoom({ humans: 1, botFill: 1, seed: 'CC-1' });
  room.setOperative('p1', 'OP_FEMALE_STEALTH_ASIAN');
  room.start('p1', 'belt');
  const p = room.humans.get('p1');
  const bot = room.bots[0];
  // sem ocultação: bot engaja com LOS limpo (praça central)
  p.x = 0; p.z = 0;
  bot.x = 0; bot.z = -40;
  let engaged = false;
  for (let i = 1; i <= 40 && !engaged; i++) {
    room.input('p1', blankInput({ seq: i }));
    room.tick(DT);
    engaged = bot.ai.state === 'engage' || room.bullets.some((b) => b.owner === bot.id);
  }
  assert.ok(engaged, 'referência: bot deve engajar alvo visível');
  // ocultado: alvo some da percepção da IA
  const room2 = makeRoom({ humans: 1, botFill: 1, seed: 'CC-1' });
  room2.setOperative('p1', 'OP_FEMALE_STEALTH_ASIAN');
  room2.start('p1', 'belt');
  const p2 = room2.humans.get('p1');
  const bot2 = room2.bots[0];
  p2.x = 0; p2.z = 0;
  bot2.x = 0; bot2.z = -40;
  room2.input('p1', blankInput({ seq: 1, ability: true })); // Véu Crepuscular 4s
  room2.tick(DT);
  for (let i = 2; i <= 60; i++) { room2.input('p1', blankInput({ seq: i })); room2.tick(DT); }
  assert.notEqual(bot2.ai.state, 'engage');
  assert.ok(!room2.bullets.some((b) => b.owner === bot2.id), 'bot não atira em alvo ocultado');
});

test('fase8 habilidade: ringResistance reduz o dano do Ring em 40%', () => {
  const guarded = makeRoom({ humans: 1, seed: 'RR-1' });
  guarded.setOperative('p1', 'OP_FEMALE_SURVIVOR_INDIGENOUS');
  guarded.start('p1', 'belt');
  const g = guarded.humans.get('p1');
  g.armor = 0; g.life = 100;
  g.x = 175; g.z = 0; // fora do anel inicial (168)
  guarded.input('p1', blankInput({ seq: 1, ability: true }));
  guarded.tick(DT);
  const lifeStart = g.life;
  for (let i = 0; i < 10; i++) { guarded.input('p1', blankInput({ seq: i + 2 })); guarded.tick(DT); }
  const dmgGuarded = lifeStart - g.life;

  const bare = makeRoom({ humans: 1, seed: 'RR-2' });
  bare.start('p1', 'belt');
  const b = bare.humans.get('p1');
  b.armor = 0; b.life = 100;
  b.x = 175; b.z = 0;
  const lifeStartB = b.life;
  for (let i = 0; i < 10; i++) { bare.input('p1', blankInput({ seq: i + 1 })); bare.tick(DT); }
  const dmgBare = lifeStartB - b.life;
  assert.ok(dmgBare > 0, 'ring deve causar dano fora da zona');
  assert.ok(Math.abs(dmgGuarded - dmgBare * 0.6) < 0.35,
    `dano do ring com resistência deve ser 60%: ${dmgGuarded.toFixed(2)} vs ${dmgBare.toFixed(2)}`);
});

test('fase8 habilidade: bloqueada caído, no ar e antes do start', () => {
  const room = makeRoom({ humans: 1 });
  room.setOperative('p1', 'OP_MALE_MEDIC_AFRICAN');
  const p = room.humans.get('p1');
  room.input('p1', blankInput({ seq: 1, ability: true }));
  room.tick(DT); // ainda em LOBBY
  assert.equal(p.abilityState.cooldownT, 0);
  room.start('p1', 'belt');
  p.dropPhase = 'sky'; p.onGround = false;
  room.input('p1', blankInput({ seq: 2, ability: true }));
  room.tick(DT);
  assert.equal(p.abilityState.cooldownT, 0);
  p.dropPhase = null; p.onGround = true;
  p.knocked = true;
  room.input('p1', blankInput({ seq: 3, ability: true }));
  room.tick(DT);
  assert.equal(p.abilityState.cooldownT, 0);
});

test('fase8 habilidade: evento chega a humanos próximos com isSelf=false', () => {
  const room = makeRoom({ humans: 2, seed: 'EV-1' });
  room.setOperative('p1', 'OP_MALE_MEDIC_AFRICAN');
  room.start('p1', 'belt');
  const a = room.humans.get('p1'), b = room.humans.get('p2');
  a.x = 0; a.z = 0; b.x = 8; b.z = 0; // a 8m — dentro do raio 90
  a.life = 50;
  room.input('p1', blankInput({ seq: 1, ability: true }));
  room.tick(DT);
  const evA = room.drainEvents('p1').filter((e) => e.type === 'ability');
  const evB = room.drainEvents('p2').filter((e) => e.type === 'ability');
  assert.equal(evA[0]?.isSelf, true);
  assert.equal(evB[0]?.isSelf, false);
  assert.equal(evB[0]?.by, a.name);
});

// ---------- anticheat ----------
test('fase8 anticheat: validateInput3D aceita ability booleano e rejeita tipos estranhos', () => {
  const base = { seq: 1, dx: 0, dy: 0, yaw: 0, pitch: 0 };
  assert.deepEqual(validateInput3D({ ...base, yaw: 0 }, { ...base, seq: 2, ability: true }, DT), { ok: true, violations: [] });
  assert.deepEqual(validateInput3D({ ...base, yaw: 0 }, { ...base, seq: 3, ability: 1 }, DT).ok, false);
  assert.deepEqual(validateInput3D({ ...base, yaw: 0 }, { ...base, seq: 4, ability: 'yes' }, DT).ok, false);
});

// ---------- tráfego urbano ----------
test('fase8 trafego: determinístico, nas vias, sem colisões e com espaçamento', () => {
  const layout = buildWorldLayout('TRAFEGO-1', 'CIGKV');
  const t1 = trafficPlacements(layout, { density: 1 });
  const t2 = trafficPlacements(layout, { density: 1 });
  assert.deepEqual(t1, t2);
  assert.ok(t1.length > 4, `tráfego deve existir: ${t1.length}`);
  for (const c of t1) {
    assert.ok(['car', 'van'].includes(c.type));
    assert.ok(Number.isInteger(c.color) && c.color >= 0 && c.color < 6);
    assert.ok(Math.abs(c.x) <= 196 && Math.abs(c.z) <= 196);
    for (const col of layout.colliders) {
      const outside = c.x < col.minX - 1.6 || c.x > col.maxX + 1.6 || c.z < col.minZ - 1.6 || c.z > col.maxZ + 1.6;
      assert.ok(outside, `veículo dentro de estrutura: ${JSON.stringify(c)} vs ${JSON.stringify(col)}`);
    }
    for (const l of layout.lootSpots) assert.ok(Math.hypot(c.x - l.x, c.z - l.z) > 4.4, 'veículo sobre loot');
  }
  for (let i = 0; i < t1.length; i++) {
    for (let j = i + 1; j < t1.length; j++) {
      assert.ok(Math.hypot(t1[i].x - t1[j].x, t1[i].z - t1[j].z) >= 8.9, 'veículos muito próximos');
    }
  }
  const low = trafficPlacements(layout, { density: 0.45 });
  assert.ok(low.length <= t1.length, 'densidade menor não gera mais veículos');
});

// ---------- céu dinâmico ----------
test('fase8 ceu: nightness cresce com os pulsos e satura em 1', () => {
  assert.equal(nightnessFor(0), 0);
  assert.equal(nightnessFor(2), 2 / MAX_NIGHT_PULSE);
  assert.equal(nightnessFor(MAX_NIGHT_PULSE), 1);
  assert.equal(nightnessFor(99), 1);
  assert.equal(nightnessFor(-3), 0);
});

test('fase8 ceu: nightSceneState interpola base→noite (t=0 e t=1)', () => {
  const base = { sky: { top: '#2a1e4f', mid: '#7a4a6f', horizon: '#d98a5f' }, fogColor: '#3a2b45', sunColor: '#ffc98f', sunIntensity: 2.35, hemiIntensity: 1.18, fillIntensity: 0.72, backIntensity: 0.55 };
  const t0 = nightSceneState(base, 0);
  assert.equal(t0.skyTop, '#2a1e4f');
  assert.equal(t0.sunIntensity, 2.35);
  assert.equal(t0.starBoost, 0.5);
  const t1 = nightSceneState(base, 1);
  assert.equal(t1.skyTop, NIGHT.skyTop);
  assert.equal(t1.skyMid, NIGHT.skyMid);
  assert.equal(t1.skyHorizon, NIGHT.skyHorizon);
  assert.equal(t1.sunIntensity, NIGHT.sunIntensity);
  assert.equal(t1.hemiIntensity, NIGHT.hemiIntensity);
  assert.ok(t1.sunIntensity < t0.sunIntensity);
  const mid = nightSceneState(base, 0.5);
  assert.ok(mid.sunIntensity > NIGHT.sunIntensity && mid.sunIntensity < 2.35);
});

test('fase8 ceu: mixHex e lerp utilitários', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixHex('#102030', '#102030', 0.7), '#102030');
  assert.equal(lerp(0, 10, 0.25), 2.5);
});

test('fase8 snapshot: pulso do ring disponível p/ o cliente dirigir a noite', () => {
  const room = makeRoom({ humans: 1, botFill: 0 });
  room.start('p1', 'belt');
  const snap = room.snapshot('p1');
  assert.ok(snap.ring && 'pulse' in snap.ring);
  assert.equal(snap.ring.pulse, 0);
  room.pulseTimer = PULSE_INTERVAL;
  room.tick(DT);
  assert.equal(room.snapshot('p1').ring.pulse, 1);
});
