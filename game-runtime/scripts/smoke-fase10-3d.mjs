// Khaaos Run — Smoke Fase 10: a ponte partida 3D → POJ de ponta a ponta.
// Room autoritativa real (MatchRoom3D) + serviço POJ real + Economy real em
// memória: a partida termina, handleMatchEnd dispara recompensa KRC e o
// reportMatchResult alimenta presença/queda/carreira no protocolo.
import assert from 'node:assert/strict';
import { MatchRoom3D } from '../server/room3d.js';
import { createPojService } from '../server/poj.js';
import { Economy } from '../server/economy.js';
import { grantMatchRewards } from '../server/rewards.js';
import { rankProgress } from '../src/shared/rank.js';
import { FASES } from '../src/game3d/poj.js';

const svc = createPojService({ daySeconds: 240, enlistmentTotal: 2, cigkvTrigger: 1 });
const economy = new Economy();

// alistamento (patente inicial = progressão KRC → Recruta com saldo 0)
svc.register({ sub: 'kr_player', username: 'kr_player', role: 'player' }, {});
svc.register({ sub: 'kr_player2', username: 'kr_player2', role: 'player' }, {});
svc.advance({ seconds: 86400 });
assert.equal(svc.proto.phase, FASES.GUERRA);
console.log('[f10-smoke] POJ em GUERRA (Barburhen)');

// sala real com plano de oficiais INJETADO (janela do 9º forçada p/ o smoke)
const room = new MatchRoom3D({
  id: 'smoke-f10-1', seed: 'F10-SMOKE', capacity: 4, botFill: 2, airdrop: false,
  onMatchEnd: async ({ matchId, results }) => {
    // mesmo fluxo do server.js: recompensas + ponte POJ
    await grantMatchRewards({ economy, matchId, results, actorById: new Map([
      ['c1', { sub: 'kr_player' }], ['c2', { sub: 'kr_player2' }],
    ]) });
    const summary = svc.reportMatchResult({
      matchId,
      results: results.map((r) => ({ ...r, userId: ({ c1: 'kr_player', c2: 'kr_player2' })[r.id] ?? null })),
    });
    console.log(`[f10-smoke] matchEnd ${matchId} → POJ: reported=${summary.reported} inc=${summary.incursionId} attended=${summary.attended} eliminated=${summary.eliminated}`);
  },
  officerPlanFn: () => ({ allowed: true, minutesPerRing: 0.05, article: '9º', officers: 3 }),
});

room.addPlayer('c1', 'kr_player');
room.addPlayer('c2', 'kr_player2');
room.start('c1', 'belt');
assert.equal(room.bots.filter((b) => b.officer).length, 3, '3 oficiais implantados na sala real');
console.log('[f10-smoke] sala iniciada — 3 Oficiais de Classe Especial no Ring');

// retirada dos oficiais no relógio da sala (0.05 min = 3 s) COM a partida viva
for (let i = 0; i < 20; i++) room.tick(0.25);
assert.equal(room.bots.filter((b) => b.officer).length, 0, 'oficiais se retiraram ao fim da duração');
assert.equal(room.officerMeta, null);
console.log('[f10-smoke] oficiais se retiraram — duração autorizada encerrada');

// c2 cai (eliminação definitiva) e a partida encerra por tempo
room.humans.get('c2').alive = false;
room.time = 0.02;
room.tick(1);
assert.ok(room.state === 'finished' || room.matchRewarded, 'partida encerrada');
await new Promise((r) => setImmediate(r)); // drena o callback async

// asserts do protocolo
const snap = svc.proto.snapshot();
assert.equal(snap.survivorsCount, 1, 'c2 consumiu a ÚNICA vida');
assert.equal(snap.players.find((p) => p.id === 'kr_player2').alive, false);
assert.equal(snap.players.find((p) => p.id === 'kr_player2').eliminatedBy, 'kia_incursao');
assert.equal(snap.incursionsOpen.length, 0, 'incursão espelho fechada');

// recompensa KRC paga → patente do perfil acompanha a progressão
const bal = (await economy.balance('kr_player')).amount;
assert.ok(bal > 0, `KRC concedido (${bal})`);
const rank = rankProgress(bal);
console.log(`[f10-smoke] kr_player: ${bal} KRC → patente ${rank.patente} (${Math.round(rank.progress * 100)}% p/ ${rank.nextPatente})`);
assert.ok(['Recruta', 'Soldado'].includes(rank.patente), 'patente derivada do saldo');

// idempotência da ponte
const replay = svc.reportMatchResult({ matchId: 'smoke-f10-1#1', results: [] });
assert.equal(replay.replay, true, 'matchId repetido → replay');

console.log('F10_SMOKE_OK');
