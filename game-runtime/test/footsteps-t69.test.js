// Task 69 — FOLEY DE PASSOS fase-travado: validação da voz PURA (stepVoice/
// botPan) e da renderização defensiva no GameAudio. Contratos: hierarquia
// acústica por superfície, caráter sprint/pouso, pan pelos strikes reais e
// espacial de bots, determinismo e no-op seguro headless (ctx null e mock F19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepVoice, botPan, FOOTSTEP } from '../src/game3d/footsteps3d.js';
import { GameAudio } from '../src/game3d/audio3d.js';

const EPS = 1e-9;

// ---- hierarquia por superfície (FOOTSTEP_PROFILES consumido pela voz) --------
test('T69 · hierarquia acústica: thump desce sand/mud, metal e stone no topo', () => {
  const low = (s) => stepVoice({ intensity: .6, surface: s }).lowHz;
  const band = (s) => stepVoice({ intensity: .6, surface: s }).bandHz;
  // FOOTSTEP_PROFILES canônico: sand 72 < mud 86 < concrete 115 < stone 145 < metal 210
  assert.ok(low('sand') < low('mud'), `sand ${low('sand')} < mud ${low('mud')}`);
  assert.ok(low('mud') < low('concrete'), 'mud < concrete');
  assert.ok(low('concrete') < low('stone'), 'concrete < stone');
  assert.ok(low('stone') < low('metal'), 'stone < metal');
  assert.ok(band('metal') > band('concrete'), 'metal tilinta acima');
  assert.ok(band('sand') < band('concrete'), 'sand abafa acima');
});
test('T69 · intensidade: mais rápido soa mais presente (peak cresce, teto em 1)', () => {
  const a = stepVoice({ intensity: .25, surface: 'concrete' });
  const b = stepVoice({ intensity: .8, surface: 'concrete' });
  assert.ok(b.peak > a.peak, `${b.peak.toFixed(3)} > ${a.peak.toFixed(3)}`);
  const max = stepVoice({ intensity: 1.4, surface: 'concrete' });
  const one = stepVoice({ intensity: 1, surface: 'concrete' });
  assert.ok(Math.abs(max.peak - one.peak) < EPS, 'intensity satura em 1');
});

// ---- caráter: sprint e pouso --------------------------------------------------
test('T69 · sprint: mais presente, mais GRAVE e mais longo (passada pesada)', () => {
  const w = stepVoice({ intensity: .9, surface: 'concrete', sprint: false });
  const s = stepVoice({ intensity: .9, surface: 'concrete', sprint: true });
  assert.ok(s.peak > w.peak, 'sprint mais presente');
  assert.ok(s.lowHz < w.lowHz, `sprint mais grave (${s.lowHz.toFixed(1)} < ${w.lowHz.toFixed(1)})`);
  assert.ok(s.decay > w.decay, 'sprint mais longo');
});
test('T69 · pouso: impacto pesado domina sprint (low bem grave, decay longo)', () => {
  const s = stepVoice({ intensity: 1, surface: 'stone', sprint: true });
  const l = stepVoice({ intensity: 1, surface: 'stone', land: true });
  assert.ok(l.peak > s.peak, 'pouso mais presente que sprint');
  assert.ok(l.lowHz < s.lowHz * (FOOTSTEP.sprintPitch + .01), 'thump do pouso desce');
  assert.ok(l.decay > s.decay, 'pouso ressoa mais');
});

// ---- pan -----------------------------------------------------------------------
test('T69 · pan: strikes REAIS mandam no estéreo (L esquerda, R direita)', () => {
  const l = stepVoice({ intensity: .5, surface: 'concrete', side: 'L' });
  const r = stepVoice({ intensity: .5, surface: 'concrete', side: 'R' });
  assert.equal(l.pan, -FOOTSTEP.panSide);
  assert.equal(r.pan, FOOTSTEP.panSide);
});
test('T69 · botPan: projeção no eixo direito do ouvinte, clampado em ±.75', () => {
  // ouvinte em (0,0) olhando −Z (yaw 0): direita = +X
  assert.equal(botPan({ bx: 10, bz: 0, lx: 0, lz: 0, yaw: 0 }), FOOTSTEP.panMax, 'bot à direita pura → clamp +.75');
  assert.equal(botPan({ bx: -10, bz: 0, lx: 0, lz: 0, yaw: 0 }), -FOOTSTEP.panMax, 'bot à esquerda pura → clamp −.75');
  assert.equal(botPan({ bx: 0, bz: -10, lx: 0, lz: 0, yaw: 0 }), 0, 'bot à frente → centro');
  // atrás do ouvinte (yaw 0, bot em +Z): projeção 0 — pan não inventa lado
  assert.equal(botPan({ bx: 0, bz: 10, lx: 0, lz: 0, yaw: 0 }), 0, 'atrás → centro');
  // clamp: bot MUITO ao lado nunca cola na borda dura
  const cl = botPan({ bx: 1000, bz: 0, lx: 0, lz: 0, yaw: 0 });
  assert.ok(Math.abs(cl) <= FOOTSTEP.panMax + EPS, `clamp ${cl}`);
  // yaw 90° (olhando −X... rotacionado): direita vira −Z? cos(π/2)=0, −sin(π/2)=−1 → direita = (0,−1) = −Z? hmm: yaw π/2 → frente = (−1,0); direita = (0,−1) ✓ consistente com −Z frente
  const yawed = botPan({ bx: 0, bz: -10, lx: 0, lz: 0, yaw: Math.PI / 2 });
  assert.equal(yawed, FOOTSTEP.panMax, `yaw π/2 e bot em −Z → direita pura (clamp ${yawed})`);
  assert.equal(botPan({ bx: 0, bz: 0, lx: 0, lz: 0, yaw: 0 }), 0, 'sobreposto → centro');
});
test('T69 · atenuação: falloff monotônico com a distância, 1 em d=0', () => {
  const v0 = stepVoice({ intensity: .5, surface: 'concrete', distance: 0 });
  const v10 = stepVoice({ intensity: .5, surface: 'concrete', distance: 10 });
  const v30 = stepVoice({ intensity: .5, surface: 'concrete', distance: 30 });
  assert.equal(v0.att, 1);
  assert.ok(v10.att < v0.att && v30.att < v10.att, `${v0.att.toFixed(2)} → ${v10.att.toFixed(3)} → ${v30.att.toFixed(4)}`);
});

// ---- determinismo ---------------------------------------------------------------
test('T69 · determinismo: mesmas entradas → mesma voz (zero Math.random)', () => {
  const a = stepVoice({ intensity: .7, side: 'L', surface: 'mud', sprint: true, distance: 3 });
  const b = stepVoice({ intensity: .7, side: 'L', surface: 'mud', sprint: true, distance: 3 });
  assert.deepEqual(b, a);
});

// ---- renderização no GameAudio ---------------------------------------------------
test('T69 · GameAudio headless (ctx null): step é no-op seguro em todas as variantes', () => {
  const a = new GameAudio();
  a.step(.5);
  a.step(.9, 0, 'metal', { side: 'L', sprint: true });
  a.step(1.05, 0, 'mud', { land: true });
  assert.ok(true, 'nunca quebra sem AudioContext');
});
test('T69 · GameAudio mock F19 (sem Oscillator/StereoPanner): scuff sozinho renderiza', () => {
  const a = new GameAudio();
  // mock mínimo: BufferSource+Buffer+Filter+Gain — SEM Oscillator, SEM StereoPanner
  const nodes = [];
  const ctx = {
    currentTime: 0,
    destination: {},
    sampleRate: 48000,
    createBufferSource() { const n = { buffer: null, connect() {}, start() {} }; nodes.push(n); return n; },
    createBuffer(_c, len) { const d = new Float32Array(len); return { _noise: true, getChannelData: () => d }; },
    createBiquadFilter() { const n = { type: '', Q: { value: 1 }, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; nodes.push(n); return n; },
    createGain() { const n = { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; nodes.push(n); return n; },
    // createOscillator e createStereoPanner AUSENTES de propósito (mock F19)
  };
  a.ctx = ctx; a.enabled = true;
  a.step(.8, 0, 'metal', { side: 'L', sprint: true });
  a.step(1.05, 0, 'mud', { land: true });
  assert.ok(nodes.length >= 6, `scuff renderizado x2 sem osc/pan (${nodes.length} nós)`);
  assert.ok(nodes.some((n) => n.buffer?._noise), 'buffer de ruído criado');
});
test('T69 · GameAudio mock completo: thump + pan entram no grafo', () => {
  const a = new GameAudio();
  const kinds = { osc: 0, pan: 0 };
  const ctx = {
    currentTime: 0, destination: {},
    createBufferSource() { return { buffer: null, connect() {}, start() {} }; },
    createBuffer(_c, len) { const d = new Float32Array(len); return { getChannelData: () => d }; },
    sampleRate: 48000,
    createBiquadFilter() { return { type: '', Q: { value: 1 }, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; },
    createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; },
    createOscillator() { kinds.osc++; return { type: '', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; },
    createStereoPanner() { kinds.pan++; return { pan: { value: 0 }, connect() {} }; },
  };
  a.ctx = ctx; a.enabled = true;
  a.step(.6, 0, 'stone', { side: 'R', pan: .3 });
  assert.equal(kinds.osc, 1, 'thump presente');
  assert.equal(kinds.pan, 1, 'pan presente');
  a.step(1.05, 0, 'stone', { land: true });
  assert.equal(kinds.osc, 2, 'pouso também tem thump');
});
