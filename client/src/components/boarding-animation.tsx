import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

// ── Phase sequence ────────────────────────────────────────────────────────────
const PHASES = [
  "IDLE",        // 0 — platform scene, player waiting
  "ARRIVING",    // 1 — train slides in from right
  "BRAKE",       // 2 — train shakes to a stop
  "DOORS_OPEN",  // 3 — doors slide open
  "BOARDING",    // 4 — avatar walks in
  "DOORS_CLOSE", // 5 — doors shut
  "DEPARTING",   // 6 — train leaves left
  "FADEOUT",     // 7 — black screen
] as const;

type Phase = typeof PHASES[number];

const PHASE_DURATION: Record<Phase, number> = {
  IDLE:        600,
  ARRIVING:    2200,
  BRAKE:       400,
  DOORS_OPEN:  700,
  BOARDING:    1600,
  DOORS_CLOSE: 700,
  DEPARTING:   1800,
  FADEOUT:     900,
};

// ── Easing helpers ────────────────────────────────────────────────────────────
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn  = (t: number) => t * t * t;
const lerp    = (a: number, b: number, t: number) => a + (b - a) * t;

// ── Canvas draw ───────────────────────────────────────────────────────────────
function draw(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  phase: Phase, phaseT: number,   // phaseT: 0..1 within phase
  globalT: number,                 // total elapsed ms
  trainX: number,                  // center X of train on canvas
  doorOpen: number,                // 0..1
  avatarX: number,                 // avatar X (0..1 of W)
  avatarAlpha: number,             // 1 → 0 when boarding
  fadeAlpha: number,               // 0 → 1 for final blackout
) {
  ctx.clearRect(0, 0, W, H);

  // ── Background ──────────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#060310");
  bg.addColorStop(1, "#0e0820");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Scanlines
  ctx.save();
  ctx.globalAlpha = 0.03;
  for (let y = 0; y < H; y += 3) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, y, W, 1);
  }
  ctx.restore();

  // City skyline silhouette
  const skyColor = "rgba(60,20,120,0.4)";
  const buildings = [
    [0, 0.55, 0.08, 0.45], [0.07, 0.48, 0.06, 0.52], [0.12, 0.52, 0.09, 0.48],
    [0.20, 0.44, 0.07, 0.56], [0.26, 0.58, 0.05, 0.42], [0.30, 0.46, 0.08, 0.54],
    [0.37, 0.50, 0.06, 0.50], [0.42, 0.42, 0.10, 0.58], [0.51, 0.55, 0.07, 0.45],
    [0.57, 0.47, 0.06, 0.53], [0.62, 0.43, 0.09, 0.57], [0.70, 0.51, 0.05, 0.49],
    [0.74, 0.58, 0.08, 0.42], [0.81, 0.46, 0.06, 0.54], [0.86, 0.52, 0.07, 0.48],
    [0.92, 0.48, 0.08, 0.52],
  ];
  buildings.forEach(([bx, by, bw, bh]) => {
    ctx.fillStyle = skyColor;
    ctx.fillRect(bx * W, by * H, bw * W, bh * H);
    // Window dots
    ctx.fillStyle = "rgba(255,200,80,0.4)";
    for (let wx = bx * W + 4; wx < (bx + bw) * W - 4; wx += 7) {
      for (let wy = by * H + 6; wy < H * 0.72; wy += 8) {
        if (Math.random() > 0.65) ctx.fillRect(wx, wy, 3, 3);
      }
    }
  });

  // Neon city glow (top)
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, W * 0.5);
  glow.addColorStop(0, "rgba(120,0,200,0.08)");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── Platform ─────────────────────────────────────────────────────────────────
  const platformY = H * 0.72;
  const platformH = H * 0.28;
  ctx.fillStyle = "#1a0d30";
  ctx.fillRect(0, platformY, W, platformH);

  // Platform edge glow
  ctx.strokeStyle = "rgba(180,80,255,0.5)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(180,80,255,0.8)";
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(0, platformY); ctx.lineTo(W, platformY); ctx.stroke();
  ctx.shadowBlur = 0;

  // Platform tiles
  ctx.strokeStyle = "rgba(100,40,160,0.2)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, platformY); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = platformY; y < H; y += 24) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Warning stripe on edge
  for (let x = 0; x < W; x += 28) {
    ctx.fillStyle = x % 56 < 28 ? "rgba(255,180,0,0.35)" : "rgba(0,0,0,0.2)";
    ctx.fillRect(x, platformY, 28, 6);
  }

  // ── Rails below platform edge ──────────────────────────────────────────────
  const railY1 = platformY - 4;
  const railY2 = platformY - 12;
  [railY1, railY2].forEach(ry => {
    ctx.fillStyle = "#555";
    ctx.fillRect(0, ry, W, 3);
    // Sleepers
    for (let x = 0; x < W; x += 18) {
      ctx.fillStyle = "#3a2a10";
      ctx.fillRect(x, ry - 3, 10, 9);
    }
  });

  // ── Platform signage ──────────────────────────────────────────────────────
  // Left pillar sign
  ctx.fillStyle = "rgba(120,0,200,0.7)";
  ctx.fillRect(30, platformY + 8, 90, 28);
  ctx.font = "bold 10px 'Share Tech Mono', monospace";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText("PLATAFORMA 01", 75, platformY + 27);

  // Blinking EMBARQUE sign (right side)
  const blink = Math.sin(globalT * 0.004) > 0;
  if (blink) {
    ctx.fillStyle = "rgba(255,120,0,0.8)";
    ctx.fillRect(W - 120, platformY + 8, 100, 28);
    ctx.shadowColor = "rgba(255,120,0,0.9)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#000";
    ctx.fillText("→ BATALHA", W - 70, platformY + 27);
    ctx.shadowBlur = 0;
  }

  // ── Train car ───────────────────────────────────────────────────────────────
  const carW = W * 0.65;
  const carH = H * 0.34;
  const carY = platformY - carH - 8;
  const carX = trainX - carW / 2;

  if (carX < W + 20 && carX + carW > -20) {
    // Train body
    const trainGrad = ctx.createLinearGradient(carX, carY, carX, carY + carH);
    trainGrad.addColorStop(0, "#1e0e3a");
    trainGrad.addColorStop(0.5, "#120828");
    trainGrad.addColorStop(1, "#0a0420");
    ctx.fillStyle = trainGrad;
    ctx.beginPath();
    ctx.roundRect(carX, carY, carW, carH, [8, 8, 0, 0]);
    ctx.fill();

    // Neon stripe on train
    ctx.strokeStyle = "rgba(120,40,255,0.8)";
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(120,40,255,1)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(carX + 8, carY + carH * 0.22);
    ctx.lineTo(carX + carW - 8, carY + carH * 0.22);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Orange bottom stripe
    ctx.strokeStyle = "rgba(255,120,0,0.7)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(255,120,0,0.8)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(carX, carY + carH * 0.9);
    ctx.lineTo(carX + carW, carY + carH * 0.9);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Windows
    const winW = 38, winH = 28, winY = carY + carH * 0.3;
    const winCount = 5;
    const winSpacing = (carW - 40) / (winCount - 1);
    for (let i = 0; i < winCount; i++) {
      const wx = carX + 20 + i * winSpacing - winW / 2;
      const windowFlicker = 0.7 + 0.3 * Math.sin(globalT * 0.003 + i * 1.3);
      ctx.fillStyle = `rgba(180,220,255,${0.15 * windowFlicker})`;
      ctx.strokeStyle = `rgba(100,180,255,${0.6 * windowFlicker})`;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = `rgba(100,180,255,${0.5 * windowFlicker})`;
      ctx.shadowBlur = 6;
      ctx.fillRect(wx, winY, winW, winH);
      ctx.strokeRect(wx, winY, winW, winH);
      ctx.shadowBlur = 0;
    }

    // Train border glow
    ctx.strokeStyle = "rgba(80,0,160,0.6)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(80,0,160,0.5)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(carX, carY, carW, carH, [8, 8, 0, 0]);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Brake sparks
    if (phase === "BRAKE") {
      const sparkCount = Math.floor(phaseT * 12);
      for (let s = 0; s < sparkCount; s++) {
        const sx = carX + carW * 0.15 + Math.random() * carW * 0.7;
        const sy = carY + carH;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,200,50,${Math.random()})`;
        ctx.shadowColor = "rgba(255,200,50,0.9)";
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // ── Doors ────────────────────────────────────────────────────────────────
    const doorCenterX = carX + carW * 0.5;
    const doorW = carW * 0.22;
    const doorH = carH * 0.75;
    const doorY = carY + carH - doorH;
    const maxDoorOpen = doorW * 0.48;
    const dOpen = doorOpen * maxDoorOpen;

    // Door glow channel
    if (doorOpen > 0.1) {
      const doorGlow = ctx.createLinearGradient(doorCenterX - dOpen, doorY, doorCenterX + dOpen, doorY);
      doorGlow.addColorStop(0, "transparent");
      doorGlow.addColorStop(0.5, `rgba(255,120,0,${0.35 * doorOpen})`);
      doorGlow.addColorStop(1, "transparent");
      ctx.fillStyle = doorGlow;
      ctx.fillRect(doorCenterX - dOpen, doorY, dOpen * 2, doorH);
    }

    // Left door panel
    ctx.fillStyle = "#1a0830";
    ctx.strokeStyle = "rgba(120,40,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "rgba(120,40,255,0.5)";
    ctx.shadowBlur = 6;
    ctx.fillRect(carX + carW * 0.5 - doorW / 2 - dOpen, doorY, doorW / 2, doorH);
    ctx.strokeRect(carX + carW * 0.5 - doorW / 2 - dOpen, doorY, doorW / 2, doorH);

    // Right door panel
    ctx.fillRect(carX + carW * 0.5 + dOpen, doorY, doorW / 2, doorH);
    ctx.strokeRect(carX + carW * 0.5 + dOpen, doorY, doorW / 2, doorH);
    ctx.shadowBlur = 0;
  }

  // ── Avatar ───────────────────────────────────────────────────────────────────
  const avX = avatarX * W;
  const avY = platformY + 12;
  ctx.save();
  ctx.globalAlpha = avatarAlpha;

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(avX, avY + 52, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Walk animation
  const walk = phase === "BOARDING" ? Math.sin(globalT * 0.018) * 4 : 0;

  // Body
  ctx.fillStyle = "#ff8800";
  ctx.shadowColor = "rgba(255,136,0,0.7)";
  ctx.shadowBlur = 10;
  // Head
  ctx.beginPath(); ctx.arc(avX, avY + 6, 7, 0, Math.PI * 2); ctx.fill();
  // Torso
  ctx.fillRect(avX - 6, avY + 13, 12, 18);
  // Legs
  ctx.fillRect(avX - 6, avY + 31, 5, 12 + Math.abs(walk));
  ctx.fillRect(avX + 1, avY + 31, 5, 12 - Math.abs(walk) * 0.5);
  // Arms
  ctx.fillRect(avX - 10, avY + 14, 4, 12 + walk * 0.5);
  ctx.fillRect(avX + 6, avY + 14, 4, 12 - walk * 0.5);

  // Rank tag above head
  ctx.font = "bold 8px 'Share Tech Mono', monospace";
  ctx.fillStyle = "#fbbf24";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(251,191,36,0.8)";
  ctx.shadowBlur = 6;
  ctx.fillText("OPERATIVO", avX, avY - 4);
  ctx.shadowBlur = 0;

  ctx.restore();

  // ── Phase overlay text ────────────────────────────────────────────────────
  ctx.textAlign = "center";

  const phaseMessages: Partial<Record<Phase, string>> = {
    IDLE:        "AGUARDANDO TREM — PLATAFORMA 01",
    ARRIVING:    "TREM SE APROXIMANDO...",
    BRAKE:       "FREANDO...",
    DOORS_OPEN:  "PORTAS ABRINDO — EMBARQUE AUTORIZADO",
    BOARDING:    "OPERATIVO EMBARCANDO...",
    DOORS_CLOSE: "PORTAS FECHANDO",
    DEPARTING:   "RUMO À BATALHA",
    FADEOUT:     "ENTRANDO NA ZONA DE CONFLITO...",
  };

  const msg = phaseMessages[phase] ?? "";
  if (msg) {
    ctx.font = "bold 12px 'Share Tech Mono', monospace";
    const msgAlpha = phase === "ARRIVING" || phase === "DEPARTING" || phase === "BOARDING" ? 1 : 0.85 + 0.15 * Math.sin(globalT * 0.004);
    ctx.fillStyle = `rgba(180,100,255,${msgAlpha})`;
    ctx.shadowColor = "rgba(180,100,255,0.8)";
    ctx.shadowBlur = 10;
    ctx.fillText(msg, W / 2, platformY - 20);
    ctx.shadowBlur = 0;
  }

  // ── Final fade overlay ────────────────────────────────────────────────────
  if (fadeAlpha > 0) {
    ctx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
    ctx.fillRect(0, 0, W, H);

    if (fadeAlpha > 0.5) {
      ctx.font = "bold 18px 'Cinzel', serif";
      ctx.fillStyle = `rgba(255,120,0,${(fadeAlpha - 0.5) * 2})`;
      ctx.shadowColor = "rgba(255,120,0,0.8)";
      ctx.shadowBlur = 20;
      ctx.textAlign = "center";
      ctx.fillText("ENTRANDO NA BATALHA", W / 2, H / 2);
      ctx.shadowBlur = 0;
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
interface BoardingAnimationProps {
  onClose: () => void;
}

export function BoardingAnimation({ onClose }: BoardingAnimationProps) {
  const [, navigate] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startRef = useRef<number>(0);
  const animRef = useRef<number>(0);
  const [phaseLabel, setPhaseLabel] = useState<Phase>("IDLE");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    startRef.current = performance.now();

    // Build timeline: cumulative start ms for each phase
    const phaseTimes: { phase: Phase; start: number; end: number }[] = [];
    let cursor = 0;
    for (const p of PHASES) {
      const dur = PHASE_DURATION[p];
      phaseTimes.push({ phase: p, start: cursor, end: cursor + dur });
      cursor += dur;
    }
    const totalDur = cursor;

    const W = canvas.width;
    const H = canvas.height;
    const platformY = H * 0.72;
    const carW = W * 0.65;
    const trainParkedX = W * 0.5;
    const trainStartX = W + carW;
    const trainEndX = -carW;

    function frame(now: number) {
      const elapsed = now - startRef.current;
      if (elapsed >= totalDur) {
        navigate("/batalha");
        onClose();
        return;
      }

      // Find current phase
      const current = phaseTimes.find(p => elapsed >= p.start && elapsed < p.end)
        ?? phaseTimes[phaseTimes.length - 1];
      const phaseT = Math.max(0, Math.min(1, (elapsed - current.start) / (current.end - current.start)));

      setPhaseLabel(current.phase);

      // Compute trainX
      let trainX = trainParkedX;
      if (current.phase === "ARRIVING") {
        trainX = lerp(trainStartX, trainParkedX, easeOut(phaseT));
      } else if (current.phase === "BRAKE") {
        const shake = Math.sin(phaseT * Math.PI * 14) * (1 - phaseT) * 5;
        trainX = trainParkedX + shake;
      } else if (current.phase === "IDLE" || current.phase === "ARRIVING") {
        trainX = trainStartX;
      } else if (current.phase === "DEPARTING") {
        trainX = lerp(trainParkedX, trainEndX, easeIn(phaseT));
      } else {
        trainX = trainParkedX;
      }

      // Door open 0..1
      let doorOpen = 0;
      if (current.phase === "DOORS_OPEN") doorOpen = easeOut(phaseT);
      else if (current.phase === "BOARDING") doorOpen = 1;
      else if (current.phase === "DOORS_CLOSE") doorOpen = 1 - easeIn(phaseT);

      // Avatar X (starts at 0.12 of W, moves toward door at 0.5)
      const doorXRel = 0.5;
      let avatarX = 0.12;
      let avatarAlpha = 1;
      if (current.phase === "BOARDING") {
        avatarX = lerp(0.12, doorXRel, easeOut(phaseT));
        // Fade avatar near end of boarding (last 30%)
        if (phaseT > 0.7) avatarAlpha = 1 - (phaseT - 0.7) / 0.3;
      } else if (["DOORS_CLOSE", "DEPARTING", "FADEOUT"].includes(current.phase)) {
        avatarX = doorXRel;
        avatarAlpha = 0;
      }

      // Fade alpha
      let fadeAlpha = 0;
      if (current.phase === "FADEOUT") fadeAlpha = phaseT;

      draw(ctx, W, H, current.phase, phaseT, elapsed, trainX, doorOpen, avatarX, avatarAlpha, fadeAlpha);

      animRef.current = requestAnimationFrame(frame);
    }

    animRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animRef.current);
  }, [navigate, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-3xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-xs font-mono text-purple-400 tracking-widest opacity-80">
            ● {phaseLabel} — SEQUÊNCIA DE EMBARQUE
          </div>
          <button
            data-testid="button-skip-boarding"
            onClick={() => { navigate("/batalha"); onClose(); }}
            className="text-[10px] font-mono text-muted-foreground hover:text-foreground tracking-widest px-2 py-1 border border-white/10 rounded hover:border-white/20 transition-colors"
          >
            PULAR [ESC]
          </button>
        </div>

        {/* Canvas */}
        <div className="rounded-lg overflow-hidden border border-purple-500/20 shadow-[0_0_40px_rgba(120,0,200,0.3)]">
          <canvas
            ref={canvasRef}
            width={760}
            height={400}
            data-testid="canvas-boarding"
            className="w-full block"
          />
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 via-primary to-accent rounded-full transition-all"
            style={{
              width: `${(PHASES.indexOf(phaseLabel) / (PHASES.length - 1)) * 100}%`,
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-muted-foreground/40 mt-1 px-1">
          <span>PLATAFORMA 01</span>
          <span>ZONA DE BATALHA</span>
        </div>
      </div>
    </div>
  );
}
