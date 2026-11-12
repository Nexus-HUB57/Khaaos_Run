import assert from "node:assert/strict";
import test from "node:test";
import {
  ARMORER_CATALOG,
  ARMORER_CATALOG_IDS,
  ARMORER_MATERIALS,
  getArmorerMaterialByCode,
  getArmorerProduct,
} from "../../shared/armorer-catalog";
import { api } from "../../shared/routes";
import { LOOT_PRESETS } from "../../shared/schema";
import { getWarICategory, getWarIUseKind } from "../../shared/war-i";

const materialById = new Map(ARMORER_MATERIALS.map((material) => [material.id, material]));

test("cada produto da Forja possui receita executável, fee positiva e atributos compatíveis com War’I", () => {
  assert.equal(new Set(ARMORER_CATALOG_IDS).size, ARMORER_CATALOG.length);
  assert.equal(new Set(ARMORER_MATERIALS.map(({ id }) => id)).size, ARMORER_MATERIALS.length);

  for (const product of ARMORER_CATALOG) {
    assert.equal(getArmorerProduct(product.id), product);
    assert.equal(api.items.craft.input.safeParse({ catalogId: product.id }).success, true);
    assert.ok(Number.isSafeInteger(product.armorerFeeKrc) && product.armorerFeeKrc > 0, `${product.id} deve cobrar serviço em KRC`);
    assert.ok(Number.isSafeInteger(product.maxDurability) && product.maxDurability > 0, `${product.id} deve ter durabilidade máxima válida`);
    assert.ok(Object.keys(product.stats).length > 0, `${product.id} deve possuir atributos de gameplay`);
    assert.ok(product.recipe.length > 0, `${product.id} deve consumir ingredientes`);
    assert.equal(new Set(product.recipe.map(({ materialId }) => materialId)).size, product.recipe.length, `${product.id} não deve repetir ingredientes`);
    for (const ingredient of product.recipe) {
      assert.ok(materialById.has(ingredient.materialId), `${product.id}: material ${ingredient.materialId} precisa existir`);
      assert.ok(Number.isSafeInteger(ingredient.quantity) && ingredient.quantity > 0, `${product.id}: quantidade precisa ser positiva`);
    }
    assert.equal(getWarICategory(product.type), product.type === "ARMA" ? "ARMAMENTO" : product.type === "DEFESA" ? "DEFESA" : "BAG");

    if (product.type === "ARMA") assert.ok(product.stats.damage > 0 && product.stats.range > 0, `${product.id} deve funcionar no loadout de combate`);
    if (product.type === "DEFESA") assert.ok(product.stats.defense > 0, `${product.id} deve conceder defesa no loadout`);
    if (product.type === "CURATIVO") assert.equal(getWarIUseKind(product.type, product.stats), "HEAL");
    if (product.id === "granada-de-fragmentacao") assert.equal(getWarIUseKind(product.type, product.stats), "GRENADE");
    if (product.id === "mochila-tatica") assert.ok(product.stats.capacity > 0, "mochila deve aumentar capacidade do loadout");
  }
});

test("raridade mais alta exige serviço mais caro e componente raro/épico nas receitas", () => {
  const byRarity = (rarity: string) => ARMORER_CATALOG.filter((product) => product.rarity === rarity);
  const common = byRarity("COMUM");
  const rare = byRarity("RARO");
  const epic = byRarity("EPICO");
  assert.ok(Math.min(...rare.map((product) => product.armorerFeeKrc)) > Math.max(...common.map((product) => product.armorerFeeKrc)));
  assert.ok(Math.min(...epic.map((product) => product.armorerFeeKrc)) > Math.max(...rare.map((product) => product.armorerFeeKrc)));
  assert.ok(rare.some((product) => product.recipe.some((ingredient) => materialById.get(ingredient.materialId)?.rarity === "RARO")));
  assert.ok(epic.every((product) => product.recipe.some((ingredient) => materialById.get(ingredient.materialId)?.rarity === "EPICO" || materialById.get(ingredient.materialId)?.rarity === "RARO")));
});

test("drops do mapa cobrem todos os materiais catalogados com código e quantidade persistíveis", () => {
  const resourceDrops = LOOT_PRESETS.filter((loot) => loot.type === "RECURSO");
  const dropCodes = new Set<number>();
  for (const drop of resourceDrops) {
    const code = drop.stats.materialCode;
    assert.ok(Number.isSafeInteger(code));
    assert.ok(Number.isSafeInteger(drop.stats.quantity) && drop.stats.quantity > 0);
    const material = getArmorerMaterialByCode(code);
    assert.ok(material, `drop ${drop.name} deve referenciar um material conhecido`);
    dropCodes.add(code);
  }
  assert.equal(dropCodes.size, ARMORER_MATERIALS.length, "cada material precisa ter pelo menos um drop no mapa");
});

test("crafting aceita apenas IDs canônicos e rejeita custos, stats ou receitas enviados pelo cliente", () => {
  assert.equal(api.items.craft.input.safeParse({ catalogId: "produto-inventado" }).success, false);
  assert.equal(api.items.craft.input.safeParse({ catalogId: "rifle-de-plasma", armorerFeeKrc: 1 }).success, false);
  assert.equal(api.items.craft.input.safeParse({ catalogId: "rifle-de-plasma", recipe: [] }).success, false);
  assert.equal(api.items.craft.input.safeParse({ catalogId: "rifle-de-plasma", rarity: "MITICO", stats: { damage: 999 } }).success, false);
});
