import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, test } from "node:test";
import express from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
const { registerMarshalConsoleRoutes } = await import("../../server/game/marshalConsole.ts");
const app = express();
app.use(express.json({ limit: "20kb" }));
app.use((req, _res, next) => {
  const actorId = req.get("x-test-user-id");
  (req as any).isAuthenticated = () => Boolean(actorId);
  if (actorId) (req as any).user = { claims: { sub: actorId }, expires_at: Math.floor(Date.now() / 1000) + 60 };
  next();
});
registerMarshalConsoleRoutes(app, { operatorIds: "console-admin,peer-admin" });
const server = createServer(app);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not determine test server address");
const baseUrl = `http://127.0.0.1:${address.port}`;
const origin = baseUrl;
const postHeaders = (actorId = "console-admin", key = "00000000-0000-4000-8000-000000000001") => ({
  "content-type": "application/json",
  "x-test-user-id": actorId,
  origin,
  "idempotency-key": key,
});
const body = {
  subject: "W2-window-check",
  scope: { worldId: "W2", periodSeconds: 3600 },
  context: { occupancyPct: 83, queueP95Seconds: 90, marketVolatilityPct: 48, configRevision: "world-config-12" },
};
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("painel do Marechal exige sessão e allowlist, independentemente do corpo", async () => {
  const anonymous = await fetch(`${baseUrl}/api/console/v1/marshal/overview?worldId=W1`);
  assert.equal(anonymous.status, 401);
  const player = await fetch(`${baseUrl}/api/console/v1/marshal/overview?worldId=W1`, {
    headers: { "x-test-user-id": "ordinary-player" },
  });
  assert.equal(player.status, 403);
  assert.equal((await player.json() as any).error.code, "INSUFFICIENT_SCOPE");
});

test("overview fornece estado seguro e indica dados operacionais não instrumentados como stale", async () => {
  const response = await fetch(`${baseUrl}/api/console/v1/marshal/overview?worldId=W2`, {
    headers: { "x-test-user-id": "console-admin" },
  });
  assert.equal(response.status, 200);
  const data = await response.json() as any;
  assert.equal(data.worldId, "W2");
  assert.equal(data.name, "Priadus");
  assert.equal(data.operationalState, "unknown");
  assert.equal(data.occupancy.current, null);
  assert.equal(data.occupancy.capacity, 75);
  assert.equal(data.stale, true);
});

test("overview rejeita mundo inválido", async () => {
  const response = await fetch(`${baseUrl}/api/console/v1/marshal/overview?worldId=FAKE`, {
    headers: { "x-test-user-id": "console-admin" },
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json() as any).error.code, "INVALID_REQUEST");
});

test("requisições concorrentes com a mesma chave de idempotência compartilham um único conselho", async () => {
  const key = "00000000-0000-4000-8000-000000000004";
  const send = () => fetch(`${baseUrl}/api/console/v1/marshal/councils`, {
    method: "POST", headers: postHeaders("console-admin", key), body: JSON.stringify(body),
  });
  const [first, second] = await Promise.all([send(), send()]);
  assert.ok([200, 202].includes(first.status));
  assert.ok([200, 202].includes(second.status));
  const [firstBody, secondBody] = await Promise.all([first.json(), second.json()]) as any[];
  assert.equal(firstBody.requestId, secondBody.requestId);
});

test("conselho assíncrono conclui, idempotência reproduz o mesmo recurso e proposta fica isolada por ator", async () => {
  const createResponse = await fetch(`${baseUrl}/api/console/v1/marshal/councils`, {
    method: "POST", headers: postHeaders(), body: JSON.stringify(body),
  });
  assert.equal(createResponse.status, 202);
  const created = await createResponse.json() as any;
  assert.match(created.requestId, /^[0-9a-f-]{36}$/i);
  assert.equal(created.status, "running");
  assert.equal(createResponse.headers.get("location"), `/api/console/v1/marshal/councils/${created.requestId}`);

  let result: any;
  for (let i = 0; i < 30; i += 1) {
    const response = await fetch(`${baseUrl}/api/console/v1/marshal/councils/${created.requestId}`, {
      headers: { "x-test-user-id": "console-admin" },
    });
    assert.ok(response.status === 200 || response.status === 202);
    result = await response.json();
    if (result.status === "complete" || result.status === "partial" || result.status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(result.status, "complete");
  assert.equal(result.roundsCompleted, 2);
  assert.equal(result.agents.length, 3);
  assert.equal(result.governance[0].status, "preferred-proposal");
  assert.equal(result.governance[0].executable, false);
  assert.equal(result.proposalIds.length, 1);

  const replay = await fetch(`${baseUrl}/api/console/v1/marshal/councils`, {
    method: "POST", headers: postHeaders(), body: JSON.stringify(body),
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json() as any).requestId, created.requestId);

  const reusedKey = await fetch(`${baseUrl}/api/console/v1/marshal/councils`, {
    method: "POST", headers: postHeaders(), body: JSON.stringify({ ...body, subject: "different-subject" }),
  });
  assert.equal(reusedKey.status, 409);
  assert.equal((await reusedKey.json() as any).error.code, "IDEMPOTENCY_KEY_REUSED");

  const otherActor = await fetch(`${baseUrl}/api/console/v1/marshal/councils/${created.requestId}`, {
    headers: { "x-test-user-id": "peer-admin" },
  });
  assert.equal(otherActor.status, 404);

  const proposalId = result.proposalIds[0];
  const proposal = await fetch(`${baseUrl}/api/console/v1/marshal/proposals/${proposalId}`, {
    headers: { "x-test-user-id": "console-admin" },
  });
  assert.equal(proposal.status, 200);
  assert.equal((await proposal.json() as any).executable, false);
  const otherProposal = await fetch(`${baseUrl}/api/console/v1/marshal/proposals/${proposalId}`, {
    headers: { "x-test-user-id": "peer-admin" },
  });
  assert.equal(otherProposal.status, 404);
});

test("POST rejeita origem cross-site, ausência de origem e payload inválido antes da deliberação", async () => {
  const missingOrigin = await fetch(`${baseUrl}/api/console/v1/marshal/councils`, {
    method: "POST", headers: { ...postHeaders(), origin: "" }, body: JSON.stringify(body),
  });
  assert.equal(missingOrigin.status, 403);
  assert.equal((await missingOrigin.json() as any).error.code, "CSRF_ORIGIN_REJECTED");

  const foreignOrigin = await fetch(`${baseUrl}/api/console/v1/marshal/councils`, {
    method: "POST", headers: { ...postHeaders("console-admin", "00000000-0000-4000-8000-000000000002"), origin: "https://attacker.example" }, body: JSON.stringify(body),
  });
  assert.equal(foreignOrigin.status, 403);

  const invalid = await fetch(`${baseUrl}/api/console/v1/marshal/councils`, {
    method: "POST", headers: postHeaders("console-admin", "00000000-0000-4000-8000-000000000003"),
    body: JSON.stringify({ ...body, context: { ...body.context, userEmail: "private@example.test" } }),
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json() as any).error.code, "INVALID_REQUEST");
});
