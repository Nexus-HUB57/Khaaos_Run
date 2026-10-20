import { createClient, type RedisClientType } from "redis";
import { randomUUID } from "node:crypto";

export type DistributedQueueEntry = {
  userId: string;
  displayName: string;
  rating: number;
  mode: "solo" | "duo" | "squad";
  enqueuedAt: number;
  currentDelta: number;
  nodeId: string;
};

type RedisLike = RedisClientType;

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
  private readonly prefix = process.env.REDIS_NAMESPACE || "khaaos";

  async connect(): Promise<void> {
    if (this.connected) return;
    if (!this.enabled) {
      if (this.required) throw new Error("REDIS_URL must be configured for production realtime state");
      return;
    }
    const client = createClient({
      url: process.env.REDIS_URL,
      socket: { reconnectStrategy: false },
    });
    client.on("error", (error) => {
      if (process.env.NODE_ENV !== "production") return;
      console.error("[Redis] client error", { message: error.message });
    });
    try {
      await client.connect();
      this.client = client as RedisLike;
      this.connected = true;
    } catch (error) {
      this.client = null;
      if (this.required) throw new Error(`Redis is required for production realtime state: ${String(error)}`);
      console.warn("[Redis] unavailable; using process-local coordination outside production");
    }
  }

  async close(): Promise<void> {
    if (this.client) await this.client.close().catch(() => undefined);
    this.client = null;
    this.connected = false;
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
    const current = await this.client.get(key);
    if (current === token) await this.client.del(key);
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

  async setRoomOwner(roomId: string, ttlMs = 30_000): Promise<boolean> {
    await this.connect();
    if (!this.client) return true;
    const owner = await this.client.set(this.key(`room:${roomId}:owner`), this.nodeId, { NX: true, PX: ttlMs });
    return Boolean(owner);
  }

  async renewRoomOwner(roomId: string, ttlMs = 30_000): Promise<boolean> {
    await this.connect();
    if (!this.client) return true;
    const key = this.key(`room:${roomId}:owner`);
    const current = await this.client.get(key);
    if (current !== this.nodeId) return false;
    await this.client.pExpire(key, ttlMs);
    return true;
  }

  async publishControl(event: Record<string, unknown>): Promise<void> {
    await this.connect();
    if (!this.client) return;
    await this.client.publish(this.key("realtime:control"), JSON.stringify({ ...event, nodeId: this.nodeId, at: Date.now() }));
  }
}

export const distributedState = new DistributedState();
