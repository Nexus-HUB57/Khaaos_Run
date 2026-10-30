import assert from "node:assert/strict";
import { test } from "node:test";
import { biomechOf, bodyMass } from "../../shared/biomech.ts";
import { BODIES, assemble, bodyById } from "../../shared/body-geometry.ts";

test("biomecânica", async (t) => {
  await t.test("a massa fecha nos segmentos e o kit não muda", () => {
    for (const profile of BODIES) {
      const rig = assemble(profile);
      const read = biomechOf(rig, "sprint");
      const summed = read.segments.reduce((sum, segment) => sum + segment.mass * (segment.side === "pair" ? 2 : 1), 0);
      assert.equal(Math.abs(summed - read.mass) < 1e-6, true);
      assert.equal(read.kit, 8);
      assert.equal(read.total, read.mass + 8);
      assert.equal(read.comY > profile.stature * 0.45 && read.comY < profile.stature * 0.7, true);
    }
    assert.equal(bodyMass(assemble(bodyById("okada"))) < bodyMass(assemble(bodyById("hald"))), true);
  });

  await t.test("o sprint já é corrida e o joelho sobe para a mesma folga", () => {
    const short = biomechOf(assemble(bodyById("okada")), "sprint");
    const tall = biomechOf(assemble(bodyById("hald")), "sprint");
    const walk = biomechOf(assemble(bodyById("kane")), "walk");
    assert.equal(walk.froude < 0.5, true);
    assert.equal(walk.airborne, false);
    assert.equal(short.airborne, true);
    assert.equal(short.flight > 0, true);
    assert.equal(short.knee > tall.knee, true);
    assert.equal(short.turn180 > 0 && tall.turn180 > 0, true);
    assert.equal(short.grfBw, 2.8);
  });
});
