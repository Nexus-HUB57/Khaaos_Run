import assert from "node:assert/strict";
import test from "node:test";
import { api, buildUrl } from "../../shared/routes";
import { getWarICategory } from "../../shared/war-i";
import { deriveCombatLoadout } from "../../server/game/loadout";

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

test("match loadout uses the strongest durable weapon and equipped armor, ignoring unselected or broken items", () => {
  const item = (id: number, type: string, isEquipped: boolean, durability: string, stats: Record<string, number>) => ({
    id, type, isEquipped, durability, maxDurability: "100", stats,
  } as any);
  const loadout = deriveCombatLoadout([
    item(1, "ARMA", true, "80", { damage: 42 }),
    item(2, "ARMA", true, "100", { damage: 88, range: 30 }),
    item(3, "DEFESA", true, "60", { defense: 40 }),
    item(4, "DEFESA", true, "100", { defense: 20 }),
    item(5, "ARMA", false, "100", { damage: 200 }),
    item(6, "ARMA", true, "0", { damage: 200 }),
  ], 100);

  assert.deepEqual(loadout, {
    itemIds: [1, 2, 3, 4],
    equippedDamage: 88,
    equippedRange: 20,
    maxHealth: 115,
  });
});

test("match loadout falls back to starter combat stats and caps armor health at 200", () => {
  const item = { id: 7, type: "DEFESA", isEquipped: true, durability: "100", maxDurability: "100", stats: { defense: 500 } } as any;
  assert.deepEqual(deriveCombatLoadout([item], 180), {
    itemIds: [7], equippedDamage: 15, equippedRange: 8, maxHealth: 200,
  });
  assert.deepEqual(deriveCombatLoadout([], 100), {
    itemIds: [], equippedDamage: 15, equippedRange: 8, maxHealth: 100,
  });
});
