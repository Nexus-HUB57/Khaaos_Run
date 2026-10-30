// Khaaos Run — M4: ponte server-side EOS NATIVA (runtime autoritativo).
//
// O cliente UE5 fala com o EOS SDK nativamente (Unreal/KhaaosRun/.../Game/EOS);
// o DEDICATED SERVER nativo hospeda a sessão EOS (HostDedicatedServerSession) e
// PRECISA ancorar essa sessão ao runtime autoritativo — a sala que o runtime
// possui (ownership/fencing M3/M4) é a fonte de verdade da sessão.
//
// Princípios (roadmap M4):
//   - SEM MOCK no caminho de runtime: sem credenciais, a ponte responde
//     `unconfigured` e REJEITA operações (o mock vive apenas nos unit tests,
//     que injetam config de teste explicitamente).
//   - Âncora por ownership: uma sessão EOS só se registra contra uma sala que
//     ESTA réplica possui (lease vivo, não congelada) — sessão não sobrevive
//     à perda de posse (fencing tokens, Kleppmann).
//   - TTL por heartbeat: a sessão expira sem coração batendo (3 janelas) —
//     crash do dedicated server não vaza sessão fantasma.
//   - Nenhum segredo sai daqui: `status()` lista o que falta, jamais o valor.
import crypto from 'node:crypto';

export const EOS_SDK_VERSION = '1.16.0';
export const EOS_SUBSYSTEMS = ['Auth', 'Sessions', 'Lobbies', 'Voice', 'Stats'];

const REQUIRED_KEYS = ['productId', 'sandboxId', 'deploymentId', 'clientId', 'clientSecret'];

// Env → config (valores NUNCA expostos por status()).
export function eosConfigFromEnv(env = process.env) {
  return {
    productId: env.EOS_PRODUCT_ID || '',
    sandboxId: env.EOS_SANDBOX_ID || '',
    deploymentId: env.EOS_DEPLOYMENT_ID || '',
    clientId: env.EOS_CLIENT_ID || '',
    clientSecret: env.EOS_CLIENT_SECRET || '',
    encryptionKey: env.EOS_ENCRYPTION_KEY || '',
    region: env.EOS_REGION || 'sa1',
  };
}

const SESSION_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const HEARTBEAT_WINDOW_MS = 90_000; // 3 batidas perdidas → sessão morta
const HEARTBEAT_TICK_MS = 30_000;

export function createEosBridge({ config = eosConfigFromEnv(), isRoomOwnedLocally = () => true, now = () => Date.now() } = {}) {
  const cfg = config || {};
  const missing = REQUIRED_KEYS.filter((k) => !String(cfg[k] || '').trim());
  const configured = missing.length === 0;
  const sessions = new Map(); // sessionId → { roomId, hostAddress, maxPlayers, worldId, region, createdAt, expiresAt, endedAt }
  let cleanupTimer = null;

  const assertNative = () => {
    if (!configured) {
      const error = new Error(`EOS nativo não configurado — ausentes: ${missing.join(', ')}`);
      error.code = 'EOS_UNCONFIGURED';
      throw error;
    }
  };

  function start() {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(() => {
      const t = now();
      for (const [id, s] of sessions) if (!s.endedAt && s.expiresAt <= t) sessions.delete(id);
    }, HEARTBEAT_TICK_MS);
    if (cleanupTimer.unref) cleanupTimer.unref();
  }

  function stop() {
    if (cleanupTimer) clearInterval(cleanupTimer);
    cleanupTimer = null;
    sessions.clear();
  }

  // Registra (ancora) uma sessão EOS nativa à sala possuída por ESTA réplica.
  function registerSession({ sessionId, roomId, hostAddress, maxPlayers, worldId = 'CIGKV', region = cfg.region || 'sa1' }) {
    assertNative();
    if (!SESSION_ID_RE.test(String(sessionId || ''))) {
      const error = new Error('sessionId EOS inválido (8-64 alfanumérico/hífen)');
      error.code = 'EOS_SESSION_ID_INVALID';
      throw error;
    }
    if (!roomId || typeof roomId !== 'string') {
      const error = new Error('roomId obrigatório — sessão EOS sem sala do runtime é rejeitada');
      error.code = 'EOS_ROOM_REQUIRED';
      throw error;
    }
    // Fencing: a sala deve pertencer a ESTA réplica (lease vivo, não congelada).
    if (!isRoomOwnedLocally(roomId)) {
      const error = new Error(`sala ${roomId} não é possuída por esta réplica — sessão EOS não pode ancorar (fencing)`);
      error.code = 'EOS_ROOM_NOT_OWNED';
      throw error;
    }
    const existing = sessions.get(sessionId);
    const t = now();
    if (existing && !existing.endedAt) {
      existing.expiresAt = t + HEARTBEAT_WINDOW_MS; // re-anchor idempotente
      return { sessionId, roomId, renewed: true, expiresAt: existing.expiresAt };
    }
    const session = {
      sessionId, roomId,
      hostAddress: String(hostAddress || '').slice(0, 255),
      maxPlayers: Math.max(1, Math.min(100, Number(maxPlayers) || 60)),
      worldId: String(worldId || 'CIGKV').slice(0, 32),
      region: String(region || 'sa1').slice(0, 16),
      createdAt: t,
      expiresAt: t + HEARTBEAT_WINDOW_MS,
      endedAt: null,
    };
    sessions.set(sessionId, session);
    return { sessionId, roomId, created: true, expiresAt: session.expiresAt };
  }

  function heartbeat(sessionId) {
    assertNative();
    const s = sessions.get(String(sessionId || ''));
    if (!s || s.endedAt) {
      const error = new Error(`sessão EOS ${sessionId} desconhecida ou encerrada`);
      error.code = 'EOS_SESSION_UNKNOWN';
      throw error;
    }
    s.expiresAt = now() + HEARTBEAT_WINDOW_MS;
    return { sessionId: s.sessionId, expiresAt: s.expiresAt };
  }

  function endSession(sessionId) {
    assertNative();
    const s = sessions.get(String(sessionId || ''));
    if (!s) {
      const error = new Error(`sessão EOS ${sessionId} desconhecida`);
      error.code = 'EOS_SESSION_UNKNOWN';
      throw error;
    }
    s.endedAt = now();
    return { sessionId: s.sessionId, roomId: s.roomId, ended: true };
  }

  function list() {
    return [...sessions.values()].map(({ sessionId, roomId, hostAddress, maxPlayers, worldId, region, createdAt, expiresAt, endedAt }) => ({ sessionId, roomId, hostAddress, maxPlayers, worldId, region, createdAt, expiresAt, endedAt }));
  }

  // Status SEM segredos: o que está faltando, versão do SDK, modo.
  function status() {
    return {
      mode: configured ? 'native' : 'unconfigured',
      configured,
      missing,
      sdkVersion: EOS_SDK_VERSION,
      subsystems: EOS_SUBSYSTEMS,
      region: configured ? (cfg.region || 'sa1') : null,
      sessions: { active: [...sessions.values()].filter((s) => !s.endedAt).length },
      sessionTimeout: { heartbeatWindowMs: HEARTBEAT_WINDOW_MS },
    };
  }

  return {
    configured, missing, status, registerSession, heartbeat, endSession, list,
    start, stop, assertNative,
    // internals para unit tests (mock boundary)
    __sessions: sessions,
    __config: cfg,
    __newSessionId: () => crypto.randomUUID(),
  };
}
