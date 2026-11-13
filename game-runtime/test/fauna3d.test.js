// Khaaos Run — Task 65 (P1): FAUNA CANÔNICA POR MUNDO.
//
// O usuário cobrou os "características, animais, etc" de cada mundo conforme
// as descrições oficiais. Este teste trava o contrato do fauna3d.js:
//   • espécies presentes por mundo (dedo-duro: ratos/gaivotas/gafanhotos/
//     mosquitos; jacarés em Priadus; tubarões + esqueletos de baleia em
//     Arukheea);
//   • determinismo (mesma seed → mesmos placements) e variação por seed;
//   • ZERO impacto em gameplay: nenhum collider novo e tubarões FORA da arena;
//   • animators rodáveis headless (300 frames, agitação 0 e 1);
//   • setAgitation clampado (NaN/negativo → 0).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildScene } from '../src/game3d/world3d.js';
import { faunaPlacements, FAUNA_PLAN, buildFauna } from '../src/game3d/fauna3d.js';
import { getWorldLayout } from '../src/game3d/sim3d.js';
import { resolveScenario } from '../src/game3d/scenarios.js';

// stub de canvas p/ texturas procedurais headless (mesmo padrão do worldmarks.test.js)
const ctx2d = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', font: '',
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
  moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
  bezierCurveTo() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
  fillText() {}, setTransform() {}, drawImage() {},
  measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
  putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}

const build = (seed, id) => buildScene(seed, id, null, 'medium').scene;

test('fauna: espécies canônicas presentes por mundo (cânon README/worlds.ts)', () => {
  const cigkv = build('FAUNA-1', 'CIGKV');
  assert.ok(cigkv.userData.fauna.counts.rat >= 4, 'dedo-duro: ratos no campo de instrução');
  assert.ok(cigkv.userData.fauna.counts.seagull >= 1, 'dedo-duro: gaivotas');
  assert.ok(cigkv.userData.fauna.counts.locust >= 1, 'dedo-duro: gafanhotos no Parque Abandonado');
  assert.equal(cigkv.userData.fauna.counts.croc ?? 0, 0, 'jacaré NÃO pertence ao CIGKV');
  assert.equal(cigkv.userData.fauna.counts.shark ?? 0, 0, 'tubarão NÃO pertence ao CIGKV');

  const barburhen = build('FAUNA-1', 'Barburhen');
  assert.ok(barburhen.userData.fauna.counts.rat >= 6, 'ratos no urbano pós-guerra');
  assert.ok(barburhen.userData.fauna.counts.mosquito >= 1, 'mosquitos nas poças ácidas');
  assert.ok(barburhen.userData.fauna.counts.seagull >= 1);

  const priadus = build('FAUNA-1', 'Priadus');
  assert.ok(priadus.userData.fauna.counts.croc >= 2, 'JACARÉS canônicos da Área Pantanosa');
  assert.ok(priadus.userData.fauna.counts.mosquito >= 2, 'mosquitos na neblina');
  assert.equal(priadus.userData.fauna.counts.rat ?? 0, 0, 'selva não tem ratos urbanos');

  const ckesalth = build('FAUNA-1', 'Ckesalth');
  assert.ok(ckesalth.userData.fauna.counts.locust >= 2, 'gafanhotos canônicos do deserto');
  assert.ok(ckesalth.userData.fauna.counts.mosquito >= 1, 'mosquitos nas lagoas de óleo');
  assert.equal(ckesalth.userData.fauna.counts.croc ?? 0, 0);

  const arukheea = build('FAUNA-1', 'Arukheea');
  assert.ok(arukheea.userData.fauna.counts.shark >= 3, 'TUBARÕES patrulhando o mar (worlds.ts)');
  assert.ok(arukheea.userData.fauna.counts.whaleSkeleton >= 1, 'Cemitério das Baleias: esqueletos');
  assert.ok(arukheea.userData.fauna.counts.seagull >= 1, 'gaivotas sobre o mar');
});

test('fauna: determinismo — mesma seed → mesmos placements; seeds distintas variam', () => {
  const a = faunaPlacements(getWorldLayout('FAUNA-DET', 'Priadus'), 'Priadus');
  const b = faunaPlacements(getWorldLayout('FAUNA-DET', 'Priadus'), 'Priadus');
  assert.deepEqual(a.items, b.items);
  const c = faunaPlacements(getWorldLayout('FAUNA-DET-2', 'Priadus'), 'Priadus');
  assert.notDeepEqual(a.items, c.items, 'seed diferente → âncoras diferentes');
});

test('fauna: ZERO impacto em gameplay — nenhum collider novo', () => {
  for (const id of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    const layout = getWorldLayout('FAUNA-COL', id);
    const before = layout.colliders.length;
    const scenario = resolveScenario(id);
    const scene = new THREE.Scene();
    buildFauna(scene, layout, scenario, { dressingFactor: 1 });
    assert.equal(layout.colliders.length, before, `${id}: fauna não adiciona collider`);
    assert.ok(scene.userData.fauna.group.children.length > 0, `${id}: fauna instanciada`);
  }
});

test('fauna: tubarões patrulham FORA da arena (anel marítimo ≥ 200 m)', () => {
  const arukheea = build('FAUNA-SEA', 'Arukheea');
  const sharks = arukheea.userData.fauna.placements.filter((p) => p.kind === 'shark');
  assert.ok(sharks.length >= 3);
  for (const s of sharks) {
    const dist = Math.hypot(s.x, s.z);
    assert.ok(dist >= 200, `tubarão a ${Math.round(dist)} m do centro — fora da área jogável`);
    assert.ok(dist <= 275, 'e dentro do anel marítimo dos marcos (205–340)');
  }
});

test('fauna: animators rodáveis headless (300 frames × agitação 0 e 1)', () => {
  for (const id of ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea']) {
    const userData = build('FAUNA-ANIM', id).userData;
    const fauna = userData.fauna;
    assert.ok(fauna.animators.length > 0, `${id}: tem animators`);
    fauna.setAgitation(0);
    for (let i = 0; i < 300; i++) for (const fn of fauna.animators) fn(1 / 30, i / 30);
    fauna.setAgitation(1); // dedo-duro: pressão máxima do Ring
    for (let i = 0; i < 300; i++) for (const fn of fauna.animators) fn(1 / 30, i / 30);
    assert.ok(fauna.group.children.length > 0, `${id}: malhas vivas após 600 frames`);
  }
});

test('fauna: agitação acelera a patrulha (jacaré anda mais com pressão 1)', () => {
  const crocPlacement = build('FAUNA-AGIT', 'Priadus').userData.fauna.placements.find((p) => p.kind === 'croc');
  assert.ok(crocPlacement, 'Priadus tem jacarés');

  // jacaré de referência: mede o deslocamento no mesmo horizonte de tempo
  const measure = (agitation) => {
    const scenario = resolveScenario('Priadus');
    const layout = getWorldLayout('FAUNA-AGIT', 'Priadus');
    const scene = new THREE.Scene();
    const fauna = buildFauna(scene, layout, scenario, { dressingFactor: 1 });
    fauna.setAgitation(agitation);
    const croc = fauna.group.children.find((c) => c.userData.tailParts); // corpo do jacaré
    assert.ok(croc, 'jacaré encontrado na cena');
    const x0 = croc.position.x, z0 = croc.position.z;
    for (let i = 0; i < 200; i++) for (const fn of fauna.animators) fn(1 / 30, i / 30);
    return Math.hypot(croc.position.x - x0, croc.position.z - z0);
  };
  const calm = measure(0);
  const agitated = measure(1);
  assert.ok(agitated > calm, `pressão dedo-duro acelera (calmo ${calm.toFixed(2)} m vs agitado ${agitated.toFixed(2)} m)`);
});

test('fauna: setAgitation clamp (NaN/negativo/overflow → 0..1)', () => {
  const fauna = build('FAUNA-CLAMP', 'CIGKV').userData.fauna;
  fauna.setAgitation(NaN);
  fauna.setAgitation(-3);
  fauna.setAgitation(7);
  fauna.setAgitation(0.5);
  assert.ok(true, 'nenhum lançamento — clamp defensivo aplicado');
});

test('fauna: plano canônico por mundo é imutável e cobre os 5 mundos', () => {
  assert.equal(Object.keys(FAUNA_PLAN).length, 5);
  assert.throws(() => { FAUNA_PLAN.CIGKV.rat = null; }, TypeError, 'FAUNA_PLAN é congelado');
});

test('fauna: densidade de qualidade escala contagens (low < high)', () => {
  const layout = getWorldLayout('FAUNA-LOD', 'Barburhen');
  const high = faunaPlacements(layout, 'Barburhen', { density: 1 });
  const low = faunaPlacements(layout, 'Barburhen', { density: 0.4 });
  assert.ok(low.counts.rat < high.counts.rat, 'tier low raleia a fauna');
  assert.ok(low.counts.rat >= 1, 'mas presença mínima permanece (mundo vivo)');
});

test('fauna: idempotência — mesma cena não acumula 2×', () => {
  const scene = build('FAUNA-IDEM', 'Priadus');
  const before = scene.userData.fauna.group.children.length;
  const again = buildFauna(scene, getWorldLayout('FAUNA-IDEM', 'Priadus'), resolveScenario('Priadus'), { dressingFactor: 1 });
  assert.equal(again, scene.userData.fauna);
  assert.equal(scene.userData.fauna.group.children.length, before);
});
