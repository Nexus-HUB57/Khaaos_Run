/**
 * KHAAOS RUN — Spectator Data Pipeline
 * =====================================
 * Delayed batched spectator data with rate limiting and bandwidth control.
 */

// ─── Spectator Configuration ─────────────────────────────────────────────────

export interface SpectatorConfig {
  delayMs: number;
  batchIntervalMs: number;
  maxSpectatorsPerRoom: number;
  globalMaxSpectators: number;
  maxEventsPerBatch: number;
  maxBandwidthKBps: number;
}

export const DEFAULT_SPECTATOR_CONFIG: SpectatorConfig = {
  delayMs: 10000,
  batchIntervalMs: 200,
  maxSpectatorsPerRoom: 500,
  globalMaxSpectators: 5000,
  maxEventsPerBatch: 20,
  maxBandwidthKBps: 64,
};

// ─── Spectator Entry ─────────────────────────────────────────────────────────

interface SpectatorEntry {
  spectatorId: string;
  roomId: string;
  joinedAt: number;
  cameraMode: string;
}

// ─── Delayed Game Data ───────────────────────────────────────────────────────

interface DelayedGameData {
  data: unknown;
  timestamp: number;
  deliverAt: number;
}

// ─── Spectator Room State ────────────────────────────────────────────────────

interface RoomState {
  roomId: string;
  spectators: Map<string, SpectatorEntry>;
  delayBuffer: DelayedGameData[];
  batchBuffer: DelayedGameData[];
}

// ─── SpectatorDataPipeline Class ─────────────────────────────────────────────

export class SpectatorDataPipeline {
  private config: SpectatorConfig;
  private rooms: Map<string, RoomState> = new Map();
  private destroyed = false;

  constructor(config?: Partial<SpectatorConfig>) {
    this.config = { ...DEFAULT_SPECTATOR_CONFIG, ...config };
  }

  /** Get or create a room state */
  private getOrCreateRoom(roomId: string): RoomState {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        roomId,
        spectators: new Map(),
        delayBuffer: [],
        batchBuffer: [],
      };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  /** Push game data into the delay buffer for a room */
  pushGameData(roomId: string, data: unknown): void {
    if (this.destroyed) return;

    const room = this.getOrCreateRoom(roomId);
    const now = Date.now();

    room.delayBuffer.push({
      data,
      timestamp: now,
      deliverAt: now + this.config.delayMs,
    });

    // Also add to batch buffer (for immediate batch access)
    room.batchBuffer.push({
      data,
      timestamp: now,
      deliverAt: now + this.config.delayMs,
    });

    // Trim batch buffer to max events per batch
    if (room.batchBuffer.length > this.config.maxEventsPerBatch) {
      room.batchBuffer = room.batchBuffer.slice(-this.config.maxEventsPerBatch);
    }
  }

  /** Add a spectator to a room */
  addSpectator(roomId: string, spectatorId: string, cameraMode = "follow"): boolean {
    if (this.destroyed) return false;

    const room = this.getOrCreateRoom(roomId);

    // Check room capacity
    if (room.spectators.size >= this.config.maxSpectatorsPerRoom) {
      return false;
    }

    // Check global capacity
    const globalCount = this.getGlobalSpectatorCount();
    if (globalCount >= this.config.globalMaxSpectators) {
      return false;
    }

    room.spectators.set(spectatorId, {
      spectatorId,
      roomId,
      joinedAt: Date.now(),
      cameraMode,
    });

    return true;
  }

  /** Remove a spectator from a room */
  removeSpectator(roomId: string, spectatorId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.spectators.delete(spectatorId);
  }

  /** Get spectator count for a specific room (or global if no roomId) */
  getSpectatorCount(roomId?: string): number {
    if (roomId) {
      const room = this.rooms.get(roomId);
      return room ? room.spectators.size : 0;
    }
    return this.getGlobalSpectatorCount();
  }

  /** Get spectators for a room */
  getSpectators(roomId: string): SpectatorEntry[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.spectators.values()) : [];
  }

  /** Get delay buffer size for a room */
  getDelayBufferSize(roomId: string): number {
    const room = this.rooms.get(roomId);
    return room ? room.delayBuffer.length : 0;
  }

  /** Get global spectator count */
  private getGlobalSpectatorCount(): number {
    let total = 0;
    for (const room of this.rooms.values()) {
      total += room.spectators.size;
    }
    return total;
  }

  /** Get config */
  getConfig(): SpectatorConfig {
    return { ...this.config };
  }

  /** Destroy the pipeline and cleanup all resources */
  destroy(): void {
    this.destroyed = true;
    this.rooms.clear();
  }
}
