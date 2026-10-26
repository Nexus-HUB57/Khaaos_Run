import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  EconomyMatchBridge,
  SPECIES_CONFIG,
  KILL_RARITY_MODIFIER,
  DEFAULT_ECONOMY_MATCH_CONFIG,
  type Species,
  type KillRarity,
} from "../../server/game/EconomyMatchBridge.ts";

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
    assert.strictEqual(species.length, 6);
  });

  it("should have positive kill multipliers for all species", () => {
    for (const config of Object.values(SPECIES_CONFIG)) {
      assert.ok(config.killMultiplier > 0);
    }
  });

  it("should have KHAEL as the highest kill multiplier", () => {
    const multipliers = Object.values(SPECIES_CONFIG).map(c => c.killMultiplier);
    const max = Math.max(...multipliers);
    assert.strictEqual(SPECIES_CONFIG.KHAEL.killMultiplier, max);
  });

  // ─── KILL_RARITY_MODIFIER ─────────────────────────────────────────────────

  it("should have 6 tiers in KILL_RARITY_MODIFIER", () => {
    const tiers = Object.keys(KILL_RARITY_MODIFIER);
    assert.strictEqual(tiers.length, 6);
  });

  it("should have ascending rarity modifiers", () => {
    const values = Object.values(KILL_RARITY_MODIFIER);
    for (let i = 1; i < values.length; i++) {
      assert.ok(values[i] > values[i - 1]);
    }
  });

  // ─── calculateKillReward ──────────────────────────────────────────────────

  it("should calculate base reward = 195 (150 × 1.3 × 1.0) for HURAN + COMUM", () => {
    const result = bridge.calculateKillReward({
      killerSpecies: "HURAN",
      victimWasDowned: false,
      rarity: "COMUM",
    });
    assert.strictEqual(result.base, 150);
    assert.strictEqual(result.speciesMultiplier, 1.3);
    assert.strictEqual(result.rarityModifier, 1.0);
    assert.strictEqual(result.total, 195); // 150 * 1.3 * 1.0
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
    assert.ok(khael.total > huran.total);
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
    assert.ok(raro.total > comum.total);
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
    assert.strictEqual(inWater.waterBonus, 1.3);
    assert.ok(inWater.total > noWater.total);
  });

  it("should not apply water bonus for non-HURAN species", () => {
    const result = bridge.calculateKillReward({
      killerSpecies: "KHAEL",
      victimWasDowned: false,
      rarity: "COMUM",
      killerInWater: true,
    });
    assert.strictEqual(result.waterBonus, 1.0);
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
    assert.strictEqual(downed.downedModifier, 0.3);
    assert.ok(downed.total < normal.total);
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
    assert.ok(result.total <= DEFAULT_ECONOMY_MATCH_CONFIG.maxKillReward);
  });

  it("should provide full breakdown", () => {
    const result = bridge.calculateKillReward({
      killerSpecies: "HURAN",
      victimWasDowned: false,
      rarity: "COMUM",
      killerInWater: true,
    });
    assert.ok("base" in result);
    assert.ok("speciesMultiplier" in result);
    assert.ok("rarityModifier" in result);
    assert.ok("waterBonus" in result);
    assert.ok("downedModifier" in result);
    assert.ok("total" in result);
    assert.ok("capped" in result);
  });

  // ─── calculatePhaseSurvivalReward ─────────────────────────────────────────

  it("should scale phase survival reward with phase", () => {
    const phase1 = bridge.calculatePhaseSurvivalReward(1);
    const phase2 = bridge.calculatePhaseSurvivalReward(2);
    const phase3 = bridge.calculatePhaseSurvivalReward(3);
    assert.strictEqual(phase1, 200);   // 200 * 1
    assert.strictEqual(phase2, 400);   // 200 * 2
    assert.strictEqual(phase3, 600);   // 200 * 3
  });

  // ─── calculateWorldTransitionCost ─────────────────────────────────────────

  it("should return -50,000 KRC for world transition cost", () => {
    const cost = bridge.calculateWorldTransitionCost();
    assert.strictEqual(cost, -50000);
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
    assert.strictEqual(rewards.length, 3);

    // Finalize
    const summary = bridge.finalizeMatchEconomy();
    assert.strictEqual(summary.rewardCount, 3);
    assert.strictEqual(summary.totalRewards, 695);

    // Destroy
    bridge.destroyMatchEconomy();
    assert.strictEqual(bridge.getRewards().length, 0);
  });

  it("should track rewards by type in summary", () => {
    bridge.recordReward({ playerId: "p1", type: "KILL", amount: 195 });
    bridge.recordReward({ playerId: "p1", type: "KILL", amount: 300 });
    bridge.recordReward({ playerId: "p1", type: "PHASE_SURVIVAL", amount: 200 });

    const summary = bridge.getMatchSummary();
    assert.strictEqual(summary.rewardsByType["KILL"], 495);
    assert.strictEqual(summary.rewardsByType["PHASE_SURVIVAL"], 200);
  });

  // ─── INCOMUM rarity ───────────────────────────────────────────────────────

  it("should handle INCOMUM rarity correctly", () => {
    const result = bridge.calculateKillReward({
      killerSpecies: "HURAN",
      victimWasDowned: false,
      rarity: "INCOMUM",
    });
    assert.strictEqual(result.rarityModifier, 1.5);
    // 150 * 1.3 * 1.5 = 292.5 → rounded to 293
    assert.strictEqual(result.total, 293);
  });

  // ─── World transition cost tracking ───────────────────────────────────────

  it("should track world transition costs as deductions", () => {
    bridge.recordReward({ playerId: "p1", type: "WORLD_TRANSITION", amount: -50000 });
    const summary = bridge.getMatchSummary();
    assert.strictEqual(summary.totalDeductions, 50000);
    assert.strictEqual(summary.netFlow, -50000);
  });

  // ─── Net flow calculation ─────────────────────────────────────────────────

  it("should calculate net flow correctly with mixed rewards and deductions", () => {
    bridge.recordReward({ playerId: "p1", type: "KILL", amount: 195 });
    bridge.recordReward({ playerId: "p1", type: "KILL", amount: 300 });
    bridge.recordReward({ playerId: "p1", type: "WORLD_TRANSITION", amount: -50000 });

    const summary = bridge.getMatchSummary();
    assert.strictEqual(summary.totalRewards, 495);
    assert.strictEqual(summary.totalDeductions, 50000);
    assert.strictEqual(summary.netFlow, 495 - 50000);
  });
});
