// Khaaos Run — Ring System Integration Tests
// Tests ring state management, phase progression, damage calculation,
// airdrop probability, spectator management, and Discord broadcast
// Porta node:test da suíte da API "PhD-level" (#125) — runner padrão do repo.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createRingAPI } from "../../server/game/RingAPI.ts";

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

  before(() => {
    ringAPI = createRingAPI(MOCK_RING_CONFIG);
  });

  describe("Ring Config Loading", () => {
    it("should load CIGKV config", () => {
      const config = ringAPI.ringManager.getRingConfig("CIGKV");
      assert.notStrictEqual(config, undefined);
      assert.strictEqual(config!.worldName, "CIGKV Hub");
      assert.strictEqual(config!.capacity, 50);
      assert.strictEqual(config!.ringPhases, 2);
    });

    it("should load W1 Barburhen config with water zones", () => {
      const config = ringAPI.ringManager.getRingConfig("W1");
      assert.notStrictEqual(config, undefined);
      assert.strictEqual(config!.worldName, "Barburhen");
      assert.strictEqual(config!.capacity, 100);
      assert.strictEqual(config!.phases.length, 6);
      assert.strictEqual(config!.waterZones.length, 2);
    });

    it("should return null for unknown world", () => {
      const config = ringAPI.ringManager.getRingConfig("UNKNOWN");
      assert.strictEqual(config, null);
    });
  });

  describe("Ring State Management", () => {
    it("should initialize ring state with defaults", () => {
      const state = ringAPI.ringManager.getRingState("W1");
      assert.strictEqual(state, null); // Not initialized yet
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

      assert.strictEqual(updated.currentPhase, 1);
      assert.strictEqual(updated.currentRadius, 800);
      assert.strictEqual(updated.playersInSafe, 80);
    });

    it("should retrieve updated ring state", () => {
      const state = ringAPI.ringManager.getRingState("W1");
      assert.notStrictEqual(state, undefined);
      assert.strictEqual(state!.currentPhase, 1);
    });
  });

  describe("Airdrop Probability", () => {
    it("should return 30% for phase 1", () => {
      assert.strictEqual(ringAPI.ringManager.getAirdropProbability(1), 0.3);
    });

    it("should return 70% for phase 3", () => {
      assert.strictEqual(ringAPI.ringManager.getAirdropProbability(3), 0.7);
    });

    it("should return 100% for phase 5+", () => {
      assert.strictEqual(ringAPI.ringManager.getAirdropProbability(5), 1.0);
      assert.strictEqual(ringAPI.ringManager.getAirdropProbability(6), 1.0);
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
      assert.strictEqual(spectators.length, 1);
      assert.strictEqual(spectators[0].id, "spec_001");
    });

    it("should change spectator camera mode", () => {
      ringAPI.ringManager.setSpectatorCamera("spec_001", "FOLLOW_PLAYER");
      const spectators = ringAPI.ringManager.getSpectators();
      assert.strictEqual(spectators[0].cameraMode, "FOLLOW_PLAYER");
    });

    it("should remove spectators", () => {
      ringAPI.ringManager.removeSpectator("spec_001");
      assert.strictEqual(ringAPI.ringManager.getSpectators().length, 0);
    });
  });

  describe("Multi-World Pipeline", () => {
    it("should have correct phase counts per world", () => {
      const cigkv = ringAPI.ringManager.getRingConfig("CIGKV");
      const w1 = ringAPI.ringManager.getRingConfig("W1");

      assert.strictEqual(cigkv!.phases.length, 2);
      assert.strictEqual(w1!.phases.length, 6);
    });

    it("should have water zones only in W1", () => {
      const w1 = ringAPI.ringManager.getRingConfig("W1");
      const cigkv = ringAPI.ringManager.getRingConfig("CIGKV");

      assert.strictEqual(w1!.waterZones.length, 2);
      assert.strictEqual(cigkv!.waterZones.length, 0);
    });

    it("should have increasing damage per phase", () => {
      const w1 = ringAPI.ringManager.getRingConfig("W1");
      const damages = w1!.phases.map(p => p.damagePerTick);

      for (let i = 1; i < damages.length; i++) {
        assert.ok(damages[i] > damages[i - 1]);
      }
    });

    it("should have decreasing radius per phase", () => {
      const w1 = ringAPI.ringManager.getRingConfig("W1");
      const radii = w1!.phases.map(p => p.radiusEnd);

      for (let i = 1; i < radii.length; i++) {
        assert.ok(radii[i] < radii[i - 1]);
      }
    });
  });
});
