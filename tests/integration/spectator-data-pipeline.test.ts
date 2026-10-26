import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SpectatorDataPipeline, DEFAULT_SPECTATOR_CONFIG } from "@game/SpectatorDataPipeline";

describe("SpectatorDataPipeline Unit Tests", () => {
  let pipeline: SpectatorDataPipeline;

  beforeEach(() => {
    pipeline = new SpectatorDataPipeline();
  });

  afterEach(() => {
    pipeline.destroy();
  });

  // ─── Configuration ────────────────────────────────────────────────────────

  it("should have 10s delay by default", () => {
    const config = pipeline.getConfig();
    expect(config.delayMs).toBe(10000);
  });

  it("should have 500 max spectators per room by default", () => {
    const config = pipeline.getConfig();
    expect(config.maxSpectatorsPerRoom).toBe(500);
  });

  it("should have 200ms batch interval by default", () => {
    const config = pipeline.getConfig();
    expect(config.batchIntervalMs).toBe(200);
  });

  it("should have 5000 global max spectators by default", () => {
    const config = pipeline.getConfig();
    expect(config.globalMaxSpectators).toBe(5000);
  });

  it("should have 20 max events per batch by default", () => {
    const config = pipeline.getConfig();
    expect(config.maxEventsPerBatch).toBe(20);
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  it("should create pipeline successfully", () => {
    expect(pipeline).toBeDefined();
    const config = pipeline.getConfig();
    expect(config).toBeDefined();
  });

  it("should destroy pipeline successfully", () => {
    pipeline.addSpectator("room-1", "spectator-1");
    pipeline.destroy();
    // After destroy, operations should be no-ops
    const count = pipeline.getSpectatorCount("room-1");
    expect(count).toBe(0);
  });

  // ─── pushGameData ─────────────────────────────────────────────────────────

  it("should accept game data push", () => {
    pipeline.pushGameData("room-1", { type: "position", x: 100, y: 200 });
    const bufferSize = pipeline.getDelayBufferSize("room-1");
    expect(bufferSize).toBe(1);
  });

  it("should accumulate multiple game data pushes", () => {
    pipeline.pushGameData("room-1", { type: "position", x: 100 });
    pipeline.pushGameData("room-1", { type: "position", x: 200 });
    pipeline.pushGameData("room-1", { type: "position", x: 300 });
    expect(pipeline.getDelayBufferSize("room-1")).toBe(3);
  });

  // ─── Query Methods ────────────────────────────────────────────────────────

  it("should return spectator count for a room", () => {
    pipeline.addSpectator("room-1", "spec-1");
    pipeline.addSpectator("room-1", "spec-2");
    expect(pipeline.getSpectatorCount("room-1")).toBe(2);
  });

  it("should return 0 for non-existent room", () => {
    expect(pipeline.getSpectatorCount("nonexistent")).toBe(0);
  });

  it("should return global spectator count when no roomId provided", () => {
    pipeline.addSpectator("room-1", "spec-1");
    pipeline.addSpectator("room-2", "spec-2");
    pipeline.addSpectator("room-2", "spec-3");
    expect(pipeline.getSpectatorCount()).toBe(3);
  });

  it("should return spectators for a room", () => {
    pipeline.addSpectator("room-1", "spec-1", "follow");
    pipeline.addSpectator("room-1", "spec-2", "free");
    const spectators = pipeline.getSpectators("room-1");
    expect(spectators).toHaveLength(2);
    expect(spectators[0].spectatorId).toBe("spec-1");
    expect(spectators[1].cameraMode).toBe("free");
  });

  // ─── Delay Buffer ─────────────────────────────────────────────────────────

  it("should track delay buffer size per room", () => {
    pipeline.pushGameData("room-1", { tick: 1 });
    pipeline.pushGameData("room-1", { tick: 2 });
    pipeline.pushGameData("room-2", { tick: 1 });
    expect(pipeline.getDelayBufferSize("room-1")).toBe(2);
    expect(pipeline.getDelayBufferSize("room-2")).toBe(1);
    expect(pipeline.getDelayBufferSize("room-3")).toBe(0);
  });

  it("should respect max spectators per room", () => {
    const smallPipeline = new SpectatorDataPipeline({ maxSpectatorsPerRoom: 2 });
    expect(smallPipeline.addSpectator("room-1", "spec-1")).toBe(true);
    expect(smallPipeline.addSpectator("room-1", "spec-2")).toBe(true);
    expect(smallPipeline.addSpectator("room-1", "spec-3")).toBe(false);
    smallPipeline.destroy();
  });

  it("should allow removing spectators", () => {
    pipeline.addSpectator("room-1", "spec-1");
    expect(pipeline.getSpectatorCount("room-1")).toBe(1);
    pipeline.removeSpectator("room-1", "spec-1");
    expect(pipeline.getSpectatorCount("room-1")).toBe(0);
  });

  // ─── Global Capacity ──────────────────────────────────────────────────────

  it("should respect global max spectators", () => {
    const smallPipeline = new SpectatorDataPipeline({ globalMaxSpectators: 2 });
    expect(smallPipeline.addSpectator("room-1", "spec-1")).toBe(true);
    expect(smallPipeline.addSpectator("room-2", "spec-2")).toBe(true);
    expect(smallPipeline.addSpectator("room-3", "spec-3")).toBe(false);
    smallPipeline.destroy();
  });

  // ─── Push after destroy ───────────────────────────────────────────────────

  it("should not accept game data after destroy", () => {
    pipeline.pushGameData("room-1", { tick: 1 });
    expect(pipeline.getDelayBufferSize("room-1")).toBe(1);
    pipeline.destroy();
    pipeline.pushGameData("room-1", { tick: 2 });
    expect(pipeline.getDelayBufferSize("room-1")).toBe(0);
  });
});
