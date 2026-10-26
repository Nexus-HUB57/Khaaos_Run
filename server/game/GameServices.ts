/**
 * KHAAOS RUN — Game Services Initializer
 * ========================================
 * Wires EconomyMatchBridge, SpectatorDataPipeline, DiscordBot,
 * and MatchFlow into the server at startup.
 */

import type { Server } from "http";
import type { Express } from "express";
import { EconomyMatchBridge } from "./EconomyMatchBridge";
import { SpectatorDataPipeline } from "./SpectatorDataPipeline";
import { DiscordBot, type DiscordBotConfig } from "./DiscordBot";
import { MatchFlow } from "./MatchFlow";

// ─── Singleton Instances ────────────────────────────────────────────────────

let economyBridge: EconomyMatchBridge | null = null;
let spectatorPipeline: SpectatorDataPipeline | null = null;
let discordBot: DiscordBot | null = null;
let activeMatches: Map<string, MatchFlow> = new Map();

// ─── Initialization ─────────────────────────────────────────────────────────

export interface GameServicesConfig {
  discordWebhookUrl?: string;
  discordBotToken?: string;
  discordApplicationId?: string;
  discordGuildId?: string;
}

/**
 * Initialize all game services and attach to HTTP server.
 */
export async function initializeGameServices(
  httpServer: Server,
  app: Express,
  config?: GameServicesConfig,
): Promise<{
  economyBridge: EconomyMatchBridge;
  spectatorPipeline: SpectatorDataPipeline;
  discordBot: DiscordBot;
  activeMatches: Map<string, MatchFlow>;
}> {
  console.log("[GameServices] Initializing...");

  // 1. EconomyMatchBridge
  economyBridge = new EconomyMatchBridge();
  console.log("[GameServices] EconomyMatchBridge ready");

  // 2. SpectatorDataPipeline
  spectatorPipeline = new SpectatorDataPipeline();
  spectatorPipeline.attach(httpServer);
  console.log("[GameServices] SpectatorDataPipeline ready (ws/spectator)");

  // 3. DiscordBot
  const discordConfig: Partial<DiscordBotConfig> & { webhookUrl: string } = {
    webhookUrl: config?.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL || "",
    botToken: config?.discordBotToken || process.env.DISCORD_BOT_TOKEN || "",
    applicationId: config?.discordApplicationId || process.env.DISCORD_APPLICATION_ID || "",
    guildId: config?.discordGuildId || process.env.DISCORD_GUILD_ID || "",
  };
  discordBot = new DiscordBot(discordConfig);
  await discordBot.initialize();
  console.log("[GameServices] DiscordBot ready");

  // 4. Register Match API routes
  registerMatchRoutes(app);

  console.log("[GameServices] All services initialized ✓");
  return {
    economyBridge,
    spectatorPipeline,
    discordBot,
    activeMatches,
  };
}

// ─── Match API Routes ───────────────────────────────────────────────────────

function registerMatchRoutes(app: Express): void {
  // Create a new match
  app.post("/api/match/create", (req, res) => {
    const { roomId, maxPlayers, worldPipeline } = req.body;
    const id = roomId || `match_${Date.now()}`;

    if (activeMatches.has(id)) {
      return res.status(409).json({ error: "Match already exists", roomId: id });
    }

    const match = new MatchFlow(
      { roomId: id, maxPlayers: maxPlayers || 100, worldPipeline },
      economyBridge!,
      spectatorPipeline ?? undefined,
      discordBot ?? undefined,
    );

    activeMatches.set(id, match);
    res.json({ roomId: id, status: "LOBBY", message: "Match created" });
  });

  // Get match state
  app.get("/api/match/:roomId/state", (req, res) => {
    const match = activeMatches.get(req.params.roomId);
    if (!match) return res.status(404).json({ error: "Match not found" });

    const state = match.getState();
    res.json({
      roomId: state.roomId,
      status: state.status,
      currentWorldIndex: state.currentWorldIndex,
      currentWorld: state.worlds[state.currentWorldIndex]?.worldId,
      playerCount: state.players.size,
      alivePlayerCount: match.getAlivePlayerCount(),
      totalEliminations: state.totalEliminations,
      tickCount: state.tickCount,
      winnerId: state.winnerId,
    });
  });

  // Join a match
  app.post("/api/match/:roomId/join", (req, res) => {
    const match = activeMatches.get(req.params.roomId);
    if (!match) return res.status(404).json({ error: "Match not found" });

    const { playerId, displayName, species, skinRarity, posX, posY, worldId } = req.body;
    const joined = match.joinPlayer({
      id: playerId,
      displayName: displayName || `Operative_${playerId.slice(0, 6)}`,
      species: species || "HURAN",
      skinRarity: skinRarity || "COMUM",
      posX: posX ?? 50,
      posY: posY ?? 50,
      inWaterZone: false,
      worldId: worldId || "cigkv",
    });

    if (!joined) return res.status(409).json({ error: "Cannot join match" });
    res.json({ ok: true, roomId: req.params.roomId });
  });

  // Start match countdown
  app.post("/api/match/:roomId/start", (req, res) => {
    const match = activeMatches.get(req.params.roomId);
    if (!match) return res.status(404).json({ error: "Match not found" });

    match.startCountdown();
    res.json({ ok: true, message: "Countdown started" });
  });

  // Process a kill
  app.post("/api/match/:roomId/kill", (req, res) => {
    const match = activeMatches.get(req.params.roomId);
    if (!match) return res.status(404).json({ error: "Match not found" });

    const { killerId, victimId, damage, weapon } = req.body;
    match.processKill(killerId, victimId, damage || 100, weapon || "Unknown");
    res.json({ ok: true });
  });

  // Revive a downed player
  app.post("/api/match/:roomId/revive", (req, res) => {
    const match = activeMatches.get(req.params.roomId);
    if (!match) return res.status(404).json({ error: "Match not found" });

    const { playerId, reviverId } = req.body;
    const revived = match.revivePlayer(playerId, reviverId);
    res.json({ ok: revived });
  });

  // End match
  app.post("/api/match/:roomId/end", (req, res) => {
    const match = activeMatches.get(req.params.roomId);
    if (!match) return res.status(404).json({ error: "Match not found" });

    const { winnerId } = req.body;
    match.endMatch(winnerId || null);
    res.json({ ok: true });
  });

  // Get match economy summary
  app.get("/api/match/:roomId/economy", (req, res) => {
    const match = activeMatches.get(req.params.roomId);
    if (!match) return res.status(404).json({ error: "Match not found" });

    const summary = economyBridge!.getMatchSummary(req.params.roomId);
    if (!summary) return res.status(404).json({ error: "No economy data" });

    res.json({
      roomId: summary.roomId,
      totalKrcMinted: summary.totalKrcMinted,
      totalKrcBurned: summary.totalKrcBurned,
      killRewards: summary.killRewards,
      phaseRewards: summary.phaseRewards,
      transitionCosts: summary.transitionCosts,
      playerCount: summary.players.size,
    });
  });

  // Get spectator count
  app.get("/api/match/:roomId/spectators", (req, res) => {
    const count = spectatorPipeline?.getSpectatorCount(req.params.roomId) ?? 0;
    res.json({ count });
  });

  // Discord bot status
  app.get("/api/discord/status", (_req, res) => {
    if (!discordBot) return res.json({ operational: false });
    res.json({ operational: discordBot.isOperational(), stats: discordBot.getStats() });
  });

  // List all active matches
  app.get("/api/matches", (_req, res) => {
    const matches = Array.from(activeMatches.entries()).map(([id, match]) => {
      const state = match.getState();
      return {
        roomId: id,
        status: state.status,
        currentWorld: state.worlds[state.currentWorldIndex]?.worldId,
        playerCount: state.players.size,
        alivePlayerCount: match.getAlivePlayerCount(),
      };
    });
    res.json({ matches, count: matches.length });
  });
}

// ─── Getters ────────────────────────────────────────────────────────────────

export function getEconomyBridge(): EconomyMatchBridge | null { return economyBridge; }
export function getSpectatorPipeline(): SpectatorDataPipeline | null { return spectatorPipeline; }
export function getDiscordBot(): DiscordBot | null { return discordBot; }
export function getActiveMatches(): Map<string, MatchFlow> { return activeMatches; }

/**
 * Graceful shutdown of all game services.
 */
export async function shutdownGameServices(): Promise<void> {
  console.log("[GameServices] Shutting down...");

  for (const match of activeMatches.values()) {
    match.destroy();
  }
  activeMatches.clear();

  spectatorPipeline?.destroy();
  await discordBot?.shutdown();

  economyBridge = null;
  spectatorPipeline = null;
  discordBot = null;

  console.log("[GameServices] All services shut down ✓");
}
