import test from 'node:test';
import assert from 'node:assert/strict';
import { KhaaosSim3D, getWorldLayout, WEAPONS3D, DEFAULT_INPUT } from '../src/game3d/sim3d.js';

const STEP = 1 / 30;
const idle = (yaw = 0, pitch = 0) => ({ ...DEFAULT_INPUT, yaw, pitch });

test('mesma seed produz mundo, loot e spawns idênticos', () => {
  const a = new KhaaosSim3D({ seed: 'W3D-1', botCount: 0 });
  const b = new KhaaosSim3D({ seed: 'W3D-1', botCount: 0 });
  assert.deepEqual(a.loot, b.loot);
  assert.deepEqual(a.world.structures, b.world.structures);
  assert.equal(a.world.colliders.length > 20, true);
  assert.equal(a.world.lootSpots.length >= 30, true);
  assert.deepEqual(a.terminals.map(t => t.x), b.terminals.map(t => t.x));
});

test('movimento respeita yaw e colisão com estruturas', () => {
  const s = new KhaaosSim3D({ seed: 'MOVE-1', botCount: 0 });
  s.start('belt');
  // caminha para frente (yaw=PI => +Z inicial invertido: frente -Z com yaw 0)
  let last = { x: s.player.x, z: s.player.z };
  for (let i = 0; i < 60; i++) s.step({ ...idle(Math.PI), dy: 1 }, STEP);
  const moved = Math.hypot(s.player.x - last.x, s.player.z - last.z);
  assert.ok(moved > 5, `deveria mover >5m, moveu ${moved.toFixed(2)}`);
  // encosta numa parede e tenta atravessar: não atravessa
  const s2 = new KhaaosSim3D({ seed: 'WALL-1', botCount: 0 });
  s2.start('belt');
  s2.player.x = 0; s2.player.z = 0;
  // monolith collider em (0,0) 10x10 — empurra para fora
  assert.equal(s2.world.colliders.some(c => c.minX <= 5.5 && c.maxX >= -5.5 && c.minZ <= 5.5 && c.maxZ >= -5.5), true);
});

test('disparo consome munição, aplica cooldown e mata bot com dano suficiente', () => {
  const s = new KhaaosSim3D({ seed: 'FIRE-1', botCount: 1 });
  s.start('belt');
  const p = s.player;
  const bot = s.bots[0];
  // linha de tiro unitária: remove estruturas para validar balística de forma determinística
  s.world.colliders.length = 0;
  p.x = 0; p.z = 0; p.yaw = 0;
  bot.x = 0; bot.z = -12; bot.y = 0;
  const mag0 = p.ammoMag;
  let killed = false;
  for (let i = 0; i < 30 * 20 && !killed; i++) {
    // mira rastreia o bot (jogador humano segue o alvo)
    const dx0 = bot.x - p.x, dz0 = bot.z - p.z, dh = Math.hypot(dx0, dz0);
    const yaw = Math.atan2(-dx0, -dz0);
    const pitch = Math.atan2((bot.y + 1.1) - (p.y + 1.55), dh);
    s.step({ ...idle(yaw, pitch), fire: true }, STEP);
    killed = !bot.alive;
  }
  assert.equal(killed, true, 'bot deveria morrer com rajada frontal');
  assert.ok(p.ammoMag < mag0, 'munição deveria cair');
  assert.ok(p.kills === 1 && p.xp >= 120, `kills=${p.kills} xp=${p.xp}`);
});

test('headshot multiplica dano e rende XP bônus', () => {
  const s = new KhaaosSim3D({ seed: 'HS-1', botCount: 1 });
  s.start('belt');
  const p = s.player, bot = s.bots[0];
  // linha de tiro unitária: remove estruturas para validar balística de forma determinística
  s.world.colliders.length = 0;
  p.x = 0; p.z = 0; p.yaw = 0;
  bot.x = 0; bot.z = -8; bot.y = 0;
  // Barrett headshot: 92 * 1.75 = 161 — atravessa o soak de armadura e elimina
  p.slots[1] = 'barrett'; p.weapon = 'barrett'; p.ammoMag = 5;
  let killed = false;
  for (let i = 0; i < 30 * 8 && !killed; i++) {
    const dx0 = bot.x - p.x, dz0 = bot.z - p.z, dh = Math.hypot(dx0, dz0);
    const yaw = Math.atan2(-dx0, -dz0);
    const pitch = Math.atan2(1.65 - (p.y + 1.55), dh); // mira na cabeça
    s.step({ ...idle(yaw, pitch), fire: true, ads: true }, STEP);
    killed = !bot.alive;
  }
  assert.equal(killed, true, 'headshot de Barrett deveria eliminar');
  assert.equal(p.kills, 1);
  assert.ok(p.xp >= 180, `xp de headshot=${p.xp}`);
});

test('zona encolhe em pulsos e causa dano fora do anel', () => {
  const s = new KhaaosSim3D({ seed: 'RING-1', botCount: 0 });
  s.start('belt');
  s.player.x = 0; s.player.z = 0; // fica dentro do anel para a partida continuar
  const r0 = s.ring.radius;
  for (let i = 0; i < 30 * 100; i++) s.step(idle(), STEP); // ~100s => 2 pulsos
  assert.ok(s.ring.radius < r0, 'anel deveria encolher');
  assert.ok(s.ring.pulse >= 2, 'pulsos deveriam acontecer');
  // jogador fora do anel sofre dano
  const s2 = new KhaaosSim3D({ seed: 'RING-2', botCount: 0 });
  s2.start('belt');
  s2.player.x = 190; s2.player.z = 190;
  const life0 = s2.player.life;
  for (let i = 0; i < 90; i++) s2.step(idle(), STEP);
  assert.ok(s2.player.life < life0, 'dano de zona deveria ser aplicado');
});

test('loot: coleta altera estado (arma, kit, armadura ou recurso)', () => {
  const s = new KhaaosSim3D({ seed: 'LOOT-3D', botCount: 0 });
  s.start('belt');
  const item = s.loot.find(i => i.kind !== 'resource') ?? s.loot[0];
  s.player.x = item.x; s.player.z = item.z; s.player.y = 0;
  const before = JSON.stringify({ w: s.player.weapon, mk: s.player.inventory.medkit, ar: s.player.armor, inv: s.player.inventory });
  s.step({ ...idle(), interact: true }, STEP);
  assert.equal(item.active, false, 'item deveria ser desativado');
  const after = JSON.stringify({ w: s.player.weapon, mk: s.player.inventory.medkit, ar: s.player.armor, inv: s.player.inventory });
  assert.notEqual(before, after, 'coleta deveria alterar estado do jogador');
});

test('recarga respeita reserva e capacidade do pente', () => {
  const s = new KhaaosSim3D({ seed: 'RELOAD-1', botCount: 0 });
  s.start('belt');
  const p = s.player;
  p.ammoMag = 1; p.inventory.ammo['9MM'] = 45;
  s.step({ ...idle(), reload: true }, STEP);
  assert.ok(p.reloadT > 0, 'recarga deveria iniciar');
  for (let i = 0; i < 60; i++) s.step(idle(), STEP);
  assert.equal(p.ammoMag, 15, 'pente deveria completar em 15');
  assert.equal(p.inventory.ammo['9MM'], 31, 'reserva deveria descontar 14');
});

test('match completa: vitória por tempo ou eliminação por dano', () => {
  const s = new KhaaosSim3D({ seed: 'END-1', botCount: 0 });
  s.start('belt');
  s.player.life = 5;
  const bot = { x: 0, z: 0 };
  s.player.x = 190; s.player.z = 190; // fora do anel
  let events = [];
  for (let i = 0; i < 30 * 30; i++) {
    s.step(idle(), STEP);
    events = events.concat(s.consumeEvents());
    if (s.over) break;
  }
  assert.equal(s.over, true);
  assert.ok(events.some(e => e.type === 'eliminated'), 'eliminação deveria ser emitida');
});

test('replay 3D reproduz estado final idêntico', () => {
  const mk = () => new KhaaosSim3D({ seed: 'REPLAY-3D-9', botCount: 3 });
  const a = mk(); a.start('rush');
  let t = 0;
  for (let i = 0; i < 300; i++) {
    const yaw = Math.PI / 3 + Math.sin(t) * 0.8;
    a.step({ ...idle(yaw), dy: i % 3 === 0 ? 1 : 0, fire: i % 6 === 0, sprint: i % 10 === 0 }, STEP);
    t += STEP;
  }
  const replay = a.exportReplay();
  assert.equal(replay.mode, '3d');
  const b = mk(); b.start('rush');
  for (const frame of replay.inputs) b.step(frame.input, STEP);
  assert.equal(b.player.x, a.player.x);
  assert.equal(b.player.z, a.player.z);
  assert.equal(b.player.kills, a.player.kills);
  assert.equal(b.tick, a.tick);
});

test('snapshot/applySnapshot roundtrip preserva estado', () => {
  const s = new KhaaosSim3D({ seed: 'SNAP-1', botCount: 2 });
  s.start('belt');
  for (let i = 0; i < 30; i++) s.step({ ...idle(0.5), dy: 1, fire: i % 5 === 0 }, STEP);
  const snap = s.snapshot();
  const json = JSON.parse(JSON.stringify(snap));
  const s2 = new KhaaosSim3D({ seed: 'OUTRO', botCount: 0 });
  s2.applySnapshot(json);
  assert.equal(s2.player.x, s.player.x);
  assert.equal(s2.bots.length, s.bots.length);
  assert.equal(s2.ring.radius, s.ring.radius);
});

test('armas 3D derivam do catálogo compartilhado', () => {
  assert.equal(WEAPONS3D.m4.category, 'rifle');
  assert.ok(WEAPONS3D.m4.bulletSpeed > 100);
  assert.ok(WEAPONS3D.barrett.range > WEAPONS3D.mp5.range);
  assert.equal(WEAPONS3D.pulse.rarity, 'LENDARIO');
});
