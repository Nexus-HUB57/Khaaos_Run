/**
 * KHAAOS RUN — Discord Bot Integration
 * ======================================
 * Gateway event forwarding, slash commands, and match notifications.
 *
 * Features:
 *   - Discord Gateway WebSocket connection for bot events
 *   - Webhook-based match event broadcasting (ring phases, kills, world transitions)
 *   - Slash commands: /khaaos_status, /khaaos_ranking, /khaaos_match
 *   - Rich embeds with species-colored accents
 *   - Rate-limited to prevent Discord API abuse
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DiscordBotConfig {
  botToken: string;
  applicationId: string;
  webhookUrl: string;
  guildId?: string;
  channelId?: string;
  /** Max messages per minute (Discord rate limit: ~30/msg/min for webhooks) */
  rateLimitPerMinute: number;
}

export interface DiscordEmbed {
  title: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
  thumbnail?: { url: string };
  image?: { url: string };
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
}

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

// ─── Species Colors ─────────────────────────────────────────────────────────

const SPECIES_COLORS: Record<string, number> = {
  HURAN:  0x3498DB,  // Blue
  KHAEL:  0x9B59B6,  // Purple
  VENEX:  0x2ECC71,  // Green
  ONITH:  0xE67E22,  // Orange
  ZHEERS: 0xF1C40F,  // Yellow
  SKEETW: 0x95A5A6,  // Gray
};

const EVENT_COLORS: Record<string, number> = {
  MATCH_START:        0x00FF00,  // Green
  MATCH_END:          0xFF0000,  // Red
  KILL_FEED:          0xFF6600,  // Orange
  RING_PHASE:         0xFFFF00,  // Yellow
  RING_FINAL:         0xFF0000,  // Red
  WORLD_TRANSITION:   0x4B0082,  // Indigo
  PLAYER_DOWNED:      0xFFA500,  // Orange
  PLAYER_REVIVED:     0x00CED1,  // Teal
  SPECTATOR_JOIN:     0x808080,  // Gray
  LEADERBOARD_UPDATE: 0xFFD700,  // Gold
  ECONOMY_ALERT:      0xFF4500,  // Red-Orange
};

// ─── Rate Limiter ───────────────────────────────────────────────────────────

class RateLimiter {
  private timestamps: number[] = [];
  private maxPerMinute: number;

  constructor(maxPerMinute: number) {
    this.maxPerMinute = maxPerMinute;
  }

  /** Check if a message can be sent without exceeding rate limit. */
  canSend(): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;
    this.timestamps = this.timestamps.filter(t => t > oneMinuteAgo);
    return this.timestamps.length < this.maxPerMinute;
  }

  /** Record that a message was sent. */
  record(): void {
    this.timestamps.push(Date.now());
  }
}

// ─── DiscordBot Class ───────────────────────────────────────────────────────

export class DiscordBot {
  private config: DiscordBotConfig;
  private rateLimiter: RateLimiter;
  private gatewayWs: WebSocket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private isConnected: boolean = false;
  private eventQueue: DiscordMessage[] = [];
  private stats = {
    messagesSent: 0,
    messagesDropped: 0,
    eventsProcessed: 0,
    lastConnectedAt: 0,
    reconnects: 0,
  };

  constructor(config: Partial<DiscordBotConfig> & { webhookUrl: string }) {
    this.config = {
      botToken: config.botToken || process.env.DISCORD_BOT_TOKEN || "",
      applicationId: config.applicationId || process.env.DISCORD_APPLICATION_ID || "",
      webhookUrl: config.webhookUrl,
      guildId: config.guildId || process.env.DISCORD_GUILD_ID,
      channelId: config.channelId || process.env.DISCORD_CHANNEL_ID,
      rateLimitPerMinute: config.rateLimitPerMinute || 25,
    };
    this.rateLimiter = new RateLimiter(this.config.rateLimitPerMinute);
  }

  /**
   * Initialize the Discord bot — connect to Gateway if token available.
   */
  async initialize(): Promise<void> {
    console.log(`[DiscordBot] Initializing...`);

    if (this.config.botToken) {
      try {
        await this.connectGateway();
      } catch (err) {
        console.warn(`[DiscordBot] Gateway connection failed, falling back to webhook-only:`, err);
      }
    }

    // Register slash commands if we have application ID + guild
    if (this.config.botToken && this.config.applicationId && this.config.guildId) {
      await this.registerSlashCommands();
    }

    console.log(`[DiscordBot] Ready (gateway=${this.isConnected}, webhook=${!!this.config.webhookUrl})`);
  }

  /**
   * Connect to Discord Gateway WebSocket.
   */
  private async connectGateway(): Promise<void> {
    // Get Gateway URL
    const response = await fetch("https://discord.com/api/v10/gateway/bot", {
      headers: { Authorization: `Bot ${this.config.botToken}` },
    });

    if (!response.ok) throw new Error(`Gateway API returned ${response.status}`);
    const { url } = await response.json() as { url: string };

    this.gatewayWs = new WebSocket(url + "/?v=10&encoding=json");

    this.gatewayWs.on("message", (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        this.handleGatewayEvent(payload);
      } catch { /* ignore */ }
    });

    this.gatewayWs.on("close", () => {
      this.isConnected = false;
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      console.log("[DiscordBot] Gateway disconnected");
      // Auto-reconnect after 5 seconds
      setTimeout(() => this.connectGateway(), 5_000);
    });

    return new Promise((resolve, reject) => {
      this.gatewayWs!.on("open", () => {
        this.isConnected = true;
        this.stats.lastConnectedAt = Date.now();
        console.log("[DiscordBot] Gateway connected");
        resolve();
      });
      this.gatewayWs!.on("error", reject);
    });
  }

  /**
   * Handle incoming Gateway events (READY, INTERACTION_CREATE, etc.)
   */
  private handleGatewayEvent(payload: any): void {
    switch (payload.op) {
      case 10: { // HELLO
        const interval = payload.d.heartbeat_interval;
        this.heartbeatInterval = setInterval(() => {
          if (this.gatewayWs?.readyState === 1) {
            this.gatewayWs.send(JSON.stringify({ op: 1, d: null }));
          }
        }, interval);
        break;
      }
      case 0: { // DISPATCH
        if (payload.t === "INTERACTION_CREATE") {
          this.handleInteraction(payload.d);
        }
        break;
      }
      case 11: { // HEARTBEAT_ACK
        break;
      }
    }
  }

  /**
   * Handle slash command interactions.
   */
  private handleInteraction(interaction: any): void {
    if (interaction.type !== 2) return; // APPLICATION_COMMAND

    const commandName = interaction.data.name;
    let responseContent = "";

    switch (commandName) {
      case "khaaos_status":
        responseContent = this.formatStatusResponse();
        break;
      case "khaaos_ranking":
        responseContent = "📊 Ranking: Use `/api/ranking/leaderboard` for live data";
        break;
      case "khaaos_match":
        responseContent = "⚔️ Match: Use `/api/rooms` for active matches";
        break;
      default:
        responseContent = "Comando desconhecido";
    }

    // Respond to interaction
    if (this.config.applicationId) {
      fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${this.config.botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
          data: { content: responseContent },
        }),
      }).catch(() => {});
    }
  }

  /**
   * Register slash commands with Discord.
   */
  private async registerSlashCommands(): Promise<void> {
    const commands = [
      {
        name: "khaaos_status",
        description: "Ver status atual do Khaaos Run",
      },
      {
        name: "khaaos_ranking",
        description: "Ver leaderboard dos melhores operatives",
      },
      {
        name: "khaaos_match",
        description: "Ver partidas ativas do Battle Royale",
      },
    ];

    try {
      await fetch(
        `https://discord.com/api/v10/applications/${this.config.applicationId}/guilds/${this.config.guildId}/commands`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bot ${this.config.botToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(commands),
        }
      );
      console.log(`[DiscordBot] Registered ${commands.length} slash commands`);
    } catch (err) {
      console.warn(`[DiscordBot] Failed to register slash commands:`, err);
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Broadcast a match event to Discord via webhook.
   */
  async broadcastEvent(eventType: DiscordEventType, data: Record<string, any>): Promise<boolean> {
    this.stats.eventsProcessed++;

    const embed = this.buildEventEmbed(eventType, data);
    const message: DiscordMessage = { embeds: [embed] };

    return this.sendMessage(message);
  }

  /**
   * Send a kill feed entry.
   */
  async sendKillFeed(killer: string, killerSpecies: string, victim: string, victimSpecies: string, weapon: string): Promise<boolean> {
    return this.broadcastEvent("KILL_FEED", {
      killer, killerSpecies, victim, victimSpecies, weapon,
    });
  }

  /**
   * Send match start notification.
   */
  async sendMatchStart(roomId: string, playerCount: number, worldId: string): Promise<boolean> {
    return this.broadcastEvent("MATCH_START", { roomId, playerCount, worldId });
  }

  /**
   * Send match end notification with winner.
   */
  async sendMatchEnd(roomId: string, winnerId: string, winnerSpecies: string, totalKills: number): Promise<boolean> {
    return this.broadcastEvent("MATCH_END", { roomId, winnerId, winnerSpecies, totalKills });
  }

  /**
   * Send ring phase change notification.
   */
  async sendRingPhase(worldId: string, phase: number, damagePerTick: number): Promise<boolean> {
    const eventType: DiscordEventType = phase >= 5 ? "RING_FINAL" : "RING_PHASE";
    return this.broadcastEvent(eventType, { worldId, phase, damagePerTick });
  }

  /**
   * Send world transition notification.
   */
  async sendWorldTransition(fromWorld: string, toWorld: string, playerCount: number): Promise<boolean> {
    return this.broadcastEvent("WORLD_TRANSITION", { fromWorld, toWorld, playerCount });
  }

  // ─── Internal Methods ─────────────────────────────────────────────────────

  /**
   * Build a Discord embed for an event type.
   */
  private buildEventEmbed(eventType: DiscordEventType, data: Record<string, any>): DiscordEmbed {
    const color = EVENT_COLORS[eventType] || 0x00FF00;

    switch (eventType) {
      case "KILL_FEED":
        return {
          title: "💀 Kill Feed",
          color: SPECIES_COLORS[data.victimSpecies] || color,
          fields: [
            { name: "Killer", value: `${data.killer} (${data.killerSpecies})`, inline: true },
            { name: "Victim", value: `${data.victim} (${data.victimSpecies})`, inline: true },
            { name: "Weapon", value: data.weapon, inline: true },
          ],
          timestamp: new Date().toISOString(),
        };
      case "MATCH_START":
        return {
          title: "⚔️ Match Iniciando",
          description: `Sala **${data.roomId}** — ${data.playerCount} operatives`,
          color,
          fields: [{ name: "World", value: data.worldId, inline: true }],
          timestamp: new Date().toISOString(),
        };
      case "MATCH_END":
        return {
          title: "🏆 Match Finalizada",
          description: `Vencedor: **${data.winnerId}** (${data.winnerSpecies})`,
          color: SPECIES_COLORS[data.winnerSpecies] || 0xFFD700,
          fields: [{ name: "Total Kills", value: String(data.totalKills), inline: true }],
          timestamp: new Date().toISOString(),
        };
      case "RING_PHASE":
      case "RING_FINAL":
        return {
          title: eventType === "RING_FINAL" ? "🔴 RING FINAL" : "🟡 Ring Phase",
          color,
          fields: [
            { name: "World", value: data.worldId, inline: true },
            { name: "Phase", value: String(data.phase), inline: true },
            { name: "Dano/tick", value: String(data.damagePerTick), inline: true },
          ],
          timestamp: new Date().toISOString(),
        };
      case "WORLD_TRANSITION":
        return {
          title: "🌀 Portal Khaaos Ativo",
          description: `Transição: **${data.fromWorld}** → **${data.toWorld}**`,
          color,
          fields: [{ name: "Operatives", value: String(data.playerCount), inline: true }],
          timestamp: new Date().toISOString(),
        };
      default:
        return {
          title: `Khaaos Run — ${eventType}`,
          description: JSON.stringify(data),
          color,
          timestamp: new Date().toISOString(),
        };
    }
  }

  /**
   * Send a message to Discord via webhook.
   */
  private async sendMessage(message: DiscordMessage): Promise<boolean> {
    if (!this.config.webhookUrl) return false;
    if (!this.rateLimiter.canSend()) {
      this.stats.messagesDropped++;
      this.eventQueue.push(message); // queue for later
      return false;
    }

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });

      if (response.ok) {
        this.rateLimiter.record();
        this.stats.messagesSent++;
        return true;
      }
      this.stats.messagesDropped++;
      return false;
    } catch {
      this.stats.messagesDropped++;
      return false;
    }
  }

  /**
   * Format status response for slash command.
   */
  private formatStatusResponse(): string {
    return [
      `🎮 **Khaaos Run** — Battle Royale`,
      `📡 Gateway: ${this.isConnected ? "✅ Connected" : "❌ Offline"}`,
      `🔗 Webhook: ${this.config.webhookUrl ? "✅ Configured" : "❌ Not set"}`,
      `📨 Messages sent: ${this.stats.messagesSent}`,
      `⏭️ Messages dropped: ${this.stats.messagesDropped}`,
      `🔄 Events processed: ${this.stats.eventsProcessed}`,
    ].join("\n");
  }

  /**
   * Get bot statistics.
   */
  getStats() {
    return { ...this.stats, isConnected: this.isConnected, queueSize: this.eventQueue.length };
  }

  /**
   * Check if bot is operational.
   */
  isOperational(): boolean {
    return this.isConnected || !!this.config.webhookUrl;
  }

  /**
   * Graceful shutdown.
   */
  async shutdown(): Promise<void> {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.gatewayWs) this.gatewayWs.close();
    this.isConnected = false;
    console.log("[DiscordBot] Shutdown complete");
  }
}
