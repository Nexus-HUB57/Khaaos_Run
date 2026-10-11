/**
 * KHAAOS RUN — End-to-end core validation (no DB / no HTTP server required)
 * ========================================================================
 * Validates the pure logic chain:
 *   queue → match → lobby readiness → ELO rating deltas → placement XP
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MatchmakingAlgorithm,
  DEFAULT_CONFIG,
} from "../../server/game/matchmaking-algorithm.js";

// ─── Inline ranking pure functions (mirrors RankingService.ts) ─────────────

const K_FACTOR = 32;

function computeRatingDelta(
  playerRating,
  fieldAverageRating,
  placement,
  totalPlayers,
  isWinner,
) {
  const expected =
    1 / (1 + Math.pow(10, (fieldAverageRating - playerRating) / 400));

  if (isWinner) {
    return Math.round(K_FACTOR * (1 - expected));
  }

  const placementFactor = placement / Math.max(2, totalPlayers);
  const score = Math.max(0, 0.35 - placementFactor * 0.35);
  return Math.round(K_FACTOR * (score - expected));
}

function xpForPlacement(placement, totalPlayers) {
  if (placement === 1) return 120;
  if (placement <= 3) return 80;
  if (placement <= Math.ceil(totalPlayers * 0.3)) return 50;
  if (placement <= Math.ceil(totalPlayers * 0.5)) return 30;
  return 15;
}

function xpForKills(kills) {
  return kills * 12;
}

function applyPureRankings(participants) {
  const total = participants.length;
  const fieldAvg =
    participants.reduce((s, p) => s + (p.rating || 1000), 0) / total;

  return participants.map((p) => {
    const ratingBefore = p.rating || 1000;
    const delta = computeRatingDelta(
      ratingBefore,
      fieldAvg,
      p.placement,
      total,
      p.isWinner,
    );
    const xpGained = xpForPlacement(p.placement, total) + xpForKills(p.kills);
    return {
      userId: p.userId,
      placement: p.placement,
      kills: p.kills,
      xpGained,
      ratingBefore,
      ratingAfter: Math.max(100, ratingBefore + delta),
      delta,
    };
  });
}

// ─── Lobby state machine (mirrors RoomManager rules) ───────────────────────

function lobbyTransition(room, action) {
  const next = {
    ...room,
    players: room.players.map((p) => ({ ...p })),
  };

  switch (action.type) {
    case "set_ready": {
      const p = next.players.find((x) => x.userId === action.userId);
      if (p && next.status === "LOBBY") p.isReady = action.ready;
      const readyCount = next.players.filter((x) => x.isReady).length;
      if (
        next.status === "LOBBY" &&
        next.players.length >= next.minPlayersToStart &&
        readyCount === next.players.length
      ) {
        next.status = "COUNTDOWN";
        next.countdownSeconds = 10;
      }
      break;
    }
    case "host_start": {
      if (next.hostId !== action.userId) break;
      if (next.status !== "LOBBY") break;
      if (next.players.length < 1) break;
      next.status = "COUNTDOWN";
      next.countdownSeconds = 10;
      break;
    }
    case "countdown_tick": {
      if (next.status !== "COUNTDOWN") break;
      next.countdownSeconds -= 1;
      if (next.countdownSeconds <= 0) {
        next.status = "IN_PROGRESS";
        next.countdownSeconds = 0;
      }
      break;
    }
    case "eliminate": {
      if (next.status !== "IN_PROGRESS") break;
      const p = next.players.find((x) => x.userId === action.userId);
      if (p) p.status = "ELIMINADO";
      const alive = next.players.filter((x) => x.status === "VIVO");
      if (alive.length <= 1) {
        next.status = "FINISHED";
        next.winnerId = alive[0]?.userId ?? null;
      }
      break;
    }
    default:
      break;
  }
  return next;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("E2E core — matchmaking → lobby → ranking", () => {
  it("full path: 2 players queue, match, all ready, countdown, finish, ELO", () => {
    // 1) Matchmaking
    const matched = [];
    const mm = new MatchmakingAlgorithm({
      config: { ...DEFAULT_CONFIG, minPlayers: 2, maxPlayers: 10 },
      onMatch: (players) => matched.push(players),
    });

    mm.enqueue({ userId: "p1", rating: 1000, mode: "solo", displayName: "Alpha" });
    mm.enqueue({ userId: "p2", rating: 1020, mode: "solo", displayName: "Bravo" });
    const formed = mm.tick();
    assert.equal(formed.length, 1);
    assert.equal(matched.length, 1);
    assert.equal(mm.size, 0);

    const roster = matched[0];

    // 2) Lobby seats
    let room = {
      status: "LOBBY",
      hostId: roster[0].userId,
      minPlayersToStart: 2,
      countdownSeconds: 10,
      winnerId: null,
      players: roster.map((p, i) => ({
        userId: p.userId,
        isReady: false,
        isHost: i === 0,
        status: "VIVO",
        kills: 0,
        rating: p.rating,
      })),
    };

    // 3) Ready checks → auto COUNTDOWN
    room = lobbyTransition(room, { type: "set_ready", userId: "p1", ready: true });
    assert.equal(room.status, "LOBBY"); // not all ready yet
    room = lobbyTransition(room, { type: "set_ready", userId: "p2", ready: true });
    assert.equal(room.status, "COUNTDOWN");
    assert.equal(room.countdownSeconds, 10);

    // 4) Countdown → IN_PROGRESS
    for (let i = 0; i < 10; i++) {
      room = lobbyTransition(room, { type: "countdown_tick" });
    }
    assert.equal(room.status, "IN_PROGRESS");

    // 5) Combat simulation — p2 eliminated
    room.players.find((p) => p.userId === "p1").kills = 1;
    room = lobbyTransition(room, { type: "eliminate", userId: "p2" });
    assert.equal(room.status, "FINISHED");
    assert.equal(room.winnerId, "p1");

    // 6) Ranking
    const results = applyPureRankings([
      {
        userId: "p1",
        placement: 1,
        kills: 1,
        isWinner: true,
        rating: 1000,
      },
      {
        userId: "p2",
        placement: 2,
        kills: 0,
        isWinner: false,
        rating: 1020,
      },
    ]);

    const winner = results.find((r) => r.userId === "p1");
    const loser = results.find((r) => r.userId === "p2");

    assert.ok(winner.delta > 0, "winner should gain ELO");
    assert.ok(loser.delta <= 0, "loser should not gain ELO");
    assert.equal(winner.xpGained, 120 + 12); // placement 1 + 1 kill
    assert.equal(loser.xpGained, 80); // placement 2, 0 kills
    assert.ok(winner.ratingAfter >= 1000);
    assert.ok(loser.ratingAfter <= 1020);
  });

  it("host can force-start without all ready", () => {
    let room = {
      status: "LOBBY",
      hostId: "host",
      minPlayersToStart: 2,
      countdownSeconds: 10,
      winnerId: null,
      players: [
        { userId: "host", isReady: false, isHost: true, status: "VIVO", kills: 0 },
        { userId: "guest", isReady: false, isHost: false, status: "VIVO", kills: 0 },
      ],
    };
    room = lobbyTransition(room, { type: "host_start", userId: "guest" });
    assert.equal(room.status, "LOBBY"); // non-host ignored
    room = lobbyTransition(room, { type: "host_start", userId: "host" });
    assert.equal(room.status, "COUNTDOWN");
  });

  it("ELO underdog win gains more than favorite win", () => {
    const underdogWin = computeRatingDelta(1000, 1200, 1, 2, true);
    const favoriteWin = computeRatingDelta(1200, 1000, 1, 2, true);
    assert.ok(underdogWin > favoriteWin);
    assert.ok(underdogWin > 0);
    assert.ok(favoriteWin > 0);
  });

  it("rating floor is 100", () => {
    const results = applyPureRankings([
      { userId: "w", placement: 1, kills: 0, isWinner: true, rating: 1000 },
      { userId: "l", placement: 2, kills: 0, isWinner: false, rating: 100 },
    ]);
    const loser = results.find((r) => r.userId === "l");
    assert.ok(loser.ratingAfter >= 100);
  });
});

describe("E2E core — battle flow navigator rules", () => {
  function nextLocation(roomStatus, currentLocation, navigatedForId, roomId) {
    if (!roomStatus) return currentLocation;
    if (
      (roomStatus === "LOBBY" || roomStatus === "COUNTDOWN") &&
      navigatedForId !== roomId &&
      currentLocation !== "/lobby" &&
      currentLocation !== "/zona"
    ) {
      return "/lobby";
    }
    if (roomStatus === "IN_PROGRESS" && currentLocation !== "/zona") {
      return "/zona";
    }
    return currentLocation;
  }

  it("redirects match_found equivalent to /lobby", () => {
    assert.equal(nextLocation("LOBBY", "/dashboard", null, "room1"), "/lobby");
  });

  it("redirects IN_PROGRESS to /zona", () => {
    assert.equal(nextLocation("IN_PROGRESS", "/lobby", "room1", "room1"), "/zona");
  });

  it("does not loop when already on /lobby", () => {
    assert.equal(nextLocation("LOBBY", "/lobby", "room1", "room1"), "/lobby");
  });
});
