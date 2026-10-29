/**
 * KHAAOS RUN — Persistent Competitive Ranking
 * ===========================================
 * ELO-like rating + XP / patente progression.
 *
 * On match end each participant receives:
 *  - Placement-based XP
 *  - Kill bonus XP
 *  - Rating delta (winner gains, others lose scaled by placement)
 *
 * Results are persisted to match_results and player_stats.
 */

import { storage } from "../storage";
import { rankFromXp, RANK_XP_THRESHOLDS } from "@shared/schema";

export interface MatchParticipant {
  userId: string;
  kills: number;
  damageDealt?: number;
  survivedMs?: number;
  /** 1 = winner, higher = worse */
  placement: number;
  isWinner: boolean;
}

/** Standard ELO K-factor; higher for new players could be added later */
const K_FACTOR = 32;

/** XP awards */
function xpForPlacement(placement: number, totalPlayers: number): number {
  if (placement === 1) return 120;
  if (placement <= 3) return 80;
  if (placement <= Math.ceil(totalPlayers * 0.3)) return 50;
  if (placement <= Math.ceil(totalPlayers * 0.5)) return 30;
  return 15;
}

function xpForKills(kills: number): number {
  return kills * 12;
}

/**
 * Simplified multiplayer ELO:
 * Winner is treated as having beaten the field average.
 * Others lose a fraction scaled by how far from 1st they placed.
 */
export function computeRatingDelta(
  playerRating: number,
  fieldAverageRating: number,
  placement: number,
  totalPlayers: number,
  isWinner: boolean,
): number {
  const expected =
    1 / (1 + Math.pow(10, (fieldAverageRating - playerRating) / 400));

  if (isWinner) {
    return Math.round(K_FACTOR * (1 - expected));
  }

  // Loss magnitude increases with worse placement
  const placementFactor = placement / Math.max(2, totalPlayers);
  const score = Math.max(0, 0.35 - placementFactor * 0.35); // partial credit for top finishes
  return Math.round(K_FACTOR * (score - expected));
}

export interface RankingUpdateResult {
  userId: string;
  placement: number;
  kills: number;
  xpGained: number;
  ratingBefore: number;
  ratingAfter: number;
  rankBefore: string;
  rankAfter: string;
  promoted: boolean;
}

/**
 * Apply end-of-match ranking updates for all participants.
 * Persists match_results rows and updates player_stats.
 */
export async function applyMatchRankings(
  roomId: string,
  participants: MatchParticipant[],
): Promise<RankingUpdateResult[]> {
  if (participants.length === 0) return [];

  // Load current stats
  const statsMap = new Map<string, Awaited<ReturnType<typeof storage.getPlayerStats>>>();
  for (const p of participants) {
    statsMap.set(p.userId, await storage.getPlayerStats(p.userId));
  }

  const ratings = participants.map((p) => statsMap.get(p.userId)!.rating ?? 1000);
  const fieldAvg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const total = participants.length;

  const results: RankingUpdateResult[] = [];

  for (const p of participants) {
    const applied = await storage.applyMatchRankingAtomic({
      roomId,
      userId: p.userId,
      placement: p.placement,
      kills: p.kills,
      damageDealt: p.damageDealt ?? 0,
      survivedMs: p.survivedMs ?? 0,
      fieldAverageRating: fieldAvg,
      totalPlayers: total,
      isWinner: p.isWinner,
    }, (stats) => {
      const ratingBefore = stats.rating ?? 1000;
      const ratingAfter = Math.max(100, ratingBefore + computeRatingDelta(
        ratingBefore, fieldAvg, p.placement, total, p.isWinner,
      ));
      const xpGained = xpForPlacement(p.placement, total) + xpForKills(p.kills);
      return { ratingAfter, xpGained, rankAfter: rankFromXp((stats.xp ?? 0) + xpGained) };
    });
    const ratingBefore = applied.before.rating ?? 1000;
    const ratingAfter = applied.result.ratingAfter;
    const xpGained = applied.result.xpGained;
    const rankBefore = rankFromXp(applied.before.xp ?? 0);
    const rankAfter = rankFromXp(applied.stats.xp ?? ((applied.before.xp ?? 0) + xpGained));

    results.push({
      userId: p.userId,
      placement: p.placement,
      kills: p.kills,
      xpGained,
      ratingBefore,
      ratingAfter,
      rankBefore,
      rankAfter,
      promoted: applied.created && rankBefore !== rankAfter && (RANK_XP_THRESHOLDS[rankAfter] ?? 0) > (RANK_XP_THRESHOLDS[rankBefore] ?? 0),
    });
  }

  return results;
}

/** Leaderboard query helpers live in storage; this is pure ranking math. */
export function expectedWinProbability(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}
