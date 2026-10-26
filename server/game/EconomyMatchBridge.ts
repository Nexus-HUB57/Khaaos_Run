/**
 * KHAAOS RUN — Economy Match Bridge
 * ==================================
 * Species-aware kill rewards with full breakdown.
 * Bridges the match lifecycle to the economy system.
 */

// ─── Species Configuration ───────────────────────────────────────────────────

export type Species = "HURAN" | "KHAEL" | "VENEX" | "ONITH" | "ZHEERS" | "SKEETW";

export const SPECIES_CONFIG: Record<Species, { killMultiplier: number }> = {
  HURAN:  { killMultiplier: 1.3 },
  KHAEL:  { killMultiplier: 1.5 },
  VENEX:  { killMultiplier: 1.1 },
  ONITH:  { killMultiplier: 1.2 },
  ZHEERS: { killMultiplier: 1.0 },
  SKEETW: { killMultiplier: 1.4 },
};

// ─── Kill Rarity Modifier ────────────────────────────────────────────────────

export type KillRarity = "COMUM" | "INCOMUM" | "RARO" | "EPICO" | "LENDARIO" | "MITICO";

export const KILL_RARITY_MODIFIER: Record<KillRarity, number> = {
  COMUM:    1.0,
  INCOMUM:  1.5,
  RARO:     2.0,
  EPICO:    2.5,
  LENDARIO: 3.5,
  MITICO:   5.0,
};

// ─── Economy Match Config ────────────────────────────────────────────────────

export interface EconomyMatchConfig {
  baseKillReward: number;
  maxKillReward: number;
  waterBonus: number;
  downedModifier: number;
  worldTransitionCost: number;
  phaseSurvivalBase: number;
}

export const DEFAULT_ECONOMY_MATCH_CONFIG: EconomyMatchConfig = {
  baseKillReward: 150,
  maxKillReward: 10000,
  waterBonus: 1.3,
  downedModifier: 0.3,
  worldTransitionCost: 50000,
  phaseSurvivalBase: 200,
};

// ─── Reward Breakdown ────────────────────────────────────────────────────────

export interface KillRewardBreakdown {
  base: number;
  speciesMultiplier: number;
  rarityModifier: number;
  waterBonus: number;
  downedModifier: number;
  total: number;
  capped: boolean;
}

// ─── Economy Reward Record ───────────────────────────────────────────────────

export interface EconomyReward {
  id: string;
  playerId: string;
  type: "KILL" | "PHASE_SURVIVAL" | "WORLD_TRANSITION" | "WIN_BONUS";
  amount: number;
  currency: "KRC" | "FBM";
  breakdown?: KillRewardBreakdown;
  matchId: string;
  timestamp: number;
}

// ─── Match Economy Summary ───────────────────────────────────────────────────

export interface MatchEconomySummary {
  matchId: string;
  totalRewards: number;
  totalDeductions: number;
  netFlow: number;
  rewardCount: number;
  rewardsByType: Record<string, number>;
}

// ─── EconomyMatchBridge Class ────────────────────────────────────────────────

export class EconomyMatchBridge {
  private config: EconomyMatchConfig;
  private matchId: string;
  private rewards: EconomyReward[] = [];
  private rewardCounter = 0;

  constructor(matchId: string, config?: Partial<EconomyMatchConfig>) {
    this.matchId = matchId;
    this.config = { ...DEFAULT_ECONOMY_MATCH_CONFIG, ...config };
  }

  /** Initialize match economy (idempotent) */
  initMatchEconomy(): void {
    this.rewards = [];
    this.rewardCounter = 0;
  }

  /**
   * Calculate kill reward with full breakdown.
   * Formula: base × species × rarity × waterBonus(if applicable) × downedModifier(if applicable)
   */
  calculateKillReward(params: {
    killerSpecies: Species;
    victimWasDowned: boolean;
    rarity?: KillRarity;
    killerInWater?: boolean;
  }): KillRewardBreakdown {
    const speciesMult = SPECIES_CONFIG[params.killerSpecies]?.killMultiplier ?? 1.0;
    const rarityMod = KILL_RARITY_MODIFIER[params.rarity ?? "COMUM"] ?? 1.0;
    const waterBonus = params.killerInWater && params.killerSpecies === "HURAN"
      ? this.config.waterBonus
      : 1.0;
    const downedMod = params.victimWasDowned
      ? this.config.downedModifier
      : 1.0;

    const total = Math.round(
      this.config.baseKillReward * speciesMult * rarityMod * waterBonus * downedMod
    );
    const capped = total > this.config.maxKillReward;
    const finalTotal = capped ? this.config.maxKillReward : total;

    return {
      base: this.config.baseKillReward,
      speciesMultiplier: speciesMult,
      rarityModifier: rarityMod,
      waterBonus,
      downedModifier: downedMod,
      total: finalTotal,
      capped,
    };
  }

  /** Calculate phase survival reward: phaseSurvivalBase × phase */
  calculatePhaseSurvivalReward(phase: number): number {
    return this.config.phaseSurvivalBase * phase;
  }

  /** Calculate world transition cost: -50,000 KRC */
  calculateWorldTransitionCost(): number {
    return -this.config.worldTransitionCost;
  }

  /** Record a reward in the match economy */
  recordReward(params: {
    playerId: string;
    type: EconomyReward["type"];
    amount: number;
    currency?: "KRC" | "FBM";
    breakdown?: KillRewardBreakdown;
  }): EconomyReward {
    const reward: EconomyReward = {
      id: `${this.matchId}-reward-${++this.rewardCounter}`,
      playerId: params.playerId,
      type: params.type,
      amount: params.amount,
      currency: params.currency ?? "KRC",
      breakdown: params.breakdown,
      matchId: this.matchId,
      timestamp: Date.now(),
    };
    this.rewards.push(reward);
    this.broadcastEconomyEvent("REWARD_RECORDED", reward);
    return reward;
  }

  /** Get match economy summary */
  getMatchSummary(): MatchEconomySummary {
    const rewardsByType: Record<string, number> = {};
    let totalRewards = 0;
    let totalDeductions = 0;

    for (const reward of this.rewards) {
      rewardsByType[reward.type] = (rewardsByType[reward.type] ?? 0) + reward.amount;
      if (reward.amount >= 0) {
        totalRewards += reward.amount;
      } else {
        totalDeductions += Math.abs(reward.amount);
      }
    }

    return {
      matchId: this.matchId,
      totalRewards,
      totalDeductions,
      netFlow: totalRewards - totalDeductions,
      rewardCount: this.rewards.length,
      rewardsByType,
    };
  }

  /** Finalize match economy — no more rewards can be recorded */
  finalizeMatchEconomy(): MatchEconomySummary {
    return this.getMatchSummary();
  }

  /** Destroy match economy — cleanup */
  destroyMatchEconomy(): void {
    this.rewards = [];
    this.rewardCounter = 0;
  }

  /** Get all rewards */
  getRewards(): EconomyReward[] {
    return [...this.rewards];
  }

  /** Get config */
  getConfig(): EconomyMatchConfig {
    return { ...this.config };
  }

  /** Placeholder for WebSocket broadcast */
  private broadcastEconomyEvent(_eventType: string, _data: unknown): void {
    // Placeholder — would emit via WebSocket in production
  }
}
