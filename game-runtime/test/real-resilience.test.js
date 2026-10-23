// Testes de resiliência contra PostgreSQL e Redis REAIS (opt-in).
// Cobertura exigida pelo backlog de produção:
//   - falha de dependência: dependência inacessível rejeita readiness (ready() rejeita)
//   - timeout: host non-routable respeita connectionTimeout e rejeita em tempo limitado
//   - recuperação: perda forçada de conexões no servidor (pg_terminate_backend / CLIENT KILL)
//     é absorvida pelo pool/client — as operações seguintes sucedem sem reiniciar o processo
//   - expiração: sessões vencidas ficam invisíveis e são removidas por cleanupExpired()
//
// Opt-in: só executa com KR_DATABASE_TEST_URL (ou KR_DATABASE_URL) e/ou KR_REDIS_TEST_URL.
// Em CI: job "Game Runtime Tests" (.github/workflows/ci.yml) provisiona postgres:16-alpine e redis:7-alpine.
// Local: docker compose -f docker-compose.test.yml up -d  (ver README, seção "Testes reais").
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PostgresSessionStore } from '../server/store.js';
import { RedisRateStore } from '../server/rateLimit.js';
import { createClient as createRedisClient } from 'redis';

const databaseUrl = process.env.KR_DATABASE_TEST_URL || process.env.KR_DATABASE_URL;
const redisUrl = process.env.KR_REDIS_TEST_URL;
const PG_DEAD = 'postgresql://resilience:wrong-pass@127.0.0.1:1/khaaos_dead'; // porta fechada → recusa rápida
const PG_UNROUTABLE = 'postgresql://resilience:resilience@10.255.255.1:5432/khaaos_unroutable'; // host sem rota → timeout
const REDIS_DEAD = 'redis://127.0.0.1:1';
const REDIS_UNROUTABLE = 'redis://10.255.255.1:6379';

// ---------- PostgreSQL ----------

test('PG falha de dependência: store em dependência inacessível rejeita readiness em tempo limitado', { skip: !databaseUrl }, async () => {
  const store = new PostgresSessionStore({ connectionString: PG_DEAD });
  const startedAt = Date.now();
  await assert.rejects(() => store.ready(), undefined, 'ready() deve rejeitar com a dependência fora');
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 10_000, `ready() deve falhar rápido (foi ${elapsed}ms)`);
  await store.close();
});

test('PG timeout: host non-routable respeita connectionTimeoutMillis e rejeita sem travar o processo', { skip: !databaseUrl }, async () => {
  const store = new PostgresSessionStore({ connectionString: PG_UNROUTABLE });
  // timeout agressivo no pool (o construtor lê apenas env/defaults)
  store.pool.options.connectionTimeoutMillis = 750;
  const startedAt = Date.now();
  await assert.rejects(() => store.ready(), undefined, 'ready() deve rejeitar por timeout/rota indisponível');
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 10_000, `timeout deve ser limitado (foi ${elapsed}ms)`);
  await store.close();
});

test('PG recuperação: conexões mortas no servidor (pg_terminate_backend) são repostas pelo pool', { skip: !databaseUrl }, async () => {
  const store = new PostgresSessionStore({ connectionString: databaseUrl });
  const token = `resilience-${crypto.randomUUID()}`;
  const session = { id: 'resilience', userId: 'resilience-user', roomId: 'resilience-room', expiresAt: Date.now() + 60_000 };
  try {
    await store.ready(); // abre conexão viva
    await store.setSession(token, session);

    // mata TODAS as outras conexões de cliente do banco (o pool perde os sockets idle/em uso)
    await store.pool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend'`,
    );

    // recuperação: a próxima operação reabre conexão sozinha e os dados persistem
    assert.deepEqual(await store.getSession(token), session, 'sessão deve sobreviver à queda das conexões');
    await store.setSession(token, { ...session, roomId: 'recovered' });
    assert.equal((await store.getSession(token)).roomId, 'recovered', 'escrita deve suceder após reconexão');
  } finally {
    await store.deleteSession(token).catch(() => {});
    await store.close();
  }
});

test('PG expiração: sessão vencida fica invisível e cleanupExpired() a remove do banco', { skip: !databaseUrl }, async () => {
  const store = new PostgresSessionStore({ connectionString: databaseUrl });
  const expiredToken = `expired-${crypto.randomUUID()}`;
  const freshToken = `fresh-${crypto.randomUUID()}`;
  try {
    await store.ready();
    await store.pool.query(
      `INSERT INTO runtime_sessions (resume_token, session, expires_at)
       VALUES ($1, $2::jsonb, now() - interval '1 minute')`,
      [expiredToken, JSON.stringify({ id: 'expired' })],
    );
    const freshSession = { id: 'fresh', userId: 'u', roomId: null, expiresAt: Date.now() + 60_000 };
    await store.setSession(freshToken, freshSession);

    assert.equal(await store.getSession(expiredToken), null, 'sessão vencida não deve ser entregue');
    assert.deepEqual(await store.getSession(freshToken), freshSession, 'sessão válida deve ser entregue');

    const removed = await store.cleanupExpired();
    assert.ok(removed >= 1, 'cleanupExpired deve remover a linha vencida');
    const leftover = await store.pool.query('SELECT 1 FROM runtime_sessions WHERE resume_token = $1', [expiredToken]);
    assert.equal(leftover.rowCount, 0, 'linha vencida não deve permanecer no banco');
    assert.ok(await store.getSession(freshToken), 'sessão válida deve sobreviver ao cleanup');
  } finally {
    await store.pool.query('DELETE FROM runtime_sessions WHERE resume_token = ANY($1)', [[expiredToken, freshToken]]).catch(() => {});
    await store.close();
  }
});

// ---------- Redis ----------

test('Redis falha de dependência: store em dependência inacessível rejeita readiness', { skip: !redisUrl }, async () => {
  const store = new RedisRateStore({ url: REDIS_DEAD });
  await assert.rejects(() => store.ready(), undefined, 'ready() deve rejeitar com o Redis fora');
  await store.close().catch(() => {}); // close tolera falha de conexão
});

test('Redis timeout: host non-routable rejeita em tempo limitado (connectTimeout + reconnectStrategy off)', { skip: !redisUrl }, async () => {
  const store = new RedisRateStore({
    client: createRedisClient({
      url: REDIS_UNROUTABLE,
      socket: { connectTimeout: 750, reconnectStrategy: false },
    }),
  });
  const startedAt = Date.now();
  await assert.rejects(() => store.ready(), undefined, 'ready() deve rejeitar por timeout/rota indisponível');
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 10_000, `timeout deve ser limitado (foi ${elapsed}ms)`);
  await store.close().catch(() => {});
});

test('Redis recuperação: CLIENT KILL derruba as conexões e o cliente repõe sem perder atomicidade', { skip: !redisUrl }, async () => {
  const store = new RedisRateStore({ url: redisUrl });
  const key = `resilience:${crypto.randomUUID()}`;
  try {
    await store.ready();
    const first = await store.incr(key, Date.now(), 10_000);
    assert.equal(first.count, 1, 'primeiro INCR no servidor real');

    // derruba as conexões de cliente normais; SKIPME preserva a conexão do próprio comando KILL.
    // Os sockets do node-redis morrem e são repostos no próximo comando (auto-reconnect).
    await store.client.sendCommand(['CLIENT', 'KILL', 'TYPE', 'NORMAL', 'SKIPME', 'yes']).catch(() => {});

    // recuperação: ping reestabelece; INCR seguinte continua o contador do mesmo key (atomicidade no servidor).
    // Um comando pode ser perdido na queda (resposta não entregue ⇒ retry conta de novo), por isso >= 2.
    await store.ready();
    let second = null;
    for (let attempt = 0; attempt < 4 && (second === null || second.count < 2); attempt++) {
      second = await store.incr(key, Date.now(), 10_000);
    }
    assert.ok(second.count >= 2, `contador deve persistir através da queda (obteve ${second.count})`);
    assert.ok(second.resetAt > Date.now(), 'TTL do key deve sobreviver à reconexão');
  } finally {
    await store.client.del(key).catch(() => {});
    await store.close().catch(() => {});
  }
});
