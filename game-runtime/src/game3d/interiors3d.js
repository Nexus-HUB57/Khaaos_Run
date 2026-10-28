// Khaaos Run — Fase 23/24: INTERIORES REAIS (cascas com porta/janelas, mobília,
// escada + mezanino pisável — nível Free Fire).
//
// Fase 23: cascas substituem a caixa sólida das estruturas-habitação — porta
// REAL, piso, forro e mobília coerente com o distrito e o mundo.
// Fase 24: as cascas ganham JANELAS com vidro e as estruturas grandes ganham
// ESCADA + MEZANINO — visual coerente com os colliders ocos/floors gerados por
// interiorsPlan.hollowAccess em getWorldLayout (MESMA fonte determinística:
// o vão que o jogador atravessa é o vão desenhado).
//
// CONTRATO DE GAMEPLAY (Fase 24): colliders das estruturas-casca viram PAREDES
// OCAS (segmentos com vão de porta + faixas de janela onde balas/LOS passam);
// degraus e mezaninos viram superfícies pisáveis via world.floors.
//
// Filosofia do repo (mantida):
//  - LÓGICA PURA em interiorsPlan.js (sem THREE, headless-safe p/ servidor);
//  - builder visual (buildInteriors + buildShellHost) com registro em
//    scene.userData.interiors — MESMO contrato dos worldMarks/districtDressing:
//    { id, counts, animators, placements, shells, group }, idempotente;
//  - DETERMINISMO: mesma seed+cenário => mesmas placements (SeededRng);
//  - ZERO assets externos: geometria + materiais 100% procedurais;
//  - QUALIDADE: densidade da mobília vem do tier (quality3d.interiorFactor);
//    as cascas são sempre construídas (substituem a caixa sólida).
import * as THREE from 'three';
import { SeededRng } from '../shared/rng.js';
import {
  plankMaterial, concreteMaterial, crateTexture, barrelMaterial,
  palletMaterial, sandbagMaterial, signTexture,
} from './textures3d.js';
import { ACCENTS, MEZZ, DOOR_MECH, interiorDressing } from './interiorsPlan.js';

// ============================================================================
// PARTE 1 — plano puro (Fase 24): placements/janelas/escada moram em
// interiorsPlan.js — MESMA fonte p/ a casca visual e p/ a física (colliders
// ocos + floors). Reexportado aqui p/ manter os contratos de import.
// ============================================================================
export {
  SHELL_KINDS, WINDOW_KINDS, MEZZ_KINDS, WINDOW_SPEC, WINDOW_SPEC_UPPER, MEZZ,
  interiorDressing, localPointToWorld, localRectToWorldAabb, hollowAccess,
} from './interiorsPlan.js';

// ==========================================================================
// PARTE 2 — builder visual (THREE): cascas, mobília, luminárias, animators
// ============================================================================

const ST = (color, o = {}) => new THREE.MeshStandardMaterial({
  color, roughness: o.rough ?? .85, metalness: o.metal ?? .08,
  ...(o.emissive ? { emissive: o.emissive, emissiveIntensity: o.ei ?? 1 } : {}),
  ...(o.flat ? { flatShading: true } : {}),
  ...(o.map ? { map: o.map } : {}),
  ...(o.side ? { side: o.side } : {}),
});

// materiais compartilhados por build (uma cena por chamada)
function sharedMaterials(scenario) {
  const accent = ACCENTS[scenario.id] ?? ACCENTS.CIGKV;
  return {
    wall: concreteMaterial(1.6),
    wallIn: ST('#6b675f', { rough: .94 }),
    floor: ST('#57534c', { rough: .95 }),
    floorWood: plankMaterial(1.4),
    roof: ST('#4c4842', { rough: .92 }),
    frame: ST('#35383d', { metal: .4, rough: .6 }),
    wood: ST('#6e5433', { rough: .9 }),
    woodDark: ST('#4e3a22', { rough: .92 }),
    steel: ST('#4c4f55', { metal: .6, rough: .45 }),
    rust: ST('#7a4a2b', { metal: .4, rough: .72 }),
    rubber: ST('#1c1d20', { rough: .95 }),
    crate: ST('#8a7350', { map: crateTexture(), rough: .85 }),
    barrel: barrelMaterial('#4a5545'),
    pallet: palletMaterial(),
    bag: sandbagMaterial(),
    cloth: ST(accent.cloth, { rough: .95 }),
    paper: ST('#cfc9b8', { rough: .9 }),
    plant: ST('#4d6b35', { rough: .95, flat: true }),
    lamp: new THREE.MeshStandardMaterial({
      color: '#ffe9b8', emissive: '#ffdf9e', emissiveIntensity: 1.05, roughness: .4,
    }),
    screen: new THREE.MeshStandardMaterial({
      color: '#173a4a', emissive: '#2e9bb8', emissiveIntensity: 1.1, roughness: .3,
    }),
    flame: ST('#ffb347', { emissive: '#ff8c1e', ei: 1.3, rough: .5 }),
    // Fase 24 — vidro das janelas (translúcido, DoubleSide, sem depthWrite)
    glass: new THREE.MeshStandardMaterial({
      color: '#9fb8c8', roughness: .08, metalness: .1,
      transparent: true, opacity: .3, side: THREE.DoubleSide, depthWrite: false,
    }),
  };
}

// ---- helper: caixa posicionada (menos verbosidade nos builders) ----
function box(g, w, h, d, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}

// ---- mobília (cada builder retorna meshes em coords locais, pivô no chão) ----
const FURN = {
  bunk(m) {
    const g = new THREE.Group();
    box(g, 1.9, .12, .9, m.woodDark, 0, .42, 0);
    box(g, 1.9, .1, .9, m.woodDark, 0, 1.15, 0);
    for (const [dx, dz] of [[-.88, -.4], [.88, -.4], [-.88, .4], [.88, .4]]) box(g, .09, 1.25, .09, m.woodDark, dx, .62, dz);
    const mat = box(g, 1.7, .14, .8, m.cloth, 0, .53, 0);
    mat.castShadow = false;
    box(g, .5, .1, .55, m.paper, -.6, .63, 0);
    return g;
  },
  locker(m) {
    const g = new THREE.Group();
    box(g, .8, 1.9, .5, m.steel, 0, .95, 0);
    box(g, .02, 1.5, .4, m.frame, .41, .95, 0);   // fresta da porta
    box(g, .6, .06, .05, m.frame, 0, 1.5, .26);   // ventilação
    box(g, .6, .06, .05, m.frame, 0, 1.32, .26);
    return g;
  },
  weaponsrack(m) {
    const g = new THREE.Group();
    box(g, 2, 1.5, .12, m.woodDark, 0, .75, 0);
    box(g, 2, .1, .34, m.wood, 0, .5, .1);
    for (let i = 0; i < 3; i++) {
      box(g, .08, .8, .08, m.woodDark, -.6 + i * .6, 1.05, .08);
      box(g, .07, .5, .05, m.steel, -.6 + i * .6, .85, .12);   // silhueta de fuzil
    }
    return g;
  },
  cratestack(m) {
    const g = new THREE.Group();
    box(g, .9, .9, .9, m.crate, 0, .45, 0);
    box(g, .7, .7, .7, m.crate, .18, 1.25, .12, .5);
    box(g, .8, .8, .8, m.crate, -.85, .4, .25, .25);
    return g;
  },
  workbench(m) {
    const g = new THREE.Group();
    box(g, 2.2, .12, .9, m.wood, 0, .88, 0);
    for (const [dx, dz] of [[-1, -.38], [1, -.38], [-1, .38], [1, .38]]) box(g, .1, .85, .1, m.woodDark, dx, .44, dz);
    box(g, .3, .22, .28, m.steel, -.7, 1.05, 0);              // tornel
    box(g, .5, .05, .2, m.steel, .4, .97, .1);                // ferramenta
    return g;
  },
  tirestack(m) {
    const g = new THREE.Group();
    const geo = new THREE.TorusGeometry(.36, .15, 8, 14);
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(geo, m.rubber);
      t.position.set(0, .17 + i * .31, 0); t.rotation.x = Math.PI / 2;
      t.rotation.z = i * .3; t.castShadow = t.receiveShadow = true;
      g.add(t);
    }
    return g;
  },
  toolcart(m) {
    const g = new THREE.Group();
    box(g, .9, .6, .55, m.steel, 0, .55, 0);
    box(g, .9, .06, .55, m.rust, 0, .9, 0);
    for (const [dx, dz] of [[-.38, -.24], [.38, -.24], [-.38, .24], [.38, .24]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .06, 8), m.rubber);
      w.position.set(dx, .12, dz); w.rotation.z = Math.PI / 2; w.castShadow = true;
      g.add(w);
    }
    return g;
  },
  targetboard(m) {
    const g = new THREE.Group();
    box(g, .1, 1.6, .1, m.woodDark, 0, .8, 0);
    const face = new THREE.Mesh(new THREE.CircleGeometry(.55, 18), ST('#d8d2c0', { rough: .9 }));
    face.position.set(0, 1.55, .07); g.add(face);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(.32, 16), ST('#8a3a2a', { rough: .9 }));
    inner.position.set(0, 1.55, .09); g.add(inner);
    return g;
  },
  shelfrack(m) {
    const g = new THREE.Group();
    for (const dx of [-1.05, 1.05]) box(g, .09, 2.1, .5, m.steel, dx, 1.05, 0);
    for (const y of [.4, 1.05, 1.7]) box(g, 2.1, .07, .5, m.woodDark, 0, y, 0);
    box(g, .45, .35, .4, m.crate, -.55, .62, 0);
    box(g, .45, .35, .4, m.bag, .35, 1.29, 0);
    box(g, .4, .3, .38, m.crate, .5, .62, .02, .3);
    return g;
  },
  palletstack(m) {
    const g = new THREE.Group();
    box(g, 1.25, .14, 1.05, m.pallet, 0, .07, 0);
    box(g, 1.25, .14, 1.05, m.pallet, .06, .25, .04, .12);
    box(g, 1.1, .5, .9, m.bag, 0, .58, 0);
    return g;
  },
  barrelrow(m) {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(.34, .34, .95, 10);
    for (const [dx, dz, ry] of [[-.4, 0, 0], [.42, .1, .3], [.05, -.75, 1.2]]) {
      const b = new THREE.Mesh(geo, m.barrel);
      b.position.set(dx, .48 * (dz ? .7 : 1), dz);
      if (dz) { b.rotation.x = Math.PI / 2; b.position.y = .34; }
      b.rotation.y = ry; b.castShadow = b.receiveShadow = true;
      g.add(b);
    }
    return g;
  },
  table(m) {
    const g = new THREE.Group();
    box(g, 1.5, .1, .9, m.wood, 0, .76, 0);
    for (const [dx, dz] of [[-.65, -.36], [.65, -.36], [-.65, .36], [.65, .36]]) box(g, .09, .74, .09, m.woodDark, dx, .37, dz);
    box(g, .4, .03, .3, m.paper, -.3, .83, .1, .4);   // papéis
    box(g, .3, .03, .24, m.paper, .35, .83, -.12, 1.1);
    return g;
  },
  shelf(m) {
    const g = new THREE.Group();
    for (const dx of [-.55, .55]) box(g, .07, 1.6, .38, m.woodDark, dx, .8, 0);
    for (const y of [.35, .85, 1.35]) box(g, 1.1, .06, .38, m.wood, 0, y, 0);
    box(g, .3, .28, .26, m.crate, -.2, .52, 0);
    box(g, .25, .2, .22, m.paper, .25, .98, 0, .4);
    return g;
  },
  planter(m) {
    const g = new THREE.Group();
    box(g, .55, .45, .55, m.rust, 0, .22, 0);
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(.3, 1), m.plant);
    bush.position.y = .62; bush.castShadow = true;
    g.add(bush);
    return g;
  },
  counter(m) {
    const g = new THREE.Group();
    box(g, 2, .9, .6, m.woodDark, 0, .45, 0);
    box(g, 2.2, .08, .7, m.wood, 0, .94, 0);
    return g;
  },
  stool(m) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .08, 10), m.wood);
    seat.position.y = .62; seat.castShadow = true;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, .6, 6), m.woodDark);
    leg.position.y = .3; leg.castShadow = true;
    g.add(seat, leg);
    return g;
  },
  menuboard(m) {
    const g = new THREE.Group();
    box(g, .08, .9, .08, m.woodDark, -.55, .45, 0);
    box(g, .08, .9, .08, m.woodDark, .55, .45, 0);
    box(g, 1.3, .8, .06, m.woodDark, 0, 1.05, 0);
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(1.15, .65),
      new THREE.MeshBasicMaterial({ map: signTexture('CAFÉ ZEX', '#ffd28a'), toneMapped: false }));
    menu.position.set(0, 1.05, .045);
    g.add(menu);
    return g;
  },
  fridge(m) {
    const g = new THREE.Group();
    box(g, .65, 1.5, .6, m.steel, 0, .75, 0);
    box(g, .03, 1.1, .4, m.frame, .33, .85, 0);
    box(g, .4, .5, .02, ST('#9fd8d2', { rough: .2, metal: .1 }), 0, 1.05, .31);
    return g;
  },
  rubble(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(.22 + (i % 2) * .14, 0), m.wallIn);
      r.position.set((i - 1.5) * .35, .14 + (i % 2) * .1, ((i % 3) - 1) * .3);
      r.rotation.set(i, i * 2.1, i * .7);
      r.castShadow = r.receiveShadow = true;
      g.add(r);
    }
    const slab = box(g, .9, .12, .6, m.wallIn, .1, .32, -.2, .5);
    slab.rotation.z = .22;
    return g;
  },
  rebar(m) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.3, 5), m.rust);
      bar.position.set((i - 1) * .22, .5, 0);
      bar.rotation.set(.4 + i * .18, 0, (i - 1) * .3);
      bar.castShadow = true;
      g.add(bar);
    }
    return g;
  },
  brokenbench(m) {
    const g = new THREE.Group();
    const top = box(g, 1.4, .1, .45, m.wood, 0, .42, 0);
    top.rotation.z = .16;
    box(g, .09, .4, .09, m.woodDark, -.6, .2, 0);
    box(g, .09, .34, .09, m.woodDark, .62, .17, .05);
    return g;
  },
  lanternpost(m) {
    const g = new THREE.Group();
    box(g, .09, 1.7, .09, m.woodDark, 0, .85, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.24, .3, .24), m.lamp);
    head.position.y = 1.8; g.add(head);
    g.userData.lamp = head;
    return g;
  },
  heater(m) {
    const g = new THREE.Group();
    box(g, .6, 1.1, .5, m.rust, 0, .55, 0);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(.4, .08, .03), m.flame);
    slit.position.set(0, .78, .26); g.add(slit);
    g.userData.lamp = slit;
    box(g, .18, .5, .18, m.steel, 0, 1.2, 0);   // chaminé
    return g;
  },
  hammock(m) {
    const g = new THREE.Group();
    box(g, .09, 1.6, .09, m.woodDark, -1.05, .8, 0);
    box(g, .09, 1.6, .09, m.woodDark, 1.05, .8, 0);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.1, .7),
      ST(m.cloth.color.getStyle(), { rough: .95, side: THREE.DoubleSide }));
    cloth.position.y = 1.05; cloth.rotation.x = Math.PI / 2 - .28;
    cloth.castShadow = true;
    g.add(cloth);
    return g;
  },
  waterdrum(m) {
    const g = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .9, 12), m.steel);
    drum.position.y = .45; drum.castShadow = drum.receiveShadow = true;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(.46, .46, .06, 12), m.rust);
    lid.position.y = .92; g.add(drum, lid);
    return g;
  },
  astralconsole(m) {
    const g = new THREE.Group();
    box(g, 1.4, .85, .6, m.steel, 0, .42, 0);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(1.1, .6, .06), m.screen);
    screen.position.set(0, 1.15, -.12); screen.rotation.x = -.28; g.add(screen);
    g.userData.screen = screen;
    return g;
  },
};

/**
 * Prepara os interiores: placements + materiais + mapa de shells + registry.
 * NÃO adiciona malhas — as cascas entram via buildShellHost no loop de
 * estruturas do world3d (substituindo a caixa sólida, collider intacto).
 * Registry em scene.userData.interiors: { id, counts, animators, placements,
 * shells (Map estrutura→spec), doorPanels (Map id→grupo do painel — Fase 25),
 * group, mats }.
 */
export function buildInteriors(scene, layout, scenario, q) {
  if (scene.userData.interiors) return scene.userData.interiors;

  const placements = interiorDressing(layout, scenario, { density: q.interiorFactor ?? 1 });
  const mats = sharedMaterials(scenario);
  const group = new THREE.Group();
  group.name = 'interiors';
  scene.add(group);

  const shells = new Map();
  for (const spec of placements.structures) shells.set(layout.structures[spec.index], spec);

  // ---------- animators (stateless por t, materiais compartilhados) ----------
  const animators = [];
  animators.push((dt, t) => { // flicker de lâmpadas/aquecedor (2 harmônicos)
    mats.lamp.emissiveIntensity = 1.05 * (.9 + Math.sin(t * 7.3) * .06 + Math.sin(t * 2.9) * .04);
  });
  animators.push((dt, t) => { // pulso das telas astrais
    mats.screen.emissiveIntensity = 1.1 * (.82 + Math.sin(t * 1.7) * .18);
  });

  const registry = {
    id: scenario.id,
    counts: placements.counts,
    animators,
    placements,
    shells,
    // Fase 25 — folhas de porta: doorId → { pivot, leaf, openSign, current, target, broken }
    // preenchido pelo world3d quando cada buildShellHost entra na cena
    doors: new Map(),
    mats,
    group,
  };
  // animator das folhas: persegue o alvo autoritativo (0 fechada / openAngle
  // aberta); quebrada => recolhe e some (a lascas ficam por conta do FX)
  animators.push((dt) => {
    for (const h of registry.doors.values()) {
      const target = h.broken ? 0 : h.target;
      const next = h.current + (target - h.current) * Math.min(1, dt * 6.5);
      h.current = Math.abs(next - target) < 0.002 ? target : next;
      h.pivot.rotation.y = h.openSign * h.current;
      if (h.broken && h.leaf.visible) h.leaf.visible = false;
    }
  });
  scene.userData.interiors = registry;
  return registry;
}

// WALL_LEN: comprimento da parede por face (para cascas)
const wallLen = (s, face) => (face === 'front' || face === 'back') ? s.w : s.d;

/**
 * Constrói a casca de UMA estrutura (piso, paredes com porta real, teto,
 * luminária e mobília). Host em (s.x, s.yMin, s.z) com rot da estrutura —
 * MESMA transform da caixa que substitui (fachadas/facades continuam batendo).
 * @param {object} s estrutura do layout
 * @param {{ door, items }} spec do interiorDressing
 * @param {object} m mats de buildInteriors
 */
export function buildShellHost(s, spec, m) {
  const host = new THREE.Group();
  host.name = `shell:${s.kind}:${s.x}:${s.z}`;
  host.position.set(s.x, s.yMin, s.z);
  host.rotation.y = s.rot ?? 0;
  const { w, d, h } = s;
  const T = .26;              // espessura das paredes
  const ruin = s.kind === 'ruin';
  const pavilion = s.kind === 'pavilion';

  // ---- piso ----
  box(host, w, .12, d, s.kind === 'building' || pavilion ? m.floorWood : m.floor, 0, .06, 0);

  // ---- paredes (porta na face do spec; ruínas têm alturas quebradas) ----
  const addWall = (face, segU, segLen, segH, yBase = 0) => {
    // segU: offset do centro do segmento AO LONGO da parede
    const len = wallLen(s, face);
    const half = len / 2 - Math.abs(segU) - segLen / 2;
    if (half < -.01) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(
      face === 'front' || face === 'back' ? segLen : T,
      segH,
      face === 'front' || face === 'back' ? T : segLen,
    ), ruin ? m.wallIn : m.wall);
    const y = yBase + segH / 2;
    if (face === 'front') mesh.position.set(segU, y, -d / 2 + T / 2);
    if (face === 'back') mesh.position.set(segU, y, d / 2 - T / 2);
    if (face === 'left') mesh.position.set(-w / 2 + T / 2, y, segU);
    if (face === 'right') mesh.position.set(w / 2 - T / 2, y, segU);
    mesh.castShadow = mesh.receiveShadow = true;
    host.add(mesh);
  };

  // vidro da janela (Fase 24): painel translúcido + batente metálico — MESMA
  // faixa local dos colliders (windows do spec)
  const windowGlass = (face, win) => {
    const cw = win.u1 - win.u0, ch = win.y1 - win.y0;
    const uc = (win.u0 + win.u1) / 2, yc = (win.y0 + win.y1) / 2;
    const horizontal = face === 'front' || face === 'back';
    const piece = (u, y, su, sy, mat, thick, noShadow = false) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(
        horizontal ? su : thick, sy, horizontal ? thick : su), mat);
      if (face === 'front') mesh.position.set(u, y, -d / 2 + T / 2);
      else if (face === 'back') mesh.position.set(u, y, d / 2 - T / 2);
      else if (face === 'right') mesh.position.set(w / 2 - T / 2, y, u);
      else mesh.position.set(-w / 2 + T / 2, y, u);
      if (!noShadow) mesh.castShadow = mesh.receiveShadow = true;
      host.add(mesh);
      return mesh;
    };
    const ft = .1;
    piece(uc, win.y0 + .05, cw + ft, .08, m.frame, T + .06);   // peitoril
    piece(uc, win.y1 - .05, cw + ft, .08, m.frame, T + .06);   // verga
    piece(win.u0 + .05, yc, .08, ch, m.frame, T + .06);        // montante esq
    piece(win.u1 - .05, yc, .08, ch, m.frame, T + .06);        // montante dir
    piece(uc, yc, cw, ch, m.glass, .08, true);                  // vidro
  };

  const faces = ['front', 'back', 'left', 'right'];
  const rngShape = new SeededRng(`shell:${s.kind}:${s.x}:${s.z}`);
  for (const face of faces) {
    if (pavilion) continue;                     // quiosque: só postes + telhado
    const len = wallLen(s, face);
    if (face === spec.door.face) {
      // porta: 2 segmentos + verga
      const dw = spec.door.w, dh = spec.door.h;
      const doorC = spec.door.u;
      const leftW = (len / 2 + doorC) - dw / 2;
      const rightW = (len / 2 - doorC) - dw / 2;
      if (leftW > .05) addWall(face, -(len / 2 - leftW / 2), leftW, ruin ? h * (.4 + rngShape.next() * .3) : h);
      if (rightW > .05) addWall(face, len / 2 - rightW / 2, rightW, ruin ? h * (.35 + rngShape.next() * .3) : h);
      if (!ruin) addWall(face, doorC, dw, h - dh, dh);   // verga acima da porta
      else addWall(face, doorC, dw, .5, 0);               // ruína: toco baixo no vão
      // batente
      const jamb = (u) => {
        const j = new THREE.Mesh(new THREE.BoxGeometry(
          face === 'front' || face === 'back' ? .14 : T + .1, dh + .1,
          face === 'front' || face === 'back' ? T + .1 : .14), m.frame);
        if (face === 'front') j.position.set(u, (dh + .1) / 2, -d / 2 + T / 2);
        if (face === 'back') j.position.set(u, (dh + .1) / 2, d / 2 - T / 2);
        if (face === 'left') j.position.set(-w / 2 + T / 2, (dh + .1) / 2, u);
        if (face === 'right') j.position.set(w / 2 - T / 2, (dh + .1) / 2, u);
        j.castShadow = true;
        host.add(j);
      };
      jamb(doorC - dw / 2 - .07);
      jamb(doorC + dw / 2 + .07);
      // ---- Fase 25 — FOLHA da porta (dobradiça + madeira + maçaneta) ----
      // Fecha o vão visualmente; abre para DENTRO (estilo Free Fire) girando no
      // pivô do batente. Estado autoritativo vem de sim/room3d via main3d —
      // MESMO vão de doorwaysOf (física e visual nunca divergem).
      const leafW = dw - DOOR_MECH.leafGap, leafH = dh - .08;
      const horizontal = face === 'front' || face === 'back';   // vão corre em X local
      const hingeSide = rngShape.next() < .5 ? -1 : 1;      // lado da dobradiça (determinístico)
      const hingeU = doorC + hingeSide * dw / 2;
      const pivot = new THREE.Group();
      if (face === 'front') pivot.position.set(hingeU, 0, -d / 2 + T / 2);
      if (face === 'back') pivot.position.set(hingeU, 0, d / 2 - T / 2);
      if (face === 'left') pivot.position.set(-w / 2 + T / 2, 0, hingeU);
      if (face === 'right') pivot.position.set(w / 2 - T / 2, 0, hingeU);
      host.add(pivot);
      const leaf = new THREE.Group();
      pivot.add(leaf);
      // painel de tábuas: offset NO EIXO DO VÃO (X p/ horizontal, Z p/ vertical)
      const offU = -hingeSide * leafW / 2;
      const leafThick = .09;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(
        horizontal ? leafW : leafThick, leafH, horizontal ? leafThick : leafW), m.woodDark);
      panel.position.set(horizontal ? offU : 0, leafH / 2, horizontal ? 0 : offU);
      panel.castShadow = panel.receiveShadow = true;
      leaf.add(panel);
      // travessas horizontais + diagonal (leitura de porta de madeira)
      const brace = (by) => {
        const bMesh = new THREE.Mesh(new THREE.BoxGeometry(
          horizontal ? leafW * .92 : leafThick + .04, .16, horizontal ? leafThick + .04 : leafW * .92), m.wood);
        bMesh.position.set(horizontal ? offU : 0, by, horizontal ? 0 : offU);
        bMesh.castShadow = true;
        leaf.add(bMesh);
      };
      brace(leafH * .22);
      brace(leafH * .78);
      const diag = new THREE.Mesh(new THREE.BoxGeometry(
        horizontal ? leafW * .78 : leafThick + .02, .12, horizontal ? leafThick + .02 : leafW * .78), m.wood);
      diag.position.set(horizontal ? offU : 0, leafH * .5, horizontal ? 0 : offU);
      diag.rotation.z = horizontal ? .52 : 0;
      diag.rotation.x = horizontal ? 0 : .52;
      diag.castShadow = true;
      leaf.add(diag);
      // maçaneta (lado oposto à dobradiça, 1,05 m)
      const handleX = -hingeSide * (leafW - .18);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, .3), m.steel);
      if (horizontal) handle.position.set(handleX, 1.05, 0);
      else { handle.position.set(0, 1.05, handleX); handle.rotation.y = Math.PI / 2; }
      handle.castShadow = true;
      leaf.add(handle);
      // sinal de abertura: folha gira PARA DENTRO do interior (−normal)
      // front/back: interior = ±Z local; left/right: interior = ∓X local
      const openSign = hingeSide * (face === 'front' || face === 'right' ? 1 : -1);
      host.userData.doorHandle = {
        id: `door-${spec.index}`,
        pivot, leaf, openSign,
        current: 0, target: 0, broken: false,
      };
      continue;
    }
    if (ruin) {
      // paredes quebradas: 2–3 segmentos de alturas variadas
      let u = -len / 2;
      while (u < len / 2 - .4) {
        const segLen = Math.min(len / 2 - u, 1.6 + rngShape.next() * 2.6);
        const segH = h * (.18 + rngShape.next() * .62);
        addWall(face, u + segLen / 2, segLen - .18, segH);
        u += segLen;
      }
    } else {
      const wins = (spec.windows ?? []).filter((w) => w.face === face).sort((a, b) => a.u0 - b.u0);
      if (!wins.length) {
        addWall(face, 0, len, h);
      } else {
        // Fase 24 — parede com faixas de janela: MESMA decomposição dos
        // colliders (peitoril sólido, montantes entre vãos, parapeito acima)
        const yLo = Math.min(...wins.map((w) => w.y0));
        const yHi = Math.max(...wins.map((w) => w.y1));
        addWall(face, 0, len, yLo, 0);                       // peitoril
        addWall(face, 0, len, h - yHi, yHi);                 // parapeito/verga superior
        const bandH = yHi - yLo;
        let cursor = -len / 2;                                // montantes entre vãos
        for (const w of wins) {
          if (w.u0 - cursor > .05) addWall(face, (cursor + w.u0) / 2, w.u0 - cursor, bandH, yLo);
          cursor = Math.max(cursor, w.u1);
        }
        if (len / 2 - cursor > .05) addWall(face, (cursor + len / 2) / 2, len / 2 - cursor, bandH, yLo);
        for (const w of wins) windowGlass(face, w);
      }
    }
  }

  // ---- escada + mezanino (Fase 24 — visual dos floors pisáveis) ----
  if (spec.stairs) {
    const st = spec.stairs;
    for (let k = 0; k < st.steps; k++) {
      const zA = st.z0 + k * st.run;
      const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(st.x1 - st.x0, st.rise, st.run), m.wallIn);
      stepMesh.position.set((st.x0 + st.x1) / 2, st.rise * (k + .5), zA + st.run / 2);
      stepMesh.castShadow = stepMesh.receiveShadow = true;
      host.add(stepMesh);
    }
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w - T * 2, .25, st.mezzZ1 - st.mezzZ0), m.floor);
    slab.position.set(0, st.height - .125, (st.mezzZ0 + st.mezzZ1) / 2);
    slab.castShadow = slab.receiveShadow = true;
    host.add(slab);
    // colunas de apoio na borda frontal da laje
    for (const px of [-w / 2 + T + .2, w / 2 - T - .2]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(.18, st.height - .25, .18), m.steel);
      col.position.set(px, (st.height - .25) / 2, st.mezzZ0 + .18);
      col.castShadow = true;
      host.add(col);
    }
    // guarda-corpo (borda frontal, exceto a chegada da escada)
    const railLen = (w / 2 - T) - st.x1;
    const railCx = (st.x1 + w / 2 - T) / 2;
    box(host, railLen, .07, .07, m.steel, railCx, st.height + 1.02, st.mezzZ0);
    box(host, railLen, .05, .05, m.steel, railCx, st.height + .55, st.mezzZ0);
    for (let i = 0; i <= 4; i++) {
      const px = st.x1 + (railLen * i) / 4;
      box(host, .06, 1.05, .06, m.steel, px, st.height + .52, st.mezzZ0);
    }
    // berço lateral da escada
    box(host, .22, st.height, st.z1 - st.z0, m.woodDark, st.x1 + .11, st.height / 2, (st.z0 + st.z1) / 2);
  }

  // ---- postes do quiosque ----
  if (pavilion) {
    for (const [px, pz] of [[-w / 2 + .3, -d / 2 + .3], [w / 2 - .3, -d / 2 + .3], [-w / 2 + .3, d / 2 - .3], [w / 2 - .3, d / 2 - .3]]) {
      box(host, .18, h, .18, m.woodDark, px, h / 2, pz);
    }
  }

  // ---- teto ----
  if (pavilion || h < 6) {
    box(host, w + .5, .24, d + .5, m.roof, 0, h + .12, 0);
  } else if (ruin) {
    // laje parcial colapsada
    const slab = box(host, w * .42, .3, d * .38, m.roof, -w * .18, h * .8, -d * .1, .4);
    slab.rotation.z = .1; slab.rotation.x = .08;
  } else {
    // telhado externo (h ≥ 6): replica o "cap" do world3d (que não é mais
    // desenhado p/ cascas) + forro interno fechando o teto visto pela porta
    box(host, w + .34, .5, d + .34, m.roof, 0, h + .25, 0);
    box(host, w - T * 2, .16, d - T * 2, m.roof, 0, h - .1, 0);
  }

  // ---- luminária de teto (pavilion: pendente no telhado) ----
  if (!ruin) {
    const lampY = pavilion ? h - .3 : h - .5;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.15, .08, .3), m.lamp);
    lamp.position.set(0, lampY, 0);
    host.add(lamp);
  }

  // ---- mobília ----
  for (const item of spec.items) {
    const build = FURN[item.type];
    if (!build) continue;
    const g = build(m);
    g.position.set(item.u, .12, item.v);   // piso tem .12 de espessura
    g.rotation.y = item.rot;
    g.scale.setScalar(item.s);
    host.add(g);
  }

  return host;
}
