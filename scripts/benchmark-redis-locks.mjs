#!/usr/bin/env node
import { createClient } from "redis";
import { performance } from "node:perf_hooks";

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
process.env.REDIS_URL = redisUrl;
const { DistributedState } = await import("../server/game/DistributedState.ts");

const prefix = process.env.REDIS_NAMESPACE ?? `khaaos:bench:${process.pid}`;
const rounds = Number(process.env.BENCH_ROUNDS ?? 1_000);
const concurrency = Number(process.env.BENCH_CONCURRENCY ?? 64);
const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;
const RENEW_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

if (!Number.isInteger(rounds) || rounds < 1 || rounds > 100_000) throw new Error("BENCH_ROUNDS inválido");
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 512) throw new Error("BENCH_CONCURRENCY inválido");

const client = createClient({ url: redisUrl });
await client.connect();
const state = new DistributedState();
await state.connect();
if (!state.getRedisClient()) throw new Error("Redis não conectou; benchmark abortado");

const samples = [];
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};
const stats = (name, startedAt, durations, operations) => {
  const elapsedMs = performance.now() - startedAt;
  return {
    name,
    operations,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    opsPerSecond: Number((operations / (elapsedMs / 1000)).toFixed(1)),
    latencyMs: {
      p50: Number(percentile(durations, 0.50).toFixed(3)),
      p95: Number(percentile(durations, 0.95).toFixed(3)),
      p99: Number(percentile(durations, 0.99).toFixed(3)),
      max: Number(durations.reduce((max, value) => Math.max(max, value), 0).toFixed(3)),
    },
  };
};
const workerPool = async (total, width, fn) => {
  let next = 0;
  const workers = Array.from({ length: Math.min(total, width) }, async () => {
    while (true) {
      const index = next++;
      if (index >= total) return;
      await fn(index);
    }
  });
  await Promise.all(workers);
};

try {
  const lockContentionName = `${prefix}:lock:contention`;
  const staleKey = `${prefix}:lock:bench:stale`;
  await client.del(lockContentionName, staleKey);

  const contentionDurations = [];
  let contentionWins = 0;
  const contentionStarted = performance.now();
  for (let round = 0; round < rounds; round++) {
    const timings = await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
      const started = performance.now();
      const token = await state.acquireLock("bench:contention", 2_000);
      contentionDurations.push(performance.now() - started);
      if (token) {
        contentionWins++;
        await state.releaseLock("bench:contention", token);
      }
      return { worker, token };
    }));
    if (timings.filter((result) => result.token).length !== 1) {
      throw new Error(`violação de exclusão mútua na rodada ${round}`);
    }
  }
  samples.push(stats("acquire_release_contention", contentionStarted, contentionDurations, rounds * concurrency * 2));

  const mixedDurations = [];
  const mixedStarted = performance.now();
  await workerPool(rounds, concurrency, async (index) => {
    const keyName = `bench:independent:${index}`;
    const started = performance.now();
    const token = await state.acquireLock(keyName, 2_000);
    if (!token) throw new Error(`falha de acquire em chave independente ${keyName}`);
    await state.releaseLock(keyName, token);
    mixedDurations.push(performance.now() - started);
  });
  samples.push(stats("independent_acquire_release", mixedStarted, mixedDurations, rounds * 2));

  const staleStarted = performance.now();
  const staleA = await state.acquireLock("bench:stale", 60);
  if (!staleA) throw new Error("owner A não adquiriu lock stale");
  await new Promise((resolve) => setTimeout(resolve, 90));
  const staleB = await state.acquireLock("bench:stale", 2_000);
  if (!staleB) throw new Error("owner B não adquiriu lock após expiração de A");
  const lateRelease = await client.eval(RELEASE_SCRIPT, { keys: [staleKey], arguments: [staleA] });
  const stillOwned = await client.get(staleKey) === staleB;
  const lateRenew = await client.eval(RENEW_SCRIPT, { keys: [staleKey], arguments: [staleA, "2000"] });
  if (Number(lateRelease) !== 0 || Number(lateRenew) !== 0 || !stillOwned) {
    throw new Error("token obsoleto alterou o lock vigente");
  }
  await state.releaseLock("bench:stale", staleB);
  samples.push({
    name: "stale_owner_safety",
    operations: 4,
    elapsedMs: Number((performance.now() - staleStarted).toFixed(3)),
    passed: true,
    assertions: ["owner A expirado", "owner B adquirido", "release tardio de A preservou B", "renew tardio de A rejeitado"],
  });

  console.log(JSON.stringify({
    redisUrl: redisUrl.replace(/:\/\/[^@]+@/, "://").replace(/127\.0\.0\.1|localhost/, "local"),
    prefix,
    rounds,
    concurrency,
    contentionWins,
    samples,
  }, null, 2));
} finally {
  await state.close().catch(() => undefined);
  await client.quit().catch(() => undefined);
}
