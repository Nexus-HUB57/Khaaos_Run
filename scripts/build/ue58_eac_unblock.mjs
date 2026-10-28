#!/usr/bin/env node
/**
 * Khaaos Run — Fase 28: relatório ÚNICO de bloqueios UE5.8 + EAC.
 * ================================================================
 * Um comando que responde "o que EXATAMENTE ainda bloqueia o build UE5.8
 * real e o EAC real?" — sem caçar em quatro workflows. Agrega:
 *
 *   1. Variáveis/secrets do repo (UE58_ENABLED, UE5_ROOT, UE_CONTAINER_PAT,
 *      EOS_*) — presença via API (NUNCA valores);
 *   2. Runners self-hosted registrados + labels online (ue5.8/ue5);
 *   3. EAC SDK: resolução nas MESMAS fontes do setup_eac_sdk.sh
 *      (env KHAAOS_EAC_SDK_DIR → repo-local EACSDK/ → EAC_SDK_URL configurada?);
 *   4. DefaultEOS.ini: placeholders KHAOS_* presentes?
 *   5. Preflight do projeto (ue58_preflight.mjs) reusado como módulo.
 *
 * Saída: JSON (--json) ou Markdown humano (default) + exit 0 SEMPRE
 * (diagnóstico, não gate — gates ficam nos workflows). Em CI, o markdown
 * pode ir direto para o $GITHUB_STEP_SUMMARY.
 *
 * Uso:
 *   GITHUB_TOKEN=… node scripts/build/ue58_eac_unblock.mjs
 *   node scripts/build/ue58_eac_unblock.mjs --json
 *   REPO=Nexus-HUB57/Khaaos_Run node scripts/build/ue58_eac_unblock.mjs   # sem API (só local)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const UE_ROOT = path.join(REPO_ROOT, 'Unreal', 'KhaaosRun');
const REPO = process.env.REPO || 'Nexus-HUB57/Khaaos_Run';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const json = process.argv.includes('--json');
const out = { repo: REPO, now: new Date().toISOString(), blockers: [], ready: [], api: false };

const blocker = (area, what, how) => out.blockers.push({ area, what, how });
const ready = (area, what) => out.ready.push({ area, what });

// ── 1/2. API: variáveis, secrets e runners (presença, nunca valor) ──────────
async function gh(pathname) {
  const res = await fetch(`https://api.github.com/repos/${REPO}${pathname}`, {
    headers: TOKEN
      ? { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'khaaos-unblock' }
      : { Accept: 'application/vnd.github+json', 'User-Agent': 'khaaos-unblock' },
  });
  return { ok: res.ok, status: res.status, data: res.ok ? await res.json() : null };
}

async function checkGitHub() {
  if (!TOKEN) {
    blocker('github', 'GITHUB_TOKEN ausente — status de secrets/variáveis/runners não verificado',
      'export GITHUB_TOKEN=<PAT com escopo repo/admin:actions> e rode de novo');
    return;
  }
  try {
    const [vars, secrets, runners] = await Promise.all([
      gh('/actions/variables'), gh('/actions/secrets'), gh('/actions/runners'),
    ]);
    if (!vars.ok || !secrets.ok || !runners.ok) {
      blocker('github', `API respondeu ${vars.status}/${secrets.status}/${runners.status} — PAT sem escopo suficiente`,
        'PAT precisa ler admin de Actions (classic: repo; fine-grained: Administration read)');
      return;
    }
    out.api = true;
    const names = new Set((vars.data?.variables ?? []).map((v) => v.name));
    const secretNames = new Set((secrets.data?.secrets ?? []).map((s) => s.name));

    // Variáveis do build UE5.8 (gate do ue58-release-cd.yml)
    if (names.has('UE58_ENABLED') && names.has('UE5_ROOT')) ready('ue58', 'variáveis UE58_ENABLED + UE5_ROOT presentes');
    else blocker('ue58', 'variáveis UE58_ENABLED/UE5_ROOT ausentes — job "Build and cook UE5.8 package" fica skipped',
      'gh variable set UE58_ENABLED --repo ' + REPO + ' --body true\n  gh variable set UE5_ROOT --repo ' + REPO + ' --body /opt/UnrealEngine');

    // Runner self-hosted com labels exigidos
    const online = (runners.data?.runners ?? []).filter((r) => r.status === 'online');
    const labels = new Set(online.flatMap((r) => (r.labels ?? []).map((l) => l.name)));
    if (labels.has('ue5.8')) ready('ue58', `runner self-hosted online com label ue5.8 (${online.length} online)`);
    else blocker('ue58', 'nenhum runner ONLINE com label ue5.8 — build real não executa',
      'provisione com: sudo UE5_GITHUB_TOKEN=… RUNNER_PAT=… bash scripts/build/bootstrap_ue58_runner.sh --all');

    // Secrets EOS (Fase B do checklist) — presença
    const eosRequired = ['EOS_PRODUCT_ID', 'EOS_SANDBOX_ID', 'EOS_DEPLOYMENT_ID', 'EOS_CLIENT_ID', 'EOS_CLIENT_SECRET', 'EOS_ENCRYPTION_KEY'];
    const eosMissing = eosRequired.filter((s) => !secretNames.has(s));
    if (eosMissing.length === 0) ready('eos', `secrets EOS_* presentes (${eosRequired.length})`);
    else blocker('eos', `secrets EOS ausentes: ${eosMissing.join(', ')} — /eos/status fica 'unconfigured'`,
      'docs/EOS_PORTAL_CHECKLIST.md Fase B (gh secret set …) — valores SOMENTE via Dev Portal + gh secret');

    if (secretNames.has('UE_CONTAINER_PAT')) ready('ue58', 'secret UE_CONTAINER_PAT presente (imagem oficial de contêiner Epic)');
    else blocker('ue58', 'secret UE_CONTAINER_PAT ausente — workflow ue58-container-build.yml não autentica no repositório privado da Epic',
      'gh secret set UE_CONTAINER_PAT --repo ' + REPO + '  # PAT de conta vinculada à EpicGames (EULA aceito)');
  } catch (e) {
    blocker('github', `falha de rede na API: ${e.message}`, 'verificar conectividade e rodar de novo');
  }
}

// ── 3. EAC SDK (mesmas fontes do setup_eac_sdk.sh) ──────────────────────────
function checkEac() {
  const envDir = process.env.KHAAOS_EAC_SDK_DIR || '';
  const localDir = path.join(UE_ROOT, 'Source', 'KhaaosEAC', 'EACSDK');
  const probe = (dir) => fs.existsSync(path.join(dir, 'Sdk', 'anticheat', 'sdkdefines.h'));
  if (envDir && probe(envDir)) { ready('eac', `EAC SDK real em KHAAOS_EAC_SDK_DIR (${envDir})`); return; }
  if (probe(localDir)) { ready('eac', `EAC SDK real no repo (${path.relative(REPO_ROOT, localDir)})`); return; }
  if (envDir || process.env.EAC_SDK_URL) {
    blocker('eac', 'KHAAOS_EAC_SDK_DIR/EAC_SDK_URL configurados mas o pacote não contém o layout oficial (Sdk/anticheat/sdkdefines.h)',
      'reextraia o zip oficial do dev portal — setup_eac_sdk.sh falha rápido de propósito');
    return;
  }
  blocker('eac', 'EAC SDK ausente — build segue em modo stub (KHAAOS_EAC_SDK=0): anticheat NÃO ativo',
    'download no dev portal da Epic (ação humana, SDK não redistribuível) → fonte 1/2/3 de scripts/build/setup_eac_sdk.sh');
}

// ── 4. DefaultEOS.ini sem placeholders ───────────────────────────────────────
function checkEosIni() {
  const ini = path.join(UE_ROOT, 'Config', 'DefaultEOS.ini');
  if (!fs.existsSync(ini)) { blocker('eos', 'DefaultEOS.ini ausente', 'verifique Unreal/KhaaosRun/Config/'); return; }
  const content = fs.readFileSync(ini, 'utf8');
  if (/KHAOS_[A-Z_]+/.test(content)) {
    blocker('eos', 'DefaultEOS.ini ainda tem placeholders KHAOS_* — o gate anti-placeholder bloqueia artefato',
      'Fase C do checklist: inject_eos_credentials.sh injeta em build-time a partir dos secrets');
  } else ready('eos', 'DefaultEOS.ini sem placeholders (injeção em build-time)');
}

// ── 5. Preflight do projeto (erros estruturais) ─────────────────────────────
async function checkPreflight() {
  try {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(process.execPath, [path.join(__dirname, 'ue58_preflight.mjs')], { encoding: 'utf8', timeout: 60_000 });
    if (r.status !== 0) { blocker('ue58', 'ue58_preflight.mjs falhou ao rodar', (r.stderr || r.stdout || '').slice(0, 400)); return; }
    const parsed = JSON.parse(r.stdout);
    const errors = (parsed.findings ?? []).filter((f) => f.severity === 'error');
    const warnings = (parsed.findings ?? []).filter((f) => f.severity === 'warning');
    if (errors.length === 0) ready('ue58', `preflight sem erros (${warnings.length} avisos conhecidos)`);
    for (const e of errors) blocker('ue58', `preflight ${e.code}: ${e.message}`, 'corrija o item apontado antes do build real');
    return { warnings };
  } catch (e) {
    blocker('ue58', `preflight indisponível: ${e.message}`, 'verifique scripts/build/ue58_preflight.mjs');
  }
}

const preflight = await checkPreflight();
checkEac();
checkEosIni();
await checkGitHub();

out.summary = out.blockers.length === 0
  ? 'TUDO PRONTO: nenhum bloqueio automatizável restante — UE5.8/EAC podem rodar reais.'
  : `${out.blockers.length} bloqueio(s) restante(s).`;

if (json) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const md = [];
  md.push(`# UE5.8 + EAC — relatório de bloqueios (${out.now})`);
  md.push('');
  md.push(`**${out.summary}** ${out.api ? '(status do GitHub verificado via API)' : '(API do GitHub NÃO verificada — sem GITHUB_TOKEN)'}`);
  md.push('');
  if (out.ready.length) {
    md.push('## Pronto');
    for (const r of out.ready) md.push(`- ✅ [${r.area}] ${r.what}`);
    md.push('');
  }
  if (out.blockers.length) {
    md.push('## Bloqueios (com correção exata)');
    for (const b of out.blockers) {
      md.push(`- ❌ [${b.area}] ${b.what}`);
      md.push(`  - **Como destravar:** ${b.how}`);
    }
  }
  console.log(md.join('\n'));
}
if (preflight?.warnings?.length && !json) {
  console.log(`\n(preflight: ${preflight.warnings.length} aviso(s) não-bloqueante(s) — veja o JSON com --json)`);
}
process.exit(0);
