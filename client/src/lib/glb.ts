/**
 * Parser GLB (glTF 2.0 binário) para as figuras de alistamento do Khaaos Run.
 *
 * Sem dependências e sem DOM — roda no browser (viewer WebGL) e no Node
 * (contrato tests/official/figures-glb-viewer.test.ts).
 *
 * Escopo deliberado: cobre o layout produzido por
 * `scripts/figures/export_figures_glb.py` (POSITION float32 VEC3 com min/max,
 * NORMAL float32 VEC3, COLOR_0 float32 VEC4, índices uint32 SCALAR, 1 mesh /
 * 1 primitive, mode 4 TRIANGLES). Qualquer desvio (ex.: scans de retopo futuros
 * com UVs ou skinning) deve estender este parser E o contrato — o erro é explícito,
 * nunca silencioso.
 */

export interface ParsedFigureGlb {
  /** xyz por vértice, metros, Y-up, aterrissado em y=0 */
  positions: Float32Array;
  /** xyz por vértice */
  normals: Float32Array;
  /** rgba por vértice (COLOR_0) */
  colors: Float32Array;
  /** índices de triângulos (length = 3 × triangles) */
  indices: Uint32Array;
  /** bbox do accessor POSITION (min/max declarados no glTF) */
  min: [number, number, number];
  max: [number, number, number];
  /** metadados para diagnóstico/contrato */
  meta: {
    generator: string;
    meshName: string;
    vertexCount: number;
    triangleCount: number;
  };
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

const COMPONENT_FLOAT = 5126;
const COMPONENT_UINT = 5125;

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

function assertComponentType(actual: number, expected: number, what: string): void {
  if (actual !== expected) {
    throw new Error(
      `GLB ${what}: componentType ${actual} não suportado (esperado ${expected}) — ` +
        `extenda client/src/lib/glb.ts e o contrato do viewer`
    );
  }
}

function assertType(actual: string, expected: string, what: string): void {
  if (actual !== expected) {
    throw new Error(
      `GLB ${what}: type "${actual}" não suportado (esperado "${expected}")`
    );
  }
}

/** Lê um accessor float do BIN chunk e devolve os componentes crus. */
function readFloatAccessor(
  json: any,
  bin: DataView,
  accessorIndex: number,
  what: string
): { data: Float32Array; components: number } {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) {
    throw new Error(`GLB ${what}: accessor ${accessorIndex} inexistente`);
  }
  assertComponentType(accessor.componentType, COMPONENT_FLOAT, what);
  const components = TYPE_COMPONENTS[accessor.type];
  if (!components) {
    throw new Error(`GLB ${what}: type "${accessor.type}" desconhecido`);
  }
  const bufferView = json.bufferViews?.[accessor.bufferView];
  if (!bufferView) {
    throw new Error(`GLB ${what}: bufferView ${accessor.bufferView} inexistente`);
  }
  const byteOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const count = accessor.count;
  const data = new Float32Array(count * components);
  for (let i = 0; i < count * components; i++) {
    data[i] = bin.getFloat32(byteOffset + i * 4, true);
  }
  return { data, components };
}

/** Lê o accessor de índices (uint32 SCALAR). */
function readIndexAccessor(json: any, bin: DataView, accessorIndex: number): Uint32Array {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) {
    throw new Error(`GLB indices: accessor ${accessorIndex} inexistente`);
  }
  assertComponentType(accessor.componentType, COMPONENT_UINT, "indices");
  assertType(accessor.type, "SCALAR", "indices");
  const bufferView = json.bufferViews?.[accessor.bufferView];
  if (!bufferView) {
    throw new Error(`GLB indices: bufferView ${accessor.bufferView} inexistente`);
  }
  const byteOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const data = new Uint32Array(accessor.count);
  for (let i = 0; i < accessor.count; i++) {
    data[i] = bin.getUint32(byteOffset + i * 4, true);
  }
  return data;
}

/**
 * Faz o parse do layout canônico das figuras de alistamento.
 * @param buffer bytes do arquivo .glb
 */
export function parseFigureGlb(buffer: ArrayBuffer): ParsedFigureGlb {
  if (buffer.byteLength < 20) {
    throw new Error(`GLB: arquivo muito curto (${buffer.byteLength} bytes)`);
  }
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error("GLB: magic bytes inválidos (não é glTF binário)");
  }
  if (header.getUint32(4, true) !== 2) {
    throw new Error(`GLB: versão ${header.getUint32(4, true)} não suportada (esperado 2)`);
  }

  // chunks: [len][type][payload]
  let offset = 12;
  let json: any = null;
  let bin: DataView | null = null;
  while (offset + 8 <= buffer.byteLength) {
    const chunkLen = header.getUint32(offset, true);
    const chunkType = header.getUint32(offset + 4, true);
    const payloadStart = offset + 8;
    if (payloadStart + chunkLen > buffer.byteLength) {
      throw new Error("GLB: chunk truncado");
    }
    if (chunkType === CHUNK_JSON) {
      const bytes = new Uint8Array(buffer, payloadStart, chunkLen);
      json = JSON.parse(new TextDecoder("utf-8").decode(bytes));
    } else if (chunkType === CHUNK_BIN) {
      bin = new DataView(buffer, payloadStart, chunkLen);
    } // chunks desconhecidos são ignorados (glTF 2.0 permite)
    offset = payloadStart + chunkLen;
  }

  if (!json) throw new Error("GLB: chunk JSON ausente");
  if (!bin) throw new Error("GLB: chunk BIN ausente");

  const mesh = json.meshes?.[0];
  const primitive = mesh?.primitives?.[0];
  if (!primitive) throw new Error("GLB: nenhuma primitive na mesh 0");
  if (primitive.mode !== undefined && primitive.mode !== 4) {
    throw new Error(`GLB: mode ${primitive.mode} não suportado (esperado 4 TRIANGLES)`);
  }

  const attrs = primitive.attributes ?? {};
  if (attrs.POSITION === undefined) throw new Error("GLB: attribute POSITION ausente");
  if (attrs.NORMAL === undefined) throw new Error("GLB: attribute NORMAL ausente");
  if (attrs.COLOR_0 === undefined) throw new Error("GLB: attribute COLOR_0 ausente");
  if (primitive.indices === undefined) throw new Error("GLB: indices ausentes (non-indexed não suportado)");

  const positionAcc = readFloatAccessor(json, bin, attrs.POSITION, "POSITION");
  assertType(json.accessors[attrs.POSITION].type, "VEC3", "POSITION");
  const normalAcc = readFloatAccessor(json, bin, attrs.NORMAL, "NORMAL");
  assertType(json.accessors[attrs.NORMAL].type, "VEC3", "NORMAL");
  const colorAcc = readFloatAccessor(json, bin, attrs.COLOR_0, "COLOR_0");
  assertType(json.accessors[attrs.COLOR_0].type, "VEC4", "COLOR_0");

  const positions = positionAcc.data;
  const vertexCount = positions.length / 3;
  if (normalAcc.data.length !== vertexCount * 3) {
    throw new Error(
      `GLB: NORMAL (${normalAcc.data.length}) e POSITION (${positions.length}) divergem`
    );
  }
  if (colorAcc.data.length !== vertexCount * 4) {
    throw new Error(
      `GLB: COLOR_0 (${colorAcc.data.length}) e POSITION (${positions.length}) divergem`
    );
  }

  const indices = readIndexAccessor(json, bin, primitive.indices);
  if (indices.length % 3 !== 0) {
    throw new Error(`GLB: índices (${indices.length}) não fecham triângulos`);
  }
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] >= vertexCount) {
      throw new Error(
        `GLB: índice ${indices[i]} fora do range de vértices (${vertexCount})`
      );
    }
  }

  const posAccessor = json.accessors[attrs.POSITION];
  const fallbackMin = (): [number, number, number] => {
    let mx = Infinity, my = Infinity, mz = Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i] < mx) mx = positions[i];
      if (positions[i + 1] < my) my = positions[i + 1];
      if (positions[i + 2] < mz) mz = positions[i + 2];
    }
    return [mx, my, mz];
  };
  const fallbackMax = (): [number, number, number] => {
    let mx = -Infinity, my = -Infinity, mz = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i] > mx) mx = positions[i];
      if (positions[i + 1] > my) my = positions[i + 1];
      if (positions[i + 2] > mz) mz = positions[i + 2];
    }
    return [mx, my, mz];
  };
  const min: [number, number, number] = Array.isArray(posAccessor.min)
    ? [posAccessor.min[0], posAccessor.min[1], posAccessor.min[2]]
    : fallbackMin();
  const max: [number, number, number] = Array.isArray(posAccessor.max)
    ? [posAccessor.max[0], posAccessor.max[1], posAccessor.max[2]]
    : fallbackMax();

  return {
    positions,
    normals: normalAcc.data,
    colors: colorAcc.data,
    indices,
    min,
    max,
    meta: {
      generator: json.asset?.generator ?? "(sem generator)",
      meshName: mesh.name ?? "(sem nome)",
      vertexCount,
      triangleCount: indices.length / 3,
    },
  };
}

/** Caminho canônico do GLB de uma figura de alistamento (mesmos nomes de asset do exportador). */
export function figureGlbSrc(figureId: string): string {
  return `/figures/glb/FIG_${figureId}.glb`;
}
