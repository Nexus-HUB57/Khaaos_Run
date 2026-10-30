/**
 * KHAAOS RUN — Unit Tests: EconomyMatchBridge
 * =============================================
 * Porta node:test da suíte da API "PhD-level" (#125) — runner padrão do repo.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  EconomyMatchBridge,
  SPECIES_CONFIG,
  KILL_RARITY_MODIFIER,
  EconomyMatchConfig,
  type SpeciesKey,
  type KillEvent,
  type PhaseSurvivalEvent,
  type WorldTransitionEvent,
} from "../../server/game/EconomyMatchBridge.ts";

describe("EconomyMatchBridge", () => {
  let bridge: EconomyMatchBridge;

  beforeEach(() => {
    bridge = new EconomyMatchBridge();
  });

  // ─── Species Config ──────────────────────────────────────────────────────

  describe("SPECIES_CONFIG", () => {
    it("should define all 6 species", () => {
      const species = Object.keys(SPECIES_CONFIG) as SpeciesKey[];
      assert.strictEqual(species.length, 6);
      for (const s of ["HURAN", "KHAEL", "VENEX", "ONITH", "ZHEERS", "SKEETW"]) {
        assert.ok(species.includes(s as SpeciesKey), `espécie ${s} presente`);
      }
    });

    it("should have kill multipliers > 0 for all species", () => {
      for (const config of Object.values(SPECIES_CONFIG)) {
        assert.ok(config.killMultiplier > 0);
      }
    });

    it("KHAEL should have highest kill multiplier", () => {
      const maxMult = Math.max(...Object.values(SPECIES_CONFIG).map(s => s.killMultiplier));
      assert.strictEqual(SPECIES_CONFIG.KHAEL.killMultiplier, maxMult);
    });
  });

  // ─── Kill Rarity Modifier ────────────────────────────────────────────────

  describe("KILL_RARITY_MODIFIER", () => {
    it("should define 6 rarity tiers", () => {
      assert.strictEqual(Object.keys(KILL_RARITY_MODIFIER).length, 6);
    });

    it("should have ascending multipliers by rarity", () => {
      const tiers = ["COMUM", "INCOMUM", "RARO", "EPICO", "LENDARIO", "MITICO"] as const;
      for (let i = 1; i < tiers.length; i++) {
        assert.ok(KILL_RARITY_MODIFIER[tiers[i]] > KILL_RARITY_MODIFIER[tiers[i - 1]]);
      }
    });
  });

  // ─── Kill Reward Calculation ─────────────────────────────────────────────

  describe("calculateKillReward", () => {
    const baseKill: KillEvent = {
      killerId: "killer_1",
      victimId: "victim_1",
      victimSpecies: "HURAN",
      victimSkinRarity: "COMUM",
      victimInWater: false,
      victimWasDowned: false,
      timestamp: Date.now(),
      worldId: "cigkv",
      phase: 1,
    };

    it("should calculate base kill reward for HURAN + COMUM", () => {
      const result = bridge.calculateKillReward(baseKill);
      assert.strictEqual(result.eventType, "KILL");
      assert.strictEqual(result.playerId, "killer_1");
      assert.ok(result.krcAmount > 0);
      // base (150) × species (1.3) × rarity (1.0) × water (1.0) × downed (1.0) = 195
      assert.strictEqual(result.krcAmount, 195);
    });

    it("should apply species multiplier correctly", () => {
      const khaelKill: KillEvent = { ...baseKill, victimSpecies: "KHAEL" };
      const result = bridge.calculateKillReward(khaelKill);
      // 150 × 1.5 = 225
      assert.strictEqual(result.krcAmount, 225);
    });

    it("should apply rarity multiplier correctly", () => {
      const legendaryKill: KillEvent = { ...baseKill, victimSkinRarity: "LENDARIO" };
      const result = bridge.calculateKillReward(legendaryKill);
      // 150 × 1.3 × 3.5 = 682.5 → 683
      assert.strictEqual(result.krcAmount, 683);
    });

    it("should apply water bonus for Huran in water", () => {
      const waterKill: KillEvent = { ...baseKill, victimInWater: true };
      const result = bridge.calculateKillReward(waterKill);
      // 150 × 1.3 × 1.0 × 1.3 = 253.5 → 254
      assert.strictEqual(result.krcAmount, 254);
      assert.strictEqual(result.breakdown.waterBonus, 1.3);
    });

    it("should reduce reward for downed victim", () => {
      const downedKill: KillEvent = { ...baseKill, victimWasDowned: true };
      const result = bridge.calculateKillReward(downedKill);
      // 150 × 1.3 × 1.0 × 1.0 × 0.3 = 58.5 → 59
      assert.strictEqual(result.krcAmount, 59);
      assert.strictEqual(result.breakdown.downedModifier, 0.3);
    });

    it("should cap at maxKillReward", () => {
      const extremeKill: KillEvent = {
        ...baseKill,
        victimSpecies: "KHAEL",
        victimSkinRarity: "MITICO",
        victimInWater: true,
      };
      const result = bridge.calculateKillReward(extremeKill);
      assert.ok(result.krcAmount <= EconomyMatchConfig.maxKillReward);
    });

    it("should include full breakdown", () => {
      const result = bridge.calculateKillReward(baseKill);
      assert.ok("base" in result.breakdown);
      assert.ok("speciesMultiplier" in result.breakdown);
      assert.ok("rarityMultiplier" in result.breakdown);
      assert.ok("waterBonus" in result.breakdown);
      assert.ok("downedModifier" in result.breakdown);
    });
  });

  // ─── Phase Survival Reward ───────────────────────────────────────────────

  describe("calculatePhaseSurvivalReward", () => {
    it("should scale reward with phase index", () => {
      const phase1: PhaseSurvivalEvent = {
        playerId: "p1", species: "HURAN", phase: 1,
        worldId: "cigkv", timestamp: Date.now(),
      };
      const phase3: PhaseSurvivalEvent = { ...phase1, phase: 3 };

      const r1 = bridge.calculatePhaseSurvivalReward(phase1);
      const r3 = bridge.calculatePhaseSurvivalReward(phase3);

      assert.strictEqual(r1.krcAmount, 200);  // 200 × 1
      assert.strictEqual(r3.krcAmount, 600);  // 200 × 3
      assert.ok(r3.krcAmount > r1.krcAmount);
    });
  });

  // ─── World Transition Cost ───────────────────────────────────────────────

  describe("calculateWorldTransitionCost", () => {
    it("should return negative KRC (cost)", () => {
      const event: WorldTransitionEvent = {
        playerId: "p1", fromWorld: "cigkv", toWorld: "barburhen",
        timestamp: Date.now(),
      };
      const result = bridge.calculateWorldTransitionCost(event);
      assert.strictEqual(result.krcAmount, -50_000);
      assert.strictEqual(result.eventType, "WORLD_TRANSITION");
    });
  });

  // ─── Match Economy Tracking ──────────────────────────────────────────────

  describe("match economy tracking", () => {
    it("should track match economy from init to finalize", () => {
      bridge.initMatchEconomy("room_test");

      // Record a kill
      const killResult = bridge.calculateKillReward({
        killerId: "k1", victimId: "v1", victimSpecies: "VENEX",
        victimSkinRarity: "RARO", victimInWater: false, victimWasDowned: false,
        timestamp: Date.now(), worldId: "cigkv", phase: 1,
      });
      bridge.recordReward("room_test", killResult);

      // Record a phase survival
      const phaseResult = bridge.calculatePhaseSurvivalReward({
        playerId: "k1", species: "VENEX", phase: 2,
        worldId: "cigkv", timestamp: Date.now(),
      });
      bridge.recordReward("room_test", phaseResult);

      // Record a world transition
      const transResult = bridge.calculateWorldTransitionCost({
        playerId: "k1", fromWorld: "cigkv", toWorld: "barburhen",
        timestamp: Date.now(),
      });
      bridge.recordReward("room_test", transResult);

      const summary = bridge.getMatchSummary("room_test");
      assert.notStrictEqual(summary, null);
      assert.ok(summary!.totalKrcMinted > 0);
      assert.strictEqual(summary!.totalKrcBurned, 50_000);
      assert.ok(summary!.killRewards > 0);
      assert.ok(summary!.phaseRewards > 0);
      assert.strictEqual(summary!.transitionCosts, 50_000);

      const finalized = bridge.finalizeMatchEconomy("room_test");
      assert.notStrictEqual(finalized, null);
      assert.ok(finalized!.players.size === 1);

      bridge.destroyMatchEconomy("room_test");
      assert.strictEqual(bridge.getMatchSummary("room_test"), null);
    });
  });
});
