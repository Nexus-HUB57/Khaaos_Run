// Khaaos Run — Fase 30 — Anexos da AR-47 (4 sockets) + Skin Mítica Evolutiva.
//
// Camadas testadas (mesma filosofia das Fases 17-28):
//   1. TABELAS PURAS — catálogo de anexos cobre os 4 sockets; stats derivados
//      (pente/dispersão/zoom/alcance/silêncio); raridade MÍTICA + estágios;
//   2. MALHAS — cada anexo tem malha própria; applyAttachments é idempotente,
//      um anexo por socket e troca limpa; overlay mítico cresce por estágio;
//   3. LOOT — pools com anexos avulsos, anexos de série por raridade (PURO);
//   4. SIM OFFLINE — pickup com anexos de série, anexo avulso instala no
//      socket livre, troca de slot limpa, caixa de morte herda anexos, e o
//      abate EVOLUI a skin mítica (evento 'mythic' com estágio).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ATTACHMENTS, ATTACH_SOCKETS, attachmentStats,
  buildAttachmentMesh, applyAttachments, applyMythicSkin,
  mythicStageFromKills, MYTHIC_SKIN, MYTHIC_STAGE_NAMES,
  registerMythic, unregisterMythic, tickMythicWeapons,
} from '../src/game3d/attachments3d.js';
import { RARITIES, WEAPONS, LOOT_POOLS, rollLoot, attachmentsForDrop } from '../src/shared/weapons.js';
import { deathBoxContents } from '../src/game3d/gear3d.js';
import { KhaaosSim3D, DEFAULT_INPUT } from '../src/game3d/sim3d.js';
import { SeededRng } from '../src/shared/rng.js';

// ---- shim de canvas 2D (padrão da suíte) — entidades procedurais em Node ----
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
  getImageData() { return { data: new Uint8ClampedArray(4).fill(128) }; },
  putImageData() {}, createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}
const { createWeaponModel, createLootMesh } = await import('../src/game3d/entities3d.js');

const STEP = 1 / 30;
const idle = (yaw = 0, pitch = 0) => ({ ...DEFAULT_INPUT, yaw, pitch });

// ---------------------------------------------------------------- 1 ----
test('F30/31 · catálogo cobre os 4 sockets; compat por arma (AR-47, M4, MP5, G19, Barrett)', () => {
  assert.deepEqual(WEAPONS.ar47.sockets, ATTACH_SOCKETS);
  const sockets = Object.values(ATTACHMENTS).map((a) => a.socket).sort();
  assert.deepEqual(sockets, [...ATTACH_SOCKETS].sort());
  assert.equal(Object.keys(ATTACHMENTS).length, 4);
  for (const a of Object.values(ATTACHMENTS)) {
    assert.ok(a.name && a.short, `${a.id}: nome/curto ausentes`);
    assert.ok(a.compatible.includes('ar47'), `${a.id}: AR-47 sempre compatível`);
  }
  // Fase 31 — sockets generalizados: M4/MP5 idênticos à AR-47; G19 sem grip;
  // Barrett sem optic (luneta de série) e sem grip na pistola
  assert.deepEqual(WEAPONS.m4.sockets, ATTACH_SOCKETS);
  assert.deepEqual(WEAPONS.mp5.sockets, ATTACH_SOCKETS);
  assert.deepEqual(WEAPONS.g19.sockets, ['muzzle', 'optic', 'mag']);
  assert.deepEqual(WEAPONS.barrett.sockets, ['muzzle', 'mag', 'grip']);
  for (const id of Object.keys(ATTACHMENTS)) {
    for (const w of ATTACHMENTS[id].compatible) {
      assert.ok(WEAPONS[w]?.sockets?.length, `${id}: arma compatível ${w} sem sockets`);
    }
  }
  assert.ok(!ATTACHMENTS.gripvertical.compatible.includes('g19'), 'pistola não aceita foregrip');
  assert.ok(!ATTACHMENTS.mira4x.compatible.includes('barrett'), 'barrett já tem luneta de série');
});

test('F30 · stats derivados (PURO): pente, dispersão, zoom, alcance e silêncio', () => {
  const none = attachmentStats([]);
  assert.equal(none.magBonus, 0);
  assert.equal(none.spreadMul, 1);
  assert.equal(none.adsZoom, 1);
  assert.equal(none.silenced, false);
  const full = attachmentStats(['mira4x', 'silenciador', 'magestendida', 'gripvertical']);
  assert.equal(full.magBonus, 15);                       // 40 → 55
  assert.equal(full.spreadMul, .8);                      // grip -20%
  assert.ok(full.adsZoom < 1 && full.adsZoom > .5);      // 4x aproxima sem fisheye
  assert.equal(full.rangeMul, 1.08);                     // mira estende o voo
  assert.equal(full.silenced, true);
  // sem duplicatas estragando o resultado
  const dup = attachmentStats(['magestendida', 'magestendida']);
  assert.equal(dup.magBonus, 15);
});

test('F30 · raridade MÍTICA + estágios evolutivos (0/2/4/6 abates)', () => {
  assert.ok(RARITIES.MITICA, 'MITICA ausente da tabela');
  assert.ok(RARITIES.MITICA.multiplier > RARITIES.LENDARIO.multiplier, 'mítica paga mais que lendária');
  assert.equal(RARITIES.MITICA.color, MYTHIC_SKIN.aura);
  assert.equal(mythicStageFromKills(0), 1);
  assert.equal(mythicStageFromKills(1), 1);
  assert.equal(mythicStageFromKills(2), 2);
  assert.equal(mythicStageFromKills(3), 2);
  assert.equal(mythicStageFromKills(4), 3);
  assert.equal(mythicStageFromKills(5), 3);
  assert.equal(mythicStageFromKills(6), 4);
  assert.equal(mythicStageFromKills(50), 4);
  assert.equal(MYTHIC_STAGE_NAMES.length, 4);
});

// ---------------------------------------------------------------- 2 ----
test('F30 · cada anexo tem malha procedural própria com pivô no socket', () => {
  for (const id of Object.keys(ATTACHMENTS)) {
    const mesh = buildAttachmentMesh(id);
    assert.equal(mesh.name, `attach_${id}`);
    assert.ok(mesh.children.length > 0, `${id}: malha vazia`);
    assert.ok(mesh.position.lengthSq() === 0, `${id}: pivô na origem (âncora posiciona)`);
  }
  assert.equal(buildAttachmentMesh('inexistente').children.length, 0, 'id desconhecido não explode');
});

test('F30 · applyAttachments monta nos sockets, é idempotente e um anexo por socket', () => {
  const model = createWeaponModel('ar47', 'LENDARIO');
  const sockets = model.group.userData.sockets;
  const applied = applyAttachments(model.group, ['mira4x', 'silenciador', 'magestendida', 'gripvertical']);
  assert.equal(applied.length, 4);
  for (const s of ATTACH_SOCKETS) {
    assert.equal(sockets[s].children.length, 1, `socket ${s} com exatamente 1 anexo`);
  }
  // idempotente: re-aplicar não duplica
  applyAttachments(model.group, ['mira4x', 'silenciador', 'magestendida', 'gripvertical']);
  for (const s of ATTACH_SOCKETS) assert.equal(sockets[s].children.length, 1, `${s}: sem duplicação`);
  // troca limpa: outro anexo no mesmo socket substitui
  applyAttachments(model.group, ['silenciador']);
  assert.equal(sockets.muzzle.children.length, 1);
  assert.equal(sockets.optic.children.length, 0, 'socket não listado é limpo');
  // duplicata no MESMO socket: segundo é ignorado
  applyAttachments(model.group, ['mira4x', 'gripvertical', 'mira4x']);
  assert.equal(sockets.optic.children.length, 1);
  // Fase 31 — M4 e MP5 têm âncoras próprias (malhas montam na mesma gramática)
  const carbine = createWeaponModel('m4', null);
  const m4Applied = applyAttachments(carbine.group, ['mira4x', 'silenciador', 'gripvertical']);
  assert.equal(m4Applied.length, 3);
  assert.equal(carbine.group.userData.sockets.muzzle.children.length, 1, 'silenciador na boca do M4');
  const smg = createWeaponModel('mp5', null, { attachments: ['magestendida', 'silenciador'] });
  assert.equal(smg.group.userData.sockets.mag.children.length, 1, 'mag estendida na MP5 de fábrica');
  // G19: 3 sockets (sem grip) — grip avulso é ignorado, mira monta
  const pistol = createWeaponModel('g19');
  assert.equal(applyAttachments(pistol.group, ['gripvertical']).length, 0, 'sem socket grip na pistola');
  assert.equal(applyAttachments(pistol.group, ['mira4x']).length, 1);
  // arma sem sockets (sucata): no-op seguro
  const melee = createWeaponModel('sucata');
  assert.equal(applyAttachments(melee.group, ['mira4x']).length, 0);
});

test('F30 · fábrica da arma recebe anexos + estágio mítico (overlay evolutivo)', () => {
  const plain = createWeaponModel('ar47', 'LENDARIO');
  assert.ok(!plain.group.getObjectByName('mythic_fx'), 'sem skin mítica não há overlay');
  const kitted = createWeaponModel('ar47', 'LENDARIO', {
    attachments: ['mira4x', 'silenciador'], mythicStage: 0,
  });
  assert.equal(kitted.group.userData.attachmentIds.length, 2);
  assert.ok(kitted.group.userData.sockets.optic.children.length === 1);
  // mítico: overlay cresce com o estágio (4 = aura + aleta holográfica)
  const stages = [1, 2, 3, 4].map((stage) => createWeaponModel('ar47', 'MITICA', { mythicStage: stage }));
  assert.ok(stages[0].group.getObjectByName('mythic_fx'));
  assert.equal(stages[0].group.userData.mythicStage, 1);
  const fxCount = (g) => g.getObjectByName('mythic_fx').children.length;
  assert.ok(fxCount(stages[1].group) > fxCount(stages[0].group), 'estágio 2 > 1');
  assert.ok(fxCount(stages[3].group) > fxCount(stages[1].group), 'estágio 4 > 2');
  assert.equal(stages[3].group.userData.mythicAura, true, 'aura plena no estágio 4');
  assert.equal(stages[0].group.userData.mythicAura, false);
  // tick do pulso: arma no registry pulsa; órfã sai do registry sem erro
  const g = stages[2].group;
  tickMythicWeapons(1.5);
  assert.ok(g.userData.mythicPulse >= 0);
  unregisterMythic(g);
  tickMythicWeapons(2.5); // não lança
});

test('F30 · loot: anexos avulsos nos pools + anexos de série por raridade', () => {
  for (const [zone, ids] of [['armory', ['mira4x', 'magestendida']], ['industrial', ['silenciador', 'gripvertical']], ['extraction', ['mira4x']]]) {
    const pool = LOOT_POOLS[zone];
    for (const id of ids) assert.ok(pool.some((e) => e.kind === 'attachment' && e.id === id), `${zone}: ${id} ausente`);
  }
  const rng = new SeededRng('f30-pool');
  const rolls = rollLoot(rng, 'armory', 60);
  const att = rolls.find((d) => d.kind === 'attachment');
  assert.ok(att && att.name, 'anexo avulso sai do pool com nome resolvido');
  // anexos de série: lendária sai 1-2, MÍTICA sai completa, outras não —
  // Fase 31: generalizou p/ qualquer arma com sockets (compat respeitado)
  const r2 = new SeededRng('f30-drop');
  const len = attachmentsForDrop(r2, 'ar47', 'LENDARIO');
  assert.ok(Array.isArray(len) && len.length >= 1 && len.length <= 2, `lendária: ${len?.length}`);
  assert.deepEqual(attachmentsForDrop(r2, 'ar47', 'MITICA'), ['mira4x', 'silenciador', 'magestendida', 'gripvertical']);
  assert.equal(attachmentsForDrop(r2, 'ar47', 'RARO'), undefined);
  // M4/MP5 saem kitados na lendária — anexos sempre COMPATÍVEIS com a arma
  const r3 = new SeededRng('f31-drop-m4');
  const m4Kit = attachmentsForDrop(r3, 'm4', 'LENDARIO');
  assert.ok(Array.isArray(m4Kit) && m4Kit.length >= 1 && m4Kit.length <= 2, `M4 lendária kitada: ${m4Kit?.length}`);
  for (const id of m4Kit) assert.ok(ATTACHMENTS[id].compatible.includes('m4'), `${id} incompatível com m4`);
  const mp5Kit = attachmentsForDrop(new SeededRng('f31-drop-mp5'), 'mp5', 'MITICA');
  assert.deepEqual([...mp5Kit].sort(), ['gripvertical', 'magestendida', 'mira4x', 'silenciador']);
  // Barrett nunca recebe mira4x (luneta de série); pistola nunca recebe grip
  for (let i = 0; i < 20; i++) {
    const br = attachmentsForDrop(r3, 'barrett', 'LENDARIO') ?? [];
    assert.ok(!br.includes('mira4x'), 'barrett não sai com mira 4x');
    const gl = attachmentsForDrop(r3, 'g19', 'LENDARIO') ?? [];
    assert.ok(!gl.includes('gripvertical'), 'g19 não sai com foregrip');
  }
  // arma sem sockets: nunca kitada
  assert.equal(attachmentsForDrop(r3, 'pulse', 'LENDARIO'), undefined);
  assert.equal(attachmentsForDrop(r3, 'sucata', 'MITICA'), undefined);
});

// ---------------------------------------------------------------- 3 ----
test('F30 · loot no chão: anexo tem módulo próprio; arma com anexos mostra chips', () => {
  const attMesh = createLootMesh({ kind: 'attachment', id: 'mira4x', name: 'Mira 4x', x: 0, z: 0, y: .55 });
  assert.ok(attMesh.getObjectByName('attachmentChip'), 'módulo de rail visível');
  assert.ok(attMesh.getObjectByName('attachmentSeal'), 'selo emissivo visível');
  const wMesh = createLootMesh({ kind: 'weapon', id: 'ar47', name: 'AR-47', rarity: 'LENDARIO', attachments: ['mira4x', 'silenciador'], x: 0, z: 0, y: .55 });
  assert.equal(wMesh.userData.attachChips, 2, '2 chips = 2 anexos de série');
  assert.ok(wMesh.getObjectByName('attachChip0') && wMesh.getObjectByName('attachChip1'));
});

test('F30 · caixa de morte herda a AR-47 com os anexos (matou, herdou TUDO)', () => {
  const rng = new SeededRng('f30-db');
  const bundle = deathBoxContents(rng, {
    weapon: 'ar47', weaponSkin: 'LENDARIO', attachments: ['mira4x', 'magestendida'],
    ammoId: '7.62', ammoReserve: 30, medkit: 1, frag: 0, gloo: 0, gear: { vest: 2, helmet: 1, pack: 1 },
  });
  const w = bundle.find((i) => i.kind === 'weapon');
  assert.deepEqual(w.attachments, ['mira4x', 'magestendida']);
  const noAtt = deathBoxContents(rng, { weapon: 'm4', weaponSkin: null, attachments: [], ammoId: '5.56', ammoReserve: 0 });
  const w2 = noAtt.find((i) => i.kind === 'weapon');
  assert.equal(w2.attachments, undefined, 'sem anexos não serializa campo');
});

// ---------------------------------------------------------------- 4 ----
test('F30 · sim: AR-47 de série com anexos produz pente alongado (40 → 55)', () => {
  const s = new KhaaosSim3D({ seed: 'F30-MAG', botCount: 0, airdrop: false });
  s.start('belt');
  const p = s.player;
  // loot sintético: AR-47 LENDÁRIA com os 4 anexos de série (gramática do pool)
  s.loot.push({ id: 'ar47', kind: 'weapon', name: 'Fuzil de Assalto AR-47', rarity: 'LENDARIO',
    attachments: ['mira4x', 'silenciador', 'magestendida', 'gripvertical'],
    x: p.x + .4, z: p.z, y: .55, active: true });
  s.step({ ...idle(), interact: true }, STEP);   // E coleta o item mais próximo
  assert.equal(p.weapon, 'ar47');
  assert.deepEqual(p.weaponAttachments, ['mira4x', 'silenciador', 'magestendida', 'gripvertical']);
  assert.equal(p.attachStats.magBonus, 15);
  assert.equal(p.attachStats.silenced, true);
  // recarga enche ATÉ 55 (pente estendido) com reserva suficiente
  p.inventory.ammo['7.62'] = 120;
  p.ammoMag = 0;
  s.step({ ...idle(), reload: true }, STEP);
  assert.ok(p.reloadT > 0, 'recarga disparou');
  for (let i = 0; i < 200 && p.reloadT > 0; i++) s.step(idle(), STEP);
  assert.equal(p.ammoMag, 55, `pente estendido deveria encher 55 (veio ${p.ammoMag})`);
});

test('F30/31 · sim: anexo avulso instala na arma em mão; anexos seguem o jogador', () => {
  const s = new KhaaosSim3D({ seed: 'F30-ATT', botCount: 0, airdrop: false });
  s.start('belt');
  const p = s.player;
  // AR-47 nua via loot sintético (mesma gramática do #interact)
  s.loot.push({ id: 'ar47', kind: 'weapon', name: 'Fuzil de Assalto AR-47', rarity: 'RARO',
    x: p.x + .4, z: p.z, y: .55, active: true });
  s.step({ ...idle(), interact: true }, STEP);
  assert.equal(p.weapon, 'ar47');
  assert.deepEqual(p.weaponAttachments, []);
  // anexo avulso no chão: E instala no socket livre
  s.loot.push({ id: 'magestendida', kind: 'attachment', name: 'Mag Estendida', x: p.x + .4, z: p.z, y: .55, active: true });
  s.step({ ...idle(), interact: true }, STEP);
  assert.deepEqual(p.weaponAttachments, ['magestendida'], 'anexo instalado na arma em mão');
  assert.equal(p.attachStats.magBonus, 15);
  // troca p/ a MP5: anexo COMPATÍVEL segue o jogador e re-instala na SMG
  // (Fase 31 — anexos universais; magBonus escala pela classe: SMG +12)
  p.slots[2] = 'mp5';
  p.inventory.ammo['9MM'] = 45;
  assert.equal(s.switchSlot(2), true);
  assert.deepEqual(p.weaponAttachments, ['magestendida'], 'anexo compatível re-instala na MP5');
  assert.equal(p.attachStats.magBonus, 12, 'pente estendido na SMG: +12');
  // grip também é compatível com a MP5 — instala no 4º socket
  s.loot.length = 0;
  s.loot.push({ id: 'gripvertical', kind: 'attachment', name: 'Empunhadura Vertical', x: p.x + .4, z: p.z, y: .55, active: true });
  s.step({ ...idle(), interact: true }, STEP);
  assert.deepEqual(p.weaponAttachments, ['magestendida', 'gripvertical'], 'grip instala na MP5');
  assert.equal(p.attachStats.spreadMul, .8);
  // troca p/ a PISTOLA: mag segue (+8), grip INCOMPATÍVEL fica no bolso
  p.slots[3] = 'g19';
  assert.equal(s.switchSlot(3), true);
  assert.equal(p.weapon, 'g19');
  assert.deepEqual(p.weaponAttachments, ['magestendida'], 'mag estendida serve na pistola');
  assert.equal(p.attachStats.magBonus, 8, 'pente estendido na pistola: +8');
  assert.deepEqual(p.attachmentBag, ['gripvertical'], 'grip aguarda um rifle');
  assert.equal(p.attachStats.spreadMul, 1, 'grip não afeta a pistola');
  // de volta à AR-47: bolso re-instala automaticamente
  assert.equal(s.switchSlot(1), true);
  assert.equal(p.weapon, 'ar47');
  assert.deepEqual([...p.weaponAttachments].sort(), ['gripvertical', 'magestendida'], 'bolso → sockets ao voltar para a AR-47');
  assert.equal(p.attachStats.spreadMul, .8, 'grip volta a aplicar -20% de dispersão');
});

test('F31 · sim: M4 de série com mag estendida enche 45; pistola escala +8', () => {
  const s = new KhaaosSim3D({ seed: 'F31-M4MAG', botCount: 0, airdrop: false });
  s.start('belt');
  const p = s.player;
  s.loot.length = 0;  // isolamento: só o loot sintético existe no mundo
  s.loot.push({ id: 'm4', kind: 'weapon', name: 'Fuzil de Assalto M4', rarity: 'LENDARIO',
    attachments: ['magestendida', 'silenciador'], x: p.x + .4, z: p.z, y: .55, active: true });
  s.step({ ...idle(), interact: true }, STEP);
  assert.equal(p.weapon, 'm4');
  assert.deepEqual(p.weaponAttachments, ['magestendida', 'silenciador']);
  assert.equal(p.attachStats.silenced, true, 'M4 silenciada de série');
  p.inventory.ammo['5.56'] = 120;
  p.ammoMag = 0;
  s.step({ ...idle(), reload: true }, STEP);
  for (let i = 0; i < 200 && p.reloadT > 0; i++) s.step(idle(), STEP);
  assert.equal(p.ammoMag, 45, `M4 estendida deveria encher 45 (veio ${p.ammoMag})`);
  // pistola: +8 (15 → 23)
  s.loot.length = 0;
  s.loot.push({ id: 'g19', kind: 'weapon', name: 'Pistola 9MM', rarity: 'LENDARIO',
    attachments: ['magestendida'], x: p.x + .4, z: p.z, y: .55, active: true });
  s.step({ ...idle(), interact: true }, STEP);
  assert.equal(p.weapon, 'g19');
  p.inventory.ammo['9MM'] = 60;
  p.ammoMag = 0;
  s.step({ ...idle(), reload: true }, STEP);
  for (let i = 0; i < 200 && p.reloadT > 0; i++) s.step(idle(), STEP);
  assert.equal(p.ammoMag, 23, `pistola estendida deveria encher 23 (veio ${p.ammoMag})`);
});

test('F30 · sim: abate com a skin MÍTICA evolui o estágio e emite evento', () => {
  const s = new KhaaosSim3D({ seed: 'F30-MIT', botCount: 1, airdrop: false });
  s.start('belt');
  const p = s.player, bot = s.bots[0];
  s.world.colliders.length = 0; s.doors.length = 0;
  s.physicsWorld.colliders = s.world.colliders;
  // arma mítica em mão (via pickup direto do catálogo — mesma gramática FF)
  p.weapon = 'ar47'; p.weaponSkin = 'MITICA'; p.mythicKills = 0; p.mythicStage = 1;
  p.ammoMag = 55; p.attachStats = { magBonus: 15, spreadMul: 1, adsZoom: 1, rangeMul: 1, silenced: false };
  let events = [];
  for (let k = 1; k <= 6; k++) {
    // 6 abates: derruba o bot e "ressuscita" um novo alvo na mesma posição
    bot.x = 0; bot.z = -10; bot.y = 0; bot.alive = true; bot.knocked = false; bot.life = 1;
    bot.armor = 0;
    p.x = 0; p.z = 0; p.yaw = 0;
    let killed = false;
    for (let i = 0; i < 30 * 6 && !killed; i++) {
      const yaw = Math.atan2(-(bot.x - p.x), -(bot.z - p.z));
      const pitch = Math.atan2((bot.y + 1.1) - (p.y + 1.55), Math.hypot(bot.x - p.x, bot.z - p.z));
      s.step({ ...idle(yaw, pitch), fire: true }, STEP);
      killed = !bot.alive;
    }
    assert.ok(killed, `abate ${k} deveria concluir`);
    events = events.concat(s.consumeEvents().filter((e) => e.type === 'mythic'));
  }
  assert.equal(p.mythicKills, 6);
  assert.equal(p.mythicStage, 4, '6 abates = estágio final');
  const stages = events.map((e) => e.stage);
  assert.ok(stages.includes(2) && stages.includes(3) && stages.includes(4), `eventos de evolução: ${stages}`);
  assert.ok(events.every((e) => MYTHIC_STAGE_NAMES.includes(e.name)));
});
