#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const [summaryPath = "coverage/official/coverage-summary.json", thresholdArg = "40"] = process.argv.slice(2);
const threshold = Number(thresholdArg);
if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
  console.error(`[coverage] threshold inválido: ${thresholdArg}`);
  process.exit(2);
}

let summary;
try {
  summary = JSON.parse(await readFile(summaryPath, "utf8"));
} catch (error) {
  console.error(`[coverage] não foi possível ler ${summaryPath}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

const lines = summary.total?.lines?.pct;
const statements = summary.total?.statements?.pct;
if (typeof lines !== "number" || typeof statements !== "number") {
  console.error(`[coverage] summary inválido: total.lines.pct e total.statements.pct são obrigatórios`);
  process.exit(2);
}

const measured = Math.min(lines, statements);
console.log(`[coverage] lines=${lines.toFixed(2)}% statements=${statements.toFixed(2)}% threshold=${threshold.toFixed(2)}%`);
if (measured < threshold) {
  console.error(`[coverage] FAIL: menor métrica global ${measured.toFixed(2)}% abaixo do threshold ${threshold.toFixed(2)}%`);
  process.exit(1);
}
console.log(`[coverage] PASS: cobertura global atende ao threshold`);
