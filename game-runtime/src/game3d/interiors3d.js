// Khaaos Run — Fase 23: INTERIORES DOS PRÉDIOS (nível Free Fire).
//
// Até a Fase 22 os prédios eram caixas sólidas com fachadas pintadas (portas
// e janelas OPAQUES): olhar "dentro" não revelava nada. A Fase 23 troca a caixa
// sólida dos edifícios elegíveis por uma CASCA OCA real — 4 paredes com buracos
// VERDADEIROS de porta/janela (segmentos de caixa mesclados em 1 geometria por
// face), vidro translúcido nas janelas, piso, forro, mobília procedural por
// tipo (beliches no quartel, racks no galpão, bancadas no hangar, entulho nas
// ruínas) e pendentes emissivos que piscam à noite. Pela porta aberta e pelo
// vidro das janelas o jogador VÊ o interior mobiliado — leitura imediata de
// "prédio de verdade" a nível Free Fire.
//
// Filosofia do repo (mantida bit a bit):
//  - ZERO impacto em gameplay: o collider AABB da estrutura permanece EXATAMENTE
//    o mesmo (a caixa sólida vira casca oca SÓ no render; sim/colisão intocadas);
//  - DETERMINISMO: mesma seed+cenário => mesmo plano de interior (SeededRng);
//  - LÓGICA PURA de plano (buildingInteriors, sem THREE) + builder visual
//    (buildBuildingInteriors) que registra contagens e ANIMATORS em
//    scene.userData.buildingInteriors (mesmo contrato dos worldMarks/dressing);
//  - ZERO assets externos: geometria + materiais 100% procedurais;
//  - QUALIDADE: interiorFactor (quantos prédios ganham interior) e
//    interiorDensity (quantos móveis por prédio) vêm do tier (quality3d).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SeededRng } from '../shared/rng.js';
import {
  concreteMaterial, metalMaterial, plankMaterial,
  crateTexture, barrelMaterial,
} from './textures3d.js';

// ============================================================================
// PARTE 1 — plano puro de interiores (sem THREE, determinístico)
// ============================================================================

const WALL_T = 0.32;        // espessura das paredes da casca
const SILL = 2.6;           // peitoril (alinhado com as bandas da Fase 6)
const WIN_H = 1.3;          // altura da janela (idem fachada)
const ROW_GAP = 2.8;        // passo vertical entre fileiras (idem fachada)
const DOOR_H = 2.5;         // altura da porta
const INSET = 0.72;         // janelas cobrem 72% da face (idem fachada)

// tipos com direito a interior (mesma lista isBuilding de detail3d, menos silo)
const INTERIOR_KINDS = new Set(['barrack', 'hangar', 'warehouse', 'building', 'depot', 'tower', 'ruin', 'pavilion']);
const MIN_H = 3.2;

// prioridade de orçamento no tier baixo (marcos grandes primeiro)
const KIND_PRIORITY = { warehouse: 0, hangar: 1, barrack: 2, building: 3, tower: 4, ruin: 5, depot: 6, pavilion: 7 };

// kits de mobília por tipo (tipo -> lista de receitas; execução determinística)
//   cada receita: { type, along: 'x'|'z', side: -1|1|0, off [mín,máx], n [mín,máx] }
const FURNITURE_KITS = {
  barrack: [
    { type: 'bunk', along: 'z', side: -1, off: [1.4, 2.0], n: [2, 2] },
    { type: 'locker', along: 'z', side: 1, off: [1.2, 1.8], n: [2, 3] },
    { type: 'table', along: 'x', side: 0, off: [0, 1.5], n: [1, 1] },
  ],
  hangar: [
    { type: 'workbench', along: 'x', side: 1, off: [1.4, 2.2], n: [1, 2] },
    { type: 'cratestack', along: 'x', side: -1, off: [1.6, 2.6], n: [2, 3] },
    { type: 'barrels', along: 'z', side: 1, off: [1.8, 2.8], n: [1, 2] },
    { type: 'palletrow', along: 'x', side: 0, off: [2.5, 4.5], n: [1, 1] },
  ],
  warehouse: [
    { type: 'shelf', along: 'z', side: -1, off: [1.6, 2.2], n: [2, 2] },
    { type: 'shelf', along: 'z', side: 1, off: [1.6, 2.2], n: [2, 2] },
    { type: 'cratestack', along: 'x', side: 0, off: [0.5, 2.5], n: [1, 2] },
    { type: 'barrels', along: 'z', side: 1, off: [1.2, 1.8], n: [1, 1] },
  ],
  building: [
    { type: 'table', along: 'z', side: 1, off: [1.4, 2.2], n: [1, 2] },
    { type: 'locker', along: 'x', side: -1, off: [1.4, 2.0], n: [2, 2] },
    { type: 'shelf', along: 'x', side: 1, off: [1.5, 2.0], n: [1, 1] },
  ],
  depot: [
    { type: 'cratestack', along: 'x', side: -1, off: [0.9, 1.5], n: [1, 2] },
    { type: 'barrels', along: 'z', side: 1, off: [0.9, 1.5], n: [1, 1] },
    { type: 'shelf', along: 'z', side: -1, off: [0.9, 1.4], n: [1, 1] },
  ],
  tower: [
    { type: 'bunk', along: 'x', side: -1, off: [0.8, 1.1], n: [1, 1] },
    { type: 'table', along: 'x', side: 1, off: [0.8, 1.1], n: [1, 1] },
  ],
  pavilion: [
    { type: 'table', along: 'x', side: 0, off: [0, 0.6], n: [1, 1] },
    { type: 'palletrow', along: 'x', side: 1, off: [0.8, 1.2], n: [1, 1] },
  ],
  ruin: [
    { type: 'rubble', along: 'x', side: 0, off: [0.5, 2.8], n: [4, 7] },
    { type: 'cratestack', along: 'z', side: -1, off: [1.0, 1.8], n: [0, 1] },
  ],
};

// buckets de material p/ mesclar a mobília em poucos meshes
const FURNITURE_BUCKET = {
  bunk: 'wood', locker: 'metal', table: 'wood', shelf: 'metal',
  cratestack: 'crate', barrels: 'metal', workbench: 'wood',
  palletrow: 'wood', rubble: 'stone',
};

/**
 * Plano determinístico de interiores por prédio.
 * @returns {{ scenarioId, buildings: Array<Object>, counts: Object }}
 *  - building: { index, kind, x, z, w, d, h, yMin, rot, wallT,
 *      door: { face, u, w, h },
 *      faces: [{ face, bays: [{ u, w }], rows: [{ v, h }] }],
 *      furniture: [{ type, x, z, rot, s, bucket }],
 *      lamps: [{ x, z, y, phase }],
 *      rubble: [{ x, z, rot, s }],
 *      roof: 'flat'|'broken' }
 *  Coordenadas de móveis/abajures em espaço LOCAL da estrutura (centro 0,0;
 *  rot 0 => frente em -Z, como em facadeDetails).
 */
export function buildingInteriors(layout, { seed = 'interiors', fraction = 1, density = 1 } = {}) {
  const rng = new SeededRng(`${layout.seed}:${layout.scenarioId}:${seed}`);
  const scenarioId = layout.scenarioId;

  // 1) elegíveis: tipo com interior + altura mínima
  const eligible = [];
  layout.structures.forEach((s, index) => {
    if (INTERIOR_KINDS.has(s.kind) && s.h >= MIN_H) eligible.push({ s, index });
  });
  // 2) ordem estável: prioridade de tipo, depois posição (determinismo total)
  eligible.sort((a, b) =>
    (KIND_PRIORITY[a.s.kind] - KIND_PRIORITY[b.s.kind])
    || (a.s.x - b.s.x) || (a.s.z - b.s.z));

  // 3) fração do tier (low/medium/high) — recorta DEPOIS da ordenação
  const budget = Math.max(1, Math.round(eligible.length * Math.max(0, Math.min(1, fraction))));
  const chosen = eligible.slice(0, budget);

  const buildings = [];
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] ?? 0) + 1; };

  for (const { s, index } of chosen) {
    const frontZ = s.d >= s.w; // mesma regra de porta da Fase 6 (detail3d)
    const doorFace = frontZ ? 'front' : 'right';
    const doorFaceW = frontZ ? s.w : s.d;
    const doorW = Math.min(2.2, doorFaceW * .35);
    const isRuin = s.kind === 'ruin';

    // ---- janelas: baías por face (mesma leitura das bandas da Fase 6) ----
    const rows = s.h >= 4 ? Math.min(3, Math.floor((s.h - 2.4) / ROW_GAP)) : 0;
    const rowList = [];
    for (let r = 0; r < rows; r++) rowList.push({ v: +(SILL + r * ROW_GAP).toFixed(2), h: WIN_H });

    const faceDefs = [
      { face: 'front', span: s.w },
      { face: 'back', span: s.w },
      { face: 'left', span: s.d },
      { face: 'right', span: s.d },
    ].map((f) => {
      const usable = f.span * INSET;
      const bays = [];
      if (rows > 0) {
        const bayW = usable / Math.max(1, Math.round(f.span / 5)); // ~1 baía a cada 5 m
        const w = +Math.max(1.0, bayW - 0.7).toFixed(2);           // pier ~0.7 m entre baías
        const n = Math.max(1, Math.round(usable / (w + 0.7)));
        const step = usable / n;
        for (let i = 0; i < n; i++) {
          const u = +(-usable / 2 + step * (i + .5)).toFixed(2);
          bays.push({ u, w });
        }
      }
      return { face: f.face, span: +f.span.toFixed(2), bays, rows: rowList };
    });

    // ---- mobília (espaço local, corredor da porta livre) ----
    const furniture = [];
    const kit = FURNITURE_KITS[s.kind] ?? [];
    // corredor da porta permanece livre (front = -Z; right = +X, regra da Fase 6)
    const blocked = doorFace === 'front'
      ? (x, z) => (z < -s.d / 2 + 2.6 && Math.abs(x) < doorW / 2 + 1.1)
      : (x, z) => (x > s.w / 2 - 2.6 && Math.abs(z) < doorW / 2 + 1.1);

    for (const recipe of kit) {
      const n = Math.max(0, Math.round((recipe.n[0] + rng.next() * (recipe.n[1] - recipe.n[0])) * density));
      for (let i = 0; i < n; i++) {
        const half = recipe.along === 'x' ? s.w / 2 : s.d / 2;
        const along = (rng.next() * 2 - 1) * Math.max(0.4, half - 2.0);
        const across = recipe.side === 0
          ? (rng.next() * 2 - 1) * Math.max(0.4, (recipe.along === 'x' ? s.d / 2 : s.w / 2) - 2.2)
          : recipe.side * ((recipe.along === 'x' ? s.d / 2 : s.w / 2) - (recipe.off[0] + rng.next() * (recipe.off[1] - recipe.off[0])));
        let x, z;
        if (recipe.along === 'x') { x = along; z = across; }
        else { x = across; z = along; }
        if (blocked(x, z)) continue;
        // dentro da casca
        if (Math.abs(x) > s.w / 2 - WALL_T - 0.6 || Math.abs(z) > s.d / 2 - WALL_T - 0.6) continue;
        const rot = recipe.along === 'x' ? 0 : Math.PI / 2;
        furniture.push({
          type: recipe.type, bucket: FURNITURE_BUCKET[recipe.type] ?? 'wood',
          x: +x.toFixed(2), z: +z.toFixed(2), rot: +(rot + (rng.next() - .5) * .3).toFixed(3),
          s: +(0.92 + rng.next() * 0.16).toFixed(2),
        });
        bump(recipe.type);
      }
    }

    // ---- pendentes emissivos (não em ruína) ----
    const lamps = [];
    if (!isRuin && s.h >= 3.2) {
      const nLamps = s.h >= 6 ? 2 : 1;
      for (let i = 0; i < nLamps; i++) {
        const lx = nLamps === 1 ? 0 : (i === 0 ? -1 : 1) * Math.min(2.5, s.w * .18);
        const lz = nLamps === 1 ? 0 : (i === 0 ? -1 : 1) * Math.min(2.5, s.d * .18);
        lamps.push({ x: +lx.toFixed(2), z: +lz.toFixed(2), y: +(s.h - 1.15).toFixed(2), phase: + (rng.next() * 6.28).toFixed(3) });
      }
      bump('lamp');
    }

    // ---- entulho adicional nas ruínas (já vem do kit; profundidade extra) ----
    const rubble = isRuin
      ? furniture.filter((f) => f.type === 'rubble').map((f) => ({ x: f.x, z: f.z, rot: f.rot, s: f.s }))
      : [];
    const furnitureOnly = furniture.filter((f) => f.type !== 'rubble');

    buildings.push({
      index, kind: s.kind,
      x: s.x, z: s.z, w: s.w, d: s.d, h: s.h, yMin: s.yMin ?? 0, rot: s.rot ?? 0,
      wallT: WALL_T,
      door: { face: doorFace, u: 0, w: +doorW.toFixed(2), h: DOOR_H },
      faces: faceDefs,
      furniture: furnitureOnly,
      lamps,
      rubble,
      roof: isRuin ? 'broken' : 'flat',
      ruin: isRuin,
    });
    bump('building');
  }

  return { scenarioId, buildings, counts };
}

// ============================================================================
// PARTE 2 — builder visual (THREE) + registry + animators
// ============================================================================

// ---------- materiais compartilhados por build ----------
function sharedMaterials() {
  const crateM = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: .85 });
  return {
    plaster: new THREE.MeshStandardMaterial({ color: '#b9b1a2', roughness: .94, side: THREE.DoubleSide }),
    plasterRuin: new THREE.MeshStandardMaterial({ color: '#8f887b', roughness: .96, side: THREE.DoubleSide }),
    floorWood: plankMaterial(2),
    floorConcrete: (() => { const m = concreteMaterial(3); m.color = new THREE.Color('#6a6660'); return m; })(),
    glass: new THREE.MeshStandardMaterial({
      color: '#aecbda', transparent: true, opacity: .3, roughness: .15, metalness: .15,
      side: THREE.DoubleSide, depthWrite: false,
    }),
    trim: new THREE.MeshStandardMaterial({ color: '#3a3630', roughness: .8, metalness: .2 }),
    wood: new THREE.MeshStandardMaterial({ color: '#7a5c38', roughness: .9 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#7d8a94', roughness: .95 }),
    metal: metalMaterial('#6a7076'),
    crate: crateM,
    barrel: barrelMaterial('#5d5148'),
    stone: new THREE.MeshStandardMaterial({ color: '#7d766c', roughness: .95, flatShading: true }),
    lampShade: new THREE.MeshStandardMaterial({ color: '#42464c', roughness: .6, metalness: .5, side: THREE.DoubleSide }),
    lampBulb: new THREE.MeshStandardMaterial({ color: '#ffe9b8', emissive: '#ffd98a', emissiveIntensity: 1.35, roughness: .4 }),
  };
}

// ---------- mescla de geometrias com translate prévio ----------
function mergeTranslated(list) {
  const geos = list.filter(Boolean);
  if (!geos.length) return null;
  if (geos.length === 1) return geos[0];
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged;
}

const box = (w, h, d, x, y, z) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
};
const planeXZ = (w, d, x, y, z, rotY = 0) => {
  const g = new THREE.PlaneGeometry(w, d);
  if (rotY) g.rotateY(rotY);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
};
const planeXY = (w, h, x, y, z, rotY = 0) => {
  const g = new THREE.PlaneGeometry(w, h);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
};

/**
 * Segmentos de UMA face com buracos verdadeiros: retorna as caixas
 * (peitoris/lintel/pilares/peças sob a porta) que preenchem tudo MENOS os
 * buracos de porta + janelas — consumidas pelo merge da parede.
 * Espaço local da face: u ao longo da face (0 no centro), y altura.
 */
function wallSegmentsForFace(bf, doorOnThisFace, door, h) {
  const segs = []; // [u0, u1, y0, y1]
  const half = bf.span / 2;
  const rows = bf.rows;

  // pilares: cantos + entre baías, altura cheia
  const cuts = [-half];
  for (const b of bf.bays) { cuts.push(b.u - b.w / 2, b.u + b.w / 2); }
  cuts.push(half);
  for (let i = 0; i + 1 < cuts.length; i += 2) {
    const u0 = cuts[i], u1 = cuts[i + 1];
    if (u1 - u0 > 0.02) segs.push([u0, u1, 0, h]);
  }

  // faixas horizontais dentro de cada baía
  for (const b of bf.bays) {
    let yPrev = 0;
    for (const r of rows) {
      if (r.v - yPrev > 0.02) segs.push([b.u - b.w / 2, b.u + b.w / 2, yPrev, r.v]); // peitoril
      yPrev = r.v + r.h;
    }
    if (h - yPrev > 0.02) segs.push([b.u - b.w / 2, b.u + b.w / 2, yPrev, h]);       // verga
  }

  // buraco da porta: retira a região da porta do segmento que a contém
  if (doorOnThisFace) {
    const out = [];
    const d0 = door.u - door.w / 2, d1 = door.u + door.w / 2;
    for (const [u0, u1, y0, y1] of segs) {
      const overlap = !(u1 <= d0 || u0 >= d1 || y1 <= 0 || y0 >= door.h);
      if (!overlap) { out.push([u0, u1, y0, y1]); continue; }
      // fatia à esquerda / direita / acima da porta
      if (d0 > u0) out.push([u0, Math.min(u1, d0), y0, y1]);
      if (d1 < u1) out.push([Math.max(u0, d1), u1, y0, y1]);
      const topY = Math.max(y0, door.h);
      if (y1 > topY && Math.max(u0, d0) < Math.min(u1, d1)) out.push([Math.max(u0, d0), Math.min(u1, d1), topY, y1]);
    }
    return out;
  }
  return segs;
}

// monta a geometria da parede de UMA face no espaço LOCAL do prédio
function faceWallGeometry(bf, doorOnThisFace, door, h, wallT) {
  const segs = wallSegmentsForFace(bf, doorOnThisFace, door, h);
  const boxes = [];
  const glass = [];
  const alongX = bf.face === 'front' || bf.face === 'back';
  for (const [u0, u1, y0, y1] of segs) {
    const w = u1 - u0, hh = y1 - y0;
    const cu = (u0 + u1) / 2, cy = (y0 + y1) / 2;
    if (alongX) {
      boxes.push(box(w, hh, wallT, cu, cy, bf.face === 'front' ? -bf.span / 2 + wallT / 2 : bf.span / 2 - wallT / 2));
    } else {
      const x = bf.face === 'left' ? -bf.span / 2 + wallT / 2 : bf.span / 2 - wallT / 2;
      boxes.push(box(wallT, hh, w, x, cy, cu));
    }
  }
  // vidro nas janelas (nunca na porta — ela fica ABERTA p/ ver o interior)
  for (const b of bf.bays) {
    for (const r of bf.rows) {
      const g = new THREE.PlaneGeometry(b.w, r.h);
      const cy = r.v + r.h / 2;
      if (alongX) {
        g.rotateY(bf.face === 'front' ? Math.PI : 0);
        g.translate(b.u, cy, bf.face === 'front' ? -bf.span / 2 + wallT / 2 : bf.span / 2 - wallT / 2);
      } else {
        g.rotateY(bf.face === 'left' ? -Math.PI / 2 : Math.PI / 2);
        g.translate(bf.face === 'left' ? -bf.span / 2 + wallT / 2 : bf.span / 2 - wallT / 2, cy, b.u);
      }
      glass.push(g);
    }
  }
  return { wall: mergeTranslated(boxes), glass: mergeTranslated(glass) };
}

// ---------- builders de mobília (geometrias por bucket, espaço local) ----------
function furnitureGeometries(item) {
  const wood = [], metal = [], crate = [], stone = [], fabric = [];
  const S = item.s;
  switch (item.type) {
    case 'bunk': {
      for (const y of [0.42, 1.24]) {
        wood.push(box(2.0 * S, .1, .92 * S, item.x, y, item.z));
        fabric.push(box(1.9 * S, .12, .82 * S, item.x, y + .11, item.z));
      }
      for (const [dx, dz] of [[-.94, -.4], [.94, -.4], [-.94, .4], [.94, .4]]) {
        wood.push(box(.09, 1.7, .09, item.x + dx * S, .85, item.z + dz * S));
      }
      break;
    }
    case 'locker': {
      metal.push(box(.62 * S, 1.8 * S, .5 * S, item.x, .9 * S, item.z));
      break;
    }
    case 'table': {
      wood.push(box(1.5 * S, .08, .85 * S, item.x, .76, item.z));
      for (const [dx, dz] of [[-.68, -.36], [.68, -.36], [-.68, .36], [.68, .36]]) {
        wood.push(box(.08, .74, .08, item.x + dx * S, .37, item.z + dz * S));
      }
      break;
    }
    case 'shelf': {
      for (const y of [.18, .86, 1.54, 2.2]) {
        metal.push(box(2.3 * S, .07, .62 * S, item.x, y, item.z));
      }
      for (const dz of [-.28, .28]) metal.push(box(.07, 2.25, .07, item.x, 1.12, item.z + dz * S));
      break;
    }
    case 'cratestack': {
      crate.push(box(.92 * S, .92 * S, .92 * S, item.x, .46 * S, item.z));
      crate.push(box(.78 * S, .78 * S, .78 * S, item.x + .12 * S, 1.28 * S, item.z + .1 * S));
      break;
    }
    case 'barrels': {
      metal.push(barrelGeo(item.x - .42 * S, .48 * S, item.z, S));
      metal.push(barrelGeo(item.x + .42 * S, .48 * S, item.z + .1 * S, S));
      break;
    }
    case 'workbench': {
      wood.push(box(1.9 * S, .1, .8 * S, item.x, .88, item.z));
      for (const [dx, dz] of [[-.86, -.32], [.86, -.32], [-.86, .32], [.86, .32]]) {
        wood.push(box(.1, .86, .1, item.x + dx * S, .43, item.z + dz * S));
      }
      metal.push(box(.3 * S, .26 * S, .26 * S, item.x - .6 * S, 1.05, item.z)); // torno
      break;
    }
    case 'palletrow': {
      wood.push(box(1.3 * S, .13, 1.1 * S, item.x, .12, item.z));
      wood.push(box(1.3 * S, .13, 1.1 * S, item.x + .25 * S, .38, item.z + .15 * S));
      break;
    }
    case 'rubble': {
      const g = new THREE.DodecahedronGeometry(.55 * S, 0);
      g.scale(1 + .4 * Math.abs(Math.sin(item.rot * 3.1)), .38 + .3 * Math.abs(Math.sin(item.rot * 1.7)), .8 + .4 * Math.abs(Math.cos(item.rot * 2.3)));
      g.rotateY(item.rot);
      g.translate(item.x, .22 * S, item.z);
      stone.push(g);
      const g2 = new THREE.DodecahedronGeometry(.3 * S, 0);
      g2.translate(item.x + .5 * S, .18 * S, item.z - .4 * S);
      stone.push(g2);
      break;
    }
  }
  return { wood, metal, crate, stone, fabric };
}
function barrelGeo(x, y, z, s) {
  const g = new THREE.CylinderGeometry(.34 * s, .34 * s, .95 * s, 10);
  g.translate(x, y, z);
  return g;
}

// pendente emissivo: haste + cúpula + bulbo
function lampMesh(m, x, z, y, h) {
  const g = new THREE.Group();
  const drop = Math.min(1.15, h - 1.6);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, drop, 6), m.trim);
  rod.position.set(x, y + drop / 2, z);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(.34, .3, 12, 1, true), m.lampShade);
  shade.position.set(x, y, z);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), m.lampBulb);
  bulb.position.set(x, y - .12, z);
  g.add(rod, shade, bulb);
  g.userData.bulb = bulb;
  return g;
}

/**
 * Constrói os interiores na cena. Registrado em scene.userData.buildingInteriors
 * com o MESMO contrato dos worldMarks/dressing: { id, counts, animators, placements }.
 * @param {THREE.Scene} scene
 * @param {object} plan — buildingInteriors(layout, ...)
 * @param {{ contactShadows?: (entries: Array) => void }} hooks
 */
export function buildBuildingInteriors(scene, layout, plan, { contactShadows, exteriorMaterial } = {}) {
  if (scene.userData.buildingInteriors) return scene.userData.buildingInteriors;

  const m = sharedMaterials();
  const group = new THREE.Group();
  group.name = 'building-interiors';
  const animators = [];
  const bulbs = [];

  for (const b of plan.buildings) {
    const host = new THREE.Group();
    host.position.set(b.x, b.yMin, b.z);
    host.rotation.y = b.rot;
    const exterior = exteriorMaterial?.(b.kind) ?? m.plaster; // identidade da fachada preservada

    // ---- paredes com buracos verdadeiros (1 mesh por face) ----
    for (const bf of b.faces) {
      const { wall, glass } = faceWallGeometry(bf, bf.face === b.door.face, b.door, b.h, b.wallT);
      if (wall) {
        const wm = new THREE.Mesh(wall, exterior);
        wm.castShadow = true; wm.receiveShadow = true;
        host.add(wm);
      }
      if (glass && glass.attributes?.position && !b.ruin) {
        const gm = new THREE.Mesh(glass, m.glass);
        gm.renderOrder = 3;
        host.add(gm);
      } else if (glass) {
        glass.dispose();
      }
    }

    // ---- reboco interno (o lado de dentro das paredes lê como interior) ----
    {
      const plaster = b.ruin ? m.plasterRuin : m.plaster;
      const innerGeos = [
        planeXY(b.w - b.wallT * 2, b.h - .1, 0, (b.h - .1) / 2, -b.d / 2 + b.wallT + .02, Math.PI),
        planeXY(b.w - b.wallT * 2, b.h - .1, 0, (b.h - .1) / 2, b.d / 2 - b.wallT - .02, 0),
        planeXY(b.d - b.wallT * 2, b.h - .1, -b.w / 2 + b.wallT + .02, (b.h - .1) / 2, 0, -Math.PI / 2),
        planeXY(b.d - b.wallT * 2, b.h - .1, b.w / 2 - b.wallT - .02, (b.h - .1) / 2, 0, Math.PI / 2),
      ];
      const inner = new THREE.Mesh(mergeTranslated(innerGeos), plaster);
      inner.receiveShadow = true;
      host.add(inner);
    }

    // ---- batente da porta (moldura) ----
    const dHalf = b.door.w / 2;
    const jambGeos = [];
    if (b.door.face === 'front') {
      jambGeos.push(
        box(.14, b.door.h, b.wallT + .08, -dHalf - .07, b.door.h / 2, -b.d / 2 + b.wallT / 2),
        box(.14, b.door.h, b.wallT + .08, dHalf + .07, b.door.h / 2, -b.d / 2 + b.wallT / 2),
        box(b.door.w + .42, .16, b.wallT + .08, 0, b.door.h + .08, -b.d / 2 + b.wallT / 2),
      );
    } else {
      jambGeos.push(
        box(b.wallT + .08, b.door.h, .14, b.w / 2 - b.wallT / 2, b.door.h / 2, -dHalf - .07),
        box(b.wallT + .08, b.door.h, .14, b.w / 2 - b.wallT / 2, b.door.h / 2, dHalf + .07),
        box(b.wallT + .08, .16, b.door.w + .42, b.w / 2 - b.wallT / 2, b.door.h + .08, 0),
      );
    }
    const jamb = new THREE.Mesh(mergeTranslated(jambGeos), m.trim);
    jamb.castShadow = true;
    host.add(jamb);

    // ---- piso + forro ----
    const iw = b.w - b.wallT * 2, id = b.d - b.wallT * 2;
    const floorMat = (b.kind === 'warehouse' || b.kind === 'hangar' || b.kind === 'depot') ? m.floorConcrete : m.floorWood;
    const floor = new THREE.Mesh(planeXZ(iw, id, 0, .025, 0), floorMat);
    floor.receiveShadow = true;
    host.add(floor);
    if (b.roof === 'flat') {
      const ceil = new THREE.Mesh(planeXZ(iw, id, 0, b.h - .32, 0), b.ruin ? m.plasterRuin : m.plaster);
      host.add(ceil);
      // laje do telhado (substitui o "cap" da caixa sólida)
      const roof = new THREE.Mesh(box(b.w + .5, .35, b.d + .5, 0, b.h + .17, 0), exteriorMaterial?.('wall') ?? m.plaster);
      roof.castShadow = true; roof.receiveShadow = true;
      host.add(roof);
    } else {
      // ruína: lajes quebradas tortas
      const rr = new SeededRng(`${b.index}:roof`);
      for (let i = 0; i < 3; i++) {
        const slab = new THREE.Mesh(
          box(b.w * (.3 + rr.next() * .35), .3, b.d * (.25 + rr.next() * .3), 0, 0, 0),
          m.plasterRuin,
        );
        slab.position.set((rr.next() - .5) * b.w * .5, b.h - .2 - rr.next() * .5, (rr.next() - .5) * b.d * .5);
        slab.rotation.set((rr.next() - .5) * .24, rr.next() * Math.PI, (rr.next() - .5) * .24);
        slab.castShadow = slab.receiveShadow = true;
        host.add(slab);
      }
    }

    // ---- mobília mesclada por bucket (≤5 meshes por prédio) ----
    const buckets = { wood: [], metal: [], crate: [], stone: [], fabric: [] };
    for (const item of b.furniture) {
      const geos = furnitureGeometries(item);
      for (const k of Object.keys(buckets)) buckets[k].push(...geos[k]);
    }
    for (const [bucket, list] of Object.entries(buckets)) {
      const merged = mergeTranslated(list);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m[bucket]);
      mesh.castShadow = true; mesh.receiveShadow = true;
      host.add(mesh);
    }

    // ---- pendentes + flicker ----
    for (const lamp of b.lamps) {
      const lm = lampMesh(m, lamp.x, lamp.z, lamp.y, b.h);
      host.add(lm);
      bulbs.push({ mesh: lm.userData.bulb, base: m.lampBulb.emissiveIntensity, phase: lamp.phase });
    }

    group.add(host);
  }

  scene.add(group);

  // ---------- animators (stateless, determinísticos por t) ----------
  if (bulbs.length) {
    animators.push((dt, t) => {
      for (const bb of bulbs) {
        bb.mesh.material.emissiveIntensity = bb.base * (.92 + Math.sin(t * 6.3 + bb.phase) * .05 + Math.sin(t * 2.1 + bb.phase * 3) * .04);
      }
    });
  }

  const registry = {
    id: plan.scenarioId,
    counts: plan.counts,
    animators,
    placements: plan,
    group,
  };
  scene.userData.buildingInteriors = registry;
  return registry;
}
