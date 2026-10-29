import { and, asc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { marshalCouncils, marshalProposals } from "@shared/schema";
import type { CouncilResult, ConflictResolution, WorldId } from "./orchestration";
import type { WorldTelemetrySnapshot } from "./worldTelemetry";

export type PersistedCouncilStatus = "queued" | "running" | "completed" | "failed";
export interface PersistedCouncil {
  requestId: string;
  actorId: string;
  idempotencyKey: string;
  payloadHash: string;
  subject: string;
  worldId: WorldId;
  periodSeconds: number | null;
  telemetrySnapshot: WorldTelemetrySnapshot;
  status: PersistedCouncilStatus;
  result: CouncilResult | null;
  errorCode: string | null;
  attemptId: string | null;
  leaseExpiresAt: string | null;
  proposalIds: string[];
  createdAt: string;
  updatedAt: string;
}
export interface NewPersistedCouncil extends Omit<PersistedCouncil, "status" | "result" | "errorCode" | "attemptId" | "leaseExpiresAt" | "proposalIds" | "updatedAt"> {
  status: "queued";
}
export interface NewPersistedProposal {
  id: string;
  actorId: string;
  councilId: string;
  subject: string;
  governance: ConflictResolution;
}
export interface PersistedProposal {
  proposalId: string;
  actorId: string;
  councilRequestId: string;
  subject: string;
  governance: ConflictResolution;
  createdAt: string;
}
export type CreateCouncilOutcome =
  | { kind: "created" | "replay"; record: PersistedCouncil }
  | { kind: "conflict" };

export interface MarshalConsoleRepository {
  createOrGetCouncil(record: NewPersistedCouncil): Promise<CreateCouncilOutcome>;
  getCouncil(actorId: string, requestId: string): Promise<PersistedCouncil | undefined>;
  getProposal(actorId: string, proposalId: string): Promise<PersistedProposal | undefined>;
  claimQueuedCouncil(requestId: string): Promise<PersistedCouncil | undefined>;
  listQueuedCouncils(limit: number): Promise<string[]>;
  requeueStaleCouncils(cutoff: Date): Promise<void>;
  saveCouncilResult(requestId: string, attemptId: string, result: CouncilResult, proposals: NewPersistedProposal[]): Promise<boolean>;
  markCouncilFailed(requestId: string, attemptId: string, errorCode: string): Promise<boolean>;
}

function mapCouncil(row: typeof marshalCouncils.$inferSelect, proposalIds: string[] = []): PersistedCouncil {
  return {
    requestId: row.id,
    actorId: row.actorId,
    idempotencyKey: row.idempotencyKey,
    payloadHash: row.payloadHash,
    subject: row.subject,
    worldId: row.worldId as WorldId,
    periodSeconds: row.periodSeconds,
    telemetrySnapshot: row.telemetrySnapshot as unknown as WorldTelemetrySnapshot,
    status: row.status as PersistedCouncilStatus,
    result: row.result as CouncilResult | null,
    errorCode: row.errorCode,
    attemptId: row.attemptId,
    leaseExpiresAt: row.leaseExpiresAt?.toISOString() ?? null,
    proposalIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Production adapter. Council data lives in separate append/audit tables, not player or bank rows. */
export class PostgresMarshalConsoleRepository implements MarshalConsoleRepository {
  constructor(private readonly database: typeof db = db) {}

  async createOrGetCouncil(record: NewPersistedCouncil): Promise<CreateCouncilOutcome> {
    const [inserted] = await this.database.insert(marshalCouncils).values({
      id: record.requestId,
      actorId: record.actorId,
      idempotencyKey: record.idempotencyKey,
      payloadHash: record.payloadHash,
      subject: record.subject,
      worldId: record.worldId,
      periodSeconds: record.periodSeconds,
      telemetrySnapshot: record.telemetrySnapshot as unknown as Record<string, unknown>,
      status: "queued",
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.createdAt),
    }).onConflictDoNothing({ target: [marshalCouncils.actorId, marshalCouncils.idempotencyKey] }).returning();
    if (inserted) return { kind: "created", record: mapCouncil(inserted) };

    const [existing] = await this.database.select().from(marshalCouncils).where(and(
      eq(marshalCouncils.actorId, record.actorId),
      eq(marshalCouncils.idempotencyKey, record.idempotencyKey),
    )).limit(1);
    if (!existing) return { kind: "conflict" };
    return existing.payloadHash === record.payloadHash
      ? { kind: "replay", record: mapCouncil(existing) }
      : { kind: "conflict" };
  }

  async getCouncil(actorId: string, requestId: string): Promise<PersistedCouncil | undefined> {
    const [row] = await this.database.select().from(marshalCouncils).where(and(
      eq(marshalCouncils.id, requestId), eq(marshalCouncils.actorId, actorId),
    )).limit(1);
    if (!row) return undefined;
    const proposals = await this.database.select({ id: marshalProposals.id }).from(marshalProposals)
      .where(eq(marshalProposals.councilId, requestId));
    return mapCouncil(row, proposals.map((proposal) => `prop_${proposal.id}`));
  }

  async getProposal(actorId: string, proposalId: string): Promise<PersistedProposal | undefined> {
    const [row] = await this.database.select().from(marshalProposals).where(and(
      eq(marshalProposals.id, proposalId), eq(marshalProposals.actorId, actorId),
    )).limit(1);
    if (!row) return undefined;
    return {
      proposalId: `prop_${row.id}`,
      actorId: row.actorId,
      councilRequestId: row.councilId,
      subject: row.subject,
      governance: row.governance as unknown as ConflictResolution,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async claimQueuedCouncil(requestId: string): Promise<PersistedCouncil | undefined> {
    const attemptId = randomUUID();
    const leaseExpiresAt = new Date(Date.now() + 120_000);
    const [row] = await this.database.update(marshalCouncils).set({ status: "running", attemptId, leaseExpiresAt, updatedAt: new Date() })
      .where(and(eq(marshalCouncils.id, requestId), eq(marshalCouncils.status, "queued"))).returning();
    return row ? mapCouncil(row) : undefined;
  }

  async listQueuedCouncils(limit: number): Promise<string[]> {
    const rows = await this.database.select({ id: marshalCouncils.id }).from(marshalCouncils)
      .where(eq(marshalCouncils.status, "queued"))
      .orderBy(asc(marshalCouncils.createdAt)).limit(limit);
    return rows.map((row) => row.id);
  }

  async requeueStaleCouncils(cutoff: Date): Promise<void> {
    await this.database.update(marshalCouncils).set({ status: "queued", attemptId: null, leaseExpiresAt: null, errorCode: null, updatedAt: new Date() })
      .where(and(
        eq(marshalCouncils.status, "running"),
        lt(marshalCouncils.updatedAt, cutoff),
        or(isNull(marshalCouncils.leaseExpiresAt), lt(marshalCouncils.leaseExpiresAt, new Date())),
      ));
  }

  async saveCouncilResult(requestId: string, attemptId: string, result: CouncilResult, proposals: NewPersistedProposal[]): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const [claimed] = await tx.update(marshalCouncils).set({
        status: result.status === "rejected" ? "failed" : "completed",
        result: result as unknown as Record<string, unknown>,
        errorCode: result.status === "rejected" ? result.reasonCodes[0] ?? "COUNCIL_REJECTED" : null,
        attemptId: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      }).where(and(
        eq(marshalCouncils.id, requestId),
        eq(marshalCouncils.status, "running"),
        eq(marshalCouncils.attemptId, attemptId),
        gt(marshalCouncils.leaseExpiresAt, new Date()),
      )).returning({ id: marshalCouncils.id });
      if (!claimed) return false;
      if (proposals.length) {
        await tx.insert(marshalProposals).values(proposals.map((proposal) => ({
          id: proposal.id,
          actorId: proposal.actorId,
          councilId: proposal.councilId,
          subject: proposal.subject,
          governance: proposal.governance as unknown as Record<string, unknown>,
        }))).onConflictDoNothing();
      }
      return true;
    });
  }

  async markCouncilFailed(requestId: string, attemptId: string, errorCode: string): Promise<boolean> {
    const updated = await this.database.update(marshalCouncils).set({ status: "failed", errorCode, attemptId: null, leaseExpiresAt: null, updatedAt: new Date() })
      .where(and(
        eq(marshalCouncils.id, requestId),
        eq(marshalCouncils.status, "running"),
        eq(marshalCouncils.attemptId, attemptId),
        gt(marshalCouncils.leaseExpiresAt, new Date()),
      )).returning({ id: marshalCouncils.id });
    return updated.length > 0;
  }
}
