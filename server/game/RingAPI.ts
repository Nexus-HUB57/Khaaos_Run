// Khaaos Run — Ring & Spectator API Module
// Provides ring state, spectator, airdrop, and Discord webhook endpoints

import { Express, Request, Response } from "express";
import { WebSocket } from "ws";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RingPhase {
  phaseIndex: number;
  radiusStart: number;
  radiusEnd: number;
  durationSeconds: number;
  damagePerTick: number;
  shrinkSpeed: number;
}

interface WaterZone {
  type: string;
  center: [number, number, number];
  radius: number;
  depth: number;
  damageModifier: number;
}

interface RingWorldConfig {
  worldId: string;
  worldName: string;
  capacity: number;
  ringPhases: number;
  phases: RingPhase[];
  waterZones: WaterZone[];
}

interface RingState {
  worldId: string;
  currentPhase: number;
  currentRadius: number;
  targetRadius: number;
  damagePerTick: number;
  ringCenter: [number, number, number];
  isShrinking: boolean;
  playersInSafe: number;
  playersInDanger: number;
  nextPhaseIn: number; // seconds
}

interface SpectatorSession {
  id: string;
  cameraMode: "FREECAM" | "FOLLOW_PLAYER" | "OVERHEAD" | "RING_CENTER";
  followPlayerId?: string;
  connectedAt: number;
}

// ─── Ring State Manager ──────────────────────────────────────────────────────

class RingStateManager {
  private states: Map<string, RingState> = new Map();
  private config: Map<string, RingWorldConfig> = new Map();
  private spectators: Map<string, SpectatorSession> = new Map();
  private discordWebhookUrl: string = "";
  private broadcastEnabled: boolean = true;

  constructor(ringConfig: any) {
    // Load config from ring_config.json
    if (ringConfig?.world_pipeline) {
      for (const [key, value] of Object.entries(ringConfig.world_pipeline)) {
        if (key === "order" || key === "transition_trigger" || key === "transition_type") continue;
        const worldData = value as any;
        const worldConfig: RingWorldConfig = {
          worldId: key,
          worldName: worldData.name || key,
          capacity: worldData.capacity || 100,
          ringPhases: worldData.ring_phases || 0,
          phases: [],
          waterZones: worldData.water_zones || []
        };
        
        // Parse phases
        if (worldData.ring_config) {
          for (const [pKey, pValue] of Object.entries(worldData.ring_config)) {
            const phase = pValue as any;
            worldConfig.phases.push({
              phaseIndex: parseInt(pKey.replace("phase_", "")) - 1,
              radiusStart: phase.radius_start,
              radiusEnd: phase.radius_end,
              durationSeconds: phase.duration_s,
              damagePerTick: phase.damage_per_tick,
              shrinkSpeed: phase.shrink_speed || 1.0
            });
          }
        }
        
        this.config.set(key, worldConfig);
      }
    }

    // Load Discord config
    this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || "";
    this.broadcastEnabled = !!this.discordWebhookUrl;

    console.log(`[RingAPI] Initialized with ${this.config.size} worlds, discord=${this.broadcastEnabled}`);
  }

  getRingState(worldId: string): RingState | null {
    return this.states.get(worldId) || null;
  }

  getRingConfig(worldId: string): RingWorldConfig | null {
    return this.config.get(worldId) || null;
  }

  updateRingState(worldId: string, update: Partial<RingState>): RingState {
    const current = this.states.get(worldId) || {
      worldId,
      currentPhase: 0,
      currentRadius: 800,
      targetRadius: 600,
      damagePerTick: 1,
      ringCenter: [0, 0, 0],
      isShrinking: false,
      playersInSafe: 0,
      playersInDanger: 0,
      nextPhaseIn: 180
    };
    
    const updated = { ...current, ...update };
    this.states.set(worldId, updated);
    return updated;
  }

  // ─── Spectator Management ────────────────────────────────────────────────

  addSpectator(session: SpectatorSession): void {
    this.spectators.set(session.id, session);
    console.log(`[RingAPI] Spectator ${session.id} connected (${session.cameraMode})`);
  }

  removeSpectator(sessionId: string): void {
    this.spectators.delete(sessionId);
  }

  getSpectators(): SpectatorSession[] {
    return Array.from(this.spectators.values());
  }

  setSpectatorCamera(sessionId: string, mode: SpectatorSession["cameraMode"]): void {
    const session = this.spectators.get(sessionId);
    if (session) session.cameraMode = mode;
  }

  // ─── Discord Broadcast ───────────────────────────────────────────────────

  async broadcastToDiscord(eventType: string, data: string): Promise<void> {
    if (!this.broadcastEnabled || !this.discordWebhookUrl) return;

    const colorMap: Record<string, number> = {
      RING_START: 65280,
      RING_SHRINKING: 16776960,
      RING_CLOSED: 16711680,
      WORLD_TRANSITION: 4915330,
      FINAL_RING: 16711680,
    };

    const nameMap: Record<string, string> = {
      RING_START: "Ring Iniciando",
      RING_SHRINKING: "Ring Fechando",
      RING_CLOSED: "Ring Fechou",
      WORLD_TRANSITION: "Portal Khaaos Ativo",
      FINAL_RING: "RING FINAL",
    };

    const payload = {
      embeds: [{
        title: "Khaaos Run",
        description: nameMap[eventType] || eventType,
        color: colorMap[eventType] || 65280,
        fields: [{ name: "Evento", value: data, inline: true }],
        timestamp: new Date().toISOString()
      }]
    };

    try {
      await fetch(this.discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      console.log(`[Discord] Broadcast: ${eventType}`);
    } catch (err) {
      console.error(`[Discord] Broadcast failed:`, err);
    }
  }

  // ─── Airdrop Probability ─────────────────────────────────────────────────

  getAirdropProbability(phase: number): number {
    const probs = [0.3, 0.5, 0.7, 0.9, 1.0, 1.0];
    return probs[Math.min(phase - 1, probs.length - 1)] || 0.3;
  }
}

// ─── Export Ring API Routes ───────────────────────────────────────────────────

export function createRingAPI(ringConfig: any): { 
  ringManager: RingStateManager;
  router: (app: Express) => void;
} {
  const ringManager = new RingStateManager(ringConfig);

  const router = (app: Express) => {
    // ─── Ring State ──────────────────────────────────────────────────────────

    app.get("/api/ring/state/:worldId", (req: Request, res: Response) => {
      const state = ringManager.getRingState(req.params.worldId);
      if (!state) {
        return res.status(404).json({ error: "World not found or ring not initialized" });
      }
      res.json(state);
    });

    app.get("/api/ring/config/:worldId", (req: Request, res: Response) => {
      const config = ringManager.getRingConfig(req.params.worldId);
      if (!config) {
        return res.status(404).json({ error: "World config not found" });
      }
      res.json(config);
    });

    app.post("/api/ring/state/:worldId", (req: Request, res: Response) => {
      const updated = ringManager.updateRingState(req.params.worldId, req.body);
      
      // Auto-broadcast phase changes to Discord
      if (req.body.currentPhase !== undefined) {
        ringManager.broadcastToDiscord("RING_SHRINKING", 
          `World ${req.params.worldId} Phase ${req.body.currentPhase}`);
      }
      
      res.json(updated);
    });

    // ─── Spectator ──────────────────────────────────────────────────────────

    app.get("/api/ring/spectators", (_req: Request, res: Response) => {
      res.json({ spectators: ringManager.getSpectators(), count: ringManager.getSpectators().length });
    });

    app.post("/api/ring/spectator/join", (req: Request, res: Response) => {
      const session: SpectatorSession = {
        id: `spec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        cameraMode: req.body.cameraMode || "RING_CENTER",
        connectedAt: Date.now()
      };
      ringManager.addSpectator(session);
      res.json(session);
    });

    app.post("/api/ring/spectator/:id/camera", (req: Request, res: Response) => {
      ringManager.setSpectatorCamera(req.params.id, req.body.cameraMode);
      res.json({ ok: true });
    });

    // ─── Airdrop ────────────────────────────────────────────────────────────

    app.get("/api/ring/airdrop/probability/:phase", (req: Request, res: Response) => {
      const phase = parseInt(req.params.phase);
      res.json({ phase, probability: ringManager.getAirdropProbability(phase) });
    });

    // ─── Discord ───────────────────────────────────────────────────────────

    app.post("/api/ring/broadcast", async (req: Request, res: Response) => {
      const { eventType, data } = req.body;
      await ringManager.broadcastToDiscord(eventType, data);
      res.json({ ok: true, broadcast: ringManager.broadcastEnabled });
    });

    app.get("/api/ring/discord/status", (_req: Request, res: Response) => {
      res.json({ 
        enabled: ringManager.broadcastEnabled, 
        webhookConfigured: !!process.env.DISCORD_WEBHOOK_URL 
      });
    });
  };

  return { ringManager, router };
}
