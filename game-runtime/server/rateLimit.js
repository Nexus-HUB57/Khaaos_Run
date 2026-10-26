import { createClient } from 'redis';

export class SharedMemoryRateStore {
  constructor() {
    this.counters = new Map();
  }

  incr(key, now = Date.now(), windowMs = 1000) {
    const current = this.counters.get(key);
    if (!current || current.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.counters.set(key, fresh);
      return fresh;
    }
    current.count++;
    return current;
  }

  ready() {
    return true;
  }

  async close() {}
}

export class RedisRateStore {
  constructor({ url = process.env.REDIS_URL || process.env.KR_REDIS_URL, client } = {}) {
    if (!client && !url) throw new Error('REDIS_URL ou KR_REDIS_URL é obrigatório para o rate store Redis');
    this.client = client || createClient({ url });
    this.connected = Boolean(client?.isReady);
    this.connectPromise = this.connected ? Promise.resolve() : this.client.connect().then(() => { this.connected = true; });
  }

  async incr(key, _now = Date.now(), windowMs = 1000) {
    await this.connectPromise;
    const result = await this.client.eval(
      `local count = redis.call('INCR', KEYS[1])
       if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
       return { count, redis.call('PTTL', KEYS[1]) }`,
      { keys: [key], arguments: [String(windowMs)] },
    );
    const [count, ttl] = result.map(Number);
    return { count, resetAt: Date.now() + Math.max(0, ttl) };
  }

  async ready() {
    await this.connectPromise;
    await this.client.ping();
    return true;
  }

  async close() {
    try { await this.connectPromise; } catch { /* dependência indisponível: nada a encerrar */ }
    if (this.client.isOpen) await this.client.quit();
  }
}

export class DistributedRateLimiter {
  constructor({ store = new SharedMemoryRateStore(), limit = 30, windowMs = 1000, prefix = 'kr' } = {}) {
    this.store = store;
    this.limit = limit;
    this.windowMs = windowMs;
    this.prefix = prefix;
  }

  format(result) {
    return {
      allowed: result.count <= this.limit,
      count: result.count,
      remaining: Math.max(0, this.limit - result.count),
      resetAt: result.resetAt,
    };
  }

  allow(identity) {
    const result = this.store.incr(`${this.prefix}:${identity}`, Date.now(), this.windowMs);
    if (result?.then) throw new Error('Este rate store é assíncrono; use allowAsync()');
    return this.format(result);
  }

  async allowAsync(identity) {
    return this.format(await this.store.incr(`${this.prefix}:${identity}`, Date.now(), this.windowMs));
  }
}
