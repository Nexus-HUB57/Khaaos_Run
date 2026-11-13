import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL é obrigatório para os testes PostgreSQL de campanha.");
const parsed = new URL(testDatabaseUrl);
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
if (!["postgres:", "postgresql:"].includes(parsed.protocol)
  || !new Set(["localhost", "127.0.0.1", "::1"]).has(parsed.hostname)
  || !databaseName.endsWith("_test")
  || process.env.NODE_ENV === "production") {
  throw new Error("Proteção: testes de campanha aceitam apenas PostgreSQL local descartável com nome terminado em _test.");
}
process.env.DATABASE_URL = testDatabaseUrl;
const [dbModule, workerModule, roomManagerModule] = await Promise.all([
  import("../../server/db.ts"),
  import("../../server/game/campaignOutboxWorker.ts"),
  import("../../server/game/RoomManager.ts"),
]);
const { pool } = dbModule;
const { CampaignOutboxWorker, campaignRoomRequestedHandler } = workerModule;
const { RoomManagerClass } = roomManagerModule;

before(async () => {
  const result = await pool.query<{ database_name: string }>("SELECT current_database() AS database_name");
  assert.equal(result.rows[0]?.database_name, databaseName);
});

after(async () => { await pool.end(); });

test("PostgreSQL triggers: proteção, teto 100 e Ring pronto com roster exato", async () => {
  const campaignId = `campaign-trigger-${randomUUID()}`;
  try {
    await pool.query("INSERT INTO cie_campaigns (campaign_id, starts_at) VALUES ($1, now())", [campaignId]);
    await pool.query(`
      INSERT INTO campaign_players (campaign_id, player_id, ring_protection_until)
      SELECT $1, 'player-' || n,
             CASE WHEN n = 101 THEN now() + interval '1 day' ELSE NULL END
      FROM generate_series(1, 101) AS n
    `, [campaignId]);

    const intakeId = (await pool.query<{ intake_id: string }>(`
      INSERT INTO campaign_intakes
        (campaign_id, campaign_day, opened_at, closes_at, next_check_at)
      VALUES ($1, 1, now(), now() + interval '3 minutes', now() + interval '3 minutes')
      RETURNING intake_id
    `, [campaignId])).rows[0]!.intake_id;

    await assert.rejects(
      pool.query(`
        INSERT INTO campaign_intake_signups
          (intake_id, campaign_id, campaign_day, player_id, source)
        VALUES ($1, $2, 1, 'player-101', 'RANDOM')
      `, [intakeId, campaignId]),
      (error: { code?: string }) => error.code === "23514",
      "random fill must reject a player whose Ring protection is still active",
    );

    await pool.query(`
      INSERT INTO campaign_intake_signups (intake_id, campaign_id, campaign_day, player_id)
      SELECT $1, $2, 1, 'player-' || n FROM generate_series(1, 100) AS n
    `, [intakeId, campaignId]);

    await assert.rejects(
      pool.query(`
        INSERT INTO campaign_intake_signups (intake_id, campaign_id, campaign_day, player_id)
        VALUES ($1, $2, 1, 'player-101')
      `, [intakeId, campaignId]),
      (error: { code?: string }) => error.code === "23514",
      "signup trigger must reject the 101st roster member",
    );

    const readyClient = await pool.connect();
    try {
      await readyClient.query("BEGIN");
      const ringId = (await readyClient.query<{ ring_id: string }>(`
        INSERT INTO campaign_rings (intake_id, campaign_id, campaign_day, status)
        VALUES ($1, $2, 1, 'PREPARING') RETURNING ring_id
      `, [intakeId, campaignId])).rows[0]!.ring_id;
      await readyClient.query(`
        INSERT INTO campaign_ring_players (ring_id, campaign_id, campaign_day, player_id, source)
        SELECT $1, $2, 1, 'player-' || n, 'SIGNED' FROM generate_series(1, 100) AS n
      `, [ringId, campaignId]);
      await readyClient.query("UPDATE campaign_rings SET status = 'READY' WHERE ring_id = $1", [ringId]);
      await readyClient.query("COMMIT");
      const rosterCount = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM campaign_ring_players WHERE ring_id = $1", [ringId],
      );
      assert.equal(rosterCount.rows[0]?.count, 100);
    } finally {
      await readyClient.query("ROLLBACK").catch(() => undefined);
      readyClient.release();
    }

    const badClient = await pool.connect();
    try {
      await badClient.query("BEGIN");
      const incompleteIntakeId = (await badClient.query<{ intake_id: string }>(`
        INSERT INTO campaign_intakes
          (campaign_id, campaign_day, opened_at, closes_at, next_check_at)
        VALUES ($1, 2, now(), now() + interval '3 minutes', now() + interval '3 minutes')
        RETURNING intake_id
      `, [campaignId])).rows[0]!.intake_id;
      const incompleteRingId = (await badClient.query<{ ring_id: string }>(`
        INSERT INTO campaign_rings (intake_id, campaign_id, campaign_day, status)
        VALUES ($1, $2, 2, 'PREPARING') RETURNING ring_id
      `, [incompleteIntakeId, campaignId])).rows[0]!.ring_id;
      await badClient.query("UPDATE campaign_rings SET status = 'READY' WHERE ring_id = $1", [incompleteRingId]);
      await assert.rejects(
        badClient.query("COMMIT"),
        (error: { code?: string }) => error.code === "23514",
        "deferred constraint trigger must reject a READY Ring with fewer than 100 players at commit",
      );
      await badClient.query("ROLLBACK").catch(() => undefined);
    } finally {
      badClient.release();
    }
  } finally {
    await pool.query("DELETE FROM cie_campaigns WHERE campaign_id = $1", [campaignId]);
  }
});

test("PostgreSQL outbox worker: dispatch idempotente, retry e claim concorrente", async () => {
  const ringIds = [randomUUID(), randomUUID(), randomUUID()];
  const dedupeKeys = ringIds.map((ringId, index) => `worker-test:${ringId}:${index}`);
  const playerIds = Array.from({ length: 100 }, (_, index) => `worker-player-${index}`);
  const payload = (ringId: string) => ({
    ringId,
    intakeId: randomUUID(),
    campaignId: `worker-campaign-${randomUUID()}`,
    day: 1,
    playerIds,
  });
  const enqueue = async (index: number) => pool.query(`
    INSERT INTO campaign_outbox (dedupe_key, event_type, aggregate_id, payload, available_at)
    VALUES ($1, 'CAMPAIGN_ROOM_REQUESTED', $2, $3::jsonb, now() - interval '1 second')
  `, [dedupeKeys[index], ringIds[index], JSON.stringify(payload(ringIds[index]!))]);
  try {
    await enqueue(0);

    const dispatched: string[] = [];
    const dispatchHandler = campaignRoomRequestedHandler(async (request) => {
      assert.equal(request.playerIds.length, 100);
      dispatched.push(request.ringId);
    });
    const worker = new CampaignOutboxWorker(pool, { CAMPAIGN_ROOM_REQUESTED: dispatchHandler }, { batchSize: 50 });
    const first = await worker.pollOnce();
    assert.ok(first.claimed >= 1 && first.delivered >= 1);
    const firstState = await pool.query<{ status: string; attempts: number; delivered_at: Date | null }>(
      "SELECT status, attempts, delivered_at FROM campaign_outbox WHERE dedupe_key = $1", [dedupeKeys[0]],
    );
    assert.equal(firstState.rows[0]?.status, "DELIVERED");
    assert.equal(firstState.rows[0]?.attempts, 1);
    assert.ok(firstState.rows[0]?.delivered_at);
    assert.deepEqual(dispatched, [ringIds[0]]);

    await enqueue(1);
    let retryCalls = 0;
    const retryWorker = new CampaignOutboxWorker(pool, {
      CAMPAIGN_ROOM_REQUESTED: campaignRoomRequestedHandler(async (request) => {
        if (request.idempotencyKey !== dedupeKeys[1]) return;
        retryCalls += 1;
        if (retryCalls === 1) throw new Error("temporary room service failure");
      }),
    }, { batchSize: 1, retryBaseMs: 0, retryMaxMs: 0 });
    const failedPass = await retryWorker.pollOnce();
    assert.deepEqual(failedPass, { claimed: 1, delivered: 0, retried: 1, dead: 0 });
    const retryPass = await retryWorker.pollOnce();
    assert.deepEqual(retryPass, { claimed: 1, delivered: 1, retried: 0, dead: 0 });
    assert.equal(retryCalls, 2);

    await enqueue(2);
    let concurrentDispatches = 0;
    const slowHandler = campaignRoomRequestedHandler(async () => {
      concurrentDispatches += 1;
      await new Promise((resolve) => setTimeout(resolve, 75));
    });
    const workerA = new CampaignOutboxWorker(pool, { CAMPAIGN_ROOM_REQUESTED: slowHandler }, { batchSize: 1 });
    const workerB = new CampaignOutboxWorker(pool, { CAMPAIGN_ROOM_REQUESTED: slowHandler }, { batchSize: 1 });
    const [passA, passB] = await Promise.all([workerA.pollOnce(), workerB.pollOnce()]);
    assert.equal(passA.claimed + passB.claimed, 1);
    assert.equal(concurrentDispatches, 1, "SKIP LOCKED/lease should prevent simultaneous duplicate dispatch");

    const statuses = await pool.query<{ status: string; attempts: number }>(
      "SELECT status, attempts FROM campaign_outbox WHERE dedupe_key = ANY($1::varchar[]) ORDER BY dedupe_key",
      [dedupeKeys],
    );
    assert.equal(statuses.rows.length, 3);
    assert.ok(statuses.rows.every((row) => row.status === "DELIVERED"));
    await worker.start();
    await worker.stop();
  } finally {
    await pool.query("DELETE FROM campaign_outbox WHERE dedupe_key = ANY($1::varchar[])", [dedupeKeys]);
  }
});

test("RoomManager.ensureCampaignRoom: 100 seats, stable room_id and idempotent retry", async () => {
  const campaignId = `campaign-room-${randomUUID()}`;
  const playerIdPrefix = `kr-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const playerIds = Array.from({ length: 100 }, (_, index) => `${playerIdPrefix}-${index}`);
  const outboxKey = `campaign-room-outbox:${randomUUID()}`;
  const manager = new RoomManagerClass();
  let ringId: string | undefined;
  let intakeId: string | undefined;
  let roomId: string | undefined;
  try {
    await pool.query("INSERT INTO cie_campaigns (campaign_id, starts_at) VALUES ($1, now())", [campaignId]);
    await pool.query(`
      INSERT INTO campaign_players (campaign_id, player_id)
      SELECT $1, player_id FROM unnest($2::text[]) AS player_id
    `, [campaignId, playerIds]);
    intakeId = (await pool.query<{ intake_id: string }>(`
      INSERT INTO campaign_intakes
        (campaign_id, campaign_day, opened_at, closes_at, next_check_at)
      VALUES ($1, 1, now(), now() + interval '3 minutes', now() + interval '3 minutes')
      RETURNING intake_id
    `, [campaignId])).rows[0]!.intake_id;
    const readyClient = await pool.connect();
    try {
      await readyClient.query("BEGIN");
      ringId = (await readyClient.query<{ ring_id: string }>(`
        INSERT INTO campaign_rings (intake_id, campaign_id, campaign_day, status)
        VALUES ($1, $2, 1, 'PREPARING') RETURNING ring_id
      `, [intakeId, campaignId])).rows[0]!.ring_id;
      await readyClient.query(`
        INSERT INTO campaign_ring_players (ring_id, campaign_id, campaign_day, player_id, source)
        SELECT $1, $2, 1, player_id, 'SIGNED' FROM unnest($3::text[]) AS player_id
      `, [ringId, campaignId, playerIds]);
      await readyClient.query("UPDATE campaign_rings SET status = 'READY' WHERE ring_id = $1", [ringId]);
      await readyClient.query("COMMIT");
    } finally {
      await readyClient.query("ROLLBACK").catch(() => undefined);
      readyClient.release();
    }

    const request = {
      ringId,
      intakeId,
      campaignId,
      day: 1,
      playerIds: [...playerIds].reverse(),
      idempotencyKey: `room-provision:${ringId}`,
    };
    const concurrentEnsures = await Promise.allSettled([
      manager.ensureCampaignRoom(request),
      manager.ensureCampaignRoom(request),
    ]);
    const firstSuccess = concurrentEnsures.find((result) => result.status === "fulfilled");
    assert.ok(firstSuccess, `one concurrent provisioner must establish the room: ${JSON.stringify(concurrentEnsures)}`);
    roomId = firstSuccess.value;
    assert.equal(roomId, `campaign-${ringId}`);
    assert.deepEqual(manager.getRoomSummary(roomId), {
      id: roomId,
      worldId: "CIGKV",
      status: "COUNTDOWN",
      playerCount: 100,
      maxPlayers: 100,
    });

    const retryRoomId = await manager.ensureCampaignRoom(request);
    assert.equal(retryRoomId, roomId);
    assert.equal(manager.getRoomSummary(roomId)?.playerCount, 100);
    const persisted = await pool.query<{ room_id: string | null }>(
      "SELECT room_id FROM campaign_rings WHERE ring_id = $1", [ringId],
    );
    assert.equal(persisted.rows[0]?.room_id, roomId);
    const tieBreaks = await pool.query<{ roster_count: number; ticket_count: number }>(`
      SELECT count(*)::int AS roster_count, count(random_tie_break)::int AS ticket_count
      FROM campaign_ring_players WHERE ring_id = $1
    `, [ringId]);
    assert.deepEqual(tieBreaks.rows[0], { roster_count: 100, ticket_count: 100 });

    await pool.query(`
      INSERT INTO campaign_outbox (dedupe_key, event_type, aggregate_id, payload, available_at)
      VALUES ($1, 'CAMPAIGN_ROOM_REQUESTED', $2, $3::jsonb, now() - interval '1 second')
    `, [outboxKey, ringId, JSON.stringify({ ringId, intakeId, campaignId, day: 1, playerIds })]);
    const endToEndWorker = new CampaignOutboxWorker(pool, {
      CAMPAIGN_ROOM_REQUESTED: campaignRoomRequestedHandler((payload) => manager.ensureCampaignRoom(payload)),
    }, { batchSize: 1 });
    const dispatch = await endToEndWorker.pollOnce();
    assert.deepEqual(dispatch, { claimed: 1, delivered: 1, retried: 0, dead: 0 });
    const outboxState = await pool.query<{ status: string }>(
      "SELECT status FROM campaign_outbox WHERE dedupe_key = $1", [outboxKey],
    );
    assert.equal(outboxState.rows[0]?.status, "DELIVERED");

    const room = (manager as any).rooms.get(roomId);
    assert.ok(room);
    if (room.countdownHandle) clearInterval(room.countdownHandle);
    room.countdownHandle = null;
    await (manager as any).beginMatch(room);
    assert.equal(room.status, "IN_PROGRESS");
    assert.equal(room.campaign.evaluationCutoffAt - room.startedAt, 10 * 60_000);
    const startedState = await pool.query<{ status: string; started_at: Date | null }>(
      "SELECT status, started_at FROM campaign_rings WHERE ring_id = $1", [ringId],
    );
    assert.equal(startedState.rows[0]?.status, "IN_PROGRESS");
    assert.ok(startedState.rows[0]?.started_at);
    manager.leaveRoom(playerIds[0]);
    assert.equal(manager.getRoomSummary(roomId)?.playerCount, 100, "campaign participant cannot leave and shrink the frozen roster");

    const battleSurvivors = [...room.players.values()].slice(0, 12);
    for (const player of room.players.values()) {
      player.status = "ELIMINADO";
      player.health = 0;
    }
    for (const [index, player] of battleSurvivors.entries()) {
      player.status = "VIVO";
      player.health = index === 0 ? 100 : 90;
      player.campaignMetrics = {
        accountXp: index === 1 ? 900 : index === 2 ? 800 : index === 3 || index === 4 ? 700 : index === 0 ? 0 : 600,
        battlesPlayed: index === 3 ? 10 : index === 4 ? 5 : 1,
        lifetimeKills: index >= 5 ? 11 - index : 0,
        lifetimeDeaths: index >= 5 ? 1 : 0,
      };
    }
    const evaluationCutoffAt = room.campaign.evaluationCutoffAt;
    (manager as any).tick(room, evaluationCutoffAt);
    await room.campaign.finishPromise;
    assert.equal(room.status, "FINISHED");
    const resolvedRing = await pool.query<{ status: string; finish_reason: string }>(
      "SELECT status, finish_reason FROM campaign_rings WHERE ring_id = $1", [ringId],
    );
    assert.deepEqual(resolvedRing.rows[0], { status: "FINISHED", finish_reason: "TIME_LIMIT" });
    const progressedPlayers = await pool.query<{ status: string; current_day: number; attempts_used_today: number; count: number }>(`
      SELECT status, current_day, attempts_used_today, count(*)::int AS count
      FROM campaign_players WHERE campaign_id = $1
      GROUP BY status, current_day, attempts_used_today
    `, [campaignId]);
    assert.equal(progressedPlayers.rows.find((row) => row.status === "READY" && row.current_day === 2)?.count, 10);
    assert.equal(progressedPlayers.rows.find((row) => row.status === "ELIMINATED" && row.current_day === 1)?.count, 90);
    const cieProgress = await pool.query<{ state: string; current_day: number; count: number }>(`
      SELECT state, current_day, count(*)::int AS count
      FROM cie_campaign_players WHERE campaign_id = $1
      GROUP BY state, current_day
    `, [campaignId]);
    assert.equal(cieProgress.rows.find((row) => row.state === "SURVIVOR" && row.current_day === 2)?.count, 10);
    assert.equal(cieProgress.rows.find((row) => row.state === "ELIMINATED" && row.current_day === 1)?.count, 90);
    const finalRoster = await pool.query<{ player_id: string; placement: number | null; alive_at_finish: boolean }>(`
      SELECT player_id, placement, alive_at_finish FROM campaign_ring_players
      WHERE ring_id = $1 AND alive_at_finish = true ORDER BY placement
    `, [ringId]);
    assert.deepEqual(finalRoster.rows.slice(0, 10).map((row) => row.player_id), battleSurvivors.slice(0, 10).map((player: { userId: string }) => player.userId));
    assert.equal(finalRoster.rows.length, 12);
  } finally {
    if (roomId) {
      const room = (manager as any).rooms.get(roomId);
      if (room) (manager as any).rollbackRoomCreation(room, "test_cleanup");
    }
    await pool.query("DELETE FROM bank_accounts WHERE user_id = ANY($1::text[])", [playerIds]);
    await pool.query("DELETE FROM player_stats WHERE user_id = ANY($1::text[])", [playerIds]);
    await pool.query("DELETE FROM campaign_outbox WHERE dedupe_key = $1", [outboxKey]);
    await pool.query("DELETE FROM cie_campaigns WHERE campaign_id = $1", [campaignId]);
  }
});
