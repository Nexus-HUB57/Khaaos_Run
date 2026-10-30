/**
 * KHAAOS RUN — EOS Matchmaking (Server-Side)
 * ============================================
 * Coordinates matchmaking via Epic Online Services.
 * Pools players by region + skill bracket, creates matches via MatchFlow.
 */

export interface MatchmakingPool {
  poolId: string;
  region: string;
  skillBracket: string;
  players: Array<{
    playerId: string;
    species: string;
    rank: string;
    joinedAt: number;
  }>;
  maxSize: number;
  createdAt: number;
}

export interface MatchmakingConfig {
  poolTimeoutMs: number;
  maxPoolSize: number;
  skillBrackets: string[];
  regions: string[];
}

export const DEFAULT_MATCHMAKING_CONFIG: MatchmakingConfig = {
  poolTimeoutMs: 60_000,
  maxPoolSize: 50,
  skillBrackets: ["RECRUTA", "HURAN", "VENEX", "ONITH", "SKEETW", "OVERLORD", "MALAKOR"],
  regions: ["sa1", "us-east", "eu-west", "asia-se"],
};

export class EOSMatchmaking {
  private pools: Map<string, MatchmakingPool> = new Map();
  private config: MatchmakingConfig;

  constructor(config?: Partial<MatchmakingConfig>) {
    this.config = { ...DEFAULT_MATCHMAKING_CONFIG, ...config };
  }

  /** Add player to matchmaking pool */
  joinPool(playerId: string, region: string, species: string, rank: string): string | null {
    const skillBracket = this.getSkillBracket(rank);
    const poolId = `${region}_${skillBracket}`;

    let pool = this.pools.get(poolId);
    if (!pool) {
      pool = {
        poolId,
        region,
        skillBracket,
        players: [],
        maxSize: this.config.maxPoolSize,
        createdAt: Date.now(),
      };
      this.pools.set(poolId, pool);
    }

    if (pool.players.length >= pool.maxSize) return null;
    if (pool.players.some(p => p.playerId === playerId)) return null;

    pool.players.push({
      playerId,
      species,
      rank,
      joinedAt: Date.now(),
    });

    return poolId;
  }

  /** Remove player from pool */
  leavePool(playerId: string): boolean {
    for (const pool of this.pools.values()) {
      const idx = pool.players.findIndex(p => p.playerId === playerId);
      if (idx !== -1) {
        pool.players.splice(idx, 1);
        if (pool.players.length === 0) {
          this.pools.delete(pool.poolId);
        }
        return true;
      }
    }
    return false;
  }

  /** Check if any pool is ready to start a match */
  getReadyPools(): MatchmakingPool[] {
    return Array.from(this.pools.values())
      .filter(p => p.players.length >= p.maxSize ||
              (Date.now() - p.createdAt > this.config.poolTimeoutMs && p.players.length >= 2));
  }

  /** Get skill bracket from rank */
  private getSkillBracket(rank: string): string {
    if (this.config.skillBrackets.includes(rank)) return rank;
    return "RECRUTA";
  }

  /** Get pool info */
  getPool(poolId: string): MatchmakingPool | undefined {
    return this.pools.get(poolId);
  }

  /** Get all pools */
  getAllPools(): MatchmakingPool[] {
    return Array.from(this.pools.values());
  }

  /** Get stats */
  getStats() {
    return {
      totalPools: this.pools.size,
      totalPlayers: Array.from(this.pools.values())
        .reduce((sum, p) => sum + p.players.length, 0),
    };
  }

  /** Reset (for testing) */
  reset(): void {
    this.pools.clear();
  }
}
