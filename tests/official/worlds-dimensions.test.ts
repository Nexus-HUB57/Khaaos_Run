import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KHAAOS_WORLDS,
  WORLD_ORDER,
  WORLD_RING_DIMENSIONS,
  WORLD_RING_DIMENSIONS_LIST,
  WORLD_RING_CAPACITY_OPERATORS,
  toOperationalWorldId,
  type WorldId,
} from "../../shared/worlds.ts";

/* Paridade do contrato de dimensões canônicas dos rings (roadmap T1.1 port +
 * groundwork T3.3). Divergência de qualquer invariante = falha. */

const EXPECTED = [
  { id: "CIGKV", area: 16_000, w: 160, d: 100, perim: 520, density: 160, shape: "fortified_rectangle", op: "CIGKV" },
  { id: "Barburhen", area: 19_000, w: 190, d: 100, perim: 580, density: 190, shape: "urban_gridiron", op: "W1" },
  { id: "Priadus", area: 22_000, w: 220, d: 100, perim: 640, density: 220, shape: "organic_blob", op: "W2" },
  { id: "Ckesalth", area: 25_000, w: 250, d: 100, perim: 700, density: 250, shape: "desert_basin", op: "W3" },
  { id: "Arukheea", area: 18_000, w: 180, d: 100, perim: 560, density: 180, shape: "coastal_island", op: "W4" },
] as const;

test("contrato de dimensões cobre exatamente os 5 mundos canônicos", () => {
  assert.deepEqual(
    Object.keys(WORLD_RING_DIMENSIONS).sort(),
    Object.keys(KHAAOS_WORLDS).sort(),
  );
  assert.equal(WORLD_ORDER.length, 5);
  assert.equal(WORLD_RING_DIMENSIONS_LIST.length, 5);
});

for (const expected of EXPECTED) {
  test(`dimensões canônicas ${expected.id} (${expected.shape})`, () => {
    const dims = WORLD_RING_DIMENSIONS[expected.id as WorldId];
    assert.equal(dims.areaM2, expected.area);
    assert.equal(dims.boundingBoxM.widthM, expected.w);
    assert.equal(dims.boundingBoxM.depthM, expected.d);
    assert.equal(dims.perimeterM, expected.perim);
    assert.equal(dims.densityM2PerOperator, expected.density);
    assert.equal(dims.shape, expected.shape);
    assert.equal(dims.operatorCapacity, WORLD_RING_CAPACITY_OPERATORS);
    assert.equal(toOperationalWorldId(dims.worldId), expected.op);
  });
}

test("invariantes de paridade: área = w×d, perímetro = 2(w+d), densidade = área/100", () => {
  for (const dims of WORLD_RING_DIMENSIONS_LIST) {
    const { widthM, depthM } = dims.boundingBoxM;
    assert.equal(
      dims.areaM2,
      widthM * depthM,
      `${dims.worldId}: areaM2 deve ser widthM × depthM`,
    );
    assert.equal(
      dims.perimeterM,
      2 * (widthM + depthM),
      `${dims.worldId}: perimeterM deve ser 2 × (widthM + depthM)`,
    );
    assert.equal(
      dims.densityM2PerOperator,
      dims.areaM2 / dims.operatorCapacity,
      `${dims.worldId}: densidade deve ser areaM2 / operatorCapacity`,
    );
    assert.equal(dims.operatorCapacity, 100, "capacidade canônica: 100 operadores/ring");
  }
});

test("faixa canônica do Descentralizador: 15.000–25.000 m² e 150–250 m²/jogador", () => {
  for (const dims of WORLD_RING_DIMENSIONS_LIST) {
    assert.ok(
      dims.areaM2 >= 15_000 && dims.areaM2 <= 25_000,
      `${dims.worldId}: área fora da faixa canônica`,
    );
    assert.ok(
      dims.densityM2PerOperator >= 150 && dims.densityM2PerOperator <= 250,
      `${dims.worldId}: densidade fora da faixa canônica`,
    );
  }
});

test("listagem ordenada preserva a ordem CIGKV → W4", () => {
  assert.deepEqual(
    WORLD_RING_DIMENSIONS_LIST.map((d) => d.worldId),
    ["CIGKV", "Barburhen", "Priadus", "Ckesalth", "Arukheea"],
  );
  assert.deepEqual(
    WORLD_RING_DIMENSIONS_LIST.map((d) => d.operationalId),
    ["CIGKV", "W1", "W2", "W3", "W4"],
  );
});
