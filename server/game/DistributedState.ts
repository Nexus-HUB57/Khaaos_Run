import { createClient, type RedisClientType } from "redis";
import { randomUUID } from "node:crypto";

export type DistributedQueueEntry = {
  userId: string;
  displayName: string;
  rating: number;
  mode: "solo" | "duo" | "squad";
  worldId: "CIGKV" | "W1" | "W2" | "W3" | "W4";
  enqueuedAt: number;
  currentDelta: number;
  nodeId: string;
};

type RedisLike = RedisClientType;

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }
`;
const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;
const RENEW_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

/**
 * Shared coordination primitive for horizontally scaled realtime nodes.
 * The WebSocket itself remains local to a node; Redis owns queue membership,
 * room ownership leases and cross-node control events.
 */
export class DistributedState {
  readonly nodeId = process.env.NODE_ID || `${process.pid}-${randomUUID()}`;
  readonly enabled = Boolean(process.env.REDIS_URL);
  private readonly required = process.env.NODE_ENV === "production" && process.env.REDIS_REQUIRED !== "false";
  private client: RedisLike | null = null;
  private connected = false;
  private connecting: Promise<void> | null = null;
  private readonly prefix = process.env.REDIS_NAMESPACE || "khaaos";
  private readonly localExpirations = new Map<string, number>();
  private readonly localCounters = new Map<string, { count: number; expiresAt: number }>();
  private readonly roomOwnerTokens = new Map<string, string>();
  private readonly roomOwnerTimers = new Map<string, NodeJS.Timeout>();
  private controlSubscriber: RedisClientType | null = null;
  private readonly controlHandlers = new Set<(event: Record<string, unknown>) => void>();

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.connectInternal();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async connectInternal(): Promise<void> {
    if (!this.enabled) {
      if (this.required) throw new Error("REDIS_URL must be configured for production realtime state");
      return;
    }
    const client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (error) => console.error("[Redis] client error", { message: error.message }));
    try {
      await client.connect();
      this.client = client as RedisLike;
      this.connected = true;
    } catch (error) {
      await client.close().catch(() => undefined);
      if (this.required) throw new Error(`Redis is required for production realtime state: ${String(error)}`);
      console.warn("[Redis] unavailable; using process-local coordination outside production");
    }
  }

  async close(): Promise<void> {
    for (const timer of this.roomOwnerTimers.values()) clearTimeout(timer);
    this.roomOwnerTimers.clear();
    this.roomOwnerTokens.clear();
    if (this.controlSubscriber) await this.controlSubscriber.quit().catch(() => undefined);
    this.controlSubscriber = null;
    if (this.client) await this.client.close().catch(() => undefined);
    this.client = null;
    this.connected = false;
  }

  /**
   * Cliente Redis conectado (ou null). Compartilhado com subsistemas que
   * precisam de primitivas próprias sobre a MESMA conexão (ex.: RoomEventMesh).
   */
  getRedisClient(): RedisLike | null {
    return this.connected ? this.client : null;
  }

  private key(name: string): string {
    return `${this.prefix}:${name}`;
  }

  async acquireLock(name: string, ttlMs = 2_000): Promise<string | null> {
    await this.connect();
    if (!this.client) return `local:${this.nodeId}:${name}`;
    const token = `${this.nodeId}:${randomUUID()}`;
    const acquired = await this.client.set(this.key(`lock:${name}`), token, { NX: true, PX: ttlMs });
    return acquired ? token : null;
  }

  async releaseLock(name: string, token: string | null): Promise<void> {
    if (!token || !this.client || token.startsWith("local:")) return;
    const key = this.key(`lock:${name}`);
    await this.client.eval(RELEASE_LOCK_SCRIPT, { keys: [key], arguments: [token] });
  }

  async upsertQueueEntry(entry: DistributedQueueEntry): Promise<void> {
    await this.connect();
    if (!this.client) return;
    await this.client.hSet(this.key("matchmaking:queue"), entry.userId, JSON.stringify(entry));
  }

  async removeQueueEntry(userId: string): Promise<void> {
    await this.connect();
    if (!this.client) return;
    await this.client.hDel(this.key("matchmaking:queue"), userId);
  }

  async restoreQueueEntryIfAbsent(entry: DistributedQueueEntry): Promise<void> {
    await this.connect();
    if (!this.client) return;
    await this.client.hSetNX(this.key("matchmaking:queue"), entry.userId, JSON.stringify(entry));
  }

  async getQueueEntries(): Promise<DistributedQueueEntry[]> {
    await this.connect();
    if (!this.client) return [];
    const values = await this.client.hVals(this.key("matchmaking:queue"));
    return values.flatMap((value) => {
      try {
        const entry = JSON.parse(value) as DistributedQueueEntry;
        return entry.userId && entry.nodeId ? [entry] : [];
      } catch {
        return [];
      }
    });
  }

  async claimQueueEntries(userIds: string[], ttlMs = 15_000): Promise<string | null> {
    const token = await this.acquireLock(`matchmaking:claim:${userIds.slice().sort().join(",")}`, ttlMs);
    if (!token || !this.client) return token;
    const entries = await this.getQueueEntries();
    const claimed = new Set(userIds);
    for (const entry of entries) {
      if (claimed.has(entry.userId)) await this.client.hDel(this.key("matchmaking:queue"), entry.userId);
    }
    return token;
  }

  async setRoomOwner(roomId: string, ttlMs = 30_000): Promise<string | null> {
    await this.connect();
    const token = `${this.nodeId}:${randomUUID()}`;
    if (!this.client) {
      this.roomOwnerTokens.set(roomId, token);
      this.scheduleRoomOwnerRenewal(roomId, token, ttlMs);
      return token;
    }
    const owner = await this.client.set(this.key(`room:${roomId}:owner`), token, { NX: true, PX: ttlMs });
    if (!owner) return null;
    this.roomOwnerTokens.set(roomId, token);
    this.scheduleRoomOwnerRenewal(roomId, token, ttlMs);
    return token;
  }

  private scheduleRoomOwnerRenewal(roomId: string, token: string, ttlMs: number): void {
    const previous = this.roomOwnerTimers.get(roomId);
    if (previous) clearTimeout(previous);
    const delay = Math.max(250, Math.floor(ttlMs * 2 / 3));
    const timer = setTimeout(async () => {
      const renewed = await this.renewRoomOwner(roomId, token, ttlMs).catch(() => false);
      if (renewed && this.roomOwnerTokens.get(roomId) === token) {
        this.scheduleRoomOwnerRenewal(roomId, token, ttlMs);
      } else if (this.roomOwnerTokens.get(roomId) === token) {
        this.roomOwnerTokens.delete(roomId);
        this.roomOwnerTimers.delete(roomId);
      }
    }, delay);
    timer.unref?.();
    this.roomOwnerTimers.set(roomId, timer);
  }

  async renewRoomOwner(roomId: string, token = this.roomOwnerTokens.get(roomId) ?? null, ttlMs = 30_000): Promise<boolean> {
    await this.connect();
    if (!token) return false;
    if (!this.client) return this.roomOwnerTokens.get(roomId) === token;
    const key = this.key(`room:${roomId}:owner`);
    const renewed = await this.client.eval(RENEW_LOCK_SCRIPT, { keys: [key], arguments: [token, String(ttlMs)] });
    const ok = Number(renewed) === 1;
    if (!ok && this.roomOwnerTokens.get(roomId) === token) {
      this.roomOwnerTokens.delete(roomId);
      const timer = this.roomOwnerTimers.get(roomId);
      if (timer) clearTimeout(timer);
      this.roomOwnerTimers.delete(roomId);
    }
    return ok;
  }

  async releaseRoomOwner(roomId: string, token = this.roomOwnerTokens.get(roomId) ?? null): Promise<boolean> {
    const current = this.roomOwnerTokens.get(roomId);
    if (current === token || !token) {
      this.roomOwnerTokens.delete(roomId);
      const timer = this.roomOwnerTimers.get(roomId);
      if (timer) clearTimeout(timer);
      this.roomOwnerTimers.delete(roomId);
    }
    if (!token || !this.client) return Boolean(current === token);
    const key = this.key(`room:${roomId}:owner`);
    const released = await this.client.eval(RELEASE_LOCK_SCRIPT, { keys: [key], arguments: [token] });
    return Number(released) === 1;
  }

  async publishControl(event: Record<string, unknown>): Promise<void> {
    await this.connect();
    const envelope = { ...event, nodeId: this.nodeId, at: Date.now() };
    for (const callback of this.controlHandlers) callback(envelope);
    if (this.client) await this.client.publish(this.key("realtime:control"), JSON.stringify(envelope));
  }

  async subscribeControl(handler: (event: Record<string, unknown>) => void): Promise<void> {
    this.controlHandlers.add(handler);
    await this.connect();
    if (!this.client || this.controlSubscriber) return;
    const subscriber = this.client.duplicate() as RedisClientType;
    await subscriber.connect();
    await subscriber.subscribe(this.key("realtime:control"), (raw) => {
      try {
        const event = JSON.parse(raw) as Record<string, unknown>;
        for (const callback of this.controlHandlers) callback(event);
      } catch {
        // Ignore malformed control events; they must not affect the game loop.
      }
    });
    this.controlSubscriber = subscriber;
  }

  /** Consume a one-time credential atomically. Returns false on replay. */
  async consumeOnce(name: string, ttlMs: number): Promise<boolean> {
    await this.connect();
    const key = this.key(`once:${name}`);
    if (this.client) return Boolean(await this.client.set(key, this.nodeId, { NX: true, PX: ttlMs }));
    const now = Date.now();
    const expiresAt = this.localExpirations.get(key) ?? 0;
    if (expiresAt > now) return false;
    this.localExpirations.set(key, now + ttlMs);
    return true;
  }

  async revokeUser(userId: string, ttlMs = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    await this.connect();
    const key = this.key(`revoked:user:${userId}`);
    if (this.client) await this.client.set(key, "1", { PX: ttlMs });
    else this.localExpirations.set(key, Date.now() + ttlMs);
    await this.publishControl({ type: "auth:revoke", userId });
  }

  async isUserRevoked(userId: string): Promise<boolean> {
    await this.connect();
    const key = this.key(`revoked:user:${userId}`);
    if (this.client) return (await this.client.exists(key)) === 1;
    return (this.localExpirations.get(key) ?? 0) > Date.now();
  }

  async rateLimit(name: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterMs: number }> {
    await this.connect();
    const key = this.key(`rate:${name}`);
    if (this.client) {
      const result = await this.client.eval(RATE_LIMIT_SCRIPT, {
        keys: [key],
        arguments: [String(windowMs)],
      }) as number[];
      const count = Number(result[0]);
      const ttl = Math.max(0, Number(result[1]));
      return { allowed: count <= limit, retryAfterMs: ttl };
    }
    const now = Date.now();
    const current = this.localCounters.get(key);
    const entry = current && current.expiresAt > now ? current : { count: 0, expiresAt: now + windowMs };
    entry.count += 1;
    this.localCounters.set(key, entry);
    return { allowed: entry.count <= limit, retryAfterMs: Math.max(0, entry.expiresAt - now) };
  }
}

export const distributedState = new DistributedState();
