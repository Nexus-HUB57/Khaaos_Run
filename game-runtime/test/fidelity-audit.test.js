// Khaaos Run — Fase 44 — AUDITORIA DA AUDITORIA (auto-verificação do instrumento).
//
// A auditoria de fidelidade (scripts/fidelity-audit-lib.mjs) lê o README AO
// VIVO e cruza com o runtime. Um instrumento desses só tem valor se PEGA a
// deriva — este arquivo prova isso duas vezes:
//   1. o repo REAL passa 100% (contrato de fidelidade corrente);
//   2. cada classe de deriva (setor renomeado, dinâmica vazada, typo
//      regressivo, anel deslocado, dressing abaixo do mínimo, luz sem
//      identidade, README evoluindo sozinho, paridade shared/worlds.ts ↔
//      runtime quebrada, lore pré-F42 reencarnando) faz o check ESPECÍFICO
//      falhar.
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
import { WORLD_AUDIO_PROFILES, FOOTSTEP_PROFILES } from '../src/game3d/worldAudioProfiles.js';
import { auditWorlds, renderReport } from '../scripts/fidelity-audit-lib.mjs';
import { extractSharedWorldsLite } from '../scripts/fidelity-snapshot.mjs';

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
// F47 — o contrato E2E shared/worlds.ts entra na meta-auditoria pelo MESMO
// caminho real do snapshot (extração headless por regex), não por um parser
// de teste: se o extrator quebrar, o teste verde quebra junto.
const sharedWorlds = extractSharedWorldsLite(readFileSync(path.join(repoRoot, 'shared/worlds.ts'), 'utf8'));
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

const BASE = {
  readmeText, scenarios: SCENARIOS, dressingCounts, sceneCounts, lightingKeys: LIGHTING_KEYS, simSource, docs,
  sharedWorlds,
  audio: { worlds: WORLD_AUDIO_PROFILES, footsteps: FOOTSTEP_PROFILES },
};
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

// ---------- 1b. identidade acústica (F48) — o repo real passa ----------

test('F48 — identidade acústica dos 5 mundos é FIEL (AU1-AU4 verdes)', () => {
  const report = audit();
  assert.equal(statusOf(report, 'AU1'), 'pass');
  // AU2/AU3 em todos os mundos; AU4 nos três com semântica de chuva no cânon
  for (const w of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    assert.equal(statusOf(report, 'AU2', w), 'pass', `AU2 ${w}`);
    assert.equal(statusOf(report, 'AU3', w), 'pass', `AU3 ${w}`);
  }
  for (const w of ['CIGKV', 'Barburhen', 'Ckesalth']) {
    assert.equal(statusOf(report, 'AU4', w), 'pass', `AU4 ${w}`);
  }
  // W2/W4 NÃO têm semântica de chuva no README — a auditoria não inventa regra
  assert.ok(!report.checks.some((c) => c.id === 'AU4' && c.world.includes('Priadus')));
  assert.ok(!report.checks.some((c) => c.id === 'AU4' && c.world.includes('Arukheea')));
});

test('F48 drift AU1 — mundo inventado ou canônico sem perfil → AU1 quebra', () => {
  const inventado = { worlds: { ...WORLD_AUDIO_PROFILES, ZoneOfTraining: { world: 'ZoneOfTraining', surface: 'concrete', rain: 0, label: 'campo de treinamento' } }, footsteps: FOOTSTEP_PROFILES };
  assert.equal(statusOf(audit({ audio: inventado }), 'AU1'), 'fail');
  const semPriadus = { worlds: Object.fromEntries(Object.entries(WORLD_AUDIO_PROFILES).filter(([k]) => k !== 'Priadus')), footsteps: FOOTSTEP_PROFILES };
  const r2 = audit({ audio: semPriadus });
  assert.equal(statusOf(r2, 'AU1'), 'fail');
  assert.equal(statusOf(r2, 'AU2', 'Priadus'), 'fail'); // e o mundo sem perfil falha no AU2
});

test('F48 drift AU2 — rótulo acústico divergente do cânon → AU2 quebra', () => {
  const corrompido = { worlds: { ...WORLD_AUDIO_PROFILES, Priadus: { ...WORLD_AUDIO_PROFILES.Priadus, label: 'bacia desértica com fumaça' } }, footsteps: FOOTSTEP_PROFILES };
  const r = audit({ audio: corrompido });
  assert.equal(statusOf(r, 'AU2', 'Priadus'), 'fail'); // label do DESERTO no mundo da SELVA
  assert.equal(statusOf(r, 'AU2', 'Ckesalth'), 'pass', 'o mundo dono do rótulo segue verde');
});

test('F48 drift AU3 — superfície sem perfil de footstep → AU3 quebra', () => {
  const semCadeia = { worlds: { ...WORLD_AUDIO_PROFILES, Ckesalth: { ...WORLD_AUDIO_PROFILES.Ckesalth, surface: 'vidro' } }, footsteps: FOOTSTEP_PROFILES };
  assert.equal(statusOf(audit({ audio: semCadeia }), 'AU3', 'Ckesalth'), 'fail');
});

test('F48 drift AU4 — chuva viola a dinâmica canônica → AU4 quebra', () => {
  // deserto com chuva (W3 é o Deserto das Almas Esquecidas — zero chuva)
  const chuvaNoDeserto = { worlds: { ...WORLD_AUDIO_PROFILES, Ckesalth: { ...WORLD_AUDIO_PROFILES.Ckesalth, rain: 0.4 } }, footsteps: FOOTSTEP_PROFILES };
  assert.equal(statusOf(audit({ audio: chuvaNoDeserto }), 'AU4', 'Ckesalth'), 'fail');
  // Barburhen sem chuva (a chuva ácida é a dinâmica canônica do mundo)
  const secaBarburhen = { worlds: { ...WORLD_AUDIO_PROFILES, Barburhen: { ...WORLD_AUDIO_PROFILES.Barburhen, rain: 0 } }, footsteps: FOOTSTEP_PROFILES };
  assert.equal(statusOf(audit({ audio: secaBarburhen }), 'AU4', 'Barburhen'), 'fail');
});

// ---------- 1c. paridade de contrato shared/worlds.ts (F47) — o repo real passa ----------

test('F47 — paridade shared/worlds.ts ↔ runtime é FIEL (W1–W7 verdes)', () => {
  assert.ok(sharedWorlds, 'extração headless de shared/worlds.ts deveria produzir os 5 mundos');
  const report = audit();
  for (const w of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    assert.equal(statusOf(report, 'W1', w), 'pass', `W1 ${w}`);
    assert.equal(statusOf(report, 'W2', w), 'pass', `W2 ${w}`);
    assert.equal(statusOf(report, 'W3', w), 'pass', `W3 ${w}`);
    assert.equal(statusOf(report, 'W4', w), 'pass', `W4 ${w}`);
    assert.equal(statusOf(report, 'W5', w), 'pass', `W5 ${w}`);
  }
  assert.equal(statusOf(report, 'W6'), 'pass');
  assert.equal(statusOf(report, 'W7'), 'pass');
});

// ---------- 2. o instrumento PEGA cada classe de deriva ----------

test('F47 drift W1/W6 — hazard não-cânon reentra no contrato → W1 (e W6) quebram', () => {
  const lava = structuredClone(sharedWorlds);
  lava.Ckesalth.hazard.type = 'VOLCANIC_LAVA'; // lore pré-F42 (caldeira vulcânica) reencarnando
  const r = audit({ sharedWorlds: lava });
  assert.equal(statusOf(r, 'W1', 'Ckesalth'), 'fail');
  assert.equal(statusOf(r, 'W6'), 'fail');
});

test('F47 drift W2 — paridade runtime↔contrato quebra nos DOIS lados', () => {
  // lado runtime: Barburhen ganha survival (a chuva ácida é id-gated no sim3d —
  // survival explícito no cenário é exatamente o drift que a F47 fechou)
  const comSurvival = structuredClone(SCENARIOS);
  comSurvival.BARBURHEN.survival = { type: 'KHAOS_GRAVITY' };
  assert.equal(statusOf(audit({ scenarios: comSurvival }), 'W2', 'Barburhen'), 'fail');
  // lado runtime: CIGKV perde o survival canônico (Pulso Khaaos)
  const semSurvival = structuredClone(SCENARIOS);
  semSurvival.CIGKV.survival = undefined;
  assert.equal(statusOf(audit({ scenarios: semSurvival }), 'W2', 'CIGKV'), 'fail');
});

test('F47 drift W3 — configRevision desafixada do pin → W3 quebra', () => {
  const derivado = structuredClone(sharedWorlds);
  derivado.CIGKV.configRevision = 'pre-f42-2026-10-25';
  assert.equal(statusOf(audit({ sharedWorlds: derivado }), 'W3', 'CIGKV'), 'fail');
});

test('F47 drift W4/W5 — lore pré-F42 reencarna em biome/subtitle → W4/W5 quebram', () => {
  const antigo = structuredClone(sharedWorlds);
  antigo.Priadus.subtitle = 'Priadus — Cumes de Vento'; // geração arquipélago (pré-cânon)
  antigo.Priadus.biome = 'Arquipélago abissal com plataformas offshore';
  const r = audit({ sharedWorlds: antigo });
  assert.equal(statusOf(r, 'W4', 'Priadus'), 'fail');
  assert.equal(statusOf(r, 'W5', 'Priadus'), 'fail');
  // falha ESPECÍFICA: o mundo dono do lore correto segue verde
  assert.equal(statusOf(r, 'W5', 'Ckesalth'), 'pass');
});

test('F47 drift W7 — mundo inventado entra / canônico sai → W7 quebra', () => {
  const inventado = structuredClone(sharedWorlds);
  inventado.ZoneOfTraining = { hazard: { type: 'SAFE_TRAINING' }, configRevision: 'f42-2026-11-02', biome: 'campo de treinamento', subtitle: 'Zona de Treinamento' };
  assert.equal(statusOf(audit({ sharedWorlds: inventado }), 'W7'), 'fail');
  const faltando = structuredClone(sharedWorlds);
  delete faltando.Arukheea;
  const r2 = audit({ sharedWorlds: faltando });
  assert.equal(statusOf(r2, 'W7'), 'fail');
  assert.equal(statusOf(r2, 'W1', 'Arukheea'), 'fail'); // e o mundo sumido falha no W1
});

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
