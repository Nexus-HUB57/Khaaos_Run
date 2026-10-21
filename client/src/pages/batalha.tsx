import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { usePlayer } from "@/hooks/use-player";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { Elimination, ZoneStatus } from "@shared/schema";
import { PlayerStatus } from "@shared/schema";
import {
  Skull, Eye, Swords, RefreshCw, Activity, Shield,
  Zap, Target, Clock, Radio, AlertTriangle, Trophy
} from "lucide-react";

const CAUSE_LABEL: Record<string, { label: string; color: string; icon: string }> = {
  ZONA:  { label: "Zona Segura",  color: "text-cyan-400",  icon: "🌀" },
  PVP:   { label: "Combate PVP",  color: "text-red-400",   icon: "⚔" },
  QUEDA: { label: "Queda",        color: "text-yellow-400",icon: "💀" },
};

function formatTime(ts: string | Date | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function BatalhaPage() {
  const qc = useQueryClient();
  const { data: playerData, refetch: refetchPlayer } = usePlayer();

  const { data: eliminations = [] } = useQuery<Elimination[]>({
    queryKey: ["/api/eliminations"],
    refetchInterval: 3000,
  });

  const { data: zoneStatus } = useQuery<ZoneStatus>({
    queryKey: ["/api/zone/status"],
    refetchInterval: 2000,
  });

  const respawn = useMutation({
    mutationFn: () => apiRequest("POST", "/api/player/respawn"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/player/me"] });
      refetchPlayer();
    },
  });

  const stats = playerData?.stats;
  const isEliminated = stats?.status === PlayerStatus.ELIMINADO;
  const isAlive = stats?.status === PlayerStatus.VIVO;
  const health = stats?.health ?? 100;
  const maxHealth = stats?.maxHealth ?? 100;
  const healthPct = (health / maxHealth) * 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Swords className="w-5 h-5 text-red-400" />
        <h1 className="text-2xl font-display font-bold tracking-widest text-foreground">BATALHA</h1>
        <Badge className="font-mono text-xs tracking-widest bg-red-500/20 text-red-400 border-red-500/40">
          ELIMINAÇÃO & ESPECTADOR
        </Badge>
      </div>

      {/* ── DEATH / SPECTATOR SCREEN ── */}
      {isEliminated && (
        <div className="rounded border-2 border-red-500/50 bg-red-500/10 p-8 text-center space-y-6 relative overflow-hidden">
          {/* BG skull pattern */}
          <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none select-none">
            <Skull className="w-80 h-80 text-red-500" />
          </div>

          <div className="relative z-10 space-y-4">
            <Skull className="w-16 h-16 text-red-400 mx-auto animate-pulse" />
            <div className="text-5xl font-display font-bold text-red-400 tracking-widest">ELIMINADO</div>
            <div className="text-sm text-muted-foreground font-mono tracking-widest">
              MÓDULO: DISABLE MOVEMENT · SET COLLISION NO COLLISION · UNPOSSESS
            </div>

            {/* Stats at death */}
            <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto mt-6">
              <div className="rounded border border-white/10 bg-black/40 p-3 text-center">
                <div className="text-2xl font-mono font-bold text-red-400">0</div>
                <div className="text-[10px] text-muted-foreground font-mono tracking-widest">VITALIDADE</div>
              </div>
              <div className="rounded border border-white/10 bg-black/40 p-3 text-center">
                <div className="text-2xl font-mono font-bold text-foreground">{stats?.kills ?? 0}</div>
                <div className="text-[10px] text-muted-foreground font-mono tracking-widest">ABATES</div>
              </div>
              <div className="rounded border border-white/10 bg-black/40 p-3 text-center">
                <div className="text-2xl font-mono font-bold text-red-400">{stats?.deaths ?? 0}</div>
                <div className="text-[10px] text-muted-foreground font-mono tracking-widest">MORTES</div>
              </div>
            </div>

            {/* Spectator mode info */}
            <div className="rounded border border-cyan-500/30 bg-cyan-500/10 p-4 max-w-sm mx-auto">
              <div className="flex items-center gap-2 mb-2 justify-center">
                <Eye className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-display tracking-widest text-cyan-400">MODO ESPECTADOR ATIVO</span>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                Spawn Spectator → Possess. Observando a partida em andamento.
                Aguarde o fim da rodada ou solicite respawn.
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              <Button
                data-testid="button-respawn"
                onClick={() => respawn.mutate()}
                disabled={respawn.isPending}
                className="bg-primary text-black hover:bg-primary/80 font-display tracking-widest gap-2"
              >
                <RefreshCw className={cn("w-4 h-4", respawn.isPending && "animate-spin")} />
                RESPAWNAR
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Player combat card */}
        <div className="space-y-4">
          {/* Vitals */}
          <div className="rounded border border-border bg-card/60 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-red-400" />
              <span className="text-xs font-display tracking-widest text-muted-foreground">OPERATIVO</span>
              <Badge className={cn(
                "ml-auto text-[10px] font-mono",
                isAlive ? "bg-green-500/20 text-green-400 border-green-500/40" : "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse"
              )}>
                {stats?.status ?? "VIVO"}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground font-mono">Vitalidade</span>
                <span className={cn(
                  "font-mono font-bold",
                  healthPct < 25 ? "text-red-400" : healthPct < 60 ? "text-yellow-400" : "text-green-400"
                )} data-testid="text-health-batalha">
                  {health} / {maxHealth}
                </span>
              </div>
              <Progress value={healthPct} className="h-2" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Patente", value: stats?.rank ?? "—", color: "text-accent" },
                { label: "Abates",  value: stats?.kills ?? 0,  color: "text-green-400" },
                { label: "Mortes",  value: stats?.deaths ?? 0, color: "text-red-400" },
              ].map(s => (
                <div key={s.label} className="rounded bg-black/30 p-2 text-center">
                  <div className={cn("text-sm font-mono font-bold", s.color)}>{s.value}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{s.label}</div>
                </div>
              ))}
            </div>

            {isAlive && (
              <div className="text-center py-1">
                <div className="flex items-center justify-center gap-2 text-green-400">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs font-mono tracking-widest">EM COMBATE</span>
                </div>
              </div>
            )}
          </div>

          {/* Zone status mini panel */}
          <div className="rounded border border-border bg-card/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Radio className={cn("w-4 h-4", zoneStatus?.isActive ? "text-cyan-400 animate-pulse" : "text-muted-foreground")} />
              <span className="text-xs font-display tracking-widest text-muted-foreground">ZONA SEGURA</span>
            </div>
            {zoneStatus?.isActive ? (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-muted-foreground">Fase</span>
                  <span className="text-cyan-400">{zoneStatus.currentPhase} / {zoneStatus.totalPhases}</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-muted-foreground">Raio</span>
                  <span className="text-cyan-400">{zoneStatus.currentRadiusPct.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-muted-foreground">Dano/s</span>
                  <span className="text-red-400">-{zoneStatus.damagePerTick} VIT</span>
                </div>
                <Badge className={cn(
                  "w-full justify-center text-[10px]",
                  zoneStatus.isShrinking
                    ? "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse"
                    : "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                )}>
                  {zoneStatus.isShrinking ? "⚡ ENCOLHENDO" : "⏳ AGUARDANDO"}
                </Badge>
              </div>
            ) : (
              <div className="text-center text-muted-foreground text-xs font-mono py-2">Zona inativa</div>
            )}
          </div>

          {/* Respawn (if not eliminated, just show stats) */}
          {isAlive && (
            <div className="rounded border border-green-500/20 bg-green-500/5 p-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-400 shrink-0" />
              <span className="text-xs font-mono text-green-400">Operativo em campo — use a Zona Segura para combate</span>
            </div>
          )}
        </div>

        {/* Kill feed — Matchmaking Log */}
        <div className="lg:col-span-2">
          <div className="rounded border border-border bg-card/60 p-5 h-full">
            <div className="flex items-center gap-2 mb-5">
              <Target className="w-4 h-4 text-red-400" />
              <h2 className="text-sm font-display tracking-widest text-foreground">KILL FEED — LOG DE ELIMINAÇÕES</h2>
              <Badge className="ml-auto font-mono text-xs bg-muted/20 border-muted/30 text-muted-foreground">
                {eliminations.length} EVENTOS
              </Badge>
            </div>

            {eliminations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Swords className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm font-mono tracking-widest opacity-50">NENHUMA ELIMINAÇÃO REGISTRADA</p>
                <p className="text-xs font-mono opacity-30 mt-1">Ative a Zona Segura para iniciar o combate</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto">
                {eliminations.map((elim, i) => {
                  const cause = CAUSE_LABEL[elim.cause] ?? { label: elim.cause, color: "text-muted-foreground", icon: "❓" };
                  const isFirst = i === 0;
                  return (
                    <div
                      key={elim.id}
                      data-testid={`elimination-row-${elim.id}`}
                      className={cn(
                        "rounded border p-3 flex items-center gap-3 transition-all",
                        isFirst
                          ? "border-red-500/40 bg-red-500/10 shadow-[0_0_12px_rgba(239,68,68,0.1)]"
                          : "border-border bg-black/30"
                      )}
                    >
                      {/* Rank number */}
                      <div className="w-8 text-center font-mono text-xs text-muted-foreground shrink-0">
                        #{eliminations.length - i}
                      </div>

                      {/* Cause icon */}
                      <div className="text-xl shrink-0">{cause.icon}</div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-foreground truncate">
                            {elim.eliminatedName ?? `Operativo #${elim.eliminatedUserId.slice(-4)}`}
                          </span>
                          <span className="text-muted-foreground text-xs font-mono shrink-0">foi eliminado</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={cn("text-xs font-mono", cause.color)}>
                            {cause.label}
                          </span>
                          {elim.eliminatorName && (
                            <>
                              <span className="text-muted-foreground text-xs">por</span>
                              <span className="text-accent text-xs font-bold">{elim.eliminatorName}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Timestamp */}
                      <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/60 shrink-0">
                        <Clock className="w-3 h-3" />
                        {formatTime(elim.timestamp)}
                      </div>

                      {isFirst && (
                        <Badge className="bg-red-500/20 text-red-400 border-red-500/40 text-[10px] animate-pulse shrink-0">
                          RECENTE
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Architecture reference panel */}
      <div className="rounded border border-border bg-card/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-display tracking-widest text-muted-foreground">
            BP_CHARACTER — FLUXO DE ELIMINAÇÃO
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              step: "01",
              title: "Event Any Damage",
              desc: "Recebe dano da Zona ou PVP. Subtrai Vida. Branch: Vida ≤ 0?",
              color: "border-red-500/30 bg-red-500/5",
              badge: "EVENT GRAPH",
            },
            {
              step: "02",
              title: "Disable Movement",
              desc: "Has Authority → Disable Movement Component + Set Collision NoCollision + Ragdoll.",
              color: "border-yellow-500/30 bg-yellow-500/5",
              badge: "SERVER ONLY",
            },
            {
              step: "03",
              title: "Spawn Spectator → Possess",
              desc: "Unpossess do corpo. Spawn câmera flutuante de espectador. Possess da nova câmera.",
              color: "border-cyan-500/30 bg-cyan-500/5",
              badge: "REPLICATED",
            },
          ].map(s => (
            <div key={s.step} className={cn("rounded border p-4 space-y-2", s.color)}>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-mono font-bold text-muted-foreground/40">{s.step}</span>
                <div>
                  <div className="text-sm font-display tracking-widest text-foreground">{s.title}</div>
                  <Badge className="text-[9px] py-0 mt-0.5 bg-transparent border-muted/30 text-muted-foreground">{s.badge}</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-mono leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Flow arrow diagram */}
        <div className="mt-4 p-3 rounded bg-black/40 border border-white/5">
          <pre className="text-[10px] font-mono text-muted-foreground/60 overflow-x-auto whitespace-pre">
{`[Event Any Damage] ➔ [Modify Health] ➔ [Health ≤ 0?] ➔ [Has Authority?]
                                                              ↓ Yes
                                          [Disable Movement] ➔ [Set Collision No Collision]
                                                              ↓
                                              [Unpossess] ➔ [Spawn Spectator] ➔ [Possess]
                                                              ↓
                                                    [Log Elimination] ➔ [Update Kill Feed]`}
          </pre>
        </div>
      </div>
    </div>
  );
}
