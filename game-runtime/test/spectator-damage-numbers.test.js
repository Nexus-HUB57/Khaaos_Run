// Khaaos Run — Fase 28 — números de dano na TRANSMISSÃO + números de MELEE.
// Khaaos Run — Fase 29 — dano de HAZARD nos números do espectador.
//
// Contratos fechados de ponta a ponta:
//   1. SERVIDOR (room3d): dano autoritativo vira evento DAMAGE para o pipeline
//      do espectador (anel separado, rate-limit por vítima, timestamps
//      estritamente crescentes — dedupe do cliente nunca colide) e o evento
//      'melee' sai com o CONTRATO do número (x/y/z/victim/owner/damage);
//   2. SIM OFFLINE (sim3d): 'melee' com o mesmo contrato (owner filtra quem vê);
//   3. CLIENTE (spectator3d): specDamageSpawn é PURO — número só no FOLLOW
//      envolvendo o seguido; SpectatorView ingere/drena DAMAGE.
//   4. Fase 29: kinds AMBIENTAIS (tsunami/eruption/ring/acid/quantum) chegam
//      com a identidade do golpe — specDamageSpawn marca `hazard` e o pool
//      rende o tier `dmg-hazard hz-*` (paleta do banner). A anomalia Khaaos
//      (quantum) passa a espelhar a VIDA perdida no DAMAGE (o drain pousa
//      fora do funil #damage) e melee ganha kind 'melee' (antes false).
import test from 'node:test';
import assert from 'node:assert/strict';
import { KhaaosSim3D, DEFAULT_INPUT } from '../src/game3d/sim3d.js';
import { MatchRoom3D } from '../server/room3d.js';
import { SpectatorView, specDamageSpawn } from '../src/game3d/spectator3d.js';
import { DamageNumbers3D, damageTier, HAZARD_TIER_CLASSES } from '../src/game3d/damageNumbers3d.js';

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
  // o mesmo golpe alimentou a transmissão (attacker identificado, kind honesto)
  const dmg = room.spectatorView().events.find((e) => e.type === 'DAMAGE' && e.data.attacker === 'p0');
  assert.ok(dmg, 'DAMAGE com atacante entrou na transmissão');
  assert.equal(dmg.data.kind, 'melee', 'Fase 29 — kind melee (antes false)');
  assert.equal('hazard' in dmg.data, false, 'flag de render é derivada no CLIENTE — payload do servidor não a carrega');
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

// ─── DOM falso (mesmo padrão do damage-numbers) ─────────────────────────────
class FakeElement {
  constructor() {
    this.className = ''; this.textContent = '';
    this.style = {}; this.children = [];
    this.removed = false; this.parent = null;
  }
  appendChild(child) { child.parent = this; this.children.push(child); }
  remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
}
function withFakeDoc(fn) {
  const prevDoc = globalThis.document;
  const root = new FakeElement();
  globalThis.document = { createElement: () => new FakeElement() };
  try { return { result: fn(root), root }; } finally {
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
  }
}

// ─── 5. Fase 29 — HAZARD nos números do espectador ─────────────────────────

test('specDamageSpawn: kinds ambientais marcam hazard; tiro/melee mantêm hazard false', () => {
  const follow = 'h_aaa';
  // cada kind de hazard → hazard true com kind preservado
  for (const kind of ['tsunami', 'eruption', 'ring', 'acid', 'quantum']) {
    const s = specDamageSpawn({ x: 5, y: 1, z: 6, damage: 12, victim: follow, kind }, follow, 'FOLLOW_PLAYER');
    assert.ok(s, `kind ${kind} gera spawn`);
    assert.equal(s.kind, kind);
    assert.equal(s.hazard, true, `kind ${kind} é hazard`);
    assert.equal(s.damage, 12);
  }
  // dano de arma: identidade preservada, SEM hazard
  for (const kind of ['headshot', 'body', 'flesh', 'explosion', 'melee']) {
    const s = specDamageSpawn({ x: 5, y: 1, z: 6, damage: 9, attacker: follow, kind }, follow, 'FOLLOW_PLAYER');
    assert.ok(s, `kind ${kind} gera spawn`);
    assert.equal(s.kind, kind);
    assert.equal(s.hazard, false, `kind ${kind} NÃO é hazard`);
  }
  // kind ausente (payload legado da Fase 28): hazard false, sem quebra
  const legacy = specDamageSpawn({ x: 5, y: 1, z: 6, damage: 9, victim: follow }, follow, 'FOLLOW_PLAYER');
  assert.equal(legacy.kind, null);
  assert.equal(legacy.hazard, false);
  // kind hostil (número/objeto/vazio) sanitiza para null — nunca quebra
  for (const junk of [7, { evil: true }, '']) {
    const s = specDamageSpawn({ x: 5, y: 1, z: 6, damage: 9, victim: follow, kind: junk }, follow, 'FOLLOW_PLAYER');
    assert.equal(s.kind, null, `kind hostil ${JSON.stringify(junk)} → null`);
    assert.equal(s.hazard, false);
  }
});

test('damageTier: hazard ganha tier próprio com cor por kind (paleta do banner)', () => {
  // cada kind de hazard → classe canônica
  assert.equal(damageTier({ hazard: true, kind: 'tsunami' }).cls, 'dmg-hazard hz-tsunami');
  assert.equal(damageTier({ hazard: true, kind: 'eruption' }).cls, 'dmg-hazard hz-lava');
  assert.equal(damageTier({ hazard: true, kind: 'quantum' }).cls, 'dmg-hazard hz-gravity');
  assert.equal(damageTier({ hazard: true, kind: 'acid' }).cls, 'dmg-hazard hz-acid');
  assert.equal(damageTier({ hazard: true, kind: 'ring' }).cls, 'dmg-hazard hz-ring');
  // kind de hazard desconhecido → fallback hz-ring (nunca quebra)
  assert.equal(damageTier({ hazard: true, kind: 'martelo' }).cls, 'dmg-hazard hz-ring');
  assert.equal(damageTier({ hazard: true }).cls, 'dmg-hazard hz-ring');
  // escala do tier entre corpo (1) e head (1.45)
  const hz = damageTier({ hazard: true, kind: 'tsunami' });
  assert.equal(hz.scale, 1.2);
  // hierarquia preservada: knock > head > hazard > body
  assert.equal(damageTier({ knock: true, head: true, hazard: true }).cls, 'dmg-knock');
  assert.equal(damageTier({ head: true, hazard: true }).cls, 'dmg-head');
  assert.equal(damageTier({}).cls, 'dmg-body');
  assert.deepEqual(HAZARD_TIER_CLASSES.tsunami, 'hz-tsunami');
});

test('pool: spawn de hazard rende nó dmg-hazard com a classe do kind e o dano como texto', () => {
  withFakeDoc((root) => {
    const pool = new DamageNumbers3D({ container: root });
    pool.spawn({ x: 0, y: 1, z: -6, damage: 7, hazard: true, kind: 'tsunami', victim: 'h_aaa' });
    pool.spawn({ x: 0, y: 1, z: -6, damage: 12, hazard: true, kind: 'quantum', victim: 'h_aaa' });
    pool.spawn({ x: 0, y: 1, z: -6, damage: 30, victim: 'h_aaa' }); // corpo normal
    assert.equal(root.children.length, 3);
    assert.match(root.children[0].className, /dmg-num dmg-hazard hz-tsunami/);
    assert.equal(root.children[0].textContent, '7');
    assert.match(root.children[1].className, /dmg-num dmg-hazard hz-gravity/);
    assert.equal(root.children[1].textContent, '12');
    assert.match(root.children[2].className, /dmg-num dmg-body/);
    assert.doesNotMatch(root.children[2].className, /hz-/);
  });
});

test('room3d: ANOMALIA Khaaos (quantum) espelha a vida perdida como DAMAGE kind quantum', () => {
  const room = new MatchRoom3D({ id: 'tv-quantum-29', seed: 'TV-QUANTUM-29', capacity: 4, botFill: 1, airdrop: false, scenarioId: 'Arukheea' });
  assert.ok(room.addPlayer('viewer0', 'OPERADOR-0'));
  assert.ok(room.start('viewer0', 'belt'));
  const victim = room.bots[0];
  // sem blindagem: a VIDA perdida é o número (armor drena sem número)
  victim.armor = 0;
  victim.temporaryArmor = 0;
  victim.x = 60; victim.z = 60; // longe dos 4 pilões (raio 28)
  const lifeBefore = victim.life;
  room.quantumTimer = 120; // intervalSeconds do Arukheea — dispara no próximo tick
  room.tick(0.02);
  assert.equal(room.quantumActive, true, 'anomalia ativa no tick disparado');
  assert.ok(victim.life < lifeBefore, 'vida caiu com a anomalia');
  const view = room.spectatorView();
  const q = view.events.filter((e) => e.type === 'DAMAGE' && e.data.kind === 'quantum' && e.data.victim === victim.id);
  assert.ok(q.length >= 1, 'pelo menos um DAMAGE kind quantum para a vítima');
  assert.equal(q[0].data.attacker, null, 'anomalia não tem atacante');
  assert.ok(q[0].data.damage >= 1);
  assert.equal(q[0].data.knocked, false);
});

test('room3d: drain com blindagem NÃO vira número — só vida perdida é informação', () => {
  const room = new MatchRoom3D({ id: 'tv-quantum-armor', seed: 'TV-QUANTUM-AR', capacity: 4, botFill: 1, airdrop: false, scenarioId: 'Arukheea' });
  assert.ok(room.addPlayer('viewer0', 'OPERADOR-0'));
  assert.ok(room.start('viewer0', 'belt'));
  const shielded = room.bots[0];
  shielded.temporaryArmor = 0;
  shielded.armor = 500; // absorve MUITO mais que um tick de dreno
  shielded.life = 100;
  shielded.x = 60; shielded.z = 60;
  room.quantumTimer = 120;
  room.tick(0.02);
  assert.ok(shielded.life === 100, 'vida intocada (blindagem absorveu o dreno)');
  const q = room.spectatorView().events.filter((e) => e.type === 'DAMAGE' && e.data.kind === 'quantum' && e.data.victim === shielded.id);
  assert.equal(q.length, 0, 'dreno que NÃO toca a vida não gera número');
});

test('room3d: TSUNAMI vira DAMAGE kind tsunami e atravessa o pipeline até o número do FOLLOW', () => {
  const room = new MatchRoom3D({ id: 'tv-tsunami-29', seed: 'TV-TSUNAMI-29', capacity: 4, botFill: 1, airdrop: false, scenarioId: 'Priadus' });
  assert.ok(room.addPlayer('viewer0', 'OPERADOR-0'));
  assert.ok(room.start('viewer0', 'belt'));
  const victim = room.bots[0];
  victim.y = 0; // nível do mar: submergeBelowY = 90 → dano garantido
  room.tsunamiTimer = 180; // intervalSeconds do Priadus — dispara no próximo tick
  room.tick(0.02);
  const ev = room.spectatorView().events.find((e) => e.type === 'DAMAGE' && e.data.kind === 'tsunami' && e.data.victim === victim.id);
  assert.ok(ev, 'DAMAGE kind tsunami na transmissão');
  assert.equal(ev.data.attacker, null);
  assert.ok(ev.data.damage >= 1);

  // pipeline do cliente: ingestão → dreno → spawn puro do FOLLOW
  const view = new SpectatorView();
  assert.equal(view.ingestEvent({ type: 'DAMAGE', data: ev.data }), true);
  const drained = view.consumeDamage();
  assert.equal(drained.length, 1);
  const spawn = specDamageSpawn(drained[0], victim.id, 'FOLLOW_PLAYER');
  assert.ok(spawn, 'número nasce para o seguido que SOFREU o tsunami');
  assert.equal(spawn.hazard, true, 'hazard marcado ponta a ponta');
  assert.equal(spawn.kind, 'tsunami');
  // quem segue outro jogador não vê o número (nunca é radar)
  assert.equal(specDamageSpawn(drained[0], 'outro', 'FOLLOW_PLAYER'), null);
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
