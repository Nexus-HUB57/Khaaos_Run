#!/usr/bin/env node
// MP-ZEX staging — selftest local do despacho único (ensaio completo).
// Sob um servidor autoritativo REAL (o mesmo boot do run-mp-zex-09-degraded.mjs
// em modo isolado: capacidade 2 ⇒ zero bots, store em arquivo temporário),
// executa, NA MESMA ORDEM do despacho único:
//   1. run-mp-zex-08-staging.mjs — caminho de staging do MP-ZEX-08 via
//      HTTP-free loopback autorizado (KR_STAGING_ALLOW_LOCAL_HTTP=1);
//   2. run-mp-zex-09-degraded.mjs em MODO REMOTO (KR_ZEX09_BASE_URL) — o
//      mesmo modo que o job mpzex-09 usa contra o staging real, com o
//      DegradedLink no cliente A.
//
// O que isto prova (e o que não prova):
//   ✅ caminhos inteiros dos dois jobs do despacho — login de duas contas
//      reais, match_found na mesma sala, navegação por inputs, cancelamento,
//      resume e rede degradada contra servidor autoritativo real;
//   ❌ NÃO substitui o staging remoto: rede real, HTTPS, environment GitHub
//      e secrets de produção continuam validados apenas no despacho.
//
// Uso: node game-runtime/scripts/mpzex-staging-selftest.mjs
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

// ── Boot do servidor isolado (mesma receita do run-mp-zex-09-degraded.mjs) ──
const { createAuthoritativeServer } = await import('../server/server.js');
const { AuthService, hashPassword } = await import('../server/auth.js');
const { DurableJsonStore } = await import('../server/store.js');
const { SharedMemoryRateStore } = await import('../server/rateLimit.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-mpzex-selftest-'));
const users = ['kr_player', 'kr_player2'].map((u) => ({
  id: u, username: u, role: 'player', region: 'sa-east', passwordHash: hashPassword('kr123'),
}));
const PORT = Number(process.env.KR_MPZEX_SELFTEST_PORT ?? 8846);
const auth = new AuthService({ secret: 'mpzex-selftest-secret', users });
const app = createAuthoritativeServer({
  port: PORT, auth, roomCapacity: 2,
  store: new DurableJsonStore(path.join(dir, 's.json')),
  rateStore: new SharedMemoryRateStore(),
});
await new Promise((resolve) => app.server.listen(PORT, resolve));
await app.ready;
console.log(`[mpzex-selftest] servidor isolado em http://127.0.0.1:${PORT} (capacidade 2, zero bots)`);

async function waitForReady(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/readyz`);
      if (res.ok) return true;
    } catch { /* ainda subindo */ }
    await delay(150);
  }
  throw new Error('servidor isolado não ficou ready no tempo previsto');
}
await waitForReady();

const baseLocal = `http://127.0.0.1:${PORT}`;
const accounts = {
  KR_STAGING_TEST_USER_A: 'kr_player', KR_STAGING_TEST_PASSWORD_A: 'kr123',
  KR_STAGING_TEST_USER_B: 'kr_player2', KR_STAGING_TEST_PASSWORD_B: 'kr123',
};

async function runScenario(script, env) {
  const child = spawn(process.execPath, [path.join(scriptDir, script)], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  const logChunks = [];
  child.stdout.on('data', (c) => logChunks.push(c));
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (c) => resolve(c));
  });
  return { code, logText: Buffer.concat(logChunks).toString() };
}

// ── 1) MP-ZEX-08: caminho de staging contra o loopback ──────────────────────
const eight = await runScenario('run-mp-zex-08-staging.mjs', {
  ...process.env,
  KR_STAGING_BASE_URL: baseLocal,
  KR_STAGING_ALLOW_LOCAL_HTTP: '1',
  ...accounts,
});
if (eight.code !== 0 || !eight.logText.includes('MP-ZEX-08 PASS')) {
  console.error(`[mpzex-selftest] FAIL — MP-ZEX-08 (exit ${eight.code}, contrato ${eight.logText.includes('MP-ZEX-08 PASS') ? 'presente' : 'ausente'})`);
  process.exit(1);
}

// ── 2) MP-ZEX-09: modo remoto contra o mesmo servidor (como no despacho) ────
const nine = await runScenario('run-mp-zex-09-degraded.mjs', {
  ...process.env,
  KR_ZEX09_BASE_URL: baseLocal,
  KR_ZEX09_ALLOW_LOCAL_HTTP: '1',
  KR_ZEX09_TEST_USER_A: accounts.KR_STAGING_TEST_USER_A,
  KR_ZEX09_TEST_PASSWORD_A: accounts.KR_STAGING_TEST_PASSWORD_A,
  KR_ZEX09_TEST_USER_B: accounts.KR_STAGING_TEST_USER_B,
  KR_ZEX09_TEST_PASSWORD_B: accounts.KR_STAGING_TEST_PASSWORD_B,
});
if (nine.code !== 0 || !nine.logText.includes('[MP-ZEX-09] RELATÓRIO:')) {
  console.error(`[mpzex-selftest] FAIL — MP-ZEX-09 (exit ${nine.code}, relatório ${nine.logText.includes('RELATÓRIO') ? 'presente' : 'ausente'})`);
  try { await app.close?.(); } catch { /* best effort */ }
  process.exit(1);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log('MPZEX_STAGING_SELFTEST_OK');
try { await app.close?.(); } catch { /* best effort */ }
process.exit(0);
