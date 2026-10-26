// Khaaos Run — Fase 7: gerador de assets GLTF 2.0 REAIS para props do mundo.
// Gera .gltf válidos (JSON + buffer base64 embutido) com geometria real
// (posições/normais/índices) — carregados no runtime via GLTFLoader com
// fallback procedural caso o fetch falhe.
// Uso: node scripts/build-gltf-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'assets', 'models');
fs.mkdirSync(OUT, { recursive: true });

// ---------- geometria ----------
function boxGeometry(w, h, d) {
  // 24 vértices (4 por face) com normais planas — padrão glTF
  const x = w / 2, y = h / 2, z = d / 2;
  const faces = [
    // +Z (frente)
    { n: [0, 0, 1], v: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
    // -Z (trás)
    { n: [0, 0, -1], v: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
    // +X
    { n: [1, 0, 0], v: [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]] },
    // -X
    { n: [-1, 0, 0], v: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]] },
    // +Y (topo)
    { n: [0, 1, 0], v: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] },
    // -Y (base)
    { n: [0, -1, 0], v: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] },
  ];
  const positions = [], normals = [], indices = [];
  faces.forEach((f, fi) => {
    const base = fi * 4;
    for (const v of f.v) { positions.push(...v); normals.push(...f.n); }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { positions, normals, indices };
}

function cylinderGeometry(rTop, rBottom, h, seg = 12) {
  const y0 = -h / 2, y1 = h / 2;
  const positions = [], normals = [], indices = [];
  // lateral
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const rt = rTop, rb = rBottom;
    // inclinação da normal conforme o raio muda (cone/cilindro)
    const slope = Math.atan2(rb - rt, h);
    const ny = Math.sin(slope), nr = Math.cos(slope);
    positions.push(rt * ca, y1, rt * sa, rb * ca, y0, rb * sa);
    normals.push(nr * ca, ny, nr * sa, nr * ca, ny, nr * sa);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // tampas
  for (const [r, y, ny] of [[rTop, y1, 1], [rBottom, y0, -1]]) {
    const center = positions.length / 3;
    positions.push(0, y, 0); normals.push(0, ny, 0);
    const rimStart = positions.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      positions.push(r * ca, y, r * sa); normals.push(0, ny, 0);
    }
    for (let i = 0; i < seg; i++) {
      if (ny > 0) indices.push(center, rimStart + i + 1, rimStart + i);
      else indices.push(center, rimStart + i, rimStart + i + 1);
    }
  }
  return { positions, normals, indices };
}

function coneGeometry(r, h, seg = 12) {
  const y0 = 0, y1 = h;
  const positions = [], normals = [], indices = [];
  const slope = Math.atan2(r, h);
  const ny = Math.cos(slope), nr = Math.sin(slope);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    positions.push(0, y1, 0, r * ca, y0, r * sa);
    normals.push(nr * ca, ny, nr * sa, nr * ca, ny, nr * sa);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2);
  }
  // base
  const center = positions.length / 3;
  positions.push(0, y0, 0); normals.push(0, -1, 0);
  const rimStart = positions.length / 3;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    positions.push(r * Math.cos(a), y0, r * Math.sin(a)); normals.push(0, -1, 0);
  }
  for (let i = 0; i < seg; i++) indices.push(center, rimStart + i, rimStart + i + 1);
  return { positions, normals, indices };
}

// ---------- empacotamento glTF ----------
function buildGltf(geo, material, { name, translate = [0, 0, 0] } = {}) {
  const pos = new Float32Array(geo.positions);
  const nor = new Float32Array(geo.normals);
  const idx = new Uint16Array(geo.indices);
  const posBytes = pos.byteLength, norBytes = nor.byteLength, idxBytes = idx.byteLength;
  const total = posBytes + norBytes + idxBytes;
  const buffer = Buffer.alloc(total);
  buffer.set(Buffer.from(pos.buffer), 0);
  buffer.set(Buffer.from(nor.buffer), posBytes);
  buffer.set(Buffer.from(idx.buffer), posBytes + norBytes);
  const gltf = {
    asset: { version: '2.0', generator: 'khaaos-run build-gltf-assets' },
    scene: 0,
    scenes: [{ nodes: [0], name: 'scene' }],
    nodes: [{ mesh: 0, name: name ?? 'root', translation: translate }],
    meshes: [{ name: `${name ?? 'root'}-mesh`, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [material],
    buffers: [{ byteLength: total, uri: `data:application/octet-stream;base64,${buffer.toString('base64')}` }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes, byteLength: norBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes + norBytes, byteLength: idxBytes, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: Math.min(...geo.positions.map((_, i) => (i % 3 === 0) ? geo.positions[i] : Infinity)).toFixed ? undefined : undefined },
      { bufferView: 1, componentType: 5126, count: nor.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: idx.length, type: 'SCALAR' },
    ],
  };
  // min/max exigidos apenas em POSITION — computa de verdade
  const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < geo.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      mins[k] = Math.min(mins[k], geo.positions[i + k]);
      maxs[k] = Math.max(maxs[k], geo.positions[i + k]);
    }
  }
  gltf.accessors[0].min = mins;
  gltf.accessors[0].max = maxs;
  return gltf;
}

function stdMaterial(name, baseColor, { metallic = 0.6, roughness = 0.5, doubleSided = false } = {}) {
  return {
    name,
    pbrMetallicRoughness: { baseColorFactor: baseColor, metallicFactor: metallic, roughnessFactor: roughness },
    doubleSided,
  };
}

// ---------- assets ----------
const assets = [
  {
    name: 'barrel',
    build: () => buildGltf(cylinderGeometry(0.34, 0.34, 0.95, 14),
      stdMaterial('barrel', [0.29, 0.33, 0.27, 1], { metallic: 0.55, roughness: 0.55 }),
      { name: 'barrel', translate: [0, 0.475, 0] }),
  },
  {
    name: 'crate',
    build: () => buildGltf(boxGeometry(0.9, 0.9, 0.9),
      stdMaterial('crate', [0.52, 0.4, 0.24, 1], { metallic: 0.15, roughness: 0.85 }),
      { name: 'crate', translate: [0, 0.45, 0] }),
  },
  {
    name: 'cone',
    build: () => buildGltf(coneGeometry(0.22, 0.7, 12),
      stdMaterial('cone', [0.92, 0.32, 0.08, 1], { metallic: 0.1, roughness: 0.7 }),
      { name: 'cone', translate: [0, 0, 0] }),
  },
  {
    name: 'barrier',
    build: () => buildGltf(boxGeometry(2.2, 0.95, 0.55),
      stdMaterial('barrier', [0.6, 0.585, 0.545, 1], { metallic: 0.05, roughness: 0.9 }),
      { name: 'barrier', translate: [0, 0.475, 0] }),
  },
];

for (const a of assets) {
  const file = path.join(OUT, `${a.name}.gltf`);
  fs.writeFileSync(file, JSON.stringify(a.build()));
  console.log(`[gltf] ${file} (${fs.statSync(file).size} bytes)`);
}
console.log(`OK — ${assets.length} assets GLTF gerados em public/assets/models/`);
