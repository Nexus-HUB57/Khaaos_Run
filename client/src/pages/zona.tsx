import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePlayer } from "@/hooks/use-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Radio, Zap, Skull, Heart, Play, Square, AlertTriangle, Clock,
  Target, Shield, ChevronRight, Globe, Crosshair, Bot, CheckCircle2, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ZoneStatus } from "@shared/schema";
import { ZONE_PHASES } from "@shared/schema";
import { getWarIUseKind } from "@shared/war-i";
import type { WorldDefinition, WorldId, MultiWorldPersistenceState } from "@shared/worlds";
import { useSharedBattleRoom } from "@/hooks/battle-room-context";
import type { BattlePlayer, PackBackScan, RoomLoot } from "@/hooks/use-battle-room";
import { isOutsideSafeZone, zoneEllipseRadii } from "@/lib/safe-zone-geometry";
import { CombatVitalsHud } from "@/components/combat-vitals-hud";
import { playTacticalSfx } from "@/lib/tactical-sfx";

interface WorldsApiResponse {
  worlds: WorldDefinition[];
  progression: MultiWorldPersistenceState;
}

interface TacticalDroneBot {
  id: string;
  name: string;
  posX: number; // 0-100
  posY: number; // 0-100
  originX: number;
  originY: number;
  health: number;
  maxHealth: number;
  orbitAngle: number;
  status: "VIVO" | "ELIMINADO";
}

interface LaserTracer {
  id: number;
  fromX: number; // 0-100
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  expiresAt: number;
}

function worldCoordToPct(coord: { x: number; y: number }, sizeMeters: number) {
  const half = Math.max(500, sizeMeters / 2);
  const pctX = Math.max(10, Math.min(90, 50 + (coord.x / half) * 38));
  const pctY = Math.max(12, Math.min(88, 50 - (coord.y / half) * 38));
  return { x: pctX, y: pctY };
}

// ─── Canvas drawing (BP_SafeZone + Multi-World Topology + Combat HUD) ────────

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
  tick: number,
  otherPlayers: BattlePlayer[] = [],
  lootItems: RoomLoot[] = [],
  localUserId?: string,
  packbackScan?: PackBackScan | null,
  activeWorld?: WorldDefinition | null,
  drones: TacticalDroneBot[] = [],
  tracers: LaserTracer[] = [],
  nearbyPortalLabel?: string | null,
) {
  const cx = (centerX / 100) * w;
  const cy = (centerY / 100) * h;
  const { x: maxRx, y: maxRy } = zoneEllipseRadii(50, w, h);
  const { x: curRx, y: curRy } = zoneEllipseRadii(currentRadius, w, h);
  const { x: tgtRx, y: tgtRy } = zoneEllipseRadii(targetRadius, w, h);
  const px = playerX * w;
  const py = playerY * h;
  const outside = isActive && isOutsideSafeZone(playerX * 100, playerY * 100, centerX, centerY, currentRadius);

  // ── World-Themed Background ──
  const bgMap: Record<string, string> = {
    CIGKV: "#060b14",
    Barburhen: "#120906",
    Priadus: "#05120c",
    Ckesalth: "#071018",
    Arukheea: "#0b0514",
  };
  ctx.fillStyle = (activeWorld && bgMap[activeWorld.id]) || "#0a0610";
  ctx.fillRect(0, 0, w, h);

  // Tactical grid
  ctx.strokeStyle = activeWorld ? `${activeWorld.accentColor}1f` : "rgba(100,60,180,0.12)";
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = 0; x < w; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // ── World POIs & ZEX/ZU Portals ──
  if (activeWorld) {
    for (const poi of activeWorld.pois) {
      const pos = worldCoordToPct(poi.coordinates, activeWorld.sizeMeters);
      const poiX = (pos.x / 100) * w;
      const poiY = (pos.y / 100) * h;
      const poiR = Math.max(18, (poi.radiusMeters / activeWorld.sizeMeters) * Math.min(w, h) * 1.4);

      ctx.beginPath();
      ctx.arc(poiX, poiY, poiR, 0, Math.PI * 2);
      ctx.fillStyle = poi.tier === 3 ? "rgba(245,158,11,0.10)" : "rgba(56,189,248,0.07)";
      ctx.fill();
      ctx.strokeStyle = poi.tier === 3 ? "rgba(245,158,11,0.35)" : "rgba(148,163,184,0.22)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = "9px 'Share Tech Mono', monospace";
      ctx.fillStyle = poi.tier === 3 ? "rgba(251,191,36,0.85)" : "rgba(203,213,225,0.65)";
      ctx.textAlign = "center";
      ctx.fillText(poi.name.toUpperCase(), poiX, poiY - poiR - 4);
    }

    // ZEX Extraction Portals
    for (const zex of activeWorld.zexNodes) {
      const pos = worldCoordToPct(zex.coordinates, activeWorld.sizeMeters);
      const zx = (pos.x / 100) * w;
      const zy = (pos.y / 100) * h;
      const zPulse = 7 + 2 * Math.sin(tick * 0.12);

      ctx.beginPath();
      ctx.arc(zx, zy, zPulse, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(16,185,129,0.85)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(zx, zy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#10b981";
      ctx.fill();

      ctx.font = "bold 8px 'Share Tech Mono', monospace";
      ctx.fillStyle = "rgba(52,211,153,0.9)";
      ctx.textAlign = "center";
      ctx.fillText(zex.id, zx, zy + 15);
    }

    // Central ZU (Zona Única) Beacon
    const zuPulse = 10 + 3 * Math.cos(tick * 0.1);
    ctx.beginPath();
    ctx.arc(cx, cy, zuPulse, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(251,191,36,0.75)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    // Fallback terrain blobs
    const terrains = [
      { x: 0.2, y: 0.3, r: 0.07, c: "rgba(40,80,40,0.25)" },
      { x: 0.7, y: 0.2, r: 0.06, c: "rgba(40,80,40,0.2)" },
      { x: 0.6, y: 0.7, r: 0.08, c: "rgba(40,80,40,0.22)" },
    ];
    terrains.forEach(t => {
      ctx.beginPath();
      ctx.arc(t.x * w, t.y * h, t.r * Math.min(w, h), 0, Math.PI * 2);
      ctx.fillStyle = t.c;
      ctx.fill();
    });
  }

  // ── Outside-zone danger fill ──
  if (isActive && outside) {
    const pulse = 0.1 + 0.05 * Math.sin(tick * 0.15);
    ctx.save();
    ctx.fillStyle = `rgba(220,30,30,${pulse})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  if (!isActive) {
    // Idle state — show full zone outline + world active POIs
    ctx.beginPath();
    ctx.ellipse(cx, cy, maxRx, maxRy, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120,80,220,0.35)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "bold 12px 'Share Tech Mono', monospace";
    ctx.fillStyle = "rgba(180,150,255,0.75)";
    ctx.textAlign = "center";
    ctx.fillText(
      activeWorld
        ? `RADAR TÁTICO: ${activeWorld.name.toUpperCase()} (${activeWorld.dimensionsKm})`
        : "ZONA INATIVA",
      cx,
      24,
    );
  } else {
    // ── Next zone circle (target — dashed orange) ──
    if (isShrinking && targetRadius < currentRadius) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, tgtRx, tgtRy, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(220,100,20,0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = "10px 'Share Tech Mono', monospace";
      ctx.fillStyle = "rgba(220,100,20,0.8)";
      ctx.textAlign = "center";
      ctx.fillText("PRÓXIMA ZONA", cx, cy - tgtRy - 6);
    }

    // ── Current zone gradient fill (safe area) ──
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, curRx, curRy, 0, 0, Math.PI * 2);
    ctx.clip();
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(curRx, curRy));
    grad.addColorStop(0, "rgba(0,160,220,0.04)");
    grad.addColorStop(0.7, "rgba(0,160,220,0.02)");
    grad.addColorStop(1, "rgba(0,180,255,0.08)");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - curRx, cy - curRy, curRx * 2, curRy * 2);
    ctx.restore();

    // ── Zone boundary wall (glowing blue line) ──
    const wallPulse = 0.8 + 0.2 * Math.sin(tick * 0.08);
    ctx.beginPath();
    ctx.ellipse(cx, cy, curRx, curRy, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0,160,255,${0.2 * wallPulse})`;
    ctx.lineWidth = 12;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx, cy, curRx, curRy, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0,200,255,${0.9 * wallPulse})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Radius label
    ctx.font = "11px 'Share Tech Mono', monospace";
    ctx.fillStyle = "rgba(0,200,255,0.8)";
    ctx.textAlign = "left";
    ctx.fillText(`R: ${currentRadius.toFixed(1)}%`, cx + curRx + 8, cy + 4);
  }

  // ── Center ZU crosshair ──
  const crossSize = 6;
  ctx.strokeStyle = "rgba(251,191,36,0.75)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - crossSize, cy); ctx.lineTo(cx + crossSize, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - crossSize); ctx.lineTo(cx, cy + crossSize); ctx.stroke();

  // ── Loot markers (procedural / room loot) ──
  for (const loot of lootItems) {
    if (loot.isPickedUp) continue;
    const lx = (loot.posX / 100) * w;
    const ly = (loot.posY / 100) * h;
    const rarityColor: Record<string, string> = {
      COMUM: "#9ca3af", RARO: "#3b82f6", EPICO: "#a855f7", LENDARIO: "#f59e0b", MITICO: "#ef4444",
    };
    const col = rarityColor[loot.rarity] || "#9ca3af";
    ctx.beginPath();
    ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ── Hostile Tactical Drones (Sparring Bots) ──
  for (const bot of drones) {
    if (bot.status !== "VIVO") continue;
    const bx = (bot.posX / 100) * w;
    const by = (bot.posY / 100) * h;
    ctx.beginPath();
    ctx.arc(bx, by, 9, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(239,68,68,0.28)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444";
    ctx.fill();

    // Bot health bar
    const hpW = 24;
    const hpPct = Math.max(0, bot.health / bot.maxHealth);
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(bx - hpW / 2, by - 14, hpW, 3);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(bx - hpW / 2, by - 14, hpW * hpPct, 3);

    ctx.font = "9px 'Share Tech Mono', monospace";
    ctx.fillStyle = "#fca5a5";
    ctx.textAlign = "center";
    ctx.fillText(bot.name, bx, by - 17);
  }

  // ── Other players (multiplayer) ──
  for (const op of otherPlayers) {
    if (localUserId && op.userId === localUserId) continue;
    if (op.status !== "VIVO") continue;
    const ox = (op.posX / 100) * w;
    const oy = (op.posY / 100) * h;
    ctx.beginPath();
    ctx.arc(ox, oy, 8, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,255,180,0.35)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ox, oy, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#00ffb4";
    ctx.fill();
    ctx.font = "9px 'Share Tech Mono', monospace";
    ctx.fillStyle = "rgba(0,255,180,0.85)";
    ctx.textAlign = "center";
    ctx.fillText(op.displayName.slice(0, 10), ox, oy - 10);
  }

  // ── Weapon / Laser Tracers ──
  const now = Date.now();
  for (const tracer of tracers) {
    if (tracer.expiresAt < now) continue;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo((tracer.fromX / 100) * w, (tracer.fromY / 100) * h);
    ctx.lineTo((tracer.toX / 100) * w, (tracer.toY / 100) * h);
    ctx.strokeStyle = tracer.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = tracer.color;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
  }

  if (packbackScan && packbackScan.expiresAt > Date.now()) {
    for (const scanned of packbackScan.players) {
      if (scanned.userId === localUserId) continue;
      const sx = (scanned.posX / 100) * w;
      const sy = (scanned.posY / 100) * h;
      ctx.beginPath();
      ctx.arc(sx, sy, 11, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,70,220,0.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "bold 9px 'Share Tech Mono', monospace";
      ctx.fillStyle = "#ff70dc";
      ctx.textAlign = "center";
      ctx.fillText(`SCAN ${scanned.displayName.slice(0, 10)}`, sx, sy - 15);
    }
    for (const scanned of packbackScan.loot) {
      const sx = (scanned.posX / 100) * w;
      const sy = (scanned.posY / 100) * h;
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,210,70,0.95)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // ── Player dot ──
  const playerColor = outside ? "#ff3333" : "#ff8800";
  const playerGlow = outside ? "rgba(255,50,50,0.5)" : "rgba(255,136,0,0.5)";

  ctx.beginPath();
  ctx.arc(px, py, 10, 0, Math.PI * 2);
  ctx.fillStyle = playerGlow;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fillStyle = playerColor;
  ctx.fill();

  const pCross = 10;
  ctx.strokeStyle = playerColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(px - pCross, py); ctx.lineTo(px - 7, py); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px + 7, py); ctx.lineTo(px + pCross, py); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px, py - pCross); ctx.lineTo(px, py - 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px, py + 7); ctx.lineTo(px, py + pCross); ctx.stroke();

  if (nearbyPortalLabel) {
    ctx.font = "bold 10px 'Share Tech Mono', monospace";
    ctx.fillStyle = "#34d399";
    ctx.textAlign = "center";
    ctx.fillText(`[X] EXTRAIR: ${nearbyPortalLabel}`, px, py - 16);
  }

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
  const { data: playerData } = usePlayer();

  // ── Multi-World Data ────────────────────────────────────────────────────
  const { data: worldsData } = useQuery<WorldsApiResponse>({
    queryKey: ["/api/worlds"],
  });
  const currentWorldId = worldsData?.progression.currentWorld ?? "CIGKV";
  const activeWorld =
    worldsData?.worlds.find((w) => w.id === currentWorldId) ?? worldsData?.worlds[0] ?? null;

  const selectWorldMutation = useMutation({
    mutationFn: async (worldId: WorldId) => {
      const res = await apiRequest("POST", "/api/worlds/select", { worldId });
      return await res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/worlds"] });
    },
  });

  const [lastExtractionBanner, setLastExtractionBanner] = useState<{
    worldName: string;
    extractionType: "ZEX" | "ZU";
    krcMinted: number;
    newlyUnlocked: string[];
  } | null>(null);

  const extractPortalMutation = useMutation({
    mutationFn: async (params: { worldId: WorldId; extractionType: "ZEX" | "ZU" }) => {
      const res = await apiRequest("POST", "/api/worlds/simulate", params);
      return await res.json();
    },
    onSuccess: (data: any) => {
      playTacticalSfx("extraction_success");
      const sim = data?.simulation;
      if (sim) {
        setLastExtractionBanner({
          worldName: sim.worldName,
          extractionType: sim.extractionType === "ZU" ? "ZU" : "ZEX",
          krcMinted: sim.totalKrcMinted,
          newlyUnlocked: sim.newlyUnlockedWorlds || [],
        });
      }
      qc.invalidateQueries({ queryKey: ["/api/worlds"] });
    },
  });

  // ── Real-time Room (authoritative) ──────────────────────────────────────
  const {
    connected: wsConnected,
    connectionState: wsConnectionState,
    room: battleRoom,
    zone: wsZone,
    players: battlePlayers,
    countdown,
    updatePosition,
    pickupLoot,
    startMatch,
    attack,
    usePackBackItem,
    packbackItems,
    lastPackbackUse,
    packbackScan,
    lastDamageDealt,
    lastError: wsError,
  } = useSharedBattleRoom();

  const inLiveRoom = !!battleRoom && (battleRoom.status === "IN_PROGRESS" || battleRoom.status === "COUNTDOWN");
  const localUserId = (playerData as any)?.user?.id || (playerData as any)?.stats?.userId;

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const tickRef = useRef(0);

  // Smooth animation state (like Timeline lerp in Unreal)
  const lerpRadiusRef = useRef(100);

  // Player position on canvas (normalized 0-1)
  const [playerPos, setPlayerPos] = useState({ x: 0.5, y: 0.5 });
  const playerPosRef = useRef({ x: 0.5, y: 0.5 });
  const localBattlePlayer = battlePlayers.find((player) => player.userId === localUserId);
  const nearbyBattleLoot = inLiveRoom && battleRoom?.status === "IN_PROGRESS" && localBattlePlayer
    ? battleRoom.loot
      .filter((loot) => !loot.isPickedUp)
      .map((loot) => ({ loot, distance: Math.hypot(loot.posX - localBattlePlayer.posX, loot.posY - localBattlePlayer.posY) }))
      .filter((entry) => entry.distance <= 8)
      .sort((a, b) => a.distance - b.distance)[0]?.loot
    : undefined;

  useEffect(() => {
    if (!inLiveRoom || !localBattlePlayer) return;
    const authoritative = { x: localBattlePlayer.posX / 100, y: localBattlePlayer.posY / 100 };
    playerPosRef.current = authoritative;
    setPlayerPos(authoritative);
  }, [inLiveRoom, localBattlePlayer?.posX, localBattlePlayer?.posY]);

  // ── Hostile Tactical Drones (Sparring Bots for Solo Gamer Mode) ──
  const [botsEnabled, setBotsEnabled] = useState(false);
  const dronesRef = useRef<TacticalDroneBot[]>([]);
  const [dronesState, setDronesState] = useState<TacticalDroneBot[]>([]);
  const tracersRef = useRef<LaserTracer[]>([]);
  const tracerIdRef = useRef(0);

  const spawnTacticalDrones = useCallback(() => {
    const pois = activeWorld?.pois ?? [];
    const size = activeWorld?.sizeMeters ?? 2000;
    const initial: TacticalDroneBot[] = [0, 1, 2].map((idx) => {
      const poi = pois[idx % Math.max(1, pois.length)];
      const base = poi
        ? worldCoordToPct(poi.coordinates, size)
        : { x: 28 + idx * 22, y: 30 + (idx % 2) * 35 };
      return {
        id: `drone-${idx + 1}`,
        name: `SENTINELA-0${idx + 1}`,
        posX: base.x,
        posY: base.y,
        originX: base.x,
        originY: base.y,
        health: 60,
        maxHealth: 60,
        orbitAngle: idx * 2.1,
        status: "VIVO",
      };
    });
    dronesRef.current = initial;
    setDronesState(initial);
    setBotsEnabled(true);
  }, [activeWorld]);

  // Damage system
  const [damageLog, setDamageLog] = useState<DamageEvent[]>([]);
  const [isOutside, setIsOutside] = useState(false);
  const isOutsideRef = useRef(false);
  const damageTimerRef = useRef<NodeJS.Timeout | null>(null);
  const logIdRef = useRef(0);

  // Poll zone status every 2 seconds (fallback when not in live room)
  const { data: httpZoneStatus } = useQuery<ZoneStatus>({
    queryKey: ["/api/zone/status"],
    refetchInterval: inLiveRoom ? false : 2000,
  });
  const { data: zonePermissions } = useQuery<{ canManageZone: boolean }>({
    queryKey: ["/api/zone/permissions"],
  });

  // Prefer authoritative WebSocket zone when in a live room
  const zoneStatus: ZoneStatus | undefined | null = inLiveRoom && wsZone ? wsZone : httpZoneStatus;

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

  // Detect if player is standing near a ZEX or ZU portal on the active world
  const curX = inLiveRoom && localBattlePlayer ? localBattlePlayer.posX : playerPos.x * 100;
  const curY = inLiveRoom && localBattlePlayer ? localBattlePlayer.posY : playerPos.y * 100;
  const centerX = zoneStatus?.centerX ?? 50;
  const centerY = zoneStatus?.centerY ?? 50;

  const nearbyPortal = (() => {
    if (!activeWorld) return null;
    const distToZu = Math.hypot(curX - centerX, curY - centerY);
    if (distToZu <= 7) {
      return { type: "ZU" as const, label: `ZU (${activeWorld.zuSpec.locationLabel})` };
    }
    for (const zex of activeWorld.zexNodes) {
      const pos = worldCoordToPct(zex.coordinates, activeWorld.sizeMeters);
      if (Math.hypot(curX - pos.x, curY - pos.y) <= 7.5) {
        return { type: "ZEX" as const, label: `${zex.id} · ${zex.name}` };
      }
    }
    return null;
  })();

  // Sync lerp target when zone status updates
  useEffect(() => {
    if (!zoneStatus) return;
    const xPct = inLiveRoom && localBattlePlayer ? localBattlePlayer.posX : playerPosRef.current.x * 100;
    const yPct = inLiveRoom && localBattlePlayer ? localBattlePlayer.posY : playerPosRef.current.y * 100;
    const outside = zoneStatus.isActive && isOutsideSafeZone(
      xPct,
      yPct,
      zoneStatus.centerX,
      zoneStatus.centerY,
      zoneStatus.currentRadiusPct,
    );
    setIsOutside(outside);
    isOutsideRef.current = outside;
  }, [zoneStatus, inLiveRoom, localBattlePlayer?.posX, localBattlePlayer?.posY]);

  // Damage timer — only in legacy HTTP mode (server is authoritative in live rooms)
  useEffect(() => {
    if (damageTimerRef.current) clearInterval(damageTimerRef.current);
    if (inLiveRoom) return; // server tick owns damage
    if (!zoneStatus?.isActive) return;

    damageTimerRef.current = setInterval(() => {
      if (isOutsideRef.current && zoneStatus) {
        applyDamage.mutate(zoneStatus.damagePerTick);
      }
    }, 1000);

    return () => { if (damageTimerRef.current) clearInterval(damageTimerRef.current); };
  }, [zoneStatus?.isActive, zoneStatus?.damagePerTick, inLiveRoom]);

  // Patrol & Fire exchange timer for Hostile Tactical Drones in Solo mode
  useEffect(() => {
    if (!botsEnabled || inLiveRoom) return;
    const interval = setInterval(() => {
      const pX = playerPosRef.current.x * 100;
      const pY = playerPosRef.current.y * 100;
      let firedOnPlayer = false;

      dronesRef.current = dronesRef.current.map((bot) => {
        if (bot.status !== "VIVO") return bot;
        const nextAngle = bot.orbitAngle + 0.16;
        const nx = Math.max(8, Math.min(92, bot.originX + Math.cos(nextAngle) * 7));
        const ny = Math.max(8, Math.min(92, bot.originY + Math.sin(nextAngle) * 7));
        const dist = Math.hypot(nx - pX, ny - pY);
        if (dist <= 16 && !firedOnPlayer) {
          firedOnPlayer = true;
          tracersRef.current.push({
            id: ++tracerIdRef.current,
            fromX: nx,
            fromY: ny,
            toX: pX,
            toY: pY,
            color: "#ef4444",
            expiresAt: Date.now() + 260,
          });
        }
        return { ...bot, posX: nx, posY: ny, orbitAngle: nextAngle };
      });
      setDronesState([...dronesRef.current]);

      if (firedOnPlayer) {
        applyDamage.mutate(8);
      }
    }, 1400);

    return () => clearInterval(interval);
  }, [botsEnabled, inLiveRoom]);

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

      if (status) {
        lerpRadiusRef.current += (status.currentRadiusPct - lerpRadiusRef.current) * 0.04;
      }

      const currentRadius = lerpRadiusRef.current;
      const targetRadius = status?.targetRadiusPct ?? currentRadius;
      const { x, y } = playerPosRef.current;
      const cX = status?.centerX ?? 50;
      const cY = status?.centerY ?? 50;
      const isActive = status?.isActive ?? false;
      const isShrinking = status?.isShrinking ?? false;

      const others = inLiveRoom ? battlePlayers : [];
      const loot = inLiveRoom && battleRoom ? battleRoom.loot : [];
      drawZoneCanvas(
        ctx,
        w,
        h,
        currentRadius,
        targetRadius,
        x,
        y,
        cX,
        cY,
        isActive,
        isShrinking,
        tick,
        others,
        loot,
        localUserId,
        packbackScan,
        activeWorld,
        botsEnabled && !inLiveRoom ? dronesRef.current : [],
        tracersRef.current,
        nearbyPortal?.label ?? null,
      );
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [zoneStatus, inLiveRoom, battlePlayers, battleRoom, localUserId, packbackScan, activeWorld, botsEnabled, nearbyPortal?.label]);

  // Attack nearest hostile target (live PvP or Solo Drone)
  const triggerTacticalAttack = useCallback((targetXPct?: number, targetYPct?: number) => {
    const myX = inLiveRoom && localBattlePlayer ? localBattlePlayer.posX : playerPosRef.current.x * 100;
    const myY = inLiveRoom && localBattlePlayer ? localBattlePlayer.posY : playerPosRef.current.y * 100;
    const refX = targetXPct ?? myX;
    const refY = targetYPct ?? myY;

    if (inLiveRoom && wsConnected && attack) {
      let nearest: { id: string; dist: number; x: number; y: number } | null = null;
      for (const p of battlePlayers) {
        if (p.userId === localUserId || p.status !== "VIVO") continue;
        const d = Math.hypot(p.posX - refX, p.posY - refY);
        if (d < 16 && (!nearest || d < nearest.dist)) {
          nearest = { id: p.userId, dist: d, x: p.posX, y: p.posY };
        }
      }
      if (nearest) {
        tracersRef.current.push({
          id: ++tracerIdRef.current,
          fromX: myX,
          fromY: myY,
          toX: nearest.x,
          toY: nearest.y,
          color: "#00f0ff",
          expiresAt: Date.now() + 260,
        });
        playTacticalSfx("weapon_fire");
        attack(nearest.id);
      }
      return;
    }

    // Solo Drone combat
    if (botsEnabled) {
      let nearestBot: TacticalDroneBot | null = null;
      let minDist = Infinity;
      for (const bot of dronesRef.current) {
        if (bot.status !== "VIVO") continue;
        const d = Math.hypot(bot.posX - refX, bot.posY - refY);
        if (d < 22 && d < minDist) {
          minDist = d;
          nearestBot = bot;
        }
      }
      if (nearestBot) {
        playTacticalSfx("weapon_fire");
        tracersRef.current.push({
          id: ++tracerIdRef.current,
          fromX: myX,
          fromY: myY,
          toX: nearestBot.posX,
          toY: nearestBot.posY,
          color: "#00f0ff",
          expiresAt: Date.now() + 260,
        });
        dronesRef.current = dronesRef.current.map((b) => {
          if (b.id !== nearestBot!.id) return b;
          const nextHp = Math.max(0, b.health - 20);
          return {
            ...b,
            health: nextHp,
            status: nextHp <= 0 ? "ELIMINADO" : "VIVO",
          };
        });
        setDronesState([...dronesRef.current]);
      }
    }
  }, [inLiveRoom, wsConnected, attack, battlePlayers, localUserId, localBattlePlayer, botsEnabled]);

  // Canvas click → move player
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const clamped = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    if (inLiveRoom) {
      if (!wsConnected) return;
      updatePosition(clamped.x * 100, clamped.y * 100);
    } else {
      setPlayerPos(clamped);
      playerPosRef.current = clamped;
    }

    if (zoneStatus && !inLiveRoom) {
      const outside = zoneStatus.isActive && isOutsideSafeZone(
        clamped.x * 100,
        clamped.y * 100,
        zoneStatus.centerX,
        zoneStatus.centerY,
        zoneStatus.currentRadiusPct,
      );
      setIsOutside(outside);
      isOutsideRef.current = outside;
    }
  }, [zoneStatus, inLiveRoom, wsConnected, updatePosition]);

  // WASD + Arrow keys + Hotkeys (Space: Attack, E: Pickup, X: Extract ZEX/ZU)
  const handleCanvasKeyDown = useCallback((e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const keyLower = e.key.toLowerCase();

    if (e.key === " ") {
      e.preventDefault();
      triggerTacticalAttack();
      return;
    }
    if (keyLower === "e" && nearbyBattleLoot) {
      e.preventDefault();
      pickupLoot(nearbyBattleLoot.id);
      return;
    }
    if (keyLower === "x" && nearbyPortal && activeWorld && !extractPortalMutation.isPending) {
      e.preventDefault();
      extractPortalMutation.mutate({
        worldId: activeWorld.id,
        extractionType: nearbyPortal.type,
      });
      return;
    }

    const deltas: Record<string, { x: number; y: number }> = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      w: { x: 0, y: -1 },
      s: { x: 0, y: 1 },
      a: { x: -1, y: 0 },
      d: { x: 1, y: 0 },
    };
    const delta = deltas[e.key] || deltas[keyLower];
    if (!delta) return;
    e.preventDefault();
    if (inLiveRoom && !wsConnected) return;

    const step = e.shiftKey ? 0.05 : 0.025;
    const current = inLiveRoom && localBattlePlayer
      ? { x: localBattlePlayer.posX / 100, y: localBattlePlayer.posY / 100 }
      : playerPosRef.current;
    const next = {
      x: Math.max(0, Math.min(1, current.x + delta.x * step)),
      y: Math.max(0, Math.min(1, current.y + delta.y * step)),
    };
    if (inLiveRoom) {
      updatePosition(next.x * 100, next.y * 100);
      return;
    }

    setPlayerPos(next);
    playerPosRef.current = next;
    if (zoneStatus) {
      const outside = zoneStatus.isActive && isOutsideSafeZone(
        next.x * 100,
        next.y * 100,
        zoneStatus.centerX,
        zoneStatus.centerY,
        zoneStatus.currentRadiusPct,
      );
      setIsOutside(outside);
      isOutsideRef.current = outside;
    }
  }, [
    inLiveRoom,
    wsConnected,
    localBattlePlayer?.posX,
    localBattlePlayer?.posY,
    updatePosition,
    zoneStatus,
    triggerTacticalAttack,
    nearbyBattleLoot,
    pickupLoot,
    nearbyPortal,
    activeWorld,
    extractPortalMutation,
  ]);

  // Double-click nearest enemy to attack (PvP or Drone)
  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 100;
    const clickY = ((e.clientY - rect.top) / rect.height) * 100;
    triggerTacticalAttack(clickX, clickY);
  }, [triggerTacticalAttack]);

  const health = inLiveRoom ? (localBattlePlayer?.health ?? playerData?.stats?.health ?? 100) : (playerData?.stats?.health ?? 100);
  const maxHealth = inLiveRoom ? (localBattlePlayer?.maxHealth ?? playerData?.stats?.maxHealth ?? 100) : (playerData?.stats?.maxHealth ?? 100);
  const packbackActions = packbackItems.flatMap((item) => {
    const kind = getWarIUseKind(item.type, item.stats);
    return kind ? [{ item, kind }] : [];
  });

  const phaseConfig = zoneStatus ? ZONE_PHASES[Math.min(zoneStatus.currentPhase - 1, ZONE_PHASES.length - 1)] : ZONE_PHASES[0];

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
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
            {activeWorld && (
              <span className="text-xs font-mono text-amber-400 flex items-center gap-1.5 border border-amber-500/30 bg-amber-950/20 px-2.5 py-0.5 rounded">
                <Globe className="w-3.5 h-3.5" />
                MUNDO: {activeWorld.name} ({activeWorld.krcMultiplier.toFixed(2)}x KRC)
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono tracking-widest">
            BP_SAFEZONE · CÍRCULO DO MAPA · {ZONE_PHASES.length} FASES
            {inLiveRoom && (
              <span className="ml-3 text-cyan-400">
                · MESH AO VIVO · {battleRoom?.playerCount ?? 0} OPERATIVOS
                {countdown != null && countdown > 0 ? ` · INÍCIO ${countdown}s` : ""}
              </span>
            )}
            {inLiveRoom && (
              <span
                data-testid="ws-connection-state"
                role="status"
                aria-live="polite"
                className={cn("ml-2", wsConnectionState === "connected" ? "text-green-400" : "text-amber-300")}
              >
                · {wsConnectionState === "connected" ? "SINCRONIZADO" : wsConnectionState === "reconnecting" ? "RECONECTANDO" : wsConnectionState === "connecting" ? "CONECTANDO" : "OFFLINE"}
              </span>
            )}
            {wsError && <span className="ml-2 text-red-400">· {wsError}</span>}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!inLiveRoom && (
            <Button
              type="button"
              onClick={() => {
                if (botsEnabled) {
                  setBotsEnabled(false);
                  dronesRef.current = [];
                  setDronesState([]);
                } else {
                  spawnTacticalDrones();
                }
              }}
              variant="outline"
              data-testid="button-toggle-drones"
              className={cn(
                "font-display tracking-widest text-xs gap-2",
                botsEnabled
                  ? "border-red-500/50 bg-red-500/15 text-red-300"
                  : "border-amber-500/40 text-amber-300 hover:bg-amber-500/10",
              )}
            >
              <Bot className="w-4 h-4" />
              {botsEnabled
                ? `DESATIVAR DRONES (${dronesState.filter((d) => d.status === "VIVO").length} VIVOS)`
                : "PATRULHA IA (3 DRONES)"}
            </Button>
          )}
          {battleRoom?.status === "LOBBY" && (
            <Button
              onClick={startMatch}
              disabled={!wsConnected}
              className="bg-cyan-600/30 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-600/50 font-display tracking-widest text-xs gap-2"
              variant="outline"
            >
              <Play className="w-4 h-4" />
              INICIAR MATCH AO VIVO
            </Button>
          )}
          {zonePermissions?.canManageZone && !inLiveRoom && (
            !zoneStatus?.isActive ? (
              <Button
                data-testid="button-start-zone"
                onClick={() => startZone.mutate()}
                disabled={startZone.isPending}
                className="bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 font-display tracking-widest text-xs gap-2"
                variant="outline"
              >
                <Play className="w-4 h-4" />
                ATIVAR ZONA (SOLO)
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
            )
          )}
          {zonePermissions?.canManageZone && !inLiveRoom && (
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
          )}
        </div>
      </div>

      {/* Quick Multi-World Selector Bar */}
      {worldsData && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded border border-zinc-800 bg-zinc-950/80 px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
            <Globe className="w-4 h-4 text-amber-400" />
            <span>TOPOLOGIA DO MUNDO ATIVO:</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {worldsData.worlds.map((w) => {
              const unlocked = worldsData.progression.worlds[w.id]?.unlocked;
              const isSelected = w.id === activeWorld?.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  disabled={!unlocked || selectWorldMutation.isPending}
                  onClick={() => selectWorldMutation.mutate(w.id)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs font-mono transition-colors border",
                    isSelected
                      ? "bg-amber-500/20 border-amber-500/60 text-amber-300 font-bold"
                      : unlocked
                        ? "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700"
                        : "bg-zinc-950 border-zinc-900 text-zinc-600 cursor-not-allowed",
                  )}
                >
                  {w.name} ({w.krcMultiplier.toFixed(2)}x)
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Extraction Reward Banner */}
      {lastExtractionBanner && (
        <div className="rounded border border-emerald-500/50 bg-emerald-950/30 p-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs font-mono">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold text-emerald-300">
                EXTRAÇÃO {lastExtractionBanner.extractionType} CONCLUÍDA EM {lastExtractionBanner.worldName.toUpperCase()}!
              </span>
              <span className="ml-2 text-amber-300 font-bold">
                +{lastExtractionBanner.krcMinted} KRC CREDITADOS
              </span>
              {lastExtractionBanner.newlyUnlocked.length > 0 && (
                <span className="ml-2 text-cyan-300">
                  · NOVO MUNDO DESBLOQUEADO: {lastExtractionBanner.newlyUnlocked.join(", ")}
                </span>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLastExtractionBanner(null)}
            className="h-7 text-xs font-mono text-zinc-400"
          >
            Fechar
          </Button>
        </div>
      )}

      {/* Main grid: Canvas + Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Canvas — zone visualization */}
        <div className="lg:col-span-2 relative space-y-3">
          <div className="relative rounded border border-border bg-black/60 overflow-hidden"
            style={{ aspectRatio: "4/3" }}>
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              data-testid="canvas-safe-zone"
              onClick={handleCanvasClick}
              onDoubleClick={handleCanvasDoubleClick}
              onKeyDown={handleCanvasKeyDown}
              role="application"
              aria-label={`Mapa tático interativo. Sua posição X ${curX.toFixed(0)}, Y ${curY.toFixed(0)}. ${isOutside ? "Fora da zona segura." : "Dentro da zona segura."} Clique ou use WASD/setas para mover. Duplo clique ou Espaço para atacar.`}
              aria-describedby="safe-zone-canvas-help"
              aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight w a s d Space e x"
              tabIndex={0}
              className="w-full h-full cursor-crosshair focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
              style={{ imageRendering: "pixelated" }}
            />
            {/* Overlay instructions */}
            <div id="safe-zone-canvas-help" className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[10px] font-mono text-muted-foreground/80 select-none bg-black/65 px-2.5 py-1 rounded border border-white/5">
              <span>WASD / SETAS / CLIQUE: MOVER · SHIFT: SPRINT · ESPAÇO / 2x CLIQUE: ATACAR</span>
              <span className="text-emerald-400">PORTAIS VERDES = ZEX · CENTRO = ZU [X]</span>
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

          {/* Interactive ZEX / ZU Extraction Action Bar when near a portal */}
          {nearbyPortal && activeWorld && (
            <div
              data-testid="panel-portal-extraction"
              className="rounded border border-emerald-500/50 bg-emerald-950/30 p-3.5 flex items-center justify-between gap-3"
            >
              <div className="text-xs font-mono">
                <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  PORTAL DE EXTRAÇÃO AO ALCANCE: {nearbyPortal.label}
                </div>
                <div className="text-zinc-400 mt-0.5">
                  Recompensa multiplicada por {activeWorld.krcMultiplier.toFixed(2)}x KRC ({activeWorld.name})
                </div>
              </div>
              <Button
                type="button"
                data-testid="button-extract-portal"
                disabled={extractPortalMutation.isPending}
                onClick={() =>
                  extractPortalMutation.mutate({
                    worldId: activeWorld.id,
                    extractionType: nearbyPortal.type,
                  })
                }
                className="bg-emerald-600 hover:bg-emerald-500 text-black font-display font-bold tracking-wider text-xs"
              >
                EXTRAIR AGORA [X]
              </Button>
            </div>
          )}
        </div>

        {/* Control panel */}
        <div className="flex flex-col gap-4">
          {/* Animated Player Vitals & Ballistic Defense HUD with Movement Validation */}
          <CombatVitalsHud
            health={health}
            maxHealth={maxHealth}
            status={inLiveRoom ? localBattlePlayer?.status : playerData?.stats?.status}
            movement={{
              posX: curX,
              posY: curY,
              speedMultiplier: localBattlePlayer?.speedMultiplier ?? 1,
              speedBoostUntil: localBattlePlayer?.speedBoostUntil ?? 0,
              isOutsideZone: isOutside && Boolean(zoneStatus?.isActive),
              inLiveRoom,
            }}
            lastDamageEvent={lastDamageDealt}
            localUserId={localUserId}
            healthTestId="text-health-current"
            showProgressTestId={true}
            onTriggerRealDamage={(dmg) => applyDamage.mutate(dmg)}
            onTriggerHeal={() => healPlayer.mutate()}
          />

          {battleRoom?.status === "IN_PROGRESS" && (
            <div data-testid="panel-packback-actions" className="rounded border border-amber-500/30 bg-card/60 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-300" />
                <span className="text-xs font-display tracking-widest text-amber-200">WAR’I · AÇÕES DA PACKBACK</span>
              </div>
              {packbackActions.length === 0 ? (
                <p className="text-[11px] font-mono text-muted-foreground">Nenhum consumível ou utilidade ativa carregada neste match.</p>
              ) : (
                <div className="space-y-2">
                  {packbackActions.map(({ item, kind }) => {
                    const icon = kind === "HEAL" ? <Heart className="w-4 h-4 shrink-0" /> : kind === "GRENADE" ? <Zap className="w-4 h-4 shrink-0" /> : <Radio className="w-4 h-4 shrink-0" />;
                    const hasAdrenaline = kind === "HEAL" && Number(item.stats.speed) > 0;
                    const actionLabel = hasAdrenaline ? "USAR ADRENALINA" : kind === "HEAL" ? "USAR CURA" : kind === "GRENADE" ? "LANÇAR GRANADA" : "ATIVAR DRONE";
                    const disabled = Number(item.durability) <= 0
                      || !wsConnected
                      || localBattlePlayer?.status !== "VIVO"
                      || (kind === "HEAL" && health >= maxHealth && !hasAdrenaline);
                    return (
                      <Button
                        key={item.id}
                        data-testid={`button-use-packback-${item.id}`}
                        onClick={() => usePackBackItem(item.id)}
                        disabled={disabled}
                        variant="outline"
                        className="w-full justify-between border-amber-500/30 text-amber-100 hover:bg-amber-500/10 font-mono text-xs"
                      >
                        <span className="flex min-w-0 items-center gap-2">{icon}<span className="truncate">{actionLabel} · {item.name}</span></span>
                        <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">{Number(item.durability).toFixed(0)}/{Number(item.maxDurability).toFixed(0)}</span>
                      </Button>
                    );
                  })}
                </div>
              )}
              {lastPackbackUse && <p role="status" aria-live="polite" className="text-[11px] font-mono text-cyan-300">{lastPackbackUse.message}</p>}
              {localBattlePlayer && <p className="text-[11px] font-mono text-muted-foreground">CARGA: {localBattlePlayer.carriedWeight ?? 0}/{localBattlePlayer.carryCapacity ?? 0} pts</p>}
              {localBattlePlayer && (localBattlePlayer.speedBoostUntil ?? 0) > Date.now() && <p role="status" className="text-[11px] font-mono text-green-300">ADRENALINA ATIVA · +{Math.round(((localBattlePlayer.speedMultiplier ?? 1) - 1) * 100)}% · {Math.ceil(((localBattlePlayer.speedBoostUntil ?? 0) - Date.now()) / 1000)}s</p>}
            </div>
          )}

          {battleRoom?.status === "IN_PROGRESS" && nearbyBattleLoot && (
            <div data-testid="panel-nearby-loot" className="rounded border border-cyan-500/30 bg-card/60 p-4 space-y-2">
              <div className="text-xs font-display tracking-widest text-cyan-200">LOOT AO ALCANCE</div>
              <div className="text-sm font-mono text-foreground">{nearbyBattleLoot.name}</div>
              <Button
                data-testid={`button-pickup-live-loot-${nearbyBattleLoot.id}`}
                onClick={() => pickupLoot(nearbyBattleLoot.id)}
                disabled={!wsConnected || localBattlePlayer?.status !== "VIVO"}
                variant="outline"
                className="w-full border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/10 font-mono text-xs"
              >
                COLETAR [E] · {nearbyBattleLoot.type}
              </Button>
            </div>
          )}
          {inLiveRoom && wsError && <p role="alert" className="text-xs font-mono text-red-300">{wsError}</p>}

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
              <span className="text-accent">X:{curX.toFixed(0)}</span>
              <span className="text-accent">Y:{curY.toFixed(0)}</span>
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
          {ZONE_PHASES.map((phase) => {
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
