// Fase 42 — BIOMECÂNICA DA PASSADA (gait.js): validação node-puro.
//
// Coração da suíte: o invariante ANTI-PATINAGEM — em regime, a velocidade
// implícita dos pés (cadência × comprimento do passo) IGUALA a velocidade do
// corpo. Não é aproximação: é igualdade por construção e é testada numericamente.
// Também valida: heel strikes L/R alternados e wrap-aware, monotonicidade da
// cadência, guarda de teleporte, delay adaptativo (limites), arco angular
// curto, integração animateOperative(phase) e compatibilidade legada.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  newGait, advanceGait, gaitEvents, strideLengthM, speedNormFromMps,
  ewma, angleLerp, adaptiveDelayMs, SPEED_REF_MPS, TELEPORT_MPS,
} = await import('../src/game3d/gait.js');

const TAU = 2 * Math.PI;
const norm = (ph) => ((ph % TAU) + TAU) % TAU;
const DT = 1 / 60;

// roda uma passada a v m/s por `frames` e devolve o estado final + distância
function run(vMps, frames, g = newGait()) {
  let dist = 0;
  for (let i = 0; i < frames; i++) {
    const x = (g.px ?? 0) + vMps * DT;
    dist += vMps * DT;
    advanceGait(g, { x, z: 0, dt: DT });
  }
  return { g, dist };
}

// ---- INVARIANTE CENTRAL: zero patinação ------------------------------------
test('invariante anti-patinação: cadência × passo = velocidade do corpo (andar)', () => {
  const v = 3.6;                                   // ~speedNorm .69 (andar)
  const { g, dist } = run(v, 600);                 // 10 s
  const cycles = g.phase / TAU;                    // ciclos completos
  // GEOMETRIA: metros percorridos por ciclo == strideLength na velocidade
  // de regime — é a definição numérica de "pés não patinam".
  const metersPerCycle = dist / cycles;
  const strideTarget = strideLengthM(speedNormFromMps(v));
  assert.ok(Math.abs(metersPerCycle - strideTarget) < strideTarget * .02,
    `m/ciclo=${metersPerCycle.toFixed(4)} alvo=${strideTarget.toFixed(4)}`);
  assert.ok(g.speed > .6 && g.speed < .8, `speedNorm EWMA=${g.speed.toFixed(3)}`);
});

test('invariante anti-patinação: sprint não patina (fase ∝ distância no regime)', () => {
  const v = SPEED_REF_MPS * 1.2;                   // sprint
  const a = run(v, 300);
  const b = run(v, 300, newGait());
  assert.equal(a.g.phase.toFixed(6), b.g.phase.toFixed(6), 'determinismo');
  // mesma distância no MESMO regime → mesma fase (proporção exata)
  const r2 = run(v, 150);
  const ratio = (a.g.phase / a.dist) / (r2.g.phase / r2.dist);
  assert.ok(Math.abs(ratio - 1) < .02, `Δfase/Δmetro estável: ratio=${ratio.toFixed(4)}`);
});

test('transição andar→sprint: fase é contínua (sem salto visual/estrobo)', () => {
  const g = newGait();
  run(2.6, 180, g);                                // 3 s andando
  const rates = [];
  for (let i = 0; i < 120; i++) {                  // acelera p/ sprint
    const before = g.phase;
    advanceGait(g, { x: (g.px ?? 0) + 7.2 * DT, z: 0, dt: DT });
    rates.push((g.phase - before) / DT);
  }
  const steady = 2 * Math.PI * 7.2 / strideLengthM(1.25); // regime final
  // (1) nenhum frame salta mais que meio ciclo (sem snap visual)
  for (const r of rates) assert.ok(r < Math.PI / DT * .5, `taxa=${r.toFixed(2)}`);
  // (2) a cadência NÃO ultrapassa o regime de destino (sem "trote apressado")
  const maxRate = Math.max(...rates);
  assert.ok(maxRate < steady * 1.4, `pico=${maxRate.toFixed(2)} regime=${steady.toFixed(2)}`);
  // (3) termina em regime (últimos frames ≈ taxa de sprint)
  const tail = rates.slice(-10).reduce((a, b) => a + b) / 10;
  assert.ok(Math.abs(tail - steady) < steady * .05, `cauda=${tail.toFixed(2)}`);
});

test('teleporte NÃO vira fase fantasma (guarda TELEPORT_MPS)', () => {
  const g = newGait();
  run(4, 60, g);
  const phaseBefore = g.phase;
  advanceGait(g, { x: (g.px ?? 0) + 80, z: 0, dt: DT });   // 80 m num frame
  assert.equal(g.phase, phaseBefore, 'fase intacta');
  assert.deepEqual(g.events, [], 'sem heel strike fantasma');
  assert.ok(Number.isFinite(g.px) && Number.isFinite(g.pz), 'referência atualizada');
});

test('heel strikes: L→R alternados, 2 por ciclo, wrap-aware e multi-ciclo', () => {
  // um ciclo inteiro contém exatamente 1 L (π/2) e 1 R (3π/2)
  assert.deepEqual(gaitEvents(0, TAU), ['L', 'R']);
  assert.deepEqual(gaitEvents(-TAU / 4, TAU - TAU / 4), ['L', 'R']);
  // quarto de ciclo depois do L (π/2) → R toca em 3π/2
  assert.deepEqual(gaitEvents(Math.PI / 2 + .01, (3 * Math.PI) / 2), ['R']);
  // lag alto (3 ciclos num frame): 3 L + 3 R
  assert.deepEqual(gaitEvents(0, 3 * TAU), ['L', 'R', 'L', 'R', 'L', 'R']);
  // sem avanço → sem eventos
  assert.deepEqual(gaitEvents(1.234, 1.234), []);
  // fase negativa (voltou no tempo) não inventa passos
  assert.deepEqual(gaitEvents(TAU, 0), []);
});

test('cadência monotônica e compatível com a legada W=8.6+2.2·sn', () => {
  let prev = -1;
  for (const sn of [.2, .4, .6, .8, 1, 1.2]) {
    // cadência (ciclos/s) = v / strideLen, v = 5.2·sn
    const cadence = (SPEED_REF_MPS * sn) / strideLengthM(sn);
    assert.ok(cadence > prev, `cadência deve crescer: ${sn} → ${cadence.toFixed(3)}`);
    prev = cadence;
  }
  // no cruise (sn=.8) a cadência NOVA reproduz a legada (transição invisível)
  const legacyW = 8.6 + 2.2 * .8;
  const newCadence = (SPEED_REF_MPS * .8) / strideLengthM(.8);
  assert.ok(Math.abs(newCadence * TAU - legacyW) < .01, `nova=${(newCadence * TAU).toFixed(3)} legada=${legacyW.toFixed(3)}`);
});

// ----_DELAY ADAPTATIVO / ÂNGULO / EWMA --------------------------------------
test('delay adaptativo: limites e resposta a jitter/RTT', () => {
  assert.equal(adaptiveDelayMs({ jitterMs: 0, rttMs: 60 }), 110);   // baseline
  assert.equal(adaptiveDelayMs({ jitterMs: 0, rttMs: 0 }), 110);    // rtt falso → sem folga
  assert.ok(adaptiveDelayMs({ jitterMs: 40, rttMs: 60 }) > 110, 'jitter aprofunda');
  assert.ok(adaptiveDelayMs({ jitterMs: 0, rttMs: 200 }) > 110, 'rtt alto aprofunda');
  assert.equal(adaptiveDelayMs({ jitterMs: 500, rttMs: 400 }), 240, 'teto');
  assert.equal(adaptiveDelayMs({ jitterMs: -50, rttMs: 10 }), 110, 'negativos não reduzem a base');
});

test('angleLerp: arco mais curto nas bordas ±π', () => {
  assert.ok(Math.abs(angleLerp(3.1, -3.1, .5) - Math.PI) < 1e-9);   // cruza π (não -2π)
  assert.ok(Math.abs(angleLerp(-3.1, 3.1, .5) + Math.PI) < 1e-9);   // caminho de volta
  assert.equal(angleLerp(1, 2, 0), 1);
  assert.equal(angleLerp(1, 2, 1), 2);
  assert.equal(angleLerp(1, 2, 5), 2);                              // clamp
});

test('ewma e speedNormFromMps: convergência e clamp', () => {
  assert.equal(ewma(NaN, 5, .2), 5);                                // 1ª amostra absorvida
  let s = 0;
  for (let i = 0; i < 200; i++) s = ewma(s, 10, .1);
  assert.ok(Math.abs(s - 10) < .01, `convergiu: ${s.toFixed(4)}`);
  assert.equal(speedNormFromMps(SPEED_REF_MPS), 1);
  assert.equal(speedNormFromMps(999), 1.25);                        // teto sprint+
  assert.equal(speedNormFromMps(-3), 0);                            // recuo não anima
});

// ---- INTEGRAÇÃO COM O RIG (entities3d.animateOperative) ---------------------
test('animateOperative: phase externa reproduz o regime legado t·W (1:1)', async () => {
  const ctx2d = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
    moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
    save() {}, restore() {}, translate() {}, fillText() {},
    measureText() { return { width: 10 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    getImageData() { return { data: new Uint8ClampedArray(4).fill(128) }; },
    putImageData() {}, createImageData() { return { data: new Uint8ClampedArray(4) }; },
  };
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
  }
  const { createOperative, animateOperative } = await import('../src/game3d/entities3d.js');
  const a = createOperative(0, { operativeId: 'talon' });
  const b = createOperative(0, { operativeId: 'talon' });
  const sn = .9, tEq = 2.31, W = 8.6 + 2.2 * sn;
  animateOperative(a.parts, { t: tEq, speedNorm: sn });
  animateOperative(b.parts, { t: 0, phase: tEq * W, speedNorm: sn });  // MESMA fase
  const hipA = a.parts.legL.hip.rotation.x, hipB = b.parts.legL.hip.rotation.x;
  assert.ok(Math.abs(hipA - hipB) < 1e-9, `phase externa == legado: ${hipA} vs ${hipB}`);
  // fallback: sem phase → inalterado (regressão legada)
  const c = createOperative(0, { operativeId: 'talon' });
  animateOperative(c.parts, { t: tEq, speedNorm: sn });
  assert.equal(c.parts.legL.hip.rotation.x, hipA);
  // juntas finitas com phase avançada arbitrariamente (horas de jogo)
  animateOperative(b.parts, { t: 0, phase: 987654.321, speedNorm: sn });
  assert.ok(Number.isFinite(b.parts.torso.rotation.z));
});

// ---- INTEGRAÇÃO NETCODE (delay adaptativo no cliente 3D) --------------------
test('NetClient3D: recommendedDelay sobe com jitter de chegada simulado', async () => {
  // NetClient3D usa localStorage/WebSocket — stub mínimo antes do import
  if (typeof globalThis.localStorage === 'undefined') {
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  }
  globalThis.WebSocket ??= class { close() {} send() {} };
  const { NetClient3D } = await import('../src/game3d/net3d.js');
  const net = new NetClient3D({});
  assert.equal(net.recommendedDelay(), 110, 'baseline sem telemetria');
  // chegadas com ±30 ms de desvio → jitter EWMA sobe → delay sobe
  const t0 = performance.now();
  for (let i = 0; i < 40; i++) {
    net.push({ seq: i, player: null, others: [] });
    net.arrival.last = (net.arrival.last ?? t0) + (i % 2 ? 80 : 20); // simula jitter
  }
  const d = net.recommendedDelay();
  assert.ok(d > 110 && d <= 240, `delay adaptativo=${d}`);
  // interpolação sem argumento usa o delay adaptativo (não lança)
  const view = net.interpolate();
  assert.ok(view === null || typeof view === 'object');
});

// ---- Task 66: EWMA da amplitude independente de FPS -------------------------
test('Task 66: amplitude (state.speed) converge em TEMPO fixo, não por frame', () => {
  // mesma corrida de 2 s de parede: 20 frames de dt=.1 (máquina lenta) vs
  // 120 frames de dt=1/60 (60 fps) — o regime final deve ser o MESMO
  // (antes: por-frame alpha .18 deixava a máquina lenta ~2.5× mais atrás).
  const v = 7.384;                                   // sprint ≈ speedNorm 1.42→clamp 1.25
  const slow = newGait(); const fast = newGait();
  slow.px = 0; slow.pz = 0; fast.px = 0; fast.pz = 0;
  for (let i = 0; i < 20; i++) advanceGait(slow, { x: (i + 1) * v * .1, z: 0, dt: .1 });
  for (let i = 0; i < 120; i++) advanceGait(fast, { x: (i + 1) * v / 60, z: 0, dt: 1 / 60 });
  assert.ok(Math.abs(slow.speed - fast.speed) < .02,
    `lenta=${slow.speed.toFixed(3)} rápida=${fast.speed.toFixed(3)} — divergência > .02`);
  assert.ok(slow.speed > 1.15, `amplitude em 2 s deve ter chegado ao regime (=${slow.speed.toFixed(3)})`);
});
test('Task 66: arrancada — amplitude em .3 s já cobre >70% do regime (sem patinar no início)', () => {
  const v = 5.2;
  const g = newGait(); g.px = 0; g.pz = 0;
  const frames = Math.round(.3 * 60);
  for (let i = 0; i < frames; i++) advanceGait(g, { x: (i + 1) * v / 60, z: 0, dt: 1 / 60 });
  assert.ok(g.speed > speedNormFromMps(v) * .7,
    `speed após .3 s = ${g.speed.toFixed(3)} (regime ${speedNormFromMps(v).toFixed(2)})`);
});
