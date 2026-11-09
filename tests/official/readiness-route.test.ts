import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import express, { type Express } from "express";

type ReadinessRegistrar = typeof import("../../server/routes/readiness").registerReadinessRoute;
type ReadinessDependencies = import("../../server/routes/readiness").ReadinessDependencies;

let registerReadinessRoute: ReadinessRegistrar | undefined;

async function getReadinessRegistrar(): Promise<ReadinessRegistrar> {
  if (registerReadinessRoute) return registerReadinessRoute;

  const previousDatabaseUrl = process.env.DATABASE_URL;
  if (!previousDatabaseUrl) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
      ?? "postgresql://readiness_test:readiness_test@127.0.0.1:5432/khaaos_test";
  }

  try {
    ({ registerReadinessRoute } = await import("../../server/routes/readiness"));
  } finally {
    if (!previousDatabaseUrl) delete process.env.DATABASE_URL;
  }

  return registerReadinessRoute!;
}

async function requestReadiness(dependencies: ReadinessDependencies) {
  const registerRoute = await getReadinessRegistrar();
  const app: Express = express();
  registerRoute(app, dependencies);

  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/readyz`, {
      headers: { connection: "close" },
    });
    return {
      statusCode: response.status,
      cacheControl: response.headers.get("cache-control"),
      body: await response.json() as {
        status: string;
        ready: boolean;
        checks: {
          postgres: { status: string; required: boolean; latencyMs: number | null };
          redis: { status: string; required: boolean; latencyMs: number | null };
        };
      },
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("GET /readyz reports ready when PostgreSQL and required Redis respond", async () => {
  const response = await requestReadiness({
    postgresProbe: async () => undefined,
    redisProbe: async () => "PONG",
    redisConfigured: true,
    redisRequired: true,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.cacheControl, "no-store");
  assert.equal(response.body.status, "ready");
  assert.equal(response.body.ready, true);
  assert.equal(response.body.checks.postgres.status, "ok");
  assert.equal(response.body.checks.postgres.required, true);
  assert.equal(response.body.checks.redis.status, "ok");
  assert.equal(response.body.checks.redis.required, true);
});

test("GET /readyz returns 503 when PostgreSQL fails without leaking the connection error", async () => {
  const response = await requestReadiness({
    postgresProbe: async () => { throw new Error("postgres://secret@private-host"); },
    redisProbe: async () => "PONG",
    redisConfigured: true,
    redisRequired: true,
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.status, "not_ready");
  assert.equal(response.body.ready, false);
  assert.equal(response.body.checks.postgres.status, "unavailable");
  assert.equal(JSON.stringify(response.body).includes("private-host"), false);
});

test("GET /readyz returns 503 when required Redis is not configured", async () => {
  const response = await requestReadiness({
    postgresProbe: async () => undefined,
    redisConfigured: false,
    redisRequired: true,
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.status, "not_ready");
  assert.equal(response.body.checks.redis.status, "not_configured");
  assert.equal(response.body.checks.redis.required, true);
});

test("GET /readyz reports optional missing Redis as degraded without blocking readiness", async () => {
  const response = await requestReadiness({
    postgresProbe: async () => undefined,
    redisConfigured: false,
    redisRequired: false,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "degraded");
  assert.equal(response.body.ready, true);
  assert.equal(response.body.checks.redis.status, "not_configured");
  assert.equal(response.body.checks.redis.required, false);
});

test("GET /readyz fails closed when a PostgreSQL probe times out", async () => {
  const response = await requestReadiness({
    postgresProbe: () => new Promise(() => undefined),
    redisConfigured: false,
    redisRequired: false,
    timeoutMs: 10,
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.checks.postgres.status, "unavailable");
});
