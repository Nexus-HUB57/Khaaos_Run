import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KHAAOS_WORLDS,
  WORLD_CANONICAL_IDS,
  WORLD_OPERATIONAL_IDS,
  WORLD_ORDER,
  toCanonicalWorldId,
  toOperationalWorldId,
} from "../../shared/worlds.ts";
import { WORLD_CATALOG } from "../../server/game/worldTelemetry.ts";

test("catálogo canônico cobre os cinco Mundos em ordem e com ponte operacional", () => {
  assert.deepEqual(WORLD_ORDER, ["CIGKV", "Barburhen", "Priadus", "Ckesalth", "Arukheea"]);
  for (const [index, worldId] of WORLD_ORDER.entries()) {
    assert.equal(KHAAOS_WORLDS[worldId].order, index);
    const operationalId = toOperationalWorldId(worldId);
    assert.equal(toCanonicalWorldId(operationalId), worldId);
    assert.equal(WORLD_CANONICAL_IDS[operationalId], worldId);
    assert.equal(WORLD_OPERATIONAL_IDS[worldId], operationalId);
    assert.equal(WORLD_CATALOG[operationalId].name, KHAAOS_WORLDS[worldId].name);
  }
});

test("cada Mundo possui ameaça, POI e terminal ZEX para o Atlas e runtime", () => {
  for (const worldId of WORLD_ORDER) {
    const world = KHAAOS_WORLDS[worldId];
    assert.ok(world.hazard.name.length > 0);
    assert.ok(world.pois.length >= 3);
    assert.ok(world.zexNodes.length >= 3);
    assert.ok(world.safeZonePhases.length >= 3);
  }
});
