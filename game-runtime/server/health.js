// Khaaos Run — sondas de saúde com latência real das dependências.
//
// `DependencyHealth` mede o custo de um roundtrip real por dependência
// (ex.: `SELECT 1` no PostgreSQL, `PING` no Redis), com timeout por sonda e
// cache curto para o readiness não martelar o banco a cada requisição.
// Nenhuma sonda lança: falha vira `{ ok: false, error }` — o runtime degrada
// com sinal claro em vez de derrubar o handler.
import { setTimeout as delay } from 'node:timers/promises';

export class DependencyHealth {
  constructor({ checks = {}, ttlMs = 5_000, timeoutMs = 2_000 } = {}) {
    this.checks = checks;
    this.ttlMs = ttlMs;
    this.timeoutMs = timeoutMs;
    this.cache = new Map();
  }

  // Sonda uma dependência; sem `force`, reutiliza o resultado dentro do TTL.
  async probe(name, { force = false } = {}) {
    const cached = this.cache.get(name);
    if (!force && cached && Date.now() - cached.checkedAt < this.ttlMs) return cached;
    const result = await this.run(name);
    this.cache.set(name, result);
    return result;
  }

  // Sonda todas as dependências em paralelo → { nome: resultado }.
  async probeAll({ force = false } = {}) {
    const names = Object.keys(this.checks);
    const results = await Promise.all(names.map((name) => this.probe(name, { force })));
    return Object.fromEntries(results.map((result) => [result.name, result]));
  }

  // Executa a sonda: ok + latência medida, ou not-ok com erro (timeout incluído).
  async run(name) {
    const startedAt = Date.now();
    const check = this.checks[name];
    try {
      if (!check) throw new Error('unknown_check');
      await Promise.race([
        Promise.resolve(check()),
        delay(this.timeoutMs).then(() => { throw new Error('probe_timeout'); }),
      ]);
      return { name, ok: true, latencyMs: Date.now() - startedAt, checkedAt: Date.now(), error: null };
    } catch (error) {
      return { name, ok: false, latencyMs: Date.now() - startedAt, checkedAt: Date.now(), error: String(error?.message || error) };
    }
  }
}

// Monitor padrão do runtime: sessionStore, rateStore e audit store persistente
// (quando configurado). Cada sonda é o roundtrip real do adapter (`ready()`).
export function createDependencyHealth({ sessionStore, rateStore, auditStore, ttlMs, timeoutMs } = {}) {
  const checks = {};
  if (sessionStore?.ready) checks.sessionStore = () => sessionStore.ready();
  if (rateStore?.ready) checks.rateStore = () => rateStore.ready();
  if (auditStore?.ready) checks.auditStore = () => auditStore.ready();
  return new DependencyHealth({ checks, ttlMs, timeoutMs });
}

// Agrega resultados por dependência: booleans para o readyz, latências e erros.
export function summarize(results) {
  const entries = Object.values(results);
  return {
    ok: entries.length > 0 && entries.every((result) => result.ok),
    checks: Object.fromEntries(entries.map((result) => [result.name, result.ok])),
    latencyMs: Object.fromEntries(entries.map((result) => [result.name, result.latencyMs])),
    errors: Object.fromEntries(entries.filter((result) => !result.ok).map((result) => [result.name, result.error])),
    checkedAt: entries.length ? Math.max(...entries.map((result) => result.checkedAt)) : Date.now(),
  };
}
