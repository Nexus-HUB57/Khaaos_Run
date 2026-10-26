import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DiscordBot, DISCORD_EVENT_TYPES, type DiscordEventType } from "../../server/game/DiscordBot.ts";

describe("DiscordBot Unit Tests", () => {
  let bot: DiscordBot;

  // ─── Construction ─────────────────────────────────────────────────────────

  it("should construct with webhook URL", () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token" });
    assert.notStrictEqual(b, undefined);
    b.shutdown();
  });

  it("should construct with bot token", () => {
    const b = new DiscordBot({ botToken: "test-bot-token" });
    assert.notStrictEqual(b, undefined);
    b.shutdown();
  });

  it("should be operational when webhook URL is set", () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token" });
    assert.strictEqual(b.isOperational(), true);
    b.shutdown();
  });

  it("should be operational when bot token is set", () => {
    const b = new DiscordBot({ botToken: "test-token" });
    assert.strictEqual(b.isOperational(), true);
    b.shutdown();
  });

  it("should not be operational without webhook or token", () => {
    const b = new DiscordBot({});
    assert.strictEqual(b.isOperational(), false);
    b.shutdown();
  });

  // ─── Stats ────────────────────────────────────────────────────────────────

  it("should return initial stats with zero values", () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token" });
    const stats = b.getStats();
    assert.strictEqual(stats.messagesSent, 0);
    assert.strictEqual(stats.messagesDropped, 0);
    assert.strictEqual(stats.eventsProcessed, 0);
    assert.strictEqual(stats.queueSize, 0);
    b.shutdown();
  });

  // ─── Event Types ──────────────────────────────────────────────────────────

  it("should have 11 event types", () => {
    assert.strictEqual(DISCORD_EVENT_TYPES.length, 11);
  });

  it("should include all required event types", () => {
    const expected: DiscordEventType[] = [
      "MATCH_START", "MATCH_END", "KILL_FEED", "RING_PHASE", "RING_FINAL",
      "WORLD_TRANSITION", "PLAYER_DOWNED", "PLAYER_REVIVED",
      "SPECTATOR_JOIN", "LEADERBOARD_UPDATE", "ECONOMY_ALERT",
    ];
    for (const type of expected) {
      assert.ok(DISCORD_EVENT_TYPES.includes(type), `missing event type ${type}`);
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
      assert.strictEqual(result, true);
      const stats = bot.getStats();
      assert.strictEqual(stats.messagesSent, 1);
      assert.strictEqual(stats.eventsProcessed, 1);
    });

    it("should send kill feed event", async () => {
      const result = await bot.sendKillFeed({
        killerId: "killer-1",
        killerName: "Killer",
        victimId: "victim-1",
        victimName: "Victim",
        weapon: "rifle",
      });
      assert.strictEqual(result, true);
      const stats = bot.getStats();
      assert.strictEqual(stats.messagesSent, 1);
      assert.strictEqual(stats.eventsProcessed, 1);
    });

    it("should send ring phase event", async () => {
      const result = await bot.sendRingPhase({
        phase: 3,
        damagePerTick: 5,
        shrinkRadius: 200,
      });
      assert.strictEqual(result, true);
      assert.strictEqual(bot.getStats().messagesSent, 1);
    });

    it("should send world transition event", async () => {
      const result = await bot.sendWorldTransition({
        fromWorld: "cigkv",
        toWorld: "barburhen",
        matchId: "match-001",
      });
      assert.strictEqual(result, true);
      assert.strictEqual(bot.getStats().messagesSent, 1);
    });

    it("should send match end event", async () => {
      const result = await bot.sendMatchEnd({
        matchId: "match-001",
        winnerId: "winner-1",
        playerCount: 50,
        duration: 1800000,
      });
      assert.strictEqual(result, true);
      assert.strictEqual(bot.getStats().messagesSent, 1);
    });
  });

  // ─── eventsProcessed increment ────────────────────────────────────────────

  it("should increment eventsProcessed for every broadcast call", async () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token" });
    await b.broadcastEvent("MATCH_START", {});
    await b.broadcastEvent("KILL_FEED", {});
    await b.broadcastEvent("RING_PHASE", {});
    assert.strictEqual(b.getStats().eventsProcessed, 3);
    b.shutdown();
  });

  // ─── Shutdown ─────────────────────────────────────────────────────────────

  it("should drop messages after shutdown", async () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token" });
    b.shutdown();
    const result = await b.broadcastEvent("MATCH_START", {});
    assert.strictEqual(result, false);
    assert.strictEqual(b.getStats().messagesDropped, 1);
  });

  it("should report isConnected=false after shutdown", () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token" });
    assert.strictEqual(b.getStats().isConnected, true);
    b.shutdown();
    assert.strictEqual(b.getStats().isConnected, false);
  });

  // ─── Rate Limiting ────────────────────────────────────────────────────────

  it("should enforce rate limiting", async () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token", rateLimitPerMinute: 2 });
    await b.broadcastEvent("MATCH_START", {});
    await b.broadcastEvent("KILL_FEED", {});
    // Third message should be rate-limited
    const result = await b.broadcastEvent("RING_PHASE", {});
    assert.strictEqual(result, false);
    assert.strictEqual(b.getStats().messagesDropped, 1);
    b.shutdown();
  });

  // ─── Non-operational drops ────────────────────────────────────────────────

  it("should drop messages when bot is not operational", async () => {
    const b = new DiscordBot({}); // no webhook, no token
    const result = await b.broadcastEvent("MATCH_START", {});
    assert.strictEqual(result, false);
    assert.strictEqual(b.getStats().messagesDropped, 1);
    // But eventsProcessed should still increment
    assert.strictEqual(b.getStats().eventsProcessed, 1);
    b.shutdown();
  });

  // ─── broadcastEvent generic ───────────────────────────────────────────────

  it("should handle broadcastEvent with any event type", async () => {
    const b = new DiscordBot({ webhookUrl: "https://discord.com/api/webhooks/test/token" });
    const result = await b.broadcastEvent("ECONOMY_ALERT", { message: "test" });
    assert.strictEqual(result, true);
    assert.strictEqual(b.getStats().messagesSent, 1);
    assert.strictEqual(b.getStats().eventsProcessed, 1);
    b.shutdown();
  });
});
