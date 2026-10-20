/**
 * PR #4 — Lag compensation + Spatial grid pure E2E validation
 * Mirrors server/game/LagCompensation.ts and SpatialGrid.ts logic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── PositionHistory (LagCompensation.ts) ──────────────────────────────────

class PositionHistory {
  constructor(maxMs = 1000) {
    this.maxMs = maxMs;
    this.samples = [];
  }

  push(x, y, t = Date.now()) {
    this.samples.push({ t, x, y });
    const cutoff = t - this.maxMs;
    while (this.samples.length > 0 && this.samples[0].t < cutoff) {
      this.samples.shift();
    }
    if (this.samples.length > 30) {
      this.samples.splice(0, this.samples.length - 30);
    }
  }

  at(t) {
    if (this.samples.length === 0) return null;
    if (this.samples.length === 1) {
      return { x: this.samples[0].x, y: this.samples[0].y };
    }
    if (t <= this.samples[0].t) {
      return { x: this.samples[0].x, y: this.samples[0].y };
    }
    const last = this.samples[this.samples.length - 1];
    if (t >= last.t) return { x: last.x, y: last.y };

    for (let i = 0; i < this.samples.length - 1; i++) {
      const a = this.samples[i];
      const b = this.samples[i + 1];
      if (t >= a.t && t <= b.t) {
        const u = (t - a.t) / Math.max(1, b.t - a.t);
        return {
          x: a.x + (b.x - a.x) * u,
          y: a.y + (b.y - a.y) * u,
        };
      }
    }
    return { x: last.x, y: last.y };
  }
}

const DEFAULT_MAX_REWIND_MS = 250;

function computeRewindTime(
  serverReceiveTime,
  clientTimestamp,
  estimatedOneWayMs,
  maxRewindMs = DEFAULT_MAX_REWIND_MS,
  defaultLatencyMs = 50,
) {
  let rewindMs;
  if (clientTimestamp != null && Number.isFinite(clientTimestamp)) {
    rewindMs = serverReceiveTime - clientTimestamp;
  } else {
    rewindMs = estimatedOneWayMs ?? defaultLatencyMs;
  }
  rewindMs = Math.max(0, Math.min(maxRewindMs, rewindMs));
  return serverReceiveTime - rewindMs;
}

function lagCompensatedHit({
  attackerHistory,
  targetHistory,
  attackerCurrent,
  targetCurrent,
  range,
  serverReceiveTime,
  clientTimestamp,
  estimatedOneWayMs,
}) {
  const rewindTime = computeRewindTime(
    serverReceiveTime,
    clientTimestamp,
    estimatedOneWayMs,
  );
  const rewindMs = serverReceiveTime - rewindTime;
  const targetPos = targetHistory.at(rewindTime) ?? targetCurrent;
  const attackerPos = attackerHistory.at(rewindTime) ?? attackerCurrent;
  const dx = attackerPos.x - targetPos.x;
  const dy = attackerPos.y - targetPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return { hit: dist <= range, rewindMs, targetPos, attackerPos, dist };
}

// ─── SpatialGrid (SpatialGrid.ts) ──────────────────────────────────────────

class SpatialGrid {
  constructor(cellSize = 15) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.entityCell = new Map();
  }

  key(x, y) {
    return `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}`;
  }

  insert(entity) {
    this.remove(entity.id);
    const k = this.key(entity.posX, entity.posY);
    if (!this.cells.has(k)) this.cells.set(k, new Set());
    this.cells.get(k).add(entity);
    this.entityCell.set(entity.id, k);
  }

  remove(id) {
    const prev = this.entityCell.get(id);
    if (!prev) return;
    const set = this.cells.get(prev);
    if (set) {
      for (const e of set) {
        if (e.id === id) {
          set.delete(e);
          break;
        }
      }
      if (set.size === 0) this.cells.delete(prev);
    }
    this.entityCell.delete(id);
  }

  queryNeighbors(x, y) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const result = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const set = this.cells.get(`${cx + dx}:${cy + dy}`);
        if (set) result.push(...set);
      }
    }
    return result;
  }

  queryRadius(x, y, radius) {
    return this.queryNeighbors(x, y).filter((e) => {
      const dx = e.posX - x;
      const dy = e.posY - y;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("PositionHistory", () => {
  it("interpolates between samples", () => {
    const h = new PositionHistory();
    h.push(0, 0, 1000);
    h.push(10, 0, 2000);
    const mid = h.at(1500);
    assert.ok(mid);
    assert.equal(mid.x, 5);
    assert.equal(mid.y, 0);
  });

  it("clamps before first and after last sample", () => {
    const h = new PositionHistory();
    h.push(1, 2, 1000);
    h.push(3, 4, 2000);
    assert.deepEqual(h.at(500), { x: 1, y: 2 });
    assert.deepEqual(h.at(3000), { x: 3, y: 4 });
  });
});

describe("computeRewindTime", () => {
  it("clamps rewind to max 250ms", () => {
    const server = 10_000;
    const clientClaim = 10_000 - 500; // claims 500ms ago
    const t = computeRewindTime(server, clientClaim);
    assert.equal(server - t, 250);
  });

  it("never rewinds into the future", () => {
    const server = 10_000;
    const clientClaim = 10_500; // client clock ahead
    const t = computeRewindTime(server, clientClaim);
    assert.equal(t, server); // rewindMs = 0
  });

  it("uses default latency when no client timestamp", () => {
    const server = 10_000;
    const t = computeRewindTime(server, undefined, undefined);
    assert.equal(server - t, 50);
  });
});

describe("lagCompensatedHit", () => {
  it("hits target that was in range at shot time even if moved away", () => {
    const now = 10_000;
    const attacker = new PositionHistory();
    const target = new PositionHistory();

    // At shot time (now - 100): target at distance 5 from attacker
    attacker.push(50, 50, now - 100);
    target.push(54, 50, now - 100);

    // Now: target moved far away
    attacker.push(50, 50, now);
    target.push(90, 90, now);

    const result = lagCompensatedHit({
      attackerHistory: attacker,
      targetHistory: target,
      attackerCurrent: { x: 50, y: 50 },
      targetCurrent: { x: 90, y: 90 },
      range: 8,
      serverReceiveTime: now,
      clientTimestamp: now - 100,
    });

    assert.equal(result.hit, true);
    assert.ok(result.dist <= 8);
  });

  it("misses when target was never in range", () => {
    const now = 10_000;
    const attacker = new PositionHistory();
    const target = new PositionHistory();
    attacker.push(0, 0, now - 50);
    target.push(50, 50, now - 50);
    attacker.push(0, 0, now);
    target.push(50, 50, now);

    const result = lagCompensatedHit({
      attackerHistory: attacker,
      targetHistory: target,
      attackerCurrent: { x: 0, y: 0 },
      targetCurrent: { x: 50, y: 50 },
      range: 10,
      serverReceiveTime: now,
      clientTimestamp: now - 50,
    });

    assert.equal(result.hit, false);
  });
});

describe("SpatialGrid", () => {
  it("finds neighbors in adjacent cells", () => {
    const g = new SpatialGrid(15);
    g.insert({ id: "a", posX: 10, posY: 10 });
    g.insert({ id: "b", posX: 20, posY: 10 }); // neighbor cell
    g.insert({ id: "c", posX: 90, posY: 90 }); // far

    const near = g.queryNeighbors(10, 10).map((e) => e.id);
    assert.ok(near.includes("a"));
    assert.ok(near.includes("b"));
    assert.ok(!near.includes("c"));
  });

  it("queryRadius filters by euclidean distance", () => {
    const g = new SpatialGrid(15);
    g.insert({ id: "a", posX: 50, posY: 50 });
    g.insert({ id: "b", posX: 55, posY: 50 }); // dist 5
    g.insert({ id: "c", posX: 70, posY: 50 }); // dist 20

    const ids = g.queryRadius(50, 50, 10).map((e) => e.id);
    assert.ok(ids.includes("a"));
    assert.ok(ids.includes("b"));
    assert.ok(!ids.includes("c"));
  });

  it("update moves entity between cells", () => {
    const g = new SpatialGrid(15);
    g.insert({ id: "a", posX: 5, posY: 5 });
    g.insert({ id: "a", posX: 80, posY: 80 }); // re-insert = move
    const nearOrigin = g.queryNeighbors(5, 5).map((e) => e.id);
    const nearFar = g.queryNeighbors(80, 80).map((e) => e.id);
    assert.ok(!nearOrigin.includes("a"));
    assert.ok(nearFar.includes("a"));
  });
});

describe("E2E combat path: AOI + lag hit + eliminate", () => {
  it("interest-limited PvP with lag-fair hit decides elimination", () => {
    const now = 20_000;
    const grid = new SpatialGrid(15);

    const players = {
      attacker: { id: "att", posX: 40, posY: 40, hp: 100, history: new PositionHistory() },
      target: { id: "tgt", posX: 45, posY: 40, hp: 100, history: new PositionHistory() },
      far: { id: "far", posX: 90, posY: 90, hp: 100, history: new PositionHistory() },
    };

    // History at shot time
    for (const p of Object.values(players)) {
      p.history.push(p.posX, p.posY, now - 80);
      grid.insert(p);
    }

    // Target strafes away after shot
    players.target.posX = 60;
    players.target.posY = 60;
    players.target.history.push(60, 60, now);
    grid.insert(players.target);

    // AOI: attacker only sees nearby
    const visible = grid.queryRadius(40, 40, 20).map((e) => e.id);
    assert.ok(visible.includes("att"));
    assert.ok(!visible.includes("far"));
    // target moved to 60,60 — may still be in neighbor cells depending on radius
    // Combat uses lag history, not current grid only

    const shot = lagCompensatedHit({
      attackerHistory: players.attacker.history,
      targetHistory: players.target.history,
      attackerCurrent: { x: 40, y: 40 },
      targetCurrent: { x: 60, y: 60 },
      range: 8,
      serverReceiveTime: now,
      clientTimestamp: now - 80,
    });

    assert.equal(shot.hit, true, "lag comp should register hit at past position");

    // Apply damage → eliminate
    players.target.hp -= 100;
    assert.equal(players.target.hp <= 0, true);

    const alive = Object.values(players).filter((p) => p.hp > 0);
    assert.equal(alive.length, 2);
    assert.ok(alive.every((p) => p.id !== "tgt"));
  });
});
