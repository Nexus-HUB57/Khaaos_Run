// Khaaos Run — Entidades 3D: operativos humanoides DETALHADOS + arsenal enriquecido.
// Fase 6: modelos procedurais nível "próximo do FreeFire" — colete tático com
// pouches, pads, luvas, capacete com óculos, rosto pintado, camuflagem por paleta.
// Fase 7: acessórios determinísticos por operativo (variant), skins de arma por
// raridade do loot e pose de rastejo do DBNO. API de parts/anim PRESERVADA.
import * as THREE from 'three';
import {
  camoMaterial, faceTexture, goggleMaterial,
} from './textures3d.js';
import { RARITIES } from '../shared/weapons.js';

const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? .82, metalness: opts.metal ?? .12, ...opts.extra });

// Paleta de tons de pele (diversidade étnica canônica dos 16 operativos)
export const SKIN_TONES = ['#f2c9a0', '#d9a06b', '#b97a4b', '#8a5632', '#6b3f24', '#f7d7b8', '#a06a3f', '#5c3820'];
export const VEST_COLORS_FALLBACK = ['#3a3f47', '#4a3d2e', '#37423a', '#443044', '#2e3a45', '#4d3a30'];
const VEST_COLORS = VEST_COLORS_FALLBACK;
const EYE_TONES = ['#f59e0b', '#3b82f6', '#22c55e', '#e879a0', '#d4d4d4', '#a855f7'];
const TRIM_ACCENT = '#c8ff3d'; // verde ácido de comando (marca Khaaos)

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
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

// ---------- operativo (Fase 6/7) ----------
// cores: skin, vest (primária), secondary (calça/boina), trim (faixas),
// eyes, hair — todas opcionais com fallback coerente.
// variant (Fase 7): string do operativo/bot — deriva acessórios determinísticos.
export function createOperative({ skin = SKIN_TONES[0], vest = VEST_COLORS[0], secondary = null, trim = TRIM_ACCENT, eyes = null, hair = '#171717', helmet = true, variant = '' } = {}) {
  const g = new THREE.Group();
  const camo = camoMaterial(hashIdx(vest, 4), { repeat: 1.4 }); // camuflagem coerente com a cor do colete (compartilhada/memoizada)
  const sec = secondary ?? darken(vest, .6);
  const eye = eyes ?? EYE_TONES[hashIdx(skin + vest, EYE_TONES.length)];

  // ---- materiais (por instância p/ identidade de equipe) ----
  const skinM = M(skin, { rough: .62 });
  const vestM = M(vest, { rough: .78, metal: .18 });
  const vestDarkM = M(darken(vest, .55), { rough: .85 });
  const secM = M(sec, { rough: .88 });
  const gearM = M('#1b1d20', { rough: .86, metal: .1 });
  const gearM2 = M('#26282d', { rough: .8 });
  const bootM = M('#141517', { rough: .7 });
  const metalM = M('#4a4e55', { rough: .4, metal: .7 });
  const trimM = new THREE.MeshStandardMaterial({ color: trim, emissive: trim, emissiveIntensity: .55, roughness: .5 });

  // ---- quadril fixo: pelve + cinto tático + coldre ----
  const pelvis = box(.42, .2, .28, secM, 0, .84, 0);
  const belt = box(.46, .07, .31, gearM, 0, .94, 0);
  const buckle = box(.08, .06, .04, metalM, 0, .94, -.155);
  const holster = box(.1, .18, .08, gearM, .19, .82, -.06);
  g.add(pelvis, belt, buckle, holster);

  // ---- TRONCO (grupo — bob de corrida move tudo acima) ----
  const torso = new THREE.Group();
  torso.position.set(0, 1.22, 0);
  const shirt = box(.5, .6, .29, camo, 0, 0, 0);
  const vestMesh = box(.56, .46, .37, vestM, 0, .04, .01);
  torso.add(shirt, vestMesh);
  // pouches frontais de carregador (3) + porta-radio
  for (let i = -1; i <= 1; i++) torso.add(box(.12, .15, .07, vestDarkM, i * .16, -.06, -.21));
  torso.add(box(.09, .13, .05, gearM, -.21, .1, -.19)); // radio
  torso.add(cyl(.008, .008, .16, metalM, -.21, .2, -.18, 4)); // antena do radio
  // zipper + fivela central
  torso.add(box(.03, .42, .02, gearM2, 0, .04, -.19));
  // ombreiras
  torso.add(box(.17, .09, .2, gearM, -.31, .27, 0));
  torso.add(box(.17, .09, .2, gearM, .31, .27, 0));
  // mochila tática: corpo + straps + bedroll + faixa de equipe
  const pack = box(.38, .42, .17, gearM2, 0, .02, .23);
  torso.add(pack);
  torso.add(box(.3, .05, .19, vestDarkM, 0, .12, .24));      // tampa
  torso.add(cyl(.07, .07, .34, secM, 0, .27, .25, 8));        // bedroll no topo
  torso.add(box(.34, .06, .02, trimM, 0, -.08, .325));        // faixa reflexiva
  // costelas laterais do colete
  torso.add(box(.03, .3, .3, vestDarkM, -.29, .04, 0));
  torso.add(box(.03, .3, .3, vestDarkM, .29, .04, 0));
  g.add(torso);

  // ---- CABEÇA (grupo — pitch de mira) ----
  const head = new THREE.Group();
  head.position.set(0, .46, 0); // mundo ~1.68
  const neck = cyl(.07, .08, .1, skinM, 0, -.13, 0, 6);
  const skull = box(.25, .27, .25, skinM, 0, .01, 0);
  head.add(neck, skull);
  // rosto pintado (olhos/sobrancelhas/boca) na face FRONTAL (-z = frente)
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(skin, eye, hair), roughness: .58 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(.24, .25), faceMat);
  face.position.set(0, .01, -.127);
  face.rotation.y = Math.PI; // plano olha para -z
  head.add(face);
  // capacete tático OU boina (variedade)
  if (helmet) {
    const dome = box(.3, .13, .32, gearM, 0, .17, .01);
    const brim = box(.28, .04, .08, gearM, 0, .12, -.15);
    const band = box(.305, .06, .325, goggleMaterial(), 0, .1, .01); // óculos empilhados
    head.add(dome, brim, band);
    head.add(box(.02, .07, .16, gearM2, -.15, .17, .01)); // trilhos laterais
    head.add(box(.02, .07, .16, gearM2, .15, .17, .01));
    head.add(box(.05, .05, .05, metalM, .09, .23, .08));   // mount NVG
  } else {
    const cap = box(.28, .1, .28, vestM, 0, .17, .01);
    const brim = box(.24, .03, .12, vestM, 0, .13, -.16);
    const hairBack = box(.24, .12, .06, M(hair, { rough: .95 }), 0, .06, .13);
    head.add(cap, brim, hairBack);
  }
  torso.add(head);

  // ---- pernas: coxa camuflada + bolso cargo + joelheira + bota ----
  const mkLeg = (side) => {
    const hip = new THREE.Group(); hip.position.set(side * .13, .84, 0);
    const upper = box(.17, .42, .19, camo, 0, -.21, 0);
    const cargo = box(.05, .16, .12, secM, side * .1, -.2, 0);
    const knee = new THREE.Group(); knee.position.set(0, -.42, 0);
    const lower = box(.15, .4, .17, camo, 0, -.2, 0);
    const pad = box(.16, .14, .19, gearM, 0, -.02, -.005);
    const boot = box(.17, .12, .28, bootM, 0, -.43, .05);
    const sole = box(.18, .04, .3, M('#2a2b2f', { rough: .9 }), 0, -.5, .05);
    knee.add(lower, pad, boot, sole); hip.add(upper, cargo, knee);
    g.add(hip);
    return { hip, knee };
  };
  // ---- braços: manga camuflada + cotoveleira + luva + faixa de equipe ----
  const mkArm = (side) => {
    const shoulder = new THREE.Group(); shoulder.position.set(side * .33, .26, 0); // local ao tronco (mundo 1.48)
    const upper = box(.14, .34, .16, camo, 0, -.14, 0);
    const pad = box(.16, .1, .18, gearM, 0, -.26, 0);
    const stripe = box(.145, .05, .17, trimM, 0, -.05, 0);
    const elbow = new THREE.Group(); elbow.position.set(0, -.32, 0);
    const lower = box(.12, .3, .14, camo, 0, -.13, 0);
    const glove = box(.13, .12, .14, gearM, 0, -.32, 0);
    const cuff = box(.135, .06, .15, secM, 0, -.25, 0);
    elbow.add(lower, cuff, glove); shoulder.add(upper, pad, stripe, elbow);
    return { shoulder, elbow };
  };
  const legL = mkLeg(-1), legR = mkLeg(1);
  const armR = mkArm(1), armL = mkArm(-1);
  torso.add(armR.shoulder, armL.shoulder);

  // Fase 7 — acessórios únicos por operativo (determinísticos via variant)
  buildAccessories(head, torso, g, { variant, vest, sec, skin, trim, vestM, secM, gearM, gearM2, metalM, trimM });

  return { group: g, parts: { head, torso, legL, legR, armL, armR } };
}

// pose de caminhada/tiro — t é o tempo, speedNorm 0..1, pitch para braços,
// crouch (Fase 5) dobra pernas e abaixa o tronco; Fase 6: respiração idle,
// sway de tronco e cabeça acompanhando o passo. Fase 7: pose de rastejo DBNO.
export function animateOperative(parts, { t = 0, speedNorm = 0, pitch = 0, dead = false, ads = false, crouch = false, knocked = false } = {}) {
  if (dead) {
    parts.legL.hip.rotation.x *= .9; parts.legR.hip.rotation.x *= .9;
    parts.armL.shoulder.rotation.z = Math.min(.9, (parts.armL.shoulder.rotation.z || 0) + .02);
    parts.armR.shoulder.rotation.z = Math.max(-.9, (parts.armR.shoulder.rotation.z || 0) - .02);
    return;
  }
  if (knocked) {
    // rastejar: tronco deitado, cotoveladas alternadas arrastando o corpo
    const crawl = Math.sin(t * 5.2) * .5;
    parts.torso.rotation.x = 1.22;
    parts.torso.rotation.y = Math.sin(t * 2.6) * .09;
    parts.torso.position.y = .5;
    parts.legL.hip.rotation.x = .85 + crawl * .18;
    parts.legR.hip.rotation.x = .85 - crawl * .18;
    parts.legL.knee.rotation.x = -.55;
    parts.legR.knee.rotation.x = -.5;
    parts.armR.shoulder.rotation.x = -1.15 - crawl * .3;
    parts.armL.shoulder.rotation.x = -1.15 + crawl * .3;
    parts.armR.elbow.rotation.x = -.35;
    parts.armL.elbow.rotation.x = -.35;
    parts.head.rotation.x = -.6;
    return;
  }
  const swing = Math.sin(t * 9) * .62 * speedNorm;
  const swing2 = Math.cos(t * 9) * .5 * speedNorm;
  if (crouch) {
    parts.legL.hip.rotation.x = 1.15 + swing * .15;
    parts.legR.hip.rotation.x = 1.15 - swing * .15;
    parts.legL.knee.rotation.x = -1.45;
    parts.legR.knee.rotation.x = -1.45;
  } else {
    parts.legL.hip.rotation.x = swing;
    parts.legR.hip.rotation.x = -swing;
    parts.legL.knee.rotation.x = Math.max(0, swing2) * .8;
    parts.legR.knee.rotation.x = Math.max(0, -swing2) * .8;
  }
  const aim = -Math.PI / 2 + pitch;
  const breathe = Math.sin(t * 2.1) * .022 * (1 - speedNorm); // idle: respiração
  parts.armR.shoulder.rotation.x = aim + .18 - swing * .18 + breathe;
  parts.armL.shoulder.rotation.x = aim + .34 + swing * .18 + breathe;
  parts.armR.elbow.rotation.x = ads ? -.28 : -.5;
  parts.armL.elbow.rotation.x = ads ? -.62 : -.85;
  parts.head.rotation.x = pitch * .4 - Math.abs(swing) * .05;
  parts.torso.rotation.y = Math.sin(t * 9) * .07 * speedNorm; // sway do tronco no passo
  parts.torso.rotation.x = speedNorm * .1 + breathe * .6;      // inclina ao correr
  const torsoY = crouch ? .88 : 1.22 + Math.abs(Math.sin(t * 9)) * .05 * speedNorm;
  parts.torso.position.y = torsoY;
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
    arm.add(box(.16, .42, .16, camoM, 0, -.18, 0));          // manga
    arm.add(box(.17, .07, .17, secM, 0, -.34, 0));           // punho
    arm.add(box(.14, .16, .15, gloveM, 0, -.46, -.01));      // luva
    arm.add(box(.12, .06, .12, skinM, 0, -.55, -.02));       // dedos à mostra
    rig.add(arm);
    return arm;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  const chest = box(.42, .25, .18, vestM, 0, -.54, -.22);
  chest.rotation.x = -.24;
  const chestPouch = box(.14, .1, .05, M('#26282d', { rough: .8 }), 0, -.5, -.31);
  rig.add(chest, chestPouch);
  rig.userData.arms = { armL, armR };
  return rig;
}

// ---------- loot no chão (Fase 6: pad hexagonal de raridade) ----------
export function createLootMesh(item) {
  const g = new THREE.Group();
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
  const box_ = box(size, size, size, M(color, { rough: .5, metal: .5, extra: { emissive: color, emissiveIntensity: .22 } }));
  box_.position.y = size / 2 + .05;
  box_.rotation.y = Math.PI / 4;
  g.add(box_);
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
