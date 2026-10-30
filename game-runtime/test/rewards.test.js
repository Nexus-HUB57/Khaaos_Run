// Khaaos Run — Testes das recompensas KRC de fim de partida (server/rewards.js).
//
// Cobre: fórmula pura (colocação/vencedor/teto), idempotência por partida
// (guard em memória + dedupe no ledger), integração real com a MatchRoom3D
// (fim de partida → callback único com resultados dos humanos), resolução de
// identidade (client-id → userId), desligamento por env e trilha de auditoria.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMatchRewards, grantMatchRewards, rewardsEnabled, REWARD_RULES, resetRewardsCacheForTests } from '../server/rewards.js';
import { Economy, Ledger } from '../server/economy.js';
import { AuditLog } from '../server/audit.js';
import { MatchRoom3D } from '../server/room3d.js';

const DT = 1 / 20;

test('rewards: fórmula pura — colocação entre humanos, bônus de vencedor e teto por partida', () => {
  const results = [
    { id: 'p1', name: 'A', kills: 1, krc: 250, xp: 0, survived: true, winner: true },
    { id: 'p2', name: 'B', kills: 3, krc: 130, xp: 0, survived: true, winner: false },
    { id: 'p3', name: 'C', kills: 5, krc: 40, xp: 0, survived: false, winner: false },
  ];
  const rewards = computeMatchRewards(results);
  // Ordenação: vivos primeiro (mais kills), depois eliminados.
  assert.equal(rewards[0].id, 'p2');      // vivo, 3 kills → 1º
  assert.equal(rewards[1].id, 'p1');      // vivo, 1 kill → 2º (vencedor)
  assert.equal(rewards[2].id, 'p3');      // eliminado → 3º
  assert.deepEqual(rewards.map((r) => r.placement), [1, 2, 3]);
  assert.equal(rewards[0].amount, 130 + REWARD_RULES.PLACEMENT_BONUS[0]);               // 1º: +150
  assert.equal(rewards[1].amount, 250 + REWARD_RULES.PLACEMENT_BONUS[1] + REWARD_RULES.WINNER_BONUS); // 2º: +75 vencedor
  assert.equal(rewards[2].amount, 40 + REWARD_RULES.PLACEMENT_BONUS[2]);               // 3º: +40
  assert.ok(rewards.every((r) => r.currency === 'KRC' && r.reason === 'match_reward'));
  // Teto: clamp por jogador sem alterar os demais.
  const capped = computeMatchRewards([{ id: 'p1', kills: 9, krc: 999_999, survived: true, winner: true }], { cap: 500 });
  assert.equal(capped[0].amount, 500);
  // krc negativo/ausente nunca vira payout negativo (clamp em 0; bônus de
  // colocação segue aplicável — único resultado → 1º lugar).
  const weird = computeMatchRewards([{ id: 'p1', kills: 0, krc: -50, survived: false, winner: false }]);
  assert.equal(weird[0].amount, REWARD_RULES.PLACEMENT_BONUS[0]);
});

test('rewards: idempotência por partida — replay do mesmo matchId não concede duas vezes', async () => {
  resetRewardsCacheForTests();
  const economy = new Economy({ store: new Ledger() });
  const audit = new AuditLog();
  const results = [{ id: 'p1', userId: 'user-1', name: 'A', kills: 2, krc: 250, xp: 0, survived: true, winner: true }];
  const first = await grantMatchRewards({ economy, matchId: 'ring3d-1#1', results, audit });
  assert.equal(first.granted, 1);
  assert.equal(first.total, 250 + 150 + 100);
  const replay = await grantMatchRewards({ economy, matchId: 'ring3d-1#1', results, audit });
  assert.equal(replay.replay, true, 'segunda chamada devolve resumo em cache');
  assert.equal((await economy.balance('user-1')).amount, 500, 'saldo não muda no replay');
  assert.equal(audit.events.filter((e) => e.action === 'economy.match_rewards').length, 1, 'auditoria registra o disparo único');
  // Chave de idempotência é determinística por partida+usuário (dedupe também no store).
  assert.ok(replay.entries[0].entryId != null);
  // Partida diferente → concede de novo (novas partidas pagam).
  const second = await grantMatchRewards({ economy, matchId: 'ring3d-1#2', results, audit });
  assert.equal(second.granted, 1);
  assert.equal((await economy.balance('user-1')).amount, 1000);
});

test('rewards: fim de partida real da MatchRoom3D dispara callback único e concede saldo', async () => {
  resetRewardsCacheForTests();
  const economy = new Economy({ store: new Ledger() });
  const ended = [];
  const room = new MatchRoom3D({
    id: 'ring3d-test', seed: 'REWARD-TEST', region: 'sa-east', capacity: 4, botFill: 1, airdrop: false,
    onMatchEnd: (payload) => ended.push(payload),
  });
  room.addPlayer('p1', 'JOGADOR-1');
  assert.ok(room.start('p1', 'belt'));
  assert.ok(room.matchId.startsWith('ring3d-test#'), `matchId derivado da sala: ${room.matchId}`);
  // Força fim por tempo com humano vivo (survived=true).
  room.time = 0;
  room.tick(DT);
  assert.equal(room.state, 'FINISHED');
  assert.equal(ended.length, 1, 'callback dispara exatamente uma vez por partida');
  const payload = ended[0];
  assert.equal(payload.matchId, room.matchId);
  assert.equal(payload.reason, 'time');
  assert.equal(payload.results.length, 1, 'apenas humanos nos resultados (bots fora)');
  const human = payload.results[0];
  assert.equal(human.id, 'p1');
  assert.equal(human.survived, true);
  assert.equal(human.krc, 250);
  assert.equal(typeof human.winner, 'boolean');
  // Ticks extra não re-disparam o callback (guard matchRewarded).
  room.tick(DT); room.tick(DT);
  assert.equal(ended.length, 1);
  // Concessão como o servidor faz: client-id → userId via actorById.
  const summary = await grantMatchRewards({
    economy, matchId: payload.matchId, results: payload.results,
    actorById: new Map([['p1', { sub: 'user-abc' }]]),
  });
  assert.equal(summary.granted, 1);
  const expected = 250 + REWARD_RULES.PLACEMENT_BONUS[0] + (human.winner ? REWARD_RULES.WINNER_BONUS : 0);
  assert.equal((await economy.balance('user-abc')).amount, expected);
});

test('rewards: jogador sem identidade resolvida é skipado — nunca inventa userId', async () => {
  resetRewardsCacheForTests();
  const economy = new Economy({ store: new Ledger() });
  const summary = await grantMatchRewards({
    economy, matchId: 'ring3d-x#1',
    results: [
      { id: 'ghost', name: 'DESCONHECIDO', kills: 3, krc: 300, survived: true, winner: true },
      { id: 'p2', name: 'B', kills: 0, krc: 100, survived: false, winner: false },
    ],
    actorById: new Map([['p2', { sub: 'user-2' }]]),
  });
  assert.equal(summary.granted, 1);
  assert.equal(summary.skipped, 1);
  assert.equal((await economy.balance('user-2')).amount, 100 + REWARD_RULES.PLACEMENT_BONUS[1]);
});

test('rewards: KR_REWARDS_ENABLED=false desliga concessão com evento de auditoria', async () => {
  resetRewardsCacheForTests();
  const previous = process.env.KR_REWARDS_ENABLED;
  process.env.KR_REWARDS_ENABLED = 'false';
  try {
    assert.equal(rewardsEnabled(), false);
    const economy = new Economy({ store: new Ledger() });
    const audit = new AuditLog();
    const summary = await grantMatchRewards({
      economy, matchId: 'ring3d-off#1',
      results: [{ id: 'p1', userId: 'user-1', name: 'A', kills: 1, krc: 250, survived: true, winner: true }],
      audit,
    });
    assert.equal(summary.disabled, true);
    assert.equal(summary.granted, 0);
    assert.equal((await economy.balance('user-1')).amount, 0);
    assert.ok(audit.events.some((e) => e.action === 'economy.match_rewards'), 'desligamento também é auditado');
  } finally {
    if (previous === undefined) delete process.env.KR_REWARDS_ENABLED;
    else process.env.KR_REWARDS_ENABLED = previous;
  }
});

test('rewards: falha de grant é contida (failed) e não derruba o resumo', async () => {
  resetRewardsCacheForTests();
  const broken = { grant: async () => { throw new Error('store offline'); } };
  const logs = [];
  const observability = { recordLog: (entry) => logs.push(entry) };
  const summary = await grantMatchRewards({
    economy: broken, matchId: 'ring3d-broken#1',
    results: [{ id: 'p1', userId: 'user-1', name: 'A', kills: 1, krc: 250, survived: true, winner: true }],
    observability,
  });
  assert.equal(summary.failed, 1);
  assert.equal(summary.granted, 0);
  assert.ok(logs.some((l) => l.event === 'economy.match_reward_failed'));
});
