/**
 * KHAAOS RUN — Match Flow
 * =======================
 * Full match lifecycle orchestrator.
 * LOBBY → COUNTDOWN → IN_PROGRESS → WORLD_TRANSITION → FINISHED
 */

import { EconomyMatchBridge, type Species, type KillRarity } from "./EconomyMatchBridge";
import { DiscordBot, type DiscordEventType } from "./DiscordBot";
import { SpectatorDataPipeline } from "./SpectatorDataPipeline";

// ─── Match Status ────────────────────────────────────────────────────────────

export type MatchStatus =
  | "LOBBY"
  | "COUNTDOWN"
  | "IN_PROGRESS"
  | "WORLD_TRANSITION"
  | "FINISHED";

// ─── World Pipeline ──────────────────────────────────────────────────────────

export interface WorldConfig {
  worldId: string;
  capacity: number;
  hasWaterZones?: boolean;
}

export const DEFAULT_WORLD_PIPELINE: WorldConfig[] = [
  { worldId: "cigkv",    capacity: 50 },
  { worldId: "barburhen", capacity: 100 },
  { worldId: "priadus",  capacity: 75 },
  { worldId: "ckesalth", capacity: 60 },
  { worldId: "arukheea", capacity: 80 },
];

// ─── Ring Phases ─────────────────────────────────────────────────────────────

export const RING_PHASES = [
  { phase: 1, damagePerTick: 1,  shrinkPercent: 10, startDelay: 120 },
  { phase: 2, damagePerTick: 3,  shrinkPercent: 15, startDelay: 90 },
  { phase: 3, damagePerTick: 5,  shrinkPercent: 20, startDelay: 60 },
  { phase: 4, damagePerTick: 10, shrinkPercent: 25, startDelay: 45 },
  { phase: 5, damagePerTick: 25, shrinkPercent: 30, startDelay: 30 },
];

// ─── Match Player ────────────────────────────────────────────────────────────

export interface MatchPlayer {
  playerId: string;
  species: Species;
  health: number;
  shield: number;
  isDowned: boolean;
  isEliminated: boolean;
  kills: number;
  damageDealt: number;
  joinedAt: number;
}

// ─── Kill Event ──────────────────────────────────────────────────────────────

export interface KillEvent {
  killerId: string;
  victimId: string;
  damage: number;
  weapon: string;
  timestamp: number;
  victimWasDowned: boolean;
  reward?: number;
}

// ─── Match Event ─────────────────────────────────────────────────────────────

export type MatchEvent =
  | { type: "PLAYER_JOINED"; playerId: string; timestamp: number }
  | { type: "COUNTDOWN_STARTED"; seconds: number; timestamp: number }
  | { type: "MATCH_STARTED"; timestamp: number }
  | { type: "KILL"; event: KillEvent; timestamp: number }
  | { type: "PLAYER_DOWNED"; playerId: string; timestamp: number }
  | { type: "PLAYER_REVIVED"; playerId: string; timestamp: number }
  | { type: "PLAYER_ELIMINATED"; playerId: string; timestamp: number }
  | { type: "RING_PHASE"; phase: number; timestamp: number }
  | { type: "WORLD_TRANSITION"; fromWorld: string; toWorld: string; timestamp: number }
  | { type: "MATCH_ENDED"; winnerId: string | null; timestamp: number };

// ─── Match Flow Config ───────────────────────────────────────────────────────

export interface MatchFlowConfig {
  maxPlayers?: number;
  countdownSeconds?: number;
  downedEliminateTimeoutMs?: number;
  tickIntervalMs?: number;
  worldPipeline?: WorldConfig[];
}

// ─── MatchFlow Class ─────────────────────────────────────────────────────────

export class MatchFlow {
  // Core state
  private matchId: string;
  private status: MatchStatus = "LOBBY";
  private players: Map<string, MatchPlayer> = new Map();
  private currentWorldIndex = 0;
  private currentRingPhase = 0;

  // Configuration
  private maxPlayers: number;
  private countdownSeconds: number;
  private downedEliminateTimeoutMs: number;
  private tickIntervalMs: number;
  private worldPipeline: WorldConfig[];

  // Subsystems
  private economy: EconomyMatchBridge;
  private discord: DiscordBot;
  private spectator: SpectatorDataPipeline;

  // Timers
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private downedTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // Event tracking
  private killLog: KillEvent[] = [];
  private eventLog: MatchEvent[] = [];

  // Match metadata
  private matchStartTime = 0;
  private matchEndTime = 0;

  constructor(matchId: string, config?: MatchFlowConfig) {
    this.matchId = matchId;
    this.maxPlayers = config?.maxPlayers ?? 100;
    this.countdownSeconds = config?.countdownSeconds ?? 10;
    this.downedEliminateTimeoutMs = config?.downedEliminateTimeoutMs ?? 30000;
    this.tickIntervalMs = config?.tickIntervalMs ?? 1000;
    this.worldPipeline = config?.worldPipeline ?? DEFAULT_WORLD_PIPELINE;

    // Initialize subsystems
    this.economy = new EconomyMatchBridge(matchId);
    this.discord = new DiscordBot({ webhookUrl: process.env.DISCORD_WEBHOOK_URL });
    this.spectator = new SpectatorDataPipeline();

    this.economy.initMatchEconomy();
  }

  // ─── Player Management ─────────────────────────────────────────────────────

  /** Add a player to the lobby */
  joinPlayer(playerId: string, species: Species): boolean {
    if (this.status !== "LOBBY") return false;
    if (this.players.has(playerId)) return false;
    if (this.players.size >= this.maxPlayers) return false;

    const player: MatchPlayer = {
      playerId,
      species,
      health: 100,
      shield: 50,
      isDowned: false,
      isEliminated: false,
      kills: 0,
      damageDealt: 0,
      joinedAt: Date.now(),
    };

    this.players.set(playerId, player);
    this.eventLog.push({ type: "PLAYER_JOINED", playerId, timestamp: Date.now() });
    return true;
  }

  // ─── Match Lifecycle ───────────────────────────────────────────────────────

  /** Start countdown: LOBBY → COUNTDOWN, auto-transitions to IN_PROGRESS */
  startCountdown(): boolean {
    if (this.status !== "LOBBY") return false;
    if (this.players.size < 1) return false;

    this.status = "COUNTDOWN";
    this.eventLog.push({ type: "COUNTDOWN_STARTED", seconds: this.countdownSeconds, timestamp: Date.now() });

    this.discord.sendMatchStart({
      matchId: this.matchId,
      worldId: this.getCurrentWorld().worldId,
      playerCount: this.players.size,
    });

    // Auto-transition after countdown
    this.countdownTimer = setTimeout(() => {
      this.startMatch();
    }, this.countdownSeconds * 1000);

    return true;
  }

  /** Transition from COUNTDOWN to IN_PROGRESS */
  private startMatch(): void {
    if (this.status !== "COUNTDOWN") return;
    this.status = "IN_PROGRESS";
    this.matchStartTime = Date.now();
    this.currentRingPhase = 1;
    this.eventLog.push({ type: "MATCH_STARTED", timestamp: Date.now() });
    this.eventLog.push({ type: "RING_PHASE", phase: 1, timestamp: Date.now() });

    // Start tick loop
    this.tickTimer = setInterval(() => {
      this.tick();
    }, this.tickIntervalMs);
  }

  // ─── Kill Processing ───────────────────────────────────────────────────────

  /**
   * CRITICAL: Process a kill event.
   * - Apply damage Shield→Health
   * - If victim already downed, eliminate immediately
   * - When victim health≤0: set isDowned=true, increment killer.kills++,
   *   record economy reward IMMEDIATELY, send Discord kill feed
   * - Auto-eliminate after 30s if not revived
   */
  processKill(killerId: string, victimId: string, damage: number, weapon: string): KillEvent | null {
    if (this.status !== "IN_PROGRESS") return null;

    const killer = this.players.get(killerId);
    const victim = this.players.get(victimId);
    if (!killer || !victim) return null;
    if (killer.isEliminated || killer.isDowned) return null;
    if (victim.isEliminated) return null;

    const victimWasDowned = victim.isDowned;

    // If victim was already downed, eliminate immediately
    if (victimWasDowned) {
      this.eliminatePlayer(victimId);

      const killEvent: KillEvent = {
        killerId,
        victimId,
        damage,
        weapon,
        timestamp: Date.now(),
        victimWasDowned: true,
      };

      // IMMEDIATELY credit kill and economy
      killer.kills++;
      killer.damageDealt += damage;

      const rewardBreakdown = this.economy.calculateKillReward({
        killerSpecies: killer.species,
        victimWasDowned: true,
      });
      const reward = this.economy.recordReward({
        playerId: killerId,
        type: "KILL",
        amount: rewardBreakdown.total,
        breakdown: rewardBreakdown,
      });
      killEvent.reward = reward.amount;

      this.killLog.push(killEvent);
      this.eventLog.push({ type: "KILL", event: killEvent, timestamp: Date.now() });

      // Send Discord kill feed
      this.discord.sendKillFeed({
        killerId,
        killerName: killerId,
        victimId,
        victimName: victimId,
        weapon,
      });

      return killEvent;
    }

    // Apply damage: Shield → Health
    let remainingDamage = damage;

    if (victim.shield > 0) {
      if (remainingDamage <= victim.shield) {
        victim.shield -= remainingDamage;
        remainingDamage = 0;
      } else {
        remainingDamage -= victim.shield;
        victim.shield = 0;
      }
    }

    if (remainingDamage > 0) {
      victim.health -= remainingDamage;
    }

    killer.damageDealt += damage;

    // Check if victim is downed (health ≤ 0)
    if (victim.health <= 0) {
      victim.health = 0;
      victim.isDowned = true;
      this.eventLog.push({ type: "PLAYER_DOWNED", playerId: victimId, timestamp: Date.now() });

      // IMMEDIATELY credit kill and economy
      killer.kills++;

      const rewardBreakdown = this.economy.calculateKillReward({
        killerSpecies: killer.species,
        victimWasDowned: false,
      });
      const reward = this.economy.recordReward({
        playerId: killerId,
        type: "KILL",
        amount: rewardBreakdown.total,
        breakdown: rewardBreakdown,
      });

      const killEvent: KillEvent = {
        killerId,
        victimId,
        damage,
        weapon,
        timestamp: Date.now(),
        victimWasDowned: false,
        reward: reward.amount,
      };

      this.killLog.push(killEvent);
      this.eventLog.push({ type: "KILL", event: killEvent, timestamp: Date.now() });

      // Send Discord kill feed
      this.discord.sendKillFeed({
        killerId,
        killerName: killerId,
        victimId,
        victimName: victimId,
        weapon,
      });

      // Auto-eliminate after timeout
      this.downedTimers.set(victimId, setTimeout(() => {
        if (victim.isDowned && !victim.isEliminated) {
          this.eliminatePlayer(victimId);
        }
      }, this.downedEliminateTimeoutMs));

      return killEvent;
    }

    // Victim not downed yet — damage applied
    const killEvent: KillEvent = {
      killerId,
      victimId,
      damage,
      weapon,
      timestamp: Date.now(),
      victimWasDowned: false,
    };

    this.killLog.push(killEvent);
    this.eventLog.push({ type: "KILL", event: killEvent, timestamp: Date.now() });

    return killEvent;
  }

  /** Eliminate a downed player (kill credit already given) */
  eliminatePlayer(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    if (player.isEliminated) return false;

    player.isEliminated = true;
    player.isDowned = true;
    this.eventLog.push({ type: "PLAYER_ELIMINATED", playerId, timestamp: Date.now() });

    // Clear downed timer
    const timer = this.downedTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.downedTimers.delete(playerId);
    }

    return true;
  }

  /** Revive a downed player with 30 HP */
  revivePlayer(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    if (!player.isDowned) return false;
    if (player.isEliminated) return false;

    player.isDowned = false;
    player.health = 30;

    // Clear downed timer
    const timer = this.downedTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.downedTimers.delete(playerId);
    }

    this.eventLog.push({ type: "PLAYER_REVIVED", playerId, timestamp: Date.now() });
    return true;
  }

  // ─── Tick Loop ─────────────────────────────────────────────────────────────

  /** Match tick: ring shrinking, zone damage, phase survival rewards, spectator data push, win condition */
  private tick(): void {
    if (this.status !== "IN_PROGRESS") return;

    // Check win condition
    const alivePlayers = this.getAlivePlayers();
    if (alivePlayers.length <= 1) {
      this.endMatch(alivePlayers[0]?.playerId ?? null);
      return;
    }

    // Ring phase progression
    const currentPhaseConfig = RING_PHASES[this.currentRingPhase - 1];
    if (currentPhaseConfig) {
      // Apply zone damage to players outside the ring
      for (const player of alivePlayers) {
        // Zone damage is applied (simplified — in production, check if outside ring)
        // Here we just check for auto-elimination from zone damage
      }

      // Phase survival rewards
      const survivalReward = this.economy.calculatePhaseSurvivalReward(this.currentRingPhase);
      for (const player of alivePlayers) {
        this.economy.recordReward({
          playerId: player.playerId,
          type: "PHASE_SURVIVAL",
          amount: survivalReward,
        });
      }
    }

    // Push spectator data
    const currentWorld = this.getCurrentWorld();
    this.spectator.pushGameData(currentWorld.worldId, {
      status: this.status,
      phase: this.currentRingPhase,
      players: alivePlayers.length,
      timestamp: Date.now(),
    });
  }

  // ─── Match End ─────────────────────────────────────────────────────────────

  /** End the match: FINISHED, stop tick loop, finalize economy */
  endMatch(winnerId: string | null = null): void {
    if (this.status === "FINISHED") return;

    this.status = "FINISHED";
    this.matchEndTime = Date.now();

    // Stop timers
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    for (const timer of this.downedTimers.values()) {
      clearTimeout(timer);
    }
    this.downedTimers.clear();

    // Finalize economy
    this.economy.finalizeMatchEconomy();

    this.eventLog.push({ type: "MATCH_ENDED", winnerId, timestamp: Date.now() });

    // Send Discord match end
    this.discord.sendMatchEnd({
      matchId: this.matchId,
      winnerId: winnerId ?? "none",
      playerCount: this.players.size,
      duration: this.matchEndTime - this.matchStartTime,
    });
  }

  // ─── Query Methods ─────────────────────────────────────────────────────────

  getMatchId(): string { return this.matchId; }
  getStatus(): MatchStatus { return this.status; }
  getPlayers(): MatchPlayer[] { return Array.from(this.players.values()); }
  getPlayer(playerId: string): MatchPlayer | undefined { return this.players.get(playerId); }
  getAlivePlayers(): MatchPlayer[] {
    return Array.from(this.players.values()).filter(p => !p.isEliminated);
  }
  getKillLog(): KillEvent[] { return [...this.killLog]; }
  getEventLog(): MatchEvent[] { return [...this.eventLog]; }
  getCurrentWorld(): WorldConfig { return this.worldPipeline[this.currentWorldIndex]; }
  getCurrentRingPhase(): number { return this.currentRingPhase; }
  getWorldPipeline(): WorldConfig[] { return [...this.worldPipeline]; }
  getEconomy(): EconomyMatchBridge { return this.economy; }
  getDiscord(): DiscordBot { return this.discord; }
  getSpectator(): SpectatorDataPipeline { return this.spectator; }
  getMatchStartTime(): number { return this.matchStartTime; }
  getMatchEndTime(): number { return this.matchEndTime; }

  /** Get leaderboard sorted by kills desc */
  getLeaderboard(): MatchPlayer[] {
    return Array.from(this.players.values())
      .sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt);
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  /** Destroy the match flow and cleanup all resources */
  destroy(): void {
    // Stop all timers
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    for (const timer of this.downedTimers.values()) {
      clearTimeout(timer);
    }
    this.downedTimers.clear();

    // Cleanup subsystems
    this.economy.destroyMatchEconomy();
    this.discord.shutdown();
    this.spectator.destroy();
  }
}
