import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { RingAPI, type WorldRingConfig } from "@game/RingAPI";

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
    expect(config).toBeDefined();
    expect(config!.worldId).toBe("CIGKV");
    expect(config!.initialRadius).toBe(500);
  });

  it("should load W1 with water zones", () => {
    const config = ringAPI.getWorldConfig("W1");
    expect(config).toBeDefined();
    expect(config!.hasWaterZones).toBe(true);
  });

  it("should load all 5 world configs", () => {
    const configs = ringAPI.getAllWorldConfigs();
    expect(configs).toHaveLength(5);
  });

  // ─── Ring State Management ────────────────────────────────────────────────

  it("should return ring state for a world", () => {
    const state = ringAPI.getRingState("CIGKV");
    expect(state).toBeDefined();
    expect(state!.worldId).toBe("CIGKV");
    expect(state!.currentPhase).toBe(1);
    expect(state!.currentRadius).toBe(500);
  });

  it("should update ring state for a world", () => {
    const updated = ringAPI.updateRingState("CIGKV", {
      currentPhase: 3,
      currentRadius: 250,
      damagePerTick: 5,
    });
    expect(updated).toBeDefined();
    expect(updated!.currentPhase).toBe(3);
    expect(updated!.currentRadius).toBe(250);
    expect(updated!.damagePerTick).toBe(5);
    // worldId should be preserved
    expect(updated!.worldId).toBe("CIGKV");
  });

  it("should return undefined for non-existent world", () => {
    const state = ringAPI.getRingState("NONEXISTENT");
    expect(state).toBeUndefined();
  });

  // ─── Airdrop Probability ──────────────────────────────────────────────────

  it("should return 30% airdrop probability for phase 1", () => {
    const prob = ringAPI.getAirdropProbability(1);
    expect(prob).toBe(0.3);
  });

  it("should return 70% airdrop probability for phase 3", () => {
    const prob = ringAPI.getAirdropProbability(3);
    expect(prob).toBe(0.7);
  });

  it("should return 100% airdrop probability for phase 5+", () => {
    expect(ringAPI.getAirdropProbability(5)).toBe(1.0);
    expect(ringAPI.getAirdropProbability(6)).toBe(1.0);
    expect(ringAPI.getAirdropProbability(10)).toBe(1.0);
  });

  it("should have increasing airdrop probability with phase", () => {
    const p1 = ringAPI.getAirdropProbability(1);
    const p2 = ringAPI.getAirdropProbability(2);
    const p3 = ringAPI.getAirdropProbability(3);
    const p4 = ringAPI.getAirdropProbability(4);
    const p5 = ringAPI.getAirdropProbability(5);
    expect(p1).toBeLessThan(p2);
    expect(p2).toBeLessThan(p3);
    expect(p3).toBeLessThan(p4);
    expect(p4).toBeLessThan(p5);
  });

  // ─── Spectator Management ─────────────────────────────────────────────────

  it("should add spectator to a world", () => {
    const added = ringAPI.addSpectator("CIGKV", "spectator-1", "free");
    expect(added).toBe(true);
  });

  it("should get spectators for a world", () => {
    ringAPI.addSpectator("CIGKV", "spec-1", "free");
    ringAPI.addSpectator("CIGKV", "spec-2", "follow");
    const spectators = ringAPI.getSpectators("CIGKV");
    expect(spectators).toHaveLength(2);
  });

  it("should remove spectator from a world", () => {
    ringAPI.addSpectator("CIGKV", "spec-1", "free");
    const removed = ringAPI.removeSpectator("CIGKV", "spec-1");
    expect(removed).toBe(true);
    expect(ringAPI.getSpectators("CIGKV")).toHaveLength(0);
  });

  it("should not add spectator to non-existent world", () => {
    const added = ringAPI.addSpectator("NONEXISTENT", "spec-1", "free");
    expect(added).toBe(false);
  });

  // ─── Multi-World Pipeline ─────────────────────────────────────────────────

  it("should have correct phase counts across worlds", () => {
    const configs = ringAPI.getAllWorldConfigs();
    for (const config of configs) {
      expect(config.phases).toBe(5);
    }
  });

  it("should identify worlds with water zones", () => {
    const configs = ringAPI.getAllWorldConfigs();
    const waterWorlds = configs.filter(c => c.hasWaterZones);
    expect(waterWorlds).toHaveLength(2); // CIGKV and W1
    expect(waterWorlds.map(w => w.worldId)).toContain("CIGKV");
    expect(waterWorlds.map(w => w.worldId)).toContain("W1");
  });

  it("should have correct damage per phase across worlds", () => {
    const configs = ringAPI.getAllWorldConfigs();
    for (const config of configs) {
      expect(config.damagePerPhase).toEqual([1, 3, 5, 10, 25]);
    }
  });

  it("should have varying radii across worlds", () => {
    const configs = ringAPI.getAllWorldConfigs();
    const radii = configs.map(c => c.initialRadius);
    // All radii should be different
    expect(new Set(radii).size).toBe(radii.length);
  });

  // ─── Discord Broadcast ────────────────────────────────────────────────────

  it("should provide Discord bot instance for broadcasting", () => {
    const discordBot = ringAPI.getDiscordBot();
    expect(discordBot).toBeDefined();
    expect(typeof discordBot.broadcastEvent).toBe("function");
  });

  // ─── Initial Ring States ──────────────────────────────────────────────────

  it("should initialize all worlds with phase 1", () => {
    for (const config of TEST_WORLD_CONFIGS) {
      const state = ringAPI.getRingState(config.worldId);
      expect(state).toBeDefined();
      expect(state!.currentPhase).toBe(1);
      expect(state!.isFinalPhase).toBe(false);
    }
  });
});
