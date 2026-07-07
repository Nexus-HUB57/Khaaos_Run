import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePlayer } from "@/hooks/use-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LootItem } from "@shared/schema";
import { PlayerStatus } from "@shared/schema";
import {
  Package, Crosshair, Shield, Heart, Zap, Sparkles,
  RefreshCw, AlertTriangle, CheckCircle2, ChevronRight, Box
} from "lucide-react";

// ── Rarity config ─────────────────────────────────────────────────────────────
const RARITY = {
  COMUM:    { color: "#9ca3af", glow: "rgba(156,163,175,0.6)", label: "Comum",   border: "#6b7280" },
  RARO:     { color: "#60a5fa", glow: "rgba(96,165,250,0.7)",  label: "Raro",    border: "#3b82f6" },
  EPICO:    { color: "#a78bfa", glow: "rgba(167,139,250,0.7)", label: "Épico",   border: "#8b5cf6" },
  LENDARIO: { color: "#fbbf24", glow: "rgba(251,191,36,0.8)",  label: "Lendário",border: "#f59e0b" },
  MITICO:   { color: "#f87171", glow: "rgba(248,113,113,0.9)", label: "Mítico",  border: "#ef4444" },
} as const;

const TYPE_ICON: Record<string, string> = {
  ARMA: "⚔", DEFESA: "🛡", CURATIVO: "💊", UTILIDADE: "🎒", RECURSO: "📦",
};

// ── Canvas draw ───────────────────────────────────────────────────────────────
function drawLootCanvas(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  lootItems: LootItem[],
  playerX: number, playerY: number,
  nearbyId: number | null,
  tick: number,
) {
  // Background
  ctx.fillStyle = "#0a0610";
  ctx.fillRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = "rgba(100,60,180,0.1)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // Terrain blobs
  [
    { x: 0.18, y: 0.25, r: 0.08 }, { x: 0.72, y: 0.18, r: 0.07 },
    { x: 0.55, y: 0.72, r: 0.09 }, { x: 0.12, y: 0.68, r: 0.06 },
    { x: 0.83, y: 0.56, r: 0.07 }, { x: 0.42, y: 0.45, r: 0.05 },
  ].forEach(t => {
    ctx.beginPath();
    ctx.arc(t.x * w, t.y * h, t.r * Math.min(w, h), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(40,80,40,0.2)";
    ctx.fill();
  });

  // Loot items
  lootItems.forEach(item => {
    if (item.isPickedUp) return;
    const px = (item.posX / 100) * w;
    const py = (item.posY / 100) * h;
    const r = RARITY[item.rarity as keyof typeof RARITY] ?? RARITY.COMUM;
    const isNear = item.id === nearbyId;
    const pulse = isNear ? 0.7 + 0.3 * Math.sin(tick * 0.15) : 1;
    const size = isNear ? 12 : 9;

    // Glow
    ctx.shadowColor = r.glow;
    ctx.shadowBlur = isNear ? 18 * pulse : 10;
    ctx.fillStyle = r.color;
    ctx.fillRect(px - size, py - size, size * 2, size * 2);

    // Border
    ctx.shadowBlur = 0;
    ctx.strokeStyle = r.border;
    ctx.lineWidth = isNear ? 2.5 : 1.5;
    ctx.strokeRect(px - size, py - size, size * 2, size * 2);

    // Icon inside box
    ctx.font = `${size - 1}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.shadowBlur = 0;
    ctx.fillText(TYPE_ICON[item.type] ?? "📦", px, py);

    // Floating rarity label
    if (isNear) {
      const alpha = 0.8 + 0.2 * Math.sin(tick * 0.15);
      ctx.font = "bold 9px 'Share Tech Mono', monospace";
      ctx.fillStyle = `rgba(${r.color === "#fbbf24" ? "251,191,36" : r.color === "#a78bfa" ? "167,139,250" : "255,255,255"},${alpha})`;
      ctx.textAlign = "center";
      ctx.fillText(item.name.length > 14 ? item.name.slice(0, 13) + "…" : item.name, px, py - size - 8);
      // Pickup prompt
      ctx.font = "bold 8px 'Share Tech Mono', monospace";
      ctx.fillStyle = `rgba(255,200,50,${alpha})`;
      ctx.fillText("[COLETAR]", px, py + size + 10);
    }
  });

  // Player dot
  const ppx = playerX * w;
  const ppy = playerY * h;
  ctx.shadowColor = "rgba(255,136,0,0.8)";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(ppx, ppy, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#ff8800";
  ctx.fill();
  ctx.shadowBlur = 0;
  // Crosshair
  const cs = 12;
  ctx.strokeStyle = "#ff8800";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(ppx - cs, ppy); ctx.lineTo(ppx - 8, ppy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ppx + 8, ppy); ctx.lineTo(ppx + cs, ppy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ppx, ppy - cs); ctx.lineTo(ppx, ppy - 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ppx, ppy + 8); ctx.lineTo(ppx, ppy + cs); ctx.stroke();

  // Legend (bottom-left)
  const legendX = 8;
  let legendY = h - 70;
  Object.entries(RARITY).forEach(([key, r]) => {
    ctx.fillStyle = r.color;
    ctx.fillRect(legendX, legendY, 8, 8);
    ctx.font = "8px 'Share Tech Mono', monospace";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.textAlign = "left";
    ctx.fillText(r.label, legendX + 12, legendY + 7);
    legendY += 13;
  });
}

// ── Pickup log entry ──────────────────────────────────────────────────────────
interface PickupEvent { id: number; name: string; type: string; rarity: string; time: Date; }

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LootPage() {
  const qc = useQueryClient();
  const { data: playerData } = usePlayer();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const tickRef = useRef(0);

  const [playerPos, setPlayerPos] = useState({ x: 0.5, y: 0.5 });
  const playerPosRef = useRef({ x: 0.5, y: 0.5 });
  const [nearbyLoot, setNearbyLoot] = useState<LootItem | null>(null);
  const [pickupLog, setPickupLog] = useState<PickupEvent[]>([]);
  const logIdRef = useRef(0);

  const PICKUP_RADIUS = 0.09; // 9% of map

  const { data: lootItems = [] } = useQuery<LootItem[]>({
    queryKey: ["/api/loot"],
    refetchInterval: 3000,
  });

  const lootItemsRef = useRef<LootItem[]>([]);
  useEffect(() => { lootItemsRef.current = lootItems; }, [lootItems]);

  const spawnLoot = useMutation({
    mutationFn: () => apiRequest("POST", "/api/loot/spawn"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/loot"] }),
  });

  const pickupMutation = useMutation({
    mutationFn: (lootId: number) => apiRequest("POST", `/api/loot/${lootId}/pickup`),
    onSuccess: (data: any) => {
      setPickupLog(prev => [{
        id: logIdRef.current++,
        name: data.loot.name,
        type: data.loot.type,
        rarity: data.loot.rarity,
        time: new Date(),
      }, ...prev.slice(0, 14)]);
      qc.invalidateQueries({ queryKey: ["/api/loot"] });
      qc.invalidateQueries({ queryKey: ["/api/items"] });
      setNearbyLoot(null);
    },
  });

  // Find nearest loot item
  const computeNearby = useCallback((px: number, py: number, items: LootItem[]) => {
    let nearest: LootItem | null = null;
    let minDist = Infinity;
    items.forEach(item => {
      if (item.isPickedUp) return;
      const dx = px - item.posX / 100;
      const dy = py - item.posY / 100;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PICKUP_RADIUS && dist < minDist) {
        minDist = dist;
        nearest = item;
      }
    });
    setNearbyLoot(nearest);
  }, []);

  // Canvas animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      tickRef.current++;
      const { x, y } = playerPosRef.current;
      const items = lootItemsRef.current;

      // Recompute nearby every frame
      let nearestId: number | null = null;
      let minDist = Infinity;
      items.forEach(item => {
        if (item.isPickedUp) return;
        const dx = x - item.posX / 100;
        const dy = y - item.posY / 100;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < PICKUP_RADIUS && dist < minDist) { minDist = dist; nearestId = item.id; }
      });

      drawLootCanvas(ctx, canvas.width, canvas.height, items, x, y, nearestId, tickRef.current);
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setPlayerPos({ x, y });
    playerPosRef.current = { x, y };
    computeNearby(x, y, lootItemsRef.current);
  }, [computeNearby]);

  const isEliminated = playerData?.stats?.status === PlayerStatus.ELIMINADO;
  const available = lootItems.filter(i => !i.isPickedUp);
  const collected = lootItems.filter(i => i.isPickedUp);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Package className="w-5 h-5 text-accent" />
            <h1 className="text-2xl font-display font-bold tracking-widest text-foreground">SISTEMA DE LOOT</h1>
            <Badge className="font-mono text-xs tracking-widest bg-accent/20 text-accent border-accent/40">
              BP_LOOTBASE
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono tracking-widest">
            ST_ITEMDATA · SERVER_PICKUPITEM RPC · {available.length} ITENS DISPONÍVEIS
          </p>
        </div>
        <Button
          data-testid="button-spawn-loot"
          onClick={() => spawnLoot.mutate()}
          disabled={spawnLoot.isPending}
          variant="outline"
          className="border-accent/40 text-accent hover:bg-accent/10 font-display tracking-widest text-xs gap-2"
        >
          <RefreshCw className={cn("w-4 h-4", spawnLoot.isPending && "animate-spin")} />
          SPAWNAR LOOT
        </Button>
      </div>

      {/* Eliminated warning */}
      {isEliminated && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span className="text-red-400 font-display tracking-widest text-sm">OPERATIVO ELIMINADO — Vá a BATALHA para respawnar antes de coletar itens</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Canvas map */}
        <div className="lg:col-span-2">
          <div className="relative rounded border border-border bg-black/60 overflow-hidden" style={{ aspectRatio: "4/3" }}>
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              data-testid="canvas-loot-map"
              onClick={handleCanvasClick}
              className="w-full h-full cursor-crosshair"
            />
            <div className="absolute bottom-3 left-3 text-[10px] font-mono text-muted-foreground/60 select-none">
              CLIQUE PARA MOVER OPERATIVO · APROXIME-SE DOS ITENS PARA COLETAR
            </div>
          </div>

          {/* Pickup button */}
          {nearbyLoot && !isEliminated && (
            <div className="mt-3 rounded border border-accent/40 bg-accent/10 p-4 flex items-center justify-between gap-4 animate-in slide-in-from-bottom-2">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{TYPE_ICON[nearbyLoot.type] ?? "📦"}</span>
                <div>
                  <div className="font-bold text-sm" style={{ color: RARITY[nearbyLoot.rarity as keyof typeof RARITY]?.color }}>
                    {nearbyLoot.name}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {nearbyLoot.type} · {RARITY[nearbyLoot.rarity as keyof typeof RARITY]?.label}
                    {nearbyLoot.stats && Object.entries(nearbyLoot.stats).slice(0, 2).map(([k, v]) => ` · ${k}:${v}`).join("")}
                  </div>
                </div>
              </div>
              <Button
                data-testid="button-pickup-loot"
                onClick={() => pickupMutation.mutate(nearbyLoot.id)}
                disabled={pickupMutation.isPending}
                className="bg-accent text-black hover:bg-accent/80 font-display tracking-widest text-xs gap-2 shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
                COLETAR [E]
              </Button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          {/* Stats */}
          <div className="rounded border border-border bg-card/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4 text-accent" />
              <span className="text-xs font-display tracking-widest text-muted-foreground">STATUS DO MAPA</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Disponíveis", value: available.length, color: "text-green-400" },
                { label: "Coletados", value: collected.length, color: "text-muted-foreground" },
                { label: "Total", value: lootItems.length, color: "text-foreground" },
                { label: "Lendário+", value: available.filter(i => i.rarity === "LENDARIO" || i.rarity === "MITICO").length, color: "text-yellow-400" },
              ].map(s => (
                <div key={s.label} className="rounded bg-black/30 p-2 text-center">
                  <div className={cn("text-xl font-mono font-bold", s.color)}>{s.value}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Rarity legend */}
          <div className="rounded border border-border bg-card/60 p-4 space-y-2">
            <span className="text-xs font-display tracking-widest text-muted-foreground block mb-3">RARIDADE DOS ITENS</span>
            {Object.entries(RARITY).map(([key, r]) => {
              const count = available.filter(i => i.rarity === key).length;
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: r.color, boxShadow: `0 0 6px ${r.glow}` }} />
                  <span className="text-xs font-mono flex-1" style={{ color: r.color }}>{r.label}</span>
                  <Badge className="text-[10px] py-0 h-4" style={{ borderColor: r.border, color: r.color, background: "transparent" }}>
                    {count}
                  </Badge>
                </div>
              );
            })}
          </div>

          {/* Available items list */}
          <div className="rounded border border-border bg-card/60 p-4">
            <span className="text-xs font-display tracking-widest text-muted-foreground block mb-3">ITENS NO MAPA</span>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {available.length === 0 && (
                <div className="text-center text-muted-foreground text-xs font-mono py-4">Nenhum item no mapa</div>
              )}
              {available.map(item => {
                const r = RARITY[item.rarity as keyof typeof RARITY] ?? RARITY.COMUM;
                return (
                  <div
                    key={item.id}
                    data-testid={`loot-item-${item.id}`}
                    className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 cursor-pointer text-xs"
                    onClick={() => {
                      const nx = item.posX / 100;
                      const ny = item.posY / 100;
                      setPlayerPos({ x: nx, y: ny });
                      playerPosRef.current = { x: nx, y: ny };
                      computeNearby(nx, ny, lootItemsRef.current);
                    }}
                  >
                    <span>{TYPE_ICON[item.type] ?? "📦"}</span>
                    <span className="flex-1 truncate font-mono" style={{ color: r.color }}>{item.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">({item.posX},{item.posY})</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Pickup log */}
      {pickupLog.length > 0 && (
        <div className="rounded border border-accent/20 bg-accent/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-xs font-display tracking-widest text-green-400">LOG DE COLETA — WAR'I</span>
            <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground h-6 text-xs" onClick={() => setPickupLog([])}>Limpar</Button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {pickupLog.map(evt => {
              const r = RARITY[evt.rarity as keyof typeof RARITY] ?? RARITY.COMUM;
              return (
                <div key={evt.id} data-testid={`pickup-log-${evt.id}`} className="flex items-center gap-3 text-xs font-mono">
                  <span>{TYPE_ICON[evt.type] ?? "📦"}</span>
                  <span style={{ color: r.color }} className="font-bold">{evt.name}</span>
                  <Badge className="text-[9px] py-0 h-4" style={{ borderColor: r.border, color: r.color, background: "transparent" }}>{r.label}</Badge>
                  <span className="ml-auto text-[10px] text-muted-foreground/60">{evt.time.toLocaleTimeString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
