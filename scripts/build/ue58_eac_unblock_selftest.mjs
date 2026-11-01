#!/usr/bin/env node
// ─── Selftest do ue58_eac_unblock (guard de CI — 100% offline) ──────────────
//
// Valida, sem rede externa (API do GitHub e ghcr mockados em 127.0.0.1):
//  1. Relatório com o estado REAL diagnosticado (run #9 do ue-infra-smoke):
//     UNREAL_ENGINE_LOGIN presente mas não-autenticável → blocker com a
//     evidência citada; UE5_INSTALL_DIR presente → ready; EOS ausentes →
//     blocker com a lista exata dos 6; runner ausente → blocker.
//  2. Relatório "tudo pronto": EOS_* (6) + UE_CONTAINER_PAT + runner ue5.8
//     online zeram os blockers correspondentes.
//  3. Sem GITHUB_TOKEN: api=false + blocker orientando o escopo do PAT.
//  4. Sonda ghcr --probe-ghcr, camada 1: token endpoint 403 DENIED (a
//     assinatura exata do run #9) → layer 1 falha com a mensagem canônica.
//  5. Sonda ghcr, camada 2: token 200 mas manifest 403 → credencial
//     autentica, mas falta EULA/vínculo Epic (mensagem exata).
//  6. Sonda ghcr, 2 camadas OK → veredito PRONTO + ready no relatório.
//
// Uso: node scripts/build/ue58_eac_unblock_selftest.mjs   (exit 0 = ok)

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UNBLOCK = path.join(__dirname, 'ue58_eac_unblock.mjs');
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ── Mock da API do GitHub (endpoints usados pelo relatório) ─────────────────
function mockGitHub({ variables = [], secrets = [], runners = [], smokeRun = null } = {}) {
  const server = http.createServer((req, res) => {
    const url = req.url ?? '';
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url.startsWith('/repos/') && url.endsWith('/actions/variables')) return send(200, { total_count: variables.length, variables });
    if (url.startsWith('/repos/') && url.endsWith('/actions/secrets')) return send(200, { total_count: secrets.length, secrets });
    if (url.startsWith('/repos/') && url.endsWith('/actions/runners')) return send(200, { total_count: runners.length, runners });
    if (url.includes('/actions/workflows/ue-infra-smoke.yml/runs')) {
      return send(200, { total_count: smokeRun ? 1 : 0, workflow_runs: smokeRun ? [smokeRun] : [] });
    }
    return send(404, { message: 'Not Found' });
  });
  return server;
}

// ── Mock do ghcr (token endpoint + manifests) ────────────────────────────────
function mockGhcr({ tokenStatus = 200, tokenBody = { token: 'jwt-falso' }, manifestStatus = 200 } = {}) {
  const server = http.createServer((req, res) => {
    const url = req.url ?? '';
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    if (url.startsWith('/token')) {
      return send(tokenStatus, typeof tokenBody === 'string' ? tokenBody : tokenBody);
    }
    if (url.startsWith('/v2/epicgames/unreal-engine/manifests/')) {
      return send(manifestStatus, manifestStatus === 200 ? { schemaVersion: 2, manifests: [] } : { errors: [{ code: 'DENIED', message: 'denied' }] });
    }
    return send(404, { errors: [{ code: 'NOT_FOUND', message: 'not found' }] });
  });
  return server;
}

function runUnblock(env, args) {
  // spawn ASSÍNCRONO (nunca spawnSync): o event loop do pai precisa continuar
  // vivo para SERVIR os mocks HTTP — spawnSync congela o loop e o filho fica
  // eternamente esperando resposta do mock (bug clássico de mock in-process).
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [UNBLOCK, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const killer = setTimeout(() => child.kill('SIGKILL'), 120_000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(killer); reject(e); });
    child.on('close', (code, signal) => {
      clearTimeout(killer);
      resolve({ status: code, signal, stdout: out, stderr: err });
    });
  });
}

async function main() {
  const RUN9 = { id: 40790280249, run_number: 9, conclusion: 'success', created_at: '2026-10-28T23:52:16Z' };
  const secs = (names) => names.map((name) => ({ name, updated_at: '2026-10-28T00:00:00Z' }));
  const vrs = (names) => names.map((name) => ({ name, value: 'x', created_at: '2026-10-28T00:00:00Z', updated_at: '2026-10-28T00:00:00Z' }));
  const RUNNER_UE58 = { id: 1, name: 'ue58-host', status: 'online', busy: false, labels: [{ name: 'self-hosted' }, { name: 'ue5.8' }] };
  const EOS_ALL = ['EOS_PRODUCT_ID', 'EOS_SANDBOX_ID', 'EOS_DEPLOYMENT_ID', 'EOS_CLIENT_ID', 'EOS_CLIENT_SECRET', 'EOS_ENCRYPTION_KEY'];

  let cases = 0;
  // ── Caso 1: estado real diagnosticado (run #9) ────────────────────────────
  {
    cases += 1;
    const api = mockGitHub({
      variables: vrs(['UE58_ENABLED', 'UE5_ROOT']),
      secrets: secs(['GH_TOKEN', 'UE5_INSTALL_DIR', 'UNREAL_ENGINE_LOGIN']),
      runners: [],
      smokeRun: RUN9,
    });
    await new Promise((r) => api.listen(0, '127.0.0.1', r));
    const port = api.address().port;
    const r = await runUnblock({ GITHUB_API_BASE: `http://127.0.0.1:${port}`, GITHUB_TOKEN: 't', REPO: 'T/T' }, ['--json']);
    api.close();
    assert.equal(r.status, 0, `caso 1 exit 0 (stderr: ${r.stderr?.slice(0, 300)})`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.api, true);
    assert.equal(out.lastInfraSmoke?.run_number, 9, 'evidência run #9 no relatório');
    const areas = (a) => out.blockers.filter((b) => b.area === a);
    const eosSecrets = areas('eos').filter((b) => b.what.includes('secrets EOS ausentes'));
    assert.equal(eosSecrets.length, 1, 'blocker EOS com os 6 ausentes');
    assert.match(eosSecrets[0].what, /EOS_CLIENT_SECRET/);
    assert.ok(areas('ue58').some((b) => b.what.includes('nenhum runner ONLINE com label ue5.8')));
    const unreal = areas('ue58').find((b) => b.what.includes('UNREAL_ENGINE_LOGIN'));
    assert.ok(unreal, 'blocker do UNREAL_ENGINE_LOGIN presente');
    assert.match(unreal.what, /run #9/, 'evidência do run #9 citada no blocker');
    assert.ok(out.ready.some((x) => x.what.includes('UE5_INSTALL_DIR presente')), 'UE5_INSTALL_DIR → ready');
    assert.ok(!out.ready.some((x) => x.what.includes('UE_CONTAINER_PAT presente')), 'sem UE_CONTAINER_PAT não há ready do PAT');
    console.log('  ✓ caso 1 — estado real (run #9): blockers + evidência + UE5_INSTALL_DIR');
  }

  // ── Caso 2: tudo pronto ───────────────────────────────────────────────────
  {
    cases += 1;
    const api = mockGitHub({
      variables: vrs(['UE58_ENABLED', 'UE5_ROOT']),
      secrets: secs(['UE_CONTAINER_PAT', 'UE5_INSTALL_DIR', ...EOS_ALL]),
      runners: [RUNNER_UE58],
      smokeRun: RUN9,
    });
    await new Promise((r) => api.listen(0, '127.0.0.1', r));
    const port = api.address().port;
    const r = await runUnblock({ GITHUB_API_BASE: `http://127.0.0.1:${port}`, GITHUB_TOKEN: 't', REPO: 'T/T' }, ['--json']);
    api.close();
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.ok(out.ready.some((x) => x.area === 'eos'), 'EOS ready');
    assert.ok(out.ready.some((x) => x.what.includes('UE_CONTAINER_PAT presente')));
    assert.ok(out.ready.some((x) => x.what.includes('label ue5.8')));
    assert.ok(!out.blockers.some((b) => b.area === 'eos' && b.what.includes('secrets EOS ausentes')), 'nenhum blocker de secrets EOS');
    assert.ok(!out.blockers.some((b) => b.what.includes('UNREAL_ENGINE_LOGIN')), 'UE_CONTAINER_PAT presente → sem blocker do UNREAL');
    assert.match(out.summary, /bloqueio\(s\)|TUDO PRONTO/);
    console.log('  ✓ caso 2 — tudo pronto: EOS_* + UE_CONTAINER_PAT + runner ue5.8 zeram blockers');
  }

  // ── Caso 3: sem GITHUB_TOKEN ──────────────────────────────────────────────
  {
    cases += 1;
    const api = mockGitHub({});
    await new Promise((r) => api.listen(0, '127.0.0.1', r));
    const port = api.address().port;
    const r = await runUnblock({ GITHUB_API_BASE: `http://127.0.0.1:${port}`, GITHUB_TOKEN: '', GH_TOKEN: '', REPO: 'T/T' }, ['--json']);
    api.close();
    assert.equal(r.status, 0, 'exit 0 SEMPRE (diagnóstico, não gate)');
    const out = JSON.parse(r.stdout);
    assert.equal(out.api, false);
    assert.ok(out.blockers.some((b) => b.area === 'github' && b.what.includes('GITHUB_TOKEN ausente')));
    console.log('  ✓ caso 3 — sem token: api=false + blocker orientando o escopo');
  }

  // ── Caso 4: sonda ghcr — camada 1 DENIED (assinatura do run #9) ───────────
  {
    cases += 1;
    const api = mockGitHub({});
    const ghcr = mockGhcr({ tokenStatus: 403, tokenBody: { errors: [{ code: 'DENIED', message: 'denied' }] } });
    await new Promise((r) => { api.listen(0, '127.0.0.1', () => ghcr.listen(0, '127.0.0.1', r)); });
    const r = await runUnblock({
      GITHUB_API_BASE: `http://127.0.0.1:${api.address().port}`,
      GHCR_API_BASE: `http://127.0.0.1:${ghcr.address().port}`,
      GITHUB_TOKEN: 't', REPO: 'T/T',
      UE_GHCR_VALUE: 'epic-user:ghp_valor_invalido',
    }, ['--json', '--probe-ghcr']);
    api.close(); ghcr.close();
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    const p = out.ghcrProbe;
    assert.ok(p, 'ghcrProbe presente');
    assert.equal(p.format, 'user:token');
    assert.equal(p.user, 'epic-user');
    assert.equal(p.layers.length, 1, 'falha na camada 1 → camada 2 não roda');
    assert.equal(p.layers[0].ok, false);
    assert.match(p.layers[0].detail, /DENIED/);
    assert.match(p.layers[0].detail, /run #9/);
    assert.match(p.verdict, /camada: 1\. autenticação/);
    assert.ok(out.blockers.some((b) => b.what.includes('sonda ghcr: 1. autenticação')));
    console.log('  ✓ caso 4 — sonda camada 1: 403 DENIED reproduz o run #9');
  }

  // ── Caso 5: sonda ghcr — camada 2 falha (EULA/vínculo Epic) ───────────────
  {
    cases += 1;
    const api = mockGitHub({});
    const ghcr = mockGhcr({ tokenStatus: 200, manifestStatus: 403 });
    await new Promise((r) => { api.listen(0, '127.0.0.1', () => ghcr.listen(0, '127.0.0.1', r)); });
    const r = await runUnblock({
      GITHUB_API_BASE: `http://127.0.0.1:${api.address().port}`,
      GHCR_API_BASE: `http://127.0.0.1:${ghcr.address().port}`,
      GITHUB_TOKEN: 't', REPO: 'T/T',
      UE_GHCR_VALUE: 'ghp_token_valido_sem_usuario',
    }, ['--json', '--probe-ghcr']);
    api.close(); ghcr.close();
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    const p = out.ghcrProbe;
    assert.equal(p.layers.length, 2);
    assert.equal(p.layers[0].ok, true, 'camada 1 OK (token endpoint 200)');
    assert.equal(p.layers[1].ok, false);
    assert.match(p.layers[1].detail, /403/);
    assert.match(p.layers[1].detail, /EULA/);
    assert.equal(p.user, 'Nexus-HUB57', 'token sem "user:" → usuário default do org owner');
    console.log('  ✓ caso 5 — sonda camada 2: credencial autentica, falta EULA/vínculo');
  }

  // ── Caso 6: sonda ghcr — 2 camadas OK → PRONTO ────────────────────────────
  {
    cases += 1;
    const api = mockGitHub({});
    const ghcr = mockGhcr({ tokenStatus: 200, manifestStatus: 200 });
    await new Promise((r) => { api.listen(0, '127.0.0.1', () => ghcr.listen(0, '127.0.0.1', r)); });
    const r = await runUnblock({
      GITHUB_API_BASE: `http://127.0.0.1:${api.address().port}`,
      GHCR_API_BASE: `http://127.0.0.1:${ghcr.address().port}`,
      GITHUB_TOKEN: 't', REPO: 'T/T',
      UE_GHCR_VALUE: 'epic-user:ghp_valido',
    }, ['--json', '--probe-ghcr']);
    api.close(); ghcr.close();
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    const p = out.ghcrProbe;
    assert.equal(p.layers.length, 2);
    assert.ok(p.layers.every((l) => l.ok), 'as 2 camadas OK');
    assert.match(p.verdict, /ghcr PRONTO/);
    assert.ok(out.ready.some((x) => x.what.includes('sonda ghcr')));
    assert.ok(!out.blockers.some((b) => b.what.includes('sonda ghcr')));
    console.log('  ✓ caso 6 — sonda 2/2 camadas OK → veredito PRONTO');
  }

  console.log(`\n[ue58_eac_unblock_selftest] ${cases}/6 casos OK — relatório e sonda com contrato estável.`);
}

main().catch((e) => {
  console.error(`[ue58_eac_unblock_selftest] FALHOU: ${e.message}`);
  process.exit(1);
});
