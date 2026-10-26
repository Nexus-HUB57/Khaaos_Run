import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MatchFlow, DEFAULT_WORLD_PIPELINE, RING_PHASES } from "../../server/game/MatchFlow.ts";

// Real-timer equivalents of the vitest fake-timer flow:
// countdown of 1s (asserted via sleep ≥ 1.3s) and downed-elimination of 300ms.
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const COUNTDOWN_WAIT_MS = 1300;
const DOWNED_WAIT_MS = 500;

describe("MatchFlow Unit Tests", () => {
  let match: MatchFlow;

  beforeEach(() => {
    match = new MatchFlow("test-match-001", {
      maxPlayers: 100,
      countdownSeconds: 1,
      downedEliminateTimeoutMs: 300,
    });
  });

  afterEach(() => {
    match.destroy();
  });

  // ─── Construction ─────────────────────────────────────────────────────────

  it("should initialize with LOBBY status", () => {
    assert.strictEqual(match.getStatus(), "LOBBY");
  });

  it("should start with 0 players", () => {
    assert.strictEqual(match.getPlayers().length, 0);
  });

  it("should have 5 worlds in the default pipeline", () => {
    assert.strictEqual(match.getWorldPipeline().length, 5);
  });

  // ─── DEFAULT_WORLD_PIPELINE ───────────────────────────────────────────────

  it("should have DEFAULT_WORLD_PIPELINE with correct order", () => {
    const ids = DEFAULT_WORLD_PIPELINE.map(w => w.worldId);
    assert.deepStrictEqual(ids, ["cigkv", "barburhen", "priadus", "ckesalth", "arukheea"]);
  });

  it("should have DEFAULT_WORLD_PIPELINE with correct capacities", () => {
    assert.strictEqual(DEFAULT_WORLD_PIPELINE[0].capacity, 50);   // cigkv
    assert.strictEqual(DEFAULT_WORLD_PIPELINE[1].capacity, 100);  // barburhen
    assert.strictEqual(DEFAULT_WORLD_PIPELINE[2].capacity, 75);   // priadus
    assert.strictEqual(DEFAULT_WORLD_PIPELINE[3].capacity, 60);   // ckesalth
    assert.strictEqual(DEFAULT_WORLD_PIPELINE[4].capacity, 80);   // arukheea
  });

  // ─── joinPlayer ───────────────────────────────────────────────────────────

  it("should add player to lobby", () => {
    const joined = match.joinPlayer("player-1", "HURAN");
    assert.strictEqual(joined, true);
    assert.strictEqual(match.getPlayers().length, 1);
  });

  it("should reject duplicate player", () => {
    match.joinPlayer("player-1", "HURAN");
    const joined = match.joinPlayer("player-1", "HURAN");
    assert.strictEqual(joined, false);
    assert.strictEqual(match.getPlayers().length, 1);
  });

  it("should set initial stats: health=100, shield=50, isDowned=false", () => {
    match.joinPlayer("player-1", "KHAEL");
    const player = match.getPlayer("player-1")!;
    assert.strictEqual(player.health, 100);
    assert.strictEqual(player.shield, 50);
    assert.strictEqual(player.isDowned, false);
    assert.strictEqual(player.isEliminated, false);
    assert.strictEqual(player.kills, 0);
  });

  it("should respect max players limit", () => {
    const smallMatch = new MatchFlow("small", { maxPlayers: 2, countdownSeconds: 1 });
    assert.strictEqual(smallMatch.joinPlayer("p1", "HURAN"), true);
    assert.strictEqual(smallMatch.joinPlayer("p2", "KHAEL"), true);
    assert.strictEqual(smallMatch.joinPlayer("p3", "VENEX"), false);
    smallMatch.destroy();
  });

  // ─── Match Lifecycle ──────────────────────────────────────────────────────

  it("should transition from LOBBY to COUNTDOWN", () => {
    match.joinPlayer("p1", "HURAN");
    const started = match.startCountdown();
    assert.strictEqual(started, true);
    assert.strictEqual(match.getStatus(), "COUNTDOWN");
  });

  it("should auto-transition from COUNTDOWN to IN_PROGRESS after countdown", async () => {
    match.joinPlayer("p1", "HURAN");
    match.joinPlayer("p2", "KHAEL");
    match.startCountdown();
    assert.strictEqual(match.getStatus(), "COUNTDOWN");

    await sleep(COUNTDOWN_WAIT_MS);
    assert.strictEqual(match.getStatus(), "IN_PROGRESS");
  });

  it("should not start countdown with no players", () => {
    const started = match.startCountdown();
    assert.strictEqual(started, false);
    assert.strictEqual(match.getStatus(), "LOBBY");
  });

  it("should not start countdown when not in LOBBY", () => {
    match.joinPlayer("p1", "HURAN");
    match.startCountdown();
    const started2 = match.startCountdown();
    assert.strictEqual(started2, false);
  });

  // ─── Kill Pipeline ────────────────────────────────────────────────────────

  it("should down a player with 150 damage (shields absorb first)", async () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    const kill = match.processKill("killer", "victim", 150, "rifle");
    assert.notStrictEqual(kill, null);

    const victim = match.getPlayer("victim")!;
    assert.strictEqual(victim.shield, 0);   // 50 shield absorbed
    assert.strictEqual(victim.health, 0);   // 100 remaining health gone
    assert.strictEqual(victim.isDowned, true);
  });

  it("should absorb shield damage first", async () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    // 40 damage — all absorbed by shield
    match.processKill("killer", "victim", 40, "rifle");
    const victim = match.getPlayer("victim")!;
    assert.strictEqual(victim.shield, 10);
    assert.strictEqual(victim.health, 100);
    assert.strictEqual(victim.isDowned, false);
  });

  it("should credit killer immediately when victim is downed", async () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    match.processKill("killer", "victim", 200, "rifle");
    assert.strictEqual(match.getPlayer("killer")!.kills, 1);

    // Economy reward exists immediately
    const rewards = match.getEconomy().getRewards().filter(r => r.type === "KILL");
    assert.strictEqual(rewards.length, 1);
  });

  // ─── Revive ───────────────────────────────────────────────────────────────

  it("should revive a downed player with 30 HP", async () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    match.processKill("killer", "victim", 200, "rifle");
    assert.strictEqual(match.getPlayer("victim")!.isDowned, true);

    const revived = match.revivePlayer("victim");
    assert.strictEqual(revived, true);
    assert.strictEqual(match.getPlayer("victim")!.isDowned, false);
    assert.strictEqual(match.getPlayer("victim")!.health, 30);
  });

  it("should not revive an alive player", async () => {
    match.joinPlayer("p1", "HURAN");
    match.joinPlayer("p2", "ZHEERS");
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    const revived = match.revivePlayer("p2");
    assert.strictEqual(revived, false);
  });

  // ─── Event Log ────────────────────────────────────────────────────────────

  it("should track events in the event log", async () => {
    match.joinPlayer("p1", "HURAN");
    match.joinPlayer("p2", "ZHEERS");
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    match.processKill("p1", "p2", 200, "rifle");

    const events = match.getEventLog();
    assert.ok(events.some(e => e.type === "PLAYER_JOINED"));
    assert.ok(events.some(e => e.type === "COUNTDOWN_STARTED"));
    assert.ok(events.some(e => e.type === "MATCH_STARTED"));
    assert.ok(events.some(e => e.type === "KILL"));
  });

  it("should record PLAYER_DOWNED event when victim health reaches 0", async () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    match.processKill("killer", "victim", 200, "rifle");

    const events = match.getEventLog();
    assert.ok(events.some(e => e.type === "PLAYER_DOWNED"));
  });

  // ─── RING_PHASES ──────────────────────────────────────────────────────────

  it("should have 5 ring phases", () => {
    assert.strictEqual(RING_PHASES.length, 5);
  });

  it("should have increasing damage per tick across ring phases", () => {
    for (let i = 1; i < RING_PHASES.length; i++) {
      assert.ok(RING_PHASES[i].damagePerTick > RING_PHASES[i - 1].damagePerTick);
    }
  });

  // ─── Auto-elimination ─────────────────────────────────────────────────────

  it("should auto-eliminate downed player after timeout", async () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.joinPlayer("other", "KHAEL");
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    match.processKill("killer", "victim", 200, "rifle");
    assert.strictEqual(match.getPlayer("victim")!.isDowned, true);
    assert.strictEqual(match.getPlayer("victim")!.isEliminated, false);

    await sleep(DOWNED_WAIT_MS);
    assert.strictEqual(match.getPlayer("victim")!.isEliminated, true);
  });

  // ─── eliminatePlayer ──────────────────────────────────────────────────────

  it("should manually eliminate a player", async () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.joinPlayer("other", "KHAEL");
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    match.processKill("killer", "victim", 200, "rifle");
    const eliminated = match.eliminatePlayer("victim");
    assert.strictEqual(eliminated, true);
    assert.strictEqual(match.getPlayer("victim")!.isEliminated, true);
  });

  // ─── Leaderboard ──────────────────────────────────────────────────────────

  it("should return leaderboard sorted by kills", async () => {
    match.joinPlayer("p1", "HURAN");
    match.joinPlayer("p2", "KHAEL");
    match.joinPlayer("p3", "ZHEERS");
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    match.processKill("p2", "p3", 200, "rifle");  // p2 gets 1 kill
    match.processKill("p2", "p1", 200, "rifle");   // p2 gets 2 kills (but p1 eliminated)

    const lb = match.getLeaderboard();
    assert.strictEqual(lb[0].playerId, "p2");
    assert.strictEqual(lb[0].kills, 2);
  });
});
