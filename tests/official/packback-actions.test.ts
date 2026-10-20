import assert from "node:assert/strict";
import test from "node:test";
import { getWarIUseKind } from "../../shared/war-i";
import { planPackBackAction } from "../../server/game/packback-actions";

function makeItem(type: string, stats: Record<string, number>) {
  return { type, stats } as any;
}

test("War’I plans bounded healing from the selected item's server stats", () => {
  const item = makeItem("CURATIVO", { heal: 50, speed: 20 });
  assert.equal(getWarIUseKind(item.type, item.stats), "HEAL");
  assert.deepEqual(planPackBackAction(item, 60, 100), {
    kind: "HEAL", amount: 40, speedMultiplier: 1.2, speedDurationMs: 10_000,
  });
  assert.deepEqual(planPackBackAction(item, 100, 100), {
    kind: "HEAL", amount: 0, speedMultiplier: 1.2, speedDurationMs: 10_000,
  });
  assert.deepEqual(planPackBackAction(makeItem("CURATIVO", { heal: 50 }), 100, 100), {
    kind: "UNAVAILABLE", reason: "Sua vitalidade já está cheia.",
  });
});

test("War’I plans a grenade with damage and radius capped by server rules", () => {
  const item = makeItem("UTILIDADE", { damage: 500, radius: 50 });
  assert.equal(getWarIUseKind(item.type, item.stats), "GRENADE");
  assert.deepEqual(planPackBackAction(item, 100, 100), {
    kind: "GRENADE", damage: 200, radius: 20,
  });
});

test("War’I plans reconnaissance and leaves passive capacity utilities unconsumed", () => {
  const drone = makeItem("UTILIDADE", { vision: 80 });
  assert.equal(getWarIUseKind(drone.type, drone.stats), "RECON");
  assert.deepEqual(planPackBackAction(drone, 100, 100), { kind: "RECON", radius: 80 });

  const backpack = makeItem("UTILIDADE", { capacity: 20 });
  assert.equal(getWarIUseKind(backpack.type, backpack.stats), null);
  assert.equal(planPackBackAction(backpack, 100, 100).kind, "UNAVAILABLE");
});
