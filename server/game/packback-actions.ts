import type { Item } from "@shared/schema";
import { getWarIUseKind } from "@shared/war-i";

export type PackBackActionPlan =
  | { kind: "HEAL"; amount: number; speedMultiplier?: number; speedDurationMs?: number }
  | { kind: "GRENADE"; damage: number; radius: number }
  | { kind: "RECON"; radius: number }
  | { kind: "UNAVAILABLE"; reason: string };

function boundedStat(item: Item, key: string, maximum: number): number {
  const value = item.stats?.[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.max(1, Math.min(maximum, Math.floor(value)));
}

/** Pure planner: no client-provided effect values are accepted or trusted. */
export function planPackBackAction(
  item: Item,
  currentHealth: number,
  maxHealth: number,
): PackBackActionPlan {
  const kind = getWarIUseKind(item.type, item.stats);
  if (kind === "HEAL") {
    const missingHealth = Math.max(0, Math.floor(maxHealth) - Math.floor(currentHealth));
    const speedPercent = boundedStat(item, "speed", 50);
    if (missingHealth <= 0 && speedPercent <= 0) return { kind: "UNAVAILABLE", reason: "Sua vitalidade já está cheia." };
    return {
      kind: "HEAL",
      amount: Math.min(missingHealth, boundedStat(item, "heal", 200)),
      ...(speedPercent > 0 ? { speedMultiplier: 1 + speedPercent / 100, speedDurationMs: 10_000 } : {}),
    };
  }
  if (kind === "GRENADE") {
    return {
      kind: "GRENADE",
      damage: boundedStat(item, "damage", 200),
      radius: boundedStat(item, "radius", 20),
    };
  }
  if (kind === "RECON") {
    return { kind: "RECON", radius: boundedStat(item, "vision", 100) };
  }
  if (item.type === "UTILIDADE" && boundedStat(item, "capacity", 100) > 0) {
    return { kind: "UNAVAILABLE", reason: "A capacidade da mochila é passiva; ela não tem ativação durante o combate." };
  }
  return { kind: "UNAVAILABLE", reason: "Este item ainda não possui uma ação de combate ativa." };
}
