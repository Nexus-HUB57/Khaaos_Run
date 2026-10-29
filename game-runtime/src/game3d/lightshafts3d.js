// Khaaos Run — Fase 24: RAIOS DE LUZ pelas janelas (light shafts + poça no piso).
//
// A Fase 23 abriu PORTAS; a Fase 24 abre JANELAS de verdade — e a luz entra:
// cada vão de janela das cascas (interiorsPlan) projeta um RAIO volumétrico
// estilizado (quad aditivo com gradiente) descendo em diagonal até o piso,
// onde uma POÇA de luz ancora a leitura "sol entrando aqui". Interiores
// ganham profundidade e contraste — assinatura visual de Free Fire.
//
// Sol ESTILIZADO por face: a direção de queda é a normal INTERIOR da face
// (luz sempre entra no cômodo) com deriva lateral fixa — determinístico,
// coerente entre faces e barato (2 draw calls por cena: raios + poças).
//
// Filosofia do repo: LÓGICA PURA (shaftPlan, sem THREE) + builder visual com
// registro em scene.userData.lightshafts { id, counts, animators, group },
// idempotente; DETERMINISMO (mesma seed => mesmos quads); ZERO assets externos;
// QUALIDADE: lightFactor do tier (low .4 / medium .8 / high 1) — no mobile só
// as primeiras janelas ganham raio, materiais e animators são compartilhados.
import * as THREE from 'three';
import { lightShaftTexture, lightPoolTexture } from './textures3d.js';
import { localPointToWorld } from './interiorsPlan.js';

// espessura da parede — deve bater com T de interiorsPlan/interiors3d
const T = 0.26;
// piso visual da casca: laje de .12 (top em .12) — poças/raios ancoram nele
const FLOOR_Y = 0.12;
// deriva lateral fixa do "sol" (estilizado): leve e constante em todas as faces
const SUN_LAT_X = 0.34, SUN_LAT_Z = 0.22;

// offset do plano da parede por face (idêntico ao addWall do interiors3d)
const wallPlane = (s, face) => {
  if (face === 'front') return { axis: 'x', off: -s.d / 2 + T / 2 };
  if (face === 'back') return { axis: 'x', off: s.d / 2 - T / 2 };
  if (face === 'right') return { axis: 'z', off: s.w / 2 - T / 2 };
  return { axis: 'z', off: -s.w / 2 + T / 2 }; // left
};

// normal INTERIOR por face (para onde a luz viaja após cruzar o vão)
const inward = (face) => {
  if (face === 'front') return [0, 0.78];
  if (face === 'back') return [0, -0.78];
  if (face === 'right') return [-0.78, 0];
  return [0.78, 0]; // left
};

/**
 * Plano PURO dos raios: para cada janela, os 4 cantos do quad (raio) e o
 * centro/raio da poça. Determinístico; sem THREE.
 * @returns {{ shafts: Array<{ corners, tint }>, pools: Array<{ cx, cz, w, d }> }}
 */
export function shaftPlan(layout, dressing, { density = 1 } = {}) {
  const shafts = [];
  const pools = [];
  for (const spec of dressing.structures) {
    const wins = spec.windows ?? [];
    if (!wins.length) continue;
    const s = layout.structures[spec.index];
    wins.forEach((w, wi) => {
      // Fase 24 — gate de qualidade determinístico: mantém as primeiras
      // `ceil(total × density)` janelas da estrutura (density ≤ 1)
      if (wi >= Math.ceil(wins.length * Math.max(0, Math.min(1, density)))) return;
      const plane = wallPlane(s, w.face);
      const [nx, nz] = inward(w.face);
      const yTop = w.y1, yBot = FLOOR_Y;
      const drop = yTop - yBot;
      const corner = (u) => {
        const lx = plane.axis === 'x' ? u : plane.off;
        const lz = plane.axis === 'x' ? plane.off : u;
        const p = localPointToWorld(s, lx, lz);
        return { x: p.x, y: yTop, z: p.z };
      };
      const a = corner(w.u0), b = corner(w.u1);
      // raio: topo = boca da janela; base = topo deslocado pela "gravidade da luz"
      const dx = nx + SUN_LAT_X, dz = nz + SUN_LAT_Z;
      const shift = (p) => ({ x: p.x + dx * drop, y: yBot, z: p.z + dz * drop });
      const a2 = shift(a), b2 = shift(b);
      shafts.push({ corners: [a, b, b2, a2] });
      // poça: disco no piso centrado no meio da base, tamanho ∝ ao vão
      const cx = (a2.x + b2.x) / 2, cz = (a2.z + b2.z) / 2;
      pools.push({ cx, cz, w: (w.u1 - w.u0) * 1.9, d: drop * 1.15 + (w.u1 - w.u0) * .7 });
    });
  }
  return { shafts, pools };
}

/**
 * Builder visual: merged geometry (1 draw call p/ raios, 1 p/ poças),
 * materiais compartilhados, animator de respiração suave.
 * Registry em scene.userData.lightshafts — MESMO contrato dos worldMarks.
 */
export function buildLightShafts(scene, layout, scenario, interiors, q = {}) {
  if (scene.userData.lightshafts) return scene.userData.lightshafts;

  const density = q.lightFactor ?? 1;
  const plan = shaftPlan(layout, interiors.placements, { density });
  const group = new THREE.Group();
  group.name = 'lightshafts';

  // ---- raios (aditivo, DoubleSide, sem depthWrite) ----
  const shaftMat = new THREE.MeshBasicMaterial({
    map: lightShaftTexture(), transparent: true, opacity: .85,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    toneMapped: false,
  });
  const pos = [], uv = [], idx = [];
  plan.shafts.forEach((sh, i) => {
    const [a, b, b2, a2] = sh.corners;
    const o = i * 4;
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, b2.x, b2.y, b2.z, a2.x, a2.y, a2.z);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  if (plan.shafts.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, shaftMat);
    mesh.renderOrder = 12;       // depois do vidro/opacos, antes do postfx
    mesh.frustumCulled = true;
    group.add(mesh);
  }

  // ---- poças de luz no piso (planos deitados, aditivos) ----
  const poolMat = new THREE.MeshBasicMaterial({
    map: lightPoolTexture(), transparent: true, opacity: .75,
    blending: THREE.AdditiveBlending, depthWrite: false,
    toneMapped: false,
  });
  const ppos = [], puv = [], pidx = [];
  plan.pools.forEach((p, i) => {
    const o = i * 4;
    ppos.push(p.cx - p.w / 2, FLOOR_Y + .06, p.cz - p.d / 2, p.cx + p.w / 2, FLOOR_Y + .06, p.cz - p.d / 2, p.cx + p.w / 2, FLOOR_Y + .06, p.cz + p.d / 2, p.cx - p.w / 2, FLOOR_Y + .06, p.cz + p.d / 2);
    puv.push(0, 0, 1, 0, 1, 1, 0, 1);
    pidx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  if (plan.pools.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ppos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(puv, 2));
    g.setIndex(pidx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, poolMat);
    mesh.renderOrder = 11;
    mesh.frustumCulled = true;
    group.add(mesh);
  }

  scene.add(group);

  // ---- animator: respiração da luz (2 harmônicos, stateless) ----
  const animators = [];
  animators.push((dt, t) => {
    const k = .9 + Math.sin(t * .8) * .06 + Math.sin(t * 2.1 + 1.3) * .04;
    shaftMat.opacity = .85 * k;
    poolMat.opacity = .75 * k;
  });

  const registry = {
    id: scenario.id,
    counts: { shafts: plan.shafts.length, pools: plan.pools.length },
    animators,
    group,
  };
  scene.userData.lightshafts = registry;
  return registry;
}
