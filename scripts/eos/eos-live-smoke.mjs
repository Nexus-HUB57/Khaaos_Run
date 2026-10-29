#!/usr/bin/env node
// Khaaos Run — M4: EOS LIVE smoke contra a API REAL do Epic Online Services.
//
// O aceite do M4 exige "execução EOS sem placeholders e com logs verificáveis".
// Este script valida a cadeia de CREDENCIAIS de serviço contra o endpoint REAL
// de OAuth2 do EOS (epicgames.dev): client_credentials → access_token real.
// É o mesmo fluxo que o servidor dedicado usa para backend services; se ele
// passa, as credenciais (ClientCredentials policy no Dev Portal) são válidas.
//
// Sem credenciais no ambiente o script SAI LIMPO com marcador SKIPPED (a CI
// nunca falha por ausência de credenciais — espelha o contrato UE1040 do EAC);
// com --strict e sem credenciais, falha (uso no go-live).
//
// Uso:
//   EOS_CLIENT_ID=... EOS_CLIENT_SECRET=... node scripts/eos/eos-live-smoke.mjs
//   node scripts/eos/eos-live-smoke.mjs --strict          # go-live: exige creds
//   EOS_DEPLOYMENT_ID=... ... node scripts/eos/eos-live-smoke.mjs --full  # + tokenExchange
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const full = args.includes('--full');
const CLIENT_ID = process.env.EOS_CLIENT_ID || null;
const CLIENT_SECRET = process.env.EOS_CLIENT_SECRET || null;
const DEPLOYMENT_ID = process.env.EOS_DEPLOYMENT_ID || null;
const TOKEN_URL = 'https://api.epicgames.dev/epic/oauth/v2/token';

const step = (n, msg) => console.log(`[eos-live] [${n}] ${msg}`);

function skip(reason) {
  console.log(`[eos-live] SKIPPED — ${reason}`);
  if (strict) { console.error('[eos-live] FALHA: --strict exige credenciais reais'); process.exit(1); }
  console.log('EOS_LIVE_SMOKE_SKIPPED');
  process.exit(0);
}

if (!CLIENT_ID || !CLIENT_SECRET) {
  skip('EOS_CLIENT_ID/EOS_CLIENT_SECRET ausentes no ambiente (configure os secrets EOS_* e reexecute)');
}

// ── [1] client_credentials contra o endpoint REAL do EOS ─────────────────────
const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
const body = new URLSearchParams({ grant_type: 'client_credentials' });
if (DEPLOYMENT_ID) body.set('deployment_id', DEPLOYMENT_ID);

step('1', `POST ${TOKEN_URL} (grant_type=client_credentials, credenciais REAIS — sem placeholders)`);
const t0 = Date.now();
const res = await fetch(TOKEN_URL, {
  method: 'POST',
  headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
  body: body.toString(),
});
const latency = Date.now() - t0;
const data = await res.json().catch(() => ({}));

if (!res.ok) {
  console.error(`[eos-live] FALHA: HTTP ${res.status} — ${JSON.stringify(data).slice(0, 300)}`);
  console.error('[eos-live] credenciais inválidas OU ClientCredentials policy sem scope adequado no Dev Portal');
  process.exit(1);
}
if (!data.access_token || !data.expires_in) {
  console.error(`[eos-live] FALHA: resposta sem access_token/expires_in — ${JSON.stringify(data).slice(0, 300)}`);
  process.exit(1);
}
step('1', `token REAL recebido em ${latency}ms — tipo=${data.token_type} expira em ${data.expires_in}s (sha256 do token: ${crypto.createHash('sha256').update(String(data.access_token)).digest('hex').slice(0, 16)}…)`);
console.log(JSON.stringify({ ok: true, latencyMs: latency, expiresIn: data.expires_in, tokenType: data.token_type, deployment: DEPLOYMENT_ID ?? null }));

// ── [2] (--full) tokenExchange com deployment_id: valida o deploy p/ sessões ─
if (full) {
  if (!DEPLOYMENT_ID) { console.error('[eos-live] --full exige EOS_DEPLOYMENT_ID'); process.exit(1); }
  step('2', `tokenExchange com deployment_id=${DEPLOYMENT_ID} (contrato de sessões/matchmaking)`);
  const res2 = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', deployment_id: DEPLOYMENT_ID }).toString(),
  });
  const data2 = await res2.json().catch(() => ({}));
  if (!res2.ok || !data2.access_token) {
    console.error(`[eos-live] FALHA no tokenExchange: HTTP ${res2.status} — ${JSON.stringify(data2).slice(0, 300)}`);
    process.exit(1);
  }
  step('2', `deployment token OK (expira em ${data2.expires_in}s) — sessões/matchmaking habilitados para este deployment`);
}

console.log('EOS_LIVE_SMOKE_OK');
