// Task 65 — SINCRONIA DO AVATAR: testes canônicos das correções estruturais.
//   1. stripClipRootMotion — walk/run/shoot sem deslocamento do autor embutido;
//   2. bind-frame — poses aditivas em SEMÂNTICA DO CORPO (conjugação por bone);
//   3. placeOnBone — gear/cosméticos nascem no lugar certo em qualquer rig;
//   4. attachHumanoidToOperative — SUBÁRVORE de gear não dorme (bug dos oficiais);
//   5. syncHumanoidGear — visibilidade da subárvore restaurada.
// Headless-safe: THREE puro + esqueleto fake (mesma base dos testes humanoid3d).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// shim headless canônico do repo (módulos de rig usam canvas 2d procedural)
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

const {
  stripClipRootMotion,
  addRootRot,
  applyAddRot,
  applySetRot,
  addRootVec,
  placeOnBone,
  HUMANOID_MODEL_YAW,
  hipsRestTranslation,
  attachHumanoidToOperative,
  syncHumanoidGear,
} = await import('../src/game3d/humanoid3d.js');
const { buildHumanoidCosmetics } = await import('../src/game3d/humanoidCosmetics3d.js');

// ------------------------------------------------------------- helpers ----
// esqueleto fake com um bone "yawado 90°" (emula os rigs Tripo medidos: eixos
// locais NÃO canônicos) — prova que a conjugação devolve semântica de corpo.
function buildYawedSkeleton() {
  const pivot = new THREE.Group();               // entry.root (convenção −Z)
  const parent = new THREE.Bone();               // emula "Root" do glb
  parent.name = 'Root';
  parent.rotation.y = Math.PI / 2;               // bone-local yawado
  const spine1 = new THREE.Bone();
  spine1.name = 'spine1';
  spine1.position.set(0, .6, 0);
  parent.add(spine1);
  pivot.add(parent);
  pivot.updateMatrixWorld(true);
  return { pivot, parent, spine1 };
}

function bindFor(pivot, bones) {
  pivot.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
  const out = { q: {}, p: {}, l: {} };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3();
  for (const [k, bone] of Object.entries(bones)) {
    bone.updateWorldMatrix(true, false);
    m.multiplyMatrices(rootInv, bone.matrixWorld);
    m.decompose(pos, q, scl);
    out.q[k] = q.clone();
    out.p[k] = pos.clone();
    out.l[k] = bone.quaternion.clone();
  }
  return out;
}

function worldQuatIn(pivot, bone) {
  pivot.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
  const m = new THREE.Matrix4().multiplyMatrices(rootInv, bone.matrixWorld);
  const q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  m.decompose(pos, q, scl);
  return { q, pos };
}

const ANGLE_EPS = 1e-6;
function quatAngle(a, b) {
  const d = Math.abs(a.dot(b));
  return 2 * Math.acos(Math.min(1, d));
}

// ------------------------------------------------ 1 · root motion ----
test('T65 · stripClipRootMotion: deriva de Hips > .25 m vira translação de BIND constante', () => {
  const clip = new THREE.AnimationClip('run', 1.27, [
    new THREE.VectorKeyframeTrack('mixamorig:Hips.position', [0, .6, 1.27],
      [0.03, -0.53, .50, 0.03, -1.7, .50, 0.03, -2.9, .50]), // root motion embutido
    new THREE.QuaternionKeyframeTrack('mixamorig:Hips.quaternion', [0, 1.27],
      [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  stripClipRootMotion(clip, [0, 0, .501]);
  const t = clip.tracks[0];
  assert.equal(t.times.length, 2, 'in-place: 2 keyframes (início/fim)');
  const V = [...t.values];
  assert.ok(Math.abs(V[0]) < 1e-6 && Math.abs(V[1]) < 1e-6 && Math.abs(V[2] - .501) < 1e-3, `keyframe 1 = bind (${V.slice(0, 3)})`);
  assert.ok(Math.abs(V[3]) < 1e-6 && Math.abs(V[4]) < 1e-6 && Math.abs(V[5] - .501) < 1e-3, `keyframe 2 = bind (${V.slice(3, 6)})`);
  assert.equal(clip.tracks[0].values.length, 6, '3 componentes × 2 keyframes');
  assert.equal(clip.tracks[1].name, 'mixamorig:Hips.quaternion', 'rotações intocadas');
});

test('T65 · stripClipRootMotion: bob legítimo (idle ±.03) NÃO é tocado', () => {
  const clip = new THREE.AnimationClip('idle', 15.37, [
    new THREE.VectorKeyframeTrack('mixamorig:Hips.position', [0, 7, 15.37],
      [0, 0, .50, .02, .01, .501, 0, 0, .501]),
  ]);
  const before = clip.tracks[0].values.length;
  stripClipRootMotion(clip, [0, 0, .501]);
  assert.equal(clip.tracks[0].values.length, before, 'track preservado');
});

test('T65 · hipsRestTranslation: lê o Hips do asset; sem rig → fallback (0,0,.5)', () => {
  const g = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'mixamorig:Hips';
  hips.position.set(0, 0, .501);
  g.add(hips);
  assert.deepEqual(hipsRestTranslation(g), [0, 0, .501]);
  assert.deepEqual(hipsRestTranslation(new THREE.Group()), [0, 0, .5]);
});

// --------------------------------------------- 2 · bind-frame (poses) ----
test('T65 · applyAddRot em bone yawado 90°: pitch do CORPO continua sendo pitch no mundo', () => {
  const { pivot, spine1 } = buildYawedSkeleton();
  const bind = bindFor(pivot, { spine1 });
  const entry = { bones: { spine1 }, bind };
  const world0 = worldQuatIn(pivot, spine1).q;
  applyAddRot(entry, 'spine1', 'x', .5);         // pitch de mira em semântica do corpo
  pivot.updateMatrixWorld(true);
  const world1 = worldQuatIn(pivot, spine1).q;
  const qDes = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), .5);
  const delta = world1.clone().multiply(world0.clone().invert());
  assert.ok(quatAngle(delta, qDes) < 1e-4,
    `Δ mundial = R_x(pitch) mesmo com bone yawado (ângulo ${quatAngle(delta, qDes).toFixed(5)} rad)`);
});

test('T65 · applySetRot: pose absoluta em semântica do corpo substitui o clip', () => {
  const { pivot, spine1 } = buildYawedSkeleton();
  const bind = bindFor(pivot, { spine1 });
  const entry = { bones: { spine1 }, bind };
  applySetRot(entry, 'spine1', .35, 0, 0);
  pivot.updateMatrixWorld(true);
  const { q } = worldQuatIn(pivot, spine1);
  const qDes = new THREE.Quaternion().setFromEuler(new THREE.Euler(.35, 0, 0));
  assert.ok(quatAngle(q, qDes) < 1e-4, 'orientação MUNDIAL do bone = Euler do corpo');
});

test('T65 · sem bind (corpo fake de teste): helpers caem no eixo canônico direto', () => {
  const bone = new THREE.Bone();
  bone.name = 'spine1';
  const entry = { bones: { spine1: bone }, bind: null };
  const q = addRootRot(entry, 'spine1', 'x', .5);
  const qDes = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), .5);
  assert.ok(quatAngle(q, qDes) < ANGLE_EPS, 'fallback canônico');
  applyAddRot(entry, 'spine1', 'x', .5);
  assert.ok(Math.abs(bone.rotation.x - .5) < 1e-6, 'aplicado no bone');
  const v = addRootVec(entry, 'hips', 0, -.32, 0);
  assert.ok(Math.abs(v.y + .32) < 1e-6, 'Δ de posição preservado no fallback');
});

test('T65 · applyAddRot com ângulo 0/NaN é no-op (não acumula quaternions identidade)', () => {
  const bone = new THREE.Bone();
  bone.name = 'spine1';
  const entry = { bones: { spine1: bone }, bind: null };
  assert.equal(addRootRot(entry, 'spine1', 'x', 0), null);
  assert.equal(addRootRot(entry, 'spine1', 'x', NaN), null);
  const q0 = bone.quaternion.clone();
  applyAddRot(entry, 'spine1', 'x', 0);
  assert.ok(quatAngle(bone.quaternion, q0) < ANGLE_EPS, 'bone intocado');
});

// --------------------------------------- 3 · placeOnBone (gear/cosméticos) ----
test('T65 · placeOnBone: objeto nasce no ponto do CORPO em bone yawado 90°', () => {
  const { pivot, spine1 } = buildYawedSkeleton();
  const bind = bindFor(pivot, { spine1 });
  const entry = { bones: { spine1 }, bind };
  const g = new THREE.Group();
  const desired = new THREE.Vector3(.12, 1.3, -.05);   // metros do corpo
  entry.bones.spine1.add(g);                            // parentado antes de medir
  assert.equal(placeOnBone(entry, 'spine1', g, { pos: [.12, 1.3, -.05] }), true);
  pivot.updateMatrixWorld(true);
  const wp = g.getWorldPosition(new THREE.Vector3());
  assert.ok(wp.distanceTo(desired) < 1e-5, `posição mundial = desejada (Δ ${wp.distanceTo(desired).toFixed(7)} m)`);
  // orientação: frame do objeto alinhado ao CORPO (quaternion mundial = identidade)
  const wq = worldQuatIn(pivot, g).q;
  assert.ok(quatAngle(wq, new THREE.Quaternion()) < 1e-4, 'sem quat extra → alinhado ao corpo');
});

test('T65 · placeOnBone preserva quat de fábrica (gear canônico −z frente)', () => {
  const { pivot, spine1 } = buildYawedSkeleton();
  const bind = bindFor(pivot, { spine1 });
  const entry = { bones: { spine1 }, bind };
  const g = new THREE.Group();
  const factory = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
  g.quaternion.copy(factory);
  entry.bones.spine1.add(g);
  placeOnBone(entry, 'spine1', g, { pos: [0, 1.3, 0], quat: factory });
  pivot.updateMatrixWorld(true);
  const wq = worldQuatIn(pivot, g).q;
  assert.ok(quatAngle(wq, factory) < 1e-4, 'rotação de fábrica sobrevive no mundo');
});

test('T65 · placeOnBone sem bone/frame → false (no-op seguro)', () => {
  assert.equal(placeOnBone(null, 'head', new THREE.Group(), {}), false);
  assert.equal(placeOnBone({ bones: {} }, 'head', new THREE.Group(), {}), false);
  const entry = { bones: { head: new THREE.Bone() }, bind: null };
  assert.equal(placeOnBone(entry, 'head', new THREE.Group(), {}), false);
  assert.equal(placeOnBone(entry, 'head', null, {}), false);
});

test('T65 · HUMANOID_MODEL_YAW = π/2 (rigs Tripo olham +X; convenção do jogo = −Z)', () => {
  assert.equal(HUMANOID_MODEL_YAW, Math.PI / 2);
});

// --------------------------------- 4/5 · gear não dorme + subárvore viva ----
function fakeOpWithGear() {
  const group = new THREE.Group();
  const head = new THREE.Group();          // anchor procedural do capacete
  head.name = 'head';
  const gear = new THREE.Group();          // F28 — applyOperativeGear cria aqui
  gear.name = 'gear_helmet';
  const meshA = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1));
  const meshB = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1));
  gear.add(meshA, meshB);
  head.add(gear);
  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(.2, .5, .1)); // corpo procedural
  group.add(head, torsoMesh);
  return { group, parts: { head, torso: head }, gear, meshA, meshB, torsoMesh };
}

test('T65 · attachHumanoidToOperative: SUBÁRVORE de gear pré-existente continua visível', () => {
  const op = fakeOpWithGear();
  const body = { root: new THREE.Group(), bones: { head: new THREE.Bone() } };
  attachHumanoidToOperative({ group: op.group, parts: op.parts }, body);
  assert.equal(op.torsoMesh.visible, false, 'malha procedural dorme');
  assert.equal(op.gear.visible, true, 'grupo gear vive');
  assert.equal(op.meshA.visible, true, 'malha FILHA do gear vive (bug dos oficiais)');
  assert.equal(op.meshB.visible, true, '2ª malha filha vive');
});

test('T65 · syncHumanoidGear: re-ancora no bone e RESTAURA visibilidade da subárvore', () => {
  const op = fakeOpWithGear();
  // simula attach antigo (bug): malhas filhas dormindo
  op.meshA.visible = false; op.meshB.visible = false;
  const pivot = new THREE.Group();
  const headBone = new THREE.Bone();
  headBone.name = 'head';
  headBone.position.set(0, 1.49, 0);
  pivot.add(headBone);
  pivot.updateMatrixWorld(true);
  const body = { root: pivot, bones: { head: headBone }, bind: bindFor(pivot, { head: headBone }) };
  const moved = syncHumanoidGear(body, op.parts);
  assert.equal(moved, 1, 'capacete movido');
  assert.equal(op.gear.parent, headBone, 'gear vive NO BONE');
  assert.equal(op.meshA.visible, true, 'subárvore religada');
  assert.equal(op.meshB.visible, true, 'subárvore religada (2)');
  // posição mundial do capacete = âncora ABSOLUTA do corpo (topo do crânio)
  pivot.updateMatrixWorld(true);
  const wp = op.gear.getWorldPosition(new THREE.Vector3());
  const expected = new THREE.Vector3(0, 1.575, 0);
  assert.ok(wp.distanceTo(expected) < 1e-5, `capacete no topo do crânio (Δ ${wp.distanceTo(expected).toFixed(7)} m)`);
});

test('T65 · syncHumanoidGear idempotente (2ª passada não duplica nem move)', () => {
  const op = fakeOpWithGear();
  const pivot = new THREE.Group();
  const headBone = new THREE.Bone();
  headBone.name = 'head';
  headBone.position.set(0, 1.49, 0);
  pivot.add(headBone);
  const body = { root: pivot, bones: { head: headBone }, bind: bindFor(pivot, { head: headBone }) };
  syncHumanoidGear(body, op.parts);
  const count = () => headBone.children.filter((c) => c.name === 'gear_helmet').length;
  assert.equal(count(), 1);
  const moved2 = syncHumanoidGear(body, op.parts);
  assert.equal(moved2, 0, '2ª passada: nada a fazer');
  assert.equal(count(), 1, 'sem duplicação');
});

// ---------------------------------- 6 · cosméticos com âncora de corpo ----
test('T65 · buildHumanoidCosmetics: colete nasce no PEITO (−z) com bind-frame real', () => {
  const pivot = new THREE.Group();
  const spine2 = new THREE.Bone();
  spine2.name = 'spine2';
  spine2.position.set(0, 1.3, 0);
  spine2.rotation.y = Math.PI / 2;               // eixo local NÃO canônico (Tripo)
  pivot.add(spine2);
  pivot.updateMatrixWorld(true);
  const body = { root: pivot, bones: { spine2 }, bind: bindFor(pivot, { spine2 }) };
  const look = { id: 'TEST', palette: { primary: '#F97316', secondary: '#334155', trim: '#EAB308' }, headgear: 'none', vest: 2, pack: false, pauldrons: false };
  const kit = buildHumanoidCosmetics(look);
  assert.equal(kit.attach(body), true);
  const plate = body.bones.spine2.children.find((c) => c.name === 'vest_plate');
  assert.ok(plate, 'placa no bone spine2');
  pivot.updateMatrixWorld(true);
  const wp = plate.getWorldPosition(new THREE.Vector3());
  const expected = new THREE.Vector3(0, 1.36, -.02);   // bind do bone + offset do peito (−z)
  assert.ok(wp.distanceTo(expected) < 1e-5, `placa no peito mesmo com bone yawado (Δ ${wp.distanceTo(expected).toFixed(7)} m)`);
});
