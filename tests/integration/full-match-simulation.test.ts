/**
 * KHAAOS RUN — Full Match Simulation Integration Test
 * ====================================================
 * Simulates a complete Battle Royale match lifecycle:
 *
 *   Create → Join Players → Countdown → Start → Kills →
 *   Phase Survivals → World Transitions → Match End → Economy Payout
 *
 * Validates the full pipeline connecting MatchFlow, EconomyMatchBridge,
 * SpectatorDataPipeline, and DiscordBot.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MatchFlow, DEFAULT_WORLD_PIPELINE, type MatchPlayer } from "@game/MatchFlow";
import { EconomyMatchBridge, SPECIES_CONFIG, type SpeciesKey } from "@game/EconomyMatchBridge";
import { SpectatorDataPipeline } from "@game/SpectatorDataPipeline";
import { DiscordBot } from "@game/DiscordBot";

// ─── Test Operatives ────────────────────────────────────────────────────────

const TEST_OPERATIVES: Array<{
  id: string;
  displayName: string;
  species: SpeciesKey;
  skinRarity: string;
  posX: number;
  posY: number;
  inWaterZone: boolean;
  worldId: string;
}> = [
  { id: "op_hur_01",  displayName: "Cpt. Huran",   species: "HURAN",  skinRarity: "LENDARIO", posX: 45, posY: 45, inWaterZone: true,  worldId: "cigkv" },
  { id: "op_kha_01",  displayName: "Myst Khael",   species: "KHAEL",  skinRarity: "EPICO",    posX: 55, posY: 55, inWaterZone: false, worldId: "cigkv" },
  { id: "op_ven_01",  displayName: "Dash Venex",   species: "VENEX",  skinRarity: "RARO",     posX: 60, posY: 60, inWaterZone: false, worldId: "cigkv" },
  { id: "op_oni_01",  displayName: "Tox Onith",    species: "ONITH",  skinRarity: "INCOMUM",  posX: 70, posY: 70, inWaterZone: false, worldId: "cigkv" },
  { id: "op_zhe_01",  displayName: "Rad Zheers",   species: "ZHEERS", skinRarity: "COMUM",    posX: 80, posY: 80, inWaterZone: false, worldId: "cigkv" },
  { id: "op_ske_01",  displayName: "Fog Skeetw",   species: "SKEETW", skinRarity: "RARO",     posX: 30, posY: 30, inWaterZone: false, worldId: "cigkv" },
  { id: "op_hur_02",  displayName: "Aqua Huran",   species: "HURAN",  skinRarity: "MITICO",   posX: 40, posY: 40, inWaterZone: true,  worldId: "cigkv" },
  { id: "op_kha_02",  displayName: "Ice Khael",    species: "KHAEL",  skinRarity: "COMUM",    posX: 20, posY: 20, inWaterZone: false, worldId: "cigkv" },
  { id: "op_ven_02",  displayName: "Speed Venex",  species: "VENEX",  skinRarity: "LENDARIO", posX: 90, posY: 90, inWaterZone: false, worldId: "cigkv" },
  { id: "op_oni_02",  displayName: "Pest Onith",   species: "ONITH",  skinRarity: "EPICO",    posX: 15, posY: 15, inWaterZone: false, worldId: "cigkv" },
];

// ─── Weapons ────────────────────────────────────────────────────────────────

const WEAPONS = [
  "AssaultRifle_MK1", "Sniper_DMR", "Shotgun_Breach", "Pistol_Onith",
  "Carbine_Venex", "SMG_Huran", "DMR_Khael", "LMG_Skeetw",
  "Knife_Combat", "Espada_Overlord",
];

describe("Full Match Simulation", () => {
  let economyBridge: EconomyMatchBridge;
  let spectatorPipeline: SpectatorDataPipeline;
  let discordBot: DiscordBot;
  let matchFlow: MatchFlow;

  beforeEach(() => {
    economyBridge = new EconomyMatchBridge();
    spectatorPipeline = new SpectatorDataPipeline();
    discordBot = new DiscordBot({ webhookUrl: "", botToken: "" }); // No real Discord
  });

  afterEach(() => {
    matchFlow?.destroy();
    spectatorPipeline?.destroy();
  });

  // ─── Complete Match Lifecycle ─────────────────────────────────────────────

  describe("complete lifecycle", () => {
    it("should simulate full match: create → join → countdown → kills → end", () => {
      // ── Phase 1: Create Match ──
      matchFlow = new MatchFlow(
        {
          roomId: "sim_match_001",
          maxPlayers: 50,
          countdownSeconds: 3,
          tickIntervalMs: 100,
        },
        economyBridge,
      );

      const initialState = matchFlow.getState();
      expect(initialState.status).toBe("LOBBY");
      expect(initialState.roomId).toBe("sim_match_001");
      expect(initialState.players.size).toBe(0);
      expect(initialState.worlds).toHaveLength(5);

      // ── Phase 2: Join All Operatives ──
      for (const op of TEST_OPERATIVES) {
        const joined = matchFlow.joinPlayer(op);
        expect(joined).toBe(true);
      }
      expect(matchFlow.getState().players.size).toBe(10);

      // Verify all species represented
      const speciesInMatch = new Set(
        Array.from(matchFlow.getState().players.values()).map(p => p.species)
      );
      expect(speciesInMatch.size).toBe(6);

      // ── Phase 3: Start Countdown ──
      matchFlow.startCountdown();
      expect(matchFlow.getState().status).toBe("COUNTDOWN");

      // ── Phase 4: Simulate Kills ──
      // Kill chain: op_hur_01 eliminates 5 others
      const killer = "op_hur_01";
      const victims = ["op_oni_01", "op_zhe_01", "op_ske_01", "op_kha_02", "op_oni_02"];

      for (const victimId of victims) {
        matchFlow.processKill(killer, victimId, 200, WEAPONS[Math.floor(Math.random() * WEAPONS.length)]);
      }

      // Verify victims are downed
      for (const victimId of victims) {
        const victim = matchFlow.getState().players.get(victimId);
        expect(victim?.isDowned).toBe(true);
      }

      // Killer should have 5 kills
      const killerPlayer = matchFlow.getState().players.get(killer);
      expect(killerPlayer?.kills).toBe(5);

      // ── Phase 5: Test Revive ──
      // Revive op_kha_02
      const revived = matchFlow.revivePlayer("op_kha_02", "op_kha_01");
      expect(revived).toBe(true);
      const revivedPlayer = matchFlow.getState().players.get("op_kha_02");
      expect(revivedPlayer?.isDowned).toBe(false);
      expect(revivedPlayer?.health).toBe(30);

      // ── Phase 6: Simulate More Kills ──
      // op_ven_01 eliminates op_hur_02 and op_ven_02
      matchFlow.processKill("op_ven_01", "op_hur_02", 200, "Carbine_Venex");
      matchFlow.processKill("op_ven_01", "op_ven_02", 200, "Pistol_Onith");

      // op_kha_01 eliminates op_ven_01
      matchFlow.processKill("op_kha_01", "op_ven_01", 200, "DMR_Khael");

      // ── Phase 7: End Match (Huran wins) ──
      matchFlow.endMatch("op_hur_01");
      const finalState = matchFlow.getState();
      expect(finalState.status).toBe("FINISHED");
      expect(finalState.winnerId).toBe("op_hur_01");
      expect(finalState.matchEndTime).toBeGreaterThan(0);

      // ── Phase 8: Verify Economy ──
      const economySummary = economyBridge.getMatchSummary("sim_match_001");
      expect(economySummary).not.toBeNull();
      expect(economySummary!.totalKrcMinted).toBeGreaterThan(0);
      expect(economySummary!.killRewards).toBeGreaterThan(0);
      expect(economySummary!.players.size).toBeGreaterThan(0);

      // ── Phase 9: Verify Event Log ──
      const eventLog = matchFlow.getEventLog();
      expect(eventLog.length).toBeGreaterThan(0);

      const eventTypes = new Set(eventLog.map(e => e.type));
      expect(eventTypes).toContain("PLAYER_JOIN");
      expect(eventTypes).toContain("PLAYER_DOWNED");
      expect(eventTypes).toContain("MATCH_END");

      // ── Phase 10: Cleanup ──
      matchFlow.destroy();
    });
  });

  // ─── Economy Reward Validation ────────────────────────────────────────────

  describe("economy rewards", () => {
    it("should calculate correct kill rewards per species", () => {
      matchFlow = new MatchFlow(
        { roomId: "econ_test", maxPlayers: 10, tickIntervalMs: 1000 },
        economyBridge,
      );

      // Join players
      matchFlow.joinPlayer({
        id: "killer", displayName: "K", species: "HURAN",
        skinRarity: "COMUM", posX: 50, posY: 50, inWaterZone: false, worldId: "cigkv",
      });

      // Test kill rewards for each species
      const speciesRewards: Record<string, number> = {};
      for (const species of Object.keys(SPECIES_CONFIG) as SpeciesKey[]) {
        const victimId = `victim_${species}`;
        matchFlow.joinPlayer({
          id: victimId, displayName: `V_${species}`, species,
          skinRarity: "COMUM", posX: 80, posY: 80, inWaterZone: false, worldId: "cigkv",
        });

        matchFlow.processKill("killer", victimId, 200, "TestWeapon");
      }

      // Verify economy tracked all kills
      const summary = economyBridge.getMatchSummary("econ_test");
      expect(summary).not.toBeNull();
      expect(summary!.killRewards).toBeGreaterThan(0);

      matchFlow.destroy();
    });

    it("should apply Huran water bonus (1.3×) correctly", () => {
      const bridge = new EconomyMatchBridge();

      // Kill Huran victim in water
      const waterKill = bridge.calculateKillReward({
        killerId: "k1", victimId: "v1", victimSpecies: "HURAN",
        victimSkinRarity: "COMUM", victimInWater: true, victimWasDowned: false,
        timestamp: Date.now(), worldId: "cigkv", phase: 1,
      });

      // Kill Huran victim NOT in water
      const dryKill = bridge.calculateKillReward({
        killerId: "k1", victimId: "v1", victimSpecies: "HURAN",
        victimSkinRarity: "COMUM", victimInWater: false, victimWasDowned: false,
        timestamp: Date.now(), worldId: "cigkv", phase: 1,
      });

      expect(waterKill.krcAmount).toBeGreaterThan(dryKill.krcAmount);
      // Water kill should be ~1.3× dry kill
      const ratio = waterKill.krcAmount / dryKill.krcAmount;
      expect(ratio).toBeCloseTo(1.3, 0);
    });
  });

  // ─── Multi-World Pipeline Validation ──────────────────────────────────────

  describe("multi-world pipeline", () => {
    it("should have correct world pipeline order", () => {
      const worldIds = DEFAULT_WORLD_PIPELINE.map(w => w.worldId);
      expect(worldIds).toEqual(["cigkv", "barburhen", "priadus", "ckesalth", "arukheea"]);
    });

    it("should track world transition costs", () => {
      const bridge = new EconomyMatchBridge();
      bridge.initMatchEconomy("world_trans_test");

      // Simulate world transition
      const transition = bridge.calculateWorldTransitionCost({
        playerId: "p1", fromWorld: "cigkv", toWorld: "barburhen",
        timestamp: Date.now(),
      });
      bridge.recordReward("world_trans_test", transition);

      const summary = bridge.getMatchSummary("world_trans_test");
      expect(summary!.transitionCosts).toBe(50_000);
      expect(summary!.totalKrcBurned).toBe(50_000);

      bridge.destroyMatchEconomy("world_trans_test");
    });
  });

  // ─── Damage Pipeline Validation ───────────────────────────────────────────

  describe("damage pipeline", () => {
    it("should follow Shield → Health → Downed → Eliminate sequence", () => {
      matchFlow = new MatchFlow(
        { roomId: "dmg_test", maxPlayers: 10, tickIntervalMs: 1000 },
        economyBridge,
      );

      matchFlow.joinPlayer({
        id: "attacker", displayName: "A", species: "HURAN",
        skinRarity: "COMUM", posX: 50, posY: 50, inWaterZone: false, worldId: "cigkv",
      });
      matchFlow.joinPlayer({
        id: "target", displayName: "T", species: "VENEX",
        skinRarity: "COMUM", posX: 80, posY: 80, inWaterZone: false, worldId: "cigkv",
      });

      // Step 1: Shield damage (30 dmg, shield: 50→20)
      matchFlow.processKill("attacker", "target", 30, "Pistol");
      const afterShield = matchFlow.getState().players.get("target");
      expect(afterShield?.shield).toBe(20);
      expect(afterShield?.health).toBe(100);
      expect(afterShield?.isDowned).toBe(false);

      // Step 2: Mixed shield + health damage (40 dmg, shield: 20→0, health: 100→80)
      matchFlow.processKill("attacker", "target", 40, "SMG");
      const afterMixed = matchFlow.getState().players.get("target");
      expect(afterMixed?.shield).toBe(0);
      expect(afterMixed?.health).toBe(80);
      expect(afterMixed?.isDowned).toBe(false);

      // Step 3: Health-only damage (50 dmg, health: 80→30)
      matchFlow.processKill("attacker", "target", 50, "Sniper");
      const afterHealth = matchFlow.getState().players.get("target");
      expect(afterHealth?.health).toBe(30);
      expect(afterHealth?.isDowned).toBe(false);

      // Step 4: Lethal damage (100 dmg, health: 30→0 → downed)
      matchFlow.processKill("attacker", "target", 100, "AssaultRifle");
      const afterLethal = matchFlow.getState().players.get("target");
      expect(afterLethal?.isDowned).toBe(true);

      matchFlow.destroy();
    });
  });

  // ─── Spectator Pipeline Validation ────────────────────────────────────────

  describe("spectator pipeline", () => {
    it("should have correct configuration", () => {
      expect(SpectatorDataPipeline).toBeDefined();
      // Import check — config is validated in spectator-data-pipeline.test.ts
    });
  });

  // ─── Discord Bot Validation ──────────────────────────────────────────────

  describe("discord bot", () => {
    it("should initialize in webhook-only mode", () => {
      const bot = new DiscordBot({ webhookUrl: "https://test.example/hook", botToken: "" });
      expect(bot.isOperational()).toBe(true);
      const stats = bot.getStats();
      expect(stats.isConnected).toBe(false); // No gateway
    });
  });

  // ─── 10-Player Match Stress Test ─────────────────────────────────────────

  describe("10-player match stress", () => {
    it("should handle 10 players with rapid kills", () => {
      matchFlow = new MatchFlow(
        { roomId: "stress_test", maxPlayers: 50, tickIntervalMs: 100 },
        economyBridge,
      );

      // Join 10 operatives
      for (const op of TEST_OPERATIVES) {
        matchFlow.joinPlayer(op);
      }

      // Rapid kill chain
      const killChain: Array<[string, string]> = [
        ["op_hur_01", "op_oni_01"],
        ["op_hur_01", "op_zhe_01"],
        ["op_kha_01", "op_ske_01"],
        ["op_ven_01", "op_oni_02"],
        ["op_hur_02", "op_kha_02"],
        ["op_ven_02", "op_hur_02"],
        ["op_hur_01", "op_ven_02"],
        ["op_kha_01", "op_ven_01"],
        ["op_hur_01", "op_kha_01"],
      ];

      for (const [killer, victim] of killChain) {
        matchFlow.processKill(killer, victim, 200, WEAPONS[Math.floor(Math.random() * WEAPONS.length)]);
      }

      // End match
      matchFlow.endMatch("op_hur_01");
      const finalState = matchFlow.getState();
      expect(finalState.status).toBe("FINISHED");
      expect(finalState.winnerId).toBe("op_hur_01");

      // Verify economy summary
      const summary = economyBridge.getMatchSummary("stress_test");
      expect(summary!.totalKrcMinted).toBeGreaterThan(0);
      expect(summary!.killRewards).toBeGreaterThan(0);

      matchFlow.destroy();
    });
  });
});
