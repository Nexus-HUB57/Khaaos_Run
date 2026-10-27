// Fase 14 — Pipeline de espectador no game node (server/spectator.js).
// E2E com WS REAL (http server + cliente ws), igual ao ambiente de produção:
// /ws/spectator no MESMO http server do jogo, delay buffer + batch + fan-out
// e métricas consumidas pelo /admin/metrics (Command Monitor).
// room3d.spectatorView() é testado com sala REAL (bots nominais + killfeed).
// NOTA de corrida: o SPECTATOR_WELCOME sai no mesmo chunk do handshake — o
// listener de 'message' tem que estar ligado ANTES do await de 'open'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';

const { SpectatorPipeline, SpectatorConfig } = await import('../server/spectator.js');
const { createAuthoritativeServer } = await import('../server/server.js');
const { MatchRoom3D } = await import('../server/room3d.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Conecta um espectador capturando a PRIMEIRA mensagem sem corrida. */
async function openSpectator(port, query) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/spectator?${query}`);
  const firstMessage = new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('timeout aguardando primeira mensagem')), 3000);
    ws.once('message', (raw) => { clearTimeout(to); resolve(JSON.parse(raw.toString())); });
  });
  await once(ws, 'open');
  return { ws, firstMessage };
}

async function nextMessage(ws, { timeoutMs = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('timeout aguardando mensagem')), timeoutMs);
    ws.once('message', (raw) => { clearTimeout(to); resolve(JSON.parse(raw.toString())); });
  });
}

async function withServer(pipeline, fn) {
  const server = http.createServer((_req, res) => { res.writeHead(200); res.end(); });
  pipeline.attach(server);
  server.listen(0);
  await once(server, 'listening');
  try {
    await fn(server.address().port, pipeline);
  } finally {
    pipeline.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('config canônica compartilhada com a trilha TS', () => {
  assert.equal(SpectatorConfig.delayMs, 10_000);
  assert.equal(SpectatorConfig.maxSpectatorsPerRoom, 500);
  assert.equal(SpectatorConfig.batchIntervalMs, 200);
  assert.equal(SpectatorConfig.globalMaxSpectators, 5_000);
  assert.equal(SpectatorConfig.maxEventsPerBatch, 20);
});

test('e2e WS: welcome, delay buffer por sala, SET_CAMERA e lixo não derrubam o espectador', async () => {
  await withServer(new SpectatorPipeline(), async (port, pipeline) => {
    const { ws, firstMessage } = await openSpectator(port, 'roomId=sala-live&camera=FOLLOW_PLAYER');
    const welcome = await firstMessage;
    assert.equal(welcome.type, 'SPECTATOR_WELCOME');
    assert.equal(welcome.roomId, 'sala-live');
    assert.equal(welcome.cameraMode, 'FOLLOW_PLAYER');
    assert.equal(welcome.delayMs, 10_000);

    // Sem plateia → pushGameData é no-op (nenhuma sala registrada).
    pipeline.pushGameData('sala-sem-plateia', { type: 'MATCH_TICK', players: [], events: [] });
    assert.equal(pipeline.metrics().totalSpectators, 1, 'um espectador conectado');

    // Payload no contrato da trilha TS + displayName (Fase 14) entra no delay
    // buffer da sala (10 s anti-ghosting antes do fan-out).
    const entry = pipeline.rooms.get('sala-live');
    assert.ok(entry, 'sala registrada com buffer/agregador/timer');
    pipeline.pushGameData('sala-live', {
      type: 'MATCH_TICK', roomId: 'sala-live', timestamp: Date.now(),
      players: [{ id: 'c1', displayName: 'Khael Vance', species: 'HURAN', posX: 3, posY: 4, health: 80, shield: 50, isDowned: false, isEliminated: false, kills: 2 }],
      ringState: { currentPhase: 1, currentRadius: 520, ringCenter: [0, 0, 0], isShrinking: true, nextPhaseIn: 95 },
      events: [{ type: 'ELIMINATION', data: { killer: 'Khael Vance', victim: 'Bot-7', knock: false }, timestamp: Date.now() }],
    });
    assert.equal(entry.buffer.size, 1, 'payload enfileirado no delay buffer');

    // SET_CAMERA e lixo: nunca derrubam o espectador
    ws.send(JSON.stringify({ type: 'SET_CAMERA', cameraMode: 'OVERHEAD', followPlayerId: 'c1' }));
    ws.send('isto não é json');
    await wait(30);
    assert.equal(pipeline.metrics().totalSpectators, 1, 'cliente vivo após mensagens arbitrárias');

    const metrics = pipeline.metrics();
    assert.equal(metrics.peakSpectators, 1);
    assert.equal(metrics.limits.maxSpectatorsPerRoom, 500);
    assert.deepEqual(metrics.totals, { packetsSent: 0, bytesSent: 0 }, 'nada fan-out antes do delay de 10 s');
    assert.equal(metrics.rooms[0].roomId, 'sala-live');
    assert.equal(metrics.rooms[0].spectators, 1);

    ws.close();
  });
});

test('fan-out real: batch chega no cliente com throttle/metrics contabilizados', async () => {
  // delay 0 p/ exercitar o ciclo completo sem esperar 10 s (mesmos caminhos:
  // buffer → agregador → fan-out → contadores).
  await withServer(new SpectatorPipeline({ delayMs: 0 }), async (port, pipeline) => {
    const { ws, firstMessage } = await openSpectator(port, 'roomId=tv-1');
    await firstMessage; // welcome

    pipeline.pushGameData('tv-1', {
      type: 'MATCH_TICK', roomId: 'tv-1', timestamp: Date.now(),
      players: [{ id: 'a1', displayName: 'Operative Alpha', species: 'VENEX', posX: 1, posY: 2, health: 100, shield: 0, isDowned: false, isEliminated: false, kills: 1 }],
      ringState: { currentPhase: 0, currentRadius: 168, ringCenter: [0, 0, 0], isShrinking: false, nextPhaseIn: 20 },
      events: [{ type: 'REVIVE', data: { by: 'Med', victim: 'Bravo' }, timestamp: Date.now() }],
    });

    const batch = await nextMessage(ws);
    assert.equal(batch.type, 'SPECTATOR_BATCH');
    assert.equal(batch.roomId, 'tv-1');
    assert.equal(batch.data.players[0].displayName, 'Operative Alpha', 'nome real viaja no payload');
    assert.equal(batch.events[0].type, 'REVIVE');
    assert.ok(batch.batchSize >= 1);

    const metrics = pipeline.metrics();
    assert.ok(metrics.totals.packetsSent >= 1, 'pacote contabilizado no total');
    assert.ok(metrics.totals.bytesSent > 0, 'bytes contabilizados no total');
    assert.equal(metrics.rooms[0].packetsSent, metrics.totals.packetsSent);
    assert.equal(metrics.rooms[0].bytesSent, metrics.totals.bytesSent);

    // pushRoom: sala sem espectador não é tocada (callback não dispara)
    pipeline.pushRoom({ id: 'sala-fantasma', spectatorView: () => { throw new Error('não deveria ser chamado'); } });

    ws.close();
    await wait(30);
    assert.equal(pipeline.metrics().totalSpectators, 0, 'close remove o espectador');
    assert.equal(pipeline.metrics().rooms.length, 0, 'última saída encerra a sala (timer/buffers)');
  });
});

test('room3d.spectatorView: nomes reais, ring no contrato e eventos espelhados (não-destrutivo)', () => {
  const room = new MatchRoom3D({ id: 'tv-room', seed: 'tv-seed-1', region: 'sa-east', capacity: 16, botFill: 5, airdrop: false });
  room.addPlayer('h1', 'Sargento HURAN-01');
  assert.ok(room.start('h1', 'belt'), 'sala iniciada com bots nominais');

  const view = room.spectatorView();
  assert.equal(view.type, 'ROOM_TICK');
  assert.equal(view.roomId, 'tv-room');
  assert.equal(view.players.length, 6, '1 humano + 5 bots nominais');
  assert.ok(view.players.some((p) => p.displayName === 'Sargento HURAN-01'), 'humano com nome real');
  for (const p of view.players) {
    assert.ok(p.displayName && p.displayName.length > 0, 'todo ator tem nome real (displayName)');
    assert.equal(typeof p.health, 'number');
    assert.equal(typeof p.isEliminated, 'boolean');
    assert.equal(p.isDowned, false);
  }
  assert.ok(view.ringState.currentRadius > 0, 'ring no contrato do espectador');
  assert.equal(typeof view.ringState.isShrinking, 'boolean');
  assert.ok(Number.isFinite(view.ringState.nextPhaseIn));

  // eventos: killfeed/pulse espelham para a transmissão com nomes já formatados
  room.spectatorLogEvent('ELIMINATION', { killer: 'Sargento ZHEERS-03', victim: 'Recruta VENEX-02', headshot: false, knock: true });
  const view2 = room.spectatorView();
  const last = view2.events.at(-1);
  assert.equal(last.type, 'ELIMINATION');
  assert.equal(last.data.killer, 'Sargento ZHEERS-03');
  assert.equal(last.data.knock, true);
  // fila dos jogadores intacta (não-destrutivo — spectatorLog é espelho próprio)
  assert.equal(room.spectatorLog.length >= 1, true);
});

test('integração createAuthoritativeServer: /admin/metrics expõe o bloco spectators', async () => {
  const app = createAuthoritativeServer({ port: 0, adminToken: 'spec-admin-token' });
  app.server.listen(0);
  await once(app.server, 'listening');
  try {
    const res = await fetch(`http://127.0.0.1:${app.server.address().port}/admin/metrics?token=spec-admin-token`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.spectators, 'bloco de métricas da transmissão presente');
    assert.equal(body.spectators.totalSpectators, 0);
    assert.equal(body.spectators.peakSpectators, 0);
    assert.equal(body.spectators.limits.maxSpectatorsPerRoom, 500);
    assert.deepEqual(body.spectators.totals, { packetsSent: 0, bytesSent: 0 });
    assert.deepEqual(body.spectators.rooms, []);
  } finally {
    await app.close();
  }
});

test('capacidade: acima do teto da sala a conexão é recusada com 1013; outra sala segue', async () => {
  await withServer(new SpectatorPipeline({ maxSpectatorsPerRoom: 1, delayMs: 0 }), async (port, pipeline) => {
    const { ws: first, firstMessage } = await openSpectator(port, 'roomId=cheia');
    await firstMessage; // welcome

    const second = new WebSocket(`ws://127.0.0.1:${port}/ws/spectator?roomId=cheia`);
    const [code] = await once(second, 'close');
    assert.equal(code, 1013, 'código de capacidade esgotada');
    assert.equal(pipeline.metrics().rejected, 1);
    assert.equal(pipeline.metrics().totalSpectators, 1);

    // sala DIFERENTE não é afetada pelo teto da outra
    const other = await openSpectator(port, 'roomId=outra');
    const w2 = await other.firstMessage;
    assert.equal(w2.type, 'SPECTATOR_WELCOME');

    first.close(); other.ws.close();
  });
});
