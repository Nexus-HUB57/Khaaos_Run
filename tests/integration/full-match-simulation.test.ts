import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MatchFlow, DEFAULT_WORLD_PIPELINE, RING_PHASES, type MatchStatus } from "@game/MatchFlow";
import { EconomyMatchBridge, SPECIES_CONFIG, KILL_RARITY_MODIFIER } from "@game/EconomyMatchBridge";
import { DiscordBot } from "@game/DiscordBot";
import { SpectatorDataPipeline } from "@game/SpectatorDataPipeline";

// ─── Species rotation for 10 operatives (all 6 species) ──────────────────────

const SPECIES_LIST = ["HURAN", "KHAEL", "VENEX", "ONITH", "ZHEERS", "SKEETW"] as const;
const WEAPONS = ["WPN_AssaultRifle_MK1", "WPN_Sniper_DMR", "WPN_Shotgun_Breach"];

function makePlayerId(index: number): string {
  return `op-${String(index).padStart(3, "0")}`;
}

function getSpecies(index: number): string {
  return SPECIES_LIST[index % SPECIES_LIST.length];
}

describe("Full Match Simulation", () => {
  let match: MatchFlow;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    match = new MatchFlow("sim-match-001", {
      maxPlayers: 100,
      countdownSeconds: 5,
      downedEliminateTimeoutMs: 30000,
    });
  });

  afterEach(() => {
    match.destroy();
    vi.useRealTimers();
  });

  it("should simulate a complete match lifecycle: Create → Join → Countdown → Kills → Revive → End", () => {
    // ── Create ──
    expect(match.getStatus()).toBe("LOBBY");
    expect(match.getPlayers()).toHaveLength(0);

    // ── Join 10 operatives (all 6 species) ──
    for (let i = 0; i < 10; i++) {
      const joined = match.joinPlayer(makePlayerId(i), getSpecies(i) as any);
      expect(joined).toBe(true);
    }
    expect(match.getPlayers()).toHaveLength(10);

    // Verify initial stats
    for (const player of match.getPlayers()) {
      expect(player.health).toBe(100);
      expect(player.shield).toBe(50);
      expect(player.isDowned).toBe(false);
      expect(player.isEliminated).toBe(false);
      expect(player.kills).toBe(0);
    }

    // ── Countdown ──
    const started = match.startCountdown();
    expect(started).toBe(true);
    expect(match.getStatus()).toBe("COUNTDOWN");

    // Advance past countdown
    vi.advanceTimersByTime(6000);
    expect(match.getStatus()).toBe("IN_PROGRESS");

    // ── Kills: 200 damage per kill (enough to down: shield(50)+health(100)=150) ──
    // op-000 kills op-005 (200 dmg > 150 needed)
    const kill1 = match.processKill("op-000", "op-005", 200, WEAPONS[0]);
    expect(kill1).not.toBeNull();
    expect(kill1!.victimWasDowned).toBe(false);

    const killer = match.getPlayer("op-000")!;
    const victim = match.getPlayer("op-005")!;
    expect(killer.kills).toBe(1);
    expect(victim.isDowned).toBe(true);
    expect(victim.isEliminated).toBe(false);
    expect(kill1!.reward).toBeDefined();
    expect(kill1!.reward).toBeGreaterThan(0);

    // op-001 kills op-006
    const kill2 = match.processKill("op-001", "op-006", 200, WEAPONS[1]);
    expect(kill2).not.toBeNull();
    expect(match.getPlayer("op-001")!.kills).toBe(1);
    expect(match.getPlayer("op-006")!.isDowned).toBe(true);

    // op-002 kills op-007
    const kill3 = match.processKill("op-002", "op-007", 200, WEAPONS[2]);
    expect(kill3).not.toBeNull();
    expect(match.getPlayer("op-002")!.kills).toBe(1);

    // ── Revive ──
    const revived = match.revivePlayer("op-005");
    expect(revived).toBe(true);
    expect(match.getPlayer("op-005")!.isDowned).toBe(false);
    expect(match.getPlayer("op-005")!.health).toBe(30);

    // Can't revive an alive player
    const reviveAgain = match.revivePlayer("op-005");
    expect(reviveAgain).toBe(false);

    // ── End Match ──
    match.endMatch("op-000");
    expect(match.getStatus()).toBe("FINISHED");

    // ── Economy verification ──
    const economy = match.getEconomy();
    const summary = economy.getMatchSummary();
    expect(summary.rewardCount).toBeGreaterThan(0);
    expect(summary.totalRewards).toBeGreaterThan(0);
  });

  it("should verify kill counts match expected values", () => {
    for (let i = 0; i < 10; i++) {
      match.joinPlayer(makePlayerId(i), getSpecies(i) as any);
    }
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    // op-000 kills 3 players
    match.processKill("op-000", "op-005", 200, WEAPONS[0]);
    match.processKill("op-000", "op-006", 200, WEAPONS[0]);
    match.processKill("op-000", "op-007", 200, WEAPONS[0]);

    expect(match.getPlayer("op-000")!.kills).toBe(3);
    expect(match.getKillLog()).toHaveLength(3);
  });

  it("should verify economy rewards are recorded for kills", () => {
    for (let i = 0; i < 10; i++) {
      match.joinPlayer(makePlayerId(i), getSpecies(i) as any);
    }
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    match.processKill("op-000", "op-005", 200, WEAPONS[0]);

    const rewards = match.getEconomy().getRewards();
    const killRewards = rewards.filter(r => r.type === "KILL");
    expect(killRewards.length).toBeGreaterThanOrEqual(1);
    expect(killRewards[0].amount).toBeGreaterThan(0);
  });

  it("should verify event log tracks all events", () => {
    for (let i = 0; i < 3; i++) {
      match.joinPlayer(makePlayerId(i), getSpecies(i) as any);
    }
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    match.processKill("op-000", "op-001", 200, WEAPONS[0]);
    match.revivePlayer("op-001");

    const events = match.getEventLog();
    expect(events.some(e => e.type === "PLAYER_JOINED")).toBe(true);
    expect(events.some(e => e.type === "COUNTDOWN_STARTED")).toBe(true);
    expect(events.some(e => e.type === "MATCH_STARTED")).toBe(true);
    expect(events.some(e => e.type === "KILL")).toBe(true);
    expect(events.some(e => e.type === "PLAYER_REVIVED")).toBe(true);
  });

  it("should follow damage pipeline: Shield→Health→Downed→Eliminate", () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    // Step 1: Shield absorbs damage
    const hit1 = match.processKill("killer", "victim", 30, WEAPONS[0]);
    const v1 = match.getPlayer("victim")!;
    expect(v1.shield).toBe(20); // 50 - 30
    expect(v1.health).toBe(100);
    expect(v1.isDowned).toBe(false);

    // Step 2: Shield depleted, health takes damage
    const hit2 = match.processKill("killer", "victim", 30, WEAPONS[0]);
    const v2 = match.getPlayer("victim")!;
    expect(v2.shield).toBe(0); // depleted
    expect(v2.health).toBe(90); // 100 - (30-20) = 90 ... wait, shield was 20, 30 damage = 20 shield + 10 health
    expect(v2.isDowned).toBe(false);

    // Step 3: Health damage until downed
    const hit3 = match.processKill("killer", "victim", 100, WEAPONS[0]);
    const v3 = match.getPlayer("victim")!;
    expect(v3.isDowned).toBe(true);
    expect(match.getPlayer("killer")!.kills).toBe(1);

    // Step 4: Eliminate after timeout
    vi.advanceTimersByTime(31000);
    const v4 = match.getPlayer("victim")!;
    expect(v4.isEliminated).toBe(true);
  });

  it("should configure spectator pipeline", () => {
    const spectator = match.getSpectator();
    const config = spectator.getConfig();
    expect(config.delayMs).toBe(10000);
    expect(config.maxSpectatorsPerRoom).toBe(500);
    expect(config.batchIntervalMs).toBe(200);
    expect(config.globalMaxSpectators).toBe(5000);
    expect(config.maxEventsPerBatch).toBe(20);
  });

  it("should initialize Discord bot", () => {
    const discord = match.getDiscord();
    // Discord bot should exist (operational status depends on webhook URL env var)
    expect(discord).toBeDefined();
    const stats = discord.getStats();
    expect(stats).toHaveProperty("messagesSent");
    expect(stats).toHaveProperty("messagesDropped");
    expect(stats).toHaveProperty("eventsProcessed");
  });

  it("should handle 10-player stress test", () => {
    // Join 10 players
    for (let i = 0; i < 10; i++) {
      match.joinPlayer(makePlayerId(i), getSpecies(i) as any);
    }
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    // Simulate many kills
    // op-000 kills op-005 through op-009
    for (let i = 5; i < 10; i++) {
      const kill = match.processKill("op-000", makePlayerId(i), 200, WEAPONS[0]);
      expect(kill).not.toBeNull();
    }
    expect(match.getPlayer("op-000")!.kills).toBe(5);

    // op-001 kills op-002 and op-003
    match.processKill("op-001", "op-002", 200, WEAPONS[1]);
    match.processKill("op-001", "op-003", 200, WEAPONS[1]);
    expect(match.getPlayer("op-001")!.kills).toBe(2);

    // Verify kill log
    expect(match.getKillLog()).toHaveLength(7);

    // End match
    match.endMatch("op-000");
    expect(match.getStatus()).toBe("FINISHED");

    // Verify economy
    const summary = match.getEconomy().getMatchSummary();
    expect(summary.rewardCount).toBeGreaterThan(0);
  });

  it("should immediately credit kills when victim is downed (not deferred)", () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    // Down the victim
    match.processKill("killer", "victim", 200, WEAPONS[0]);
    expect(match.getPlayer("victim")!.isDowned).toBe(true);
    expect(match.getPlayer("killer")!.kills).toBe(1);

    // Kill credit was IMMEDIATE — verify economy reward exists
    const rewards = match.getEconomy().getRewards();
    const killRewards = rewards.filter(r => r.type === "KILL");
    expect(killRewards).toHaveLength(1);
    expect(killRewards[0].amount).toBeGreaterThan(0);

    // Now finish the victim (was already downed)
    const kill2 = match.processKill("killer", "victim", 50, WEAPONS[0]);
    // Victim was already downed, should be eliminated immediately
    expect(match.getPlayer("victim")!.isEliminated).toBe(true);
    // Killer gets a second kill credit
    expect(match.getPlayer("killer")!.kills).toBe(2);
  });
});
