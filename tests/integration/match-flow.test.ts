/**
 * KHAAOS RUN — Unit Tests: MatchFlow
 * =====================================
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MatchFlow, DEFAULT_WORLD_PIPELINE, type MatchConfig } from "@game/MatchFlow";
import { EconomyMatchBridge } from "@game/EconomyMatchBridge";

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
      expect(state.status).toBe("LOBBY");
      expect(state.roomId).toBe("test_match");
    });

    it("should initialize with 0 players", () => {
      const state = matchFlow.getState();
      expect(state.players.size).toBe(0);
    });

    it("should initialize with 0 eliminations", () => {
      const state = matchFlow.getState();
      expect(state.totalEliminations).toBe(0);
    });

    it("should have 5 worlds in default pipeline", () => {
      expect(DEFAULT_WORLD_PIPELINE).toHaveLength(5);
    });
  });

  // ─── Default World Pipeline ──────────────────────────────────────────────

  describe("DEFAULT_WORLD_PIPELINE", () => {
    it("should have correct world order", () => {
      const ids = DEFAULT_WORLD_PIPELINE.map(w => w.worldId);
      expect(ids).toEqual(["cigkv", "barburhen", "priadus", "ckesalth", "arukheea"]);
    });

    it("should have correct capacities", () => {
      expect(DEFAULT_WORLD_PIPELINE[0].capacity).toBe(50);   // CIGKV
      expect(DEFAULT_WORLD_PIPELINE[1].capacity).toBe(100);  // Barburhen
      expect(DEFAULT_WORLD_PIPELINE[2].capacity).toBe(75);   // Priadus
      expect(DEFAULT_WORLD_PIPELINE[3].capacity).toBe(60);   // Ckesalth
      expect(DEFAULT_WORLD_PIPELINE[4].capacity).toBe(80);   // Arukheea
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
      expect(joined).toBe(true);
      expect(matchFlow.getState().players.size).toBe(1);
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
      expect(joined).toBe(false);
    });

    it("should set initial health to 100 and shield to 50", () => {
      matchFlow.joinPlayer({
        id: "player_1", displayName: "Alpha", species: "HURAN",
        skinRarity: "COMUM", posX: 50, posY: 50, inWaterZone: false, worldId: "cigkv",
      });
      const player = matchFlow.getState().players.get("player_1");
      expect(player?.health).toBe(100);
      expect(player?.shield).toBe(50);
      expect(player?.isDowned).toBe(false);
      expect(player?.isEliminated).toBe(false);
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
      expect(joined).toBe(false);
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
      expect(matchFlow.getState().status).toBe("COUNTDOWN");
    });

    it("should not start countdown if not in LOBBY", () => {
      matchFlow.startCountdown();
      matchFlow.startCountdown(); // second call should be no-op
      // Status should remain COUNTDOWN (not error)
      expect(["COUNTDOWN", "IN_PROGRESS"]).toContain(matchFlow.getState().status);
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
      expect(victim?.isDowned).toBe(true);
      expect(victim?.shield).toBe(0);
      expect(victim?.health).toBe(0);
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
      expect(victim?.shield).toBe(20); // 50 - 30
      expect(victim?.health).toBe(100); // untouched
      expect(victim?.isDowned).toBe(false);
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
      expect(revived).toBe(true);

      const player = matchFlow.getState().players.get("p2");
      expect(player?.isDowned).toBe(false);
      expect(player?.health).toBe(30);
    });

    it("should not revive an already alive player", () => {
      matchFlow.joinPlayer({
        id: "p1", displayName: "A", species: "HURAN",
        skinRarity: "COMUM", posX: 50, posY: 50, inWaterZone: false, worldId: "cigkv",
      });

      const revived = matchFlow.revivePlayer("p1", "p1");
      expect(revived).toBe(false);
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
      expect(log.length).toBeGreaterThan(0);
      expect(log[0].type).toBe("PLAYER_JOIN");
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
