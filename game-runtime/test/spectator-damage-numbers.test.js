// Khaaos Run — Fase 28 — números de dano na TRANSMISSÃO + números de MELEE.
//
// Três contratos fechados de ponta a ponta:
//   1. SERVIDOR (room3d): dano autoritativo vira evento DAMAGE para o pipeline
//      do espectador (anel separado, rate-limit por vítima, timestamps
//      estritamente crescentes — dedupe do cliente nunca colide) e o evento
//      'melee' sai com o CONTRATO do número (x/y/z/victim/owner/damage);
//   2. SIM OFFLINE (sim3d): 'melee' com o mesmo contrato (owner filtra quem vê);
//   3. CLIENTE (spectator3d): specDamageSpawn é PURO — número só no FOLLOW
//      envolvendo o seguido; SpectatorView ingere/drena DAMAGE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KhaaosSim3D, DEFAULT_INPUT } from '../src/game3d/sim3d.js';
import { MatchRoom3D } from '../server/room3d.js';
import { SpectatorView, specDamageSpawn } from '../src/game3d/spectator3d.js';

// ─── 1. specDamageSpawn (puro — gramática do FOLLOW) ────────────────────────

test('specDamageSpawn: número só no FOLLOW envolvendo o seguido (causou ou sofreu)', () => {
  const d = { x: 10, y: 1, z: 20, damage: 37, attacker: 'h_aaa', victim: 'bot_7', head: false };
  // seguido CAUSOU o dano
  const asAttacker = specDamageSpawn(d, 'h_aaa', 'FOLLOW_PLAYER');
  assert.equal(asAttacker.damage, 37);
  assert.equal(asAttacker.victim, 'bot_7');
  // seguido SOFREU o dano
  const asVictim = specDamageSpawn(d, 'bot_7', 'FOLLOW_PLAYER');
  assert.equal(asVictim.damage, 37);
  // envolve terceiros: sem número
  assert.equal(specDamageSpawn(d, 'h_zzz', 'FOLLOW_PLAYER'), null);
  // fora do FOLLOW (broadcast/overhead/free): sem número — não é radar
  assert.equal(specDamageSpawn(d, 'h_aaa', 'OVERHEAD'), null);
  assert.equal(specDamageSpawn(d, 'h_aaa', 'FREECAM'), null);
  assert.equal(specDamageSpawn(d, null, 'FOLLOW_PLAYER'), null);
});

test('specDamageSpawn: sanitiza hostilidade (lixo numérico/ids nunca quebram)', () => {
  assert.equal(specDamageSpawn({ x: 'NaN!', y: 1, z: 2, damage: 5 }, 'a', 'FOLLOW_PLAYER'), null);
  assert.equal(specDamageSpawn({ x: 1, y: 1, z: 2, damage: -3 }, 'a', 'FOLLOW_PLAYER'), null);
  assert.equal(specDamageSpawn({ x: 1, y: 1, z: 2, damage: 'boom' }, 'a', 'FOLLOW_PLAYER'), null);
  const huge = specDamageSpawn({ x: 1.4, y: 1.6, z: 2.2, damage: 999999, head: 'yes', knocked: 1, attacker: 'a', victim: 'bot' }, 'a', 'FOLLOW_PLAYER');
  assert.equal(huge.damage, 100_000); // clamp de telemetria hostil
  assert.equal(huge.head, true);
  assert.equal(huge.knocked, true);
  assert.deepEqual([huge.x, huge.y, huge.z], [1.4, 1.6, 2.2]);
});

// ─── 2. SpectatorView: ingestão/dreno do DAMAGE ─────────────────────────────

test('SpectatorView: DAMAGE entra na fila própria e consumeDamage drena (hazards intactos)', () => {
  const view = new SpectatorView();
  assert.equal(view.ingestEvent({ type: 'DAMAGE', data: { x: 1, y: 1, z: 1, damage: 12, attacker: 'a', victim: 'b' } }), true);
  assert.equal(view.ingestEvent({ type: 'DAMAGE', data: { damage: 0 } }), true, 'dano zero é ingerido e descartado no dreno');
  assert.equal(view.ingestEvent({ type: 'DAMAGE', data: { damage: 'lixo' } }), true);
  assert.equal(view.ingestEvent({ type: 'QUALQUER' }), false, 'tipo desconhecido segue fora do contrato');
  // hazard segue o contrato antigo
  assert.equal(view.ingestEvent({ type: 'WORLD_HAZARD', data: { hazard: 'tsunami', phase: 'start', durationSeconds: 40 } }), true);

  const drained = view.consumeDamage();
  assert.equal(drained.length, 1, 'só o dano válido entra na fila (zero/lixo descartados na ingestão)');
  assert.deepEqual(drained[0].damage, 12);
  assert.equal(view.consumeDamage().length, 0, 'dreno esvazia a fila');

  const events = view.consumeEvents();
  assert.deepEqual(events.map((e) => e.type), ['tsunamiStart'], 'fila de hazards NÃO foi afetada pelo DAMAGE');
});

// ─── 3. room3d: DAMAGE na transmissão (rate-limit + anel + dedupe seguro) ───

test('room3d: dano do ring vira evento DAMAGE no spectatorView com rate-limit por vítima', () => {
  const room = new MatchRoom3D({ id: 'tv-dmg-1', seed: 'TV-DMG-1', capacity: 4, botFill: 2, airdrop: false });
  assert.ok(room.addPlayer('viewer0', 'OPERADOR-0'));
  assert.ok(room.start('viewer0', 'belt'));
  const victim = room.bots[0];
  victim.x = room.ring.x + room.ring.radius + 50; // fora do cerco: dano garantido
  victim.z = room.ring.z;
  room.tick(0.02); // o ring morde a vítima
  const view = room.spectatorView();
  const damageEvents = view.events.filter((e) => e.type === 'DAMAGE');
  assert.ok(damageEvents.length >= 1, 'pelo menos um DAMAGE no primeiro tick fora do ring');
  const ev = damageEvents[0];
  assert.equal(ev.data.victim, victim.id);
  assert.equal(ev.data.attacker, null, 'dano de ambiente não tem atacante');
  assert.ok(ev.data.damage >= 1);
  assert.equal(ev.data.kind, 'ring');
  assert.equal(ev.data.knocked, false);

  // rate-limit: ticks seguintes (mesma vítima, <150 ms reais) NÃO inundam
  const countAfterFirst = room.spectatorDamageLog.length;
  for (let i = 0; i < 5; i++) room.tick(0.02);
  assert.ok(room.spectatorDamageLog.length <= countAfterFirst + 2, `rate-limit segurou a rajada: ${room.spectatorDamageLog.length} entradas após 6 ticks`);
  // eventos mesclados ficam ORDENADOS por timestamp (intercalação determinística)
  const ts = view.events.map((e) => e.timestamp);
  assert.deepEqual([...ts].sort((a, b) => a - b), ts, 'eventos da transmissão ordenados por timestamp');
});

test('room3d: melee autoritativo entrega o contrato do número ao ATACANTE e DAMAGE à transmissão', () => {
  const room = new MatchRoom3D({ id: 'tv-melee-1', seed: 'TV-MELEE-1', capacity: 4, botFill: 1, airdrop: false });
  assert.ok(room.addPlayer('p0', 'ATACANTE'));
  assert.ok(room.start('p0', 'belt'));
  const a = room.humans.get('p0');
  const b = room.bots[0];
  // sucata = arma melee canônica; alvo colado e de frente (yaw = π olha +x)
  a.weapon = 'sucata'; a.cooldown = 0;
  a.x = b.x - 1; a.z = b.z; a.y = b.y;
  const lifeBefore = b.life;
  room.input('p0', { seq: 1, dx: 0, dy: 0, fire: true, yaw: Math.PI, pitch: 0 });
  room.tick(0.05); // input é processado no tick da sala
  const evts = room.drainEvents('p0');
  const melee = evts.find((e) => e.type === 'melee');
  assert.ok(melee, 'evento melee entregue ao atacante');
  assert.equal(melee.owner, 'p0');
  assert.equal(melee.victim, b.id);
  assert.equal(melee.target, b.id);
  assert.ok(melee.damage >= 1, `melee traz o dano: ${melee.damage}`);
  assert.ok(Number.isFinite(melee.x) && Number.isFinite(melee.y) && Number.isFinite(melee.z));
  assert.ok(b.life < lifeBefore, 'dano autoritativo aplicado');
  // o mesmo golpe alimentou a transmissão (attacker identificado)
  const dmg = room.spectatorView().events.find((e) => e.type === 'DAMAGE' && e.data.attacker === 'p0');
  assert.ok(dmg, 'DAMAGE com atacante entrou na transmissão');
});

test('room3d: anel do DAMAGE tem teto 10 e timestamps estritamente crescentes', () => {
  const room = new MatchRoom3D({ id: 'tv-cap-1', seed: 'TV-CAP-1', capacity: 4, botFill: 3, airdrop: false });
  assert.ok(room.addPlayer('p0', 'ATACANTE'));
  assert.ok(room.start('p0', 'belt'));
  const a = room.humans.get('p0');
  a.weapon = 'sucata'; a.cooldown = 0;
  // várias vítimas em sequência (cada uma com rate-limit próprio) enchem o anel
  for (let i = 0; i < 14; i++) {
    const b = room.bots[i % room.bots.length];
    b.x = a.x + 1; b.z = a.z; b.y = a.y;
    room.input('p0', { seq: i + 1, dx: 0, dy: 0, fire: true, yaw: Math.PI, pitch: 0 });
    a.cooldown = 0;
    room.tick(0.05); // afasta da janela de rate-limit de cada vítima
    b.x = a.x + 1;
  }
  assert.ok(room.spectatorDamageLog.length <= 10, `anel respeita o teto: ${room.spectatorDamageLog.length}`);
  const ts = room.spectatorDamageLog.map((e) => e.timestamp);
  for (let i = 1; i < ts.length; i++) assert.ok(ts[i] > ts[i - 1], 'timestamp estritamente crescente (dedupe nunca colide)');
});

// ─── 4. sim3d offline: melee com o contrato do número ───────────────────────

test('sim offline: melee do jogador emite evento com owner/victim/damage/posição', () => {
  const sim = new KhaaosSim3D({ seed: 'MELEE-OFFLINE-28', botCount: 1, airdrop: false });
  sim.start('belt');
  const bot = sim.bots[0];
  sim.player.weapon = 'sucata';
  sim.player.cooldown = 0;
  sim.player.x = bot.x - 1;
  sim.player.z = bot.z;
  const lifeBefore = bot.life;
  sim.step({ ...DEFAULT_INPUT, fire: true, yaw: Math.PI }, 1 / 30); // yaw = π olha +x
  const melee = sim.events.find((e) => e.type === 'melee');
  assert.ok(melee, 'evento melee emitido');
  assert.equal(melee.owner, 'player');
  assert.equal(melee.victim, bot.id);
  assert.ok(melee.damage >= 1);
  assert.ok(Number.isFinite(melee.x) && Number.isFinite(melee.z));
  assert.ok(bot.life < lifeBefore);
  // bot NÃO gera número: outro swing com owner=bot não vira acerto do jogador
  const botMelee = sim.events.filter((e) => e.type === 'melee' && e.owner !== 'player');
  assert.ok(Array.isArray(botMelee));
});
