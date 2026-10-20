import assert from "node:assert/strict";
import test from "node:test";
import type { Item } from "../../shared/schema";
import { deriveCombatLoadout, getLootWeight } from "../../server/game/loadout";

function item(id: number, type: string, isEquipped: boolean, durability: string, stats: Record<string, number>): Item {
  return {
    id, type, isEquipped, durability, maxDurability: "100", stats,
  } as unknown as Item;
}

test("match-start snapshot includes only selected, durable items and applies weapon/armor stats", () => {
  const snapshot = deriveCombatLoadout([
    item(11, "ARMA", true, "75", { damage: 42 }),
    item(12, "ARMA", true, "100", { damage: 88, range: 25 }),
    item(13, "DEFESA", true, "60", { defense: 40 }),
    item(14, "DEFESA", true, "100", { defense: 20 }),
    item(15, "ARMA", false, "100", { damage: 200 }),
    item(16, "ARMA", true, "0", { damage: 200 }),
  ], 100);

  assert.deepEqual(snapshot, {
    itemIds: [11, 12, 13, 14],
    equippedDamage: 88,
    equippedRange: 20,
    maxHealth: 115,
    carryCapacity: 50,
  });
});

test("match-start snapshot uses starter values when no durable items are equipped and caps health", () => {
  assert.deepEqual(deriveCombatLoadout([], 100), {
    itemIds: [], equippedDamage: 15, equippedRange: 8, maxHealth: 100, carryCapacity: 50,
  });
  assert.deepEqual(deriveCombatLoadout([
    item(17, "DEFESA", true, "100", { defense: 500 }),
  ], 180), {
    itemIds: [17], equippedDamage: 15, equippedRange: 8, maxHealth: 200, carryCapacity: 50,
  });
});

test("match-start applies selected durable backpack capacity with a hard cap", () => {
  assert.equal(deriveCombatLoadout([
    item(21, "UTILIDADE", true, "100", { capacity: 20 }),
    item(22, "UTILIDADE", true, "100", { capacity: 200 }),
    item(23, "UTILIDADE", false, "100", { capacity: 100 }),
    item(24, "UTILIDADE", true, "0", { capacity: 100 }),
  ], 100).carryCapacity, 150);
  assert.equal(deriveCombatLoadout([
    item(25, "UTILIDADE", true, "100", { capacity: 20 }),
  ], 100).carryCapacity, 70);
});

test("loot weight uses category defaults and bounded explicit item weight", () => {
  assert.equal(getLootWeight("ARMA"), 25);
  assert.equal(getLootWeight("CURATIVO"), 5);
  assert.equal(getLootWeight("UTILIDADE", { weight: 120 }), 100);
  assert.equal(getLootWeight("RECURSO", { weight: -5 }), 5);
});
