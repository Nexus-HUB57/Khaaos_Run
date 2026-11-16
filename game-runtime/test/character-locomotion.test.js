// Task 59 (sessão 56) / Fase 58 — corpo em 1ª pessoa + low-ready + pouso.
// Task 62 — convenção de tiro REAL: braços à frente (arma nas mãos), ombro
// direito com slope de pitch 1, low-ready do sprint via ombro (aR ↓).
// Continuidade ponta a ponta é provada ATRAVÉS do gait.js (F42, fonte canônica
// da fase de passada): mesmo com a velocidade alvo trocando bruscamente, as
// juntas não saltam. Contratos: andar (≤1) mantém o braço na mira; sprint com
// sprintK suavizado abaixa a arma; ADS cancela.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---- stub de Canvas2D (textures3d roda canvas procedural nos imports) ----
const ctx2d = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
  moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
  save() {}, restore() {}, translate() {}, fillText() {},
  measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData() { return { data: new Uint8ClampedArray(4).fill(128) }; },
  putImageData() {},
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}

const { newGait, advanceGait } = await import('../src/game3d/gait.js');
const { animateOperative, createOperative, createFirstPersonRig } = await import('../src/game3d/entities3d.js');

// suavizador de sprintK idêntico ao do main3d (constante de tempo do corpo)
function smoothSprint(sk, target, dt) {
  const t = target ? 1 : 0;
  const next = sk + (t - sk) * (1 - Math.exp(-(t > sk ? 5.5 : 7) * dt));
  return next < 1e-4 ? 0 : next;
}

test('continuidade ponta a ponta: gait.js × animateOperative sem salto de junta na troca brusca 0→sprint→0', () => {
  const op = createOperative({ variant: 'TASK59_CONT' });
  const joints = [op.parts.legL.hip, op.parts.legR.hip, op.parts.legL.knee, op.parts.legR.knee,
    op.parts.armL.shoulder, op.parts.armR.shoulder, op.parts.armL.elbow, op.parts.armR.elbow];
  const gait = newGait();
  const DT = 1 / 30;
  // trilha de posições: parado → anda → sprint → freia bruscamente (metros reais)
  let x = 0, v = 0;
  const warm = [];
  for (let i = 0; i < 30; i++) warm.push(0);
  const seq = [...Array(45).fill(5.2 * .8), ...Array(45).fill(5.2 * 1.42), ...Array(60).fill(0)];
  for (const target of warm) { // warm-up ANIMADO (sai da pose de repouso)
    advanceGait(gait, { x, z: 0, dt: DT });
    animateOperative(op.parts, { t: 0, phase: gait.phase, speedNorm: target });
  }
  const prev = joints.map((j) => j.rotation.x);
  let t = 0;
  // limiar consciente da cadência: em sprint a passada é LEGITIMAMENTE rápida
  // (gait F42: até ~12,9 rad/s = ~.36 rad/frame @30 Hz contínuos e suaves);
  // o defeito que este teste caça é o TELEPORTE de fase (saltos > .5 rad em
  // direção arbitrária), não o movimento rápido contínuo.
  const LIMIT = .45;
  for (const target of seq) {
    t += DT;
    v += (target - v) * .25;                    // corpo responde em ~4 frames
    x += v * DT;
    advanceGait(gait, { x, z: 0, dt: DT });
    animateOperative(op.parts, { t, phase: gait.phase, speedNorm: Math.max(.12, gait.speed) });
    joints.forEach((j, k) => {
      const d = Math.abs(j.rotation.x - prev[k]);
      assert.ok(Number.isFinite(d), 'rotação finita');
      assert.ok(d < LIMIT, `Δ${k} por frame ${d.toFixed(4)} < ${LIMIT} (junta ${k}, t=${t.toFixed(2)})`);
      prev[k] = j.rotation.x;
    });
  }
  assert.ok(gait.phase > 20, `fase integrou pelos metros (${gait.phase.toFixed(1)} rad)`);
});

test('contrato de andar preservado: speedNorm ≤ 1 mantém braço na mira (sprintK = 0)', () => {
  const op = createOperative({ variant: 'TASK59_WALK' });
  for (let i = 0; i < 40; i++) {
    const ret = animateOperative(op.parts, { t: i / 30, speedNorm: 1 });
    assert.equal(ret.sprintK, 0, `sprintK 0 em andar (frame ${i})`);
  }
  // Task 62 — regime de tiro: ombro direito ~.10 (arma à frente), esquerdo
  // ~.95 (cotovelo do suporte erguido); micro-sinais (breathe/armStep) ≤ .32
  assert.ok(Math.abs(op.parts.armR.shoulder.rotation.x - .10) < .32, 'direito preso ao regime de tiro');
  assert.ok(Math.abs(op.parts.armL.shoulder.rotation.x - .95) < .32, 'esquerdo preso ao regime de suporte');
});

test('sprint abaixa a arma: sprintK suavizado satura, braço sai da mira e ADS cancela', () => {
  const op = createOperative({ variant: 'TASK59_SPRINT' });
  let sk = 0;
  for (let i = 0; i < 90; i++) {                // 3 s de sprint
    sk = smoothSprint(sk, 1, 1 / 30);
    animateOperative(op.parts, { t: i / 30, speedNorm: 1.2, phase: i / 30 * 11, sprintK: sk });
  }
  assert.ok(sk > .95, `sprintK saturou no sprint (${sk.toFixed(3)})`);
  // Task 62 — low-ready: o ombro direito DESCE abaixo da base (.10) − .3
  assert.ok(op.parts.armR.shoulder.rotation.x < .10 - .3, 'braço direito abaixou (low-ready)');
  assert.ok(op.parts.armL.shoulder.rotation.x < .95 - .25, 'suporte acompanha o low-ready');
  // ADS cancela o low-ready mesmo com sprintK alto
  const retAds = animateOperative(op.parts, { t: 3.1, speedNorm: 1.2, phase: 34, sprintK: sk, ads: true });
  assert.equal(retAds.sprintK, 0, 'ADS força regime de tiro');
  assert.ok(Math.abs(op.parts.armR.shoulder.rotation.x - .50) < .35, 'braço volta à mira no ADS');
  // frenagem: sprintK desce com tempo de corpo (não snappa) — braço volta suave
  let prev = op.parts.armR.shoulder.rotation.x;
  animateOperative(op.parts, { t: 3.2, speedNorm: 1.2, phase: 35, sprintK: sk });
  const after = op.parts.armR.shoulder.rotation.x;
  assert.ok(Math.abs(after - prev) < .9, `sem teleporte de braço (${(after - prev).toFixed(3)})`);
});

// Task 62 — a pose do sprint da ARMA (3ª pessoa) virou contrato do
// avatar-weapon-rig.test.js (solda punho↔grip dentro do animateOperative).
test('rig FP orgânico: braços em cápsula com base gravada, mãos intactas e tintable preservado', () => {
  const rig = createFirstPersonRig({});
  for (const side of ['armL', 'armR']) {
    const arm = rig.userData.arms[side];
    assert.ok(arm.userData.base && Number.isFinite(arm.userData.base.x), `${side}.userData.base gravado`);
    const hand = rig.userData.hands[side];
    assert.equal(hand.fingers.length, 4, `${side}: mão articulada intacta`);
    const meshes = [];
    arm.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const capsules = meshes.filter((m) => m.geometry?.type === 'CapsuleGeometry').length;
    assert.ok(capsules >= 3, `${side}: braço em cápsula (${capsules} cápsulas — sem caixa de manga)`);
  }
  const tris = (() => { let n = 0; rig.traverse((o) => { if (o.isMesh) n += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; }); return n; })();
  assert.ok(tris <= 3400, `rig ${tris} tris ≤ 3400 (orçamento de close)`);
  assert.ok(tris >= 800, `rig ${tris} tris ≥ 800 (densidade anatômica mantida)`);
  let tintable = 0;
  rig.traverse((o) => { if (o.isMesh && o.userData?.tintable) tintable++; });
  assert.ok(tintable >= 3, `manga/colete tintable preservado (${tintable})`);
});
