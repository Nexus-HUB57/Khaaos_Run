import { useEffect, useRef, useState } from "react";
import { figureGlbSrc, parseFigureGlb, type ParsedFigureGlb } from "@/lib/glb";

/**
 * Viewer 3D das figuras de alistamento — WebGL puro, sem dependências.
 *
 * Renderiza o GLB A-pose (COLOR_0 por vértice, mesma paleta da ficha) com
 * rotação idle automática e arraste para orbitar. A câmera é enquadrada pela
 * altura da bbox do arquivo — substituir o placeholder por scan/retopo real
 * (mesmos nomes de asset) não exige mudança aqui.
 */

interface FigureGlbViewerProps {
  figureId: string;
  figureName: string;
  className?: string;
}

type ViewerState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; glb: ParsedFigureGlb };

// ─── mat4 mínimo (column-major, glTF +Y up, RH) ───────────────────────────────

function perspective(fovyRad: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function lookAt(eye: [number, number, number], center: [number, number, number]): Float32Array {
  const [ex, ey, ez] = eye;
  const [cx, cy, cz] = center;
  let zx = ex - cx, zy = ey - cy, zz = ez - cz;
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;
  // x = normalize(cross(up=(0,1,0), z)) = (zz, 0, -zx)
  let xx = zz, xy = 0, xz = -zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * ex + xy * ey + xz * ez),
    -(yx * ex + yy * ey + yz * ez),
    -(zx * ex + zy * ey + zz * ez),
    1,
  ]);
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

// ─── Shaders ──────────────────────────────────────────────────────────────────

const VERT_SRC = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec4 aColor;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
varying vec3 vNormal;
varying vec4 vColor;
void main() {
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  gl_Position = uProj * uView * uModel * vec4(aPosition, 1.0);
}
`;

const FRAG_SRC = `
precision mediump float;
varying vec3 vNormal;
varying vec4 vColor;
void main() {
  vec3 n = normalize(vNormal);
  // luz chave + ambiente hemisférico (duas fontes fixas em espaço de modelo)
  vec3 key = normalize(vec3(0.45, 0.75, 0.6));
  vec3 rim = normalize(vec3(-0.6, 0.25, -0.5));
  float lam = max(dot(n, key), 0.0);
  float back = max(dot(n, rim), 0.0);
  float shade = 0.42 + 0.52 * lam + 0.18 * back;
  vec3 rgb = clamp(vColor.rgb * shade, 0.0, 1.0);
  gl_FragColor = vec4(rgb, 1.0);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader: ${log ?? "falha de compilação"}`);
  }
  return sh;
}

export function FigureGlbViewer({ figureId, figureName, className }: FigureGlbViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<ViewerState>({ status: "loading" });

  // fetch + parse
  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetch(figureGlbSrc(figureId))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        if (cancelled) return;
        try {
          setState({ status: "ready", glb: parseFigureGlb(buf) });
        } catch (err) {
          setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => { cancelled = true; };
  }, [figureId]);

  // render loop
  useEffect(() => {
    if (state.status !== "ready") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = (canvas.getContext("webgl2", { antialias: true, alpha: true }) ||
      canvas.getContext("webgl", { antialias: true, alpha: true })) as WebGLRenderingContext | null;
    if (!gl) {
      setState({ status: "error", message: "WebGL indisponível neste navegador" });
      return;
    }

    let disposed = false;
    const { positions, normals, colors, indices, min, max } = state.glb;

    const prog = gl.createProgram()!;
    const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setState({ status: "error", message: `programa WebGL: ${gl.getProgramInfoLog(prog) ?? "link falhou"}` });
      return;
    }
    gl.useProgram(prog);

    const makeBuf = (data: ArrayBufferView, target: number): WebGLBuffer => {
      const buf = gl.createBuffer()!;
      gl.bindBuffer(target, buf);
      gl.bufferData(target, data, gl.STATIC_DRAW);
      return buf;
    };
    const posBuf = makeBuf(positions, gl.ARRAY_BUFFER);
    const nrmBuf = makeBuf(normals, gl.ARRAY_BUFFER);
    const colBuf = makeBuf(colors, gl.ARRAY_BUFFER);
    // WebGL1 só desenha índices uint16 sem OES_element_index_uint; uint32 é
    // nativo no WebGL2. Convertemos quando a contagem de vértices permite
    // (cobre os dois contextos com o mesmo caminho de código).
    let drawIndices: ArrayBufferView = indices;
    let drawType: number = gl.UNSIGNED_INT;
    const maxIndex = indices.reduce((m, v) => Math.max(m, v), 0);
    if (maxIndex < 65536) {
      drawIndices = new Uint16Array(indices);
      drawType = gl.UNSIGNED_SHORT;
    }
    const idxBuf = makeBuf(drawIndices, gl.ELEMENT_ARRAY_BUFFER);

    const aPosition = gl.getAttribLocation(prog, "aPosition");
    const aNormal = gl.getAttribLocation(prog, "aNormal");
    const aColor = gl.getAttribLocation(prog, "aColor");
    const uProj = gl.getUniformLocation(prog, "uProj");
    const uView = gl.getUniformLocation(prog, "uView");
    const uModel = gl.getUniformLocation(prog, "uModel");

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

    // enquadramento pela bbox (altura em metros, aterrissada em y=0)
    const height = Math.max(max[1] - min[1], 0.1);
    const centerY = (max[1] + min[1]) / 2;
    const radius = Math.max(max[0] - min[0], height, max[2] - min[2]) / 2;
    const dist = radius * 3.2;

    let yaw = 0.6; // pose inicial levemente girada
    let pitch = 0.05;
    let yawVel = 0.004; // rotação idle
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      yawVel = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      yaw += (e.clientX - lastX) * 0.01;
      pitch += (e.clientY - lastY) * 0.006;
      pitch = Math.max(-0.5, Math.min(0.5, pitch));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      yawVel = 0.004;
      canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);

    let raf = 0;
    const render = () => {
      if (disposed) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      yaw += dragging ? 0 : yawVel;

      const eye: [number, number, number] = [
        Math.sin(yaw) * Math.cos(pitch) * dist,
        centerY + Math.sin(pitch) * dist,
        Math.cos(yaw) * Math.cos(pitch) * dist,
      ];
      const view = lookAt(eye, [0, centerY, 0]);
      const proj = perspective((45 * Math.PI) / 180, w / h, dist * 0.1, dist * 4);
      // modelo fica em identidade — quem orbita é a câmera
      const model = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

      gl.uniformMatrix4fv(uProj, false, proj);
      gl.uniformMatrix4fv(uView, false, view);
      gl.uniformMatrix4fv(uModel, false, model);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
      gl.enableVertexAttribArray(aNormal);
      gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
      gl.enableVertexAttribArray(aColor);
      gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);

      gl.drawElements(gl.TRIANGLES, indices.length, drawType, 0);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(nrmBuf);
      gl.deleteBuffer(colBuf);
      gl.deleteBuffer(idxBuf);
      gl.deleteProgram(prog);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
    };
  }, [state]);

  return (
    <div className={`relative ${className ?? ""}`} data-testid={`figure-glb-viewer-${figureId}`}>
      <canvas
        ref={canvasRef}
        aria-label={`Malha 3D de ${figureName} (A-pose, arraste para girar)`}
        className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"
      />
      {state.status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
          <span className="font-mono text-[10px] tracking-widest text-muted-foreground">CARREGANDO MALHA…</span>
        </div>
      )}
      {state.status === "error" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 p-3 text-center">
          <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
            MALHA 3D INDISPONÍVEL · {state.message}
          </span>
        </div>
      )}
    </div>
  );
}
