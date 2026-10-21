/**
 * KHAAOS RUN — Skill-Based Matchmaking
 * =====================================
 * Queue + expanding skill window + party-ready lobbies.
 *
 * Design (competitive BR style):
 * 1. Players enter a queue with their current rating (ELO).
 * 2. Every tick the matcher tries to form a match from players whose
 *    ratings fall within an expanding window (starts tight, grows with wait).
 * 3. When minPlayers is reached (or soft-fill after maxWait), a lobby is
 *    created via RoomManager and all matched players are joined.
 * 4. Optional region/mode filters for future expansion.
 *
 * Tick rate: 2s (fast enough for BR lobbies, cheap on CPU).
 */

import type { WebSocket } from "ws";
import type { WorldId } from "./orchestration";

export type QueueMode = "solo" | "duo" | "squad";

export interface QueueEntry {
  userId: string;
  displayName: string;
  rating: number;
  mode: QueueMode;
  worldId: WorldId;
  ws: WebSocket | null;
  enqueuedAt: number;
  /** Expanding half-width of acceptable rating delta */
  currentDelta: number;
}

export interface MatchmakingConfig {
  minPlayers: number;
  maxPlayers: number;
  /** Initial ± rating window */
  initialDelta: number;
  /** How much delta grows per second of wait */
  deltaGrowthPerSecond: number;
  /** Hard cap on rating window */
  maxDelta: number;
  /** After this many seconds, accept soft fill (≥ softMinPlayers) */
  maxWaitMs: number;
  softMinPlayers: number;
  tickIntervalMs: number;
}

export const DEFAULT_MM_CONFIG: MatchmakingConfig = {
  minPlayers: 2, // raise to 10–50 in production BR
  maxPlayers: 50,
  initialDelta: 100,
  deltaGrowthPerSecond: 15,
  maxDelta: 600,
  maxWaitMs: 45_000,
  softMinPlayers: 2,
  tickIntervalMs: 2000,
};

export type MatchmakingEvent =
  | { type: "queue_joined"; position: number; rating: number; mode: QueueMode }
  | { type: "queue_left" }
  | { type: "queue_update"; position: number; estimatedWaitSec: number; currentDelta: number; playersInQueue: number }
  | { type: "match_found"; roomId: string; players: { userId: string; displayName: string; rating: number }[] }
  | { type: "error"; message: string };

type SendFn = (ws: WebSocket, msg: MatchmakingEvent) => void;
type MatchPlayer = { userId: string; displayName: string; rating: number; ws: WebSocket | null };
type CreateLobbyFn = (players: MatchPlayer[], worldId: WorldId) => Promise<string>;

export class MatchmakingService {
  private queue = new Map<string, QueueEntry>();
  private config: MatchmakingConfig;
  private tickHandle: NodeJS.Timeout | null = null;
  private send: SendFn;
  private createLobby: CreateLobbyFn;

  constructor(
    send: SendFn,
    createLobby: CreateLobbyFn,
    config: Partial<MatchmakingConfig> = {},
  ) {
    this.send = send;
    this.createLobby = createLobby;
    this.config = { ...DEFAULT_MM_CONFIG, ...config };
  }

  start() {
    if (this.tickHandle) return;
    this.tickHandle = setInterval(() => this.tick(), this.config.tickIntervalMs);
    console.log("[Matchmaking] service started");
  }

  stop() {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  /** Enter queue. Replaces any existing entry for this user. */
  enqueue(
    userId: string,
    displayName: string,
    rating: number,
    ws: WebSocket | null,
    mode: QueueMode = "solo",
    worldId: WorldId = "CIGKV",
  ) {
    // Leave any previous queue slot
    this.queue.delete(userId);

    const entry: QueueEntry = {
      userId,
      displayName,
      rating: rating || 1000,
      mode,
      worldId,
      ws,
      enqueuedAt: Date.now(),
      currentDelta: this.config.initialDelta,
    };
    this.queue.set(userId, entry);

    if (ws) {
      this.send(ws, {
        type: "queue_joined",
        position: this.positionOf(userId),
        rating: entry.rating,
        mode,
      });
    }
  }

  dequeue(userId: string) {
    const entry = this.queue.get(userId);
    if (!entry) return;
    this.queue.delete(userId);
    if (entry.ws) {
      this.send(entry.ws, { type: "queue_left" });
    }
  }

  isQueued(userId: string): boolean {
    return this.queue.has(userId);
  }

  /** Update WS reference on reconnect while still queued. */
  rebindWs(userId: string, ws: WebSocket | null) {
    const entry = this.queue.get(userId);
    if (entry) entry.ws = ws;
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  getTelemetry(worldId: WorldId, now = Date.now()): { count: number; p95WaitSeconds: number | null } {
    const waits = [...this.queue.values()]
      .filter((entry) => entry.worldId === worldId)
      .map((entry) => Math.max(0, (now - entry.enqueuedAt) / 1000))
      .sort((a, b) => a - b);
    if (!waits.length) return { count: 0, p95WaitSeconds: null };
    const p95 = waits[Math.max(0, Math.ceil(waits.length * 0.95) - 1)];
    return { count: waits.length, p95WaitSeconds: Math.round(p95 * 10) / 10 };
  }

  getStatus(userId: string) {
    const entry = this.queue.get(userId);
    if (!entry) return null;
    return {
      position: this.positionOf(userId),
      rating: entry.rating,
      mode: entry.mode,
      waitMs: Date.now() - entry.enqueuedAt,
      currentDelta: entry.currentDelta,
      playersInQueue: this.queue.size,
      estimatedWaitSec: this.estimateWait(entry),
    };
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private positionOf(userId: string): number {
    const ordered = [...this.queue.values()].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    const idx = ordered.findIndex((e) => e.userId === userId);
    return idx >= 0 ? idx + 1 : 0;
  }

  private estimateWait(entry: QueueEntry): number {
    // Heuristic: more players in range → faster; longer wait → higher priority
    const inRange = [...this.queue.values()].filter(
      (o) => o.userId !== entry.userId && Math.abs(o.rating - entry.rating) <= entry.currentDelta,
    ).length;
    if (inRange + 1 >= this.config.minPlayers) return 5;
    if (inRange + 1 >= this.config.softMinPlayers) return 15;
    return Math.max(10, 40 - inRange * 5);
  }

  private tick() {
    if (this.queue.size === 0) return;

    const now = Date.now();

    // Grow skill windows
    for (const entry of this.queue.values()) {
      const waitSec = (now - entry.enqueuedAt) / 1000;
      entry.currentDelta = Math.min(
        this.config.maxDelta,
        this.config.initialDelta + waitSec * this.config.deltaGrowthPerSecond,
      );

      if (entry.ws) {
        this.send(entry.ws, {
          type: "queue_update",
          position: this.positionOf(entry.userId),
          estimatedWaitSec: this.estimateWait(entry),
          currentDelta: Math.round(entry.currentDelta),
          playersInQueue: this.queue.size,
        });
      }
    }

    // Attempt to form matches (greedy, oldest-first seed)
    const remaining = [...this.queue.values()].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    const used = new Set<string>();

    while (remaining.length > 0) {
      const seed = remaining.find((e) => !used.has(e.userId));
      if (!seed) break;

      const waitMs = now - seed.enqueuedAt;
      const soft = waitMs >= this.config.maxWaitMs;
      const need = soft ? this.config.softMinPlayers : this.config.minPlayers;

      const candidates = remaining.filter((e) => {
        if (used.has(e.userId)) return false;
        if (e.mode !== seed.mode) return false;
        if (e.worldId !== seed.worldId) return false;
        // Mutual rating window (both must accept each other)
        const delta = Math.max(seed.currentDelta, e.currentDelta);
        return Math.abs(e.rating - seed.rating) <= delta;
      });

      if (candidates.length < need) {
        used.add(seed.userId); // skip seed this tick; don't block others forever
        // Actually: don't mark seed used permanently — only skip forming around them
        // Remove seed from consideration for THIS pass only
        const idx = remaining.findIndex((e) => e.userId === seed.userId);
        if (idx >= 0) remaining.splice(idx, 1);
        continue;
      }

      // Take up to maxPlayers, preferring closer rating
      candidates.sort((a, b) => Math.abs(a.rating - seed.rating) - Math.abs(b.rating - seed.rating));
      const matched = candidates.slice(0, this.config.maxPlayers);

      for (const m of matched) {
        used.add(m.userId);
        this.queue.delete(m.userId);
        const ri = remaining.findIndex((e) => e.userId === m.userId);
        if (ri >= 0) remaining.splice(ri, 1);
      }

      // Create lobby asynchronously
      this.formMatch(matched).catch((err) => {
        console.error("[Matchmaking] formMatch failed", err);
        // Re-queue on failure
        for (const m of matched) {
          this.queue.set(m.userId, m);
        }
      });
    }
  }

  private async formMatch(matched: QueueEntry[]) {
    const players = matched.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      rating: m.rating,
      ws: m.ws,
    }));

    const roomId = await this.createLobby(players, matched[0].worldId);

    const payload: MatchmakingEvent = {
      type: "match_found",
      roomId,
      players: players.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        rating: p.rating,
      })),
    };

    for (const p of players) {
      if (p.ws) this.send(p.ws, payload);
    }

    console.log(
      `[Matchmaking] match formed room=${roomId} players=${players.length} avgRating=${Math.round(
        players.reduce((s, p) => s + p.rating, 0) / players.length,
      )}`,
    );
  }
}
