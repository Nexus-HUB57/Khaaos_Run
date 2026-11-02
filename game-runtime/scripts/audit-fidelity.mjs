#!/usr/bin/env node
// Khaaos Run — Fase 44 — CLI da AUDITORIA EXECUTÁVEL de fidelidade Mundos ↔ README.
// (Fase 46: o pipeline virou lib — scripts/fidelity-snapshot.mjs — reusada pelo
//  portão do ue5-preflight e pelo painel /admin/ue58/fidelity. Este CLI é o
//  wrapper fino: roda o snapshot, ESCREVE os artifacts e sai com code 1.)
//
// Uso: npm run audit:fidelity  (dentro de game-runtime/)
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { renderReport } from './fidelity-audit-lib.mjs';
import { RUNTIME_ROOT, runFidelitySnapshot } from './fidelity-snapshot.mjs';

const report = await runFidelitySnapshot();

const outDir = path.join(RUNTIME_ROOT, 'artifacts');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'audit-fidelity.json'), JSON.stringify(report, null, 2));
writeFileSync(path.join(outDir, 'audit-fidelity.md'), renderReport(report));

console.log('\n═══ AUDITORIA DE FIDELIDADE — Mundos ↔ README (F44) ═══');
for (const c of report.checks) {
  const mark = c.status === 'pass' ? '✅' : '❌';
  console.log(`${mark} [${c.id}] ${c.world.padEnd(22)} ${c.name} — ${c.detail}`);
}
console.log(`\nVeredito: ${report.ok ? 'FIEL ✅' : 'DISCREPÂNCIAS ❌'} (${report.summary.pass} OK / ${report.summary.fail} falhas) — snapshot em ${report.meta.durationMs} ms`);
console.log(`Relatórios: game-runtime/artifacts/audit-fidelity.{json,md}\n`);
process.exitCode = report.ok ? 0 : 1;
