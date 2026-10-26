import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DiscordBot, DISCORD_EVENT_TYPES, type DiscordEventType } from "@game/DiscordBot";

describe("DiscordBot Unit Tests", () => {
  let bot: DiscordBot;

  // ─── Construction ─────────────────────────────────────────────────────────

  it("should construct with webhook URL", () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token" });
    expect(b).toBeDefined();
    b.shutdown();
  });

  it("should construct with bot token", () => {
    const b = new DiscordBot({ botToken: "test-bot-token" });
    expect(b).toBeDefined();
    b.shutdown();
  });

  it("should be operational when webhook URL is set", () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token" });
    expect(b.isOperational()).toBe(true);
    b.shutdown();
  });

  it("should be operational when bot token is set", () => {
    const b = new DiscordBot({ botToken: "test-token" });
    expect(b.isOperational()).toBe(true);
    b.shutdown();
  });

  it("should not be operational without webhook or token", () => {
    const b = new DiscordBot({});
    expect(b.isOperational()).toBe(false);
    b.shutdown();
  });

  // ─── Stats ────────────────────────────────────────────────────────────────

  it("should return initial stats with zero values", () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token" });
    const stats = b.getStats();
    expect(stats.messagesSent).toBe(0);
    expect(stats.messagesDropped).toBe(0);
    expect(stats.eventsProcessed).toBe(0);
    expect(stats.queueSize).toBe(0);
    b.shutdown();
  });

  // ─── Event Types ──────────────────────────────────────────────────────────

  it("should have 11 event types", () => {
    expect(DISCORD_EVENT_TYPES).toHaveLength(11);
  });

  it("should include all required event types", () => {
    const expected: DiscordEventType[] = [
      "MATCH_START", "MATCH_END", "KILL_FEED", "RING_PHASE", "RING_FINAL",
      "WORLD_TRANSITION", "PLAYER_DOWNED", "PLAYER_REVIVED",
      "SPECTATOR_JOIN", "LEADERBOARD_UPDATE", "ECONOMY_ALERT",
    ];
    for (const type of expected) {
      expect(DISCORD_EVENT_TYPES).toContain(type);
    }
  });

  // ─── Broadcast Methods ────────────────────────────────────────────────────

  describe("broadcast methods", () => {
    beforeEach(() => {
      bot = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token" });
    });

    afterEach(() => {
      bot.shutdown();
    });

    it("should send match start event", async () => {
      const result = await bot.sendMatchStart({
        matchId: "match-001",
        worldId: "cigkv",
        playerCount: 50,
      });
      expect(result).toBe(true);
      const stats = bot.getStats();
      expect(stats.messagesSent).toBe(1);
      expect(stats.eventsProcessed).toBe(1);
    });

    it("should send kill feed event", async () => {
      const result = await bot.sendKillFeed({
        killerId: "killer-1",
        killerName: "Killer",
        victimId: "victim-1",
        victimName: "Victim",
        weapon: "rifle",
      });
      expect(result).toBe(true);
      const stats = bot.getStats();
      expect(stats.messagesSent).toBe(1);
      expect(stats.eventsProcessed).toBe(1);
    });

    it("should send ring phase event", async () => {
      const result = await bot.sendRingPhase({
        phase: 3,
        damagePerTick: 5,
        shrinkRadius: 200,
      });
      expect(result).toBe(true);
      expect(bot.getStats().messagesSent).toBe(1);
    });

    it("should send world transition event", async () => {
      const result = await bot.sendWorldTransition({
        fromWorld: "cigkv",
        toWorld: "barburhen",
        matchId: "match-001",
      });
      expect(result).toBe(true);
      expect(bot.getStats().messagesSent).toBe(1);
    });

    it("should send match end event", async () => {
      const result = await bot.sendMatchEnd({
        matchId: "match-001",
        winnerId: "winner-1",
        playerCount: 50,
        duration: 1800000,
      });
      expect(result).toBe(true);
      expect(bot.getStats().messagesSent).toBe(1);
    });
  });

  // ─── eventsProcessed increment ────────────────────────────────────────────

  it("should increment eventsProcessed for every broadcast call", async () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token" });
    await b.broadcastEvent("MATCH_START", {});
    await b.broadcastEvent("KILL_FEED", {});
    await b.broadcastEvent("RING_PHASE", {});
    expect(b.getStats().eventsProcessed).toBe(3);
    b.shutdown();
  });

  // ─── Shutdown ─────────────────────────────────────────────────────────────

  it("should drop messages after shutdown", async () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token" });
    b.shutdown();
    const result = await b.broadcastEvent("MATCH_START", {});
    expect(result).toBe(false);
    expect(b.getStats().messagesDropped).toBe(1);
  });

  it("should report isConnected=false after shutdown", () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token" });
    expect(b.getStats().isConnected).toBe(true);
    b.shutdown();
    expect(b.getStats().isConnected).toBe(false);
  });

  // ─── Rate Limiting ────────────────────────────────────────────────────────

  it("should enforce rate limiting", async () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token", rateLimitPerMinute: 2 });
    await b.broadcastEvent("MATCH_START", {});
    await b.broadcastEvent("KILL_FEED", {});
    // Third message should be rate-limited
    const result = await b.broadcastEvent("RING_PHASE", {});
    expect(result).toBe(false);
    expect(b.getStats().messagesDropped).toBe(1);
    b.shutdown();
  });

  // ─── Non-operational drops ────────────────────────────────────────────────

  it("should drop messages when bot is not operational", async () => {
    const b = new DiscordBot({}); // no webhook, no token
    const result = await b.broadcastEvent("MATCH_START", {});
    expect(result).toBe(false);
    expect(b.getStats().messagesDropped).toBe(1);
    // But eventsProcessed should still increment
    expect(b.getStats().eventsProcessed).toBe(1);
    b.shutdown();
  });

  // ─── broadcastEvent generic ───────────────────────────────────────────────

  it("should handle broadcastEvent with any event type", async () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token" });
    const result = await b.broadcastEvent("ECONOMY_ALERT", { message: "test" });
    expect(result).toBe(true);
    expect(b.getStats().messagesSent).toBe(1);
    expect(b.getStats().eventsProcessed).toBe(1);
    b.shutdown();
  });
});
