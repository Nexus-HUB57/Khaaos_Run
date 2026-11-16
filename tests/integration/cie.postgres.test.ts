import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL é obrigatório para a suíte PostgreSQL.");
const parsed = new URL(testDatabaseUrl);
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
if (!["postgres:", "postgresql:"].includes(parsed.protocol)
  || !new Set(["localhost", "127.0.0.1", "::1"]).has(parsed.hostname)
  || !databaseName.endsWith("_test")
  || process.env.NODE_ENV === "production") {
  throw new Error("Proteção: teste CIE aceita apenas PostgreSQL local descartável com nome terminado em _test.");
}
process.env.DATABASE_URL = testDatabaseUrl;
const [{ ciePostgresRepository: repository }, { pool }] = await Promise.all([
  import("../../server/game/cieRepository.postgres.ts"),
  import("../../server/db.ts"),
]);

before(async () => {
  const result = await pool.query<{ database_name: string }>("SELECT current_database() AS database_name");
  assert.equal(result.rows[0]?.database_name, databaseName);
});

after(async () => { await pool.end(); });

test("PostgreSQL: CIE persiste agenda, compõe 90/até10 e aplica retorno uma única vez", async () => {
  const campaignId = `cie-test-${randomUUID()}`;
  const campaignStart = new Date(Date.now() - 36 * 60 * 60 * 1000);
  try {
    await repository.createCampaign({ campaignId, startsAt: campaignStart });
    await repository.createCampaign({ campaignId, startsAt: campaignStart }); // replay idempotente
    const eventResult = await pool.query<{ id: string; scheduled_trigger_at: Date }>(
      "SELECT id, scheduled_trigger_at FROM cie_events WHERE campaign_id = $1 AND campaign_day = 1",
      [campaignId],
    );
    assert.equal(eventResult.rows.length, 1);
    const eventId = eventResult.rows[0]!.id;
    const triggerAt = new Date(eventResult.rows[0]!.scheduled_trigger_at);

    const survivorIds = Array.from({ length: 90 }, (_, index) => `${campaignId}-survivor-${index}`);
    const eliminatedId = `${campaignId}-eliminated`;
    for (const playerId of [...survivorIds, eliminatedId]) {
      await repository.upsertCampaignPlayer({
        campaignId,
        playerId,
        state: playerId === eliminatedId ? "ELIMINATED" : "SURVIVOR",
        currentDay: 1,
      });
      await pool.query(`
        INSERT INTO campaign_players (campaign_id, player_id, status, current_day, attempts_used_today)
        VALUES ($1, $2, $3, $4, $5)
      `, [campaignId, playerId, playerId === eliminatedId ? "ELIMINATED" : "READY", playerId === eliminatedId ? 1 : 2, playerId === eliminatedId ? 1 : 0]);
      await repository.renewPresence({ campaignId, playerId, now: new Date(triggerAt.getTime() - 1_000), ttlMs: 120_000 });
    }
    assert.equal(await repository.renewActiveCampaignPresence({
      playerId: survivorIds[0]!,
      now: new Date(triggerAt.getTime() - 1_000),
      ttlMs: 120_000,
    }), 1);

    // Gate closed: the event waits, not opens, until the regular Ring coordinator confirms resolution.
    assert.deepEqual(await repository.processDueEvents(triggerAt), { opened: 0, locked: 0, expired: 0 });
    await repository.setRegularRingsResolved(campaignId, 1, true);
    const openAt = new Date(triggerAt.getTime() + 30_000);
    const concurrentSchedulerPolls = await Promise.all([
      repository.processDueEvents(openAt),
      repository.processDueEvents(openAt),
    ]);
    assert.equal(concurrentSchedulerPolls.reduce((total, result) => total + result.opened, 0), 1);
    assert.equal(concurrentSchedulerPolls.reduce((total, result) => total + result.locked, 0), 0);
    assert.equal(concurrentSchedulerPolls.reduce((total, result) => total + result.expired, 0), 0);

    const registrationAt = new Date(openAt.getTime() + 10_000);
    for (const playerId of [...survivorIds, eliminatedId]) {
      await repository.renewPresence({ campaignId, playerId, now: registrationAt, ttlMs: 120_000 });
      const signup = await repository.registerForCie({ eventId, playerId, now: registrationAt });
      assert.equal(signup.alreadyRegistered, false);
      assert.equal(signup.role, playerId === eliminatedId ? "ELIMINATED" : "SURVIVOR");
    }
    const replaySignup = await repository.registerForCie({ eventId, playerId: survivorIds[0]!, now: registrationAt });
    assert.equal(replaySignup.alreadyRegistered, true);

    const closesAt = new Date(openAt.getTime() + 3 * 60_000);
    const lockPresenceAt = new Date(closesAt.getTime() - 5_000);
    for (const playerId of [...survivorIds, eliminatedId]) {
      await repository.renewPresence({ campaignId, playerId, now: lockPresenceAt, ttlMs: 30_000 });
    }
    assert.deepEqual(await repository.processDueEvents(closesAt), { opened: 0, locked: 1, expired: 0 });
    const selectedRows = await pool.query<{ role: string; total: string }>(
      "SELECT role, count(*)::text AS total FROM cie_participants WHERE event_id = $1 AND selected = true GROUP BY role",
      [eventId],
    );
    const rosterCounts = Object.fromEntries(selectedRows.rows.map((row) => [row.role, Number(row.total)]));
    assert.equal(rosterCounts.SURVIVOR, 90);
    assert.equal(rosterCounts.ELIMINATED, 1); // unused eliminated seats remain vacant

    assert.equal(await repository.beginEvent(eventId, `${campaignId}-room`), true);
    const selected = await pool.query<{ player_id: string; role: string }>(
      "SELECT player_id, role FROM cie_participants WHERE event_id = $1 AND selected = true ORDER BY role, player_id",
      [eventId],
    );
    const results = selected.rows.map((row, index) => ({
      playerId: row.player_id,
      placement: row.role === "ELIMINATED" ? 1 : index + 2,
      aliveAtEnd: row.role === "SURVIVOR" && row.player_id !== survivorIds[0],
      returnSealAtFinish: false,
    }));
    const resolved = await repository.resolveEvent(eventId, results);
    assert.equal(resolved.replayed, false);
    assert.equal(resolved.outcomes.find((outcome) => outcome.playerId === eliminatedId)?.decision.outcome, "RETURN_NEXT_DAY");
    assert.equal(resolved.outcomes.find((outcome) => outcome.playerId === survivorIds[0])?.decision.outcome, "SURVIVOR_ELIMINATED_IN_CIE");
    const replayed = await repository.resolveEvent(eventId, results);
    assert.equal(replayed.replayed, true);
    assert.deepEqual(replayed.outcomes.map(({ playerId, decision }) => [playerId, decision.outcome]), resolved.outcomes.map(({ playerId, decision }) => [playerId, decision.outcome]));

    const player = await pool.query<{ state: string; current_day: number; return_used: boolean }>(
      "SELECT state, current_day, return_used FROM cie_campaign_players WHERE campaign_id = $1 AND player_id = $2",
      [campaignId, eliminatedId],
    );
    assert.deepEqual(player.rows[0], { state: "SURVIVOR", current_day: 2, return_used: true });
    const returnedRegular = await pool.query<{ status: string; current_day: number; attempts_used_today: number; return_used: boolean }>(
      "SELECT status, current_day, attempts_used_today, return_used FROM campaign_players WHERE campaign_id = $1 AND player_id = $2",
      [campaignId, eliminatedId],
    );
    assert.deepEqual(returnedRegular.rows[0], { status: "READY", current_day: 2, attempts_used_today: 0, return_used: true });
    const eliminatedRegular = await pool.query<{ status: string; current_day: number; attempts_used_today: number }>(
      "SELECT status, current_day, attempts_used_today FROM campaign_players WHERE campaign_id = $1 AND player_id = $2",
      [campaignId, survivorIds[0]],
    );
    assert.deepEqual(eliminatedRegular.rows[0], { status: "ELIMINATED", current_day: 1, attempts_used_today: 1 });
  } finally {
    await pool.query("DELETE FROM cie_campaigns WHERE campaign_id = $1", [campaignId]);
  }
});
