import assert from "node:assert/strict";
import { test } from "node:test";
import { SPECIAL_CLASS } from "../../shared/special-class.ts";

test("classe especial: três placas, origens distintas, fora da tabela de alistamento", () => {
  assert.deepEqual(
    SPECIAL_CLASS.map((figure) => figure.id),
    ["henricks", "krapulla", "uryan"],
  );
  assert.equal(new Set(SPECIAL_CLASS.map((figure) => figure.origin)).size, 3);
  assert.equal(SPECIAL_CLASS.filter((figure) => figure.sexLabel === "Feminino").length, 1);
  assert.equal(SPECIAL_CLASS[2].portrait, "/agents/uryan.jpg");
});
