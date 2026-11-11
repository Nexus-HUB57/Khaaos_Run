export type WarICategory = "ARMAMENTO" | "DEFESA" | "BAG";
export type WarIUseKind = "HEAL" | "GRENADE" | "RECON";

export interface WarIActionItem {
  id: number;
  name: string;
  type: string;
  rarity: string;
  durability: string;
  maxDurability: string;
  stats: Record<string, number>;
}

/** Mirrors the server's battle-entry rule for items selected in the PackBack. */
export function hasValidWarIDurability(durability: unknown, maxDurability: unknown): boolean {
  const current = Number(durability);
  const maximum = Number(maxDurability);
  return Number.isFinite(current)
    && Number.isFinite(maximum)
    && current > 0
    && maximum > 0
    && current <= maximum;
}

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

function positiveStat(stats: Record<string, number> | null | undefined, key: string): boolean {
  const value = stats?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Classifies only combat actions backed by effects in the authoritative runtime. */
export function getWarIUseKind(
  type: string,
  stats: Record<string, number> | null | undefined,
): WarIUseKind | null {
  if (type === "CURATIVO" && positiveStat(stats, "heal")) return "HEAL";
  if (type !== "UTILIDADE") return null;
  if (positiveStat(stats, "damage") && positiveStat(stats, "radius")) return "GRENADE";
  if (positiveStat(stats, "vision")) return "RECON";
  return null;
}

/** Legacy inventory use is intentionally limited to healing outside a match. */
export function canUseItemOutsideMatch(
  type: string,
  stats: Record<string, number> | null | undefined,
): boolean {
  return type === "CURATIVO" && positiveStat(stats, "heal");
}
