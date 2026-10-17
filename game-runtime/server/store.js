import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

export class DurableJsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { sessions: {}, users: {} };
    this.load();
  }

  load() {
    try {
      this.data = { ...this.data, ...JSON.parse(fs.readFileSync(this.filePath, 'utf8')) };
    } catch {}
    return this.data;
  }

  flush() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.filePath);
  }

  setSession(id, session) {
    this.data.sessions[id] = session;
    this.flush();
    return session;
  }

  getSession(id) {
    const session = this.data.sessions[id] || null;
    if (session && session.expiresAt <= Date.now()) {
      this.deleteSession(id);
      return null;
    }
    return session;
  }

  deleteSession(id) {
    delete this.data.sessions[id];
    this.flush();
  }

  listSessions() {
    const now = Date.now();
    return Object.entries(this.data.sessions)
      .filter(([, session]) => session.expiresAt > now)
      .map(([, session]) => session);
  }

  ready() {
    return true;
  }

  async close() {}
}

export class PostgresSessionStore {
  constructor({ connectionString = process.env.KR_DATABASE_URL || process.env.DATABASE_URL, pool } = {}) {
    if (!pool && !connectionString) throw new Error('KR_DATABASE_URL ou DATABASE_URL é obrigatório para o store PostgreSQL');
    this.pool = pool || new Pool({ connectionString, max: Number(process.env.KR_PG_POOL_MAX || 20), idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  }

  async ready() {
    await this.pool.query('SELECT 1');
    return true;
  }

  async setSession(id, session) {
    await this.pool.query(
      `INSERT INTO runtime_sessions (resume_token, session, expires_at)
       VALUES ($1, $2::jsonb, to_timestamp($3 / 1000.0))
       ON CONFLICT (resume_token) DO UPDATE
       SET session = EXCLUDED.session, expires_at = EXCLUDED.expires_at, updated_at = now()`,
      [id, JSON.stringify(session), session.expiresAt],
    );
    return session;
  }

  async getSession(id) {
    const result = await this.pool.query(
      `SELECT session FROM runtime_sessions WHERE resume_token = $1 AND expires_at > now()`,
      [id],
    );
    return result.rows[0]?.session || null;
  }

  async deleteSession(id) {
    await this.pool.query('DELETE FROM runtime_sessions WHERE resume_token = $1', [id]);
  }

  async listSessions() {
    const result = await this.pool.query('SELECT session FROM runtime_sessions WHERE expires_at > now()');
    return result.rows.map((row) => row.session);
  }

  async cleanupExpired() {
    const result = await this.pool.query('DELETE FROM runtime_sessions WHERE expires_at <= now()');
    return result.rowCount || 0;
  }

  async close() {
    await this.pool.end();
  }
}

export function createSessionStore({ mode = process.env.KR_SESSION_STORE || 'json', filePath } = {}) {
  if (mode === 'postgres') return new PostgresSessionStore();
  if (mode !== 'json') throw new Error(`KR_SESSION_STORE inválido: ${mode}`);
  return new DurableJsonStore(filePath || process.env.KR_STORE || path.join(process.cwd(), '.data', 'server.json'));
}
