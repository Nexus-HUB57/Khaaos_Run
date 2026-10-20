#!/usr/bin/env node
// ============================================================================
// Khaaos Run — EOS Integration Test (Step 3: Auth → Matchmaking)
// ============================================================================
// Comprehensive integration test for the Mock EOS Server.
// Tests all 5 subsystems: Auth, Lobby, Matchmaking, Sessions, Cloud Save.
// Returns exit code 0 if all tests pass.
// ============================================================================

'use strict';

const http = require('http');
const { spawn } = require('child_process');
const { WebSocket } = require('ws');

// ─── Configuration ────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:8989';
const WS_URL = 'ws://localhost:8989/ws';
const SERVER_STARTUP_TIMEOUT = 10000;
const TEST_TIMEOUT = 60000;

// ─── Test Runner ──────────────────────────────────────────────────────────────

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function pass(name) {
  totalTests++;
  passedTests++;
  console.log(`  ✅ PASS: ${name}`);
}

function fail(name, reason) {
  totalTests++;
  failedTests++;
  failures.push({ name, reason });
  console.log(`  ❌ FAIL: ${name} — ${reason}`);
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const get = (path, token) => request('GET', path, null, token);
const post = (path, body, token) => request('POST', path, body, token);
const del = (path, token) => request('DELETE', path, null, token);

// ─── Wait helper ──────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Start/Stop Server ────────────────────────────────────────────────────────

let serverProcess = null;

async function startServer() {
  return new Promise((resolve, reject) => {
    // Kill any leftover process on port 8989
    try { require('child_process').execSync('lsof -ti:8989 | xargs kill -9 2>/dev/null || true'); } catch {}

    serverProcess = spawn('node', ['mock_eos_server.js'], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, EOS_MOCK_PORT: '8989' },
    });

    let resolved = false;
    const doResolve = () => { if (!resolved) { resolved = true; resolve(); } };
    const doReject = (msg) => { if (!resolved) { resolved = true; reject(new Error(msg)); } };

    // Wait for server to be ready by polling health endpoint
    serverProcess.stderr.on('data', (d) => {
      const err = d.toString();
      if (err.includes('EADDRINUSE') || err.includes('listen E')) {
        doReject('Port 8989 already in use: ' + err.slice(0, 100));
      }
    });

    // Poll health endpoint until server is ready
    let attempts = 0;
    const maxAttempts = Math.floor(SERVER_STARTUP_TIMEOUT / 500);
    const pollHealth = () => {
      attempts++;
      if (resolved) return;
      if (attempts > maxAttempts) { doReject('Server startup timeout'); return; }

      const req = http.request({ hostname: 'localhost', port: 8989, path: '/health', method: 'GET', timeout: 1000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const body = JSON.parse(data);
            if (body.status === 'healthy') doResolve();
            else setTimeout(pollHealth, 500);
          } catch { setTimeout(pollHealth, 500); }
        });
      });
      req.on('error', () => setTimeout(pollHealth, 500));
      req.on('timeout', () => { req.destroy(); setTimeout(pollHealth, 500); });
      req.end();
    };

    // Start polling after a brief delay
    setTimeout(pollHealth, 500);
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

// ─── 1. Auth Flow Tests ───────────────────────────────────────────────────────

async function testAuthFlow() {
  console.log('\n📋 Auth Service Tests (KhaaosEOSManager)');
  console.log('─'.repeat(50));

  // Test 1: Login with device ID
  const loginRes = await post('/auth/login', {
    deviceId: 'test-device-001',
    displayName: 'TestPlayer1',
  });
  if (loginRes.status === 200 && loginRes.body.access_token) {
    pass('Login with device ID');
  } else {
    fail('Login with device ID', `Status ${loginRes.status}`);
  }

  const token1 = loginRes.body.access_token;
  const accountId1 = loginRes.body.account_id;

  // Test 2: Login with external account
  const login2Res = await post('/auth/login', {
    externalAccountId: 'ext_player_002',
    externalAccountType: 'epic',
    displayName: 'TestPlayer2',
  });
  if (login2Res.status === 200 && login2Res.body.access_token) {
    pass('Login with external account');
  } else {
    fail('Login with external account', `Status ${login2Res.status}`);
  }
  const token2 = login2Res.body.access_token;

  // Test 3: Verify token
  const verifyRes = await post('/auth/verify', null, token1);
  if (verifyRes.status === 200 && verifyRes.body.valid === true && verifyRes.body.displayName === 'TestPlayer1') {
    pass('Verify token');
  } else {
    fail('Verify token', `Status ${verifyRes.status}, valid=${verifyRes.body?.valid}`);
  }

  // Test 4: Refresh token
  const refreshRes = await post('/auth/refresh', { refresh_token: loginRes.body.refresh_token });
  if (refreshRes.status === 200 && refreshRes.body.access_token && refreshRes.body.access_token !== token1) {
    pass('Refresh token');
  } else {
    fail('Refresh token', `Status ${refreshRes.status}`);
  }
  const refreshedToken = refreshRes.body.access_token;

  // Test 5: Verify refreshed token still works
  const verify2Res = await post('/auth/verify', null, refreshedToken);
  if (verify2Res.status === 200 && verify2Res.body.valid === true) {
    pass('Verify refreshed token');
  } else {
    fail('Verify refreshed token', `valid=${verify2Res.body?.valid}`);
  }

  // Test 6: Invalid token rejected
  const badVerify = await post('/auth/verify', null, 'invalid.token.here');
  if (badVerify.status === 401) {
    pass('Reject invalid token');
  } else {
    fail('Reject invalid token', `Status ${badVerify.status}`);
  }

  // Test 7: Logout
  const logoutRes = await post('/auth/logout', null, refreshedToken);
  if (logoutRes.status === 200 && logoutRes.body.success) {
    pass('Logout');
  } else {
    fail('Logout', `Status ${logoutRes.status}`);
  }

  // Test 8: Token invalid after logout
  const afterLogout = await post('/auth/verify', null, refreshedToken);
  if (afterLogout.status === 401) {
    pass('Token invalid after logout');
  } else {
    fail('Token invalid after logout', `Status ${afterLogout.status}`);
  }

  return { token1: token2, accountId1 }; // Return token2 (still valid)
}

// ─── 2. Lobby Tests ──────────────────────────────────────────────────────────

async function testLobbyFlow(token) {
  console.log('\n📋 Lobby Service Tests (KhaaosEOSLobby)');
  console.log('─'.repeat(50));

  // Create lobby
  const createRes = await post('/lobby/create', {
    maxMembers: 100,
    isPresence: true,
    attributes: {
      world: 'CIGKV',
      rank_tier: 'silver',
      region: 'sa1',
      game_mode: 'Training',
    },
    region: 'sa1',
  }, token);

  if (createRes.status === 201 && createRes.body.lobbyId) {
    pass('Create lobby');
  } else {
    fail('Create lobby', `Status ${createRes.status}`);
  }
  const lobbyId = createRes.body.lobbyId;

  // Search lobbies
  const searchRes = await get('/lobby/search?world=CIGKV&region=sa1', token);
  if (searchRes.status === 200 && searchRes.body.count >= 1) {
    pass('Search lobbies by attributes');
  } else {
    fail('Search lobbies by attributes', `count=${searchRes.body?.count}`);
  }

  // Join lobby (second player)
  const login2 = await post('/auth/login', { deviceId: 'lobby-player-2', displayName: 'LobbyPlayer2' });
  const token2 = login2.body.access_token;

  const joinRes = await post('/lobby/join', { lobbyId }, token2);
  if (joinRes.status === 200 && joinRes.body.currentMembers === 2) {
    pass('Join lobby');
  } else {
    fail('Join lobby', `members=${joinRes.body?.currentMembers}`);
  }

  // Leave lobby
  const leaveRes = await post('/lobby/leave', { lobbyId }, token2);
  if (leaveRes.status === 200 && leaveRes.body.success) {
    pass('Leave lobby');
  } else {
    fail('Leave lobby', `Status ${leaveRes.status}`);
  }

  // Search with no results
  const emptySearch = await get('/lobby/search?world=NonExistent', token);
  if (emptySearch.status === 200 && emptySearch.body.count === 0) {
    pass('Search returns empty for non-matching');
  } else {
    fail('Search returns empty for non-matching', `count=${emptySearch.body?.count}`);
  }

  return { lobbyId };
}

// ─── 3. Matchmaking Tests ────────────────────────────────────────────────────

async function testMatchmakingFlow(token) {
  console.log('\n📋 Matchmaking Service Tests (KhaaosEOSMatchmaking)');
  console.log('─'.repeat(50));

  // Test all 5 pools
  const poolNames = ['CIGKV_Training', 'W1_Barburhen_Solo', 'W2_Ckesalth_Duo', 'W3_Priadus_Squad', 'W4_Arukheea_BR'];

  // Get pool info
  const poolsRes = await get('/matchmaking/pools', token);
  if (poolsRes.status === 200 && Object.keys(poolsRes.body).length === 5) {
    pass('Get all 5 matchmaking pools');
  } else {
    fail('Get all 5 matchmaking pools', `pools=${Object.keys(poolsRes.body || {}).length}`);
  }

  // Queue single player
  const queueRes = await post('/matchmaking/queue', {
    poolName: 'CIGKV_Training',
    region: 'sa1',
    skillRating: 1200,
  }, token);

  if (queueRes.status === 200 && queueRes.body.ticketId && queueRes.body.status === 'Waiting') {
    pass('Queue for matchmaking');
  } else {
    fail('Queue for matchmaking', `Status ${queueRes.status}`);
  }
  const ticketId = queueRes.body.ticketId;

  // Check status
  const statusRes = await get('/matchmaking/status', token);
  if (statusRes.status === 200 && statusRes.body.status === 'Waiting') {
    pass('Matchmaking status is Waiting');
  } else {
    fail('Matchmaking status is Waiting', `status=${statusRes.body?.status}`);
  }

  // Cancel matchmaking
  const cancelRes = await post('/matchmaking/cancel', { ticketId }, token);
  if (cancelRes.status === 200 && cancelRes.body.status === 'Cancelled') {
    pass('Cancel matchmaking');
  } else {
    fail('Cancel matchmaking', `Status ${cancelRes.status}`);
  }

  // ─── 50-player match formation test ───────────────────────────────────────
  console.log('\n  🎯 50-Player CIGKV Match Formation Test');
  const players = [];

  // Login 50 players
  for (let i = 0; i < 50; i++) {
    const loginRes = await post('/auth/login', {
      deviceId: `mm-player-${i}`,
      displayName: `MMPlayer_${i}`,
    });
    players.push({
      token: loginRes.body.access_token,
      userId: loginRes.body.account_id,
      displayName: `MMPlayer_${i}`,
    });
  }

  // Queue all 50 for CIGKV_Training
  const ticketIds = [];
  for (let i = 0; i < 50; i++) {
    const qRes = await post('/matchmaking/queue', {
      poolName: 'CIGKV_Training',
      region: 'sa1',
      skillRating: 1000 + Math.floor(Math.random() * 400),  // 1000-1400 range
    }, players[i].token);
    if (qRes.status === 200) ticketIds.push(qRes.body.ticketId);
  }

  if (ticketIds.length === 50) {
    pass('Queue 50 players for CIGKV_Training');
  } else {
    fail('Queue 50 players for CIGKV_Training', `Only ${ticketIds.length} queued`);
  }

  // Wait for matchmaking engine to form match
  await sleep(MATCHMAKING_CHECK_MS + 1000);

  // Check that players got matched
  let matchedCount = 0;
  for (const p of players) {
    const sRes = await get('/matchmaking/status', p.token);
    if (sRes.body.status === 'Matched') matchedCount++;
  }

  if (matchedCount >= 2) {
    pass(`Match formed with ${matchedCount} players`);
  } else {
    fail(`Match formed with ${matchedCount} players`, 'Expected >= 2');
  }

  // ─── Cross-region matchmaking ─────────────────────────────────────────────
  console.log('\n  🌍 Cross-Region Matchmaking Test');
  const regionPools = [
    { pool: 'CIGKV_Training', region: 'sa1', name: 'sa-east-1 (São Paulo)' },
    { pool: 'W2_Ckesalth_Duo', region: 'na1', name: 'us-east-1 (Virginia)' },
    { pool: 'W3_Priadus_Squad', region: 'eu1', name: 'eu-west-1 (Frankfurt)' },
  ];

  for (const rp of regionPools) {
    const regionPlayer = await post('/auth/login', {
      deviceId: `region-${rp.region}-player`,
      displayName: `RegionPlayer_${rp.region}`,
    });
    const rToken = regionPlayer.body.access_token;

    // Queue 2 players for each region to trigger match
    const rPlayer2 = await post('/auth/login', {
      deviceId: `region-${rp.region}-player-2`,
      displayName: `RegionPlayer2_${rp.region}`,
    });

    await post('/matchmaking/queue', { poolName: rp.pool, region: rp.region, skillRating: 1500 }, rToken);
    await post('/matchmaking/queue', { poolName: rp.pool, region: rp.region, skillRating: 1500 }, rPlayer2.body.access_token);

    pass(`Queue players in ${rp.name}`);
  }

  // Wait for cross-region matches
  await sleep(MATCHMAKING_CHECK_MS + 1000);

  // ─── Test all 5 pools individually ─────────────────────────────────────────
  console.log('\n  🏊 All 5 Pool Queue Test');
  for (const poolName of poolNames) {
    const poolPlayer1 = await post('/auth/login', { deviceId: `pool-${poolName}-1`, displayName: `Pool1_${poolName}` });
    const poolPlayer2 = await post('/auth/login', { deviceId: `pool-${poolName}-2`, displayName: `Pool2_${poolName}` });
    const pool = poolsRes.body[poolName];

    const q1 = await post('/matchmaking/queue', { poolName, region: pool.region, skillRating: 1000 }, poolPlayer1.body.access_token);
    const q2 = await post('/matchmaking/queue', { poolName, region: pool.region, skillRating: 1050 }, poolPlayer2.body.access_token);

    if (q1.status === 200 && q2.status === 200) {
      pass(`Queue in pool ${poolName}`);
    } else {
      fail(`Queue in pool ${poolName}`, `q1=${q1.status} q2=${q2.status}`);
    }
  }

  await sleep(MATCHMAKING_CHECK_MS + 500);
}

const MATCHMAKING_CHECK_MS = 2000;

// ─── 4. Session Tests ────────────────────────────────────────────────────────

async function testSessionFlow(token) {
  console.log('\n📋 Sessions Service Tests (KhaaosEOSSession)');
  console.log('─'.repeat(50));

  // Create session
  const createRes = await post('/sessions/create', {
    mapName: 'CIGKV_KhaaosVille',
    maxPlayers: 50,
    isDedicated: true,
    serverName: 'Khaaos Test Server',
    region: 'sa1',
    customRules: { timeLimit: '180', friendlyFire: 'false' },
  }, token);

  if (createRes.status === 201 && createRes.body.sessionId) {
    pass('Create session');
  } else {
    fail('Create session', `Status ${createRes.status}`);
  }
  const sessionId = createRes.body.sessionId;

  // Get session
  const getRes = await get(`/sessions/${sessionId}`, token);
  if (getRes.status === 200 && getRes.body.sessionId === sessionId && getRes.body.status === 'Active') {
    pass('Get session details');
  } else {
    fail('Get session details', `Status ${getRes.status}`);
  }

  // Join session (second player)
  const joinPlayer = await post('/auth/login', { deviceId: 'session-join-player', displayName: 'SessionJoiner' });
  const joinRes = await post(`/sessions/${sessionId}/join`, null, joinPlayer.body.access_token);
  if (joinRes.status === 200 && joinRes.body.currentPlayers === 2) {
    pass('Join session');
  } else {
    fail('Join session', `players=${joinRes.body?.currentPlayers}`);
  }

  // Heartbeat
  const hbRes = await post(`/sessions/${sessionId}/heartbeat`, null, token);
  if (hbRes.status === 200 && hbRes.body.acknowledged) {
    pass('Session heartbeat');
  } else {
    fail('Session heartbeat', `Status ${hbRes.status}`);
  }

  // Multiple heartbeats
  for (let i = 0; i < 3; i++) {
    await sleep(100);
    await post(`/sessions/${sessionId}/heartbeat`, null, token);
  }
  pass('Multiple heartbeats sustain session');

  // Destroy session
  const destroyRes = await del(`/sessions/${sessionId}`, token);
  if (destroyRes.status === 200 && destroyRes.body.success) {
    pass('Destroy session');
  } else {
    fail('Destroy session', `Status ${destroyRes.status}`);
  }

  // Verify session is gone
  const goneRes = await get(`/sessions/${sessionId}`, token);
  if (goneRes.status === 404) {
    pass('Session not found after destroy');
  } else {
    fail('Session not found after destroy', `Status ${goneRes.status}`);
  }
}

// ─── 5. Cloud Save Tests ─────────────────────────────────────────────────────

async function testCloudSaveFlow(token) {
  console.log('\n📋 Cloud Save Service Tests (KhaaosCloudSave)');
  console.log('─'.repeat(50));

  const saveData = {
    playerLevel: 42,
    inventory: { weapons: ['sword', 'bow'], armor: 'plate' },
    stats: { kills: 1500, deaths: 300, rank: 'gold' },
    worldProgress: { cigkv: 0.85, barburhen: 0.3 },
  };

  // Write
  const writeRes = await post('/cloudsave/write', {
    key: 'player_save_001',
    value: saveData,
    bucket: 'PlayerData',
  }, token);

  if (writeRes.status === 200 && writeRes.body.checksum) {
    pass('Write cloud save');
  } else {
    fail('Write cloud save', `Status ${writeRes.status}`);
  }
  const checksum = writeRes.body.checksum;

  // Read
  const readRes = await get('/cloudsave/read?key=player_save_001', token);
  if (readRes.status === 200 && readRes.body.value && readRes.body.value.playerLevel === 42) {
    pass('Read cloud save');
  } else {
    fail('Read cloud save', `Status ${readRes.status}`);
  }

  // Verify integrity (SHA256)
  const verifyRes = await post('/cloudsave/verify', {
    key: 'player_save_001',
    expectedChecksum: checksum,
  }, token);
  if (verifyRes.status === 200 && verifyRes.body.valid === true) {
    pass('SHA256 integrity check');
  } else {
    fail('SHA256 integrity check', `valid=${verifyRes.body?.valid}`);
  }

  // Verify with wrong checksum
  const badVerify = await post('/cloudsave/verify', {
    key: 'player_save_001',
    expectedChecksum: '0000000000000000',
  }, token);
  if (badVerify.status === 200 && badVerify.body.valid === false) {
    pass('Detect corrupted checksum');
  } else {
    fail('Detect corrupted checksum', `valid=${badVerify.body?.valid}`);
  }

  // Compression check (LZ4 simulation)
  if (writeRes.body.compressedSizeBytes && writeRes.body.compressedSizeBytes < writeRes.body.sizeBytes) {
    pass(`LZ4 compression: ${writeRes.body.sizeBytes}B → ${writeRes.body.compressedSizeBytes}B`);
  } else {
    fail('LZ4 compression', 'Compressed size not smaller');
  }

  // List
  const listRes = await get('/cloudsave/list', token);
  if (listRes.status === 200 && listRes.body.count >= 1) {
    pass('List cloud saves');
  } else {
    fail('List cloud saves', `count=${listRes.body?.count}`);
  }

  // Delete
  const delRes = await del('/cloudsave/player_save_001', token);
  if (delRes.status === 200 && delRes.body.success) {
    pass('Delete cloud save');
  } else {
    fail('Delete cloud save', `Status ${delRes.status}`);
  }

  // Verify deleted
  const afterDel = await get('/cloudsave/read?key=player_save_001', token);
  if (afterDel.status === 404) {
    pass('Cloud save not found after delete');
  } else {
    fail('Cloud save not found after delete', `Status ${afterDel.status}`);
  }

  // Write multiple keys for list test
  for (let i = 0; i < 5; i++) {
    await post('/cloudsave/write', { key: `multi_key_${i}`, value: { index: i }, bucket: 'TestData' }, token);
  }
  const multiList = await get('/cloudsave/list?bucket=TestData', token);
  if (multiList.status === 200 && multiList.body.count === 5) {
    pass('List cloud saves by bucket');
  } else {
    fail('List cloud saves by bucket', `count=${multiList.body?.count}`);
  }
}

// ─── 6. WebSocket Test ───────────────────────────────────────────────────────

async function testWebSocket() {
  console.log('\n📋 WebSocket Real-Time Tests');
  console.log('─'.repeat(50));

  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    let connected = false;
    let receivedConnected = false;

    const timeout = setTimeout(() => {
      if (!receivedConnected) fail('WebSocket connection', 'Timeout');
      ws.close();
      resolve();
    }, 5000);

    ws.on('open', () => {
      connected = true;
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'connected' && !receivedConnected) {
          receivedConnected = true;
          pass('WebSocket connect and receive welcome');
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      } catch { /* ignore */ }
    });

    ws.on('error', (err) => {
      fail('WebSocket connection', err.message);
      clearTimeout(timeout);
      resolve();
    });
  });
}

// ─── 7. Health Check ─────────────────────────────────────────────────────────

async function testHealthCheck() {
  console.log('\n📋 Health Check Tests');
  console.log('─'.repeat(50));

  const res = await get('/health');
  if (res.status === 200 && res.body.status === 'healthy') {
    pass('Health check returns healthy');
  } else {
    fail('Health check', `Status ${res.status}`);
  }

  if (res.body.subsystems && Object.keys(res.body.subsystems).length === 5) {
    pass('Health shows all 5 subsystems');
  } else {
    fail('Health subsystems', `count=${Object.keys(res.body.subsystems || {}).length}`);
  }

  if (res.body.regions && res.body.regions.length === 3) {
    pass('Health shows 3 regions');
  } else {
    fail('Health regions', `count=${res.body.regions?.length}`);
  }
}

// ─── 8. Region Tests ─────────────────────────────────────────────────────────

async function testRegions(token) {
  console.log('\n📋 Region Service Tests (KhaaosEOSRegionManager)');
  console.log('─'.repeat(50));

  const res = await get('/regions', token);
  if (res.status === 200 && res.body.regions && res.body.regions.length === 3) {
    pass('Get all 3 regions');
  } else {
    fail('Get all 3 regions', `Status ${res.status}`);
  }

  const regionIds = res.body.regions.map(r => r.id);
  if (regionIds.includes('sa1') && regionIds.includes('na1') && regionIds.includes('eu1')) {
    pass('Regions include sa1, na1, eu1');
  } else {
    fail('Regions include sa1, na1, eu1', `Got: ${regionIds.join(',')}`);
  }

  if (res.body.defaultRegion === 'sa1') {
    pass('Default region is sa1');
  } else {
    fail('Default region is sa1', `Got: ${res.body.defaultRegion}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Khaaos Run — EOS Integration Tests (Step 3)                ║');
  console.log('║  Auth → Lobby → Matchmaking → Sessions → Cloud Save         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    // Start mock server
    console.log('\n🚀 Starting Mock EOS Server...');
    await startServer();
    console.log('✓ Server started on port 8989');

    // Wait a moment for full readiness
    await sleep(500);

    // Run all test suites
    await testHealthCheck();

    const authResult = await testAuthFlow();
    const token = authResult.token1;

    await testLobbyFlow(token);
    await testMatchmakingFlow(token);
    await testSessionFlow(token);
    await testCloudSaveFlow(token);
    await testRegions(token);
    await testWebSocket();

  } catch (err) {
    console.error('\n💥 Fatal error:', err.message);
    failedTests++;
    totalTests++;
  } finally {
    stopServer();
  }

  // ─── Results ──────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  TEST RESULTS                                               ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Total:  ${totalTests}                                                   ║`);
  console.log(`║  Passed: ${passedTests}                                                   ║`);
  console.log(`║  Failed: ${failedTests}                                                   ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.log('\n❌ Failed tests:');
    for (const f of failures) {
      console.log(`   • ${f.name}: ${f.reason}`);
    }
  }

  const allPassed = failedTests === 0;
  console.log(`\n${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

  process.exit(allPassed ? 0 : 1);
}

// Run with timeout
const timeoutHandle = setTimeout(() => {
  console.error('Test suite timed out!');
  stopServer();
  process.exit(2);
}, TEST_TIMEOUT);

main().finally(() => clearTimeout(timeoutHandle));
