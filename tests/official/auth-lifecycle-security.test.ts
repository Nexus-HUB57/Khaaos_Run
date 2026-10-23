import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.WS_TOKEN_SECRET_CURRENT = "current-key-for-issue-54-tests-0123456789";
process.env.WS_TOKEN_SECRET_PREVIOUS = "previous-key-for-issue-54-tests-012345678";
process.env.PUBLIC_ORIGIN = "https://khaaos.example.test";

const [{ createWsAccessToken, verifyWsAccessTokenDetails, consumeWsAccessToken }, { distributedState }, { isAllowedOrigin }] = await Promise.all([
  import("../../server/replit_integrations/auth/ws-token.ts"),
  import("../../server/game/DistributedState.ts"),
  import("../../server/replit_integrations/auth/origin.ts"),
]);

test("WS token carries jti/kid and rejects replay after atomic consumption", async () => {
  const first = createWsAccessToken(`security-replay-${Date.now()}`);
  const details = verifyWsAccessTokenDetails(first.token);
  assert.equal(details?.kid, "current");
  assert.ok(details?.jti);
  assert.equal((await consumeWsAccessToken(first.token, "https://khaaos.example.test"))?.jti, details?.jti);
  assert.equal(await consumeWsAccessToken(first.token, "https://khaaos.example.test"), null);
});

test("revoked identity cannot consume a newly issued WS ticket", async () => {
  const userId = `security-revoked-${Date.now()}`;
  await distributedState.revokeUser(userId, 60_000);
  const token = createWsAccessToken(userId);
  assert.equal(await consumeWsAccessToken(token.token, "https://khaaos.example.test"), null);
});

test("Origin allowlist rejects attacker origins and permits the configured origin", () => {
  assert.equal(isAllowedOrigin("https://khaaos.example.test"), true);
  assert.equal(isAllowedOrigin("https://attacker.example"), false);
  assert.equal(isAllowedOrigin(undefined), true, "non-production tests may omit browser Origin");
});

test("rate limit counters are shared by the distributed-state contract", async () => {
  const key = `security-rate-${Date.now()}`;
  assert.equal((await distributedState.rateLimit(key, 2, 10_000)).allowed, true);
  assert.equal((await distributedState.rateLimit(key, 2, 10_000)).allowed, true);
  const blocked = await distributedState.rateLimit(key, 2, 10_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
});
