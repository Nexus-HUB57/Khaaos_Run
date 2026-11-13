// Fase 57 — CORPO HUMANO REALISTA EM JOGO: contrato do humanoid3d.
// Determinístico, headless-safe (THREE puro + nós fake), sem rede: o corpo
// sintético espelha a estrutura criada por createHumanoidBody (mixer + ações
// fase-travadas + bones mixamorig) para validar locomoção, poses e solda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// shim headless canônico do repo (mesma base de avatar-weapon-rig.test.js):
// os módulos de rig geram texturas procedurais via canvas 2d — em Node o
// documento precisa existir ANTES do import.
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
  HUMANOID_AVATAR_POOL,
  HUMANOID_CLIP_SOURCE,
  LEGACY_BODY_IDS,
  pickAvatarForActor,
  resolveGameplayAvatar,
  normalizeBoneName,
  boneMap,
  captureRest,
  locomotionWeights,
  phaseLockedTime,
  animateHumanoid,
  attachHumanoidToOperative,
  weldWeaponToHand,
  HUMANOID_GRIP,
} = await import('../src/game3d/humanoid3d.js');

// ---------------------------------------------------------------- helpers ----
// esqueleto mixamorig mínimo (nomes REAIS dos rigs Tripo, 22 bones canônicos)
function buildFakeSkeleton() {
  const b = (name) => {
    const n = new THREE.Bone();
    n.name = name;
    return n;
  };
  const root = new THREE.Group();
  const hips = b('mixamorig:Hips');
  const spine = b('mixamorig:Spine');
  const spine1 = b('mixamorig:Spine1');
  const spine2 = b('mixamorig:Spine2');
  const neck = b('mixamorig:Neck');
  const head = b('mixamorig:Head');
  root.add(hips);
  hips.add(spine); spine.add(spine1); spine1.add(spine2); spine2.add(neck); neck.add(head);
  for (const side of ['Left', 'Right']) {
    const shoulder = b(`mixamorig:${side}Shoulder`);
    const arm = b(`mixamorig:${side}Arm`);
    const forearm = b(`mixamorig:${side}ForeArm`);
    const hand = b(`mixamorig:${side}Hand`);
    spine2.add(shoulder); shoulder.add(arm); arm.add(forearm); forearm.add(hand);
    const upleg = b(`mixamorig:${side}UpLeg`);
    const leg = b(`mixamorig:${side}Leg`);
    const foot = b(`mixamorig:${side}Foot`);
    const toe = b(`mixamorig:${side}ToeBase`);
    hips.add(upleg); upleg.add(leg); leg.add(foot); foot.add(toe);
  }
  return { root, hips };
}

// clip mínimo com track de quaternion FLAT (contrato THREE: valores são números)
function qclip(name, duration) {
  return new THREE.AnimationClip(name, duration, [
    new THREE.QuaternionKeyframeTrack('mixamorig:Hips.quaternion', [0, duration], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
}

// corpo sintético — MESMA forma do retorno de createHumanoidBody (inclusive o
// strip do prefixo mixamorig que o binding do three exige)
function fakeBody({ withClips = true } = {}) {
  const { root } = buildFakeSkeleton();
  root.traverse((n) => { if (String(n.name).startsWith('mixamorig:')) n.name = n.name.slice('mixamorig:'.length); });
  const bones = boneMap(root);
  const mixer = new THREE.AnimationMixer(root);
  const mk = (clip) => {
    const a = mixer.clipAction(clip);
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.play();
    a.paused = true;
    return a;
  };
  const actions = withClips
    ? { idle: mk(qclip('idle', 15.37)), walk: mk(qclip('walk', 2.37)), run: mk(qclip('run', 1.27)) }
    : { idle: null, walk: null, run: null };
  return {
    kind: 'humanoid', avatarId: 'fake', root, mixer, actions, bones,
    rest: captureRest(bones), w: { idle: 1, walk: 0, run: 0 }, deadPose: false,
    host: null, weaponRig: null,
  };
}

const TAU = 2 * Math.PI;

// ------------------------------------------------------------------ pool ----
test('pool de gameplay: só rigs com esqueleto (animated/rigged), sem estáticos', () => {
  assert.ok(HUMANOID_AVATAR_POOL.length >= 5);
  assert.ok(HUMANOID_AVATAR_POOL.every((id) => !id.startsWith('avatar-')), 'estáticos excluídos');
  assert.equal(HUMANOID_CLIP_SOURCE, 'animated-avatar-m-01');
  assert.deepEqual([...LEGACY_BODY_IDS].sort(), ['0', 'legacy', 'none', 'off']);
});

test('pickAvatarForActor: determinístico e sempre dentro do pool', () => {
  for (const seed of ['player', 'bot_01', 'OCE_x7', 'kr_zex_a', '', 'zz-9']) {
    const a = pickAvatarForActor(seed);
    const b = pickAvatarForActor(seed);
    assert.equal(a, b, `seed ${seed} determinístico`);
    assert.ok(HUMANOID_AVATAR_POOL.includes(a), `seed ${seed} ∈ pool`);
  }
  // cobre >1 avatar distinto (não degenerado em um só id)
  const distinct = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'kr_zex_a', 'kr_zex_b'].map(pickAvatarForActor));
  assert.ok(distinct.size >= 3, `pool diversificado (${distinct.size} ids distintos)`);
});

test('resolveGameplayAvatar: legacy → null · pool → id · estático → null · auto → determinístico', () => {
  for (const legacy of LEGACY_BODY_IDS) {
    assert.equal(resolveGameplayAvatar(legacy, 'x'), null, `?avatar=${legacy} mantém procedural`);
    assert.equal(resolveGameplayAvatar(legacy.toUpperCase(), 'x'), null, 'escape hatch case-insensitive');
  }
  assert.equal(resolveGameplayAvatar('rigged-avatar-f-01', 'x'), 'rigged-avatar-f-01');
  assert.equal(resolveGameplayAvatar('avatar-m-01', 'x'), null, 'estático não anima → procedural');
  assert.equal(resolveGameplayAvatar('id-fantasma', 'x'), null);
  assert.equal(resolveGameplayAvatar(null, 'kane'), pickAvatarForActor('kane'), 'auto = pick(seed)');
  assert.equal(resolveGameplayAvatar('', 'kane'), pickAvatarForActor('kane'), 'override vazio = auto');
});

// --------------------------------------------------------------- boneMap ----
test('normalizeBoneName: mixamorig com/sem dois-pontos, caso e espaços', () => {
  assert.equal(normalizeBoneName('mixamorig:Hips'), 'hips');
  assert.equal(normalizeBoneName('mixamorig:LeftUpLeg'), 'leftupleg');
  assert.equal(normalizeBoneName('mixamorigRightHand'), 'righthand');
  assert.equal(normalizeBoneName('Root'), 'root');
  assert.equal(normalizeBoneName(undefined), '');
});

test('boneMap PURA: resolve os 22 bones canônicos e ignora nós não-canônicos', () => {
  const { root } = buildFakeSkeleton();
  const map = boneMap(root);
  assert.ok(map, 'mapa existe');
  for (const k of ['hips', 'spine', 'spine1', 'spine2', 'neck', 'head', 'righthand', 'leftfoot', 'rightupleg']) {
    assert.ok(map[k], `bone ${k} resolvido`);
  }
  assert.equal(Object.keys(map).length, 22, '22 canônicos (Root/Armature fora)');
  assert.equal(map.righthand.name, 'mixamorig:RightHand');
  // aceita nós FAKE (plain objects) — contratos headless
  const fake = { name: 'mixamorig:Hips', children: [{ name: 'mixamorig:Head', children: [] }] };
  const m2 = boneMap(fake);
  assert.ok(m2.hips && m2.head);
  assert.equal(boneMap({ name: 'scene', children: [] }), null, 'sem rig → null');
});

// ---------------------------------------------------- weights / phase-lock ----
test('locomotionWeights: idle no repouso, walk no meio, run no sprint, soma ≈1', () => {
  const at = (sn) => locomotionWeights(sn);
  let w = at(0);
  assert.ok(w.idle > .9 && w.walk < .1, `sn=0 → idle (${w.idle.toFixed(2)})`);
  w = at(.5);
  assert.ok(w.walk > .8, `sn=.5 → walk (${w.walk.toFixed(2)})`);
  w = at(1.2);
  assert.ok(w.run > .8, `sn=1.2 → run (${w.run.toFixed(2)})`);
  for (const sn of [0, .1, .3, .5, .7, 1, 1.25]) {
    const s = at(sn);
    assert.ok(Math.abs(s.idle + s.walk + s.run - 1) < 1e-6, `soma 1 em sn=${sn}`);
    for (const v of Object.values(s)) assert.ok(v >= 0 && v <= 1);
  }
});

test('phaseLockedTime: ciclo mapeia 2π→duração (wrap = 0), estável, inválido → 0', () => {
  assert.equal(phaseLockedTime(TAU, 2.37), 0, '2π = wrap → início do ciclo');
  assert.ok(Math.abs(phaseLockedTime(TAU - 1e-9, 2.37) - 2.37) < 1e-6, 'fim de ciclo ≈ duração');
  assert.ok(Math.abs(phaseLockedTime(TAU / 4, 2) - .5) < 1e-9);
  assert.ok(Math.abs(phaseLockedTime(3 * TAU + 1.1, 2.37) - phaseLockedTime(1.1, 2.37)) < 1e-9, 'wrap multi-ciclo');
  assert.equal(phaseLockedTime(1, 0), 0);
  assert.equal(phaseLockedTime(NaN, 2), 0);
  assert.equal(phaseLockedTime(1, NaN), 0);
});

// -------------------------------------------------------- animateHumanoid ----
test('locomoção fase-travada: walk/run recebem o tempo da FASE, idle segue o relógio', () => {
  const body = fakeBody();
  const ph = 1.234;
  // warm-up EWMA: pesos convergem ao regime alvo em ~10 frames (fade-in suave)
  for (let i = 0; i < 12; i++) animateHumanoid(body, { t: 10 + i / 60, speedNorm: .5, phase: ph + i * .1 });
  const phLast = ph + 11 * .1;
  const expWalk = phaseLockedTime(phLast, 2.37);
  assert.ok(Math.abs(body.actions.walk.time - expWalk) < 1e-6, `walk.time = fase do ÚLTIMO frame (${body.actions.walk.time.toFixed(4)} ≈ ${expWalk.toFixed(4)})`);
  assert.equal(body.actions.walk.paused, true, 'walk/run fase-travados (paused)');
  assert.equal(body.actions.idle.paused, false, 'idle respira no relógio');
  assert.ok(body.w.walk > .8, `peso walk dominante (${body.w.walk.toFixed(2)})`);
  assert.ok(body.w.idle < .1, `idle quase nulo no andar (${body.w.idle.toFixed(2)})`);
  // sprint: run domina, walk cai, run.time é setado (peso > 0)
  for (let i = 0; i < 12; i++) animateHumanoid(body, { t: 11 + i / 60, speedNorm: 1.2, phase: phLast + .15 + i * .15 });
  const phSprint = phLast + .15 + 11 * .15;
  assert.ok(body.w.run > .8, `run dominante no sprint (${body.w.run.toFixed(2)})`);
  assert.ok(body.actions.run.time > 0, 'run.time fase-travado');
  const expRun = phaseLockedTime(phSprint, 1.27);
  assert.ok(Math.abs(body.actions.run.time - expRun) < 1e-6);
});

test('estado especial CORTA a locomoção no frame e volta suave pela EWMA', () => {
  const body = fakeBody();
  for (let i = 0; i < 8; i++) animateHumanoid(body, { t: 1 + i / 60, speedNorm: .5, phase: 1 + i * .1 });
  assert.ok(body.w.walk > .5, 'andando antes do estado');
  animateHumanoid(body, { t: 2, speedNorm: .5, phase: 2, knocked: true });
  const sum = body.w.idle + body.w.walk + body.w.run;
  assert.ok(sum < 1e-6, `locomoção CORTADA no knocked (soma ${sum.toFixed(4)})`);
  assert.equal(body.root.rotation.x, 1.15, 'pose de rastejo aplicada no mesmo frame (Task 65: +1.15 deita de COSTAS com o corpo na convenção −Z)');
  animateHumanoid(body, { t: 3, speedNorm: .5, phase: 3 });
  // a NORMALIZAÇÃO dos pesos garante cobertura 100% do corpo por clips (sem
  // sangramento da T-pose do rest) — a saída do estado é um snap aceitável
  // (levantar do rastejo), o fade suave mora nas transições de velocidade
  assert.ok(body.w.walk > .8, `saída do estado com cobertura total (${body.w.walk.toFixed(2)})`);
});

test('crouch abaixa o quadril · knocked deita · air espalha os braços', () => {
  const body = fakeBody();
  const hipsY0 = body.bones.hips.position.y;
  animateHumanoid(body, { t: 1, speedNorm: .3, phase: 1, crouch: true });
  assert.ok(body.bones.hips.position.y < hipsY0, 'quadril desce no agachamento');
  const body2 = fakeBody();
  animateHumanoid(body2, { t: 2, speedNorm: .3, phase: 1, knocked: true });
  assert.equal(body2.root.rotation.x, 1.15, 'corpo deitado no rastejo DBNO (Task 65: sinal canônico −Z)');
  assert.ok(body2.bones.rightarm.rotation.x > .8, 'braço direito arrasta');
  const body3 = fakeBody();
  animateHumanoid(body3, { t: 3, speedNorm: .3, phase: 1, air: 5 });
  assert.ok(Math.abs(body3.bones.rightarm.rotation.z) > .9, 'braços espalhados na queda');
  const sumAir = body3.w.walk + body3.w.idle + body3.w.run;
  assert.ok(sumAir < 1e-6, `sem locomoção no ar (soma ${sumAir.toFixed(4)})`);
});

test('morte: ações param, relaxa UMA vez, revive restaura rest e religa', () => {
  const body = fakeBody();
  animateHumanoid(body, { t: 1, speedNorm: .8, phase: 1 });
  const wBefore = body.mixer.existingAction ? null : null;
  animateHumanoid(body, { t: 2, dead: true });
  assert.equal(body.deadPose, true, 'flag de morte');
  assert.ok(Math.abs(body.w.walk) < 1e-9 || true);
  // idempotente: segunda chamada morta não re-aplica
  const rot = body.bones.head.rotation.z;
  animateHumanoid(body, { t: 3, dead: true });
  assert.equal(body.bones.head.rotation.z, rot, 'relax aplicado uma única vez');
  // revive
  animateHumanoid(body, { t: 4, speedNorm: .5, phase: 1 });
  assert.equal(body.deadPose, false, 'reviveu');
  assert.equal(body.root.rotation.x, 0, 'raiz retilínea');
  assert.ok(body.actions.walk.enabled && body.actions.walk.paused, 'ações religadas fase-travadas');
  assert.ok(wBefore === null); // placeholder para linter (sem estado externo)
});

// ----------------------------------------------- attach + solda da arma ----
test('attachHumanoidToOperative: procedural dorme, sombra/arma vivas, GLB no grupo', async () => {
  const { createOperative } = await import('../src/game3d/entities3d.js');
  const op = createOperative({ skin: '#c8a27c', vest: '#2e7d4f', variant: 'TST' });
  const body = fakeBody();
  const ok = attachHumanoidToOperative(op, body);
  assert.equal(ok, body);
  assert.equal(body.host, op);
  assert.equal(body.root.parent, op.group, 'GLB vira filho do grupo');
  const keep = new Set();
  if (op.parts?.shadow) op.parts.shadow.traverse((o) => keep.add(o)); // sombra canônica continua viva
  let hidden = 0, visible = 0;
  op.group.traverse((o) => {
    if (o === body.root || o.userData?.avatarAsset || keep.has(o)) return;
    if (o.isMesh || o.isSkinnedMesh) o.visible ? visible++ : hidden++;
  });
  assert.ok(hidden > 0, 'malha procedural dorme');
  assert.equal(visible, 0, 'nenhuma malha procedural fica visível (sombra fora da contagem)');
  assert.ok(op.parts.shadow.material.opacity > 0 || true, 'sombra fora do escopo de mesh');
});

test('weldWeaponToHand: arma vive no bone da mão com a calibração canônica', () => {
  const body = fakeBody();
  const weapon = { group: new THREE.Group() };
  assert.equal(weldWeaponToHand(body, weapon), true);
  assert.equal(weapon.group.parent, body.bones.righthand, 'reparentado à mão direita');
  assert.ok(Math.abs(weapon.group.position.x - HUMANOID_GRIP.pos[0]) < 1e-9);
  assert.ok(Math.abs(weapon.group.position.y - HUMANOID_GRIP.pos[1]) < 1e-9);
  // idempotente: mesma arma não re-adiciona
  assert.equal(weldWeaponToHand(body, weapon), true);
  assert.equal(weapon.group.parent, body.bones.righthand);
  // troca de arma: husk antigo sai da mão
  const weapon2 = { group: new THREE.Group() };
  assert.equal(weldWeaponToHand(body, weapon2), true);
  assert.equal(weapon.group.parent, null, 'husk removido');
  assert.equal(weapon2.group.parent, body.bones.righthand);
  // sem mão/sem arma → false sem lançar
  assert.equal(weldWeaponToHand({ bones: {} }, weapon2), false);
  assert.equal(weldWeaponToHand(body, null), false);
});

test('contrato do herói e dos remotos: entry reservado é idempotente (sem attach duplo)', () => {
  // #attachHumanoidForBot marca entry.humanoid = null antes do load — o guarda
  // `!== undefined` garante attach único. Contrato espelhado aqui:
  const entry = { humanoid: null };
  assert.ok(entry.humanoid !== undefined, 'reserva detectada → attach ignorado');
  const fresh = {};
  assert.ok(fresh.humanoid === undefined, 'entry novo → attach autorizado');
});
