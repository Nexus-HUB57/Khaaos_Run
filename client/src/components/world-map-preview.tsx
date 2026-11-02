/**
 * WorldMapPreview — mapa orgânico determinístico do ring (canvas 2D).
 *
 * Porta do preview validado no console web (README "Console Web + Mundos
 * canônicos, 2026-11-02"): RNG FNV-1a + LCG — o MESMO seed de mundo produz
 * o MESMO mapa byte a byte (sem Math.random). A forma segue o contrato
 * canônico `dimensions.shape` de @shared/worlds (fonte única com o server).
 *
 *   fortified_rectangle → vila militar murada com bastiões (CIGKV)
 *   urban_gridiron      → grid urbano irregular (Barburhen)
 *   organic_blob        → blob orgânico radial (Priadus)
 *   desert_basin        → bacia de dunas em arcos (Ckesalth)
 *   coastal_island      → ilha costeira com enseadas (Arukheea)
 */

import { useEffect, useRef } from "react";
import type { WorldId } from "@shared/worlds";
import { KHAAOS_WORLDS } from "@shared/worlds";
import { createLcg, worldPreviewSeed } from "@shared/world-preview-rng";

interface WorldMapPreviewProps {
  worldId: WorldId;
  /** Largura/altura do canvas em px CSS. */
  size?: number;
  className?: string;
}

export function WorldMapPreview({ worldId, size = 220, className }: WorldMapPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const world = KHAAOS_WORLDS[worldId];
    if (!canvas || !world) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rng = createLcg(worldPreviewSeed(worldId));
    const accent = world.accentColor;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size * 0.4;

    const draw = () => {
      // Fundo
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = "rgba(4,4,10,0.95)";
      ctx.fillRect(0, 0, size, size);

      // Grade de referência (hex-like sutil)
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo((size / 8) * i, 0);
        ctx.lineTo((size / 8) * i, size);
        ctx.moveTo(0, (size / 8) * i);
        ctx.lineTo(size, (size / 8) * i);
        ctx.stroke();
      }

      switch (world.dimensions.shape) {
        case "fortified_rectangle": {
          // Vila militar murada: retângulo + bastiões circulares nos cantos.
          const w = maxR * 1.6;
          const h = maxR * 1.05;
          const x0 = cx - w / 2;
          const y0 = cy - h / 2;
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.strokeRect(x0, y0, w, h);
          ctx.fillStyle = `${accent}22`;
          ctx.fillRect(x0, y0, w, h);
          // Bastiões
          const bastions = [
            [x0, y0], [x0 + w, y0], [x0, y0 + h], [x0 + w, y0 + h],
          ];
          for (const [bx, by] of bastions) {
            ctx.beginPath();
            ctx.arc(bx, by, maxR * 0.16, 0, Math.PI * 2);
            ctx.fillStyle = `${accent}55`;
            ctx.fill();
            ctx.stroke();
          }
          // Pátio interno + praça central
          ctx.strokeRect(x0 + w * 0.18, y0 + h * 0.18, w * 0.64, h * 0.64);
          ctx.beginPath();
          ctx.arc(cx, cy, maxR * 0.14, 0, Math.PI * 2);
          ctx.stroke();
          // Edificações determinísticas
          for (let i = 0; i < 14; i++) {
            const bx = x0 + w * (0.1 + rng() * 0.8);
            const by = y0 + h * (0.1 + rng() * 0.8);
            const bw = 4 + rng() * 9;
            const bh = 4 + rng() * 9;
            ctx.fillStyle = `${accent}88`;
            ctx.fillRect(bx, by, bw, bh);
          }
          break;
        }
        case "urban_gridiron": {
          // Grid urbano irregular: quarteirões com larguras variáveis + avenidas.
          const w = maxR * 1.7;
          const h = maxR * 1.0;
          const x0 = cx - w / 2;
          const y0 = cy - h / 2;
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1.6;
          let x = x0;
          while (x < x0 + w) {
            const bw = 10 + rng() * 22;
            ctx.beginPath();
            ctx.moveTo(x, y0);
            ctx.lineTo(x, y0 + h);
            ctx.stroke();
            x += bw;
          }
          let y = y0;
          while (y < y0 + h) {
            const bh = 8 + rng() * 18;
            ctx.beginPath();
            ctx.moveTo(x0, y);
            ctx.lineTo(x0 + w, y);
            ctx.stroke();
            y += bh;
          }
          // Avenidas diagonais
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(x0, y0 + h * (0.3 + rng() * 0.2));
          ctx.lineTo(x0 + w, y0 + h * (0.6 + rng() * 0.2));
          ctx.stroke();
          // Quadra destacada (POI central)
          ctx.fillStyle = `${accent}33`;
          ctx.fillRect(cx - 14, cy - 10, 28, 20);
          ctx.strokeRect(cx - 14, cy - 10, 28, 20);
          break;
        }
        case "organic_blob": {
          // Blob orgânico radial: raio = R * (1 + Σ harmônicos com fase rng).
          const harmonics = Array.from({ length: 5 }, () => ({
            amp: 0.06 + rng() * 0.14,
            freq: 2 + Math.floor(rng() * 6),
            phase: rng() * Math.PI * 2,
          }));
          const radiusAt = (theta: number) =>
            maxR * (1 + harmonics.reduce((acc, h) => acc + h.amp * Math.sin(h.freq * theta + h.phase), 0));
          ctx.beginPath();
          for (let t = 0; t <= 128; t++) {
            const theta = (t / 128) * Math.PI * 2;
            const r = radiusAt(theta);
            const px = cx + Math.cos(theta) * r;
            const py = cy + Math.sin(theta) * r * 0.92;
            if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = `${accent}22`;
          ctx.fill();
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.stroke();
          // Ilhotas internas (arquipélago)
          for (let i = 0; i < 7; i++) {
            const theta = rng() * Math.PI * 2;
            const rr = radiusAt(theta) * (0.15 + rng() * 0.55);
            ctx.beginPath();
            ctx.arc(cx + Math.cos(theta) * rr, cy + Math.sin(theta) * rr * 0.92, 3 + rng() * 7, 0, Math.PI * 2);
            ctx.fillStyle = `${accent}55`;
            ctx.fill();
          }
          break;
        }
        case "desert_basin": {
          // Bacia de dunas: elipse base + arcos concêntricos com jitter.
          ctx.beginPath();
          ctx.ellipse(cx, cy, maxR * 1.05, maxR * 0.62, 0, 0, Math.PI * 2);
          ctx.fillStyle = `${accent}18`;
          ctx.fill();
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.stroke();
          for (let i = 1; i <= 6; i++) {
            ctx.beginPath();
            const k = i / 6;
            ctx.ellipse(cx + (rng() - 0.5) * 8, cy + (rng() - 0.5) * 6, maxR * 1.05 * (1 - k), maxR * 0.62 * (1 - k), (rng() - 0.5) * 0.3, 0, Math.PI * 2);
            ctx.strokeStyle = `${accent}${(90 - i * 12).toString(16).padStart(2, "0")}`;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
          // Crista central
          ctx.beginPath();
          ctx.moveTo(cx - maxR * 0.7, cy + (rng() - 0.5) * 10);
          for (let i = 0; i <= 12; i++) {
            const px = cx - maxR * 0.7 + (i / 12) * maxR * 1.4;
            const py = cy + Math.sin(i * 1.3 + rng() * 0.6) * 8;
            ctx.lineTo(px, py);
          }
          ctx.strokeStyle = `${accent}cc`;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          break;
        }
        case "coastal_island": {
          // Ilha costeira: polígono radial com enseadas (recortes) + recife.
          const lobes = 7;
          const waves = Array.from({ length: 4 }, () => ({
            amp: 0.08 + rng() * 0.16,
            freq: 3 + Math.floor(rng() * 5),
            phase: rng() * Math.PI * 2,
          }));
          const radiusAt = (theta: number) => {
            let r = maxR * 0.95;
            for (const wv of waves) r += maxR * wv.amp * Math.sin(wv.freq * theta + wv.phase);
            // Enseadas: recortes em ângulos determinísticos
            for (let l = 0; l < lobes; l++) {
              const cove = (l / lobes) * Math.PI * 2 + 0.4;
              const d = Math.atan2(Math.sin(theta - cove), Math.cos(theta - cove));
              r -= maxR * 0.16 * Math.exp(-(d * d) / 0.08);
            }
            return r;
          };
          ctx.beginPath();
          for (let t = 0; t <= 144; t++) {
            const theta = (t / 144) * Math.PI * 2;
            const r = radiusAt(theta);
            const px = cx + Math.cos(theta) * r;
            const py = cy + Math.sin(theta) * r * 0.9;
            if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = `${accent}22`;
          ctx.fill();
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.stroke();
          // Recife externo tracejado
          ctx.setLineDash([4, 5]);
          ctx.beginPath();
          for (let t = 0; t <= 144; t++) {
            const theta = (t / 144) * Math.PI * 2;
            const r = radiusAt(theta) + maxR * 0.12;
            const px = cx + Math.cos(theta) * r;
            const py = cy + Math.sin(theta) * r * 0.9;
            if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.strokeStyle = `${accent}88`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.setLineDash([]);
          break;
        }
      }

      // Mira central + escala
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy);
      ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6);
      ctx.stroke();
      const barY = size - 14;
      ctx.beginPath();
      ctx.moveTo(10, barY); ctx.lineTo(46, barY);
      ctx.moveTo(10, barY - 3); ctx.lineTo(10, barY + 3);
      ctx.moveTo(46, barY - 3); ctx.lineTo(46, barY + 3);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.font = "9px monospace";
      ctx.fillText("0", 8, barY - 6);
      ctx.fillText(`${world.dimensions.bboxMeters.x} m`, 50, barY - 6);
      // Selo canonical
      ctx.fillStyle = accent;
      ctx.font = "bold 9px monospace";
      ctx.fillText(`CANONICO ${world.dimensions.areaM2.toLocaleString("pt-BR")} m2 · 100 OP`, 10, 16);
    };

    draw();
  }, [worldId, size]);

  return (
    <canvas
      ref={canvasRef}
      data-testid={`world-map-preview-${worldId}`}
      className={className}
      style={{ width: size, height: size, display: "block" }}
      aria-label={`Preview do mapa ${worldId}`}
      role="img"
    />
  );
}
