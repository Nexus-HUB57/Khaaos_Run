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
  MYTHIC_SKINS, mythicSkinFor, ATTACHMENT_RARITY_TREATMENTS, attachmentRarityFor,
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

// ==================================================== Fase 32 ============
// SKINS MÍTICAS POR ARMA + ANEXOS POR RARIDADE (visual gasto→dourado)

test('F32 · catálogo mítico cobre o arsenal com sockets; identidade própria por arma', () => {
  for (const wid of ['ar47', 'm4', 'mp5', 'barrett', 'g19']) {
    const def = mythicSkinFor(wid);
    assert.ok(def, `${wid}: skin mítica ausente`);
    assert.equal(def.id, 'MITICA');
    assert.equal(def.stages, 4);
    assert.ok(/^#[0-9a-f]{6}$/i.test(def.aura), `aura hex: ${def.aura}`);
    assert.ok(def.fit && def.fit.scale > 0, `${wid}: fit presente`);
  }
  // auras únicas — leitura de identidade à distância
  const auras = Object.values(MYTHIC_SKINS).map((d) => d.aura);
  assert.equal(new Set(auras).size, auras.length, 'auras devem ser únicas');
  // Fase 34 — catálogo cobre TODO o arsenal: sucata/pulse (sem sockets) têm skin
  assert.ok(mythicSkinFor('sucata'), 'F34: sucata entrou no grind mítico');
  assert.ok(mythicSkinFor('pulse'), 'F34: pulse entrou no grind mítico');
  // alias legado intacto (F30) + fit por silhueta (pistola menor, sniper maior)
  assert.equal(MYTHIC_SKIN, MYTHIC_SKINS.ar47);
  assert.equal(MYTHIC_SKINS.ar47.name, 'AR-47 · Fúria Primordial');
  assert.ok(MYTHIC_SKINS.g19.fit.scale < MYTHIC_SKINS.ar47.fit.scale);
  assert.ok(MYTHIC_SKINS.barrett.fit.scale > MYTHIC_SKINS.ar47.fit.scale);
});

test('F32 · overlay mítico respeita o fit por arma e a cor da aura (fábrica → overlay)', () => {
  for (const [wid, def] of Object.entries(MYTHIC_SKINS)) {
    const { group } = createWeaponModel(wid, 'MITICA', { mythicStage: 4 });
    const fx = group.getObjectByName('mythic_fx');
    assert.ok(fx, `${wid}: overlay mítico ausente`);
    assert.equal(group.userData.mythicStage, 4);
    assert.ok(Math.abs(fx.scale.x - def.fit.scale) < 1e-6, `${wid}: fit.scale aplicado`);
    assert.ok(Math.abs(fx.position.z - def.fit.z) < 1e-6, `${wid}: fit.z aplicado`);
    const rune = fx.children.find((c) => c.material?.name === 'mythicRune');
    assert.ok(rune, `${wid}: runa presente`);
    assert.equal(rune.material.color.getHexString(), def.aura.slice(1).toLowerCase(), `${wid}: aura da skin própria`);
    unregisterMythic(group);
  }
});

test('F32 · anexo por raridade: acabamento gasto→dourado + chip de raridade', () => {
  const treatments = ATTACHMENT_RARITY_TREATMENTS;
  assert.equal(Object.keys(treatments).length, 5);
  // os 4 anexos aceitam as 5 raridades — malha sempre completa com chip
  for (const id of Object.keys(ATTACHMENTS)) {
    for (const rarity of Object.keys(treatments)) {
      const m = buildAttachmentMesh(id, { rarity });
      assert.equal(m.userData.rarity, rarity);
      assert.ok(m.getObjectByName('rarityChip'), `${id}/${rarity}: chip ausente`);
    }
  }
  const worn = buildAttachmentMesh('mira4x', { rarity: 'COMUM' });
  const gold = buildAttachmentMesh('mira4x', { rarity: 'MITICA' });
  const std = buildAttachmentMesh('mira4x', { rarity: 'INCOMUM' });
  assert.equal(buildAttachmentMesh('mira4x', { rarity: 'BOGUS' }).userData.rarity, 'INCOMUM');
  // COMUM GASTO: material fosco/escurecido + risco de desgaste extra
  const tubeWorn = worn.children[0];
  assert.ok(tubeWorn.material.roughness > .8, `gasto é fosco (${tubeWorn.material.roughness})`);
  assert.ok(worn.children.length > std.children.length, 'gasto carrega detalhe de desgaste');
  // MITICA DOURADA: corpo polido + chip brilhando mais que o do gasto
  const tubeGold = gold.children[0];
  assert.ok(tubeGold.material.metalness > .9, `mítica é metal polido (${tubeGold.material.metalness})`);
  const chipWorn = worn.getObjectByName('rarityChip');
  const chipGold = gold.getObjectByName('rarityChip');
  assert.ok(chipGold.material.emissiveIntensity > chipWorn.material.emissiveIntensity, 'chip mítico brilha mais');
  // escalada de metal por tier (RARO < LENDARIO < MITICA)
  assert.ok(treatments.RARO.metal < treatments.LENDARIO.metal);
  assert.ok(treatments.LENDARIO.metal < treatments.MITICA.metal);
});

test('F32 · attachmentRarityFor resolve mapa/array/string/null (PURO)', () => {
  assert.equal(attachmentRarityFor(null, 'mira4x'), 'INCOMUM');
  assert.equal(attachmentRarityFor(undefined, 'mira4x'), 'INCOMUM');
  assert.equal(attachmentRarityFor('LENDARIO', 'mira4x'), 'LENDARIO');
  assert.equal(attachmentRarityFor('BOGUS', 'mira4x'), 'INCOMUM');
  assert.equal(attachmentRarityFor(['RARO', 'MITICA'], 'magestendida', 1), 'MITICA');
  assert.equal(attachmentRarityFor(['RARO', 'MITICA'], 'magestendida', 9), 'INCOMUM');
  assert.equal(attachmentRarityFor({ silenciador: 'COMUM' }, 'silenciador'), 'COMUM');
  assert.equal(attachmentRarityFor({ silenciador: 'COMUM' }, 'mira4x'), 'INCOMUM');
});

test('F32 · applyAttachments monta raridades (array/mapa) nos sockets; sem raridades = INCOMUM', () => {
  const g1 = createWeaponModel('m4', null, {}).group;
  const applied = applyAttachments(g1, ['mira4x', 'silenciador'], ['COMUM', 'MITICA']);
  assert.equal(applied.length, 2);
  assert.equal(g1.userData.sockets.optic.children[0].userData.rarity, 'COMUM');
  assert.equal(g1.userData.sockets.muzzle.children[0].userData.rarity, 'MITICA');
  const g2 = createWeaponModel('ar47', null, {}).group;
  applyAttachments(g2, ['gripvertical', 'magestendida'], { gripvertical: 'RARO', magestendida: 'LENDARIO' });
  assert.equal(g2.userData.sockets.grip.children[0].userData.rarity, 'RARO');
  assert.equal(g2.userData.sockets.mag.children[0].userData.rarity, 'LENDARIO');
  const g3 = createWeaponModel('mp5', null, {}).group;
  applyAttachments(g3, ['mira4x']);
  assert.equal(g3.userData.sockets.optic.children[0].userData.rarity, 'INCOMUM');
});

test('F32 · sim: skin MÍTICA da M4 evolui por abate (evento carrega a arma)', () => {
  const s = new KhaaosSim3D({ seed: 'F32-MIT-M4', botCount: 1, airdrop: false });
  s.start('belt');
  const p = s.player, bot = s.bots[0];
  s.world.colliders.length = 0; s.doors.length = 0;
  s.physicsWorld.colliders = s.world.colliders;
  p.weapon = 'm4'; p.weaponSkin = 'MITICA'; p.mythicKills = 0; p.mythicStage = 1;
  p.ammoMag = 45; p.attachStats = { magBonus: 15, spreadMul: 1, adsZoom: 1, rangeMul: 1, silenced: false };
  const events = [];
  for (let k = 1; k <= 2; k++) {
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
    events.push(...s.consumeEvents().filter((e) => e.type === 'mythic'));
  }
  assert.equal(p.mythicKills, 2);
  assert.equal(p.mythicStage, 2, '2 abates = estágio 2 (mesma régua da AR-47)');
  assert.equal(events.length, 1);
  assert.equal(events[0].weapon, 'm4', 'evento identifica a arma mítica');
  assert.equal(events[0].stage, 2);
});

test('F32 · sim: kit de arma MÍTICA nasce dourado; troca/bolso/caixa preservam raridades', () => {
  const s = new KhaaosSim3D({ seed: 'F32-RAR', botCount: 0, airdrop: false });
  s.start('belt');
  const p = s.player;
  s.loot.length = 0; // isolamento: só o loot sintético existe no mundo
  s.loot.push({ id: 'm4', kind: 'weapon', name: 'Fuzil M4', rarity: 'MITICA',
    attachments: ['mira4x', 'silenciador'], x: p.x + .4, z: p.z, y: .55, active: true });
  s.step({ ...idle(), interact: true }, STEP);
  assert.equal(p.weapon, 'm4');
  assert.equal(p.mythicStage, 1, 'mítica da M4 começa no estágio 1');
  assert.deepEqual(p.attachmentRarities, ['MITICA', 'MITICA'], 'kit de arma mítica nasce dourado');
  // troca de slot: g19 é compatível com mira4x/silenciador → o bolso
  // REINSTALA na hora (comportamento F30 "bolso preenche sockets livres"),
  // e as raridades viajam em paralelo na reinstalação
  s.loot.length = 0;
  s.loot.push({ id: 'g19', kind: 'weapon', name: 'Pistola', rarity: 'COMUM', x: p.x + .4, z: p.z, y: .55, active: true });
  s.step({ ...idle(), interact: true }, STEP);
  assert.equal(p.weapon, 'g19');
  assert.deepEqual(p.weaponAttachments, ['mira4x', 'silenciador'], 'bolso reinstala em arma compatível');
  assert.deepEqual(p.attachmentRarities, ['MITICA', 'MITICA'], 'raridades preservadas na reinstalação');
  assert.deepEqual(p.attachmentBag, []);
  assert.equal(p.mythicStage, 0, 'evolução pertence à instância coletada (g19 não-mítica)');
  // anexo avulso com raridade própria (loot rolou a tier) — mag da g19 livre
  s.loot.length = 0;
  s.loot.push({ id: 'magestendida', kind: 'attachment', name: 'Mag Estendida', rarity: 'RARO', x: p.x + .4, z: p.z, y: .55, active: true });
  s.step({ ...idle(), interact: true }, STEP);
  assert.deepEqual(p.weaponAttachments, ['mira4x', 'silenciador', 'magestendida']);
  assert.deepEqual(p.attachmentRarities, ['MITICA', 'MITICA', 'RARO']);
  // grip vertical NÃO é compatível com pistola → vai para o BOLSO com tier
  s.loot.length = 0;
  s.loot.push({ id: 'gripvertical', kind: 'attachment', name: 'Empunhadura Vertical', rarity: 'LENDARIO', x: p.x + .4, z: p.z, y: .55, active: true });
  s.step({ ...idle(), interact: true }, STEP);
  assert.deepEqual(p.weaponAttachments, ['mira4x', 'silenciador', 'magestendida']);
  assert.deepEqual(p.attachmentBag, ['gripvertical']);
  assert.deepEqual(p.attachmentBagRarities, ['LENDARIO']);
  // volta pra M4 (nova coleta): anexos em mão vão ao bolso e o bolso inteiro
  // reinstala — raridades paralelas preservadas ponta a ponta
  s.loot.length = 0;
  s.loot.push({ id: 'm4', kind: 'weapon', name: 'Fuzil M4', rarity: 'COMUM', x: p.x + .4, z: p.z, y: .55, active: true });
  s.step({ ...idle(), interact: true }, STEP);
  assert.equal(p.weapon, 'm4');
  const rarMap = Object.fromEntries(p.weaponAttachments.map((a, i) => [a, p.attachmentRarities[i]]));
  assert.deepEqual(p.weaponAttachments.sort(), ['gripvertical', 'magestendida', 'mira4x', 'silenciador'].sort(), 'bolso reinstalla tudo na M4');
  assert.equal(rarMap.mira4x, 'MITICA', 'raridade preservada na reinstalação');
  assert.equal(rarMap.gripvertical, 'LENDARIO');
  assert.equal(rarMap.magestendida, 'RARO');
  assert.deepEqual(p.attachmentBag, [], 'bolso esvazia ao reinstalar');
  // caixa de morte herda anexos E raridades em paralelo (matou, herdou TUDO)
  const items = deathBoxContents(s.rng, {
    weapon: 'ar47', weaponSkin: 'LENDARIO', attachments: ['mira4x', 'silenciador'],
    attachmentRarities: ['RARO', 'COMUM'], ammoId: '7.62', ammoReserve: 30,
  });
  const wb = items.find((i) => i.kind === 'weapon');
  assert.deepEqual(wb.attachments, ['mira4x', 'silenciador']);
  assert.deepEqual(wb.attachmentRarities, ['RARO', 'COMUM']);
});

test('F32 · loot: anexo avulso nasce com raridade válida da tabela central', () => {
  const rng = new SeededRng('F32-LOOT');
  let saw = 0;
  for (let i = 0; i < 60; i++) {
    for (const d of rollLoot(rng, 'armory', 12)) {
      if (d.kind === 'attachment') {
        assert.ok(RARITIES[d.rarity], `raridade válida: ${d.rarity}`);
        saw++;
      }
    }
  }
  assert.ok(saw > 0, 'anexos avulsos aparecem no pool com raridade');
});

// ======================================================= Fase 34 ==========
// Arsenal COMPLETO no grind mítico (sucata/pulse sem sockets) + piso do
// General no rollLoot (pulse nunca abaixo de LENDARIO, mas pode nascer MÍTICO).

test('F34 · catálogo mítico cobre TODO o arsenal — sucata e pulse (sem sockets)', () => {
  assert.deepEqual(Object.keys(MYTHIC_SKINS).sort(),
    ['ar47', 'barrett', 'g19', 'm4', 'mp5', 'pulse', 'sucata']);
  const suc = mythicSkinFor('sucata');
  assert.equal(suc.name, 'Sucata · Coroa de Ferro-Velho');
  assert.equal(suc.aura, '#ff8c1a', 'âmbar-ferrugem — forno de ferro-velho');
  assert.equal(suc.stages, 4, 'mesma régua de 4 estágios');
  assert.ok(suc.fit.scale > 1, 'lança longa pede overlay maior');
  const pul = mythicSkinFor('pulse');
  assert.equal(pul.name, 'Pulse · Prisma Soberano');
  assert.equal(pul.aura, '#ffe14d', 'ouro-arco — energia do General');
  assert.equal(pul.stages, 4);
  // 7 identidades visuais — nenhuma aura repetida
  const auras = Object.values(MYTHIC_SKINS).map((d) => d.aura);
  assert.equal(new Set(auras).size, 7, '7 auras únicas no catálogo');
});

test('F34 · overlay mítico assenta sucata e pulse com fit próprio (estágio 4)', () => {
  for (const wid of ['sucata', 'pulse']) {
    const def = mythicSkinFor(wid);
    const { group } = createWeaponModel(wid, 'MITICA', { mythicStage: 4 });
    const fx = group.getObjectByName('mythic_fx');
    assert.ok(fx, `${wid}: overlay mítico ausente`);
    assert.equal(group.userData.mythicStage, 4);
    assert.ok(Math.abs(fx.scale.x - def.fit.scale) < 1e-6, `${wid}: fit.scale aplicado`);
    assert.ok(Math.abs(fx.position.z - def.fit.z) < 1e-6, `${wid}: fit.z aplicado`);
    const rune = fx.children.find((c) => c.material?.name === 'mythicRune');
    assert.ok(rune, `${wid}: runa presente`);
    assert.equal(rune.material.color.getHexString(), def.aura.slice(1).toLowerCase(), `${wid}: aura própria`);
    const fin = fx.children.find((c) => c.name === 'mythicFin');
    assert.ok(fin, `${wid}: aleta holográfica do estágio 4`);
    unregisterMythic(group);
  }
});

test('F34 · rollLoot: pulse pode nascer MÍTICO e o piso LENDARIO se mantém', () => {
  // rng roteirizado: 1º next() escolhe o drop (banda do pulse no armory),
  // 2º next() rola a raridade — determinístico byte a byte.
  const scripted = (a, b) => { let i = 0; return { next() { return (i++ === 0 ? a : b); } }; };
  const mit = rollLoot(scripted(0.64, 0.995), 'armory')[0];
  assert.equal(mit.id, 'pulse');
  assert.equal(mit.rarity, 'MITICA', 'MITICA atravessa o piso do General');
  assert.equal(mit.weapon.damage, Math.round(48 * 1.75), 'multiplicador mítico aplicado');
  const len = rollLoot(scripted(0.64, 0.5), 'armory')[0];
  assert.equal(len.id, 'pulse');
  assert.equal(len.rarity, 'LENDARIO', 'rolagem baixa sobe para LENDARIO (piso)');
  // 600 rolagens semeadas: pulse só sai LENDARIO ou MITICA — nunca abaixo
  const rng = new SeededRng('F34-PULSE-FLOOR');
  let saw = 0;
  for (let i = 0; i < 600; i++) {
    for (const drop of rollLoot(rng, 'armory')) {
      if (drop.id === 'pulse') {
        saw++;
        assert.ok(['LENDARIO', 'MITICA'].includes(drop.rarity), `pulse saiu ${drop.rarity}`);
      }
    }
  }
  assert.ok(saw > 0, 'pulse aparece no pool do armory');
});

test('F34 · sucata rola a tabela completa (COMUM..MÍTICA, sem piso artificial)', () => {
  const rng = new SeededRng('F34-SUCATA');
  const seen = new Set();
  for (let i = 0; i < 800; i++) {
    for (const drop of rollLoot(rng, 'park')) {
      if (drop.id === 'sucata') {
        seen.add(drop.rarity);
        assert.ok(drop.rarity in RARITIES, `raridade válida: ${drop.rarity}`);
      }
    }
  }
  assert.ok(seen.size >= 3, `sucata amostra várias raridades (${[...seen].join(',')})`);
});

test('F34 · sim: pulse MÍTICO em mãos evolui por abate (Prisma Soberano)', () => {
  const s = new KhaaosSim3D({ seed: 'F34-MIT-PULSE', botCount: 1, airdrop: false });
  s.start('belt');
  const p = s.player, bot = s.bots[0];
  s.world.colliders.length = 0; s.doors.length = 0;
  s.physicsWorld.colliders = s.world.colliders;
  p.weapon = 'pulse'; p.weaponSkin = 'MITICA'; p.mythicKills = 0; p.mythicStage = 1;
  p.ammoMag = 24; p.attachStats = { magBonus: 0, spreadMul: 1, adsZoom: 1, rangeMul: 1, silenced: false };
  const events = [];
  for (let k = 1; k <= 2; k++) {
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
    events.push(...s.consumeEvents().filter((e) => e.type === 'mythic'));
  }
  assert.equal(p.mythicKills, 2);
  assert.equal(p.mythicStage, 2, '2 abates = estágio 2 (mesma régua do arsenal)');
  assert.equal(events.length, 1);
  assert.equal(events[0].weapon, 'pulse', 'evento identifica o Prisma Soberano');
  assert.equal(events[0].stage, 2);
});
