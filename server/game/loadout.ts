import type { Item } from "@shared/schema";

export interface CombatLoadout {
  itemIds: number[];
  equippedDamage: number;
  equippedRange: number;
  maxHealth: number;
}

function positiveStat(item: Item, key: string): number {
  const value = item.stats?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function isReadyForBattle(item: Item): boolean {
  const durability = Number(item.durability);
  const maxDurability = Number(item.maxDurability);
  return item.isEquipped === true
    && Number.isFinite(durability)
    && Number.isFinite(maxDurability)
    && durability > 0
    && maxDurability > 0
    && durability <= maxDurability;
}

/**
 * Converts the owner's persisted PackBack into server-side combat attributes.
 * Items with no durability or invalid durability are retained in the War'I but
 * do not grant combat bonuses. Damage/range/health caps match existing loot rules.
 */
export function deriveCombatLoadout(items: Item[], baseMaxHealth: number): CombatLoadout {
  const readyItems = items.filter(isReadyForBattle);
  const weapons = readyItems
    .filter((item) => item.type === "ARMA" && positiveStat(item, "damage") > 0)
    .sort((a, b) => positiveStat(b, "damage") - positiveStat(a, "damage") || a.id - b.id);
  const bestWeapon = weapons[0];
  const equippedDamage = bestWeapon
    ? Math.max(5, Math.min(200, Math.floor(positiveStat(bestWeapon, "damage"))))
    : 15;
  const rawRange = bestWeapon ? positiveStat(bestWeapon, "range") || 6 + equippedDamage / 10 : 8;
  const equippedRange = Math.max(1, Math.min(20, rawRange));

  const safeBaseHealth = Number.isFinite(baseMaxHealth)
    ? Math.max(1, Math.min(200, Math.floor(baseMaxHealth)))
    : 100;
  const defenseBonus = readyItems
    .filter((item) => item.type === "DEFESA")
    .reduce((total, item) => total + Math.floor(positiveStat(item, "defense") / 4), 0);

  return {
    itemIds: readyItems.map((item) => item.id),
    equippedDamage,
    equippedRange,
    maxHealth: Math.min(200, safeBaseHealth + defenseBonus),
  };
}
