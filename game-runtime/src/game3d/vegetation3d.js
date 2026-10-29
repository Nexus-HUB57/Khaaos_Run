// Khaaos Run — Fase 31/32 — VEGETAÇÃO DE PRODUÇÃO + GRAMA COM LOD (árvores, arbustos, grama).
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

// ------------------------------------------- grama com LOD de distância ----
// Fase 32 — a grama é o ativo mais CARO do cenário (milhares de tufos com
// alpha-test e overdraw) e não precisa de detalhe longe. O campo é dividido
// em CHUNKS (células da grade) e cada chunk assume 1 de 4 tiers pela
// distância da CÂMERA ao centro do chunk:
//   full     (< nearDist)     — todos os tufos do chunk;
//   sparse   (< midDist)      — fração sparseKeep dos tufos (ceil), ordem de
//                               plantio estável — o "desbaste" não tremula ao andar;
//   impostor (< impostorDist) — Fase 34 — 1 só QUAD cruzado por chunk (no
//                               campo global de impostores): lê como mancha
//                               de capim no horizonte por ~2 triângulos;
//   hidden   (>= impostorDist)— chunk invisível (custo de render 0).
// Custo por frame: 1 hipotenusa por chunk (dezenas) + troca de visible/count
// (tufos) + empacotamento de matrizes só da FAIXA de impostores visível
// (poucas células). Sem reescrita de matrizes dos tufos, sem duplicação de
// geometria; chunks ocultos não geram draw call.

// Divide spots em células da grade (PURO e determinístico — ordenado por
// chave da célula). Cada chunk carrega o CENTRO médio dos membros, usado no
// teste de distância do LOD.
export function grassChunkify(spots, { chunkSize = 25 } = {}) {
  const cs = Math.max(4, chunkSize);
  const map = new Map();
  spots.forEach((sp, i) => {
    const kx = Math.floor(sp.x / cs), kz = Math.floor(sp.z / cs);
    const key = `${kx}:${kz}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(i);
  });
  const chunks = [];
  for (const [key, indices] of map) {
    const [kx, kz] = key.split(':').map(Number);
    let sx = 0, sz = 0;
    for (const i of indices) { sx += spots[i].x; sz += spots[i].z; }
    chunks.push({ kx, kz, x: sx / indices.length, z: sz / indices.length, indices });
  }
  chunks.sort((a, b) => (a.kx - b.kx) || (a.kz - b.kz));
  return chunks;
}

// Tier do chunk pela distância (PURO): 'full' | 'sparse' | 'impostor' | 'hidden'.
// Fase 34 — impostorDist <= midDist desliga a faixa (comportamento F32: hidden
// já em midDist) — retrocompatível com chamadas antigas.
export function grassChunkTier(dist, { nearDist = 28, midDist = 58, impostorDist = 110 } = {}) {
  if (dist < nearDist) return 'full';
  if (dist < midDist) return 'sparse';
  if (impostorDist > midDist && dist < impostorDist) return 'impostor';
  return 'hidden';
}

// Fase 34 — geometria do impostor: 2 quads cruzados (X) que leem como moita
// ao longe — silhueta dupla evita o "flipse" de plano único com a câmera.
// Sem textura (cor chapada por instância), sem alpha-test — custo mínimo.
export function grassImpostorGeometry({ height = 1.15, width = 3.2 } = {}) {
  const h = Math.max(.3, height), w = Math.max(.5, width);
  const a = new THREE.PlaneGeometry(w, h);
  a.translate(0, h / 2, 0);
  const b = new THREE.PlaneGeometry(w, h);
  b.translate(0, h / 2, 0);
  xform(b, { ry: Math.PI / 2 });
  return mergeGeoms([a, b]);
}

// Fase 37 — FADE SUAVE na entrada/saída da banda de impostores (PURO).
// A F34 acendia o impostor em degrau (alpha fixo .55 na entrada em midDist e
// corte seco na saída em impostorDist). Aqui a opacidade POR INSTÂNCIA faz a
// transição: rampa smoothstep subindo em [midDist, midDist+zone] e descendo
// em [impostorDist-zone, impostorDist] — a mancha "nasce" do desbaste e
// "morre" dissolvendo no bake outdoor (F36), sem pop visível em nenhum bordo.
//   zone = min(fadeZone, (impostorDist - midDist) / 2) — as duas rampas nunca
//   se sobrepõem (sempre existe plateau no meio da banda).
// Banda desligada (impostorDist <= midDist, retrocompat F32): 0 em qualquer
// distância — nenhum impostor nasce.
export function grassImpostorFade(dist, { midDist = 58, impostorDist = 110, fadeZone = 14 } = {}) {
  if (!(impostorDist > midDist)) return 0;                    // banda desligada
  const zone = Math.max(.5, Math.min(fadeZone, (impostorDist - midDist) / 2));
  if (!(dist >= midDist) || !(dist <= impostorDist)) return 0; // fora da banda
  const fadeIn = smoothStep(midDist, midDist + zone, dist);
  const fadeOut = 1 - smoothStep(impostorDist - zone, impostorDist, dist);
  return fadeIn * fadeOut;                                    // 0..1
}

// Fase 37 — ALPHA POR INSTÂNCIA via onBeforeCompile (mesmo contrato do
// patchSway: string de shader, INERTE sem renderer — headless nunca compila).
// A InstancedMesh ganha um InstancedBufferAttribute 'instanceAlpha' (itemSize
// 1) e o material multiplica diffuseColor.a por ele no fragmento — transição
// de opacidade por chunk SEM duplicar materiais nem recompilar por instância.
export function patchInstanceAlpha(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', ['#include <common>', 'attribute float instanceAlpha;', 'varying float vInstAlpha;'].join('\n'))
      .replace('#include <begin_vertex>', ['#include <begin_vertex>', 'vInstAlpha = instanceAlpha;'].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', ['#include <common>', 'varying float vInstAlpha;'].join('\n'))
      .replace('#include <color_fragment>', ['#include <color_fragment>', 'diffuseColor.a *= vInstAlpha;'].join('\n'));
    material.userData.instanceAlphaShader = shader;
  };
  material.customProgramCacheKey = () => 'inst-alpha';
  return material;
}

// Fase 37 — SOMBRAS DE CONTATO FALSAS sob os impostores: disco RADIAL com
// gradiente de alpha por VÉRTICE (centro escuro → borda transparente, itemSize
// 4 — three r125+ detecta RGBA). Nada de textura/canvas (contrato headless):
// o gradiente vive na geometria, o material só multiplica. Deitada no chão
// (rotação -90° em X), a instância ancora no MESMO relevo dos tufos (ch.y —
// média das alturas de plantio) com lift fino anti-z-fight.
export function grassShadowGeometry({ segments = 14 } = {}) {
  const seg = Math.max(6, segments | 0);
  const geo = new THREE.CircleGeometry(1, seg);
  xform(geo, { rx: -Math.PI / 2 });               // deita no plano XZ
  const pos = geo.attributes.position;
  const n = pos.count;
  const colors = new Float32Array(n * 4);          // RGBA por vértice
  for (let i = 0; i < n; i++) {
    // centro (0,0) → alpha cheio; borda r=1 → alpha 0 (smoothstep sem banda)
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    const a = 1 - smoothStep(0, 1, r);
    colors[i * 4] = 0; colors[i * 4 + 1] = 0; colors[i * 4 + 2] = 0;
    colors[i * 4 + 3] = a;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  return geo;
}

// ---------------------------------- F36 — OUTDOOR IMPOSTOR (tier hidden) ----
// Evolução do tier `hidden` (≥ impostorDist): o chunk continua INVISÍVEL
// (custo de render 0 — contrato F32/F34 intocado), mas a identidade do capim
// é COZIDA nas vertex colors do terreno UMA vez no build. O horizonte lê
// "campo" pela cor do próprio chão: 0 draw calls extras, 0 matrizes por
// frame, 0 update no loop — o impostor outdoor é literalmente grátis.
// `grassOutdoorBake` é PURA: 1 contribuição por chunk (centro + família de
// tint pelo MESMO módulo POSITIVO dos impostores — kx/kz negativos seguros).
export function grassOutdoorBake(chunks = [], tintFamilies = ['#5a6b33']) {
  const cols = tintFamilies.map((c) => new THREE.Color(c));
  return chunks.map((ch) => {
    const c = cols[((ch.kx + ch.kz) % cols.length + cols.length) % cols.length];
    return { x: ch.x, z: ch.z, r: c.r, g: c.g, b: c.b };
  });
}

// Aplica o bake nas vertex colors do terreno (MUTA o atributo color uma vez):
// cada contribuição pinta um disco suave de raio `radius` — plateau no centro
// e queda smoothstep na borda (sem "bola" e sem banda). Fora do raio: byte a
// byte intacto. Custo ONE-SHOT no build (O(verts do disco) por chunk); sem
// terreno (headless sem buildScene) é no-op seguro.
export function applyOutdoorTint(terrainMesh, bake = [], { radius = 25, strength = .3 } = {}) {
  const geo = terrainMesh?.geometry;
  const color = geo?.attributes?.color;
  if (!geo || !color) return null;
  const R = Math.max(1, radius);
  const st = Math.max(0, Math.min(1, strength));
  const pos = geo.attributes.position;
  let touched = 0;
  for (const b of bake) {
    // janela grosseira por chunk antes do teste radial (evita varrer 9k verts
    // por contribuição — o disco cabe numa bbox de lado 2R)
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vz = pos.getZ(i);
      const dx = vx - b.x, dz = vz - b.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2);
      // kernel: 1 no núcleo (d < R/3), smoothstep até 0 na borda
      const k = d < R / 3 ? 1 : 1 - smoothStep(R / 3, R, d);
      const a = st * k;
      if (a <= 0) continue;
      color.setXYZ(i,
        color.getX(i) + (b.r - color.getX(i)) * a,
        color.getY(i) + (b.g - color.getY(i)) * a,
        color.getZ(i) + (b.b - color.getZ(i)) * a);
      touched++;
    }
  }
  color.needsUpdate = true;
  return { touched, radius: R, strength: st };
}

function smoothStep(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Campo de grama com LOD: 1 InstancedMesh por chunk (tinta por instância,
// vento por shader nos materiais das famílias de tint) + Fase 34: UM campo
// GLOBAL de impostores (1 InstancedMesh, 1 instância por chunk) para a faixa
// intermediária-distante — update empacota as matrizes dos chunks visíveis
// nessa faixa (matrizes ESCREVIDAS só ali; os tufos nunca são reescritos).
// Retorna { group, chunks, mats, impostors, update(camX, camZ) } — update é
// idempotente (mesma câmera → mesmo estado). Contrato headless: funciona em
// Node (InstancedMesh sem renderer), update é determinístico.
export function buildGrassFieldLOD({
  spots = [], seed = 1, texture = null, tintFamilies = ['#5a6b33'], alphaTest = .42,
  chunkSize = 25, nearDist = 28, midDist = 58, sparseKeep = .4, sway = null,
  impostorDist = 110, impostorHeight = 1.15, impostorWidth = 3.2, impostorOpacity = .55,
  // Fase 37 — fade de entrada/saída da banda + sombra de contato ancorada
  impostorFadeZone = 14, impostorShadow = true, impostorShadowOpacity = .5,
  impostorShadowRadius = 1.9, impostorShadowLift = .05,
} = {}) {
  const cells = grassChunkify(spots, { chunkSize });
  const group = new THREE.Group();
  group.name = 'grassLOD';
  const tintCols = tintFamilies.map((c) => new THREE.Color(c));
  const geo = grassTuftGeometry({ seed });
  const mats = tintFamilies.map(() => {
    const mat = new THREE.MeshStandardMaterial({
      map: texture ? texture.clone() : null, alphaTest, side: THREE.DoubleSide, roughness: 1, color: '#ffffff',
    });
    if (mat.map) mat.map.needsUpdate = true;
    if (sway) patchSway(mat, sway);
    return mat;
  });
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const chunks = [];
  cells.forEach((cell, ci) => {
    const mesh = new THREE.InstancedMesh(geo, mats[ci % mats.length], Math.max(1, cell.indices.length));
    mesh.castShadow = false; mesh.receiveShadow = true;
    let sy = 0;
    cell.indices.forEach((si, li) => {
      const sp = spots[si];
      sy += sp.y ?? 0;
      dummy.position.set(sp.x, sp.y ?? 0, sp.z);
      dummy.rotation.set(0, sp.rot ?? 0, 0);
      const s = sp.s ?? 1;
      dummy.scale.set(s, s * (sp.sy ?? 1), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(li, dummy.matrix);
      // variação de tint por tufo (mezcla as famílias de cor do mundo)
      col.copy(tintCols[(si + ci) % tintCols.length]);
      const j = sp.tintJitter ?? .5;
      col.offsetHSL((j - .5) * .015, 0, (j - .5) * .1);
      mesh.setColorAt(li, col);
    });
    mesh.count = cell.indices.length;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere?.();
    mesh.visible = false;                       // update() acende o tier certo
    group.add(mesh);
    // Fase 34 — chunk carrega kx/kz (fase do tint/impostor) e a ALTURA MÉDIA
    // dos membros (impostor acompanha o relevo sem re-testar o terreno).
    chunks.push({ kx: cell.kx, kz: cell.kz, mesh, fullCount: cell.indices.length, x: cell.x, z: cell.z, y: sy / cell.indices.length });
  });

  // Fase 34 — campo GLOBAL de impostores: 1 InstancedMesh com capacidade de
  // 1 instância por chunk; update() empacota na frente as matrizes dos chunks
  // na faixa impostor (escrita O(faixa), tipicamente dezenas) e define count.
  // Cor por instância herda a família de tint do chunk — mancha coerente com
  // o capim próximo. F37: opacidade POR INSTÂNCIA (fade suave nas duas bordas
  // da banda) + sombras de contato falsas ancoradas no relevo (abaixo).
  const impGeo = grassImpostorGeometry({ height: impostorHeight, width: impostorWidth });
  const impMat = new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 1, metalness: 0, flatShading: true,
    transparent: true, opacity: Math.max(.08, Math.min(1, impostorOpacity)),
    depthWrite: true, side: THREE.DoubleSide,
  });
  if (sway) patchSway(impMat, { ...sway, strength: (sway.strength ?? .07) * .5, yScale: .5 });
  patchInstanceAlpha(impMat);                   // F37 — fade por instância
  // F37 — alpha por instância (1 slot por chunk; update() escreve o fade da
  // banda — smoothstep nas duas bordas; slots fora da faixa ficam em 0)
  const impAlpha = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, chunks.length)), 1);
  impAlpha.setUsage(THREE.DynamicDrawUsage);
  impGeo.setAttribute('instanceAlpha', impAlpha);
  const impostors = new THREE.InstancedMesh(impGeo, impMat, Math.max(1, chunks.length));
  impostors.name = 'grassImpostors';
  impostors.castShadow = false; impostors.receiveShadow = true;
  impostors.count = 0;                          // update() acende a faixa
  impostors.visible = false;
  group.add(impostors);
  const impColor = new THREE.Color();
  const impDummy = new THREE.Object3D();

  // F37 — campo de SOMBRAS DE CONTATO: 1 InstancedMesh espelho dos impostores
  // (1 disco por chunk na banda), mesma varredura de update — a sombra nasce,
  // acompanha e morre COM a mancha (mesmo alpha por instância). Ancoragem no
  // relevo: a instância usa o MESMO ch.y dos tufos do chunk (média das alturas
  // de plantio — o terreno sob o capim) com lift fino anti-z-fight. Material
  // transparente sem depthWrite (só escurece), polygonOffset empurra contra
  // o terreno; zero custo quando a banda está vazia.
  const shMat = new THREE.MeshBasicMaterial({
    color: '#000000', vertexColors: true, transparent: true,
    opacity: Math.max(.05, Math.min(1, impostorShadowOpacity)),
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  patchInstanceAlpha(shMat);                    // mesma dança de fade da mancha
  const shGeo = grassShadowGeometry();
  const shAlpha = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, chunks.length)), 1);
  shAlpha.setUsage(THREE.DynamicDrawUsage);
  shGeo.setAttribute('instanceAlpha', shAlpha);
  const impostorShadows = new THREE.InstancedMesh(shGeo, shMat, Math.max(1, chunks.length));
  impostorShadows.name = 'grassImpostorShadows';
  impostorShadows.castShadow = false; impostorShadows.receiveShadow = false;
  impostorShadows.renderOrder = 1;              // depois do terreno, antes do impostor
  impostorShadows.count = 0;
  impostorShadows.visible = false;
  group.add(impostorShadows);
  const shDummy = new THREE.Object3D();
  const useShadow = !!impostorShadow && impostorDist > midDist;

  return {
    group, chunks, mats, impostors, impostorMats: [impMat], nearDist, midDist, sparseKeep, impostorDist,
    // F37 — fade da banda + sombras de contato (espeixo do campo de impostores)
    impostorFadeZone, impostorShadows, impostorShadowMats: [shMat],
    impostorShadowRadius, impostorShadowLift,
    update(camX = 0, camZ = 0) {
      let imp = 0;
      const hasImpostor = impostorDist > midDist;
      for (const ch of chunks) {
        const d = Math.hypot(ch.x - camX, ch.z - camZ);
        const tier = grassChunkTier(d, { nearDist, midDist, impostorDist });
        if (tier === 'hidden') { ch.mesh.visible = false; continue; }
        if (tier === 'impostor') {
          ch.mesh.visible = false;
          if (!hasImpostor) continue;
          // F37 — fade SUAVE: alpha 0 na entrada da banda → nem empacota
          // (custo de draw 0 enquanto invisível, como o tier hidden)
          const fade = grassImpostorFade(d, { midDist, impostorDist, fadeZone: impostorFadeZone });
          if (fade <= 0.002) continue;
          // empacota o impostor deste chunk na posição livre
          impDummy.position.set(ch.x, ch.y ?? 0, ch.z);
          impDummy.rotation.set(0, (ch.kx * 7 + ch.kz * 13) % 6, 0);
          impDummy.scale.setScalar(1);
          impDummy.updateMatrix();
          impostors.setMatrixAt(imp, impDummy.matrix);
          impAlpha.setX(imp, fade);               // F37 — opacidade por distância
          // sombra de contato: mesmo ancoramento no relevo (ch.y + lift),
          // disco de raio fixo cobrindo a base do quad cruzado
          if (useShadow) {
            shDummy.position.set(ch.x, (ch.y ?? 0) + impostorShadowLift, ch.z);
            shDummy.rotation.set(0, 0, 0);        // disco é radial — sem rotação
            shDummy.scale.setScalar(impostorShadowRadius);
            shDummy.updateMatrix();
            impostorShadows.setMatrixAt(imp, shDummy.matrix);
            shAlpha.setX(imp, fade);              // sombra acompanha o fade
          }
          // tint médio das famílias (mesma rotação determinística dos tufos);
          // módulo positivo — kx/kz podem ser NEGATIVOS (chunks a oeste/norte)
          impColor.copy(tintCols[((ch.kx + ch.kz) % tintCols.length + tintCols.length) % tintCols.length]);
          impostors.setColorAt(imp, impColor);
          imp++;
          continue;
        }
        ch.mesh.visible = true;
        ch.mesh.count = tier === 'full' ? ch.fullCount : Math.max(1, Math.ceil(ch.fullCount * sparseKeep));
      }
      impostors.count = imp;
      impostors.visible = imp > 0;
      if (impostors.instanceColor) impostors.instanceColor.needsUpdate = true;
      impostors.computeBoundingSphere?.();
      impostorShadows.count = useShadow ? imp : 0;   // F37 — espelho da banda
      impostorShadows.visible = useShadow && imp > 0;
      impAlpha.needsUpdate = true;                   // alphas escritos neste frame
      shAlpha.needsUpdate = true;
      impostorShadows.computeBoundingSphere?.();
      return this;
    },
  };
}
