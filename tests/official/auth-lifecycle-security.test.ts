import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.WS_TOKEN_SECRET_CURRENT = "current-key-for-issue-54-tests-0123456789";
process.env.WS_TOKEN_SECRET_PREVIOUS = "previous-key-for-issue-54-tests-012345678";
process.env.PUBLIC_ORIGIN = "https://khaaos.example.test";

const [{ createWsAccessToken, verifyWsAccessTokenDetails, consumeWsAccessToken }, { distributedState }, { isAllowedOrigin }, { getSigningKeys }] = await Promise.all([
  import("../../server/replit_integrations/auth/ws-token.ts"),
  import("../../server/game/DistributedState.ts"),
  import("../../server/replit_integrations/auth/origin.ts"),
  import("../../server/replit_integrations/auth/keyring.ts"),
]);

test("WS token carries jti/kid and rejects replay after atomic consumption", async () => {
  const first = createWsAccessToken(`security-replay-${Date.now()}`);
  const details = verifyWsAccessTokenDetails(first.token);
  assert.equal(details?.kid, "current");
  assert.ok(details?.jti);
  assert.equal((await consumeWsAccessToken(first.token, "https://khaaos.example.test"))?.jti, details?.jti);
  assert.equal(await consumeWsAccessToken(first.token, "https://khaaos.example.test"), null);
});

test("logout revocation blocks old sessions and WS tickets but permits a fresh login", async () => {
  const userId = `security-revoked-${Date.now()}`;
  const oldAuthenticatedAt = Date.now() - 1_000;
  await distributedState.revokeUser(userId, 60_000);
  assert.equal(await distributedState.isUserRevoked(userId, oldAuthenticatedAt), true);

  const oldToken = createWsAccessToken(userId, undefined, undefined, oldAuthenticatedAt);
  assert.equal(await consumeWsAccessToken(oldToken.token, "https://khaaos.example.test"), null);

  const revokedAt = Date.now();
  assert.equal(await distributedState.isUserRevoked(userId, revokedAt + 1), false, "uma nova autenticação recebe timestamp posterior ao logout");
  const newToken = createWsAccessToken(userId, undefined, undefined, revokedAt + 1);
  assert.equal((await consumeWsAccessToken(newToken.token, "https://khaaos.example.test"))?.sub, userId);
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

test("previous signing key is accepted only during its explicit grace window", () => {
  const now = Math.floor(Date.now() / 1000);
  process.env.WS_TOKEN_SECRET_PREVIOUS_VALID_UNTIL = String(now + 60);
  assert.equal(getSigningKeys("WS_TOKEN_SECRET", now).length, 2);
  process.env.WS_TOKEN_SECRET_PREVIOUS_VALID_UNTIL = String(now - 1);
  assert.equal(getSigningKeys("WS_TOKEN_SECRET", now).length, 1);
  delete process.env.WS_TOKEN_SECRET_PREVIOUS_VALID_UNTIL;
});
