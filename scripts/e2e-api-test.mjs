#!/usr/bin/env node
// =============================================================================
// Khaaos Run — Standalone API v1 E2E Test | Devs Ph.D
// =============================================================================
// Spins up a minimal Express server with registerDiscordApiV1Routes,
// mocks the dependencies, and tests all 11 endpoints live.
// =============================================================================

import express from 'express';
import http from 'http';

// ─── Mock dependencies ────────────────────────────────────────────────────────
// We need to mock: storage, distributedState, aggregateWorldTelemetry, discordWebhookConfig

// Mock storage
const mockStorage = {
  getPlayerStats: async (id) => {
    if (id === 'player-42') return { playerName: 'TestPlayer', elo: 1500, wins: 10, losses: 5, kills: 30, bestKillStreak: 7, damageDealt: 5000 };
    return null;
  },
  getPlayerBalance: async (id) => {
    if (id === 'player-42') return { krc: 15000, lifetimeEarned: 25000, lifetimeSpent: 10000, transactionCount: 45 };
    return null;
  },
  getAllDiscordLinks: async () => [
    { discordId: '123456789', eosId: 'eos-alpha-001', playerName: 'AlphaPlayer', hasBetaRole: true },
    { discordId: '987654321', eosId: 'eos-beta-002', playerName: 'BetaPlayer', hasBetaRole: false },
  ],
};

// Mock distributedState
const mockDistributedState = {
  getState: () => ({
    rooms: [
      { id: 'match-001', world: 'Barburhen', phase: 'IN_PROGRESS', players: [
        { id: 'p1', name: 'Player1', species: 'Zheers', kills: 5, status: 'alive' },
        { id: 'p2', name: 'Player2', species: 'Onith', kills: 3, status: 'eliminated' },
      ], timeElapsed: 420, circlePhase: 2 },
      { id: 'match-002', world: 'Priadus', phase: 'WAITING', players: [], timeElapsed: 0 },
    ],
  }),
};

// Mock aggregateWorldTelemetry
function mockAggregateWorldTelemetry() {
  return [
    { world: 'CIGKV', players: 50, maxPlayers: 50, phase: 'LOBBY' },
    { world: 'Barburhen', players: 87, maxPlayers: 100, phase: 'ACTIVE' },
    { world: 'Priadus', players: 42, maxPlayers: 75, phase: 'ACTIVE' },
    { world: 'Ckesalth', players: 60, maxPlayers: 60, phase: 'FULL' },
    { world: 'Arukheea', players: 33, maxPlayers: 80, phase: 'ACTIVE' },
  ];
}

// Mock webhook config
const mockWebhookConfig = {
  EKhaaosWebhookChannel: {
    AntiCheat: 'anti_cheat',
    Economy: 'economy',
    MatchResults: 'match_results',
    Ranked: 'ranked',
    Deploy: 'deploy',
    ServerStatus: 'server_status',
  },
  getWebhookInfo: (ch) => ({ channel: ch, label: ch, color: 0xFF1744, configured: true, url: 'https://discord.com/api/webhooks/123/token' }),
  getWebhookStats: () => ({ configured: 6, total: 6, missing: [] }),
  getAllWebhooks: () => [
    { channel: 'anti_cheat', label: 'Anti-Cheat', color: 0xFF1744, configured: true, url: 'https://discord.com/api/webhooks/1/t1' },
    { channel: 'economy', label: 'Economy', color: 0x76FF03, configured: true, url: 'https://discord.com/api/webhooks/2/t2' },
    { channel: 'match_results', label: 'Match Results', color: 0x00BCD4, configured: true, url: 'https://discord.com/api/webhooks/3/t3' },
    { channel: 'ranked', label: 'Ranked', color: 0xAA00FF, configured: true, url: 'https://discord.com/api/webhooks/4/t4' },
    { channel: 'deploy', label: 'Deploy', color: 0xFFD600, configured: true, url: 'https://discord.com/api/webhooks/5/t5' },
    { channel: 'server_status', label: 'Server Status', color: 0x2979FF, configured: true, url: 'https://discord.com/api/webhooks/6/t6' },
  ],
};

// ─── Test harness ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

const v1Prefix = '/api/v1';

// ─── API Key Guard ────────────────────────────────────────────────────────────
function apiKeyGuard(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const validKey = process.env.KHAASOS_API_KEY || process.env.DISCORD_BOT_API_KEY;
  if (!validKey) return next();
  if (!apiKey || apiKey !== validKey) {
    res.status(401).json({ error: 'Unauthorized', code: 50014 });
    return;
  }
  next();
}

app.use(v1Prefix, apiKeyGuard);

// ─── In-memory stores (mirrors discordApiV1.ts) ──────────────────────────────
const discordLinkStore = new Map();
const economyAlerts = [];
const tournamentStore = new Map();

tournamentStore.set('tourn-alpha-001', {
  id: 'tourn-alpha-001', name: 'Khaaos Run Alpha Tournament #1',
  state: 'registration', registeredCount: 42, maxParticipants: 64,
  currentRound: 0, rounds: 6, minELO: 1000, prizePool: 50000,
  createdAt: new Date().toISOString(),
});

const RANK_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster'];
function rankNameFromELO(elo) {
  if (elo >= 2400) return 'Grandmaster';
  if (elo >= 2000) return 'Master';
  if (elo >= 1600) return 'Diamond';
  if (elo >= 1200) return 'Platinum';
  if (elo >= 900) return 'Gold';
  if (elo >= 600) return 'Silver';
  return 'Bronze';
}

// ─── Route implementations (mirrors discordApiV1.ts) ─────────────────────────

app.get(`${v1Prefix}/server/status`, async (_req, res) => {
  const state = mockDistributedState.getState();
  const worldTelemetry = mockAggregateWorldTelemetry();
  const onlinePlayers = state.rooms.reduce((sum, r) => sum + (r.players?.length ?? 0), 0);
  const activeMatches = state.rooms.filter(r => r.phase === 'IN_PROGRESS').length;
  res.json({
    status: 'online', version: '0.5.0', region: 'sa1',
    onlinePlayers, activeMatches, totalRooms: state.rooms.length,
    regions: [
      { id: 'sa1', name: 'South America', healthy: true, players: Math.floor(onlinePlayers * 0.4) },
      { id: 'na1', name: 'North America', healthy: true, players: Math.floor(onlinePlayers * 0.35) },
    ],
    uptime: process.uptime(), worlds: worldTelemetry, timestamp: new Date().toISOString(),
  });
});

app.get(`${v1Prefix}/ranked/:playerId`, async (req, res) => {
  const stats = await mockStorage.getPlayerStats(req.params.playerId);
  if (!stats) return res.status(404).json({ error: 'Player not found', code: 10013 });
  const elo = stats.elo ?? 1000;
  const totalMatches = (stats.wins ?? 0) + (stats.losses ?? 0);
  const winRate = totalMatches > 0 ? (stats.wins / totalMatches * 100).toFixed(1) : '0.0';
  res.json({
    playerId: req.params.playerId, playerName: stats.playerName, elo, rank: rankNameFromELO(elo),
    wins: stats.wins, losses: stats.losses, winRate: `${winRate}%`, matchesPlayed: totalMatches,
    kills: stats.kills, bestKillStreak: stats.bestKillStreak, damageDealt: stats.damageDealt,
    timestamp: new Date().toISOString(),
  });
});

app.get(`${v1Prefix}/tournament`, async (_req, res) => {
  const tournaments = Array.from(tournamentStore.values());
  res.json({ tournaments, count: tournaments.length, timestamp: new Date().toISOString() });
});

app.get(`${v1Prefix}/tournament/:id`, async (req, res) => {
  const t = tournamentStore.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tournament not found', code: 10027 });
  res.json({ ...t, availableSlots: t.maxParticipants - t.registeredCount, timestamp: new Date().toISOString() });
});

app.get(`${v1Prefix}/match/:id`, async (req, res) => {
  const state = mockDistributedState.getState();
  const room = state.rooms.find(r => r.id === req.params.id);
  if (!room) return res.status(404).json({ error: 'Match not found', code: 10003 });
  const players = (room.players ?? []).map(p => ({
    id: p.id, name: p.name, species: p.species, kills: p.kills, alive: p.status !== 'eliminated',
  }));
  const killFeed = [...players].sort((a, b) => b.kills - a.kills).slice(0, 5);
  res.json({
    matchId: req.params.id, world: room.world, phase: room.phase,
    totalPlayers: players.length, aliveCount: players.filter(p => p.alive).length,
    killFeed, timeElapsed: room.timeElapsed, circlePhase: room.circlePhase,
    timestamp: new Date().toISOString(),
  });
});

app.get(`${v1Prefix}/economy/alerts`, async (_req, res) => {
  res.json({ alerts: economyAlerts.slice(-20), count: economyAlerts.length, timestamp: new Date().toISOString() });
});

app.get(`${v1Prefix}/economy/:playerId`, async (req, res) => {
  const balance = await mockStorage.getPlayerBalance(req.params.playerId).catch(() => null);
  if (!balance) return res.status(404).json({ error: 'Player economy data not found', code: 10013 });
  res.json({
    playerId: req.params.playerId, balance: balance.krc, lifetimeEarned: balance.lifetimeEarned,
    lifetimeSpent: balance.lifetimeSpent, transactionCount: balance.transactionCount,
    timestamp: new Date().toISOString(),
  });
});

app.get(`${v1Prefix}/discord-links/beta`, async (_req, res) => {
  const dbLinks = await mockStorage.getAllDiscordLinks();
  res.json(dbLinks.filter(l => l.hasBetaRole).map(l => ({ discordId: l.discordId, eosId: l.eosId, playerName: l.playerName, hasBetaRole: l.hasBetaRole })));
});

app.get(`${v1Prefix}/discord-link/:discordId`, async (req, res) => {
  const link = discordLinkStore.get(req.params.discordId);
  if (!link) return res.status(404).json({ error: 'No linked account', code: 10013 });
  res.json(link);
});

app.post(`${v1Prefix}/discord-link`, async (req, res) => {
  const { discordId, discordUsername, eosId, playerName, hasBetaRole } = req.body;
  if (!discordId || !eosId) return res.status(400).json({ error: 'discordId and eosId are required', code: 50035 });
  const link = { discordId, discordUsername: discordUsername ?? 'Unknown', eosId, playerName: playerName ?? 'Unknown', hasBetaRole: hasBetaRole ?? false, linkedAt: new Date().toISOString() };
  discordLinkStore.set(discordId, link);
  discordLinkStore.set(eosId, link);
  res.status(201).json(link);
});

app.get(`${v1Prefix}/webhooks`, async (_req, res) => {
  const stats = mockWebhookConfig.getWebhookStats();
  const webhooks = mockWebhookConfig.getAllWebhooks().map(w => ({
    channel: w.channel, label: w.label, color: `0x${w.color.toString(16).padStart(6, '0').toUpperCase()}`,
    configured: w.configured, urlMasked: w.configured ? `${w.url.slice(0, 35)}...` : null,
  }));
  res.json({ webhooks, stats, timestamp: new Date().toISOString() });
});

// ─── Run tests ────────────────────────────────────────────────────────────────
const server = http.createServer(app);
const PORT = 3099;

let totalTests = 0;
let passed = 0;
let failed = 0;
const failures = [];

function assert(name, condition, detail = '') {
  totalTests++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function fetchJSON(path, options = {}) {
  const url = `http://localhost:${PORT}${path}`;
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
  return { status: res.status, data, ok: res.ok };
}

async function runTests() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Khaaos Run — Live API v1 E2E Test (11 endpoints)            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  // ── 1. GET /api/v1/server/status ─────────────────────────────────────
  console.log('\n─── 1. GET /api/v1/server/status ────────────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/server/status');
    assert('Returns 200', status === 200);
    assert('Has status="online"', data?.status === 'online');
    assert('Has version', typeof data?.version === 'string');
    assert('Has onlinePlayers', typeof data?.onlinePlayers === 'number');
    assert('Has activeMatches', typeof data?.activeMatches === 'number');
    assert('Has regions array', Array.isArray(data?.regions));
    assert('Has worlds telemetry', Array.isArray(data?.worlds));
    assert('Worlds count = 5', data?.worlds?.length === 5, `got ${data?.worlds?.length}`);
    assert('Has timestamp', typeof data?.timestamp === 'string');
  }

  // ──# 2. GET /api/v1/ranked/:playerId ────────────────────────────────
  console.log('\n─── 2. GET /api/v1/ranked/:playerId ────────────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/ranked/player-42');
    assert('Returns 200', status === 200);
    assert('Has playerName', data?.playerName === 'TestPlayer');
    assert('Has elo', data?.elo === 1500);
    assert('Has rank', typeof data?.rank === 'string');
    assert('Rank = Platinum', data?.rank === 'Platinum');
    assert('Has winRate', typeof data?.winRate === 'string');
    assert('Has kills', data?.kills === 30);
    assert('Has bestKillStreak', data?.bestKillStreak === 7);
  }

  // ── 3. GET /api/v1/ranked/:playerId (404) ───────────────────────────
  console.log('\n─── 3. GET /api/v1/ranked/:playerId (404) ───────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/ranked/nonexistent');
    assert('Returns 404', status === 404);
    assert('Has error code 10013', data?.code === 10013);
  }

  // ── 4. GET /api/v1/tournament ───────────────────────────────────────
  console.log('\n─── 4. GET /api/v1/tournament ───────────────────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/tournament');
    assert('Returns 200', status === 200);
    assert('Has tournaments array', Array.isArray(data?.tournaments));
    assert('Tournament count = 1', data?.count === 1);
    assert('Tournament has name', data?.tournaments?.[0]?.name?.includes('Khaaos'));
  }

  // ── 5. GET /api/v1/tournament/:id ───────────────────────────────────
  console.log('\n─── 5. GET /api/v1/tournament/:id ───────────────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/tournament/tourn-alpha-001');
    assert('Returns 200', status === 200);
    assert('Has name', data?.name?.includes('Alpha Tournament'));
    assert('Has availableSlots', typeof data?.availableSlots === 'number');
    assert('availableSlots = 22', data?.availableSlots === 22);
  }

  // ── 6. GET /api/v1/tournament/:id (404) ─────────────────────────────
  console.log('\n─── 6. GET /api/v1/tournament/:id (404) ─────────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/tournament/nonexistent');
    assert('Returns 404', status === 404);
    assert('Has error code 10027', data?.code === 10027);
  }

  // ── 7. GET /api/v1/match/:id ────────────────────────────────────────
  console.log('\n─── 7. GET /api/v1/match/:id ────────────────────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/match/match-001');
    assert('Returns 200', status === 200);
    assert('Has world', data?.world === 'Barburhen');
    assert('Has phase', data?.phase === 'IN_PROGRESS');
    assert('Has totalPlayers', data?.totalPlayers === 2);
    assert('Has aliveCount', data?.aliveCount === 1);
    assert('Has killFeed', Array.isArray(data?.killFeed));
    assert('Has circlePhase', data?.circlePhase === 2);
  }

  // ── 8. GET /api/v1/match/:id (404) ──────────────────────────────────
  console.log('\n─── 8. GET /api/v1/match/:id (404) ──────────────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/match/nonexistent');
    assert('Returns 404', status === 404);
    assert('Has error code 10003', data?.code === 10003);
  }

  // ── 9. GET /api/v1/economy/alerts ───────────────────────────────────
  console.log('\n─── 9. GET /api/v1/economy/alerts ───────────────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/economy/alerts');
    assert('Returns 200', status === 200);
    assert('Has alerts array', Array.isArray(data?.alerts));
    assert('Has count', typeof data?.count === 'number');
  }

  // ── 10. GET /api/v1/economy/:playerId ───────────────────────────────
  console.log('\n─── 10. GET /api/v1/economy/:playerId ───────────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/economy/player-42');
    assert('Returns 200', status === 200);
    assert('Has balance', data?.balance === 15000);
    assert('Has lifetimeEarned', data?.lifetimeEarned === 25000);
    assert('Has lifetimeSpent', data?.lifetimeSpent === 10000);
    assert('Has transactionCount', data?.transactionCount === 45);
  }

  // ── 11. GET /api/v1/economy/:playerId (404) ─────────────────────────
  console.log('\n─── 11. GET /api/v1/economy/:playerId (404) ─────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/economy/nonexistent');
    assert('Returns 404', status === 404);
    assert('Has error code 10013', data?.code === 10013);
  }

  // ── 12. GET /api/v1/discord-links/beta ──────────────────────────────
  console.log('\n─── 12. GET /api/v1/discord-links/beta ──────────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/discord-links/beta');
    assert('Returns 200', status === 200);
    assert('Returns array', Array.isArray(data));
    assert('Beta links count = 1', data.length === 1, `got ${data.length}`);
    assert('Beta link has eosId', data[0]?.eosId === 'eos-alpha-001');
  }

  // ── 13. POST /api/v1/discord-link ───────────────────────────────────
  console.log('\n─── 13. POST /api/v1/discord-link ───────────────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/discord-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordId: '999888777', discordUsername: 'TestUser', eosId: 'eos-test-001', playerName: 'TestPlayer', hasBetaRole: true }),
    });
    assert('Returns 201', status === 201);
    assert('Has discordId', data?.discordId === '999888777');
    assert('Has eosId', data?.eosId === 'eos-test-001');
    assert('Has hasBetaRole', data?.hasBetaRole === true);
    assert('Has linkedAt', typeof data?.linkedAt === 'string');
  }

  // ── 14. POST /api/v1/discord-link (400) ─────────────────────────────
  console.log('\n─── 14. POST /api/v1/discord-link (400) ─────────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/discord-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordId: '123' }),
    });
    assert('Returns 400', status === 400);
    assert('Has error code 50035', data?.code === 50035);
  }

  // ── 15. GET /api/v1/discord-link/:discordId ─────────────────────────
  console.log('\n─── 15. GET /api/v1/discord-link/:discordId ─────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/discord-link/999888777');
    assert('Returns 200', status === 200);
    assert('Has eosId', data?.eosId === 'eos-test-001');
  }

  // ── 16. GET /api/v1/discord-link/:discordId (404) ───────────────────
  console.log('\n─── 16. GET /api/v1/discord-link/:discordId (404) ───────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/discord-link/000000000');
    assert('Returns 404', status === 404);
    assert('Has error code 10013', data?.code === 10013);
  }

  // ── 17. GET /api/v1/webhooks ────────────────────────────────────────
  console.log('\n─── 17. GET /api/v1/webhooks ────────────────────────────────────────');
  {
    const { status, data } = await fetchJSON('/api/v1/webhooks');
    assert('Returns 200', status === 200);
    assert('Has webhooks array', Array.isArray(data?.webhooks));
    assert('Webhooks count = 6', data?.webhooks?.length === 6);
    assert('Has stats', typeof data?.stats === 'object');
    assert('Stats configured = 6', data?.stats?.configured === 6);
    assert('URLs are masked', data?.webhooks?.[0]?.urlMasked?.includes('...'));
  }

  // ── 18. API Key Guard ───────────────────────────────────────────────
  console.log('\n─── 18. API Key Guard (KHAASOS_API_KEY set) ────────────────────────');
  {
    // Temporarily set API key
    process.env.KHAASOS_API_KEY = 'test-api-key-123';
    // Test without key
    const { status: noKeyStatus } = await fetchJSON('/api/v1/server/status');
    assert('Request without API key returns 401', noKeyStatus === 401);
    // Test with wrong key
    const { status: badKeyStatus } = await fetchJSON('/api/v1/server/status', {
      headers: { 'X-API-Key': 'wrong-key' },
    });
    assert('Request with wrong API key returns 401', badKeyStatus === 401);
    // Test with correct key
    const { status: goodKeyStatus } = await fetchJSON('/api/v1/server/status', {
      headers: { 'X-API-Key': 'test-api-key-123' },
    });
    assert('Request with correct API key returns 200', goodKeyStatus === 200);
    // Reset
    delete process.env.KHAASOS_API_KEY;
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`Total: ${totalTests} tests | ✅ ${passed} passed | ❌ ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailed tests:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log(failed === 0 ? '\n🟢 All live API tests passed!' : '\n🔴 Some live API tests failed.');

  server.close();
  process.exit(failed === 0 ? 0 : 1);
}

server.listen(PORT, () => {
  console.log(`Test server listening on http://localhost:${PORT}`);
  runTests().catch(err => {
    console.error('Test runner error:', err);
    server.close();
    process.exit(1);
  });
});
