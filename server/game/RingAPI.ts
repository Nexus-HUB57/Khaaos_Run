/**
 * KHAAOS RUN — Ring API
 * =====================
 * Ring state REST API endpoints and Discord broadcast integration.
 */

import { DiscordBot, type DiscordEventType } from "./DiscordBot";

// ─── World Ring Config ───────────────────────────────────────────────────────

export interface WorldRingConfig {
  worldId: string;
  initialRadius: number;
  phases: number;
  hasWaterZones: boolean;
  damagePerPhase: number[];
}

// ─── Ring State ──────────────────────────────────────────────────────────────

export interface RingState {
  worldId: string;
  currentPhase: number;
  currentRadius: number;
  targetRadius: number;
  damagePerTick: number;
  shrinkRate: number;
  center: { x: number; y: number };
  isFinalPhase: boolean;
}

// ─── Spectator Info ──────────────────────────────────────────────────────────

interface SpectatorInfo {
  spectatorId: string;
  worldId: string;
  cameraMode: string;
  joinedAt: number;
}

// ─── Default World Configs ───────────────────────────────────────────────────

const DEFAULT_WORLD_CONFIGS: WorldRingConfig[] = [
  { worldId: "cigkv",    initialRadius: 500, phases: 5, hasWaterZones: true,  damagePerPhase: [1, 3, 5, 10, 25] },
  { worldId: "barburhen", initialRadius: 600, phases: 5, hasWaterZones: false, damagePerPhase: [1, 3, 5, 10, 25] },
  { worldId: "priadus",  initialRadius: 450, phases: 5, hasWaterZones: true,  damagePerPhase: [1, 3, 5, 10, 25] },
  { worldId: "ckesalth", initialRadius: 400, phases: 5, hasWaterZones: false, damagePerPhase: [1, 3, 5, 10, 25] },
  { worldId: "arukheea", initialRadius: 550, phases: 5, hasWaterZones: false, damagePerPhase: [1, 3, 5, 10, 25] },
];

// ─── RingAPI Class ───────────────────────────────────────────────────────────

export class RingAPI {
  private worldConfigs: Map<string, WorldRingConfig> = new Map();
  private ringStates: Map<string, RingState> = new Map();
  private spectators: Map<string, SpectatorInfo> = new Map();
  private discord: DiscordBot;

  constructor(worldConfigs?: WorldRingConfig[]) {
    const configs = worldConfigs ?? DEFAULT_WORLD_CONFIGS;
    for (const config of configs) {
      this.worldConfigs.set(config.worldId, config);
      // Initialize ring state for each world
      this.ringStates.set(config.worldId, {
        worldId: config.worldId,
        currentPhase: 1,
        currentRadius: config.initialRadius,
        targetRadius: config.initialRadius * 0.9,
        damagePerTick: config.damagePerPhase[0] ?? 1,
        shrinkRate: 0.1,
        center: { x: 0, y: 0 },
        isFinalPhase: false,
      });
    }

    this.discord = new DiscordBot({ webhookUrl: process.env.DISCORD_WEBHOOK_URL });
  }

  /** Get ring state for a world */
  getRingState(worldId: string): RingState | undefined {
    return this.ringStates.get(worldId);
  }

  /** Update ring state for a world */
  updateRingState(worldId: string, state: Partial<RingState>): RingState | undefined {
    const current = this.ringStates.get(worldId);
    if (!current) return undefined;

    const updated = { ...current, ...state, worldId }; // preserve worldId
    this.ringStates.set(worldId, updated);
    return updated;
  }

  /** Get spectators for a world */
  getSpectators(worldId: string): SpectatorInfo[] {
    return Array.from(this.spectators.values())
      .filter(s => s.worldId === worldId);
  }

  /** Add a spectator to a world */
  addSpectator(worldId: string, spectatorId: string, cameraMode = "free"): boolean {
    if (!this.worldConfigs.has(worldId)) return false;

    this.spectators.set(spectatorId, {
      spectatorId,
      worldId,
      cameraMode,
      joinedAt: Date.now(),
    });

    return true;
  }

  /** Remove a spectator */
  removeSpectator(worldId: string, spectatorId: string): boolean {
    const spectator = this.spectators.get(spectatorId);
    if (!spectator || spectator.worldId !== worldId) return false;
    return this.spectators.delete(spectatorId);
  }

  /** Get airdrop probability based on ring phase */
  getAirdropProbability(phase: number): number {
    if (phase >= 5) return 1.0;
    if (phase === 4) return 0.9;
    if (phase === 3) return 0.7;
    if (phase === 2) return 0.5;
    return 0.3; // phase 1
  }

  /** Broadcast a Discord event for a world */
  async broadcastDiscord(worldId: string, eventType: DiscordEventType, data: unknown): Promise<boolean> {
    return this.discord.broadcastEvent(eventType, { worldId, ...data });
  }

  /** Get world config */
  getWorldConfig(worldId: string): WorldRingConfig | undefined {
    return this.worldConfigs.get(worldId);
  }

  /** Get all world configs */
  getAllWorldConfigs(): WorldRingConfig[] {
    return Array.from(this.worldConfigs.values());
  }

  /** Get the Discord bot instance */
  getDiscordBot(): DiscordBot {
    return this.discord;
  }
}
