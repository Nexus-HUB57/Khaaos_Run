// Khaaos Run — Recompensas de fim de partida em KRC.
//
// Liga o contador in-match de KRC (room3d: entrada +250, +5 por knock,
// +15 × multiplicador do cenário por kill) ao ledger Economy real, no fim da
// partida. Princípios:
//   - Fórmula PURA e determinística (computeMatchRewards) — testável sem rede;
//   - Concessão IDEMPOTENTE por partida: idempotencyKey = match:{matchId}:{userId}
//     (dedupe no store: Ledger em memória e PostgresEconomyStore) + guard em
//     memória das últimas partidas recompensadas;
//   - Teto por partida (KR_REWARDS_MAX_PER_MATCH, default 2000 KRC) — além do
//     teto diário global do Economy (KR_ECONOMY_DAILY_CAP);
//   - Desligável sem tocar o resto do servidor (KR_REWARDS_ENABLED=false);
//   - Falha de grant NUNCA derruba o servidor — contabilizada e logada;
//   - Nada de dinheiro real: trilhas de valor continuam bloqueadas
//     (assertRealMoneyDisabled é tripwire, REAL_MONEY_ENABLED segue false).
//
// Identidade: o ator da sala usa id de conexão (client-id); o mapeamento
// client-id → userId (sub do token) é feito pelo servidor no fim da partida.
// Jogador sem identidade resolvida é SKIPPED — nunca inventamos userId.
import { CURRENCY, REAL_MONEY_ENABLED } from './economy.js';

export const REWARD_RULES = Object.freeze({
  // Bônus por colocação entre HUMANOS da partida (1º/2º/3º; demais: 0).
  PLACEMENT_BONUS: Object.freeze([150, 75, 40]),
  // Bônus extra para o vencedor (último vivo ou maior score ao término).
  WINNER_BONUS: 100,
  // Teto de KRC por partida (somado por jogador).
  MAX_PER_MATCH: Math.max(0, Number(process.env.KR_REWARDS_MAX_PER_MATCH ?? 2000) || 2000),
});

export function rewardsEnabled() {
  return process.env.KR_REWARDS_ENABLED !== 'false';
}

// ─── Fórmula pura ────────────────────────────────────────────────────────────
// results: [{ id, name, kills, krc, xp, survived, winner }] — SOMENTE humanos.
// Colocação: vivos primeiro (mais kills), depois eliminados (mais kills).
// Payout = clamp(krc_in_match + bônus_colocação + bônus_vencedor, 0, cap).
export function computeMatchRewards(results, { cap = REWARD_RULES.MAX_PER_MATCH } = {}) {
  const ordered = [...(results ?? [])].sort((a, b) => {
    if (a.survived !== b.survived) return a.survived ? -1 : 1;
    return (b.kills ?? 0) - (a.kills ?? 0);
  });
  return ordered.map((r, index) => {
    const placement = index + 1;
    const placementBonus = REWARD_RULES.PLACEMENT_BONUS[placement - 1] ?? 0;
    const winnerBonus = r.winner ? REWARD_RULES.WINNER_BONUS : 0;
    const inMatch = Math.max(0, Math.round(r.krc ?? 0));
    const amount = Math.max(0, Math.min(cap, inMatch + placementBonus + winnerBonus));
    return {
      id: r.id ?? null, name: r.name ?? null, userId: r.userId ?? null,
      kills: r.kills ?? 0, placement, survived: !!r.survived, winner: !!r.winner,
      amount, currency: CURRENCY, reason: 'match_reward',
    };
  });
}

// ─── Concessão idempotente ───────────────────────────────────────────────────
// Guarda em memória das últimas 1000 partidas recompensadas (chamada repetida
// devolve o resumo em cache com replay:true, sem conceder de novo — o store
// ainda deduplica por idempotencyKey como segunda barreira).
const recentMatches = new Map(); // matchId -> summary
const RECENT_MATCH_LIMIT = 1000;

export function resetRewardsCacheForTests() {
  recentMatches.clear();
}

export async function grantMatchRewards({
  economy, matchId, results, actorById = null,
  audit = null, observability = null, metrics = null,
} = {}) {
  const base = { matchId, granted: 0, skipped: 0, failed: 0, total: 0, entries: [], disabled: false, replay: false };
  if (!economy || typeof economy.grant !== 'function' || !matchId) {
    return { ...base, skipped: Array.isArray(results) ? results.length : 0 };
  }
  if (recentMatches.has(matchId)) {
    return { ...recentMatches.get(matchId), replay: true };
  }
  if (!rewardsEnabled()) {
    const summary = { ...base, disabled: true, skipped: Array.isArray(results) ? results.length : 0 };
    audit?.record({ actor: 'system', action: 'economy.match_rewards', resource: matchId, outcome: 'allow', detail: { disabled: true } });
    return summary;
  }
  // Nada de dinheiro real aqui: KRC é moeda virtual sem lastro e as trilhas de
  // valor real continuam congeladas (REAL_MONEY_ENABLED === false + tripwire
  // assertRealMoneyDisabled em server/economy.js — qualquer caminho que tente
  // integrar compra/venda/saque/custódia falha alto).
  if (REAL_MONEY_ENABLED !== false) {
    throw new Error('real_money_enabled_unexpected'); // impossível hoje — tripwire local
  }

  // Resolve userId por ator: results já podem trazer userId (testes) ou só o
  // id de conexão — nesse caso o servidor fornece actorById (id -> identity).
  const resolved = (results ?? []).map((r) => {
    const sub = r.userId ?? actorById?.get?.(r.id)?.sub ?? null;
    return { ...r, userId: sub };
  });
  const rewards = computeMatchRewards(resolved);
  const summary = { ...base };

  for (const reward of rewards) {
    if (!reward.userId) { summary.skipped += 1; continue; } // sem identidade → sem inventar dinheiro
    try {
      const entry = await economy.grant({
        userId: reward.userId,
        amount: reward.amount,
        reason: reward.reason,
        idempotencyKey: `match:${matchId}:${reward.userId}`,
        by: 'system',
      });
      summary.granted += 1;
      summary.total += reward.amount;
      summary.entries.push({ userId: reward.userId, amount: reward.amount, entryId: entry?.id ?? null });
    } catch (error) {
      summary.failed += 1;
      observability?.recordLog?.({
        level: 'warn', event: 'economy.match_reward_failed',
        fields: { matchId, userId: reward.userId, amount: reward.amount, error: String(error?.message || error) },
      });
    }
  }

  recentMatches.set(matchId, summary);
  while (recentMatches.size > RECENT_MATCH_LIMIT) recentMatches.delete(recentMatches.keys().next().value);

  if (summary.granted > 0 && metrics && typeof metrics === 'object') {
    metrics.economyMatchRewards = (metrics.economyMatchRewards ?? 0) + summary.granted;
  }
  observability?.recordLog?.({
    level: 'info', event: 'economy.match_rewards',
    fields: { matchId, granted: summary.granted, skipped: summary.skipped, failed: summary.failed, total: summary.total },
  });
  audit?.record({
    actor: 'system', action: 'economy.match_rewards', resource: matchId, outcome: 'allow',
    detail: { granted: summary.granted, skipped: summary.skipped, failed: summary.failed, total: summary.total, entries: summary.entries },
  });
  return summary;
}
