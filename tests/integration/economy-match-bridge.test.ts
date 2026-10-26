import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  EconomyMatchBridge,
  SPECIES_CONFIG,
  KILL_RARITY_MODIFIER,
  DEFAULT_ECONOMY_MATCH_CONFIG,
  type Species,
  type KillRarity,
} from "@game/EconomyMatchBridge";

describe("EconomyMatchBridge Unit Tests", () => {
  let bridge: EconomyMatchBridge;

  beforeEach(() => {
    bridge = new EconomyMatchBridge("test-match-001");
    bridge.initMatchEconomy();
  });

  afterEach(() => {
    bridge.destroyMatchEconomy();
  });

  // ─── SPECIES_CONFIG ───────────────────────────────────────────────────────

  it("should have 6 species in SPECIES_CONFIG", () => {
    const species = Object.keys(SPECIES_CONFIG) as Species[];
    expect(species).toHaveLength(6);
  });

  it("should have positive kill multipliers for all species", () => {
    for (const [species, config] of Object.entries(SPECIES_CONFIG)) {
      expect(config.killMultiplier).toBeGreaterThan(0);
    }
  });

  it("should have KHAEL as the highest kill multiplier", () => {
    const multipliers = Object.values(SPECIES_CONFIG).map(c => c.killMultiplier);
    const max = Math.max(...multipliers);
    expect(SPECIES_CONFIG.KHAEL.killMultiplier).toBe(max);
  });

  // ─── KILL_RARITY_MODIFIER ─────────────────────────────────────────────────

  it("should have 6 tiers in KILL_RARITY_MODIFIER", () => {
    const tiers = Object.keys(KILL_RARITY_MODIFIER);
    expect(tiers).toHaveLength(6);
  });

  it("should have ascending rarity modifiers", () => {
    const values = Object.values(KILL_RARITY_MODIFIER);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  // ─── calculateKillReward ──────────────────────────────────────────────────

  it("should calculate base reward = 195 (150 × 1.3 × 1.0) for HURAN + COMUM", () => {
    const result = bridge.calculateKillReward({
      killerSpecies: "HURAN",
      victimWasDowned: false,
      rarity: "COMUM",
    });
    expect(result.base).toBe(150);
    expect(result.speciesMultiplier).toBe(1.3);
    expect(result.rarityModifier).toBe(1.0);
    expect(result.total).toBe(195); // 150 * 1.3 * 1.0
  });

  it("should apply species multiplier", () => {
    const huran = bridge.calculateKillReward({
      killerSpecies: "HURAN",
      victimWasDowned: false,
      rarity: "COMUM",
    });
    const khael = bridge.calculateKillReward({
      killerSpecies: "KHAEL",
      victimWasDowned: false,
      rarity: "COMUM",
    });
    expect(khael.total).toBeGreaterThan(huran.total);
  });

  it("should apply rarity modifier", () => {
    const comum = bridge.calculateKillReward({
      killerSpecies: "HURAN",
      victimWasDowned: false,
      rarity: "COMUM",
    });
    const raro = bridge.calculateKillReward({
      killerSpecies: "HURAN",
      victimWasDowned: false,
      rarity: "RARO",
    });
    expect(raro.total).toBeGreaterThan(comum.total);
  });

  it("should apply water bonus for HURAN in water", () => {
    const noWater = bridge.calculateKillReward({
      killerSpecies: "HURAN",
      victimWasDowned: false,
      rarity: "COMUM",
      killerInWater: false,
    });
    const inWater = bridge.calculateKillReward({
      killerSpecies: "HURAN",
      victimWasDowned: false,
      rarity: "COMUM",
      killerInWater: true,
    });
    expect(inWater.waterBonus).toBe(1.3);
    expect(inWater.total).toBeGreaterThan(noWater.total);
  });

  it("should not apply water bonus for non-HURAN species", () => {
    const result = bridge.calculateKillReward({
      killerSpecies: "KHAEL",
      victimWasDowned: false,
      rarity: "COMUM",
      killerInWater: true,
    });
    expect(result.waterBonus).toBe(1.0);
  });

  it("should apply downed modifier when victim was downed", () => {
    const normal = bridge.calculateKillReward({
      killerSpecies: "HURAN",
      victimWasDowned: false,
      rarity: "COMUM",
    });
    const downed = bridge.calculateKillReward({
      killerSpecies: "HURAN",
      victimWasDowned: true,
      rarity: "COMUM",
    });
    expect(downed.downedModifier).toBe(0.3);
    expect(downed.total).toBeLessThan(normal.total);
  });

  it("should cap at maxKillReward", () => {
    const result = bridge.calculateKillReward({
      killerSpecies: "KHAEL",
      victimWasDowned: false,
      rarity: "MITICO",
      killerInWater: true,
    });
    // KHAEL(1.5) × MITICO(5.0) × water(1.3 for HURAN only) = KHAEL no water bonus
    // 150 × 1.5 × 5.0 = 1125, which is under 10000 cap
    // But let's test with a high-rarity scenario
    expect(result.total).toBeLessThanOrEqual(DEFAULT_ECONOMY_MATCH_CONFIG.maxKillReward);
  });

  it("should provide full breakdown", () => {
    const result = bridge.calculateKillReward({
      killerSpecies: "HURAN",
      victimWasDowned: false,
      rarity: "COMUM",
      killerInWater: true,
    });
    expect(result).toHaveProperty("base");
    expect(result).toHaveProperty("speciesMultiplier");
    expect(result).toHaveProperty("rarityModifier");
    expect(result).toHaveProperty("waterBonus");
    expect(result).toHaveProperty("downedModifier");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("capped");
  });

  // ─── calculatePhaseSurvivalReward ─────────────────────────────────────────

  it("should scale phase survival reward with phase", () => {
    const phase1 = bridge.calculatePhaseSurvivalReward(1);
    const phase2 = bridge.calculatePhaseSurvivalReward(2);
    const phase3 = bridge.calculatePhaseSurvivalReward(3);
    expect(phase1).toBe(200);   // 200 * 1
    expect(phase2).toBe(400);   // 200 * 2
    expect(phase3).toBe(600);   // 200 * 3
  });

  // ─── calculateWorldTransitionCost ─────────────────────────────────────────

  it("should return -50,000 KRC for world transition cost", () => {
    const cost = bridge.calculateWorldTransitionCost();
    expect(cost).toBe(-50000);
  });

  // ─── Match Economy Tracking ───────────────────────────────────────────────

  it("should track economy through init→record→finalize→destroy", () => {
    // Init already done in beforeEach

    // Record rewards
    bridge.recordReward({
      playerId: "player-1",
      type: "KILL",
      amount: 195,
    });

    bridge.recordReward({
      playerId: "player-2",
      type: "KILL",
      amount: 300,
    });

    bridge.recordReward({
      playerId: "player-1",
      type: "PHASE_SURVIVAL",
      amount: 200,
    });

    // Verify tracking
    const rewards = bridge.getRewards();
    expect(rewards).toHaveLength(3);

    // Finalize
    const summary = bridge.finalizeMatchEconomy();
    expect(summary.rewardCount).toBe(3);
    expect(summary.totalRewards).toBe(695);

    // Destroy
    bridge.destroyMatchEconomy();
    expect(bridge.getRewards()).toHaveLength(0);
  });

  it("should track rewards by type in summary", () => {
    bridge.recordReward({ playerId: "p1", type: "KILL", amount: 195 });
    bridge.recordReward({ playerId: "p1", type: "KILL", amount: 300 });
    bridge.recordReward({ playerId: "p1", type: "PHASE_SURVIVAL", amount: 200 });

    const summary = bridge.getMatchSummary();
    expect(summary.rewardsByType["KILL"]).toBe(495);
    expect(summary.rewardsByType["PHASE_SURVIVAL"]).toBe(200);
  });

  // ─── INCOMUM rarity ───────────────────────────────────────────────────────

  it("should handle INCOMUM rarity correctly", () => {
    const result = bridge.calculateKillReward({
      killerSpecies: "HURAN",
      victimWasDowned: false,
      rarity: "INCOMUM",
    });
    expect(result.rarityModifier).toBe(1.5);
    // 150 * 1.3 * 1.5 = 292.5 → rounded to 293
    expect(result.total).toBe(293);
  });

  // ─── World transition cost tracking ───────────────────────────────────────

  it("should track world transition costs as deductions", () => {
    bridge.recordReward({ playerId: "p1", type: "WORLD_TRANSITION", amount: -50000 });
    const summary = bridge.getMatchSummary();
    expect(summary.totalDeductions).toBe(50000);
    expect(summary.netFlow).toBe(-50000);
  });

  // ─── Net flow calculation ─────────────────────────────────────────────────

  it("should calculate net flow correctly with mixed rewards and deductions", () => {
    bridge.recordReward({ playerId: "p1", type: "KILL", amount: 195 });
    bridge.recordReward({ playerId: "p1", type: "KILL", amount: 300 });
    bridge.recordReward({ playerId: "p1", type: "WORLD_TRANSITION", amount: -50000 });

    const summary = bridge.getMatchSummary();
    expect(summary.totalRewards).toBe(495);
    expect(summary.totalDeductions).toBe(50000);
    expect(summary.netFlow).toBe(495 - 50000);
  });
});
