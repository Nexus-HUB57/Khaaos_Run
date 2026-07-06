import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePlayer } from "@/hooks/use-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Radio, Zap, Skull, Heart, Play, Square, AlertTriangle, Clock,
  Target, Shield, Activity, ChevronRight, RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ZoneStatus } from "@shared/schema";
import { ZONE_PHASES } from "@shared/schema";

// ─── Canvas drawing (BP_SafeZone visual equivalent) ──────────────────────────

function drawZoneCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  currentRadius: number,   // 0-100 pct
  targetRadius: number,
  playerX: number,         // 0-1 normalized
  playerY: number,
  centerX: number,         // 0-100 pct
  centerY: number,
  isActive: boolean,
  isShrinking: boolean,
  isOutside: boolean,
  tick: number,
) {
  const cx = (centerX / 100) * w;
  const cy = (centerY / 100) * h;
  const maxR = Math.min(w, h) * 0.48;
  const curR = (currentRadius / 100) * maxR;
  const tgtR = (targetRadius / 100) * maxR;
  const px = playerX * w;
  const py = playerY * h;

  // ── Background ──
  ctx.fillStyle = "#0a0610";
  ctx.fillRect(0, 0, w, h);

  // Tactical grid
  ctx.strokeStyle = "rgba(100,60,180,0.12)";
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x < w; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Terrain blobs (visual only)
  const terrains = [
    { x: 0.2, y: 0.3, r: 0.07, c: "rgba(40,80,40,0.25)" },
    { x: 0.7, y: 0.2, r: 0.06, c: "rgba(40,80,40,0.2)" },
    { x: 0.6, y: 0.7, r: 0.08, c: "rgba(40,80,40,0.22)" },
    { x: 0.15, y: 0.65, r: 0.05, c: "rgba(40,80,40,0.18)" },
    { x: 0.8, y: 0.55, r: 0.06, c: "rgba(40,80,40,0.2)" },
  ];
  terrains.forEach(t => {
    ctx.beginPath();
    ctx.arc(t.x * w, t.y * h, t.r * Math.min(w, h), 0, Math.PI * 2);
    ctx.fillStyle = t.c;
    ctx.fill();
  });

  if (!isActive) {
    // Idle state — show full zone outline only
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120,80,220,0.3)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center marker
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(120,80,220,0.5)";
    ctx.fill();

    // "ZONA INATIVA" text
    ctx.font = "bold 14px 'Share Tech Mono', monospace";
    ctx.fillStyle = "rgba(120,80,220,0.5)";
    ctx.textAlign = "center";
    ctx.fillText("ZONA INATIVA", cx, cy - 20);
    return;
  }

  // ── Outside-zone danger fill ──
  if (isOutside) {
    const pulse = 0.08 + 0.04 * Math.sin(tick * 0.15);
    ctx.fillStyle = `rgba(220,30,30,${pulse})`;
    ctx.fillRect(0, 0, w, h);
    // Clip safe zone out of danger fill
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(cx, cy, curR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    // Re-draw background inside safe zone
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, curR, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#0a0610";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(100,60,180,0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    terrains.forEach(t => {
      ctx.beginPath();
      ctx.arc(t.x * w, t.y * h, t.r * Math.min(w, h), 0, Math.PI * 2);
      ctx.fillStyle = t.c;
      ctx.fill();
    });
    ctx.restore();
  }

  // ── Next zone circle (target — dashed orange) ──
  if (isShrinking && tgtR < curR) {
    ctx.beginPath();
    ctx.arc(cx, cy, tgtR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(220,100,20,0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    ctx.font = "10px 'Share Tech Mono', monospace";
    ctx.fillStyle = "rgba(220,100,20,0.8)";
    ctx.textAlign = "center";
    ctx.fillText("PRÓXIMA ZONA", cx, cy - tgtR - 6);
  }

  // ── Current zone gradient fill (safe area) ──
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, curR);
  grad.addColorStop(0, "rgba(0,160,220,0.04)");
  grad.addColorStop(0.7, "rgba(0,160,220,0.02)");
  grad.addColorStop(1, "rgba(0,180,255,0.08)");
  ctx.beginPath();
  ctx.arc(cx, cy, curR, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // ── Zone boundary wall (glowing blue line) ──
  const wallPulse = 0.8 + 0.2 * Math.sin(tick * 0.08);
  // Outer glow
  ctx.beginPath();
  ctx.arc(cx, cy, curR, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(0,160,255,${0.2 * wallPulse})`;
  ctx.lineWidth = 12;
  ctx.stroke();
  // Core line
  ctx.beginPath();
  ctx.arc(cx, cy, curR, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(0,200,255,${0.9 * wallPulse})`;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // ── Center crosshair ──
  const crossSize = 6;
  ctx.strokeStyle = "rgba(180,140,255,0.6)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - crossSize, cy); ctx.lineTo(cx + crossSize, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - crossSize); ctx.lineTo(cx, cy + crossSize); ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(180,140,255,0.7)";
  ctx.fill();

  // ── Player dot ──
  const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
  const outside = dist > curR;
  const playerColor = outside ? "#ff3333" : "#ff8800";
  const playerGlow = outside ? "rgba(255,50,50,0.5)" : "rgba(255,136,0,0.5)";

  // Glow
  ctx.beginPath();
  ctx.arc(px, py, 10, 0, Math.PI * 2);
  ctx.fillStyle = playerGlow;
  ctx.fill();
  // Dot
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fillStyle = playerColor;
  ctx.fill();
  // Crosshair arms
  const pCross = 10;
  ctx.strokeStyle = playerColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(px - pCross, py); ctx.lineTo(px - 7, py); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px + 7, py); ctx.lineTo(px + pCross, py); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px, py - pCross); ctx.lineTo(px, py - 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px, py + 7); ctx.lineTo(px, py + pCross); ctx.stroke();

  // ── Radius label ──
  ctx.font = "11px 'Share Tech Mono', monospace";
  ctx.fillStyle = "rgba(0,200,255,0.8)";
  ctx.textAlign = "left";
  ctx.fillText(`R: ${currentRadius.toFixed(1)}%`, cx + curR + 8, cy + 4);

  // ── "FORA DA ZONA" warning ──
  if (outside) {
    const alpha = 0.7 + 0.3 * Math.sin(tick * 0.2);
    ctx.font = `bold 13px 'Share Tech Mono', monospace`;
    ctx.fillStyle = `rgba(255,60,60,${alpha})`;
    ctx.textAlign = "center";
    ctx.fillText("⚠ FORA DA ZONA SEGURA", cx, 22);
  }
}

// ─── Damage log entry ─────────────────────────────────────────────────────────
interface DamageEvent { id: number; damage: number; newHealth: number; time: Date; }

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ZonaPage() {
  const qc = useQueryClient();
  const { data: playerData, refetch: refetchPlayer } = usePlayer();

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const tickRef = useRef(0);

  // Smooth animation state (like Timeline lerp in Unreal)
  const lerpRadiusRef = useRef(100);

  // Player position on canvas (normalized 0-1)
  const [playerPos, setPlayerPos] = useState({ x: 0.5, y: 0.5 });
  const playerPosRef = useRef({ x: 0.5, y: 0.5 });

  // Damage system
  const [damageLog, setDamageLog] = useState<DamageEvent[]>([]);
  const [isOutside, setIsOutside] = useState(false);
  const isOutsideRef = useRef(false);
  const damageTimerRef = useRef<NodeJS.Timeout | null>(null);
  const logIdRef = useRef(0);

  // Poll zone status every 2 seconds
  const { data: zoneStatus } = useQuery<ZoneStatus>({
    queryKey: ["/api/zone/status"],
    refetchInterval: 2000,
  });

  const startZone = useMutation({
    mutationFn: () => apiRequest("POST", "/api/zone/start", { centerX: 50, centerY: 50 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/zone/status"] }),
  });

  const stopZone = useMutation({
    mutationFn: () => apiRequest("POST", "/api/zone/stop"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/zone/status"] });
      setDamageLog([]);
    },
  });

  const applyDamage = useMutation({
    mutationFn: (damage: number) => apiRequest("POST", "/api/zone/damage", { damage }),
    onSuccess: (data: any) => {
      setDamageLog(prev => [
        { id: logIdRef.current++, damage: data.damageTaken, newHealth: data.newHealth, time: new Date() },
        ...prev.slice(0, 9),
      ]);
      qc.invalidateQueries({ queryKey: ["/api/player/me"] });
    },
  });

  const healPlayer = useMutation({
    mutationFn: () => apiRequest("POST", "/api/zone/heal", { amount: 100 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/player/me"] }),
  });

  // Sync lerp target when zone status updates
  useEffect(() => {
    if (zoneStatus) {
      // Update outside detection
      const canvas = canvasRef.current;
      if (canvas) {
        const w = canvas.width;
        const h = canvas.height;
        const cx = (zoneStatus.centerX / 100) * w;
        const cy = (zoneStatus.centerY / 100) * h;
        const maxR = Math.min(w, h) * 0.48;
        const curR = (zoneStatus.currentRadiusPct / 100) * maxR;
        const { x, y } = playerPosRef.current;
        const px = x * w;
        const py = y * h;
        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        const outside = zoneStatus.isActive && dist > curR;
        setIsOutside(outside);
        isOutsideRef.current = outside;
      }
    }
  }, [zoneStatus]);

  // Damage timer — Set Timer by Event equivalent (1 second tick)
  useEffect(() => {
    if (damageTimerRef.current) clearInterval(damageTimerRef.current);
    if (!zoneStatus?.isActive) return;

    damageTimerRef.current = setInterval(() => {
      if (isOutsideRef.current && zoneStatus) {
        applyDamage.mutate(zoneStatus.damagePerTick);
      }
    }, 1000);

    return () => { if (damageTimerRef.current) clearInterval(damageTimerRef.current); };
  }, [zoneStatus?.isActive, zoneStatus?.damagePerTick]);

  // Canvas animation loop (requestAnimationFrame — Timeline equivalent)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      tickRef.current++;
      const tick = tickRef.current;

      const w = canvas.width;
      const h = canvas.height;
      const status = zoneStatus;

      // Smooth lerp toward current radius (like Unreal Timeline interpolation)
      if (status) {
        lerpRadiusRef.current += (status.currentRadiusPct - lerpRadiusRef.current) * 0.04;
      }

      const currentRadius = lerpRadiusRef.current;
      const targetRadius = status?.targetRadiusPct ?? currentRadius;
      const { x, y } = playerPosRef.current;
      const centerX = status?.centerX ?? 50;
      const centerY = status?.centerY ?? 50;
      const isActive = status?.isActive ?? false;
      const isShrinking = status?.isShrinking ?? false;

      // Recompute outside status every frame for smooth feedback
      const cx = (centerX / 100) * w;
      const cy = (centerY / 100) * h;
      const maxR = Math.min(w, h) * 0.48;
      const curR = (currentRadius / 100) * maxR;
      const px = x * w;
      const py = y * h;
      const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      const frameOutside = isActive && dist > curR;

      drawZoneCanvas(ctx, w, h, currentRadius, targetRadius, x, y, centerX, centerY, isActive, isShrinking, frameOutside, tick);
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [zoneStatus]);

  // Canvas click → move player (Get Distance To equivalent)
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const clamped = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    setPlayerPos(clamped);
    playerPosRef.current = clamped;

    // Recompute outside status
    if (zoneStatus) {
      const w = canvas.width;
      const h = canvas.height;
      const cx2 = (zoneStatus.centerX / 100) * w;
      const cy2 = (zoneStatus.centerY / 100) * h;
      const maxR = Math.min(w, h) * 0.48;
      const curR = (zoneStatus.currentRadiusPct / 100) * maxR;
      const px = clamped.x * w;
      const py = clamped.y * h;
      const dist2 = Math.sqrt((px - cx2) ** 2 + (py - cy2) ** 2);
      const outside = zoneStatus.isActive && dist2 > curR;
      setIsOutside(outside);
      isOutsideRef.current = outside;
    }
  }, [zoneStatus]);

  const health = playerData?.stats?.health ?? 100;
  const maxHealth = playerData?.stats?.maxHealth ?? 100;
  const healthPct = (health / maxHealth) * 100;

  const phaseConfig = zoneStatus ? ZONE_PHASES[Math.min(zoneStatus.currentPhase - 1, ZONE_PHASES.length - 1)] : ZONE_PHASES[0];

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Radio className={cn("w-5 h-5", zoneStatus?.isActive ? "text-cyan-400 animate-pulse" : "text-muted-foreground")} />
            <h1 className="text-2xl font-display font-bold tracking-widest text-foreground">
              ZONA SEGURA
            </h1>
            <Badge className={cn(
              "font-mono text-xs tracking-widest",
              zoneStatus?.isActive
                ? zoneStatus.isShrinking
                  ? "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse"
                  : "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                : "bg-muted/20 text-muted-foreground border-muted/30"
            )}>
              {zoneStatus?.isActive ? (zoneStatus.isShrinking ? "⚡ ENCOLHENDO" : "✓ AGUARDANDO") : "INATIVA"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono tracking-widest">
            BP_SAFEZONE · CÍRCULO DO MAPA · {ZONE_PHASES.length} FASES
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!zoneStatus?.isActive ? (
            <Button
              data-testid="button-start-zone"
              onClick={() => startZone.mutate()}
              disabled={startZone.isPending}
              className="bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 font-display tracking-widest text-xs gap-2"
              variant="outline"
            >
              <Play className="w-4 h-4" />
              ATIVAR ZONA
            </Button>
          ) : (
            <Button
              data-testid="button-stop-zone"
              onClick={() => stopZone.mutate()}
              disabled={stopZone.isPending}
              variant="outline"
              className="border-red-500/40 text-red-400 hover:bg-red-500/10 font-display tracking-widest text-xs gap-2"
            >
              <Square className="w-4 h-4" />
              DESATIVAR
            </Button>
          )}
          <Button
            data-testid="button-heal-player"
            onClick={() => healPlayer.mutate()}
            disabled={healPlayer.isPending}
            variant="outline"
            className="border-green-500/40 text-green-400 hover:bg-green-500/10 font-display tracking-widest text-xs gap-2"
          >
            <Heart className="w-4 h-4" />
            CURAR
          </Button>
        </div>
      </div>

      {/* Main grid: Canvas + Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Canvas — zone visualization */}
        <div className="lg:col-span-2 relative">
          <div className="relative rounded border border-border bg-black/60 overflow-hidden"
            style={{ aspectRatio: "4/3" }}>
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              data-testid="canvas-safe-zone"
              onClick={handleCanvasClick}
              className="w-full h-full cursor-crosshair"
              style={{ imageRendering: "pixelated" }}
            />
            {/* Overlay instructions */}
            <div className="absolute bottom-3 left-3 text-[10px] font-mono text-muted-foreground/60 select-none">
              CLIQUE NO MAPA PARA MOVER OPERATIVO
            </div>
            {/* Outside danger overlay label */}
            {isOutside && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded bg-red-500/20 border border-red-500/40 animate-pulse">
                <span className="text-red-400 font-mono font-bold text-xs tracking-widest flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3" />
                  TOMANDO DANO: -{phaseConfig.damagePerTick} VIT/s
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Control panel */}
        <div className="flex flex-col gap-4">
          {/* Player vitals */}
          <div className="rounded border border-border bg-card/60 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-red-400" />
              <span className="text-xs font-display tracking-widest text-muted-foreground">VITALIDADE</span>
            </div>
            <div className="flex items-center justify-between">
              <span data-testid="text-health-current" className={cn(
                "text-2xl font-mono font-bold",
                healthPct < 25 ? "text-red-400 animate-pulse" : healthPct < 50 ? "text-yellow-400" : "text-green-400"
              )}>
                {health}
              </span>
              <span className="text-sm text-muted-foreground font-mono">/ {maxHealth}</span>
            </div>
            <Progress
              value={healthPct}
              data-testid="progress-health"
              className="h-2"
              style={{
                background: "rgba(255,0,0,0.15)",
              }}
            />
            {health <= 0 && (
              <div className="text-center text-red-400 font-display text-xs tracking-widest animate-pulse">
                <Skull className="w-5 h-5 mx-auto mb-1" />
                ELIMINADO
              </div>
            )}
          </div>

          {/* Zone phase info */}
          <div className="rounded border border-border bg-card/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-display tracking-widest text-muted-foreground">STATUS DA ZONA</span>
            </div>

            {/* Phase indicator */}
            <div className="flex items-center gap-2">
              {ZONE_PHASES.map((p, i) => (
                <div
                  key={p.phase}
                  data-testid={`zone-phase-indicator-${p.phase}`}
                  className={cn(
                    "flex-1 h-2 rounded-full transition-all duration-500",
                    !zoneStatus?.isActive
                      ? "bg-muted/20"
                      : i < (zoneStatus?.currentPhase ?? 1) - 1
                        ? "bg-cyan-400/40"
                        : i === (zoneStatus?.currentPhase ?? 1) - 1
                          ? "bg-cyan-400 shadow-[0_0_8px_rgba(0,200,255,0.7)]"
                          : "bg-muted/20"
                  )}
                />
              ))}
            </div>
            <div className="text-center">
              <span className="text-xs font-mono text-muted-foreground">
                FASE {zoneStatus?.currentPhase ?? 1} / {ZONE_PHASES.length}
              </span>
            </div>

            {/* Current radius */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-mono text-xs">Raio Atual</span>
              <span data-testid="text-zone-radius" className="font-mono font-bold text-cyan-400">
                {(zoneStatus?.currentRadiusPct ?? 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-mono text-xs">Raio Alvo</span>
              <span className="font-mono text-orange-400">
                {(zoneStatus?.targetRadiusPct ?? (ZONE_PHASES[0].radiusPct)).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground font-mono text-xs">Dano/seg</span>
              <span className={cn("font-mono font-bold", isOutside && zoneStatus?.isActive ? "text-red-400 animate-pulse" : "text-muted-foreground")}>
                -{phaseConfig.damagePerTick} VIT
              </span>
            </div>
          </div>

          {/* Timer */}
          {zoneStatus?.isActive && (
            <div className={cn(
              "rounded border p-4 text-center",
              zoneStatus.isShrinking
                ? "border-red-500/40 bg-red-500/10"
                : "border-cyan-500/40 bg-cyan-500/10"
            )}>
              <div className="flex items-center justify-center gap-2 mb-2">
                <Clock className={cn("w-4 h-4", zoneStatus.isShrinking ? "text-red-400 animate-spin" : "text-cyan-400")} />
                <span className="text-xs font-display tracking-widest text-muted-foreground">
                  {zoneStatus.isShrinking ? "ENCOLHENDO" : "PRÓXIMO ENCOLHIMENTO"}
                </span>
              </div>
              <div
                data-testid="text-zone-timer"
                className={cn(
                  "text-3xl font-mono font-bold",
                  zoneStatus.isShrinking ? "text-red-400" : "text-cyan-400"
                )}
              >
                {zoneStatus.isShrinking
                  ? formatTime(zoneStatus.shrinkTimeRemaining)
                  : formatTime(zoneStatus.waitTimeRemaining)
                }
              </div>
              {zoneStatus.isShrinking && (
                <div className="mt-2">
                  <Progress
                    value={zoneStatus.shrinkProgress * 100}
                    className="h-1"
                  />
                  <span className="text-[10px] font-mono text-muted-foreground mt-1 block">
                    {(zoneStatus.shrinkProgress * 100).toFixed(0)}% concluído
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Player position */}
          <div className="rounded border border-border bg-card/60 p-3 flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground">POSIÇÃO DO OPERATIVO</span>
            <div className="flex gap-2 text-xs font-mono">
              <span className="text-accent">X:{(playerPos.x * 100).toFixed(0)}</span>
              <span className="text-accent">Y:{(playerPos.y * 100).toFixed(0)}</span>
              <Badge className={cn(
                "text-[10px] py-0",
                isOutside && zoneStatus?.isActive
                  ? "bg-red-500/20 text-red-400 border-red-500/40"
                  : "bg-green-500/20 text-green-400 border-green-500/40"
              )}>
                {isOutside && zoneStatus?.isActive ? "FORA" : "DENTRO"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Phase progression table */}
      <div className="rounded border border-border bg-card/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-display tracking-widest text-foreground">FASES DA ZONA — CONFIGURAÇÃO BP_SAFEZONE</h2>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {ZONE_PHASES.map((phase, i) => {
            const isCurrentPhase = zoneStatus?.isActive && zoneStatus.currentPhase === phase.phase;
            const isPastPhase = zoneStatus?.isActive && (zoneStatus.currentPhase ?? 1) > phase.phase;
            return (
              <div
                key={phase.phase}
                data-testid={`card-zone-phase-${phase.phase}`}
                className={cn(
                  "rounded border p-3 text-center transition-all duration-500",
                  isCurrentPhase
                    ? "border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_12px_rgba(0,200,255,0.15)]"
                    : isPastPhase
                      ? "border-muted/20 bg-muted/5 opacity-50"
                      : "border-border bg-card/40"
                )}
              >
                <div className="flex items-center justify-center gap-1 mb-2">
                  {isCurrentPhase && <ChevronRight className="w-3 h-3 text-cyan-400" />}
                  <span className={cn(
                    "text-xs font-display tracking-widest",
                    isCurrentPhase ? "text-cyan-400" : "text-muted-foreground"
                  )}>
                    FASE {phase.phase}
                  </span>
                </div>
                <div className="space-y-1 text-[10px] font-mono">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Raio</span>
                    <span className="text-cyan-400">{phase.radiusPct}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Espera</span>
                    <span className="text-foreground">{phase.waitSeconds}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Encolhe</span>
                    <span className="text-orange-400">{phase.shrinkSeconds}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dano</span>
                    <span className="text-red-400">-{phase.damagePerTick}/s</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Damage event log */}
      {damageLog.length > 0 && (
        <div className="rounded border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Skull className="w-4 h-4 text-red-400" />
            <h2 className="text-xs font-display tracking-widest text-red-400">LOG DE DANO — ZONA SEGURA</h2>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground hover:text-foreground h-6 text-xs"
              onClick={() => setDamageLog([])}
            >
              Limpar
            </Button>
          </div>
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {damageLog.map(evt => (
              <div
                key={evt.id}
                data-testid={`log-damage-${evt.id}`}
                className="flex items-center gap-3 text-xs font-mono text-muted-foreground"
              >
                <span className="text-red-400 font-bold">-{evt.damage} VIT</span>
                <span className="text-foreground">→ {evt.newHealth} HP</span>
                <span className="ml-auto text-[10px] opacity-60">
                  {evt.time.toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
