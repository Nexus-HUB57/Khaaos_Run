// Fase 10 — dedos individuais no rig de primeira pessoa.
// Valida em node puro: 4 dedos + polegar por mão, cadeias de 2 falanges por
// dedo, compartilhamento de geometria (cache), orçamento de polígonos do rig,
// pose de grip determinística com indicador de gatilho, micro-vida (breathe),
// clamp de curl e escopo do recolor (tintable) preservando pele/luva.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// ---- stub de Canvas2D ( defensively: o rig usa materiais puros, mas o módulo
// textures3d pode ser tocado por imports transitivos ) ----
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

const { createFirstPersonRig, poseFirstPersonHands } = await import('../src/game3d/entities3d.js');

const trisOf = (group) => {
  let n = 0;
  group.traverse((o) => { if (o.isMesh) n += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; });
  return n;
};

test('anatomia da mão: 4 dedos + polegar por mão, cada dedo com 2 falanges', () => {
  const rig = createFirstPersonRig({});
  for (const side of ['armL', 'armR']) {
    const hand = rig.userData.hands?.[side];
    assert.ok(hand, `userData.hands.${side} existe`);
    assert.equal(hand.fingers.length, 4, `${side}: 4 dedos individuais`);
    assert.ok(hand.thumb?.base && hand.thumb?.tip, `${side}: polegar articulado`);
    for (const f of hand.fingers) {
      const proximal = f.base.children.filter((o) => o.isMesh);
      assert.equal(proximal.length, 1, 'falange proximal é malha');
      assert.ok(f.tip.isGroup && f.tip.parent === f.base, 'nó distal é filho do proximal');
      assert.equal(f.tip.children.filter((o) => o.isMesh).length, 1, 'falange distal é malha');
    }
  }
});

test('cadeia cinemática: curl do nó distal herda do proximal (junta em árvore)', () => {
  const rig = createFirstPersonRig({});
  const f = rig.userData.hands.armR.fingers[1];
  poseFirstPersonHands(rig, { curl: 1.2 });
  const before = f.tip.getWorldPosition(new THREE.Vector3());
  // rotação do distal compõe com a do proximal (hierarquia, não malhas soltas)
  f.base.updateMatrixWorld(true);
  const local = f.tip.position.clone();
  assert.ok(local.length() > .03, 'distal offset do proximal');
  poseFirstPersonHands(rig, { curl: .1 });
  f.base.updateMatrixWorld(true);
  const after = f.tip.getWorldPosition(new THREE.Vector3());
  assert.ok(before.distanceTo(after) > .01, `curl move a ponta do dedo (${before.distanceTo(after).toFixed(4)})`);
});

test('geometria compartilhada: 8 dedos usam as MESMAS cápsulas (cache)', () => {
  const a = createFirstPersonRig({});
  const b = createFirstPersonRig({});
  const geos = (rig) => {
    const set = { proximal: new Set(), distal: new Set() };
    for (const side of ['armL', 'armR']) {
      for (const f of rig.userData.hands[side].fingers) {
        set.proximal.add(f.base.children.find((o) => o.isMesh).geometry);
        set.distal.add(f.tip.children.find((o) => o.isMesh).geometry);
      }
    }
    return set;
  };
  const A = geos(a), B = geos(b);
  assert.equal(A.proximal.size, 1, 'todas as proximais compartilham 1 geometria');
  assert.equal(A.distal.size, 1, 'todos os distais compartilham 1 geometria');
  assert.ok([...A.proximal].every((g) => B.proximal.has(g)), 'cache global entre instâncias de rig');
});

test('orçamento: rig FP com dedos ≤ 3400 tris (um único ator em close)', () => {
  const rig = createFirstPersonRig({});
  const tris = trisOf(rig);
  assert.ok(tris <= 3400, `rig ${tris} tris ≤ 3400`);
  assert.ok(tris >= 800, `rig ${tris} tris — densidade mínima mantida`);
});

test('pose de grip: curl enrola base e distal, com distal dobrando mais', () => {
  const rig = createFirstPersonRig({});
  const f = rig.userData.hands.armR.fingers[2];
  poseFirstPersonHands(rig, { curl: .3 });
  const soft = { base: f.base.rotation.x, tip: f.tip.rotation.x };
  poseFirstPersonHands(rig, { curl: 1.2 });
  const hard = { base: f.base.rotation.x, tip: f.tip.rotation.x };
  assert.ok(hard.base > soft.base + .5, `base curla (${soft.base.toFixed(2)} → ${hard.base.toFixed(2)})`);
  assert.ok(hard.tip > soft.tip + .8, `distal curla mais (${soft.tip.toFixed(2)} → ${hard.tip.toFixed(2)})`);
  assert.ok(hard.tip > hard.base, 'falange distal mais curvada que a proximal (grip natural)');
});

test('gatilho: índice direito estendido em repouso e flexiona ao atirar', () => {
  const rig = createFirstPersonRig({});
  const { fingers } = rig.userData.hands.armR;
  poseFirstPersonHands(rig, { curl: .8, trigger: 0 });
  const rest = fingers.map((f) => f.base.rotation.x);
  assert.ok(rest[0] < rest[2] - .2, `índice mais estendido que o médio em repouso (${rest[0].toFixed(2)} < ${rest[2].toFixed(2)})`);
  poseFirstPersonHands(rig, { curl: .8, trigger: 1 });
  const firing = fingers.map((f) => f.base.rotation.x);
  assert.ok(firing[0] > firing[2], 'no gatilho o índice aperta (passa o médio)');
  assert.ok(firing[0] > rest[0] + .3, `flexão do gatilho perceptível (${rest[0].toFixed(2)} → ${firing[0].toFixed(2)})`);
  // mão de suporte não tem gatilho: índice esquerdo segue grip firme
  poseFirstPersonHands(rig, { curl: .8, trigger: 1 });
  const lRest = rig.userData.hands.armL.fingers.map((f) => f.base.rotation.x);
  assert.ok(Math.abs(lRest[0] - lRest[2]) < .12, 'mão esquerda sem diferença artificial de indicador');
});

test('micro-vida: breathe varia a pose e o pose é determinístico', () => {
  const rigA = createFirstPersonRig({});
  const rigB = createFirstPersonRig({});
  poseFirstPersonHands(rigA, { curl: .8, breathe: 0 });
  poseFirstPersonHands(rigB, { curl: .8, breathe: 0 });
  const a = rigA.userData.hands.armL.fingers[0].base.rotation.x;
  const b = rigB.userData.hands.armL.fingers[0].base.rotation.x;
  assert.equal(a, b, 'determinismo (sem Math.random)');
  const rigC = createFirstPersonRig({});
  poseFirstPersonHands(rigC, { curl: .8, breathe: .03 });
  const c = rigC.userData.hands.armL.fingers[0].base.rotation.x;
  assert.notEqual(a, c, 'breathe adiciona micro-movimento');
  assert.ok(Math.abs(c - a) < .2, 'micro-vida é sutil');
});

test('clamp: curl extremo não gera rotações absurdas nem NaN', () => {
  const rig = createFirstPersonRig({});
  poseFirstPersonHands(rig, { curl: 99, trigger: 99, breathe: -9 });
  for (const side of ['armL', 'armR']) {
    for (const f of rig.userData.hands[side].fingers) {
      for (const j of [f.base.rotation.x, f.tip.rotation.x]) {
        assert.ok(Number.isFinite(j) && j >= 0 && j <= 1.6 * 1.3 + .01, `rotação clamped (${j.toFixed(2)})`);
      }
    }
  }
  poseFirstPersonHands(null, { curl: 1 }); // rig inexistente não explode
  const bare = new THREE.Group();
  poseFirstPersonHands(bare, { curl: 1 }); // rig sem hands não explode
});

test('API preservada: userData.arms continua exposto; 2 rigs não compartilham material de pele', () => {
  const a = createFirstPersonRig({ skin: '#f2c9a0', vest: '#3a3f47' });
  const b = createFirstPersonRig({ skin: '#8a5632', vest: '#8a1f2b' });
  assert.ok(a.userData.arms?.armL && a.userData.arms?.armR, 'userData.arms mantido');
  const fingerA = a.userData.hands.armL.fingers[0].base.children.find((o) => o.isMesh);
  const fingerB = b.userData.hands.armR.fingers[0].base.children.find((o) => o.isMesh);
  assert.notEqual(fingerA.material, fingerB.material, 'pele dos dedos por instância');
  assert.ok(Math.abs(fingerA.material.color.getHex() - new THREE.Color('#f2c9a0').getHex()) < 1e-6, 'tom de pele correto no dedo');
});

test('recolor com escopo: manga/colete tintable; pele, luva e dedos NUNCA', () => {
  const rig = createFirstPersonRig({});
  const tinted = [], untinted = [];
  rig.traverse((o) => {
    if (!o.isMesh) return;
    (o.userData.tintable ? tinted : untinted).push(o);
  });
  assert.ok(tinted.length >= 3, `manga ×2 + colete tintable (${tinted.length})`);
  // nenhum mesh de dedo/palma é tintable
  for (const side of ['armL', 'armR']) {
    const hand = rig.userData.hands[side];
    const handMeshes = [];
    hand.group.traverse((o) => { if (o.isMesh) handMeshes.push(o); });
    for (const m of handMeshes) assert.ok(!m.userData.tintable, 'mesh da mão não é tintable');
    assert.ok(handMeshes.length >= 11, `mão completa presente (${handMeshes.length} meshes: dorso + 8 falanges + 2 polegar + knuckles)`);
  }
  // simulação do recolor do seletor de operativo
  const before = rig.userData.hands.armR.fingers[0].base.children.find((o) => o.isMesh).material.color.getHex();
  rig.traverse((node) => {
    if (node.isMesh && node.userData?.tintable && node.material?.color) node.material.color.set('#8a1f2b');
  });
  const after = rig.userData.hands.armR.fingers[0].base.children.find((o) => o.isMesh).material.color.getHex();
  assert.equal(before, after, 'dedos mantêm o tom de pele após o recolor');
});
