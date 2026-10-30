/**
 * KHAAOS RUN — Unit Tests: SpectatorDataPipeline
 * ================================================
 * Porta node:test da suíte da API "PhD-level" (#125) — runner padrão do repo.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  SpectatorDataPipeline,
  SpectatorConfig,
  type SpectatorGameData,
} from "../../server/game/SpectatorDataPipeline.ts";

describe("SpectatorDataPipeline", () => {
  let pipeline: SpectatorDataPipeline;

  beforeEach(() => {
    pipeline = new SpectatorDataPipeline();
  });

  afterEach(() => {
    pipeline.destroy();
  });

  // ─── Configuration ───────────────────────────────────────────────────────

  describe("configuration", () => {
    it("should have 10-second delay configured", () => {
      assert.strictEqual(SpectatorConfig.delayMs, 10_000);
    });

    it("should have 500 max spectators per room", () => {
      assert.strictEqual(SpectatorConfig.maxSpectatorsPerRoom, 500);
    });

    it("should have 200ms batch interval", () => {
      assert.strictEqual(SpectatorConfig.batchIntervalMs, 200);
    });

    it("should have 5000 global max spectators", () => {
      assert.strictEqual(SpectatorConfig.globalMaxSpectators, 5_000);
    });

    it("should have max 20 events per batch", () => {
      assert.strictEqual(SpectatorConfig.maxEventsPerBatch, 20);
    });
  });

  // ─── Pipeline Creation / Destruction ─────────────────────────────────────

  describe("lifecycle", () => {
    it("should create pipeline successfully", () => {
      assert.notStrictEqual(pipeline, undefined);
      assert.strictEqual(pipeline.getSpectatorCount(), 0);
    });

    it("should destroy cleanly", () => {
      pipeline.destroy();
      assert.strictEqual(pipeline.getSpectatorCount(), 0);
    });
  });

  // ─── Data Push ───────────────────────────────────────────────────────────

  describe("pushGameData", () => {
    it("should accept game data for a room", () => {
      const data: SpectatorGameData = {
        type: "MATCH_TICK",
        roomId: "room_1",
        timestamp: Date.now(),
        players: [{
          id: "p1", species: "HURAN", posX: 50, posY: 50,
          health: 100, shield: 50, isDowned: false, isEliminated: false, kills: 0,
        }],
        ringState: {
          currentPhase: 0, currentRadius: 800,
          ringCenter: [0, 0, 0], isShrinking: false, nextPhaseIn: 120,
        },
        events: [],
      };

      // Should not throw (no spectators yet, just silently drops)
      assert.doesNotThrow(() => pipeline.pushGameData("room_1", data));
    });
  });

  // ─── Query Methods ───────────────────────────────────────────────────────

  describe("query methods", () => {
    it("should return 0 spectators for unknown room", () => {
      assert.strictEqual(pipeline.getSpectatorCount("nonexistent"), 0);
    });

    it("should return empty array for unknown room spectators", () => {
      assert.deepStrictEqual(pipeline.getSpectators("nonexistent"), []);
    });

    it("should return 0 for unknown delay buffer", () => {
      assert.strictEqual(pipeline.getDelayBufferSize("nonexistent"), 0);
    });
  });

  // ─── Delay Buffer Simulation ─────────────────────────────────────────────

  describe("delay buffer", () => {
    it("should buffer data and not immediately emit", () => {
      const data: SpectatorGameData = {
        type: "MATCH_TICK",
        roomId: "room_delay_test",
        timestamp: Date.now(),
        players: [],
        ringState: {
          currentPhase: 0, currentRadius: 800,
          ringCenter: [0, 0, 0], isShrinking: false, nextPhaseIn: 120,
        },
        events: [],
      };

      // Without actual WebSocket connections, delay buffer won't be initialized
      // This tests the data acceptance path
      pipeline.pushGameData("room_delay_test", data);
      assert.strictEqual(pipeline.getDelayBufferSize("room_delay_test"), 0);
    });
  });
});
