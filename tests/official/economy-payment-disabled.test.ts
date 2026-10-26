import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
const { EconomyService } = await import("../../server/game/economyService");

test("EconomyService não expõe operação de depósito que credite KRC por montante do cliente", () => {
  assert.equal(Object.hasOwn(EconomyService.prototype, "deposit"), false);
});
