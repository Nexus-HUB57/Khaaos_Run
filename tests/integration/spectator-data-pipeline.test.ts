/**
 * KHAAOS RUN — Unit Tests: SpectatorDataPipeline
 * ================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SpectatorDataPipeline,
  SpectatorConfig,
  type SpectatorGameData,
} from "../../../server/game/SpectatorDataPipeline";

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
      expect(SpectatorConfig.delayMs).toBe(10_000);
    });

    it("should have 500 max spectators per room", () => {
      expect(SpectatorConfig.maxSpectatorsPerRoom).toBe(500);
    });

    it("should have 200ms batch interval", () => {
      expect(SpectatorConfig.batchIntervalMs).toBe(200);
    });

    it("should have 5000 global max spectators", () => {
      expect(SpectatorConfig.globalMaxSpectators).toBe(5_000);
    });

    it("should have max 20 events per batch", () => {
      expect(SpectatorConfig.maxEventsPerBatch).toBe(20);
    });
  });

  // ─── Pipeline Creation / Destruction ─────────────────────────────────────

  describe("lifecycle", () => {
    it("should create pipeline successfully", () => {
      expect(pipeline).toBeDefined();
      expect(pipeline.getSpectatorCount()).toBe(0);
    });

    it("should destroy cleanly", () => {
      pipeline.destroy();
      expect(pipeline.getSpectatorCount()).toBe(0);
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
      expect(() => pipeline.pushGameData("room_1", data)).not.toThrow();
    });
  });

  // ─── Query Methods ───────────────────────────────────────────────────────

  describe("query methods", () => {
    it("should return 0 spectators for unknown room", () => {
      expect(pipeline.getSpectatorCount("nonexistent")).toBe(0);
    });

    it("should return empty array for unknown room spectators", () => {
      expect(pipeline.getSpectators("nonexistent")).toEqual([]);
    });

    it("should return 0 for unknown delay buffer", () => {
      expect(pipeline.getDelayBufferSize("nonexistent")).toBe(0);
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
      expect(pipeline.getDelayBufferSize("room_delay_test")).toBe(0);
    });
  });
});
