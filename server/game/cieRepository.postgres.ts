import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, asc, count, eq, exists, gt, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  cieCampaignPlayers,
  cieCampaigns,
  cieEvents,
  cieOutbox,
  cieParticipants,
  campaignPlayers,
  type CieEvent,
} from "@shared/schema";
import {
  CIE_RULES_PROTOTYPE,
  decideCieRoster,
  resolveCieReturn,
  type CieReturnDecision,
} from "./specialIncursion";

const DAY_MS = 24 * 60 * 60 * 1000;
const REGULAR_WINDOW_MS = 12 * 60 * 60 * 1000;
const MIN_TRIGGER_DELAY_MS = 15 * 60 * 1000;
const MAX_TRIGGER_DELAY_MS = 6 * 60 * 60 * 1000;
const SCHEDULER_RETRY_MS = 30 * 1000;
const MAX_SCHEDULER_BATCH = 25;

export type CampaignPlayerState = "SURVIVOR" | "ELIMINATED" | "COMPLETED";
export type CieRole = "SURVIVOR" | "ELIMINATED";

export interface CieResultInput {
  playerId: string;
  placement: number;
  aliveAtEnd: boolean;
  /** Set only from server-verified inventory/loot state at event resolution. */
  returnSealAtFinish: boolean;
}

export type CieResultSummary = {
  eventId: string;
  replayed: boolean;
  outcomes: Array<{ playerId: string; role: CieRole; decision: CieReturnDecision }>;
};

function nonEmpty(value: string, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(code);
  return value.trim();
}

function validDate(date: Date): boolean {
  return date instanceof Date && Number.isFinite(date.getTime());
}

function resultHash(results: CieResultInput[]): string {
  const canonical = results.slice().sort((a, b) => a.playerId.localeCompare(b.playerId));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/** PostgreSQL is the source of truth; no process-local state determines CIE state. */
export class CiePostgresRepository {
  constructor(private readonly database: typeof db = db) {}

  async assertSchemaReady(): Promise<void> {
    await this.database.select({ id: cieEvents.id }).from(cieEvents).limit(1);
    await this.database.select({ id: cieCampaignPlayers.id }).from(cieCampaignPlayers).limit(1);
  }

  /**
   * Creates the durable campaign and six secret, persisted CIE trigger times.
   * The random schedule survives restarts and is never returned by a player API.
   */
  async createCampaign(input: { campaignId: string; startsAt: Date; ruleVersion?: string }): Promise<void> {
    const campaignId = nonEmpty(input.campaignId, "CIE_CAMPAIGN_ID_REQUIRED");
    if (campaignId.length > 64 || !validDate(input.startsAt)) throw new RangeError("INVALID_CIE_CAMPAIGN");
    const ruleVersion = input.ruleVersion?.trim() || "GDD-03A-03-v0.2";
    if (ruleVersion.length > 32) throw new RangeError("CIE_RULE_VERSION_TOO_LONG");

    await this.database.transaction(async (tx) => {
      const [created] = await tx.insert(cieCampaigns).values({ campaignId, startsAt: input.startsAt, ruleVersion })
        .onConflictDoNothing({ target: cieCampaigns.campaignId }).returning({ campaignId: cieCampaigns.campaignId });
      const [existing] = await tx.select().from(cieCampaigns).where(eq(cieCampaigns.campaignId, campaignId)).limit(1);
      if (!existing || existing.startsAt.getTime() !== input.startsAt.getTime() || existing.ruleVersion !== ruleVersion) {
        throw new Error("CIE_CAMPAIGN_ID_CONFLICT");
      }
      if (!created && existing.status !== "ACTIVE") throw new Error("CIE_CAMPAIGN_NOT_ACTIVE");

      const events = Array.from({ length: CIE_RULES_PROTOTYPE.campaignReturnThroughDay }, (_, index) => {
        const campaignDay = index + 1;
        const regularWindowClosesAt = input.startsAt.getTime() + index * DAY_MS + REGULAR_WINDOW_MS;
        const delay = randomInt(MIN_TRIGGER_DELAY_MS, MAX_TRIGGER_DELAY_MS + 1);
        const scheduledTriggerAt = new Date(regularWindowClosesAt + delay);
        return {
          campaignId,
          campaignDay,
          scheduledTriggerAt,
          retryUntilAt: new Date(scheduledTriggerAt.getTime() + CIE_RULES_PROTOTYPE.retryWindowSeconds * 1000),
          nextCheckAt: scheduledTriggerAt,
          ruleVersion,
        };
      });
      await tx.insert(cieEvents).values(events).onConflictDoNothing();
      const persisted = await tx.select({ day: cieEvents.campaignDay, scheduled: cieEvents.scheduledTriggerAt })
        .from(cieEvents).where(eq(cieEvents.campaignId, campaignId));
      if (persisted.length !== 6) throw new Error("CIE_CAMPAIGN_SCHEDULE_INCOMPLETE");
    });
  }

  /** Trusted game-server sync when a player's regular campaign state changes. */
  async upsertCampaignPlayer(input: {
    campaignId: string;
    playerId: string;
    state: CampaignPlayerState;
    currentDay: number;
  }): Promise<void> {
    const campaignId = nonEmpty(input.campaignId, "CIE_CAMPAIGN_ID_REQUIRED");
    const playerId = nonEmpty(input.playerId, "CIE_PLAYER_ID_REQUIRED");
    if (!["SURVIVOR", "ELIMINATED", "COMPLETED"].includes(input.state)
      || !Number.isInteger(input.currentDay) || input.currentDay < 1 || input.currentDay > 7) {
      throw new RangeError("INVALID_CIE_CAMPAIGN_PLAYER");
    }
    const now = new Date();
    await this.database.insert(cieCampaignPlayers).values({
      campaignId, playerId, state: input.state, currentDay: input.currentDay,
      presenceExpiresAt: null, presenceUpdatedAt: null, updatedAt: now,
    }).onConflictDoUpdate({
      target: [cieCampaignPlayers.campaignId, cieCampaignPlayers.playerId],
      set: { state: input.state, currentDay: input.currentDay, updatedAt: now },
    });
  }

  /** Authenticated socket gateway must renew this lease; fail closed if presence is stale. */
  async renewPresence(input: { campaignId: string; playerId: string; now?: Date; ttlMs?: number }): Promise<boolean> {
    const campaignId = nonEmpty(input.campaignId, "CIE_CAMPAIGN_ID_REQUIRED");
    const playerId = nonEmpty(input.playerId, "CIE_PLAYER_ID_REQUIRED");
    const now = input.now ?? new Date();
    const ttlMs = input.ttlMs ?? 30_000;
    if (!validDate(now) || !Number.isInteger(ttlMs) || ttlMs < 5_000 || ttlMs > 120_000) throw new RangeError("INVALID_CIE_PRESENCE_LEASE");
    const updated = await this.database.update(cieCampaignPlayers).set({
      presenceUpdatedAt: now,
      presenceExpiresAt: new Date(now.getTime() + ttlMs),
      updatedAt: now,
    }).where(and(
      eq(cieCampaignPlayers.campaignId, campaignId),
      eq(cieCampaignPlayers.playerId, playerId),
    )).returning({ id: cieCampaignPlayers.id });
    return updated.length === 1;
  }

  /**
   * Authenticated WebSocket heartbeat path. The caller supplies only the
   * verified account ID; active campaign/day/state are constrained atomically
   * in PostgreSQL so a stale client cannot choose another campaign or role.
   */
  async renewActiveCampaignPresence(input: { playerId: string; now?: Date; ttlMs?: number }): Promise<number> {
    const playerId = nonEmpty(input.playerId, "CIE_PLAYER_ID_REQUIRED");
    const now = input.now ?? new Date();
    const ttlMs = input.ttlMs ?? 30_000;
    if (!validDate(now) || !Number.isInteger(ttlMs) || ttlMs < 5_000 || ttlMs > 120_000) throw new RangeError("INVALID_CIE_PRESENCE_LEASE");
    const activeCampaign = this.database.select({ one: sql`1` }).from(cieCampaigns).where(and(
      eq(cieCampaigns.campaignId, cieCampaignPlayers.campaignId),
      eq(cieCampaigns.status, "ACTIVE"),
    ));
    const updated = await this.database.update(cieCampaignPlayers).set({
      presenceUpdatedAt: now,
      presenceExpiresAt: new Date(now.getTime() + ttlMs),
      updatedAt: now,
    }).where(and(
      eq(cieCampaignPlayers.playerId, playerId),
      inArray(cieCampaignPlayers.state, ["SURVIVOR", "ELIMINATED"]),
      lte(cieCampaignPlayers.currentDay, CIE_RULES_PROTOTYPE.campaignReturnThroughDay),
      exists(activeCampaign),
    )).returning({ campaignId: cieCampaignPlayers.campaignId });
    return updated.length;
  }

  /** Called by the trusted regular-ring coordinator once the day's Rings have all resolved. */
  async setRegularRingsResolved(campaignId: string, campaignDay: number, resolved: boolean): Promise<void> {
    const id = nonEmpty(campaignId, "CIE_CAMPAIGN_ID_REQUIRED");
    if (!Number.isInteger(campaignDay) || campaignDay < 1 || campaignDay > 6) throw new RangeError("INVALID_CIE_CAMPAIGN_DAY");
    await this.database.update(cieEvents).set({ regularRingsResolved: resolved, updatedAt: new Date() })
      .where(and(eq(cieEvents.campaignId, id), eq(cieEvents.campaignDay, campaignDay), eq(cieEvents.status, "ARMED")));
  }

  /** Caller supplies only authenticated identity; role/state/presence are read from PostgreSQL. */
  async registerForCie(input: { eventId: string; playerId: string; now?: Date }): Promise<{ role: CieRole; alreadyRegistered: boolean }> {
    const eventId = nonEmpty(input.eventId, "CIE_EVENT_ID_REQUIRED");
    const playerId = nonEmpty(input.playerId, "CIE_PLAYER_ID_REQUIRED");
    const now = input.now ?? new Date();
    if (!validDate(now)) throw new RangeError("INVALID_CIE_REGISTRATION_TIME");

    return this.database.transaction(async (tx) => {
      const [event] = await tx.select().from(cieEvents).where(eq(cieEvents.id, eventId)).for("update").limit(1);
      if (!event || event.status !== "REGISTRATION" || !event.openedAt || !event.registrationClosesAt
        || now < event.openedAt || now >= event.registrationClosesAt) throw new Error("CIE_REGISTRATION_CLOSED");
      const [campaignPlayer] = await tx.select().from(cieCampaignPlayers).where(and(
        eq(cieCampaignPlayers.campaignId, event.campaignId), eq(cieCampaignPlayers.playerId, playerId),
      )).for("update").limit(1);
      if (!campaignPlayer || !campaignPlayer.presenceExpiresAt || campaignPlayer.presenceExpiresAt <= now) throw new Error("CIE_PLAYER_NOT_ONLINE");

      let role: CieRole;
      if (campaignPlayer.state === "SURVIVOR" && campaignPlayer.currentDay === event.campaignDay) role = "SURVIVOR";
      else if (campaignPlayer.state === "ELIMINATED" && campaignPlayer.currentDay <= event.campaignDay && !campaignPlayer.returnUsed) role = "ELIMINATED";
      else throw new Error("CIE_PLAYER_NOT_ELIGIBLE");

      const [inserted] = await tx.insert(cieParticipants).values({
        eventId, playerId, role, registeredAt: now, presenceObservedAt: now,
      }).onConflictDoNothing({ target: [cieParticipants.eventId, cieParticipants.playerId] })
        .returning({ id: cieParticipants.id });
      const [existing] = await tx.select({ role: cieParticipants.role }).from(cieParticipants).where(and(
        eq(cieParticipants.eventId, eventId), eq(cieParticipants.playerId, playerId),
      )).limit(1);
      if (!existing) throw new Error("CIE_SIGNUP_NOT_PERSISTED");
      return { role: existing.role as CieRole, alreadyRegistered: !inserted };
    });
  }

  /** One DB transaction is the scheduler's multi-replica claim and transition fence. */
  async processDueEvents(now = new Date(), limit = MAX_SCHEDULER_BATCH): Promise<{ opened: number; locked: number; expired: number }> {
    if (!validDate(now) || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError("INVALID_CIE_SCHEDULER_BATCH");
    return this.database.transaction(async (tx) => {
      const due = await tx.select().from(cieEvents).where(or(
        and(eq(cieEvents.status, "ARMED"), lte(cieEvents.nextCheckAt, now)),
        and(eq(cieEvents.status, "REGISTRATION"), lte(cieEvents.registrationClosesAt, now)),
      )).orderBy(asc(cieEvents.nextCheckAt)).limit(limit).for("update", { skipLocked: true });
      let opened = 0;
      let locked = 0;
      let expired = 0;

      for (const event of due) {
        if (event.status === "ARMED") {
          const transition = await this.processArmedEvent(tx, event, now);
          opened += transition === "OPENED" ? 1 : 0;
          expired += transition === "EXPIRED" ? 1 : 0;
        } else if (event.status === "REGISTRATION") {
          const transition = await this.lockRoster(tx, event, now);
          locked += transition === "LOCKED" ? 1 : 0;
          expired += transition === "EXPIRED" ? 1 : 0;
        }
      }
      return { opened, locked, expired };
    });
  }

  private async processArmedEvent(tx: any, event: CieEvent, now: Date): Promise<"OPENED" | "WAITING" | "EXPIRED"> {
    if (now < event.scheduledTriggerAt) {
      await tx.update(cieEvents).set({ nextCheckAt: event.scheduledTriggerAt, updatedAt: now }).where(eq(cieEvents.id, event.id));
      return "WAITING";
    }
    const [campaign] = await tx.select().from(cieCampaigns).where(eq(cieCampaigns.campaignId, event.campaignId)).limit(1);
    if (!campaign || campaign.status !== "ACTIVE") {
      await tx.update(cieEvents).set({ status: "CANCELLED", failureReason: "CAMPAIGN_NOT_ACTIVE", updatedAt: now }).where(eq(cieEvents.id, event.id));
      return "EXPIRED";
    }

    const activeSurvivors = await tx.select({ total: count() }).from(cieCampaignPlayers).where(and(
      eq(cieCampaignPlayers.campaignId, event.campaignId),
      eq(cieCampaignPlayers.currentDay, event.campaignDay),
      eq(cieCampaignPlayers.state, "SURVIVOR"),
      gt(cieCampaignPlayers.presenceExpiresAt, now),
    ));
    const onlineEliminated = await tx.select({ total: count() }).from(cieCampaignPlayers).where(and(
      eq(cieCampaignPlayers.campaignId, event.campaignId),
      eq(cieCampaignPlayers.state, "ELIMINATED"),
      eq(cieCampaignPlayers.returnUsed, false),
      gt(cieCampaignPlayers.presenceExpiresAt, now),
    ));
    const hasQuorum = Number(activeSurvivors[0]?.total ?? 0) >= CIE_RULES_PROTOTYPE.survivorSlots
      && Number(onlineEliminated[0]?.total ?? 0) >= 1;

    if (event.regularRingsResolved && hasQuorum) {
      const closesAt = new Date(now.getTime() + CIE_RULES_PROTOTYPE.registrationSeconds * 1000);
      await tx.update(cieEvents).set({ status: "REGISTRATION", openedAt: now, registrationClosesAt: closesAt, updatedAt: now })
        .where(and(eq(cieEvents.id, event.id), eq(cieEvents.status, "ARMED")));
      await tx.insert(cieOutbox).values({
        eventId: event.id,
        dedupeKey: `${event.id}:opened`,
        eventType: "CIE_OPENED",
        payload: { campaignId: event.campaignId, campaignDay: event.campaignDay, closesAt: closesAt.toISOString() },
      }).onConflictDoNothing({ target: cieOutbox.dedupeKey });
      return "OPENED";
    }

    if (now >= event.retryUntilAt) {
      await tx.update(cieEvents).set({ status: "EXPIRED", failureReason: event.regularRingsResolved ? "ONLINE_QUORUM_NOT_MET" : "REGULAR_RINGS_NOT_RESOLVED", updatedAt: now })
        .where(eq(cieEvents.id, event.id));
      return "EXPIRED";
    }
    await tx.update(cieEvents).set({ nextCheckAt: new Date(now.getTime() + SCHEDULER_RETRY_MS), updatedAt: now })
      .where(eq(cieEvents.id, event.id));
    return "WAITING";
  }

  private async lockRoster(tx: any, event: CieEvent, now: Date): Promise<"LOCKED" | "EXPIRED"> {
    if (!event.registrationClosesAt || now < event.registrationClosesAt) return "EXPIRED";
    const rows = await tx.select({
      playerId: cieParticipants.playerId,
      registeredAt: cieParticipants.registeredAt,
      role: cieParticipants.role,
      state: cieCampaignPlayers.state,
      currentDay: cieCampaignPlayers.currentDay,
      returnUsed: cieCampaignPlayers.returnUsed,
      presenceExpiresAt: cieCampaignPlayers.presenceExpiresAt,
    }).from(cieParticipants).innerJoin(cieCampaignPlayers, and(
      eq(cieCampaignPlayers.campaignId, event.campaignId),
      eq(cieCampaignPlayers.playerId, cieParticipants.playerId),
    )).where(eq(cieParticipants.eventId, event.id));

    const current = rows.filter((row: any) => row.presenceExpiresAt && row.presenceExpiresAt > now
      && ((row.role === "SURVIVOR" && row.state === "SURVIVOR" && row.currentDay === event.campaignDay)
        || (row.role === "ELIMINATED" && row.state === "ELIMINATED" && !row.returnUsed && row.currentDay <= event.campaignDay)));
    const seed = randomBytes(32).toString("hex");
    const decision = decideCieRoster({
      campaignDay: event.campaignDay,
      openedAtMs: event.openedAt?.getTime() ?? now.getTime(),
      nowMs: now.getTime(),
      survivorSignups: current.filter((row: any) => row.role === "SURVIVOR").map((row: any) => ({ playerId: row.playerId, online: true })),
      eliminatedSignups: current.filter((row: any) => row.role === "ELIMINATED").map((row: any) => ({ playerId: row.playerId, online: true, alreadyReturned: row.returnUsed })),
      seed,
    });
    if (decision.kind !== "READY") {
      await tx.update(cieEvents).set({ status: "EXPIRED", failureReason: decision.reason, updatedAt: now }).where(eq(cieEvents.id, event.id));
      return "EXPIRED";
    }

    const selectedIds = decision.rosterIds;
    const selectedSet = new Set(selectedIds);
    for (const player of current) {
      await tx.update(cieParticipants).set({
        selected: selectedSet.has(player.playerId),
        presenceObservedAt: player.presenceExpiresAt ? new Date(player.presenceExpiresAt.getTime() - 1) : now,
      }).where(and(eq(cieParticipants.eventId, event.id), eq(cieParticipants.playerId, player.playerId)));
    }
    await tx.update(cieEvents).set({ status: "LOCKED", seed, rosterLockedAt: now, updatedAt: now })
      .where(and(eq(cieEvents.id, event.id), eq(cieEvents.status, "REGISTRATION")));
    for (const playerId of selectedIds) {
      const role = decision.survivorIds.includes(playerId) ? "SURVIVOR" : "ELIMINATED";
      await tx.insert(cieOutbox).values({
        eventId: event.id,
        playerId,
        dedupeKey: `${event.id}:roster:${playerId}`,
        eventType: "CIE_ROSTER_LOCKED",
        payload: { campaignDay: event.campaignDay, role },
      }).onConflictDoNothing({ target: cieOutbox.dedupeKey });
    }
    return "LOCKED";
  }

  async beginEvent(eventId: string, roomId: string): Promise<boolean> {
    const id = nonEmpty(eventId, "CIE_EVENT_ID_REQUIRED");
    const room = nonEmpty(roomId, "CIE_ROOM_ID_REQUIRED");
    if (room.length > 128) throw new RangeError("CIE_ROOM_ID_TOO_LONG");
    const updated = await this.database.update(cieEvents).set({ status: "IN_PROGRESS", roomId: room, updatedAt: new Date() })
      .where(and(eq(cieEvents.id, id), eq(cieEvents.status, "LOCKED"))).returning({ id: cieEvents.id });
    return updated.length === 1;
  }

  /** Atomically persist CIE results, active-survivor risk, and one-time return claims. */
  async resolveEvent(eventId: string, results: CieResultInput[]): Promise<CieResultSummary> {
    const id = nonEmpty(eventId, "CIE_EVENT_ID_REQUIRED");
    if (!Array.isArray(results) || results.length < 1) throw new RangeError("CIE_RESULTS_REQUIRED");
    const canonical = results.map((result) => ({
      playerId: nonEmpty(result.playerId, "CIE_RESULT_PLAYER_REQUIRED"),
      placement: result.placement,
      aliveAtEnd: result.aliveAtEnd,
      returnSealAtFinish: result.returnSealAtFinish,
    })).sort((a, b) => a.playerId.localeCompare(b.playerId));
    if (new Set(canonical.map((result) => result.playerId)).size !== canonical.length
      || new Set(canonical.map((result) => result.placement)).size !== canonical.length
      || canonical.some((result) => !Number.isInteger(result.placement) || result.placement < 1
        || typeof result.aliveAtEnd !== "boolean" || typeof result.returnSealAtFinish !== "boolean")) {
      throw new RangeError("INVALID_CIE_RESULT_SET");
    }
    const hash = resultHash(canonical);

    return this.database.transaction(async (tx) => {
      const [event] = await tx.select().from(cieEvents).where(eq(cieEvents.id, id)).for("update").limit(1);
      if (!event) throw new Error("CIE_EVENT_NOT_FOUND");
      if (event.status === "COMPLETED") {
        if (event.resultHash !== hash) throw new Error("CIE_RESULT_REPLAY_CONFLICT");
        const existing = await tx.select({ playerId: cieParticipants.playerId, role: cieParticipants.role, resolution: cieParticipants.resolution, placement: cieParticipants.placement, aliveAtEnd: cieParticipants.aliveAtEnd, returnSealAtFinish: cieParticipants.returnSealAtFinish })
          .from(cieParticipants).where(and(eq(cieParticipants.eventId, id), eq(cieParticipants.selected, true)))
          .orderBy(asc(cieParticipants.playerId));
        return {
          eventId: id,
          replayed: true,
          outcomes: existing.map((row: any) => ({
            playerId: row.playerId,
            role: row.role as CieRole,
            decision: resolveCieReturn({ role: row.role, campaignDay: event.campaignDay, finalPlacement: row.placement, aliveAtEnd: row.aliveAtEnd, hasReturnSeal: row.returnSealAtFinish, alreadyReturned: false }),
          })),
        };
      }
      if (event.status !== "IN_PROGRESS") throw new Error("CIE_EVENT_NOT_IN_PROGRESS");

      const participants = await tx.select().from(cieParticipants).where(and(eq(cieParticipants.eventId, id), eq(cieParticipants.selected, true))).for("update");
      if (participants.length !== canonical.length || participants.some((participant) => !canonical.some((result) => result.playerId === participant.playerId))) {
        throw new Error("CIE_RESULT_ROSTER_MISMATCH");
      }
      const outcomes: CieResultSummary["outcomes"] = [];
      for (const result of canonical) {
        const participant = participants.find((row) => row.playerId === result.playerId)!;
        const [campaignPlayer] = await tx.select().from(cieCampaignPlayers).where(and(
          eq(cieCampaignPlayers.campaignId, event.campaignId), eq(cieCampaignPlayers.playerId, result.playerId),
        )).for("update").limit(1);
        if (!campaignPlayer) throw new Error("CIE_CAMPAIGN_PLAYER_NOT_FOUND");
        const decision = resolveCieReturn({
          role: participant.role as CieRole,
          campaignDay: event.campaignDay,
          finalPlacement: result.placement,
          aliveAtEnd: result.aliveAtEnd,
          hasReturnSeal: result.returnSealAtFinish,
          alreadyReturned: campaignPlayer.returnUsed,
        });
        let nextState: CampaignPlayerState = campaignPlayer.state as CampaignPlayerState;
        let nextDay = campaignPlayer.currentDay;
        let returnUsed = campaignPlayer.returnUsed;
        if (decision.outcome === "SURVIVOR_REMAINS_ACTIVE") {
          nextState = "SURVIVOR";
          nextDay = decision.nextCampaignDay;
        } else if (decision.outcome === "SURVIVOR_ELIMINATED_IN_CIE") {
          nextState = "ELIMINATED";
        } else if (decision.outcome === "RETURN_NEXT_DAY") {
          nextState = "SURVIVOR";
          nextDay = decision.nextCampaignDay;
          returnUsed = true;
        }
        await tx.update(cieCampaignPlayers).set({ state: nextState, currentDay: nextDay, returnUsed, updatedAt: new Date() })
          .where(and(eq(cieCampaignPlayers.campaignId, event.campaignId), eq(cieCampaignPlayers.playerId, result.playerId)));
        const regularContinues = decision.outcome === "SURVIVOR_REMAINS_ACTIVE" || decision.outcome === "RETURN_NEXT_DAY";
        const [regularPlayer] = await tx.update(campaignPlayers).set({
          status: regularContinues ? "READY" : "ELIMINATED",
          currentDay: decision.nextCampaignDay ?? event.campaignDay,
          attemptsUsedToday: regularContinues ? 0 : 1,
          activeMatchId: null,
          returnUsed,
          updatedAt: new Date(),
        }).where(and(
          eq(campaignPlayers.campaignId, event.campaignId),
          eq(campaignPlayers.playerId, result.playerId),
        )).returning({ id: campaignPlayers.id });
        if (!regularPlayer) throw new Error("CAMPAIGN_PLAYER_NOT_FOUND_FOR_CIE_RESOLUTION");
        await tx.update(cieParticipants).set({
          placement: result.placement,
          aliveAtEnd: result.aliveAtEnd,
          returnSealAtFinish: result.returnSealAtFinish,
          resolution: decision.outcome,
          resolvedAt: new Date(),
        }).where(and(eq(cieParticipants.eventId, id), eq(cieParticipants.playerId, result.playerId), eq(cieParticipants.selected, true)));
        await tx.insert(cieOutbox).values({
          eventId: id,
          playerId: result.playerId,
          dedupeKey: `${id}:result:${result.playerId}`,
          eventType: "CIE_RESULT",
          payload: { campaignDay: event.campaignDay, placement: result.placement, aliveAtEnd: result.aliveAtEnd, outcome: decision.outcome, nextCampaignDay: decision.nextCampaignDay },
        }).onConflictDoNothing({ target: cieOutbox.dedupeKey });
        outcomes.push({ playerId: result.playerId, role: participant.role as CieRole, decision });
      }
      await tx.update(cieEvents).set({ status: "COMPLETED", resultHash: hash, updatedAt: new Date() })
        .where(and(eq(cieEvents.id, id), eq(cieEvents.status, "IN_PROGRESS")));
      return { eventId: id, replayed: false, outcomes };
    });
  }
}

export const ciePostgresRepository = new CiePostgresRepository();
