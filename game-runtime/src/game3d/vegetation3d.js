// Khaaos Run — Fase 31 — VEGETAÇÃO DE PRODUÇÃO (árvores, arbustos, grama).
//
// Diretiva: "árvores realistas e arbustos, gramas — todas as modelagens 3D
// nível Devs PhD". Este módulo substitui a vegetação genérica da Fase 4
// (tronco-cilindro + 3 icosaedros) por modelagem PROCEDURAL REAL:
//   • ÁRVORES POR ARQUÉTIPO DE MUNDO — tronco afilado com raízes em cone,
//     galhos primários (com sub-galhos) e dossel em blobs deformados por
//     ruído determinístico. 5 arquétipos = identidade W1-W4:
//       temperate (CIGKV) · pine (Barburhen) · jungle (Priadus)
//       dry/acácia (Ckesalth) · astral (Arukheea);
//   • MERGE REAL DE GEOMETRIA — tronco+raízes+galhos viram UMA BufferGeometry
//     e o dossel outra: 2 draw calls instanciadas para a floresta inteira;
//   • VENTO POR SHADER — sway no vertex shader (onBeforeCompile) com fase por
//     instância e peso pela altura do vértice: copas/tufos balançam sem custo
//     de CPU e sem tocar a simulação;
//   • ARBUSTOS EM CLUSTER — 5 blobs achatados fundidos (não mais 1 esfera);
//   • GRAMA EM TUFOS — 3 lâminas cruzadas curvadas (não mais 1 plano) com
//     sway e plantio em clumps (moitas naturais).
//
// Contrato headless (mesmo das demais fábricas 3D): só THREE, PRNG semeado,
// zero document/canvas, geometrias inspecionáveis em Node. O sway usa
// onBeforeCompile (string de shader) — inerte sem renderer.
import * as THREE from 'three';

// ---------------------------------------------------------------- utils ----
// PRNG mulberry32 — determinístico, independente do SeededRng do runtime
// (módulo auto-contido, mesmo contrato do gear3d.seededRng).
export function vegRng(seed = 1) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// hash estável [0,1) a partir de 2 inteiros — deformação de vértices sem rng
// por chamada (determinismo byte a byte nas geometrias).
function hash2(i, j = 0) {
  let h = (Math.imul(i + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(j + 0x165667b1, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f) >>> 0; h ^= h >>> 16;
  return h / 4294967296;
}

// Funde N BufferGeometry (todas com position/normal/uv) em UMA nova. Converte
// para non-indexed antes (triângulos soltos) — merge sem bookkeeping de índice.
export function mergeGeoms(geoms) {
  let vCount = 0;
  const parts = geoms.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    vCount += ng.attributes.position.count;
    return ng;
  });
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  let vo = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

// Aplica matriz rígida (posição/rotação/escala) a uma geometria — posição E
// normal (escala uniforme mantém normals válidas sem matriz inversa).
function xform(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, sy = null, sz = null } = {}) {
  const m = new THREE.Matrix4()
    .makeRotationFromEuler(new THREE.Euler(rx, ry, rz))
    .scale(new THREE.Vector3(s, sy ?? s, sz ?? s));
  geo.applyMatrix4(m);
  geo.translate(x, y, z);
  return geo;
}

// Deformação orgânica: empurra cada vértice ao longo da própria normal com
// ruído hash (amplitude proporcional ao raio). Silhueta de copa "quebrada",
// imita clusters de folhagem. flatShading ignora normals antigas.
function deformOrganic(geo, { amp = .22, seed = 0, minY = null, yFade = 1 } = {}) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const vy = p.getY(i);
    if (minY != null && vy < minY) continue;
    const fade = yFade === 1 ? 1 : THREE.MathUtils.clamp(vy * yFade, .15, 1);
    const d = (hash2(i, seed) - .5) * 2 * amp * fade;
    p.setXYZ(i,
      p.getX(i) + n.getX(i) * d,
      vy + n.getY(i) * d * .6,
      p.getZ(i) + n.getZ(i) * d);
  }
  p.needsUpdate = true;
  geo.computeBoundingSphere();
  return geo;
}

// ------------------------------------------------------- arquétipos ----
// Cada arquétipo descreve: altura do tronco, raio base/topo, número de
// galhos primários, blob do dossel (raio, achatamento, contagem, espalhamento
// vertical) e característica de silhueta.
export const TREE_ARCHETYPES = Object.freeze({
  // CIGKV — temperada crepuscular: copa oval densa em 2 andares
  temperate: Object.freeze({ trunkH: 3.4, rBase: .3, rTop: .13, branches: 3, blobs: 5, blobR: 1.55, squash: .82, spreadY: [2.7, 4.6], lean: .07, droop: 0 }),
  // Barburhen — pinheiro frio: porte alto, dossel cônico em camadas caídas
  pine: Object.freeze({ trunkH: 4.6, rBase: .26, rTop: .07, branches: 4, blobs: 6, blobR: 1.25, squash: .62, spreadY: [2.0, 4.9], lean: .04, droop: .55 }),
  // Priadus — selva: tronco robusto, dossel alto e largo com raízes aéreas
  jungle: Object.freeze({ trunkH: 4.4, rBase: .38, rTop: .16, branches: 4, blobs: 6, blobR: 1.9, squash: .74, spreadY: [3.2, 5.6], lean: .09, droop: .2 }),
  // Ckesalth — acácia seca: tronco retorcido baixo, copa achatada e larga
  dry: Object.freeze({ trunkH: 2.3, rBase: .3, rTop: .14, branches: 3, blobs: 4, blobR: 1.5, squash: .42, spreadY: [1.9, 2.8], lean: .14, droop: 0, wide: 1.5 }),
  // Arukheea — astral: esguia e alta, dossel estreito flutuando no topo
  astral: Object.freeze({ trunkH: 5.0, rBase: .22, rTop: .08, branches: 3, blobs: 4, blobR: 1.2, squash: .9, spreadY: [3.6, 5.8], lean: .05, droop: 0, wide: .85 }),
});

export function treeArchetypeFor(scenarioId = 'CIGKV') {
  return {
    CIGKV: 'temperate', Barburhen: 'pine', Priadus: 'jungle',
    Ckesalth: 'dry', Arukheea: 'astral',
  }[scenarioId] ?? 'temperate';
}

// Geometrias da árvore (PURO, determinístico por seed):
//   trunk  — tronco afilado + 4 raízes em cone + galhos primários (com cotões)
//   canopy — blobs deformados nas pontas dos galhos + andar superior
//   height — altura aproximada (para sombras de contato e LOD)
export function buildTreeGeometries({ archetype = 'temperate', seed = 1 } = {}) {
  const A = TREE_ARCHETYPES[archetype] ?? TREE_ARCHETYPES.temperate;
  const rng = vegRng(seed);
  const barkParts = [];

  // tronco afilado (12 segmentos de altura p/ leve curva do lean)
  const SEG = 4;
  let px = 0, pz = 0;
  for (let i = 0; i < SEG; i++) {
    const t0 = i / SEG, t1 = (i + 1) / SEG;
    const h = (A.trunkH / SEG) * 1.06;             // overlap evita fresta
    const r0 = THREE.MathUtils.lerp(A.rBase, A.rTop, t0);
    const r1 = THREE.MathUtils.lerp(A.rBase, A.rTop, t1);
    const seg = new THREE.CylinderGeometry(r1, r0, h, 7);
    const drift = A.lean * t0;
    xform(seg, { x: px + drift * .6, y: A.trunkH * t0 + h / 2, z: pz, rz: -drift * .35 });
    px += drift * .6; pz += drift * .22;
    barkParts.push(seg);
  }
  // raízes em cone sapando a base (4 direções com jitter determinístico)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rng() * .8;
    const len = .55 + rng() * .35;
    const root = new THREE.ConeGeometry(A.rBase * .55, len, 5);
    xform(root, {
      x: Math.cos(a) * len * .45, y: len * .22, z: Math.sin(a) * len * .45,
      rz: Math.cos(a) * 1.25, rx: -Math.sin(a) * 1.25,
    });
    barkParts.push(root);
  }
  // galhos primários saindo a 55-70% da altura + sub-galho (cotão)
  const canopyParts = [];
  const bY0 = A.trunkH * .55;
  for (let b = 0; b < A.branches; b++) {
    const a = (b / A.branches) * Math.PI * 2 + rng() * 1.2;
    const t = .55 + rng() * .3;
    const bLen = A.blobR * (.8 + rng() * .5);
    const bY = bY0 + rng() * (A.trunkH * .35);
    const tilt = A.droop > 0 ? 1.15 + A.droop : .95 + rng() * .3;   // pinheiro deixa cair
    const branch = new THREE.CylinderGeometry(.05, .09, bLen, 5);
    xform(branch, {
      x: Math.cos(a) * bLen * .5, y: bY - bLen * Math.cos(tilt) * .32, z: Math.sin(a) * bLen * .5,
      rz: Math.cos(a) * tilt, rx: -Math.sin(a) * tilt,
    });
    barkParts.push(branch);
    // blob da ponta do galho (dossel inferior)
    const tip = new THREE.IcosahedronGeometry(A.blobR * .62, 1);
    deformOrganic(tip, { amp: .2, seed: seed + b * 7 });
    xform(tip, {
      x: Math.cos(a) * bLen * .92, y: bY - bLen * Math.cos(tilt) * .52 + .12, z: Math.sin(a) * bLen * .92,
      s: 1, sy: A.squash, sz: 1,
    });
    canopyParts.push(tip);
  }
  // dossel principal: blobs sobrepostos subindo em espiral até o topo
  const wide = A.wide ?? 1;
  for (let k = 0; k < A.blobs; k++) {
    const t = k / Math.max(1, A.blobs - 1);
    const y = THREE.MathUtils.lerp(A.spreadY[0], A.spreadY[1], t);
    const shrink = .62 + .38 * Math.sin(Math.PI * Math.min(1, t * .85 + .12));
    const blob = new THREE.IcosahedronGeometry(A.blobR * shrink, 1);
    deformOrganic(blob, { amp: .26, seed: seed + 31 + k * 13 });
    xform(blob, {
      x: (rng() - .5) * 1.1 * wide, y, z: (rng() - .5) * 1.1 * wide,
      s: wide, sy: A.squash, sz: wide,
    });
    canopyParts.push(blob);
  }
  const trunk = mergeGeoms(barkParts);
  const canopy = mergeGeoms(canopyParts);
  return { trunk, canopy, height: A.trunkH + A.blobR * A.squash };
}

// ---------------------------------------------------------- arbusto ----
// Cluster de 5 blobs achatados fundidos (massa orgânica com "bolsões"),
// raio total ~.95 — substitui a esfera única da Fase 4.
export function buildBushGeometry({ seed = 1 } = {}) {
  const rng = vegRng(seed);
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng() * 1.1;
    const r = i === 0 ? 0 : .32 + rng() * .3;
    const rad = .42 + rng() * .26;
    const blob = new THREE.IcosahedronGeometry(rad, 1);
    deformOrganic(blob, { amp: .12, seed: seed + i * 5 });
    xform(blob, {
      x: Math.cos(a) * r, y: .3 + rng() * .14, z: Math.sin(a) * r,
      sy: .55 + rng() * .2, sz: .85 + rng() * .3,
    });
    parts.push(blob);
  }
  return mergeGeoms(parts);
}

// ---------------------------------------------------- tufo de grama ----
// 3 lâminas cruzadas (60°) com curvatura nas pontas — lê como moita de
// perto e como massa de longe; UV preserva a textura de lâmina (alphaTest).
export function grassTuftGeometry({ seed = 1 } = {}) {
  const rng = vegRng(seed);
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(.5 + rng() * .22, .68 + rng() * .3, 1, 3);
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const vy = p.getY(v);                          // -h/2..h/2 → 0..1
      const t = (vy / .9 + .5);
      p.setX(v, p.getX(v) + (hash2(v, seed + i) - .5) * .06 + t * t * .12); // curva
      p.setY(v, vy * (.8 + hash2(v + 97, seed + i) * .4));
    }
    xform(g, { rz: (rng() - .5) * .1, ry: (i / 3) * Math.PI + rng() * .5, y: .38 });
    parts.push(g);
  }
  return mergeGeoms(parts);
}

// ------------------------------------------------------ vento/shader ----
// Injeta sway senoidal no vertex shader. Peso = altura do vértice (topo
// balança, base firme); fase por instância via coluna de translação da
// instanceMatrix — cada árvore/tufo oscila fora de fase (sem efeito "metrônomo").
export function patchSway(material, { strength = .05, freq = 1.5, yScale = .22 } = {}) {
  const st = Math.max(0, strength), fr = Math.max(.1, freq), ys = Math.max(.01, yScale);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSwayTime = { value: 0 };
    shader.uniforms.uSwayStrength = { value: st };
    shader.uniforms.uSwayFreq = { value: fr };
    shader.uniforms.uSwayYScale = { value: ys };
    shader.vertexShader = [
      'uniform float uSwayTime; uniform float uSwayStrength;',
      'uniform float uSwayFreq; uniform float uSwayYScale;',
      shader.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'float swayW = clamp(transformed.y * uSwayYScale, 0.0, 1.0);',
        'float swayPh = 0.0;',
        '#ifdef USE_INSTANCING',
        '  swayPh = instanceMatrix[3].x * 0.53 + instanceMatrix[3].z * 0.71;',
        '#endif',
        'transformed.x += sin(uSwayTime * uSwayFreq + swayPh) * uSwayStrength * swayW;',
        'transformed.z += cos(uSwayTime * uSwayFreq * 0.83 + swayPh * 1.17) * uSwayStrength * swayW * 0.72;',
      ].join('\n')),
    ].join('\n');
    material.userData.swayShader = shader;
  };
  material.customProgramCacheKey = () => `sway:${st}:${fr}:${ys}`;
  return material;
}

// Tick do vento — main3d chama 1×/frame com o relógio global. Inerte quando
// os shaders ainda não compilaram (headless/primeiro frame) e quando a cena
// não registra materiais de sway.
export function tickVegetationWind(scene, t) {
  const mats = scene?.userData?.swayMats;
  if (!mats) return;
  for (const m of mats) {
    const u = m?.userData?.swayShader?.uniforms;
    if (u?.uSwayTime) u.uSwayTime.value = t;
  }
}

// ------------------------------------------------------ campos prontos ----
// Fábrica de campo de árvores: recebe spots {x,z,s,rot,tilt} já validados
// pelo chamador (colliders/distritos) e devolve o PAR InstancedMesh
// (tronco+raízes+galhos | dossel) com tint por instância e vento ativo.
export function buildTreeField({ archetype = 'temperate', seed = 1, spots = [], swayStrength = .045 } = {}) {
  const { trunk, canopy } = buildTreeGeometries({ archetype, seed });
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .95, metalness: .02 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .88, metalness: 0, flatShading: true });
  patchSway(canopyMat, { strength: swayStrength, freq: 1.45, yScale: .2 });
  const trunks = new THREE.InstancedMesh(trunk, trunkMat, Math.max(1, spots.length));
  const canopies = new THREE.InstancedMesh(canopy, canopyMat, Math.max(1, spots.length));
  trunks.castShadow = trunks.receiveShadow = true;
  canopies.castShadow = canopies.receiveShadow = true;
  const dummy = new THREE.Object3D();
  spots.forEach((sp, i) => {
    dummy.position.set(sp.x, 0, sp.z);
    dummy.rotation.set((sp.tiltX ?? 0), sp.rot ?? 0, sp.tilt ?? 0);
    dummy.scale.setScalar(sp.s ?? 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    canopies.setMatrixAt(i, dummy.matrix);
    if (sp.trunkTint) trunks.setColorAt(i, new THREE.Color(sp.trunkTint));
    if (sp.tint) canopies.setColorAt(i, new THREE.Color(sp.tint));
  });
  trunks.count = canopies.count = spots.length;
  if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  trunks.computeBoundingSphere?.(); canopies.computeBoundingSphere?.();
  return { trunks, canopies };
}

// Campo de arbustos (1 InstancedMesh, tint por instância).
export function buildBushField({ seed = 1, spots = [], swayStrength = .06 } = {}) {
  const geo = buildBushGeometry({ seed });
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .92, metalness: 0, flatShading: true });
  patchSway(mat, { strength: swayStrength, freq: 1.8, yScale: .8 });
  const bushes = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  bushes.castShadow = bushes.receiveShadow = true;
  const dummy = new THREE.Object3D();
  spots.forEach((sp, i) => {
    dummy.position.set(sp.x, 0, sp.z);
    dummy.rotation.set(0, sp.rot ?? 0, 0);
    dummy.scale.set(sp.sx ?? sp.s ?? 1, sp.s ?? 1, sp.sz ?? sp.s ?? 1);
    dummy.updateMatrix();
    bushes.setMatrixAt(i, dummy.matrix);
    if (sp.tint) bushes.setColorAt(i, new THREE.Color(sp.tint));
  });
  bushes.count = spots.length;
  if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
  bushes.computeBoundingSphere?.();
  return bushes;
}
