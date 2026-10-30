import assert from "node:assert/strict";
import test from "node:test";
import {
  ARMORER_CATALOG,
  ARMORER_CATALOG_IDS,
  getArmorerProduct,
} from "../../shared/armorer-catalog";
import { api } from "../../shared/routes";
import { getWarICategory, getWarIUseKind } from "../../shared/war-i";

test("catálogo da Forja tem IDs únicos, preços cobraveis e atributos persistíveis", () => {
  assert.equal(new Set(ARMORER_CATALOG_IDS).size, ARMORER_CATALOG.length);

  for (const product of ARMORER_CATALOG) {
    assert.equal(getArmorerProduct(product.id), product);
    assert.equal(api.items.purchase.input.safeParse({ catalogId: product.id }).success, true);
    assert.ok(Number.isSafeInteger(product.priceKrc) && product.priceKrc > 0, `${product.id} deve ter preço KRC válido`);
    assert.ok(Number.isSafeInteger(product.maxDurability) && product.maxDurability > 0, `${product.id} deve ter durabilidade máxima válida`);
    assert.ok(Object.keys(product.stats).length > 0, `${product.id} deve possuir atributos de gameplay`);
    assert.equal(getWarICategory(product.type), product.type === "ARMA" ? "ARMAMENTO" : product.type === "DEFESA" ? "DEFESA" : "BAG");

    if (product.type === "ARMA") assert.ok(product.stats.damage > 0 && product.stats.range > 0, `${product.id} deve funcionar no loadout de combate`);
    if (product.type === "DEFESA") assert.ok(product.stats.defense > 0, `${product.id} deve conceder defesa no loadout`);
    if (product.type === "CURATIVO") assert.equal(getWarIUseKind(product.type, product.stats), "HEAL");
    if (product.id === "granada-de-fragmentacao") assert.equal(getWarIUseKind(product.type, product.stats), "GRENADE");
    if (product.id === "mochila-tatica") assert.ok(product.stats.capacity > 0, "mochila deve aumentar capacidade do loadout");
  }
});

test("a compra não aceita IDs inexistentes nem atributos econômicos do cliente", () => {
  assert.equal(api.items.purchase.input.safeParse({ catalogId: "produto-inventado" }).success, false);
  assert.equal(api.items.purchase.input.safeParse({ catalogId: "rifle-de-plasma", priceKrc: 1 }).success, false);
  assert.equal(api.items.purchase.input.safeParse({ catalogId: "rifle-de-plasma", rarity: "MITICO", stats: { damage: 999 } }).success, false);
});
