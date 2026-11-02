#!/usr/bin/env node
// Khaaos Run — Fase 44 — CLI da AUDITORIA EXECUTÁVEL de fidelidade Mundos ↔ README.
//
// Uso: npm run audit:fidelity  (dentro de game-runtime/)
//
// 1. Lê o README AO VIVO da raiz do repo (fonte única da verdade);
// 2. Constrói cada Mundo headless (buildScene — mesmo caminho do jogo) e conta
//    o dressing REAL (districtDressing + grupos nomeados: sharkfin, oilfire…);
// 3. Cruza tudo com SCENARIOS, perfis de luz (F41) e matrizes F42/F43;
// 4. Escreve artifacts/audit-fidelity.{json,md} e sai com code 1 se houver
//    QUALQUER discrepância (CI vermelha até erradicada).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SCENARIOS } from '../src/game3d/scenarios.js';
import { getWorldLayout } from '../src/game3d/sim3d.js';
import { districtDressing } from '../src/game3d/districts3d.js';
import { buildScene, LIGHTING_PROFILES } from '../src/game3d/world3d.js';
import { auditWorlds, renderReport, SCENARIO_KEY } from './fidelity-audit-lib.mjs';

// stub de canvas p/ texturas procedurais headless (mesmo padrão dos testes)
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

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(here, '..');
const repoRoot = path.resolve(runtimeRoot, '..');

const readmeText = readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
const simSource = readFileSync(path.join(runtimeRoot, 'src/game3d/sim3d.js'), 'utf8');
const docs = {};
for (const [id, rel] of Object.entries({
  f42: 'docs/FASE42_MUNDOS_FIDELIDADE_README.md',
  f43: 'docs/FASE43_DETALHES_MUNDOS.md',
})) {
  try { docs[id] = readFileSync(path.join(repoRoot, rel), 'utf8'); } catch { /* matriz ausente = check fail */ }
}

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
  // dois contêineres, zero dupla contagem.
  scene.traverse((o) => { if (o.name === 'sharkfin') named.sharkfin = (named.sharkfin ?? 0) + 1; });
  const reg = scene.userData.districtDressing;
  if (reg?.group) reg.group.traverse((o) => { if (o.name === 'oilfire') named.oilfire = (named.oilfire ?? 0) + 1; });
  sceneCounts[skey] = named;
}

const report = auditWorlds({
  readmeText,
  scenarios: SCENARIOS,
  dressingCounts,
  sceneCounts,
  lightingKeys: Object.keys(LIGHTING_PROFILES),
  simSource,
  docs,
});

const outDir = path.join(runtimeRoot, 'artifacts');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'audit-fidelity.json'), JSON.stringify(report, null, 2));
writeFileSync(path.join(outDir, 'audit-fidelity.md'), renderReport(report));

console.log('\n═══ AUDITORIA DE FIDELIDADE — Mundos ↔ README (F44) ═══');
for (const c of report.checks) {
  const mark = c.status === 'pass' ? '✅' : '❌';
  console.log(`${mark} [${c.id}] ${c.world.padEnd(22)} ${c.name} — ${c.detail}`);
}
console.log(`\nVeredito: ${report.ok ? 'FIEL ✅' : 'DISCREPÂNCIAS ❌'} (${report.summary.pass} OK / ${report.summary.fail} falhas)`);
console.log(`Relatórios: game-runtime/artifacts/audit-fidelity.{json,md}\n`);
process.exitCode = report.ok ? 0 : 1;
