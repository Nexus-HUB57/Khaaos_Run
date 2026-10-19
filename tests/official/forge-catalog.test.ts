import assert from "node:assert/strict";
import test from "node:test";
import { api } from "../../shared/routes";
import { FORGE_CATALOG, getForgeCatalog, getForgeCatalogItem } from "../../server/game/forgeCatalog";

test("catálogo da Forja tem IDs únicos e campos válidos para o contrato HTTP", () => {
  const ids = FORGE_CATALOG.map((item) => item.catalogId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(FORGE_CATALOG.length, 8);
  assert.deepEqual(api.forge.catalog.responses[200].parse(getForgeCatalog()), FORGE_CATALOG);
  for (const item of FORGE_CATALOG) {
    assert.match(item.catalogId, /^[a-z][a-z0-9_]{1,63}$/);
    assert.ok(Number.isSafeInteger(item.priceKrc) && item.priceKrc > 0);
    assert.ok(item.name.trim().length > 0);
    assert.ok(item.description.trim().length > 0);
  }
});

test("resolução de SKU devolve cópia e não permite SKU desconhecido", () => {
  const original = getForgeCatalogItem("nano_blade");
  assert.equal(original?.priceKrc, 500);
  if (original) original.priceKrc = 1;
  assert.equal(getForgeCatalogItem("nano_blade")?.priceKrc, 500);
  assert.equal(getForgeCatalogItem("invented_item"), undefined);
});
