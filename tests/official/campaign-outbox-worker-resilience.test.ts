import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { CampaignOutboxWorker } from "../../server/game/campaignOutboxWorker.ts";

const INITIAL_TIME = new Date("2026-11-05T12:00:00.000Z");

type FakeQueryResult = { rows: Array<Record<string, unknown>>; rowCount: number };
type FailurePoint = "connect" | "claim-query" | "acknowledge" | "renew";

/** Minimal in-memory implementation of the SQL contract used by the worker. */
class FakeOutboxPool {
  readonly row = {
    id: "outbox-1",
    dedupe_key: "dedupe-1",
    event_type: "TEST_EVENT",
    aggregate_id: "aggregate-1",
    payload: { value: "payload" } as unknown,
    attempts: 0,
    claim_token: null as string | null,
  };
  status: "PENDING" | "PROCESSING" | "DELIVERED" | "DEAD" = "PENDING";
  availableAt = new Date(INITIAL_TIME);
  lockedUntil: Date | null = null;
  deliveredAt: Date | null = null;
  lastError: string | null = null;
  readonly failures = new Map<FailurePoint, number>();

  failNext(point: FailurePoint): void {
    this.failures.set(point, (this.failures.get(point) ?? 0) + 1);
  }

  async connect() {
    this.maybeFail("connect");
    return {
      query: async (sql: string, values: unknown[] = []): Promise<FakeQueryResult> => {
        const normalized = sql.toLowerCase().replace(/\s+/g, " ").trim();
        if (normalized === "begin" || normalized === "commit" || normalized === "rollback") {
          return { rows: [], rowCount: 0 };
        }
        if (normalized.includes("select id, dedupe_key, event_type")) {
          this.maybeFail("claim-query");
          const now = values[0] as Date;
          const eligible = (this.status === "PENDING" && this.availableAt <= now)
            || (this.status === "PROCESSING" && this.lockedUntil !== null && this.lockedUntil <= now);
          return { rows: eligible ? [this.claimRow()] : [], rowCount: eligible ? 1 : 0 };
        }
        if (normalized.includes("set status = 'processing'")) {
          const [id, token, lockedUntil] = values as [string, string, Date];
          if (id !== this.row.id) return { rows: [], rowCount: 0 };
          this.status = "PROCESSING";
          this.row.claim_token = token;
          this.lockedUntil = lockedUntil;
          this.row.attempts += 1;
          this.lastError = null;
          return { rows: [this.claimRow()], rowCount: 1 };
        }
        if (normalized.includes("set status = 'dead'")) {
          const [id, token, lastError] = values as [string, string, string];
          if (!this.ownsClaim(id, token)) return { rows: [], rowCount: 0 };
          this.status = "DEAD";
          this.row.claim_token = null;
          this.lockedUntil = null;
          this.deliveredAt = null;
          this.lastError = lastError;
          return { rows: [], rowCount: 1 };
        }
        throw new Error(`Unexpected client query: ${normalized}`);
      },
      release: () => undefined,
    };
  }

  async query(sql: string, values: unknown[] = []): Promise<FakeQueryResult> {
    const normalized = sql.toLowerCase().replace(/\s+/g, " ").trim();
    if (normalized.includes("set status = 'delivered'")) {
      this.maybeFail("acknowledge");
      const [id, token, deliveredAt] = values as [string, string, Date];
      if (!this.ownsClaim(id, token)) return { rows: [], rowCount: 0 };
      this.status = "DELIVERED";
      this.deliveredAt = deliveredAt;
      this.row.claim_token = null;
      this.lockedUntil = null;
      this.lastError = null;
      return { rows: [], rowCount: 1 };
    }
    if (normalized.includes("set status = $3")) {
      const [id, token, status, availableAt, lastError] = values as [string, string, "PENDING" | "DEAD", Date, string];
      if (!this.ownsClaim(id, token)) return { rows: [], rowCount: 0 };
      this.status = status;
      this.availableAt = availableAt;
      this.deliveredAt = null;
      this.row.claim_token = null;
      this.lockedUntil = null;
      this.lastError = lastError;
      return { rows: [], rowCount: 1 };
    }
    if (normalized.includes("set locked_until = now()")) {
      this.maybeFail("renew");
      const [id, token, leaseMs] = values as [string, string, number];
      if (!this.ownsClaim(id, token)) return { rows: [], rowCount: 0 };
      this.lockedUntil = new Date(Date.now() + leaseMs);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected pool query: ${normalized}`);
  }

  private claimRow() {
    return { ...this.row, claim_token: this.row.claim_token };
  }

  private ownsClaim(id: string, token: string): boolean {
    return id === this.row.id && this.status === "PROCESSING" && this.row.claim_token === token;
  }

  private maybeFail(point: FailurePoint): void {
    const remaining = this.failures.get(point) ?? 0;
    if (remaining > 0) {
      this.failures.set(point, remaining - 1);
      throw new Error(`transient ${point} failure`);
    }
  }
}

function makeWorker(pool: FakeOutboxPool, handler: (event: { dedupeKey: string }) => Promise<unknown>, options = {}) {
  return new CampaignOutboxWorker(
    pool as unknown as Pool,
    { TEST_EVENT: handler },
    { batchSize: 1, leaseMs: 1_000, retryBaseMs: 0, retryMaxMs: 0, ...options },
  );
}

test("falha ao adquirir ou consultar o claim libera inFlight para um poll posterior", async (t) => {
  for (const failure of ["connect", "claim-query"] as const) {
    await t.test(`falha transitória em ${failure}`, async () => {
      const pool = new FakeOutboxPool();
      pool.failNext(failure);
      let dispatches = 0;
      const worker = makeWorker(pool, async () => { dispatches += 1; });

      await assert.rejects(worker.pollOnce(INITIAL_TIME), new RegExp(`transient ${failure} failure`));
      assert.equal(dispatches, 0);
      assert.equal(pool.status, "PENDING");

      const result = await worker.pollOnce(INITIAL_TIME);
      assert.deepEqual(result, { claimed: 1, delivered: 1, retried: 0, dead: 0 });
      assert.equal(dispatches, 1);
      assert.equal(pool.status, "DELIVERED");
    });
  }
});

test("payload JSON não-objeto é enviado a DEAD sem lease de retry infinito", async () => {
  const pool = new FakeOutboxPool();
  pool.row.payload = ["invalid", "array"];
  let dispatches = 0;
  const worker = makeWorker(pool, async () => { dispatches += 1; });

  const result = await worker.pollOnce(INITIAL_TIME);

  assert.deepEqual(result, { claimed: 1, delivered: 0, retried: 0, dead: 1 });
  assert.equal(pool.status, "DEAD");
  assert.equal(pool.row.claim_token, null);
  assert.equal(pool.lockedUntil, null);
  assert.equal(pool.lastError, "INVALID_CAMPAIGN_OUTBOX_PAYLOAD");
  assert.equal(dispatches, 0);
});

test("falha transitória no acknowledge retorna a PENDING e reprocessa sem duplicar efeito idempotente", async () => {
  const pool = new FakeOutboxPool();
  pool.failNext("acknowledge");
  const appliedDedupeKeys = new Set<string>();
  let handlerCalls = 0;
  let sideEffects = 0;
  const worker = makeWorker(pool, async (event) => {
    handlerCalls += 1;
    if (!appliedDedupeKeys.has(event.dedupeKey)) {
      appliedDedupeKeys.add(event.dedupeKey);
      sideEffects += 1;
    }
  });

  const first = await worker.pollOnce(INITIAL_TIME);
  assert.deepEqual(first, { claimed: 1, delivered: 0, retried: 1, dead: 0 });
  assert.equal(pool.status, "PENDING");
  assert.equal(pool.lastError, "transient acknowledge failure");
  assert.equal(handlerCalls, 1);
  assert.equal(sideEffects, 1);

  const second = await worker.pollOnce(new Date(pool.availableAt.getTime() + 1));
  assert.deepEqual(second, { claimed: 1, delivered: 1, retried: 0, dead: 0 });
  assert.equal(pool.status, "DELIVERED");
  assert.equal(handlerCalls, 2);
  assert.equal(sideEffects, 1);
});

test("falha de renewLease durante handler longo não confirma o evento como DELIVERED", async () => {
  const pool = new FakeOutboxPool();
  pool.failNext("renew");
  let releaseHandler!: () => void;
  let markHandlerStarted!: () => void;
  const handlerStarted = new Promise<void>((resolve) => { markHandlerStarted = resolve; });
  const handlerGate = new Promise<void>((resolve) => { releaseHandler = resolve; });
  const worker = makeWorker(pool, async () => {
    markHandlerStarted();
    await handlerGate;
  });
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const scheduledCallbacks: Array<(...args: unknown[]) => void> = [];

  globalThis.setInterval = ((callback: (...args: unknown[]) => void) => {
    scheduledCallbacks.push(callback);
    return { unref: () => undefined } as unknown as NodeJS.Timeout;
  }) as typeof setInterval;
  globalThis.clearInterval = (() => undefined) as typeof clearInterval;

  let poll: Promise<Awaited<ReturnType<typeof worker.pollOnce>>> | undefined;
  try {
    poll = worker.pollOnce(INITIAL_TIME);
    await handlerStarted;
    assert.equal(scheduledCallbacks.length, 1);
    scheduledCallbacks[0]();
    // Drain the rejected renewal query and its catch/finally chain without real timers.
    await new Promise<void>((resolve) => setImmediate(resolve));
    releaseHandler();
    const result = await poll;

    assert.deepEqual(result, { claimed: 1, delivered: 0, retried: 1, dead: 0 });
    assert.equal(pool.status, "PENDING");
    assert.equal(pool.deliveredAt, null);
    assert.equal(pool.lastError, "CAMPAIGN_OUTBOX_LEASE_LOST");
  } finally {
    releaseHandler();
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    await poll?.catch(() => undefined);
  }
});
