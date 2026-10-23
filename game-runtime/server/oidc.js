// Khaaos Run — SSO/OIDC operacional (Authorization Code Flow).
//
// Cliente OIDC sem dependências externas: discovery do issuer, troca de código,
// e verificação de `id_token` RS256 via JWKS (kid + iss + aud + exp + nonce).
// `fetchImpl` é injetável para testes; em produção usa o fetch global (Node 22).
//
// Fluxo suportado (confidential client):
//   1. GET /auth/oidc/start   → state+nonce efêmeros, cookie de state, 302 → IdP
//   2. IdP autentica e devolve ?code&state
//   3. GET /auth/oidc/callback → valida state (cookie ∩ query, single-use),
//      troca o código no token_endpoint, verifica o id_token e emite sessão KR
import crypto from 'node:crypto';

export async function discoverOidc(issuer, fetchImpl = fetch) {
  const url = `${String(issuer).replace(/\/$/, '')}/.well-known/openid-configuration`;
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`discovery falhou: HTTP ${response.status}`);
  const doc = await response.json();
  for (const field of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
    if (!doc[field]) throw new Error(`discovery incompleto: ${field} ausente`);
  }
  return doc;
}

export async function fetchJwks(jwksUri, fetchImpl = fetch) {
  const response = await fetchImpl(jwksUri);
  if (!response.ok) throw new Error(`jwks falhou: HTTP ${response.status}`);
  const doc = await response.json();
  if (!Array.isArray(doc.keys) || doc.keys.length === 0) throw new Error('jwks sem chaves');
  return doc.keys;
}

export function jwkPublicKey(jwk) {
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

// Verifica id_token RS256: assinatura por kid (JWKS) + iss/aud/exp/nonce.
// Retorna { ok, claims } ou { ok: false, reason } — nunca lança.
export function verifyIdToken(idToken, { jwks, issuer, audience, nonce = null, clockSkewSeconds = 30, now = Math.floor(Date.now() / 1000) } = {}) {
  try {
    const [head, body, signature] = String(idToken).split('.');
    if (!head || !body || !signature) return { ok: false, reason: 'malformed' };
    const header = JSON.parse(unb64(head));
    if (header.alg !== 'RS256') return { ok: false, reason: 'unsupported_alg' };
    if (!header.kid) return { ok: false, reason: 'missing_kid' };
    const jwk = (jwks || []).find((k) => k.kid === header.kid);
    if (!jwk) return { ok: false, reason: 'unknown_kid' };
    const data = Buffer.from(`${head}.${body}`);
    if (!crypto.verify('RSA-SHA256', data, jwkPublicKey(jwk), Buffer.from(signature, 'base64url'))) {
      return { ok: false, reason: 'bad_signature' };
    }
    const claims = JSON.parse(unb64(body));
    if (issuer && claims.iss !== issuer) return { ok: false, reason: 'issuer_mismatch' };
    if (now > claims.exp + clockSkewSeconds) return { ok: false, reason: 'token_expired' };
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (audience && !audiences.includes(audience)) return { ok: false, reason: 'audience_mismatch' };
    if (nonce && claims.nonce !== nonce) return { ok: false, reason: 'nonce_mismatch' };
    return { ok: true, claims };
  } catch (error) {
    return { ok: false, reason: 'verification_error', error: error?.message };
  }
}

const unb64 = (v) => Buffer.from(v, 'base64url').toString('utf8');

export class OidcClient {
  constructor({ issuer, clientId, clientSecret, redirectUri, scope = 'openid profile email', fetchImpl = fetch } = {}) {
    if (!issuer || !clientId || !clientSecret || !redirectUri) {
      throw new Error('OIDC: issuer, clientId, clientSecret e redirectUri são obrigatórios');
    }
    this.issuer = String(issuer).replace(/\/$/, '');
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.scope = scope;
    this.fetchImpl = fetchImpl;
    this.discovery = null;
    this.jwks = [];
  }

  // Discovery + JWKS com cache; `force` renova (rotação de chaves do IdP).
  async ready(force = false) {
    if (!force && this.discovery && this.jwks.length > 0) return true;
    const discovery = await discoverOidc(this.issuer, this.fetchImpl);
    if (discovery.issuer !== this.issuer) {
      throw new Error(`issuer divergente: esperado ${this.issuer}, obtido ${discovery.issuer}`);
    }
    this.discovery = discovery;
    this.jwks = await fetchJwks(this.discovery.jwks_uri, this.fetchImpl);
    return true;
  }

  authorizationUrl({ state, nonce }) {
    if (!this.discovery) throw new Error('OIDC não iniciado — chame ready() antes');
    const url = new URL(this.discovery.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('scope', this.scope);
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    return url.toString();
  }

  async exchangeCode(code) {
    if (!this.discovery) throw new Error('OIDC não iniciado — chame ready() antes');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const response = await this.fetchImpl(this.discovery.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
    });
    if (!response.ok) throw new Error(`token exchange falhou: HTTP ${response.status}`);
    const tokens = await response.json();
    if (!tokens.id_token) throw new Error('token exchange sem id_token');
    return tokens;
  }

  // Verifica id_token contra o JWKS em cache; kid desconhecido força uma
  // renovação do JWKS (rotação do IdP) antes de falhar definitivamente.
  async verifyIdToken(idToken, { nonce = null } = {}) {
    await this.ready();
    let result = verifyIdToken(idToken, { jwks: this.jwks, issuer: this.issuer, audience: this.clientId, nonce });
    if (!result.ok && result.reason === 'unknown_kid') {
      await this.ready(true);
      result = verifyIdToken(idToken, { jwks: this.jwks, issuer: this.issuer, audience: this.clientId, nonce });
    }
    return result;
  }
}
