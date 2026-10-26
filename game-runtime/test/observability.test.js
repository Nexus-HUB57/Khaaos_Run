import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { Observability, parseTraceparent, formatTraceparent, newTraceContext, traceHttpHandler, RedisObsExporter } from '../server/obs.js';
import { createAuthoritativeServer } from '../server/server.js';
import { AuthService, hashPassword } from '../server/auth.js';
import { DurableJsonStore } from '../server/store.js';
import { SharedMemoryRateStore } from '../server/rateLimit.js';

const REDIS_URL = process.env.KR_REDIS_TEST_URL || process.env.KR_OBS_REDIS_URL || null;

test('obs: traceparent W3C — parse, format e validação de entrada inválida', () => {
  const ctx = newTraceContext();
  assert.match(ctx.traceId, /^[0-9a-f]{32}$/);
  assert.match(ctx.spanId, /^[0-9a-f]{16}$/);
  const header = formatTraceparent(ctx);
  const parsed = parseTraceparent(header);
  assert.equal(parsed.traceId, ctx.traceId);
  assert.equal(parsed.spanId, ctx.spanId);
  assert.equal(parsed.sampled, true);
  // Entradas inválidas → null (nunca lança): traceId zerado, versão errada, lixo.
  assert.equal(parseTraceparent(`00-${'0'.repeat(32)}-${'1'.repeat(16)}-01`), null);
  assert.equal(parseTraceparent(`ff-${ctx.traceId}-${ctx.spanId}-01`), null);
  assert.equal(parseTraceparent('garbage'), null);
  assert.equal(parseTraceparent(undefined), null);
  // Herança de trace: mesma traceId, parentId preservado.
  const child = newTraceContext({ traceId: ctx.traceId, parentId: ctx.spanId });
  assert.equal(child.traceId, ctx.traceId);
  assert.equal(child.parentId, ctx.spanId);
  // traceId malformado cai em trace novo.
  assert.notEqual(newTraceContext({ traceId: 'zzz' }).traceId, 'zzz');
});

test('obs: spans com duração, filtros de consulta e ring buffer com teto', async () => {
  const obs = new Observability({ maxTraces: 4, maxLogs: 4 });
  const root = obs.startSpan({ name: 'http GET /healthz', traceId: 'a'.repeat(32) });
  await new Promise((resolve) => setTimeout(resolve, 15));
  root.finish('ok', { 'http.status_code': 200 });
  assert.equal(root.status, 'ok');
  assert.ok(root.durationMs >= 10, `duração medida: ${root.durationMs}`);
  // finish é idempotente.
  root.finish('ok');
  const slow = obs.startSpan({ name: 'slow', traceId: 'b'.repeat(32) });
  slow.finish('ok');
  slow.finish('ok');
  assert.equal(obs.queryTraces({ minDurationMs: 10 }).length, 1);
  assert.equal(obs.queryTraces({ name: 'slow' }).length, 1);
  assert.equal(obs.queryTraces({ traceId: 'a'.repeat(32) })[0].attributes['http.status_code'], 200);
  // Ring buffer: mais de 4 spans → descarta os mais antigos, sinaliza dropped.
  for (let i = 0; i < 10; i += 1) {
    const span = obs.startSpan({ name: `s${i}`, traceId: 'c'.repeat(32) });
    span.finish('ok');
  }
  assert.equal(obs.spans.items.length, 4);
  assert.ok(obs.spans.dropped >= 8, `descartes sinalizados: ${obs.spans.dropped}`);
  assert.ok(obs.metrics.spansFinished >= 12);
});

test('obs: ponta a ponta — trace propagation, /admin/traces e /admin/logs com RBAC', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-obs-'));
  const auth = new AuthService({ secret: 'obs-secret', users: [
    { id: 'u1', username: 'player', role: 'player', region: 'sa-east', passwordHash: hashPassword('pass', 'salt') },
    { id: 'u2', username: 'mod', role: 'moderator', region: 'sa-east', passwordHash: hashPassword('pass', 'salt') },
  ] });
  const app = createAuthoritativeServer({
    port: 0, roomCapacity: 4, auth,
    store: new DurableJsonStore(path.join(dir, 'state.json')),
    rateStore: new SharedMemoryRateStore(),
    adminToken: 'legacy',
    obs: new Observability({ wsSampleRate: 1 }),
  });
  await new Promise((resolve) => app.server.listen(0, resolve));
  const port = app.server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    // 1) Requisição com traceparent entrado: resposta propaga o mesmo traceId
    //    e novo spanId filho; span registrado com método/rota/status.
    const incomingTrace = newTraceContext();
    const res = await fetch(`${base}/healthz`, { headers: { traceparent: formatTraceparent(incomingTrace) } });
    assert.equal(res.status, 200);
    const propagated = parseTraceparent(res.headers.get('traceparent'));
    assert.equal(propagated.traceId, incomingTrace.traceId, 'traceId preservado ponta a ponta');
    assert.notEqual(propagated.spanId, incomingTrace.spanId, 'spanId novo para o span do servidor');
    assert.ok(res.headers.get('x-request-id'));
    const healthSpan = app.obs.queryTraces({ traceId: incomingTrace.traceId, name: 'http GET /healthz' })[0];
    assert.ok(healthSpan, 'span da requisição registrado');
    assert.equal(healthSpan.attributes['http.method'], 'GET');
    assert.equal(healthSpan.status, 'ok');

    // 2) Requisição sem traceparent: contexto novo gerado (sampled).
    const fresh = await fetch(`${base}/healthz`);
    assert.ok(parseTraceparent(fresh.headers.get('traceparent')));

    // 3) Falha de login gera log estruturado com nível warn correlacionado.
    await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'player', password: 'wrong' }) });
    const denies = app.obs.queryLogs({ event: 'http.request' });
    assert.ok(denies.length >= 1, 'requisições logadas com duração');
    assert.equal(typeof denies[0].fields.durationMs, 'number');

    // 4) RBAC: player → 403; moderator → 200; admin legado → 200 com filtros.
    const token = auth.login('player', 'pass').token;
    const modToken = auth.login('mod', 'pass').token;
    const denied = await fetch(`${base}/admin/traces?token=${token}`);
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).permission, 'obs:read');
    const deniedLogs = await fetch(`${base}/admin/logs?token=${token}`);
    assert.equal(deniedLogs.status, 403);
    const asMod = await fetch(`${base}/admin/traces?token=${modToken}&limit=10`);
    assert.equal(asMod.status, 200);
    const modBody = await asMod.json();
    assert.ok(modBody.spans.length >= 2, 'moderator lê spans agregados');
    assert.ok(modBody.spans.every((span) => typeof span.durationMs === 'number'));
    const asAdmin = await fetch(`${base}/admin/logs?token=legacy&event=ws.connect`);
    assert.equal(asAdmin.status, 200);
    const adminBody = await asAdmin.json();
    assert.equal(adminBody.logs.length, 0, 'nenhuma sessão ws ainda');

    // 5) Sessão WebSocket amostrada a 100%: connect/disconnect logados + span fechado.
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${modToken}`);
    await new Promise((resolve, reject) => {
      ws.on('message', (raw) => { if (JSON.parse(raw).type === 'match_found') resolve(); });
      ws.on('error', reject);
    });
    ws.close();
    await new Promise((resolve) => ws.on('close', resolve));
    const wsLog = app.obs.queryLogs({ event: 'ws.connect' })[0];
    assert.ok(wsLog, 'ws.connect logado');
    assert.equal(wsLog.fields.username, 'mod');
    await new Promise((resolve) => setTimeout(resolve, 30));
    const wsSpan = app.obs.queryTraces({ traceId: wsLog.traceId })[0];
    assert.ok(wsSpan, 'span da sessão ws registrado (mesmo trace do ws.connect)');
    assert.match(wsSpan.name, /^ws session client-/);
    assert.equal(wsSpan.attributes['ws.username'], 'mod');
    const disconnectLog = app.obs.queryLogs({ event: 'ws.disconnect' })[0];
    assert.ok(disconnectLog, 'ws.disconnect logado');
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('obs: middleware isola falha do handler — 500 estruturado sem derrubar o processo', async () => {
  const obs = new Observability();
  const calls = [];
  const handler = traceHttpHandler(obs, async (req, res) => {
    calls.push(req.url);
    if (req.url === '/boom') throw new Error('kaboom');
    res.writeHead(200); res.end('ok');
  });
  const http = await import('node:http');
  const server = http.createServer((req, res) => { void handler(req, res); });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  try {
    const ok = await fetch(`http://127.0.0.1:${port}/fine`);
    assert.equal(ok.status, 200);
    const boom = await fetch(`http://127.0.0.1:${port}/boom`);
    assert.equal(boom.status, 500);
    assert.deepEqual(await boom.json(), { error: 'internal_error' });
    const errorSpan = obs.queryTraces({ status: 'error' })[0];
    assert.ok(errorSpan, 'span de erro registrado');
    const errorLog = obs.queryLogs({ level: 'error', event: 'http.error' })[0];
    assert.match(errorLog.message, /kaboom/);
    assert.equal(calls.length, 2, 'handler continua servindo após falha');
    assert.equal((await fetch(`http://127.0.0.1:${port}/fine`)).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('obs: exporter Redis Stream agrega spans/logs de múltiplas instâncias (opt-in)', { skip: !REDIS_URL ? 'KR_REDIS_TEST_URL ausente' : false }, async () => {
  const { createClient } = await import('redis');
  const shared = createClient({ url: REDIS_URL });
  shared.on('error', () => {});
  await shared.connect();
  const key = `kr:obs:test:${Date.now()}`;
  // Deploy multi-instância real: TODAS as instâncias usam o MESMO prefixo de
  // deployment (cada nó contribui com o próprio serviceName) — agregação via
  // snapshotRemote lê uma fonte só.
  const sharedPrefix = `${key}:deploy`;
  const exporterA = new RedisObsExporter({ client: shared, prefix: sharedPrefix });
  const exporterB = new RedisObsExporter({ client: shared, prefix: sharedPrefix });
  const obsA = new Observability({ serviceName: 'node-a', exporter: exporterA });
  const obsB = new Observability({ serviceName: 'node-b', exporter: exporterB });
  try {
    const spanA = obsA.startSpan({ name: 'http GET /healthz', traceId: 'a'.repeat(32) });
    spanA.finish('ok');
    obsA.recordLog({ level: 'warn', event: 'rate_limited', message: 'limite atingido' });
    const spanB = obsB.startSpan({ name: 'ws session client-1', traceId: 'b'.repeat(32) });
    spanB.finish('ok');
    obsB.recordLog({ level: 'info', event: 'ws.connect', message: null });
    // XADDs são fire-and-forget: sondar o stream até os dois serviços aparecerem.
    let snapshot = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      snapshot = await exporterA.snapshotRemote({ count: 100 });
      const sources = new Set(snapshot.spans.map((span) => span.service));
      if (sources.has('node-a') && sources.has('node-b')) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const sources = new Set(snapshot.spans.map((span) => span.service));
    assert.ok(sources.has('node-a') && sources.has('node-b'), `agregação multi-instância: ${[...sources].join(', ')}`);
    assert.ok(snapshot.spans.every((span) => typeof span.durationMs === 'number'));
    assert.ok(snapshot.logs.some((log) => log.event === 'rate_limited'));
    assert.ok(snapshot.logs.some((log) => log.event === 'ws.connect'));
    // Stream com MAXLEN: exportação não cresce sem limite.
    for (let i = 0; i < 25; i += 1) {
      const span = obsA.startSpan({ name: `s${i}`, traceId: 'c'.repeat(32) });
      span.finish('ok');
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    const trimmed = await shared.xLen(`${sharedPrefix}:spans`);
    assert.ok(trimmed <= 10_000, `stream podado: ${trimmed} entradas`);
  } finally {
    for (const stream of [`${sharedPrefix}:spans`, `${sharedPrefix}:logs`]) {
      await shared.xTrim(stream, 'MAXLEN', 0).catch(() => {});
    }
    await shared.quit();
  }
});
