import assert from "node:assert/strict";
import { test } from "node:test";
import { canUseItemOutsideMatch, getWarIUseKind } from "../../shared/war-i.ts";

test("UI só oferece uso legado fora do match para curativo com cura válida", () => {
  assert.equal(canUseItemOutsideMatch("CURATIVO", { heal: 25 }), true);
  assert.equal(canUseItemOutsideMatch("CURATIVO", { heal: 0 }), false);
  assert.equal(canUseItemOutsideMatch("CURATIVO", { speed: 20 }), false);
  assert.equal(canUseItemOutsideMatch("UTILIDADE", { damage: 30, radius: 5 }), false);
  assert.equal(canUseItemOutsideMatch("UTILIDADE", { vision: 20 }), false);
  assert.equal(canUseItemOutsideMatch("RECURSO", { heal: 20 }), false);
});

test("consumíveis de combate continuam classificados para a interface da Zona", () => {
  assert.equal(getWarIUseKind("CURATIVO", { heal: 25 }), "HEAL");
  assert.equal(getWarIUseKind("UTILIDADE", { damage: 30, radius: 5 }), "GRENADE");
  assert.equal(getWarIUseKind("UTILIDADE", { vision: 20 }), "RECON");
});
