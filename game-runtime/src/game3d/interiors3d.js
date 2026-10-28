// Khaaos Run — Fase 23: INTERIORES REAIS (shells com porta/mobiliário, nível Free Fire).
//
// Até a Fase 22 os prédios eram caixas sólidas — de fora liam como "blocos
// mortos". A Fase 23 substitui VISUALMENTE as estruturas-habitação (barraco/
// quartel, hangar, galpão, depósito, edifício, ruína, quiosque) por CASCAS
// (paredes com abertura de porta REAL, piso, telhado/laje, luminária) e mobília
// coerente com o distrito e o mundo. Pela porta aberta vê-se um interior vivo:
// beliches e armários no quartel, bancadas e alvos no hangar, estantes e
// paletes no galpão, balcão e banquetas no quiosque, escombros e ferragem na
// ruína — com acento por cenário (aquecedor gélido, rede de mangue, tambor
// d'água do deserto, console astral).
//
// CONTRATO DE GAMEPLAY (inviolável): os colliders AABB do layout NÃO mudam
// bit a bit — a porta é visual (o sim continua tratando a estrutura como
// sólida, exatamente como antes). Zero colisores novos/removidos.
//
// Filosofia do repo (mantida):
//  - LÓGICA PURA (interiorDressing, sem THREE) + builder visual (buildInteriors
//    + buildShellHost) com registro em scene.userData.interiors — MESMO
//    contrato dos worldMarks/districtDressing: { id, counts, animators,
//    placements, shells, group }, idempotente;
//  - DETERMINISMO: mesma seed+cenário => mesmos placements (SeededRng);
//  - ZERO assets externos: geometria + materiais 100% procedurais;
//  - QUALIDADE: densidade da mobília vem do tier (quality3d.interiorFactor);
//    as cascas são sempre construídas (substituem a caixa sólida).
import * as THREE from 'three';
import { SeededRng } from '../shared/rng.js';
import {
  plankMaterial, concreteMaterial, crateTexture, barrelMaterial,
  palletMaterial, sandbagMaterial, signTexture,
} from './textures3d.js';

// ============================================================================
// PARTE 1 — placements puros (sem THREE, determinístico)
// ============================================================================

// tipos de estrutura que viram casca habitável (visual) — as demais continuam caixa
export const SHELL_KINDS = new Set(['barrack', 'hangar', 'warehouse', 'depot', 'building', 'ruin', 'pavilion']);

// mobília por tipo de estrutura (kit do distrito)
const KITS = {
  barrack:  { bunk: 2, locker: 3, weaponsrack: 1, cratestack: 1 },
  hangar:   { workbench: 2, tirestack: 2, toolcart: 1, targetboard: 2, cratestack: 1 },
  warehouse:{ shelfrack: 3, palletstack: 2, barrelrow: 1, cratestack: 1 },
  depot:    { shelfrack: 1, cratestack: 2, barrelrow: 1 },
  building: { table: 2, shelf: 1, planter: 1, counter: 1, stool: 2 },
  ruin:     { rubble: 2, rebar: 2, brokenbench: 1, lanternpost: 1 },
  pavilion: { counter: 1, stool: 2, menuboard: 1, fridge: 1 },
};

// acento POR CENÁRIO: prop extra + cor do tecido do interior
const ACCENTS = {
  CIGKV:     { prop: 'weaponsrack', cloth: '#5d6b4a' },                     // oliva crepuscular
  Barburhen: { prop: 'heater',         cloth: '#4a6373' },                     // frio gélido
  Priadus:   { prop: 'hammock',        cloth: '#3f6b52' },                     // umidade de mangue
  Ckesalth:  { prop: 'waterdrum',      cloth: '#8a6f42' },                     // poeira do deserto
  Arukheea:  { prop: 'astralconsole',  cloth: '#5a648a' },                     // cinza-astral
};

// porta maior em galpões/hangares (leitura de hangar de verdade)
const DOOR_SPEC = {
  barrack:   { w: 2.6, h: 3.0 },
  hangar:    { w: 6.0, h: 4.2 },
  warehouse: { w: 3.2, h: 3.6 },
  depot:     { w: 2.4, h: 2.8 },
  building:  { w: 2.2, h: 2.5 },
  ruin:      { w: 2.6, h: 2.5 },
  pavilion:  { w: 2.0, h: 2.4 },
};

// teto de mobília por área útil (evitaEmpilhar em depósitos pequenos)
const maxItemsFor = (s) => Math.max(2, Math.min(7, Math.floor((s.w * s.d) / 16)));

/**
 * Placements determinísticos dos interiores.
 * @returns {{ scenarioId, structures: Array<{index, kind, door, items}>, counts }}
 *   door: { face: 'front'|'right', w, h, u } — MESMA face da fachada (detail3d:
 *   front = −z local quando d ≥ w, senão right = +x local). u = offset ao longo
 *   da parede. items: coords LOCAIS (u = x, v = z) dentro da pegada.
 */
export function interiorDressing(layout, scenario, { seed = 'interiors', density = 1 } = {}) {
  const rng = new SeededRng(`${layout.seed}:${layout.scenarioId}:${seed}`);
  const accent = ACCENTS[scenario.id] ?? ACCENTS.CIGKV;
  const out = [];
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] ?? 0) + 1; };

  layout.structures.forEach((s, index) => {
    if (!SHELL_KINDS.has(s.kind)) return;
    const frontZ = s.d >= s.w;                      // MESMA regra do facadeDetails
    const face = frontZ ? 'front' : 'right';
    const spec = DOOR_SPEC[s.kind];
    const wallLen = frontZ ? s.w : s.d;             // comprimento da parede da porta
    const dw = Math.min(spec.w, wallLen * .5);
    const du = (rng.next() - .5) * Math.max(0, wallLen - dw - 2.4); // desloca a porta na parede
    const door = { face, w: +dw.toFixed(2), h: spec.h, u: +du.toFixed(2) };

    // limites internos (folga das paredes)
    const limU = s.w / 2 - 1.0, limV = s.d / 2 - 1.0;
    // corredor da porta (nada de mobília bloqueando a leitura da entrada)
    const inCorridor = (u, v, m = 1.35) => {
      if (face === 'front') return v < -(s.d / 2 - 2.3) && Math.abs(u - door.u) < dw / 2 + m;
      return u > (s.w / 2 - 2.3) && Math.abs(v - door.u) < dw / 2 + m;
    };

    const items = [];
    const fits = (u, v) => {
      if (Math.abs(u) > limU || Math.abs(v) > limV) return false;
      if (inCorridor(u, v)) return false;
      return !items.some((p) => Math.hypot(p.u - u, p.v - v) < 1.5);
    };

    const recipe = { ...(KITS[s.kind] ?? {}) };
    recipe[accent.prop] = (recipe[accent.prop] ?? 0) + 1;   // acento do mundo entra sempre
    let budget = Math.max(2, Math.round(maxItemsFor(s) * density));
    for (const [type, count] of Object.entries(recipe)) {
      if (budget <= 0) break;
      const n = Math.max(1, Math.min(budget, Math.round(count * Math.max(density, .5))));
      for (let i = 0; i < n && budget > 0; i++) {
        let placed = false;
        for (let t = 0; t < 14 && !placed; t++) {
          const u = (rng.next() * 2 - 1) * limU;
          const v = (rng.next() * 2 - 1) * limV;
          if (!fits(u, v)) continue;
          items.push({ type, u: +u.toFixed(2), v: +v.toFixed(2), rot: +(rng.next() * Math.PI * 2).toFixed(3), s: +(0.9 + rng.next() * 0.25).toFixed(2) });
          bump(type);
          budget--; placed = true;
        }
        if (!placed) break;
      }
    }
    out.push({ index, kind: s.kind, door, items });
  });

  return { scenarioId: scenario.id, structures: out, counts };
}

// ============================================================================
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
 * shells (Map estrutura→spec), group, mats }.
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
    mats,
    group,
  };
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
      addWall(face, 0, len, h);
    }
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
