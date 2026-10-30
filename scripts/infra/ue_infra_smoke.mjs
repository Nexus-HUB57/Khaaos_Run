#!/usr/bin/env node
// =============================================================================
// Khaaos Run — UE Infra Smoke (M4/P1): Unreal Cloud DDC + Lore Server
// =============================================================================
// Valida, com honestidade, a stack de infraestrutura UE definida em
// infra/ue-infra/docker-compose.yml:
//   - DDC   http://localhost:8080  → /health/live e /health/ready (probes
//     oficiais extraídas do Helm chart OCI 1.5.0) + API v1 acessível;
//   - Lore  http://localhost:41339 → porta HTTP responde (gRPC/QUIC em 41337).
//
// Comportamento: retries (o .NET do DDC demora a subir) e contrato explícito —
// só imprime UE_INFRA_SMOKE_OK quando o essencial passa; caso contrário
// UE_INFRA_SMOKE_FAILED + exit 1. Sem variáveis opcionais, sem fingir sucesso.
//
// Uso:
//   node scripts/infra/ue_infra_smoke.mjs
//   DDC_BASE=http://ddc:80 LORE_HTTP_URL=http://lore:41339 node scripts/infra/ue_infra_smoke.mjs
// =============================================================================
const DDC_BASE = (process.env.DDC_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
const LORE_HTTP_URL = (process.env.LORE_HTTP_URL || 'http://127.0.0.1:41339').replace(/\/$/, '');
const ATTEMPTS = Number(process.env.SMOKE_ATTEMPTS || 30);
const WAIT_MS = Number(process.env.SMOKE_WAIT_MS || 3000);

function probeFactory(url, { requireOk = false } = {}) {
  return async function probe() {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      // requireOk=true exige 200 (probes de saúde do DDC);
      // senão qualquer resposta HTTP conta (porta viva — 401/404 também provam serviço no ar).
      return { url, status: res.status, up: requireOk ? res.status === 200 : true };
    } catch (err) {
      return { url, status: null, up: false, error: String((err && err.message) || err) };
    } finally {
      clearTimeout(timer);
    }
  };
}

const checks = [
  { name: 'ddc_liveness', probe: probeFactory(`${DDC_BASE}/health/live`, { requireOk: true }), essential: true },
  { name: 'ddc_readiness', probe: probeFactory(`${DDC_BASE}/health/ready`, { requireOk: true }), essential: true },
  { name: 'ddc_api_v1', probe: probeFactory(`${DDC_BASE}/api/v1/refs`), essential: false },
  { name: 'lore_http', probe: probeFactory(`${LORE_HTTP_URL}/`), essential: true },
];

async function waitUntilUp(probe) {
  for (let i = 1; i <= ATTEMPTS; i++) {
    const r = await probe();
    if (r.up) return { ...r, attempts: i };
    await new Promise((res) => setTimeout(res, WAIT_MS));
  }
  return { ...(await probe()), attempts: ATTEMPTS, up: false };
}

const results = {};
for (const c of checks) results[c.name] = await waitUntilUp(c.probe);

let failed = 0;
console.log('┌─ UE Infra Smoke ──────────────────────────────────────────');
for (const c of checks) {
  const r = results[c.name];
  const mark = r.up ? '✅' : (c.essential ? '❌' : '⚠️ ');
  console.log(`${mark} ${c.name.padEnd(14)} ${r.url}`);
  console.log(`               → HTTP ${r.status ?? 'sem resposta'}${r.error ? ` (${r.error})` : ''} [tentativas: ${r.attempts}]`);
  if (!r.up && c.essential) failed++;
}
console.log('└───────────────────────────────────────────────────────────');

if (failed > 0) {
  console.error(`UE_INFRA_SMOKE_FAILED — ${failed} checagem(ns) essencial(is) sem resposta`);
  process.exit(1);
}
console.log('UE_INFRA_SMOKE_OK');
