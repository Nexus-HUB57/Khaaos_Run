import { useEffect, useMemo, useRef } from "react";
import {
  KHAAOS_WORLDS,
  WORLD_RING_DIMENSIONS,
  toOperationalWorldId,
  type WorldId,
} from "@shared/worlds";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────────────────────
 * WorldMapPreview — canvas 2D top-down do ring canônico
 *
 * Spec canônica (README § Console Web): 5 formas orgânicas por bioma,
 * POIs com tier T1–T3, anel de zona pulsante/contraindo, trajetória de
 * dropship bezier animada, cluster de 100 dots, pontos Zu, barra de escala
 * métrica e bússola; RNG seedado por id do mundo (FNV-1a + LCG) — render
 * determinístico.
 * ──────────────────────────────────────────────────────────────────────────── */

/* ─── RNG determinístico: FNV-1a + LCG ─── */

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function createLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createWorldRng(worldId: WorldId): () => number {
  return createLcg(fnv1a(`KHAAOS-RING-${worldId}`));
}

/* ─── Geometria do contorno orgânico por bioma ─── */

type Vec2 = { x: number; y: number };

/** Normaliza um polígono em coordenadas métricas (centro = 0,0) para o canvas. */
interface RingGeometry {
  outline: Vec2[];
  streets: Vec2[][];
  sizeMeters: number;
}

function polygonBoundingBox(points: Vec2[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function buildFortifiedRectangle(rng: () => number, widthM: number, depthM: number): RingGeometry {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const bastion = Math.min(widthM, depthM) * (0.08 + rng() * 0.04);
  const outline: Vec2[] = [
    { x: -hw + bastion, y: -hd },
    { x: hw - bastion, y: -hd },
    { x: hw, y: -hd + bastion },
    { x: hw, y: hd - bastion },
    { x: hw - bastion, y: hd },
    { x: -hw + bastion, y: hd },
    { x: -hw, y: hd - bastion },
    { x: -hw, y: -hd + bastion },
  ];
  // Ruas internas de guarnição (grade militar)
  const streets: Vec2[][] = [];
  const cols = 3;
  const rows = 2;
  for (let c = 1; c <= cols; c += 1) {
    const x = -hw + (widthM * c) / (cols + 1);
    streets.push([{ x, y: -hd + bastion * 0.4 }, { x, y: hd - bastion * 0.4 }]);
  }
  for (let r = 1; r <= rows; r += 1) {
    const y = -hd + (depthM * r) / (rows + 1);
    streets.push([{ x: -hw + bastion * 0.4, y }, { x: hw - bastion * 0.4, y }]);
  }
  return { outline, streets, sizeMeters: Math.max(widthM, depthM) };
}

function buildUrbanGridiron(rng: () => number, widthM: number, depthM: number): RingGeometry {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const outline: Vec2[] = [];
  const steps = 22;
  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    const angle = t * Math.PI * 2;
    // retângulo com jitter irregular de quarteirões
    const rx = Math.sign(Math.cos(angle)) * hw * Math.min(1, Math.abs(Math.cos(angle)) + 0.18);
    const ry = Math.sign(Math.sin(angle)) * hd * Math.min(1, Math.abs(Math.sin(angle)) + 0.18);
    const jitterX = (rng() - 0.5) * widthM * 0.03;
    const jitterY = (rng() - 0.5) * depthM * 0.05;
    outline.push({ x: rx + jitterX, y: ry + jitterY });
  }
  const streets: Vec2[][] = [];
  const cols = 4 + Math.floor(rng() * 2);
  const rows = 2 + Math.floor(rng() * 2);
  for (let c = 1; c <= cols; c += 1) {
    const x = -hw + (widthM * c) / (cols + 1) + (rng() - 0.5) * widthM * 0.02;
    streets.push([{ x, y: -hd * 0.92 }, { x, y: hd * 0.92 }]);
  }
  for (let r = 1; r <= rows; r += 1) {
    const y = -hd + (depthM * r) / (rows + 1) + (rng() - 0.5) * depthM * 0.03;
    streets.push([{ x: -hw * 0.94, y }, { x: hw * 0.94, y }]);
  }
  return { outline, streets, sizeMeters: Math.max(widthM, depthM) };
}

function buildRadialBlob(
  rng: () => number,
  widthM: number,
  depthM: number,
  options: { lobes: number; amp: number; coves?: boolean },
): RingGeometry {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const phase = rng() * Math.PI * 2;
  const outline: Vec2[] = [];
  const steps = 64;
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    const wave =
      Math.sin(options.lobes * angle + phase) * options.amp +
      Math.sin((options.lobes + 3) * angle - phase * 1.7) * options.amp * 0.45;
    const cove = options.coves && Math.cos(angle + phase) > 0.82 ? -0.22 : 0;
    outline.push({
      x: hw * (1 + wave + cove) * Math.cos(angle),
      y: hd * (1 + wave + cove) * Math.sin(angle),
    });
  }
  return { outline, streets: [], sizeMeters: Math.max(widthM, depthM) };
}

function buildDesertBasin(rng: () => number, widthM: number, depthM: number): RingGeometry {
  const hw = widthM / 2;
  const hd = depthM / 2;
  const phase = rng() * Math.PI * 2;
  const outline: Vec2[] = [];
  const steps = 56;
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    const dune = Math.sin(5 * angle + phase) * 0.07 + Math.sin(9 * angle - phase) * 0.04;
    const squash = 0.94 + 0.06 * Math.cos(angle - phase);
    outline.push({
      x: hw * squash * Math.cos(angle),
      y: hd * (0.88 + dune) * Math.sin(angle) * 1.06,
    });
  }
  // arcos de dunas internos
  const streets: Vec2[][] = [];
  for (let d = 0; d < 4; d += 1) {
    const cy = -hd + (depthM * (d + 1)) / 5;
    const arc: Vec2[] = [];
    for (let i = 0; i <= 14; i += 1) {
      const t = i / 14;
      arc.push({ x: -hw * 0.7 + t * widthM * 0.7, y: cy + Math.sin(t * Math.PI) * depthM * 0.05 });
    }
    streets.push(arc);
  }
  return { outline, streets, sizeMeters: Math.max(widthM, depthM) };
}

function buildRingGeometry(worldId: WorldId): RingGeometry {
  const dims = WORLD_RING_DIMENSIONS[worldId];
  const rng = createWorldRng(worldId);
  const { widthM, depthM } = dims.boundingBoxM;
  switch (dims.shape) {
    case "fortified_rectangle":
      return buildFortifiedRectangle(rng, widthM, depthM);
    case "urban_gridiron":
      return buildUrbanGridiron(rng, widthM, depthM);
    case "organic_blob":
      return buildRadialBlob(rng, widthM, depthM, { lobes: 6, amp: 0.16 });
    case "desert_basin":
      return buildDesertBasin(rng, widthM, depthM);
    case "coastal_island":
      return buildRadialBlob(rng, widthM, depthM, { lobes: 5, amp: 0.2, coves: true });
  }
}

/* ─── Entidades derivadas (determinísticas) ─── */

interface MapPoi {
  name: string;
  tier: 1 | 2 | 3;
  pos: Vec2;
}

interface MapZuPoint {
  id: string;
  pos: Vec2;
}

interface DerivedEntities {
  pois: MapPoi[];
  operators: Vec2[];
  zuPoints: MapZuPoint[];
  dropship: { from: Vec2; control: Vec2; to: Vec2 };
}

function deriveEntities(worldId: WorldId, geometry: RingGeometry): DerivedEntities {
  const def = KHAAOS_WORLDS[worldId];
  const rng = createWorldRng(worldId);
  const bbox = polygonBoundingBox(geometry.outline);
  const spanX = Math.max(bbox.maxX - bbox.minX, 1e-6);
  const spanY = Math.max(bbox.maxY - bbox.minY, 1e-6);
  const half = def.sizeMeters / 2;

  // POIs do contrato compartilhado, projetados proporcionalmente no ring
  const pois: MapPoi[] = def.pois.map((poi) => ({
    name: poi.name,
    tier: poi.tier,
    pos: {
      x: bbox.minX + ((poi.coordinates.x + half) / (half * 2)) * spanX,
      y: bbox.minY + ((poi.coordinates.y + half) / (half * 2)) * spanY,
    },
  }));

  // Cluster de 100 operadores por amostragem de rejeição dentro do contorno
  const operators: Vec2[] = [];
  let guard = 0;
  while (operators.length < 100 && guard < 20_000) {
    guard += 1;
    const candidate: Vec2 = {
      x: bbox.minX + rng() * spanX,
      y: bbox.minY + rng() * spanY,
    };
    if (pointInPolygon(candidate, geometry.outline)) operators.push(candidate);
  }

  // Ponto de ingresso Zu (portal canônico #229) — posição determinística
  const zuPoints: MapZuPoint[] = [];
  let zuGuard = 0;
  while (zuPoints.length < 1 && zuGuard < 20_000) {
    zuGuard += 1;
    const candidate: Vec2 = { x: (rng() - 0.5) * spanX * 0.4, y: (rng() - 0.5) * spanY * 0.4 };
    if (pointInPolygon(candidate, geometry.outline)) {
      zuPoints.push({ id: def.zuSpec.locationLabel, pos: candidate });
    }
  }

  // Trajetória de dropship: bezier de fora do ring até um ponto semeado
  const corner = Math.floor(rng() * 4);
  const outside = 1.35;
  const dropCandidates = operators.length > 0 ? operators : [{ x: 0, y: 0 }];
  const drop = dropCandidates[Math.floor(rng() * dropCandidates.length)];
  const fromByCorner: Vec2[] = [
    { x: -bbox.maxX * outside, y: -bbox.maxY * outside },
    { x: bbox.maxX * outside, y: -bbox.maxY * outside },
    { x: bbox.maxX * outside, y: bbox.maxY * outside },
    { x: -bbox.maxX * outside, y: bbox.maxY * outside },
  ];
  const dropship = {
    from: fromByCorner[corner],
    control: { x: drop.x * 0.5, y: drop.y * 1.5 },
    to: drop,
  };

  return { pois, operators, zuPoints, dropship };
}

/* ─── Renderização ─── */

function bezierAt(t: number, from: Vec2, control: Vec2, to: Vec2): Vec2 {
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
  };
}

export interface WorldMapPreviewProps {
  worldId: WorldId;
  className?: string;
  /** Desativa animação (zona/dropship) para snapshots determinísticos. */
  animated?: boolean;
  /** Altura do canvas em px (default responsivo 320). */
  height?: number;
}

export function WorldMapPreview({
  worldId,
  className,
  animated = true,
  height = 320,
}: WorldMapPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const def = KHAAOS_WORLDS[worldId];
  const dims = WORLD_RING_DIMENSIONS[worldId];

  const geometry = useMemo(() => buildRingGeometry(worldId), [worldId]);
  const entities = useMemo(() => deriveEntities(worldId, geometry), [worldId, geometry]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let disposed = false;

    const accent = def.accentColor;

    const render = (timeMs: number) => {
      if (disposed) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssWidth = wrap.clientWidth || 640;
      const cssHeight = height;
      if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      // fundo
      ctx.fillStyle = "#07070c";
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      const bbox = polygonBoundingBox(geometry.outline);
      const spanX = Math.max(bbox.maxX - bbox.minX, 1e-6);
      const spanY = Math.max(bbox.maxY - bbox.minY, 1e-6);
      const padLeft = 56;
      const padRight = 30;
      const padTop = 26;
      const padBottom = 58;
      const scale = Math.min(
        (cssWidth - padLeft - padRight) / spanX,
        (cssHeight - padTop - padBottom) / spanY,
      );
      const offsetX = padLeft + (cssWidth - padLeft - padRight - spanX * scale) / 2;
      const offsetY = padTop + (cssHeight - padTop - padBottom - spanY * scale) / 2;
      const toPx = (p: Vec2): Vec2 => ({
        x: offsetX + (p.x - bbox.minX) * scale,
        y: offsetY + (p.y - bbox.minY) * scale,
      });

      // ── contorno orgânico + preenchimento
      const outlinePx = geometry.outline.map(toPx);
      ctx.beginPath();
      outlinePx.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // ── ruas internas
      if (geometry.streets.length > 0) {
        ctx.lineWidth = 0.7;
        ctx.strokeStyle = "rgba(255,255,255,0.14)";
        for (const street of geometry.streets) {
          ctx.beginPath();
          street.forEach((p, i) => {
            const q = toPx(p);
            if (i === 0) ctx.moveTo(q.x, q.y);
            else ctx.lineTo(q.x, q.y);
          });
          ctx.stroke();
        }
      }

      // ── anel de zona pulsante/contraindo (fases do contrato compartilhado)
      const phases = def.safeZonePhases;
      const loopMs = 12_000;
      const t = animated ? (timeMs % loopMs) / loopMs : 0.999;
      const phasePos = t * phases.length;
      const phaseIdx = Math.min(phases.length - 1, Math.floor(phasePos));
      const phase = phases[phaseIdx];
      const nextPhase = phases[Math.min(phases.length - 1, phaseIdx + 1)];
      const phaseT = phaseIdx === phases.length - 1 ? 1 : phasePos - phaseIdx;
      const radiusMeters = phase.radiusMeters + (nextPhase.radiusMeters - phase.radiusMeters) * phaseT;
      const halfWorld = def.sizeMeters / 2;
      const ringRadiusPx = (radiusMeters / (halfWorld * 2)) * spanX * scale;
      const center = toPx({ x: phase.center.x / halfWorld * halfWorld * 0 + 0, y: 0 });
      const pulse = animated ? 1 + 0.012 * Math.sin(timeMs / 220) : 1;
      ctx.beginPath();
      ctx.arc(center.x, center.y, Math.max(2, ringRadiusPx * pulse), 0, Math.PI * 2);
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(0,240,255,0.85)";
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(0,240,255,0.75)";
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText(
        `ZONA F${phase.phaseIndex + 1} · ${Math.round(radiusMeters)} m`,
        center.x + 6,
        center.y - Math.max(2, ringRadiusPx * pulse) - 6,
      );

      // ── trajetória de dropship bezier animada
      const { from, control, to } = entities.dropship;
      const fromPx = toPx(from);
      const ctrlPx = toPx(control);
      const toPxPoint = toPx(to);
      ctx.beginPath();
      ctx.moveTo(fromPx.x, fromPx.y);
      ctx.quadraticCurveTo(ctrlPx.x, ctrlPx.y, toPxPoint.x, toPxPoint.y);
      ctx.setLineDash([3, 6]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,200,60,0.5)";
      ctx.stroke();
      ctx.setLineDash([]);
      const shipT = animated ? (timeMs % 6_000) / 6_000 : 1;
      const shipPos = toPx(bezierAt(shipT, from, control, to));
      ctx.beginPath();
      ctx.arc(shipPos.x, shipPos.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "#ffc83c";
      ctx.fill();
      ctx.fillStyle = "rgba(255,200,60,0.8)";
      ctx.font = "8px ui-monospace, monospace";
      ctx.fillText("DROPSHIP", shipPos.x + 5, shipPos.y - 4);

      // ── cluster de 100 operadores
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      for (const op of entities.operators) {
        const q = toPx(op);
        ctx.beginPath();
        ctx.arc(q.x, q.y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── POIs com tier T1–T3
      ctx.font = "8px ui-monospace, monospace";
      for (const poi of entities.pois) {
        const q = toPx(poi.pos);
        const tierColor = poi.tier === 3 ? "#ff3366" : poi.tier === 2 ? "#ffc83c" : "#7dff8a";
        ctx.beginPath();
        if (poi.tier === 3) {
          // estrela T3
          for (let s = 0; s < 5; s += 1) {
            const a = (-Math.PI / 2) + (s * Math.PI * 2) / 5;
            const a2 = a + Math.PI / 5;
            const r1 = 4.4;
            const r2 = 2;
            ctx.lineTo(q.x + r1 * Math.cos(a), q.y + r1 * Math.sin(a));
            ctx.lineTo(q.x + r2 * Math.cos(a2), q.y + r2 * Math.sin(a2));
          }
          ctx.closePath();
        } else if (poi.tier === 2) {
          ctx.moveTo(q.x, q.y - 3.6);
          ctx.lineTo(q.x + 3.6, q.y);
          ctx.lineTo(q.x, q.y + 3.6);
          ctx.lineTo(q.x - 3.6, q.y);
          ctx.closePath();
        } else {
          ctx.arc(q.x, q.y, 2.6, 0, Math.PI * 2);
        }
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = tierColor;
        ctx.stroke();
        ctx.fillStyle = tierColor;
        ctx.fillText(`T${poi.tier} ${poi.name}`, q.x + 6, q.y + 3);
      }

      // ── ponto Zu (ingresso canônico)
      for (const zu of entities.zuPoints) {
        const q = toPx(zu.pos);
        ctx.beginPath();
        ctx.arc(q.x, q.y, 3, 0, Math.PI * 2);
        ctx.strokeStyle = "#c084fc";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(q.x, q.y, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = "#c084fc";
        ctx.fill();
        ctx.fillStyle = "#c084fc";
        ctx.fillText(`ZU · ${zu.id}`, q.x + 6, q.y - 4);
      }

      // ── barra de escala métrica (20 m + 10 m)
      const metersPerPx = spanX / (spanX * scale);
      void metersPerPx;
      const barMeters = spanX > 200 ? 50 : 20;
      const barPx = barMeters * scale;
      const bx = padLeft;
      const by = cssHeight - 26;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(bx, by - 4);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + barPx / 2, by);
      ctx.lineTo(bx + barPx / 2, by - 2.5);
      ctx.lineTo(bx + barPx, by);
      ctx.lineTo(bx + barPx, by - 4);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText(`${barMeters} m`, bx + barPx / 2 - 8, by - 7);

      // ── bússola (N)
      const cx = cssWidth - 22;
      const cy = padTop + 16;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 9);
      ctx.lineTo(cx + 4, cy + 6);
      ctx.lineTo(cx, cy + 3);
      ctx.lineTo(cx - 4, cy + 6);
      ctx.closePath();
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText("N", cx - 3, cy - 12);

      // ── legenda de contrato (rodapé do canvas)
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText(
        `${dims.areaM2.toLocaleString("pt-BR")} m² · ${dims.boundingBoxM.widthM}×${dims.boundingBoxM.depthM} m · perímetro ${dims.perimeterM} m · ${dims.densityM2PerOperator} m²/op · ${toOperationalWorldId(worldId)}`,
        padLeft,
        cssHeight - 8,
      );

      if (animated) raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
  }, [animated, def, dims, entities, geometry, height, worldId]);

  const ariaLabel = `Mapa tático do ring ${def.name} (${dims.shapeNote}) — área ${dims.areaM2} m², 100 operadores`;

  return (
    <div
      ref={wrapRef}
      className={cn("relative w-full overflow-hidden border border-border/40 bg-black/60", className)}
      data-testid={`world-map-preview-${worldId}`}
    >
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} className="block" />
      <div className="pointer-events-none absolute right-2 top-2 border border-border/50 bg-black/70 px-2 py-0.5 font-mono text-[9px] tracking-[0.2em] text-muted-foreground">
        {dims.shape.toUpperCase()}
      </div>
    </div>
  );
}

export default WorldMapPreview;
