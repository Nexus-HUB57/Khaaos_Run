import type { Express, RequestHandler } from "express";
import { pool } from "../db";
import { distributedState } from "../game/DistributedState";

const DEFAULT_PROBE_TIMEOUT_MS = 2_500;

type ProbeStatus = "ok" | "unavailable" | "not_configured";

type ProbeResult = {
  status: ProbeStatus;
  latencyMs: number | null;
};

export type ReadinessDependencies = {
  postgresProbe?: () => Promise<unknown>;
  redisProbe?: () => Promise<unknown>;
  redisConfigured?: boolean;
  redisRequired?: boolean;
  timeoutMs?: number;
  now?: () => Date;
};

async function runProbe(
  probe: () => Promise<unknown>,
  timeoutMs: number,
): Promise<ProbeResult> {
  const startedAt = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      Promise.resolve().then(probe),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("readiness probe timed out")), timeoutMs);
        timer.unref?.();
      }),
    ]);
    return { status: "ok", latencyMs: Math.round(performance.now() - startedAt) };
  } catch {
    return { status: "unavailable", latencyMs: Math.round(performance.now() - startedAt) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function productionRequiresRedis(): boolean {
  return process.env.NODE_ENV === "production" && process.env.REDIS_REQUIRED !== "false";
}

async function pingRedis(): Promise<void> {
  const client = distributedState.getRedisClient();
  if (!client || !client.isReady) throw new Error("Redis client is not ready");
  await client.ping();
}

export function createReadinessHandler(
  dependencies: ReadinessDependencies = {},
): RequestHandler {
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const redisConfigured = dependencies.redisConfigured ?? Boolean(process.env.REDIS_URL?.trim());
  const redisRequired = dependencies.redisRequired ?? productionRequiresRedis();
  const postgresProbe = dependencies.postgresProbe ?? (() => pool.query("SELECT 1"));
  const redisProbe = dependencies.redisProbe ?? pingRedis;
  const now = dependencies.now ?? (() => new Date());

  return async (_req, res) => {
    const [postgres, redis] = await Promise.all([
      runProbe(postgresProbe, timeoutMs),
      redisConfigured
        ? runProbe(redisProbe, timeoutMs)
        : Promise.resolve<ProbeResult>({ status: "not_configured", latencyMs: null }),
    ]);

    const ready = postgres.status === "ok" && (!redisRequired || redis.status === "ok");
    const degraded = ready && redis.status !== "ok";

    res.setHeader("Cache-Control", "no-store");
    return res.status(ready ? 200 : 503).json({
      status: ready ? (degraded ? "degraded" : "ready") : "not_ready",
      ready,
      service: "khaaos-run-api",
      checkedAt: now().toISOString(),
      checks: {
        postgres: { ...postgres, required: true },
        redis: { ...redis, required: redisRequired },
      },
    });
  };
}

export function registerReadinessRoute(
  app: Express,
  dependencies: ReadinessDependencies = {},
): void {
  app.get("/readyz", createReadinessHandler(dependencies));
}
