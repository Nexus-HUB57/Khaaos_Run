// Task 71 — mundos oficiais legíveis: distância efetiva de culling (bounding
// sphere), densidade florestal por identidade de mundo e pisos noturnos.
// Regressão coberta: a T70 escondia meshes grandes com o jogador EM CIMA
// (terreno 440 m centrado na origem — distância ao centro 178 m > raio 110 m)
// e o chão virava o domo do céu (preto).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CULL, cullEffectiveDist, cullDecide } from '../src/game3d/cull3d.js';
import { SCENARIOS, resolveScenario } from '../src/game3d/scenarios.js';
import { NIGHT, nightSceneState } from '../src/game3d/skyPhase.js';

// ---- FIX regressão: distância efetiva por bounding sphere ----
test('T71 · terreno 440 m: jogador em cima → dist efetiva 0 → NUNCA culled', () => {
  // câmera a 178 m do centro (spawn -90,150), esfera do terreno r≈311
  const d = cullEffectiveDist({ camX: -89, camY: 1.6, camZ: 154, cx: 0, cy: 2.8, cz: 0, r: 311 });
  assert.equal(d, 0, 'câmera DENTRO da esfera do terreno');
  assert.equal(cullDecide({ dist: d, radius: CULL.propM, hidden: false }), true, 'chão sempre visível');
});
test('T71 · prop pequeno longe continua culled (comportamento T70 preservado)', () => {
  // crate r=1.2 a 130 m do centro — distância efetiva ≈ 128.8 > 110
  const d = cullEffectiveDist({ camX: 0, camY: 0, camZ: 0, cx: 130, cy: 1, cz: 0, r: 1.2 });
  assert.ok(d > CULL.propM, `efetiva ${d} continua além do raio`);
  assert.equal(cullDecide({ dist: d, radius: CULL.propM, hidden: false }), false);
});
test('T71 · shell grande: só culla quando a SUPERFÍCIE está além do raio', () => {
  // hangar r=30 com centro a 135 m: superfície a 105 m — DENTRO do raio → visível
  const dNear = cullEffectiveDist({ camX: 0, camY: 0, camZ: 0, cx: 135, cy: 10, cz: 0, r: 30 });
  assert.equal(cullDecide({ dist: dNear, radius: CULL.shellM, hidden: false }), true, '105 m < 320 m');
  // mesmo hangar com centro a 400 m: superfície a 370 m → culled
  const dFar = cullEffectiveDist({ camX: 0, camY: 0, camZ: 0, cx: 400, cy: 10, cz: 0, r: 30 });
  assert.equal(cullDecide({ dist: dFar, radius: CULL.shellM, hidden: false }), false);
});
test('T71 · histerese segue valendo na distância efetiva (fronteira não pisca)', () => {
  const r = CULL.propM;
  const d = cullEffectiveDist({ camX: 0, camY: 0, camZ: 0, cx: r + 5, cy: 0, cz: 0, r: 0 });
  assert.equal(cullDecide({ dist: d, radius: r, hidden: true }), true, 'escondido reabre com folga 8 m');
  assert.equal(cullDecide({ dist: d, radius: r, hidden: false }), false, 'visível fecha no raio');
});
test('T71 · raio/valores inválidos são defensivos (NaN → 0 → nunca culled)', () => {
  assert.equal(cullEffectiveDist({ camX: NaN, camZ: 5, cx: 0, cz: 0, r: 10 }), 0);
  assert.equal(cullEffectiveDist({ camX: 10, camZ: 0, cx: 0, cz: 0, r: -5 }), 10, 'raio negativo clampado a 0');
});

// ---- identidade oficial: densidade florestal por mundo ----
test('T71 · Priadus é FLORESTA (×7): Bosque e Área de Caça com copa densa', () => {
  assert.equal(SCENARIOS.PRIADUS.treeDensity, 7);
  assert.equal(SCENARIOS.CKESALTH.treeDensity, 0.8, 'deserto: vegetação rala');
  assert.equal(SCENARIOS.ARUKHEEA.treeDensity, 2.5, 'ilha: bosque moderado');
  assert.equal(SCENARIOS.CIGKV.treeDensity, 1, 'baseline inalterada');
  assert.equal(resolveScenario('priadus'), SCENARIOS.PRIADUS);
});
test('T71 · fórmula de árvores: priadus low-tier = 64×0.55×7 = 246 (≥ floresta)', () => {
  const TREES = Math.min(700, Math.max(8, Math.round(64 * 0.55 * SCENARIOS.PRIADUS.treeDensity)));
  assert.ok(TREES >= 240, `low-tier rende ${TREES} árvores`);
  const hi = Math.min(700, Math.max(8, Math.round(64 * 1 * SCENARIOS.PRIADUS.treeDensity)));
  assert.equal(hi, 448, 'high-tier 448 árvores — copa em todo o Bosque');
});
test('T71 · groundTint oficial existe por mundo (o chão recebe identidade)', () => {
  assert.equal(SCENARIOS.PRIADUS.groundTint, '#86a58e', 'musgo de pântano oficial');
  assert.equal(SCENARIOS.CKESALTH.groundTint, '#cdbb9d', 'areia de refinaria');
  assert.equal(SCENARIOS.CIGKV.groundTint, '#ffffff', 'baseline sem tint');
});

// ---- pisos noturnos: noite escura, NUNCA preta ----
test('T71 · noite profunda (t=1) mantém hemisfério ≥ 0.6 e fills ≥ 0.18', () => {
  const base = { sky: { top: '#0a0f1c', mid: '#252c44', horizon: '#7d9078' }, fogColor: '#2a2f45', sunIntensity: 2.1, hemiIntensity: 1.05, fillIntensity: 0.6, backIntensity: 0.45 };
  const st = nightSceneState(base, 1);
  assert.equal(st.hemiIntensity, NIGHT.hemiIntensity);
  assert.ok(NIGHT.hemiIntensity >= 0.6, `hemi piso ${NIGHT.hemiIntensity}`);
  assert.ok(NIGHT.fillIntensity >= 0.18 && NIGHT.backIntensity >= 0.22);
  assert.ok(st.sunIntensity > 0, 'lua fria ainda ilumina');
});
test('T71 · dia (t=0) não é afetado pelos pisos noturnos', () => {
  const base = { sky: { top: '#160f2e', mid: '#4a2a4e', horizon: '#c65a2e' }, fogColor: '#57382f', sunIntensity: 2.35, hemiIntensity: 1.18, fillIntensity: 0.72, backIntensity: 0.55 };
  const st = nightSceneState(base, 0);
  assert.equal(st.sunIntensity, 2.35);
  assert.equal(st.hemiIntensity, 1.18);
});
