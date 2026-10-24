import assert from "node:assert/strict";
import test from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
const {
  generateIdentityLinkCode,
  hashIdentityLinkCode,
  verifyEosConnectIdToken,
} = await import("../../server/game/identityLinkService");

const config = {
  issuer: "https://api.epicgames.dev/auth/v1",
  clientId: "test-connect-client",
  productId: "test-product",
  sandboxId: "test-sandbox",
  deploymentId: "test-deployment",
};

for (const [name, value] of Object.entries({
  EOS_CONNECT_ISSUER: config.issuer,
  EOS_CONNECT_CLIENT_ID: config.clientId,
  EOS_PRODUCT_ID: config.productId,
  EOS_SANDBOX_ID: config.sandboxId,
  EOS_DEPLOYMENT_ID: config.deploymentId,
})) process.env[name] = value;

test("EOS Connect identity is accepted only after signature and product claims verify", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const keyResolver = createLocalJWKSet({ keys: [{ ...jwk, kid: "identity-test-key", alg: "RS256", use: "sig" }] });

  const sign = (overrides: Record<string, unknown> = {}, options: { audience?: string; issuedAt?: number } = {}) => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return new SignJWT({
      pfpid: config.productId,
      pfsid: config.sandboxId,
      pfdid: config.deploymentId,
      ...overrides,
    })
      .setProtectedHeader({ alg: "RS256", kid: "identity-test-key", typ: "JWT" })
      .setIssuer(config.issuer)
      .setAudience(options.audience ?? config.clientId)
      .setSubject("PUID_1234567890")
      .setIssuedAt(options.issuedAt ?? nowSeconds)
      .setExpirationTime(nowSeconds + 120)
      .sign(privateKey);
  };

  const validToken = await sign();
  assert.deepEqual(await verifyEosConnectIdToken(validToken, keyResolver), {
    productUserId: "PUID_1234567890",
    productId: config.productId,
    sandboxId: config.sandboxId,
    deploymentId: config.deploymentId,
  });

  await assert.rejects(
    verifyEosConnectIdToken(await sign({}, { audience: "another-client" }), keyResolver),
    /ID token EOS Connect inválido/,
  );
  await assert.rejects(
    verifyEosConnectIdToken(await sign({ pfpid: "another-product" }), keyResolver),
    /outro produto, sandbox ou deployment/,
  );
  await assert.rejects(
    verifyEosConnectIdToken(await sign({}, { issuedAt: Math.floor(Date.now() / 1000) - 360 }), keyResolver),
    /ID token EOS Connect inválido/,
  );
});

test("challenge de vinculação tem 256 bits aleatórios e só seu SHA-256 pode ser persistido", () => {
  const code = generateIdentityLinkCode();
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(generateIdentityLinkCode(), code);
  assert.match(hashIdentityLinkCode(code), /^[a-f0-9]{64}$/);
  assert.equal(hashIdentityLinkCode(code), hashIdentityLinkCode(code));
  assert.notEqual(hashIdentityLinkCode(code), code);
});
