// Khaaos Run — Entidades 3D: operativos humanoides articulados + arsenal low-poly.
// Todos os modelos são procedurais (primitivas Three.js), zero assets externos.
import * as THREE from 'three';

const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? .82, metalness: opts.metal ?? .12, ...opts.extra });

// Paleta de tons de pele (diversidade étnica canônica dos 16 operativos)
export const SKIN_TONES = ['#f2c9a0', '#d9a06b', '#b97a4b', '#8a5632', '#6b3f24', '#f7d7b8', '#a06a3f', '#5c3820'];
export const VEST_COLORS_FALLBACK = ['#3a3f47', '#4a3d2e', '#37423a', '#443044', '#2e3a45', '#4d3a30'];
const VEST_COLORS = VEST_COLORS_FALLBACK;

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------- operativo ----------
export function createOperative({ skin = SKIN_TONES[0], vest = VEST_COLORS[0], helmet = true } = {}) {
  const g = new THREE.Group();
  const skinM = M(skin, { rough: .65 });
  const clothM = M('#2c2f33', { rough: .9 });
  const vestM = M(vest, { rough: .75, metal: .25 });
  const darkM = M('#17181b', { rough: .85 });

  // tronco + colete
  const torso = box(.52, .62, .3, clothM, 0, 1.22, 0);
  const vestMesh = box(.56, .44, .36, vestM, 0, 1.26, 0);
  g.add(torso, vestMesh);
  // cabeça + capacete
  const head = box(.26, .28, .26, skinM, 0, 1.68, 0);
  g.add(head);
  if (helmet) { const hm = box(.3, .14, .32, darkM, 0, 1.82, 0); g.add(hm); }
  // quadril
  g.add(box(.4, .22, .26, darkM, 0, .84, 0));
  // pernas (2 partes p/ dobrar)
  const mkLeg = (side) => {
    const hip = new THREE.Group(); hip.position.set(side * .13, .84, 0);
    const upper = box(.16, .42, .18, clothM, 0, -.21, 0);
    const knee = new THREE.Group(); knee.position.set(0, -.42, 0);
    const lower = box(.14, .4, .16, clothM, 0, -.2, 0);
    const boot = box(.16, .1, .26, darkM, 0, -.42, .04);
    knee.add(lower, boot); hip.add(upper, knee);
    g.add(hip);
    return { hip, knee };
  };
  // braços (ombro + cotovelo)
  const mkArm = (side) => {
    const shoulder = new THREE.Group(); shoulder.position.set(side * .34, 1.48, 0);
    const upper = box(.13, .36, .15, clothM, 0, -.16, 0);
    const elbow = new THREE.Group(); elbow.position.set(0, -.34, 0);
    const lower = box(.11, .32, .13, skinM, 0, -.15, 0);
    const hand = box(.11, .1, .12, darkM, 0, -.33, 0);
    elbow.add(lower, hand); shoulder.add(upper, elbow);
    g.add(shoulder);
    return { shoulder, elbow };
  };
  const legL = mkLeg(-1), legR = mkLeg(1);
  const armR = mkArm(1), armL = mkArm(-1);

  // mochila tática
  g.add(box(.36, .4, .16, M('#23262a', { rough: .95 }), 0, 1.24, -.24));

  return { group: g, parts: { head, torso, legL, legR, armL, armR } };
}

// pose de caminhada/tiro — t é o tempo, speedNorm 0..1, pitch para braços
export function animateOperative(parts, { t = 0, speedNorm = 0, pitch = 0, dead = false, ads = false } = {}) {
  if (dead) {
    parts.legL.hip.rotation.x *= .9; parts.legR.hip.rotation.x *= .9;
    return;
  }
  const swing = Math.sin(t * 9) * .62 * speedNorm;
  const swing2 = Math.cos(t * 9) * .5 * speedNorm;
  parts.legL.hip.rotation.x = swing;
  parts.legR.hip.rotation.x = -swing;
  parts.legL.knee.rotation.x = Math.max(0, swing2) * .8;
  parts.legR.knee.rotation.x = Math.max(0, -swing2) * .8;
  // braços seguram arma à frente; sobem/descem com pitch
  const aim = -Math.PI / 2 + pitch;
  parts.armR.shoulder.rotation.x = aim + .18 - swing * .18;
  parts.armL.shoulder.rotation.x = aim + .34 - (-swing) * .18;
  parts.armR.elbow.rotation.x = ads ? -.28 : -.5;
  parts.armL.elbow.rotation.x = ads ? -.62 : -.85;
  parts.head.rotation.x = pitch * .4;
  // bob de corrida
  parts.torso.position.y = 1.22 + Math.abs(Math.sin(t * 9)) * .05 * speedNorm;
}

// ---------- arsenal ----------
// Cada arma: grupo apontando para -Z (frente), com muzzle Marker no cano.
export function createWeaponModel(id) {
  const g = new THREE.Group();
  const gun = M('#22252a', { rough: .42, metal: .78 });
  const gun2 = M('#15171a', { rough: .5, metal: .7 });
  const accent = new THREE.MeshStandardMaterial({ color: '#c8ff3d', emissive: '#c8ff3d', emissiveIntensity: .9, roughness: .4 });
  const wood = M('#6b4a26', { rough: .85 });
  const add = (w, h, d, mat, x, y, z) => { const m = box(w, h, d, mat, x, y, z); g.add(m); return m; };
  const muzzle = new THREE.Object3D();
  let muzzleZ = -.55;

  switch (id) {
    case 'g19': // pistola
      add(.07, .12, .3, gun, 0, 0, -.1);
      add(.06, .16, .09, gun2, 0, -.1, .04);
      muzzleZ = -.28;
      break;
    case 'mp5': // submetrahadora
      add(.08, .11, .5, gun, 0, 0, -.12);
      add(.05, .2, .07, gun2, 0, -.13, -.02);
      add(.06, .09, .2, gun2, 0, -.02, .28);
      muzzleZ = -.4;
      break;
    case 'm4': // fuzil
      add(.075, .1, .72, gun, 0, 0, -.18);
      add(.05, .16, .08, gun2, 0, -.12, .06);
      add(.055, .07, .3, gun2, 0, .085, -.2);
      add(.07, .12, .16, gun2, 0, -.01, .3);
      muzzleZ = -.56;
      break;
    case 'barrett': // sniper .338
      add(.09, .12, 1.05, gun, 0, 0, -.28);
      add(.06, .18, .09, gun2, 0, -.13, .12);
      add(.07, .09, .34, gun2, 0, .1, -.3); // luneta
      add(.09, .14, .3, wood, 0, -.02, .38);
      muzzleZ = -.84;
      break;
    case 'pulse': // rifle de energia
      add(.1, .12, .8, gun2, 0, 0, -.2);
      add(.06, .15, .1, gun2, 0, -.12, .08);
      const cell = add(.05, .05, .5, accent, 0, .09, -.22);
      cell.material = accent;
      muzzleZ = -.62;
      break;
    case 'sucata': // lança de sucata
      add(.06, .06, .8, wood, 0, 0, -.25);
      add(.14, .18, .05, gun2, 0, .02, -.62);
      muzzleZ = -.66;
      break;
    default:
      add(.07, .11, .4, gun, 0, 0, -.12);
  }
  muzzle.position.set(0, .02, muzzleZ);
  g.add(muzzle);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return { group: g, muzzle };
}

// orienta braços/arma no corpo — retorna o anchor da arma (na mão direita)
export function attachWeapon(opParts, operativeGroup, weaponId) {
  // remove arma anterior
  const old = operativeGroup.userData.weaponRig;
  if (old) { operativeGroup.remove(old.group); old.group.traverse(o => { o.geometry?.dispose?.(); }); }
  const model = createWeaponModel(weaponId);
  model.group.position.set(.3, 1.4, -.25);
  operativeGroup.add(model.group);
  operativeGroup.userData.weaponRig = model;
  return model;
}

// ---------- loot no chão ----------
export function createLootMesh(item) {
  const g = new THREE.Group();
  const rarityColors = { COMUM: '#b7c2c7', INCOMUM: '#42d9de', RARO: '#a875ff', LENDARIO: '#ffb52e' };
  const color = rarityColors[item.rarity] ?? (item.kind === 'consumable' ? '#ff6b2c' : item.kind === 'armor' ? '#42d9de' : '#b7c2c7');
  const isWeapon = item.kind === 'weapon';
  const size = isWeapon ? .5 : .34;
  const box_ = box(size, size, size, M(color, { rough: .5, metal: .5, extra: { emissive: color, emissiveIntensity: .22 } }));
  box_.position.y = size / 2;
  g.add(box_);
  // feixe vertical de raridade
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
