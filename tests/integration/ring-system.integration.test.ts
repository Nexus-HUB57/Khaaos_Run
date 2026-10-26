import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { RingAPI, type WorldRingConfig } from "../../server/game/RingAPI.ts";

// ─── Custom World Configs for Testing ────────────────────────────────────────

const TEST_WORLD_CONFIGS: WorldRingConfig[] = [
  { worldId: "CIGKV",    initialRadius: 500, phases: 5, hasWaterZones: true,  damagePerPhase: [1, 3, 5, 10, 25] },
  { worldId: "W1",       initialRadius: 600, phases: 5, hasWaterZones: true,  damagePerPhase: [1, 3, 5, 10, 25] },
  { worldId: "W2",       initialRadius: 450, phases: 5, hasWaterZones: false, damagePerPhase: [1, 3, 5, 10, 25] },
  { worldId: "W3",       initialRadius: 400, phases: 5, hasWaterZones: false, damagePerPhase: [1, 3, 5, 10, 25] },
  { worldId: "W4",       initialRadius: 550, phases: 5, hasWaterZones: false, damagePerPhase: [1, 3, 5, 10, 25] },
];

describe("Ring System Integration Tests", () => {
  let ringAPI: RingAPI;

  beforeEach(() => {
    ringAPI = new RingAPI(TEST_WORLD_CONFIGS);
  });

  // ─── Config Loading ───────────────────────────────────────────────────────

  it("should load CIGKV world config", () => {
    const config = ringAPI.getWorldConfig("CIGKV");
    assert.notStrictEqual(config, undefined);
    assert.strictEqual(config!.worldId, "CIGKV");
    assert.strictEqual(config!.initialRadius, 500);
  });

  it("should load W1 with water zones", () => {
    const config = ringAPI.getWorldConfig("W1");
    assert.notStrictEqual(config, undefined);
    assert.strictEqual(config!.hasWaterZones, true);
  });

  it("should load all 5 world configs", () => {
    const configs = ringAPI.getAllWorldConfigs();
    assert.strictEqual(configs.length, 5);
  });

  // ─── Ring State Management ────────────────────────────────────────────────

  it("should return ring state for a world", () => {
    const state = ringAPI.getRingState("CIGKV");
    assert.notStrictEqual(state, undefined);
    assert.strictEqual(state!.worldId, "CIGKV");
    assert.strictEqual(state!.currentPhase, 1);
    assert.strictEqual(state!.currentRadius, 500);
  });

  it("should update ring state for a world", () => {
    const updated = ringAPI.updateRingState("CIGKV", {
      currentPhase: 3,
      currentRadius: 250,
      damagePerTick: 5,
    });
    assert.notStrictEqual(updated, undefined);
    assert.strictEqual(updated!.currentPhase, 3);
    assert.strictEqual(updated!.currentRadius, 250);
    assert.strictEqual(updated!.damagePerTick, 5);
    // worldId should be preserved
    assert.strictEqual(updated!.worldId, "CIGKV");
  });

  it("should return undefined for non-existent world", () => {
    const state = ringAPI.getRingState("NONEXISTENT");
    assert.strictEqual(state, undefined);
  });

  // ─── Airdrop Probability ──────────────────────────────────────────────────

  it("should return 30% airdrop probability for phase 1", () => {
    const prob = ringAPI.getAirdropProbability(1);
    assert.strictEqual(prob, 0.3);
  });

  it("should return 70% airdrop probability for phase 3", () => {
    const prob = ringAPI.getAirdropProbability(3);
    assert.strictEqual(prob, 0.7);
  });

  it("should return 100% airdrop probability for phase 5+", () => {
    assert.strictEqual(ringAPI.getAirdropProbability(5), 1.0);
    assert.strictEqual(ringAPI.getAirdropProbability(6), 1.0);
    assert.strictEqual(ringAPI.getAirdropProbability(10), 1.0);
  });

  it("should have increasing airdrop probability with phase", () => {
    const p1 = ringAPI.getAirdropProbability(1);
    const p2 = ringAPI.getAirdropProbability(2);
    const p3 = ringAPI.getAirdropProbability(3);
    const p4 = ringAPI.getAirdropProbability(4);
    const p5 = ringAPI.getAirdropProbability(5);
    assert.ok(p1 < p2);
    assert.ok(p2 < p3);
    assert.ok(p3 < p4);
    assert.ok(p4 < p5);
  });

  // ─── Spectator Management ─────────────────────────────────────────────────

  it("should add spectator to a world", () => {
    const added = ringAPI.addSpectator("CIGKV", "spectator-1", "free");
    assert.strictEqual(added, true);
  });

  it("should get spectators for a world", () => {
    ringAPI.addSpectator("CIGKV", "spec-1", "free");
    ringAPI.addSpectator("CIGKV", "spec-2", "follow");
    const spectators = ringAPI.getSpectators("CIGKV");
    assert.strictEqual(spectators.length, 2);
  });

  it("should remove spectator from a world", () => {
    ringAPI.addSpectator("CIGKV", "spec-1", "free");
    const removed = ringAPI.removeSpectator("CIGKV", "spec-1");
    assert.strictEqual(removed, true);
    assert.strictEqual(ringAPI.getSpectators("CIGKV").length, 0);
  });

  it("should not add spectator to non-existent world", () => {
    const added = ringAPI.addSpectator("NONEXISTENT", "spec-1", "free");
    assert.strictEqual(added, false);
  });

  // ─── Multi-World Pipeline ─────────────────────────────────────────────────

  it("should have correct phase counts across worlds", () => {
    const configs = ringAPI.getAllWorldConfigs();
    for (const config of configs) {
      assert.strictEqual(config.phases, 5);
    }
  });

  it("should identify worlds with water zones", () => {
    const configs = ringAPI.getAllWorldConfigs();
    const waterWorlds = configs.filter(c => c.hasWaterZones);
    assert.strictEqual(waterWorlds.length, 2); // CIGKV and W1
    assert.ok(waterWorlds.map(w => w.worldId).includes("CIGKV"));
    assert.ok(waterWorlds.map(w => w.worldId).includes("W1"));
  });

  it("should have correct damage per phase across worlds", () => {
    const configs = ringAPI.getAllWorldConfigs();
    for (const config of configs) {
      assert.deepStrictEqual(config.damagePerPhase, [1, 3, 5, 10, 25]);
    }
  });

  it("should have varying radii across worlds", () => {
    const configs = ringAPI.getAllWorldConfigs();
    const radii = configs.map(c => c.initialRadius);
    // All radii should be different
    assert.strictEqual(new Set(radii).size, radii.length);
  });

  // ─── Discord Broadcast ────────────────────────────────────────────────────

  it("should provide Discord bot instance for broadcasting", () => {
    const discordBot = ringAPI.getDiscordBot();
    assert.notStrictEqual(discordBot, undefined);
    assert.strictEqual(typeof discordBot.broadcastEvent, "function");
  });

  // ─── Initial Ring States ──────────────────────────────────────────────────

  it("should initialize all worlds with phase 1", () => {
    for (const config of TEST_WORLD_CONFIGS) {
      const state = ringAPI.getRingState(config.worldId);
      assert.notStrictEqual(state, undefined);
      assert.strictEqual(state!.currentPhase, 1);
      assert.strictEqual(state!.isFinalPhase, false);
    }
  });
});
