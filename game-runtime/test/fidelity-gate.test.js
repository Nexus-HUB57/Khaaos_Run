// Khaaos Run — Fase 46 — PORTÃO DE FIDELIDADE Mundos ↔ README (ue5-preflight + painel).
// ==============================================================================
// A Fase 44 criou o instrumento; a Fase 46 o transforma em barreira em DOIS
// pontos novos, e esta suíte garante que nenhum deles "afrouxa" sozinho:
//   1. lib  — runFidelitySnapshot: o MESMO pipeline do CLI (README ao vivo →
//      buildScene headless dos 5 mundos → 53 checks) importável pelo servidor;
//   2. rota — GET /admin/ue58/fidelity no servidor autoritativo REAL: RBAC,
//      cache TTL (martelo no botão não reconstrói a cena), 502 estruturado,
//      runner injetável (DI p/ testes);
//   3. wire — ue5-preflight.yml: o portão roda ANTES do export OBJ (a geometria
//      derivada do cânon nunca é cozida no build da engine) e os paths de
//      gatilho cobrem README + fontes da geometria — teste anti-drift do YAML;
//   4. CLI  — audit-fidelity.mjs continua wrapper fino do snapshot (artifacts +
//      exit code), sem pipeline duplicado que possa divergir.
// Runner node:test (padrão do repo — lição #128/#132: nunca vitest).
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RUNTIME_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(RUNTIME_ROOT, '..');

const { runFidelitySnapshot } = await import('../scripts/fidelity-snapshot.mjs');
const { renderReport } = await import('../scripts/fidelity-audit-lib.mjs');
const { createAuthoritativeServer } = await import('../server/server.js');
const { AuthService, hashPassword } = await import('../server/auth.js');
const { DurableJsonStore } = await import('../server/store.js');
const { SharedMemoryRateStore } = await import('../server/rateLimit.js');

// ─── 1. runFidelitySnapshot — o pipeline completo sobre o repo REAL ─────────

describe('runFidelitySnapshot (F46 — lib do portão)', () => {
  test('repo REAL: FIEL, ≥50 checks, meta com os 5 mundos e counts de dressing', async () => {
    const report = await runFidelitySnapshot();
    assert.equal(report.ok, true, `esperado FIEL, obtido: ${report.summary.fail} falha(s) — ${report.checks.filter((c) => c.status === 'fail').map((c) => c.id).join(', ')}`);
    assert.equal(report.summary.fail, 0);
    assert.ok(report.summary.pass >= 50, `mínimo de checks canônicos (53 na F44), obtido ${report.summary.pass}`);
    assert.ok(Array.isArray(report.checks) && report.checks.length === report.summary.pass + report.summary.fail);
    // meta operacional p/ o painel
    assert.ok(report.meta.durationMs > 0, 'duração medida');
    assert.ok(report.meta.ranAt, 'timestamp do snapshot');
    assert.equal(report.meta.worlds.length, 5, 'os 5 mundos construídos');
    for (const skey of report.meta.worlds) {
      assert.ok(report.meta.dressingCounts[skey], `dressingCounts.${skey} presente`);
      assert.ok(typeof report.meta.sceneCounts[skey] === 'object', `sceneCounts.${skey} presente`);
    }
    // mínimo Free Fire intacto no snapshot ao vivo (mesmo contrato da B1/B2)
    assert.ok(report.meta.dressingCounts.BARBURHEN.skeleton >= 2, 'W1: skeleton ≥ README "construções inacabadas"');
    assert.ok(report.meta.dressingCounts.CKESALTH.quicksand >= 2, 'W3: quicksand ≥ setor canônico');
    assert.ok((report.meta.sceneCounts.ARUKHEEA.sharkfin ?? 0) >= 2, 'W4: tubarões no mar dos worldmarks');
  });

  test('relatório renderiza com veredito legível (mesmo contrato do renderReport F44)', async () => {
    const report = await runFidelitySnapshot({ readmeText: fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8') });
    const md = renderReport(report);
    assert.match(md, /# Auditoria de Fidelidade — Mundos ↔ README/);
    assert.match(md, /FIEL ✅/);
    assert.ok(md.split('\n').length >= report.checks.length, 'uma linha por check');
  });
});

// ─── 2. Rota /admin/ue58/fidelity — E2E com createAuthoritativeServer ───────

describe('rota /admin/ue58/fidelity (F46 — portão no painel)', () => {
  const boot = async (fidelityRunner) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-fid-route-'));
    const auth = new AuthService({
      secret: 'fid-route-secret',
      users: [{ id: 'a1', username: 'admin', role: 'admin', region: 'sa-east', passwordHash: hashPassword('adminpass', 'salt') }],
    });
    const app = createAuthoritativeServer({
      port: 0, auth,
      store: new DurableJsonStore(path.join(dir, 'state.json')),
      rateStore: new SharedMemoryRateStore(),
      adminToken: 'legacy',
      ue58: { fidelityRunner },
    });
    await new Promise((resolve) => app.server.listen(0, resolve));
    const port = app.server.address().port;
    return { app, port, cleanup: async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
  };

  const stubReport = (fail = 0) => ({
    ok: fail === 0,
    summary: { pass: 53 - fail, fail },
    checks: [{ id: 'S1', world: 'W1 Barburhen', name: 'check stub', status: fail ? 'fail' : 'pass', detail: 'stub' }],
    meta: { ranAt: new Date().toISOString(), durationMs: 42, worlds: ['CIGKV', 'BARBURHEN', 'PRIADUS', 'CKESALTH', 'ARUKHEEA'], dressingCounts: {}, sceneCounts: {} },
  });

  test('200 com runner DI; segunda chamada serve CACHE (runner chamado 1×); token errado → 403', async () => {
    let calls = 0;
    const env = await boot(async () => { calls++; return stubReport(0); });
    try {
      const r1 = await fetch(`http://127.0.0.1:${env.port}/admin/ue58/fidelity?token=legacy`);
      assert.equal(r1.status, 200);
      const d1 = await r1.json();
      assert.equal(d1.ok, true);
      assert.equal(d1.summary.pass, 53);
      assert.equal(d1.cached, false, 'primeira chamada é ao vivo');
      assert.equal(d1.meta.durationMs, 42, 'meta do runner atravessa a resposta');

      const r2 = await fetch(`http://127.0.0.1:${env.port}/admin/ue58/fidelity?token=legacy`);
      assert.equal(r2.status, 200);
      const d2 = await r2.json();
      assert.equal(d2.cached, true, 'segunda chamada DENTRO do TTL é cache');
      assert.ok(d2.cacheAgeMs >= 0);
      assert.equal(calls, 1, 'runner NÃO re-executa dentro do TTL (martelo no botão não reconstrói 5 cenas)');

      const denied = await fetch(`http://127.0.0.1:${env.port}/admin/ue58/fidelity?token=errado`);
      assert.equal(denied.status, 403, 'RBAC: token legacy inválido é recusado');
      assert.equal(calls, 1, '403 não dispara auditoria');
    } finally { await env.cleanup(); }
  });

  test('runner que lança → 502 estruturado (sem crash); falha NÃO popula o cache', async () => {
    let calls = 0;
    const env = await boot(async () => { calls++; throw new Error('cena explodiu'); });
    try {
      const r = await fetch(`http://127.0.0.1:${env.port}/admin/ue58/fidelity?token=legacy`);
      assert.equal(r.status, 502);
      const d = await r.json();
      assert.equal(d.error, 'ue58_fidelity_failed');
      assert.match(d.detail, /cena explodiu/);
      assert.equal(calls, 1);
      // falha não pode envenenar o cache — o próximo chamado re-tenta ao vivo
      const r2 = await fetch(`http://127.0.0.1:${env.port}/admin/ue58/fidelity?token=legacy`);
      assert.equal(r2.status, 502);
      assert.equal(calls, 2, 'segunda chamada re-invoca (falha não é cacheável)');
    } finally { await env.cleanup(); }
  });

  test('deriva REAL (runner devolve fail>0): 200 com ok=false — veredito honesto no painel', async () => {
    const env = await boot(async () => stubReport(2));
    try {
      const r = await fetch(`http://127.0.0.1:${env.port}/admin/ue58/fidelity?token=legacy`);
      assert.equal(r.status, 200, 'deriva não é erro HTTP — é VEREDITO');
      const d = await r.json();
      assert.equal(d.ok, false);
      assert.equal(d.summary.fail, 2);
      assert.equal(d.checks[0].status, 'fail');
    } finally { await env.cleanup(); }
  });
});

// ─── 3. Wire anti-drift — ue5-preflight.yml ─────────────────────────────────

describe('portão no ue5-preflight.yml (F46 — wire)', () => {
  const wf = () => fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/ue5-preflight.yml'), 'utf8');

  test('step do portão EXISTE e roda ANTES do export OBJ (geometria derivada nunca é cozida)', () => {
    const y = wf();
    const gate = y.indexOf('Fidelity gate — Mundos ↔ README (F44/F46)');
    const exportStep = y.indexOf('Fase 1 — Barburhen OBJ + colliders complexos (engine-less)');
    assert.ok(gate >= 0, 'step "Fidelity gate" presente no preflight');
    assert.ok(exportStep >= 0);
    assert.ok(gate < exportStep, 'o portão roda ANTES do export — auditoria falha ⇒ OBJ nunca é gerado de mundo derivado');
    assert.match(y, /npm run audit:fidelity/, 'o step executa o instrumento F44');
    assert.match(y, /npm ci/, 'o step instala as deps do runtime (instrumento importa three/world3d)');
  });

  test('paths de gatilho cobrem README + fontes da geometria, nos DOIS blocos (pull_request e push)', () => {
    const y = wf();
    for (const block of ['pull_request:', 'push:']) {
      const start = y.indexOf(block);
      const jobs = y.indexOf('jobs:', start);
      const section = y.slice(start, jobs);
      for (const trigger of ['README.md', 'game-runtime/scripts/fidelity-audit-lib.mjs', 'game-runtime/scripts/fidelity-snapshot.mjs', 'game-runtime/src/game3d/scenarios.js', 'game-runtime/src/game3d/world3d.js', 'game-runtime/src/game3d/districts3d.js']) {
        assert.ok(section.includes(`- '${trigger}'`), `${block} precisa do gatilho ${trigger}`);
      }
    }
  });

  test('Summary do workflow tem a linha do veredito de fidelidade', () => {
    const y = wf();
    assert.match(y, /Fidelidade Mundos ↔ README \(F44\)/, 'linha do Summary');
    assert.match(y, /FIEL|DERIVA/, 'veredito legível (FIEL/DERIVA)');
  });
});

// ─── 4. CLI — wrapper fino (sem pipeline duplicado) ─────────────────────────

describe('CLI audit-fidelity.mjs (F46 — wrapper fino)', () => {
  test('importa runFidelitySnapshot do módulo compartilhado — pipeline ÚNICO', async () => {
    const cli = fs.readFileSync(path.join(RUNTIME_ROOT, 'scripts/audit-fidelity.mjs'), 'utf8');
    assert.match(cli, /from '\.\/fidelity-snapshot\.mjs'/, 'CLI consome a lib do portão');
    assert.match(cli, /runFidelitySnapshot\(\)/, 'CLI roda o snapshot compartilhado');
    assert.match(cli, /audit-fidelity\.json/, 'CLI escreve o artifact JSON');
    assert.match(cli, /process\.exitCode = report\.ok \? 0 : 1/, 'CLI sai com code 1 em deriva (contrato CI)');
    // e a lib NÃO importa o CLI (sem ciclo) — checa IMPORTS reais, não menções em comentário
    const lib = fs.readFileSync(path.join(RUNTIME_ROOT, 'scripts/fidelity-snapshot.mjs'), 'utf8');
    const importLines = lib.split('\n').filter((l) => /^\s*(import|export\s+([^;]*?from\s+)?)['"]/.test(l) || /import\(/.test(l));
    assert.equal(importLines.filter((l) => l.includes('audit-fidelity')).length, 0, 'lib não depende do CLI (sem ciclo de import)');
  });
});
