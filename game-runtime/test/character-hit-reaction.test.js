// Fase 10 — reação de impacto ao levar dano (hit reaction direcional).
// Valida em node puro: flinch ADITIVO sobre a pose base (sem hit = pose intacta),
// direcionalidade (frente/costas/lados produzem sinais opostos), envelope
// ataque-decay (pico em ~2 frames, decaimento exponencial), respeito às poses
// especiais (knocked/dead ignoram), regime de arma preservado e juntas finitas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// ---- stub de Canvas2D (createOperative → textures3d desenha em <canvas>) ----
const ctx2d = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
  moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
  save() {}, restore() {}, translate() {}, fillText() {},
  measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(128) }; },
  putImageData() {},
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}

const { createOperative, animateOperative } = await import('../src/game3d/entities3d.js');

// snapshot de todas as transformadas animáveis
const snapshot = (parts) => {
  const j = (o) => ({ x: o.rotation.x, y: o.rotation.y, z: o.rotation.z, px: o.position.x, py: o.position.y });
  return {
    torso: j(parts.torso), head: j(parts.head),
    armLs: j(parts.armL.shoulder), armRs: j(parts.armR.shoulder),
    armLe: j(parts.armL.elbow), armRe: j(parts.armR.elbow),
    legLh: j(parts.legL.hip), legRh: j(parts.legR.hip),
  };
};
const BASE = { t: 1.37, speedNorm: .8, pitch: .05 }; // corrida em regime

const posed = (hit) => {
  const { parts } = createOperative({ variant: 'onith' });
  for (let i = 0; i < 30; i++) animateOperative(parts, { ...BASE, t: BASE.t + i / 30 }); // warm-up
  animateOperative(parts, { ...BASE, hit });
  return snapshot(parts);
};

test('sem hit = pose intocada: hit:null e ausência do parâmetro são equivalentes', () => {
  const a = posed(undefined);
  const b = posed(null);
  assert.deepEqual(b, a, 'assinatura retrocompatível — nada muda sem impacto');
});

test('direcionalidade: frente empurra o tronco p/ trás, costas p/ frente', () => {
  const front = posed({ angle: 0, power: 1, age: .05 });
  const back = posed({ angle: Math.PI, power: 1, age: .05 });
  const base = posed(null);
  const dFront = front.torso.x - base.torso.x;
  const dBack = back.torso.x - base.torso.x;
  assert.ok(dFront > .15, `impacto frontal dobra o tronco p/ trás (Δ${dFront.toFixed(3)})`);
  assert.ok(dBack < -.15, `impacto nas costas dobra p/ frente (Δ${dBack.toFixed(3)})`);
  assert.ok(Math.abs(dFront + dBack) < .05, 'simetria frente/costas');
  // cabeça solavanco na mesma direção
  assert.ok(front.head.x - base.head.x > .1, 'cabeça estala para trás no tiro frontal');
});

test('direcionalidade lateral: +x e -x torcem tronco/cabeça em sinais opostos', () => {
  const right = posed({ angle: Math.PI / 2, power: 1, age: .05 });   // lado +x do modelo
  const left = posed({ angle: -Math.PI / 2, power: 1, age: .05 });
  const base = posed(null);
  const dR = right.torso.y - base.torso.y;
  const dL = left.torso.y - base.torso.y;
  assert.ok(dR > .15, `torção de esquiva no lado +x (Δ${dR.toFixed(3)})`);
  assert.ok(dL < -.15, `torção espelhada no lado -x (Δ${dL.toFixed(3)})`);
  assert.ok(Math.abs(dR + dL) < .05, 'simetria lateral');
  const hR = right.head.y - base.head.y;
  const hL = left.head.y - base.head.y;
  assert.ok(hR > .2 && hL < -.2, 'cabeça solavanco lateral com sinais opostos');
  // empurrão do corpo segue a bala (−x no impacto do lado +x)
  assert.ok(right.torso.px - base.torso.px < -0.02, 'corpo empurrado na direção do tiro');
  // braços abrem em sobressalto (direita para fora no impacto do lado +x)
  assert.ok(right.armRs.z - base.armRs.z < -0.05, 'braço direito abre');
  assert.ok(right.armLs.z - base.armLs.z > 0.05, 'braço esquerdo abre');
});

test('envelope: pico no ataque (~2 frames) e decaimento exponencial depois', () => {
  const base = posed(null);
  const mag = (age) => {
    const s = posed({ angle: 0, power: 1, age });
    return Math.abs(s.torso.x - base.torso.x);
  };
  assert.equal(mag(0), 0, 'age 0 = env 0 (ataque ainda não começou)');
  const peak = mag(.06);
  const mid = mag(.12);
  const late = mag(.3);
  assert.ok(peak > .25, `pico forte no fim do ataque (${peak.toFixed(3)})`);
  assert.ok(mid < peak && mid > .1, `decai (t+.06: ${mid.toFixed(3)})`);
  assert.ok(late < peak / 3, `quase apagado em .3 s (${late.toFixed(4)} < ${(peak / 3).toFixed(3)})`);
  // power escala linearmente; power 0 = nada
  assert.equal(mag(-1), 0, 'age negativo tratado como 0');
  const half = posed({ angle: 0, power: .5, age: .06 });
  assert.ok(Math.abs((half.torso.x - base.torso.x) - peak / 2) < .02, 'power .5 = metade do flinch');
  assert.equal(mag(0) || (posed({ angle: 0, power: 0, age: .05 }).torso.x - base.torso.x), 0, 'power 0 = sem flinch');
});

test('poses especiais ignoram o flinch (knocked rasteja, morto decai igual)', () => {
  const crawlA = createOperative({ variant: 'onith' });
  const crawlB = createOperative({ variant: 'onith' });
  animateOperative(crawlA.parts, { t: 2, speedNorm: 0, knocked: true });
  animateOperative(crawlB.parts, { t: 2, speedNorm: 0, knocked: true, hit: { angle: 1.2, power: 1, age: .02 } });
  assert.deepEqual(snapshot(crawlB.parts), snapshot(crawlA.parts), 'rastejo DBNO sem flinch');
  const deadA = createOperative({ variant: 'onith' });
  const deadB = createOperative({ variant: 'onith' });
  animateOperative(deadA.parts, { t: 3, speedNorm: 0, dead: true });
  animateOperative(deadB.parts, { t: 3, speedNorm: 0, dead: true, hit: { angle: 0, power: 1, age: .02 } });
  assert.deepEqual(snapshot(deadB.parts), snapshot(deadA.parts), 'corpo morto sem flinch');
});

test('regime de arma preservado: flinch não arranca os braços da pose de tiro', () => {
  const base = posed(null);
  const hit = posed({ angle: Math.PI / 2, power: 1, age: .05 });
  const aim = -Math.PI / 2 + BASE.pitch;
  // ombro NÃO é tocado no eixo x (só z) — mira intacta
  assert.ok(Math.abs(hit.armRs.x - base.armRs.x) < 1e-9, 'shoulder.x intocado pelo flinch');
  assert.ok(Math.abs(hit.armRs.x - (aim + .18)) < .32, 'braço segue na pose de arma');
  // cotovelo recua no máximo .18 rad + base
  const dElbow = Math.abs(hit.armRe.x - base.armRe.x);
  assert.ok(dElbow <= .19 + 1e-9, `cotovelo desloca ≤ .19 (Δ${dElbow.toFixed(3)})`);
});

test('juntas finitas com flinch extremo e ângulos arbitrários', () => {
  const { parts } = createOperative({ variant: 'vrekai' });
  for (let i = 0; i < 20; i++) {
    animateOperative(parts, {
      ...BASE, t: i / 30,
      hit: { angle: (i / 20) * Math.PI * 2, power: 5, age: i / 60 }, // power clampado internamente
    });
    for (const j of [parts.torso, parts.head, parts.armL.shoulder, parts.armR.elbow, parts.legL.hip]) {
      assert.ok(Number.isFinite(j.rotation.x + j.rotation.y + j.rotation.z), 'sem NaN/∞');
    }
  }
});

test('determinismo: mesmo hit → mesma pose (sem Math.random)', () => {
  const a = posed({ angle: .7, power: .9, age: .08 });
  const b = posed({ angle: .7, power: .9, age: .08 });
  assert.deepEqual(b, a);
});
