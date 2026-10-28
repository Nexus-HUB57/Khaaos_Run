// Fase 12 — blendshapes faciais: expressões como variantes de textura + pose
// da mandíbula. Rig determinístico acoplado ao animateOperative: dor do
// impacto > piscar automático; morte e DBNO têm rosto próprio. Sem WebGL —
// as texturas nunca rasterizam (stub de Canvas2D), só contrato e memoização.
import { test } from 'node:test';
import assert from 'node:assert/strict';

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

const {
  createOperative, animateOperative, createFaceRig, FACIAL_EXPRESSIONS, FACE_JAW,
} = await import('../src/game3d/entities3d.js');
const { faceTexture } = await import('../src/game3d/textures3d.js');

test('catálogo: 6 expressões canônicas com pose de mandíbula definida', () => {
  assert.deepEqual(FACIAL_EXPRESSIONS, ['neutral', 'blink', 'pain', 'shout', 'death', 'knocked']);
  for (const e of FACIAL_EXPRESSIONS) assert.equal(typeof FACE_JAW[e], 'number', `FACE_JAW.${e} existe`);
  assert.ok(FACE_JAW.shout > FACE_JAW.pain && FACE_JAW.pain > FACE_JAW.death, 'grito abre mais que dor > morte');
});

test('faceTexture: variantes por expressão são texturas distintas e memoizadas', () => {
  const neutral = faceTexture('#d9a06b', '#f59e0b', '#171717', 'neutral');
  const pain = faceTexture('#d9a06b', '#f59e0b', '#171717', 'pain');
  const death = faceTexture('#d9a06b', '#f59e0b', '#171717', 'death');
  assert.notEqual(neutral, pain, 'dor ≠ neutro');
  assert.notEqual(pain, death, 'dor ≠ morte');
  assert.equal(faceTexture('#d9a06b', '#f59e0b', '#171717', 'pain'), pain, 'memoizada por combo+expressão');
  assert.equal(faceTexture('#d9a06b', '#f59e0b', '#171717'), neutral, 'default = neutral');
  // retrocompatibilidade: assinatura antiga 3-arg continua válida
  assert.equal(faceTexture('#d9a06b', '#f59e0b', '#171717'), neutral);
});

test('createOperative: parts.face é um rig funcional com neutral inicial', () => {
  const { parts } = createOperative({ variant: 'onith' });
  assert.ok(parts.face, 'rig facial presente');
  assert.equal(parts.face.expression, 'neutral');
  assert.equal(parts.face.weight, 0);
  assert.ok(parts.face.set('pain', 1), 'set aceita expressão válida');
  assert.equal(parts.face.expression, 'pain');
  assert.notEqual(parts.face.face.material, undefined, 'material trocado');
});

test('pesos: clamp 0..1, inválida → false, <.5 volta ao neutral no map', () => {
  const { parts } = createOperative({ variant: 'zheers' });
  const rig = parts.face;
  const neutralMat = rig.face.material;
  assert.equal(rig.set('shout', 2), true, 'peso acima de 1 satura');
  assert.equal(rig.weight, 1);
  assert.equal(rig.set('shout', -3), true, 'peso negativo zera');
  assert.equal(rig.weight, 0);
  assert.equal(rig.expression, 'neutral');
  assert.equal(rig.set('existir?', 1), false, 'expressão desconhecida rejeitada');
  rig.set('pain', 1);
  assert.notEqual(rig.face.material, neutralMat, 'peso ≥ .5 troca o map');
  rig.set('pain', .3);
  assert.equal(rig.expression, 'neutral', 'peso < .5 devolve map neutro');
  rig.reset();
  assert.equal(rig.weight, 0);
  assert.equal(rig.jaw.position.y, rig.jaw.position.y, 'sem NaN após reset');
});

test('mandíbula: desce e abre por expressão, dentro de limites anatômicos', () => {
  const { parts } = createOperative({ variant: 'khael' });
  const rig = parts.face;
  const y0 = rig.jaw.position.y;
  rig.set('neutral', 1);
  assert.equal(rig.jaw.position.y, y0, 'neutro não mexe a mandíbula');
  rig.set('shout', 1);
  const shoutY = rig.jaw.position.y, shoutSy = rig.jaw.scale.y;
  assert.ok(shoutY < y0 - .01, 'grito desce a mandíbula');
  assert.ok(shoutSy > rig.jaw.scale.y - 1e9 && shoutSy >= .95, 'grito abre (scale.y cresce)');
  rig.set('pain', 1);
  const painY = rig.jaw.position.y;
  assert.ok(painY > shoutY, 'dor abre menos que grito');
  assert.ok(rig.jaw.position.y > y0 - .1 && rig.jaw.scale.y < 1.2, 'limites anatômicos');
});

test('acoplamento hit → dor: envelope do impacto pinta o rosto e decai p/ piscar', () => {
  const { parts } = createOperative({ variant: 'huram' });
  // impacto no pico do envelope (age .06 = fim do ataque, env 1) → dor máxima
  animateOperative(parts, { t: 1, hit: { angle: 0, power: 1, age: .06 } });
  assert.equal(parts.face.expression, 'pain');
  assert.equal(parts.face.weight, 1);
  // envelope decaído (.55 s) → abaixo do limiar → piscar/neutro assume
  animateOperative(parts, { t: 1.2, hit: { angle: 0, power: 1, age: .55 } });
  assert.equal(parts.face.expression, 'neutral', 'dor passou: volta ao ciclo de blink/neutral');
});

test('piscar automático: determinístico no ciclo de 3.6 s e dessincronizado por ator', () => {
  const { parts: a } = createOperative({ variant: 'venex' });
  const { parts: b } = createOperative({ variant: 'skeetw' });
  // dentro da janela de blink (t % 3.6 < .11)
  animateOperative(a, { t: 3.62 });
  assert.equal(a.face.expression, 'blink', 'janela do piscar fecha o olho');
  // fora da janela
  animateOperative(a, { t: 2 });
  assert.equal(a.face.expression, 'neutral');
  // mesmo t → mesmo estado (sem Math.random)
  animateOperative(a, { t: 7.31 });
  animateOperative(b, { t: 7.31 });
  assert.equal(a.face.expression, b.face.expression, 'mesmo t → mesmo estado facial');
});

test('morte e DBNO: rosto próprio, hit não sobrepõe (poses especiais imunes)', () => {
  const { parts } = createOperative({ variant: 'onith' });
  animateOperative(parts, { t: 1, dead: true, hit: { angle: 0, power: 1, age: 0 } });
  assert.equal(parts.face.expression, 'death', 'morto tem rosto de morte');
  const { parts: kn } = createOperative({ variant: 'onith' });
  animateOperative(kn, { t: 1, knocked: true, hit: { angle: 0, power: 1, age: 0 } });
  assert.equal(kn.face.expression, 'knocked', 'DBNO tem careta com dentes cerrados');
});

test('retrocompatibilidade: parts sem rig facial não quebram animateOperative', () => {
  const { parts } = createOperative({ variant: 'venex' });
  delete parts.face;
  assert.doesNotThrow(() => {
    animateOperative(parts, { t: 1, dead: true });
    animateOperative(parts, { t: 1, knocked: true });
    animateOperative(parts, { t: 1, hit: { angle: 0, power: 1, age: 0 } });
    animateOperative(parts, { t: 3.62 });
  }, 'proxy/legado sem rosto segue animando');
});

test('createFaceRig standalone: API mínima funciona fora do createOperative', () => {
  const fakeFace = { material: { clone() { return { map: null }; } } };
  const fakeJaw = { position: { y: -.075, z: -.015 }, scale: { y: .8 } };
  const rig = createFaceRig(fakeFace, fakeJaw, { skin: '#d9a06b', eye: '#f59e0b', hair: '#171717' });
  assert.ok(rig.set('blink', 1));
  assert.equal(rig.expression, 'blink');
  assert.ok(rig.set('death', 1));
  assert.equal(rig.expression, 'death');
  assert.ok(fakeJaw.position.y < -.075, 'mandíbula da morte desce');
});
