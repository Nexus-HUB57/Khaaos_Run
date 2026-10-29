// Khaaos Run — Fase 39 — DESBLOQUEIO UE5.8/EAC pelo /admin (Command Monitor).
// ==============================================================================
// Fecha o circuito de AÇÃO dos 5 bloqueadores humanos do UE5.8/EAC:
//   1. puro — sealedBoxEncrypt no formato OFICIAL crypto_box_seal da API de
//      secrets do GitHub (header epk(32) + nonce=BLAKE2b-24(epk‖pk)) — o teste
//      DESCRIPTOGRAFA com a chave receptora local (prova ponta a ponta);
//   2. puro — setRepoSecrets: whitelist FECHADA, valores nunca ecoam na
//      resposta, validações (token/quantidade/strings);
//   3. puro — collectUe58Status: mesma semântica do relatório da Fase 28 com
//      fetchImpl injetável (API stub) + probes locais (EAC SDK/DefaultEOS.ini);
//   4. E2E — rotas /admin/ue58* no servidor autoritativo REAL com adminToken
//      legacy e DI de stub (RBAC, audit, 207 parcial, comando do runner).
// Runner node:test (padrão do repo — lição #128/#132: nunca vitest).
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nacl from 'tweetnacl';
import { blake2b } from 'blakejs';

const {
  UE58_SECRET_NAMES,
  EOS_REQUIRED,
  sealedBoxEncrypt,
  setRepoSecrets,
  collectUe58Status,
  createRunnerRegistrationToken,
  triggerInfraSmoke,
} = await import('../server/ue58unblock.js');
const { createAuthoritativeServer } = await import('../server/server.js');
const { AuthService, hashPassword } = await import('../server/auth.js');
const { DurableJsonStore } = await import('../server/store.js');
const { SharedMemoryRateStore } = await import('../server/rateLimit.js');

// ─── 1. sealedBoxEncrypt — formato oficial crypto_box_seal ──────────────────

describe('sealedBoxEncrypt (Fase 39)', () => {
  test('round-trip REAL: mensagem descriptografa com a chave receptora local', () => {
    const recipient = nacl.box.keyPair(); // "GitHub" — chama .box.open com a sk
    const payload = sealedBoxEncrypt('EOS_PRODUCT_ID=123456', Buffer.from(recipient.publicKey).toString('base64'));
    const buf = Buffer.from(payload, 'base64');
    assert.ok(buf.length > 48, 'payload = header 48B + ciphertext');
    const epk = new Uint8Array(buf.subarray(0, 32));
    const boxed = new Uint8Array(buf.subarray(32));
    const nonce = blake2b(Buffer.concat([Buffer.from(epk), Buffer.from(recipient.publicKey)]), null, 24);
    const opened = nacl.box.open(boxed, nonce, epk, recipient.secretKey);
    assert.ok(opened, 'sealed box abre com a receptora');
    assert.equal(Buffer.from(opened).toString('utf8'), 'EOS_PRODUCT_ID=123456', 'valor íntegro');
    // o mesmo plaintext gera payloads DIFERENTES (epk efêmera por chamada)
    const again = sealedBoxEncrypt('EOS_PRODUCT_ID=123456', Buffer.from(recipient.publicKey).toString('base64'));
    assert.notEqual(again, payload, 'efemeridade: nunca reusa epk/nonce');
  });

  test('chave pública de tamanho errado rejeitada sem throw externo', () => {
    assert.throws(() => sealedBoxEncrypt('x', Buffer.from('curta').toString('base64')), /chave pública do repo inválida/);
  });
});

// ─── 2. setRepoSecrets — whitelist + resposta sem valores ───────────────────

describe('setRepoSecrets (Fase 39)', () => {
  const makeStub = ({ keyId = '568250167242548843', statuses = {} } = {}) => {
    const calls = [];
    const fetchImpl = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method ?? 'GET', body: opts.body ? JSON.parse(opts.body) : null });
      if (String(url).endsWith('/actions/secrets/public-key')) {
        const kp = nacl.box.keyPair();
        return { ok: true, status: 200, json: async () => ({ key_id: keyId, key: Buffer.from(kp.publicKey).toString('base64') }) };
      }
      const m = String(url).match(/\/actions\/secrets\/([A-Z_]+)$/);
      if (m) { const status = statuses[m[1]] ?? 204; return { ok: status < 400, status, json: async () => ({}) }; }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    return { calls, fetchImpl };
  };

  test('grava via PUT com encrypted_value + key_id; resposta NUNCA contém valores', async () => {
    const { calls, fetchImpl } = makeStub();
    const r = await setRepoSecrets({
      token: 'ghp_stub', fetchImpl,
      secrets: { EOS_PRODUCT_ID: 'prod-123', EOS_CLIENT_SECRET: 'segredo!', FORA_DA_LISTA: 'hack' },
    });
    assert.deepEqual(r.set, ['EOS_PRODUCT_ID', 'EOS_CLIENT_SECRET']);
    assert.equal(r.failed.length, 1);
    assert.equal(r.failed[0].name, 'FORA_DA_LISTA');
    assert.match(r.failed[0].error, /whitelist/);
    // resposta inteira SEM os valores
    assert.equal(JSON.stringify(r).includes('prod-123'), false, 'valor não ecoa');
    assert.equal(JSON.stringify(r).includes('segredo'), false, 'valor não ecoa');
    // PUTs com sealed box (não plaintext) + key_id
    const puts = calls.filter((c) => c.method === 'PUT');
    assert.equal(puts.length, 2);
    for (const p of puts) {
      assert.ok(p.body.encrypted_value, 'encrypted_value presente');
      assert.ok(p.body.key_id, 'key_id presente');
      assert.equal(JSON.stringify(p.body).includes('prod-123'), false, 'plaintext NUNCA vai no corpo');
    }
  });

  test('validações: sem token / vazio / teto 10 → throw (nada grava)', async () => {
    const { calls, fetchImpl } = makeStub();
    await assert.rejects(() => setRepoSecrets({ token: '', fetchImpl, secrets: { EOS_PRODUCT_ID: 'x' } }), /sem token/);
    await assert.rejects(() => setRepoSecrets({ token: 't', fetchImpl, secrets: {} }), /nenhum secret/);
    const big = Object.fromEntries(UE58_SECRET_NAMES.concat(['A', 'B', 'C']).map((n, i) => [n, String(i)]));
    await assert.rejects(() => setRepoSecrets({ token: 't', fetchImpl, secrets: big }), /teto de 10/);
    assert.equal(calls.length, 0, 'nenhuma chamada HTTP nas rejeições');
  });

  test('HTTP de erro da API vira failed estruturado (nunca throw cru)', async () => {
    const { fetchImpl } = makeStub({ statuses: { EOS_PRODUCT_ID: 422 } });
    const r = await setRepoSecrets({ token: 't', fetchImpl, secrets: { EOS_PRODUCT_ID: 'x', EOS_CLIENT_ID: 'y' } });
    assert.deepEqual(r.set, ['EOS_CLIENT_ID']);
    assert.equal(r.failed[0].name, 'EOS_PRODUCT_ID');
    assert.match(r.failed[0].error, /HTTP 422/);
  });

  test('whitelist canônica: 6 EOS obrigatórios + 2 de container/PAT', () => {
    assert.deepEqual(EOS_REQUIRED, ['EOS_PRODUCT_ID', 'EOS_SANDBOX_ID', 'EOS_DEPLOYMENT_ID', 'EOS_CLIENT_ID', 'EOS_CLIENT_SECRET', 'EOS_ENCRYPTION_KEY']);
    assert.ok(UE58_SECRET_NAMES.includes('UE_CONTAINER_PAT'));
    assert.ok(UE58_SECRET_NAMES.includes('UNREAL_ENGINE_LOGIN'));
    assert.equal(UE58_SECRET_NAMES.length, 8);
  });
});

// ─── 3. collectUe58Status — 5 bloqueadores com API stub + probes locais ─────

describe('collectUe58Status (Fase 39)', () => {
  const mkRoot = ({ eac = false, iniPlaceholder = false } = {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-ue58-'));
    if (iniPlaceholder !== null) {
      fs.mkdirSync(path.join(dir, 'Unreal', 'KhaaosRun', 'Config'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'Unreal', 'KhaaosRun', 'Config', 'DefaultEOS.ini'),
        iniPlaceholder ? '[EOS]\nProductId=KHAOS_PRODUCT_ID\n' : '[EOS]\nProductId=INJETADO_EM_BUILD\n');
    }
    if (eac) {
      fs.mkdirSync(path.join(dir, 'Unreal', 'KhaaosRun', 'Source', 'KhaaosEAC', 'EACSDK', 'Sdk', 'anticheat'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'Unreal', 'KhaaosRun', 'Source', 'KhaaosEAC', 'EACSDK', 'Sdk', 'anticheat', 'sdkdefines.h'), '#pragma once\n');
    }
    return dir;
  };

  const apiStub = (over = {}) => {
    const vars = over.vars ?? ['UE58_ENABLED', 'UE5_ROOT'];
    const secrets = over.secrets ?? [...EOS_REQUIRED, 'UE_CONTAINER_PAT'];
    const runners = over.runners ?? [{ status: 'online', labels: [{ name: 'ue5.8' }] }];
    const smoke = over.smoke ?? { workflow_runs: [{ id: 9, status: 'completed', conclusion: 'success', created_at: '2026-10-29T00:00:00Z', html_url: 'https://actions/x/9' }] };
    return async (url) => {
      const u = String(url);
      const body = (data) => ({ ok: true, status: 200, json: async () => data });
      if (u.includes('/variables')) return body({ variables: vars.map((name) => ({ name })) });
      if (u.includes('/secrets')) return body({ secrets: secrets.map((name) => ({ name })) });
      if (u.includes('/runners')) return body({ total_count: runners.length, runners });
      if (u.includes('/runs')) return body(smoke);
      return { ok: false, status: 404, json: async () => ({}) };
    };
  };

  test('TUDO pronto: variáveis + runner ue5.8 online + EOS + container + EAC local + ini injetado', async () => {
    const root = mkRoot({ eac: true });
    const s = await collectUe58Status({ token: 't', fetchImpl: apiStub(), rootDir: root });
    assert.equal(s.api, true);
    assert.equal(s.blockers.length, 0, JSON.stringify(s.blockers));
    assert.match(s.summary, /TUDO PRONTO/);
    assert.ok(s.secretNames.includes('EOS_CLIENT_SECRET'), 'presença de secrets exposta (nome, nunca valor)');
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('runner offline/ausente + EOS faltando + EAC stub + ini placeholder → bloqueios com correção', async () => {
    const root = mkRoot({ iniPlaceholder: true });
    const s = await collectUe58Status({
      token: 't', rootDir: root,
      fetchImpl: apiStub({ runners: [], secrets: ['UE_CONTAINER_PAT'] }),
    });
    const areas = s.blockers.map((b) => b.area);
    assert.ok(areas.includes('runner'), 'runner ausente');
    assert.equal(areas.filter((a) => a === 'eos').length, 2, 'eos: secrets ausentes + placeholder no ini');
    assert.ok(areas.includes('eac'), 'EAC SDK ausente');
    assert.equal(s.blockers.length, 4, JSON.stringify(s.blockers));
    for (const b of s.blockers) assert.ok(b.how && b.how.length > 20, 'cada bloqueio traz COMO destravar');
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('sem token: probes locais rodam, API marcada indisponível (nunca crash)', async () => {
    const root = mkRoot({ eac: true });
    const s = await collectUe58Status({ token: '', fetchImpl: apiStub(), rootDir: root });
    assert.equal(s.api, false);
    assert.ok(s.blockers.some((b) => b.area === 'github'), 'token ausente sinalizado');
    assert.ok(s.ready.some((r) => r.area === 'eac'), 'probe local de EAC roda mesmo sem API');
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('PAT rejeitado (HTTP 403) → bloqueio github com correção de escopo', async () => {
    const root = mkRoot({ eac: true });
    const s = await collectUe58Status({ token: 't', rootDir: root, fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }) });
    assert.equal(s.api, false);
    assert.match(s.blockers.find((b) => b.area === 'github').what, /403/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('smoke failure vira bloqueio explícito (credencial ghcr não autentica)', async () => {
    const root = mkRoot({ eac: true });
    const s = await collectUe58Status({
      token: 't', rootDir: root,
      fetchImpl: apiStub({ smoke: { workflow_runs: [{ id: 8, status: 'completed', conclusion: 'failure', created_at: '2026-10-29T00:00:00Z', html_url: 'u' }] } }),
    });
    assert.ok(s.blockers.some((b) => /ue-infra-smoke FALHOU/.test(b.what)), JSON.stringify(s.blockers));
    fs.rmSync(root, { recursive: true, force: true });
  });
});

// ─── 4. tokens/ação: registration-token + smoke dispatch ────────────────────

describe('runner token + smoke (Fase 39)', () => {
  test('createRunnerRegistrationToken devolve token + comando pronto do bootstrap', async () => {
    const calls = [];
    const fetchImpl = async (url, opts = {}) => {
      calls.push({ url: String(url), method: opts.method });
      return { ok: true, status: 201, json: async () => ({ token: 'AABBCCDD', expires_at: '2026-10-29T18:00:00Z' }) };
    };
    const r = await createRunnerRegistrationToken({ token: 't', fetchImpl });
    assert.equal(r.token, 'AABBCCDD');
    assert.match(r.command, /RUNNER_TOKEN=AABBCCDD/);
    assert.match(r.command, /bootstrap_ue58_runner\.sh --all/);
    assert.equal(calls[0].method, 'POST', 'registration-token é POST');
  });

  test('triggerInfraSmoke: dispatch 204 + último run lido; dispatch recusado → throw', async () => {
    let dispatches = 0;
    const ok = async (url, opts = {}) => {
      if (String(url).endsWith('/dispatches')) { dispatches++; return { status: 204, json: async () => ({}) }; }
      return { ok: true, status: 200, json: async () => ({ workflow_runs: [{ id: 7, status: 'queued', conclusion: null, created_at: 'now', html_url: 'u' }] }) };
    };
    const r = await triggerInfraSmoke({ token: 't', fetchImpl: ok });
    assert.equal(r.dispatched, true);
    assert.equal(r.lastRun.status, 'queued');
    assert.equal(dispatches, 1);
    await assert.rejects(() => triggerInfraSmoke({ token: 't', fetchImpl: async () => ({ status: 403, json: async () => ({}) }) }), /dispatch recusado/);
  });
});

// ─── 5. E2E: rotas no servidor autoritativo REAL (RBAC + audit + DI stub) ────

describe('rotas /admin/ue58 — E2E com createAuthoritativeServer', () => {
  const boot = async (ue58Stub) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-ue58-route-'));
    const auth = new AuthService({
      secret: 'ue58-route-secret',
      users: [{ id: 'a1', username: 'admin', role: 'admin', region: 'sa-east', passwordHash: hashPassword('adminpass', 'salt') }],
    });
    const app = createAuthoritativeServer({
      port: 0, auth,
      store: new DurableJsonStore(path.join(dir, 'state.json')),
      rateStore: new SharedMemoryRateStore(),
      adminToken: 'legacy',
      ue58: ue58Stub,
    });
    await new Promise((resolve) => app.server.listen(0, resolve));
    const port = app.server.address().port;
    return { app, port, dir, cleanup: async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
  };

  const apiStub = async (url, opts = {}) => {
    const u = String(url);
    const body = (data) => ({ ok: true, status: 200, json: async () => data });
    if (u.includes('/variables')) return body({ variables: [{ name: 'UE58_ENABLED' }, { name: 'UE5_ROOT' }] });
    if (u.includes('/secrets/public-key')) {
      const kp = nacl.box.keyPair();
      return body({ key_id: 'kid', key: Buffer.from(kp.publicKey).toString('base64') });
    }
    if (u.includes('/actions/secrets/')) return { ok: true, status: 204, json: async () => ({}) };
    if (u.includes('/secrets')) return body({ secrets: [] });
    if (u.includes('/runners/registration-token')) return { ok: true, status: 201, json: async () => ({ token: 'REGTOK123', expires_at: '2026-10-29T18:00:00Z' }) };
    if (u.includes('/dispatches')) return { status: 204, json: async () => ({}) };
    if (u.includes('/runners')) return body({ total_count: 0, runners: [] });
    if (u.includes('/runs')) return body({ workflow_runs: [] });
    return { ok: false, status: 404, json: async () => ({}) };
  };

  test('GET status: 200 com DI stub; token errado: 403 (RBAC do painel)', async () => {
    const env = await boot({ token: 'stub-token', fetchImpl: apiStub });
    try {
      const ok = await fetch(`http://127.0.0.1:${env.port}/admin/ue58?token=legacy`);
      assert.equal(ok.status, 200);
      const d = await ok.json();
      assert.equal(d.api, true, 'stub da API consultado');
      assert.ok(Array.isArray(d.ready) && Array.isArray(d.blockers));
      const denied = await fetch(`http://127.0.0.1:${env.port}/admin/ue58?token=errado`);
      assert.equal(denied.status, 403, 'RBAC: token legacy inválido é recusado');
    } finally { await env.cleanup(); }
  });

  test('POST secrets: whitelist 207 parcial; comando do runner; smoke dispatch', async () => {
    const env = await boot({ token: 'stub-token', fetchImpl: apiStub });
    try {
      const partial = await fetch(`http://127.0.0.1:${env.port}/admin/ue58/secrets?token=legacy`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secrets: { EOS_PRODUCT_ID: 'x', HACKER: 'y' } }),
      });
      assert.equal(partial.status, 207, 'parcial: 1 gravado + 1 fora da whitelist');
      const pd = await partial.json();
      assert.deepEqual(pd.set, ['EOS_PRODUCT_ID']);
      assert.equal(JSON.stringify(pd).includes('"x"'), false, 'valor NUNCA ecoa');

      const runner = await fetch(`http://127.0.0.1:${env.port}/admin/ue58/runner-token?token=legacy`, { method: 'POST' });
      assert.equal(runner.status, 200);
      const rd = await runner.json();
      assert.match(rd.command, /RUNNER_TOKEN=REGTOK123/);

      const smoke = await fetch(`http://127.0.0.1:${env.port}/admin/ue58/smoke?token=legacy`, { method: 'POST' });
      assert.equal(smoke.status, 200);
      assert.equal((await smoke.json()).dispatched, true);
    } finally { await env.cleanup(); }
  });

  test('POST secrets sem token GitHub configurado → 400 estruturado (sem crash)', async () => {
    const env = await boot({ token: '', fetchImpl: apiStub }); // sem token E sem env
    try {
      const r = await fetch(`http://127.0.0.1:${env.port}/admin/ue58/secrets?token=legacy`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secrets: { EOS_PRODUCT_ID: 'x' } }),
      });
      assert.equal(r.status, 400);
      const d = await r.json();
      assert.equal(d.error, 'ue58_secrets_rejected');
      assert.match(d.detail, /sem token/);
    } finally { await env.cleanup(); }
  });
});
