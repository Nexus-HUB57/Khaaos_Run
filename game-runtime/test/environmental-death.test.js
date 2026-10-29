// ============================================================================
// Fase 30 — MORTE AMBIENTAL CANÔNICA (anomalia Khaaos / quantum)
// ============================================================================
// A Fase 29 deixou uma dívida registrada no worklog: a morte pela anomalia
// quântica saía por `actor.alive = false` SECO — sem killfeed, sem espólio
// (caixa de morte da Fase 28), sem XP/KRC e sem evento 'eliminated' (a vítima
// humana nunca entrava em espectador no offline). Este arquivo PINA o reparo:
//
//  1. Drain letal sai pelo MESMO #finalizeDeath das outras mortes (as duas
//     trilhas — sim offline e MatchRoom3D autoritativa — 1:1);
//  2. A anomalia fura blindagem/escudo e mata DIRETO: SEM DBNO/nocaute neste
//     caminho (decisão registrada na Fase 29 — dano já caído é letal);
//  3. Atribuição via lastHitBy: o último atirador recebe o crédito (mesma
//     regra das mortes por RING/ácido/tsunami no funil #damage);
//  4. Rótulo ambiental no killfeed do servidor: 'ANOMALIA' ao lado de
//     RING/CIGKV; no offline o evento 'eliminated' sai com colocação;
//  5. Âncora protege e blindagem absorve (regressão dos contratos Fase 29).
//
// Headless-safe: nem este arquivo nem os módulos sob teste tocam em DOM.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { KhaaosSim3D, DEFAULT_INPUT } from '../src/game3d/sim3d.js';
import { MatchRoom3D } from '../server/room3d.js';

// Arukheea — KHAOS_GRAVITY: interval 120 s, dano 12/s, âncoras raio 28 em
// NEXUS(0,0)/NORTH/EAST/WEST. O ponto (60,60) fica FORA de todas as âncoras
// (mesma posição usada pelos testes da Fase 29). Um tick de 0,02 s drena
// 0,24 de vida — life 0.05 morre no 1º tick; life intacta não morre.
const TICK = 0.02;

function exposedBotRoom(t) {
  const room = new MatchRoom3D({ id: `env-death-${t}`, seed: `ENV-DEATH-${t}`, capacity: 2, botFill: 1, airdrop: false, scenarioId: 'Arukheea' });
  assert.ok(room.addPlayer('viewer0', 'OPERADOR-0'));
  assert.ok(room.start('viewer0', 'belt'));
  room.quantumTimer = 120; // dispara a anomalia no próximo tick
  return room;
}

// ---------------------------------------------------------------------------
// TRILHA AUTORITATIVA (room3d)
// ---------------------------------------------------------------------------

test('room3d: drain letal sai pelo finalizeDeath — killfeed ANOMALIA, sem DBNO', () => {
  const room = exposedBotRoom('FEED');
  const victim = room.bots[0];
  victim.armor = 0; victim.temporaryArmor = 0; victim.life = 0.05;
  victim.x = 60; victim.z = 60; // fora de todas as âncoras
  victim.lastHitBy = null;      // morte puramente ambiental
  room.tick(TICK);
  assert.equal(victim.alive, false, 'anomalia letal derruba o operativo');
  assert.equal(victim.knocked, false, 'anomalia NÃO nocauteia (mata direto, sem DBNO)');
  assert.equal(victim.life, 0);
  const feed = room.drainEvents('viewer0').filter((e) => e.type === 'killfeed');
  assert.ok(feed.length >= 1, 'killfeed disparou para a morte ambiental');
  assert.equal(feed.some((e) => e.killer === 'ANOMALIA'), true, `rótulo ambiental ANOMALIA no killfeed (veio: ${feed.map((e) => e.killer).join('|')})`);
});

test('room3d: crédito via lastHitBy — último atirador leva o kill da anomalia', () => {
  const room = exposedBotRoom('CREDIT');
  const victim = room.bots[0];
  victim.armor = 0; victim.temporaryArmor = 0; victim.life = 0.05;
  victim.x = 60; victim.z = 60;
  victim.lastHitBy = 'viewer0'; // atirou antes e correu para dentro do campo
  const xpBefore = room.humans.get('viewer0').xp;
  const killsBefore = room.humans.get('viewer0').kills;
  room.tick(TICK);
  assert.equal(victim.alive, false);
  const ev = room.drainEvents('viewer0');
  const kill = ev.find((e) => e.type === 'kill' && e.target === victim.name);
  assert.ok(kill, 'evento kill para o último atirador');
  assert.equal(kill.xp, 120);
  const viewer = room.humans.get('viewer0');
  assert.equal(viewer.kills, killsBefore + 1);
  assert.equal(viewer.xp, xpBefore + 120);
  const feed = ev.filter((e) => e.type === 'killfeed');
  assert.equal(feed.some((e) => e.killer === 'ANOMALIA'), false, 'crédito vai ao atirador, não ao rótulo ambiental');
});

test('room3d: vítima HUMANA da anomalia recebe eliminated com by ANOMALIA', () => {
  const room = new MatchRoom3D({ id: 'env-death-hum', seed: 'ENV-DEATH-HUM', capacity: 2, botFill: 0, airdrop: false, scenarioId: 'Arukheea' });
  assert.ok(room.addPlayer('v', 'VITIMA-QUANTUM'));
  assert.ok(room.addPlayer('w', 'SOBREVIVENTE'));
  assert.ok(room.start('v', 'belt'));
  const victim = room.humans.get('v');
  victim.armor = 0; victim.temporaryArmor = 0; victim.life = 0.05;
  victim.x = 60; victim.z = 60;
  room.quantumTimer = 120;
  room.tick(TICK);
  assert.equal(victim.alive, false);
  const ev = room.drainEvents('v');
  const eliminated = ev.find((e) => e.type === 'eliminated');
  assert.ok(eliminated, 'vítima humana recebe eliminated (entra em espectador)');
  assert.equal(eliminated.by, 'ANOMALIA');
  assert.equal(eliminated.placement, 2, 'sobrevivente humano ainda vivo → posição #2');
});

test('room3d: caído (DBNO) dentro do campo é FINALIZADO pela anomalia', () => {
  const room = exposedBotRoom('DOWNED');
  const victim = room.bots[0];
  victim.knocked = true; victim.alive = true; victim.life = 0;
  victim.armor = 0; victim.temporaryArmor = 0;
  victim.x = 60; victim.z = 60;
  room.tick(TICK);
  assert.equal(victim.alive, false, 'dano ambiental em caído é letal (regra "dano já caído")');
  assert.equal(victim.knocked, false);
});

// ---------------------------------------------------------------------------
// TRILHA OFFLINE (sim3d)
// ---------------------------------------------------------------------------

test('sim offline: bot morto pela anomalia vira espólio + botKill (sem DBNO)', () => {
  const sim = new KhaaosSim3D({ seed: 'ENV-BOT', botCount: 1, airdrop: false, scenarioId: 'Arukheea' });
  sim.start('belt');
  const bot = sim.bots[0];
  bot.armor = 0; bot.temporaryArmor = 0; bot.life = 0.05;
  bot.x = 60; bot.z = 60;
  sim.quantumTimer = 120;
  sim.step(DEFAULT_INPUT, TICK);
  assert.equal(sim.quantumActive, true);
  assert.equal(bot.alive, false, 'anomalia derruba o bot');
  assert.equal(bot.knocked, false, 'sem DBNO no caminho da anomalia');
  const box = sim.loot.find((l) => l.kind === 'deathBox' && l.victimName === bot.name);
  assert.ok(box, 'caixa de morte (Fase 28) cai onde o bot morreu');
  assert.ok(Math.abs(box.x - 60) < 1.5 && Math.abs(box.z - 60) < 1.5, 'espólio na posição da morte');
  assert.ok(sim.events.some((e) => e.type === 'botKill' && e.target === bot.name), 'botKill no feed offline');
});

test('sim offline: crédito via lastHitBy — kill + XP/KRC para o jogador', () => {
  const sim = new KhaaosSim3D({ seed: 'ENV-CREDIT', botCount: 1, airdrop: false, scenarioId: 'Arukheea' });
  sim.start('belt');
  const bot = sim.bots[0];
  bot.armor = 0; bot.temporaryArmor = 0; bot.life = 0.05;
  bot.x = 60; bot.z = 60;
  bot.lastHitBy = 'player';
  const killsBefore = sim.player.kills;
  const xpBefore = sim.player.xp;
  sim.quantumTimer = 120;
  sim.step(DEFAULT_INPUT, TICK);
  assert.equal(bot.alive, false);
  assert.equal(sim.player.kills, killsBefore + 1, 'kill creditada ao último atirador');
  assert.equal(sim.player.xp, xpBefore + 120);
  assert.ok(sim.events.some((e) => e.type === 'kill' && e.target === bot.name && e.finish === true), 'evento kill com finish');
});

test('sim offline: PLAYER morto pela anomalia — eliminated com colocação + espólio', () => {
  const sim = new KhaaosSim3D({ seed: 'ENV-PLAYER', botCount: 1, airdrop: false, scenarioId: 'Arukheea' });
  sim.start('belt');
  const p = sim.player;
  p.armor = 0; p.temporaryArmor = 0; p.life = 0.05;
  p.x = 60; p.z = 60;
  sim.quantumTimer = 120;
  sim.step(DEFAULT_INPUT, TICK);
  assert.equal(p.alive, false, 'anomalia derruba o jogador');
  assert.equal(p.knocked, false, 'sem DBNO — anomalia mata direto');
  const box = sim.loot.find((l) => l.kind === 'deathBox' && l.victimName === p.name);
  assert.ok(box, 'caixa de morte do jogador cai no campo');
  const eliminated = sim.events.find((e) => e.type === 'eliminated');
  assert.ok(eliminated, 'eliminated dispara (cliente entra em espectador)');
  assert.equal(eliminated.placement, 2, 'bot vivo restante → posição #2');
  assert.ok(sim.events.some((e) => e.type === 'shieldDrain'), 'drain de escudo segue espelhado para a UI');
});

test('sim offline: blindagem absorve e âncora protege — SEM morte espúria', () => {
  const sim = new KhaaosSim3D({ seed: 'ENV-SAFE', botCount: 1, airdrop: false, scenarioId: 'Arukheea' });
  sim.start('belt');
  const p = sim.player;
  p.temporaryArmor = 0; p.armor = 500; p.life = 100;
  p.x = 60; p.z = 60;
  sim.quantumTimer = 120;
  sim.step(DEFAULT_INPUT, TICK);
  assert.equal(p.alive, true, 'blindagem absorve o dreno — ninguém morre');
  assert.equal(p.life, 100);

  const anchored = new KhaaosSim3D({ seed: 'ENV-ANCHOR', botCount: 1, airdrop: false, scenarioId: 'Arukheea' });
  anchored.start('belt');
  anchored.player.armor = 0; anchored.player.temporaryArmor = 0; anchored.player.life = 0.05;
  anchored.player.x = 0; anchored.player.z = 0; // NEXUS, raio 28
  anchored.quantumTimer = 120;
  anchored.step(DEFAULT_INPUT, TICK);
  assert.equal(anchored.player.alive, true, 'âncora protege mesmo com vida em 0,05');
  assert.equal(anchored.quantumActive, true);
});
