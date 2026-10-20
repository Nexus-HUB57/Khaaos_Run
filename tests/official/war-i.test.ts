import assert from "node:assert/strict";
import test from "node:test";
import { api, buildUrl } from "../../shared/routes";
import { getWarICategory } from "../../shared/war-i";

test("War’I classifies combat gear, protection, and supplies into the documented compartments", () => {
  assert.equal(getWarICategory("ARMA"), "ARMAMENTO");
  assert.equal(getWarICategory("DEFESA"), "DEFESA");
  assert.equal(getWarICategory("CURATIVO"), "BAG");
  assert.equal(getWarICategory("UTILIDADE"), "BAG");
  assert.equal(getWarICategory("RECURSO"), "BAG");
});

test("unknown future item types safely appear in the Bag compartment", () => {
  assert.equal(getWarICategory("NOVO_TIPO"), "BAG");
});

test("PackBack contract accepts explicit equip/unequip flags and builds the item URL", () => {
  assert.deepEqual(api.items.equip.input.parse({ isEquipped: true }), { isEquipped: true });
  assert.deepEqual(api.items.equip.input.parse({ isEquipped: false }), { isEquipped: false });
  assert.equal(api.items.equip.input.safeParse({ isEquipped: "true" }).success, false);
  assert.equal(buildUrl(api.items.equip.path, { id: 42 }), "/api/items/42/equip");
});
