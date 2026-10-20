import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";

const { isAuthenticated } = await import("../../server/replit_integrations/auth/replitAuth.ts");

function responseRecorder() {
  const response: { statusCode?: number; body?: unknown } = {};
  return {
    response,
    status(code: number) {
      response.statusCode = code;
      return this;
    },
    json(body: unknown) {
      response.body = body;
      return this;
    },
  };
}

test("auth: sessão autenticada e não expirada segue para o handler", async () => {
  const req = {
    isAuthenticated: () => true,
    user: { expires_at: Math.floor(Date.now() / 1000) + 60 },
  };
  const res = responseRecorder();
  let nextCalls = 0;

  await isAuthenticated(req as never, res as never, (() => { nextCalls += 1; }) as never);

  assert.equal(nextCalls, 1);
  assert.equal(res.response.statusCode, undefined);
});

test("auth: sessão ausente responde 401", async () => {
  const req = { isAuthenticated: () => false, user: undefined };
  const res = responseRecorder();
  let nextCalls = 0;

  await isAuthenticated(req as never, res as never, (() => { nextCalls += 1; }) as never);

  assert.equal(res.response.statusCode, 401);
  assert.deepEqual(res.response.body, { message: "Unauthorized" });
  assert.equal(nextCalls, 0);
});

test("auth: sessão expirada sem refresh token responde 401", async () => {
  const req = {
    isAuthenticated: () => true,
    user: { expires_at: Math.floor(Date.now() / 1000) - 60 },
  };
  const res = responseRecorder();
  let nextCalls = 0;

  await isAuthenticated(req as never, res as never, (() => { nextCalls += 1; }) as never);

  assert.equal(res.response.statusCode, 401);
  assert.deepEqual(res.response.body, { message: "Unauthorized" });
  assert.equal(nextCalls, 0);
});
