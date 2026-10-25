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

const REDIS_CONNECT_DEADLINE_MS = 2_000;
const REDIS_COMMAND_DEADLINE_MS = 2_000;
const REDIS_SOCKET_IDLE_TIMEOUT_MS = 1_500;
const MAX_CONCURRENT_WS_TICKET_CONSUMPTIONS = 128;

function destroyRedisClient(client: RedisLike): void {
  if (!client.isOpen) return;
  try {
    client.destroy();
  } catch {
    // The client may already be closed after a failed connect or socket timeout.
  }
}

function withDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
  operationName: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        onTimeout();
      } catch {
        // Preserve the deadline error even if socket teardown also fails.
      }
      reject(new Error(`${operationName} exceeded ${timeoutMs}ms deadline`));
    }, timeoutMs);

    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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
  private connecting: Promise<void> | null = null;
  private connectingClient: RedisLike | null = null;
  private connectionGeneration = 0;
  private activeWsTicketConsumptions = 0;
  private readonly prefix = process.env.REDIS_NAMESPACE || "khaaos";
  private readonly consumedWsTickets = new Map<string, number>();

  async connect(): Promise<void> {
    if (this.client?.isReady) {
      return;
    }
    if (this.connecting) return this.connecting;
    if (!this.enabled) {
      if (this.required) throw new Error("REDIS_URL must be configured for production realtime state");
      return;
    }

    if (this.client) {
      const staleClient = this.client;
      this.client = null;
      destroyRedisClient(staleClient);
    }

    const generation = this.connectionGeneration;
    const attempt = (async () => {
      const client = createClient({
        url: process.env.REDIS_URL,
        disableOfflineQueue: true,
        socket: {
          connectTimeout: REDIS_CONNECT_DEADLINE_MS,
          socketTimeout: REDIS_SOCKET_IDLE_TIMEOUT_MS,
          reconnectStrategy: false,
        },
      });
      const redisClient = client as RedisLike;
      this.connectingClient = redisClient;
      client.on("error", (error) => console.error("[Redis] client error", { message: error.message }));
      client.on("end", () => {
        if (this.client === client) {
          this.client = null;
        }
        if (this.connectingClient === client) this.connectingClient = null;
      });
      try {
        await withDeadline(
          client.connect(),
          REDIS_CONNECT_DEADLINE_MS,
          () => destroyRedisClient(redisClient),
          "Redis connection",
        );
        if (generation !== this.connectionGeneration || this.connectingClient !== redisClient) {
          destroyRedisClient(redisClient);
          return;
        }
        this.client = redisClient;
        this.connectingClient = null;
      } catch (error) {
        destroyRedisClient(redisClient);
        if (this.connectingClient === redisClient) this.connectingClient = null;
        if (this.required) throw new Error(`Redis is required for production realtime state: ${String(error)}`);
        console.warn("[Redis] unavailable; using process-local coordination outside production");
      }
    })();
    this.connecting = attempt;
    try {
      await attempt;
    } finally {
      if (this.connecting === attempt) this.connecting = null;
    }
  }

  async close(): Promise<void> {
    this.connectionGeneration += 1;
    const pendingConnection = this.connecting;
    const clients = new Set([this.client, this.connectingClient].filter((client): client is RedisLike => Boolean(client)));
    this.client = null;
    this.connectingClient = null;
    this.connecting = null;
    for (const client of clients) destroyRedisClient(client);
    if (pendingConnection) {
      await pendingConnection.catch(() => undefined);
    }
  }

  private key(name: string): string {
    return `${this.prefix}:${name}`;
  }

  async consumeWsTicket(ticketId: string, ttlMs: number): Promise<boolean> {
    if (!ticketId || !Number.isFinite(ttlMs) || ttlMs <= 0) return false;
    if (this.activeWsTicketConsumptions >= MAX_CONCURRENT_WS_TICKET_CONSUMPTIONS) {
      throw new Error("Too many concurrent WebSocket ticket consumptions");
    }
    this.activeWsTicketConsumptions += 1;
    const boundedTtlMs = Math.min(Math.floor(ttlMs), 90_000);
    try {
      await this.connect();

      if (this.client) {
        const client = this.client;
        const consumed = await withDeadline(
          client.set(this.key(`ws-ticket:${ticketId}`), "used", {
            NX: true,
            PX: boundedTtlMs,
          }),
          REDIS_COMMAND_DEADLINE_MS,
          () => {
            if (this.client === client) this.client = null;
            destroyRedisClient(client);
          },
          "Redis ticket-consumption command",
        );
        return Boolean(consumed);
      }

      if (process.env.NODE_ENV === "production") {
        throw new Error("Redis is required for one-time WebSocket ticket consumption in production");
      }
      if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
        throw new Error("Local WebSocket ticket fallback is restricted to development/test");
      }
      if (process.env.WS_LOCAL_TICKET_FALLBACK !== "true") {
        throw new Error("Local WebSocket ticket fallback is disabled; configure Redis or opt in for development/tests");
      }

      const now = Date.now();
      for (const [id, expiresAt] of this.consumedWsTickets) {
        if (expiresAt <= now) this.consumedWsTickets.delete(id);
      }
      if (this.consumedWsTickets.has(ticketId)) return false;
      this.consumedWsTickets.set(ticketId, now + boundedTtlMs);
      return true;
    } finally {
      this.activeWsTicketConsumptions -= 1;
    }
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
