// Khaaos Run — observabilidade distribuída (traces + logs agregados).
//
// Último gap de runtime do backlog de produção: correlação ponta a ponta de
// requisições HTTP e sessões WebSocket com contexto de trace no padrão W3C
// (`traceparent`), spans em árvore com duração medida e logs estruturados
// agregados por trace. Tudo local vive em ring buffers com teto fixo (custo
// O(1), zero dependência); quando `KR_OBS_EXPORTER=redis`, cada span/log é
// replicado num Redis Stream com `MAXLEN` — agregação entre múltiplas
// instâncias de staging/produção via `XRANGE` (o painel lê uma fonte só).
//
// Nada aqui lança: telemetria que falha nunca pode derrubar a partida —
// qualquer erro vira `metrics`/evento `obs.error` e o runtime segue.
import crypto from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// ─── Contexto de trace (W3C Trace Context) ──────────────────────────────────
// Formato: `00-<32 hex traceId>-<16 hex spanId>-<2 hex flags>`.
const TRACE_ID_RE = /^[0-9a-f]{32}$/;
const SPAN_ID_RE = /^[0-9a-f]{16}$/;

export function parseTraceparent(header) {
  if (typeof header !== 'string') return null;
  const parts = header.trim().toLowerCase().split('-');
  if (parts.length !== 4) return null;
  const [version, traceId, spanId, flags] = parts;
  if (version !== '00' && version !== '01') return null;
  if (!TRACE_ID_RE.test(traceId) || traceId === '0'.repeat(32)) return null;
  if (!SPAN_ID_RE.test(spanId) || spanId === '0'.repeat(16)) return null;
  if (!/^[0-9a-f]{2}$/.test(flags)) return null;
  return { traceId, spanId, flags, sampled: flags[1] === '1' };
}

export function formatTraceparent({ traceId, spanId, sampled = true } = {}) {
  return `00-${traceId}-${spanId}-${sampled ? '01' : '00'}`;
}

export function newTraceContext({ traceId, parentId, sampled = true } = {}) {
  return {
    traceId: TRACE_ID_RE.test(traceId || '') ? traceId : crypto.randomBytes(16).toString('hex'),
    spanId: crypto.randomBytes(8).toString('hex'),
    parentId: SPAN_ID_RE.test(parentId || '') ? parentId : null,
    sampled,
  };
}

// Extrai (ou cria) o contexto de trace de uma requisição HTTP.
export function httpTraceContext(req, { sampleRate = 1 } = {}) {
  const incoming = parseTraceparent(req?.headers?.traceparent);
  const sampled = incoming ? incoming.sampled : crypto.randomBytes(4).readUInt32BE(0) / 0xffffffff < sampleRate;
  return newTraceContext({ traceId: incoming?.traceId, parentId: incoming?.spanId, sampled });
}

// ─── Ring buffer genérico (teto fixo, push O(1)) ────────────────────────────
class Ring {
  constructor(capacity) {
    this.capacity = capacity;
    this.items = [];
    this.dropped = 0;
  }

  push(item) {
    if (this.items.length >= this.capacity) {
      this.items.shift();
      this.dropped++;
    }
    this.items.push(item);
  }

  query({ limit = 100, sinceId = 0, filter = null } = {}) {
    const out = [];
    for (let i = this.items.length - 1; i >= 0 && out.length < limit; i -= 1) {
      const item = this.items[i];
      if (item.seq <= sinceId) continue;
      if (filter && !filter(item)) continue;
      out.push(item);
    }
    return out;
  }
}

// ─── Serviço de observabilidade ──────────────────────────────────────────────
export class Observability {
  constructor({
    serviceName = process.env.KR_OBS_SERVICE || 'khaaos-runtime',
    maxTraces = 512,
    maxLogs = 2048,
    sampleRate = Number(process.env.KR_OBS_SAMPLE ?? 1),
    wsSampleRate = Number(process.env.KR_OBS_WS_SAMPLE ?? 0.05),
    exporter = null,
  } = {}) {
    this.serviceName = serviceName;
    this.sampleRate = sampleRate;
    this.wsSampleRate = wsSampleRate;
    this.exporter = exporter;
    this.spans = new Ring(maxTraces);
    this.logs = new Ring(maxLogs);
    this.metrics = { spansFinished: 0, spansDropped: 0, logsRecorded: 0, exportFailures: 0 };
    this._seq = 0;
  }

  _nextSeq() {
    this._seq += 1;
    return this._seq;
  }

  // Cria um span ativo (raiz ou filho). `finish()` calcula a duração e grava.
  startSpan({ name, traceId, parentId = null, attributes = {}, sampled = true }) {
    const span = {
      seq: this._nextSeq(),
      name, traceId, parentId, attributes,
      spanId: crypto.randomBytes(8).toString('hex'),
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null,
      status: 'active',
      service: this.serviceName,
    };
    span.finish = (status = 'ok', attributesPatch = null) => {
      if (span.status !== 'active') return span;
      span.finishedAt = Date.now();
      span.durationMs = span.finishedAt - span.startedAt;
      span.status = status;
      if (attributesPatch) Object.assign(span.attributes, attributesPatch);
      this._recordSpan(span);
      return span;
    };
    return span;
  }

  _recordSpan(span) {
    if (span.status === 'active') return;
    this.metrics.spansFinished++;
    if (!span.sampled && span.sampled !== undefined) return;
    this.spans.push(span);
    if (this.exporter) {
      Promise.resolve(this.exporter.exportSpan({
        ...span, finish: undefined,
      })).catch(() => { this.metrics.exportFailures++; });
    }
  }

  recordLog({ level = 'info', event, message = null, trace = null, fields = {} }) {
    this.metrics.logsRecorded++;
    const entry = {
      seq: this._nextSeq(),
      ts: Date.now(),
      level, event, message,
      traceId: trace?.traceId || null, spanId: trace?.spanId || null,
      service: this.serviceName,
      fields,
    };
    this.logs.push(entry);
    if (this.exporter) {
      Promise.resolve(this.exporter.exportLog(entry)).catch(() => { this.metrics.exportFailures++; });
    }
    return entry;
  }

  queryTraces({ limit = 100, sinceId = 0, traceId = null, minDurationMs = null, name = null, status = null } = {}) {
    return this.spans.query({
      limit, sinceId,
      filter: (span) => (!traceId || span.traceId === traceId)
        && (minDurationMs == null || span.durationMs >= minDurationMs)
        && (!name || span.name === name)
        && (!status || span.status === status),
    });
  }

  queryLogs({ limit = 100, sinceId = 0, level = null, traceId = null, event = null } = {}) {
    return this.logs.query({
      limit, sinceId,
      filter: (entry) => (!level || entry.level === level)
        && (!traceId || entry.traceId === traceId)
        && (!event || entry.event === event),
    });
  }
}

// ─── Middleware HTTP de tracing ──────────────────────────────────────────────
// Envolve o handler: abre span por requisição, propaga `traceparent` na
// resposta, loga requisição com duração e correlaciona erros.
export function traceHttpHandler(obs, handler) {
  return async (req, res) => {
    const ctx = httpTraceContext(req, { sampleRate: obs.sampleRate });
    const route = String(req.url || '/').split('?')[0];
    const span = obs.startSpan({
      name: `http ${req.method} ${route}`,
      traceId: ctx.traceId,
      parentId: ctx.parentId,
      sampled: ctx.sampled,
      attributes: { 'http.method': req.method, 'http.route': route },
    });
    res.setHeader('traceparent', formatTraceparent({ traceId: ctx.traceId, spanId: ctx.spanId, sampled: ctx.sampled }));
    res.setHeader('x-request-id', ctx.spanId);
    req.trace = ctx;
    const startedAt = Date.now();
    try {
      await handler(req, res);
    } catch (error) {
      obs.recordLog({
        level: 'error', event: 'http.error',
        message: String(error?.message || error), trace: ctx,
        fields: { method: req.method, route, status: res.statusCode },
      });
      span.finish('error', { 'http.status_code': res.statusCode, 'error.type': error?.name || 'Error' });
      // Telemetria nunca derruba a requisição: se o handler estourou antes de
      // responder, devolvemos 500; se já respondeu, apenas registramos.
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal_error' }));
      }
      return;
    }
    obs.recordLog({
      level: 'info', event: 'http.request', trace: ctx,
      fields: { method: req.method, route, status: res.statusCode, durationMs: Date.now() - startedAt },
    });
    span.finish(res.statusCode >= 500 ? 'error' : 'ok', { 'http.status_code': res.statusCode });
  };
}

// ─── Exporter Redis Stream (agregação multi-instância) ──────────────────────
// `KR_OBS_EXPORTER=redis` ativa: spans/logs vão para streams com MAXLEN fixo,
// e `snapshotRemote()` lê XRANGE de todos os nós para o painel unificado.
export class RedisObsExporter {
  constructor({ url = process.env.KR_OBS_REDIS_URL || process.env.KR_REDIS_URL || process.env.REDIS_URL, client = null, maxLength = 10_000, prefix = 'kr:obs' } = {}) {
    this.prefix = prefix;
    this.maxLength = maxLength;
    this.client = client;
    this._ownClient = !client;
    if (!this.client) {
      if (!url) throw new Error('RedisObsExporter exige KR_OBS_REDIS_URL/KR_REDIS_URL/REDIS_URL ou client');
      import('redis').then(async ({ createClient }) => {
        this.client = createClient({ url });
        this.client.on('error', () => {});
        await this.client.connect();
      }).catch(() => { this.client = null; });
    }
  }

  async _ready() {
    if (!this.client) await delay(50);
    if (!this.client?.isReady) throw new Error('redis_exporter_unavailable');
  }

  async exportSpan(span) {
    await this._ready();
    await this.client.xAdd(`${this.prefix}:spans`, '*', { payload: JSON.stringify(span) }, { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: this.maxLength } });
  }

  async exportLog(entry) {
    await this._ready();
    await this.client.xAdd(`${this.prefix}:logs`, '*', { payload: JSON.stringify(entry) }, { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: this.maxLength } });
  }

  // Lê até `count` spans/logs agregados de todas as instâncias (XRANGE por id).
  async snapshotRemote({ count = 200 } = {}) {
    await this._ready();
    const read = async (stream) => {
      const rows = await this.client.xRange(stream, '-', '+', { COUNT: count });
      return rows.map((row) => {
        try { return JSON.parse(row.message.payload); } catch { return null; }
      }).filter(Boolean);
    };
    const [spans, logs] = await Promise.all([read(`${this.prefix}:spans`), read(`${this.prefix}:logs`)]);
    return { spans, logs };
  }

  async close() {
    if (this._ownClient && this.client) { try { await this.client.quit(); } catch { try { this.client.disconnect(); } catch {} } }
  }
}

// Montagem padrão do runtime: exporter opcional por env, nunca lança.
export function createObservability(overrides = {}) {
  let exporter = overrides.exporter || null;
  if (!exporter && process.env.KR_OBS_EXPORTER === 'redis') {
    try { exporter = new RedisObsExporter(); } catch { exporter = null; }
  }
  return new Observability({ ...overrides, exporter });
}
