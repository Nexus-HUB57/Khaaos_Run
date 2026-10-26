/**
 * KHAAOS RUN — Discord Bot Integration
 * =====================================
 * Discord webhook integration for match events.
 * 11 event types with rate limiting and graceful shutdown.
 */

// ─── Event Types ─────────────────────────────────────────────────────────────

export type DiscordEventType =
  | "MATCH_START"
  | "MATCH_END"
  | "KILL_FEED"
  | "RING_PHASE"
  | "RING_FINAL"
  | "WORLD_TRANSITION"
  | "PLAYER_DOWNED"
  | "PLAYER_REVIVED"
  | "SPECTATOR_JOIN"
  | "LEADERBOARD_UPDATE"
  | "ECONOMY_ALERT";

export const DISCORD_EVENT_TYPES: DiscordEventType[] = [
  "MATCH_START",
  "MATCH_END",
  "KILL_FEED",
  "RING_PHASE",
  "RING_FINAL",
  "WORLD_TRANSITION",
  "PLAYER_DOWNED",
  "PLAYER_REVIVED",
  "SPECTATOR_JOIN",
  "LEADERBOARD_UPDATE",
  "ECONOMY_ALERT",
];

// ─── Discord Bot Config ──────────────────────────────────────────────────────

export interface DiscordBotConfig {
  webhookUrl?: string;
  botToken?: string;
  applicationId?: string;
  rateLimitPerMinute?: number;
}

// ─── Message Queue ───────────────────────────────────────────────────────────

interface QueuedMessage {
  eventType: DiscordEventType;
  data: unknown;
  timestamp: number;
}

// ─── DiscordBot Class ────────────────────────────────────────────────────────

export class DiscordBot {
  private webhookUrl?: string;
  private botToken?: string;
  private applicationId?: string;
  private rateLimitPerMinute: number;
  private messagesSent = 0;
  private messagesDropped = 0;
  private eventsProcessed = 0;
  private queue: QueuedMessage[] = [];
  private rateLimitWindow: number[] = [];
  private isShutDown = false;

  constructor(config: DiscordBotConfig) {
    this.webhookUrl = config.webhookUrl;
    this.botToken = config.botToken;
    this.applicationId = config.applicationId;
    this.rateLimitPerMinute = config.rateLimitPerMinute ?? 30;
  }

  /** Check if the bot is operational (webhook or bot token is set) */
  isOperational(): boolean {
    return (!!this.webhookUrl && this.webhookUrl.length > 0) ||
           (!!this.botToken && this.botToken.length > 0);
  }

  /** Check if rate limit allows sending */
  private isRateLimited(): boolean {
    const now = Date.now();
    const windowStart = now - 60000;
    this.rateLimitWindow = this.rateLimitWindow.filter(ts => ts >= windowStart);
    return this.rateLimitWindow.length >= this.rateLimitPerMinute;
  }

  /** Broadcast an event to the Discord webhook */
  async broadcastEvent(eventType: DiscordEventType, data: unknown): Promise<boolean> {
    this.eventsProcessed++;

    if (this.isShutDown) {
      this.messagesDropped++;
      return false;
    }

    if (this.isRateLimited()) {
      this.messagesDropped++;
      this.queue.push({ eventType, data, timestamp: Date.now() });
      return false;
    }

    if (!this.isOperational()) {
      this.messagesDropped++;
      return false;
    }

    // In production, this would POST to the webhook URL
    // For now, we simulate a successful send
    this.rateLimitWindow.push(Date.now());
    this.messagesSent++;
    return true;
  }

  /** Send kill feed event */
  async sendKillFeed(data: {
    killerId: string;
    killerName: string;
    victimId: string;
    victimName: string;
    weapon: string;
  }): Promise<boolean> {
    return this.broadcastEvent("KILL_FEED", data);
  }

  /** Send match start event */
  async sendMatchStart(data: {
    matchId: string;
    worldId: string;
    playerCount: number;
  }): Promise<boolean> {
    return this.broadcastEvent("MATCH_START", data);
  }

  /** Send match end event */
  async sendMatchEnd(data: {
    matchId: string;
    winnerId: string;
    playerCount: number;
    duration: number;
  }): Promise<boolean> {
    return this.broadcastEvent("MATCH_END", data);
  }

  /** Send ring phase event */
  async sendRingPhase(data: {
    phase: number;
    damagePerTick: number;
    shrinkRadius: number;
  }): Promise<boolean> {
    return this.broadcastEvent("RING_PHASE", data);
  }

  /** Send world transition event */
  async sendWorldTransition(data: {
    fromWorld: string;
    toWorld: string;
    matchId: string;
  }): Promise<boolean> {
    return this.broadcastEvent("WORLD_TRANSITION", data);
  }

  /** Get bot statistics */
  getStats(): {
    messagesSent: number;
    messagesDropped: number;
    eventsProcessed: number;
    isConnected: boolean;
    queueSize: number;
  } {
    return {
      messagesSent: this.messagesSent,
      messagesDropped: this.messagesDropped,
      eventsProcessed: this.eventsProcessed,
      isConnected: this.isOperational() && !this.isShutDown,
      queueSize: this.queue.length,
    };
  }

  /** Shutdown the bot */
  shutdown(): void {
    this.isShutDown = true;
    this.queue = [];
  }
}
