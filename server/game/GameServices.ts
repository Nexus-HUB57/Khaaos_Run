/**
 * KHAAOS RUN — Game Services
 * ==========================
 * REST API wiring for match management endpoints.
 * Wraps MatchFlow with Express-compatible route handlers.
 */

import { MatchFlow, type MatchStatus } from "./MatchFlow";
import { EconomyMatchBridge } from "./EconomyMatchBridge";
import { DiscordBot } from "./DiscordBot";

// ─── Service Response ────────────────────────────────────────────────────────

interface ServiceResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Active Matches ──────────────────────────────────────────────────────────

const activeMatches: Map<string, MatchFlow> = new Map();

// ─── Game Services ───────────────────────────────────────────────────────────

export const GameServices = {
  /** Create a new match */
  createMatch(matchId: string, config?: { maxPlayers?: number; countdownSeconds?: number }): ServiceResponse<MatchFlow> {
    if (activeMatches.has(matchId)) {
      return { success: false, error: "Match already exists" };
    }

    const match = new MatchFlow(matchId, config);
    activeMatches.set(matchId, match);
    return { success: true, data: match };
  },

  /** Get match state */
  getMatchState(matchId: string): ServiceResponse<{
    matchId: string;
    status: MatchStatus;
    players: number;
    currentWorld: string;
    ringPhase: number;
  }> {
    const match = activeMatches.get(matchId);
    if (!match) {
      return { success: false, error: "Match not found" };
    }

    return {
      success: true,
      data: {
        matchId: match.getMatchId(),
        status: match.getStatus(),
        players: match.getPlayers().length,
        currentWorld: match.getCurrentWorld().worldId,
        ringPhase: match.getCurrentRingPhase(),
      },
    };
  },

  /** Join a match */
  joinMatch(matchId: string, playerId: string, species: string): ServiceResponse<boolean> {
    const match = activeMatches.get(matchId);
    if (!match) {
      return { success: false, error: "Match not found" };
    }

    const joined = match.joinPlayer(playerId, species as any);
    return { success: joined, data: joined, error: joined ? undefined : "Cannot join match" };
  },

  /** Leave a match */
  leaveMatch(matchId: string, _playerId: string): ServiceResponse<boolean> {
    const match = activeMatches.get(matchId);
    if (!match) {
      return { success: false, error: "Match not found" };
    }

    // Simplified: mark match for cleanup if empty
    return { success: true, data: true };
  },

  /** Process a kill */
  processKill(matchId: string, killerId: string, victimId: string, damage: number, weapon: string): ServiceResponse<unknown> {
    const match = activeMatches.get(matchId);
    if (!match) {
      return { success: false, error: "Match not found" };
    }

    const killEvent = match.processKill(killerId, victimId, damage, weapon);
    if (!killEvent) {
      return { success: false, error: "Kill could not be processed" };
    }

    return { success: true, data: killEvent };
  },

  /** Revive a player */
  revivePlayer(matchId: string, playerId: string): ServiceResponse<boolean> {
    const match = activeMatches.get(matchId);
    if (!match) {
      return { success: false, error: "Match not found" };
    }

    const revived = match.revivePlayer(playerId);
    return { success: revived, data: revived };
  },

  /** End a match */
  endMatch(matchId: string, winnerId?: string): ServiceResponse<boolean> {
    const match = activeMatches.get(matchId);
    if (!match) {
      return { success: false, error: "Match not found" };
    }

    match.endMatch(winnerId ?? null);
    return { success: true, data: true };
  },

  /** Get match economy */
  getMatchEconomy(matchId: string): ServiceResponse<unknown> {
    const match = activeMatches.get(matchId);
    if (!match) {
      return { success: false, error: "Match not found" };
    }

    return { success: true, data: match.getEconomy().getMatchSummary() };
  },

  /** Get leaderboard */
  getLeaderboard(matchId: string): ServiceResponse<unknown> {
    const match = activeMatches.get(matchId);
    if (!match) {
      return { success: false, error: "Match not found" };
    }

    return { success: true, data: match.getLeaderboard() };
  },

  /** Get active match count */
  getActiveMatchCount(): number {
    return activeMatches.size;
  },

  /** Get a match by ID */
  getMatch(matchId: string): MatchFlow | undefined {
    return activeMatches.get(matchId);
  },

  /** Graceful shutdown */
  shutdown(): void {
    for (const match of activeMatches.values()) {
      match.destroy();
    }
    activeMatches.clear();
  },
};

// ─── Signal Handlers ─────────────────────────────────────────────────────────

if (typeof process !== "undefined") {
  const gracefulShutdown = () => {
    GameServices.shutdown();
    process.exit(0);
  };

  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);
}
