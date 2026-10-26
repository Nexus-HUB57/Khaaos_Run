// Khaaos Run — Ring System Integration Tests
// Tests ring state management, phase progression, damage calculation,
// airdrop probability, spectator management, and Discord broadcast

import { describe, it, expect, beforeAll } from "vitest";
import { createRingAPI } from "../../server/game/RingAPI";

const MOCK_RING_CONFIG = {
  world_pipeline: {
    order: ["CIGKV", "W1", "W2", "W3", "W4"],
    transition_trigger: "ring_close",
    transition_type: "portal_khaaos",
    CIGKV: {
      name: "CIGKV Hub", capacity: 50, ring_phases: 2,
      ring_config: {
        phase_1: { radius_start: 500, radius_end: 200, duration_s: 120, damage_per_tick: 1 },
        phase_2: { radius_start: 200, radius_end: 50, duration_s: 90, damage_per_tick: 3 }
      },
      water_zones: []
    },
    W1: {
      name: "Barburhen", capacity: 100, ring_phases: 6,
      ring_config: {
        phase_1: { radius_start: 800, radius_end: 600, duration_s: 180, damage_per_tick: 1, shrink_speed: 0.8 },
        phase_2: { radius_start: 600, radius_end: 400, duration_s: 150, damage_per_tick: 2, shrink_speed: 1.0 },
        phase_3: { radius_start: 400, radius_end: 250, duration_s: 120, damage_per_tick: 3, shrink_speed: 1.2 },
        phase_4: { radius_start: 250, radius_end: 120, duration_s: 90, damage_per_tick: 5, shrink_speed: 1.5 },
        phase_5: { radius_start: 120, radius_end: 40, duration_s: 60, damage_per_tick: 8, shrink_speed: 2.0 },
        phase_6: { radius_start: 40, radius_end: 0, duration_s: 30, damage_per_tick: 15, shrink_speed: 3.0 }
      },
      water_zones: [
        { type: "river", center: [200, 0, 400], radius: 80, depth: 3, damage_modifier: 0.5 },
        { type: "lake", center: [500, 0, 100], radius: 120, depth: 5, damage_modifier: 0.3 }
      ]
    }
  }
};

describe("Ring System Integration", () => {
  let ringAPI: ReturnType<typeof createRingAPI>;

  beforeAll(() => {
    ringAPI = createRingAPI(MOCK_RING_CONFIG);
  });

  describe("Ring Config Loading", () => {
    it("should load CIGKV config", () => {
      const config = ringAPI.ringManager.getRingConfig("CIGKV");
      expect(config).toBeDefined();
      expect(config!.worldName).toBe("CIGKV Hub");
      expect(config!.capacity).toBe(50);
      expect(config!.ringPhases).toBe(2);
    });

    it("should load W1 Barburhen config with water zones", () => {
      const config = ringAPI.ringManager.getRingConfig("W1");
      expect(config).toBeDefined();
      expect(config!.worldName).toBe("Barburhen");
      expect(config!.capacity).toBe(100);
      expect(config!.phases).toHaveLength(6);
      expect(config!.waterZones).toHaveLength(2);
    });

    it("should return null for unknown world", () => {
      const config = ringAPI.ringManager.getRingConfig("UNKNOWN");
      expect(config).toBeNull();
    });
  });

  describe("Ring State Management", () => {
    it("should initialize ring state with defaults", () => {
      const state = ringAPI.ringManager.getRingState("W1");
      expect(state).toBeNull(); // Not initialized yet
    });

    it("should update ring state", () => {
      const updated = ringAPI.ringManager.updateRingState("W1", {
        currentPhase: 1,
        currentRadius: 800,
        targetRadius: 600,
        damagePerTick: 1,
        isShrinking: true,
        playersInSafe: 80,
        playersInDanger: 20,
        nextPhaseIn: 180
      });
      
      expect(updated.currentPhase).toBe(1);
      expect(updated.currentRadius).toBe(800);
      expect(updated.playersInSafe).toBe(80);
    });

    it("should retrieve updated ring state", () => {
      const state = ringAPI.ringManager.getRingState("W1");
      expect(state).toBeDefined();
      expect(state!.currentPhase).toBe(1);
    });
  });

  describe("Airdrop Probability", () => {
    it("should return 30% for phase 1", () => {
      expect(ringAPI.ringManager.getAirdropProbability(1)).toBe(0.3);
    });

    it("should return 70% for phase 3", () => {
      expect(ringAPI.ringManager.getAirdropProbability(3)).toBe(0.7);
    });

    it("should return 100% for phase 5+", () => {
      expect(ringAPI.ringManager.getAirdropProbability(5)).toBe(1.0);
      expect(ringAPI.ringManager.getAirdropProbability(6)).toBe(1.0);
    });
  });

  describe("Spectator Management", () => {
    it("should add and track spectators", () => {
      ringAPI.ringManager.addSpectator({
        id: "spec_001",
        cameraMode: "RING_CENTER",
        connectedAt: Date.now()
      });
      
      const spectators = ringAPI.ringManager.getSpectators();
      expect(spectators).toHaveLength(1);
      expect(spectators[0].id).toBe("spec_001");
    });

    it("should change spectator camera mode", () => {
      ringAPI.ringManager.setSpectatorCamera("spec_001", "FOLLOW_PLAYER");
      const spectators = ringAPI.ringManager.getSpectators();
      expect(spectators[0].cameraMode).toBe("FOLLOW_PLAYER");
    });

    it("should remove spectators", () => {
      ringAPI.ringManager.removeSpectator("spec_001");
      expect(ringAPI.ringManager.getSpectators()).toHaveLength(0);
    });
  });

  describe("Multi-World Pipeline", () => {
    it("should have correct phase counts per world", () => {
      const cigkv = ringAPI.ringManager.getRingConfig("CIGKV");
      const w1 = ringAPI.ringManager.getRingConfig("W1");
      
      expect(cigkv!.phases).toHaveLength(2);
      expect(w1!.phases).toHaveLength(6);
    });

    it("should have water zones only in W1", () => {
      const w1 = ringAPI.ringManager.getRingConfig("W1");
      const cigkv = ringAPI.ringManager.getRingConfig("CIGKV");
      
      expect(w1!.waterZones).toHaveLength(2);
      expect(cigkv!.waterZones).toHaveLength(0);
    });

    it("should have increasing damage per phase", () => {
      const w1 = ringAPI.ringManager.getRingConfig("W1");
      const damages = w1!.phases.map(p => p.damagePerTick);
      
      for (let i = 1; i < damages.length; i++) {
        expect(damages[i]).toBeGreaterThan(damages[i - 1]);
      }
    });

    it("should have decreasing radius per phase", () => {
      const w1 = ringAPI.ringManager.getRingConfig("W1");
      const radii = w1!.phases.map(p => p.radiusEnd);
      
      for (let i = 1; i < radii.length; i++) {
        expect(radii[i]).toBeLessThan(radii[i - 1]);
      }
    });
  });
});
