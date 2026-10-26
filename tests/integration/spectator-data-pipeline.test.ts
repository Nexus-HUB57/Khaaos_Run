import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { SpectatorDataPipeline } from "../../server/game/SpectatorDataPipeline.ts";

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
    assert.strictEqual(config.delayMs, 10000);
  });

  it("should have 500 max spectators per room by default", () => {
    const config = pipeline.getConfig();
    assert.strictEqual(config.maxSpectatorsPerRoom, 500);
  });

  it("should have 200ms batch interval by default", () => {
    const config = pipeline.getConfig();
    assert.strictEqual(config.batchIntervalMs, 200);
  });

  it("should have 5000 global max spectators by default", () => {
    const config = pipeline.getConfig();
    assert.strictEqual(config.globalMaxSpectators, 5000);
  });

  it("should have 20 max events per batch by default", () => {
    const config = pipeline.getConfig();
    assert.strictEqual(config.maxEventsPerBatch, 20);
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  it("should create pipeline successfully", () => {
    assert.notStrictEqual(pipeline, undefined);
    const config = pipeline.getConfig();
    assert.notStrictEqual(config, undefined);
  });

  it("should destroy pipeline successfully", () => {
    pipeline.addSpectator("room-1", "spectator-1");
    pipeline.destroy();
    // After destroy, operations should be no-ops
    const count = pipeline.getSpectatorCount("room-1");
    assert.strictEqual(count, 0);
  });

  // ─── pushGameData ─────────────────────────────────────────────────────────

  it("should accept game data push", () => {
    pipeline.pushGameData("room-1", { type: "position", x: 100, y: 200 });
    const bufferSize = pipeline.getDelayBufferSize("room-1");
    assert.strictEqual(bufferSize, 1);
  });

  it("should accumulate multiple game data pushes", () => {
    pipeline.pushGameData("room-1", { type: "position", x: 100 });
    pipeline.pushGameData("room-1", { type: "position", x: 200 });
    pipeline.pushGameData("room-1", { type: "position", x: 300 });
    assert.strictEqual(pipeline.getDelayBufferSize("room-1"), 3);
  });

  // ─── Query Methods ────────────────────────────────────────────────────────

  it("should return spectator count for a room", () => {
    pipeline.addSpectator("room-1", "spec-1");
    pipeline.addSpectator("room-1", "spec-2");
    assert.strictEqual(pipeline.getSpectatorCount("room-1"), 2);
  });

  it("should return 0 for non-existent room", () => {
    assert.strictEqual(pipeline.getSpectatorCount("nonexistent"), 0);
  });

  it("should return global spectator count when no roomId provided", () => {
    pipeline.addSpectator("room-1", "spec-1");
    pipeline.addSpectator("room-2", "spec-2");
    pipeline.addSpectator("room-2", "spec-3");
    assert.strictEqual(pipeline.getSpectatorCount(), 3);
  });

  it("should return spectators for a room", () => {
    pipeline.addSpectator("room-1", "spec-1", "follow");
    pipeline.addSpectator("room-1", "spec-2", "free");
    const spectators = pipeline.getSpectators("room-1");
    assert.strictEqual(spectators.length, 2);
    assert.strictEqual(spectators[0].spectatorId, "spec-1");
    assert.strictEqual(spectators[1].cameraMode, "free");
  });

  // ─── Delay Buffer ─────────────────────────────────────────────────────────

  it("should track delay buffer size per room", () => {
    pipeline.pushGameData("room-1", { tick: 1 });
    pipeline.pushGameData("room-1", { tick: 2 });
    pipeline.pushGameData("room-2", { tick: 1 });
    assert.strictEqual(pipeline.getDelayBufferSize("room-1"), 2);
    assert.strictEqual(pipeline.getDelayBufferSize("room-2"), 1);
    assert.strictEqual(pipeline.getDelayBufferSize("room-3"), 0);
  });

  it("should respect max spectators per room", () => {
    const smallPipeline = new SpectatorDataPipeline({ maxSpectatorsPerRoom: 2 });
    assert.strictEqual(smallPipeline.addSpectator("room-1", "spec-1"), true);
    assert.strictEqual(smallPipeline.addSpectator("room-1", "spec-2"), true);
    assert.strictEqual(smallPipeline.addSpectator("room-1", "spec-3"), false);
    smallPipeline.destroy();
  });

  it("should allow removing spectators", () => {
    pipeline.addSpectator("room-1", "spec-1");
    assert.strictEqual(pipeline.getSpectatorCount("room-1"), 1);
    pipeline.removeSpectator("room-1", "spec-1");
    assert.strictEqual(pipeline.getSpectatorCount("room-1"), 0);
  });

  // ─── Global Capacity ──────────────────────────────────────────────────────

  it("should respect global max spectators", () => {
    const smallPipeline = new SpectatorDataPipeline({ globalMaxSpectators: 2 });
    assert.strictEqual(smallPipeline.addSpectator("room-1", "spec-1"), true);
    assert.strictEqual(smallPipeline.addSpectator("room-2", "spec-2"), true);
    assert.strictEqual(smallPipeline.addSpectator("room-3", "spec-3"), false);
    smallPipeline.destroy();
  });

  // ─── Push after destroy ───────────────────────────────────────────────────

  it("should not accept game data after destroy", () => {
    pipeline.pushGameData("room-1", { tick: 1 });
    assert.strictEqual(pipeline.getDelayBufferSize("room-1"), 1);
    pipeline.destroy();
    pipeline.pushGameData("room-1", { tick: 2 });
    assert.strictEqual(pipeline.getDelayBufferSize("room-1"), 0);
  });
});
