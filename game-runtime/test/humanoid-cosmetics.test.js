// Fase 60 — IDENTIDADE HUMANA DOS 33 AVATARES: contrato do humanoidCosmetics3d.
// Determinístico, headless-safe (THREE puro + bones fake): a tabela dos 33
// looks é 1:1 com o catálogo canônico; cosméticos anexam aos bones do corpo
// real; pool por sexo; looks genéricos para ids desconhecidos; camada humana
// de movimento (lean/yaw/cadência) do humanoid3d.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// shim headless canônico do repo (mesma base de humanoid3d.test.js)
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
  IDENTITY_LOOKS,
  IDENTITY_IDS,
  IDENTITY_COUNT,
  resolveIdentityLook,
  poolBodyForIdentity,
  identityForBot,
  identityHash,
  buildHumanoidCosmetics,
  dressHumanoid,
} = await import('../src/game3d/humanoidCosmetics3d.js');

const {
  leanPitch,
  headYawClamp,
  strideCadenceScale,
} = await import('../src/game3d/humanoid3d.js');

// corpo fake com bones canônicos (mesma forma do boneMap do humanoid3d)
function fakeBones() {
  const mk = (name) => ({
    name, children: [], rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 },
    add(o) { this.children.push(o); o.parent = this; },
    remove(o) { this.children = this.children.filter((c) => c !== o); delete o.parent; },
    traverse(fn) { fn(this); for (const c of [...this.children]) c.traverse?.(fn); },
  });
  const bones = {
    hips: mk('hips'), spine: mk('spine'), spine1: mk('spine1'), spine2: mk('spine2'),
    neck: mk('neck'), head: mk('head'),
    leftshoulder: mk('leftshoulder'), rightshoulder: mk('rightshoulder'),
    leftarm: mk('leftarm'), rightarm: mk('rightarm'),
    leftforearm: mk('leftforearm'), rightforearm: mk('rightforearm'),
    lefthand: mk('lefthand'), righthand: mk('righthand'),
  };
  const root = { isObject3D: true, name: 'fake_humanoid', children: [], userData: {}, add(o) { this.children.push(o); o.parent = this; }, remove(o) { this.children = this.children.filter((c) => c !== o); delete o.parent; }, traverse(fn) { fn(this); for (const c of this.children) c.traverse?.(fn); } };
  return { bones, root };
}

test('F60 · tabela tem EXATAMENTE 33 identidades com todas as facções', () => {
  assert.equal(IDENTITY_COUNT, 33);
  assert.equal(IDENTITY_LOOKS.length, 33);
  assert.equal(new Set(IDENTITY_IDS).size, 33, 'ids únicos');
  const factions = new Set(IDENTITY_LOOKS.map((l) => l.faction));
  assert.ok(factions.has('MILITAR'), 'facção militar canônica');
  assert.ok(factions.has('MILICIA_URBANA'), 'Lote 4 milícia');
  assert.ok(factions.has('GANGUE_URBANA'), 'Lote 4 gangue');
  assert.equal(IDENTITY_LOOKS.filter((l) => l.faction === 'MILITAR').length, 17, '16 canônicos + TALON');
  assert.equal(IDENTITY_LOOKS.filter((l) => l.faction === 'MILICIA_URBANA').length, 8);
  assert.equal(IDENTITY_LOOKS.filter((l) => l.faction === 'GANGUE_URBANA').length, 8);
});

test('F60 · todo look tem paleta completa, sexo válido e headgear conhecido', () => {
  const HEADGEARS = new Set(['headset', 'collar', 'mask', 'monocle', 'band', 'goggles', 'helmet', 'cap', 'hood', 'none']);
  for (const l of IDENTITY_LOOKS) {
    assert.ok(l.id.startsWith('OP_'), l.id);
    assert.ok(['M', 'F'].includes(l.sex), `${l.id} sexo`);
    assert.ok(l.codename?.length > 0, `${l.id} codinome`);
    assert.ok(/^#[0-9A-F]{6}$/i.test(l.palette.primary), `${l.id} primary`);
    assert.ok(/^#[0-9A-F]{6}$/i.test(l.palette.secondary), `${l.id} secondary`);
    assert.ok(/^#[0-9A-F]{6}$/i.test(l.palette.trim), `${l.id} trim`);
    assert.ok(Number.isInteger(l.vest) && l.vest >= 0 && l.vest <= 4, `${l.id} vest`);
    assert.ok(HEADGEARS.has(l.headgear), `${l.id} headgear ${l.headgear}`);
    assert.equal(typeof l.pack, 'boolean', `${l.id} pack`);
    assert.equal(typeof l.pauldrons, 'boolean', `${l.id} pauldrons`);
  }
});

test('F60 · SK_Gwen (FEMININO) do catálogo → rig FEMININO do pool', () => {
  for (const l of IDENTITY_LOOKS) {
    const body = poolBodyForIdentity(l.id);
    if (l.sex === 'F') assert.ok(body.startsWith('rigged-avatar-f-'), `${l.id} → ${body}`);
    else assert.ok(body.includes('-m-'), `${l.id} → ${body}`);
  }
});

test('F60 · pool por identidade é DETERMINÍSTICO e distribui o roster', () => {
  for (const l of IDENTITY_LOOKS) {
    assert.equal(poolBodyForIdentity(l.id), poolBodyForIdentity(l.id), `${l.id} estável`);
  }
  // TALON e KHAEL: ambos M — mapeamento estável documentado
  assert.equal(poolBodyForIdentity('OP_MALE_TALON'), poolBodyForIdentity('OP_MALE_TALON'));
});

test('F60 · resolveIdentityLook desconhecido NUNCA falha (look genérico)', () => {
  const a = resolveIdentityLook('OP_QUALQUER_X');
  const b = resolveIdentityLook('OP_QUALQUER_X');
  assert.deepEqual(a, b, 'determinístico');
  assert.equal(a.generic, true);
  assert.ok(a.palette.primary);
  assert.ok(['M', 'F'].includes(a.sex));
  assert.equal(resolveIdentityLook(null).generic, true);
});

test('F60 · identityForBot distribui o ROSTER 33 de forma determinística', () => {
  const picks = new Set();
  for (let i = 0; i < 33; i++) picks.add(identityForBot(`bot-${String(i + 1).padStart(2, '0')}`));
  assert.ok(picks.size >= 20, `cobertura do roster alta (${picks.size}/33)`);
  assert.ok(IDENTITY_IDS.includes(identityForBot('bot-01')));
  assert.equal(identityForBot('bot-01'), identityForBot('bot-01'), 'estável por seed');
});

test('F60 · buildHumanoidCosmetics anexa peças aos BONES do corpo real', () => {
  const look = resolveIdentityLook('OP_MALE_VANGUARD'); // headset + vest 2 + pack
  const { bones, root } = fakeBones();
  const body = { bones, root, userData: {} };
  const kit = buildHumanoidCosmetics(look);
  assert.equal(kit.attach(body), true);
  const worn = [];
  for (const b of Object.values(bones)) worn.push(...b.children);
  const names = worn.map((m) => m.name);
  assert.ok(names.includes('hg_headset'), 'headgear no head');
  assert.ok(names.includes('vest_plate'), 'colete no spine2');
  assert.ok(names.includes('faction_trim'), 'faixa de facção no spine2');
  assert.ok(names.includes('pack_body'), 'mochila no spine1');
  assert.ok(bones.head.children.some((m) => m.name === 'hg_headset'), 'headgear vive no bone head');
  assert.equal(root.userData.cosmeticGroup.userData.cosmeticLook, look.id);
});

test('F60 · cada headgear usa o bone correto (cap/band/hood/mask/monocle/helmet/collar)', () => {
  for (const kind of ['helmet', 'cap', 'band', 'hood', 'mask', 'headset', 'goggles', 'monocle', 'collar']) {
    const look = { ...resolveIdentityLook('OP_MALE_VANGUARD'), id: `test_${kind}`, headgear: kind, vest: 0, pack: false, pauldrons: false };
    const { bones } = fakeBones();
    const kit = buildHumanoidCosmetics(look);
    kit.attach({ bones, root: { isObject3D: true, children: [], userData: {}, add(o) { this.children.push(o); }, remove() {}, traverse(fn) { fn(this); } } });
    const headWorn = bones.head.children.map((m) => m.name);
    assert.ok(headWorn.length > 0, `${kind} deveria vestir o head`);
  }
});

test('F60 · pauldrons vão UM para cada ombro', () => {
  const look = { ...resolveIdentityLook('OP_MALE_BREACHER'), headgear: 'none', vest: 0, pack: false, pauldrons: true };
  const { bones } = fakeBones();
  const kit = buildHumanoidCosmetics(look);
  kit.attach({ bones, root: { isObject3D: true, children: [], userData: {}, add(o) { this.children.push(o); }, remove() {}, traverse(fn) { fn(this); } } });
  assert.equal(bones.leftshoulder.children.filter((m) => m.name === 'pauldron_L').length, 1);
  assert.equal(bones.rightshoulder.children.filter((m) => m.name === 'pauldron_R').length, 1);
});

test('F60 · GANGUE_URBANA: silhueta leve (sem colete pesado/mochila)', () => {
  for (const l of IDENTITY_LOOKS.filter((x) => x.faction === 'GANGUE_URBANA')) {
    assert.ok(l.vest <= 1, `${l.id} vest leve`);
    assert.equal(l.pack, false, `${l.id} sem mochila`);
    assert.equal(l.pauldrons, false, `${l.id} sem ombreira`);
  }
});

test('F60 · dressHumanoid é idempotente e NUNCA lança', () => {
  const { bones, root } = fakeBones();
  const body = { bones, root, userData: {} };
  dressHumanoid(body, resolveIdentityLook('OP_FEMALE_HEAVY_AFRICAN'));
  const first = [...bones.head.children];
  dressHumanoid(body, resolveIdentityLook('OP_FEMALE_HEAVY_AFRICAN'));
  assert.deepEqual(bones.head.children.map((m) => m.name), first.map((m) => m.name), 're-dress limpa o anterior');
  assert.equal(dressHumanoid(null, null), null);
  assert.equal(dressHumanoid(body, null), body);
});

test('F60 · camada humana PURA: lean, yaw e cadência', () => {
  assert.equal(leanPitch(0, 1), 0, 'sem aceleração sem lean');
  assert.equal(leanPitch(.8, 0), 0, 'parado não inclina');
  const fwd = leanPitch(1, 1);
  assert.ok(fwd > .15 && fwd <= .2, 'lean máximo clampado');
  assert.ok(leanPitch(-1, 1) < 0, 'freada inclina para trás');
  assert.equal(headYawClamp(3), .85, 'yaw clampado');
  assert.equal(headYawClamp(-3), -.85);
  assert.equal(headYawClamp(.2), .2);
  assert.equal(headYawClamp(NaN), 0);
  assert.equal(strideCadenceScale('M'), 1);
  assert.equal(strideCadenceScale('F'), 1.06);
  assert.equal(strideCadenceScale(null), 1);
});

test('F60 · identidadeHash determinístico e estável', () => {
  assert.equal(identityHash('OP_MALE_VANGUARD'), identityHash('OP_MALE_VANGUARD'));
  assert.notEqual(identityHash('a'), identityHash('b'));
  assert.equal(typeof identityHash('khaaos'), 'number');
});
