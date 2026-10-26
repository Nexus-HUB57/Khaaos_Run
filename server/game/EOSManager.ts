/**
 * KHAAOS RUN — EOS Manager
 * ========================
 * Epic Online Services (EOS) Platform wrapper.
 * Handles authentication, sessions, and player management.
 */

// ─── EOS Player ──────────────────────────────────────────────────────────────

export interface EOSPlayer {
  eosId: string;
  displayName: string;
  authenticated: boolean;
  lastLogin: number;
}

// ─── EOS Session ─────────────────────────────────────────────────────────────

export interface EOSSession {
  sessionId: string;
  playerId: string;
  worldId: string;
  createdAt: number;
  expiresAt: number;
}

// ─── EOS Manager Stats ───────────────────────────────────────────────────────

export interface EOSManagerStats {
  totalPlayers: number;
  activeSessions: number;
  initialized: boolean;
}

// ─── EOSManager Class ────────────────────────────────────────────────────────

export class EOSManager {
  private initialized = false;
  private players: Map<string, EOSPlayer> = new Map();
  private sessions: Map<string, EOSSession> = new Map();
  private sessionCounter = 0;
  private clientId?: string;
  private clientSecret?: string;

  constructor(config?: { clientId?: string; clientSecret?: string }) {
    this.clientId = config?.clientId;
    this.clientSecret = config?.clientSecret;
  }

  /** Initialize the EOS manager */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;
    // In production: connect to EOS SDK
    this.initialized = true;
    return true;
  }

  /** Authenticate a player via EOS */
  async authenticatePlayer(eosId: string, displayName?: string): Promise<EOSPlayer | null> {
    if (!this.initialized) return null;

    const player: EOSPlayer = {
      eosId,
      displayName: displayName ?? `Player_${eosId.slice(0, 8)}`,
      authenticated: true,
      lastLogin: Date.now(),
    };

    this.players.set(eosId, player);
    return player;
  }

  /** Logout a player */
  async logoutPlayer(eosId: string): Promise<boolean> {
    const player = this.players.get(eosId);
    if (!player) return false;

    player.authenticated = false;

    // Destroy any active sessions for this player
    for (const [sessionId, session] of this.sessions) {
      if (session.playerId === eosId) {
        this.sessions.delete(sessionId);
      }
    }

    return true;
  }

  /** Create a session for a player */
  async createSession(playerId: string, worldId: string, ttlMs = 3600000): Promise<EOSSession | null> {
    if (!this.initialized) return null;
    const player = this.players.get(playerId);
    if (!player || !player.authenticated) return null;

    const now = Date.now();
    const session: EOSSession = {
      sessionId: `eos-sess-${++this.sessionCounter}`,
      playerId,
      worldId,
      createdAt: now,
      expiresAt: now + ttlMs,
    };

    this.sessions.set(session.sessionId, session);
    return session;
  }

  /** Destroy a session */
  async destroySession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  /** Get a player by EOS ID */
  getPlayer(eosId: string): EOSPlayer | undefined {
    return this.players.get(eosId);
  }

  /** Get a session by ID */
  getSession(sessionId: string): EOSSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Check if initialized */
  isInitialized(): boolean {
    return this.initialized;
  }

  /** Get stats */
  getStats(): EOSManagerStats {
    return {
      totalPlayers: this.players.size,
      activeSessions: this.sessions.size,
      initialized: this.initialized,
    };
  }

  /** Shutdown the EOS manager */
  async shutdown(): Promise<void> {
    this.initialized = false;
    this.sessions.clear();
    for (const player of this.players.values()) {
      player.authenticated = false;
    }
  }
}
