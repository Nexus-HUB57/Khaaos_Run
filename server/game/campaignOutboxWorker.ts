import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export interface CampaignOutboxEvent {
  id: string;
  dedupeKey: string;
  eventType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  attempts: number;
  claimToken: string;
}

export type CampaignOutboxHandler = (event: CampaignOutboxEvent) => Promise<unknown>;
export type CampaignOutboxHandlers = Readonly<Record<string, CampaignOutboxHandler>>;

export interface CampaignRoomProvisionRequest {
  ringId: string;
  intakeId: string;
  campaignId: string;
  day: number;
  playerIds: string[];
  idempotencyKey: string;
}

export interface CampaignOutboxWorkerOptions {
  pollIntervalMs?: number;
  leaseMs?: number;
  batchSize?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
}

export interface CampaignOutboxPollResult {
  claimed: number;
  delivered: number;
  retried: number;
  dead: number;
}

interface OutboxRow {
  id: string;
  dedupe_key: string;
  event_type: string;
  aggregate_id: string;
  payload: unknown;
  attempts: number;
  claim_token: string;
}

type OutboxClaimResult =
  | { kind: "EMPTY" }
  | { kind: "EVENT"; event: CampaignOutboxEvent }
  | { kind: "DEAD" };

export class UnknownCampaignOutboxEventError extends Error {
  constructor(eventType: string) {
    super(`No campaign outbox handler registered for ${eventType}`);
    this.name = "UnknownCampaignOutboxEventError";
  }
}

export class PermanentCampaignOutboxError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "PermanentCampaignOutboxError";
  }
}

/**
 * At-least-once outbox dispatcher. The DB claim uses SKIP LOCKED and a lease;
 * handlers MUST be idempotent using event.dedupeKey or event.aggregateId.
 * No transaction is held open during external dispatch.
 */
export class CampaignOutboxWorker {
  private readonly pollIntervalMs: number;
  private readonly leaseMs: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<CampaignOutboxPollResult> | null = null;
  private starting: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly pool: Pool,
    private readonly handlers: CampaignOutboxHandlers,
    options: CampaignOutboxWorkerOptions = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.leaseMs = options.leaseMs ?? 60_000;
    this.batchSize = options.batchSize ?? 20;
    this.maxAttempts = options.maxAttempts ?? 12;
    this.retryBaseMs = options.retryBaseMs ?? 1_000;
    this.retryMaxMs = options.retryMaxMs ?? 300_000;
    if (!Number.isInteger(this.pollIntervalMs) || this.pollIntervalMs < 250 || this.pollIntervalMs > 60_000
      || !Number.isInteger(this.leaseMs) || this.leaseMs < 1_000
      || !Number.isInteger(this.batchSize) || this.batchSize < 1 || this.batchSize > 500
      || !Number.isInteger(this.maxAttempts) || this.maxAttempts < 1
      || !Number.isInteger(this.retryBaseMs) || this.retryBaseMs < 0
      || !Number.isInteger(this.retryMaxMs) || this.retryMaxMs < this.retryBaseMs) {
      throw new RangeError("INVALID_CAMPAIGN_OUTBOX_WORKER_OPTIONS");
    }
  }

  /** One bounded pass; safe to call from tests, a timer, or an operator command. */
  async pollOnce(now = new Date()): Promise<CampaignOutboxPollResult> {
    if (!Number.isFinite(now.getTime())) throw new RangeError("INVALID_OUTBOX_POLL_TIME");
    if (this.inFlight) return this.inFlight;
    const pass = this.processBatch(now);
    this.inFlight = pass;
    try {
      return await pass;
    } finally {
      if (this.inFlight === pass) this.inFlight = null;
    }
  }

  async start(): Promise<void> {
    if (this.timer) return;
    if (this.starting) return this.starting;
    this.stopping = false;
    const startWork = (async () => {
      // Fail startup if the migration/schema is missing; do not silently leave
      // production campaign rooms accumulating in the outbox.
      await this.pool.query(`
        SELECT id, status, available_at, claim_token, locked_until, delivered_at
        FROM campaign_outbox
        LIMIT 0
      `);
      if (this.stopping) return;
      await this.pollOnce();
      if (this.stopping || this.timer) return;
      this.timer = setInterval(() => {
        void this.pollOnce().catch((error) => this.log("poll failed", error));
      }, this.pollIntervalMs);
      this.timer.unref?.();
      console.info("[CampaignOutboxWorker] started", { pollIntervalMs: this.pollIntervalMs });
    })();
    this.starting = startWork;
    try {
      await startWork;
    } finally {
      if (this.starting === startWork) this.starting = null;
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.starting?.catch(() => undefined);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.inFlight?.catch(() => undefined);
  }

  private async processBatch(now: Date): Promise<CampaignOutboxPollResult> {
    const result: CampaignOutboxPollResult = { claimed: 0, delivered: 0, retried: 0, dead: 0 };
    for (let index = 0; index < this.batchSize; index += 1) {
      const claim = await this.claimOne(now);
      if (claim.kind === "EMPTY") break;
      result.claimed += 1;
      if (claim.kind === "DEAD") {
        result.dead += 1;
        continue;
      }
      const event = claim.event;
      const handler = this.handlers[event.eventType];
      if (!handler) {
        await this.fail(event, new UnknownCampaignOutboxEventError(event.eventType), now, true);
        result.dead += 1;
        continue;
      }

      try {
        await this.withLeaseRenewal(event, handler);
        const acked = await this.acknowledge(event, new Date());
        if (acked) result.delivered += 1;
        else this.log("delivery completed after claim lease was lost", { eventId: event.id, dedupeKey: event.dedupeKey });
      } catch (error) {
        const permanent = error instanceof UnknownCampaignOutboxEventError || error instanceof PermanentCampaignOutboxError;
        const dead = await this.fail(event, error, new Date(), permanent);
        if (dead) result.dead += 1;
        else result.retried += 1;
      }
    }
    return result;
  }

  private async claimOne(now: Date): Promise<OutboxClaimResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const candidate = await client.query<OutboxRow>(`
        SELECT id, dedupe_key, event_type, aggregate_id, payload, attempts, claim_token
        FROM campaign_outbox
        WHERE (status = 'PENDING' AND available_at <= $1)
           OR (status = 'PROCESSING' AND locked_until <= $1)
        ORDER BY available_at, created_at, id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `, [now]);
      const row = candidate.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return { kind: "EMPTY" };
      }
      const token = randomUUID();
      const claimed = await client.query<OutboxRow>(`
        UPDATE campaign_outbox
        SET status = 'PROCESSING',
            claim_token = $2,
            locked_until = $3,
            attempts = attempts + 1,
            last_error = NULL
        WHERE id = $1
        RETURNING id, dedupe_key, event_type, aggregate_id, payload, attempts, claim_token
      `, [row.id, token, new Date(now.getTime() + this.leaseMs)]);
      if (claimed.rowCount !== 1) throw new Error("CAMPAIGN_OUTBOX_CLAIM_LOST");
      let event: CampaignOutboxEvent;
      try {
        event = mapOutboxRow(claimed.rows[0]);
      } catch (error) {
        const dead = await client.query(`
          UPDATE campaign_outbox
          SET status = 'DEAD', delivered_at = NULL,
              claim_token = NULL, locked_until = NULL, last_error = $3
          WHERE id = $1 AND status = 'PROCESSING' AND claim_token = $2
        `, [row.id, token, errorMessage(error).slice(0, 512)]);
        if (dead.rowCount !== 1) throw new Error("CAMPAIGN_OUTBOX_INVALID_PAYLOAD_DEAD_LETTER_FAILED");
        await client.query("COMMIT");
        return { kind: "DEAD" };
      }
      await client.query("COMMIT");
      return { kind: "EVENT", event };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async withLeaseRenewal(event: CampaignOutboxEvent, handler: CampaignOutboxHandler): Promise<void> {
    let renewalInFlight: Promise<boolean> | null = null;
    let leaseLost = false;
    const renewal = setInterval(() => {
      if (renewalInFlight) return;
      renewalInFlight = this.renewLease(event).then((renewed) => {
        if (!renewed) leaseLost = true;
        return renewed;
      }).catch((error) => {
        leaseLost = true;
        this.log("lease renewal failed", { eventId: event.id, error: errorMessage(error) });
        return false;
      }).finally(() => { renewalInFlight = null; });
    }, Math.max(500, Math.floor(this.leaseMs / 3)));
    renewal.unref?.();
    try {
      await handler(event);
      await renewalInFlight;
      if (leaseLost) throw new Error("CAMPAIGN_OUTBOX_LEASE_LOST");
    } finally {
      clearInterval(renewal);
    }
  }

  private async renewLease(event: CampaignOutboxEvent): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE campaign_outbox
      SET locked_until = now() + ($3::integer * interval '1 millisecond')
      WHERE id = $1 AND status = 'PROCESSING' AND claim_token = $2
    `, [event.id, event.claimToken, this.leaseMs]);
    return result.rowCount === 1;
  }

  private async acknowledge(event: CampaignOutboxEvent, deliveredAt: Date): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE campaign_outbox
      SET status = 'DELIVERED', delivered_at = $3,
          claim_token = NULL, locked_until = NULL, last_error = NULL
      WHERE id = $1 AND status = 'PROCESSING' AND claim_token = $2
    `, [event.id, event.claimToken, deliveredAt]);
    return result.rowCount === 1;
  }

  private async fail(event: CampaignOutboxEvent, error: unknown, now: Date, permanent: boolean): Promise<boolean> {
    const dead = permanent || event.attempts >= this.maxAttempts;
    const delayMs = Math.min(this.retryMaxMs, this.retryBaseMs * (2 ** Math.max(0, event.attempts - 1)));
    const result = await this.pool.query(`
      UPDATE campaign_outbox
      SET status = $3,
          available_at = $4,
          delivered_at = NULL,
          claim_token = NULL,
          locked_until = NULL,
          last_error = $5
      WHERE id = $1 AND status = 'PROCESSING' AND claim_token = $2
    `, [event.id, event.claimToken, dead ? "DEAD" : "PENDING",
      dead ? now : new Date(now.getTime() + delayMs), errorMessage(error).slice(0, 512)]);
    if (result.rowCount !== 1) {
      this.log("failure recorded after claim lease was lost", { eventId: event.id, dedupeKey: event.dedupeKey });
      return false;
    }
    if (dead) this.log("event moved to dead-letter state", { eventId: event.id, eventType: event.eventType });
    return dead;
  }

  private log(message: string, detail: unknown): void {
    console.warn(`[CampaignOutboxWorker] ${message}`, detail);
  }
}

/**
 * Typed/idempotent boundary for the only event currently emitted by intake
 * closure. The supplied room provisioner must upsert by ringId, not create a
 * second room if this handler is called again after a crash.
 */
export function campaignRoomRequestedHandler(
  ensureCampaignRoom: (input: CampaignRoomProvisionRequest) => Promise<unknown>,
): CampaignOutboxHandler {
  return async (event) => {
    if (event.eventType !== "CAMPAIGN_ROOM_REQUESTED") throw new UnknownCampaignOutboxEventError(event.eventType);
    const payload = event.payload;
    const ringId = requiredString(payload.ringId);
    const intakeId = requiredString(payload.intakeId);
    const campaignId = requiredString(payload.campaignId);
    const day = payload.day;
    const playerIds = payload.playerIds;
    if (ringId !== event.aggregateId || !Number.isInteger(day) || (day as number) < 1 || (day as number) > 7
      || !Array.isArray(playerIds) || playerIds.length !== 100
      || playerIds.some((playerId) => typeof playerId !== "string" || !playerId.trim())
      || new Set(playerIds).size !== 100) {
      throw new PermanentCampaignOutboxError("INVALID_CAMPAIGN_ROOM_REQUEST_PAYLOAD");
    }
    await ensureCampaignRoom({
      ringId, intakeId, campaignId, day: day as number,
      playerIds: playerIds as string[], idempotencyKey: event.dedupeKey,
    });
  };
}

function mapOutboxRow(row: OutboxRow): CampaignOutboxEvent {
  const payload = row.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("INVALID_CAMPAIGN_OUTBOX_PAYLOAD");
  }
  return {
    id: row.id,
    dedupeKey: row.dedupe_key,
    eventType: row.event_type,
    aggregateId: row.aggregate_id,
    payload: payload as Record<string, unknown>,
    attempts: row.attempts,
    claimToken: row.claim_token,
  };
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new PermanentCampaignOutboxError("INVALID_CAMPAIGN_ROOM_REQUEST_PAYLOAD");
  return value.trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
