// Khaaos Run — Entidades 3D: operativos humanoides DETALHADOS + arsenal enriquecido.
// Fase 6: modelos procedurais nível "próximo do FreeFire" — colete tático com
// pouches, pads, luvas, capacete com óculos, rosto pintado, camuflagem por paleta.
// Fase 7: acessórios determinísticos por operativo (variant), skins de arma por
// raridade do loot e pose de rastejo do DBNO. API de parts/anim PRESERVADA.
// Fase 9: realismo anatômico — crânio esférico com queixo/orelhas/nariz, rosto
// em malha curva, membros em cápsula com juntas esféricas (silhueta suave em
// movimento), torso cônico V-taper com deltoides, sombra de contato e pele com
// poros/pseudo-SSS. Mesma assinatura de createOperative/animateOperative.
import * as THREE from 'three';
import {
  camoMaterial, contactShadowTexture, faceTexture, goggleMaterial, skinMaterial,
} from './textures3d.js';
import { applyMicroDetail } from './materials3d.js';
import { RARITIES } from '../shared/weapons.js';

const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? .82, metalness: opts.metal ?? .12, ...opts.extra });

// Paleta de tons de pele (diversidade étnica canônica dos 16 operativos)
export const SKIN_TONES = ['#f2c9a0', '#d9a06b', '#b97a4b', '#8a5632', '#6b3f24', '#f7d7b8', '#a06a3f', '#5c3820'];
export const VEST_COLORS_FALLBACK = ['#3a3f47', '#4a3d2e', '#37423a', '#443044', '#2e3a45', '#4d3a30'];
const VEST_COLORS = VEST_COLORS_FALLBACK;
const EYE_TONES = ['#f59e0b', '#3b82f6', '#22c55e', '#e879a0', '#d4d4d4', '#a855f7'];
const TRIM_ACCENT = '#c8ff3d'; // verde ácido de comando (marca Khaaos)

// ---------- Fase 9 — cache de geometrias (compartilhadas entre instâncias) ----------
// Personagens repetem as mesmas cápsulas/esferas: memoizar geometria corta ~70% da
// memória de malha com 24 atores simultâneos. Materiais seguem POR INSTÂNCIA.
const _geo = new Map();
function geo(key, factory) {
  if (!_geo.has(key)) _geo.set(key, factory());
  return _geo.get(key);
}
const sphereGeo = (r, w = 10, h = 8) => geo(`s${r}:${w}x${h}`, () => new THREE.SphereGeometry(r, w, h));
const capsuleGeo = (r, l) => geo(`c${r}:${l}`, () => new THREE.CapsuleGeometry(r, l, 3, 8));
const cylGeo = (rt, rb, h, seg = 10) => geo(`y${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function ball(r, mat, x = 0, y = 0, z = 0, w = 10, h = 8, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(sphereGeo(r, w, h), mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}
function capsule(r, l, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(capsuleGeo(r, l), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(cylGeo(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
// hash estável de string → índice (variedade determinística por cor/nome)
function hashIdx(str, mod) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}
function darken(hex, f = .55) {
  return '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();
}

// ---------- Fase 7 — acessórios determinísticos por operativo ----------
// `variant` (id do operativo / nome do bot) deriva, por hash, quais acessórios o
// modelo carrega — cada operativo tem identidade visual própria e estável.
function buildAccessories(head, torso, g, { variant, vest, sec, skin, trim, vestM, secM, gearM, gearM2, metalM, trimM }) {
  // ---- Fase 26 — TALON (Hacker & Urban Runner): identidade FIXA, sem roll —
  // moicano azul + visor digital emissivo na testa + jaqueta techwear volumosa
  // de gola alta + tiras soltas (física de mola no animateOperative) + LEDs
  // holográficos azul/laranja nos braços + traquitana no peito.
  if (variant === 'OP_MALE_TALON') {
    const mohawkM = M('#1e40af', { rough: .85 });
    const mohawkM2 = M('#2563eb', { rough: .8 });
    // moicano: crista central em 3 segmentos decrescentes (leitura de silhueta)
    head.add(box(.05, .1, .1, mohawkM, 0, .17, .07));
    head.add(box(.05, .12, .1, mohawkM2, 0, .19, -.02));
    head.add(box(.05, .09, .1, mohawkM, 0, .16, -.11));
    // laterais raspadas (contraste de volume)
    head.add(box(.02, .07, .2, gearM, -.12, .1, 0));
    head.add(box(.02, .07, .2, gearM, .12, .1, 0));
    // visor digital na testa (self-illumination azul-ciano)
    const visorM = new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#22d3ee', emissiveIntensity: 1.5, roughness: .25, metalness: .2 });
    head.add(box(.19, .05, .025, visorM, 0, .085, -.125));
    head.add(box(.21, .02, .03, gearM2, 0, .055, -.122)); // moldura inferior
    // jaqueta volumosa: ombros largos + painéis laterais + gola alta
    const jacketM = M('#22262f', { rough: .92 });
    const jacketDarkM = M('#14171d', { rough: .95 });
    torso.add(box(.52, .14, .38, jacketM, 0, .26, 0));            // gola alta volumosa
    torso.add(box(.56, .34, .4, jacketM, 0, .02, .015));          // corpo da jaqueta sobre o colete
    torso.add(box(.08, .3, .34, jacketDarkM, -.3, .02, 0));       // painel lateral E
    torso.add(box(.08, .3, .34, jacketDarkM, .3, .02, 0));        // painel lateral D
    torso.add(box(.4, .06, .05, jacketDarkM, 0, .17, -.21));      // dobra do colarinho
    // LEDs holográficos: azul no braço E, laranja no braço D (assinatura hacking)
    const ledBlueM = new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#22d3ee', emissiveIntensity: 1.35, roughness: .3 });
    const ledOrangeM = new THREE.MeshStandardMaterial({ color: '#fb923c', emissive: '#f97316', emissiveIntensity: 1.2, roughness: .3 });
    torso.add(box(.05, .16, .07, ledBlueM, -.35, .06, 0));
    torso.add(box(.05, .16, .07, ledOrangeM, .35, .06, 0));
    // traquitana cibernética no peito (gerador do pulso)
    torso.add(box(.09, .13, .04, gearM2, .14, .14, -.21));
    torso.add(box(.05, .03, .045, ledBlueM, .14, .16, -.215));
    // tiras soltas (2) — penduradas do cinto; mola no animateOperative
    const strapM = M('#101318', { rough: .95 });
    const straps = [];
    for (const [sx, phase] of [[-.24, 0], [.24, 1.9]]) {
      const strap = box(.035, .34, .015, strapM, sx, .62, .17);
      strap.userData.talonPhase = phase;
      straps.push(strap);
      g.add(strap);
    }
    return { straps };
  }
  const seed = variant || vest + skin;
  const roll = (mod, salt = '') => hashIdx(`${seed}:${salt}`, mod);
  const bandColors = ['#8a1f2b', '#1f5a8a', '#3f6a2a', '#6a4a1f', '#22242a'];

  // ---- cabeça ----
  const headGear = roll(5, 'h');
  if (headGear === 0) {
    // bandana no topo do crânio + nó
    head.add(box(.27, .05, .27, M(bandColors[roll(5, 'b')], { rough: .8 }), 0, .16, 0));
    head.add(box(.05, .05, .06, M(bandColors[roll(5, 'b')], { rough: .8 }), .1, .16, .14));
  } else if (headGear === 1) {
    // lanterna de capacete (corpo + lente emissiva)
    head.add(box(.06, .06, .1, gearM2, -.08, .24, .13));
    head.add(box(.04, .04, .02, new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#ffe9a8', emissiveIntensity: 1.4, roughness: .3 }), -.08, .24, .18));
  } else if (headGear === 2) {
    // antena de comunicação curva atrás do capacete
    const ant = cyl(.007, .007, .22, metalM, .12, .28, .1, 4);
    ant.rotation.x = -.5;
    head.add(ant);
    head.add(box(.04, .04, .04, trimM, .12, .38, .03)); // topo emissivo
  } else if (headGear === 3) {
    // meia-máscara de respiração sobre a boca
    head.add(box(.18, .09, .06, M('#23262b', { rough: .6, metal: .3 }), 0, -.06, -.14));
    head.add(box(.14, .03, .03, M('#3a3e45', { rough: .5, metal: .5 }), 0, -.02, -.15));
  }
  // óculos de sol empurrados (variação independente da bandana)
  if (roll(3, 'g') === 0) {
    head.add(box(.2, .05, .03, M('#101114', { rough: .25, metal: .6 }), 0, .09, .13));
  }

  // ---- tronco/colete ----
  const chest = roll(4, 'c');
  if (chest === 0) {
    // faca de combate embainhada no peitoral
    torso.add(box(.035, .2, .05, M('#15171a', { rough: .4, metal: .6 }), -.14, .12, -.21));
    torso.add(box(.05, .05, .06, gearM, -.14, .05, -.21));
  } else if (chest === 1) {
    // patch de equipe emissivo
    torso.add(box(.08, .06, .02, trimM, .16, .14, -.2));
  } else if (chest === 2) {
    // granada presa no colete
    torso.add(cyl(.035, .035, .07, M('#3a4436', { rough: .55, metal: .5 }), .2, -.15, -.2, 6));
  }
  // bandoleira diagonal (tira cruzando o peito)
  if (roll(2, 's') === 0) {
    const strap = box(.05, .62, .02, secM, 0, .02, -.2);
    strap.rotation.z = .62;
    torso.add(strap);
  }

  // ---- cinto/quadril ----
  if (roll(2, 'w') === 0) {
    g.add(box(.09, .12, .09, M('#3a4436', { rough: .7 }), -.24, .8, .08)); // cantil
  }

  // ---- pernas (joelheira extra) ----
  if (roll(2, 'k') === 0) {
    torso.add(box(.07, .1, .07, gearM2, .21, -.32, -.02)); // pouch de coxa
  }

  // ---- braços (faixa de braço do esquadrão) ----
  if (roll(3, 'a') === 0) {
    torso.add(box(.15, .04, .18, M(bandColors[roll(5, 'b2')], { rough: .75 }), -.33, .12, 0));
  }
}

// ---------- operativo (Fase 6/7/9) ----------
// cores: skin, vest (primária), secondary (calça/boina), trim (faixas),
// eyes, hair — todas opcionais com fallback coerente.
// variant (Fase 7): string do operativo/bot — deriva acessórios determinísticos.
// Fase 9: anatomia curva — mesmos pivôs (quadril .84, ombros 1.48, cabeça 1.68),
// mesma API de parts; nenhuma dependência externa de rig.
// ---------- Fase 12 — blendshapes faciais ----------
// O rosto é textura pintada em calota esférica + mandíbula geométrica: cada
// "blendshape" é um PAR (variante de textura, pose da mandíbula). O rig troca
// o map quando o peso cruza .5 (crossfade real exigiria shader dedicado) e
// blendA a mandíbula continuamente — barato, determinístico e sem estado GPU.
export const FACIAL_EXPRESSIONS = ['neutral', 'blink', 'pain', 'shout', 'death', 'knocked'];
export const FACE_JAW = { neutral: 0, blink: 0, pain: .32, shout: .72, death: .26, knocked: .12 };

export function createFaceRig(face, jaw, { skin, eye, hair } = {}) {
  const mats = new Map();                    // expressão → material clonado c/ map
  const baseMat = face.material;
  const matFor = (name) => {
    if (!mats.has(name)) {
      const m = baseMat.clone();
      m.map = faceTexture(skin, eye, hair, name);
      mats.set(name, m);
    }
    return mats.get(name);
  };
  const JAW0 = { y: jaw.position.y, z: jaw.position.z, sy: jaw.scale.y };
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
      const base = FACE_JAW[name] ?? 0;
      jaw.position.y = JAW0.y - base * .028 * weight;   // mandíbula desce
      jaw.scale.y = JAW0.sy + base * .38 * weight;      // boca abre (volume)
      jaw.position.z = JAW0.z + base * .012 * weight;   // projeta p/ frente
      return true;
    },
    reset() { rig.set('neutral', 0); jaw.position.y = JAW0.y; jaw.scale.y = JAW0.sy; jaw.position.z = JAW0.z; },
  };
  return rig;
}

// ---------- Fase 12 — morte direcional (ragdoll fake por torque) ----------
// Queda ANALÍTICA (sem física): impulso de torque no sentido OPOSTO ao tiro,
// oscilação amortecida sub-crítica (pêndulo) e assentamento em θmax. Puro
// (zero THREE) para testes determinísticos; rotação aplicada na RAIZ do LOD
// (válido nos 3 níveis). angle = direção DO atirador (0 = frente, +π/2 = lado
// +x, π = costas), power 0..1, seed = assimetria determinística do actor.
export const DEATH_FALL = { impulse: .09, settleT: 1.15, lambda: 2.6, omega: 6 };

export function deathFallMax(power = 1) {
  return 1.25 + .45 * Math.max(0, Math.min(1, power));
}

export function deathFall({ angle = 0, power = 1, age = 0, seed = 0 } = {}) {
  const a = Math.max(0, Number.isFinite(age) ? age : 0);
  const p = Math.max(0, Math.min(1, Number.isFinite(power) ? power : 1));
  const thMax = deathFallMax(p);
  let th;
  if (a < DEATH_FALL.impulse) {
    const k = a / DEATH_FALL.impulse;
    th = thMax * .5 * k * k;                                  // aceleração do torque
  } else if (a < DEATH_FALL.settleT) {
    const dt = a - DEATH_FALL.impulse;
    const drop = thMax * .5 * Math.exp(-DEATH_FALL.lambda * dt) * Math.cos(DEATH_FALL.omega * dt);
    th = thMax - drop;                                        // contínuo em .5·thMax
    if (th > thMax * 1.12) th = thMax * 1.12;                 // quique limitado no chão
    if (th < 0) th = 0;
    if (a > DEATH_FALL.settleT * .8) {                        // assentamento suave
      const k2 = (a - DEATH_FALL.settleT * .8) / (DEATH_FALL.settleT * .2);
      const s = k2 * k2 * (3 - 2 * k2);
      th += (thMax - th) * s;
    }
  } else {
    th = thMax;                                               // assentado
  }
  const flail = a < DEATH_FALL.settleT
    ? Math.min(1, a / DEATH_FALL.impulse) * (1 - Math.max(0, (a - DEATH_FALL.impulse) / (DEATH_FALL.settleT - DEATH_FALL.impulse)))
    : 0;
  const h = Math.sin(seed * 127.1 + 311.7) * 43758.5453;      // hash determinístico
  const asym = h - Math.floor(h);                             // 0..1
  const back = Math.cos(angle), side = Math.sin(angle);
  return {
    th,
    settled: a >= DEATH_FALL.settleT,
    flail,
    rotX: th * back,   // tiro da frente (angle 0) → cai de costas
    rotZ: th * side,   // tiro do lado +x (angle +π/2) → tomba p/ −x, longe do atirador
    joints: {
      armL: flail * (.85 + .4 * asym),
      armR: flail * (.85 + .4 * (1 - asym)),
      elbow: flail * .7,
      legL: flail * .5 * (.6 + .5 * asym),
      legR: flail * .5 * (1.1 - .5 * asym),
      head: flail * .45 * side,
    },
  };
}

export function createOperative({ skin = SKIN_TONES[0], vest = VEST_COLORS[0], secondary = null, trim = TRIM_ACCENT, eyes = null, hair = '#171717', helmet = true, variant = '' } = {}) {
  const g = new THREE.Group();
  const camo = camoMaterial(hashIdx(vest, 4), { repeat: 1.4 }); // camuflagem coerente com a cor do colete (compartilhada/memoizada)
  const sec = secondary ?? darken(vest, .6);
  const eye = eyes ?? EYE_TONES[hashIdx(skin + vest, EYE_TONES.length)];

  // ---- materiais (por instância p/ identidade de equipe; pele memoizada Fase 9) ----
  const skinM = skinMaterial(skin);
  const vestM = M(vest, { rough: .78, metal: .18 });
  // Fase 26 — micro-detalle de tecido no colete (anti-plástico): normalMap +
  // roughnessMap procedurais determinísticos pela cor do colete (memo-friendly).
  applyMicroDetail(vestM, { preset: 'fabric', seed: hashIdx(vest, 9999) + 11 });
  const vestDarkM = M(darken(vest, .55), { rough: .85 });
  const secM = M(sec, { rough: .88 });
  const gearM = M('#1b1d20', { rough: .86, metal: .1 });
  const gearM2 = M('#26282d', { rough: .8 });
  const bootM = M('#141517', { rough: .7 });
  const metalM = M('#4a4e55', { rough: .4, metal: .7 });
  const trimM = new THREE.MeshStandardMaterial({ color: trim, emissive: trim, emissiveIntensity: .55, roughness: .5 });
  const hairM = M(hair, { rough: .95 });

  // ---- sombra de contato (Fase 9): ancora o ator no chão; fade controlado
  // por animateOperative via `air` (infiltração aérea) ----
  const shadow = new THREE.Mesh(
    geo('shadowPlane', () => new THREE.PlaneGeometry(1.15, 1.15)),
    new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity: .8, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .02;
  shadow.renderOrder = 1;
  g.add(shadow);

  // ---- quadril fixo: pelve arredondada + glúteos + cinto tático + coldre ----
  const pelvis = ball(.2, secM, 0, .84, 0, 10, 8, 1.15, .6, .82);   // elipse = quadril humano
  const belt = box(.46, .07, .31, gearM, 0, .94, 0);
  const buckle = box(.08, .06, .04, metalM, 0, .94, -.155);
  const holster = box(.1, .18, .08, gearM, .19, .82, -.06);
  // Fase 16 (P1) — glúteos: quebra a reta pelve→coxa (silhueta humana de costas)
  const gluteL = ball(.09, secM, -.105, .82, .08, 8, 6, 1, .82, .9);
  const gluteR = ball(.09, secM, .105, .82, .08, 8, 6, 1, .82, .9);
  g.add(pelvis, belt, buckle, holster, gluteL, gluteR);

  // ---- TRONCO (grupo — bob de corrida move tudo acima) ----
  // V-taper: peitoral cônico mais largo que o abdômen, seção elíptica
  // (escala z) — silhueta atlética em vez de caixa.
  const torso = new THREE.Group();
  torso.position.set(0, 1.22, 0);
  const chest = cyl(.27, .225, .36, camo, 0, .1, 0, 12);
  chest.scale.z = .64;
  const abdomen = cyl(.225, .2, .18, camo, 0, -.15, 0, 12);
  abdomen.scale.z = .6;
  torso.add(chest, abdomen);
  // Fase 16 (P1) — cintura escapular: clavículas + trapézio amarram pescoço
  // e ombros (antes o tronco "nascia" direto nos deltoides — visual manequim)
  const clavL = ball(.065, camo, -.18, .24, 0, 8, 6, 1.15, .8, .9);
  const clavR = ball(.065, camo, .18, .24, 0, 8, 6, 1.15, .8, .9);
  const traps = ball(.085, camo, 0, .3, .025, 8, 6, 1.3, .75, .9);
  torso.add(clavL, clavR, traps);
  const vestMesh = box(.5, .42, .33, vestM, 0, .06, .01);           // plate carrier rígido sobre o peitoral
  torso.add(vestMesh);
  // pouches frontais de carregador (3) + porta-radio
  for (let i = -1; i <= 1; i++) torso.add(box(.12, .15, .07, vestDarkM, i * .16, -.04, -.185));
  torso.add(box(.09, .13, .05, gearM, -.19, .12, -.17)); // radio
  torso.add(cyl(.008, .008, .16, metalM, -.19, .22, -.16, 4)); // antena do radio
  // zipper + fivela central
  torso.add(box(.03, .4, .02, gearM2, 0, .06, -.17));
  // mochila tática: corpo + straps + bedroll + faixa de equipe (BASE — a
  // Fase 28 substitui por níveis Nv1-3 quando o ator equipa mochila)
  const pack = box(.38, .42, .17, gearM2, 0, .02, .22);
  pack.userData.basePack = true;
  torso.add(pack);
  const packLid = box(.3, .05, .19, vestDarkM, 0, .12, .23);
  packLid.userData.basePack = true;
  torso.add(packLid);
  const bedroll = cyl(.07, .07, .34, secM, 0, .27, .24, 8);
  bedroll.userData.basePack = true;
  torso.add(bedroll);
  const teamStripe = box(.34, .06, .02, trimM, 0, -.08, .305);
  teamStripe.userData.basePack = true;
  torso.add(teamStripe);
  // costelas laterais do colete
  torso.add(box(.03, .3, .28, vestDarkM, -.265, .06, 0));
  torso.add(box(.03, .3, .28, vestDarkM, .265, .06, 0));
  g.add(torso);

  // ---- CABEÇA (grupo — pitch de mira; Fase 9: crânio esférico + rosto curvo) ----
  const head = new THREE.Group();
  head.position.set(0, .46, 0); // mundo ~1.68
  const neck = cyl(.07, .08, .12, skinM, 0, -.14, 0, 8);
  // crânio: esfera escalada (mais alto que largo) + queixo/mandíbula
  const skull = ball(.125, skinM, 0, .01, 0, 14, 12, .95, 1.06, 1.0);
  const jaw = ball(.07, skinM, 0, -.075, -.015, 10, 8, 1.05, .8, 1.1);
  const earL = ball(.028, skinM, -.115, .005, .01, 8, 6, .5, 1, .8);
  const earR = ball(.028, skinM, .115, .005, .01, 8, 6, .5, 1, .8);
  const nose = ball(.024, skinM, 0, -.02, -.118, 8, 6, .7, .95, 1);
  head.add(neck, skull, jaw, earL, earR, nose);
  // rosto PINTADO em malha CURVA (calota esférica voltada p/ -z = frente):
  // acompanha o volume do crânio em vez de máscara plana
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(skin, eye, hair), roughness: .55 });
  const face = new THREE.Mesh(
    geo('facePatch', () => new THREE.SphereGeometry(.129, 14, 10, Math.PI * 1.5 - .9, 1.8, 1.05, .95)),
    faceMat
  );
  face.position.set(0, .012, 0);
  head.add(face);
  // Fase 12 — rig de blendshapes faciais (expressões + mandíbula articulada)
  const faceRig = createFaceRig(face, jaw, { skin, eye, hair });
  // franja/cabelo sob o capacete (nuca + laterais) — volume orgânico
  if (!helmet) {
    const hairBack = ball(.122, hairM, 0, .02, .035, 12, 10, .95, 1.0, 1.0);
    hairBack.scale.set(.95, 1.02, .95);
    head.add(hairBack);
  }
  // capacete tático OU boina (variedade) — gear rígido, boxes coerentes
  // (Fase 28: marcados baseHeadGear — o gear Nv2+ os substitui)
  if (helmet) {
    const dome = ball(.145, gearM, 0, .1, .01, 12, 10, 1.05, .85, 1.12); // casco arredondado
    const brim = box(.28, .04, .08, gearM, 0, .1, -.15);
    const band = box(.305, .06, .325, goggleMaterial(), 0, .08, .01); // óculos empilhados
    dome.userData.baseHeadGear = brim.userData.baseHeadGear = band.userData.baseHeadGear = true;
    head.add(dome, brim, band);
    const railL = box(.02, .07, .16, gearM2, -.15, .15, .01); // trilhos laterais
    const railR = box(.02, .07, .16, gearM2, .15, .15, .01);
    const nvg = box(.05, .05, .05, metalM, .09, .21, .08);   // mount NVG
    railL.userData.baseHeadGear = railR.userData.baseHeadGear = nvg.userData.baseHeadGear = true;
    head.add(railL, railR, nvg);
  } else {
    const cap = box(.28, .1, .28, vestM, 0, .16, .01);
    const brim = box(.24, .03, .12, vestM, 0, .12, -.16);
    cap.userData.baseHeadGear = brim.userData.baseHeadGear = true;
    head.add(cap, brim);
  }
  torso.add(head);

  // ---- pernas (Fase 9/16): coxa/canela em cápsula + joelho esférico + panturrilha
  // + PIVÔ DO TORNOZELO (o pé rola calcanhar→ponta na passada — fim do pé de manequim) ----
  const mkLeg = (side) => {
    const hip = new THREE.Group(); hip.position.set(side * .13, .84, 0);
    const upper = capsule(.082, .26, camo, 0, -.21, 0);
    const calf = ball(.055, camo, 0, -.12, .048, 8, 6, .95, 1.25, .95); // panturrilha
    const cargo = box(.05, .16, .12, secM, side * .1, -.2, 0);
    const knee = new THREE.Group(); knee.position.set(0, -.42, 0);
    const kneeCap = ball(.07, gearM, 0, -.01, -.005, 10, 8);       // joelheira orgânica
    const lower = capsule(.066, .24, camo, 0, -.19, 0);
    const pad = box(.15, .1, .17, gearM, 0, -.06, -.005);
    const foot = new THREE.Group(); foot.position.set(0, -.31, .01);
    const boot = box(.17, .12, .28, bootM, 0, -.12, .05);
    const toe = ball(.085, bootM, 0, -.13, -.07, 8, 6, 1, .7, 1.05); // bico arredondado
    const sole = box(.18, .04, .3, M('#2a2b2f', { rough: .9 }), 0, -.19, .05);
    foot.add(boot, toe, sole);
    knee.add(kneeCap, lower, pad, foot); hip.add(upper, calf, cargo, knee);
    g.add(hip);
    return { hip, knee, foot };
  };
  // ---- braços (Fase 9): deltoides no ombro + cápsulas + cotovelo esférico ----
  const mkArm = (side) => {
    const shoulder = new THREE.Group(); shoulder.position.set(side * .31, .24, 0); // local ao tronco (mundo 1.46)
    const deltoid = ball(.09, camo, 0, .01, 0, 10, 8, 1.1, .95, 1); // ombro curvo
    const biceps = ball(.05, camo, 0, -.09, -.015, 8, 6, .95, 1.2, .95); // Fase 16: volume do bíceps
    const upper = capsule(.062, .2, camo, 0, -.16, 0);
    const pad = box(.15, .09, .16, gearM, 0, -.25, 0);
    const stripe = box(.13, .05, .14, trimM, 0, -.05, 0);
    const elbow = new THREE.Group(); elbow.position.set(0, -.31, 0);
    const elbowCap = ball(.055, gearM, 0, -.01, .002, 8, 6);
    const lower = capsule(.054, .18, camo, 0, -.15, 0);
    const glove = box(.12, .12, .13, gearM, 0, -.31, 0);
    const knuckles = ball(.05, gearM2, 0, -.31, -.05, 8, 6, 1, .8, .9); // dorso da mão
    const cuff = box(.125, .06, .14, secM, 0, -.24, 0);
    elbow.add(elbowCap, lower, cuff, glove, knuckles); shoulder.add(deltoid, biceps, upper, pad, stripe, elbow);
    return { shoulder, elbow };
  };
  const legL = mkLeg(-1), legR = mkLeg(1);
  const armR = mkArm(1), armL = mkArm(-1);
  torso.add(armR.shoulder, armL.shoulder);

  // Fase 7 — acessórios únicos por operativo (determinísticos via variant)
  const acc = buildAccessories(head, torso, g, { variant, vest, sec, skin, trim, vestM, secM, gearM, gearM2, metalM, trimM });

  const parts = { head, torso, legL, legR, armL, armR, shadow, face: faceRig, straps: acc?.straps ?? null };
  parts.userData = { vestColor: vest }; // Fase 28 — tinge o gear com a cor da equipe
  return { group: g, parts };
}

// pose de caminhada/tiro — t é o tempo, speedNorm 0..1, pitch para braços,
// crouch (Fase 5) dobra pernas e abaixa o tronco; Fase 6: respiração idle,
// sway de tronco e cabeça acompanhando o passo. Fase 7: pose de rastejo DBNO.
// Fase 9: movimento secundário — transferência de peso no idle, micro-olhar,
// roll de passada, contra-rotação de cabeça e fade da sombra de contato por
// `air` (altitude na infiltração). Frequências dessintonizadas evitam loop
// mecânico; tudo determinístico (sem Math.random).
// Fase 10: `hit` = reação de impacto direcional { angle, power, age } — flinch
// ADITIVO sobre a pose base (não a substitui): ângulo em espaço do personagem
// (0 = frente, +π/2 = lado +x, π = costas), power 0..1 e age em segundos.
// Fase 12: `death` = { angle, power, age, seed } — agonia direcional aditiva
// (membros abrem pelo envelope do fall); rosto reage via rig de blendshapes
// (dor no impacto, morte, careta no DBNO, piscar automático dessincronizado).
export function animateOperative(parts, { t = 0, speedNorm = 0, pitch = 0, dead = false, ads = false, crouch = false, knocked = false, air = 0, hit = null, death = null } = {}) {
  let hitEnv = 0;                                            // acopla rosto à dor
  // Fase 26 — Talon: física de mola SIMPLES das tiras da jaqueta (determinística:
  // fase semeada no userData; amplitude cresce com velocidade e no ar).
  if (parts.straps) {
    const amp = .18 + speedNorm * .55 + Math.min(.4, air * .06);
    for (const s of parts.straps) {
      const ph = s.userData.talonPhase || 0;
      s.rotation.x = Math.sin(t * 6.3 + ph) * amp * .5;
      s.rotation.z = Math.sin(t * 4.1 + ph * 1.7) * amp;
    }
  }
  // sombra de contato: some com altitude (paraquedas) e no corpo morto
  if (parts.shadow) {
    const fade = dead ? 0 : Math.max(0, .8 - air * .1);
    parts.shadow.material.opacity = fade;
    const sc = 1 + Math.min(1.4, air * .05) * (dead ? 0 : 1);
    parts.shadow.scale.set(sc, sc, 1);
  }
  if (dead) {
    parts.torso.scale.set(1, 1, 1);
    parts.legL.hip.rotation.x *= .9; parts.legR.hip.rotation.x *= .9;
    parts.armL.shoulder.rotation.z = Math.min(.9, (parts.armL.shoulder.rotation.z || 0) + .02);
    parts.armR.shoulder.rotation.z = Math.max(-.9, (parts.armR.shoulder.rotation.z || 0) - .02);
    if (parts.face) parts.face.set('death', 1);
    // Fase 12 — agonia: membros abrem pelo envelope do fall (assimétrico)
    if (death && death.power > 0) {
      const j = deathFall(death).joints;
      parts.armL.shoulder.rotation.z = Math.min(1.5, parts.armL.shoulder.rotation.z + j.armL);
      parts.armR.shoulder.rotation.z = Math.max(-1.5, parts.armR.shoulder.rotation.z - j.armR);
      parts.armL.elbow.rotation.x -= j.elbow * .8;
      parts.armR.elbow.rotation.x -= j.elbow * .8;
      parts.legL.hip.rotation.x = Math.min(1.2, parts.legL.hip.rotation.x + j.legL);
      parts.legR.hip.rotation.x = Math.max(-1.2, parts.legR.hip.rotation.x - j.legR);
      parts.head.rotation.y += j.head;
    }
    return;
  }
  if (knocked) {
    // rastejar: tronco deitado, cotoveladas alternadas arrastando o corpo
    const crawl = Math.sin(t * 5.2) * .5;
    parts.torso.scale.set(1, 1, 1);
    parts.torso.rotation.x = 1.22;
    parts.torso.rotation.y = Math.sin(t * 2.6) * .09;
    parts.torso.rotation.z = Math.sin(t * 5.2) * .05;      // Fase 9: esforço do arrasto
    parts.torso.position.y = .5;
    parts.torso.position.x = 0;
    parts.legL.hip.rotation.x = .85 + crawl * .18;
    parts.legR.hip.rotation.x = .85 - crawl * .18;
    parts.legL.knee.rotation.x = -.55;
    parts.legR.knee.rotation.x = -.5;
    // Fase 16: pés arrastam com a ponta flexionada (não congela no último passo)
    if (parts.legL.foot) { parts.legL.foot.rotation.x = .3 + crawl * .12; parts.legR.foot.rotation.x = .3 - crawl * .12; }
    parts.armR.shoulder.rotation.x = -1.15 - crawl * .3;
    parts.armL.shoulder.rotation.x = -1.15 + crawl * .3;
    parts.armR.elbow.rotation.x = -.35;
    parts.armL.elbow.rotation.x = -.35;
    parts.head.rotation.x = -.6;
    parts.head.rotation.y = Math.sin(t * 1.3) * .18;       // observa ao rastejar
    parts.head.rotation.z = 0;
    if (parts.face) parts.face.set('knocked', 1);          // careta + dentes cerrados
    return;
  }
  const idle = 1 - Math.min(1, speedNorm);
  const breathe = Math.sin(t * 2.1);                       // respiração
  // ---- Fase 16 (P1) — passada HUMANA: cadência escala com a velocidade
  // (andar cadenciado, sprint rápido), joelho flexiona NA fase de balanço,
  // pelve gira contra o tronco, tornozelos rolam calcanhar→ponta e o corpo
  // inclina PARA DENTRO do sprint. Frequência base preservada em repouso. ----
  const W = 8.6 + 2.2 * speedNorm;                          // rad/s da passada
  const swing = Math.sin(t * W) * .62 * speedNorm + Math.sin(t * W + 1.9) * .05 * speedNorm;
  const swing2 = Math.cos(t * W) * .5 * speedNorm;
  if (crouch) {
    parts.legL.hip.rotation.x = 1.15 + swing * .15;
    parts.legR.hip.rotation.x = 1.15 - swing * .15;
    parts.legL.knee.rotation.x = -1.45;
    parts.legR.knee.rotation.x = -1.45;
    // agachamento apoia nos antepés (calcanhares levemente erguidos)
    if (parts.legL.foot) { parts.legL.foot.rotation.x = .2; parts.legR.foot.rotation.x = .2; }
  } else {
    parts.legL.hip.rotation.x = swing;
    parts.legR.hip.rotation.x = -swing;
    // Fase 16: flexão do joelho mais profunda no sprint (fase de balanço)
    const kneeAmp = .72 + .2 * speedNorm;
    parts.legL.knee.rotation.x = Math.max(0, swing2) * kneeAmp;
    parts.legR.knee.rotation.x = Math.max(0, -swing2) * kneeAmp;
    // Fase 9: leve rotação lateral do quadril na passada (transferência de peso)
    parts.legL.hip.rotation.z = Math.sin(t * W) * .035 * speedNorm;
    parts.legR.hip.rotation.z = Math.sin(t * W) * .035 * speedNorm;
    // Fase 16: pelve gira CONTRA o tronco (anatomia real: torção transversal —
    // quando o tórax roda +sway, a pelve roda em contrafase)
    parts.legL.hip.rotation.y = -Math.sin(t * W) * .05 * speedNorm;
    parts.legR.hip.rotation.y = -Math.sin(t * W) * .05 * speedNorm;
    // Fase 16: rolagem do tornozelo — +x = ponta pra cima (calcanhar toca
    // primeiro quando a perna alcança à frente), -x = impulso da ponta atrás
    if (parts.legL.foot) {
      const sL = Math.sin(t * W), sR = -sL;
      parts.legL.foot.rotation.x = (Math.max(0, sL) * .25 - Math.max(0, -sL) * .45) * speedNorm;
      parts.legR.foot.rotation.x = (Math.max(0, sR) * .25 - Math.max(0, -sR) * .45) * speedNorm;
      parts.legL.foot.rotation.z = Math.sin(t * .7) * .03 * idle;   // peso no idle
      parts.legR.foot.rotation.z = -Math.sin(t * .7) * .03 * idle;
    }
  }
  const aim = -Math.PI / 2 + pitch;
  // braços seguram a arma — swing macro proibido; micro-oscilação do passo
  const armStep = Math.cos(t * W) * .045 * speedNorm;
  parts.armR.shoulder.rotation.x = aim + .18 - armStep + breathe * .022;
  parts.armL.shoulder.rotation.x = aim + .34 + armStep + breathe * .022;
  parts.armR.elbow.rotation.x = (ads ? -.28 : -.5) + armStep * .6;
  parts.armL.elbow.rotation.x = (ads ? -.62 : -.85) + armStep * .6;
  // ---- tronco: sway + roll de passada + inclinação de corrida + respiração ----
  const sway = Math.sin(t * W) * .07 * speedNorm;
  parts.torso.rotation.y = sway;
  // Fase 16: inclinação PARA DENTRO do sprint (aceleração sobre o quadril)
  parts.torso.rotation.x = speedNorm * .1 + speedNorm * speedNorm * .09 + breathe * .014 * idle;
  parts.torso.rotation.z = Math.sin(t * W + .4) * .05 * speedNorm   // roll de passada
    + Math.sin(t * .7) * .028 * idle;                                // transferência de peso parado
  parts.torso.position.x = Math.sin(t * .7) * .02 * idle;            // quadril desloca no idle
  // Fase 16: dupla pancada por ciclo (um bounce POR apoie) — amp cresce com a velocidade
  parts.torso.position.y = crouch ? .88 : 1.22 + Math.abs(Math.sin(t * W)) * (.045 + .02 * speedNorm) * speedNorm;
  const br = 1 + breathe * .008 * idle;                              // peito expande no idle
  parts.torso.scale.set(br, 1, 1 + breathe * .012 * idle);
  // ---- cabeça: estabiliza (contra-rotação) + micro-olhar no idle ----
  parts.head.rotation.x = pitch * .4 - Math.abs(swing) * .05;
  parts.head.rotation.y = -sway * .55 + Math.sin(t * .53) * .12 * idle + Math.sin(t * .13) * .07 * idle;
  parts.head.rotation.z = -parts.torso.rotation.z * .5;
  // ---- Fase 10 — reação de impacto: flinch direcional aditivo ----
  // Envelope: ataque rápido (~2 frames) + decaimento exponencial τ .17 s —
  // o corpo dobra PARA LONGE da bala, afunda e os braços abrem em sobressalto,
  // sem abandonar o regime de arma (magnitudes pequenas nos ombros).
  if (hit && hit.power > 0) {
    const ATTACK = .06, TAU = .17;
    const age = Math.max(0, hit.age ?? 0);
    const env = (age < ATTACK ? age / ATTACK : Math.exp(-(age - ATTACK) / TAU)) * Math.min(1, hit.power);
    hitEnv = env;
    if (env > .001) {
      const side = Math.sin(hit.angle ?? 0);   // + = impacto no lado +x do modelo
      const front = Math.cos(hit.angle ?? 0);  // + = impacto na frente (-z)
      parts.torso.rotation.x += front * env * .38;   // dobra para longe da bala
      parts.torso.rotation.y += side * env * .42;    // torção de esquiva
      parts.torso.position.x -= side * env * .06;    // empurrão na direção do tiro
      parts.torso.position.y -= env * .05;           // afundamento do impacto
      parts.head.rotation.y += side * env * .55;     // solavanco da cabeça
      parts.head.rotation.x += front * env * .3;
      parts.armR.shoulder.rotation.z -= side * env * .12; // sobressalto dos braços
      parts.armL.shoulder.rotation.z += side * env * .12;
      parts.armR.elbow.rotation.x += front * env * .18;   // antebraços recuam
      parts.armL.elbow.rotation.x += front * env * .18;
    }
  }
  // ---- Fase 12 — blendshapes faciais: dor do impacto > piscar automático ----
  const face = parts.face;
  if (face) {
    if (hitEnv > .12) face.set('pain', Math.min(1, hitEnv * 1.25));
    else {
      const bp = t % 3.6;                       // ciclo dessincronizado (t já tem offset por ator)
      if (bp < .11) face.set('blink', 1); else face.set('neutral', 0);
    }
  }
}

// ---------- arsenal (Fase 6/7 — silhuetas ricas + skins por raridade) ----------
// skin (Fase 7): raridade do loot ('COMUM'..'LENDARIO') pinta o furniture com a
// cor da raridade, adiciona brilho emissivo e uma gema no receiver — cada nível
// é reconhecível à distância, como no FreeFire.
export function createWeaponModel(id, skin = null) {
  const g = new THREE.Group();
  const gun = M('#23262b', { rough: .38, metal: .8 });
  const gun2 = M('#15171a', { rough: .48, metal: .72 });
  const accent = new THREE.MeshStandardMaterial({ color: '#c8ff3d', emissive: '#c8ff3d', emissiveIntensity: .9, roughness: .4 });
  const rar = skin ? RARITIES[skin] : null;
  const skinColor = rar?.color ?? null;
  // furniture: pintura tática — tinge com a cor da raridade quando skin presente
  const furniture = skinColor
    ? new THREE.MeshStandardMaterial({ color: skinColor, roughness: .5, metalness: .25, emissive: skinColor, emissiveIntensity: .16 })
    : camoMaterial(2, { repeat: 1 });
  const skinGlow = skinColor
    ? new THREE.MeshStandardMaterial({ color: skinColor, emissive: skinColor, emissiveIntensity: .95, roughness: .35 })
    : null;
  const add = (w, h, d, mat, x, y, z) => { const m = box(w, h, d, mat, x, y, z); g.add(m); return m; };
  const sights = (zFront, zRear, y = .09) => { // massa de mira padrão
    add(.012, .05, .02, gun2, 0, y, zFront);
    add(.05, .04, .02, gun2, 0, y, zRear);
  };
  const mag = (x, y, z, tilt = .12) => { const m = add(.055, .2, .09, gun2, x, y, z); m.rotation.x = tilt; return m; };
  const muzzle = new THREE.Object3D();
  let muzzleZ = -.55;

  switch (id) {
    case 'g19': // pistola
      add(.07, .12, .3, gun, 0, 0, -.1);
      add(.06, .16, .09, gun2, 0, -.1, .04);
      add(.02, .03, .2, gun2, .04, .062, -.12); // serrilhas do slide
      add(.02, .03, .2, gun2, -.04, .062, -.12);
      add(.05, .05, .05, gun2, 0, -.16, .04);   // base do carregador
      sights(-.24, .03, .075);
      muzzleZ = -.28;
      break;
    case 'mp5': // submetrahadora
      add(.08, .11, .5, gun, 0, 0, -.12);
      add(.05, .2, .07, gun2, 0, -.13, -.02);
      add(.06, .09, .2, gun2, 0, -.02, .28);
      add(.04, .12, .04, gun2, 0, .0, .34);     // coronha de arame
      add(.05, .1, .1, furniture, 0, -.06, -.26); // foregrip
      mag(0, -.12, -.02, .05);
      sights(-.34, .06);
      muzzleZ = -.4;
      break;
    case 'm4': // fuzil
      add(.075, .1, .72, gun, 0, 0, -.18);
      add(.05, .16, .08, gun2, 0, -.12, .06);
      add(.055, .07, .3, gun2, 0, .085, -.2);   // carry handle
      add(.07, .12, .16, gun2, 0, -.01, .3);
      add(.06, .1, .22, furniture, 0, -.005, -.3); // handguard
      for (let i = 0; i < 3; i++) add(.065, .115, .015, gun2, 0, -.005, -.24 + i * .07); // slots do trilho
      mag(0, -.13, .06, .16);                   // carregador curvo
      add(.06, .08, .2, furniture, 0, -.02, .42); // coronha
      sights(-.5, .0);
      muzzleZ = -.56;
      break;
    case 'ar47': { // Fase 28 — AR-47 (7.62) com 4 SOCKETS reais p/ anexos
      const woodM = M('#6e4a2a', { rough: .62, metal: .08 }); // madeira envelhecida
      const woodDarkM = M('#54371e', { rough: .66, metal: .06 });
      // receiver + tampa do gas system (silhueta AK imediata)
      add(.075, .11, .5, gun, 0, 0, -.05);
      add(.035, .05, .34, gun2, 0, .075, -.16);       // gas tube sobre o cano
      add(.06, .09, .26, woodM, 0, -.005, -.38);      // handguard de madeira
      add(.05, .1, .08, woodDarkM, 0, -.02, -.5);     // escavilho frontal
      // coronha oca de madeira (esqueleto AK)
      add(.05, .09, .1, woodM, 0, -.01, .24);
      add(.05, .16, .06, woodM, 0, -.04, .36);
      add(.045, .04, .16, woodM, 0, -.08, .3);
      // pistol grip inclinado
      const grip = add(.05, .12, .07, woodDarkM, 0, -.11, .12); grip.rotation.x = .38;
      // mira de ferro em torre (frontal alta — silhueta AK-47)
      add(.012, .07, .02, gun2, 0, .1, -.52);
      add(.045, .05, .03, gun2, 0, .095, .14);
      const barrel = add(.03, .03, .16, gun2, 0, .015, -.6); // cano exposto
      barrel.name = 'barrel';
      muzzleZ = -.68;
      // ---- 4 SOCKETS (Fase 28): âncoras reais p/ anexos; nomes estáveis ----
      const sockets = {
        muzzle: { pos: [0, .015, -.74] },             // boca: corta-chamas/silenciador
        optic: { pos: [0, .11, -.05] },               // trilho lateral: red dot/4x
        mag: { pos: [0, -.1, -.02] },                 // poço do carregador
        grip: { pos: [0, -.075, -.3] },               // under-barrel: foregrip/lanterna
      };
      g.userData.sockets = {};
      for (const [name, { pos }] of Object.entries(sockets)) {
        const s = new THREE.Group();
        s.name = `socket_${name}`;
        s.position.set(...pos);
        g.add(s);
        g.userData.sockets[name] = s;
      }
      break;
    }
    case 'barrett': // sniper .338
      add(.09, .12, 1.05, gun, 0, 0, -.28);
      add(.06, .18, .09, gun2, 0, -.13, .12);
      add(.07, .09, .34, gun2, 0, .1, -.3);     // luneta
      add(.09, .14, .3, furniture, 0, -.02, .38);
      const lens = add(.055, .055, .02, new THREE.MeshStandardMaterial({ color: '#0a1a2a', emissive: '#3b82f6', emissiveIntensity: .8, roughness: .2 }), 0, .1, -.475);
      lens.name = 'scopeLens';
      add(.1, .04, .1, gun2, 0, .002, -.82);    // muzzle brake
      add(.02, .16, .02, gun2, -.06, -.1, -.5);  // bipé
      add(.02, .16, .02, gun2, .06, -.1, -.5);
      sights(-.44, .12, .135);
      muzzleZ = -.88;
      break;
    case 'pulse': { // rifle de energia
      add(.1, .12, .8, gun2, 0, 0, -.2);
      add(.06, .15, .1, gun2, 0, -.12, .08);
      const cell = add(.05, .05, .5, accent, 0, .09, -.22);
      cell.material = accent;
      add(.02, .06, .3, accent, .052, .0, -.3);  // vents laterais
      add(.02, .06, .3, accent, -.052, .0, -.3);
      add(.08, .08, .1, gun, 0, .09, -.5);       // bloco de foco
      sights(-.56, .1, .11);
      muzzleZ = -.62;
      break;
    }
    case 'sucata': // lança de sucata
      add(.06, .06, .8, furniture, 0, 0, -.25);
      add(.14, .18, .05, gun2, 0, .02, -.62);
      add(.05, .09, .12, M('#6e5433', { rough: .9 }), 0, -.06, -.1); // fita/punho
      add(.03, .03, .2, gun2, .05, .06, -.3);    // pregos
      add(.03, .03, .2, gun2, -.05, .06, -.34);
      muzzleZ = -.66;
      break;
    default:
      add(.07, .11, .4, gun, 0, 0, -.12);
      sights(-.28, .05);
  }
  muzzle.position.set(0, .02, muzzleZ);
  g.add(muzzle);
  // Fase 7 — gema de raridade no receiver (identificação rápida do skin)
  if (skinGlow) {
    const gem = add(.03, .024, .06, skinGlow, .045, .055, -.08);
    gem.name = 'rarityGem';
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return { group: g, muzzle };
}

// orienta braços/arma no corpo — retorna o anchor da arma (na mão direita)
export function attachWeapon(opParts, operativeGroup, weaponId, skin = null) {
  const old = operativeGroup.userData.weaponRig;
  if (old) { operativeGroup.remove(old.group); old.group.traverse(o => { o.geometry?.dispose?.(); }); }
  const model = createWeaponModel(weaponId, skin);
  model.group.position.set(.3, 1.4, -.25);
  operativeGroup.add(model.group);
  operativeGroup.userData.weaponRig = model;
  return model;
}

// Rig enxuto de primeira pessoa (Fase 6): mãos ENLUVADAS agarrando a arma,
// mangas camufladas, peitoral do colete à vista. Materiais por instância —
// o recolor do seletor de operativo não vaza para os demais personagens.
// Fase 10: DEDOS INDIVIDUAIS articulados — 4 dedos + polegar por mão, cada um
// com 2 falanges em cadeia (nó proximal + nó distal) que enrolam em volta do
// punho da arma; índice da mão direita fica semi-estendido no gatilho e
// flexiona ao atirar (poseFirstPersonHands). Meshes de pele/luva NÃO são
// tintáveis — o recolor do seletor pinta apenas manga/colete (userData.tintable).
const _fgeo = new Map();
function fgeo(r, l) {
  const key = `f${r}:${l}`;
  if (!_fgeo.has(key)) _fgeo.set(key, new THREE.CapsuleGeometry(r, l, 2, 6));
  return _fgeo.get(key);
}

// constrói uma mão articulada; side = +1 (direita) | -1 (esquerda).
// Retorna { group, fingers: [{ base, tip, jitter }], thumb: { base, tip } }.
function buildArticulatedHand({ side, skinM, gloveM }) {
  const hand = new THREE.Group();
  hand.position.set(0, -.545, -.02); // onde ficava o bloco "dedos à mostra"
  // dorso da mão (luva) — dedos à mostra em pele, coerente com a Fase 6
  const palm = box(.11, .05, .13, gloveM, 0, -.005, .01);
  const knuckles = ball(.045, gloveM, 0, 0, -.05, 8, 6, 1.1, .55, .8);
  hand.add(palm, knuckles);
  // 4 dedos: cadeia proximal→distal apontando -y, enrolando em direção a -z
  // (palma virada para a arma, que está mais à frente no rig)
  const fingers = [];
  const spacing = [.0245, .008, -.0085, -.025]; // x-offsets (indicador→mínimo)
  for (let i = 0; i < 4; i++) {
    const base = new THREE.Group();
    base.position.set(spacing[i] * (side > 0 ? 1 : -1) * -1, -.02, -.012);
    base.rotation.z = spacing[i] * .9; // leque sutil
    const proximal = new THREE.Mesh(fgeo(.0105, .028), skinM);
    proximal.position.y = -.0245;
    proximal.castShadow = true;
    const tip = new THREE.Group();
    tip.position.y = -.049;
    const distal = new THREE.Mesh(fgeo(.0095, .022), skinM);
    distal.position.y = -.0205;
    distal.castShadow = true;
    tip.add(distal);
    base.add(proximal, tip);
    hand.add(base);
    fingers.push({ base, tip, jitter: Math.sin(i * 2.3 + side) * .035 }); // assimetria orgânica determinística
  }
  // polegar: oposto aos dedos, do lado interno (em direção ao centro da arma)
  const thumbBase = new THREE.Group();
  thumbBase.position.set(side * .055, -.012, .008);
  thumbBase.rotation.z = side * -1.15;
  thumbBase.rotation.x = -.5;
  const tProx = new THREE.Mesh(fgeo(.012, .024), skinM);
  tProx.position.y = -.022;
  tProx.castShadow = true;
  const thumbTip = new THREE.Group();
  thumbTip.position.y = -.044;
  const tDist = new THREE.Mesh(fgeo(.011, .018), skinM);
  tDist.position.y = -.019;
  tDist.castShadow = true;
  thumbTip.add(tDist);
  thumbBase.add(tProx, thumbTip);
  hand.add(thumbBase);
  return { group: hand, fingers, thumb: { base: thumbBase, tip: thumbTip } };
}

// pose de grip das mãos em primeira pessoa — chamada por frame no loop FPS.
// curl 0..1.6 enrola os dedos no punho; trigger 0..1 flexiona o INDICADOR
// direito (gatilho); breathe adiciona micro-vida no idle. Determinístico.
export function poseFirstPersonHands(rig, { curl = .8, trigger = 0, breathe = 0 } = {}) {
  const hands = rig?.userData?.hands;
  if (!hands) return;
  const pose = (hand, base, isTriggerHand) => {
    for (let i = 0; i < hand.fingers.length; i++) {
      const f = hand.fingers[i];
      let c = base + f.jitter + breathe;
      if (isTriggerHand && i === 0) c = base - .45 + trigger * .7 + f.jitter; // índice: repouso estendido → aperta no tiro
      c = Math.max(.04, Math.min(1.6, c));
      f.base.rotation.x = c * 1.05;
      f.tip.rotation.x = c * 1.3;
    }
    hand.thumb.base.rotation.x = -.5 + base * .45 + breathe;
    hand.thumb.tip.rotation.x = base * .5;
  };
  pose(hands.armL, Math.min(1.6, curl * .92 + breathe * .5), false); // suporte: grip firme
  pose(hands.armR, curl, true);                                       // gatilho
}

export function createFirstPersonRig({ skin = SKIN_TONES[0], vest = VEST_COLORS[0], secondary = null } = {}) {
  const rig = new THREE.Group();
  const skinM = M(skin, { rough: .62 });
  const camoM = new THREE.MeshStandardMaterial({ color: '#3d4a2a', roughness: .92 }); // instância própria
  const vestM = M(vest, { rough: .78, metal: .18 });
  const gloveM = M('#1b1d20', { rough: .85 });
  const secM = M(secondary ?? '#2c2f33', { rough: .88 });
  const makeArm = (side) => {
    const arm = new THREE.Group();
    arm.position.set(side * .2, -.26, -.4);
    arm.rotation.set(-.4, side * .14, side * .2);
    const sleeve = box(.16, .42, .16, camoM, 0, -.18, 0);    // manga
    const cuff = box(.17, .07, .17, secM, 0, -.34, 0);       // punho
    const glove = box(.14, .16, .15, gloveM, 0, -.46, -.01); // luva
    sleeve.userData.tintable = true;
    arm.add(sleeve, cuff, glove);
    const hand = buildArticulatedHand({ side, skinM, gloveM });
    arm.add(hand.group);
    rig.add(arm);
    arm.userData.hand = hand;
    return arm;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  const chest = box(.42, .25, .18, vestM, 0, -.54, -.22);
  chest.rotation.x = -.24;
  chest.userData.tintable = true;
  const chestPouch = box(.14, .1, .05, M('#26282d', { rough: .8 }), 0, -.5, -.31);
  rig.add(chest, chestPouch);
  rig.userData.arms = { armL, armR };
  rig.userData.hands = { armL: armL.userData.hand, armR: armR.userData.hand };
  return rig;
}

// ---------- loot no chão (Fase 6: pad hexagonal de raridade) ----------
export function createLootMesh(item) {
  const g = new THREE.Group();
  // ---- Fase 28 — tipos com FÁBRICA DEDICADA (assinatura Free Fire) ----
  if (item.kind === 'deathBox') {
    const db = createDeathBox({ seed: item.seed ?? 1, accent: item.accent ?? '#ffb52e', name: item.victimName ?? '' });
    db.position.y = 0;                 // fábrica já assenta no chão
    return db;
  }
  if (item.kind === 'supplyDrop') {
    const sd = createSupplyDrop({ seed: item.seed ?? 1 });
    sd.position.y = 0;
    return sd;
  }
  if (item.kind === 'helmet' || item.kind === 'vest' || item.kind === 'pack') {
    const gearColors = { vest: '#42d9de', helmet: '#a875ff', pack: '#7dd87d' };
    const color = gearColors[item.kind] ?? '#b7c2c7';
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(.42, .48, .05, 6),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .5, roughness: .5, transparent: true, opacity: .55 })
    );
    pad.position.y = .025;
    g.add(pad);
    const lv = Math.max(1, Math.min(4, item.level || 1));
    const gearMesh = buildGearMesh(item.kind, lv);
    gearMesh.position.y = .05;
    gearMesh.scale.setScalar(1.15);
    g.add(gearMesh);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(.03, .05, 2.0, 6, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .35, depthWrite: false })
    );
    beam.position.y = 1.0;
    g.add(beam);
    return g;
  }
  const rarityColors = { COMUM: '#b7c2c7', INCOMUM: '#42d9de', RARO: '#a875ff', LENDARIO: '#ffb52e' };
  const color = rarityColors[item.rarity] ?? (item.kind === 'consumable' ? '#ff6b2c' : item.kind === 'armor' ? '#42d9de' : '#b7c2c7');
  // pad hexagonal emissivo sob o item
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(.42, .48, .05, 6),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .5, roughness: .5, transparent: true, opacity: .55 })
  );
  pad.position.y = .025;
  pad.receiveShadow = true;
  g.add(pad);
  if (item.kind === 'frag' || item.kind === 'gloo') {
    const frag = item.kind === 'frag';
    const mesh = frag
      ? new THREE.Mesh(new THREE.SphereGeometry(.18, 10, 8), M('#3a4436', { rough: .5, metal: .6, extra: { emissive: '#ff6b2c', emissiveIntensity: .25 } }))
      : box(.5, .36, .1, M('#9fb8c6', { rough: .4, metal: .2, extra: { emissive: '#42d9de', emissiveIntensity: .3 } }));
    mesh.position.y = frag ? .2 : .3;
    mesh.castShadow = true;
    g.add(mesh);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(.03, .05, 1.8, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: frag ? '#ff6b2c' : '#42d9de', transparent: true, opacity: .35, depthWrite: false })
    );
    beam.position.y = .9;
    g.add(beam);
    return g;
  }
  const isWeapon = item.kind === 'weapon';
  const size = isWeapon ? .5 : .34;
  // Fase 26 — caixa de morte (death loot box): cubo chanfrado com fecho
  // EMISSIVO superior (verde/azul por raridade — leitura de loot raro a distância).
  const box_ = box(size, size, size, M(color, { rough: .5, metal: .5, extra: { emissive: color, emissiveIntensity: .22 } }));
  box_.position.y = size / 2 + .05;
  box_.rotation.y = Math.PI / 4;
  g.add(box_);
  const clasp = box(size * .34, .05, .08, new THREE.MeshStandardMaterial({
    color: '#dfe8ec', emissive: color, emissiveIntensity: 1.1, roughness: .3, metalness: .4
  }), 0, size + .09, 0);
  g.add(clasp);
  g.userData.clasp = clasp.material;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(.03, .05, 2.2, 6, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .35, depthWrite: false })
  );
  beam.position.y = 1.1;
  g.add(beam);
  return g;
}

// ---------- terminal ZEX ----------
export function createTerminalMesh() {
  const g = new THREE.Group();
  const base = box(1.1, .5, 1.1, M('#2a2d33', { metal: .6, rough: .5 }), 0, .25, 0);
  const pillar = box(.5, 1.5, .5, M('#1d2024', { metal: .7, rough: .4 }), 0, 1.2, 0);
  const screen = box(.56, .7, .08, new THREE.MeshStandardMaterial({
    color: '#0a1a12', emissive: '#39ff88', emissiveIntensity: 1.2, roughness: .3
  }), 0, 1.55, .22);
  screen.rotation.x = -.25;
  g.add(base, pillar, screen);
  g.userData.screen = screen;
  return g;
}

// ---------- Fase 4 — paraquedas ----------
export function createParachute(color = '#c8622e') {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1.9, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color, roughness: .85, side: THREE.DoubleSide })
  );
  canopy.position.y = 2.55;
  canopy.castShadow = true;
  const stripe = new THREE.Mesh(
    new THREE.TorusGeometry(1.88, .08, 8, 32),
    new THREE.MeshStandardMaterial({ color: '#c8ff3d', emissive: '#c8ff3d', emissiveIntensity: .5, roughness: .5 })
  );
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = 2.55;
  g.add(canopy, stripe);
  const cordM = new THREE.LineBasicMaterial({ color: '#1c1e22', transparent: true, opacity: .8 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(a) * 1.7, 2.6, Math.sin(a) * 1.7),
      new THREE.Vector3(Math.cos(a) * .2, 1.85, Math.sin(a) * .2),
    ]);
    g.add(new THREE.Line(geo, cordM));
  }
  return g;
}

// ---------- Fase 4 — granada FRAG ----------
export function createFragMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(.11, 10, 8),
    M('#3a4436', { rough: .55, metal: .55 })
  );
  body.castShadow = true;
  const lever = box(.03, .12, .03, M('#8a8f96', { metal: .8, rough: .35 }), 0, .09, .05);
  const pinLight = new THREE.Mesh(
    new THREE.SphereGeometry(.05, 6, 6),
    new THREE.MeshBasicMaterial({ color: '#ff3d52' })
  );
  g.add(body, lever, pinLight);
  g.userData.led = pinLight;
  return g;
}

// ---------- Fase 4 — Gloo Wall ----------
export function createGlooMesh() {
  const g = new THREE.Group();
  const panel = new THREE.MeshStandardMaterial({ color: '#9fb8c6', roughness: .4, metalness: .15, emissive: '#2a4a58', emissiveIntensity: .35 });
  const wall = box(GLOO_W, GLOO_H, GLOO_D, panel, 0, GLOO_H / 2, 0);
  // Fase 26 — rim "Fresnel" barato: casca BackSide aditiva levemente maior —
  // reforça o VOLUME translúcido do gelo nas bordas sem custo de shader custom.
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(GLOO_W * 1.06, GLOO_H * 1.02, GLOO_D * 1.06),
    new THREE.MeshBasicMaterial({ color: '#bfe6f2', transparent: true, opacity: .16, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false })
  );
  shell.position.y = GLOO_H / 2;
  g.add(shell);
  const seam = M('#5f7684', { metal: .4, rough: .5 });
  for (let i = 1; i <= 3; i++) {
    g.add(box(.06, GLOO_H * .96, GLOO_D * 1.12, seam, -GLOO_W / 2 + (i * GLOO_W) / 4, GLOO_H / 2, 0));
  }
  const edge = new THREE.MeshStandardMaterial({ color: '#c8ff3d', emissive: '#c8ff3d', emissiveIntensity: .8, roughness: .4 });
  g.add(box(GLOO_W * 1.01, .07, GLOO_D * 1.3, edge, 0, GLOO_H + .04, 0));
  g.add(wall);
  g.userData.updateHp = (frac) => {
    panel.emissiveIntensity = .12 + frac * .3;
    edge.emissiveIntensity = frac > .35 ? .8 : (frac > .15 ? .45 : .15);
  };
  return g;
}
const GLOO_W = 4, GLOO_H = 3, GLOO_D = .4;
