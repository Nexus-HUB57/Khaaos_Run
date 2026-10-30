/**
 * KHAAOS RUN — Unit Tests: MatchFlow
 * =====================================
 * Porta node:test da suíte da API "PhD-level" (#125) — runner padrão do repo.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MatchFlow, DEFAULT_WORLD_PIPELINE } from "../../server/game/MatchFlow.ts";
import { EconomyMatchBridge } from "../../server/game/EconomyMatchBridge.ts";

describe("MatchFlow", () => {
  let matchFlow: MatchFlow;
  let economyBridge: EconomyMatchBridge;

  beforeEach(() => {
    economyBridge = new EconomyMatchBridge();
    matchFlow = new MatchFlow(
      { roomId: "test_match", maxPlayers: 100, countdownSeconds: 5 },
      economyBridge,
    );
  });

  // ─── Construction ────────────────────────────────────────────────────────

  describe("construction", () => {
    it("should create match in LOBBY state", () => {
      const state = matchFlow.getState();
      assert.strictEqual(state.status, "LOBBY");
      assert.strictEqual(state.roomId, "test_match");
    });

    it("should initialize with 0 players", () => {
      assert.strictEqual(matchFlow.getState().players.size, 0);
    });

    it("should initialize with 0 eliminations", () => {
      assert.strictEqual(matchFlow.getState().totalEliminations, 0);
    });

    it("should have 5 worlds in default pipeline", () => {
      assert.strictEqual(DEFAULT_WORLD_PIPELINE.length, 5);
    });
  });

  // ─── Default World Pipeline ──────────────────────────────────────────────

  describe("DEFAULT_WORLD_PIPELINE", () => {
    it("should have correct world order", () => {
      const ids = DEFAULT_WORLD_PIPELINE.map(w => w.worldId);
      assert.deepStrictEqual(ids, ["cigkv", "barburhen", "priadus", "ckesalth", "arukheea"]);
    });

    it("should have correct capacities", () => {
      assert.strictEqual(DEFAULT_WORLD_PIPELINE[0].capacity, 50);   // CIGKV
      assert.strictEqual(DEFAULT_WORLD_PIPELINE[1].capacity, 100);  // Barburhen
      assert.strictEqual(DEFAULT_WORLD_PIPELINE[2].capacity, 75);   // Priadus
      assert.strictEqual(DEFAULT_WORLD_PIPELINE[3].capacity, 60);   // Ckesalth
      assert.strictEqual(DEFAULT_WORLD_PIPELINE[4].capacity, 80);   // Arukheea
    });
  });

  // ─── Player Join ─────────────────────────────────────────────────────────

  describe("joinPlayer", () => {
    it("should allow players to join lobby", () => {
      const joined = matchFlow.joinPlayer({
        id: "player_1",
        displayName: "Operative Alpha",
        species: "HURAN",
        skinRarity: "COMUM",
        posX: 50,
        posY: 50,
        inWaterZone: false,
        worldId: "cigkv",
      });
      assert.strictEqual(joined, true);
      assert.strictEqual(matchFlow.getState().players.size, 1);
    });

    it("should reject duplicate player IDs", () => {
      matchFlow.joinPlayer({
        id: "player_1", displayName: "Alpha", species: "HURAN",
        skinRarity: "COMUM", posX: 50, posY: 50, inWaterZone: false, worldId: "cigkv",
      });
      const joined = matchFlow.joinPlayer({
        id: "player_1", displayName: "Alpha", species: "HURAN",
        skinRarity: "COMUM", posX: 50, posY: 50, inWaterZone: false, worldId: "cigkv",
      });
      assert.strictEqual(joined, false);
    });

    it("should set initial health to 100 and shield to 50", () => {
      matchFlow.joinPlayer({
        id: "player_1", displayName: "Alpha", species: "HURAN",
        skinRarity: "COMUM", posX: 50, posY: 50, inWaterZone: false, worldId: "cigkv",
      });
      const player = matchFlow.getState().players.get("player_1");
      assert.strictEqual(player?.health, 100);
      assert.strictEqual(player?.shield, 50);
      assert.strictEqual(player?.isDowned, false);
      assert.strictEqual(player?.isEliminated, false);
    });

    it("should respect max players limit", () => {
      const smallMatch = new MatchFlow(
        { roomId: "small_match", maxPlayers: 2 },
        economyBridge,
      );

      smallMatch.joinPlayer({
        id: "p1", displayName: "A", species: "HURAN",
        skinRarity: "COMUM", posX: 50, posY: 50, inWaterZone: false, worldId: "cigkv",
      });
      smallMatch.joinPlayer({
        id: "p2", displayName: "B", species: "VENEX",
        skinRarity: "COMUM", posX: 60, posY: 60, inWaterZone: false, worldId: "cigkv",
      });
      const joined = smallMatch.joinPlayer({
        id: "p3", displayName: "C", species: "KHAEL",
        skinRarity: "COMUM", posX: 70, posY: 70, inWaterZone: false, worldId: "cigkv",
      });
      assert.strictEqual(joined, false);
      smallMatch.destroy();
    });
  });

  // ─── Match Lifecycle ─────────────────────────────────────────────────────

  describe("match lifecycle", () => {
    it("should transition LOBBY → COUNTDOWN on startCountdown", () => {
      matchFlow.joinPlayer({
        id: "p1", displayName: "A", species: "HURAN",
        skinRarity: "COMUM", posX: 50, posY: 50, inWaterZone: false, worldId: "cigkv",
      });
      matchFlow.startCountdown();
      assert.strictEqual(matchFlow.getState().status, "COUNTDOWN");
      matchFlow.destroy();
    });

    it("should cancel countdown explicitly and restore lobby state", () => {
      matchFlow.startCountdown();
      assert.equal(matchFlow.cancelCountdown(), true);
      assert.equal(matchFlow.getState().status, "LOBBY");
      assert.equal(matchFlow.cancelCountdown(), false);
      matchFlow.destroy();
    });

    it("should not start a destroyed match after its countdown timeout", async () => {
      const shortMatch = new MatchFlow({ roomId: "destroyed_countdown", countdownSeconds: 0.02 }, economyBridge);
      let started = false;
      const originalStartMatch = shortMatch.startMatch.bind(shortMatch);
      shortMatch.startMatch = () => {
        started = true;
        originalStartMatch();
      };
      shortMatch.startCountdown();
      shortMatch.destroy();
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(started, false);
    });

    it("should not start countdown if not in LOBBY", () => {
      matchFlow.startCountdown();
      matchFlow.startCountdown(); // second call should be no-op
      // Status should remain COUNTDOWN (not error)
      assert.ok(["COUNTDOWN", "IN_PROGRESS"].includes(matchFlow.getState().status));
      matchFlow.destroy();
    });
  });

  // ─── Kill / Damage Pipeline ──────────────────────────────────────────────

  describe("kill pipeline", () => {
    it("should process kill and down victim", () => {
      matchFlow.joinPlayer({
        id: "killer", displayName: "K", species: "HURAN",
        skinRarity: "RARO", posX: 50, posY: 50, inWaterZone: false, worldId: "cigkv",
      });
      matchFlow.joinPlayer({
        id: "victim", displayName: "V", species: "VENEX",
        skinRarity: "COMUM", posX: 80, posY: 80, inWaterZone: false, worldId: "cigkv",
      });

      // 150 damage: 50 shield + 100 health = downed
      matchFlow.processKill("killer", "victim", 150, "AssaultRifle");

      const victim = matchFlow.getState().players.get("victim");
      assert.strictEqual(victim?.isDowned, true);
      assert.strictEqual(victim?.shield, 0);
      assert.strictEqual(victim?.health, 0);
    });

    it("should shield absorb damage before health", () => {
      matchFlow.joinPlayer({
        id: "killer", displayName: "K", species: "HURAN",
        skinRarity: "COMUM", posX: 50, posY: 50, inWaterZone: false, worldId: "cigkv",
      });
      matchFlow.joinPlayer({
        id: "victim", displayName: "V", species: "VENEX",
        skinRarity: "COMUM", posX: 80, posY: 80, inWaterZone: false, worldId: "cigkv",
      });

      // 30 damage: all absorbed by shield
      matchFlow.processKill("killer", "victim", 30, "Pistol");

      const victim = matchFlow.getState().players.get("victim");
      assert.strictEqual(victim?.shield, 20); // 50 - 30
      assert.strictEqual(victim?.health, 100); // untouched
      assert.strictEqual(victim?.isDowned, false);
    });
  });

  // ─── Revive ──────────────────────────────────────────────────────────────

  describe("revive", () => {
    it("should revive a downed player with 30 HP", () => {
      matchFlow.joinPlayer({
        id: "p1", displayName: "A", species: "HURAN",
        skinRarity: "COMUM", posX: 50, posY: 50, inWaterZone: false, worldId: "cigkv",
      });
      matchFlow.joinPlayer({
        id: "p2", displayName: "B", species: "VENEX",
        skinRarity: "COMUM", posX: 80, posY: 80, inWaterZone: false, worldId: "cigkv",
      });

      // Down the player
      matchFlow.processKill("p1", "p2", 200, "Sniper");

      // Revive
      const revived = matchFlow.revivePlayer("p2", "p1");
      assert.strictEqual(revived, true);

      const player = matchFlow.getState().players.get("p2");
      assert.strictEqual(player?.isDowned, false);
      assert.strictEqual(player?.health, 30);
    });

    it("should not revive an already alive player", () => {
      matchFlow.joinPlayer({
        id: "p1", displayName: "A", species: "HURAN",
        skinRarity: "COMUM", posX: 50, posY: 50, inWaterZone: false, worldId: "cigkv",
      });

      const revived = matchFlow.revivePlayer("p1", "p1");
      assert.strictEqual(revived, false);
    });
  });

  // ─── Event Log ───────────────────────────────────────────────────────────

  describe("event log", () => {
    it("should track events", () => {
      matchFlow.joinPlayer({
        id: "p1", displayName: "A", species: "HURAN",
        skinRarity: "COMUM", posX: 50, posY: 50, inWaterZone: false, worldId: "cigkv",
      });

      const log = matchFlow.getEventLog();
      assert.ok(log.length > 0);
      assert.strictEqual(log[0].type, "PLAYER_JOIN");
    });
  });

  // ─── Cleanup ─────────────────────────────────────────────────────────────

  describe("cleanup", () => {
    it("should destroy cleanly", () => {
      matchFlow.destroy();
      // No errors
    });
  });
});
