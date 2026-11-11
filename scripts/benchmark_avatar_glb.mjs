#!/usr/bin/env node
// Benchmark headless dos avatares GLB e do pipeline procedural de LOD.
// Não inicia WebGL nem acessa rede; memória de GPU real requer profiler do navegador.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AVATARS = join(ROOT, 'game-runtime/public/assets/avatars');
const OUT = process.env.AVATAR_BENCHMARK_OUT ?? join(ROOT, 'artifacts/avatar-glb-performance.json');

function parseGlb(data) {
  if (data.subarray(0, 4).toString('ascii') !== 'glTF' || data.readUInt32LE(4) !== 2) throw new Error('GLB/glTF 2 inválido');
  const jsonChunks = [];
  const views = [];
  let offset = 12;
  while (offset + 8 <= data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    const start = offset + 8;
    const chunk = data.subarray(start, start + length);
    if (type === 0x4e4f534a) jsonChunks.push(JSON.parse(chunk.toString('utf8').replace(/\u0000+$/g, '').trim()));
    else if (type === 0x004e4942) views.push({ start, length });
    offset = start + length;
  }
  return { doc: jsonChunks[0] ?? {}, views };
}

function glbMetrics(data) {
  const { doc } = parseGlb(data);
  const accessors = doc.accessors ?? [];
  const views = doc.bufferViews ?? [];
  let vertices = 0, triangles = 0, primitives = 0, geometryBytes = 0, indexBytes = 0;
  const usedView = new Set();
  const semanticCounts = {};
  for (const mesh of doc.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    primitives++;
    const indexAccessor = accessors[primitive.indices];
    if (indexAccessor) { triangles += Math.floor((indexAccessor.count ?? 0) / 3); indexBytes += views[indexAccessor.bufferView]?.byteLength ?? 0; }
    for (const [semantic, accessorId] of Object.entries(primitive.attributes ?? {})) {
      const accessor = accessors[accessorId];
      if (!accessor) continue;
      if (semantic === 'POSITION') vertices += accessor.count ?? 0;
      semanticCounts[semantic] = (semanticCounts[semantic] ?? 0) + 1;
      if (accessor.bufferView != null) usedView.add(accessor.bufferView);
    }
  }
  for (const id of usedView) geometryBytes += views[id]?.byteLength ?? 0;
  geometryBytes += indexBytes;
  const imageBytes = (doc.images ?? []).reduce((sum, image) => sum + (views[image.bufferView]?.byteLength ?? 0), 0);
  const joints = (doc.skins ?? []).reduce((sum, skin) => sum + (skin.joints?.length ?? 0), 0);
  return {
    meshes: (doc.meshes ?? []).length,
    primitives,
    vertices,
    triangles,
    nodes: (doc.nodes ?? []).length,
    materials: (doc.materials ?? []).length,
    textures: (doc.textures ?? []).length,
    images: (doc.images ?? []).length,
    skins: (doc.skins ?? []).length,
    joints,
    animations: (doc.animations ?? []).length,
    geometryBytes,
    imageBytes,
    semanticCounts,
  };
}

function trisOf(group) {
  let tris = 0, meshes = 0;
  group.traverse((node) => {
    if (!node.isMesh) return;
    meshes++;
    tris += node.geometry.index ? node.geometry.index.count / 3 : node.geometry.attributes.position.count / 3;
  });
  return { meshes, triangles: Math.round(tris) };
}

async function proceduralLodMetrics() {
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
    fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {},
    ellipse() {}, quadraticCurveTo() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {},
    measureText() { return { width: 10 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(128) }; },
    putImageData() {}, createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
  };
  globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  const entities = await import('../game-runtime/src/game3d/entities3d.js');
  const lod = await import('../game-runtime/src/game3d/lod3d.js');
  const palette = { skin: entities.SKIN_TONES[0], vest: entities.VEST_COLORS_FALLBACK[0] };
  const full = entities.createOperative({ ...palette, variant: 'benchmark-avatar' });
  const proxy = lod.buildOperativeProxy(palette);
  const silhouette = lod.buildOperativeSilhouette(palette);
  const levels = { full: trisOf(full.group), proxy: trisOf(proxy.group ?? proxy), silhouette: trisOf(silhouette.group ?? silhouette) };
  const fullTris = levels.full.triangles;
  return {
    levels,
    thresholdsMeters: { full: lod.LOD_TIERS.high.full, silhouette: lod.LOD_TIERS.high.sil, cull: lod.LOD_TIERS.high.cull },
    reduction: {
      proxyVsFull: Number((1 - levels.proxy.triangles / fullTris).toFixed(4)),
      silhouetteVsFull: Number((1 - levels.silhouette.triangles / fullTris).toFixed(4)),
    },
    note: 'O GLB carregado atualmente é o override do herói; os níveis proxy/silhouette medidos são o fallback procedural do runtime. GLB alternativo reduzido não é fabricado automaticamente.',
  };
}

const names = [
  'animated-avatar-m-01.glb', 'rigged-avatar-m-01.glb', 'rigged-avatar-m-02.glb', 'rigged-avatar-m-04.glb',
  'rigged-avatar-f-01.glb', 'rigged-avatar-f-03.glb', 'avatar-m-01.glb', 'avatar-m-02.glb', 'avatar-m-04.glb', 'avatar-f-03.glb',
];
const started = process.memoryUsage();
const assets = [];
for (const file of names) {
  const path = join(AVATARS, file);
  const data = await readFile(path);
  const metrics = glbMetrics(data);
  assets.push({ file, bytes: data.length, ...metrics, estimatedResidentBytes: data.length + metrics.geometryBytes + metrics.imageBytes });
}
const lod = await proceduralLodMetrics();
const ended = process.memoryUsage();
const report = {
  schema: 'khaaos.avatar-glb-performance/v1',
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, headless: true, webgl: false },
  assets,
  totals: {
    files: assets.length,
    bytes: assets.reduce((n, a) => n + a.bytes, 0),
    estimatedResidentBytes: assets.reduce((n, a) => n + a.estimatedResidentBytes, 0),
    vertices: assets.reduce((n, a) => n + a.vertices, 0),
    triangles: assets.reduce((n, a) => n + a.triangles, 0),
    geometryBytes: assets.reduce((n, a) => n + a.geometryBytes, 0),
    imageBytes: assets.reduce((n, a) => n + a.imageBytes, 0),
  },
  lod,
  processMemory: {
    rssBefore: started.rss,
    rssAfter: ended.rss,
    heapUsedBefore: started.heapUsed,
    heapUsedAfter: ended.heapUsed,
    heapDelta: ended.heapUsed - started.heapUsed,
  },
  limitations: [
    'estimatedResidentBytes é uma aproximação de payload GLB + bufferViews de geometria/imagens; não é VRAM nem captura de texturas decodificadas pelo navegador',
    'o benchmark não inicia WebGL; GPU timings e draw calls exigem Browser Performance/DevTools ou Unreal Insights',
    'o loader atual usa os GLBs como override do herói e mantém LOD procedural para atores; GLB com meshes LOD alternativos requer assets adicionais',
  ],
};
await writeFile(OUT, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output: OUT, files: assets.length, totalBytes: report.totals.bytes, estimatedResidentBytes: report.totals.estimatedResidentBytes, lod: lod.levels }, null, 2));
