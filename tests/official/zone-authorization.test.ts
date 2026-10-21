import assert from "node:assert/strict";
import { test } from "node:test";

const { isZoneOperator, createZoneOperatorGuard } = await import("../../server/game/zoneAuthorization.ts");

test("zona: nega controle quando nenhuma allowlist está configurada", () => {
  assert.equal(isZoneOperator("user-1", ""), false);
});

test("zona: aceita apenas IDs explicitamente listados", () => {
  assert.equal(isZoneOperator("user-2", "user-1, user-2\nuser-3"), true);
  assert.equal(isZoneOperator("user-4", "user-1, user-2\nuser-3"), false);
});

function responseRecorder() {
  const response: { statusCode?: number; body?: unknown } = {};
  return {
    response,
    status(code: number) { response.statusCode = code; return this; },
    json(body: unknown) { response.body = body; return this; },
  };
}

test("zona: middleware distingue 401, 403 e operador permitido sem confiar no payload", () => {
  const guard = createZoneOperatorGuard("operator-1");
  const unauthenticated = responseRecorder();
  let nextCalls = 0;
  guard({ isAuthenticated: () => false }, unauthenticated as any, () => { nextCalls += 1; });
  assert.equal(unauthenticated.response.statusCode, 401);

  const ordinaryUser = responseRecorder();
  guard({ isAuthenticated: () => true, user: { claims: { sub: "player-1" } }, body: { role: "operator" } }, ordinaryUser as any, () => { nextCalls += 1; });
  assert.equal(ordinaryUser.response.statusCode, 403);

  const operator = responseRecorder();
  guard({ isAuthenticated: () => true, user: { claims: { sub: "operator-1" } } }, operator as any, () => { nextCalls += 1; });
  assert.equal(operator.response.statusCode, undefined);
  assert.equal(nextCalls, 1);
});
