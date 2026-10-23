import assert from "node:assert/strict";
import { test } from "node:test";
import { FIGURES, figureById, figureSrc, isFigureId } from "../../shared/figures.ts";

test("figuras: três masculinos, três femininos, sem bônus de origem", () => {
  assert.equal(FIGURES.filter((figure) => figure.sex === "m").length, 3);
  assert.equal(FIGURES.filter((figure) => figure.sex === "f").length, 3);
  assert.equal(new Set(FIGURES.map((figure) => figure.origin)).size, 6);
  assert.equal(new Set(FIGURES.map((figure) => figure.mark)).size, 6);
  assert.equal(FIGURES.filter((figure) => figure.render === "placa").length, 6);
  assert.equal(figureSrc("puri"), "/figures/puri.jpg");
  assert.equal(figureById("okonkwo").sex, "f");
  assert.equal(figureSrc("kane"), "/figures/kane.jpg");
  assert.equal(isFigureId("hald") && !isFigureId("m"), true);
});
