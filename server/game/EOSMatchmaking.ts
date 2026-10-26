/**
 * KHAAOS RUN — EOS Matchmaking
 * ============================
 * Region + skill bracket matchmaking for EOS.
 * Pools players by region and skill bracket, then forms matches.
 */

import type { Species } from "./EconomyMatchBridge";

// ─── Skill Brackets ──────────────────────────────────────────────────────────

export type SkillBracket =
  | "RECRUTA"
  | "HURAN"
  | "VENEX"
  | "ONITH"
  | "SKEETW"
  | "OVERLORD"
  | "MALAKOR";

export const SKILL_BRACKETS: SkillBracket[] = [
  "RECRUTA",
  "HURAN",
  "VENEX",
  "ONITH",
  "SKEETW",
  "OVERLORD",
  "MALAKOR",
];

// ─── Region ──────────────────────────────────────────────────────────────────

export type Region = "SA" | "NA" | "EU" | "AS" | "OCE";

// ─── Pool Entry ──────────────────────────────────────────────────────────────

interface PoolEntry {
  playerId: string;
  region: Region;
  species: Species;
  rank: SkillBracket;
  joinedAt: number;
}

// ─── Matchmaking Pool ────────────────────────────────────────────────────────

interface MatchPool {
  region: Region;
  bracket: SkillBracket;
  players: PoolEntry[];
  createdAt: number;
}

// ─── EOSMatchmaking Config ───────────────────────────────────────────────────

export interface MatchmakingConfig {
  poolSizeTarget: number;
  poolTimeoutMs: number;
  minPlayersToForm: number;
}

const DEFAULT_CONFIG: MatchmakingConfig = {
  poolSizeTarget: 50,
  poolTimeoutMs: 60000,
  minPlayersToForm: 2,
};

// ─── EOSMatchmaking Class ────────────────────────────────────────────────────

export class EOSMatchmaking {
  private config: MatchmakingConfig;
  private pools: Map<string, MatchPool> = new Map();
  private playerPoolMap: Map<string, string> = new Map();

  constructor(config?: Partial<MatchmakingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Get pool key from region + bracket */
  private getPoolKey(region: Region, bracket: SkillBracket): string {
    return `${region}:${bracket}`;
  }

  /** Add a player to the matchmaking pool */
  joinPool(playerId: string, region: Region, species: Species, rank: SkillBracket): boolean {
    // Remove from any existing pool
    this.leavePool(playerId);

    const poolKey = this.getPoolKey(region, rank);
    let pool = this.pools.get(poolKey);

    if (!pool) {
      pool = {
        region,
        bracket: rank,
        players: [],
        createdAt: Date.now(),
      };
      this.pools.set(poolKey, pool);
    }

    pool.players.push({
      playerId,
      region,
      species,
      rank,
      joinedAt: Date.now(),
    });

    this.playerPoolMap.set(playerId, poolKey);
    return true;
  }

  /** Remove a player from the matchmaking pool */
  leavePool(playerId: string): boolean {
    const poolKey = this.playerPoolMap.get(playerId);
    if (!poolKey) return false;

    const pool = this.pools.get(poolKey);
    if (!pool) return false;

    pool.players = pool.players.filter(p => p.playerId !== playerId);
    this.playerPoolMap.delete(playerId);

    // Remove empty pools
    if (pool.players.length === 0) {
      this.pools.delete(poolKey);
    }

    return true;
  }

  /** Get ready pools: pools that are full OR timed out with ≥2 players */
  getReadyPools(): MatchPool[] {
    const now = Date.now();
    const ready: MatchPool[] = [];

    for (const pool of this.pools.values()) {
      const isFull = pool.players.length >= this.config.poolSizeTarget;
      const isTimedOut = (now - pool.createdAt) >= this.config.poolTimeoutMs;
      const hasMinPlayers = pool.players.length >= this.config.minPlayersToForm;

      if ((isFull || isTimedOut) && hasMinPlayers) {
        ready.push(pool);
      }
    }

    return ready;
  }

  /** Get a specific pool */
  getPool(region: Region, bracket: SkillBracket): MatchPool | undefined {
    return this.pools.get(this.getPoolKey(region, bracket));
  }

  /** Get all pools */
  getAllPools(): MatchPool[] {
    return Array.from(this.pools.values());
  }

  /** Get pool count */
  getPoolCount(): number {
    return this.pools.size;
  }

  /** Get total players in all pools */
  getTotalPlayersInPools(): number {
    let total = 0;
    for (const pool of this.pools.values()) {
      total += pool.players.length;
    }
    return total;
  }

  /** Get config */
  getConfig(): MatchmakingConfig {
    return { ...this.config };
  }
}
