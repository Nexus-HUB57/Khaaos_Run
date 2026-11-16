import type { CiePostgresRepository } from "./cieRepository.postgres";

const DEFAULT_POLL_INTERVAL_MS = 30_000;

export interface CieSchedulerRepository {
  assertSchemaReady(): Promise<void>;
  processDueEvents(now?: Date): Promise<{ opened: number; locked: number; expired: number }>;
}

const lazyPostgresRepository: CieSchedulerRepository = {
  async assertSchemaReady() {
    const { ciePostgresRepository } = await import("./cieRepository.postgres");
    await ciePostgresRepository.assertSchemaReady();
  },
  async processDueEvents(now) {
    const { ciePostgresRepository } = await import("./cieRepository.postgres");
    return ciePostgresRepository.processDueEvents(now);
  },
};

/**
 * Each app replica may poll. PostgreSQL row locks with SKIP LOCKED and a short
 * transaction are the claim/fencing mechanism; Redis/local timers are not.
 * The feature remains disabled unless CIE_SCHEDULER_ENABLED=true.
 */
export class CieScheduler {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<unknown> | null = null;
  private stopping = false;

  constructor(
    private readonly repository: CieSchedulerRepository = lazyPostgresRepository,
    private readonly intervalMs = DEFAULT_POLL_INTERVAL_MS,
    private readonly enabled = process.env.CIE_SCHEDULER_ENABLED === "true",
  ) {
    if (!Number.isInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 300_000) {
      throw new RangeError("INVALID_CIE_SCHEDULER_INTERVAL");
    }
  }

  isEnabled(): boolean { return this.enabled; }
  isRunning(): boolean { return this.timer !== null; }

  async start(): Promise<boolean> {
    if (!this.enabled) {
      console.info("[CIE Scheduler] disabled (CIE_SCHEDULER_ENABLED is not true)");
      return false;
    }
    if (this.timer) return true;
    this.stopping = false;
    await this.repository.assertSchemaReady();
    await this.tickOnce();
    this.timer = setInterval(() => {
      void this.tickOnce().catch((error) => {
        console.error("[CIE Scheduler] poll failed; will retry", { message: error instanceof Error ? error.message : String(error) });
      });
    }, this.intervalMs);
    this.timer.unref?.();
    console.info("[CIE Scheduler] started", { intervalMs: this.intervalMs });
    return true;
  }

  async tickOnce(now = new Date()): Promise<{ opened: number; locked: number; expired: number }> {
    if (this.stopping) return { opened: 0, locked: 0, expired: 0 };
    if (this.inFlight) return this.inFlight as Promise<{ opened: number; locked: number; expired: number }>;
    const work = this.repository.processDueEvents(now);
    this.inFlight = work;
    try {
      const result = await work;
      if (result.opened || result.locked || result.expired) console.info("[CIE Scheduler] transitions", result);
      return result;
    } finally {
      if (this.inFlight === work) this.inFlight = null;
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.inFlight?.catch(() => undefined);
  }
}

export const cieScheduler = new CieScheduler();
