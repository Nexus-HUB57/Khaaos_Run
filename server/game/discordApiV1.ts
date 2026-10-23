/**
 * KHAAOS RUN — Discord Bot API Routes (/api/v1/)
 * ================================================
 * Public-facing API routes for the Discord Bot and external integrations.
 * Authentication: X-API-Key header (not session-based).
 *
 * Endpoints (11):
 *   GET  /api/v1/server/status         — Server health, online players, regions
 *   GET  /api/v1/ranked/:playerId      — Player ELO, rank, win rate, stats
 *   GET  /api/v1/tournament             — List active tournaments
 *   GET  /api/v1/tournament/:id         — Tournament details + bracket
 *   GET  /api/v1/match/:id             — Match details (world, players, kills, time)
 *   GET  /api/v1/economy/alerts        — Recent economy anomaly alerts
 *   GET  /api/v1/economy/:playerId     — Player KRC balance + lifetime stats
 *   GET  /api/v1/discord-links/beta    — All linked accounts with beta role
 *   GET  /api/v1/discord-link/:discordId — Discord ↔ EOS account link info
 *   POST /api/v1/discord-link          — Create Discord ↔ EOS link
 *   GET  /api/v1/webhooks              — Webhook config stats (masked URLs)
 *
 * Discord API v10 Reference: https://discord.com/developers/docs/reference
 */

import type { Express } from "express";
import { storage } from "../storage";
import { distributedState } from "./DistributedState";
import { aggregateWorldTelemetry } from "./worldTelemetry";
import {
  EKhaaosWebhookChannel,
  getWebhookInfo,
  getWebhookStats,
  getAllWebhooks,
} from "./discordWebhookConfig";

// ─── API Key Guard ──────────────────────────────────────────────────────────

function apiKeyGuard(req: any, res: any, next: any): void {
  const apiKey = req.headers["x-api-key"];
  const validKey = process.env.KHAASOS_API_KEY || process.env.DISCORD_BOT_API_KEY;

  // If no API key configured, allow all (dev mode)
  if (!validKey) return next();

  if (!apiKey || apiKey !== validKey) {
    res.status(401).json({ error: "Unauthorized", code: 50014 });
    return;
  }

  next();
}

// ─── Discord Link Store ─────────────────────────────────────────────────────
// In-memory store for Discord ↔ EOS links (production: persist to DB)
// Key: discordId or eosId, Value: link info

interface DiscordLinkInfo {
  discordId: string;
  discordUsername: string;
  eosId: string;
  playerName: string;
  hasBetaRole: boolean;
  linkedAt: string;
}

const discordLinkStore = new Map<string, DiscordLinkInfo>();

// ─── Economy Alert Store ────────────────────────────────────────────────────
// Ring buffer of recent economy alerts (populated by economyService hooks)

interface EconomyAlert {
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: string;
}

const MAX_ECONOMY_ALERTS = 100;
const economyAlerts: EconomyAlert[] = [];

export function pushEconomyAlert(alert: EconomyAlert): void {
  economyAlerts.push(alert);
  if (economyAlerts.length > MAX_ECONOMY_ALERTS) {
    economyAlerts.shift();
  }
}

// ─── Tournament Store ───────────────────────────────────────────────────────
// In-memory tournament state (production: persist to DB + integrate with KhaaosRankedSystem)

interface TournamentInfo {
  id: string;
  name: string;
  state: "registration" | "checkIn" | "inProgress" | "finals" | "completed";
  registeredCount: number;
  maxParticipants: number;
  currentRound: number;
  rounds: number;
  minELO: number;
  prizePool: number;
  createdAt: string;
}

const tournamentStore = new Map<string, TournamentInfo>();

// Seed a demo tournament
tournamentStore.set("tourn-alpha-001", {
  id: "tourn-alpha-001",
  name: "Khaaos Run Alpha Tournament #1",
  state: "registration",
  registeredCount: 42,
  maxParticipants: 64,
  currentRound: 0,
  rounds: 6,
  minELO: 1000,
  prizePool: 50000,
  createdAt: new Date().toISOString(),
});

// ─── Rank Names ─────────────────────────────────────────────────────────────

const RANK_NAMES = [
  "Bronze", "Silver", "Gold", "Platinum",
  "Diamond", "Master", "Grandmaster",
] as const;

function rankNameFromELO(elo: number): string {
  if (elo >= 2400) return "Grandmaster";
  if (elo >= 2000) return "Master";
  if (elo >= 1600) return "Diamond";
  if (elo >= 1200) return "Platinum";
  if (elo >= 900) return "Gold";
  if (elo >= 600) return "Silver";
  return "Bronze";
}

// ─── Register Routes ────────────────────────────────────────────────────────

export function registerDiscordApiV1Routes(app: Express): void {
  const v1Prefix = "/api/v1";

  // Apply API key guard to all v1 routes
  app.use(v1Prefix, apiKeyGuard);

  // ── GET /api/v1/server/status ─────────────────────────────────────
  app.get(`${v1Prefix}/server/status`, async (_req, res) => {
    try {
      // Aggregate from distributed state
      const state = distributedState.getState();
      const worldTelemetry = aggregateWorldTelemetry();

      const onlinePlayers = state.rooms.reduce(
        (sum: number, r: any) => sum + (r.players?.length ?? 0), 0
      );
      const activeMatches = state.rooms.filter(
        (r: any) => r.phase === "IN_PROGRESS"
      ).length;

      const regions = [
        { id: "sa1", name: "South America", healthy: true, players: Math.floor(onlinePlayers * 0.4) },
        { id: "na1", name: "North America", healthy: true, players: Math.floor(onlinePlayers * 0.35) },
        { id: "eu1", name: "Europe", healthy: true, players: Math.floor(onlinePlayers * 0.25) },
      ];

      res.json({
        status: "online",
        version: process.env.KHAOS_VERSION || "0.5.0",
        region: process.env.KHAOS_REGION || "sa1",
        onlinePlayers,
        activeMatches,
        totalRooms: state.rooms.length,
        regions,
        uptime: process.uptime(),
        worlds: worldTelemetry,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error", message: err.message });
    }
  });

  // ── GET /api/v1/ranked/:playerId ──────────────────────────────────
  app.get(`${v1Prefix}/ranked/:playerId`, async (req, res) => {
    try {
      const { playerId } = req.params;

      // Try to get player stats from storage
      const stats = await storage.getPlayerStats(playerId);

      if (!stats) {
        res.status(404).json({ error: "Player not found", code: 10013 });
        return;
      }

      const elo = stats.elo ?? stats.rating ?? 1000;
      const rank = rankNameFromELO(elo);
      const wins = stats.wins ?? 0;
      const losses = stats.losses ?? 0;
      const totalMatches = wins + losses;
      const winRate = totalMatches > 0 ? (wins / totalMatches * 100).toFixed(1) : "0.0";

      res.json({
        playerId,
        playerName: stats.playerName ?? stats.username ?? playerId,
        elo,
        rank,
        wins,
        losses,
        winRate: `${winRate}%`,
        matchesPlayed: totalMatches,
        kills: stats.kills ?? 0,
        bestKillStreak: stats.bestKillStreak ?? stats.killStreak ?? 0,
        damageDealt: stats.damageDealt ?? 0,
        matchesSurvived: stats.matchesSurvived ?? wins,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error", message: err.message });
    }
  });

  // ── GET /api/v1/tournament ────────────────────────────────────────
  app.get(`${v1Prefix}/tournament`, async (_req, res) => {
    try {
      const tournaments = Array.from(tournamentStore.values());
      res.json({
        tournaments,
        count: tournaments.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error", message: err.message });
    }
  });

  // ── GET /api/v1/tournament/:id ────────────────────────────────────
  app.get(`${v1Prefix}/tournament/:id`, async (req, res) => {
    try {
      const { id } = req.params;
      const tournament = tournamentStore.get(id);

      if (!tournament) {
        res.status(404).json({ error: "Tournament not found", code: 10027 });
        return;
      }

      res.json({
        ...tournament,
        availableSlots: tournament.maxParticipants - tournament.registeredCount,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error", message: err.message });
    }
  });

  // ── GET /api/v1/match/:id ────────────────────────────────────────
  app.get(`${v1Prefix}/match/:id`, async (req, res) => {
    try {
      const { id } = req.params;

      // Try to get match from distributed state
      const state = distributedState.getState();
      const room = state.rooms.find((r: any) => r.id === id || r.roomId === id);

      if (!room) {
        res.status(404).json({ error: "Match not found", code: 10003 });
        return;
      }

      const players = (room.players ?? []).map((p: any) => ({
        id: p.id ?? p.eosId,
        name: p.name ?? p.username ?? "Unknown",
        species: p.species ?? "Unknown",
        kills: p.kills ?? 0,
        alive: p.status !== "eliminated",
      }));

      // Sort by kills descending for kill feed
      const killFeed = [...players].sort((a, b) => b.kills - a.kills).slice(0, 5);

      res.json({
        matchId: id,
        world: room.world ?? room.mapName ?? "Unknown",
        phase: room.phase ?? "Unknown",
        totalPlayers: players.length,
        aliveCount: players.filter(p => p.alive).length,
        killFeed,
        timeElapsed: room.timeElapsed ?? room.matchTime ?? 0,
        circlePhase: room.circlePhase ?? 1,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error", message: err.message });
    }
  });

  // ── GET /api/v1/economy/alerts (MUST be before /:playerId) ────────
  app.get(`${v1Prefix}/economy/alerts`, async (_req, res) => {
    try {
      // Return recent alerts (last 20)
      res.json({
        alerts: economyAlerts.slice(-20),
        count: economyAlerts.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error", message: err.message });
    }
  });

  // ── GET /api/v1/economy/:playerId ────────────────────────────────
  app.get(`${v1Prefix}/economy/:playerId`, async (req, res) => {
    try {
      const { playerId } = req.params;

      // Try to get from economy service
      const balance = await storage.getPlayerBalance?.(playerId).catch(() => null);

      if (balance === null || balance === undefined) {
        res.status(404).json({ error: "Player economy data not found", code: 10013 });
        return;
      }

      res.json({
        playerId,
        balance: balance.krc ?? balance.balance ?? 0,
        lifetimeEarned: balance.lifetimeEarned ?? 0,
        lifetimeSpent: balance.lifetimeSpent ?? 0,
        transactionCount: balance.transactionCount ?? 0,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error", message: err.message });
    }
  });

  // ── GET /api/v1/discord-links/beta ────────────────────────────
  // Returns all linked accounts with beta role (for BETA_EOS_IDS population)
  app.get(`${v1Prefix}/discord-links/beta`, async (_req, res) => {
    try {
      // Try DB first, fall back to in-memory store
      try {
        const dbLinks = await storage.getAllDiscordLinks?.();
        if (dbLinks) {
          const betaLinks = dbLinks.filter((l: any) => l.hasBetaRole);
          res.json(betaLinks.map((l: any) => ({ discordId: l.discordId, eosId: l.eosId, playerName: l.playerName, hasBetaRole: l.hasBetaRole })));
          return;
        }
      } catch { /* DB not available, fall through to in-memory */ }

      const betaLinks = Array.from(discordLinkStore.values()).filter((l) => l.hasBetaRole);
      res.json(betaLinks.map((l) => ({ discordId: l.discordId, eosId: l.eosId, playerName: l.playerName, hasBetaRole: l.hasBetaRole })));
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error", message: err.message });
    }
  });

  // ── GET /api/v1/discord-link/:discordId ──────────────────────────
  app.get(`${v1Prefix}/discord-link/:discordId`, async (req, res) => {
    try {
      const { discordId } = req.params;
      const link = discordLinkStore.get(discordId);

      if (!link) {
        res.status(404).json({ error: "No linked account", code: 10013 });
        return;
      }

      res.json({
        discordId: link.discordId,
        discordUsername: link.discordUsername,
        eosId: link.eosId,
        playerName: link.playerName,
        hasBetaRole: link.hasBetaRole,
        linkedAt: link.linkedAt,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error", message: err.message });
    }
  });

  // ── POST /api/v1/discord-link ────────────────────────────────────
  app.post(`${v1Prefix}/discord-link`, async (req, res) => {
    try {
      const { discordId, discordUsername, eosId, playerName, hasBetaRole } = req.body;

      if (!discordId || !eosId) {
        res.status(400).json({ error: "discordId and eosId are required", code: 50035 });
        return;
      }

      const link: DiscordLinkInfo = {
        discordId,
        discordUsername: discordUsername ?? "Unknown",
        eosId,
        playerName: playerName ?? "Unknown",
        hasBetaRole: hasBetaRole ?? false,
        linkedAt: new Date().toISOString(),
      };

      // Store by both Discord ID and EOS ID for bidirectional lookup
      discordLinkStore.set(discordId, link);
      discordLinkStore.set(eosId, link);

      res.status(201).json(link);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error", message: err.message });
    }
  });

  // ── GET /api/v1/webhooks ────────────────────────────────────────
  app.get(`${v1Prefix}/webhooks`, async (_req, res) => {
    try {
      const stats = getWebhookStats();
      const webhooks = getAllWebhooks().map((w) => ({
        channel: w.channel,
        label: w.label,
        color: `0x${w.color.toString(16).padStart(6, "0").toUpperCase()}`,
        configured: w.configured,
        // Never expose full URL — only indicate if set
        urlMasked: w.configured ? `${w.url.slice(0, 35)}...` : null,
      }));
      res.json({ webhooks, stats, timestamp: new Date().toISOString() });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error", message: err.message });
    }
  });
}

// ─── Exports for testing ────────────────────────────────────────────────────
export {
  discordLinkStore,
  economyAlerts,
  tournamentStore,
  rankNameFromELO,
  apiKeyGuard,
};
