// Fase 50 — KIT DE CONSTRUÇÃO CANÔNICA de personagens (referência CoD).
// Valida em node puro (sem WebGL): resolução de etnia canônica por operativo
// (catálogo 33 ids), crânio ESCULPIDO distinto por família étnica, olhos 3D
// (esclera/íris/pupila/pálpebra), sobrancelhas/lábios/nariz como geometria,
// proporção ~8 cabeças, orçamento de tris com cabelo/barba, drop-in da API
// de parts e determinismo por variant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// ---- stub de Canvas2D (complexionTexture desenha em <canvas>) ----
const ctx2d = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
  fillRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
  ellipse() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {},
  save() {}, restore() {}, translate() {},
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(128) }; },
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
  putImageData() {},
  measureText() { return { width: 10 }; },
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}

const { createOperative, animateOperative, SKIN_TONES } = await import('../src/game3d/entities3d.js');
const { ETHNIC_SCULPT, CANON, resolveEthnicity, sculptSkullGeo, buildCanonicalHead } = await import('../src/game3d/heads3d.js');

function meshStats(group) {
  let tris = 0;
  const sclera = [], lids = [], brows = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    if (o.material === heads3dInternals.sclera) sclera.push(o);
    if (o.userData.canonicalBrow) brows.push(o);
    if (o.userData.canonicalLid) lids.push(o);
  });
  return { tris, sclera, brows, lids };
}
// acesso aos materiais canônicos p/ identificar olhos (memoizados por cor)
import * as heads3dUrl from '../src/game3d/heads3d.js';
const heads3dInternals = { sclera: null, eyeFor: null };

test('cânone: 33 operativos do catálogo mapeiam para famílias étnicas válidas', () => {
  assert.equal(Object.keys(CANON).length, 33, 'todos os operativos do catálogo');
  for (const [id, [preset]] of Object.entries(CANON)) {
    assert.ok(ETHNIC_SCULPT[preset], `${id}: preset ${preset} existe`);
    assert.ok(/OP_(MALE|FEMALE|MIL_|GNG_)/.test(id), `${id}: namespace coerente`);
  }
  const presets = new Set(Object.values(CANON).map(([p]) => p));
  assert.ok(presets.size >= 7, `≥7 famílias étnicas representadas (${presets.size})`);
});

test('resolveEthnicity: mapeamento canônico correto e determinístico', () => {
  const casos = [
    ['OP_MALE_BREACHER', 'europeu'],      // Eslavo Nórdico
    ['OP_MALE_RECON_ASIAN', 'asiatico'],  // Leste-Asiático
    ['OP_MALE_MEDIC_AFRICAN', 'afro'],    // Subsaariano
    ['OP_MALE_HUNTER_INDIGENOUS', 'indigena'],
    ['OP_MALE_MARKSMAN_MENA', 'arabe'],
    ['OP_MALE_BERSERKER_PACIFIC', 'polinesio'],
    ['OP_MALE_TECH_INDIAN', 'sulasiatico'],
    ['OP_FEMALE_PILOT_EURO', 'europeu'],
    ['OP_MALE_TALON', 'pardo'],
  ];
  for (const [id, esperado] of casos) {
    const c = resolveEthnicity(id);
    assert.equal(c.preset, esperado, `${id} → ${esperado}`);
    assert.equal(c.preset, resolveEthnicity(id).preset, `${id} determinístico`);
  }
  assert.equal(resolveEthnicity('OP_FEMALE_SNIPER').gender, 'FEMININO');
  assert.equal(resolveEthnicity('OP_FEMALE_SNIPER').style, 'long', 'operatrizes: cabelo longo');
  // Talon: identidade fixa — NUNCA ganha barba (moicano + visor dominam)
  assert.equal(resolveEthnicity('OP_MALE_TALON').beard, false);
  // bots fora do catálogo: fallback determinístico dentro das famílias válidas
  const b1 = resolveEthnicity('bot-aleatorio-73');
  assert.ok(ETHNIC_SCULPT[b1.preset], 'bot cai em família válida');
  assert.equal(b1.preset, resolveEthnicity('bot-aleatorio-73').preset);
});

test('crânio ESCULPIDO: geometria distinta por família étnica (não é só recolor)', () => {
  const a = sculptSkullGeo('afro', 'MASCULINO');
  const b = sculptSkullGeo('europeu', 'MASCULINO');
  const c = sculptSkullGeo('asiatico', 'MASCULINO');
  const ha = a.attributes.position.array.slice();
  const hb = b.attributes.position.array.slice();
  const hc = c.attributes.position.array.slice();
  let difAB = 0, difAC = 0;
  for (let i = 0; i < ha.length; i += 3) {
    if (Math.abs(ha[i] - hb[i]) > 1e-6) difAB++;
    if (Math.abs(ha[i] - hc[i]) > 1e-6) difAC++;
  }
  assert.ok(difAB > 50, `afro ≠ europeu em ≥50 vértices (${difAB})`);
  assert.ok(difAC > 50, `afro ≠ asiatico em ≥50 vértices (${difAC})`);
  // memoizada: mesma instância
  assert.equal(sculptSkullGeo('afro', 'MASCULINO'), a);
  // gênero esculpe diferente (dimorfismo)
  const f = sculptSkullGeo('afro', 'FEMININO');
  assert.notEqual(f, a, 'gênero altera a sculpt');
});

test('buildCanonicalHead: semblante 3D completo (olhos, pálpebras, sobrancelhas, lábios, nariz)', () => {
  const skinM = { toString: () => 'skinM' };
  const kit = buildCanonicalHead({
    variant: 'OP_MALE_VANGUARD', skin: '#8d5524', eye: '#f59e0b', hair: '#171717',
    helmet: false, skinM, hairM: { toString: () => 'hairM' }, gearM: {}, gearM2: {}, metalM: {}, vestM: {},
  });
  assert.ok(kit.head && kit.jaw && kit.face && kit.rig, 'kit retorna head/jaw/face/rig');
  assert.equal(kit.canon.preset, 'pardo');
  const kinds = {};
  kit.head.traverse((o) => { if (o.isMesh) kinds[o.geometry.type] = (kinds[o.geometry.type] || 0) + 1; });
  assert.ok(kinds.SphereGeometry >= 12, `volumes orgânicos presentes (${kinds.SphereGeometry})`);
  assert.ok(kinds.CircleGeometry >= 4, 'íris+pupila dos 2 olhos em disco');
  assert.ok(kinds.BoxGeometry >= 3, 'sobrancelhas/linha da boca/nariz-ponte');
  // proporção ~8 cabeças: o CRÂNIO (sem pescoço/gear) mede ~.22 m p/ 1.8 m
  const skull = kit.head.children.find((o) => o.isMesh && o.geometry.attributes.position.count === sculptSkullGeo('pardo', 'MASCULINO').attributes.position.count);
  const bbox = new THREE.Box3().setFromObject(skull);
  const altura = bbox.max.y - bbox.min.y;
  assert.ok(altura > .19 && altura < .26, `crânio ~.22 m (${altura.toFixed(3)})`);
  // cachos/volumes AGARRADOS: centro ≤ topo do crânio + raio do volume (nada orbitando)
  const topo = bbox.max.y;
  kit.head.traverse((o) => {
    if (!o.isMesh || o.geometry.type !== 'SphereGeometry') return;
    const b = new THREE.Box3().setFromObject(o);
    const r = (b.max.y - b.min.y) / 2;
    assert.ok(b.max.y - r <= topo + .03, `volume acoplado ao crânio (centro ${(b.max.y - r).toFixed(3)} ≤ ${ (topo + .03).toFixed(3)})`);
  });
  // olhos voltados para -z (frente do modelo)
  const iris = [];
  kit.head.traverse((o) => { if (o.isMesh && o.geometry.type === 'CircleGeometry') iris.push(o); });
  for (const o of iris) assert.ok(o.position.z < 0, 'íris no hemisfério frontal');
});

test('drop-in: createOperative expressa o cânone sem quebrar a API Fase 7/9', () => {
  const { group, parts } = createOperative({ variant: 'OP_MALE_MEDIC_AFRICAN', skin: '#3c2009', hair: '#0a0a0a' });
  for (const k of ['head', 'torso', 'legL', 'legR', 'armL', 'armR', 'shadow', 'face']) assert.ok(parts[k], `parts.${k} existe`);
  assert.equal(parts.legL.hip.position.y, .84, 'pivô do quadril intacto');
  assert.equal(parts.head.position.y, .46, 'pivô da cabeça intacto');
  assert.equal(parts.head.userData.canon.preset, 'afro', 'cânone exposto em head.userData');
  assert.ok(parts.face.set('pain', 1), 'rig facial operacional');
  parts.face.reset();
  // 3 variantes do catálogo + bot: orçamento ≤ 6500 tris
  for (const v of ['OP_MALE_BERSERKER_PACIFIC', 'OP_FEMALE_VALKYRIE', 'OP_MIL_FEMALE_SORO', 'bot-aleatorio-73']) {
    const { group: g2 } = createOperative({ variant: v });
    let tris = 0;
    g2.traverse((o) => { if (o.isMesh) tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; });
    assert.ok(tris <= 6500, `${v}: ${tris} tris ≤ 6500`);
    assert.ok(tris >= 3000, `${v}: ${tris} tris — detalhe canônico presente`);
  }
});

test('cabelo/barba por estilo: curly aglomera cachos, long tem nuca, Talon raspado', () => {
  const hairM = { __sentinela: true };  // identidade exata: só o cabelo usa esse material
  const hairCount = (variant, helmet) => {
    const kit = buildCanonicalHead({
      variant, helmet, skin: '#8d5524', skinM: { __skin: true }, hairM,
      gearM: {}, gearM2: {}, metalM: {}, vestM: {},
    });
    let n = 0;
    kit.head.traverse((o) => { if (o.isMesh && o.material === hairM && o.geometry.type === 'SphereGeometry') n++; }); // couro cabeludo (sobrancelhas são caixas)
    return { n, canon: kit.canon };
  };
  const curly = hairCount('OP_GNG_MALE_BAILE', false);       // afro curly
  assert.ok(curly.n >= 7, `curly: gorro + ≥6 cachos (${curly.n})`);
  const shaved = hairCount('OP_MALE_TALON', false);          // raspado (moicano é F7)
  assert.equal(shaved.n, 0, 'Talon: zero malha de cabelo do kit');
  const longo = hairCount('OP_FEMALE_VALKYRIE', false);      // longo: gorro+nuca+2 mechas
  assert.ok(longo.n >= 4, `long: gorro + nuca + mechas (${longo.n})`);
  // barba: viés canônico exposto no cânone (árabe .72 TEM, indígena .18 NÃO)
  assert.equal(hairCount('OP_MALE_MARKSMAN_MENA', true).canon.beard, true, 'árabe com barba');
  assert.equal(hairCount('OP_MALE_HUNTER_INDIGENOUS', true).canon.beard, false, 'indígena sem barba');
});

test('animação: rig canônico responde a expressões sem NaN e sem teleporte', () => {
  const { parts } = createOperative({ variant: 'OP_FEMALE_DISRUPTOR_MENA' });
  for (let t = 0; t <= 2; t += 1 / 30) {
    animateOperative(parts, { t, speedNorm: .7, phase: t * 9.3 });
    assert.ok(Number.isFinite(parts.head.rotation.x), 'cabeça sem NaN');
    const jaw = parts.face.jaw;
    assert.ok(Number.isFinite(jaw.scale.y) && jaw.scale.y > 0, 'mandíbula sem NaN');
  }
  const antes = parts.face.jaw.position.y;
  parts.face.set('shout', 1);
  assert.ok(parts.face.jaw.position.y < antes, 'grito desce a mandíbula (rig novo acoplado)');
  parts.face.reset();
});
