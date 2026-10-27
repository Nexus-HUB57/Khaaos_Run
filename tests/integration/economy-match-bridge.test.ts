/**
 * KHAAOS RUN — Unit Tests: EconomyMatchBridge
 * =============================================
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  EconomyMatchBridge,
  SPECIES_CONFIG,
  KILL_RARITY_MODIFIER,
  EconomyMatchConfig,
  type SpeciesKey,
  type KillEvent,
  type PhaseSurvivalEvent,
  type WorldTransitionEvent,
} from "../../../server/game/EconomyMatchBridge";

describe("EconomyMatchBridge", () => {
  let bridge: EconomyMatchBridge;

  beforeEach(() => {
    bridge = new EconomyMatchBridge();
  });

  // ─── Species Config ──────────────────────────────────────────────────────

  describe("SPECIES_CONFIG", () => {
    it("should define all 6 species", () => {
      const species = Object.keys(SPECIES_CONFIG) as SpeciesKey[];
      expect(species).toHaveLength(6);
      expect(species).toContain("HURAN");
      expect(species).toContain("KHAEL");
      expect(species).toContain("VENEX");
      expect(species).toContain("ONITH");
      expect(species).toContain("ZHEERS");
      expect(species).toContain("SKEETW");
    });

    it("should have kill multipliers > 0 for all species", () => {
      for (const [key, config] of Object.entries(SPECIES_CONFIG)) {
        expect(config.killMultiplier).toBeGreaterThan(0);
      }
    });

    it("KHAEL should have highest kill multiplier", () => {
      const maxMult = Math.max(...Object.values(SPECIES_CONFIG).map(s => s.killMultiplier));
      expect(SPECIES_CONFIG.KHAEL.killMultiplier).toBe(maxMult);
    });
  });

  // ─── Kill Rarity Modifier ────────────────────────────────────────────────

  describe("KILL_RARITY_MODIFIER", () => {
    it("should define 6 rarity tiers", () => {
      expect(Object.keys(KILL_RARITY_MODIFIER)).toHaveLength(6);
    });

    it("should have ascending multipliers by rarity", () => {
      const tiers = ["COMUM", "INCOMUM", "RARO", "EPICO", "LENDARIO", "MITICO"] as const;
      for (let i = 1; i < tiers.length; i++) {
        expect(KILL_RARITY_MODIFIER[tiers[i]]).toBeGreaterThan(KILL_RARITY_MODIFIER[tiers[i - 1]]);
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
      expect(result.eventType).toBe("KILL");
      expect(result.playerId).toBe("killer_1");
      expect(result.krcAmount).toBeGreaterThan(0);
      // base (150) × species (1.3) × rarity (1.0) × water (1.0) × downed (1.0) = 195
      expect(result.krcAmount).toBe(195);
    });

    it("should apply species multiplier correctly", () => {
      const khaelKill: KillEvent = { ...baseKill, victimSpecies: "KHAEL" };
      const result = bridge.calculateKillReward(khaelKill);
      // 150 × 1.5 = 225
      expect(result.krcAmount).toBe(225);
    });

    it("should apply rarity multiplier correctly", () => {
      const legendaryKill: KillEvent = { ...baseKill, victimSkinRarity: "LENDARIO" };
      const result = bridge.calculateKillReward(legendaryKill);
      // 150 × 1.3 × 3.5 = 682.5 → 683
      expect(result.krcAmount).toBe(683);
    });

    it("should apply water bonus for Huran in water", () => {
      const waterKill: KillEvent = { ...baseKill, victimInWater: true };
      const result = bridge.calculateKillReward(waterKill);
      // 150 × 1.3 × 1.0 × 1.3 = 253.5 → 254
      expect(result.krcAmount).toBe(254);
      expect(result.breakdown.waterBonus).toBe(1.3);
    });

    it("should reduce reward for downed victim", () => {
      const downedKill: KillEvent = { ...baseKill, victimWasDowned: true };
      const result = bridge.calculateKillReward(downedKill);
      // 150 × 1.3 × 1.0 × 1.0 × 0.3 = 58.5 → 59
      expect(result.krcAmount).toBe(59);
      expect(result.breakdown.downedModifier).toBe(0.3);
    });

    it("should cap at maxKillReward", () => {
      const extremeKill: KillEvent = {
        ...baseKill,
        victimSpecies: "KHAEL",
        victimSkinRarity: "MITICO",
        victimInWater: true,
      };
      const result = bridge.calculateKillReward(extremeKill);
      expect(result.krcAmount).toBeLessThanOrEqual(EconomyMatchConfig.maxKillReward);
    });

    it("should include full breakdown", () => {
      const result = bridge.calculateKillReward(baseKill);
      expect(result.breakdown).toHaveProperty("base");
      expect(result.breakdown).toHaveProperty("speciesMultiplier");
      expect(result.breakdown).toHaveProperty("rarityMultiplier");
      expect(result.breakdown).toHaveProperty("waterBonus");
      expect(result.breakdown).toHaveProperty("downedModifier");
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

      expect(r1.krcAmount).toBe(200);  // 200 × 1
      expect(r3.krcAmount).toBe(600);  // 200 × 3
      expect(r3.krcAmount).toBeGreaterThan(r1.krcAmount);
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
      expect(result.krcAmount).toBe(-50_000);
      expect(result.eventType).toBe("WORLD_TRANSITION");
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
      expect(summary).not.toBeNull();
      expect(summary!.totalKrcMinted).toBeGreaterThan(0);
      expect(summary!.totalKrcBurned).toBe(50_000);
      expect(summary!.killRewards).toBeGreaterThan(0);
      expect(summary!.phaseRewards).toBeGreaterThan(0);
      expect(summary!.transitionCosts).toBe(50_000);

      const finalized = bridge.finalizeMatchEconomy("room_test");
      expect(finalized).not.toBeNull();
      expect(finalized!.players.size).toBe(1);

      bridge.destroyMatchEconomy("room_test");
      expect(bridge.getMatchSummary("room_test")).toBeNull();
    });
  });
});
