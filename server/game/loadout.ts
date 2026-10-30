import type { Item } from "@shared/schema";
import { hasValidWarIDurability } from "@shared/war-i";

export interface CombatLoadout {
  itemIds: number[];
  equippedDamage: number;
  equippedRange: number;
  maxHealth: number;
  carryCapacity: number;
}

export const BASE_CARRY_CAPACITY = 50;
export const MAX_CARRY_CAPACITY = 150;

export function getLootWeight(type: string, stats?: Record<string, number> | null): number {
  const declaredWeight = stats?.weight;
  if (typeof declaredWeight === "number" && Number.isFinite(declaredWeight) && declaredWeight > 0) {
    return Math.max(1, Math.min(100, Math.floor(declaredWeight)));
  }
  const defaultWeight: Record<string, number> = {
    ARMA: 25,
    DEFESA: 20,
    CURATIVO: 5,
    UTILIDADE: 10,
    RECURSO: 5,
  };
  return defaultWeight[type] ?? 10;
}

function positiveStat(item: Item, key: string): number {
  const value = item.stats?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export function hasValidDurability(item: Pick<Item, "durability" | "maxDurability">): boolean {
  return hasValidWarIDurability(item.durability, item.maxDurability);
}

function isReadyForBattle(item: Item): boolean {
  return item.isEquipped === true && hasValidDurability(item);
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
  const capacityBonus = readyItems
    .filter((item) => item.type === "UTILIDADE")
    .reduce((total, item) => total + Math.min(100, Math.floor(positiveStat(item, "capacity"))), 0);

  return {
    itemIds: readyItems.map((item) => item.id),
    equippedDamage,
    equippedRange,
    maxHealth: Math.min(200, safeBaseHealth + defenseBonus),
    carryCapacity: Math.min(MAX_CARRY_CAPACITY, BASE_CARRY_CAPACITY + capacityBonus),
  };
}
