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
// M3 — aceite do milestone: o soak TERMINA sem crescimento contínuo de
// memória/crashes e PUBLICA LATÊNCIAS (p50/p95/p99 de RTT e de gap de snapshot).
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
  // M3 — amostras de latência: RTT de ping/pong e gap entre snapshots.
  const rttSamples = [];
  let lastSnapshotAt = null;
  const snapshotGaps = [];
  const rssStart = process.memoryUsage().rss;
  const connect = () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
    ws.on('message', (raw) => {
      const message = JSON.parse(raw);
      if (message.type === 'match_found') matches += 1;
      if (message.type === 'snapshot') {
        snapshots += 1;
        const now = performance.now(); // M3 — gap entre snapshots (jitter do servidor)
        if (lastSnapshotAt !== null) snapshotGaps.push(now - lastSnapshotAt);
        lastSnapshotAt = now;
      }
      if (message.type === 'pong') rttSamples.push(performance.now() - message.t); // M3 — RTT
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

    // Janela de soak: inputs contínuos + churn a cada CHURN_EVERY_MS + ping p/ RTT.
    const deadline = Date.now() + SOAK_MS;
    let churns = 0;
    let seq = 2;
    let pings = 0;
    while (Date.now() < deadline) {
      for (const ws of sockets) sendInputs(ws, seq++);
      for (const ws of sockets) if (ws.readyState === 1 && (pings++ % 2 === 0)) ws.send(JSON.stringify({ type: 'ping', t: performance.now(), te: Date.now() }));
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

    // M3 — PUBLICA as latências (p50/p95/p99) — aceite do milestone.
    const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null; };
    const latencies = {
      rtt: { n: rttSamples.length, p50: pct(rttSamples, 50), p95: pct(rttSamples, 95), p99: pct(rttSamples, 99) },
      snapshotGap: { n: snapshotGaps.length, p50: pct(snapshotGaps, 50), p95: pct(snapshotGaps, 95), p99: pct(snapshotGaps, 99) },
    };
    console.log(`[soak M3] latências publicadas: RTT p50=${latencies.rtt.p50?.toFixed(1)}ms p95=${latencies.rtt.p95?.toFixed(1)}ms p99=${latencies.rtt.p99?.toFixed(1)}ms (n=${latencies.rtt.n}) · gapSnapshot p50=${latencies.snapshotGap.p50?.toFixed(1)}ms p95=${latencies.snapshotGap.p95?.toFixed(1)}ms (n=${latencies.snapshotGap.n})`);
    // Latência deve ser FINITA e plausível em loopback: p95 de RTT < 500ms.
    assert.ok(latencies.rtt.n > 0, 'RTT amostrado durante o soak');
    assert.ok(latencies.rtt.p95 < 500, `RTT p95 plausível: ${latencies.rtt.p95?.toFixed(1)}ms`);
    assert.ok(latencies.snapshotGap.p95 < 500, `gap de snapshot p95 plausível: ${latencies.snapshotGap.p95?.toFixed(1)}ms`);

    // M3 — memória BOUNDED: sem crescimento contínuo. O soak de CI é curto;
    // a tolerância generosa (64 MB) só dispara com LEAK real (crescimento
    // monotônico por conexão). Soaks longos (KR_SOAK_MS alto) reportam a
    // tendência real no log.
    const rssEnd = process.memoryUsage().rss;
    const growthMb = (rssEnd - rssStart) / 1048576;
    console.log(`[soak M3] RSS: ${(rssStart / 1048576).toFixed(1)} → ${(rssEnd / 1048576).toFixed(1)} MB (Δ ${growthMb.toFixed(1)} MB, ${SOAK_MS}ms, ${PLAYERS + churns} conexões)`);
    assert.ok(growthMb < 64, `memória bounded (Δ ${growthMb.toFixed(1)} MB < 64 MB)`);
  } finally {
    process.off('unhandledRejection', onUnhandled);
    await app.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
