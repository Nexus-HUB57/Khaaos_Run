import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  CAMPAIGN_RULES_PROTOTYPE,
  type CampaignRosterCandidate,
} from "./campaignProgression.ts";
import {
  resolveLockedRoster,
  type IntakeCloseResult,
  type LockedIntakeSnapshot,
} from "./campaignCoordinator.example.ts";

/**
 * EXAMPLE ONLY. The regular-campaign tables used below are not in the current
 * schema/migration yet. Add them with constraints described in the docstring
 * before wiring this repository into the server lifecycle.
 *
 * Minimum uniqueness constraints:
 * - campaign_intake_signups UNIQUE (campaign_id, campaign_day, player_id)
 * - campaign_rings UNIQUE (intake_id)
 * - campaign_ring_players UNIQUE (campaign_id, campaign_day, player_id)
 * - campaign_ring_players UNIQUE (ring_id, player_id)
 * - campaign_outbox UNIQUE (dedupe_key)
 *
 * Signup transactions must lock the intake row first, then the player's
 * campaign_players row, before inserting into campaign_intake_signups. That
 * common lock order prevents a signup racing with this close transaction.
 */
export async function closeCampaignIntakePostgres(
  pool: Pool,
  input: { intakeId: string; now?: Date; drawSeed: string },
): Promise<IntakeCloseResult> {
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new RangeError("INVALID_INTAKE_CLOSE_TIME");
  if (!input.intakeId.trim()) throw new TypeError("CAMPAIGN_INTAKE_ID_REQUIRED");
  if (!input.drawSeed.trim()) throw new TypeError("CAMPAIGN_DRAW_SEED_REQUIRED");

  // A transaction must stay on one checked-out connection. Do not issue BEGIN
  // via pool.query(), which may send later statements to a different client.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Primary fence: only one replica can decide this intake at a time.
    const intakeResult = await client.query<IntakeRow>(`
      SELECT intake_id, campaign_id, campaign_day, opened_at, closes_at,
             status
      FROM campaign_intakes
      WHERE intake_id = $1
      FOR UPDATE
    `, [input.intakeId]);
    const intake = intakeResult.rows[0];
    if (!intake) throw new Error("CAMPAIGN_INTAKE_NOT_FOUND");

    if (intake.status === "CLOSED") {
      const existingRing = await client.query<{ ring_id: string }>(
        "SELECT ring_id FROM campaign_rings WHERE intake_id = $1",
        [input.intakeId],
      );
      const ringId = existingRing.rows[0]?.ring_id;
      if (!ringId) throw new Error("CLOSED_INTAKE_MISSING_RING_ID");
      await client.query("COMMIT");
      return { kind: "ALREADY_CLOSED", ringId };
    }
    if (intake.status !== "OPEN" && intake.status !== "WAITING_FOR_POOL") {
      throw new Error("CAMPAIGN_INTAKE_NOT_CLOSABLE");
    }

    // This join re-reads each signup's server-owned campaign state and locks
    // those player rows. The signup endpoint uses the same intake->player lock
    // order and checks that the player is still eligible before inserting.
    const signupResult = await client.query<SignupRow>(`
      SELECT s.player_id, s.registered_at,
             cp.status, cp.current_day, cp.ring_protection_until,
             cp.presence_expires_at
      FROM campaign_intake_signups AS s
      JOIN campaign_players AS cp
        ON cp.campaign_id = s.campaign_id
       AND cp.player_id = s.player_id
      WHERE s.intake_id = $1
      ORDER BY s.registered_at, s.player_id
      FOR UPDATE OF cp
    `, [input.intakeId]);

    if (signupResult.rows.length > CAMPAIGN_RULES_PROTOTYPE.maxPlayers) {
      throw new Error("CAMPAIGN_INTAKE_OVER_CAPACITY");
    }
    if (signupResult.rows.some((row) => row.status !== "READY" || row.current_day !== intake.campaign_day)) {
      // Never silently remove a locked signup or substitute another player.
      throw new Error("CAMPAIGN_SIGNUP_STATE_CHANGED");
    }

    const openedAt = new Date(intake.opened_at);
    const closesAt = new Date(intake.closes_at);
    if (signupResult.rows.length < CAMPAIGN_RULES_PROTOTYPE.maxPlayers && now < closesAt) {
      await client.query("COMMIT");
      return { kind: "NOT_DUE" };
    }

    const registered: CampaignRosterCandidate[] = signupResult.rows.map((row) => ({
      playerId: row.player_id,
      online: row.presence_expires_at !== null && new Date(row.presence_expires_at) > now,
      protectedUntilMs: row.ring_protection_until === null
        ? null
        : new Date(row.ring_protection_until).getTime(),
      registeredAtMs: new Date(row.registered_at).getTime(),
    }));
    const remainingSlots = CAMPAIGN_RULES_PROTOTYPE.maxPlayers - registered.length;

    // Lock only the number of random-fill candidates needed. A concurrent
    // intake uses SKIP LOCKED and can retry if this transaction temporarily
    // holds eligible survivors. md5(seed || player_id) creates a repeatable,
    // seed-dependent random ordering without loading/locking the whole pool.
    const candidateRows = remainingSlots === 0
      ? { rows: [] as CandidateRow[] }
      : await client.query<CandidateRow>(`
          SELECT cp.player_id, cp.ring_protection_until, cp.presence_expires_at
          FROM campaign_players AS cp
          WHERE cp.campaign_id = $1
            AND cp.current_day = $2
            AND cp.status = 'READY'
            AND (cp.ring_protection_until IS NULL OR cp.ring_protection_until <= $3)
            AND NOT EXISTS (
              SELECT 1
              FROM campaign_intake_signups AS s
              WHERE s.campaign_id = cp.campaign_id
                AND s.campaign_day = cp.current_day
                AND s.player_id = cp.player_id
            )
            AND NOT EXISTS (
              SELECT 1
              FROM campaign_ring_players AS rp
              WHERE rp.campaign_id = cp.campaign_id
                AND rp.campaign_day = cp.current_day
                AND rp.player_id = cp.player_id
            )
          ORDER BY md5($4 || ':' || cp.player_id), cp.player_id
          LIMIT $5
          FOR UPDATE OF cp SKIP LOCKED
        `, [intake.campaign_id, intake.campaign_day, now, input.drawSeed, remainingSlots]);

    const eligibleSurvivors: CampaignRosterCandidate[] = candidateRows.rows.map((row) => ({
      playerId: row.player_id,
      online: row.presence_expires_at !== null && new Date(row.presence_expires_at) > now,
      protectedUntilMs: row.ring_protection_until === null
        ? null
        : new Date(row.ring_protection_until).getTime(),
    }));
    const snapshot: LockedIntakeSnapshot = {
      intake: {
        intakeId: intake.intake_id,
        campaignId: intake.campaign_id,
        day: intake.campaign_day,
        openedAt,
        closesAt,
        status: intake.status,
      },
      registered,
      eligibleSurvivors,
    };
    const decision = resolveLockedRoster({ snapshot, now, drawSeed: input.drawSeed });

    if (decision.kind === "NOT_DUE") {
      await client.query("COMMIT");
      return { kind: "NOT_DUE" };
    }
    if (decision.kind === "WAITING") {
      await client.query(`
        UPDATE campaign_intakes
        SET status = 'WAITING_FOR_POOL', next_check_at = $2,
            updated_at = $3
        WHERE intake_id = $1
      `, [input.intakeId, new Date(now.getTime() + 30_000), now]);
      await client.query("COMMIT");
      return { kind: "WAITING_FOR_POOL", remainingSlots: decision.remainingSlots };
    }
    if (decision.kind !== "READY" || decision.roster.length !== CAMPAIGN_RULES_PROTOTYPE.maxPlayers) {
      throw new Error("CAMPAIGN_COORDINATOR_PARTIAL_ROSTER_FORBIDDEN");
    }

    const ringId = randomUUID();
    const signedIds = new Set(registered.map(({ playerId }) => playerId));

    // Insert automatic selections into the daily signup/reservation table as
    // source=RANDOM. The UNIQUE campaign/day/player key also races safely with
    // another intake's manual signup and is the final daily participation fence.
    for (const playerId of decision.filledRandomly) {
      const reserved = await client.query(`
        INSERT INTO campaign_intake_signups
          (intake_id, campaign_id, campaign_day, player_id, source, registered_at)
        VALUES ($1, $2, $3, $4, 'RANDOM', $5)
        ON CONFLICT (campaign_id, campaign_day, player_id) DO NOTHING
        RETURNING player_id
      `, [input.intakeId, intake.campaign_id, intake.campaign_day, playerId, now]);
      if (reserved.rowCount !== 1) throw new Error("CAMPAIGN_PLAYER_DAILY_RESERVATION_CONFLICT");
    }

    await client.query(`
      INSERT INTO campaign_rings
        (ring_id, intake_id, campaign_id, campaign_day, status, draw_seed, created_at)
      VALUES ($1, $2, $3, $4, 'PREPARING', $5, $6)
    `, [ringId, input.intakeId, intake.campaign_id, intake.campaign_day, decision.drawSeed, now]);

    for (const playerId of decision.roster.map(({ playerId }) => playerId)) {
      const inserted = await client.query(`
        INSERT INTO campaign_ring_players
          (ring_id, campaign_id, campaign_day, player_id, source, selected_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
        RETURNING player_id
      `, [ringId, intake.campaign_id, intake.campaign_day, playerId,
        signedIds.has(playerId) ? "SIGNED" : "RANDOM", now]);
      if (inserted.rowCount !== 1) throw new Error("CAMPAIGN_RING_ROSTER_CONFLICT");
    }

    const ringReady = await client.query(`
      UPDATE campaign_rings AS r
      SET status = 'READY'
      WHERE r.ring_id = $1
        AND (SELECT count(*) FROM campaign_ring_players WHERE ring_id = $1) = $2
      RETURNING r.ring_id
    `, [ringId, CAMPAIGN_RULES_PROTOTYPE.maxPlayers]);
    if (ringReady.rowCount !== 1) throw new Error("CAMPAIGN_RING_ROSTER_NOT_100");

    const closed = await client.query(`
      UPDATE campaign_intakes
      SET status = 'CLOSED', closed_at = $2,
          draw_seed = $3, next_check_at = $2, updated_at = $2
      WHERE intake_id = $1 AND status IN ('OPEN', 'WAITING_FOR_POOL')
      RETURNING intake_id
    `, [input.intakeId, now, decision.drawSeed]);
    if (closed.rowCount !== 1) throw new Error("CAMPAIGN_INTAKE_CLOSE_RACE");

    // RoomManager does not create a room inside this DB transaction. An outbox
    // consumer provisions it after commit and retries by this stable dedupe key.
    await client.query(`
      INSERT INTO campaign_outbox (dedupe_key, event_type, aggregate_id, payload, status, created_at)
      VALUES ($1, 'CAMPAIGN_ROOM_REQUESTED', $2, $3::jsonb, 'PENDING', $4)
      ON CONFLICT (dedupe_key) DO NOTHING
    `, [`${input.intakeId}:room_requested`, ringId,
      JSON.stringify({ ringId, intakeId: input.intakeId, campaignId: intake.campaign_id,
        day: intake.campaign_day, playerIds: decision.roster.map(({ playerId }) => playerId) }), now]);

    await client.query("COMMIT");
    return {
      kind: "READY",
      ringId,
      playerIds: decision.roster.map(({ playerId }) => playerId),
      filledRandomly: decision.filledRandomly,
      drawSeed: decision.drawSeed,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

interface IntakeRow {
  intake_id: string;
  campaign_id: string;
  campaign_day: number;
  opened_at: Date;
  closes_at: Date;
  status: "OPEN" | "WAITING_FOR_POOL" | "CLOSED" | "CANCELLED";
}

interface SignupRow {
  player_id: string;
  registered_at: Date;
  status: string;
  current_day: number;
  ring_protection_until: Date | null;
  presence_expires_at: Date | null;
}

interface CandidateRow {
  player_id: string;
  ring_protection_until: Date | null;
  presence_expires_at: Date | null;
}
