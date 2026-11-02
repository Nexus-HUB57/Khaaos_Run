// Khaaos Run — Fase 44 — AUDITORIA DA AUDITORIA (auto-verificação do instrumento).
//
// A auditoria de fidelidade (scripts/fidelity-audit-lib.mjs) lê o README AO
// VIVO e cruza com o runtime. Um instrumento desses só tem valor se PEGA a
// deriva — este arquivo prova isso duas vezes:
//   1. o repo REAL passa 100% (contrato de fidelidade corrente);
//   2. cada classe de deriva (setor renomeado, dinâmica vazada, typo
//      regressivo, anel deslocado, dressing abaixo do mínimo, luz sem
//      identidade, README evoluindo sozinho) faz o check ESPECÍFICO falhar.
// Se alguém "afrouxar" a auditoria, um desses testes quebra.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SCENARIOS } from '../src/game3d/scenarios.js';
import { getWorldLayout } from '../src/game3d/sim3d.js';
import { districtDressing } from '../src/game3d/districts3d.js';
import { buildScene, LIGHTING_PROFILES } from '../src/game3d/world3d.js';
import { auditWorlds, renderReport } from '../scripts/fidelity-audit-lib.mjs';

// stub de canvas p/ texturas procedurais headless (mesmo padrão dos testes F43)
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
const docs = {
  f42: readFileSync(path.join(repoRoot, 'docs/FASE42_MUNDOS_FIDELIDADE_README.md'), 'utf8'),
  f43: readFileSync(path.join(repoRoot, 'docs/FASE43_DETALHES_MUNDOS.md'), 'utf8'),
};
const LIGHTING_KEYS = Object.keys(LIGHTING_PROFILES);

// dados reais computados UMA vez (dressing puro + cena construída por mundo)
const dressingCounts = {};
const sceneCounts = {};
for (const [skey, scenario] of Object.entries(SCENARIOS)) {
  const layout = getWorldLayout(`F44-AUDIT-${skey}`, scenario.id);
  dressingCounts[skey] = districtDressing(layout, scenario, { density: 1 }).counts;
  const { scene } = buildScene(4242, scenario.id, null, 'high');
  const named = {};
  scene.traverse((o) => { if (o.name === 'sharkfin') named.sharkfin = (named.sharkfin ?? 0) + 1; });
  scene.userData.districtDressing?.group?.traverse?.((o) => {
    if (o.name === 'oilfire') named.oilfire = (named.oilfire ?? 0) + 1;
  });
  sceneCounts[skey] = named;
}

const BASE = { readmeText, scenarios: SCENARIOS, dressingCounts, sceneCounts, lightingKeys: LIGHTING_KEYS, simSource, docs };
const audit = (over = {}) => auditWorlds({ ...BASE, ...over });
const statusOf = (report, id, world) => {
  const c = report.checks.find((x) => x.id === id && (world === undefined || x.world.includes(world)));
  assert.ok(c, `check ${id} (${world ?? 'qualquer'}) deveria existir`);
  return c.status;
};

// ---------- 1. o repo REAL passa 100% ----------

test('F44 — o repo real está FIEL ao README (auditoria 100% verde)', () => {
  const report = audit();
  assert.equal(report.ok, true, `falhas: ${report.checks.filter((c) => c.status === 'fail').map((c) => `${c.id}:${c.world}`).join(', ')}`);
  assert.equal(report.summary.fail, 0);
  // os cinco mundos foram auditados de verdade (sem mundo sumido do relatório)
  for (const name of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    assert.ok(report.checks.some((c) => c.world.includes(name)), `mundo ${name} ausente da auditoria`);
  }
  // classes-chave verdes em TODOS os mundos
  for (const id of ['S1', 'D1', 'R1', 'B1', 'Q2']) {
    assert.equal(statusOf(report, id, 'Barburhen'), 'pass', `${id} Barburhen`);
    assert.equal(statusOf(report, id, 'Arukheea'), 'pass', `${id} Arukheea`);
  }
});

// ---------- 2. o instrumento PEGA cada classe de deriva ----------

test('F44 drift S — setor canônico renomeado/removido no runtime → S1 quebra', () => {
  const scenarios = structuredClone(SCENARIOS);
  scenarios.BARBURHEN.sectorNames = scenarios.BARBURHEN.sectorNames.map((n) => (n === 'Parque Abandonado' ? 'Parque' : n));
  const report = audit({ scenarios });
  assert.equal(statusOf(report, 'S1', 'Barburhen'), 'fail');
});

test('F44 drift S′ — README evoluindo sozinho (novo setor) → S1 quebra', () => {
  // o README é lido AO VIVO: se ele ganhar um setor e o runtime não seguir, a auditoria pega
  const readme = readmeText.replace(
    '| Zona de Extração (estação ferroviária) | — |',
    '| Zona de Extração (estação ferroviária) | — |\n| Galpão do Trem Blindado | ⅛ |',
  );
  const report = audit({ readmeText: readme });
  assert.equal(statusOf(report, 'S1', 'Barburhen'), 'fail');
  assert.match(report.checks.find((c) => c.id === 'S1' && c.world.includes('Barburhen')).detail, /Galpão do Trem Blindado/);
});

test('F44 drift D — dinâmica vazada para outro mundo → D2 (e D1b) quebram', () => {
  const scenarios = structuredClone(SCENARIOS);
  scenarios.PRIADUS.survival = { ...scenarios.PRIADUS.survival, type: 'TSUNAMI_WAVE' };
  const report = audit({ scenarios });
  assert.equal(statusOf(report, 'D2', 'Arukheea'), 'fail'); // tsunami vazou
  assert.equal(statusOf(report, 'D1b', 'Priadus'), 'fail');  // e a Emboscada Verde sumiu
});

test('F44 drift X — typo regressivo "Khaoos" → X2 quebra', () => {
  const scenarios = structuredClone(SCENARIOS);
  scenarios.CIGKV.mapLabel = 'Khaoos Ville';
  const report = audit({ scenarios });
  assert.equal(statusOf(report, 'X2'), 'fail');
});

test('F44 drift R — anel fecha no setor errado → R1 quebra', () => {
  const scenarios = structuredClone(SCENARIOS);
  scenarios.CKESALTH.ringFinal = { ...scenarios.CKESALTH.ringFinal, name: 'Zona Morta' };
  const report = audit({ scenarios });
  assert.equal(statusOf(report, 'R1', 'Ckesalth'), 'fail');
});

test('F44 drift B — dressing abaixo do mínimo Free Fire → B1/B2 quebram', () => {
  const dressingCounts2 = structuredClone(dressingCounts);
  dressingCounts2.CKESALTH.quicksand = 0;             // "areia movediça" sumiu do terreno
  const report1 = audit({ dressingCounts: dressingCounts2 });
  assert.equal(statusOf(report1, 'B1', 'Ckesalth'), 'fail');

  const sceneCounts2 = structuredClone(sceneCounts);
  sceneCounts2.ARUKHEEA.sharkfin = 1;                 // tubarões abaixo do mínimo
  const report2 = audit({ sceneCounts: sceneCounts2 });
  assert.equal(statusOf(report2, 'B2', 'Arukheea'), 'fail');
});

test('F44 drift Q — mundo sem perfil de luz próprio → Q1 quebra', () => {
  const report = audit({ lightingKeys: LIGHTING_KEYS.filter((k) => k !== 'Ckesalth') });
  assert.equal(statusOf(report, 'Q1', 'Ckesalth'), 'fail');
  const ok = audit({ lightingKeys: LIGHTING_KEYS });
  assert.equal(statusOf(ok, 'Q1', 'Ckesalth'), 'pass');
});

test('F44 render — relatório Markdown traz veredito e falhas legíveis', () => {
  const scenarios = structuredClone(SCENARIOS);
  scenarios.CIGKV.mapLabel = 'Khaoos Ville';
  const md = renderReport(audit({ scenarios }));
  assert.match(md, /DISCREPÂNCIAS/);
  assert.match(md, /\| X2 \|/);
  const mdOk = renderReport(audit());
  assert.match(mdOk, /FIEL/);
  assert.ok(!mdOk.includes('❌'), 'relatório verde não deveria ter falhas');
});
