// ============================================================================
// Fase 32 — ECONOMIA DE SOBREVIVÊNCIA DOS BOTS: coleta de loot, cura e
// utilitários (frag/gloo). Fecha o gap descoberto empiricamente: a F25 fazia
// a patrulha mirar pontos de loot, mas a coleta (#interact) era exclusiva do
// input do JOGADOR — o bot chegava ao chão de loot, não pegava NADA e lutava
// com o loadout do spawn até morrer; medkit/frag/gloo do spawn nunca usados.
//
// Contratos pinados:
//  1. bot em patrol/hunt é ATRAÍDO pelo item vivo mais próximo que vale a pena
//     (sense 9 m) e COLETA por proximidade (2,6 m — mesmo alcance do #interact);
//  2. arma só entra se for UPGRADE de dano (anti-rebaixamento — regra do
//     #grantBundle); item pior segue no chão para quem quiser;
//  3. consumível/frag/gloo sobem o inventário pelos mesmos caminhos do jogador;
//  4. bot ferido (< 45) se CURA fora de combate pelo MESMO #useMedkit;
//  5. bot em engage joga FRAG na banda útil (8-30 m) com cadência humana;
//  6. bot ferido em engage arma GLOO (defesa — parede à frente);
//  7. ENGAGE vence loot: em combate o bot não busca item (só coleta se passar
//     por cima — atração é exclusiva de patrol/hunt);
//  8. paridade 1:1 com a trilha autoritativa (MatchRoom3D);
//  9. determinismo do spawn PRESERVADO (rng order intacto com inventário novo);
// 10. loot interior da sim preserva o id de catálogo em weaponId (contrato
//     room3d — conserta coleta que caía no fallback g19).
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { KhaaosSim3D, DEFAULT_INPUT, BOT_SURVIVAL, WEAPONS3D, rayAabb, windowPaneOnSegment } from '../src/game3d/sim3d.js';
import { MatchRoom3D } from '../server/room3d.js';

const DT = 1 / 30;
const input = (o = {}) => ({ ...DEFAULT_INPUT, ...o });

// mundo silencioso: desativa TODO o loot nativo — a sonda controla o que existe
function quietSim(seed) {
  const sim = new KhaaosSim3D({ seed, botCount: 1, scenarioId: 'CIGKV', airdrop: false, spectate: true });
  sim.started = true;
  for (const it of sim.loot) it.active = false;
  return sim;
}

// linha livre de colliders sólidos (janela não bloqueia — vidro é transparente)
function clearPath(sim, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz) || 1e-9;
  for (const c of sim.physicsWorld.colliders) {
    if (c.noBlock || c.kind === 'window') continue;
    if (rayAabb(ax, 1.0, az, dx / len, 0, dz / len, c, len)) return false;
    if (rayAabb(ax, 1.6, az, dx / len, 0, dz / len, c, len)) return false;
  }
  return true;
}

// jogador longe (fora do BOT_SIGHT 85 m): bot não engaja, cura permitida
function playerFar(sim) {
  sim.player.x = sim.bots[0].x + 120; sim.player.z = sim.bots[0].z;
}

// ---------------------------------------------------------------------------
// 1. COLETA — atração + pickup por proximidade
// ---------------------------------------------------------------------------

test('fase32 sim: bot em patrol COLETA arma melhor (upgrade de dano)', () => {
  const sim = quietSim('F32-PICKUP');
  const bot = sim.bots[0];
  bot.weapon = 'g19'; bot.slots[1] = 'g19';
  playerFar(sim);
  const item = { id: 'test-ak', kind: 'weapon', weaponId: 'ar47', name: 'AR-47', rarity: 'RARO', x: bot.x + 1.2, y: 0.55, z: bot.z, active: true };
  sim.loot.push(item);
  let lootEvent = null;
  for (let i = 0; i < 30 && !lootEvent; i++) {
    sim.step(input(), DT);
    lootEvent = sim.consumeEvents().find((e) => e.type === 'loot' && e.kind === 'weapon');
  }
  assert.equal(bot.weapon, 'ar47', 'arma trocada pelo upgrade (22 → 36 dmg)');
  assert.equal(bot.slots[1], 'ar47', 'slot atualizado (inventário de bot completo)');
  assert.equal(item.active, false, 'item consumido');
  assert.ok(lootEvent, 'evento loot kind weapon emitido');
});

test('fase32 sim: bot NÃO rebaixa a arma (item pior segue no chão)', () => {
  const sim = quietSim('F32-DOWNGRADE');
  const bot = sim.bots[0];
  bot.weapon = 'ar47'; bot.slots[1] = 'ar47';
  playerFar(sim);
  const item = { id: 'test-g19', kind: 'weapon', weaponId: 'g19', name: 'Pistola 9MM', rarity: 'COMUM', x: bot.x + 1.0, y: 0.55, z: bot.z, active: true };
  sim.loot.push(item);
  for (let i = 0; i < 45; i++) { sim.step(input(), DT); sim.consumeEvents(); }
  assert.equal(bot.weapon, 'ar47', 'arma mantida (anti-rebaixamento)');
  assert.equal(item.active, true, 'item NÃO consumido (fica para quem quiser)');
});

test('fase32 sim: bot coleta consumível e frag (inventário sobe pelos mesmos caminhos)', () => {
  const sim = quietSim('F32-CONSUM');
  const bot = sim.bots[0];
  bot.inventory.medkit = 0; bot.inventory.frag = 0;
  playerFar(sim);
  sim.loot.push({ id: 'test-med', kind: 'consumable', name: 'Kit Médico', x: bot.x + 1.0, y: 0.55, z: bot.z, active: true });
  sim.loot.push({ id: 'test-frag', kind: 'frag', name: 'Granada FRAG', x: bot.x + 1.8, y: 0.55, z: bot.z + 0.4, active: true });
  for (let i = 0; i < 90 && (bot.inventory.medkit < 1 || bot.inventory.frag < 1); i++) {
    sim.step(input(), DT); sim.consumeEvents();
  }
  assert.ok(bot.inventory.medkit >= 1, 'medkit coletado');
  assert.ok(bot.inventory.frag >= 1, 'frag coletado');
});

// ---------------------------------------------------------------------------
// 2. CURA — #useMedkit fora de combate
// ---------------------------------------------------------------------------

test('fase32 sim: bot ferido se CURA fora de combate (mesmo #useMedkit do jogador)', () => {
  const sim = quietSim('F32-HEAL');
  const bot = sim.bots[0];
  bot.life = 30; // ferido, kit do spawn disponível
  playerFar(sim);
  let medEvent = null;
  for (let i = 0; i < 30 && !medEvent; i++) {
    sim.step(input(), DT);
    medEvent = sim.consumeEvents().find((e) => e.type === 'medkit');
  }
  assert.ok(bot.life >= 60, `vida pós-cura (${bot.life} = 30 + 30)`);
  assert.equal(bot.inventory.medkit, 0, 'kit consumido');
  assert.ok(medEvent, 'evento medkit emitido');
});

test('fase32 sim: bot ferido COM inimigo à vista NÃO cura (cura sob fogo é do jogador)', () => {
  const sim = quietSim('F32-NOHEAL');
  const bot = sim.bots[0];
  sim.player.x = bot.x + 15; sim.player.z = bot.z;
  assert.ok(clearPath(sim, bot.x, bot.z, sim.player.x, sim.player.z), 'cenário com LOS limpa');
  assert.equal(windowPaneOnSegment(bot.x, 1.6, bot.z, sim.player.x, 1.6, sim.player.z, sim.windows), null, 'sem vão de vidro no caminho');
  bot.life = 30;
  for (let i = 0; i < 90; i++) { sim.step(input(), DT); sim.consumeEvents(); }
  assert.equal(bot.inventory.medkit, 1, 'kit INTACTO — engajado não cura');
});

// ---------------------------------------------------------------------------
// 3. UTILITÁRIOS — frag e gloo no engajamento
// ---------------------------------------------------------------------------

test('fase32 sim: bot em engage joga FRAG na banda útil (cadência humana)', () => {
  const sim = quietSim('F32-FRAG');
  const bot = sim.bots[0];
  sim.player.x = bot.x + 15; sim.player.z = bot.z; // dentro de [8, 30] m
  assert.ok(clearPath(sim, bot.x, bot.z, sim.player.x, sim.player.z), 'cenário com LOS limpa');
  assert.equal(windowPaneOnSegment(bot.x, 1.6, bot.z, sim.player.x, 1.6, sim.player.z, sim.windows), null, 'sem vão de vidro no caminho');
  sim.player.life = 10000; // alvo de treino não morre (o foco é o arremesso)
  bot.inventory.frag = 1; bot.ai.fragCd = 0;
  let thrown = false;
  for (let i = 0; i < 240 && !thrown; i++) {
    sim.step(input(), DT);
    thrown = sim.grenades.length > 0;
    sim.consumeEvents();
  }
  assert.ok(thrown, 'frag em voo');
  assert.equal(bot.inventory.frag, 0, 'frag consumido');
});

test('fase32 sim: bot ferido em engage arma GLOO (defesa — parede à frente)', () => {
  const sim = quietSim('F32-GLOO');
  const bot = sim.bots[0];
  sim.player.x = bot.x + 12; sim.player.z = bot.z;
  assert.ok(clearPath(sim, bot.x, bot.z, sim.player.x, sim.player.z), 'cenário com LOS limpa');
  assert.equal(windowPaneOnSegment(bot.x, 1.6, bot.z, sim.player.x, 1.6, sim.player.z, sim.windows), null, 'sem vão de vidro no caminho');
  sim.player.life = 10000;
  bot.life = 40; bot.inventory.gloo = 1; bot.inventory.frag = 0; bot.ai.glooCd = 0;
  let deployed = false;
  for (let i = 0; i < 240 && !deployed; i++) {
    sim.step(input(), DT);
    deployed = sim.walls.length > 0;
    sim.consumeEvents();
  }
  assert.ok(deployed, 'gloo wall ativa no mundo');
  assert.equal(bot.inventory.gloo, 0, 'gloo consumido');
});

// ---------------------------------------------------------------------------
// 4. PRIORIDADE — combate vence loot
// ---------------------------------------------------------------------------

test('fase32 sim: ENGAGE vence loot — bot em combate não busca item (sense 9 m)', () => {
  const sim = quietSim('F32-ENGAGE-LOOT');
  const bot = sim.bots[0];
  sim.player.x = bot.x + 15; sim.player.z = bot.z;
  assert.ok(clearPath(sim, bot.x, bot.z, sim.player.x, sim.player.z), 'cenário com LOS limpa');
  sim.player.life = 10000; // engajamento sustentado (alvo de treino)
  bot.weapon = 'g19'; bot.slots[1] = 'g19';
  // upgrade DENTRO do sense, colado no alvo: coletar exigiria chegar ao alvo
  const item = { id: 'test-ak', kind: 'weapon', weaponId: 'ar47', name: 'AR-47', rarity: 'RARO', x: sim.player.x, y: 0.55, z: sim.player.z, active: true };
  sim.loot.push(item);
  for (let i = 0; i < 90; i++) { sim.step(input(), DT); sim.consumeEvents(); }
  assert.equal(item.active, true, 'item segue ativo (atração é exclusiva de patrol/hunt)');
  assert.equal(bot.weapon, 'g19', 'arma mantida durante o engajamento');
});

// ---------------------------------------------------------------------------
// 5. ROOM3D — paridade autoritativa
// ---------------------------------------------------------------------------

test('fase32 room3d: MESMA economia — bot coleta arma melhor e se cura fora de combate', () => {
  const room = new MatchRoom3D({ id: 'f32-room', seed: 'F32-ROOM', capacity: 2, botFill: 1, airdrop: false, scenarioId: 'CIGKV' });
  assert.ok(room.addPlayer('viewer0', 'OPERADOR-0'));
  assert.ok(room.start('viewer0', 'belt'));
  const bot = room.bots[0];
  const viewer = room.humans.get('viewer0');
  viewer.x = bot.x + 200; viewer.z = bot.z; // fora do alcance de visão
  for (const it of room.loot) it.active = false;
  bot.weapon = 'g19'; bot.slots[1] = 'g19';
  const item = { id: 'test-ak', kind: 'weapon', weaponId: 'ar47', name: 'AR-47', rarity: 'RARO', x: bot.x + 1.0, y: 0.55, z: bot.z, active: true };
  room.loot.push(item);
  for (let i = 0; i < 30 && bot.weapon !== 'ar47'; i++) room.tick(DT);
  assert.equal(bot.weapon, 'ar47', 'coleta autoritativa resolve weaponId || id');
  assert.equal(item.active, false, 'item consumido no servidor');
  bot.life = 30; bot.inventory.medkit = 1;
  let healed = false;
  for (let i = 0; i < 30 && !healed; i++) { room.tick(DT); healed = bot.life >= 60; }
  assert.ok(healed, `bot curou no autoritativo (${bot.life})`);
  assert.equal(bot.inventory.medkit, 0, 'kit consumido no servidor');
});

// ---------------------------------------------------------------------------
// 6. REGRESSÕES ESTRUTURAIS — rng intacto + contrato weaponId
// ---------------------------------------------------------------------------

test('fase32 sim: determinismo do spawn PRESERVADO (rng order intacto com inventário novo)', () => {
  const a = new KhaaosSim3D({ seed: 'F32-DET', botCount: 3, airdrop: false });
  const b = new KhaaosSim3D({ seed: 'F32-DET', botCount: 3, airdrop: false });
  assert.deepEqual(b.bots.map((x) => [x.x, x.z, x.weapon]), a.bots.map((x) => [x.x, x.z, x.weapon]),
    'mesma seed → mesmos bots (posição + arma)');
  assert.ok(a.bots.every((x) => x.inventory && x.slots && Array.isArray(x.weaponAttachments)),
    'bots nascem com inventário/slots/anexos (paridade F32)');
});

test('fase32 sim: loot interior PRESERVA o id de catálogo em weaponId (contrato room3d)', () => {
  const sim = new KhaaosSim3D({ seed: 'F32-WID', botCount: 0, airdrop: false });
  const interiorWeapons = sim.loot.filter((i) => i.kind === 'weapon' && /^loot-[im]/.test(String(i.id)));
  assert.ok(interiorWeapons.length > 0, 'cenário com arma interna (CIGKV sempre tem interiores)');
  for (const it of interiorWeapons) {
    assert.ok(WEAPONS3D[it.weaponId], `weaponId resolve no catálogo 3D (${it.id} → ${it.weaponId})`);
  }
  // bases externas seguem com id de catálogo (contrato F4/6 intocado)
  const outdoorWeapons = sim.loot.filter((i) => i.kind === 'weapon' && !/^loot-[imt]/.test(String(i.id)));
  for (const it of outdoorWeapons) assert.ok(WEAPONS3D[it.id] || WEAPONS3D[it.weaponId], `arma externa resolvida (${it.id})`);
});

test('fase32: BOT_SURVIVAL pinado (mesmos números nas duas trilhas)', () => {
  assert.equal(BOT_SURVIVAL.sense, 9);
  assert.equal(BOT_SURVIVAL.collect, 2.6);
  assert.equal(BOT_SURVIVAL.medkitBelow, 45);
  assert.equal(BOT_SURVIVAL.fragMin, 8);
  assert.equal(BOT_SURVIVAL.fragMax, 30);
  assert.equal(BOT_SURVIVAL.glooBelow, 60);
});
