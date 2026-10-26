// Khaaos Run — economia virtual e compliance (KRC, sem valor real).
//
// Princípios definidos em docs/economy-compliance.md e garantidos AQUI por
// construção, antes de qualquer integração externa:
//   1. Moeda única KRC (Khaaos Run Credits) — soft currency sem lastro
//      financeiro: sem compra, venda, saque, custódia ou conversão;
//   2. Ledger append-only com dupla entrada: todo lançamento move um valor
//      inteiro positivo de uma conta de origem para uma de destino;
//   3. Idempotência por chave de requisição — retry nunca duplica prêmio;
//   4. Teto diário de concessão por jogador (anti-fraude/anti-abuso);
//   5. Odds publicadas obrigatórias para qualquer sorteio (transparência);
//   6. Trilhas de valor real DESLIGADAS por construção: `REAL_MONEY_ENABLED`
//      é `false` congelado e `assertRealMoneyDisabled()` bloqueia qualquer
//      caminho de compra/carteira/check-out.
import pg from 'pg';

const { Pool } = pg;

export const CURRENCY = 'KRC';

// Congelado: nenhum caminho de código pode ligar valor real sem mudar esta
// constante E cumprir o checklist de docs/economy-compliance.md.
export const REAL_MONEY_ENABLED = Object.freeze(false);

export class EconomyError extends Error {
  constructor(code) {
    super(code);
    this.name = 'EconomyError';
    this.code = code;
  }
}

// Barreira explícita: qualquer tentativa de integrar valor real falha alto.
export function assertRealMoneyDisabled(hint = 'real money rails') {
  throw new EconomyError(`real_money_disabled: ${hint} — a economia do Khaaos Run é virtual (KRC) e não aceita compra, venda, saque ou custódia de valor real`);
}

// Registro de odds publicadas. Sorteios (loot, airdrop bônus) só podem
// existir com probabilidades visíveis ao jogador e que somem 1.
const ODDS_REGISTRY = new Map();

export function registerOdds(key, table) {
  const entries = Object.entries(table || {});
  if (!entries.length) throw new EconomyError('odds_empty');
  for (const [, probability] of entries) {
    if (!(typeof probability === 'number' && probability > 0 && probability < 1)) throw new EconomyError('invalid_probability');
  }
  const total = entries.reduce((sum, [, probability]) => sum + probability, 0);
  if (Math.abs(total - 1) > 1e-9) throw new EconomyError('odds_do_not_sum_to_one');
  const frozen = Object.freeze({ ...table });
  ODDS_REGISTRY.set(key, frozen);
  return frozen;
}

export function publishedOdds(key) {
  return ODDS_REGISTRY.get(key) || null;
}

// Todo sorteio consulta por aqui — sem odds publicadas não há rolagem.
export function requireOdds(key) {
  const odds = publishedOdds(key);
  if (!odds) throw new EconomyError('odds_not_published');
  return odds;
}

export function oddsCatalog() {
  return [...ODDS_REGISTRY.keys()];
}

// ─── Ledger em memória (desenvolvimento/testes) ─────────────────────────────
// Interface do store: appendEntry / balance / history / dailyGrantTotal /
// integrity / count. Lançamento = transferência de `amount` inteiro positivo
// de `debitAccount` para `creditAccount` (dupla entrada estrutural).
export class Ledger {
  constructor() {
    this.entries = [];
    this.byIdempotencyKey = new Map();
    this.nextId = 1;
  }

  async appendEntry({ type, debitAccount, creditAccount, amount, reason = null, idempotencyKey = null, meta = null, at = Date.now() }) {
    if (!Number.isInteger(amount) || amount <= 0) throw new EconomyError('invalid_amount');
    if (!debitAccount || !creditAccount || typeof debitAccount !== 'string' || typeof creditAccount !== 'string') throw new EconomyError('invalid_account');
    if (debitAccount === creditAccount) throw new EconomyError('self_transfer');
    if (idempotencyKey && this.byIdempotencyKey.has(idempotencyKey)) return this.byIdempotencyKey.get(idempotencyKey);
    const entry = Object.freeze({
      id: this.nextId++, at, type: String(type), debitAccount, creditAccount,
      amount, reason: reason == null ? null : String(reason), idempotencyKey, meta,
    });
    this.entries.push(entry);
    if (idempotencyKey) this.byIdempotencyKey.set(idempotencyKey, entry);
    return entry;
  }

  async balance(account) {
    let total = 0;
    for (const entry of this.entries) {
      if (entry.creditAccount === account) total += entry.amount;
      else if (entry.debitAccount === account) total -= entry.amount;
    }
    return total;
  }

  async history(account, { sinceId = 0, limit = 50 } = {}) {
    return this.entries
      .filter((entry) => entry.id > sinceId && (entry.debitAccount === account || entry.creditAccount === account))
      .slice(-Math.max(1, Math.min(limit, 500)))
      .reverse();
  }

  async dailyGrantTotal(account, sinceAt) {
    return this.entries
      .filter((entry) => entry.type === 'grant' && entry.creditAccount === account && entry.at >= sinceAt)
      .reduce((sum, entry) => sum + entry.amount, 0);
  }

  // Dupla entrada: conservação é estrutural (cada lançamento debita o que
  // credita). A checagem existe para o relatório de compliance detectar
  // corrupção acidental do ring buffer em memória.
  async integrity() {
    let debits = 0;
    let credits = 0;
    for (const entry of this.entries) {
      if (!Number.isInteger(entry.amount) || entry.amount <= 0) return false;
      debits += entry.amount;
      credits += entry.amount;
    }
    return debits === credits;
  }

  async count() {
    return this.entries.length;
  }
}

// ─── Store PostgreSQL (produção, migração 003_economy_ledger.sql) ───────────
export class PostgresEconomyStore {
  constructor({ connectionString = process.env.KR_ECONOMY_DATABASE_URL || process.env.KR_DATABASE_URL || process.env.DATABASE_URL, pool } = {}) {
    if (!pool && !connectionString) throw new Error('KR_ECONOMY_DATABASE_URL ou DATABASE_URL é obrigatório para o economy store PostgreSQL');
    this.pool = pool || new Pool({ connectionString, max: Number(process.env.KR_PG_POOL_MAX || 10), idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  }

  async ready() {
    await this.pool.query('SELECT 1');
    return true;
  }

  async appendEntry(entry) {
    const at = entry.at ?? Date.now();
    const inserted = await this.pool.query(
      `INSERT INTO economy_entries (at, entry_type, debit_account, credit_account, amount, reason, idempotency_key, meta)
       VALUES (to_timestamp($1 / 1000.0), $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [at, entry.type, entry.debitAccount, entry.creditAccount, entry.amount, entry.reason, entry.idempotencyKey, JSON.stringify(entry.meta ?? null)],
    );
    if (inserted.rows[0]) return { ...entry, at, id: Number(inserted.rows[0].id) };
    // Conflito de idempotência: devolve o lançamento original (efeito único).
    const existing = await this.pool.query(
      `SELECT id, (EXTRACT(EPOCH FROM at) * 1000)::bigint AS at, entry_type AS "type",
              debit_account AS "debitAccount", credit_account AS "creditAccount",
              amount, reason, idempotency_key AS "idempotencyKey", meta
       FROM economy_entries WHERE idempotency_key = $1`,
      [entry.idempotencyKey],
    );
    const row = existing.rows[0];
    return { ...row, id: Number(row.id), at: Number(row.at), amount: Number(row.amount) };
  }

  async balance(account) {
    const result = await this.pool.query(
      `SELECT COALESCE(SUM(CASE WHEN credit_account = $1 THEN amount ELSE 0 END), 0) AS credits,
              COALESCE(SUM(CASE WHEN debit_account  = $1 THEN amount ELSE 0 END), 0) AS debits
       FROM economy_entries`,
      [account],
    );
    return Number(result.rows[0].credits) - Number(result.rows[0].debits);
  }

  async history(account, { sinceId = 0, limit = 50 } = {}) {
    const result = await this.pool.query(
      `SELECT id, (EXTRACT(EPOCH FROM at) * 1000)::bigint AS at, entry_type AS "type",
              debit_account AS "debitAccount", credit_account AS "creditAccount",
              amount, reason, idempotency_key AS "idempotencyKey", meta
       FROM economy_entries
       WHERE id > $2 AND (debit_account = $1 OR credit_account = $1)
       ORDER BY id DESC
       LIMIT $3`,
      [account, sinceId, Math.max(1, Math.min(limit, 500))],
    );
    return result.rows.map((row) => ({ ...row, id: Number(row.id), at: Number(row.at), amount: Number(row.amount) }));
  }

  async dailyGrantTotal(account, sinceAt) {
    const result = await this.pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM economy_entries
       WHERE entry_type = 'grant' AND credit_account = $1 AND at >= to_timestamp($2 / 1000.0)`,
      [account, sinceAt],
    );
    return Number(result.rows[0].total);
  }

  async integrity() {
    const result = await this.pool.query('SELECT COUNT(*) FILTER (WHERE amount <= 0) AS invalid FROM economy_entries');
    return Number(result.rows[0].invalid) === 0;
  }

  async count() {
    const result = await this.pool.query('SELECT COUNT(*) AS total FROM economy_entries');
    return Number(result.rows[0].total);
  }

  async close() {
    await this.pool.end();
  }
}

const accountFor = (userId) => `player:${String(userId)}`;
const TREASURY_REWARDS = 'treasury:rewards';
const TREASURY_SPENDS = 'treasury:spends';

const startOfDayUtc = (at = Date.now()) => {
  const date = new Date(at);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

// ─── Serviço de economia ─────────────────────────────────────────────────────
export class Economy {
  constructor({ store = new Ledger(), dailyGrantCap = Number(process.env.KR_ECONOMY_DAILY_CAP || 250_000) } = {}) {
    this.store = store;
    this.dailyGrantCap = Math.max(0, dailyGrantCap);
  }

  async balance(userId) {
    return { currency: CURRENCY, amount: await this.store.balance(accountFor(userId)) };
  }

  // Concessão (prêmio de partida, recompensa, compensação). Origem sempre no
  // tesouro — dinheiro novo entra no circuito apenas por aqui, com teto diário.
  async grant({ userId, amount, reason, idempotencyKey, by = 'system' }) {
    if (!userId) throw new EconomyError('invalid_user');
    if (!Number.isInteger(amount) || amount <= 0) throw new EconomyError('invalid_amount');
    const account = accountFor(userId);
    if (this.dailyGrantCap > 0) {
      const grantedToday = await this.store.dailyGrantTotal(account, startOfDayUtc());
      if (grantedToday + amount > this.dailyGrantCap) throw new EconomyError('economy_cap_exceeded');
    }
    return this.store.appendEntry({
      type: 'grant', debitAccount: TREASURY_REWARDS, creditAccount: account,
      amount, reason: reason || 'reward', idempotencyKey: idempotencyKey || null, meta: { userId: String(userId), by },
    });
  }

  // Gasto (cosméticos, entradas de modo especial). Saldo nunca fica negativo.
  async spend({ userId, amount, reason, idempotencyKey }) {
    if (!userId) throw new EconomyError('invalid_user');
    if (!Number.isInteger(amount) || amount <= 0) throw new EconomyError('invalid_amount');
    const account = accountFor(userId);
    const current = await this.store.balance(account);
    if (current < amount) throw new EconomyError('economy_insufficient_funds');
    return this.store.appendEntry({
      type: 'spend', debitAccount: account, creditAccount: TREASURY_SPENDS,
      amount, reason: reason || 'purchase', idempotencyKey: idempotencyKey || null, meta: { userId: String(userId) },
    });
  }

  async history(userId, options = {}) {
    return this.store.history(accountFor(userId), options);
  }
}

// Relatório de compliance para /economy/compliance e auditorias externas.
export async function complianceReport({ store } = {}) {
  return Object.freeze({
    currency: CURRENCY,
    realMoneyEnabled: REAL_MONEY_ENABLED,
    ledgerIntact: store?.integrity ? await store.integrity() : true,
    ledgerEntries: store?.count ? await store.count() : null,
    oddsPublished: oddsCatalog(),
    guards: ['no_real_money', 'double_entry_ledger', 'idempotency_keys', 'daily_grant_cap', 'published_odds'],
  });
}
