/**
 * KHAAOS RUN — Ranking / Leaderboard hooks
 */

import { useQuery } from "@tanstack/react-query";

export interface RankingMe {
  rating: number;
  rank: string;
  xp: number;
  matchesPlayed: number;
  wins: number;
  top5: number;
  seasonKills: number;
  kills: number;
  deaths: number;
}

export interface LeaderboardEntry {
  userId: string;
  displayName?: string;
  rank: string;
  xp: number;
  rating: number;
  matchesPlayed: number;
  wins: number;
  top5: number;
  seasonKills: number;
  kills: number;
  deaths: number;
}

export interface MatchHistoryEntry {
  id: number;
  roomId: string;
  userId: string;
  placement: number;
  kills: number;
  damageDealt: number;
  survivedMs: number;
  ratingBefore: number;
  ratingAfter: number;
  xpGained: number;
  createdAt: string;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export function useMyRanking() {
  return useQuery({
    queryKey: ["/api/ranking/me"],
    queryFn: () => fetchJson<RankingMe>("/api/ranking/me"),
    staleTime: 30_000,
  });
}

export function useLeaderboard(limit = 50) {
  return useQuery({
    queryKey: ["/api/ranking/leaderboard", limit],
    queryFn: () => fetchJson<LeaderboardEntry[]>(`/api/ranking/leaderboard?limit=${limit}`),
    staleTime: 60_000,
  });
}

export function useMatchHistory(limit = 20) {
  return useQuery({
    queryKey: ["/api/ranking/history", limit],
    queryFn: () => fetchJson<MatchHistoryEntry[]>(`/api/ranking/history?limit=${limit}`),
    staleTime: 30_000,
  });
}

/** Win rate helper */
export function winRate(wins: number, matches: number): string {
  if (!matches) return "—";
  return `${((wins / matches) * 100).toFixed(1)}%`;
}

export function kdRatio(kills: number, deaths: number): string {
  if (!deaths) return kills > 0 ? kills.toFixed(1) : "—";
  return (kills / deaths).toFixed(2);
}

export function ratingDelta(before: number, after: number): string {
  const d = after - before;
  return d > 0 ? `+${d}` : `${d}`;
}
