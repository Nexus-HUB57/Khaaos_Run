import assert from "node:assert/strict";
import { test } from "node:test";
import { BODIES, assemble, classify, probeMeters } from "../../shared/body-geometry.ts";

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
});
