// Khaaos Run — Fase 39 — DESBLOQUEIO UE5.8/EAC pelo /admin (Command Monitor).
// ==============================================================================
// A Fase 28 deu o DIAGNÓSTICO (scripts/build/ue58_eac_unblock.mjs — relatório
// único de bloqueios). A Fase 39 fecha o circuito de AÇÃO: o /admin passa a
// executar, com as credenciais já presentes no secrets do repo, tudo que é
// automatizável dos 5 bloqueadores humanos do UE5.8/EAC:
//
//   1. VARIÁVEIS (UE58_ENABLED/UE5_ROOT) — status lido via API (já ✓ no repo);
//   2. RUNNER self-hosted (label ue5.8) — gera registration-token via API e
//      devolve o comando pronto do bootstrap (a execução no host licenciado
//      continua humana — o token morre em 1 h);
//   3. SECRETS EOS_* / UE_CONTAINER_PAT / UNREAL_ENGINE_LOGIN — o /admin grava
//      direto na API do GitHub (libsodium sealed box, formato oficial de
//      crypto_box_seal) — sem gh CLI local, sem copiar valores em terminal;
//   4. CREDENCIAL ghcr — presença via API + smoke do ue-infra-smoke disparável
//      por workflow_dispatch (o smoke valida autenticação ghcr de verdade);
//   5. EAC SDK — probe local (repo/EACSDK) + instruções exatas (download
//      humana no dev portal — SDK não redistribuível).
//
// SEGURANÇA (contrato inegociável, mesma escola da Fase 28):
//   • NUNCA lê nem ecoa VALOR de secret — só presença (names) e status;
//   • escrita de secrets com WHITELIST fechada (6 EOS + 2 de container/PAT);
//   • token GitHub do servidor vem de env (GH_UNBLOCK_TOKEN > GITHUB_TOKEN >
//     GH_TOKEN) ou DI explícita — ausente = painel mostra estado local só;
//   • toda ação passa pelo guardHttp('admin:metrics') + audit.record.
import fs from 'node:fs';
import path from 'node:path';
import nacl from 'tweetnacl';
import { blake2b } from 'blakejs';

/** Whitespace fechado de secrets graváveis pelo /admin (Fase 39). */
export const UE58_SECRET_NAMES = Object.freeze([
  'EOS_PRODUCT_ID', 'EOS_SANDBOX_ID', 'EOS_DEPLOYMENT_ID',
  'EOS_CLIENT_ID', 'EOS_CLIENT_SECRET', 'EOS_ENCRYPTION_KEY',
  'UE_CONTAINER_PAT', 'UNREAL_ENGINE_LOGIN',
]);

/** Secrets EOS obrigatórios p/ o /eos/status sair de 'unconfigured' (Fase B). */
export const EOS_REQUIRED = Object.freeze([
  'EOS_PRODUCT_ID', 'EOS_SANDBOX_ID', 'EOS_DEPLOYMENT_ID',
  'EOS_CLIENT_ID', 'EOS_CLIENT_SECRET', 'EOS_ENCRYPTION_KEY',
]);

const GH_API = 'https://api.github.com';

const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'khaaos-admin-unblock',
  'Content-Type': 'application/json',
});

/**
 * crypto_box_seal (libsodium sealed box) — formato EXIGIDO pela API de secrets
 * do GitHub: header de 48 bytes = pk efêmera (32) + nonce (24), nonce =
 * BLAKE2b-24(epk || recipientPk); payload = crypto_box(msg, nonce, epk, esk).
 * Testável ponta a ponta: o teste descriptografa com a chave receptora local.
 */
export function sealedBoxEncrypt(value, publicKeyB64) {
  const recipientPk = Buffer.from(publicKeyB64, 'base64');
  if (recipientPk.length !== nacl.box.publicKeyLength) {
    throw new Error(`chave pública do repo inválida (${recipientPk.length} bytes)`);
  }
  const eph = nacl.box.keyPair();
  const nonce = blake2b(Buffer.concat([Buffer.from(eph.publicKey), recipientPk]), null, 24);
  const boxed = nacl.box(Buffer.from(value, 'utf8'), nonce, recipientPk, eph.secretKey);
  return Buffer.concat([Buffer.from(eph.publicKey), Buffer.from(boxed)]).toString('base64');
}

/**
 * Status dos 5 bloqueadores — MESMA semântica do relatório da Fase 28
 * (ready[]/blockers[] com correção exata), executável no servidor com
 * fetchImpl injetável (testes) e probe local de filesystem.
 * NUNCA inclui valores de secrets — só nomes/presença.
 */
export async function collectUe58Status({ repo = 'Nexus-HUB57/Khaaos_Run', token = '', fetchImpl = globalThis.fetch, rootDir = process.cwd() } = {}) {
  const out = { repo, now: Date.now(), api: false, ready: [], blockers: [] };
  const ready = (area, what) => out.ready.push({ area, what });
  const blocker = (area, what, how) => out.blockers.push({ area, what, how });

  const ueRoot = path.join(rootDir, 'Unreal', 'KhaaosRun');

  // ── 3. EAC SDK (probe local — mesmas fontes do setup_eac_sdk.sh) ──────────
  const eacLocal = path.join(ueRoot, 'Source', 'KhaaosEAC', 'EACSDK');
  if (fs.existsSync(path.join(eacLocal, 'Sdk', 'anticheat', 'sdkdefines.h'))) {
    ready('eac', `EAC SDK real no repo (${path.relative(rootDir, eacLocal)})`);
  } else if (process.env.KHAAOS_EAC_SDK_DIR && fs.existsSync(path.join(process.env.KHAAOS_EAC_SDK_DIR, 'Sdk', 'anticheat', 'sdkdefines.h'))) {
    ready('eac', `EAC SDK real em KHAAOS_EAC_SDK_DIR (${process.env.KHAAOS_EAC_SDK_DIR})`);
  } else {
    blocker('eac', 'EAC SDK ausente — build segue em modo stub (KHAAOS_EAC_SDK=0): anticheat NÃO ativo',
      'download no dev portal da Epic (ação humana, SDK não redistribuível) → extrair em Unreal/KhaaosRun/Source/KhaaosEAC/EACSDK/ (layout Sdk/anticheat/sdkdefines.h) ou apontar KHAAOS_EAC_SDK_DIR');
  }

  // ── 4. DefaultEOS.ini sem placeholders ────────────────────────────────────
  const iniPath = path.join(ueRoot, 'Config', 'DefaultEOS.ini');
  if (!fs.existsSync(iniPath)) {
    blocker('eos', 'DefaultEOS.ini ausente', 'verifique Unreal/KhaaosRun/Config/');
  } else if (/KHAOS_[A-Z_]+/.test(fs.readFileSync(iniPath, 'utf8'))) {
    blocker('eos', 'DefaultEOS.ini ainda tem placeholders KHAOS_* — o gate anti-placeholder bloqueia artefato',
      'grave os secrets EOS_* pelo /admin (ação "GRAVAR SECRETS EOS") — inject_eos_credentials.sh injeta em build-time');
  } else {
    ready('eos', 'DefaultEOS.ini sem placeholders (injeção em build-time)');
  }

  // ── 1/2/4. API: variáveis, secrets (presença), runners, último smoke ─────
  if (!token) {
    blocker('github', 'token GitHub indisponível no servidor (env GH_UNBLOCK_TOKEN/GITHUB_TOKEN) — status de secrets/variáveis/runners não verificado',
      'configure GH_UNBLOCK_TOKEN no deploy do game node (PAT com admin de Actions) ou informe o token pelo painel (sessão)');
    out.summary = `${out.blockers.length} bloqueio(s) — API do GitHub NÃO verificada (sem token)`;
    return out;
  }

  const fx = fetchImpl;
  try {
    const [varsR, secretsR, runnersR, smokeR] = await Promise.all([
      fx(`${GH_API}/repos/${repo}/actions/variables`, { headers: ghHeaders(token) }),
      fx(`${GH_API}/repos/${repo}/actions/secrets`, { headers: ghHeaders(token) }),
      fx(`${GH_API}/repos/${repo}/actions/runners?per_page=100`, { headers: ghHeaders(token) }),
      fx(`${GH_API}/repos/${repo}/actions/workflows/ue-infra-smoke.yml/runs?per_page=1`, { headers: ghHeaders(token) }),
    ]);
    if (!varsR.ok || !secretsR.ok || !runnersR.ok) {
      blocker('github', `API respondeu ${varsR.status}/${secretsR.status}/${runnersR.status} — PAT sem escopo suficiente`,
        'PAT precisa ler/escrever admin de Actions (classic: repo; fine-grained: Administration read/write)');
      out.summary = `${out.blockers.length} bloqueio(s) — PAT rejeitado pela API`;
      return out;
    }
    out.api = true;
    const varNames = new Set(((await varsR.json())?.variables ?? []).map((v) => v.name));
    const secretNames = new Set(((await secretsR.json())?.secrets ?? []).map((s) => s.name));
    out.secretNames = [...secretNames]; // presença apenas — a API nunca devolve valor

    // 1. Variáveis do build UE5.8
    if (varNames.has('UE58_ENABLED') && varNames.has('UE5_ROOT')) {
      ready('ue58', 'variáveis UE58_ENABLED + UE5_ROOT presentes');
    } else {
      blocker('ue58', 'variáveis UE58_ENABLED/UE5_ROOT ausentes — job "Build and cook UE5.8 package" fica skipped',
        'gh variable set UE58_ENABLED --body true · gh variable set UE5_ROOT --body /opt/UnrealEngine');
    }

    // 2. Runner self-hosted com label ue5.8
    const runnersData = await runnersR.json();
    const online = (runnersData?.runners ?? []).filter((r) => r.status === 'online');
    const labels = new Set(online.flatMap((r) => (r.labels ?? []).map((l) => l.name)));
    if (labels.has('ue5.8')) {
      ready('ue58', `runner self-hosted online com label ue5.8 (${online.length} online)`);
    } else {
      blocker('runner', `nenhum runner ONLINE com label ue5.8 (${runnersData?.total_count ?? 0} registrados) — build real não executa`,
        'gere o registration-token pelo /admin (ação "GERAR RUNNER TOKEN") e rode bootstrap_ue58_runner.sh no host licenciado');
    }

    // 3. Secrets EOS — presença
    const eosMissing = EOS_REQUIRED.filter((s) => !secretNames.has(s));
    if (eosMissing.length === 0) {
      ready('eos', `secrets EOS_* presentes (${EOS_REQUIRED.length})`);
    } else {
      blocker('eos', `secrets EOS ausentes: ${eosMissing.join(', ')} — /eos/status fica 'unconfigured'`,
        'grave pelo /admin (formulário EOS do painel de desbloqueio — valores vão encrypted via sealed box, nunca em log)');
    }

    // 4. Credencial de container (ghcr)
    if (secretNames.has('UE_CONTAINER_PAT')) {
      ready('ue58', 'secret UE_CONTAINER_PAT presente (imagem oficial de contêiner Epic)');
    } else if (secretNames.has('UNREAL_ENGINE_LOGIN')) {
      blocker('ue58', 'só UNREAL_ENGINE_LOGIN presente (fallback aceito) — valide com o smoke; o último run registrou ghcr "denied" se o valor NÃO autentica',
        'dispare o ue-infra-smoke pelo /admin (ação "DISPARAR SMOKE") — denied = trocar o valor por "user:token" de conta Epic-vinculada (read:packages) ou preferir UE_CONTAINER_PAT');
    } else {
      blocker('ue58', 'secret UE_CONTAINER_PAT ausente — workflow ue58-container-build.yml não autentica no repositório privado da Epic',
        'grave pelo /admin (campo UE_CONTAINER_PAT do formulário) — PAT de conta vinculada à EpicGames com EULA aceito');
    }

    // 4b. Último smoke de infra (validação REAL da credencial ghcr)
    if (smokeR.ok) {
      const last = ((await smokeR.json())?.workflow_runs ?? [])[0];
      out.lastSmoke = last
        ? { id: last.id, status: last.status, conclusion: last.conclusion, at: last.created_at, url: last.html_url }
        : null;
      if (last?.conclusion === 'failure') {
        blocker('ue58', `último ue-infra-smoke FALHOU (${last.created_at}) — revise credencial ghcr/runner`,
          'abrir o run no GitHub Actions e corrigir o passo vermelho; revalidar com "DISPARAR SMOKE"');
      }
    }

    // 5. EAC SDK já probeado localmente acima
    out.summary = out.blockers.length === 0
      ? 'TUDO PRONTO: nenhum bloqueio automatizável restante — UE5.8/EAC podem rodar reais.'
      : `${out.blockers.length} bloqueio(s) restante(s) (ações humanas assinaladas).`;
    return out;
  } catch (e) {
    blocker('github', `falha de rede na API: ${e?.message ?? e}`, 'verificar conectividade e reabrir o painel');
    out.summary = `${out.blockers.length} bloqueio(s) — API inacessível`;
    return out;
  }
}

/**
 * Grava secrets do repo via API (valores NUNCA trafegam em claro para o
 * GitHub — sealed box oficial). Payload hostil nunca grava: whitelist
 * fechada, valores string não-vazios, teto de 10 por chamada.
 * @returns {{ set: string[], failed: { name: string, error: string }[] }}
 */
export async function setRepoSecrets({ repo = 'Nexus-HUB57/Khaaos_Run', token = '', secrets = {}, fetchImpl = globalThis.fetch } = {}) {
  const set = [];
  const failed = [];
  const entries = Object.entries(secrets ?? {}).filter(([k, v]) => v != null && v !== '');
  if (!token) throw new Error('sem token GitHub (env GH_UNBLOCK_TOKEN/GITHUB_TOKEN)');
  if (entries.length === 0) throw new Error('nenhum secret informado');
  if (entries.length > 10) throw new Error('teto de 10 secrets por chamada');

  const fx = fetchImpl;
  const pkR = await fx(`${GH_API}/repos/${repo}/actions/secrets/public-key`, { headers: ghHeaders(token) });
  if (!pkR.ok) throw new Error(`chave pública do repo indisponível (HTTP ${pkR.status} — PAT precisa admin de Actions)`);
  const { key_id: keyId, key: publicKeyB64 } = await pkR.json();

  for (const [name, value] of entries) {
    if (!UE58_SECRET_NAMES.includes(name)) { failed.push({ name, error: 'fora da whitelist (só EOS_*/UE_CONTAINER_PAT/UNREAL_ENGINE_LOGIN)' }); continue; }
    if (typeof value !== 'string') { failed.push({ name, error: 'valor deve ser string' }); continue; }
    try {
      const r = await fx(`${GH_API}/repos/${repo}/actions/secrets/${name}`, {
        method: 'PUT',
        headers: ghHeaders(token),
        body: JSON.stringify({ encrypted_value: sealedBoxEncrypt(value, publicKeyB64), key_id: keyId }),
      });
      if (r.ok || r.status === 201 || r.status === 204) set.push(name);
      else failed.push({ name, error: `HTTP ${r.status}` });
    } catch (e) {
      failed.push({ name, error: String(e?.message ?? e) });
    }
  }
  return { set, failed }; // valores NUNCA entram na resposta
}

/** Registration-token de runner (morre em 1 h) + comando pronto do bootstrap. */
export async function createRunnerRegistrationToken({ repo = 'Nexus-HUB57/Khaaos_Run', token = '', fetchImpl = globalThis.fetch } = {}) {
  if (!token) throw new Error('sem token GitHub (env GH_UNBLOCK_TOKEN/GITHUB_TOKEN)');
  const r = await fetchImpl(`${GH_API}/repos/${repo}/actions/runners/registration-token`, {
    method: 'POST', headers: ghHeaders(token), body: '{}',
  });
  if (!r.ok) throw new Error(`registration-token indisponível (HTTP ${r.status})`);
  const { token: regToken, expires_at: expiresAt } = await r.json();
  return {
    token: regToken,
    expiresAt,
    // comando pronto: o host licenciado consome UE5_GITHUB_TOKEN (clone da
    // engine) + RUNNER_TOKEN (registro) — a execução segue humana no host.
    command: `sudo UE5_GITHUB_TOKEN=<PAT-Epic-vinculada> RUNNER_TOKEN=${regToken} RUNNER_URL=https://github.com/${repo} bash scripts/build/bootstrap_ue58_runner.sh --all`,
  };
}

/** Dispara o ue-infra-smoke (workflow_dispatch) e devolve o último run. */
export async function triggerInfraSmoke({ repo = 'Nexus-HUB57/Khaaos_Run', token = '', ref = 'main', fetchImpl = globalThis.fetch } = {}) {
  if (!token) throw new Error('sem token GitHub (env GH_UNBLOCK_TOKEN/GITHUB_TOKEN)');
  const fx = fetchImpl;
  const r = await fx(`${GH_API}/repos/${repo}/actions/workflows/ue-infra-smoke.yml/dispatches`, {
    method: 'POST', headers: ghHeaders(token), body: JSON.stringify({ ref }),
  });
  if (r.status !== 204) throw new Error(`dispatch recusado (HTTP ${r.status})`);
  // o run recém-agendado pode demorar a aparecer — lê o último conhecido
  const runsR = await fx(`${GH_API}/repos/${repo}/actions/workflows/ue-infra-smoke.yml/runs?per_page=1`, { headers: ghHeaders(token) });
  const last = runsR.ok ? ((await runsR.json())?.workflow_runs ?? [])[0] ?? null : null;
  return {
    dispatched: true,
    lastRun: last ? { id: last.id, status: last.status, conclusion: last.conclusion, at: last.created_at, url: last.html_url } : null,
  };
}
