// Khaaos Run — Fase 27 — números de dano flutuantes (assinatura Free Fire).
//
// Camadas testadas (mesma filosofia das Fases 17-26):
//   1. MATEMÁTICA PURA — projeção mundo→tela, gramática de tiers, hash de
//      stagger (determinística, sem DOM);
//   2. POOL DE DOM — ring buffer, subida/fade por idade, popup de nocaute e
//      headless-safe (com DOM falso injetado e sem document);
//   3. SIM OFFLINE — evento 'hit' ganha `owner` (bala), explosão emite
//      'hit' kind 'explosion' e 'botKnocked' ganha `victim` (id);
//   4. ROOM AUTORITATIVA — explosão entrega o número SÓ ao dono (paridade).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DMG_LIFE_S, DMG_KNOCK_LIFE_S, KNOCK_MEMORY_S, DMG_MAX, DMG_STAGGER_PX, DMG_HEAD_SCALE,
  damageTier, projectToScreen, hashOffset, DamageNumbers3D,
} from '../src/game3d/damageNumbers3d.js';
import { KhaaosSim3D } from '../src/game3d/sim3d.js';
import { MatchRoom3D } from '../server/room3d.js';

const STEP = 1 / 30;
const DT = 1 / 20;

// ---------- DOM falso (mesmo padrão do spectator-follow-select) ----------
class FakeElement {
  constructor() {
    this.className = ''; this.textContent = '';
    // F39 — style com setProperty/removeProperty (vars do festival sazonal)
    // + classList (classe .mythic acendida pelo pool quando há aura ativa)
    this.style = {
      setProperty(k, v) { this[k] = v; },
      removeProperty(k) { delete this[k]; },
    };
    this._cls = new Set();
    this.children = [];
    this.removed = false; this.parent = null;
  }
  get classList() {
    const s = this._cls;
    return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) };
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

// ---------- helpers da sim/room ----------
const groundSim = (seed, botCount = 0, extra = {}) => new KhaaosSim3D({ seed, botCount, airdrop: false, ...extra });
const blank = (over = {}) => ({
  seq: 1, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false,
  jump: false, interact: false, reload: false, medkit: false, throw: false, gloo: false, slot: 0, ...over,
});
const idle = (yaw = 0, pitch = 0) => blank({ yaw, pitch });

// ========== 1. matemática pura ==========

test('fase27 projeção: ponto à frente da câmera cai no centro; atrás e fora da tela são invisíveis', () => {
  const cam = new THREE.PerspectiveCamera(62, 1, .1, 100);
  cam.position.set(0, 0, 0);
  cam.lookAt(0, 0, -1);
  cam.updateMatrixWorld(true);
  const W = 800, H = 600;
  const center = projectToScreen(0, 0, -10, cam, W, H);
  assert.ok(center.visible, 'ponto à frente é visível');
  assert.ok(Math.abs(center.x - W / 2) < 1e-6, `x central: ${center.x}`);
  assert.ok(Math.abs(center.y - H / 2) < 1e-6, `y central: ${center.y}`);
  const behind = projectToScreen(0, 0, 10, cam, W, H);
  assert.equal(behind.visible, false, 'ponto atrás da câmera é invisível');
  const off = projectToScreen(500, 0, -10, cam, W, H);
  assert.equal(off.visible, false, 'ponto fora da tela é invisível');
});

test('fase27 tiers: body branco, head maior/vermelho e knock vira popup NOCAUTE', () => {
  const body = damageTier({});
  assert.equal(body.cls, 'dmg-body');
  assert.equal(body.scale, 1);
  const head = damageTier({ head: true });
  assert.equal(head.cls, 'dmg-head');
  assert.equal(head.scale, DMG_HEAD_SCALE);
  assert.ok(head.scale > body.scale, 'headshot é maior');
  const knock = damageTier({ knock: true });
  assert.equal(knock.cls, 'dmg-knock');
  assert.equal(knock.text, 'NOCAUTE');
});

test('fase27 hash de stagger: determinístico, apenas 3 valores e cobertura anti-sobreposição', () => {
  const a = hashOffset('bot-01');
  assert.equal(a, hashOffset('bot-01'), 'mesmo id → mesmo offset');
  const set = new Set(['bot-01', 'bot-02', 'bot-03', 'player', 'p2', 'p3'].map(hashOffset));
  assert.ok(set.size <= 3, `offsets ∈ {-1,0,1} × stagger: ${[...set]}`);
  for (const v of set) assert.ok([-DMG_STAGGER_PX, 0, DMG_STAGGER_PX].includes(v), `valor canônico: ${v}`);
  assert.ok(set.size >= 2, 'ids variados produzem offsets variados');
});

// ========== 2. pool de DOM ==========

test('fase27 pool: spawn body/head/knock cria nó com classe, texto e display oculto', () => {
  const { result, root } = withFakeDoc(() => {
    const pool = new DamageNumbers3D({ container: null });
    // container null → headless-safe: matemática roda, DOM é pulado
    const e1 = pool.spawn({ x: 1, y: 1, z: -5, damage: 34, victim: 'bot-01' });
    assert.ok(e1, 'entrada registrada sem container');
    return pool;
  });
  assert.ok(result, 'pool funciona sem DOM');

  withFakeDoc((root) => {
    const pool = new DamageNumbers3D({ container: root });
    pool.spawn({ x: 0, y: 1.4, z: -6, damage: 34, victim: 'bot-01' });
    pool.spawn({ x: 0, y: 1.4, z: -6, damage: 61, head: true, victim: 'bot-02' });
    const k = pool.popupKnock(); // memory do 1º spawn (idade 0)
    assert.ok(k, 'popup de nocaute nasce na memória do último hit');
    assert.equal(root.children.length, 3, 'três nós criados');
    assert.match(root.children[0].className, /dmg-num dmg-body/);
    assert.equal(root.children[0].textContent, '34');
    assert.match(root.children[1].className, /dmg-head/);
    assert.equal(root.children[1].textContent, '61');
    assert.match(root.children[2].className, /dmg-knock/);
    assert.equal(root.children[2].textContent, 'NOCAUTE');
    assert.equal(root.children[0].style.display, 'none', 'nó nasce oculto até o 1º update');
  });
});

test('fase27 pool: dano zero é ignorado; ring buffer recicla o mais antigo no teto', () => {
  withFakeDoc((root) => {
    const pool = new DamageNumbers3D({ container: root, max: 3 });
    assert.equal(pool.spawn({ x: 0, y: 1, z: -5, damage: 0 }), null, 'dano 0 não é informação');
    assert.equal(pool.spawn({ x: 0, y: 1, z: -5, damage: -5 }), null, 'dano negivo clampeado fora');
    for (let i = 0; i < 5; i++) pool.spawn({ x: 0, y: 1, z: -5, damage: 10 + i, victim: `bot-0${i}` });
    assert.equal(pool.size, 3, 'teto do ring respeitado');
    assert.equal(root.children.length, 3, 'nó reciclado sai do container');
    assert.equal(root.children[0].textContent, '12', 'os dois primeiros foram reciclados');
  });
});

test('fase27 update: sobe com easing, segura opacidade e fade no fim; expira e recicla', () => {
  const cam = new THREE.PerspectiveCamera(62, 1, .1, 100);
  cam.position.set(0, 0, 0); cam.lookAt(0, 0, -1); cam.updateMatrixWorld(true);
  withFakeDoc((root) => {
    const pool = new DamageNumbers3D({ container: root });
    pool.spawn({ x: 0, y: 0, z: -10, damage: 25, victim: 'bot-01' });
    const el = root.children[0];
    const vp = { camera: cam, width: 800, height: 600 };
    pool.update(0.01, vp);
    assert.equal(el.style.display, 'block', 'visível após o 1º update');
    const top0 = parseFloat(el.style.top);
    pool.update(DMG_LIFE_S * 0.3, vp); // idade ~0.28 s (p ~0.31)
    const top1 = parseFloat(el.style.top);
    const op1 = parseFloat(el.style.opacity);
    assert.ok(top1 < top0, `número sobe: ${top0} → ${top1}`);
    assert.ok(Math.abs(op1 - 1) < 1e-6, 'opacidade segura no meio da vida');
    pool.update(DMG_LIFE_S * 0.35, vp); // idade ~0.60 s (p ~0.67) → fade ativo
    const op2 = parseFloat(el.style.opacity);
    assert.ok(op2 < 1, `fade no fim da vida: ${op2}`);
    pool.update(DMG_LIFE_S, vp); // expira (idade > vida)
    assert.equal(pool.size, 0, 'entrada reciclada ao expirar');
    assert.equal(el.removed, true, 'nó removido do container');
  });
});

test('fase27 popup de nocaute: só dentro da janela da memória e memória limpa ao expirar', () => {
  const cam = new THREE.PerspectiveCamera(62, 1, .1, 100);
  cam.position.set(0, 0, 0); cam.lookAt(0, 0, -1); cam.updateMatrixWorld(true);
  const vp = { camera: cam, width: 800, height: 600 };
  withFakeDoc((root) => {
    const pool = new DamageNumbers3D({ container: root });
    assert.equal(pool.popupKnock(), null, 'sem hit prévio: sem popup');
    pool.spawn({ x: 0, y: 1.2, z: -8, damage: 40, victim: 'bot-01' });
    const mem = pool._mem;
    pool.update(KNOCK_MEMORY_S + 0.1, vp);
    assert.equal(pool._mem, null, 'memória expira junto');
    assert.equal(mem.age > KNOCK_MEMORY_S, true);
    pool.spawn({ x: 0, y: 1.2, z: -8, damage: 40, victim: 'bot-01' });
    pool.update(KNOCK_MEMORY_S + 0.1, vp);
    assert.equal(pool.popupKnock(), null, 'hit velho não explica nocaute');
    pool.spawn({ x: 0, y: 1.2, z: -8, damage: 55, head: true, victim: 'bot-01' });
    const k = pool.popupKnock();
    assert.ok(k, 'hit recente gera popup');
    assert.equal(k.life, DMG_KNOCK_LIFE_S, 'popup vive mais que o número');
    assert.ok(k.tier.scale > 1, 'popup com escala própria');
    pool.clear();
    assert.equal(pool.size, 0, 'clear zera o pool');
    assert.equal(pool.popupKnock(), null, 'clear apaga a memória');
  });
});

test('fase27 headless-safe: sem document o pool é no-op de DOM e nunca explode', () => {
  // node/test roda sem document — este bloco inteiro é a prova de segurança
  const pool = new DamageNumbers3D({ container: undefined });
  const e = pool.spawn({ x: 0, y: 1, z: -5, damage: 33, victim: 'bot-09' });
  assert.ok(e && e.el === null, 'entrada rastreada sem nó');
  assert.doesNotThrow(() => pool.update(STEP, { camera: null, width: 0, height: 0 }));
  assert.equal(pool.size, 1);
  assert.doesNotThrow(() => pool.popupKnock()); // memória fresca: popup nasce (sem DOM)
  assert.equal(pool.size, 2, 'popup registrado mesmo sem DOM');
  assert.doesNotThrow(() => pool.clear());
  assert.equal(pool.size, 0);
});

// ========== 3. sim offline ==========

test('fase27 sim: hit de bala do JOGADOR traz owner=player, dano inteiro e head booleano', () => {
  const s = groundSim('F27-BALA', 1);
  s.start('belt');
  const p = s.player, bot = s.bots[0];
  bot.x = p.x; bot.z = p.z - 3; bot.armor = 0; // encostado à frente (frente = -Z)
  s.step({ ...idle(0), fire: true }, STEP);
  for (let i = 0; i < 8 && !s.events.some((e) => e.type === 'hit'); i++) s.step(idle(0), STEP);
  const hit = s.events.find((e) => e.type === 'hit');
  assert.ok(hit, 'hit emitido');
  assert.equal(hit.owner, 'player', 'Fase 27: owner identifica o atirador');
  assert.equal(hit.victim, bot.id);
  assert.equal(typeof hit.head, 'boolean');
  assert.equal(Number.isInteger(hit.damage), true, 'dano arredondado');
  assert.ok(hit.damage > 0, `dano positivo: ${hit.damage}`);
});

test('fase27 sim: granada do jogador emite hit kind explosion com owner (número de explosão)', () => {
  const s = groundSim('F27-FRAG', 1);
  s.start('belt');
  const p = s.player, bot = s.bots[0];
  bot.x = p.x; bot.z = p.z - 4; bot.armor = 0;
  s.step({ ...idle(0), throw: true }, STEP);
  assert.equal(s.grenades.length, 1, 'granada em voo');
  // acompanha a granada teleportando a vítima para o epicentro (dano garantido)
  let detonated = false;
  for (let i = 0; i < 90; i++) {
    s.step(idle(0), STEP);
    if (s.grenades.length > 0) { bot.x = s.grenades[0].x; bot.z = s.grenades[0].z; }
    if (s.events.some((e) => e.type === 'explosion')) { detonated = true; break; }
  }
  assert.ok(detonated, 'granada detona na janela');
  const hit = s.events.find((e) => e.type === 'hit' && e.kind === 'explosion');
  assert.ok(hit, 'hit de explosão emitido (Fase 27)');
  assert.equal(hit.owner, 'player', 'owner = dono da granada');
  assert.equal(hit.victim, bot.id);
  assert.ok(hit.damage > 0, `dano radial positivo: ${hit.damage}`);
  assert.equal(hit.head, false, 'explosão nunca é headshot');
});

test('fase27 sim: botKnocked do jogador traz victim (id) — popup ancora no hit letal', () => {
  const s = groundSim('F27-KNOCK', 1, { squad: true });
  s.start('belt');
  const p = s.player, bot = s.bots[0];
  // Fase 32 — economia de sobrevivência: sem o kit zerado o bot se CURA no
  // step (life 1 → 31) e o cenário "qualquer hit nocauteia" deixa de valer.
  bot.inventory.medkit = 0;
  bot.x = p.x; bot.z = p.z - 2.5; bot.armor = 0; bot.life = 1; // qualquer hit nocauteia
  s.step({ ...idle(0), fire: true }, STEP);
  for (let i = 0; i < 8 && !s.events.some((e) => e.type === 'botKnocked'); i++) s.step(idle(0), STEP);
  const knock = s.events.find((e) => e.type === 'botKnocked');
  assert.ok(knock, 'nocaute emitido (squad DBNO)');
  assert.equal(knock.victim, bot.id, 'Fase 27: victim é o ID do alvo (âncora do popup)');
  assert.equal(knock.target, bot.name, 'target continua sendo o nome (feed)');
  assert.ok(knock.xp > 0);
});

// ========== 4. room autoritativa (paridade online) ==========

test('fase27 room: explosão entrega hit kind explosion SÓ ao dono da granada', () => {
  const room = new MatchRoom3D({ id: 'ring3d-f27', seed: 'F27-ROOM', region: 'sa-east', capacity: 16, botFill: 0, airdrop: false });
  room.addPlayer('p1', 'JOGADOR-1'); room.addPlayer('p2', 'JOGADOR-2');
  room.start('p1', 'belt');
  const p1 = room.humans.get('p1'), p2 = room.humans.get('p2');
  p2.armor = 0;
  room.input('p1', blank({ seq: 1, throw: true })); room.tick(DT);
  assert.equal(room.grenades.length, 1, 'granada autoritativa em voo');
  let seq = 2;
  let detonated = false;
  for (let i = 0; i < 70; i++) {
    if (room.grenades.length > 0) { p2.x = room.grenades[0].x; p2.z = room.grenades[0].z; }
    room.input('p1', blank({ seq: seq++ })); room.input('p2', blank({ seq: seq++ })); room.tick(DT);
    if (room.events.get('p1')?.some((e) => e.type === 'explosion')) { detonated = true; break; }
  }
  assert.ok(detonated, 'detonação na janela');
  const own = room.drainEvents('p1');
  const hit = own.find((e) => e.type === 'hit' && e.kind === 'explosion');
  assert.ok(hit, 'dono recebe o número de explosão (paridade com offline)');
  assert.equal(hit.owner, 'p1');
  assert.equal(hit.victim, 'p2');
  assert.ok(hit.damage > 0);
  const victimEvents = room.drainEvents('p2');
  assert.ok(!victimEvents.some((e) => e.type === 'hit' && e.kind === 'explosion'), 'vítima NÃO recebe o número (só o dono usa)');
});

test('fase27 room: hit de bala autoritativa continua com owner (contrato já existente intacto)', () => {
  const room = new MatchRoom3D({ id: 'ring3d-f27b', seed: 'F27-ROOM-B', region: 'sa-east', capacity: 16, botFill: 0, airdrop: false });
  room.addPlayer('p1', 'JOGADOR-1'); room.addPlayer('p2', 'JOGADOR-2');
  room.start('p1', 'belt');
  const p1 = room.humans.get('p1'), p2 = room.humans.get('p2');
  p1.cooldown = 0; p2.armor = 0;
  p1.yaw = -Math.PI / 2; // frente = +X
  p2.x = p1.x + 4; p2.z = p1.z;
  let seq = 100;
  for (let i = 0; i < 10; i++) { room.input('p1', blank({ seq: seq++, yaw: -Math.PI / 2, fire: true })); room.input('p2', blank({ seq: 1 })); room.tick(DT); }
  const hit = room.drainEvents('p1').find((e) => e.type === 'hit' && e.victim === 'p2');
  assert.ok(hit, 'hit autoritativo entregue');
  assert.equal(hit.owner, 'p1', 'owner do atirador');
  assert.ok(hit.damage > 0);
});

// ====================== F39 — festival sazonal nos números de dano ==========

test('f39 pool: com aura ativa, body/head ganham .mythic + vars da temporada', () => {
  withFakeDoc((root) => {
    const pool = new DamageNumbers3D({ container: root });
    pool.setAuraVars({ aura: '#ff2d78', season: '#ff5a94', dur: '1.4' });
    const body = pool.spawn({ x: 1, y: 1, z: -5, damage: 21, victim: 'bot-01' });
    const head = pool.spawn({ x: 1, y: 1, z: -5, damage: 55, head: true, victim: 'bot-02' });
    assert.ok(body.el.classList.contains('mythic'), 'corpo: classe .mythic acendida');
    assert.ok(head.el.classList.contains('mythic'), 'headshot: classe .mythic acendida');
    assert.equal(body.el.style['--dmg-aura'], '#ff2d78', 'corpo: identidade da skin (--dmg-aura)');
    assert.equal(body.el.style['--dmg-season'], '#ff5a94', 'corpo: glow da estação (--dmg-season)');
    assert.equal(head.el.style['--dmg-aura'], '#ff2d78', 'head: identidade injetada (CSS mantém o vermelho)');
    assert.equal(head.el.style['--dmg-season'], '#ff5a94', 'head: halo da estação injetado');
    // dicionário de classes preservado (o CSS decide o visual por tier)
    assert.ok(body.el.className.includes('dmg-body'), 'classe do tier intacta');
    assert.ok(head.el.className.includes('dmg-head'), 'classe do tier intacta');
    assert.equal(root.children.length, 2, 'nós no container');
  });
});

test('f39 pool: hazard e NOCAUTE NUNCA recebem o festival (semáforo de combate intacto)', () => {
  withFakeDoc((root) => {
    const pool = new DamageNumbers3D({ container: root });
    pool.setAuraVars({ aura: '#ff2d78', season: '#ff5a94', dur: '1' });
    const hazard = pool.spawn({ x: 1, y: 1, z: -5, damage: 9, hazard: true, kind: 'acid', victim: 'x' });
    const knock = pool.spawn({ x: 1, y: 1, z: -5, knock: true });
    assert.ok(!hazard.el.classList.contains('mythic'), 'hazard: identidade por mundo preservada');
    assert.ok(hazard.el.style['--dmg-aura'] === undefined, 'hazard: nenhuma var injetada');
    assert.ok(!knock.el.classList.contains('mythic'), 'NOCAUTE dourado: recompensa sem festival');
    assert.ok(knock.el.style['--dmg-season'] === undefined, 'NOCAUTE: nenhuma var injetada');
  });
});

test('f39 pool: sem aura (null/lixo) → números neutros; vars sobrevivem ao clear', () => {
  withFakeDoc((root) => {
    const pool = new DamageNumbers3D({ container: root });
    // sem setAuraVars: spawn neutro (contrato F27 intocado)
    const neutral = pool.spawn({ x: 1, y: 1, z: -5, damage: 12, victim: 'b' });
    assert.ok(neutral.el, 'nó criado');
    assert.ok(!neutral.el.classList.contains('mythic'), 'sem aura → sem .mythic');
    // setAuraVars com lixo → guard: sem festival (nunca decora com dado podre)
    pool.setAuraVars(null);
    pool.setAuraVars({ aura: 123, season: '#ff5a94' });   // aura não-string
    pool.setAuraVars('rosa');                              // objeto errado
    const still = pool.spawn({ x: 1, y: 1, z: -5, damage: 12, victim: 'b' });
    assert.ok(!still.el.classList.contains('mythic'), 'lixo → guard → neutro');
    // festival ligado de novo e clear(): skin equipada sobrevive ao restart
    pool.setAuraVars({ aura: '#4d9bff', season: '#7ab5ff', dur: '1' });
    pool.spawn({ x: 1, y: 1, z: -5, damage: 30, victim: 'c' });
    pool.clear();
    const after = pool.spawn({ x: 1, y: 1, z: -5, damage: 30, victim: 'd' });
    assert.ok(after.el.classList.contains('mythic'), 'clear() não desliga o festival (skin segue equipada)');
    assert.equal(after.el.style['--dmg-aura'], '#4d9bff');
  });
});
