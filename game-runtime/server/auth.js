// Khaaos Run — autenticação do runtime (senhas scrypt, tokens HS256 com kid,
// rotação de chaves com grace e revogação por jti).
//
// - Tokens: HS256, header carrega `kid` da chave usada; `jti` único por token.
// - Rotação: `rotateSecret()` marca a chave atual como `retired` (valida tokens
//   emitidos antes, não emite novos) e ativa a nova; `dropKey()` remove uma
//   chave retired e invalida definitivamente os tokens dela.
// - Revogação: `revoke(token)` coloca o `jti` na denylist até `exp` (+ folga de
//   relógio); `verify()` consulta e purga entradas vencidas.
// - Compatibilidade: `signToken(payload, secret)`/`verifyToken(token, secret)`
//   com secret único continuam funcionando (tokens legados sem `kid`).
import crypto from 'node:crypto';

const b64 = (v) => Buffer.from(v).toString('base64url');
const unb64 = (v) => Buffer.from(v, 'base64url').toString('utf8');
// kid DETERMINÍSTICO por secret: réplicas com o MESMO AUTH_SECRET derivam a
// MESMA kid e validam tokens umas das outras (verificação stateless entre
// réplicas do staging). Kid aleatório por processo quebrava o resume/redirect
// cross-replica: o token emitido pela réplica A era rejeitado na B com
// auth_required (kid filtrado sem fallback, por design anti cross-key).
// Rotação continua segura: secret novo → kid novo (1-1 com o secret).
const kidFromSecret = (secret) => crypto.createHash('sha256').update(String(secret)).digest('hex').slice(0, 12);
const REVOCATION_MARGIN_SECONDS = 60; // folga de relógio além do exp

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, encoded) {
  try {
    const [, salt, expected] = String(encoded).split(':');
    const actual = crypto.scryptSync(String(password), salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function signToken(payload, secret, ttlSeconds = 3600, kid = null) {
  const header = { alg: 'HS256', typ: 'JWT' };
  if (kid) header.kid = kid;
  const head = b64(JSON.stringify(header));
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds, jti: crypto.randomUUID() }));
  const signature = b64(crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${signature}`;
}

// keys: string (legado) OU lista de { kid, secret, state? }.
// Com `kid` no header: só a chave correspondente valida (sem fallback — evita
// cross-key confusion com kid escolhido pelo atacante). Sem `kid` (tokens
// legados): tenta todas as chaves conhecidas.
export function verifyToken(token, keys) {
  try {
    const [head, body, signature] = String(token).split('.');
    if (!head || !body || !signature) return null;
    const header = JSON.parse(unb64(head));
    const list = typeof keys === 'string'
      ? [{ kid: null, secret: keys }]
      : (keys || []).map((k) => ({ kid: k.kid ?? null, secret: k.secret }));
    if (list.length === 0) return null;
    const candidates = header.kid ? list.filter((k) => k.kid === header.kid) : list;
    if (candidates.length === 0) return null;
    let valid = false;
    for (const candidate of candidates) {
      const expected = crypto.createHmac('sha256', candidate.secret).update(`${head}.${body}`).digest();
      const provided = Buffer.from(signature, 'base64url');
      if (expected.length === provided.length && crypto.timingSafeEqual(expected, provided)) { valid = true; break; }
    }
    if (!valid) return null;
    const payload = JSON.parse(unb64(body));
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hasRole(identity, role) {
  const order = { player: 1, moderator: 2, admin: 3 };
  return (order[identity?.role] || 0) >= (order[role] || 99);
}

export class AuthService {
  constructor({ secret = process.env.AUTH_SECRET || 'dev-only-change-me', keys = null, users = [] } = {}) {
    this.keys = [];
    if (Array.isArray(keys) && keys.length > 0) {
      for (const key of keys) {
        this.keys.push({ kid: key.kid || kidFromSecret(key.secret), secret: String(key.secret), state: key.state || 'active' });
      }
    } else {
      this.keys.push({ kid: kidFromSecret(secret), secret, state: 'active' });
    }
    this.users = new Map(users.map((u) => [u.username, { ...u }]));
    this.revoked = new Map(); // jti → { expiresAt } (epoch segundos)
  }

  get activeKey() {
    return this.keys.find((k) => k.state === 'active') || this.keys[0];
  }

  // Metadados seguros — NUNCA expõe secrets.
  keyInfo() {
    return this.keys.map(({ kid, state }) => ({ kid, state }));
  }

  // Ativa `newSecret` como chave corrente; a atual passa a validar só tokens antigos.
  rotateSecret(newSecret = crypto.randomBytes(48).toString('base64url')) {
    if (!newSecret || typeof newSecret !== 'string') throw new Error('novo secret inválido');
    const current = this.activeKey;
    if (current.secret === newSecret) return { kid: current.kid, rotated: false, keys: this.keyInfo() };
    current.state = 'retired';
    const kid = kidFromSecret(newSecret);
    this.keys.unshift({ kid, secret: newSecret, state: 'active' });
    return { kid, rotated: true, keys: this.keyInfo() };
  }

  // Remove uma chave retired — tokens emitidos por ela passam a ser inválidos.
  dropKey(kid) {
    const index = this.keys.findIndex((k) => k.kid === kid);
    if (index < 0) return false;
    if (this.keys[index].state === 'active') throw new Error('chave ativa não pode ser removida; rotacione primeiro');
    this.keys.splice(index, 1);
    return true;
  }

  login(username, password) {
    const user = this.users.get(username);
    if (!user || !verifyPassword(password, user.passwordHash)) return null;
    return this.issueForUser(user);
  }

  // Emite token para usuário já autenticado (ex.: SSO/OIDC).
  issueForUser(user, ttlSeconds = 3600) {
    const key = this.activeKey;
    const token = signToken(
      { sub: user.id, username: user.username, role: user.role, region: user.region },
      key.secret, ttlSeconds, key.kid,
    );
    return { token, user: { id: user.id, username: user.username, role: user.role, region: user.region } };
  }

  // Provisiona/atualiza usuário de provedor externo (SSO) por username estável.
  upsertExternalUser({ id, username, role = 'player', region = 'sa-east' }) {
    const existing = [...this.users.values()].find((u) => u.username === username);
    if (existing) {
      existing.role = role;
      existing.region = region || existing.region;
      return existing;
    }
    const user = { id, username, role, region };
    this.users.set(username, user);
    return user;
  }

  revoke(token) {
    const payload = this.verify(token, { skipRevocation: true });
    if (!payload?.jti) return false;
    if (this.revoked.has(payload.jti)) return false; // idempotente: já revogado
    const now = Math.floor(Date.now() / 1000);
    this.revoked.set(payload.jti, { expiresAt: payload.exp + REVOCATION_MARGIN_SECONDS, revokedAt: now });
    return true;
  }

  isRevoked(jti) {
    return this.revoked.has(jti);
  }

  #purgeRevocations(now = Math.floor(Date.now() / 1000)) {
    for (const [jti, entry] of this.revoked) if (entry.expiresAt <= now) this.revoked.delete(jti);
  }

  verify(token, { skipRevocation = false } = {}) {
    const payload = verifyToken(token, this.keys);
    if (!payload) return null;
    if (!skipRevocation) {
      this.#purgeRevocations();
      if (payload.jti && this.revoked.has(payload.jti)) return null;
    }
    return payload;
  }
}
