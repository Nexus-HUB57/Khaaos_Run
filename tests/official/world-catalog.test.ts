import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KHAAOS_WORLDS,
  WORLD_CANONICAL_IDS,
  WORLD_OPERATIONAL_IDS,
  WORLD_ORDER,
  WORLD_MATCH_DURATION_SECONDS,
  WORLD_MATCH_DURATION_SECONDS_BY_WORLD,
  WORLD_RING_CAPACITY_OPERATORS_BY_WORLD,
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

test("CIGKV usa 50 operadores e dura 3 horas; os demais rings mantêm 10 minutos", () => {
  assert.equal(WORLD_MATCH_DURATION_SECONDS, 600);
  for (const worldId of WORLD_ORDER) {
    const world = KHAAOS_WORLDS[worldId];
    const capacity = WORLD_RING_CAPACITY_OPERATORS_BY_WORLD[worldId];
    const durationSeconds = WORLD_MATCH_DURATION_SECONDS_BY_WORLD[worldId];
    assert.match(world.recommendedPlayers, new RegExp(`^${capacity} Operadores`));
    assert.equal(world.targetDurationMinutes, durationSeconds / 60);
    assert.equal(
      world.safeZonePhases.reduce((total, phase) => total + phase.durationSeconds, 0),
      durationSeconds,
      `${worldId}: fases do Ring devem somar a duração-alvo do mundo`,
    );
  }
  assert.equal(WORLD_RING_CAPACITY_OPERATORS_BY_WORLD.CIGKV, 50);
  assert.equal(WORLD_MATCH_DURATION_SECONDS_BY_WORLD.CIGKV, 10_800);
});
