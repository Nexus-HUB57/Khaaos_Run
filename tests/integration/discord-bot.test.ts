/**
 * KHAAOS RUN — Unit Tests: DiscordBot
 * ======================================
 * Porta node:test da suíte da API "PhD-level" (#125) — runner padrão do repo.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DiscordBot, type DiscordEventType } from "../../server/game/DiscordBot.ts";

describe("DiscordBot", () => {
  let bot: DiscordBot;

  beforeEach(() => {
    // Create bot with test webhook (no real token)
    bot = new DiscordBot({
      webhookUrl: "https://discord.com/api/webhooks/test/test",
      botToken: "",
      applicationId: "",
      rateLimitPerMinute: 25,
    });
  });

  // ─── Bot Creation ────────────────────────────────────────────────────────

  describe("construction", () => {
    it("should create bot with webhook config", () => {
      assert.notStrictEqual(bot, undefined);
    });

    it("should report operational when webhook is set", () => {
      assert.strictEqual(bot.isOperational(), true);
    });

    it("should not be operational without webhook or token", () => {
      const emptyBot = new DiscordBot({
        webhookUrl: "",
        botToken: "",
      });
      assert.strictEqual(emptyBot.isOperational(), false);
    });
  });

  // ─── Stats ───────────────────────────────────────────────────────────────

  describe("stats", () => {
    it("should return initial stats", () => {
      const stats = bot.getStats();
      assert.ok("messagesSent" in stats);
      assert.ok("messagesDropped" in stats);
      assert.ok("eventsProcessed" in stats);
      assert.ok("isConnected" in stats);
      assert.ok("queueSize" in stats);
      assert.strictEqual(stats.messagesSent, 0);
      assert.strictEqual(stats.messagesDropped, 0);
      assert.strictEqual(stats.eventsProcessed, 0);
    });
  });

  // ─── Event Types ─────────────────────────────────────────────────────────

  describe("event types", () => {
    const eventTypes: DiscordEventType[] = [
      "MATCH_START", "MATCH_END", "KILL_FEED", "RING_PHASE",
      "RING_FINAL", "WORLD_TRANSITION", "PLAYER_DOWNED",
      "PLAYER_REVIVED", "SPECTATOR_JOIN", "LEADERBOARD_UPDATE", "ECONOMY_ALERT",
    ];

    it("should define all 11 event types", () => {
      assert.strictEqual(eventTypes.length, 11);
    });

    it("each event type should be a non-empty string", () => {
      for (const type of eventTypes) {
        assert.ok(type, `event type ${type} truthy`);
        assert.strictEqual(typeof type, "string");
      }
    });
  });

  // ─── Broadcast Methods ───────────────────────────────────────────────────

  describe("broadcast methods", () => {
    it("should attempt to broadcast events (will fail with test webhook)", async () => {
      // With fake webhook, broadcast will fail but should not throw
      const result = await bot.broadcastEvent("MATCH_START", {
        roomId: "test_room",
        playerCount: 10,
        worldId: "cigkv",
      });
      // Result may be false due to fake webhook
      assert.strictEqual(typeof result, "boolean");
    });

    it("should process kill feed events", async () => {
      const result = await bot.sendKillFeed("Killer", "HURAN", "Victim", "VENEX", "AssaultRifle");
      assert.strictEqual(typeof result, "boolean");
    });

    it("should process match start events", async () => {
      const result = await bot.sendMatchStart("room_1", 50, "cigkv");
      assert.strictEqual(typeof result, "boolean");
    });

    it("should process match end events", async () => {
      const result = await bot.sendMatchEnd("room_1", "winner", "KHAEL", 15);
      assert.strictEqual(typeof result, "boolean");
    });

    it("should process ring phase events", async () => {
      const result = await bot.sendRingPhase("cigkv", 3, 5);
      assert.strictEqual(typeof result, "boolean");
    });

    it("should process world transition events", async () => {
      const result = await bot.sendWorldTransition("cigkv", "barburhen", 30);
      assert.strictEqual(typeof result, "boolean");
    });

    it("should increment eventsProcessed on broadcast", async () => {
      const before = bot.getStats().eventsProcessed;
      await bot.broadcastEvent("SPECTATOR_JOIN", { spectatorId: "spec_1" });
      const after = bot.getStats().eventsProcessed;
      assert.strictEqual(after, before + 1);
    });
  });

  // ─── Shutdown ────────────────────────────────────────────────────────────

  describe("shutdown", () => {
    it("should shutdown gracefully", async () => {
      await bot.shutdown();
      const stats = bot.getStats();
      assert.strictEqual(stats.isConnected, false);
    });
  });
});
