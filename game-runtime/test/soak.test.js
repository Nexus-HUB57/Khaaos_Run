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

// Soak com duração limitada para caber em CI: jogadores em salas cheias,
// churn contínuo (sai 1 / entra 1) e invariâncias de fluxo de snapshots.
// KR_SOAK_MS aumenta a duração em ambientes de soak reais (padrão 2500 ms).
const SOAK_MS = Number(process.env.KR_SOAK_MS || 2500);
const PLAYERS = 12;
const CAPACITY = 4;
const CHURN_EVERY_MS = 300;

test(`soak: ${PLAYERS} jogadores com churn contínuo por ${SOAK_MS} ms — snapshots não param e nada fica órfão`, { timeout: 60_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-soak-'));
  const auth = new AuthService({ secret: 'soak-secret', users: [{ id: 'u1', username: 'marathon', role: 'player', region: 'sa-east', passwordHash: hashPassword('pass', 'salt') }] });
  const app = createAuthoritativeServer({ port: 0, roomCapacity: CAPACITY, auth, store: new DurableJsonStore(path.join(dir, 'state.json')), rateStore: new SharedMemoryRateStore(), adminToken: 'legacy' });
  await new Promise((r) => app.server.listen(0, r));
  const port = app.server.address().port;
  const token = auth.login('marathon', 'pass').token;

  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(String(reason?.message || reason));
  process.on('unhandledRejection', onUnhandled);

  let matches = 0;
  let snapshots = 0;
  const connect = () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
    ws.on('message', (raw) => {
      const message = JSON.parse(raw);
      if (message.type === 'match_found') matches += 1;
      if (message.type === 'snapshot') snapshots += 1;
    });
    ws.on('open', () => ws.send(JSON.stringify({ type: 'input', input: { seq: 1, dx: 0, dy: 0, aimX: 550, aimY: 330, fire: false, interact: false } })));
    ws.on('error', () => {}); // sockets fechados no churn podem emitir ECONNRESET benigno
    return ws;
  };
  const sendInputs = (ws, seq) => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'input', input: { seq, dx: 0, dy: 0, aimX: 550, aimY: 330, fire: false, interact: false } })); };

  try {
    const sockets = [];
    for (let i = 0; i < PLAYERS; i += 1) sockets.push(connect());
    await new Promise((r) => setTimeout(r, 200)); // abre e aloca
    const initialMatches = matches;
    assert.ok(initialMatches >= PLAYERS, `todos alocados: ${initialMatches}/${PLAYERS}`);

    // Janela de soak: inputs contínuos + churn a cada CHURN_EVERY_MS.
    const deadline = Date.now() + SOAK_MS;
    let churns = 0;
    let seq = 2;
    while (Date.now() < deadline) {
      for (const ws of sockets) sendInputs(ws, seq++);
      if (churns < sockets.length) {
        const victim = sockets[churns];
        victim.close();
        sockets[churns] = connect();
        churns += 1;
      }
      await new Promise((r) => setTimeout(r, CHURN_EVERY_MS));
    }
    const snapshotAfterLoad = snapshots;

    // Dreno: 500 ms finais de fluxo estável.
    for (const ws of sockets) sendInputs(ws, seq++);
    await new Promise((r) => setTimeout(r, 500));

    // Invariâncias de soak:
    assert.ok(snapshots >= PLAYERS * 10, `snapshots acumulados: ${snapshots}`);
    assert.ok(snapshots > snapshotAfterLoad, 'snapshots continuaram fluindo após o churn');
    assert.ok(matches >= PLAYERS + churns, `match_found com churn: ${matches} (churns ${churns})`);
    assert.ok(app.rooms.size >= 1 && app.rooms.size <= Math.ceil((PLAYERS + churns) / CAPACITY) + 1, `salas estáveis: ${app.rooms.size}`);
    const metrics = await fetch(`http://127.0.0.1:${port}/admin/metrics?token=legacy`).then((r) => r.json());
    assert.equal(metrics.metrics.connections, PLAYERS + churns, 'contador cumulativo de conexões = iniciais + churn');
    assert.equal(metrics.queue, 0, 'nenhum jogador abandonado na fila');
    assert.ok(metrics.metrics.ticks > 0);
    // Sem rejeições não tratadas durante todo o soak.
    assert.deepEqual(unhandled, []);
    for (const ws of sockets) ws.close();
  } finally {
    process.off('unhandledRejection', onUnhandled);
    await app.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
