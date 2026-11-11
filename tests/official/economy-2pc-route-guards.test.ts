import assert from "node:assert/strict";
import { after, test } from "node:test";
import express from "express";
import request from "supertest";

const previousNodeEnv = process.env.NODE_ENV;
const previousDatabaseUrl = process.env.DATABASE_URL;
const previousNodeSecret = process.env.ECONOMY_2PC_NODE_SECRET;
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
delete process.env.ECONOMY_2PC_NODE_SECRET;

const [{ registerApiRoutes }, { distributedState }] = await Promise.all([
  import("../../server/routes.ts"),
  import("../../server/game/DistributedState.ts"),
]);

const app = express();
app.use(express.json());
registerApiRoutes(app);

after(() => {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  if (previousNodeSecret === undefined) delete process.env.ECONOMY_2PC_NODE_SECRET;
  else process.env.ECONOMY_2PC_NODE_SECRET = previousNodeSecret;
});

test("guards globais /api bloqueiam POST 2PC de origem cross-site", async () => {
  const response = await request(app)
    .post("/api/economy/2pc/prepare")
    .set("Origin", "https://attacker.example")
    .set("sec-fetch-site", "cross-site")
    .send({});

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { message: "Cross-site request blocked" });
});

test("guard global de rate limit cobre as rotas 2PC", async () => {
  const state = distributedState as unknown as {
    rateLimit: (...args: unknown[]) => Promise<{ allowed: boolean; retryAfterMs: number }>;
  };
  const originalRateLimit = state.rateLimit;
  state.rateLimit = async () => ({ allowed: false, retryAfterMs: 1_500 });

  try {
    const response = await request(app)
      .post("/api/economy/2pc/prepare")
      .send({});

    assert.equal(response.status, 429);
    assert.equal(response.headers["retry-after"], "2");
  } finally {
    state.rateLimit = originalRateLimit;
  }
});

test("produção sem segredo/sessão rejeita prepare e health 2PC", async () => {
  const previousTestNodeEnv = process.env.NODE_ENV;
  const previousTestNodeSecret = process.env.ECONOMY_2PC_NODE_SECRET;
  process.env.NODE_ENV = "production";
  delete process.env.ECONOMY_2PC_NODE_SECRET;

  try {
    const prepare = await request(app)
      .post("/api/economy/2pc/prepare")
      .send({});
    assert.equal(prepare.status, 401);
    assert.deepEqual(prepare.body, { message: "Autenticação 2PC obrigatória" });

    const health = await request(app).get("/api/economy/2pc/health");
    assert.equal(health.status, 401);
    assert.deepEqual(health.body, { message: "Autenticação 2PC obrigatória" });
  } finally {
    if (previousTestNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousTestNodeEnv;
    if (previousTestNodeSecret === undefined) delete process.env.ECONOMY_2PC_NODE_SECRET;
    else process.env.ECONOMY_2PC_NODE_SECRET = previousTestNodeSecret;
  }
});
