import crypto from "node:crypto";
import type { CouncilResult } from "../../../server/game/orchestration";
import type {
  CreateCouncilOutcome,
  MarshalConsoleRepository,
  NewPersistedCouncil,
  NewPersistedProposal,
  PersistedCouncil,
  PersistedProposal,
} from "../../../server/game/marshalConsoleRepository";

/** Test double only; production always uses PostgresMarshalConsoleRepository. */
export class MemoryMarshalConsoleRepository implements MarshalConsoleRepository {
  private readonly councils = new Map<string, PersistedCouncil>();
  private readonly idempotency = new Map<string, string>();
  private readonly proposals = new Map<string, PersistedProposal>();

  async createOrGetCouncil(record: NewPersistedCouncil): Promise<CreateCouncilOutcome> {
    const key = `${record.actorId}:${record.idempotencyKey}`;
    const existingId = this.idempotency.get(key);
    if (existingId) {
      const existing = this.councils.get(existingId)!;
      return existing.payloadHash === record.payloadHash
        ? { kind: "replay", record: this.copyCouncil(existing) }
        : { kind: "conflict" };
    }
    const saved: PersistedCouncil = {
      ...record, status: "queued", result: null, errorCode: null, attemptId: null, leaseExpiresAt: null, proposalIds: [], updatedAt: record.createdAt,
    };
    this.councils.set(saved.requestId, saved);
    this.idempotency.set(key, saved.requestId);
    return { kind: "created", record: this.copyCouncil(saved) };
  }

  async getCouncil(actorId: string, requestId: string): Promise<PersistedCouncil | undefined> {
    const record = this.councils.get(requestId);
    if (!record || record.actorId !== actorId) return undefined;
    const proposalIds = [...this.proposals.values()]
      .filter((proposal) => proposal.councilRequestId === requestId)
      .map((proposal) => proposal.proposalId);
    return this.copyCouncil({ ...record, proposalIds });
  }

  async getProposal(actorId: string, id: string): Promise<PersistedProposal | undefined> {
    const record = this.proposals.get(id);
    return record?.actorId === actorId ? { ...record } : undefined;
  }

  async claimQueuedCouncil(requestId: string): Promise<PersistedCouncil | undefined> {
    const record = this.councils.get(requestId);
    if (!record || record.status !== "queued") return undefined;
    record.status = "running";
    record.attemptId = crypto.randomUUID();
    record.leaseExpiresAt = new Date(Date.now() + 120_000).toISOString();
    record.updatedAt = new Date().toISOString();
    return this.copyCouncil(record);
  }

  async listQueuedCouncils(limit: number): Promise<string[]> {
    return [...this.councils.values()].filter((record) => record.status === "queued")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, limit).map((record) => record.requestId);
  }

  async requeueStaleCouncils(cutoff: Date): Promise<void> {
    for (const record of this.councils.values()) {
      if (record.status === "running" && new Date(record.updatedAt).getTime() < cutoff.getTime()) {
        record.status = "queued";
        record.attemptId = null;
        record.leaseExpiresAt = null;
        record.updatedAt = new Date().toISOString();
      }
    }
  }

  async saveCouncilResult(requestId: string, attemptId: string, result: CouncilResult, proposals: NewPersistedProposal[]): Promise<boolean> {
    const record = this.councils.get(requestId);
    if (!record || record.status !== "running" || record.attemptId !== attemptId || !record.leaseExpiresAt || new Date(record.leaseExpiresAt).getTime() <= Date.now()) return false;
    record.result = result;
    record.status = result.status === "rejected" ? "failed" : "completed";
    record.errorCode = result.status === "rejected" ? result.reasonCodes[0] ?? "COUNCIL_REJECTED" : null;
    record.attemptId = null;
    record.leaseExpiresAt = null;
    record.updatedAt = new Date().toISOString();
    for (const proposal of proposals) {
      const stored: PersistedProposal = {
        proposalId: `prop_${proposal.id}`,
        actorId: proposal.actorId,
        councilRequestId: proposal.councilId,
        subject: proposal.subject,
        governance: proposal.governance,
        createdAt: record.updatedAt,
      };
      this.proposals.set(proposal.id, stored);
    }
    return true;
  }

  async markCouncilFailed(requestId: string, attemptId: string, errorCode: string): Promise<boolean> {
    const record = this.councils.get(requestId);
    if (!record || record.status !== "running" || record.attemptId !== attemptId || !record.leaseExpiresAt || new Date(record.leaseExpiresAt).getTime() <= Date.now()) return false;
    record.status = "failed";
    record.errorCode = errorCode;
    record.attemptId = null;
    record.leaseExpiresAt = null;
    record.updatedAt = new Date().toISOString();
    return true;
  }

  private copyCouncil(record: PersistedCouncil): PersistedCouncil {
    return { ...record, telemetrySnapshot: { ...record.telemetrySnapshot }, result: record.result ? structuredClone(record.result) : null, proposalIds: [...record.proposalIds] };
  }
}
