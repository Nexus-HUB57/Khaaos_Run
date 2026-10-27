// Fase 17 — ROTEAMENTO DE UPGRADE: /ws (jogo) e /ws/spectator coexistem.
// =====================================================================
// Regressão do bug WS_ERR_UNEXPECTED_RSV_1: dois WebSocketServer criados com
// `{ server }` no MESMO http server recebem TODOS os eventos 'upgrade' e o ws
// ≥8 aborta com 400 o path alheio DEPOIS que o WSS dono já escreveu o 101.
// O cliente, já em modo de frames, lê "HTTP/1.1 400..." como frame — o
// primeiro byte 'H' (0x48) seta RSV1 — e cai com WS_ERR_UNEXPECTED_RSV_1.
// Estes testes usam socket CRU (net) para enxergar os bytes exatos do
// handshake, coisa que o cliente ws não deixa observar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import crypto from 'node:crypto';
import WebSocket from 'ws';

const { AuthService, hashPassword } = await import('../server/auth.js');
const { DurableJsonStore } = await import('../server/store.js');
const { createAuthoritativeServer } = await import('../server/server.js');
const { SpectatorPipeline } = await import('../server/spectator.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Handshake WebSocket manual por socket cru — devolve os bytes brutos. */
async function rawHandshake(port, requestPath) {
  const socket = net.connect(port, '127.0.0.1');
  await once(socket, 'connect');
  const chunks = [];
  socket.on('data', (chunk) => chunks.push(chunk));
  const closed = new Promise((resolve) => socket.once('close', () => resolve(true)));
  // key do RFC 6455: exatamente 16 bytes aleatórios em base64 (24 chars, '==').
  const key = crypto.randomBytes(16).toString('base64');
  assert.match(key, /^[+/0-9A-Za-z]{22}==$/, 'key deve satisfazer o keyRegex do ws');
  socket.write(
    `GET ${requestPath} HTTP/1.1\r\n` +
    `Host: 127.0.0.1:${port}\r\n` +
    `Upgrade: websocket\r\n` +
    `Connection: Upgrade\r\n` +
    `Sec-WebSocket-Key: ${key}\r\n` +
    `Sec-WebSocket-Version: 13\r\n\r\n`
  );
  return {
    text: () => Buffer.concat(chunks).toString('latin1'),
    closed,
    end: () => socket.destroy(),
  };
}

test('regressão RSV1: upgrade de /ws recebe 101 e NUNCA bytes de 400 no mesmo socket', { timeout: 10000 }, async () => {
  const app = createAuthoritativeServer({ port: 0, adminToken: 'legacy' });
  await new Promise((r) => app.server.listen(0, r));
  try {
    const raw = await rawHandshake(app.server.address().port, '/ws?token=invalido');
    await wait(150); // janela para um 400 espúrio aparecer (bug: chegava logo após o 101)
    const bytes = raw.text();
    assert.ok(bytes.includes('101 Switching Protocols'), 'handshake /ws deve completar');
    assert.ok(!bytes.includes('400 Bad Request'), `outro WSS poluiu o socket do /ws: ${bytes.slice(0, 200)}`);
    raw.end();
  } finally {
    await app.close();
  }
});

test('coexistência: jogador (/ws) e espectador (/ws/spectator) no MESMO http server', { timeout: 15000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-ws-router-'));
  const auth = new AuthService({
    secret: 'router-secret',
    users: [{ id: 'u1', username: 'player', role: 'player', region: 'sa-east', passwordHash: hashPassword('pass', 'salt') }],
  });
  const app = createAuthoritativeServer({ port: 0, auth, store: new DurableJsonStore(path.join(dir, 'state.json')), adminToken: 'legacy' });
  await new Promise((resolve) => app.server.listen(0, resolve));
  const port = app.server.address().port;
  try {
    const token = auth.login('player', 'pass').token;

    // Jogador no /ws autenticado — handshake limpo e match_found (chega DEPOIS
    // do 'queued' da fila de matchmaking — filtrar por tipo, como na infra).
    const player = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
    const messages = [];
    const playerFound = new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error(`timeout aguardando match_found; recebido: ${messages.map((m) => m.type).join(',')}`)), 6000);
      player.on('message', (rawMsg) => { const m = JSON.parse(rawMsg.toString()); messages.push(m); if (m.type === 'match_found') { clearTimeout(to); resolve(m); } });
      player.once('error', reject);
    });
    await once(player, 'open');

    // Espectador no /ws/spectator — MESMO server, MESMO roteador.
    const spectator = new WebSocket(`ws://127.0.0.1:${port}/ws/spectator?roomId=sala-router`);
    const spectatorMessage = new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('timeout aguardando SPECTATOR_WELCOME')), 6000);
      spectator.once('message', (rawMsg) => { clearTimeout(to); resolve(JSON.parse(rawMsg.toString())); });
      spectator.once('error', reject);
    });
    await once(spectator, 'open');

    const found = await playerFound;
    assert.equal(found.type, 'match_found');
    const welcome = await spectatorMessage;
    assert.equal(welcome.type, 'SPECTATOR_WELCOME');
    assert.equal(welcome.roomId, 'sala-router');

    player.close();
    spectator.close();
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('path desconhecido: socket destruído sem 101 (roteador não vaza handshake)', { timeout: 10000 }, async () => {
  const app = createAuthoritativeServer({ port: 0, adminToken: 'legacy' });
  await new Promise((r) => app.server.listen(0, r));
  try {
    const raw = await rawHandshake(app.server.address().port, '/ws/desconhecido');
    const wasClosed = await Promise.race([raw.closed.then(() => true), wait(500).then(() => false)]);
    assert.ok(wasClosed, 'roteador deve destruir upgrades de paths órfãos');
    assert.ok(!raw.text().includes('101 Switching Protocols'), 'nenhum handshake para path desconhecido');
  } finally {
    await app.close();
  }
});

test('attach autoRoute: socket de path alheio fica INTOCADO (sem 400 espúrio) e o path próprio funciona', { timeout: 15000 }, async () => {
  const server = http.createServer((_req, res) => { res.writeHead(200); res.end(); });
  // Socket de upgrade não-claimado vira zumbi no http server (parser destacado,
  // nada consome o FIN do cliente) — rastrear na mão p/ destruir no fim.
  const openSockets = new Set();
  server.on('connection', (socket) => { openSockets.add(socket); socket.once('close', () => openSockets.delete(socket)); });
  const pipeline = new SpectatorPipeline().attach(server);
  server.listen(0);
  await once(server, 'listening');
  const port = server.address().port;
  try {
    // Path alheio (/ws do jogo não existe aqui — mas NÃO pode receber 400 do WSS do espectador).
    const raw = await rawHandshake(port, '/ws?token=x');
    await wait(150);
    const bytes = raw.text();
    assert.ok(!bytes.includes('400 Bad Request'), `autoRoute abortou socket alheio: ${bytes.slice(0, 200)}`);
    assert.ok(!bytes.includes('101 Switching Protocols'), 'não deve responder handshake alheio');
    raw.end();

    // Path próprio segue funcionando com autoRoute ligado.
    const spectator = new WebSocket(`ws://127.0.0.1:${port}/ws/spectator?roomId=sala-auto`);
    const welcome = await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('timeout aguardando SPECTATOR_WELCOME')), 4000);
      spectator.once('message', (m) => { clearTimeout(to); resolve(JSON.parse(m.toString())); });
      spectator.once('error', reject);
    });
    assert.equal(welcome.type, 'SPECTATOR_WELCOME');
    spectator.close();
  } finally {
    pipeline.destroy();
    for (const socket of openSockets) { try { socket.destroy(); } catch { /* já fechado */ } }
    await new Promise((resolve) => server.close(resolve));
  }
});
