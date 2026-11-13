import { randomBytes } from "node:crypto";
import {
  CAMPAIGN_RULES_PROTOTYPE,
  campaignWindowAt,
  decideCampaignRoster,
  type CampaignRosterCandidate,
  type CampaignRosterDecision,
} from "./campaignProgression.ts";

const MAX_INTAKES_PER_POLL = 50;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

export interface CampaignIntakeRecord {
  intakeId: string;
  campaignId: string;
  day: number;
  openedAt: Date;
  closesAt: Date;
  status: "OPEN" | "WAITING_FOR_POOL" | "CLOSED" | "CANCELLED";
}

export interface LockedIntakeSnapshot {
  intake: CampaignIntakeRecord;
  registered: CampaignRosterCandidate[];
  /** Survivors for this campaign/day, including online and offline candidates. */
  eligibleSurvivors: CampaignRosterCandidate[];
}

export type IntakeCloseResult =
  | { kind: "NOT_DUE" }
  | { kind: "ALREADY_CLOSED"; ringId: string }
  | { kind: "WAITING_FOR_POOL"; remainingSlots: number }
  | {
      kind: "READY";
      ringId: string;
      playerIds: string[];
      filledRandomly: string[];
      drawSeed: string | null;
    };

export interface CampaignIntakeRepository {
  /**
   * Idempotent on intakeId. Production implementation stores one OPEN intake
   * and its closesAt in PostgreSQL before acknowledging the operation.
   */
  openIntake(input: Omit<CampaignIntakeRecord, "status">): Promise<CampaignIntakeRecord>;

  /**
   * Inserts one non-withdrawable signup, deriving eligibility from server-side
   * campaign state. Must lock/check the intake and cap signups at 100.
   */
  register(input: {
    intakeId: string;
    playerId: string;
    registeredAt: Date;
  }): Promise<
    | { kind: "REGISTERED" | "ALREADY_REGISTERED"; registeredCount: number }
    | { kind: "CLOSED" | "CAPACITY_REACHED"; registeredCount: number }
  >;

  /** Includes OPEN intakes that are full/due and WAITING_FOR_POOL intakes to retry. */
  listDueForClose(input: { now: Date; limit: number }): Promise<string[]>;

  /**
   * MUST be one PostgreSQL transaction: SELECT intake FOR UPDATE, re-read
   * signups/eligible survivors, call resolveLockedRoster(), persist the frozen
   * 100-player roster + Ring row + ROOM_REQUESTED outbox record, then commit.
   * A UNIQUE(intakeId) Ring key and row lock fence different app replicas.
   */
  closeIntake(input: { intakeId: string; now: Date; drawSeed: string }): Promise<IntakeCloseResult>;
}

export interface OpenCampaignIntakeInput {
  /** Server-generated, stable idempotency key for this intake attempt. */
  intakeId: string;
  campaignId: string;
  campaignStartsAt: Date;
  day: number;
  now?: Date;
}

/**
 * Pure decision function used by the PostgreSQL adapter while the intake row
 * is locked. It never returns a partial roster: an insufficient eligible pool
 * remains WAITING_FOR_POOL pending an explicit product policy.
 */
export function resolveLockedRoster(input: {
  snapshot: LockedIntakeSnapshot;
  now: Date;
  drawSeed: string;
}): CampaignRosterDecision | { kind: "NOT_DUE" } {
  const { intake } = input.snapshot;
  if (input.now < intake.openedAt) throw new RangeError("INTAKE_CLOSE_BEFORE_OPEN");
  if (input.snapshot.registered.length < CAMPAIGN_RULES_PROTOTYPE.maxPlayers
    && input.now < intake.closesAt) {
    return { kind: "NOT_DUE" };
  }

  const decision = decideCampaignRoster({
    openedAtMs: intake.openedAt.getTime(),
    nowMs: input.now.getTime(),
    registered: input.snapshot.registered,
    eligibleSurvivors: input.snapshot.eligibleSurvivors,
    drawSeed: input.drawSeed,
  });

  if (decision.kind === "READY" && decision.roster.length !== CAMPAIGN_RULES_PROTOTYPE.maxPlayers) {
    throw new Error("CAMPAIGN_COORDINATOR_PARTIAL_ROSTER_FORBIDDEN");
  }
  return decision;
}

/**
 * Intake orchestration only. This class does not simulate combat or allocate
 * sockets; a PostgreSQL outbox consumer asks RoomManager for the prepared Ring.
 */
export class CampaignCoordinator {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly repository: CampaignIntakeRepository,
    private readonly pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  ) {
    if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 250 || pollIntervalMs > 60_000) {
      throw new RangeError("INVALID_CAMPAIGN_COORDINATOR_INTERVAL");
    }
  }

  /** Called by the trusted UTC campaign scheduler; safe to retry with same intakeId. */
  async openIntake(input: OpenCampaignIntakeInput): Promise<CampaignIntakeRecord> {
    const intakeId = requireText(input.intakeId, "CAMPAIGN_INTAKE_ID_REQUIRED");
    const campaignId = requireText(input.campaignId, "CAMPAIGN_ID_REQUIRED");
    if (!(input.campaignStartsAt instanceof Date) || !Number.isFinite(input.campaignStartsAt.getTime())) {
      throw new RangeError("INVALID_CAMPAIGN_START_TIME");
    }
    const now = input.now ?? new Date();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new RangeError("INVALID_INTAKE_OPEN_TIME");

    const window = campaignWindowAt(input.campaignStartsAt.getTime(), now.getTime());
    if (!window.open || window.day !== input.day) throw new Error("CAMPAIGN_INTAKE_WINDOW_CLOSED");

    const timeoutAt = now.getTime() + CAMPAIGN_RULES_PROTOTYPE.registrationTimeoutSeconds * 1_000;
    const closesAt = new Date(Math.min(timeoutAt, window.closesAtMs!));
    return this.repository.openIntake({ intakeId, campaignId, day: input.day, openedAt: now, closesAt });
  }

  /**
   * playerId MUST come from the authenticated server session/WebSocket identity,
   * never from request.body. A signup cannot be withdrawn after it is recorded.
   */
  async register(input: { intakeId: string; authenticatedPlayerId: string; now?: Date }): Promise<{
    registration: Awaited<ReturnType<CampaignIntakeRepository["register"]>>;
    closeResult?: IntakeCloseResult;
  }> {
    const intakeId = requireText(input.intakeId, "CAMPAIGN_INTAKE_ID_REQUIRED");
    const playerId = requireText(input.authenticatedPlayerId, "CAMPAIGN_PLAYER_ID_REQUIRED");
    const registeredAt = input.now ?? new Date();
    const registration = await this.repository.register({ intakeId, playerId, registeredAt });

    // The 100th signup can close immediately. The repository re-checks the
    // count under a row lock, so concurrent signups cannot overfill the roster.
    if ((registration.kind === "REGISTERED" || registration.kind === "ALREADY_REGISTERED")
      && registration.registeredCount === CAMPAIGN_RULES_PROTOTYPE.maxPlayers) {
      return {
        registration,
        closeResult: await this.closeIntake(intakeId, registeredAt),
      };
    }
    return { registration };
  }

  /** Poller recovery path; safe to run from every replica because closeIntake is DB-fenced. */
  async pollOnce(now = new Date()): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const work = this.processDueIntakes(now);
    this.inFlight = work;
    try {
      await work;
    } finally {
      if (this.inFlight === work) this.inFlight = null;
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.pollOnce().catch((error) => {
        console.error("[CampaignCoordinator] intake poll failed; will retry", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.inFlight?.catch(() => undefined);
  }

  private async processDueIntakes(now: Date): Promise<void> {
    const intakeIds = await this.repository.listDueForClose({ now, limit: MAX_INTAKES_PER_POLL });
    for (const intakeId of intakeIds) await this.closeIntake(intakeId, now);
  }

  private closeIntake(intakeId: string, now: Date): Promise<IntakeCloseResult> {
    // A fresh CSPRNG seed is persisted only if the DB transaction actually
    // freezes a roster. Retries before closure do not consume a draw.
    const drawSeed = randomBytes(32).toString("hex");
    return this.repository.closeIntake({ intakeId, now, drawSeed });
  }
}

function requireText(value: string, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(code);
  return value.trim();
}
