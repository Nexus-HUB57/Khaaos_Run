import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MatchFlow, DEFAULT_WORLD_PIPELINE, RING_PHASES, type MatchStatus } from "@game/MatchFlow";

describe("MatchFlow Unit Tests", () => {
  let match: MatchFlow;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    match = new MatchFlow("test-match-001", {
      maxPlayers: 100,
      countdownSeconds: 5,
    });
  });

  afterEach(() => {
    match.destroy();
    vi.useRealTimers();
  });

  // ─── Construction ─────────────────────────────────────────────────────────

  it("should initialize with LOBBY status", () => {
    expect(match.getStatus()).toBe("LOBBY");
  });

  it("should start with 0 players", () => {
    expect(match.getPlayers()).toHaveLength(0);
  });

  it("should have 5 worlds in the default pipeline", () => {
    expect(match.getWorldPipeline()).toHaveLength(5);
  });

  // ─── DEFAULT_WORLD_PIPELINE ───────────────────────────────────────────────

  it("should have DEFAULT_WORLD_PIPELINE with correct order", () => {
    const ids = DEFAULT_WORLD_PIPELINE.map(w => w.worldId);
    expect(ids).toEqual(["cigkv", "barburhen", "priadus", "ckesalth", "arukheea"]);
  });

  it("should have DEFAULT_WORLD_PIPELINE with correct capacities", () => {
    expect(DEFAULT_WORLD_PIPELINE[0].capacity).toBe(50);   // cigkv
    expect(DEFAULT_WORLD_PIPELINE[1].capacity).toBe(100);  // barburhen
    expect(DEFAULT_WORLD_PIPELINE[2].capacity).toBe(75);   // priadus
    expect(DEFAULT_WORLD_PIPELINE[3].capacity).toBe(60);   // ckesalth
    expect(DEFAULT_WORLD_PIPELINE[4].capacity).toBe(80);   // arukheea
  });

  // ─── joinPlayer ───────────────────────────────────────────────────────────

  it("should add player to lobby", () => {
    const joined = match.joinPlayer("player-1", "HURAN");
    expect(joined).toBe(true);
    expect(match.getPlayers()).toHaveLength(1);
  });

  it("should reject duplicate player", () => {
    match.joinPlayer("player-1", "HURAN");
    const joined = match.joinPlayer("player-1", "HURAN");
    expect(joined).toBe(false);
    expect(match.getPlayers()).toHaveLength(1);
  });

  it("should set initial stats: health=100, shield=50, isDowned=false", () => {
    match.joinPlayer("player-1", "KHAEL");
    const player = match.getPlayer("player-1")!;
    expect(player.health).toBe(100);
    expect(player.shield).toBe(50);
    expect(player.isDowned).toBe(false);
    expect(player.isEliminated).toBe(false);
    expect(player.kills).toBe(0);
  });

  it("should respect max players limit", () => {
    const smallMatch = new MatchFlow("small", { maxPlayers: 2 });
    expect(smallMatch.joinPlayer("p1", "HURAN")).toBe(true);
    expect(smallMatch.joinPlayer("p2", "KHAEL")).toBe(true);
    expect(smallMatch.joinPlayer("p3", "VENEX")).toBe(false);
    smallMatch.destroy();
  });

  // ─── Match Lifecycle ──────────────────────────────────────────────────────

  it("should transition from LOBBY to COUNTDOWN", () => {
    match.joinPlayer("p1", "HURAN");
    const started = match.startCountdown();
    expect(started).toBe(true);
    expect(match.getStatus()).toBe("COUNTDOWN");
  });

  it("should auto-transition from COUNTDOWN to IN_PROGRESS after countdown", () => {
    match.joinPlayer("p1", "HURAN");
    match.joinPlayer("p2", "KHAEL");
    match.startCountdown();
    expect(match.getStatus()).toBe("COUNTDOWN");

    vi.advanceTimersByTime(6000);
    expect(match.getStatus()).toBe("IN_PROGRESS");
  });

  it("should not start countdown with no players", () => {
    const started = match.startCountdown();
    expect(started).toBe(false);
    expect(match.getStatus()).toBe("LOBBY");
  });

  it("should not start countdown when not in LOBBY", () => {
    match.joinPlayer("p1", "HURAN");
    match.startCountdown();
    const started2 = match.startCountdown();
    expect(started2).toBe(false);
  });

  // ─── Kill Pipeline ────────────────────────────────────────────────────────

  it("should down a player with 150 damage (shields absorb first)", () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    const kill = match.processKill("killer", "victim", 150, "rifle");
    expect(kill).not.toBeNull();

    const victim = match.getPlayer("victim")!;
    expect(victim.shield).toBe(0);   // 50 shield absorbed
    expect(victim.health).toBe(0);   // 100 remaining health gone
    expect(victim.isDowned).toBe(true);
  });

  it("should absorb shield damage first", () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    // 40 damage — all absorbed by shield
    match.processKill("killer", "victim", 40, "rifle");
    const victim = match.getPlayer("victim")!;
    expect(victim.shield).toBe(10);
    expect(victim.health).toBe(100);
    expect(victim.isDowned).toBe(false);
  });

  it("should credit killer immediately when victim is downed", () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    match.processKill("killer", "victim", 200, "rifle");
    expect(match.getPlayer("killer")!.kills).toBe(1);

    // Economy reward exists immediately
    const rewards = match.getEconomy().getRewards().filter(r => r.type === "KILL");
    expect(rewards).toHaveLength(1);
  });

  // ─── Revive ───────────────────────────────────────────────────────────────

  it("should revive a downed player with 30 HP", () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    match.processKill("killer", "victim", 200, "rifle");
    expect(match.getPlayer("victim")!.isDowned).toBe(true);

    const revived = match.revivePlayer("victim");
    expect(revived).toBe(true);
    expect(match.getPlayer("victim")!.isDowned).toBe(false);
    expect(match.getPlayer("victim")!.health).toBe(30);
  });

  it("should not revive an alive player", () => {
    match.joinPlayer("p1", "HURAN");
    match.joinPlayer("p2", "ZHEERS");
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    const revived = match.revivePlayer("p2");
    expect(revived).toBe(false);
  });

  // ─── Event Log ────────────────────────────────────────────────────────────

  it("should track events in the event log", () => {
    match.joinPlayer("p1", "HURAN");
    match.joinPlayer("p2", "ZHEERS");
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    match.processKill("p1", "p2", 200, "rifle");

    const events = match.getEventLog();
    expect(events.some(e => e.type === "PLAYER_JOINED")).toBe(true);
    expect(events.some(e => e.type === "COUNTDOWN_STARTED")).toBe(true);
    expect(events.some(e => e.type === "MATCH_STARTED")).toBe(true);
    expect(events.some(e => e.type === "KILL")).toBe(true);
  });

  it("should record PLAYER_DOWNED event when victim health reaches 0", () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    match.processKill("killer", "victim", 200, "rifle");

    const events = match.getEventLog();
    expect(events.some(e => e.type === "PLAYER_DOWNED")).toBe(true);
  });

  // ─── RING_PHASES ──────────────────────────────────────────────────────────

  it("should have 5 ring phases", () => {
    expect(RING_PHASES).toHaveLength(5);
  });

  it("should have increasing damage per tick across ring phases", () => {
    for (let i = 1; i < RING_PHASES.length; i++) {
      expect(RING_PHASES[i].damagePerTick).toBeGreaterThan(RING_PHASES[i - 1].damagePerTick);
    }
  });

  // ─── Auto-elimination ─────────────────────────────────────────────────────

  it("should auto-eliminate downed player after timeout", () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.joinPlayer("other", "KHAEL");
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    match.processKill("killer", "victim", 200, "rifle");
    expect(match.getPlayer("victim")!.isDowned).toBe(true);
    expect(match.getPlayer("victim")!.isEliminated).toBe(false);

    vi.advanceTimersByTime(31000);
    expect(match.getPlayer("victim")!.isEliminated).toBe(true);
  });

  // ─── eliminatePlayer ──────────────────────────────────────────────────────

  it("should manually eliminate a player", () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.joinPlayer("other", "KHAEL");
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    match.processKill("killer", "victim", 200, "rifle");
    const eliminated = match.eliminatePlayer("victim");
    expect(eliminated).toBe(true);
    expect(match.getPlayer("victim")!.isEliminated).toBe(true);
  });

  // ─── Leaderboard ──────────────────────────────────────────────────────────

  it("should return leaderboard sorted by kills", () => {
    match.joinPlayer("p1", "HURAN");
    match.joinPlayer("p2", "KHAEL");
    match.joinPlayer("p3", "ZHEERS");
    match.startCountdown();
    vi.advanceTimersByTime(6000);

    match.processKill("p2", "p3", 200, "rifle");  // p2 gets 1 kill
    match.processKill("p2", "p1", 200, "rifle");   // p2 gets 2 kills (but p1 eliminated)

    const lb = match.getLeaderboard();
    expect(lb[0].playerId).toBe("p2");
    expect(lb[0].kills).toBe(2);
  });
});
