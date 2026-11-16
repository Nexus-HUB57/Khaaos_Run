// Task 70 — política de culling por distância: regras de raio, histerese e
// isenção. Pura (cull3d.js) — decide QUEM pode ser escondido; o main3d só
// executa. Contratos do perfil real: 89% dos meshes além de 80 m, anon props
// de solo, shells = landmarks, céu nunca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CULL, cullRadiusFor, propagateNoCull, cullDecide } from '../src/game3d/cull3d.js';

test('T70 · raios canônicos: prop 110, shell 320, grama 90', () => {
  assert.equal(cullRadiusFor({ name: '', worldY: 0 }), CULL.propM);
  assert.equal(cullRadiusFor({ name: 'crate', worldY: 1.2 }), CULL.propM);
  assert.equal(cullRadiusFor({ name: 'shell:warehouse:12:34', worldY: 0 }), CULL.shellM);
  assert.equal(cullRadiusFor({ name: 'grassLOD', worldY: 0 }), CULL.grassM);
});
test('T70 · céu/montanhas NUNCA (altura ≥ landmarkY) — o céu não pode piscar', () => {
  assert.equal(cullRadiusFor({ name: '', worldY: CULL.landmarkY }), null);
  assert.equal(cullRadiusFor({ name: 'cloud', worldY: 47 }), null);
  assert.equal(cullRadiusFor({ name: 'shell:hangar:3:1', worldY: 20 }), null, 'shell alto = montanha? nunca');
  assert.equal(cullRadiusFor({ name: '', worldY: NaN }), null, 'altura inválida → nunca (defensivo)');
});
test('T70 · histerese: fronteira não pisca (reabre só com folga de 8 m)', () => {
  const r = CULL.propM;
  // entrando no raio: visível exatamente em <r
  assert.equal(cullDecide({ dist: r - .01, radius: r, hidden: false }), true);
  assert.equal(cullDecide({ dist: r + .01, radius: r, hidden: false }), false);
  // já escondido: só reabre além de r + folga (pop evitado na fronteira)
  assert.equal(cullDecide({ dist: r + .01, radius: r, hidden: true }), true, 'folga segura o estado');
  assert.equal(cullDecide({ dist: r + CULL.hysteresisM + .01, radius: r, hidden: true }), false);
});
test('T70 · baseVisible false nunca é forçado (o próprio jogo manda)', () => {
  assert.equal(cullDecide({ dist: 0, radius: CULL.propM, baseVisible: false }), false);
  assert.equal(cullDecide({ dist: 0, radius: null, baseVisible: false }), false, 'isenção não ressuscita');
});
test('T70 · radius null = sempre visível (isenção por regra)', () => {
  assert.equal(cullDecide({ dist: 9999, radius: null, hidden: false }), true);
});
test('T70 · distâncias negativas clampadas (defensivo)', () => {
  assert.equal(cullDecide({ dist: -5, radius: CULL.propM, hidden: false }), true);
});

// ---- propagateNoCull: subárvore inteira isenta, idempotente ----
test('T70 · propagateNoCull marca a subárvore e conta só os NOVOS', () => {
  const leafA = { userData: {}, children: [] };
  const leafB = { userData: {}, children: [] };
  const mid = { userData: {}, children: [leafA] };
  const root = { userData: {}, children: [mid, leafB] };
  const n1 = propagateNoCull(root);
  assert.equal(n1, 4, `root+mid+leafA+leafB (${n1})`);
  assert.equal(root.userData.noCull, true);
  assert.equal(leafA.userData.noCull, true);
  const n2 = propagateNoCull(root);
  assert.equal(n2, 0, 'idempotente — nada novo');
});
test('T70 · propagateNoCull tolera nó sem userData e raiz nula', () => {
  assert.equal(propagateNoCull(null), 0);
  const bare = { children: [{ children: [] }] }; // sem userData em nenhum nível
  assert.equal(propagateNoCull(bare), 0);
});

// ---- integração audio3d: cache de noise buffers por duração ----
test('T70 · GameAudio mock: #noiseBuffer em cache — mesmo dur devolve o MESMO buffer', async () => {
  const { GameAudio } = await import('../src/game3d/audio3d.js');
  const a = new GameAudio();
  const created = [];
  const ctx = {
    sampleRate: 48000,
    currentTime: 0, destination: {},
    createBuffer(ch, len) { const d = new Float32Array(len); created.push({ ch, len, d }); return { getChannelData: () => d }; },
    createBufferSource() { return { buffer: null, connect() {}, start() {} }; },
    createBiquadFilter() { return { type: '', Q: { value: 1 }, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; },
    createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; },
    createOscillator() { return { type: '', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; },
    createStereoPanner() { return { pan: { value: 0 }, connect() {} }; },
  };
  a.ctx = ctx; a.enabled = true;
  a.step(.6, 0, 'stone');
  // duas chamadas com a mesma duração interna → createBuffer chamado 1×
  const before = created.length;
  a.step(.6, 0, 'stone');
  a.step(.9, 0, 'mud');
  assert.equal(created.length - before, 1, 'mesma duração → cache hit (1 buffer novo apenas)');
  assert.ok(created.every((b) => b.len > 0));
});
