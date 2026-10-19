import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, test } from "node:test";
import express from "express";
import { api } from "../../shared/routes";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
const previousZoneOperatorIds = process.env.ZONE_OPERATOR_IDS;
process.env.ZONE_OPERATOR_IDS = "operator-allowed";
const previousMarshalOperatorIds = process.env.MARSHAL_CONSOLE_OPERATOR_IDS;
process.env.MARSHAL_CONSOLE_OPERATOR_IDS = "operator-allowed";

const [{ registerApiRoutes }, { registerAuthRoutes }] = await Promise.all([
  import("../../server/routes.ts"),
  import("../../server/replit_integrations/auth/routes.ts"),
]);

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = req.get("x-test-user-id");
  (req as any).isAuthenticated = () => Boolean(userId);
  if (userId) {
    (req as any).user = {
      claims: { sub: userId },
      expires_at: Math.floor(Date.now() / 1000) + (req.get("x-test-expired") ? -60 : 60),
    };
  }
  next();
});

registerAuthRoutes(app);
registerApiRoutes(app);
if (previousZoneOperatorIds === undefined) delete process.env.ZONE_OPERATOR_IDS;
else process.env.ZONE_OPERATOR_IDS = previousZoneOperatorIds;
if (previousMarshalOperatorIds === undefined) delete process.env.MARSHAL_CONSOLE_OPERATOR_IDS;
else process.env.MARSHAL_CONSOLE_OPERATOR_IDS = previousMarshalOperatorIds;

const server = createServer(app);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Could not determine the test server address");
}
const baseUrl = `http://127.0.0.1:${address.port}`;

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

const protectedRoutes = [
  ["GET", "/api/auth/user"],
  ["GET", "/api/auth/ws-token"],
  ["GET", "/api/zone/permissions"],
  ["GET", "/api/console/v1/marshal/overview?worldId=W1"],
  ["POST", "/api/console/v1/marshal/councils"],
  ["GET", "/api/console/v1/marshal/councils/00000000-0000-4000-8000-000000000000"],
  ["GET", "/api/console/v1/marshal/proposals/prop_00000000-0000-4000-8000-000000000000"],
  ["GET", "/api/bank"],
  ["POST", "/api/bank/deposit"],
  ["POST", "/api/bank/transfer"],
  ["GET", "/api/bank/transactions"],
  ["GET", "/api/loans"],
  ["POST", "/api/loans"],
  ["POST", "/api/loans/1/pay"],
  ["GET", "/api/items"],
  ["GET", "/api/forge/catalog"],
  ["POST", "/api/items/1/equip"],
  ["POST", "/api/items/purchase"],
  ["POST", "/api/items/1/use"],
  ["POST", "/api/items/1/repair"],
  ["GET", "/api/player/me"],
  ["POST", "/api/player/daily-salary"],
  ["POST", "/api/player/specialization"],
  ["GET", "/api/zone/status"],
  ["POST", "/api/zone/start"],
  ["POST", "/api/zone/stop"],
  ["POST", "/api/zone/damage"],
  ["POST", "/api/zone/heal"],
  ["GET", "/api/loot"],
  ["POST", "/api/loot/spawn"],
  ["POST", "/api/loot/1/pickup"],
  ["GET", "/api/eliminations"],
  ["POST", "/api/player/respawn"],
  ["GET", "/api/rooms"],
  ["GET", "/api/rooms/room-1"],
  ["GET", "/api/economy/quote"],
  ["GET", "/api/economy/health"],
  ["POST", "/api/economy/loan-preview"],
  ["GET", "/api/procgen/loot"],
  ["GET", "/api/procgen/match"],
  ["GET", "/api/matchmaking/status"],
  ["GET", "/api/matchmaking/queue-size"],
  ["GET", "/api/ranking/leaderboard"],
  ["GET", "/api/ranking/history"],
  ["GET", "/api/ranking/me"],
  ["POST", "/api/economy/simulate"],
  ["POST", "/api/economy/simulate-batch"],
] as const;

test("API privada: todas as rotas rejeitam requisições sem sessão", async (t) => {
  for (const [method, path] of protectedRoutes) {
    await t.test(`${method} ${path}`, async () => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(response.status, 401, `${method} ${path} deve exigir sessão`);
      assert.deepEqual(await response.json(), { message: "Unauthorized" });
    });
  }
});

test("API privada: todas as rotas rejeitam sessão expirada sem token de renovação", async (t) => {
  for (const [method, path] of protectedRoutes) {
    await t.test(`${method} ${path}`, async () => {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          "x-test-user-id": "player-1",
          "x-test-expired": "true",
        },
      });

      assert.equal(response.status, 401, `${method} ${path} deve rejeitar sessão expirada`);
      assert.deepEqual(await response.json(), { message: "Unauthorized" });
    });
  }
});

test("controles globais da zona rejeitam jogador comum mesmo com role forjado no corpo", async (t) => {
  const operatorRoutes = [
    "/api/zone/start",
    "/api/zone/stop",
    "/api/zone/heal",
    "/api/loot/spawn",
  ];

  for (const path of operatorRoutes) {
    await t.test(`POST ${path}`, async () => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": "player-1",
        },
        body: JSON.stringify({ role: "operator", userId: "operator-allowed", amount: 100 }),
      });

      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        message: "Apenas operadores autorizados podem controlar a zona",
      });
    });
  }
});

test("console do Marechal rejeita usuário sem allowlist mesmo com papel forjado", async () => {
  const response = await fetch(`${baseUrl}/api/console/v1/marshal/overview?worldId=W1`, {
    headers: { "x-test-user-id": "player-1" },
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json() as any).error.code, "INSUFFICIENT_SCOPE");
});

test("Forja: catálogo canônico autenticado e compra rejeita o payload antigo controlado pelo cliente", async () => {
  const catalogResponse = await fetch(`${baseUrl}${api.forge.catalog.path}`, {
    headers: { "x-test-user-id": "player-1" },
  });
  assert.equal(catalogResponse.status, 200);
  assert.equal(catalogResponse.headers.get("cache-control"), "no-store");
  const catalog = api.forge.catalog.responses[200].parse(await catalogResponse.json());
  assert.equal(catalog.length, 8);
  assert.equal(catalog.find((item) => item.catalogId === "plasma_rifle")?.priceKrc, 1200);

  const legacyPurchase = await fetch(`${baseUrl}${api.items.purchase.path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": "forge-legacy-payload-test-0001",
      "x-test-user-id": "player-1",
    },
    body: JSON.stringify({ name: "Item Inventado", type: "ARMA", priceKrc: 1 }),
  });
  assert.equal(legacyPurchase.status, 400);
});
