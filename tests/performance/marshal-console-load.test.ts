import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import express from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
const [{ registerMarshalConsoleRoutes, MarshalConsoleStore }, { MemoryMarshalConsoleRepository }] = await Promise.all([
  import("../../server/game/marshalConsole.ts"),
  import("../official/helpers/marshalConsoleMemoryRepository.ts"),
]);
const app = express();
app.use(express.json({ limit: "20kb" }));
app.use((req, _res, next) => {
  const actorId = req.get("x-load-actor");
  (req as any).isAuthenticated = () => Boolean(actorId);
  if (actorId) (req as any).user = { claims: { sub: actorId }, expires_at: Math.floor(Date.now() / 1000) + 60 };
  next();
});
const actors = Array.from({ length: 20 }, (_, index) => `load-ci-operator-${index}`);
registerMarshalConsoleRoutes(app, {
  operatorIds: actors.join(","),
  store: new MarshalConsoleStore(new MemoryMarshalConsoleRepository()),
});
const server = createServer(app);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not start local load-test server");
const baseUrl = `http://127.0.0.1:${address.port}`;
const worlds = ["CIGKV", "W1", "W2", "W3", "W4"] as const;
const timeoutSignal = () => AbortSignal.timeout(20_000);
const percentile95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] ?? 0;
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("Marshal HTTP load: 400 concorrências de overview e 100 conselhos com latência limitada", async () => {
  const overviewStartedAt = performance.now();
  const overviewLatencies: number[] = [];
  const overviewResults = await Promise.all(Array.from({ length: 400 }, async (_, index) => {
    const actorId = actors[index % actors.length];
    const worldId = worlds[index % worlds.length];
    const startedAt = performance.now();
    const response = await fetch(`${baseUrl}/api/console/v1/marshal/overview?worldId=${worldId}`, {
      headers: { "x-load-actor": actorId }, signal: timeoutSignal(),
    });
    overviewLatencies.push(performance.now() - startedAt);
    return { response, actorId, worldId };
  }));
  assert.ok(overviewResults.every(({ response }) => response.status === 200));
  const overviewBodies = await Promise.all(overviewResults.map(({ response }) => response.json() as Promise<any>));
  assert.ok(overviewBodies.every((body, index) => body.worldId === overviewResults[index].worldId));
  assert.ok(overviewBodies.every((body) => body.incidentTelemetryAvailable === false && body.activeIncidents === null));

  const councilStartedAt = performance.now();
  const councilResponses = await Promise.all(Array.from({ length: 100 }, async (_, index) => {
    const actorId = actors[index % actors.length];
    const worldId = worlds[index % worlds.length];
    const response = await fetch(`${baseUrl}/api/console/v1/marshal/councils`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-load-actor": actorId,
        origin: baseUrl,
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify({ subject: `ci-load-${index}`, scope: { worldId, periodSeconds: 3600 } }),
      signal: timeoutSignal(),
    });
    return { response, actorId, worldId };
  }));
  assert.ok(councilResponses.every(({ response }) => response.status === 202 || response.status === 200));
  const submitted = await Promise.all(councilResponses.map(async ({ response, actorId, worldId }) => ({
    status: response.status,
    actorId,
    worldId,
    body: await response.json() as any,
  })));
  assert.equal(new Set(submitted.map((entry) => entry.body.requestId)).size, submitted.length);

  const settled = await Promise.all(submitted.map(async (entry) => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/console/v1/marshal/councils/${entry.body.requestId}`, {
        headers: { "x-load-actor": entry.actorId }, signal: timeoutSignal(),
      });
      assert.equal(response.status, 200);
      const result = await response.json() as any;
      if (["complete", "partial", "failed"].includes(result.status)) return { ...entry, result };
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Council ${entry.body.requestId} exceeded the load-test settlement window`);
  }));
  assert.ok(settled.every((entry) => entry.result.status === "complete"));
  assert.ok(settled.every((entry) => entry.result.telemetry.worldId === entry.worldId));
  assert.ok(settled.every((entry) => entry.result.agents.length === 3));

  const overviewP95Ms = percentile95(overviewLatencies);
  const overviewElapsedMs = performance.now() - overviewStartedAt;
  const councilElapsedMs = performance.now() - councilStartedAt;
  console.log(JSON.stringify({
    workload: { overviewRequests: overviewResults.length, councilSubmissions: submitted.length, operators: actors.length, worlds: worlds.length },
    overviewP95Ms: Math.round(overviewP95Ms),
    overviewElapsedMs: Math.round(overviewElapsedMs),
    councilsElapsedMs: Math.round(councilElapsedMs),
    completedCouncils: settled.length,
  }, null, 2));
  assert.ok(overviewP95Ms < 15_000, `overview p95 latency exceeded 15s (${Math.round(overviewP95Ms)}ms)`);
  assert.ok(overviewElapsedMs < 30_000, `overview burst exceeded 30s (${Math.round(overviewElapsedMs)}ms)`);
  assert.ok(councilElapsedMs < 45_000, `council load exceeded 45s (${Math.round(councilElapsedMs)}ms)`);
});

test("Marshal SSE load: 40 streams concorrentes recebem snapshot e liberam recursos ao desconectar", async () => {
  const controllers = Array.from({ length: 40 }, () => new AbortController());
  try {
    const streams = await Promise.all(controllers.map(async (controller, index) => {
      const actorId = actors[index % actors.length];
      const worldId = worlds[index % worlds.length];
      const response = await fetch(`${baseUrl}/api/console/v1/marshal/telemetry/stream?worldId=${worldId}`, {
        headers: { "x-load-actor": actorId, accept: "text/event-stream" },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
      const reader = response.body!.getReader();
      let buffered = "";
      for (let attempt = 0; attempt < 5 && !buffered.includes(`"worldId":"${worldId}"`); attempt += 1) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffered += new TextDecoder().decode(chunk.value);
      }
      assert.match(buffered, new RegExp(`"worldId":"${worldId}"`));
      controller.abort();
      await reader.cancel().catch(() => undefined);
      return response.status;
    }));
    assert.equal(streams.length, 40);
    assert.ok(streams.every((status) => status === 200));
  } finally {
    for (const controller of controllers) controller.abort();
  }
});
