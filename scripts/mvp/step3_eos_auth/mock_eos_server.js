#!/usr/bin/env node
// ============================================================================
// Khaaos Run — Mock EOS Server (Step 3: Auth + Matchmaking)
// ============================================================================
// Simulates all 5 EOS subsystems for development/testing WITHOUT real Epic
// credentials. Matches the C++ classes:
//   KhaaosEOSManager    → Auth Service
//   KhaaosEOSLobby      → Lobby Service
//   KhaaosEOSMatchmaking → Matchmaking Service
//   KhaaosEOSSession    → Sessions Service
//   KhaaosCloudSave     → Cloud Save Service
// ============================================================================

'use strict';

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { WebSocket, WebSocketServer } = require('ws');

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = process.env.EOS_MOCK_PORT || 8989;
const TOKEN_EXPIRY_SECONDS = 3600;          // 1 hour
const HEARTBEAT_INTERVAL_MS = 30000;        // 30s
const MATCHMAKING_CHECK_MS = 2000;          // Check pool every 2s
const MIN_PLAYERS_FOR_MATCH = 2;            // Auto-match threshold
const MAX_PLAYERS_PER_MATCH = 50;           // CIGKV 50-player matches

// ─── In-Memory Stores ─────────────────────────────────────────────────────────

const sessions = new Map();      // authToken → session obj
const lobbies = new Map();       // lobbyId → lobby obj
const mmTickets = new Map();     // ticketId → ticket obj
const eosSessions = new Map();   // sessionId → session obj
const cloudData = new Map();     // key → { value, checksum, timestamp }
const wsClients = new Set();     // connected WS clients

// ─── Matchmaking Pools ────────────────────────────────────────────────────────
// Maps to C++ KhaaosEOSMatchmaking::FMatchmakingConfig

const MATCHMAKING_POOLS = {
  CIGKV_Training: {
    poolName: 'CIGKV_Training',
    region: 'sa1',
    minPlayers: 2,
    maxPlayers: 50,
    skillRange: 200,
    gameMode: 'Training',
    world: 'CIGKV',
    queue: [],
  },
  W1_Barburhen_Solo: {
    poolName: 'W1_Barburhen_Solo',
    region: 'sa1',
    minPlayers: 2,
    maxPlayers: 100,
    skillRange: 300,
    gameMode: 'Solo',
    world: 'Barburhen',
    queue: [],
  },
  W2_Ckesalth_Duo: {
    poolName: 'W2_Ckesalth_Duo',
    region: 'na1',
    minPlayers: 4,
    maxPlayers: 100,
    skillRange: 250,
    gameMode: 'Duo',
    world: 'Ckesalth',
    queue: [],
  },
  W3_Priadus_Squad: {
    poolName: 'W3_Priadus_Squad',
    region: 'eu1',
    minPlayers: 8,
    maxPlayers: 100,
    skillRange: 200,
    gameMode: 'Squad',
    world: 'Priadus',
    queue: [],
  },
  W4_Arukheea_BR: {
    poolName: 'W4_Arukheea_BR',
    region: 'sa1',
    minPlayers: 10,
    maxPlayers: 100,
    skillRange: 150,
    gameMode: 'BattleRoyale',
    world: 'Arukheea',
    queue: [],
  },
};

// ─── Regions ──────────────────────────────────────────────────────────────────
// Maps to C++ KhaaosEOSRegionManager::FKhaaosEOSRegion

const REGIONS = {
  sa1: { id: 'sa1', name: 'South America - Sao Paulo', endpoint: 'eos-sa1.epicgames.com', lat: -23.5505, lon: -46.6333, maxLobby: 100, maxServer: 50, ping: 20 },
  na1: { id: 'na1', name: 'North America - Virginia', endpoint: 'eos-na1.epicgames.com', lat: 37.4316, lon: -78.6569, maxLobby: 100, maxServer: 50, ping: 120 },
  eu1: { id: 'eu1', name: 'Europe - Frankfurt', endpoint: 'eos-eu1.epicgames.com', lat: 50.1109, lon: 8.6821, maxLobby: 100, maxServer: 50, ping: 180 },
};

// ─── Utility Functions ────────────────────────────────────────────────────────

function generateId(prefix = '') {
  return prefix + crypto.randomUUID().replace(/-/g, '');
}

function generateToken(userId) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomUUID();  // Unique token ID to ensure distinctness
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    iat: now,
    exp: now + TOKEN_EXPIRY_SECONDS,
    iss: 'khaaos-mock-eos',
    aud: 'khaaos-run',
    jti,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', 'khaaos-mock-secret').update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function simulateLZ4Compress(data) {
  // Simulated compression ratio (LZ4 typically 2-3x on structured data)
  const json = JSON.stringify(data);
  return { originalSize: json.length, compressedSize: Math.ceil(json.length * 0.45), ratio: 0.45 };
}

function logRequest(req, status, detail = '') {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path} → ${status} ${detail}`);
}

// ─── Auth Middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ errorCode: 'errors.com.epicgames.common.authentication.authorization_failed', message: 'Bearer token required' });
  }
  const payload = verifyToken(auth.slice(7));
  if (!payload) {
    return res.status(401).json({ errorCode: 'errors.com.epicgames.common.authentication.token_expired', message: 'Token expired or invalid' });
  }
  req.userId = payload.sub;
  next();
}

// ─── WebSocket Broadcast ──────────────────────────────────────────────────────

function broadcastWS(type, data) {
  const msg = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();

app.use(express.json({ limit: '2mb' }));

// CORS for UE5 client
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-EOS-Region');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logRequest(req, res.statusCode, `(${Date.now() - start}ms)`);
  });
  next();
});

// ─── Health Endpoint ──────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'khaaos-mock-eos',
    version: '1.0.0-step3',
    uptime: process.uptime(),
    subsystems: {
      auth: { activeSessions: sessions.size },
      lobby: { activeLobbies: lobbies.size },
      matchmaking: { activeTickets: mmTickets.size, pools: Object.keys(MATCHMAKING_POOLS) },
      sessions: { activeSessions: eosSessions.size },
      cloudSave: { storedKeys: cloudData.size },
    },
    regions: Object.keys(REGIONS),
  });
});

// ============================================================================
// 1. AUTH SERVICE — Maps to KhaaosEOSManager
// ============================================================================

app.post('/auth/login', (req, res) => {
  const { deviceId, externalAccountId, externalAccountType, displayName } = req.body;

  if (!deviceId && !externalAccountId) {
    return res.status(400).json({
      errorCode: 'errors.com.epicgames.common.authentication.authentication_failed',
      message: 'deviceId or externalAccountId required',
    });
  }

  const userId = externalAccountId || generateId('pu_');
  const token = generateToken(userId);
  const refreshToken = generateId('rt_');

  const session = {
    userId,
    displayName: displayName || `Player_${userId.slice(0, 8)}`,
    token,
    refreshToken,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TOKEN_EXPIRY_SECONDS * 1000).toISOString(),
    deviceId: deviceId || null,
    externalAccountType: externalAccountType || 'deviceid',
    productUserId: userId,
  };

  sessions.set(token, session);

  // EOS-style response format
  res.json({
    access_token: token,
    expires_in: TOKEN_EXPIRY_SECONDS,
    expires_at: session.expiresAt,
    token_type: 'bearer',
    refresh_token: refreshToken,
    account_id: userId,
    client_id: 'khaaos-mock-client',
    internal_id: userId,
    product_id: 'KHAOS_PRODUCT_ID',
    sandbox_id: 'KHAOS_SANDBOX_ID',
    deployment_id: 'KHAOS_DEPLOYMENT_ID',
    displayName: session.displayName,
  });
});

app.post('/auth/verify', requireAuth, (req, res) => {
  const token = req.headers.authorization.slice(7);
  const session = sessions.get(token);
  if (!session) {
    return res.status(401).json({ errorCode: 'errors.com.epicgames.common.authentication.token_not_found', message: 'Session not found' });
  }
  res.json({
    valid: true,
    userId: session.userId,
    displayName: session.displayName,
    productUserId: session.productUserId,
    expires_at: session.expiresAt,
  });
});

app.post('/auth/refresh', (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ errorCode: 'errors.com.epicgames.common.authentication.missing_refresh_token', message: 'refresh_token required' });
  }

  // Find session by refresh token
  let found = null;
  for (const [, s] of sessions) {
    if (s.refreshToken === refresh_token) { found = s; break; }
  }
  if (!found) {
    return res.status(401).json({ errorCode: 'errors.com.epicgames.common.authentication.invalid_refresh_token', message: 'Invalid refresh token' });
  }

  // Invalidate old token
  sessions.delete(found.token);

  // Generate new tokens
  const newToken = generateToken(found.userId);
  const newRefresh = generateId('rt_');
  found.token = newToken;
  found.refreshToken = newRefresh;
  found.expiresAt = new Date(Date.now() + TOKEN_EXPIRY_SECONDS * 1000).toISOString();
  sessions.set(newToken, found);

  res.json({
    access_token: newToken,
    expires_in: TOKEN_EXPIRY_SECONDS,
    expires_at: found.expiresAt,
    token_type: 'bearer',
    refresh_token: newRefresh,
    account_id: found.userId,
  });
});

app.post('/auth/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization.slice(7);
  sessions.delete(token);
  res.json({ success: true });
});

// ============================================================================
// 2. LOBBY SERVICE — Maps to KhaaosEOSLobby
// ============================================================================

app.post('/lobby/create', requireAuth, (req, res) => {
  const {
    maxMembers = 100,
    isPresence = true,
    attributes = {},
    region = 'sa1',
  } = req.body;

  const lobbyId = generateId('lobby_');
  const token = req.headers.authorization.slice(7);
  const session = sessions.get(token);

  const lobby = {
    lobbyId,
    ownerId: session.userId,
    ownerDisplayName: session.displayName,
    maxMembers,
    currentMembers: 1,
    isPresence,
    region,
    attributes: {
      world: attributes.world || 'CIGKV',
      rank_tier: attributes.rank_tier || 'unranked',
      region: attributes.region || region,
      game_mode: attributes.game_mode || 'Training',
      ...attributes,
    },
    members: [{ userId: session.userId, displayName: session.displayName, joinedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
    bucketId: `khaaos-lobby-${region}`,
  };

  lobbies.set(lobbyId, lobby);

  res.status(201).json({
    lobbyId,
    ownerId: session.userId,
    maxMembers,
    currentMembers: 1,
    attributes: lobby.attributes,
    createdAt: lobby.createdAt,
  });
});

app.post('/lobby/join', requireAuth, (req, res) => {
  const { lobbyId } = req.body;
  const lobby = lobbies.get(lobbyId);
  if (!lobby) {
    return res.status(404).json({ errorCode: 'errors.com.epicgames.lobby.not_found', message: 'Lobby not found' });
  }
  if (lobby.currentMembers >= lobby.maxMembers) {
    return res.status(409).json({ errorCode: 'errors.com.epicgames.lobby.lobby_full', message: 'Lobby is full' });
  }

  const token = req.headers.authorization.slice(7);
  const session = sessions.get(token);

  // Check if already in lobby
  if (lobby.members.some(m => m.userId === session.userId)) {
    return res.status(409).json({ errorCode: 'errors.com.epicgames.lobby.already_joined', message: 'Already in lobby' });
  }

  lobby.members.push({ userId: session.userId, displayName: session.displayName, joinedAt: new Date().toISOString() });
  lobby.currentMembers = lobby.members.length;

  broadcastWS('lobby_update', { lobbyId, action: 'member_joined', userId: session.userId, displayName: session.displayName, currentMembers: lobby.currentMembers });

  res.json({
    lobbyId,
    currentMembers: lobby.currentMembers,
    maxMembers: lobby.maxMembers,
    members: lobby.members,
  });
});

app.post('/lobby/leave', requireAuth, (req, res) => {
  const { lobbyId } = req.body;
  const lobby = lobbies.get(lobbyId);
  if (!lobby) {
    return res.status(404).json({ errorCode: 'errors.com.epicgames.lobby.not_found', message: 'Lobby not found' });
  }

  const token = req.headers.authorization.slice(7);
  const session = sessions.get(token);

  lobby.members = lobby.members.filter(m => m.userId !== session.userId);
  lobby.currentMembers = lobby.members.length;

  if (lobby.currentMembers === 0) {
    lobbies.delete(lobbyId);
  }

  broadcastWS('lobby_update', { lobbyId, action: 'member_left', userId: session.userId, currentMembers: lobby.currentMembers });

  res.json({ success: true, lobbyId });
});

app.get('/lobby/search', requireAuth, (req, res) => {
  const { world, region, game_mode, rank_tier, maxResults = 10 } = req.query;

  let results = [...lobbies.values()];

  if (world) results = results.filter(l => l.attributes.world === world);
  if (region) results = results.filter(l => l.attributes.region === region);
  if (game_mode) results = results.filter(l => l.attributes.game_mode === game_mode);
  if (rank_tier) results = results.filter(l => l.attributes.rank_tier === rank_tier);

  results = results.slice(0, Number(maxResults));

  res.json({
    count: results.length,
    lobbies: results.map(l => ({
      lobbyId: l.lobbyId,
      ownerId: l.ownerId,
      maxMembers: l.maxMembers,
      currentMembers: l.currentMembers,
      attributes: l.attributes,
      region: l.region,
    })),
  });
});

// ============================================================================
// 3. MATCHMAKING SERVICE — Maps to KhaaosEOSMatchmaking
// ============================================================================

app.post('/matchmaking/queue', requireAuth, (req, res) => {
  const {
    poolName = 'CIGKV_Training',
    region = 'sa1',
    skillRating = 1000,
    attributes = {},
  } = req.body;

  const pool = MATCHMAKING_POOLS[poolName];
  if (!pool) {
    return res.status(400).json({
      errorCode: 'errors.com.epicgames.matchmaking.invalid_pool',
      message: `Invalid pool. Available: ${Object.keys(MATCHMAKING_POOLS).join(', ')}`,
    });
  }

  const token = req.headers.authorization.slice(7);
  const session = sessions.get(token);

  // Check if player already has an active ticket
  for (const [tid, t] of mmTickets) {
    if (t.userId === session.userId && t.status === 'Waiting') {
      return res.status(409).json({
        errorCode: 'errors.com.epicgames.matchmaking.already_queued',
        message: 'Already in matchmaking queue',
        ticketId: tid,
      });
    }
  }

  const ticketId = generateId('ticket_');

  // TrueSkill2 MMR simulation — μ and σ
  const mu = skillRating;
  const sigma = Math.max(100, 8.333);  // TrueSkill2 default σ

  const ticket = {
    ticketId,
    userId: session.userId,
    displayName: session.displayName,
    poolName,
    region,
    skillRating,
    trueSkill: { mu, sigma, conservativeRating: mu - 3 * sigma },
    attributes,
    status: 'Waiting',
    queuedAt: new Date().toISOString(),
  };

  mmTickets.set(ticketId, ticket);
  pool.queue.push(ticketId);

  res.json({
    ticketId,
    status: 'Waiting',
    poolName,
    region,
    estimatedWaitTime: Math.max(5, 30 - pool.queue.length),  // seconds, rough estimate
  });
});

app.get('/matchmaking/status', requireAuth, (req, res) => {
  const token = req.headers.authorization.slice(7);
  const session = sessions.get(token);

  // Find active ticket for this user
  let activeTicket = null;
  for (const [tid, t] of mmTickets) {
    if (t.userId === session.userId && (t.status === 'Waiting' || t.status === 'Matched')) {
      activeTicket = { ticketId: tid, ...t };
      break;
    }
  }

  if (!activeTicket) {
    return res.json({ status: 'NotQueued', ticketId: null });
  }

  const pool = MATCHMAKING_POOLS[activeTicket.poolName];
  res.json({
    ticketId: activeTicket.ticketId,
    status: activeTicket.status,
    poolName: activeTicket.poolName,
    region: activeTicket.region,
    playersInQueue: pool ? pool.queue.length : 0,
    estimatedWaitTime: pool ? Math.max(0, 30 - pool.queue.length) : 30,
  });
});

app.post('/matchmaking/cancel', requireAuth, (req, res) => {
  const { ticketId } = req.body;
  const ticket = mmTickets.get(ticketId);
  if (!ticket) {
    return res.status(404).json({ errorCode: 'errors.com.epicgames.matchmaking.ticket_not_found', message: 'Ticket not found' });
  }

  ticket.status = 'Cancelled';
  const pool = MATCHMAKING_POOLS[ticket.poolName];
  if (pool) {
    pool.queue = pool.queue.filter(id => id !== ticketId);
  }

  res.json({ success: true, ticketId, status: 'Cancelled' });
});

// Matchmaking pool info endpoint (for testing/debugging)
app.get('/matchmaking/pools', requireAuth, (req, res) => {
  const pools = {};
  for (const [name, pool] of Object.entries(MATCHMAKING_POOLS)) {
    pools[name] = {
      poolName: pool.poolName,
      region: pool.region,
      minPlayers: pool.minPlayers,
      maxPlayers: pool.maxPlayers,
      skillRange: pool.skillRange,
      gameMode: pool.gameMode,
      world: pool.world,
      playersInQueue: pool.queue.length,
    };
  }
  res.json(pools);
});

// ─── Matchmaking Auto-Match Engine ────────────────────────────────────────────

function runMatchmakingEngine() {
  for (const [poolName, pool] of Object.entries(MATCHMAKING_POOLS)) {
    if (pool.queue.length < pool.minPlayers) continue;

    // Gather waiting tickets
    const waiting = pool.queue
      .map(tid => mmTickets.get(tid))
      .filter(t => t && t.status === 'Waiting');

    if (waiting.length < pool.minPlayers) continue;

    // TrueSkill2 MMR-based sorting: sort by conservative rating
    waiting.sort((a, b) => (a.trueSkill.conservativeRating) - (b.trueSkill.conservativeRating));

    // Group within skill range
    const matchPlayers = [];
    const baseRating = waiting[0].trueSkill.conservativeRating;

    for (const ticket of waiting) {
      if (matchPlayers.length >= pool.maxPlayers) break;
      const ratingDiff = Math.abs(ticket.trueSkill.conservativeRating - baseRating);
      if (ratingDiff <= pool.skillRange || matchPlayers.length < pool.minPlayers) {
        matchPlayers.push(ticket);
      }
    }

    if (matchPlayers.length < pool.minPlayers) continue;

    // Form match!
    const matchId = generateId('match_');
    const sessionId = generateId('sess_');
    const serverAddress = `ds-${pool.region}-${matchId.slice(0, 8)}.khaaos.run:7777`;

    // Create EOS session for the match
    const eosSession = {
      sessionId,
      matchId,
      poolName,
      region: pool.region,
      mapName: `${pool.world}_KhaaosVille`,
      maxPlayers: pool.maxPlayers,
      currentPlayers: matchPlayers.length,
      isDedicated: true,
      serverAddress,
      members: matchPlayers.map(p => ({ userId: p.userId, displayName: p.displayName })),
      createdAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
    };
    eosSessions.set(sessionId, eosSession);

    // Update tickets
    for (const ticket of matchPlayers) {
      ticket.status = 'Matched';
      ticket.matchId = matchId;
      ticket.sessionId = sessionId;
      ticket.serverAddress = serverAddress;
    }

    // Remove matched from queue
    const matchedIds = new Set(matchPlayers.map(p => p.ticketId));
    pool.queue = pool.queue.filter(tid => !matchedIds.has(tid));

    // Notify via WebSocket
    broadcastWS('match_found', {
      matchId,
      sessionId,
      serverAddress,
      poolName,
      region: pool.region,
      playerCount: matchPlayers.length,
      players: matchPlayers.map(p => ({ userId: p.userId, displayName: p.displayName, skillRating: p.skillRating })),
    });

    console.log(`[MATCHMAKING] Match formed in pool ${poolName}: ${matchPlayers.length} players → ${sessionId}`);
  }
}

const matchmakingInterval = setInterval(runMatchmakingEngine, MATCHMAKING_CHECK_MS);

// ============================================================================
// 4. SESSIONS SERVICE — Maps to KhaaosEOSSession
// ============================================================================

app.post('/sessions/create', requireAuth, (req, res) => {
  const {
    mapName = 'CIGKV_KhaaosVille',
    maxPlayers = 50,
    isDedicated = true,
    serverName = 'Khaaos Mock Server',
    region = 'sa1',
    customRules = {},
  } = req.body;

  const token = req.headers.authorization.slice(7);
  const session = sessions.get(token);
  const sessionId = generateId('sess_');

  const eosSession = {
    sessionId,
    ownerId: session.userId,
    mapName,
    maxPlayers,
    currentPlayers: 1,
    isDedicated,
    serverName,
    region,
    customRules,
    members: [{ userId: session.userId, displayName: session.displayName, joinedAt: new Date().toISOString() }],
    createdAt: new Date().toISOString(),
    lastHeartbeat: new Date().toISOString(),
    status: 'Active',
    serverAddress: `ds-${region}-${sessionId.slice(0, 8)}.khaaos.run:7777`,
  };

  eosSessions.set(sessionId, eosSession);

  res.status(201).json({
    sessionId,
    mapName,
    maxPlayers,
    region,
    status: 'Active',
    serverAddress: eosSession.serverAddress,
    createdAt: eosSession.createdAt,
  });
});

app.get('/sessions/:id', requireAuth, (req, res) => {
  const s = eosSessions.get(req.params.id);
  if (!s) {
    return res.status(404).json({ errorCode: 'errors.com.epicgames.session.not_found', message: 'Session not found' });
  }
  res.json({
    sessionId: s.sessionId,
    mapName: s.mapName,
    maxPlayers: s.maxPlayers,
    currentPlayers: s.currentPlayers,
    isDedicated: s.isDedicated,
    serverName: s.serverName,
    region: s.region,
    status: s.status,
    members: s.members,
    lastHeartbeat: s.lastHeartbeat,
    serverAddress: s.serverAddress,
  });
});

app.post('/sessions/:id/join', requireAuth, (req, res) => {
  const s = eosSessions.get(req.params.id);
  if (!s) {
    return res.status(404).json({ errorCode: 'errors.com.epicgames.session.not_found', message: 'Session not found' });
  }
  if (s.currentPlayers >= s.maxPlayers) {
    return res.status(409).json({ errorCode: 'errors.com.epicgames.session.session_full', message: 'Session is full' });
  }

  const token = req.headers.authorization.slice(7);
  const session = sessions.get(token);

  if (s.members.some(m => m.userId === session.userId)) {
    return res.status(409).json({ errorCode: 'errors.com.epicgames.session.already_joined', message: 'Already in session' });
  }

  s.members.push({ userId: session.userId, displayName: session.displayName, joinedAt: new Date().toISOString() });
  s.currentPlayers = s.members.length;

  res.json({
    sessionId: s.sessionId,
    currentPlayers: s.currentPlayers,
    serverAddress: s.serverAddress,
  });
});

app.post('/sessions/:id/heartbeat', requireAuth, (req, res) => {
  const s = eosSessions.get(req.params.id);
  if (!s) {
    return res.status(404).json({ errorCode: 'errors.com.epicgames.session.not_found', message: 'Session not found' });
  }
  s.lastHeartbeat = new Date().toISOString();
  res.json({ acknowledged: true, nextHeartbeatMs: HEARTBEAT_INTERVAL_MS });
});

app.delete('/sessions/:id', requireAuth, (req, res) => {
  const s = eosSessions.get(req.params.id);
  if (!s) {
    return res.status(404).json({ errorCode: 'errors.com.epicgames.session.not_found', message: 'Session not found' });
  }
  s.status = 'Destroyed';
  eosSessions.delete(req.params.id);
  res.json({ success: true, sessionId: req.params.id });
});

// ============================================================================
// 5. CLOUD SAVE SERVICE — Maps to KhaaosCloudSave
// ============================================================================

app.post('/cloudsave/write', requireAuth, (req, res) => {
  const { key, value, bucket = 'PlayerData' } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ errorCode: 'errors.com.epicgames.cloud_save.missing_parameters', message: 'key and value required' });
  }

  const jsonValue = JSON.stringify(value);
  const checksum = sha256(jsonValue);
  const compression = simulateLZ4Compress(value);

  const entry = {
    key,
    bucket,
    value,
    checksum,
    checksumAlgorithm: 'SHA256',
    timestamp: new Date().toISOString(),
    sizeBytes: jsonValue.length,
    compressedSizeBytes: compression.compressedSize,
    compressionRatio: compression.ratio,
    version: 1,
  };

  cloudData.set(key, entry);

  res.json({
    key,
    checksum,
    checksumAlgorithm: 'SHA256',
    timestamp: entry.timestamp,
    sizeBytes: entry.sizeBytes,
    compressedSizeBytes: entry.compressedSizeBytes,
    compressionRatio: entry.compressionRatio,
  });
});

app.get('/cloudsave/read', requireAuth, (req, res) => {
  const { key } = req.query;
  if (!key) {
    return res.status(400).json({ errorCode: 'errors.com.epicgames.cloud_save.missing_key', message: 'key query param required' });
  }

  const entry = cloudData.get(key);
  if (!entry) {
    return res.status(404).json({ errorCode: 'errors.com.epicgames.cloud_save.key_not_found', message: 'Key not found' });
  }

  res.json({
    key: entry.key,
    value: entry.value,
    checksum: entry.checksum,
    checksumAlgorithm: entry.checksumAlgorithm,
    timestamp: entry.timestamp,
    sizeBytes: entry.sizeBytes,
    compressedSizeBytes: entry.compressedSizeBytes,
  });
});

app.delete('/cloudsave/:key', requireAuth, (req, res) => {
  const { key } = req.params;
  if (!cloudData.has(key)) {
    return res.status(404).json({ errorCode: 'errors.com.epicgames.cloud_save.key_not_found', message: 'Key not found' });
  }
  cloudData.delete(key);
  res.json({ success: true, key });
});

// Cloud save integrity verification
app.post('/cloudsave/verify', requireAuth, (req, res) => {
  const { key, expectedChecksum } = req.body;
  const entry = cloudData.get(key);
  if (!entry) {
    return res.status(404).json({ errorCode: 'errors.com.epicgames.cloud_save.key_not_found', message: 'Key not found' });
  }

  const currentChecksum = sha256(JSON.stringify(entry.value));
  const valid = currentChecksum === expectedChecksum;

  res.json({
    key,
    valid,
    currentChecksum,
    expectedChecksum,
    algorithm: 'SHA256',
  });
});

// Cloud save list
app.get('/cloudsave/list', requireAuth, (req, res) => {
  const { bucket } = req.query;
  let entries = [...cloudData.values()];
  if (bucket) entries = entries.filter(e => e.bucket === bucket);

  res.json({
    count: entries.length,
    entries: entries.map(e => ({
      key: e.key,
      bucket: e.bucket,
      timestamp: e.timestamp,
      sizeBytes: e.sizeBytes,
      checksum: e.checksum,
    })),
  });
});

// ============================================================================
// 6. REGION ENDPOINTS — Maps to KhaaosEOSRegionManager
// ============================================================================

app.get('/regions', requireAuth, (req, res) => {
  res.json({
    regions: Object.values(REGIONS).map(r => ({
      ...r,
      currentPlayers: Math.floor(Math.random() * 500),
      matchmakingPools: Object.values(MATCHMAKING_POOLS)
        .filter(p => p.region === r.id)
        .map(p => p.poolName),
    })),
    defaultRegion: 'sa1',
  });
});

// ============================================================================
// Server + WebSocket Setup
// ============================================================================

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log(`[WS] Client connected (total: ${wsClients.size})`);

  ws.send(JSON.stringify({ type: 'connected', message: 'Khaaos Mock EOS Server', timestamp: new Date().toISOString() }));

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[WS] Client disconnected (total: ${wsClients.size})`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
    wsClients.delete(ws);
  });
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

function shutdown() {
  console.log('\n[SHUTDOWN] Cleaning up...');
  clearInterval(matchmakingInterval);
  wss.close();
  server.close(() => {
    console.log('[SHUTDOWN] Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ─── Start Server ─────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Khaaos Run — Mock EOS Server (Step 3)                     ║');
  console.log(`║  HTTP:   http://localhost:${PORT}                           ║`);
  console.log(`║  WS:     ws://localhost:${PORT}/ws                          ║`);
  console.log('║  Health: /health                                           ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Subsystems:                                               ║');
  console.log('║    1. Auth        → /auth/*     (KhaaosEOSManager)         ║');
  console.log('║    2. Lobby       → /lobby/*    (KhaaosEOSLobby)           ║');
  console.log('║    3. Matchmaking → /matchmaking/* (KhaaosEOSMatchmaking)  ║');
  console.log('║    4. Sessions    → /sessions/* (KhaaosEOSSession)         ║');
  console.log('║    5. Cloud Save  → /cloudsave/* (KhaaosCloudSave)        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
});

module.exports = { app, server, MATCHMAKING_POOLS, REGIONS };
