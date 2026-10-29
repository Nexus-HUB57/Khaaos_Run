import assert from "node:assert/strict";
import { test } from "node:test";
import { BODIES, assemble, bodyById, classify, footPhase, gaitOf, probeMeters } from "../../shared/body-geometry.ts";

test("geometria", async (t) => {
  await t.test("a estatura muda a silhueta e não inventa bônus", () => {
    const kane = assemble(BODIES[0]);
    const okada = assemble(BODIES[3]);
    assert.equal(kane.profile.stature > okada.profile.stature, true);
    assert.equal(classify("head").statute, "headshot");
    assert.equal(classify("torso").statute, "corpo");
    assert.equal(classify("limb").statute, "corpo");
    assert.equal(kane.capsuleHalfHeight + kane.capsuleRadius, kane.profile.stature / 2);
  });

  await t.test("a cabeça é o único volume de headshot e o chão não corta o pé", () => {
    for (const profile of BODIES) {
      const rig = assemble(profile);
      const heads = rig.volumes.filter((volume) => volume.zone === "head");
      assert.equal(heads.length, 1);
      const hit = probeMeters(rig.volumes, "front", 0, rig.eyeY);
      assert.equal(hit?.zone, "head");
      const low = Math.min(...rig.volumes.map((volume) => Math.min(volume.a.y, volume.b.y) - volume.r));
      assert.equal(low >= -0.02, true);
      assert.equal(probeMeters(rig.volumes, "front", 3, 3), null);
    }
  });

  await t.test("o passo segue a perna e o slide usa o mesmo atrito", () => {
    const short = gaitOf(assemble(bodyById("okada")));
    const tall = gaitOf(assemble(bodyById("hald")));
    assert.equal(short.gears.sprint.speed < tall.gears.sprint.speed, true);
    assert.equal(short.gears.sprint.cadence > tall.gears.sprint.cadence, true);
    const ref = gaitOf(assemble({ id: "kane", name: "Referência", stature: 1.78, shoulder: 0.44, head: 0.23 }));
    const sprint = 4.6 * 1.55 * 0.425 * 1.78;
    assert.equal(Math.abs(ref.gears.sprint.speed - sprint) < 1e-9, true);
    assert.equal(Math.abs(ref.slide - (sprint * sprint) / (2 * 0.62 * 9.81)) < 1e-9, true);
    assert.equal(ref.vault, 0.47 * 1.78);
    const phase = footPhase(1, 0.5);
    assert.equal(phase.swing, 0);
    assert.equal(phase.stance, -0.5);
  });
});
