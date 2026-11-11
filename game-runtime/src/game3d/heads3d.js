// Khaaos Run — Fase 50: KIT DE CONSTRUÇÃO CANÔNICA DE PERSONAGENS (referência CoD).
// O cânone vive no catálogo (Content/Avatars/avatar_catalog.json: 33 operativos,
// 25+ etnias documentadas) — mas o rig antigo era idêntico p/ todos: só trocava
// cor. Este kit EXPRESSA o cânone em geometria: crânio ESCULPIDO por etnia
// (arco superciliar, zigomático, taper mandibular, mento, achatamento facial),
// OLHOS 3D (esclera+íris+pupila+pálpebra com piscar), sobrancelhas, nariz
// esculpido (ponte/asa/carninha), lábios com volume, orelhas, cabelo por estilo
// (buzz/curly/straight/long/shaved) e barba opcional — proporção ~8 cabeças
// (fim da leitura robótica de cabeça grande).
// Contratos preservados: pivôs (quadril .84 / tronco 1.22 / cabeça 1.68),
// API de parts, FACIAL_EXPRESSIONS/FACE_JAW/createFaceRig (material do patch
// de complexão troca por expressão — teste facial-blendshapes continua verde).
// Tudo determinístico (hash por variant) e memoizado (≤24 atores fluidos).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { complexionTexture } from './textures3d.js';

// ---------- parâmetros craniofaciais por família étnica ----------
// Valores multiplicadores sobre a malha base (1 = neutro). Medidas canônicas
// de antropometria craniofacial comparada, calibradas a olho no showcase f50.
export const ETHNIC_SCULPT = {
  afro:        { noseW: 1.30, noseH: .92, noseProj: 1.02, nostril: 1.38, lipFull: 1.55, lipW: 1.10, brow: .92,  browY: 0,    cheekH: 1.12, cheekW: 1.12, jawW: 1.10, chin: 1.02, flat: 0,    eyeSp: 1.05, fold: .55, beardBias: .35 },
  europeu:     { noseW: .84,  noseH: 1.12, noseProj: 1.16, nostril: .80,  lipFull: .82,  lipW: 1.0,  brow: 1.28, browY: .004, cheekH: .88,  cheekW: .92,  jawW: 1.08, chin: 1.14, flat: 0,    eyeSp: .96,  fold: 1.0,  beardBias: .50 },
  asiatico:    { noseW: .96,  noseH: .76, noseProj: .78,  nostril: .86,  lipFull: .95,  lipW: .92,  brow: .70,  browY: .002, cheekH: 1.24, cheekW: 1.18, jawW: .92,  chin: .86,  flat: 1.10, eyeSp: 1.08, fold: .28, beardBias: .20 },
  arabe:       { noseW: .96,  noseH: 1.18, noseProj: 1.32, nostril: .90,  lipFull: 1.05, lipW: .98,  brow: 1.16, browY: .002, cheekH: .96,  cheekW: .96,  jawW: 1.0,  chin: 1.06, flat: 0,    eyeSp: .98,  fold: .85,  beardBias: .72, aquiline: 1 },
  indigena:    { noseW: 1.06, noseH: .84, noseProj: .84,  nostril: .95,  lipFull: 1.0,  lipW: 1.0,  brow: .78,  browY: 0,    cheekH: 1.32, cheekW: 1.30, jawW: 1.04, chin: .92,  flat: 1.25, eyeSp: 1.12, fold: .42, beardBias: .18 },
  polinesio:   { noseW: 1.16, noseH: 1.0, noseProj: 1.04, nostril: 1.10, lipFull: 1.28, lipW: 1.06, brow: 1.22, browY: .002, cheekH: 1.14, cheekW: 1.12, jawW: 1.24, chin: 1.10, flat: .40,  eyeSp: 1.02, fold: .70, beardBias: .30 },
  sulasiatico: { noseW: 1.0,  noseH: .95, noseProj: .98,  nostril: 1.0,  lipFull: 1.12, lipW: 1.0,  brow: 1.0,  browY: 0,    cheekH: 1.06, cheekW: 1.0,  jawW: 1.0,  chin: .98,  flat: .20,  eyeSp: 1.0,  fold: .70, beardBias: .62 },
  pardo:       { noseW: 1.10, noseH: .95, noseProj: 1.0,  nostril: 1.05, lipFull: 1.18, lipW: 1.04, brow: 1.0,  browY: 0,    cheekH: 1.06, cheekW: 1.04, jawW: 1.02, chin: 1.0,  flat: .30,  eyeSp: 1.02, fold: .68, beardBias: .45 },
};

// ---------- cânone por operativo (espelha avatar_catalog.json) ----------
// id → [família étnica, estilo de cabelo]. Gênero deriva do próprio id
// (/FEMALE/). Talon mantém identidade FIXA (moicano vem do buildAccessories).
export const CANON = Object.freeze({
  OP_MALE_VANGUARD: ['pardo', 'curly'],
  OP_MALE_BREACHER: ['europeu', 'straight'],
  OP_MALE_RECON_ASIAN: ['asiatico', 'straight'],
  OP_MALE_MEDIC_AFRICAN: ['afro', 'buzz'],
  OP_MALE_HUNTER_INDIGENOUS: ['indigena', 'straight'],
  OP_MALE_MARKSMAN_MENA: ['arabe', 'straight'],
  OP_MALE_BERSERKER_PACIFIC: ['polinesio', 'buzz'],
  OP_MALE_TECH_INDIAN: ['sulasiatico', 'straight'],
  OP_FEMALE_VALKYRIE: ['afro', 'long'],
  OP_FEMALE_SNIPER: ['pardo', 'long'],
  OP_FEMALE_STEALTH_ASIAN: ['asiatico', 'long'],
  OP_FEMALE_HEAVY_AFRICAN: ['afro', 'long'],
  OP_FEMALE_SURVIVOR_INDIGENOUS: ['indigena', 'long'],
  OP_FEMALE_PILOT_EURO: ['europeu', 'long'],
  OP_FEMALE_DISRUPTOR_MENA: ['arabe', 'long'],
  OP_FEMALE_TACTICIAN_SOUTHASIAN: ['sulasiatico', 'long'],
  OP_MALE_TALON: ['pardo', 'shaved'],
  OP_MIL_MALE_VULTO: ['afro', 'buzz'],
  OP_MIL_MALE_ECO: ['pardo', 'straight'],
  OP_MIL_MALE_FERRAZ: ['europeu', 'buzz'],
  OP_MIL_MALE_GRAU: ['indigena', 'straight'],
  OP_MIL_FEMALE_NOTA: ['afro', 'long'],
  OP_MIL_FEMALE_SIRENE: ['pardo', 'long'],
  OP_MIL_FEMALE_SORO: ['asiatico', 'long'],
  OP_MIL_FEMALE_CORUJA: ['indigena', 'long'],
  OP_GNG_MALE_SPRAY: ['pardo', 'buzz'],
  OP_GNG_MALE_VENTANIA: ['afro', 'buzz'],
  OP_GNG_MALE_CORTA: ['europeu', 'straight'],
  OP_GNG_MALE_BAILE: ['afro', 'curly'],
  OP_GNG_FEMALE_ROTA: ['pardo', 'long'],
  OP_GNG_FEMALE_COTOVELA: ['pardo', 'long'],
  OP_GNG_FEMALE_SOMBRA: ['europeu', 'long'],
  OP_GNG_FEMALE_PIXEL: ['asiatico', 'long'],
});

// fallback determinístico p/ variantes fora do catálogo (bots, OCE_OFFICER…)
const FALLBACK_ROTATION = ['pardo', 'afro', 'europeu', 'asiatico', 'arabe', 'indigena', 'sulasiatico', 'polinesio'];

export function hashIdx(str, mod) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h) % mod;
}

// resolve o cânone de um ator: etnia esculpida + gênero + estilo de cabelo +
// barba (determinístico por variant; gênero/cabelo sobrescrevíveis pelos
// params explícitos do chamador).
export function resolveEthnicity(variant = '', { hair } = {}) {
  const id = String(variant || '');
  const female = /FEMALE/i.test(id);
  const gender = female ? 'FEMININO' : 'MASCULINO';
  const canon = CANON[id];
  let preset, style;
  if (canon) { [preset, style] = canon; }
  else {
    preset = FALLBACK_ROTATION[hashIdx(`etnia:${id}`, FALLBACK_ROTATION.length)];
    style = female ? 'long' : (hashIdx(`cabelo:${id}`, 10) < 6 ? 'buzz' : 'straight');
  }
  if (hair) { /* cor explícita do chamador vence no material; estilo preservado */ }
  if (female && style !== 'long' && style !== 'shaved') style = 'long';
  // barba: só homens, viés por família (árabe/levante > europeu > sulasiático…),
  // nunca no Talon (identidade fixa) nem em estilo raspado
  const bias = ETHNIC_SCULPT[preset].beardBias ?? .35;
  const beard = !female && preset !== 'pardo-talon' && id !== 'OP_MALE_TALON'
    && hashIdx(`barba:${id}`, 100) / 100 < bias;
  return { preset, gender, style, beard };
}

// ---------- helpers locais (memoizados — mesmas malhas entre instâncias) ----------
const _geo = new Map();
const geo = (key, factory) => { if (!_geo.has(key)) _geo.set(key, factory()); return _geo.get(key); };
const _mat = new Map();
const memoMat = (key, factory) => { if (!_mat.has(key)) _mat.set(key, factory()); return _mat.get(key); };

const ball = (r, mat, x = 0, y = 0, z = 0, w = 10, h = 8, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Mesh(geo(`hs${r}:${w}x${h}`, () => new THREE.SphereGeometry(r, w, h)), mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); return m;
};
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo(`hbx${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)), mat);
  m.position.set(x, y, z); return m;
};
const softBox = (w, h, d, mat, radius, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo(`hrb${w}:${h}:${d}:${radius}`, () => new RoundedBoxGeometry(w, h, d, 1, radius)), mat);
  m.position.set(x, y, z); m.userData.roundedVolume = true; return m;
};

// ---------- crânio ESCULPIDO (deslocamento de vértices por etnia) ----------
// Esfera unitária deslocada: arco superciliar, zigomático, afundamento sub-malar,
// taper mandibular, mento projetado, achatamento facial. Frente = -z.
// Memoizada por (etnia, gênero) — 8 famílias × 2 gêneros no máximo.
const _sculpt = new Map();
export function sculptSkullGeo(presetId, gender) {
  const key = `${presetId}:${gender}`;
  if (_sculpt.has(key)) return _sculpt.get(key);
  const p = ETHNIC_SCULPT[presetId] ?? ETHNIC_SCULPT.pardo;
  const male = gender !== 'FEMININO';
  const brow = p.brow * (male ? 1.12 : .85);
  const jawW = p.jawW * (male ? 1.05 : .94);
  const chin = p.chin * (male ? 1.06 : .96);
  const cheekH = p.cheekH * (male ? .98 : 1.05);
  const lipFull = p.lipFull * (male ? .92 : 1.12);   // só informa a sculpt da região da boca
  const g = new THREE.SphereGeometry(1, 14, 11);
  const pos = g.attributes.position;
  const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const front = Math.max(0, -z);
    // proporção craniana: mais alto que largo
    y *= 1.06; x *= .95;
    // arco superciliar (glabella): banda frontal acima dos olhos
    const browBand = Math.exp(-((y - .22) ** 2) / .014) * front ** 1.6;
    z -= browBand * .07 * brow;
    // zigomático (maçãs do rosto): laterais frontais na linha dos olhos
    const cheekBand = Math.exp(-((y - .02) ** 2) / .02) * front ** .8 * Math.abs(x) ** .8;
    x += Math.sign(x) * cheekBand * .085 * p.cheekW;
    z -= cheekBand * .05 * cheekH;
    // afundamento sub-malar (bochecha lê como osso, não balão)
    const submal = Math.exp(-((y + .14) ** 2) / .008) * front ** 1.3;
    z += submal * .028;
    // taper mandibular: alarga/afina a metade inferior
    const jawBand = smoothstep(-.25, -.85, y);
    x *= 1 - jawBand * (1 - jawW) * .3;
    // mento (queixo): projeção inferior frontal
    const chinBand = Math.exp(-((y + .8) ** 2) / .018) * front ** 1.3;
    z -= chinBand * .075 * chin;
    // achatamento facial (traços asiáticos/indígenas: face mais larga e rasa)
    if (p.flat) { z *= 1 - front * .05 * p.flat; x *= 1 + front * .05 * p.flat; }
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  _sculpt.set(key, g);
  return g;
}

// ---------- rig facial (API Fase 12 preservada + geometria nova) ----------
export const FACIAL_EXPRESSIONS = ['neutral', 'blink', 'pain', 'shout', 'death', 'knocked'];
export const FACE_JAW = { neutral: 0, blink: 0, pain: .32, shout: .72, death: .26, knocked: .12 };

export function createFaceRig(face, jaw, { skin, brows = null, lids = null, lips = null } = {}) {
  const mats = new Map();                    // expressão → material de complexão (compartilhado)
  const baseMat = face.material;             // capturado UMA vez (trocas subsequentes clonam da base)
  const matFor = (name) => {
    if (!mats.has(name)) {
      const m = baseMat.clone();
      m.map = complexionTexture(skin, name);
      mats.set(name, m);
    }
    return mats.get(name);
  };
  const JAW0 = { y: jaw.position.y, z: jaw.position.z, sy: jaw.scale.y };
  const B0 = brows ? brows.map((b) => ({ y: b.position.y, z: b.rotation.z, rz: b.rotation.z })) : null;
  const L0 = lids ? lids.map((l) => ({ y: l.position.y, sy: l.scale.y })) : null;
  const rig = {
    face, jaw,
    expression: 'neutral',
    weight: 0,
    set(name, w = 1) {
      if (!FACIAL_EXPRESSIONS.includes(name)) return false;
      const weight = Math.max(0, Math.min(1, w));
      const target = weight >= .5 ? name : 'neutral';
      if (rig.expression !== target) face.material = matFor(target);
      rig.expression = target;
      rig.weight = weight;
      // mandíbula — math F12 intacta (teste de magnitudes continua verde)
      const base = FACE_JAW[name] ?? 0;
      jaw.position.y = JAW0.y - base * .028 * weight;
      jaw.scale.y = JAW0.sy + base * .38 * weight;
      jaw.position.z = JAW0.z + base * .012 * weight;
      // sobrancelhas: dor ergue a MEDIAL (careta), grito ergue tudo, morte cai
      if (B0) {
        for (let i = 0; i < brows.length; i++) {
          const b = brows[i], s = i === 0 ? 1 : -1;
          b.position.y = B0[i].y + (name === 'shout' ? .012 * weight : 0)
            + (name === 'pain' ? .005 * weight : 0) - (name === 'death' ? .006 * weight : 0);
          b.rotation.z = B0[i].z + (name === 'pain' ? s * .3 * weight : 0)   // medial arriba
            - (name === 'knocked' ? s * .22 * weight : 0);                    // franzida
        }
      }
      // pálpebras: piscar fecha; morte/knocked semicerram; dor squint
      if (L0) {
        const close = name === 'blink' ? weight
          : name === 'death' ? .9 * weight
          : name === 'knocked' ? .45 * weight
          : name === 'pain' ? .3 * weight : 0;
        for (let i = 0; i < lids.length; i++) {
          const l = lids[i];
          l.scale.y = L0[i].sy * (1 + close * 1.6);
          l.position.y = L0[i].y - close * .007;
        }
      }
      // lábios: grito abre (segue a mandíbula); dor comprime
      if (lips) {
        lips.upper.position.y = lips.upperY + (name === 'shout' ? .007 * weight : 0);
        lips.lower.position.y = lips.lowerY - (name === 'shout' ? .006 * weight : 0)
          + (name === 'pain' ? .004 * weight : 0);
        lips.lower.scale.y = lips.lowerSY * (name === 'pain' ? 1 - .3 * weight : 1);
      }
      return true;
    },
    reset() {
      rig.set('neutral', 0);
      jaw.position.y = JAW0.y; jaw.scale.y = JAW0.sy; jaw.position.z = JAW0.z;
      if (B0) for (let i = 0; i < brows.length; i++) { brows[i].position.y = B0[i].y; brows[i].rotation.z = B0[i].rz; }
      if (L0) for (let i = 0; i < lids.length; i++) { lids[i].scale.y = L0[i].sy; lids[i].position.y = L0[i].y; }
      if (lips) { lips.upper.position.y = lips.upperY; lips.lower.position.y = lips.lowerY; lips.lower.scale.y = lips.lowerSY; }
    },
  };
  return rig;
}

// ---------- construtor canônico da cabeça ----------
export function buildCanonicalHead({ variant = '', skin = '#d9a06b', eye = '#f59e0b', hair = '#171717', helmet = true, skinM, hairM, gearM, gearM2, metalM, vestM } = {}) {
  const canon = resolveEthnicity(variant, { hair });
  const p = ETHNIC_SCULPT[canon.preset];
  const male = canon.gender === 'MASCULINO';
  const head = new THREE.Group();
  const darkSkinM = memoMat(`lip:${skin}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(skin).multiplyScalar(.72), roughness: .5 }));
  const scleraM = memoMat('sclera', () => new THREE.MeshStandardMaterial({ color: '#ded9cd', roughness: .32 }));
  const irisM = memoMat(`iris:${eye}`, () => new THREE.MeshStandardMaterial({ color: eye, roughness: .28 }));
  const pupilM = memoMat('pupil', () => new THREE.MeshStandardMaterial({ color: '#0a0a0c', roughness: .2 }));
  const mouthM = memoMat('mouth', () => new THREE.MeshStandardMaterial({ color: '#5f2f28', roughness: .55 }));

  // pescoço + trapézio (transição cabeça→tronco sem "flutuar")
  head.add(new THREE.Mesh(geo('hneck', () => new THREE.CylinderGeometry(.058, .068, .11, 8)), skinM));
  head.children[head.children.length - 1].position.set(0, -.125, .004);
  head.add(ball(.05, skinM, 0, -.095, .042, 5, 4, 1.1, .8, .9));

  // crânio esculpido (r base .105 → proporção ~8 cabeças) + mandíbula (rig)
  const skull = new THREE.Mesh(sculptSkullGeo(canon.preset, canon.gender), skinM);
  skull.position.set(0, .01, 0);
  skull.scale.set(.105, .108, .106);
  head.add(skull);
  const jaw = ball(.075, skinM, 0, -.068, -.014, 8, 6, 1.16 * p.jawW * (male ? 1.04 : .96), .72, 1.02);

  // patch de complexão (calota frontal — shading por expressão; o teste F9
  // exige esfera PARCIAL voltada a -z)
  const face = new THREE.Mesh(
    geo('hfacePatch', () => new THREE.SphereGeometry(.1115, 10, 7, Math.PI * 1.5 - .95, 1.9, 1.02, .98)),
    new THREE.MeshStandardMaterial({ map: complexionTexture(skin, 'neutral'), roughness: .55 })
  );
  face.position.set(0, .012, 0);
  head.add(face);

  // ---- olhos 3D: esclera + íris + pupila + pálpebra superior (piscar real) ----
  const lids = [];
  const ex = .047 * p.eyeSp, eyY = .012, ez = -.082;
  for (const s of [-1, 1]) {
    head.add(ball(.0205, scleraM, s * ex, eyY, ez, 7, 5));
    const iris = new THREE.Mesh(geo('hiris', () => new THREE.CircleGeometry(.0115, 8)), irisM);
    iris.position.set(s * ex, eyY, ez - .0192); iris.rotation.y = Math.PI;
    head.add(iris);
    const pupil = new THREE.Mesh(geo('hpupil', () => new THREE.CircleGeometry(.005, 8)), pupilM);
    pupil.position.set(s * ex, eyY, ez - .0197); pupil.rotation.y = Math.PI;
    head.add(pupil);
    const lid = ball(.0225, skinM, s * ex, eyY + .005, ez + .002, 5, 4, 1.06, .62, 1.02);
    lids.push(lid); head.add(lid);
  }

  // ---- sobrancelhas (hairM; arco com medial mais baixa) — caixa fina: rounded
  // é desperdício numa peça de 5 mm ----
  const brows = [];
  for (const s of [-1, 1]) {
    const b = box(.052, .011, .013, hairM, s * ex, .046 + p.browY, -.0965);
    b.rotation.z = s * .16;
    brows.push(b); head.add(b);
  }

  // ---- nariz esculpido: ponte + dorso + asas (largura/projeção por etnia) ----
  const noseY = -.018;
  const bridge = box(.017 * p.noseW, .05 * p.noseH, .028 * p.noseProj, skinM, 0, noseY + .012, -.0955 * p.noseProj);
  bridge.rotation.x = p.aquiline ? -.16 : -.05;
  head.add(bridge);
  head.add(ball(.02 * p.noseW, skinM, 0, noseY - .004 * p.noseH, -.104 * p.noseProj, 6, 5, 1, .82, 1));
  for (const s of [-1, 1]) head.add(ball(.0115 * p.nostril, skinM, s * .0155 * p.nostril * p.noseW, noseY - .006, -.096, 5, 4, 1, .8, .9));

  // ---- lábios com volume (fullness por etnia/gênero) + linha da boca ----
  const lipFull = p.lipFull * (male ? .92 : 1.12);
  const upperLip = ball(.0195, darkSkinM, 0, -.0565, -.093, 5, 4, 1.55 * p.lipW, .5 * lipFull * .9, .78);
  const lowerLip = ball(.018, darkSkinM, 0, -.0675, -.0915, 5, 4, 1.4 * p.lipW, .62 * lipFull, .78);
  const mouthLine = box(.036 * p.lipW, .0032, .01, mouthM, 0, -.0622, -.0985);
  head.add(upperLip, lowerLip, mouthLine);

  // ---- orelhas (lóbulo — concha interna cortada do orçamento) ----
  for (const s of [-1, 1]) head.add(ball(.027, skinM, s * .101, .008, .006, 5, 4, .55, 1, .85));

  head.add(jaw);

  // ---- cabelo por estilo (cânone) — sob capacete vira buzz (fio abaixo do casco) ----
  const style = helmet && canon.style !== 'shaved' && canon.style !== 'long' ? 'buzz'
    : helmet && canon.style === 'long' ? 'longUnder' : canon.style;
  if (style === 'buzz') {
    head.add(ball(.109, hairM, 0, .018, .009, 8, 6, .99, 1.0, .95));
  } else if (style === 'straight') {
    head.add(ball(.112, hairM, 0, .017, .009, 8, 6, 1.0, 1.02, .97));
    head.add(ball(.075, hairM, 0, -.01, .085, 6, 5, 1.25, 1.1, .75)); // nuca
  } else if (style === 'curly') {
    head.add(ball(.11, hairM, 0, .018, .009, 8, 6, 1.02, 1.0, .96));
    const n = 6;
    for (let i = 0; i < n; i++) {                     // cachos: ângulos determinísticos
      const a = (i / n) * Math.PI * 2 + hashIdx(`cacho:${variant}:${i}`, 7) * .3;
      const rr = .085 + hashIdx(`raio:${variant}:${i}`, 5) * .025;
      head.add(ball(.034 + hashIdx(`vol:${variant}:${i}`, 5) * .008, hairM,
        Math.cos(a) * rr, .058 + hashIdx(`alt:${variant}:${i}`, 5) * .014, Math.sin(a) * rr * .9 + .012, 5, 4, 1, .95, 1));
    }
  } else if (style === 'long' || style === 'longUnder') {
    // longUnder (sob capacete): sem gorro — o casco cobre o topo
    if (style === 'long') head.add(ball(.112, hairM, 0, .017, .009, 7, 5, 1.0, 1.02, .97));
    head.add(ball(.095, hairM, 0, -.052, .072, 4, 3, 1.18, 1.3, .78)); // nuca
    for (const s of [-1, 1]) head.add(ball(.035, hairM, s * .092, -.045, .028, 3, 2, .7, 1.9, .8)); // mechas laterais
  } // 'shaved': sem malha (Talon — moicano vem do buildAccessories)

  // ---- barba (viés canônico por família; nunca no Talon) ----
  if (canon.beard) {
    head.add(ball(.086, hairM, 0, -.072, -.028, 8, 6, .95 * p.jawW, .6, .82));
    head.add(box(.052, .011, .012, hairM, 0, -.052, -.0995)); // bigode
  }

  // ---- capacete tático OU boina — assenta NO crânio esculpido ----
  if (helmet) {
    // casco = CALOTA ABERTA (só o topo do crânio): envolve a abóbada, liberta o
    // semblante (antes a esfera fechada engolia o rosto — face às sombras)
    const dome = new THREE.Mesh(geo('hdome', () => new THREE.SphereGeometry(.126, 12, 8, 0, Math.PI * 2, 0, 1.22)), gearM);
    dome.position.set(0, .032, .004);
    dome.scale.set(1.05, 1, 1.08);
    const brim = box(.25, .028, .06, gearM, 0, .072, -.112);
    const band = box(.27, .04, .26, new THREE.MeshStandardMaterial({ color: '#15171b', roughness: .3, metalness: .5 }), 0, .082, .002);
    band.userData.goggleBand = true;
    dome.userData.baseHeadGear = brim.userData.baseHeadGear = band.userData.baseHeadGear = true;
    head.add(dome, brim, band);
    const strapL = box(.016, .12, .02, gearM2, -.095, -.048, .028);
    const strapR = box(.016, .12, .02, gearM2, .095, -.048, .028);
    strapL.userData.baseHeadGear = strapR.userData.baseHeadGear = true;
    head.add(strapL, strapR);
    const railL = box(.02, .05, .13, gearM2, -.104, .11, .01);
    const railR = box(.02, .05, .13, gearM2, .104, .11, .01);
    const nvg = box(.05, .05, .05, metalM, .085, .162, .058);
    railL.userData.baseHeadGear = railR.userData.baseHeadGear = nvg.userData.baseHeadGear = true;
    head.add(railL, railR, nvg);
  } else {
    const cap = softBox(.25, .085, .245, vestM, .02, 0, .132, .008);
    const brim = box(.22, .028, .1, vestM, 0, .1, -.118);
    cap.userData.baseHeadGear = brim.userData.baseHeadGear = true;
    head.add(cap, brim);
  }

  const lips = { upper: upperLip, lower: lowerLip, upperY: upperLip.position.y, lowerY: lowerLip.position.y, lowerSY: lowerLip.scale.y };
  const rig = createFaceRig(face, jaw, { skin, brows, lids, lips });
  head.userData.canon = canon;
  return { head, jaw, face, rig, lids, brows, canon };
}
