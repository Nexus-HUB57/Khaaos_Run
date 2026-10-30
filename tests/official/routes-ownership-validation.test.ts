import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { after, test } from "node:test";
import express from "express";

process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/khaaos_test";
const previousZoneOperatorIds = process.env.ZONE_OPERATOR_IDS;
process.env.ZONE_OPERATOR_IDS = "operator-allowed";

const [{ registerApiRoutes }, { storage }, { economyService }] = await Promise.all([
  import("../../server/routes.ts"),
  import("../../server/storage.ts"),
  import("../../server/game/economyService.ts"),
]);

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const userId = req.get("x-test-user-id");
  (req as any).isAuthenticated = () => Boolean(userId);
  if (userId) {
    (req as any).user = {
      claims: { sub: userId },
      expires_at: Math.floor(Date.now() / 1000) + 60,
    };
  }
  next();
});

registerApiRoutes(app);
if (previousZoneOperatorIds === undefined) delete process.env.ZONE_OPERATOR_IDS;
else process.env.ZONE_OPERATOR_IDS = previousZoneOperatorIds;

const blockedStorageCalls: { method: string; args: unknown[] }[] = [];
const storagePrototype = Object.getPrototypeOf(storage);
const storageMethodNames = Object.getOwnPropertyNames(storagePrototype)
  .filter((name) => name !== "constructor" && typeof (storage as any)[name] === "function");

for (const method of storageMethodNames) {
  (storage as any)[method] = (...args: unknown[]) => {
    blockedStorageCalls.push({ method, args });
    throw new Error(`Unexpected storage call in route test: ${method}`);
  };
}

function stubStorage(method: string, implementation: (...args: any[]) => unknown) {
  (storage as any)[method] = implementation;
}

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

async function request(
  method: string,
  path: string,
  userId = "player-1",
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const headers = new Headers({ "x-test-user-id": userId });
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body) ?? "null";
  }
  return fetch(`${baseUrl}${path}`, init);
}

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  for (const method of storageMethodNames) delete (storage as any)[method];
});

test("mutations rejeitam entradas inválidas sem chamar o storage", async (t) => {
  const invalidInputs = [
    { name: "transferência negativa", path: "/api/bank/transfer", body: { amountKrc: -1, destination: "fbm" } },
    { name: "transferência com usuário forjado", path: "/api/bank/transfer", body: { amountKrc: 5, destination: "fbm", userId: "victim" } },
    { name: "empréstimo fracionário", path: "/api/loans", body: { amountKrc: 100.5, days: 1 } },
    { name: "compra com produto inexistente", path: "/api/items/purchase", body: { catalogId: "produto-inexistente" } },
    { name: "compra com atributos econômicos forjados", path: "/api/items/purchase", body: { catalogId: "rifle-de-plasma", name: "Rifle barato", priceKrc: 1, stats: { damage: 999 } } },
    { name: "equipamento com proprietário forjado", path: "/api/items/1/equip", body: { isEquipped: true, userId: "victim" } },
    { name: "uso de item com campo extra", path: "/api/items/1/use", body: { userId: "victim" } },
    { name: "reparo abaixo do mínimo", path: "/api/items/1/repair", body: { amountKrc: 0 } },
    { name: "zona fora dos limites", path: "/api/zone/start", userId: "operator-allowed", body: { centerX: 101, centerY: 50 } },
    { name: "parada de zona com campo extra", path: "/api/zone/stop", userId: "operator-allowed", body: { userId: "victim" } },
    { name: "dano acima do limite", path: "/api/zone/damage", body: { damage: 101 } },
    { name: "cura abaixo do mínimo", path: "/api/zone/heal", userId: "operator-allowed", body: { amount: 0 } },
    { name: "spawn de loot com proprietário forjado", path: "/api/loot/spawn", userId: "operator-allowed", body: { userId: "victim" } },
    { name: "pickup com campo extra", path: "/api/loot/1/pickup", body: { userId: "victim" } },
    { name: "salário diário com campo extra", path: "/api/player/daily-salary", body: { userId: "victim" } },
    { name: "especialização desconhecida", path: "/api/player/specialization", body: { specializationId: "ADMIN" } },
    { name: "especialização com usuário forjado", path: "/api/player/specialization", body: { specializationId: "INFANTARIA", userId: "victim" } },
    { name: "respawn com campo extra", path: "/api/player/respawn", body: { userId: "victim" } },
    { name: "prévia de empréstimo fora do limite", path: "/api/economy/loan-preview", body: { principal: 0, days: 1 } },
    { name: "simulação fora do limite", path: "/api/economy/simulate", body: { agents: 501, days: 30 } },
    { name: "lote de simulação fora do limite", path: "/api/economy/simulate-batch", body: { runs: 1, agents: 150, days: 21 } },
  ];

  for (const input of invalidInputs) {
    await t.test(input.name, async () => {
      const callsBefore = blockedStorageCalls.length;
      const response = await request("POST", input.path, input.userId, input.body);
      assert.equal(response.status, 400);
      assert.equal(
        blockedStorageCalls.length,
        callsBefore,
        `${input.name} não deve consultar nem alterar dados`,
      );
    });
  }
});

test("IDs inválidos são rejeitados antes de acessar o storage", async (t) => {
  const invalidIds = [
    { path: "/api/loans/-1/pay", body: {} },
    { path: "/api/items/not-a-number/equip", body: { isEquipped: true } },
    { path: "/api/items/0/use", body: {} },
    { path: "/api/items/9007199254740992/repair", body: { amountKrc: 10 } },
    { path: "/api/loot/not-a-number/pickup", body: {} },
  ];

  for (const input of invalidIds) {
    await t.test(input.path, async () => {
      const callsBefore = blockedStorageCalls.length;
      const response = await request("POST", input.path, "player-1", input.body);
      assert.equal(response.status, 400);
      assert.equal(blockedStorageCalls.length, callsBefore);
    });
  }
});

test("mutações financeiras usam o serviço idempotente e preservam status e DTOs", async () => {
  const methodNames = ["transfer", "requestLoan", "payLoan", "purchaseItem", "repairItem", "claimDailySalary"];
  const replies: Record<string, { status: number; body: Record<string, unknown> }> = {
    transfer: { status: 200, body: { message: "Transferência realizada", newBalance: "113.00", operationId: "00000000-0000-4000-8000-000000000012" } },
    requestLoan: { status: 201, body: { id: 12, userId: "player-1", operationId: "00000000-0000-4000-8000-000000000013" } },
    payLoan: { status: 200, body: { message: "Empréstimo pago", operationId: "00000000-0000-4000-8000-000000000014" } },
    purchaseItem: { status: 201, body: { id: 13, userId: "player-1", operationId: "00000000-0000-4000-8000-000000000015" } },
    repairItem: { status: 200, body: { message: "Reparado Item", newDurability: "55.00", operationId: "00000000-0000-4000-8000-000000000016" } },
    claimDailySalary: { status: 200, body: { message: "Salário recebido", amount: "100.00", operationId: "00000000-0000-4000-8000-000000000017" } },
  };
  const calls: { method: string; args: unknown[] }[] = [];
  for (const method of methodNames) {
    (economyService as any)[method] = async (...args: unknown[]) => {
      calls.push({ method, args });
      return { ...replies[method], replayed: false };
    };
  }

  const cases = [
    { method: "transfer", path: "/api/bank/transfer", body: { amountKrc: "10.00", destination: "fbm" }, key: "route-transfer-key-0001", args: ["player-1", "route-transfer-key-0001", "10.00", "fbm"] },
    { method: "requestLoan", path: "/api/loans", body: { amountKrc: 100, days: 2 }, key: "route-loan-key-000001", args: ["player-1", "route-loan-key-000001", 100, 2] },
    { method: "payLoan", path: "/api/loans/1/pay", body: {}, key: "route-payloan-key-0001", args: ["player-1", "route-payloan-key-0001", 1] },
    { method: "purchaseItem", path: "/api/items/purchase", body: { catalogId: "rifle-de-plasma" }, key: "route-purchase-key-0001", args: ["player-1", "route-purchase-key-0001", { catalogId: "rifle-de-plasma" }] },
    { method: "repairItem", path: "/api/items/1/repair", body: { amountKrc: "1.00" }, key: "route-repair-key-00001", args: ["player-1", "route-repair-key-00001", 1, "1.00"] },
    { method: "claimDailySalary", path: "/api/player/daily-salary", body: {}, key: "route-salary-key-0001", args: ["player-1", "route-salary-key-0001"] },
  ];

  try {
    const missingKey = await request("POST", "/api/bank/transfer", "player-1", { amountKrc: "10.00", destination: "fbm" });
    assert.equal(missingKey.status, 400);
    assert.equal(calls.length, 0, "a rota não deve chamar o serviço sem uma chave válida");

    for (const input of cases) {
      const response = await request("POST", input.path, "player-1", input.body, { "Idempotency-Key": input.key });
      assert.equal(response.status, replies[input.method].status, input.method);
      assert.deepEqual(await response.json(), replies[input.method].body, input.method);
    }

    assert.deepEqual(calls, cases.map(({ method, args }) => ({ method, args })));
    assert.equal(blockedStorageCalls.length, 0, "mutações financeiras não devem usar os caminhos legados de storage");
  } finally {
    for (const method of methodNames) delete (economyService as any)[method];
  }
});

test("depósito é bloqueado antes de serviço/storage e ignora valor escolhido pelo cliente", async () => {
  const callsBefore = blockedStorageCalls.length;
  const response = await request("POST", "/api/bank/deposit", "player-1", {
    amountUsd: "10000.00",
    amountKrc: "999999999.00",
    userId: "victim",
  }, { "Idempotency-Key": randomUUID() });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    code: "PAYMENTS_NOT_CONFIGURED",
    message: "Depósitos estão temporariamente indisponíveis. Nenhum KRC foi creditado.",
  });
  assert.equal(blockedStorageCalls.length, callsBefore);
  assert.equal(typeof (economyService as any).deposit, "undefined");
});

test("leituras privadas usam a identidade da sessão, não userId enviado na query", async (t) => {
  const scopedReads: { method: string; userId: string }[] = [];
  const recordRead = (method: string, userId: string) => {
    scopedReads.push({ method, userId });
    return [{ id: 1, userId }];
  };
  const playerStats = (userId: string) => ({
    userId,
    health: 100,
    maxHealth: 100,
    status: "VIVO",
    rating: 1200,
    rank: "ZHEERS",
    xp: 0,
    matchesPlayed: 0,
    wins: 0,
    top5: 0,
    seasonKills: 0,
    kills: 0,
    deaths: 0,
  });

  stubStorage("getBankAccount", async (userId: string) => {
    scopedReads.push({ method: "getBankAccount", userId });
    return { userId, weaponsBalance: "100", bonusBalance: "0", fbmBalance: "0" };
  });
  stubStorage("getItems", async (userId: string) => recordRead("getItems", userId));
  stubStorage("getLoans", async (userId: string) => recordRead("getLoans", userId));
  stubStorage("getTransactions", async (userId: string) => recordRead("getTransactions", userId));
  stubStorage("getMatchHistory", async (userId: string) => recordRead("getMatchHistory", userId));
  stubStorage("getPlayerStats", async (userId: string) => {
    scopedReads.push({ method: "getPlayerStats", userId });
    return playerStats(userId);
  });

  const reads = [
    { path: "/api/bank?userId=victim", method: "getBankAccount" },
    { path: "/api/items?userId=victim", method: "getItems" },
    { path: "/api/loans?userId=victim", method: "getLoans" },
    { path: "/api/bank/transactions?userId=victim", method: "getTransactions" },
    { path: "/api/ranking/history?userId=victim", method: "getMatchHistory" },
    { path: "/api/player/me?userId=victim", method: "getPlayerStats" },
    { path: "/api/ranking/me?userId=victim", method: "getPlayerStats" },
  ];

  for (const read of reads) {
    await t.test(read.path, async () => {
      const response = await request("GET", read.path);
      assert.equal(response.status, 200);
      await response.json();
      const lastRead = scopedReads.at(-1);
      assert.deepEqual(lastRead, { method: read.method, userId: "player-1" });
    });
  }

  assert.equal(blockedStorageCalls.length, 0, "as leituras não devem acionar outros métodos do storage");
  assert.equal(scopedReads.length, reads.length);
});

test("mutações de empréstimos e itens ocultam recursos alheios e inexistentes", async () => {
  const victimLoanId = 8811;
  const missingLoanId = 9911;
  const victimItemId = 8812;
  const missingItemId = 9912;
  const scopedCalls: { method: string; id: number; userId: string }[] = [];
  const serviceCalls: { method: string; userId: string; key: string; id: number }[] = [];
  const mutations: string[] = [];
  stubStorage("getItemForUser", async (id: number, userId: string) => {
    scopedCalls.push({ method: "getItemForUser", id, userId });
    return id === victimItemId && userId === "victim"
      ? { id, userId, name: "Medkit", type: "CURATIVO", stats: { heal: 25 }, durability: "50", maxDurability: "100" }
      : undefined;
  });
  stubStorage("setItemEquipped", async (id: number, userId: string) => {
    scopedCalls.push({ method: "setItemEquipped", id, userId });
    if (id !== victimItemId || userId !== "victim") return undefined;
    mutations.push(`equip:${id}:${userId}`);
    return { id, userId };
  });
  (economyService as any).payLoan = async (userId: string, key: string, id: number) => {
    serviceCalls.push({ method: "payLoan", userId, key, id });
    return { status: 404, body: { message: "Empréstimo não encontrado" }, replayed: false };
  };
  (economyService as any).repairItem = async (userId: string, key: string, id: number) => {
    serviceCalls.push({ method: "repairItem", userId, key, id });
    return { status: 404, body: { message: "Item não encontrado" }, replayed: false };
  };

  const attempts = [
    { path: `/api/loans/${victimLoanId}/pay`, body: {}, message: "Empréstimo não encontrado", key: "ownership-loan-victim-01" },
    { path: `/api/loans/${missingLoanId}/pay`, body: {}, message: "Empréstimo não encontrado", key: "ownership-loan-missing-1" },
    { path: `/api/items/${victimItemId}/equip`, body: { isEquipped: false }, message: "Item não encontrado" },
    { path: `/api/items/${missingItemId}/equip`, body: { isEquipped: false }, message: "Item não encontrado" },
    { path: `/api/items/${victimItemId}/use`, body: {}, message: "Item não encontrado" },
    { path: `/api/items/${missingItemId}/use`, body: {}, message: "Item não encontrado" },
    { path: `/api/items/${victimItemId}/repair`, body: { amountKrc: 10 }, message: "Item não encontrado", key: "ownership-repair-victim-01" },
    { path: `/api/items/${missingItemId}/repair`, body: { amountKrc: 10 }, message: "Item não encontrado", key: "ownership-repair-missing-1" },
  ];

  try {
    for (const attempt of attempts) {
      const headers = attempt.key ? { "Idempotency-Key": attempt.key } : {};
      const response = await request("POST", attempt.path, "player-1", attempt.body, headers);
      assert.equal(response.status, 404, attempt.path);
      assert.deepEqual(await response.json(), { message: attempt.message });
    }

    assert.deepEqual(scopedCalls, [
      { method: "setItemEquipped", id: victimItemId, userId: "player-1" },
      { method: "setItemEquipped", id: missingItemId, userId: "player-1" },
      { method: "getItemForUser", id: victimItemId, userId: "player-1" },
      { method: "getItemForUser", id: missingItemId, userId: "player-1" },
    ]);
    assert.deepEqual(serviceCalls, [
      { method: "payLoan", userId: "player-1", key: "ownership-loan-victim-01", id: victimLoanId },
      { method: "payLoan", userId: "player-1", key: "ownership-loan-missing-1", id: missingLoanId },
      { method: "repairItem", userId: "player-1", key: "ownership-repair-victim-01", id: victimItemId },
      { method: "repairItem", userId: "player-1", key: "ownership-repair-missing-1", id: missingItemId },
    ]);
    assert.deepEqual(mutations, [], "tentativas de outro usuário não devem alterar os recursos");
    assert.equal(blockedStorageCalls.length, 0, "nenhum débito, crédito ou ledger deve ocorrer via storage legado");
  } finally {
    delete (economyService as any).payLoan;
    delete (economyService as any).repairItem;
  }
});

test("especialização exige os requisitos EP555 e grava apenas no perfil da sessão", async () => {
  const updates: { userId: string; specializationId?: string | null }[] = [];
  let kills = 24;
  stubStorage("getPlayerStats", async (userId: string) => ({
    userId,
    xp: 0,
    kills,
    rank: "ZHEERS",
  }));
  stubStorage("updatePlayerStats", async (userId: string, values: { specializationId?: string | null }) => {
    updates.push({ userId, ...values });
    return { userId, xp: 0, kills, rank: "ZHEERS", ...values };
  });

  const locked = await request("POST", "/api/player/specialization", "player-1", {
    specializationId: "INFANTARIA",
  });
  assert.equal(locked.status, 403);
  assert.deepEqual(await locked.json(), { message: "Requisitos de patente e Morth ainda não atingidos" });
  assert.deepEqual(updates, [], "não deve salvar uma especialização bloqueada");

  kills = 25;
  const selected = await request("POST", "/api/player/specialization", "player-1", {
    specializationId: "INFANTARIA",
  });
  assert.equal(selected.status, 200);
  assert.deepEqual(await selected.json(), { specializationId: "INFANTARIA" });
  assert.deepEqual(updates, [{ userId: "player-1", specializationId: "INFANTARIA" }]);
});
