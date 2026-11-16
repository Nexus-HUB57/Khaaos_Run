// Task 68 — CAMADA HUMANA DE LOCOMOÇÃO (passos/corrida com aspecto natural):
// validação da matemática PURA (humanGaitPose) e da integração no
// animateHumanoid (bones fake + mixer fiel — mesma base do t64/t65).
// Contratos: contra-rotação exata, gates de locomoção/arma, postura de
// corrida, elevação sem enterrar pés, determinismo, e aplicação real nos bones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const {
  humanGaitPose, poseHumanGait, HUMAN_GAIT, animateHumanoid,
} = await import('../src/game3d/humanoid3d.js');

const TAU = 2 * Math.PI;
const EPS = 1e-9;

// ---- fábricas (padrão t64: THREE puro headless) ------------------------------
function node(name, parent = null) {
  const n = new THREE.Object3D();
  n.name = name;
  if (parent) parent.add(n);
  return n;
}
function fakeBody() {
  const root = node('root');
  const bones = {};
  for (const k of ['hips', 'spine1', 'spine2', 'head', 'leftarm', 'rightarm', 'leftforearm', 'rightforearm', 'leftleg', 'rightleg']) {
    bones[k] = node(k, root);
  }
  return { root, bones };
}
function fakeAnimatedEntry() {
  const body = fakeBody();
  const rest = {};
  for (const [k, b] of Object.entries(body.bones)) {
    rest[k] = { q: b.quaternion.clone(), p: b.position.clone() };
  }
  const mixer = {                       // clips reescrevem a pose absoluta por frame
    update() {
      for (const [k, b] of Object.entries(body.bones)) {
        b.quaternion.copy(rest[k].q);
        b.position.copy(rest[k].p);
        b.rotation.set(0, 0, 0);
      }
    },
  };
  const clip = { duration: 1 };
  const mkAction = () => ({
    clip, enabled: true, paused: true, weight: 0, time: 0,
    setEffectiveWeight(w) { this.weight = w; },
    getClip() { return clip; },
    play() {},
  });
  return {
    kind: 'humanoid', root: body.root, bones: body.bones, mixer,
    actions: { idle: mkAction(), walk: mkAction(), run: mkAction() },
    w: { idle: 1, walk: 0, run: 0 }, deadPose: false, host: null, weaponRig: null,
  };
}
// rotação Y de um bone (identity base + premultiply canônico → Euler exato)
const yawOf = (bone) => new THREE.Euler().setFromQuaternion(bone.quaternion, 'YXZ').y;

// ---- matemática PURA ----------------------------------------------------------
test('T68 · contra-rotação: ombros em oposição EXATA (1.4× a pelve)', () => {
  for (const ph of [0, .7, 1.6, 2.4, 3.1, 4.8, 5.9]) {
    const p = humanGaitPose({ phase: ph, sn: .6, t: 1, locomotion: 1 });
    assert.ok(Math.abs(p.spineYaw - (-HUMAN_GAIT.counterGain * p.hipsYaw)) < EPS,
      `fase ${ph}: spine=${p.spineYaw.toFixed(4)} hips=${p.hipsYaw.toFixed(4)}`);
  }
});
test('T68 · gates: parado (locomotion 0) zera TODOS os termos de marcha e mantém sway de idle', () => {
  const t = 2.85;                                  // sin(.55·t) ≈ 1
  const p = humanGaitPose({ phase: 1.3, sn: .6, t, locomotion: 0 });
  for (const k of ['hipsYaw', 'hipsRoll', 'hipsLift', 'spineYaw', 'runLean', 'armSwingL', 'armSwingR']) {
    assert.equal(p[k], 0, `${k} deve ser 0 parado`);
  }
  assert.ok(Math.abs(p.idleSway) > 0, `idleSway vivo (${p.idleSway.toFixed(4)})`);
  assert.ok(Math.abs(p.idleSway) <= HUMAN_GAIT.idleSwayAmp + EPS, 'sway dentro do teto');
});
test('T68 · arma soldada → braços pertencem ao grip (swing zero em qualquer fase)', () => {
  for (const ph of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
    const p = humanGaitPose({ phase: ph, sn: .6, t: 0, locomotion: 1, armed: true });
    assert.equal(p.armSwingL, 0, `armSwingL fase ${ph}`);
    assert.equal(p.armSwingR, 0, `armSwingR fase ${ph}`);
  }
  const pu = humanGaitPose({ phase: Math.PI / 2, sn: .6, t: 0, locomotion: 1, armed: false });
  assert.ok(Math.abs(pu.armSwingL) > 0, 'desarmado balança');
  assert.ok(Math.abs(pu.armSwingL) <= HUMAN_GAIT.armSwingAmp * (1 + HUMAN_GAIT.varyAmp * 0) + EPS,
    'swing dentro do teto (swing não tem vary)');
});
test('T68 · postura de corrida: só no regime de corrida (sn>.75) e com locomoção real', () => {
  const walk = humanGaitPose({ phase: 1, sn: .6, t: 0, locomotion: 1 });
  assert.equal(walk.runLean, 0, 'andar não inclina de cruzeiro');
  const run = humanGaitPose({ phase: 1, sn: 1.2, t: 0, locomotion: 1 });
  assert.ok(run.runLean > 0, `corrida inclina (${run.runLean.toFixed(3)})`);
  assert.ok(run.runLean <= HUMAN_GAIT.runLeanAmp + EPS, 'dentro do teto');
  assert.ok(run.runHeadComp < 0, 'cabeça compensa (olhar nível)');
  const parado = humanGaitPose({ phase: 1, sn: 1.2, t: 0, locomotion: 0 });
  assert.equal(parado.runLean, 0, 'sem locomoção não há postura de corrida');
});
test('T68 · elevação da pelve NUNCA desce abaixo do bind (pés não enterram)', () => {
  let max = -1, atZero = -1, atStrike = 1;
  for (let i = 0; i < 48; i++) {
    const p = humanGaitPose({ phase: (i / 48) * TAU, sn: 1.2, t: 0, locomotion: 1 });
    assert.ok(p.hipsLift >= -EPS, `fase ${(i / 48) * TAU .toFixed(2)}: lift=${p.hipsLift.toFixed(4)} ≥ 0`);
    max = Math.max(max, p.hipsLift);
    atZero = Math.max(atZero, i === 0 ? p.hipsLift : -1);
    atStrike = Math.min(atStrike, Math.abs(i === 12 ? p.hipsLift : 1));   // fase π/4·... π/2 = 12/48·TAU
  }
  assert.ok(atZero > 0, 'máximo no meio-de-apoio (fase 0)');
  assert.equal(atStrike, 0, 'zero no contato de calcanhar (fase π/2)');
  assert.ok(max <= HUMAN_GAIT.hipsLiftAmp + HUMAN_GAIT.hipsLiftRun + EPS, 'dentro do teto');
});
test('T68 · determinismo: mesmas entradas → mesma pose (zero Math.random)', () => {
  const a = humanGaitPose({ phase: 2.3, sn: .8, t: 4.2, locomotion: .7 });
  const b = humanGaitPose({ phase: 2.3, sn: .8, t: 4.2, locomotion: .7 });
  assert.deepEqual(b, a);
});
test('T68 · amplitude escala linearmente com o peso de locomoção (blend suave)', () => {
  const p1 = humanGaitPose({ phase: .9, sn: .6, t: 0, locomotion: 1 });
  const p5 = humanGaitPose({ phase: .9, sn: .6, t: 0, locomotion: .5 });
  assert.ok(Math.abs(p5.hipsYaw - p1.hipsYaw * .5) < EPS, 'hips ∝ loc');
  assert.ok(Math.abs(p5.spineYaw - p1.spineYaw * .5) < EPS, 'ombros ∝ loc');
});

// ---- integração no animateHumanoid (bones fake) -------------------------------
test('T68 · integração: andando, pelve gira e OMBROS CONTRA-RODAM nos bones reais', () => {
  const e = fakeAnimatedEntry();
  animateHumanoid(e, { t: 0, speedNorm: .6, phase: .9, dt: 1 / 60 });  // w.walk ≈ 1
  const hips = yawOf(e.bones.hips);
  const spine = yawOf(e.bones.spine1);
  assert.ok(Math.abs(hips) > 0, `pelve girou (y=${hips.toFixed(4)})`);
  assert.ok(Math.abs(spine) > 0, `ombros giraram (y=${spine.toFixed(4)})`);
  assert.ok(hips * spine < 0, `sinais OPOSTOS (hips=${hips.toFixed(4)} spine=${spine.toFixed(4)})`);
  const exp = humanGaitPose({ phase: .9, sn: .6, t: 0,
    locomotion: e.w.walk + e.w.run, armed: false });  // pesos BLENDED pós-chamada (EWMA α=.3)
  // referência: MESMA composição do aplicador (premultiply y depois z)
  const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), exp.hipsYaw);
  const qZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), exp.hipsRoll);
  const qRef = qZ.multiply(qY);
  assert.ok(qRef.angleTo(e.bones.hips.quaternion) < 1e-6, 'pelve = composição exata da matemática pura');
});
test('T68 · integração: parado, sem rotação de pelve mas COM transferência de peso', () => {
  const e = fakeAnimatedEntry();
  const t = 2.85;
  animateHumanoid(e, { t, speedNorm: 0, dt: 1 / 60 });
  assert.equal(yawOf(e.bones.hips), 0, 'pelve sem yaw no idle');
  const spine2 = new THREE.Euler().setFromQuaternion(e.bones.spine2.quaternion, 'YXZ').z;
  assert.ok(Math.abs(spine2 - humanGaitPose({ phase: 0, sn: 0, t, locomotion: 0 }).idleSway) < 1e-6,
    `sway de idle aplicado (z=${spine2.toFixed(4)})`);
});
test('T68 · integração: agachado a camada pula (poseCrouch comanda o quadril)', () => {
  const e = fakeAnimatedEntry();
  animateHumanoid(e, { t: 0, speedNorm: .6, phase: .9, crouch: true, dt: 1 / 60 });
  assert.equal(yawOf(e.bones.hips), 0, 'sem yaw de camada humana agachado');
  assert.ok(e.bones.hips.position.y < 0, 'crouch desce o quadril (contrato próprio)');
});
test('T68 · integração: arma soldada não recebe swing nos braços', () => {
  const e = fakeAnimatedEntry();
  const q0 = e.bones.leftarm.quaternion.clone();
  animateHumanoid(e, { t: 0, speedNorm: .6, phase: .9, armed: true, dt: 1 / 60 });
  assert.ok(q0.angleTo(e.bones.leftarm.quaternion) < 1e-12, 'braço esquerdo intocado pelo swing');
});
