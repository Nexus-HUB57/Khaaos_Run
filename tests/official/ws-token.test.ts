import assert from "node:assert/strict";
import { test } from "node:test";

process.env.WS_TOKEN_SECRET = "official-websocket-token-test-secret-with-32-bytes";
const { createWsAccessToken, verifyWsAccessToken } = await import("../../server/replit_integrations/auth/ws-token.ts");

const NOW = 1_800_000_000;

test("token WS: aceita token assinado dentro da validade", () => {
  const { token, expiresAt } = createWsAccessToken("user-42", NOW);
  assert.equal(expiresAt, NOW + 60);
  assert.equal(verifyWsAccessToken(token, NOW), "user-42");
});

test("token WS: rejeita token expirado, adulterado ou malformado", () => {
  const { token } = createWsAccessToken("user-42", NOW);
  const [payload, signature] = token.split(".");
  assert.equal(verifyWsAccessToken(token, NOW + 60), null);
  // Adulteração robusta: flipar o PRIMEIRO char sempre muda os bytes decodificados.
  // (flipar só o último era flaky ~1/64: quando o último char já era 'x', o
  // token "adulterado" era idêntico ao original e a assinatura passava.)
  const tamperedSignature = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
  assert.equal(verifyWsAccessToken(`${payload}.${tamperedSignature}`, NOW), null);
  assert.equal(verifyWsAccessToken("not-a-token", NOW), null);
});

test("token WS: assinatura não pode autorizar outro subject", () => {
  const { token } = createWsAccessToken("user-42", NOW);
  const [encodedPayload, signature] = token.split(".");
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  payload.sub = "user-admin";
  const forgedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  assert.equal(verifyWsAccessToken(`${forgedPayload}.${signature}`, NOW), null);
});
