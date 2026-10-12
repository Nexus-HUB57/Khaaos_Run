/**
 * KHAAOS RUN — Full End-to-End Pipeline
 * ======================================
 * Single narrative test chaining every pure game system:
 *
 *   queue → match → lobby ready → countdown → match start
 *   → seeded loot → AOI interest → lag-compensated PvP
 *   → elimination → ELO/XP ranking → economy burn on loot value
 *
 * No DB / HTTP required. Mirrors production modules.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MatchmakingAlgorithm,
  DEFAULT_CONFIG,
} from "../../server/game/matchmaking-algorithm.js";

// ─── Minimal ports of production pure logic ────────────────────────────────

function createRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const RARITY_MULT = { COMUM: 1, RARO: 2.8, EPICO: 7.5, LENDARIO: 22, MITICO: 65 };
const BASE_PRICE = { ARMA: 120, DEFESA: 100, CURATIVO: 40, UTILIDADE: 80 };
const RARITY_W = { COMUM: 55, RARO: 28, EPICO: 12, LENDARIO: 4, MITICO: 1 };

function rollRarity(rng) {
  const total = Object.values(RARITY_W).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [k, w] of Object.entries(RARITY_W)) {
    r -= w;
    if (r <= 0) return k;
  }
  return "COMUM";
}

function generateLoot(seed, count) {
  const rng = createRng(seed);
  const items = [];
  let attempts = 0;
  while (items.length < count && attempts < count * 50) {
    attempts++;
    const posX = 10 + rng() * 80;
    const posY = 10 + rng() * 80;
    if (items.some((it) => Math.hypot(it.posX - posX, it.posY - posY) < 6)) continue;
    const types = Object.keys(BASE_PRICE);
    const type = types[Math.floor(rng() * types.length)];
    const rarity = rollRarity(rng);
    items.push({ id: items.length + 1, posX, posY, type, rarity });
  }
  return items;
}

function quoteItem(type, rarity, circulating = 0) {
  const base = (BASE_PRICE[type] ?? 50) * (RARITY_MULT[rarity] ?? 1);
  const adjusted = Math.round(base * (1 + circulating / 40));
  const burn = Math.round(adjusted * 0.35);
  return { baseKrc: Math.round(base), supplyAdjustedKrc: adjusted, burnAmount: burn };
}

class PositionHistory {
  constructor() {
    this.samples = [];
  }
  push(x, y, t) {
    this.samples.push({ t, x, y });
  }
  at(t) {
    if (!this.samples.length) return null;
    if (this.samples.length === 1) return { x: this.samples[0].x, y: this.samples[0].y };
    if (t <= this.samples[0].t) return { x: this.samples[0].x, y: this.samples[0].y };
    const last = this.samples[this.samples.length - 1];
    if (t >= last.t) return { x: last.x, y: last.y };
    for (let i = 0; i < this.samples.length - 1; i++) {
      const a = this.samples[i];
      const b = this.samples[i + 1];
      if (t >= a.t && t <= b.t) {
        const u = (t - a.t) / Math.max(1, b.t - a.t);
        return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      }
    }
    return { x: last.x, y: last.y };
  }
}

function lagHit(attackerHist, targetHist, attackerNow, targetNow, range, serverT, clientT) {
  let rewindMs = serverT - clientT;
  rewindMs = Math.max(0, Math.min(250, rewindMs));
  const rewindT = serverT - rewindMs;
  const tPos = targetHist.at(rewindT) ?? targetNow;
  const aPos = attackerHist.at(rewindT) ?? attackerNow;
  const dist = Math.hypot(aPos.x - tPos.x, aPos.y - tPos.y);
  return { hit: dist <= range, dist, rewindMs };
}

class SpatialGrid {
  constructor(cellSize = 15) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }
  key(x, y) {
    return `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}`;
  }
  insert(e) {
    const k = this.key(e.posX, e.posY);
    if (!this.cells.has(k)) this.cells.set(k, new Set());
    // remove old
    for (const set of this.cells.values()) {
      for (const x of [...set]) if (x.id === e.id) set.delete(x);
    }
    this.cells.get(k).add(e);
  }
  queryRadius(x, y, r) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const out = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const set = this.cells.get(`${cx + dx}:${cy + dy}`);
        if (set) out.push(...set);
      }
    }
    return out.filter((e) => Math.hypot(e.posX - x, e.posY - y) <= r);
  }
}

const K = 32;
function ratingDelta(rating, fieldAvg, placement, total, isWinner) {
  const expected = 1 / (1 + Math.pow(10, (fieldAvg - rating) / 400));
  if (isWinner) return Math.round(K * (1 - expected));
  const pf = placement / Math.max(2, total);
  const score = Math.max(0, 0.35 - pf * 0.35);
  return Math.round(K * (score - expected));
}

function xpGain(placement, total, kills) {
  let base = 15;
  if (placement === 1) base = 120;
  else if (placement <= 3) base = 80;
  else if (placement <= Math.ceil(total * 0.3)) base = 50;
  else if (placement <= Math.ceil(total * 0.5)) base = 30;
  return base + kills * 12;
}

// ─── Full pipeline ─────────────────────────────────────────────────────────

describe("FULL E2E PIPELINE", () => {
  it("queue → match → lobby → zone → combat → rank → economy", () => {
    // 1. MATCHMAKING
    const matched = [];
    const mm = new MatchmakingAlgorithm({
      config: { ...DEFAULT_CONFIG, minPlayers: 2, maxPlayers: 10 },
      onMatch: (players) => matched.push(players),
    });
    mm.enqueue({ userId: "alpha", rating: 1000, mode: "solo", displayName: "Alpha" });
    mm.enqueue({ userId: "bravo", rating: 1040, mode: "solo", displayName: "Bravo" });
    mm.enqueue({ userId: "charlie", rating: 980, mode: "solo", displayName: "Charlie" });
    const formed = mm.tick();
    assert.equal(formed.length, 1);
    assert.equal(matched[0].length, 3);
    assert.equal(mm.size, 0);

    const roster = matched[0];
    const roomId = `mm_${Date.now()}`;

    // 2. LOBBY
    const room = {
      id: roomId,
      status: "LOBBY",
      hostId: roster[0].userId,
      players: roster.map((p, i) => ({
        userId: p.userId,
        rating: p.rating,
        isReady: false,
        isHost: i === 0,
        status: "VIVO",
        kills: 0,
        hp: 100,
        posX: 30 + i * 10,
        posY: 40,
        history: new PositionHistory(),
      })),
    };

    // all ready → countdown
    for (const p of room.players) p.isReady = true;
    assert.ok(room.players.every((p) => p.isReady));
    room.status = "COUNTDOWN";
    room.countdown = 10;
    while (room.countdown > 0) room.countdown -= 1;
    room.status = "IN_PROGRESS";
    assert.equal(room.status, "IN_PROGRESS");

    // 3. SEEDED LOOT (replayable)
    const seed = hashStringToSeed(roomId);
    const loot = generateLoot(seed, 10);
    const lootAgain = generateLoot(seed, 10);
    assert.deepEqual(
      loot.map((l) => [l.posX, l.posY, l.rarity]),
      lootAgain.map((l) => [l.posX, l.posY, l.rarity]),
    );
    assert.ok(loot.length >= 5);

    // 4. SPATIAL AOI
    const grid = new SpatialGrid(15);
    for (const p of room.players) {
      p.history.push(p.posX, p.posY, 1000);
      grid.insert({ id: p.userId, posX: p.posX, posY: p.posY });
    }
    for (const item of loot) {
      grid.insert({ id: `loot-${item.id}`, posX: item.posX, posY: item.posY });
    }

    const alpha = room.players.find((p) => p.userId === "alpha");
    const visible = grid.queryRadius(alpha.posX, alpha.posY, 25);
    assert.ok(visible.some((e) => e.id === "alpha"));

    // 5. LAG-COMPENSATED COMBAT
    const now = 5000;
    const bravo = room.players.find((p) => p.userId === "bravo");
    // At shot time: bravo within 6 units of alpha
    alpha.history.push(alpha.posX, alpha.posY, now - 100);
    bravo.history.push(alpha.posX + 5, alpha.posY, now - 100);
    // Bravo flees
    bravo.posX = alpha.posX + 40;
    bravo.posY = alpha.posY + 40;
    bravo.history.push(bravo.posX, bravo.posY, now);
    grid.insert({ id: bravo.userId, posX: bravo.posX, posY: bravo.posY });

    const shot = lagHit(
      alpha.history,
      bravo.history,
      { x: alpha.posX, y: alpha.posY },
      { x: bravo.posX, y: bravo.posY },
      8,
      now,
      now - 100,
    );
    assert.equal(shot.hit, true, "lag compensation must allow fair hit");
    bravo.hp = 0;
    bravo.status = "ELIMINADO";
    alpha.kills += 1;

    // Charlie still alive — eliminate for clean 1st
    const charlie = room.players.find((p) => p.userId === "charlie");
    charlie.hp = 0;
    charlie.status = "ELIMINADO";

    const alive = room.players.filter((p) => p.status === "VIVO");
    assert.equal(alive.length, 1);
    assert.equal(alive[0].userId, "alpha");
    room.status = "FINISHED";
    room.winnerId = "alpha";

    // 6. RANKING
    const ordered = [
      { userId: "alpha", placement: 1, kills: 1, isWinner: true, rating: alpha.rating },
      { userId: "bravo", placement: 2, kills: 0, isWinner: false, rating: bravo.rating },
      { userId: "charlie", placement: 3, kills: 0, isWinner: false, rating: charlie.rating },
    ];
    const fieldAvg = ordered.reduce((s, p) => s + p.rating, 0) / ordered.length;
    const results = ordered.map((p) => {
      const delta = ratingDelta(p.rating, fieldAvg, p.placement, ordered.length, p.isWinner);
      return {
        ...p,
        delta,
        ratingAfter: Math.max(100, p.rating + delta),
        xp: xpGain(p.placement, ordered.length, p.kills),
      };
    });

    const winner = results.find((r) => r.userId === "alpha");
    assert.ok(winner.delta > 0);
    assert.equal(winner.xp, 120 + 12);
    assert.ok(results.every((r) => r.ratingAfter >= 100));

    // 7. ECONOMY — loot from this match is a net KRC sink if sold
    let totalBurn = 0;
    for (const item of loot) {
      totalBurn += quoteItem(item.type, item.rarity, 2).burnAmount;
    }
    assert.ok(totalBurn > 0);

    // Final invariant snapshot
    assert.equal(room.status, "FINISHED");
    assert.equal(room.winnerId, "alpha");
    assert.ok(loot.length > 0);
    assert.ok(winner.ratingAfter >= winner.rating);
  });
});
