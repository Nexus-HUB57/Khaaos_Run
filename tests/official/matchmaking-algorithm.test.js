/**
 * Unit tests for skill-based matchmaking algorithm (JS).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MatchmakingAlgorithm,
  DEFAULT_CONFIG,
} from "../../server/game/matchmaking-algorithm.js";

describe("MatchmakingAlgorithm", () => {
  function createMm(overrides = {}) {
    return new MatchmakingAlgorithm({
      config: {
        ...DEFAULT_CONFIG,
        minPlayers: 2,
        maxPlayers: 4,
        ...overrides,
      },
    });
  }

  it("forms a match when two players are within initial delta", () => {
    const mm = createMm({ initialDelta: 100 });
    mm.enqueue({ userId: "a", rating: 1000, mode: "solo" });
    mm.enqueue({ userId: "b", rating: 1050, mode: "solo" });
    const formed = mm.tick();
    assert.equal(formed.length, 1);
    assert.deepEqual(formed[0].map((p) => p.userId).sort(), ["a", "b"]);
    assert.equal(mm.size, 0);
  });

  it("does not match players far apart on first tick", () => {
    const mm = createMm({ initialDelta: 100 });
    mm.enqueue({ userId: "a", rating: 1000, mode: "solo" });
    mm.enqueue({ userId: "b", rating: 1400, mode: "solo" });
    assert.equal(mm.tick().length, 0);
    assert.equal(mm.size, 2);
  });

  it("does not mix solo and duo modes", () => {
    const mm = createMm();
    mm.enqueue({ userId: "a", rating: 1000, mode: "solo" });
    mm.enqueue({ userId: "b", rating: 1000, mode: "duo" });
    assert.equal(mm.tick().length, 0);
    assert.equal(mm.size, 2);
  });

  it("prefers closer rating when more candidates than maxPlayers", () => {
    const mm = createMm({ initialDelta: 500, maxPlayers: 2, minPlayers: 2 });
    mm.enqueue({ userId: "seed", rating: 1000, mode: "solo" });
    mm.enqueue({ userId: "near", rating: 1010, mode: "solo" });
    mm.enqueue({ userId: "far", rating: 1300, mode: "solo" });
    const formed = mm.tick();
    assert.equal(formed.length, 1);
    const ids = formed[0].map((p) => p.userId);
    assert.ok(ids.includes("seed"));
    assert.ok(ids.includes("near"));
    assert.ok(!ids.includes("far"));
  });

  it("dequeue removes player from queue", () => {
    const mm = createMm();
    mm.enqueue({ userId: "a", rating: 1000 });
    assert.equal(mm.isQueued("a"), true);
    mm.dequeue("a");
    assert.equal(mm.isQueued("a"), false);
    assert.equal(mm.size, 0);
  });

  it("grows skill window with wait time", () => {
    const mm = createMm({
      initialDelta: 100,
      deltaGrowthPerSecond: 15,
      maxDelta: 600,
    });
    mm.enqueue({ userId: "a", rating: 1000 });
    const entry = mm.queue.get("a");
    entry.enqueuedAt = Date.now() - 20_000;
    mm.tick();
    assert.ok(entry.currentDelta >= 390);
    assert.ok(entry.currentDelta <= 410);
  });
});
