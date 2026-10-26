import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MatchFlow } from "../../server/game/MatchFlow.ts";

// Real-timer equivalents of the vitest fake-timer flow:
// countdown of 1s (waited ≥ 1.3s) and downed-elimination of 300ms.
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const COUNTDOWN_WAIT_MS = 1300;
const DOWNED_WAIT_MS = 500;

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
    match = new MatchFlow("sim-match-001", {
      maxPlayers: 100,
      countdownSeconds: 1,
      downedEliminateTimeoutMs: 300,
    });
  });

  afterEach(() => {
    match.destroy();
  });

  it("should simulate a complete match lifecycle: Create → Join → Countdown → Kills → Revive → End", async () => {
    // ── Create ──
    assert.strictEqual(match.getStatus(), "LOBBY");
    assert.strictEqual(match.getPlayers().length, 0);

    // ── Join 10 operatives (all 6 species) ──
    for (let i = 0; i < 10; i++) {
      const joined = match.joinPlayer(makePlayerId(i), getSpecies(i) as any);
      assert.strictEqual(joined, true);
    }
    assert.strictEqual(match.getPlayers().length, 10);

    // Verify initial stats
    for (const player of match.getPlayers()) {
      assert.strictEqual(player.health, 100);
      assert.strictEqual(player.shield, 50);
      assert.strictEqual(player.isDowned, false);
      assert.strictEqual(player.isEliminated, false);
      assert.strictEqual(player.kills, 0);
    }

    // ── Countdown ──
    const started = match.startCountdown();
    assert.strictEqual(started, true);
    assert.strictEqual(match.getStatus(), "COUNTDOWN");

    // Wait past countdown
    await sleep(COUNTDOWN_WAIT_MS);
    assert.strictEqual(match.getStatus(), "IN_PROGRESS");

    // ── Kills: 200 damage per kill (enough to down: shield(50)+health(100)=150) ──
    // op-000 kills op-005 (200 dmg > 150 needed)
    const kill1 = match.processKill("op-000", "op-005", 200, WEAPONS[0]);
    assert.notStrictEqual(kill1, null);
    assert.strictEqual(kill1!.victimWasDowned, false);

    const killer = match.getPlayer("op-000")!;
    const victim = match.getPlayer("op-005")!;
    assert.strictEqual(killer.kills, 1);
    assert.strictEqual(victim.isDowned, true);
    assert.strictEqual(victim.isEliminated, false);
    assert.ok(kill1!.reward !== undefined);
    assert.ok(kill1!.reward > 0);

    // op-001 kills op-006
    const kill2 = match.processKill("op-001", "op-006", 200, WEAPONS[1]);
    assert.notStrictEqual(kill2, null);
    assert.strictEqual(match.getPlayer("op-001")!.kills, 1);
    assert.strictEqual(match.getPlayer("op-006")!.isDowned, true);

    // op-002 kills op-007
    const kill3 = match.processKill("op-002", "op-007", 200, WEAPONS[2]);
    assert.notStrictEqual(kill3, null);
    assert.strictEqual(match.getPlayer("op-002")!.kills, 1);

    // ── Revive ──
    const revived = match.revivePlayer("op-005");
    assert.strictEqual(revived, true);
    assert.strictEqual(match.getPlayer("op-005")!.isDowned, false);
    assert.strictEqual(match.getPlayer("op-005")!.health, 30);

    // Can't revive an alive player
    const reviveAgain = match.revivePlayer("op-005");
    assert.strictEqual(reviveAgain, false);

    // ── End Match ──
    match.endMatch("op-000");
    assert.strictEqual(match.getStatus(), "FINISHED");

    // ── Economy verification ──
    const economy = match.getEconomy();
    const summary = economy.getMatchSummary();
    assert.ok(summary.rewardCount > 0);
    assert.ok(summary.totalRewards > 0);
  });

  it("should verify kill counts match expected values", async () => {
    for (let i = 0; i < 10; i++) {
      match.joinPlayer(makePlayerId(i), getSpecies(i) as any);
    }
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    // op-000 kills 3 players
    match.processKill("op-000", "op-005", 200, WEAPONS[0]);
    match.processKill("op-000", "op-006", 200, WEAPONS[0]);
    match.processKill("op-000", "op-007", 200, WEAPONS[0]);

    assert.strictEqual(match.getPlayer("op-000")!.kills, 3);
    assert.strictEqual(match.getKillLog().length, 3);
  });

  it("should verify economy rewards are recorded for kills", async () => {
    for (let i = 0; i < 10; i++) {
      match.joinPlayer(makePlayerId(i), getSpecies(i) as any);
    }
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    match.processKill("op-000", "op-005", 200, WEAPONS[0]);

    const rewards = match.getEconomy().getRewards();
    const killRewards = rewards.filter(r => r.type === "KILL");
    assert.ok(killRewards.length >= 1);
    assert.ok(killRewards[0].amount > 0);
  });

  it("should verify event log tracks all events", async () => {
    for (let i = 0; i < 3; i++) {
      match.joinPlayer(makePlayerId(i), getSpecies(i) as any);
    }
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    match.processKill("op-000", "op-001", 200, WEAPONS[0]);
    match.revivePlayer("op-001");

    const events = match.getEventLog();
    assert.ok(events.some(e => e.type === "PLAYER_JOINED"));
    assert.ok(events.some(e => e.type === "COUNTDOWN_STARTED"));
    assert.ok(events.some(e => e.type === "MATCH_STARTED"));
    assert.ok(events.some(e => e.type === "KILL"));
    assert.ok(events.some(e => e.type === "PLAYER_REVIVED"));
  });

  it("should follow damage pipeline: Shield→Health→Downed→Eliminate", async () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    // Step 1: Shield absorbs damage
    const hit1 = match.processKill("killer", "victim", 30, WEAPONS[0]);
    const v1 = match.getPlayer("victim")!;
    assert.strictEqual(v1.shield, 20); // 50 - 30
    assert.strictEqual(v1.health, 100);
    assert.strictEqual(v1.isDowned, false);

    // Step 2: Shield depleted, health takes damage
    const hit2 = match.processKill("killer", "victim", 30, WEAPONS[0]);
    const v2 = match.getPlayer("victim")!;
    assert.strictEqual(v2.shield, 0); // depleted
    assert.strictEqual(v2.health, 90); // 100 - (30-20) = 90 ... wait, shield was 20, 30 damage = 20 shield + 10 health
    assert.strictEqual(v2.isDowned, false);

    // Step 3: Health damage until downed
    const hit3 = match.processKill("killer", "victim", 100, WEAPONS[0]);
    const v3 = match.getPlayer("victim")!;
    assert.strictEqual(v3.isDowned, true);
    assert.strictEqual(match.getPlayer("killer")!.kills, 1);

    // Step 4: Eliminate after timeout
    await sleep(DOWNED_WAIT_MS);
    const v4 = match.getPlayer("victim")!;
    assert.strictEqual(v4.isEliminated, true);
  });

  it("should configure spectator pipeline", () => {
    const spectator = match.getSpectator();
    const config = spectator.getConfig();
    assert.strictEqual(config.delayMs, 10000);
    assert.strictEqual(config.maxSpectatorsPerRoom, 500);
    assert.strictEqual(config.batchIntervalMs, 200);
    assert.strictEqual(config.globalMaxSpectators, 5000);
    assert.strictEqual(config.maxEventsPerBatch, 20);
  });

  it("should initialize Discord bot", () => {
    const discord = match.getDiscord();
    // Discord bot should exist (operational status depends on webhook URL env var)
    assert.notStrictEqual(discord, undefined);
    const stats = discord.getStats();
    assert.ok("messagesSent" in stats);
    assert.ok("messagesDropped" in stats);
    assert.ok("eventsProcessed" in stats);
  });

  it("should handle 10-player stress test", async () => {
    // Join 10 players
    for (let i = 0; i < 10; i++) {
      match.joinPlayer(makePlayerId(i), getSpecies(i) as any);
    }
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    // Simulate many kills
    // op-000 kills op-005 through op-009
    for (let i = 5; i < 10; i++) {
      const kill = match.processKill("op-000", makePlayerId(i), 200, WEAPONS[0]);
      assert.notStrictEqual(kill, null);
    }
    assert.strictEqual(match.getPlayer("op-000")!.kills, 5);

    // op-001 kills op-002 and op-003
    match.processKill("op-001", "op-002", 200, WEAPONS[1]);
    match.processKill("op-001", "op-003", 200, WEAPONS[1]);
    assert.strictEqual(match.getPlayer("op-001")!.kills, 2);

    // Verify kill log
    assert.strictEqual(match.getKillLog().length, 7);

    // End match
    match.endMatch("op-000");
    assert.strictEqual(match.getStatus(), "FINISHED");

    // Verify economy
    const summary = match.getEconomy().getMatchSummary();
    assert.ok(summary.rewardCount > 0);
  });

  it("should immediately credit kills when victim is downed (not deferred)", async () => {
    match.joinPlayer("killer", "HURAN");
    match.joinPlayer("victim", "ZHEERS");
    match.startCountdown();
    await sleep(COUNTDOWN_WAIT_MS);

    // Down the victim
    match.processKill("killer", "victim", 200, WEAPONS[0]);
    assert.strictEqual(match.getPlayer("victim")!.isDowned, true);
    assert.strictEqual(match.getPlayer("killer")!.kills, 1);

    // Kill credit was IMMEDIATE — verify economy reward exists
    const rewards = match.getEconomy().getRewards();
    const killRewards = rewards.filter(r => r.type === "KILL");
    assert.strictEqual(killRewards.length, 1);
    assert.ok(killRewards[0].amount > 0);

    // Now finish the victim (was already downed)
    const kill2 = match.processKill("killer", "victim", 50, WEAPONS[0]);
    // Victim was already downed, should be eliminated immediately
    assert.strictEqual(match.getPlayer("victim")!.isEliminated, true);
    // Killer gets a second kill credit
    assert.strictEqual(match.getPlayer("killer")!.kills, 2);
  });
});
