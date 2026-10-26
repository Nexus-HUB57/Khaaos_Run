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

// Injeção de falha: wrapper de store que quebra leituras/escritas sob demanda.
class FailingSessionStore {
  constructor(inner, { failReads = false, failWrites = false } = {}) {
    this.inner = inner;
    this.failReads = failReads;
    this.failWrites = failWrites;
  }
  async getSession(id) {
    if (this.failReads) throw new Error('store_read_failure');
    return this.inner.getSession(id);
  }
  async setSession(id, session) {
    if (this.failWrites) throw new Error('store_write_failure');
    return this.inner.setSession(id, session);
  }
  listSessions() { return this.inner.listSessions(); }
  async deleteSession(id) { return this.inner.deleteSession(id); }
  async cleanupExpired() { return this.inner.cleanupExpired?.() ?? 0; }
  ready() { return this.inner.ready(); }
  async close() { await this.inner.close?.(); }
}

// Rate store que sempre falha (Redis inacessível em produção).
class FailingRateStore {
  async incr() { throw new Error('rate_store_down'); }
  async ready() { return true; }
  async close() {}
}

// Audit store que sempre falha — auditoria jamais derruba o runtime.
class FailingAuditStore {
  async recordEvent() { throw new Error('audit_down'); }
  async ready() { return true; }
  async close() {}
}

const makeServer = (overrides = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-fault-'));
  const auth = new AuthService({ secret: 'fault-secret', users: [{ id: 'u1', username: 'faulty', role: 'player', region: 'sa-east', passwordHash: hashPassword('pass', 'salt') }] });
  const app = createAuthoritativeServer({
    port: 0, auth,
    store: new DurableJsonStore(path.join(dir, 'state.json')),
    rateStore: new SharedMemoryRateStore(),
    adminToken: 'legacy',
    ...overrides,
  });
  return { app, dir, token: auth.login('faulty', 'pass').token };
};

const cleanup = async (app, dir) => {
  await app.close().catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
};

test('fault injection: leitura de sessão quebrada vira entrada fail-fresh, não erro', async () => {
  const { app, dir, token } = makeServer({ store: new FailingSessionStore(new DurableJsonStore(path.join(os.tmpdir(), `kr-fault-read-${Date.now()}.json`)), { failReads: true }) });
  await new Promise((r) => app.server.listen(0, r));
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/ws?token=${token}&resume=stale-token`);
    const message = await new Promise((resolve, reject) => {
      ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.type === 'match_found') resolve(m); });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timeout aguardando match_found')), 4000);
    });
    assert.equal(message.type, 'match_found'); // entrou apesar do store quebrado
    assert.ok(message.resumeToken);
    assert.ok(app.metrics.storeReadFailures >= 1, 'degradação sinalizada em storeReadFailures');
    ws.close();
  } finally {
    await cleanup(app, dir);
  }
});

test('fault injection: rate store fora é fail-open — partida continua e degradação fica em metrics', async () => {
  const { app, dir, token } = makeServer({ rateStore: new FailingRateStore() });
  await new Promise((r) => app.server.listen(0, r));
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/ws?token=${token}`);
    await new Promise((resolve, reject) => {
      ws.on('message', (raw) => { if (JSON.parse(raw).type === 'match_found') resolve(); });
      ws.on('error', reject);
    });
    let snapshots = 0;
    const sawSnapshot = new Promise((resolve) => {
      ws.on('message', (raw) => { if (JSON.parse(raw).type === 'snapshot') { snapshots += 1; if (snapshots >= 3) resolve(); } });
    });
    for (let i = 1; i <= 10; i += 1) ws.send(JSON.stringify({ type: 'input', input: { seq: i, dx: 0, dy: 0, aimX: 550, aimY: 330, fire: false, interact: false } }));
    await Promise.race([sawSnapshot, new Promise((_, reject) => setTimeout(() => reject(new Error('snapshots não fluem com rate store fora')), 4000))]);
    assert.ok(app.metrics.rateStoreFailures >= 10, `falhas de rate store contadas: ${app.metrics.rateStoreFailures}`);
    assert.equal(app.metrics.rateLimited, 0);
    ws.close();
  } finally {
    await cleanup(app, dir);
  }
});

test('fault injection: audit store quebrado não derruba login nem guarda 500', async () => {
  const { app, dir, token } = makeServer({ auditStore: new FailingAuditStore() });
  await new Promise((r) => app.server.listen(0, r));
  try {
    // Login válido com audit store fora: 200 normal.
    const ok = await fetch(`http://127.0.0.1:${app.server.address().port}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'faulty', password: 'pass' }),
    });
    assert.equal(ok.status, 200);
    // Login inválido dispara audit.record → swallow silencioso → 401 normal.
    const denied = await fetch(`http://127.0.0.1:${app.server.address().port}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'faulty', password: 'wrong' }),
    });
    assert.equal(denied.status, 401);
    // Servidor continua vivo e servindo.
    const health = await fetch(`http://127.0.0.1:${app.server.address().port}/healthz`);
    assert.equal(health.status, 200);
  } finally {
    await cleanup(app, dir);
  }
});
