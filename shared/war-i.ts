export type WarICategory = "ARMAMENTO" | "DEFESA" | "BAG";

const CATEGORY_BY_ITEM_TYPE: Record<string, WarICategory> = {
  ARMA: "ARMAMENTO",
  DEFESA: "DEFESA",
  CURATIVO: "BAG",
  UTILIDADE: "BAG",
  RECURSO: "BAG",
};

/** Maps an inventory item type to one of the three WarBag compartments. */
export function getWarICategory(type: string): WarICategory {
  return CATEGORY_BY_ITEM_TYPE[type] ?? "BAG";
}
