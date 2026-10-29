// Khaaos Run — Fase 24 — MÉTRICAS DO DIRETOR no /admin (transporte client→server).
// ================================================================================
// O diretor automático da transmissão (Fase 19) vivia só no cliente: o /admin
// não via NADA da direção. Aqui fechamos o circuito em três frentes:
//   1. puro — sanitizeDirectorReport (whitelist + clamp; payload do cliente
//      NUNCA é confiável) e aggregateDirectorReports (soma p/ o /admin);
//   2. cliente — SpectatorRemote acumula cortes por motivo/hazard, reservas
//      manuais (clique no standings + prev/next) e liga/desliga, expondo
//      getMetrics() e enviando frames DIRECTOR_METRICS (corte + heartbeat);
//   3. servidor — SpectatorPipeline aceita DIRECTOR_METRICS, sanitiza por
//      conexão (last report wins; desconexão remove a contribuição) e expõe
//      o agregado em metrics().director — consumido pelo /admin/metrics.
// E2E com WS REAL (mesma escola do spectator-pipeline-server.test.js) e
// socket falso no cliente (mesma escola do spectator-autofollow.test.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';

const {
  SpectatorPipeline,
  SpectatorConfig,
  DIRECTOR_CUT_REASONS,
  DIRECTOR_HAZARDS,
  sanitizeDirectorReport,
  aggregateDirectorReports,
} = await import('../server/spectator.js');
const { SpectatorRemote } = await import('../src/game3d/spectator3d.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- fixtures (mesmo contrato do spectator-autofollow.test.js) ----------
const player = (over = {}) => ({
  id: 'p1', displayName: 'KHAEL VANCE', species: 'kv',
  posX: 0, posY: 0, yaw: 0, health: 100, shield: 0,
  isDowned: false, isEliminated: false, kills: 0, ...over,
});
const ringState = (over = {}) => ({
  currentPhase: 0, currentRadius: 520, ringCenter: [0, 0, 0],
  isShrinking: false, nextPhaseIn: 30, ...over,
});
const batch = (players, events = [], ts = Date.now()) => ({
  type: 'SPECTATOR_BATCH', data: { players, ringState: ringState() }, events, timestamp: ts,
});
const tsunamiStart = (ts = 1000) => ({ type: 'WORLD_HAZARD', data: { hazard: 'tsunami', phase: 'start', submergeBelowY: 90, durationSeconds: 40 }, timestamp: ts });
const report = (over = {}) => ({
  enabled: true, activeHazard: 'tsunami',
  cuts: { total: 3, byReason: { 'hazard-start': 2, 'target-lost': 1 }, byHazard: { tsunami: 3 } },
  manual: { followSelects: 1, cycles: 2 },
  toggles: { on: 1, off: 0 },
  ...over,
});

class FakeSocket {
  constructor() { this.readyState = 0; this.sent = []; FakeSocket.last = this; }
  onopen = null; onmessage = null; onclose = null; onerror = null;
  open() { this.readyState = 1; this.onopen?.(); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.(); }
  message(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}
const directorMsgs = (ws) => ws.sent.filter((m) => m.type === 'DIRECTOR_METRICS');
const cameraMsgs = (ws) => ws.sent.filter((m) => m.type === 'SET_CAMERA');

// ---------- 1. puro: sanitização (cliente não-confiável) ----------

describe('sanitizeDirectorReport', () => {
  test('whitelist: campos válidos passam, desconhecidos são DESCARTADOS', () => {
    const out = sanitizeDirectorReport({
      enabled: true, activeHazard: 'tsunami',
      cuts: { total: 7, byReason: { 'hazard-start': 4, inject: 99 }, byHazard: { tsunami: 7, meteor: 50 } },
      manual: { followSelects: 2, cycles: 1, cheat: 9 },
      toggles: { on: 1, off: 0 },
      injected: 'field',
    });
    assert.deepEqual(out.cuts.byReason, { 'hazard-start': 4 }, 'motivo fora da whitelist fora');
    assert.deepEqual(out.cuts.byHazard, { tsunami: 7 }, 'hazard desconhecido fora');
    assert.deepEqual(out.manual, { followSelects: 2, cycles: 1 });
    assert.equal(out.injected, undefined);
    assert.equal(out.enabled, true);
    assert.equal(out.activeHazard, 'tsunami');
  });

  test('clamp: negativo vira 0, não-numérico vira 0, teto 1e6, fracionado floor', () => {
    const out = sanitizeDirectorReport({
      cuts: { total: -5, byReason: { 'target-lost': 1.9, 'hazard-escalation': '12' } },
      manual: { followSelects: Number.MAX_SAFE_INTEGER + 1, cycles: 'x' },
    });
    assert.equal(out.cuts.total, 0, 'negativo vira zero');
    assert.equal(out.cuts.byReason['target-lost'], 1, 'floor');
    assert.equal(out.cuts.byReason['hazard-escalation'], 12, 'string numérica aceita');
    assert.equal(out.manual.followSelects, 1_000_000, 'teto 1e6');
    assert.equal(out.manual.cycles, 0, 'lixo vira zero');
  });

  test('lixo total: null/número/string → relatório zerado, sem throw', () => {
    for (const junk of [null, undefined, 42, 'hack', [], true]) {
      const out = sanitizeDirectorReport(junk);
      assert.equal(out.cuts.total, 0);
      assert.deepEqual(out.manual, { followSelects: 0, cycles: 0 });
      assert.equal(out.enabled, false);
      assert.equal(out.activeHazard, null);
    }
  });

  test('vocabulário canônico compartilhado com o cliente (Fase 19/18)', () => {
    assert.deepEqual([...DIRECTOR_CUT_REASONS], ['hazard-start', 'target-lost', 'hazard-escalation']);
    assert.deepEqual([...DIRECTOR_HAZARDS], ['tsunami', 'lava', 'gravity', 'acid']);
  });
});

describe('aggregateDirectorReports', () => {
  test('soma relatórios sanitizados de múltiplos espectadores', () => {
    const agg = aggregateDirectorReports([
      report(),
      report({ cuts: { total: 1, byReason: { 'hazard-start': 1 }, byHazard: { lava: 1 } }, manual: { followSelects: 0, cycles: 0 } }),
      null, undefined, // conexões sem relatório não contam
    ]);
    assert.equal(agg.reporting, 2);
    assert.equal(agg.enabled, 2);
    assert.equal(agg.cuts.total, 4);
    assert.equal(agg.cuts.byReason['hazard-start'], 3);
    assert.equal(agg.cuts.byReason['target-lost'], 1);
    assert.equal(agg.cuts.byHazard.tsunami, 3);
    assert.equal(agg.cuts.byHazard.lava, 1);
    assert.deepEqual(agg.manual, { followSelects: 1, cycles: 2 });
    assert.deepEqual(agg.toggles, { on: 2, off: 0 });
  });

  test('vazio/nulo → agregado zerado sem throw', () => {
    const agg = aggregateDirectorReports(null);
    assert.deepEqual(agg, {
      reporting: 0, enabled: 0,
      cuts: { total: 0, byReason: {}, byHazard: {} },
      manual: { followSelects: 0, cycles: 0 },
      toggles: { on: 0, off: 0 },
      tuning: null, // Fase 26 — afinação só entra com relatório real
    });
  });
});

// ---------- 2. cliente: coleta + transporte ----------

describe('SpectatorRemote — métricas do diretor', () => {
  test('welcome dispara relatório inicial e o diretor reporta cada corte', () => {
    const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket(), metricsIntervalMs: 0 });
    r.connect();
    const ws = FakeSocket.last;
    ws.open();
    ws.message({ type: 'SPECTATOR_WELCOME', spectatorId: 'spec_1', delayMs: 10_000 });
    assert.equal(directorMsgs(ws).length, 1, 'estado inicial no /admin imediatamente');
    assert.deepEqual(directorMsgs(ws)[0].metrics.cuts, { total: 0, byReason: {}, byHazard: {} });

    // hazard → corte (hazard-start) → frame DIRECTOR_METRICS com o corte
    ws.message(batch([player({ id: 'calmo' })], [tsunamiStart()]));
    assert.equal(cameraMsgs(ws).length, 1, 'sanidade: corte da Fase 19 intacto');
    assert.equal(directorMsgs(ws).length, 2);
    const last = directorMsgs(ws).at(-1).metrics;
    assert.equal(last.cuts.total, 1);
    assert.equal(last.cuts.byReason['hazard-start'], 1);
    assert.equal(last.cuts.byHazard.tsunami, 1);
    assert.equal(last.enabled, true, 'diretor ON');
    assert.equal(last.activeHazard, 'tsunami');

    // getMetrics() espelha o último frame (mesma fonte)
    assert.deepEqual({ ...r.getMetrics(), now: last.now }, last);
  });

  test('escalada e target-lost são contadas POR MOTIVO e POR HAZARD', () => {
    const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket(), metricsIntervalMs: 0 });
    r.connect();
    const ws = FakeSocket.last;
    ws.open();
    ws.message({ type: 'SPECTATOR_WELCOME', spectatorId: 's', delayMs: 1 });
    // tsunami start → corte p/ 'a' (empate → id)
    ws.message(batch([player({ id: 'a' }), player({ id: 'b' })], [tsunamiStart()]));
    // 'b' toma dano → escalada (mesmo hazard)
    ws.message(batch([player({ id: 'a' }), player({ id: 'b', health: 50 })]));
    // alvo 'b' morre → target-lost
    ws.message(batch([player({ id: 'a' }), player({ id: 'b', isEliminated: true })]));
    const m = r.getMetrics();
    assert.equal(m.cuts.total, 3);
    assert.equal(m.cuts.byReason['hazard-start'], 1);
    assert.equal(m.cuts.byReason['hazard-escalation'], 1);
    assert.equal(m.cuts.byReason['target-lost'], 1);
    assert.equal(m.cuts.byHazard.tsunami, 3, 'todos sob o mesmo hazard');
    assert.equal(directorMsgs(ws).length, 4, 'welcome + 3 cortes');
  });

  test('intervenções manuais: clique no standings e prev/next contam separados', () => {
    const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket(), metricsIntervalMs: 0 });
    r.connect();
    const ws = FakeSocket.last;
    ws.open();
    ws.message({ type: 'SPECTATOR_WELCOME', spectatorId: 's', delayMs: 1 });
    ws.message(batch([player({ id: 'a' }), player({ id: 'b' })]));
    assert.ok(r.followPlayer('b'), 'clique válido');
    assert.equal(r.followPlayer('fantasma'), null, 'clique em eliminado/ausente não conta');
    r.cycleFollow(1);
    r.cycleFollow(-1);
    const m = r.getMetrics();
    assert.equal(m.manual.followSelects, 1, 'só o clique válido conta');
    assert.equal(m.manual.cycles, 2);
    // followPlayer NÃO é corte do diretor: cuts permanecem zerados
    assert.equal(m.cuts.total, 0);
  });

  test('liga/desliga (botão AUTO) conta em toggles', () => {
    const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket(), metricsIntervalMs: 0 });
    r.connect();
    const ws = FakeSocket.last;
    ws.open();
    ws.message({ type: 'SPECTATOR_WELCOME', spectatorId: 's', delayMs: 1 });
    r.setAutoFollow(false);
    r.setAutoFollow(true);
    assert.deepEqual(r.getMetrics().toggles, { on: 1, off: 1 });
  });

  test('heartbeat: frames periódicos enquanto LIVE; 0 desliga; dispose/close param', async () => {
    const r = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket(), metricsIntervalMs: 25 });
    r.connect();
    const ws = FakeSocket.last;
    ws.open();
    ws.message({ type: 'SPECTATOR_WELCOME', spectatorId: 's', delayMs: 1 });
    assert.ok(r._metricsTimer, 'heartbeat ativo após welcome');
    const before = directorMsgs(ws).length;
    await wait(90);
    assert.ok(directorMsgs(ws).length >= before + 2, '≥2 heartbeats em 90 ms (25 ms de intervalo)');

    r.dispose();
    assert.equal(r._metricsTimer, null, 'dispose para o heartbeat');
    const afterDispose = directorMsgs(ws).length;
    await wait(60);
    assert.equal(directorMsgs(ws).length, afterDispose, 'nenhum frame após dispose');

    const r2 = new SpectatorRemote({ url: 'ws://t', socketFactory: () => new FakeSocket(), metricsIntervalMs: 0 });
    r2.connect();
    const ws2 = FakeSocket.last;
    ws2.open();
    ws2.message({ type: 'SPECTATOR_WELCOME', spectatorId: 's2', delayMs: 1 });
    assert.equal(r2._metricsTimer, null, 'metricsIntervalMs: 0 → sem timer (testes)');
    r2.ws.onclose?.(); // close do socket também para o heartbeat
  });
});

// ---------- 3. servidor: WS real, sanitização e agregação ----------

async function withServer(pipeline, fn) {
  const server = http.createServer((_req, res) => { res.writeHead(200); res.end(); });
  pipeline.attach(server);
  server.listen(0);
  await once(server, 'listening');
  try {
    await fn(server.address().port, pipeline);
  } finally {
    pipeline.destroy();
    server.closeAllConnections(); // sockets upgrade não são "idle" — destrói sem corrida
    await new Promise((resolve) => server.close(resolve));
  }
}

async function openSpectator(port, query) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/spectator?${query}`);
  const firstMessage = new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('timeout aguardando primeira mensagem')), 3000);
    ws.once('message', (raw) => { clearTimeout(to); resolve(JSON.parse(raw.toString())); });
  });
  await once(ws, 'open');
  return { ws, firstMessage };
}

describe('SpectatorPipeline — DIRECTOR_METRICS end to end', () => {
  test('welcome mantém contrato (sanidade da Fase 14) e metrics() traz director zerado', async () => {
    await withServer(new SpectatorPipeline(), async (port, pipeline) => {
      const { ws, firstMessage } = await openSpectator(port, 'roomId=sala-dir');
      const welcome = await firstMessage;
      assert.equal(welcome.type, 'SPECTATOR_WELCOME');
      assert.equal(SpectatorConfig.delayMs, 10_000, 'config canônica intacta');
      const d = pipeline.metrics().director;
      assert.deepEqual(d, {
        reporting: 0, enabled: 0,
        cuts: { total: 0, byReason: {}, byHazard: {} },
        manual: { followSelects: 0, cycles: 0 },
        toggles: { on: 0, off: 0 },
        tuning: null, // Fase 26 — sem relatório, sem afinação
      }, 'sem relatório: agregado zerado');
      ws.close();
    });
  });

  test('DIRECTOR_METRICS válido soma no agregado; desconexão remove a contribuição', async () => {
    await withServer(new SpectatorPipeline(), async (port, pipeline) => {
      const a = await openSpectator(port, 'roomId=sala-a');
      await a.firstMessage;
      a.ws.send(JSON.stringify({ type: 'DIRECTOR_METRICS', metrics: report() }));

      const b = await openSpectator(port, 'roomId=sala-b'); // salas diferentes somam juntas
      await b.firstMessage;
      b.ws.send(JSON.stringify({ type: 'DIRECTOR_METRICS', metrics: report({ cuts: { total: 1, byReason: { 'hazard-start': 1 }, byHazard: { lava: 1 } } }) }));
      await wait(50);

      let d = pipeline.metrics().director;
      assert.equal(d.reporting, 2);
      assert.equal(d.enabled, 2);
      assert.equal(d.cuts.total, 4);
      assert.equal(d.cuts.byReason['hazard-start'], 3);
      assert.equal(d.cuts.byHazard.tsunami, 3);
      assert.equal(d.cuts.byHazard.lava, 1);

      // last report wins: 'a' reenvia com valores menores — substitui, não soma
      a.ws.send(JSON.stringify({ type: 'DIRECTOR_METRICS', metrics: report({ cuts: { total: 2, byReason: { 'hazard-start': 2 }, byHazard: { tsunami: 2 } } }) }));
      await wait(50);
      d = pipeline.metrics().director;
      assert.equal(d.cuts.total, 3, '2 (a, substituído) + 1 (b)');
      assert.equal(d.cuts.byReason['hazard-start'], 3);

      // desconexão de 'a' remove a contribuição inteira
      a.ws.close();
      await once(a.ws, 'close');
      await wait(80);
      d = pipeline.metrics().director;
      assert.equal(d.reporting, 1);
      assert.equal(d.cuts.total, 1, 'só o relatório de b sobra');
      assert.equal(d.cuts.byHazard.lava, 1);
      b.ws.close();
    });
  });

  test('payload hostil não derruba o espectador nem polui o agregado', async () => {
    await withServer(new SpectatorPipeline(), async (port, pipeline) => {
      const { ws, firstMessage } = await openSpectator(port, 'roomId=sala-x');
      await firstMessage;
      ws.send('lixo{{{não-json'); // JSON inválido
      ws.send(JSON.stringify({ type: 'DIRECTOR_METRICS', metrics: 'hack' })); // não-objeto
      ws.send(JSON.stringify({ type: 'DIRECTOR_METRICS', metrics: { cuts: { total: 5 }, byReason: { inject: 99 }, hax: true } }));
      ws.send(Buffer.from([0xff, 0xfe])); // binário inválido p/ JSON
      await wait(50);
      const d = pipeline.metrics().director;
      assert.equal(d.reporting, 1, 'relatório hostil virou relatório zerado válido');
      assert.equal(d.cuts.total, 5, 'total numérico passa no clamp');
      assert.deepEqual(d.cuts.byReason, {}, 'motivo fora da whitelist não entra');
      assert.equal(pipeline.metrics().totalSpectators, 1, 'conexão viva');
      ws.close();
      await once(ws, 'close');
    });
  });
});
