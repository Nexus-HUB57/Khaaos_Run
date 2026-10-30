/**
 * KHAAOS RUN — Economy-Match Bridge
 * ====================================
 * Connects in-match events to the economy system with species-aware
 * reward calculations, phase survival bonuses, and world transition costs.
 *
 * Reward formula:
 *   killReward = baseKrc × speciesMultiplier(victim) × rarityMultiplier(skinRarity)
 *   phaseSurvival = basePhaseKrc × phaseIndex
 *   worldTransition = 50,000 KRC (flat)
 *   huranWaterBonus = 1.3× on kills while victim is in water zone
 *
 * Species multipliers (victim's species determines reward):
 *   HURAN: 1.3  |  KHAEL: 1.5  |  VENEX: 1.2  |  ONITH: 1.1  |  ZHEERS: 1.0  |  SKEETW: 1.15
 */

import { EconomyConfig } from "./EconomyEngine";

// ─── Species Configuration ──────────────────────────────────────────────────

export const SPECIES_CONFIG = {
  HURAN:   { killMultiplier: 1.3,  label: "Huran",  traits: ["+5HP/s", "50% ring dmg in water", "+20% swim"] },
  KHAEL:   { killMultiplier: 1.5,  label: "Khael",  traits: ["70% cryo resist"] },
  VENEX:   { killMultiplier: 1.2,  label: "Venex",  traits: ["+20% speed"] },
  ONITH:   { killMultiplier: 1.1,  label: "Onith",  traits: ["+15% toxic resist"] },
  ZHEERS:  { killMultiplier: 1.0,  label: "Zheers", traits: ["+10% rad resist"] },
  SKEETW:  { killMultiplier: 1.15, label: "Skeetw", traits: ["fog stealth"] },
} as const;

export type SpeciesKey = keyof typeof SPECIES_CONFIG;

// ─── Skin Rarity Kill Modifier ──────────────────────────────────────────────

export const KILL_RARITY_MODIFIER: Record<string, number> = {
  COMUM:    1.0,
  INCOMUM:  1.25,
  RARO:     1.6,
  EPICO:    2.2,
  LENDARIO: 3.5,
  MITICO:   5.0,
};

// ─── Economy-Match Bridge Config ────────────────────────────────────────────

export const EconomyMatchConfig = {
  /** Base KRC reward per kill (before multipliers) */
  baseKillReward: 150,

  /** Base KRC per phase survived */
  basePhaseSurvival: 200,

  /** KRC cost to transition between worlds */
  worldTransitionCost: 50_000,

  /** Huran water-zone kill bonus (1.3×) */
  huranWaterBonus: 1.3,

  /** Maximum kill reward cap (prevents exploits) */
  maxKillReward: 25_000,

  /** Downed-but-revived partial reward for the would-be killer */
  downedRevivePartial: 0.3,
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KillEvent {
  killerId: string;
  victimId: string;
  victimSpecies: SpeciesKey;
  victimSkinRarity: string;
  victimInWater: boolean;
  victimWasDowned: boolean;   // true if victim was already downed (less reward)
  timestamp: number;
  worldId: string;
  phase: number;
}

export interface PhaseSurvivalEvent {
  playerId: string;
  species: SpeciesKey;
  phase: number;
  worldId: string;
  timestamp: number;
}

export interface WorldTransitionEvent {
  playerId: string;
  fromWorld: string;
  toWorld: string;
  timestamp: number;
}

export interface EconomyRewardResult {
  eventType: "KILL" | "PHASE_SURVIVAL" | "WORLD_TRANSITION";
  playerId: string;
  krcAmount: number;
  breakdown: Record<string, number>;
  timestamp: number;
}

export interface MatchEconomySummary {
  roomId: string;
  totalKrcMinted: number;
  totalKrcBurned: number;
  killRewards: number;
  phaseRewards: number;
  transitionCosts: number;
  players: Map<string, PlayerEconomyState>;
}

export interface PlayerEconomyState {
  totalKrcEarned: number;
  totalKrcSpent: number;
  kills: number;
  phasesSurvived: number;
  worldTransitions: number;
}

// ─── EconomyMatchBridge Class ───────────────────────────────────────────────

export class EconomyMatchBridge {
  private matchEconomies: Map<string, MatchEconomySummary> = new Map();

  /**
   * Calculate kill reward with species × rarity × water modifiers.
   */
  calculateKillReward(event: KillEvent): EconomyRewardResult {
    const speciesMult = SPECIES_CONFIG[event.victimSpecies]?.killMultiplier ?? 1.0;
    const rarityMult = KILL_RARITY_MODIFIER[event.victimSkinRarity] ?? 1.0;
    const waterMult = event.victimInWater ? EconomyMatchConfig.huranWaterBonus : 1.0;
    const downedMult = event.victimWasDowned ? EconomyMatchConfig.downedRevivePartial : 1.0;

    const rawReward = EconomyMatchConfig.baseKillReward * speciesMult * rarityMult * waterMult * downedMult;
    const krcAmount = Math.min(Math.round(rawReward), EconomyMatchConfig.maxKillReward);

    return {
      eventType: "KILL",
      playerId: event.killerId,
      krcAmount,
      breakdown: {
        base: EconomyMatchConfig.baseKillReward,
        speciesMultiplier: speciesMult,
        rarityMultiplier: rarityMult,
        waterBonus: waterMult,
        downedModifier: downedMult,
      },
      timestamp: event.timestamp,
    };
  }

  /**
   * Calculate phase survival reward. Higher phases yield more KRC.
   */
  calculatePhaseSurvivalReward(event: PhaseSurvivalEvent): EconomyRewardResult {
    const krcAmount = Math.round(EconomyMatchConfig.basePhaseSurvival * event.phase);

    return {
      eventType: "PHASE_SURVIVAL",
      playerId: event.playerId,
      krcAmount,
      breakdown: {
        base: EconomyMatchConfig.basePhaseSurvival,
        phase: event.phase,
      },
      timestamp: event.timestamp,
    };
  }

  /**
   * Calculate world transition cost (KRC burned from player).
   * Returns negative krcAmount to indicate a cost.
   */
  calculateWorldTransitionCost(event: WorldTransitionEvent): EconomyRewardResult {
    return {
      eventType: "WORLD_TRANSITION",
      playerId: event.playerId,
      krcAmount: -EconomyMatchConfig.worldTransitionCost,
      breakdown: {
        flatCost: EconomyMatchConfig.worldTransitionCost,
        fromWorld: 0, // placeholder for breakdown
        toWorld: 0,
      },
      timestamp: event.timestamp,
    };
  }

  /**
   * Initialize economy tracking for a match room.
   */
  initMatchEconomy(roomId: string): void {
    this.matchEconomies.set(roomId, {
      roomId,
      totalKrcMinted: 0,
      totalKrcBurned: 0,
      killRewards: 0,
      phaseRewards: 0,
      transitionCosts: 0,
      players: new Map(),
    });
  }

  /**
   * Record a reward result into the match economy summary.
   */
  recordReward(roomId: string, result: EconomyRewardResult): void {
    const summary = this.matchEconomies.get(roomId);
    if (!summary) return;

    let playerState = summary.players.get(result.playerId);
    if (!playerState) {
      playerState = { totalKrcEarned: 0, totalKrcSpent: 0, kills: 0, phasesSurvived: 0, worldTransitions: 0 };
      summary.players.set(result.playerId, playerState);
    }

    if (result.krcAmount > 0) {
      summary.totalKrcMinted += result.krcAmount;
      playerState.totalKrcEarned += result.krcAmount;
    } else {
      summary.totalKrcBurned += Math.abs(result.krcAmount);
      playerState.totalKrcSpent += Math.abs(result.krcAmount);
    }

    switch (result.eventType) {
      case "KILL":
        summary.killRewards += result.krcAmount;
        playerState.kills++;
        break;
      case "PHASE_SURVIVAL":
        summary.phaseRewards += result.krcAmount;
        playerState.phasesSurvived++;
        break;
      case "WORLD_TRANSITION":
        summary.transitionCosts += Math.abs(result.krcAmount);
        playerState.worldTransitions++;
        break;
    }
  }

  /**
   * Get the economy summary for a match.
   */
  getMatchSummary(roomId: string): MatchEconomySummary | null {
    return this.matchEconomies.get(roomId) ?? null;
  }

  /**
   * Finalize match economy — compute final payout per player.
   */
  finalizeMatchEconomy(roomId: string): MatchEconomySummary | null {
    const summary = this.matchEconomies.get(roomId);
    if (!summary) return null;

    // Log final state
    console.log(
      `[EconomyMatchBridge] Match ${roomId} finalized: ` +
      `minted=${summary.totalKrcMinted} burned=${summary.totalKrcBurned} ` +
      `kills=${summary.killRewards} phases=${summary.phaseRewards} ` +
      `transitions=${summary.transitionCosts} players=${summary.players.size}`
    );

    return summary;
  }

  /**
   * Cleanup after match.
   */
  destroyMatchEconomy(roomId: string): void {
    this.matchEconomies.delete(roomId);
  }

  // ─── WebSocket Integration ────────────────────────────────────────────────

  private economyWsClients: Map<string, Set<any>> = new Map();

  /**
   * Register a WebSocket client for economy updates.
   */
  subscribeEconomyUpdates(roomId: string, ws: any): void {
    let clients = this.economyWsClients.get(roomId);
    if (!clients) {
      clients = new Set();
      this.economyWsClients.set(roomId, clients);
    }
    clients.add(ws);
  }

  /**
   * Broadcast economy event to subscribed WebSocket clients.
   */
  broadcastEconomyEvent(roomId: string, result: EconomyRewardResult): void {
    const clients = this.economyWsClients.get(roomId);
    if (!clients) return;

    const message = JSON.stringify({
      type: "ECONOMY_UPDATE",
      data: result,
      timestamp: Date.now(),
    });

    for (const ws of clients) {
      try {
        if (ws.readyState === 1) ws.send(message);
      } catch { /* client disconnected */ }
    }
  }
}
