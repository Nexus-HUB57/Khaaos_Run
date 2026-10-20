import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Shield, Zap, Skull, Crosshair, Move, Sparkles, RotateCcw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { playTacticalSfx } from "@/lib/tactical-sfx";
import type { Item } from "@shared/schema";
import type { CombatDamageEvent } from "@/hooks/use-battle-room";

export interface MovementValidationTelemetry {
  posX: number; // 0-100
  posY: number; // 0-100
  speedMultiplier?: number;
  speedBoostUntil?: number;
  isOutsideZone?: boolean;
  inLiveRoom?: boolean;
}

interface FloatingHitIndicator {
  id: number;
  vitalityLoss: number;
  defenseAbsorbed: number;
  movementState: "MOVING_EVASION" | "STATIONARY_DIRECT" | "ZONE_HAZARD";
  label: string;
  timestamp: number;
}

interface CombatVitalsHudProps {
  health: number;
  maxHealth: number;
  status?: string;
  movement?: MovementValidationTelemetry;
  lastDamageEvent?: CombatDamageEvent | null;
  localUserId?: string;
  healthTestId?: string;
  showProgressTestId?: boolean;
  compact?: boolean;
  onTriggerRealDamage?: (amount: number) => void;
  onTriggerHeal?: () => void;
}

export function CombatVitalsHud({
  health,
  maxHealth,
  status = "VIVO",
  movement,
  lastDamageEvent,
  localUserId,
  healthTestId = "text-health-current",
  showProgressTestId = true,
  compact = false,
  onTriggerRealDamage,
  onTriggerHeal,
}: CombatVitalsHudProps) {
  // Query player's War'I items to compute equipped Ballistic Defense (DEFESA)
  const { data: items = [] } = useQuery<Item[]>({
    queryKey: ["/api/items"],
  });

  const equippedDefenseItems = items.filter(
    (item) => item.type === "DEFESA" && item.isEquipped && Number(item.durability ?? 100) > 0,
  );
  const rawEquipmentDefense = equippedDefenseItems.reduce(
    (sum, item) => sum + (Number((item.stats as Record<string, number>)?.defense) || 25),
    0,
  );
  const maxDefense = Math.max(50, Math.min(150, rawEquipmentDefense > 0 ? rawEquipmentDefense : 60));

  // Local simulated shield state + visual trauma bars
  const [shieldPoints, setShieldPoints] = useState<number>(
    rawEquipmentDefense > 0 ? Math.min(150, rawEquipmentDefense) : 45,
  );
  const [simHealthOverride, setSimHealthOverride] = useState<number | null>(null);

  const effectiveHealth = simHealthOverride !== null ? simHealthOverride : health;
  const safeMaxHealth = Math.max(1, maxHealth);
  const healthPct = Math.max(0, Math.min(100, (effectiveHealth / safeMaxHealth) * 100));
  const shieldPct = Math.max(0, Math.min(100, (shieldPoints / maxDefense) * 100));

  // Trauma / Ghost bar state (holds pre-damage % then decays smoothly)
  const [ghostHealthPct, setGhostHealthPct] = useState(healthPct);
  const [ghostShieldPct, setGhostShieldPct] = useState(shieldPct);

  // Kinetic impact animation states
  const [isShaking, setIsShaking] = useState(false);
  const [shieldRippleKey, setShieldRippleKey] = useState(0);
  const [hitFlashType, setHitFlashType] = useState<"NONE" | "KINETIC" | "SHIELD" | "ZONE">("NONE");
  const [floatingHits, setFloatingHits] = useState<FloatingHitIndicator[]>([]);
  const [lastValidationReport, setLastValidationReport] = useState<{
    state: "MOVING_EVASION" | "STATIONARY_DIRECT" | "ZONE_HAZARD";
    velocityMps: number;
    mitigationPct: number;
    summary: string;
  } | null>(null);

  // Movement velocity tracking (from authoritative posX/posY updates)
  const prevPosRef = useRef<{ x: number; y: number; time: number }>({
    x: movement?.posX ?? 50,
    y: movement?.posY ?? 50,
    time: Date.now(),
  });
  const [velocityMps, setVelocityMps] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const moveDecayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevHealthRef = useRef(effectiveHealth);
  const hitIdRef = useRef(0);

  // Sync shield when equipped defense changes
  useEffect(() => {
    if (rawEquipmentDefense > 0) {
      setShieldPoints(Math.min(150, rawEquipmentDefense));
    }
  }, [rawEquipmentDefense]);

  // Clear local health override when authoritative server health changes
  useEffect(() => {
    setSimHealthOverride(null);
  }, [health]);

  // Track movement velocity from coordinate changes
  useEffect(() => {
    if (!movement) return;
    const now = Date.now();
    const dtSec = Math.max(0.05, (now - prevPosRef.current.time) / 1000);
    const dx = movement.posX - prevPosRef.current.x;
    const dy = movement.posY - prevPosRef.current.y;
    const distPct = Math.hypot(dx, dy);

    if (distPct > 0.08) {
      const mult = movement.speedMultiplier ?? 1;
      const computedSpeed = Math.min(18.5, (distPct / dtSec) * 1.8 * mult);
      setVelocityMps(Number(computedSpeed.toFixed(1)));
      setIsMoving(true);
      prevPosRef.current = { x: movement.posX, y: movement.posY, time: now };

      if (moveDecayTimerRef.current) clearTimeout(moveDecayTimerRef.current);
      moveDecayTimerRef.current = setTimeout(() => {
        setIsMoving(false);
        setVelocityMps(0);
      }, 950);
    }
  }, [movement?.posX, movement?.posY, movement?.speedMultiplier]);

  // Trigger visual trauma + defense absorption animation when health drops
  const triggerDamageVisuals = (
    rawDamage: number,
    source: "COMBAT" | "ZONE" | "SIMULATION",
  ) => {
    const movingNow = isMoving || velocityMps > 1.2;
    const speedMult = movement?.speedMultiplier ?? 1;

    // Movement validation mitigation: moving operatives evade part of kinetic impact,
    // and active Ballistic Defense absorbs shock before penetrating Vitality.
    const evasionMitigationPct =
      source === "ZONE" ? 0 : movingNow ? Math.round(18 * speedMult) : 0;
    const shieldMitigationPct =
      source === "ZONE" ? 10 : shieldPoints > 0 ? 35 : 0;
    const totalMitigationPct = Math.min(65, evasionMitigationPct + shieldMitigationPct);

    const defenseAbsorbed =
      shieldPoints > 0
        ? Math.min(shieldPoints, Math.max(2, Math.round(rawDamage * (totalMitigationPct / 100))))
        : 0;

    if (defenseAbsorbed > 0) {
      setShieldPoints((prev) => Math.max(0, prev - defenseAbsorbed));
      setShieldRippleKey((k) => k + 1);
      playTacticalSfx("shield_absorb");
    } else {
      playTacticalSfx("damage_hit");
    }

    const movementState: FloatingHitIndicator["movementState"] =
      source === "ZONE"
        ? "ZONE_HAZARD"
        : movingNow
          ? "MOVING_EVASION"
          : "STATIONARY_DIRECT";

    const summary =
      movementState === "MOVING_EVASION"
        ? `Validação em Movimento (${velocityMps.toFixed(1)} m/s): Vetor evasivo reduziu impacto em ${totalMitigationPct}% (${defenseAbsorbed} pts absorvidos pela Defesa)`
        : movementState === "ZONE_HAZARD"
          ? `Dano Ambiental Contínuo (Fora da SafeZone): Penetração direta na Vitalidade (-${rawDamage} VIT)`
          : `Alvo Estacionário (0.0 m/s): Impacto balístico total validado pelo servidor (-${rawDamage} VIT)`;

    setLastValidationReport({
      state: movementState,
      velocityMps: movingNow ? velocityMps : 0,
      mitigationPct: totalMitigationPct,
      summary,
    });

    setIsShaking(true);
    setHitFlashType(source === "ZONE" ? "ZONE" : defenseAbsorbed > 0 ? "SHIELD" : "KINETIC");

    const newHit: FloatingHitIndicator = {
      id: ++hitIdRef.current,
      vitalityLoss: rawDamage,
      defenseAbsorbed,
      movementState,
      label:
        movementState === "MOVING_EVASION"
          ? "EVASÃO EM MOVIMENTO"
          : movementState === "ZONE_HAZARD"
            ? "GÁS DA ZONA"
            : "IMPACTO DIRETO",
      timestamp: Date.now(),
    };

    setFloatingHits((prev) => [newHit, ...prev.slice(0, 3)]);

    setTimeout(() => setIsShaking(false), 450);
    setTimeout(() => setHitFlashType("NONE"), 550);
  };

  // Detect real health drop from server / Zone / PvP
  useEffect(() => {
    const prev = prevHealthRef.current;
    if (effectiveHealth < prev) {
      const diff = Math.max(1, Math.round(prev - effectiveHealth));
      const isZone = Boolean(movement?.isOutsideZone);
      triggerDamageVisuals(diff, isZone ? "ZONE" : "COMBAT");

      // Hold ghost bar for 380ms then smoothly transition down to current healthPct
      const timer = setTimeout(() => {
        setGhostHealthPct(healthPct);
      }, 380);
      prevHealthRef.current = effectiveHealth;
      return () => clearTimeout(timer);
    } else if (effectiveHealth > prev) {
      setGhostHealthPct(healthPct);
      prevHealthRef.current = effectiveHealth;
    }
  }, [effectiveHealth, healthPct, movement?.isOutsideZone]);

  // Smooth ghost shield decay
  useEffect(() => {
    if (shieldPct < ghostShieldPct) {
      const timer = setTimeout(() => {
        setGhostShieldPct(shieldPct);
      }, 360);
      return () => clearTimeout(timer);
    } else {
      setGhostShieldPct(shieldPct);
    }
  }, [shieldPct, ghostShieldPct]);

  // React to explicit WebSocket damage_dealt targeting local player
  useEffect(() => {
    if (!lastDamageEvent) return;
    if (localUserId && lastDamageEvent.targetId === localUserId) {
      triggerDamageVisuals(lastDamageEvent.damage, "COMBAT");
    }
  }, [lastDamageEvent?.id]);

  // Interactive test trigger so gamer can test moving vs stationary hit animations
  const handleSimulateHit = (mode: "MOVING" | "HEAVY") => {
    const dmg = mode === "HEAVY" ? 24 : 14;
    if (mode === "MOVING") {
      setIsMoving(true);
      setVelocityMps(7.4);
      if (moveDecayTimerRef.current) clearTimeout(moveDecayTimerRef.current);
      moveDecayTimerRef.current = setTimeout(() => {
        setIsMoving(false);
        setVelocityMps(0);
      }, 1400);
    }
    if (onTriggerRealDamage && !movement?.inLiveRoom) {
      onTriggerRealDamage(dmg);
    } else {
      const nextHp = Math.max(0, effectiveHealth - dmg);
      setSimHealthOverride(nextHp);
      setTimeout(() => {
        setGhostHealthPct(Math.max(0, (nextHp / safeMaxHealth) * 100));
      }, 380);
      triggerDamageVisuals(dmg, "SIMULATION");
    }
  };

  const handleRestoreVitals = () => {
    setShieldPoints(maxDefense);
    setSimHealthOverride(null);
    setGhostHealthPct(100);
    setGhostShieldPct(100);
    setLastValidationReport(null);
    playTacticalSfx("packback_use");
    if (onTriggerHeal && !movement?.inLiveRoom) {
      onTriggerHeal();
    }
  };

  const isCritical = healthPct > 0 && healthPct < 25;
  const isWarning = healthPct >= 25 && healthPct < 55;

  return (
    <div
      data-testid="combat-vitals-hud"
      className={cn(
        "relative rounded border bg-zinc-950/90 p-4 space-y-3.5 transition-all duration-200 overflow-hidden",
        isShaking && "animate-damage-shake",
        hitFlashType === "KINETIC"
          ? "border-red-500/80 shadow-[0_0_24px_rgba(239,68,68,0.28)]"
          : hitFlashType === "SHIELD"
            ? "border-cyan-400/80 shadow-[0_0_24px_rgba(34,211,238,0.25)]"
            : hitFlashType === "ZONE"
              ? "border-amber-500/80 shadow-[0_0_24px_rgba(245,158,11,0.25)]"
              : "border-border",
      )}
    >
      {/* Subtle kinetic flash overlay */}
      {hitFlashType !== "NONE" && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 opacity-20 transition-opacity duration-300",
            hitFlashType === "KINETIC"
              ? "bg-gradient-to-r from-red-600/40 via-transparent to-red-600/40"
              : hitFlashType === "SHIELD"
                ? "bg-gradient-to-r from-cyan-500/40 via-transparent to-blue-500/40"
                : "bg-gradient-to-r from-amber-500/40 via-transparent to-red-500/40",
          )}
        />
      )}

      {/* Floating Damage Indicators */}
      {floatingHits.length > 0 && (
        <div className="pointer-events-none absolute top-2 right-3 z-20 flex flex-col items-end gap-1">
          {floatingHits.slice(0, 2).map((hit) => (
            <div
              key={hit.id}
              className="animate-float-damage flex items-center gap-1.5 rounded bg-black/90 border border-red-500/50 px-2 py-0.5 text-[11px] font-mono font-bold shadow-lg"
            >
              <span className="text-red-400">-{hit.vitalityLoss} VIT</span>
              {hit.defenseAbsorbed > 0 && (
                <span className="text-cyan-300">· -{hit.defenseAbsorbed} DEF</span>
              )}
              <span className="text-[9px] text-amber-300 uppercase">{hit.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Header: Vitals + Movement Validation State */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity
            className={cn(
              "w-4 h-4",
              isCritical ? "text-red-400 animate-ping" : "text-red-400",
            )}
          />
          <span className="text-xs font-display font-bold tracking-widest text-foreground">
            VITALIDADE & DEFESA BALÍSTICA
          </span>
        </div>

        {/* Real-time Movement Validation Status */}
        <div
          data-testid="badge-movement-validation"
          className={cn(
            "flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded border transition-colors",
            isMoving
              ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
              : "border-zinc-700 bg-zinc-900/70 text-zinc-400",
          )}
        >
          <Move className="w-3 h-3" />
          <span>
            {isMoving
              ? `EM MOVIMENTO · ${velocityMps.toFixed(1)} m/s`
              : "ESTACIONÁRIO · 0.0 m/s"}
          </span>
        </div>
      </div>

      {/* 1. VITALIDADE (VL) BAR WITH TRAUMA GHOST LAYER */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            VL · Integridade Corporal
          </span>
          <div className="flex items-baseline gap-1 font-mono tabular-nums">
            <span
              data-testid={healthTestId}
              className={cn(
                "text-2xl font-bold transition-colors",
                isCritical
                  ? "text-red-400 animate-pulse"
                  : isWarning
                    ? "text-amber-400"
                    : "text-emerald-400",
              )}
            >
              {effectiveHealth}
            </span>
            <span className="text-xs text-muted-foreground">/ {safeMaxHealth}</span>
          </div>
        </div>

        {/* Dual-layer animated health track */}
        <div className="relative h-3.5 w-full rounded-sm bg-red-950/40 border border-white/10 overflow-hidden">
          {/* Ghost / Trauma bar (white/amber delayed damage trail) */}
          <div
            data-testid="bar-health-trauma"
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-300/80 to-white/90 transition-all duration-700 ease-out"
            style={{ width: `${Math.max(healthPct, ghostHealthPct)}%` }}
          />
          {/* Active Vitality bar */}
          <div
            className={cn(
              "absolute inset-y-0 left-0 transition-all duration-150 ease-out",
              isCritical
                ? "bg-gradient-to-r from-red-700 via-red-500 to-rose-400 shadow-[0_0_12px_rgba(239,68,68,0.8)]"
                : isWarning
                  ? "bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-400"
                  : "bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400",
            )}
            style={{ width: `${healthPct}%` }}
          />
          {/* Segmented 10% tactical tick overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, transparent, transparent calc(10% - 1px), rgba(0,0,0,0.85) calc(10% - 1px), rgba(0,0,0,0.85) 10%)",
            }}
          />
        </div>

        {/* Preserve accessible Shadcn Progress for automated test selectors */}
        {showProgressTestId && (
          <Progress
            value={healthPct}
            data-testid="progress-health"
            className="sr-only h-0.5"
          />
        )}
      </div>

      {/* 2. DEFESA BALÍSTICA (DEF / ESCUDO WAR'I) BAR WITH ABSORPTION RIPPLE */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="flex items-center gap-1.5 text-cyan-300 uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            DEF · Blindagem Reativa War&apos;I
          </span>
          <span
            data-testid="text-defense-current"
            className={cn(
              "font-bold tabular-nums",
              shieldPoints > 0 ? "text-cyan-300" : "text-rose-400",
            )}
          >
            {shieldPoints} / {maxDefense} PTS
          </span>
        </div>

        <div className="relative h-2.5 w-full rounded-sm bg-cyan-950/40 border border-cyan-500/20 overflow-hidden">
          {/* Ghost Shield trail */}
          <div
            className="absolute inset-y-0 left-0 bg-cyan-200/70 transition-all duration-500 ease-out"
            style={{ width: `${Math.max(shieldPct, ghostShieldPct)}%` }}
          />
          {/* Active Shield bar */}
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 via-cyan-500 to-sky-300 transition-all duration-150"
            style={{ width: `${shieldPct}%` }}
          />
          {/* Kinetic Shield Ripple when absorbing damage */}
          {shieldRippleKey > 0 && (
            <div
              key={shieldRippleKey}
              className="animate-shield-ripple pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/80 to-transparent"
            />
          )}
          {/* Shield cell dividers */}
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, transparent, transparent calc(20% - 2px), rgba(6,10,20,0.9) calc(20% - 2px), rgba(6,10,20,0.9) 20%)",
            }}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
          <span>
            {equippedDefenseItems.length > 0
              ? `Equipado: ${equippedDefenseItems.map((i) => i.name).join(", ")}`
              : "Malha Tática Padrão (Mitigação Cinética 35%)"}
          </span>
          <span className="text-cyan-400">
            {isMoving ? "Bônus Evasão +18%" : "Sem Bônus Evasivo"}
          </span>
        </div>
      </div>

      {/* 3. MOVEMENT VALIDATION & HIT RECEPTION TELEMETRY */}
      {lastValidationReport && (
        <div
          data-testid="panel-hit-validation-report"
          className={cn(
            "rounded border p-2.5 text-[11px] font-mono leading-relaxed transition-all",
            lastValidationReport.state === "MOVING_EVASION"
              ? "border-cyan-500/40 bg-cyan-950/25 text-cyan-200"
              : lastValidationReport.state === "ZONE_HAZARD"
                ? "border-amber-500/40 bg-amber-950/25 text-amber-200"
                : "border-red-500/40 bg-red-950/25 text-red-200",
          )}
        >
          <div className="flex items-center justify-between font-bold mb-0.5">
            <span>
              {lastValidationReport.state === "MOVING_EVASION"
                ? "⚡ ATAQUE RECEBIDO EM MOVIMENTO (EVASÃO VALIDADA)"
                : lastValidationReport.state === "ZONE_HAZARD"
                  ? "☣ DANO AMBIENTAL DA ZONA SEGURA"
                  : "🎯 IMPACTO DIRETO (ALVO ESTACIONÁRIO)"}
            </span>
            <span>-{lastValidationReport.mitigationPct}% MITIGADO</span>
          </div>
          <p className="text-[10px] opacity-90">{lastValidationReport.summary}</p>
        </div>
      )}

      {/* Eliminated state banner */}
      {(effectiveHealth <= 0 || status === "ELIMINADO") && (
        <div className="rounded border border-red-500/50 bg-red-950/40 py-2 text-center text-red-400 font-display text-xs tracking-widest animate-pulse">
          <Skull className="w-4 h-4 inline mr-1.5" />
          OPERATIVO ELIMINADO
        </div>
      )}

      {/* 4. Interactive Kinetic Hit Test Controls (Gamer Inspection Bar) */}
      {!compact && (
        <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-1.5">
          <span className="text-[10px] font-mono text-zinc-400">
            TESTE DE IMPACTO & MOVIMENTO:
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="button-sim-moving-hit"
              onClick={() => handleSimulateHit("MOVING")}
              className="h-6 px-2 text-[10px] font-mono border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/15"
            >
              <Sparkles className="w-3 h-3 mr-1" />
              Hit em Movimento
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="button-sim-heavy-hit"
              onClick={() => handleSimulateHit("HEAVY")}
              className="h-6 px-2 text-[10px] font-mono border-red-500/40 text-red-300 hover:bg-red-500/15"
            >
              <Crosshair className="w-3 h-3 mr-1" />
              Impacto Pesado
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-testid="button-restore-vitals"
              onClick={handleRestoreVitals}
              className="h-6 px-2 text-[10px] font-mono text-emerald-400 hover:bg-emerald-500/10"
              title="Restaurar Escudo e Vitalidade"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
