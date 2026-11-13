// Task 64 — REALISMO HUMANO DOS AVATARES: gear nos bones do corpo real,
// empunhadura de DUAS MÃOS (suporte do foregrip), lean de curva e absorção de
// aterrissagem. Headless-safe: THREE puro + nós fake (mesma base do
// humanoid3d.test.js); determinístico (zero Math.random).
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

const {
  syncHumanoidGear,
  poseLeftHandSupport,
  poseWeaponReady,
  HUMANOID_GEAR_TAGS,
  LEFT_HAND_SUPPORT,
  HUMANOID_LEAN,
  HUMANOID_LAND,
  animateHumanoid,
} = await import('../src/game3d/humanoid3d.js');

// ---- fábricas de nós fake (bone hierárquico mínimo p/ sync/pose) ----
function node(name, parent = null) {
  const n = new THREE.Object3D();
  n.name = name;
  if (parent) parent.add(n);
  return n;
}
// corpo sintético: bones mixamorig necessários ao gear + suporte de 2 mãos
function fakeBody() {
  const root = node('humanoid_fake');
  const hips = node('Hips', root);
  const spine1 = node('spine1', hips);
  const spine2 = node('spine2', spine1);
  const head = node('head', spine2);
  const leftshoulder = node('leftshoulder', spine2);
  const leftarm = node('leftarm', leftshoulder);
  leftarm.position.set(.31, -.08, 0); // ombro esquerdo do Mixamo (rest)
  const leftforearm = node('leftforearm', leftarm);
  node('lefthand', leftforearm);
  const rightshoulder = node('rightshoulder', spine2);
  const rightarm = node('rightarm', rightshoulder);
  rightarm.position.set(-.31, -.08, 0); // ombro direito do Mixamo (rest)
  const rightforearm = node('rightforearm', rightarm);
  const righthand = node('righthand', rightforearm);
  const leftupleg = node('leftupleg', hips);
  const leftleg = node('leftleg', leftupleg);
  const rightupleg = node('rightupleg', hips);
  const rightleg = node('rightleg', rightupleg);
  return { root, bones: { hips, spine1, spine2, head, leftshoulder, leftarm, leftforearm, rightshoulder, rightarm, rightforearm, righthand, leftupleg, leftleg, rightupleg, rightleg } };
}
// anchor procedural com um grupo de gear dentro (formato do gear3d F28)
function fakeParts({ vest = 'gear_vest', helmet = 'gear_helmet', pack = 'gear_pack' } = {}) {
  const head = node('headProc');
  const torso = node('torsoProc');
  const out = { head, torso };
  const put = (tag, parent) => {
    if (!tag) return;
    const g = node(tag, parent);
    g.add(node(`${tag}_plate`, g));
  };
  put(helmet, head);
  put(vest, torso);
  put(pack, torso);
  return out;
}

test('T64 · syncHumanoidGear re-ancora capacete/colete/mochila nos bones do corpo real', () => {
  const body = fakeBody();
  const parts = fakeParts();
  const helmet = parts.head.getObjectByName(HUMANOID_GEAR_TAGS.helmet);
  const vest = parts.torso.getObjectByName(HUMANOID_GEAR_TAGS.vest);
  const pack = parts.torso.getObjectByName(HUMANOID_GEAR_TAGS.pack);
  const moved = syncHumanoidGear(body, parts);
  assert.equal(moved, 3, 'as três peças migram');
  assert.equal(body.bones.head.getObjectByName(HUMANOID_GEAR_TAGS.helmet), helmet);
  assert.equal(body.bones.spine2.getObjectByName(HUMANOID_GEAR_TAGS.vest), vest);
  assert.equal(body.bones.spine1.getObjectByName(HUMANOID_GEAR_TAGS.pack), pack);
  assert.equal(vest.parent, body.bones.spine2, 'pai do colete é o bone do peito');
  // gear visível + exclusão de ocultação marcada
  assert.equal(vest.visible, true);
  assert.equal(vest.userData.humanoidGear, true);
});

test('T64 · syncHumanoidGear é idempotente (2ª passada não move nem duplica)', () => {
  const body = fakeBody();
  const parts = fakeParts();
  syncHumanoidGear(body, parts);
  const moved2 = syncHumanoidGear(body, parts);
  assert.equal(moved2, 0, 'sem mudança de pai → zero trabalho');
  const bones = body.root.children.length;
  syncHumanoidGear(body, parts);
  assert.equal(body.root.children.length, bones, 'nada duplicado na raiz');
});

test('T64 · pickup durante a partida: gear recriado no anchor procedural é re-adotado', () => {
  const body = fakeBody();
  const parts = fakeParts();
  syncHumanoidGear(body, parts);
  // pickup (fluxo real do applyOperativeGear): o grupo novo NASCE no anchor —
  // a versão antiga, que já migrou para o bone, vira husk órfão lá.
  const novo = node(HUMANOID_GEAR_TAGS.vest, parts.torso);
  const moved = syncHumanoidGear(body, parts);
  assert.equal(moved, 1, 'só a peça recriada migra');
  assert.equal(body.bones.spine2.getObjectByName(HUMANOID_GEAR_TAGS.vest), novo);
  assert.equal(novo.parent, body.bones.spine2);
  // upgrade seguinte: novo husk no bone + peça nova no anchor — sem duplicar
  const husk = node(HUMANOID_GEAR_TAGS.vest, body.bones.spine2);
  const novo2 = node(HUMANOID_GEAR_TAGS.vest, parts.torso);
  syncHumanoidGear(body, parts);
  assert.equal(husk.parent, null, 'husk antigo sai do bone');
  assert.equal(body.bones.spine2.getObjectByName(HUMANOID_GEAR_TAGS.vest), novo2);
});

test('T64 · syncHumanoidGear sem bone alvo / sem parts → no-op seguro', () => {
  const body = fakeBody();
  delete body.bones.spine1;
  const parts = fakeParts();
  const moved = syncHumanoidGear(body, parts);
  assert.equal(moved, 2, 'colete+capacete migram; sem bone spine1 a mochila é ignorada');
  assert.equal(syncHumanoidGear(null, parts), 0);
  assert.equal(syncHumanoidGear(body, null), 0);
});

// ---- empunhadura de DUAS MÃOS ----
function fakeWeaponRig({ magOffset = new THREE.Vector3(.12, .05, -.28) } = {}) {
  const parent = node('righthandParent');
  const g = node('weaponRigGroup', parent);
  return {
    group: g,
    model: { gripW: new THREE.Vector3(0, 0, 0), magW: magOffset },
  };
}

test('T64 · poseLeftHandSupport orienta o braço esquerdo ao foregrip (2 mãos)', () => {
  const body = fakeBody();
  const rig = fakeWeaponRig();
  // arma à frente do peito do corpo fake (ombro esquerdo está na origem):
  // alvo final do foregrip ≈ (.22, -.4, -.18) — a .38 m do ombro (alcançável)
  rig.group.position.set(.1, -.45, .1);
  const before = body.bones.leftarm.quaternion.clone();
  const applied = poseLeftHandSupport(body, rig);
  assert.equal(applied, true);
  const after = body.bones.leftarm.quaternion.clone();
  assert.ok(!after.equals(before), 'quaternion do úmero esquerdo mudou');
  const elbowBend = body.bones.leftforearm.rotation.x;
  assert.ok(elbowBend > 0, `cotovelo dobra (x=${elbowBend.toFixed(3)})`);
  assert.ok(elbowBend <= LEFT_HAND_SUPPORT.maxBend * .55 + 1e-9, 'dobra dentro do teto');
});

test('T64 · poseLeftHandSupport é determinística (mesma entrada → mesma pose)', () => {
  const mk = () => {
    const body = fakeBody();
    const rig = fakeWeaponRig();
    rig.group.position.set(.1, -.45, .1);
    poseLeftHandSupport(body, rig);
    return body.bones.leftarm.quaternion.clone();
  };
  const a = mk();
  const b = mk();
  assert.ok(a.equals(b), 'quaternions idênticos');
});

test('T64 · poseLeftHandSupport clampa: alvo longe não vira hélice (teto maxSwing)', () => {
  const body = fakeBody();
  const rig = fakeWeaponRig({ magOffset: new THREE.Vector3(9, 9, 9) }); // fora de alcance
  const applied = poseLeftHandSupport(body, rig);
  assert.equal(applied, true, 'pose aplicada NA DIREÇÃO do alvo');
  const e = new THREE.Euler().setFromQuaternion(body.bones.leftarm.quaternion);
  assert.ok(Math.abs(e.x) <= Math.PI, 'rotação finita');
  const elbow = body.bones.leftforearm.rotation.x;
  assert.ok(elbow <= LEFT_HAND_SUPPORT.maxBend * .55 + 1e-9, 'cotovelo no teto (braço estica na direção)');
});

test('T64 · poseLeftHandSupport sem arma/sem grip → false (no-op)', () => {
  const body = fakeBody();
  assert.equal(poseLeftHandSupport(body, null), false);
  assert.equal(poseLeftHandSupport(body, { group: null }), false);
  assert.equal(poseLeftHandSupport(null, fakeWeaponRig()), false);
  const rig2 = fakeWeaponRig();
  delete rig2.model.magW;
  assert.equal(poseLeftHandSupport(body, rig2), false, 'sem magwell não há apoio');
});

// ---- lean de curva + absorção de aterrissagem (via animateHumanoid) ----
function fakeAnimatedEntry() {
  const body = fakeBody();
  // mixer FIEL ao contrato real: os clips REESCREVEM a pose absoluta a cada
  // update (rotations/positions voltam à base) — as poses aditivas assumem isso.
  const rest = {};
  for (const [k, b] of Object.entries(body.bones)) {
    rest[k] = { q: b.quaternion.clone(), p: b.position.clone() };
  }
  const mixer = {
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
    clip, enabled: true, paused: true, weight: 0,
    time: 0,
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

test('T64 · lean: yawVel inclina o corpo para dentro da curva (EWMA, clampado)', () => {
  const e = fakeAnimatedEntry();
  animateHumanoid(e, { t: 0, speedNorm: .9, leanVel: 2.5 });
  const z1 = e.root.rotation.z;
  assert.ok(z1 !== 0, `lean ativo (z=${z1.toFixed(3)})`);
  assert.ok(Math.abs(z1) <= HUMANOID_LEAN.maxZ + 1e-9, 'dentro do teto de banking');
  // convergência EWMA: repetir a entrada aproxima do alvo, nunca explode
  animateHumanoid(e, { t: 1 / 60, speedNorm: .9, leanVel: 2.5 });
  animateHumanoid(e, { t: 2 / 60, speedNorm: .9, leanVel: 2.5 });
  const z3 = e.root.rotation.z;
  assert.ok(Math.abs(z3) <= HUMANOID_LEAN.maxZ + 1e-9);
  assert.ok(Math.abs(z3) > Math.abs(z1), 'lean cresce suavemente ao sustentar a curva');
});

test('T64 · lean: parado o corpo permanece ereto (atenuação .25)', () => {
  const e = fakeAnimatedEntry();
  animateHumanoid(e, { t: 0, speedNorm: 0, leanVel: 3 });
  assert.ok(Math.abs(e.root.rotation.z) <= HUMANOID_LEAN.maxZ * .25 + 1e-9, 'lean quase nulo sem velocidade');
});

test('T64 · aterrissagem: air>0 → 0 dispara absorção (quadril desce, joelhos dobram) e decai', () => {
  const e = fakeAnimatedEntry();
  animateHumanoid(e, { t: 0, speedNorm: .5, air: 5 });  // no ar
  const hipY0 = e.bones.hips.position.y;
  animateHumanoid(e, { t: .016, speedNorm: .5, air: 0 }); // POUSOU agora
  const hipY1 = e.bones.hips.position.y;
  const knee1 = e.bones.leftleg.rotation.x;
  assert.ok(hipY1 < hipY0, `quadril absorve (${hipY0.toFixed(3)} → ${hipY1.toFixed(3)})`);
  assert.ok(knee1 < 0, `joelhos dobram (Task 65: sinal canônico −Z, pé → +Z; x=${knee1.toFixed(3)})`);
  assert.ok(Math.abs(knee1) <= HUMANOID_LAND.knee + 1e-9);
  // decai até zero: após HUMANOID_LAND.seconds a pose volta ao neutro
  const steps = Math.ceil(HUMANOID_LAND.seconds / .016) + 2;
  for (let i = 0; i < steps; i++) animateHumanoid(e, { t: .016 * (i + 2), speedNorm: .5, air: 0 });
  const kneeFinal = e.bones.leftleg.rotation.x;
  assert.ok(Math.abs(kneeFinal) < 1e-6, `absorção termina (knee=${kneeFinal})`);
  assert.ok(e.extras.landT === 0, 'landT esgota');
});

test('T64 · aterrissagem não dispara em rastejo/queda contínua (special corta extras)', () => {
  const e = fakeAnimatedEntry();
  animateHumanoid(e, { t: 0, speedNorm: .5, air: 3, knocked: true });
  animateHumanoid(e, { t: .016, speedNorm: .5, air: 0, knocked: true });
  assert.equal(e.extras.landT, 0, 'knocked não ativa absorção');
  assert.equal(e.extras.leanZ, 0, 'special zera o lean');
});

test('T64 · poseWeaponReady ergue o braço direito (prontidão) e responde a ADS', () => {
  const mk = (ads) => {
    const e = fakeAnimatedEntry();
    const q0 = e.bones.rightarm.quaternion.clone();
    const ok = poseWeaponReady(e, { speedNorm: .8, ads });
    return { ok, q0, q1: e.bones.rightarm.quaternion.clone(), elbow: e.bones.rightforearm.rotation.x };
  };
  const ready = mk(false);
  assert.equal(ready.ok, true);
  assert.ok(!ready.q1.equals(ready.q0), 'úmero direito rotaciona na prontidão');
  assert.ok(ready.elbow > 0, 'cotovelo dobra para erguer a arma');
  const adsRun = mk(true);
  assert.ok(adsRun.elbow > ready.elbow - 1e-9, 'ADS aperta o cotovelo (>= prontidão)');
  // determinismo
  const again = mk(false);
  assert.ok(again.q1.equals(ready.q1), 'mesma entrada → mesma pose');
});

test('T64 · poseWeaponReady sem bones → false (no-op seguro)', () => {
  assert.equal(poseWeaponReady(null, {}), false);
  const e = fakeAnimatedEntry();
  delete e.bones.rightarm;
  assert.equal(poseWeaponReady(e, { speedNorm: .5, ads: false }), false);
});

test('T64 · constantes de realismo exportadas e congeladas', () => {
  assert.equal(Object.isFrozen(LEFT_HAND_SUPPORT), true);
  assert.equal(Object.isFrozen(HUMANOID_LEAN), true);
  assert.equal(Object.isFrozen(HUMANOID_LAND), true);
  assert.equal(Object.isFrozen(HUMANOID_GEAR_TAGS), true);
  assert.ok(LEFT_HAND_SUPPORT.reach > 0 && LEFT_HAND_SUPPORT.maxSwing < Math.PI);
  assert.ok(HUMANOID_LAND.seconds > 0 && HUMANOID_LAND.hipDrop > 0);
});
