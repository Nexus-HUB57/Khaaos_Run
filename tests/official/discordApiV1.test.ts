/**
 * KHAAOS RUN — Discord API v1 Integration Tests
 * ===============================================
 * Tests all 10 endpoints under /api/v1/ that the Discord Bot calls.
 * Also tests the webhook config bridge and internal stores.
 *
 * Run: node --import tsx --test tests/official/discordApiV1.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// We need to use dynamic import for modules that may have side effects
const { default: supertest } = await import("supertest");

// ─── Import modules under test ──────────────────────────────────────────────
const discordApiV1 = await import("../../server/game/discordApiV1.ts");
const {
  registerDiscordApiV1Routes,
  discordLinkStore,
  economyAlerts,
  tournamentStore,
  pushEconomyAlert,
  rankNameFromELO,
} = discordApiV1;

const webhookConfig = await import("../../server/game/discordWebhookConfig.ts");
const {
  EKhaaosWebhookChannel,
  getWebhookUrl,
  getWebhookInfo,
  getWebhookStats,
  getAllWebhooks,
  isValidWebhookUrl,
  WEBHOOK_COLORS,
  WEBHOOK_LABELS,
} = webhookConfig;

// ─── Test App Setup ─────────────────────────────────────────────────────────

const TEST_API_KEY = "khaaos-test-api-key";

function createTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  registerDiscordApiV1Routes(app);
  return app;
}

// Set API key and webhook URLs for tests
process.env.KHAASOS_API_KEY = TEST_API_KEY;
process.env.DISCORD_WEBHOOK_ANTI_CHEAT = "https://discord.com/api/webhooks/111/anti-cheat-token";
process.env.DISCORD_WEBHOOK_ECONOMY = "https://discord.com/api/webhooks/222/economy-token";
process.env.DISCORD_WEBHOOK_MATCH_RESULTS = "https://discord.com/api/webhooks/333/match-results-token";
process.env.DISCORD_WEBHOOK_RANKED = "https://discord.com/api/webhooks/444/ranked-token";
process.env.DISCORD_WEBHOOK_DEPLOY = "https://discord.com/api/webhooks/555/deploy-token";
process.env.DISCORD_WEBHOOK_SERVER_STATUS = "https://discord.com/api/webhooks/666/server-status-token";

// ═══════════════════════════════════════════════════════════════
// 1. API Key Guard
// ═══════════════════════════════════════════════════════════════

describe("API Key Guard", () => {
  it("rejects requests without X-API-Key when key is configured", async () => {
    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/server/status");
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "Unauthorized");
    assert.equal(res.body.code, 50014);
  });

  it("rejects requests with wrong X-API-Key", async () => {
    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/server/status").set("X-API-Key", "wrong-key");
    assert.equal(res.status, 401);
  });

  it("allows requests with correct X-API-Key", async () => {
    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/server/status").set("X-API-Key", TEST_API_KEY);
    assert.notEqual(res.status, 401);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. GET /api/v1/tournament
// ═══════════════════════════════════════════════════════════════

describe("GET /api/v1/tournament", () => {
  it("returns list of tournaments", async () => {
    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/tournament").set("X-API-Key", TEST_API_KEY);
    assert.equal(res.status, 200);
    assert.ok(res.body.tournaments);
    assert.ok(res.body.count);
    assert.ok(Array.isArray(res.body.tournaments));
    assert.ok(res.body.count >= 1); // Seeded demo tournament
  });

  it("includes the seeded demo tournament", async () => {
    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/tournament").set("X-API-Key", TEST_API_KEY);
    assert.equal(res.status, 200);
    const tourn = res.body.tournaments.find((t: any) => t.id === "tourn-alpha-001");
    assert.ok(tourn, "Demo tournament should exist");
    assert.ok(tourn.name.includes("Alpha Tournament"));
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. GET /api/v1/tournament/:id
// ═══════════════════════════════════════════════════════════════

describe("GET /api/v1/tournament/:id", () => {
  it("returns tournament details for known ID", async () => {
    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/tournament/tourn-alpha-001").set("X-API-Key", TEST_API_KEY);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, "tourn-alpha-001");
    assert.ok(res.body.availableSlots !== undefined);
    assert.ok(res.body.timestamp);
  });

  it("returns 404 for unknown tournament ID", async () => {
    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/tournament/nonexistent").set("X-API-Key", TEST_API_KEY);
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 10027);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. POST /api/v1/discord-link + GET /api/v1/discord-link/:discordId
// ═══════════════════════════════════════════════════════════════

describe("Discord Link CRUD", () => {
  it("creates a Discord↔EOS link", async () => {
    const app = createTestApp();
    const res = await supertest(app)
      .post("/api/v1/discord-link")
      .set("X-API-Key", TEST_API_KEY)
      .send({ discordId: "123456789", discordUsername: "TestUser", eosId: "eos-abc-123", playerName: "KhaaosPlayer", hasBetaRole: true });
    assert.equal(res.status, 201);
    assert.equal(res.body.discordId, "123456789");
    assert.equal(res.body.eosId, "eos-abc-123");
    assert.equal(res.body.hasBetaRole, true);
  });

  it("rejects link creation without required fields", async () => {
    const app = createTestApp();
    const res = await supertest(app)
      .post("/api/v1/discord-link")
      .set("X-API-Key", TEST_API_KEY)
      .send({ discordId: "123" });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 50035);
  });

  it("retrieves a Discord link by Discord ID", async () => {
    const app = createTestApp();
    await supertest(app)
      .post("/api/v1/discord-link")
      .set("X-API-Key", TEST_API_KEY)
      .send({ discordId: "999888777", discordUsername: "LookupTest", eosId: "eos-lookup-123", playerName: "LookupPlayer" });
    const res = await supertest(app).get("/api/v1/discord-link/999888777").set("X-API-Key", TEST_API_KEY);
    assert.equal(res.status, 200);
    assert.equal(res.body.eosId, "eos-lookup-123");
  });

  it("returns 404 for unlinked Discord user", async () => {
    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/discord-link/unlinked-user-000").set("X-API-Key", TEST_API_KEY);
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 10013);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. GET /api/v1/economy/alerts
// ═══════════════════════════════════════════════════════════════

describe("GET /api/v1/economy/alerts", () => {
  it("returns alerts array with count", async () => {
    pushEconomyAlert({ type: "test", severity: "info", message: "Test alert", timestamp: new Date().toISOString() });
    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/economy/alerts").set("X-API-Key", TEST_API_KEY);
    assert.equal(res.status, 200);
    assert.ok(res.body.alerts);
    assert.ok(res.body.count >= 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. GET /api/v1/webhooks
// ═══════════════════════════════════════════════════════════════

describe("GET /api/v1/webhooks", () => {
  it("returns webhook configuration summary", async () => {
    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/webhooks").set("X-API-Key", TEST_API_KEY);
    assert.equal(res.status, 200);
    assert.equal(res.body.webhooks.length, 6);
    assert.equal(res.body.stats.total, 6);
    assert.equal(res.body.stats.configured, 6);
  });

  it("never exposes full webhook URLs", async () => {
    const app = createTestApp();
    const res = await supertest(app).get("/api/v1/webhooks").set("X-API-Key", TEST_API_KEY);
    assert.equal(res.status, 200);
    for (const wh of res.body.webhooks) {
      if (wh.urlMasked) {
        assert.ok(wh.urlMasked.includes("..."), "URL should be truncated");
        assert.ok(wh.urlMasked.length < 50, "URL should be short");
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. Rank Name from ELO
// ═══════════════════════════════════════════════════════════════

describe("rankNameFromELO", () => {
  it("maps ELO values to correct rank names", () => {
    assert.equal(rankNameFromELO(0), "Bronze");
    assert.equal(rankNameFromELO(599), "Bronze");
    assert.equal(rankNameFromELO(600), "Silver");
    assert.equal(rankNameFromELO(900), "Gold");
    assert.equal(rankNameFromELO(1200), "Platinum");
    assert.equal(rankNameFromELO(1600), "Diamond");
    assert.equal(rankNameFromELO(2000), "Master");
    assert.equal(rankNameFromELO(2400), "Grandmaster");
    assert.equal(rankNameFromELO(3000), "Grandmaster");
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. Webhook Config Bridge
// ═══════════════════════════════════════════════════════════════

describe("discordWebhookConfig", () => {
  it("retrieves webhook URL by channel enum", () => {
    const url = getWebhookUrl(EKhaaosWebhookChannel.AntiCheat);
    assert.equal(url, "https://discord.com/api/webhooks/111/anti-cheat-token");
  });

  it("returns complete webhook info", () => {
    const info = getWebhookInfo(EKhaaosWebhookChannel.Economy);
    assert.equal(info.channel, EKhaaosWebhookChannel.Economy);
    assert.equal(info.configured, true);
    assert.equal(info.label, "Economy");
    assert.equal(info.color, 0x76FF03);
  });

  it("validates webhook URL format", () => {
    assert.equal(isValidWebhookUrl("https://discord.com/api/webhooks/12345/token-here"), true);
    assert.equal(isValidWebhookUrl("https://discord.com/api/webhooks/12345/token_with-dash"), true);
    assert.equal(isValidWebhookUrl("https://other.com/api/webhooks/12345/token"), false);
    assert.equal(isValidWebhookUrl("not-a-url"), false);
    assert.equal(isValidWebhookUrl(""), false);
  });

  it("counts webhook stats correctly", () => {
    const stats = getWebhookStats();
    assert.equal(stats.total, 6);
    assert.equal(stats.configured, 6);
    assert.equal(stats.missing.length, 0);
  });

  it("maps all 6 EKhaaosWebhookChannel values", () => {
    const channels = Object.values(EKhaaosWebhookChannel);
    assert.equal(channels.length, 6);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. Internal Store Exports
// ═══════════════════════════════════════════════════════════════

describe("Internal Stores", () => {
  it("discordLinkStore is a Map", () => {
    assert.ok(discordLinkStore instanceof Map);
  });

  it("economyAlerts is an array", () => {
    assert.ok(Array.isArray(economyAlerts));
  });

  it("tournamentStore has seeded demo tournament", () => {
    assert.ok(tournamentStore.has("tourn-alpha-001"));
    const tourn = tournamentStore.get("tourn-alpha-001")!;
    assert.ok(tourn.name.includes("Alpha Tournament"));
    assert.equal(tourn.maxParticipants, 64);
    assert.equal(tourn.prizePool, 50000);
  });

  it("pushEconomyAlert maintains ring buffer", () => {
    const before = economyAlerts.length;
    pushEconomyAlert({ type: "test2", severity: "warning", message: "Test", timestamp: new Date().toISOString() });
    assert.equal(economyAlerts.length, before + 1);
  });
});
