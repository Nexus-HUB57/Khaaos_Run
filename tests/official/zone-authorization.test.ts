import assert from "node:assert/strict";
import { test } from "node:test";

const { isZoneOperator } = await import("../../server/game/zoneAuthorization.ts");

test("zona: nega controle quando nenhuma allowlist está configurada", () => {
  assert.equal(isZoneOperator("user-1", ""), false);
});

test("zona: aceita apenas IDs explicitamente listados", () => {
  assert.equal(isZoneOperator("user-2", "user-1, user-2\nuser-3"), true);
  assert.equal(isZoneOperator("user-4", "user-1, user-2\nuser-3"), false);
});
