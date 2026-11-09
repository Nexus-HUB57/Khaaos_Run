#!/usr/bin/env node
// =============================================================================
// Khaaos Run — P0 GATE: auditoria end-to-end das pendências humanas do M4.
// =============================================================================
// Um comando que mede, pela API autenticada do GitHub + arquivos locais, o
// estado exato da ordem de execução de docs/EOS_PORTAL_CHECKLIST.md §0.1:
//
//   [A] Portal Epic/EULA      → probe autenticado GET /repos/EpicGames/UnrealEngine
//                               (404 = vínculo GitHub↔Epic ausente; 200 = ok)
//   [B] 7 secrets EOS_*       → /actions/secrets (a API devolve SÓ NOMES)
//   [S] Secrets de staging    → /environments/staging/secrets (KR_STAGING_*)
//   [R] Runner UE5.8          → /actions/runners (total + labels ue5.8/ue5)
//   [V] Variáveis de CI       → /actions/variables (UE58_ENABLED, UE5_ROOT,
//                               UE5_WORLD_STRESS_COMMAND)
//   [C] Gate anti-placeholder → DefaultEOS.ini sem KHAOS_* (arquivo local)
//   [D] Despacho MP-ZEX       → .github/workflows/mp-zex-staging.yml presente
//
// Nenhum valor de segredo é lível pela API — esta auditoria é segura por
// construção. Uso:
//   GH_TOKEN=github_pat_xxx node scripts/eos/p0_gate.mjs            # tabela
//   GH_TOKEN=... node scripts/eos/p0_gate.mjs --strict              # exit 1 se pendência
//   GH_TOKEN=... node scripts/eos/p0_gate.mjs --json                # relatório JSON
//   GH_TOKEN=... node scripts/eos/p0_gate.mjs --repo OutraOrg/Repo
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const jsonOut = args.includes('--json');
const repoArgIdx = args.indexOf('--repo');
const REPO = repoArgIdx >= 0 ? args[repoArgIdx + 1] : (process.env.GH_REPO ?? 'Nexus-HUB57/Khaaos_Run');

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  console.error('p0_gate: GH_TOKEN/GITHUB_TOKEN ausente (fine-grained: Contents R, Actions R, Administration R é suficiente para ler).');
  process.exit(2);
}
const api = async (url) => {
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15_000),
  });
  let data = null;
  try { data = await res.json(); } catch { /* corpo vazio */ }
  return { status: res.status, data };
};

const EOS_SECRET_NAMES = [
  'EOS_PRODUCT_ID', 'EOS_SANDBOX_ID', 'EOS_DEPLOYMENT_ID', 'EOS_CLIENT_ID',
  'EOS_CLIENT_SECRET', 'EOS_ENCRYPTION_KEY', 'EOS_REGION',
];
const STAGING_SECRET_NAMES = [
  'KR_STAGING_BASE_URL',
  'KR_STAGING_TEST_USER_A', 'KR_STAGING_TEST_PASSWORD_A',
  'KR_STAGING_TEST_USER_B', 'KR_STAGING_TEST_PASSWORD_B',
];
const VARIABLE_NAMES = ['UE58_ENABLED', 'UE5_ROOT', 'UE5_WORLD_STRESS_COMMAND'];
const RUNNER_LABELS_REQUIRED = ['self-hosted', 'linux', 'x64', 'ue5.8', 'ue5'];

const check = (id, title, ok, detail) => ({ id, title, ok, detail });

const report = { repo: REPO, generated_at: new Date().toISOString(), checks: [] };

// [A] EULA / vínculo GitHub↔Epic
{
  const { status } = await api('https://api.github.com/repos/EpicGames/UnrealEngine');
  const bound = status === 200;
  report.checks.push(check('A', 'Portal Epic — vínculo GitHub↔Epic (EULA)', bound,
    bound ? 'GET /repos/EpicGames/UnrealEngine → 200 (vínculo ativo)' : `GET /repos/EpicGames/UnrealEngine → ${status} (404 = vínculo ausente; Fase A1 do checklist)`));
}

// [B] 7 secrets EOS_*
{
  const { status, data } = await api(`https://api.github.com/repos/${REPO}/actions/secrets?per_page=100`);
  const names = (status === 200 && Array.isArray(data?.secrets)) ? data.secrets.map((s) => s.name) : [];
  const missing = EOS_SECRET_NAMES.filter((n) => !names.includes(n));
  report.checks.push(check('B', 'Fase B — 7 secrets EOS_*', status === 200 && missing.length === 0,
    missing.length ? `ausentes: ${missing.join(', ')}` : 'os 7 presentes (nomes apenas)'));
}

// [S] Secrets do environment staging
{
  const { status, data } = await api(`https://api.github.com/repos/${REPO}/environments/staging/secrets?per_page=100`);
  const names = (status === 200 && Array.isArray(data?.secrets)) ? data.secrets.map((s) => s.name) : [];
  const missing = STAGING_SECRET_NAMES.filter((n) => !names.includes(n));
  report.checks.push(check('S', 'Secrets de staging (KR_STAGING_* no environment "staging")', status === 200 && missing.length === 0,
    status !== 200 ? `environment "staging" não legível (HTTP ${status})` : (missing.length ? `ausentes: ${missing.join(', ')}` : 'os 5 presentes')));
}

// [R] Runner UE5.8
{
  const { status, data } = await api(`https://api.github.com/repos/${REPO}/actions/runners?per_page=100`);
  const runners = (status === 200 && Array.isArray(data?.runners)) ? data.runners : [];
  const total = data?.total_count ?? runners.length;
  const ue58 = runners.find((r) => {
    const labels = (r.labels ?? []).map((l) => l.name);
    return RUNNER_LABELS_REQUIRED.every((l) => labels.includes(l));
  });
  report.checks.push(check('R', 'Runner UE5.8 self-hosted (labels completos)', !!ue58,
    ue58 ? `runner "${ue58.name}" online=${ue58.status} com labels ${RUNNER_LABELS_REQUIRED.join(',')}` : `total_count=${total}; nenhum com labels ${RUNNER_LABELS_REQUIRED.join(',')}`));
}

// [V] Variáveis de CI
{
  const { status, data } = await api(`https://api.github.com/repos/${REPO}/actions/variables?per_page=100`);
  const names = (status === 200 && Array.isArray(data?.variables)) ? data.variables.map((v) => v.name) : [];
  const missing = VARIABLE_NAMES.filter((n) => !names.includes(n));
  report.checks.push(check('V', 'Variáveis de CI (UE58_ENABLED, UE5_ROOT, UE5_WORLD_STRESS_COMMAND)', status === 200 && missing.length === 0,
    missing.length ? `ausentes: ${missing.join(', ')}` : 'as 3 presentes'));
}

// [C] Gate anti-placeholder (local)
{
  const iniPath = path.join(repoRoot, 'Unreal', 'KhaaosRun', 'Config', 'DefaultEOS.ini');
  let ok = false; let detail;
  if (!fs.existsSync(iniPath)) {
    detail = 'DefaultEOS.ini não encontrado no checkout local';
  } else {
    const ini = fs.readFileSync(iniPath, 'utf8');
    const placeholders = [...ini.matchAll(/^\s*(?:Product|Sandbox|Deployment|Client)(?:Id|Secret)\s*=\s*(KHAOS_[A-Z_]+)/gim)].map((m) => m[1]);
    ok = placeholders.length === 0;
    detail = ok ? 'sem placeholders KHAOS_* no ini' : `placeholders ainda presentes: ${[...new Set(placeholders)].join(', ')}`;
  }
  report.checks.push(check('C', 'Fase C — gate anti-placeholder (DefaultEOS.ini)', ok, detail));
}

// [D] Despacho único MP-ZEX presente
{
  const wfPath = path.join(repoRoot, '.github', 'workflows', 'mp-zex-staging.yml');
  const ok = fs.existsSync(wfPath);
  report.checks.push(check('D', 'Despacho único MP-ZEX 08+09 em staging', ok,
    ok ? '.github/workflows/mp-zex-staging.yml presente' : 'workflow ausente'));
}

report.pending = report.checks.filter((c) => !c.ok).length;

if (jsonOut) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`P0 GATE — ${REPO} — ${report.generated_at}`);
  console.log('='.repeat(72));
  for (const c of report.checks) {
    console.log(`${c.ok ? '✔' : '✘'} [${c.id}] ${c.title}`);
    if (c.detail) console.log(`    ${c.detail}`);
  }
  console.log('='.repeat(72));
  console.log(report.pending === 0 ? 'P0_GATE_OK — nenhuma pendência humana' : `PENDÊNCIAS: ${report.pending} (execute os scripts de setup correspondentes)`);
}
process.exit(report.pending === 0 || !strict ? 0 : 1);
