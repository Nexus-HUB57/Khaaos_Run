import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createAuthoritativeServer } from '../server/server.js';
import { AuthService, hashPassword } from '../server/auth.js';
import { DurableJsonStore } from '../server/store.js';
import { SharedMemoryRateStore } from '../server/rateLimit.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Espera a primeira mensagem do tipo esperado numa conexão WS.
function expectMessage(ws, type) {
  return new Promise((resolve, reject) => {
    const onMessage = (raw) => {
      const message = JSON.parse(raw);
      if (message.type === type) { ws.off('message', onMessage); resolve(message); }
    };
    ws.on('message', onMessage);
    ws.once('error', reject);
  });
}

test('multi-instância: réplica simultânea aceita jogador e sessão persistida é visível no arquivo compartilhado', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-multi-'));
  const file = path.join(dir, 'shared.json');
  const auth = new AuthService({ secret: 'multi-secret', users: [{ id: 'u1', username: 'roam', role: 'player', region: 'sa-east', passwordHash: hashPassword('pass', 'salt') }] });
  const a = createAuthoritativeServer({ port: 0, auth, store: new DurableJsonStore(file), rateStore: new SharedMemoryRateStore(), adminToken: 'legacy' });
  const b = createAuthoritativeServer({ port: 0, auth, store: new DurableJsonStore(file), rateStore: new SharedMemoryRateStore(), adminToken: 'legacy' });
  await Promise.all([new Promise((r) => a.server.listen(0, r)), new Promise((r) => b.server.listen(0, r))]);
  const pa = a.server.address().port;
  const pb = b.server.address().port;
  const token = auth.login('roam', 'pass').token;
  let first;
  try {
    // Jogador entra na instância A e recebe resumeToken.
    first = new WebSocket(`ws://127.0.0.1:${pa}/ws?token=${token}`);
    const found = await expectMessage(first, 'match_found');
    assert.ok(found.resumeToken);
    assert.ok(found.roomId);
    first.close();
    // O close persiste a sessão com janela de retomada (15 s).
    await wait(80);
    // Uma réplica que carrega o arquivo enxerga a sessão gravada por A.
    const replicaView = new DurableJsonStore(file);
    const sessions = replicaView.listSessions();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].roomId, found.roomId);
    assert.ok(sessions[0].expiresAt > Date.now());
    // Reconnect na réplica B com o resumeToken de A: salas não cruzam instâncias
    // (estado é por processo), então a sessão degrada para alocação nova — nunca erro.
    const second = new WebSocket(`ws://127.0.0.1:${pb}/ws?token=${token}&resume=${found.resumeToken}`);
    const fallback = await expectMessage(second, 'match_found');
    assert.ok(fallback.resumeToken);
    assert.notEqual(fallback.resumeToken, found.resumeToken);
    assert.ok(b.metrics.connections >= 1);
    assert.equal(b.metrics.storeReadFailures, 0);
    second.close();
  } finally {
    if (first) first.close();
    await Promise.all([a.close(), b.close()]);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('reinício: sessão sobrevive ao encerramento do processo e reconnect pós-restart é aceito sem erro', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-restart-'));
  const file = path.join(dir, 'state.json');
  const auth = new AuthService({ secret: 'restart-secret', users: [{ id: 'u1', username: 'boomerang', role: 'player', region: 'us-east', passwordHash: hashPassword('pass', 'salt') }] });
  const first = createAuthoritativeServer({ port: 0, auth, store: new DurableJsonStore(file), rateStore: new SharedMemoryRateStore(), adminToken: 'legacy' });
  await new Promise((r) => first.server.listen(0, r));
  const token = auth.login('boomerang', 'pass').token;
  let ws;
  try {
    ws = new WebSocket(`ws://127.0.0.1:${first.server.address().port}/ws?token=${token}`);
    const found = await expectMessage(ws, 'match_found');
    const oldResume = found.resumeToken;
    // "Crash" controlado: encerra a instância (fecha sockets e server).
    ws.close();
    await first.close();
    await wait(80); // flush da sessão no close
    // Estado persistido sobrevive ao processo.
    const persisted = new DurableJsonStore(file).listSessions();
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].userId, 'u1');
    // Nova instância (mesmo arquivo, mesma auth) aceita o jogador de volta.
    const revived = createAuthoritativeServer({ port: 0, auth, store: new DurableJsonStore(file), rateStore: new SharedMemoryRateStore(), adminToken: 'legacy' });
    await new Promise((r) => revived.server.listen(0, r));
    try {
      const again = new WebSocket(`ws://127.0.0.1:${revived.server.address().port}/ws?token=${token}&resume=${oldResume}`);
      const resumed = await expectMessage(again, 'match_found');
      assert.ok(resumed.resumeToken);
      assert.notEqual(resumed.resumeToken, oldResume); // sala morreu com o processo: alocação nova
      assert.equal(revived.metrics.connections, 1);
      again.close();
    } finally {
      await revived.close();
    }
  } finally {
    if (ws) try { ws.close(); } catch {}
    await first.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
