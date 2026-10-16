import assert from "node:assert/strict";
import { test } from "node:test";
import { isOutsideSafeZone, zoneEllipseRadii } from "../../client/src/lib/safe-zone-geometry.ts";

test("SafeZone usa as mesmas unidades de mapa para dentro, borda e fora", () => {
  assert.equal(isOutsideSafeZone(50, 50, 50, 50, 20), false, "centro fica dentro");
  assert.equal(isOutsideSafeZone(70, 50, 50, 50, 20), false, "borda exata é segura, como no servidor");
  assert.equal(isOutsideSafeZone(70.01, 50, 50, 50, 20), true, "fora da borda causa estado de perigo");
  assert.equal(isOutsideSafeZone(50, 75, 50, 50, 20), true, "distância diagonal usa Euclidiana em percentuais");
});

test("raio percentual preserva unidades do mapa em canvas 4:3", () => {
  assert.deepEqual(zoneEllipseRadii(50, 640, 480), { x: 320, y: 240 });
  assert.deepEqual(zoneEllipseRadii(-10, 640, 480), { x: 0, y: 0 });
});
