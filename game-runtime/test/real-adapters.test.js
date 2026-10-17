import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PostgresSessionStore } from '../server/store.js';
import { RedisRateStore } from '../server/rateLimit.js';

const databaseUrl = process.env.KR_DATABASE_TEST_URL || process.env.KR_DATABASE_URL;
const redisUrl = process.env.KR_REDIS_TEST_URL || process.env.REDIS_URL || process.env.KR_REDIS_URL;

 test('PostgreSQL: sessão é persistida, lida e expirada no servidor real', { skip: !databaseUrl }, async () => {
  const store = new PostgresSessionStore({ connectionString: databaseUrl });
  const token = `test-${crypto.randomUUID()}`;
  const session = { id: 'real-test', userId: 'real-user', roomId: 'real-room', expiresAt: Date.now() + 60_000 };
  try {
    await store.ready();
    await store.setSession(token, session);
    assert.deepEqual(await store.getSession(token), session);
    await store.deleteSession(token);
    assert.equal(await store.getSession(token), null);
  } finally {
    await store.close();
  }
});

test('Redis: contador é atômico e expira no servidor real', { skip: !redisUrl }, async () => {
  const store = new RedisRateStore({ url: redisUrl });
  const key = `real-test:${crypto.randomUUID()}`;
  try {
    await store.ready();
    const first = await store.incr(key, Date.now(), 10_000);
    const second = await store.incr(key, Date.now(), 10_000);
    assert.equal(first.count, 1);
    assert.equal(second.count, 2);
    assert.ok(second.resetAt > Date.now());
    await store.client.del(key);
  } finally {
    await store.close();
  }
});
