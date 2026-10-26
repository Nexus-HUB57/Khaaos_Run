// Khaaos Run — Fase 7: squad com revive (DBNO), salas privadas com código de
// convite, balanceamento da letalidade dos bots e LOD de qualidade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KhaaosSim3D, DBNO, BOT_COMBAT, DEFAULT_INPUT,
  assignSquads, knockActor, reviveTargetFor, stepRevive, botAimError, botDamageScale,
} from '../src/game3d/sim3d.js';
import { MatchRoom3D } from '../server/room3d.js';
import { makeInviteCode, normalizeInviteCode, findRoomByCode } from '../server/matchmaking.js';
import { QUALITY_TIERS, resolveQuality, qualityTier } from '../src/game3d/quality3d.js';

const STEP = 1 / 30;
const idle = (over = {}) => ({ ...DEFAULT_INPUT, ...over });

// força um nocaute determinístico: anel pequeno + vida mínima
function knockPlayer(sim, { x = 20, z = 0 } = {}) {
  const p = sim.player;
  p.armor = 0;
  p.life = 0.001;
  sim.ring.radius = 10;
  sim.ring.target = 10;
  sim.ring.pulse = 60; // dano do ring mata em 1 tick com vida ~0
  p.x = x;
  p.z = z;
  sim.step(idle(), STEP);
  sim.consumeEvents();
  return p;
}

// ---------- helpers de DBNO ----------
test('fase7 dbno: assignSquads agrupa por ordem em grupos de 4', () => {
  const squads = assignSquads(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], 4);
  assert.equal(squads.a, 'sq-1');
  assert.equal(squads.d, 'sq-1');
  assert.equal(squads.e, 'sq-2');
  assert.equal(squads.h, 'sq-2');
  assert.equal(squads.i, 'sq-3');
});

test('fase7 dbno: knockActor define sangramento com decay por nocaute extra', () => {
  const a = { alive: true, life: -5, downedCount: 0, x: 0, z: 0 };
  knockActor(a, 'killer-1', 'body');
  assert.equal(a.knocked, true);
  assert.equal(a.alive, true);
  assert.equal(a.life, 0);
  assert.equal(a.downedCount, 1);
  assert.ok(Math.abs(a.knockT - DBNO.bleedOutSeconds) < 0.01, 'primeiro nocaute usa o tempo cheio');
  assert.equal(a.lastHitBy, 'killer-1');
  knockActor(a, 'killer-2', 'body'); // segundo nocaute (após revive hipotético)
  assert.ok(Math.abs(a.knockT - DBNO.bleedOutSeconds * DBNO.bleedOutDecay) < 0.01, 'segundo sangra mais rápido');
});

test('fase7 dbno: reviveTargetFor exige mesmo squad, caído e no alcance', () => {
  const reviver = { id: 'r', squad: 'sq-1', x: 0, z: 0 };
  const mate = { id: 'm', squad: 'sq-1', x: 1, z: 0, alive: true, knocked: true };
  const enemy = { id: 'e', squad: 'sq-2', x: 1, z: 0, alive: true, knocked: true };
  const far = { id: 'f', squad: 'sq-1', x: 30, z: 0, alive: true, knocked: true };
  const standing = { id: 's', squad: 'sq-1', x: 1, z: 0, alive: true, knocked: false };
  assert.equal(reviveTargetFor(reviver, [mate, enemy, far, standing])?.id, 'm');
  assert.equal(reviveTargetFor(reviver, [enemy]), null, 'inimigo não é revivido');
  assert.equal(reviveTargetFor(reviver, [far]), null, 'fora do alcance');
  assert.equal(reviveTargetFor(reviver, [standing]), null, 'de pé não precisa de revive');
});

test('fase7 dbno: stepRevive conclui com vida parcial e limpa o estado', () => {
  const t = { knocked: true, reviveProgress: 0, life: 0 };
  assert.equal(stepRevive(t, DBNO.reviveSeconds / 2), false);
  assert.equal(t.knocked, true);
  assert.equal(stepRevive(t, DBNO.reviveSeconds / 2 + 0.01), true);
  assert.equal(t.knocked, false);
  assert.equal(t.life, Math.round(100 * DBNO.reviveLifeFraction));
});

// ---------- balanceamento dos bots ----------
test('fase7 bots: erro de mira cresce com a distância e tem teto', () => {
  const close = botAimError(2);
  const mid = botAimError(30);
  const far = botAimError(200);
  assert.ok(close < mid && mid < far, 'monótono crescente');
  assert.ok(Math.abs(far - BOT_COMBAT.aimErrMax) < 1e-9, 'teto em aimErrMax');
  assert.ok(close >= BOT_COMBAT.aimErrBase - 1e-9);
});

test('fase7 bots: dano por distância decai de 0.55 até 0.34', () => {
  assert.ok(Math.abs(botDamageScale(2) - BOT_COMBAT.dmgScaleClose) < 1e-9);
  assert.ok(Math.abs(botDamageScale(100) - BOT_COMBAT.dmgScaleFar) < 1e-9);
  const mid = botDamageScale(40);
  assert.ok(mid > BOT_COMBAT.dmgScaleFar && mid < BOT_COMBAT.dmgScaleClose);
});

test('fase7 bots: tempo de reação impede tiro no tick de aquisição do alvo', () => {
  const s = new KhaaosSim3D({ seed: 'F7-REACT', botCount: 1, airdrop: false });
  s.start('belt');
  const b = s.bots[0];
  b.x = s.player.x + 8; b.z = s.player.z; b.cooldown = 0;
  s.step(idle(), STEP);
  const fired = s.consumeEvents().some((e) => e.type === 'shot' && e.owner === b.id);
  assert.equal(fired, false, '1º tick de visão não dispara (reação 0.38-0.8s)');
});

// ---------- sim offline com squad ----------
test('fase7 sim: squads determinísticos com jogador liderando o sq-1', () => {
  const s = new KhaaosSim3D({ seed: 'F7-SQ', botCount: 12, squad: true, airdrop: false });
  assert.equal(s.player.squad, 'sq-1');
  const allies = s.bots.filter((b) => b.squad === 'sq-1');
  assert.equal(allies.length, 3, 'jogador + 3 aliados bots no sq-1');
  assert.ok(s.bots.every((b) => b.squad?.startsWith('sq-')));
});

test('fase7 sim: dano letal nocauteia em vez de eliminar (squad ativo)', () => {
  const s = new KhaaosSim3D({ seed: 'F7-KNOCK', botCount: 4, squad: true, spectate: true, airdrop: false });
  s.start('belt');
  const p = knockPlayer(s);
  assert.equal(p.knocked, true, 'caiu nocauteado');
  assert.equal(p.alive, true, 'ainda vivo (DBNO)');
  assert.ok(p.knockT > 0 && p.knockT <= DBNO.bleedOutSeconds);
});

test('fase7 sim: sem squad o dano letal elimina direto (comportamento legado)', () => {
  const s = new KhaaosSim3D({ seed: 'F7-LEGACY', botCount: 2, spectate: true, airdrop: false });
  s.start('belt');
  const p = s.player;
  p.armor = 0; p.life = 0.001;
  s.ring.radius = 10; s.ring.target = 10; s.ring.pulse = 60;
  p.x = 20; p.z = 0;
  s.step(idle(), STEP);
  assert.equal(p.knocked, false);
  assert.equal(p.alive, false, 'modo solo mantém eliminação direta');
  assert.ok(s.consumeEvents().some((e) => e.type === 'eliminated'));
});

test('fase7 sim: sangramento até o fim elimina com placement', () => {
  const s = new KhaaosSim3D({ seed: 'F7-BLEED', botCount: 4, squad: true, spectate: true, airdrop: false });
  s.start('belt');
  const p = knockPlayer(s);
  assert.equal(p.knocked, true);
  const frames = Math.ceil((DBNO.bleedOutSeconds + 2) / STEP);
  let eliminated = null;
  for (let i = 0; i < frames; i++) {
    s.step(idle(), STEP);
    const evs = s.consumeEvents();
    eliminated = evs.find((e) => e.type === 'eliminated');
    if (eliminated) break;
  }
  assert.ok(eliminated, 'bleed-out emite eliminated');
  assert.equal(p.alive, false);
  assert.ok(eliminated.placement >= 2, 'placement conta vivos restantes');
});

test('fase7 sim: aliado bot resgata e revive o jogador caído', () => {
  const s = new KhaaosSim3D({ seed: 'F7-RESCUE', botCount: 4, squad: true, spectate: true, airdrop: false });
  s.start('belt');
  const p = knockPlayer(s);
  assert.equal(p.knocked, true);
  // cenário controlado: jogador dentro do anel, aliado colado, inimigos longe
  s.ring.radius = 170; s.ring.target = 170; s.ring.pulse = 0;
  p.x = 60; p.z = 60;
  const ally = s.bots[0];
  ally.x = 61.5; ally.z = 60;
  ally.ai.state = 'patrol';
  ally.ai.waypoint = null;
  for (const b of s.bots) if (b !== ally) { b.x = -150; b.z = -150; }
  let revived = false;
  const frames = Math.ceil((DBNO.reviveSeconds + 2) / STEP);
  for (let i = 0; i < frames && p.knocked; i++) {
    s.step(idle(), STEP);
    if (s.consumeEvents().some((e) => e.type === 'revived')) revived = true;
  }
  assert.equal(revived, true, 'evento revived emitido');
  assert.equal(p.knocked, false);
  assert.equal(p.life, Math.round(100 * DBNO.reviveLifeFraction));
});

test('fase7 sim: caído rasteja devagar e não atira/coleta', () => {
  const s = new KhaaosSim3D({ seed: 'F7-CRAWL', botCount: 4, squad: true, spectate: true, airdrop: false });
  s.start('belt');
  const p = knockPlayer(s);
  assert.equal(p.knocked, true);
  s.ring.radius = 170; s.ring.pulse = 0;
  p.x = 60; p.z = 60;
  p.speed = 5.2;
  const x0 = p.x;
  for (let i = 0; i < 30; i++) s.step({ ...idle({ dy: -1 }), seq: i + 1 }, STEP); // tenta correr para frente
  const moved = Math.abs(p.x - x0);
  const maxCrawl = p.speed * DBNO.crawlSpeedMult * (30 * STEP) * 1.05;
  assert.ok(moved <= maxCrawl, `rastejo lento (${moved.toFixed(2)}m <= ${maxCrawl.toFixed(2)}m)`);
  // sem eventos de tiro mesmo segurando fire
  for (let i = 0; i < 10; i++) s.step({ ...idle({ fire: true }), seq: 100 + i }, STEP);
  assert.equal(s.consumeEvents().some((e) => e.type === 'shot'), false, 'caído não atira');
});

test('fase7 sim: dano em caído é letal (finalização)', () => {
  const s = new KhaaosSim3D({ seed: 'F7-FINISH', botCount: 4, squad: true, spectate: true, airdrop: false });
  s.start('belt');
  const p = knockPlayer(s);
  assert.equal(p.knocked, true);
  // dano letal de novo (ring pequeno) → morte final, sem segundo nocaute
  s.ring.radius = 10; s.ring.pulse = 60;
  p.x = 20; p.z = 0;
  s.step(idle(), STEP);
  assert.equal(p.alive, false, 'caído que sofre dano letal morre');
  assert.equal(p.knocked, false);
});

// ---------- room online: squads/DBNO ----------
test('fase7 room: sala squad agrupa humanos por ordem e bots em sqE', () => {
  const room = new MatchRoom3D({ id: 'r-sq', seed: 'F7R1', capacity: 16, botFill: 8, airdrop: false, squad: true });
  room.addPlayer('p1', 'A');
  room.addPlayer('p2', 'B');
  room.addPlayer('p3', 'C');
  room.addPlayer('p4', 'D');
  room.addPlayer('p5', 'E');
  assert.equal(room.humans.get('p1').squad, 'sq-1');
  assert.equal(room.humans.get('p4').squad, 'sq-1');
  assert.equal(room.humans.get('p5').squad, 'sq-2');
  room.start('p1', 'belt');
  assert.ok(room.bots.every((b) => b.squad?.startsWith('sqE-')), 'bots em esquadrões inimigos próprios');
  assert.ok(room.bots.every((b) => b.squad !== room.humans.get('p1').squad));
});

test('fase7 room: humano nocauteado recebe knocked e killfeed com marcador', () => {
  const room = new MatchRoom3D({ id: 'r-kn', seed: 'F7R2', capacity: 16, botFill: 0, airdrop: false, squad: true });
  room.addPlayer('p1', 'VITIMA');
  room.addPlayer('p2', 'CAÇADOR');
  room.start('p1', 'belt');
  const v = room.humans.get('p1');
  v.armor = 0; v.life = 0.001;
  room.ring.radius = 10; room.ring.target = 10; room.ring.pulse = 60;
  v.x = 20; v.z = 0;
  room.tick(1 / 20);
  assert.equal(v.knocked, true);
  assert.equal(v.alive, true);
  const evs2 = room.drainEvents('p2');
  assert.ok(evs2.some((e) => e.type === 'killfeed' && e.knock === true), 'killfeed marca nocaute');
  const evs1 = room.drainEvents('p1');
  assert.ok(evs1.some((e) => e.type === 'knocked'), 'vítima recebe knocked');
});

test('fase7 room: revive por input interagir canaliza e restaura vida', () => {
  const room = new MatchRoom3D({ id: 'r-rev', seed: 'F7R3', capacity: 16, botFill: 0, airdrop: false, squad: true });
  room.addPlayer('p1', 'CAIDO');
  room.addPlayer('p2', 'SOCORRISTA');
  room.start('p1', 'belt');
  const v1 = room.humans.get('p1'), v2 = room.humans.get('p2');
  v1.armor = 0; v1.life = 0.001;
  room.ring.radius = 10; room.ring.target = 10; room.ring.pulse = 60;
  v1.x = 20; v1.z = 0;
  room.tick(1 / 20);
  assert.equal(v1.knocked, true);
  room.ring.radius = 170; room.ring.pulse = 0;
  v1.x = 60; v1.z = 60; v2.x = 61.5; v2.z = 60;
  let seq = 1000;
  let done = false;
  const frames = Math.ceil((DBNO.reviveSeconds + 1) * 30);
  for (let i = 0; i < frames && v1.knocked; i++) {
    room.input('p2', { seq: seq++, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, interact: true });
    room.tick(1 / 20);
    if (!v1.knocked) done = true;
  }
  assert.equal(done, true, 'revive concluído');
  assert.equal(v1.life, Math.round(100 * DBNO.reviveLifeFraction));
  const evs1 = room.drainEvents('p1');
  assert.ok(evs1.some((e) => e.type === 'revived'), 'vítima recebe revived');
});

test('fase7 room: snapshot carrega knocked/squad/weaponSkin e skin é aplicada no loot', () => {
  const room = new MatchRoom3D({ id: 'r-snap', seed: 'F7R4', capacity: 16, botFill: 0, airdrop: false, squad: true });
  room.addPlayer('p1', 'A');
  room.addPlayer('p2', 'B');
  room.start('p1', 'belt');
  // pega um weapon loot perto (teleporta no loot)
  const weapon = room.loot.find((i) => i.active && i.kind === 'weapon');
  assert.ok(weapon, 'cenario tem arma no chao');
  const p1 = room.humans.get('p1');
  p1.x = weapon.x; p1.z = weapon.z;
  let seq = 2000;
  room.input('p1', { seq: seq++, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, interact: true });
  room.tick(1 / 20);
  assert.equal(p1.weapon, weapon.weaponId, 'arma coletada');
  assert.equal(p1.weaponSkin, weapon.rarity, 'skin registrada pela raridade do loot');
  const snap = room.snapshot('p1');
  assert.ok('weaponSkin' in snap.player, 'selfView expõe weaponSkin');
  assert.ok('knocked' in snap.player && 'squad' in snap.player, 'selfView expõe DBNO/squad');
  assert.ok(snap.others.every((o) => 'knocked' in o && 'squad' in o && 'weaponSkin' in o), 'otherView expõe DBNO/squad/skin');
});

test('fase7 room: caído não atira mesmo com input fire', () => {
  const room = new MatchRoom3D({ id: 'r-nofire', seed: 'F7R5', capacity: 16, botFill: 0, airdrop: false, squad: true });
  room.addPlayer('p1', 'A');
  room.start('p1', 'belt');
  const p1 = room.humans.get('p1');
  p1.armor = 0; p1.life = 0.001;
  room.ring.radius = 10; room.ring.target = 10; room.ring.pulse = 60;
  p1.x = 20; p1.z = 0;
  room.tick(1 / 20);
  assert.equal(p1.knocked, true);
  room.ring.radius = 170; room.ring.pulse = 0;
  let seq = 3000;
  let shots = 0;
  for (let i = 0; i < 40; i++) {
    room.input('p1', { seq: seq++, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: true, interact: false });
    room.tick(1 / 20);
    shots += room.drainEvents('p1').filter((e) => e.type === 'shot').length;
  }
  assert.equal(shots, 0, 'caído não dispara');
});

// ---------- salas privadas (matchmaking) ----------
test('fase7 privadas: makeInviteCode gera 6 caracteres sem ambíguos', () => {
  for (let i = 0; i < 50; i++) {
    const code = makeInviteCode();
    assert.match(code, /^[23456789ACDEFGHJKLMNPQRTUVWXYZ]{6}$/);
  }
  const len7 = makeInviteCode(Math.random, 7);
  assert.equal(len7.length, 7);
});

test('fase7 privadas: normalizeInviteCode limpa e uppercases', () => {
  assert.equal(normalizeInviteCode(' abc-def '), 'ABCDEF');
  assert.equal(normalizeInviteCode(null), '');
});

test('fase7 privadas: findRoomByCode só aceita privada 3D aberta com vaga', () => {
  const rooms = new Map();
  const mk = (id, over = {}) => ({
    is3d: true, isPrivate: true, inviteCode: 'KX7T2Q', started: false,
    players: { size: 2 }, capacity: 16, id, ...over,
  });
  rooms.set('ok', mk('ok'));
  assert.equal(findRoomByCode(rooms, 'kx7t2q')?.id, 'ok', 'case-insensitive');
  assert.equal(findRoomByCode(rooms, 'ZZZZZZ'), null, 'código inexistente');
  rooms.set('started', mk('started', { started: true }));
  rooms.set('full', mk('full', { players: { size: 16 } }));
  rooms.set('public', mk('public', { isPrivate: false }));
  rooms.set('d2', mk('d2', { is3d: false }));
  assert.equal(findRoomByCode(rooms, 'KX7T2Q')?.id, 'ok', 'só a sala elegível');
});

test('fase7 room: sala privada guarda código e metadados', () => {
  const room = new MatchRoom3D({ id: 'r-priv', seed: 'F7R6', capacity: 16, botFill: 15, airdrop: false, squad: true, isPrivate: true, inviteCode: 'kx7t2q' });
  assert.equal(room.inviteCode, 'KX7T2Q');
  assert.equal(room.isPrivate, true);
  assert.equal(room.squad, true);
  const m = room.metrics();
  assert.equal(m.private, true);
  assert.equal(m.squad, true);
});

// ---------- quality (LOD mobile) ----------
test('fase7 quality: query tem precedência; touch/RAM baixa caem para low', () => {
  assert.equal(resolveQuality({ query: 'medium' }), 'medium');
  assert.equal(resolveQuality({ query: 'LOW' }), 'low');
  assert.equal(resolveQuality({ query: 'inexistente', isTouch: true }), 'low');
  assert.equal(resolveQuality({ query: '', isTouch: true }), 'low', 'touch → low');
  assert.equal(resolveQuality({ query: '', isTouch: false, deviceMemory: 2 }), 'low', 'RAM baixa → low');
  assert.equal(resolveQuality({ query: '', isTouch: false, deviceMemory: 8 }), 'high');
  assert.equal(resolveQuality({}), 'high', 'desktop padrão');
});

test('fase7 quality: tiers consistentes (low mais leve que high)', () => {
  const low = qualityTier('low'), high = qualityTier('high');
  assert.ok(low.pixelRatio < high.pixelRatio);
  assert.ok(low.shadowMapSize < high.shadowMapSize);
  assert.ok(low.grassFactor < high.grassFactor);
  assert.ok(low.treeFactor < high.treeFactor);
  assert.ok(low.cloudCount < high.cloudCount);
  assert.equal(low.bloom, false, 'low sem bloom');
  assert.ok(low.contactShadows, 'sombras de contato mantidas (custo baixo)');
  for (const name of Object.keys(QUALITY_TIERS)) {
    const t = qualityTier(name);
    assert.ok(t.pixelRatio > 0 && t.shadowMapSize >= 1024 && t.grassFactor > 0);
  }
  assert.deepEqual(qualityTier('desconhecido'), QUALITY_TIERS.high, 'fallback high');
});
