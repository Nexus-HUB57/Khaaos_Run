// Task 56 — locomoção humana: blender determinístico + fase de passada integrada.
// Fecha o último tell do "movimento robótico": trocar andar↔sprint NÃO pode
// teleportar a pose (fase da passada é integrada, não derivada do relógio) e o
// sprint ABAIXA a arma (low-ready) sem violar o regime de tiro em andar.
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

const { createLocomotionBlend, strideFrequency, STRIDE } = await import('../src/game3d/locomotion3d.js');
const { animateOperative, createOperative, poseWeaponSprint } = await import('../src/game3d/entities3d.js');

test('strideFrequency: contínua, monotônica e clampada ao teto do sprint', () => {
  assert.equal(strideFrequency(0), STRIDE.baseW, 'repouso = cadência base (contrato Fase 16)');
  assert.equal(strideFrequency(1.2), STRIDE.baseW + STRIDE.sprintGain * 1.2);
  assert.equal(strideFrequency(9), strideFrequency(STRIDE.maxSn), 'clamp no teto');
  assert.equal(strideFrequency(-3), STRIDE.baseW, 'negativo → repouso');
  let prev = strideFrequency(0);
  for (let s = 0; s <= 1.4; s += .05) {
    const f = strideFrequency(s);
    assert.ok(f >= prev - 1e-9, `monotônica em s=${s.toFixed(2)}`);
    prev = f;
  }
});

test('blender: determinístico e simétrico entre instâncias', () => {
  const run = () => {
    const b = createLocomotionBlend();
    const out = [];
    const seq = [0, 0, .8, .8, .8, 1.2, 1.2, 1.2, 0, 0, 0];
    for (const tgt of seq) out.push(b.update(1 / 30, tgt));
    return out;
  };
  const a = run(), c = run();
  assert.deepEqual(a, c, 'mesma sequência → mesmos outputs (sem Math.random)');
  assert.equal(a[0].speedNorm, 0);
  assert.ok(a[5].speedNorm > .3 && a[5].speedNorm < 1.2, 'acelerando entre estados (suavizado, não snappa)');
});

test('blender: aceleração mais rápida que frenagem (peso do corpo)', () => {
  const up = createLocomotionBlend();
  for (let i = 0; i < 30; i++) up.update(1 / 30, 1.2);        // 1 s subindo
  const down = createLocomotionBlend();
  for (let i = 0; i < 15; i++) down.update(1 / 30, 1.2);
  for (let i = 0; i < 15; i++) down.update(1 / 30, 0);        // .5 s caindo
  const tUp = up.update(1 / 30, 1.2).speedNorm;
  const tDown = down.update(1 / 30, 0).speedNorm;
  assert.ok(tUp > 1.1, `aceleração cobre o sprint em ~1 s (${tUp.toFixed(3)})`);
  assert.ok(tDown < .35, `frenagem assenta rápido (${tDown.toFixed(3)})`);
  assert.ok(tDown > 0, 'frenagem é contínua, não snappa a zero');
});

test('blender: fase CONGELA parado e integra contínua em movimento', () => {
  const b = createLocomotionBlend();
  const p0 = b.update(1 / 60, 0).phase;
  for (let i = 0; i < 60; i++) b.update(1 / 60, 0);           // 1 s parado
  assert.equal(b.update(1 / 60, 0).phase, p0, 'parado não deriva fase (sem passos fantasmas)');
  let last = p0;
  let backward = false;
  for (let i = 0; i < 180; i++) {                              // 3 s: anda → sprint → para
    const tgt = i < 60 ? .8 : (i < 120 ? 1.2 : 0);
    const { phase } = b.update(1 / 60, tgt);
    if (phase < last - 1e-9) backward = true;
    last = phase;
  }
  assert.ok(!backward, 'fase nunca anda para trás (nem salta) ao trocar de estado');
  assert.ok(last > 20, `fase integrou ao longo do movimento (${last.toFixed(1)} rad — parado seria 0)`);
});

test('sem salto de junta: troca brusca 0→1.2→0 pelo blender mantém continuidade (< .28 rad/frame @30 Hz)', () => {
  const op = createOperative({ variant: 'LOCO_CONT' });
  const joints = [op.parts.legL.hip, op.parts.legR.hip, op.parts.legL.knee, op.parts.legR.knee,
    op.parts.armL.shoulder, op.parts.armR.shoulder, op.parts.armL.elbow, op.parts.armR.elbow];
  const blend = createLocomotionBlend();
  const DT = 1 / 30;
  for (let i = 0; i < 30; i++) {                              // warm-up ANIMADO: sai da pose de repouso
    const { speedNorm, phase } = blend.update(DT, 0);
    animateOperative(op.parts, { t: i * DT, speedNorm, phase });
  }
  const prev = joints.map((j) => j.rotation.x);
  for (let i = 0; i < 150; i++) {
    const tgt = i < 60 ? 1.2 : 0;                              // sprint → freia BRUSCAMENTE
    const { speedNorm, phase, sprintK } = blend.update(DT, tgt);
    animateOperative(op.parts, { t: i * DT, speedNorm, phase, sprintK });
    joints.forEach((j, k) => {
      const d = Math.abs(j.rotation.x - prev[k]);
      assert.ok(Number.isFinite(d), 'rotação finita');
      assert.ok(d < .28, `Δ${k} por frame ${d.toFixed(4)} < .28 (junta idx ${k}, frame ${i})`);
      prev[k] = j.rotation.x;
    });
  }
});

test('contrato de andar preservado: speedNorm ≤ 1 mantém braço na mira (sprintK = 0)', () => {
  const op = createOperative({ variant: 'LOCO_WALK' });
  for (let i = 0; i < 40; i++) {
    const ret = animateOperative(op.parts, { t: i / 30, speedNorm: 1 });
    assert.equal(ret.sprintK, 0, `sprintK 0 em andar (frame ${i})`);
  }
  const aim = -Math.PI / 2;
  assert.ok(Math.abs(op.parts.armR.shoulder.rotation.x - (aim + .18)) < .32, 'direito preso ao regime de tiro');
  assert.ok(Math.abs(op.parts.armL.shoulder.rotation.x - (aim + .34)) < .32, 'esquerdo preso ao regime de tiro');
});

test('sprint abaixa a arma: speedNorm 1.2 (steady pelo blender) → low-ready visível', () => {
  const op = createOperative({ variant: 'LOCO_SPRINT' });
  const blend = createLocomotionBlend();
  for (let i = 0; i < 90; i++) {
    const { speedNorm, phase } = blend.update(1 / 30, 1.2);
    animateOperative(op.parts, { t: i / 30, speedNorm, phase });
  }
  const ret = animateOperative(op.parts, { t: 3, speedNorm: blend.speed, phase: blend.phase, sprintK: blend.sprintK });
  assert.ok(ret.sprintK > .9, `sprintK saturado no sprint (${ret.sprintK.toFixed(3)})`);
  const aim = -Math.PI / 2;
  assert.ok(op.parts.armR.shoulder.rotation.x > aim + .18 + .5, 'braço direito abaixou (low-ready)');
  assert.ok(op.parts.armL.elbow.rotation.x > -.85 + .2, 'cotovelo de suporte dobra mais');
  // ADS cancela o low-ready mesmo em sprint
  const retAds = animateOperative(op.parts, { t: 3.1, speedNorm: 1.2, phase: blend.phase, sprintK: blend.sprintK, ads: true });
  assert.equal(retAds.sprintK, 0, 'ADS força regime de tiro');
  assert.ok(Math.abs(op.parts.armR.shoulder.rotation.x - (aim + .18)) < .35, 'braço volta à mira no ADS');
});

test('poseWeaponSprint: arma acompanha o low-ready e restaura a base (idempotente)', () => {
  const g = { position: { x: .3, y: 1.4, z: -.25 }, rotation: { x: 0, y: 0, z: 0 }, userData: {} };
  const rig = { group: g };
  poseWeaponSprint(rig, 0);
  assert.equal(g.rotation.x, 0, 'k=0 não altera a postura');
  poseWeaponSprint(rig, 1);
  assert.ok(Math.abs(g.rotation.x + .48) < 1e-9, 'cano abaixa');
  assert.ok(Math.abs(g.rotation.y - .3) < 1e-9, 'cruzada no peito');
  assert.ok(g.position.y < 1.4 && g.position.z > -.25, 'arma puxada para o corpo');
  const after = { rx: g.rotation.x, py: g.position.y, pz: g.position.z };
  poseWeaponSprint(rig, 1);
  assert.deepEqual({ rx: g.rotation.x, py: g.position.y, pz: g.position.z }, after, 'idempotente (sem drift)');
  poseWeaponSprint(rig, 0);
  assert.equal(g.position.y, 1.4, 'restaura a base gravada');
  poseWeaponSprint(null, 1); // não explode
});

test('rig FP orgânico: braços em cápsula com base gravada, mãos intactas e tintable preservado', async () => {
  const { createFirstPersonRig } = await import('../src/game3d/entities3d.js');
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
