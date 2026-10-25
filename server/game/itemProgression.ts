import {
  EP555_RANKS,
  type Rank,
} from "@shared/schema";
import {
  WORLD_ORDER,
  type WorldId,
} from "@shared/worlds";

/** Minimum progression required for an item to be usable in a match. */
export interface ItemProgressionRule {
  minWorld: WorldId;
  minRank: Rank;
}

const WORLD_INDEX: ReadonlyMap<WorldId, number> = new Map(
  WORLD_ORDER.map((worldId, index) => [worldId, index] as const),
);

const RANK_INDEX: ReadonlyMap<Rank, number> = new Map(
  EP555_RANKS.map(({ id }, index) => [id, index] as const),
);

function isKnownWorld(worldId: string): worldId is WorldId {
  return WORLD_INDEX.has(worldId as WorldId);
}

function isKnownRank(rank: string): rank is Rank {
  return RANK_INDEX.has(rank as Rank);
}

/**
 * Authoritative server-side item gate.
 *
 * Both requirements are inclusive: a player may use an item when their
 * current world and rank are equal to or above the item's minimum values.
 * Unknown values fail closed rather than being coerced or accepted.
 */
export function canUseItem(
  item: ItemProgressionRule,
  worldId: string,
  playerRank: string,
): boolean {
  if (!item || !isKnownWorld(worldId) || !isKnownRank(playerRank)) {
    return false;
  }

  const currentWorldIndex = WORLD_INDEX.get(worldId);
  const requiredWorldIndex = WORLD_INDEX.get(item.minWorld);
  const currentRankIndex = RANK_INDEX.get(playerRank);
  const requiredRankIndex = RANK_INDEX.get(item.minRank);

  if (
    currentWorldIndex === undefined ||
    requiredWorldIndex === undefined ||
    currentRankIndex === undefined ||
    requiredRankIndex === undefined
  ) {
    return false;
  }

  return (
    currentWorldIndex >= requiredWorldIndex &&
    currentRankIndex >= requiredRankIndex
  );
}

/**
 * Optional diagnostic result for API responses and audit logs.
 * The boolean gate above remains the single authorization decision.
 */
export type ItemUseDenialReason =
  | "INVALID_PLAYER_WORLD"
  | "INVALID_PLAYER_RANK"
  | "ITEM_WORLD_REQUIREMENT_NOT_MET"
  | "ITEM_RANK_REQUIREMENT_NOT_MET";

export function getItemUseDenialReason(
  item: ItemProgressionRule,
  worldId: string,
  playerRank: string,
): ItemUseDenialReason | null {
  if (!isKnownWorld(worldId)) return "INVALID_PLAYER_WORLD";
  if (!isKnownRank(playerRank)) return "INVALID_PLAYER_RANK";

  const currentWorldIndex = WORLD_INDEX.get(worldId)!;
  const requiredWorldIndex = WORLD_INDEX.get(item.minWorld);
  if (requiredWorldIndex === undefined || currentWorldIndex < requiredWorldIndex) {
    return "ITEM_WORLD_REQUIREMENT_NOT_MET";
  }

  const currentRankIndex = RANK_INDEX.get(playerRank)!;
  const requiredRankIndex = RANK_INDEX.get(item.minRank);
  if (requiredRankIndex === undefined || currentRankIndex < requiredRankIndex) {
    return "ITEM_RANK_REQUIREMENT_NOT_MET";
  }

  return null;
}
