// Khaaos Run — Fase 28 — Arsenal & Equipamento (assinatura Free Fire).
//
// Camadas testadas (mesma filosofia das Fases 17-27):
//   1. TABELAS PURAS — AR-47 no catálogo com 4 sockets, pools de loot com
//      gear, raridade pré-definida respeitada no roll;
//   2. GEAR NÍVEIS — gearFromArmor, nomes, bônus de armor, malhas monotônicas
//      por nível e idempotência do applyOperativeGear (THREE funciona em Node);
//   3. CAIXA DE MORTE — fábrica visual (farol/placa/tampa), conteúdo
//      determinístico herdando o arsenal do caído;
//   4. AIRDROP — agendador determinístico, pool exclusivo, caixa com
//      paraquedas/sinalizador;
//   5. SIM OFFLINE — morte final gera caixa de morte real (loot coletável),
//      pickup de gear sobe nível + emite 'gear', pickup da caixa herda bundle,
//      airdrop nasce uma única vez no tick agendado.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  GEAR_LIMITS, GEAR_NAMES, GEAR_ARMOR_BONUS, SUPPLY_DROP,
  gearFromArmor, describeGearLevel, buildGearMesh, applyOperativeGear,
  createDeathBox, createSupplyDrop, deathBoxContents, supplyDropEvent, seededRng,
} from '../src/game3d/gear3d.js';
import { WEAPONS, LOOT_POOLS, rollLoot } from '../src/shared/weapons.js';
import { KhaaosSim3D, AMMO_CAP } from '../src/game3d/sim3d.js';
import { SeededRng } from '../src/shared/rng.js';

// ---- shim de canvas 2D (padrão character-realism) — entities3d usa
// camoMaterial/skinMaterial que exigem document; sem isso o THREE puro
// funciona, mas os materiais procedurais não ----
const ctx2d = {
  fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, imageSmoothingEnabled: true,
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, closePath() {},
  moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, fill() {}, stroke() {}, save() {}, restore() {},
  translate() {}, rotate() {}, scale() {}, drawImage() {}, setTransform() {},
  quadraticCurveTo() {}, bezierCurveTo() {}, rect() {}, clip() {},
  fillText() {}, strokeText() {}, arcTo() {}, roundRect() {},
  measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(128) }; },
  putImageData() {},
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}
const { createOperative, createWeaponModel } = await import('../src/game3d/entities3d.js');

const STEP = 1 / 30;

// ---------------------------------------------------------------- 1 ----
test('F28 · AR-47 no catálogo com 4 sockets e munição 7.62', () => {
  const w = WEAPONS.ar47;
  assert.ok(w, 'ar47 ausente do catálogo');
  assert.equal(w.category, 'rifle');
  assert.equal(w.ammo, '7.62');
  assert.equal(w.magazine, 40);
  assert.deepEqual(w.sockets, ['muzzle', 'optic', 'mag', 'grip']);
  assert.equal(AMMO_CAP['7.62'], 120);
});

test('F28 · modelo da AR-47 expõe 4 âncoras de socket nomeadas', () => {
  const model = createWeaponModel('ar47', 'LENDARIO');
  const names = ['socket_muzzle', 'socket_optic', 'socket_mag', 'socket_grip'];
  for (const n of names) assert.ok(model.group.getObjectByName(n), `socket ${n} ausente`);
  assert.ok(model.group.userData.sockets);
  assert.equal(Object.keys(model.group.userData.sockets).length, 4);
  // boca mais à frente que o grip frontal (eixo -z = frente da arma)
  const socks = model.group.userData.sockets;
  assert.ok(socks.muzzle.position.z < socks.grip.position.z, 'socket de boca deve estar à frente do grip');
});

test('F28 · pools de loot incluem gear e AR-47; raridade pré-definida respeitada', () => {
  const poolIds = new Set(LOOT_POOLS.armory.map((e) => e.id));
  assert.ok(poolIds.has('ar47'), 'ar47 ausente do pool armory');
  assert.ok(poolIds.has('helmet') && poolIds.has('vest') && poolIds.has('pack'), 'gear ausente do pool armory');
  assert.ok(LOOT_POOLS.supplyDrop.some((e) => e.id === 'ar47' && e.rarity === 'LENDARIO'), 'airdrop deve ter AR-47 LENDÁRIO');
  // roll do pool exclusivo: AR-47 LENDÁRIO sai em várias tentativas e a
  // raridade pré-definida vence o reroll (dano escalado)
  const rng = new SeededRng('f28-pool');
  const rolls = rollLoot(rng, 'supplyDrop', 12);
  const weaponDrop = rolls.find((d) => d.kind === 'weapon');
  assert.ok(weaponDrop, 'pool do airdrop deve sortear a arma');
  assert.equal(weaponDrop.rarity, 'LENDARIO');
  assert.equal(weaponDrop.id, 'ar47');
  assert.ok(weaponDrop.weapon.damage >= Math.round(WEAPONS.ar47.damage * 1.5), 'dano escalado pela raridade');
});

// ---------------------------------------------------------------- 2 ----
test('F28 · gearFromArmor mapeia armor → nível do colete', () => {
  assert.equal(gearFromArmor(0), 0);
  assert.equal(gearFromArmor(18), 1);
  assert.equal(gearFromArmor(35), 2);  // spawn 'belt' ⇒ colete Nv2 visível desde a queda
  assert.equal(gearFromArmor(40), 2);
  assert.equal(gearFromArmor(60), 3);
  assert.equal(gearFromArmor(80), 4);
  assert.equal(gearFromArmor(100), 4);
  assert.equal(gearFromArmor(-5), 0);
});

test('F28 · nomes e bônus de gear por nível', () => {
  assert.equal(describeGearLevel('helmet', 3), 'Capacete Nv3 (Assalto)');
  assert.equal(describeGearLevel('vest', 4), 'Colete Nv4 (Blindado)');
  assert.equal(describeGearLevel('pack', 1), 'Mochila Nv1 (Assalto)');
  assert.equal(describeGearLevel('inexistente', 2), '—');
  assert.equal(GEAR_LIMITS.vest, 4);
  assert.equal(GEAR_LIMITS.helmet, 3);
  assert.equal(GEAR_LIMITS.pack, 3);
  assert.ok(GEAR_ARMOR_BONUS.vest[4] > GEAR_ARMOR_BONUS.vest[1]);
  assert.ok(GEAR_ARMOR_BONUS.helmet[3] > GEAR_ARMOR_BONUS.helmet[1]);
});

test('F28 · malhas de gear crescem por nível (substituição não regride)', () => {
  const countMeshes = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); return n; };
  for (const kind of ['vest', 'helmet', 'pack']) {
    let prev = -1;
    const counts = [];
    for (let lv = 0; lv <= GEAR_LIMITS[kind]; lv++) {
      const mesh = buildGearMesh(kind, lv);
      assert.equal(mesh.name, `gear_${kind}_lv${lv}`);
      const n = countMeshes(mesh);
      counts.push(n);
      if (lv === 0) assert.equal(n, 0, `${kind} Nv0 deve ser vazio`);
      else assert.ok(n >= prev, `${kind} Nv${lv} não pode ter menos peças que Nv${lv - 1}`);
      prev = n;
    }
    assert.ok(counts.at(-1) > counts[1], `${kind} nível máximo deve ser mais equipado que Nv1`);
  }
});

test('F28 · applyOperativeGear é idempotente e substitui head-gear/mochila base', () => {
  const op = createOperative({ variant: 'f28-test', helmet: true });
  const parts = op.parts;
  const countChildren = (g) => g.children.length;
  const torsoBefore = countChildren(parts.torso);

  // Nv1: boné anexado POR CIMA (head-gear base permanece visível)
  applyOperativeGear(parts, { vest: 0, helmet: 1, pack: 0 });
  const baseVisible = [];
  parts.head.traverse((o) => { if (o.userData?.baseHeadGear) baseVisible.push(o.visible); });
  assert.ok(baseVisible.length >= 3 && baseVisible.every(Boolean), 'head-gear base deve permanecer visível com Nv1');
  assert.ok(parts.head.getObjectByName('gear_helmet'), 'boné Nv1 anexado');
  const headNv1 = countChildren(parts.head);
  applyOperativeGear(parts, { vest: 0, helmet: 1, pack: 0 });
  assert.equal(countChildren(parts.head), headNv1, 'reaplicar Nv1 não duplica');

  // Nv3: head-gear base OCULTO + malha de gear presente
  applyOperativeGear(parts, { vest: 4, helmet: 3, pack: 3 });
  const hidden = [];
  parts.head.traverse((o) => { if (o.userData?.baseHeadGear) hidden.push(o.visible); });
  assert.ok(hidden.length >= 3 && hidden.every((v) => !v), 'Nv2+ substitui o capacete base');
  assert.ok(parts.head.getObjectByName('gear_helmet'), 'malha de capacete Nv3 anexada');
  assert.ok(parts.torso.getObjectByName('gear_vest'), 'malha de colete Nv4 anexada');
  const basePack = [];
  parts.torso.traverse((o) => { if (o.userData?.basePack) basePack.push(o.visible); });
  assert.ok(basePack.length >= 3 && basePack.every((v) => !v), 'mochila base substituída por Nv3');

  // idempotência: reaplicar o mesmo nível não duplica
  const torsoWithGear = countChildren(parts.torso);
  applyOperativeGear(parts, { vest: 4, helmet: 3, pack: 3 });
  assert.equal(countChildren(parts.torso), torsoWithGear);
  assert.equal(parts.torso.getObjectByName('gear_vest').name, 'gear_vest');

  // voltar a Nv0 restaura a base
  applyOperativeGear(parts, { vest: 0, helmet: 0, pack: 0 });
  assert.ok(!parts.torso.getObjectByName('gear_vest'));
  const restored = [];
  parts.head.traverse((o) => { if (o.userData?.baseHeadGear) restored.push(o.visible); });
  assert.ok(restored.every(Boolean), 'capacete base volta ao ficar sem gear');
  assert.equal(countChildren(parts.torso), torsoBefore);
});

// ---------------------------------------------------------------- 3 ----
test('F28 · caixa de morte: farol, tampa entreaberta e gemas', () => {
  const box = createDeathBox({ seed: 42, accent: '#ffb52e', name: 'ZHEERS-03' });
  assert.equal(box.name, 'deathBox');
  assert.ok(box.getObjectByName('beacon'), 'farol vertical ausente');
  assert.ok(box.getObjectByName('namePlate'), 'placa de nome ausente');
  assert.ok(box.getObjectByName('lootGem'), 'gema de loot ausente');
  const lid = box.children.find((c) => c.rotation.x !== 0);
  assert.ok(lid, 'tampa entreaberta ausente');
  assert.equal(box.userData.kind, 'deathBox');
  // determinismo: mesma seed → mesma rotação
  const box2 = createDeathBox({ seed: 42, accent: '#ff4633', name: 'X' });
  assert.ok(Math.abs(box.rotation.y - box2.rotation.y) < 1e-12);
});

test('F28 · conteúdo da caixa de morte é determinístico e herda o arsenal', () => {
  const actor = { weapon: 'ar47', weaponSkin: 'LENDARIO', ammoId: '7.62', ammoReserve: 90,
    medkit: 2, frag: 1, gloo: 1, gear: { vest: 3, helmet: 2, pack: 1 } };
  const rng = new SeededRng('f28-dbox');
  const a = deathBoxContents(rng, actor);
  const b = deathBoxContents(new SeededRng('f28-dbox'), actor);
  assert.deepEqual(a, b, 'mesma seed → mesmo conteúdo');
  assert.ok(a.some((i) => i.kind === 'weapon' && i.id === 'ar47'), 'arma do caído vai pra caixa');
  assert.ok(a.some((i) => i.kind === 'ammo' && i.id === '7.62' && i.amount === 60), 'munição residual (teto 60)');
  assert.equal(a.filter((i) => i.kind === 'consumable').length, 2, 'medkits herdados');
  assert.ok(a.some((i) => i.kind === 'vest' && i.level === 3));
  assert.ok(a.some((i) => i.kind === 'helmet' && i.level === 2));
  assert.ok(a.some((i) => i.kind === 'pack' && i.level === 1));
  // ator vazio → caixa nunca vazia
  const empty = deathBoxContents(new SeededRng('f28-empty'), { weapon: 'sucata' });
  assert.ok(empty.length >= 1);
});

// ---------------------------------------------------------------- 4 ----
test('F28 · airdrop: agendador determinístico dispara uma única vez', () => {
  const state = {};
  const mk = (tick) => supplyDropEvent(state, { tick, tickRate: 30, durationS: 480, ringX: 0, ringZ: 0, ringR: 120, seed: 'F28' });
  assert.equal(mk(10), null, 'antes do agendado não dispara');
  const first = mk(10000);
  assert.ok(first, 'deve disparar no tick agendado');
  assert.equal(first.type, 'supplyDrop');
  assert.ok(Math.hypot(first.x, first.z) <= 108, 'caixa nasce dentro do raio útil do ring');
  assert.equal(mk(10001), null, 'depois não dispara de novo (done)');
  // determinismo entre partidas: mesma seed + mesmo tick ⇒ mesmo evento
  const runAt = (fireTick) => {
    const st = {};
    supplyDropEvent(st, { tick: 1, tickRate: 30, durationS: 480, ringX: 0, ringZ: 0, ringR: 120, seed: 'F28' });
    return supplyDropEvent(st, { tick: fireTick, tickRate: 30, durationS: 480, ringX: 0, ringZ: 0, ringR: 120, seed: 'F28' });
  };
  assert.deepEqual(runAt(10000), runAt(10000));
  // mesmo agendamento entre partidas (tick agendado idêntico)
  const state2 = {};
  supplyDropEvent(state2, { tick: 1, tickRate: 30, durationS: 480, ringX: 0, ringZ: 0, ringR: 120, seed: 'F28' });
  assert.equal(state.scheduledTick, state2.scheduledTick);
  // fração alvo ~38% da partida (com jitter ±10%)
  const scheduledS = state.scheduledTick / 30;
  assert.ok(scheduledS > 480 * SUPPLY_DROP.FRACTION * .85 && scheduledS < 480 * SUPPLY_DROP.FRACTION * 1.15);
});

test('F28 · caixa de airdrop: paraquedas, sinalizador e blindagem', () => {
  const crate = createSupplyDrop({ seed: 7 });
  assert.equal(crate.name, 'supplyDrop');
  assert.ok(crate.getObjectByName('canopy'), 'paraquedas ausente');
  assert.ok(crate.getObjectByName('paraLines'), 'suspensões ausentes');
  assert.ok(crate.getObjectByName('flare'), 'sinalizador ausente');
  assert.ok(crate.getObjectByName('lootGem'), 'gema ausente');
  assert.equal(crate.userData.kind, 'supplyDrop');
});

// ---------------------------------------------------------------- 5 ----
const groundSim = (seed, botCount = 2, extra = {}) => { const s = new KhaaosSim3D({ seed, botCount, airdrop: false, ...extra }); s.start('belt'); return s; };
const muteWorldLoot = (s) => { for (const i of s.loot) i.active = false; };
const blank = (over = {}) => ({
  seq: 1, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false,
  jump: false, interact: false, reload: false, medkit: false, throw: false, gloo: false, slot: 0, ...over,
});

test('F28 · sim: pickup de gear sobe nível, concede armor e emite "gear"', () => {
  const s = groundSim('f28-gear');
  const p = s.player;
  const sp = s.world.playerSpawn; // ponto garantidamente livre de colliders
  p.x = sp.x; p.z = sp.z; p.y = 0; p.dropPhase = null;
  muteWorldLoot(s);
  s.loot.push({ id: 'f28-h3', kind: 'helmet', level: 3, x: sp.x + .5, z: sp.z, y: 0.55, active: true });
  s.loot.push({ id: 'f28-p2', kind: 'pack', level: 2, x: sp.x + .6, z: sp.z, y: 0.55, active: true });
  const armorBefore = p.armor;
  s.step(blank({ interact: true }), STEP);
  assert.equal(p.gear.helmet, 3, 'capacete Nv3 equipado (item mais próximo)');
  s.step(blank({ interact: true }), STEP);
  assert.equal(p.gear.pack, 2, 'mochila Nv2 equipada (segunda coleta)');
  assert.ok(p.armor > armorBefore, 'gear concede bônus de armor');
  const gearEvents = s.consumeEvents().filter((e) => e.type === 'gear');
  assert.ok(gearEvents.some((e) => e.kind === 'helmet' && e.level === 3));
  // nível não desce: pegar Nv1 depois mantém Nv3
  s.loot.push({ id: 'f28-h1', kind: 'helmet', level: 1, x: sp.x + .5, z: sp.z, y: 0.55, active: true });
  s.step(blank({ interact: true }), STEP);
  assert.equal(p.gear.helmet, 3, 'nível do capacete não rebaixa');
});

test('F28 · sim: morte final de bot gera caixa de morte coletável com bundle', () => {
  const s = groundSim('f28-box', 1);
  muteWorldLoot(s);
  const p = s.player, b = s.bots[0];
  const sp = s.world.playerSpawn;
  // combate controlado no spawn: bot a 2m à frente, vida 1, CONGELADO (speed 0)
  p.x = sp.x; p.z = sp.z; p.y = 0; p.dropPhase = null; p.yaw = 0; p.pitch = 0; // facing -z
  b.x = sp.x; b.z = sp.z - 2; b.y = 0; b.armor = 0; b.life = 1; b.alive = true;
  b.speed = 0; b.ai.state = 'patrol'; b.ai.think = 0;
  let killed = false, killEvents = [];
  for (let i = 0; i < 120 && !killed; i++) {
    s.step(blank({ fire: true }), STEP);
    killEvents = killEvents.concat(s.consumeEvents());
    killed = !b.alive;
  }
  assert.ok(killed, 'bot não morreu no ponto de mira');
  const boxItem = s.loot.find((i) => i.kind === 'deathBox');
  assert.ok(boxItem, 'caixa de morte não nasceu');
  assert.ok(Math.hypot(boxItem.x - b.x, boxItem.z - b.z) < .01, 'caixa na posição do caído');
  assert.equal(boxItem.victimName, b.name);
  assert.ok(Array.isArray(boxItem.bundle) && boxItem.bundle.length > 0);
  assert.ok(killEvents.some((e) => e.type === 'deathBox' && e.victim === b.name));
  // jogador coleta a caixa: herda bundle (arma upgrade + consumíveis/gear)
  p.weapon = 'g19'; p.slots = { 1: 'g19' }; p.activeSlot = 1; p.ammoMag = 15;
  p.inventory = { ammo: { '9MM': 10, '7.62': 0 }, medkit: 0, frag: 0, gloo: 0 };
  const hadGear = boxItem.bundle.some((i) => ['helmet', 'vest', 'pack'].includes(i.kind));
  const hadWeapon = boxItem.bundle.some((i) => i.kind === 'weapon');
  assert.ok(hadWeapon || hadGear, 'bundle carrega herança do caído');
  s.step(blank({ interact: true }), STEP);
  assert.equal(boxItem.active, false, 'caixa consumida');
  assert.ok(p.gear.vest > 0 || p.gear.helmet > 0 || p.gear.pack > 0 || p.weapon !== 'g19' || p.inventory.medkit > 0 || p.inventory.frag > 0,
    'algum item do bundle foi aplicado ao sobrevivente');
});

test('F28 · sim: airdrop de suprimento nasce UMA vez e o loot é coletável', () => {
  const s = groundSim('f28-airdrop', 0);
  muteWorldLoot(s);
  // avança até o tick agendado; jogador é mantido vivo no centro do ring
  // (a partida idle termina antes do airdrop agendado — o teste isola o agendador)
  let sawEvent = null;
  for (let i = 0; i < 12000 && !s.supplyDropItem; i++) {
    const p = s.player;
    p.x = s.ring.x; p.z = s.ring.z; p.y = 0; p.alive = true; p.knocked = false;
    p.life = 100; p.armor = 60; p.dropPhase = null; s.over = false;
    s.step(blank(), STEP);
    const ev = s.consumeEvents().find((e) => e.type === 'supplyDrop');
    if (ev) sawEvent = ev;
  }
  assert.ok(s.supplyDropItem, 'caixa de airdrop não nasceu na partida');
  assert.ok(sawEvent, 'evento supplyDrop emitido');
  const item = s.supplyDropItem;
  assert.ok(item.active, 'caixa ativa no chão');
  // coleta: AR-47 LENDÁRIO entra no loadout do jogador
  const p = s.player;
  p.x = item.x; p.z = item.z; p.y = 0; p.dropPhase = null;
  p.weapon = 'g19'; p.slots = { 1: 'g19' }; p.activeSlot = 1;
  p.inventory = { ammo: { '9MM': 10, '7.62': 30 }, medkit: 0, frag: 0, gloo: 0 };
  s.step(blank({ interact: true }), STEP);
  assert.equal(item.active, false, 'caixa de airdrop consumida');
  assert.equal(p.weapon, 'ar47', 'AR-47 equipado');
  assert.equal(p.weaponSkin, 'LENDARIO', 'skin lendária do airdrop');
  assert.ok(p.ammoMag > 0, 'carregador municiado');
});

test('F28 · sim: placa cerâmica reflete no nível do colete (paridade visual)', () => {
  const s = groundSim('f28-plate', 0);
  const p = s.player;
  const sp = s.world.playerSpawn;
  p.x = sp.x; p.z = sp.z; p.y = 0; p.armor = 0; p.gear.vest = 0; p.dropPhase = null;
  muteWorldLoot(s);
  s.loot.push({ id: 'f28-cer', kind: 'armor', amount: 90, x: sp.x + .5, z: sp.z, y: 0.55, active: true });
  s.step(blank({ interact: true }), STEP);
  assert.ok(p.armor >= 90);
  assert.equal(p.gear.vest, 4, 'placa alta ⇒ colete Nv4 na silhueta');
  assert.ok(s.consumeEvents().some((e) => e.type === 'gear' && e.kind === 'vest'));
});

test('F28 · sim: seedHash determinístico (agendadores por partida)', () => {
  const a = new KhaaosSim3D({ seed: 'f28-hash', botCount: 0, airdrop: false });
  const b = new KhaaosSim3D({ seed: 'f28-hash', botCount: 0, airdrop: false });
  const c = new KhaaosSim3D({ seed: 'f28-hash2', botCount: 0, airdrop: false });
  assert.equal(a.seedHash, b.seedHash);
  assert.notEqual(a.seedHash, c.seedHash);
});
