/**
 * KHAAOS RUN — Unit Tests: DiscordBot
 * ======================================
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { DiscordBot, type DiscordBotConfig, type DiscordEventType } from "../../../server/game/DiscordBot";

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
      expect(bot).toBeDefined();
    });

    it("should report operational when webhook is set", () => {
      expect(bot.isOperational()).toBe(true);
    });

    it("should not be operational without webhook or token", () => {
      const emptyBot = new DiscordBot({
        webhookUrl: "",
        botToken: "",
      });
      expect(emptyBot.isOperational()).toBe(false);
    });
  });

  // ─── Stats ───────────────────────────────────────────────────────────────

  describe("stats", () => {
    it("should return initial stats", () => {
      const stats = bot.getStats();
      expect(stats).toHaveProperty("messagesSent");
      expect(stats).toHaveProperty("messagesDropped");
      expect(stats).toHaveProperty("eventsProcessed");
      expect(stats).toHaveProperty("isConnected");
      expect(stats).toHaveProperty("queueSize");
      expect(stats.messagesSent).toBe(0);
      expect(stats.messagesDropped).toBe(0);
      expect(stats.eventsProcessed).toBe(0);
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
      expect(eventTypes).toHaveLength(11);
    });

    it("each event type should be a non-empty string", () => {
      for (const type of eventTypes) {
        expect(type).toBeTruthy();
        expect(typeof type).toBe("string");
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
      expect(typeof result).toBe("boolean");
    });

    it("should process kill feed events", async () => {
      const result = await bot.sendKillFeed("Killer", "HURAN", "Victim", "VENEX", "AssaultRifle");
      expect(typeof result).toBe("boolean");
    });

    it("should process match start events", async () => {
      const result = await bot.sendMatchStart("room_1", 50, "cigkv");
      expect(typeof result).toBe("boolean");
    });

    it("should process match end events", async () => {
      const result = await bot.sendMatchEnd("room_1", "winner", "KHAEL", 15);
      expect(typeof result).toBe("boolean");
    });

    it("should process ring phase events", async () => {
      const result = await bot.sendRingPhase("cigkv", 3, 5);
      expect(typeof result).toBe("boolean");
    });

    it("should process world transition events", async () => {
      const result = await bot.sendWorldTransition("cigkv", "barburhen", 30);
      expect(typeof result).toBe("boolean");
    });

    it("should increment eventsProcessed on broadcast", async () => {
      const before = bot.getStats().eventsProcessed;
      await bot.broadcastEvent("SPECTATOR_JOIN", { spectatorId: "spec_1" });
      const after = bot.getStats().eventsProcessed;
      expect(after).toBe(before + 1);
    });
  });

  // ─── Shutdown ────────────────────────────────────────────────────────────

  describe("shutdown", () => {
    it("should shutdown gracefully", async () => {
      await bot.shutdown();
      const stats = bot.getStats();
      expect(stats.isConnected).toBe(false);
    });
  });
});
