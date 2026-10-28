/**
 * KHAAOS RUN — Match Flow Orchestrator
 * =====================================
 * Full match lifecycle orchestrator connecting all subsystems:
 *
 *   LOBBY → COUNTDOWN → IN_PROGRESS → WORLD_TRANSITION → FINISHED
 *
 * Integrates:
 *   - EconomyMatchBridge (kill rewards, phase survival, transition costs)
 *   - SpectatorDataPipeline (delayed batched data)
 *   - DiscordBot (event broadcasting)
 *   - RingStateManager (zone shrinking)
 *
 * Multi-World Pipeline:
 *   CIGKV(50p) → W1_Barburhen(100p) → W2_Priadus(75p) → W3_Ckesalth(60p) → W4_Arukheea(80p)
 *
 * Match phases:
 *   0: Initial safe zone
 *   1-3: Ring shrinking (increasing damage)
 *   4: Final ring (sudden death)
 *   5+: Overtime (max damage)
 */

import { EconomyMatchBridge, type SpeciesKey, type KillEvent, type PhaseSurvivalEvent, type WorldTransitionEvent } from "./EconomyMatchBridge";
import { SpectatorDataPipeline, type SpectatorGameData, type SpectatorEvent } from "./SpectatorDataPipeline";
import { DiscordBot } from "./DiscordBot";

// ─── Types ──────────────────────────────────────────────────────────────────

export type MatchStatus = "LOBBY" | "COUNTDOWN" | "IN_PROGRESS" | "WORLD_TRANSITION" | "FINISHED";

export interface MatchPlayer {
  id: string;
  displayName: string;
  species: SpeciesKey;
  skinRarity: string;
  health: number;
  maxHealth: number;
  shield: number;
  isDowned: boolean;
  isEliminated: boolean;
  kills: number;
  posX: number;
  posY: number;
  inWaterZone: boolean;
  worldId: string;
  phasesSurvived: number;
  krcEarned: number;
  lastDamageAt: number;
}

export interface MatchWorld {
  worldId: string;
  worldName: string;
  capacity: number;
  currentPhase: number;
  currentRadius: number;
  damagePerTick: number;
  isShrinking: boolean;
}

export interface MatchState {
  roomId: string;
  status: MatchStatus;
  currentWorldIndex: number;
  worlds: MatchWorld[];
  players: Map<string, MatchPlayer>;
  countdownSeconds: number;
  matchStartTime: number;
  matchEndTime: number | null;
  totalEliminations: number;
  winnerId: string | null;
  tickCount: number;
}

export interface MatchConfig {
  roomId: string;
  countdownSeconds?: number;
  tickIntervalMs?: number;
  /** Multi-world pipeline order */
  worldPipeline?: { worldId: string; worldName: string; capacity: number }[];
  /** Maximum players */
  maxPlayers?: number;
  /** Ring phases per world */
  ringPhasesPerWorld?: number;
  /** Seconds per ring phase before shrink */
  phaseDurationSeconds?: number;
}

// ─── Default World Pipeline ─────────────────────────────────────────────────

export const DEFAULT_WORLD_PIPELINE = [
  { worldId: "cigkv",      worldName: "CIGKV",      capacity: 50  },
  { worldId: "barburhen",  worldName: "Barburhen",  capacity: 100 },
  { worldId: "priadus",    worldName: "Priadus",    capacity: 75  },
  { worldId: "ckesalth",   worldName: "Ckesalth",   capacity: 60  },
  { worldId: "arukheea",   worldName: "Arukheea",   capacity: 80  },
];

// ─── Match Ring Phase Config ────────────────────────────────────────────────

const RING_PHASES = [
  { radiusStart: 800, radiusEnd: 500, durationS: 120, damagePerTick: 1  },
  { radiusStart: 500, radiusEnd: 300, durationS: 90,  damagePerTick: 3  },
  { radiusStart: 300, radiusEnd: 150, durationS: 60,  damagePerTick: 5  },
  { radiusStart: 150, radiusEnd: 50,  durationS: 45,  damagePerTick: 10 },
  { radiusStart: 50,  radiusEnd: 0,   durationS: 30,  damagePerTick: 25 },
];

// ─── MatchFlow Class ────────────────────────────────────────────────────────

export class MatchFlow {
  private state: MatchState;
  private economyBridge: EconomyMatchBridge;
  private spectatorPipeline: SpectatorDataPipeline | null;
  private discordBot: DiscordBot | null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private config: Required<MatchConfig>;
  private tickListeners: Array<(state: MatchState) => void> = [];
  private eventLog: Array<{ type: string; data: Record<string, any>; timestamp: number }> = [];

  constructor(
    config: MatchConfig,
    economyBridge: EconomyMatchBridge,
    spectatorPipeline?: SpectatorDataPipeline,
    discordBot?: DiscordBot,
  ) {
    this.config = {
      roomId: config.roomId,
      countdownSeconds: config.countdownSeconds ?? 30,
      tickIntervalMs: config.tickIntervalMs ?? 1000,
      worldPipeline: config.worldPipeline ?? DEFAULT_WORLD_PIPELINE,
      maxPlayers: config.maxPlayers ?? 100,
      ringPhasesPerWorld: config.ringPhasesPerWorld ?? 5,
      phaseDurationSeconds: config.phaseDurationSeconds ?? 120,
    };

    this.economyBridge = economyBridge;
    this.spectatorPipeline = spectatorPipeline ?? null;
    this.discordBot = discordBot ?? null;

    // Initialize match state
    const worlds: MatchWorld[] = this.config.worldPipeline.map((w) => ({
      worldId: w.worldId,
      worldName: w.worldName,
      capacity: w.capacity,
      currentPhase: 0,
      currentRadius: RING_PHASES[0].radiusStart,
      damagePerTick: 0,
      isShrinking: false,
    }));

    this.state = {
      roomId: config.roomId,
      status: "LOBBY",
      currentWorldIndex: 0,
      worlds,
      players: new Map(),
      countdownSeconds: this.config.countdownSeconds,
      matchStartTime: 0,
      matchEndTime: null,
      totalEliminations: 0,
      winnerId: null,
      tickCount: 0,
    };

    // Initialize economy tracking
    this.economyBridge.initMatchEconomy(config.roomId);
  }

  // ─── Match Lifecycle ──────────────────────────────────────────────────────

  /**
   * Add a player to the lobby.
   */
  joinPlayer(player: Omit<MatchPlayer, "health" | "maxHealth" | "shield" | "isDowned" | "isEliminated" | "kills" | "phasesSurvived" | "krcEarned" | "lastDamageAt">): boolean {
    if (this.state.status !== "LOBBY") return false;
    if (this.state.players.size >= this.config.maxPlayers) return false;
    if (this.state.players.has(player.id)) return false;

    const fullPlayer: MatchPlayer = {
      ...player,
      health: 100,
      maxHealth: 100,
      shield: 50,
      isDowned: false,
      isEliminated: false,
      kills: 0,
      phasesSurvived: 0,
      krcEarned: 0,
      lastDamageAt: 0,
    };

    this.state.players.set(player.id, fullPlayer);
    this.logEvent("PLAYER_JOIN", { playerId: player.id, species: player.species });
    return true;
  }

  /**
   * Start countdown → match.
   */
  startCountdown(): void {
    if (this.state.status !== "LOBBY") return;
    this.state.status = "COUNTDOWN";
    this.logEvent("COUNTDOWN_START", { seconds: this.config.countdownSeconds });

    // Auto-transition to IN_PROGRESS after countdown
    setTimeout(() => this.startMatch(), this.config.countdownSeconds * 1000);
  }

  /**
   * Start the match — begin tick loop.
   */
  startMatch(): void {
    if (this.state.status !== "COUNTDOWN") return;

    this.state.status = "IN_PROGRESS";
    this.state.matchStartTime = Date.now();
    this.logEvent("MATCH_START", { playerCount: this.state.players.size, world: this.getCurrentWorld().worldId });

    // Notify Discord
    this.discordBot?.sendMatchStart(
      this.state.roomId,
      this.state.players.size,
      this.getCurrentWorld().worldId
    );

    // Start tick loop
    this.tickInterval = setInterval(() => this.tick(), this.config.tickIntervalMs);
  }

  /**
   * Core tick — processes ring shrinking, damage, phase transitions.
   */
  private tick(): void {
    this.state.tickCount++;
    const world = this.getCurrentWorld();

    // Process ring phase progression
    this.processRingTick(world);

    // Apply zone damage to players outside safe zone
    this.applyZoneDamage(world);

    // Check for phase survival rewards (every phaseDurationSeconds ticks)
    if (this.state.tickCount % this.config.phaseDurationSeconds === 0) {
      this.processPhaseSurvival(world);
    }

    // Push spectator data
    this.pushSpectatorData();

    // Check win condition
    this.checkWinCondition();

    // Notify tick listeners
    for (const listener of this.tickListeners) {
      listener(this.state);
    }
  }

  /**
   * Process ring shrinking for the current world.
   */
  private processRingTick(world: MatchWorld): void {
    const phaseIdx = Math.min(world.currentPhase, RING_PHASES.length - 1);
    const phaseConfig = RING_PHASES[phaseIdx];

    if (world.currentRadius > phaseConfig.radiusEnd) {
      // Shrink ring
      const shrinkPerTick = (phaseConfig.radiusStart - phaseConfig.radiusEnd) / (phaseConfig.durationS);
      world.currentRadius = Math.max(phaseConfig.radiusEnd, world.currentRadius - shrinkPerTick);
      world.isShrinking = true;
      world.damagePerTick = phaseConfig.damagePerTick;
    } else {
      // Phase complete, advance to next phase
      if (world.currentPhase < RING_PHASES.length - 1) {
        world.currentPhase++;
        world.isShrinking = false;
        this.logEvent("RING_PHASE_ADVANCE", { worldId: world.worldId, newPhase: world.currentPhase });

        // Notify Discord
        this.discordBot?.sendRingPhase(world.worldId, world.currentPhase, world.damagePerTick);
      } else {
        // Final ring — check if all phases done → world transition
        this.checkWorldTransition();
      }
    }
  }

  /**
   * Apply zone damage to players outside the safe zone.
   */
  private applyZoneDamage(world: MatchWorld): void {
    if (world.damagePerTick === 0) return;

    const safeRadius = world.currentRadius;
    const ringCenter = [50, 50]; // center of map

    for (const player of this.state.players.values()) {
      if (player.isEliminated || player.isDowned) continue;
      if (player.worldId !== world.worldId) continue;

      // Calculate distance from ring center
      const dx = player.posX - ringCenter[0];
      const dy = player.posY - ringCenter[1];
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > safeRadius) {
        // Player is in the danger zone
        let damage = world.damagePerTick;

        // Species trait: Huran takes 50% ring damage in water
        if (player.species === "HURAN" && player.inWaterZone) {
          damage *= 0.5;
        }

        // Apply damage: Shield → Health
        if (player.shield > 0) {
          const shieldDamage = Math.min(player.shield, damage);
          player.shield -= shieldDamage;
          damage -= shieldDamage;
        }
        player.health -= damage;
        player.lastDamageAt = Date.now();

        // Check downed/eliminated
        if (player.health <= 0 && !player.isDowned) {
          player.health = 0;
          player.isDowned = true;
          this.logEvent("PLAYER_DOWNED", { playerId: player.id, cause: "ZONE_DAMAGE" });
        }
      }
    }
  }

  /**
   * Process phase survival rewards for alive players.
   */
  private processPhaseSurvival(world: MatchWorld): void {
    const phase = world.currentPhase + 1;

    for (const player of this.state.players.values()) {
      if (player.isEliminated || player.isDowned) continue;

      const event: PhaseSurvivalEvent = {
        playerId: player.id,
        species: player.species,
        phase,
        worldId: world.worldId,
        timestamp: Date.now(),
      };

      const reward = this.economyBridge.calculatePhaseSurvivalReward(event);
      this.economyBridge.recordReward(this.state.roomId, reward);
      this.economyBridge.broadcastEconomyEvent(this.state.roomId, reward);
      player.krcEarned += reward.krcAmount;
      player.phasesSurvived++;
    }
  }

  // ─── Kill / Damage Pipeline ───────────────────────────────────────────────

  /**
   * Process a kill event through the full pipeline:
   *   Damage → Shield → Health → Downed(30s bleed-out) → Eliminate / Revive
   */
  processKill(killerId: string, victimId: string, damage: number, weapon: string): void {
    const killer = this.state.players.get(killerId);
    const victim = this.state.players.get(victimId);
    if (!killer || !victim || victim.isEliminated) return;

    // If victim is already downed, this is a finish-off (eliminate immediately)
    if (victim.isDowned) {
      this.eliminatePlayer(killerId, victimId, weapon);
      return;
    }

    // Apply damage: Shield → Health
    let remainingDamage = damage;
    if (victim.shield > 0) {
      const shieldAbsorbed = Math.min(victim.shield, remainingDamage);
      victim.shield -= shieldAbsorbed;
      remainingDamage -= shieldAbsorbed;
    }
    victim.health -= remainingDamage;
    victim.lastDamageAt = Date.now();

    if (victim.health <= 0 && !victim.isDowned) {
      // Victim is downed — immediately credit killer and record economy
      victim.health = 0;
      victim.isDowned = true;
      killer.kills++;
      this.state.totalEliminations++;
      this.logEvent("PLAYER_DOWNED", { victimId, killerId, weapon });

      // Record kill economy reward immediately (full reward, not downed modifier)
      const killEvent: KillEvent = {
        killerId,
        victimId,
        victimSpecies: victim.species,
        victimSkinRarity: victim.skinRarity,
        victimInWater: victim.inWaterZone,
        victimWasDowned: false, // Fresh down, not a finish-off
        timestamp: Date.now(),
        worldId: this.getCurrentWorld().worldId,
        phase: this.getCurrentWorld().currentPhase,
      };

      const reward = this.economyBridge.calculateKillReward(killEvent);
      this.economyBridge.recordReward(this.state.roomId, reward);
      this.economyBridge.broadcastEconomyEvent(this.state.roomId, reward);
      killer.krcEarned += reward.krcAmount;

      // Discord kill feed
      this.discordBot?.sendKillFeed(
        killer.displayName,
        killer.species,
        victim.displayName,
        victim.species,
        weapon
      );

      // Auto-eliminate after 30 seconds if not revived
      setTimeout(() => {
        if (victim.isDowned && !victim.isEliminated) {
          this.eliminatePlayer(killerId, victimId, weapon);
        }
      }, 30_000);
    }
  }

  private eliminatePlayer(killerId: string, victimId: string, weapon: string): void {
    const victim = this.state.players.get(victimId);
    if (!victim || victim.isEliminated) return;

    // If victim was already downed, kill credit and economy were already given in processKill.
    // This just transitions to full elimination (ragdoll state).
    victim.isEliminated = true;
    victim.isDowned = false;

    this.logEvent("PLAYER_ELIMINATED", { killerId, victimId, weapon });
  }

  /**
   * Revive a downed player.
   */
  revivePlayer(playerId: string, reviverId: string): boolean {
    const player = this.state.players.get(playerId);
    if (!player || !player.isDowned || player.isEliminated) return false;

    player.isDowned = false;
    player.health = 30; // Revive with 30 HP
    this.logEvent("PLAYER_REVIVED", { playerId, reviverId });
    return true;
  }

  // ─── World Transition ─────────────────────────────────────────────────────

  /**
   * Check if conditions are met for world transition.
   * Trigger: final ring phase completed on current world.
   */
  private checkWorldTransition(): void {
    const canTransition = this.state.currentWorldIndex < this.state.worlds.length - 1;
    if (!canTransition) return;

    // Check if enough players remain
    const alivePlayers = Array.from(this.state.players.values()).filter(p => !p.isEliminated);
    if (alivePlayers.length === 0) return;

    // Initiate world transition
    this.state.status = "WORLD_TRANSITION";
    const fromWorld = this.getCurrentWorld();
    const nextIndex = this.state.currentWorldIndex + 1;
    const toWorld = this.state.worlds[nextIndex];

    this.logEvent("WORLD_TRANSITION_START", {
      from: fromWorld.worldId,
      to: toWorld.worldId,
      playerCount: alivePlayers.length,
    });

    // Move alive players to next world
    for (const player of alivePlayers) {
      player.worldId = toWorld.worldId;

      // Charge world transition cost
      const transitionEvent: WorldTransitionEvent = {
        playerId: player.id,
        fromWorld: fromWorld.worldId,
        toWorld: toWorld.worldId,
        timestamp: Date.now(),
      };

      const cost = this.economyBridge.calculateWorldTransitionCost(transitionEvent);
      this.economyBridge.recordReward(this.state.roomId, cost);
      this.economyBridge.broadcastEconomyEvent(this.state.roomId, cost);
    }

    // Advance world index
    this.state.currentWorldIndex = nextIndex;

    // Notify Discord
    this.discordBot?.sendWorldTransition(fromWorld.worldId, toWorld.worldId, alivePlayers.length);

    // Resume match after transition
    this.state.status = "IN_PROGRESS";
  }

  // ─── Win Condition ────────────────────────────────────────────────────────

  /**
   * Check if match should end (1 player left or all eliminated).
   */
  private checkWinCondition(): void {
    const alivePlayers = Array.from(this.state.players.values()).filter(p => !p.isEliminated);

    if (alivePlayers.length <= 1) {
      this.endMatch(alivePlayers[0]?.id ?? null);
    }
  }

  /**
   * End the match.
   */
  endMatch(winnerId: string | null): void {
    if (this.state.status === "FINISHED") return;

    this.state.status = "FINISHED";
    this.state.matchEndTime = Date.now();
    this.state.winnerId = winnerId;

    // Stop tick loop
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    // Finalize economy
    const economySummary = this.economyBridge.finalizeMatchEconomy(this.state.roomId);

    // Discord notification
    if (winnerId) {
      const winner = this.state.players.get(winnerId);
      this.discordBot?.sendMatchEnd(
        this.state.roomId,
        winnerId,
        winner?.species || "HURAN",
        winner?.kills ?? 0
      );
    }

    this.logEvent("MATCH_END", { winnerId, economySummary: economySummary ? { minted: economySummary.totalKrcMinted, burned: economySummary.totalKrcBurned } : null });
  }

  // ─── Spectator Data ───────────────────────────────────────────────────────

  private pushSpectatorData(): void {
    if (!this.spectatorPipeline) return;

    const world = this.getCurrentWorld();
    const data: SpectatorGameData = {
      type: "MATCH_TICK",
      roomId: this.state.roomId,
      timestamp: Date.now(),
      players: Array.from(this.state.players.values()).map(p => ({
        id: p.id,
        // Fase 14 — nome real no standings do espectador (antes: só id/species)
        displayName: p.displayName,
        species: p.species,
        posX: p.posX,
        posY: p.posY,
        health: p.health,
        shield: p.shield,
        isDowned: p.isDowned,
        isEliminated: p.isEliminated,
        kills: p.kills,
      })),
      ringState: {
        currentPhase: world.currentPhase,
        currentRadius: world.currentRadius,
        ringCenter: [0, 0, 0],
        isShrinking: world.isShrinking,
        nextPhaseIn: this.config.phaseDurationSeconds,
      },
      events: this.toSpectatorEvents(),
    };

    this.spectatorPipeline.pushGameData(this.state.roomId, data);
  }

  /**
   * Fase 14 — traduz o eventLog interno para o vocabulário do espectador
   * (ELIMINATION/REVIVE/RING_PHASE/WORLD_TRANSITION) com NOMES REAIS — o
   * eventLog bruto só carrega ids (PLAYER_DOWNED/PLAYER_ELIMINATED/…), que
   * o HUD da transmissão não exibia.
   */
  private toSpectatorEvents(): SpectatorEvent[] {
    const nameOf = (id?: string) => this.state.players.get(id ?? "")?.displayName ?? id ?? "—";
    const out: SpectatorEvent[] = [];
    for (const e of this.eventLog.slice(-8)) {
      const d = e.data ?? {};
      switch (e.type) {
        case "PLAYER_DOWNED":
          out.push({ type: "ELIMINATION", data: { killer: nameOf(d.killerId), victim: nameOf(d.victimId), weapon: d.weapon, knock: true }, timestamp: e.timestamp });
          break;
        case "PLAYER_ELIMINATED":
          out.push({ type: "ELIMINATION", data: { killer: nameOf(d.killerId), victim: nameOf(d.victimId), weapon: d.weapon, knock: false }, timestamp: e.timestamp });
          break;
        case "PLAYER_REVIVED":
          out.push({ type: "REVIVE", data: { by: nameOf(d.reviverId), victim: nameOf(d.playerId) }, timestamp: e.timestamp });
          break;
        case "RING_PHASE_ADVANCE":
          out.push({ type: "RING_PHASE", data: { phase: d.newPhase, isShrinking: true }, timestamp: e.timestamp });
          break;
        case "WORLD_TRANSITION_START":
          out.push({ type: "WORLD_TRANSITION", data: { to: d.to }, timestamp: e.timestamp });
          break;
        default:
          break; // eventos internos (JOIN/COUNTDOWN/ECONOMY) não são de interesse público
      }
    }
    return out;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private getCurrentWorld(): MatchWorld {
    return this.state.worlds[this.state.currentWorldIndex];
  }

  private logEvent(type: string, data: Record<string, any>): void {
    this.eventLog.push({ type, data, timestamp: Date.now() });
  }

  onTick(listener: (state: MatchState) => void): void {
    this.tickListeners.push(listener);
  }

  // ─── Getters ──────────────────────────────────────────────────────────────

  getState(): MatchState { return this.state; }
  getEventLog() { return [...this.eventLog]; }
  getAlivePlayerCount(): number {
    return Array.from(this.state.players.values()).filter(p => !p.isEliminated).length;
  }

  /**
   * Cleanup match resources.
   */
  destroy(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.economyBridge.destroyMatchEconomy(this.state.roomId);
    this.tickListeners = [];
    this.eventLog = [];
  }
}
