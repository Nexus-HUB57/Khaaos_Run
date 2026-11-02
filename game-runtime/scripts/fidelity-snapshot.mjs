// Khaaos Run — Fase 46 — SNAPSHOT de fidelidade (lib reutilizável do instrumento F44).
// ==============================================================================
// A Fase 44 criou o instrumento executável (fidelity-audit-lib.mjs + CLI
// audit-fidelity.mjs). A Fase 46 o transforma em SERVIÇO: o mesmo pipeline
// (README ao vivo → cânon → buildScene headless de cada mundo → counts reais →
// 53 checks) passa a ser consumível por QUALQUER portão:
//
//   • CLI audit-fidelity.mjs      → artifacts + exit code (CI/verify-all);
//   • ue5-preflight.yml           → portão ANTES do export OBJ (F46): o pipeline
//     UE5.8 CONSUME a geometria do runtime — se os mundos derivarem do README,
//     a deriva é cozida no build da engine;
//   • GET /admin/ue58/fidelity    → o Command Monitor roda a auditoria AO VIVO
//     e mostra o veredito check a check no painel.
//
// Design: módulo IMPORTÁVEL e puro de efeitos colaterais (não escreve artifacts
// — isso é do CLI; não imprime — isso é do chamador). O stub de canvas é
// instalado de forma idempotente (só se não houver document), mesmo padrão do
// CLI e dos testes headless.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const RUNTIME_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(RUNTIME_ROOT, '..');

// --- stub de canvas p/ texturas procedurais headless (mesmo padrão dos testes) ---
const ctx2d = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', font: '',
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
  moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
  bezierCurveTo() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
  fillText() {}, setTransform() {}, drawImage() {},
  measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
  putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}

/**
 * Roda a auditoria completa F44 sobre o repo REAL e devolve o relatório.
 * @param {{ repoRoot?: string, runtimeRoot?: string, readmeText?: string, simSource?: string, docs?: Object<string,string> }} overrides
 *   (injeção p/ testes — default lê o README/sim/matrizes do disco)
 * @returns {Promise<{ ok: boolean, summary: { pass: number, fail: number }, checks: Array, meta: object }>}
 */
export async function runFidelitySnapshot({
  repoRoot = REPO_ROOT,
  runtimeRoot = RUNTIME_ROOT,
  readmeText,
  simSource,
  docs,
} = {}) {
  const t0 = Date.now();
  const { SCENARIOS } = await import('../src/game3d/scenarios.js');
  const { getWorldLayout } = await import('../src/game3d/sim3d.js');
  const { districtDressing } = await import('../src/game3d/districts3d.js');
  const { buildScene, LIGHTING_PROFILES } = await import('../src/game3d/world3d.js');
  const { auditWorlds } = await import('./fidelity-audit-lib.mjs');

  const readme = readmeText ?? readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const sim = simSource ?? readFileSync(path.join(runtimeRoot, 'src/game3d/sim3d.js'), 'utf8');
  const docTexts = docs ?? (() => {
    const out = {};
    for (const [id, rel] of Object.entries({
      f42: 'docs/FASE42_MUNDOS_FIDELIDADE_README.md',
      f43: 'docs/FASE43_DETALHES_MUNDOS.md',
    })) {
      try { out[id] = readFileSync(path.join(repoRoot, rel), 'utf8'); } catch { /* matriz ausente = check fail */ }
    }
    return out;
  })();

  // --- dados reais por mundo: dressing puro + cena construída (grupos nomeados) ---
  const dressingCounts = {};
  const sceneCounts = {};
  for (const [skey, scenario] of Object.entries(SCENARIOS)) {
    const layout = getWorldLayout(`AUDIT-${skey}`, scenario.id);
    dressingCounts[skey] = districtDressing(layout, scenario, { density: 1 }).counts;

    const { scene } = buildScene(4242, scenario.id, null, 'high');
    const named = {};
    // tubarões vivem nos WORLDMARKS (filhos diretos da cena); oilfire vive DENTRO
    // do grupo de dressing (reg.group, que buildScene NÃO adiciona à cena) —
    // dois contêineres, zero dupla contagem (contrato F44).
    scene.traverse((o) => { if (o.name === 'sharkfin') named.sharkfin = (named.sharkfin ?? 0) + 1; });
    const reg = scene.userData.districtDressing;
    if (reg?.group) reg.group.traverse((o) => { if (o.name === 'oilfire') named.oilfire = (named.oilfire ?? 0) + 1; });
    sceneCounts[skey] = named;
  }

  const report = auditWorlds({
    readmeText: readme,
    scenarios: SCENARIOS,
    dressingCounts,
    sceneCounts,
    lightingKeys: Object.keys(LIGHTING_PROFILES),
    simSource: sim,
    docs: docTexts,
  });

  return {
    ...report,
    meta: {
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
      worlds: Object.keys(SCENARIOS),
      dressingCounts,
      sceneCounts,
    },
  };
}
