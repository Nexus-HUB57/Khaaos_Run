// Task 62 — ARMA NAS MÃOS: contrato da solda punho↔grip + rastreio de pitch.
// A arma é montada num grupo filho do COTOVELO DIREITO; animateOperative
// posiciona o mount a cada frame (position = luva − R·grip, exata por
// construção) e orienta o CANO pelo pitch de mira (+ queda por regime).
// Headless-safe: THREE puro, sem document/renderer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

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

const { createOperative, animateOperative, attachWeapon } = await import('../src/game3d/entities3d.js');

// arma-no-punho: distância 3D mundo entre o GRIP da arma e a LUVA do punho
function gripToHandDistance(op) {
  op.group.updateMatrixWorld(true);
  const rig = op.group.userData.weaponRig;
  const grip = rig.gripW.clone();
  rig.group.localToWorld(grip);                       // grip em mundo
  const hand = rig.group.userData.handWorld ?? null;  // preenchido abaixo
  const elbow = op.parts.armR.elbow;
  const handW = new THREE.Vector3(.026, -.31, 0);
  elbow.localToWorld(handW);                          // luva em mundo
  return { dist: grip.distanceTo(handW), hand, handW, rig };
}

test('attachWeapon: a arma vive NO COTOVELO DIREITO (mount), não mais no root', () => {
  const op = createOperative({ variant: 'T62_GRIP' });
  const rig = attachWeapon(op.parts, op.group, 'ar47');
  assert.ok(rig.mount, 'mount criado');
  assert.equal(rig.mount.parent, op.parts.armR.elbow, 'mount é filho do cotovelo direito');
  assert.equal(rig.group.parent, rig.mount, 'arma dentro do mount');
  assert.equal(op.group.userData.weaponRig, rig, 'compat weaponRig preservada');
  assert.equal(op.parts.weaponRig, rig, 'parts.weaponRig p/ animateOperative');
  assert.ok(rig.gripW instanceof THREE.Vector3, 'gripW definido (família rifle)');
  assert.ok(rig.magW instanceof THREE.Vector3, 'magW definido (apoio)');
});

test('solda punho↔grip é exata: grip da arma a < 1 mm da luva, em qualquer pose', () => {
  const op = createOperative({ variant: 'T62_WELD' });
  attachWeapon(op.parts, op.group, 'ar47');
  for (const opts of [
    { t: 0, speedNorm: 0, pitch: 0, sprintK: 0 },
    { t: 1.3, speedNorm: .9, phase: 9, pitch: .55, sprintK: 0 },
    { t: 2.7, speedNorm: .8, phase: 21, pitch: -.7, sprintK: 0 },
    { t: 3.9, speedNorm: .4, phase: 33, pitch: .2, ads: true },
  ]) {
    animateOperative(op.parts, opts);
    op.group.updateMatrixWorld(true);
    const rig = op.group.userData.weaponRig;
    const gripW = rig.gripW.clone();
    rig.group.localToWorld(gripW);
    const handW = new THREE.Vector3(.026, -.31, 0);
    op.parts.armR.elbow.localToWorld(handW);
    const d = gripW.distanceTo(handW);
    assert.ok(d < 1e-3, `grip na luva (${opts.pitch}): ${(d * 1000).toFixed(3)} mm`);
  }
});

test('cano rastreia o pitch de mira (ready −.32; ADS nível; sprint low-ready)', () => {
  const op = createOperative({ variant: 'T62_PITCH' });
  attachWeapon(op.parts, op.group, 'ar47');
  const barrelPitch = () => {
    op.group.updateMatrixWorld(true);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(op.group.userData.weaponRig.group.getWorldQuaternion(new THREE.Quaternion()));
    return Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  };
  const D = 180 / Math.PI;
  animateOperative(op.parts, { t: 0, speedNorm: 0, pitch: 0, sprintK: 0 });
  assert.ok(Math.abs(barrelPitch() * D + 18.3) < 2.5, `ready: cano a −18.3° (${(barrelPitch() * D).toFixed(1)}°)`);
  animateOperative(op.parts, { t: .1, speedNorm: 0, pitch: .5, sprintK: 0 });
  assert.ok(Math.abs(barrelPitch() * D - 10.3) < 3, `mira ↑: cano sobe com o pitch (${(barrelPitch() * D).toFixed(1)}°)`);
  animateOperative(op.parts, { t: .2, speedNorm: 0, pitch: -.4, ads: true });
  assert.ok(Math.abs(barrelPitch() * D - (-24.1)) < 3, `ADS acompanha mira ↓ (${(barrelPitch() * D).toFixed(1)}°)`);
  animateOperative(op.parts, { t: .3, speedNorm: 0, pitch: 0, sprintK: 1 });
  assert.ok(barrelPitch() * D < -45, `sprint: low-ready (${(barrelPitch() * D).toFixed(1)}°)`);
});

test('mão de suporte desliza até a arma (IK fake ≤ .35 m) e nunca drifta', () => {
  const op = createOperative({ variant: 'T62_SUPPORT' });
  attachWeapon(op.parts, op.group, 'ar47');
  animateOperative(op.parts, { t: .4, speedNorm: .6, phase: 12 });
  const hand = op.parts.armL.hand;
  const shift = hand.glove.position.clone().sub(hand.glove.userData.gripBase);
  assert.ok(shift.length() > .01, 'luva se moveu em direção à arma');
  assert.ok(shift.length() <= .35 + 1e-9, `deslocamento limitado (${shift.length().toFixed(3)} m)`);
  const snap1 = hand.glove.position.clone();
  animateOperative(op.parts, { t: .4, speedNorm: .6, phase: 12 });
  assert.ok(hand.glove.position.distanceTo(snap1) < 1e-9, 'idempotente (sem drift)');
});

test('troca de arma descarta o mount antigo e mantém a solda', () => {
  const op = createOperative({ variant: 'T62_SWAP' });
  const first = attachWeapon(op.parts, op.group, 'ar47');
  const oldMount = first.mount;
  animateOperative(op.parts, { t: 0, speedNorm: 0 });
  const second = attachWeapon(op.parts, op.group, 'mp5');
  assert.notEqual(second, first, 'novo rig');
  assert.equal(oldMount.parent, null, 'mount antigo removido da hierarquia');
  assert.equal(second.mount.parent, op.parts.armR.elbow, 'novo mount no cotovelo');
  assert.ok(second.gripW.equals(first.gripW), 'família rifle compartilha o grip');
  animateOperative(op.parts, { t: .1, speedNorm: 0, sprintK: 0 }); // próximo frame re-solda
  op.group.updateMatrixWorld(true);
  const gripW = second.gripW.clone();
  second.group.localToWorld(gripW);
  const handW = new THREE.Vector3(.026, -.31, 0);
  op.parts.armR.elbow.localToWorld(handW);
  assert.ok(gripW.distanceTo(handW) < 1e-3, 'solda intacta após a troca');
});

test('operativo sem arma: luva esquerda permanece na base (IK fake não vaza)', () => {
  const op = createOperative({ variant: 'T62_NOGUN' });
  animateOperative(op.parts, { t: .5, speedNorm: .7, phase: 15 });
  const hand = op.parts.armL.hand;
  assert.ok(hand.glove.position.distanceTo(hand.glove.userData.gripBase) < 1e-9, 'luva na base sem weaponRig');
});
